#!/usr/bin/env node
/**
 * 本地极简 Dev API 服务 (零微服务开销，直连 mist-fe 工作台)
 *
 * 端口: 8001 (默认与 mist-backend 生产端口一致)
 * 职责: 模拟生产 API 契约，支持 mist-fe 无感读取本地行情与动态渲染私有策略买卖点
 * 准则: 严格薄网关，核心推演 100% 走策略树决策流与 StrategySimulationEngine，严禁私自手写伪回测
 */

import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { ChanCore, type ChanK } from '@app/chancore';
import { ChanVisualAdapter } from '../../libs/visual-command/src/adapters/chan-visual.adapter';
import { DynamicTacticsLoader } from '../../libs/strategy/src/tactics/dynamic-tactics-loader';
import {
  StrategySimulationEngine,
  StrategySimulationSession,
  createTacticsDecisionFlow,
  type SimulationFrame,
  type SimulationSignal,
} from '../../libs/strategy/src/simulation';
import { loadCanonicalKlines, PERIOD_NAME_MAP } from './provider';
import { KPriceProjector } from '../../libs/market-data/src/k-price-projector';
import type {
  StrategyBar,
  StrategyMarketSource,
} from '../../libs/market-data/src/strategy-bar';
import { normalizeExternalDecimalText } from '../../libs/decimal/src/decimal8';

const PORT = Number(process.env.PORT) || 8001;

// 严格门禁：tools/strategy-dev/server.ts 属于本地开发网关，严禁在生产环境启动
if (process.env.NODE_ENV === 'production') {
  console.error(
    '❌ [FATAL] tools/strategy-dev/server.ts 属于本地开发网关，严禁在生产环境 (NODE_ENV=production) 中启动！',
  );
  process.exit(1);
}

/**
 * 严格门禁：校验当前请求是否处于允许的本地开发环境
 * 1. 禁止在 NODE_ENV=production 环境调用仿真套件
 * 2. 仅允许本地环回来源 (127.0.0.1, ::1, ::ffff:127.0.0.1, localhost) 调用
 */
function checkLocalDevAccess(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  if (process.env.NODE_ENV === 'production') {
    sendJson(
      res,
      {
        error:
          'Forbidden: Strategy simulation suite is strictly restricted to local development environment and disabled in production.',
      },
      403,
    );
    return false;
  }

  const remoteIp = req.socket?.remoteAddress || '';
  const isLoopback =
    remoteIp === '127.0.0.1' ||
    remoteIp === '::1' ||
    remoteIp === '::ffff:127.0.0.1' ||
    remoteIp.startsWith('127.') ||
    remoteIp === '';

  const allowRemoteDev = process.env.ALLOW_REMOTE_DEV_SIMULATION === 'true';

  if (!isLoopback && !allowRemoteDev && process.env.NODE_ENV !== 'test') {
    sendJson(
      res,
      {
        error: `Forbidden: Strategy simulation suite is strictly restricted to local development environment. Request from unauthorized host (${remoteIp}) was rejected.`,
      },
      403,
    );
    return false;
  }

  return true;
}

function resolveSecurityCode(rawQuery: any, fallback = '000001'): string {
  return String(
    rawQuery?.code || rawQuery?.symbol || rawQuery?.securityCode || fallback,
  );
}

function resolvePeriod(rawPeriod: any, fallback = 30): number {
  if (typeof rawPeriod === 'number' && !isNaN(rawPeriod) && rawPeriod > 0) {
    return rawPeriod;
  }
  if (typeof rawPeriod === 'string') {
    const trimmed = rawPeriod.trim().toLowerCase();
    if (PERIOD_NAME_MAP[trimmed]) return PERIOD_NAME_MAP[trimmed];
    const parsed = Number(trimmed);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function wrapEnvelope(data: any, statusCode = 200, reqPath = '/api/v1') {
  return JSON.stringify({
    success: statusCode >= 200 && statusCode < 300,
    statusCode,
    message: statusCode >= 200 && statusCode < 300 ? 'SUCCESS' : 'ERROR',
    requestId: `dev-${Date.now()}`,
    timestamp: new Date().toISOString(),
    path: reqPath && reqPath.trim().length > 0 ? reqPath : '/api/v1',
    data,
  });
}

function sendJson(
  res: http.ServerResponse,
  data: any,
  statusCode = 200,
  reqPath = '/api/v1',
) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(wrapEnvelope(data, statusCode, reqPath));
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => {
      resolve({});
    });
  });
}

function toStrategyBar(
  rawK: any,
  period: number,
  securityId = 1,
  source: StrategyMarketSource = 'qmt',
): StrategyBar {
  return Object.freeze({
    securityId,
    source,
    period,
    timestamp: new Date(rawK.time || rawK.timestamp),
    open: KPriceProjector(rawK.open),
    high: KPriceProjector(rawK.high),
    low: KPriceProjector(rawK.low),
    close: KPriceProjector(rawK.close),
    volume:
      rawK.volume !== null && rawK.volume !== undefined
        ? normalizeExternalDecimalText(String(rawK.volume))
        : null,
    amount:
      rawK.amount !== null && rawK.amount !== undefined
        ? normalizeExternalDecimalText(String(rawK.amount))
        : null,
    type: 'complete',
  });
}

function toChanKlines(projectedBars: readonly any[]): readonly ChanK[] {
  return projectedBars.map((p, idx) => ({
    id: idx + 1,
    symbol: String(p.rawBar.securityId),
    time: p.rawBar.timestamp,
    open: p.ohlc.effective?.open ?? p.rawBar.open,
    high: p.ohlc.effective?.high ?? p.rawBar.high,
    low: p.ohlc.effective?.low ?? p.rawBar.low,
    close: p.ohlc.effective?.close ?? p.rawBar.close,
    volume: p.volume.effective,
    amount: p.amount.effective,
  }));
}

function isVisualCommandAfterOrAt(cmd: any, startMs: number): boolean {
  const rawTime = cmd.startTime ?? cmd.fromTime ?? cmd.time;
  if (!rawTime) return true;
  const timeMs = new Date(rawTime).getTime();
  return isNaN(timeMs) || timeMs >= startMs;
}

function formatFramePayload(
  frame: SimulationFrame,
  startDate?: string | Date,
): string {
  const chanKlines = toChanKlines(frame.windowBars);
  const allCommands = ChanVisualAdapter.convert(chanKlines, {
    includeBi: true,
    includeDuan: true,
    includeZhongshu: true,
    includeBsp: false,
  });

  let commands = allCommands;
  if (startDate) {
    const startMs = new Date(startDate).getTime();
    if (!isNaN(startMs)) {
      commands = allCommands.filter((cmd) =>
        isVisualCommandAfterOrAt(cmd, startMs),
      );
    }
  }

  const payload = {
    sessionId: frame.sessionId,
    cursor: frame.cursor,
    total: frame.total,
    bar: {
      time: frame.bar.timestamp.toISOString(),
      open: frame.bar.open,
      high: frame.bar.high,
      low: frame.bar.low,
      close: frame.bar.close,
      volume: frame.bar.volume ? Number(frame.bar.volume) : null,
      amount: frame.bar.amount ? Number(frame.bar.amount) : null,
    },
    commands,
    signals: frame.signals,
    status: frame.status,
  };

  return JSON.stringify(payload);
}

interface DevBacktestRun {
  id: number;
  strategyDefinitionId: number;
  strategyName: string;
  strategyVersionId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  source: string;
  targetUniverse: string[];
  period: number;
  startDate: string;
  endDate: string;
  signalCount?: number;
  matchedSecurityCount?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

const mockRuns: DevBacktestRun[] = [
  {
    id: 1,
    strategyDefinitionId: 1,
    strategyName: '上证指数 30m 缠论策略树决策流回测',
    strategyVersionId: 1,
    status: 'completed',
    source: 'qmt',
    targetUniverse: ['000001'],
    period: 30,
    startDate: '2025-07-03T05:30:00.000Z',
    endDate: '2026-09-24T07:00:00.000Z',
    signalCount: 74,
    matchedSecurityCount: 1,
    startedAt: '2026-09-25T05:00:00.000Z',
    completedAt: '2026-09-25T05:00:02.000Z',
    createdAt: '2026-09-25T05:00:00.000Z',
  },
  {
    id: 2,
    strategyDefinitionId: 1,
    strategyName: '上证指数 日线 缠论策略树决策流回测',
    strategyVersionId: 1,
    status: 'completed',
    source: 'qmt',
    targetUniverse: ['000001'],
    period: 1440,
    startDate: '2024-01-01T16:00:00.000Z',
    endDate: '2026-09-23T16:00:00.000Z',
    signalCount: 2,
    matchedSecurityCount: 1,
    startedAt: '2026-09-25T04:50:00.000Z',
    completedAt: '2026-09-25T04:50:01.000Z',
    createdAt: '2026-09-25T04:50:00.000Z',
  },
  {
    id: 3,
    strategyDefinitionId: 1,
    strategyName: '贵州茅台 日线 历史基准回测',
    strategyVersionId: 1,
    status: 'completed',
    source: 'tdx',
    targetUniverse: ['600519'],
    period: 1440,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2026-08-21T00:00:00.000Z',
    signalCount: 18,
    matchedSecurityCount: 1,
    startedAt: '2026-09-25T04:40:00.000Z',
    completedAt: '2026-09-25T04:40:01.000Z',
    createdAt: '2026-09-25T04:40:00.000Z',
  },
];

// 活跃仿真推流会话池
const activeSessions = new Map<string, StrategySimulationSession>();
// 活跃 SSE 客户端长连接广播池 (sessionId -> Set<http.ServerResponse>)
const sessionStreamClients = new Map<string, Set<http.ServerResponse>>();

// 回测信号内存缓存池 (cacheKey -> signals, runId -> signals)
const backtestSignalsCache = new Map<string, readonly SimulationSignal[]>();
const backtestRunSignalsMap = new Map<number, readonly SimulationSignal[]>();

function getBacktestCacheKey(options: {
  code: string;
  period: number;
  startDate?: string | Date;
  endDate?: string | Date;
  filterFenxingContainment?: boolean;
}): string {
  const start =
    options.startDate instanceof Date
      ? options.startDate.toISOString()
      : options.startDate || '';
  const end =
    options.endDate instanceof Date
      ? options.endDate.toISOString()
      : options.endDate || '';
  return `${options.code}:${options.period}:${Boolean(options.filterFenxingContainment)}:${start}:${end}`;
}

// 全量执行仿真并获取回测结果的统一纯净胶水
async function runUnifiedSimulationBacktest(options: {
  code: string;
  period: number;
  startDate?: string | Date;
  endDate?: string | Date;
  filterFenxingContainment?: boolean;
}) {
  const cacheKey = getBacktestCacheKey(options);
  const cachedSignals = backtestSignalsCache.get(cacheKey);
  if (cachedSignals) {
    return {
      signals: cachedSignals,
      engine: null,
    };
  }

  const fullKlines = loadCanonicalKlines({
    code: options.code,
    period: options.period,
  });
  const bars = fullKlines.map((k) => toStrategyBar(k, options.period));
  const tactics = DynamicTacticsLoader.reloadTactics();
  const flow = createTacticsDecisionFlow(tactics);

  const engine = new StrategySimulationEngine(bars, {
    securityCode: options.code,
    period: options.period,
    startDate: options.startDate,
    endDate: options.endDate,
    filterFenxingContainment: options.filterFenxingContainment,
    flow,
  });

  if (bars.length > 0) {
    await engine.seek(bars.length - 1);
  }

  const signals = engine.getAllSignals();
  backtestSignalsCache.set(cacheKey, signals);

  return {
    signals,
    engine,
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '';

  // 跨域预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // 1. 读取 K 线行情: GET/POST /v1/indicators/k
  if (
    (pathname.endsWith('/v1/indicators/k') ||
      pathname.endsWith('/indicators/k')) &&
    (req.method === 'GET' || req.method === 'POST')
  ) {
    const rawParams =
      req.method === 'POST' ? await parseJsonBody(req) : parsedUrl.query;
    const code = resolveSecurityCode(rawParams, '000001');
    const period = resolvePeriod(rawParams.period, 30);
    const limit = Number(rawParams.limit) || 2000;

    try {
      const fullKlines = loadCanonicalKlines({ code, period });
      let filteredKlines = fullKlines;
      if (rawParams.startDate) {
        const startMs = new Date(rawParams.startDate).getTime();
        if (!isNaN(startMs)) {
          filteredKlines = filteredKlines.filter(
            (k) => new Date(k.time).getTime() >= startMs,
          );
        }
      }
      if (rawParams.endDate) {
        const endMs = new Date(rawParams.endDate).getTime();
        if (!isNaN(endMs)) {
          filteredKlines = filteredKlines.filter(
            (k) => new Date(k.time).getTime() <= endMs,
          );
        }
      }
      const sliced = filteredKlines.slice(-limit);
      const klinesData = sliced.map((k) => ({
        id: k.id || 0,
        symbol: k.symbol || code,
        time:
          typeof k.time === 'string' ? k.time : new Date(k.time).toISOString(),
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume:
          k.volume !== null && k.volume !== undefined ? Number(k.volume) : 0,
        amount:
          k.amount !== null && k.amount !== undefined ? Number(k.amount) : 0,
      }));
      sendJson(res, klinesData);
    } catch (err: any) {
      console.error(`[/v1/indicators/k] 错误:`, err.message);
      sendJson(res, []);
    }
    return;
  }

  // 2. 缠论包含合并 K 线: POST /v1/chan/merge-k
  if (pathname.endsWith('/v1/chan/merge-k') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const klines = body.klines || [];
    try {
      const merged = ChanCore.mergeK(klines);
      const mergeKList = merged.map((m) => ({
        startTime: m.startTime.toISOString(),
        endTime: m.endTime.toISOString(),
        high: m.high,
        low: m.low,
        trend: m.trend,
        mergedCount: m.mergedCount,
        mergedIds: [...m.mergedIds],
        mergedData: m.mergedData.map((k) => ({
          id: k.id,
          symbol: k.symbol,
          time: k.time.toISOString(),
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          amount:
            k.amount !== null && k.amount !== undefined ? Number(k.amount) : 0,
        })),
      }));
      sendJson(res, mergeKList);
    } catch (err: any) {
      console.error(`[/v1/chan/merge-k] 错误:`, err.message);
      sendJson(res, [], 200);
    }
    return;
  }

  // 3. 统一绘图指令流: GET /v1/visual/commands (纯几何，严格遵守架构红线)
  if (pathname.endsWith('/v1/visual/commands') && req.method === 'GET') {
    const code = resolveSecurityCode(parsedUrl.query, '000001');
    const period = resolvePeriod(parsedUrl.query.period, 30);
    const source = (parsedUrl.query.source as string) || 'default';
    const filterFenxingContainment =
      parsedUrl.query.filterFenxingContainment === 'true' ||
      parsedUrl.query.filterFenxingContainment === '1';

    try {
      const fullKlines = loadCanonicalKlines({ code, period });
      let targetKlines = fullKlines;
      if (parsedUrl.query.startDate) {
        const startMs = new Date(parsedUrl.query.startDate as string).getTime();
        if (!isNaN(startMs)) {
          targetKlines = targetKlines.filter(
            (k) => new Date(k.time).getTime() >= startMs,
          );
        }
      }
      if (parsedUrl.query.endDate) {
        const endMs = new Date(parsedUrl.query.endDate as string).getTime();
        if (!isNaN(endMs)) {
          targetKlines = targetKlines.filter(
            (k) => new Date(k.time).getTime() <= endMs,
          );
        }
      }
      const commands = ChanVisualAdapter.convert(targetKlines, {
        includeBi: true,
        includeDuan: true,
        includeZhongshu: true,
        includeBsp: false,
        filterFenxingContainment,
      });

      sendJson(res, {
        code,
        period,
        source,
        totalKlines: targetKlines.length,
        commands,
      });
    } catch (err: any) {
      console.error(`[/v1/visual/commands] 错误:`, err.message);
      sendJson(res, {
        code,
        period,
        source,
        totalKlines: 0,
        commands: [],
      });
    }
    return;
  }

  // 4. 实时仿真推流核心端点 (严格门禁：仅允许本地开发环境调用，禁止外部/生产调用)
  if (pathname.includes('/v1/simulation/')) {
    if (!checkLocalDevAccess(req, res)) {
      return;
    }
  }

  // 4.1 发起仿真会话: POST /v1/simulation/start
  if (pathname.endsWith('/v1/simulation/start') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const code = resolveSecurityCode(body, '000001');
      const period = resolvePeriod(body.period, 30);
      const filterFenxingContainment = Boolean(body.filterFenxingContainment);

      const fullKlines = loadCanonicalKlines({ code, period });
      const bars = fullKlines.map((k) => toStrategyBar(k, period));
      const tactics = DynamicTacticsLoader.reloadTactics();
      const flow = body.flow || createTacticsDecisionFlow(tactics);

      const session = new StrategySimulationSession(bars, {
        securityCode: code,
        period,
        startDate: body.startDate,
        endDate: body.endDate,
        filterFenxingContainment,
        flow,
      });

      activeSessions.set(session.sessionId, session);
      sessionStreamClients.set(session.sessionId, new Set());

      // 绑定广播监听器：当会话产生新帧或状态变动时，向所有连接中的 SSE 客户端推送
      session.setListeners({
        onFrame: (frame) => {
          const clients = sessionStreamClients.get(session.sessionId);
          if (!clients || clients.size === 0) return;
          const payloadString = formatFramePayload(frame, session.startDate);
          for (const clientRes of clients) {
            try {
              clientRes.write(`event: frame\ndata: ${payloadString}\n\n`);
            } catch {
              // 忽略已断开的连接
            }
          }
        },
        onStatusChange: (status) => {
          const clients = sessionStreamClients.get(session.sessionId);
          if (!clients || clients.size === 0) return;
          const statusString = JSON.stringify({ status });
          for (const clientRes of clients) {
            try {
              clientRes.write(`event: status\ndata: ${statusString}\n\n`);
            } catch {
              // 忽略
            }
          }
        },
      });

      // 超时 30 分钟无活动自动清理
      setTimeout(
        () => {
          if (activeSessions.has(session.sessionId)) {
            activeSessions.get(session.sessionId)?.destroy();
            activeSessions.delete(session.sessionId);
            sessionStreamClients.delete(session.sessionId);
          }
        },
        30 * 60 * 1000,
      );

      sendJson(res, session.getSummary(), 201);
    } catch (err: any) {
      console.error(`[POST /v1/simulation/start] 错误:`, err.message);
      sendJson(res, { error: err.message }, 500);
    }
    return;
  }

  // 4.2 仿真推流长连接 (SSE): GET /v1/simulation/stream
  if (pathname.endsWith('/v1/simulation/stream') && req.method === 'GET') {
    const sessionId = String(parsedUrl.query.sessionId || '');
    const session = activeSessions.get(sessionId);

    if (!session) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Simulation session not found: ${sessionId}`);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    res.write(': stream-connected\n\n');

    let clients = sessionStreamClients.get(sessionId);
    if (!clients) {
      clients = new Set();
      sessionStreamClients.set(sessionId, clients);
    }
    clients.add(res);

    // 立即补发当前游标所在帧给该连接作为初始数据
    const currentFrame = session.engine.getCurrentFrame();
    if (currentFrame) {
      try {
        res.write(
          `event: frame\ndata: ${formatFramePayload(currentFrame, session.startDate)}\n\n`,
        );
      } catch {}
    } else if (session.engine.totalBars > 0) {
      void session.engine.seek(0).then((frame) => {
        if (frame && clients?.has(res)) {
          try {
            res.write(
              `event: frame\ndata: ${formatFramePayload(frame, session.startDate)}\n\n`,
            );
          } catch {}
        }
      });
    }

    // 心跳保活定时器（每 15 秒发送注释行），防止浏览器或代理在暂停空闲时挂起/断连
    const pingTimer = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(pingTimer);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(pingTimer);
      clients?.delete(res);
      // 只有当所有关联的长连接都已断开时，才将后台推演会话暂停
      if (clients && clients.size === 0) {
        session.pause();
      }
    });

    return;
  }

  // 4.3 仿真控制指令: POST /v1/simulation/control
  if (pathname.endsWith('/v1/simulation/control') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const sessionId = String(body.sessionId || '');
      const session = activeSessions.get(sessionId);

      if (!session) {
        sendJson(res, { error: `Session not found: ${sessionId}` }, 404);
        return;
      }

      await session.control({
        action: body.action,
        param: body.param,
      });

      sendJson(res, session.getSummary());
    } catch (err: any) {
      console.error(`[POST /v1/simulation/control] 错误:`, err.message);
      sendJson(res, { error: err.message }, 500);
    }
    return;
  }

  // 4.4 销毁仿真会话: POST /v1/simulation/stop
  if (pathname.endsWith('/v1/simulation/stop') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const sessionId = String(body.sessionId || '');
    const session = activeSessions.get(sessionId);
    if (session) {
      session.destroy();
      activeSessions.delete(sessionId);
      const clients = sessionStreamClients.get(sessionId);
      if (clients) {
        for (const clientRes of clients) {
          try {
            clientRes.write(
              `event: status\ndata: ${JSON.stringify({ status: 'completed' })}\n\n`,
            );
            clientRes.end();
          } catch {}
        }
        clients.clear();
      }
      sessionStreamClients.delete(sessionId);
    }
    sendJson(res, { success: true });
    return;
  }

  // 4.5 导出仿真队列与渲染数据快照: GET /v1/simulation/dump
  if (pathname.endsWith('/v1/simulation/dump') && req.method === 'GET') {
    let sessionId = String(parsedUrl.query.sessionId || '');
    if (!sessionId && activeSessions.size > 0) {
      // 默认读取最新的活跃 session
      const allKeys = Array.from(activeSessions.keys());
      sessionId = allKeys[allKeys.length - 1];
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      sendJson(res, { error: 'No active simulation session found' }, 404);
      return;
    }

    try {
      const dump = session.engine.dumpCurrentState();
      const currentFrame = session.engine.getCurrentFrame();
      const chanKlines = currentFrame
        ? toChanKlines(currentFrame.windowBars)
        : [];
      const allCommands = ChanVisualAdapter.convert(chanKlines, {
        includeBi: true,
        includeDuan: true,
        includeZhongshu: true,
        includeBsp: false,
      });

      const startMs = session.startDate
        ? new Date(session.startDate).getTime()
        : NaN;
      const commands = !isNaN(startMs)
        ? allCommands.filter((cmd) => isVisualCommandAfterOrAt(cmd, startMs))
        : allCommands;

      const fullDump = {
        dumpTime: new Date().toISOString(),
        sessionId: dump.sessionId,
        securityCode: dump.securityCode,
        period: dump.period,
        cursor: dump.cursor,
        totalBars: dump.totalBars,
        preWarmBars: dump.preWarmBars,
        currentBar: dump.currentBar,
        queueSize: dump.windowQueue.length,
        windowQueue: dump.windowQueue,
        renderData: {
          commandsCount: commands.length,
          commands,
        },
        signalsCount: dump.signals.length,
        signals: dump.signals,
        latestFrameSignals: dump.latestFrameSignals,
      };

      try {
        const dumpDir = path.resolve(__dirname, '../../.data/simulation-dumps');
        if (!fs.existsSync(dumpDir)) {
          fs.mkdirSync(dumpDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(dumpDir, 'latest-dump.json'),
          JSON.stringify(fullDump, null, 2),
          'utf-8',
        );
        fs.writeFileSync(
          path.join(dumpDir, `${dump.sessionId}.json`),
          JSON.stringify(fullDump, null, 2),
          'utf-8',
        );
      } catch {
        // ignore disk write failure
      }

      sendJson(res, fullDump);
    } catch (err: any) {
      console.error(`[GET /v1/simulation/dump] 错误:`, err.message);
      sendJson(res, { error: err.message }, 500);
    }
    return;
  }

  // 5. 策略列表: GET /v1/strategies
  if (pathname.endsWith('/v1/strategies') && req.method === 'GET') {
    const tactics = DynamicTacticsLoader.reloadTactics();
    const meta = DynamicTacticsLoader.getActiveMetadata();
    sendJson(res, [
      {
        id: 1,
        name: `缠论策略树 [${tactics.name}]`,
        description: `基于策略树决策流与四象限战术 (v${tactics.version})`,
        kind: 'decision_flow',
        status: 'active',
        activeVersionNumber: 1,
        metadata: meta,
        periods: [1, 5, 15, 30, 60, 1440],
        sources: ['qmt', 'tdx'],
      },
    ]);
    return;
  }

  // 6. 策略版本与历史记录查询
  if (
    pathname.match(/\/v1\/strategies\/\d+\/versions$/) &&
    req.method === 'GET'
  ) {
    const tactics = DynamicTacticsLoader.reloadTactics();
    sendJson(res, [
      {
        id: 1,
        strategyDefinitionId: 1,
        versionNumber: 1,
        signalKind: 'entry',
        status: 'active',
        description: `标准决策流版本 (集成四象限战术 v${tactics.version})`,
        config: {},
        createdAt: new Date('2026-09-01').toISOString(),
      },
    ]);
    return;
  }

  if (
    pathname.match(
      /\/v1\/strategies\/\d+\/versions\/\d+\/(activate|deactivate)$/,
    ) &&
    req.method === 'POST'
  ) {
    sendJson(res, null);
    return;
  }

  // 7. 回测任务管理: GET/POST /v1/strategy-backtests
  if (pathname.endsWith('/v1/strategy-backtests') && req.method === 'GET') {
    sendJson(res, mockRuns);
    return;
  }

  if (pathname.endsWith('/v1/strategy-backtests') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const symbol = resolveSecurityCode(body, '000001');
      const period = resolvePeriod(body.period, 30);
      const source = body.source || 'qmt';
      const startDate = body.startDate || '2024-01-01T00:00:00.000Z';
      const endDate = body.endDate || '2026-12-31T23:59:59.000Z';

      // 统一走策略树仿真引擎计算
      const { signals } = await runUnifiedSimulationBacktest({
        code: symbol,
        period,
        startDate,
        endDate,
      });

      const newId =
        mockRuns.length > 0 ? Math.max(...mockRuns.map((r) => r.id)) + 1 : 1;
      const newRun: DevBacktestRun = {
        id: newId,
        strategyDefinitionId: Number(body.strategyDefinitionId) || 1,
        strategyName: `${symbol === '000001' ? '上证指数' : symbol} ${period === 1440 ? '日线' : period + 'm'} 策略回测`,
        strategyVersionId: Number(body.strategyVersionId) || 1,
        status: 'completed',
        source,
        targetUniverse: [symbol],
        period,
        startDate,
        endDate,
        signalCount: signals.length,
        matchedSecurityCount: 1,
        startedAt: new Date(Date.now() - 1000).toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      mockRuns.unshift(newRun);
      backtestRunSignalsMap.set(newRun.id, signals);

      sendJson(
        res,
        {
          runId: newRun.id,
          status: 'completed',
          message: '回测任务执行完成',
          pollUrl: `/v1/strategy-backtests/${newRun.id}`,
          acceptedAt: newRun.createdAt,
        },
        202,
      );
    } catch (err: any) {
      console.error(`[POST /v1/strategy-backtests] 错误:`, err.message);
      sendJson(res, { error: err.message }, 500);
    }
    return;
  }

  // 8. 回测信号列表: GET /v1/strategy-backtests/:id/signals
  if (
    pathname.match(/\/v1\/strategy-backtests\/\d+\/signals$/) &&
    req.method === 'GET'
  ) {
    const runIdMatch = pathname.match(
      /\/v1\/strategy-backtests\/(\d+)\/signals$/,
    );
    const runId = runIdMatch && runIdMatch[1] ? Number(runIdMatch[1]) : 1;
    const matchedRun = mockRuns.find((r) => r.id === runId) || mockRuns[0];

    try {
      const symbol = resolveSecurityCode(
        parsedUrl.query,
        matchedRun?.targetUniverse[0] || '000001',
      );
      const period = resolvePeriod(
        parsedUrl.query.period,
        matchedRun?.period || 30,
      );
      const filterFenxingContainment =
        parsedUrl.query.filterFenxingContainment === 'true' ||
        parsedUrl.query.filterFenxingContainment === '1';

      let signals: readonly SimulationSignal[] | undefined =
        backtestRunSignalsMap.get(runId);

      if (!signals) {
        // 统一走策略树仿真引擎计算
        const result = await runUnifiedSimulationBacktest({
          code: symbol,
          period,
          filterFenxingContainment,
          startDate: matchedRun?.startDate,
          endDate: matchedRun?.endDate,
        });
        signals = result.signals;
        backtestRunSignalsMap.set(runId, signals);
      }

      const signalResults = (signals || []).map((sig, idx) => ({
        id: idx + 1,
        backtestRunId: runId,
        securityCode: symbol,
        signalTime: sig.signalTime,
        signalType: sig.signalType,
        confidence: sig.confidence,
        confidenceLevel: 'HIGH',
        decisionTrace: sig.decisionTrace,
        contextSnapshot: {
          type: sig.signalType,
          action: sig.isBuy ? 'BUY' : 'SELL',
          price: sig.triggerPrice,
          triggerPrice: sig.triggerPrice,
          time: sig.signalTime,
          triggerTime: sig.signalTime,
          badgeText: sig.badgeText,
          signalTag: sig.badgeText,
          chanBsp: {
            type: sig.signalType,
            price: sig.triggerPrice,
            level: period,
            period,
          },
        },
        ruleSnapshot: {
          rule: sig.badgeText,
        },
        createdAt: sig.signalTime,
      }));

      sendJson(res, {
        items: signalResults,
        nextCursor: null,
      });
    } catch (err: any) {
      console.error(`[/v1/strategy-backtests/:id/signals] 错误:`, err.message);
      sendJson(res, {
        items: [],
        nextCursor: null,
      });
    }
    return;
  }

  // 9. 单条回测详情: GET /v1/strategy-backtests/:id
  if (
    pathname.match(/\/v1\/strategy-backtests\/\d+$/) &&
    req.method === 'GET'
  ) {
    const runIdMatch = pathname.match(/\/v1\/strategy-backtests\/(\d+)$/);
    const runId = runIdMatch && runIdMatch[1] ? Number(runIdMatch[1]) : 1;
    const run = mockRuns.find((r) => r.id === runId) || mockRuns[0];
    sendJson(res, run);
    return;
  }

  // 默认 404
  sendJson(res, { error: 'Not Found', path: pathname }, 404);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `\n🚀 [Mist Dev Server] 本地开发服务已就绪: http://localhost:${PORT}`,
  );
  console.log(`已就绪契约:`);
  console.log(`  - POST /v1/indicators/k       (读取本地离线/快照行情)`);
  console.log(`  - POST /v1/chan/merge-k       (现算包含合并 K 线)`);
  console.log(`  - GET  /v1/visual/commands    (现算纯几何指令流，笔/段/中枢)`);
  console.log(`  - POST /v1/simulation/start   (创建流式推演仿真会话)`);
  console.log(`  - GET  /v1/simulation/stream  (SSE 事件流长连接推流)`);
  console.log(
    `  - POST /v1/simulation/control (播放/暂停/步进/调速/Seek 控制)`,
  );
  console.log(`  - GET  /v1/simulation/dump    (导出仿真队列与渲染数据快照)`);
  console.log(`  - GET  /v1/strategies         (策略清单与版本)`);
  console.log(`  - GET  /v1/strategy-backtests (策略树回测记录与归因详情)\n`);

  setTimeout(async () => {
    try {
      console.log(`🔄 [预热] 正在后台基于策略树预热决策流回测数据...`);
      for (const run of mockRuns) {
        const symbol = run.targetUniverse[0] || '000001';
        const { signals } = await runUnifiedSimulationBacktest({
          code: symbol,
          period: run.period,
          startDate: run.startDate,
          endDate: run.endDate,
        });
        backtestRunSignalsMap.set(run.id, signals);
        run.signalCount = signals.length;
        console.log(
          `✅ [预热] ${symbol} ${run.period === 1440 ? '日线' : run.period + 'm'} 决策流推演就绪！(runId: ${run.id}, 信号数: ${signals.length})`,
        );
      }
    } catch (e: any) {
      console.error(`⚠️ [预热] 后台预热遇到问题:`, e.message);
    }
  }, 100);
});
