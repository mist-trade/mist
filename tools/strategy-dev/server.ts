#!/usr/bin/env node
/**
 * 本地极简 Dev API 服务 (零微服务开销，直连 mist-fe 工作台)
 *
 * 端口: 8001 (默认与 mist-backend 生产端口一致)
 * 职责: 模拟生产 API 契约，支持 mist-fe 无感读取本地行情与动态渲染私有策略买卖点
 */

import * as http from 'http';
import * as url from 'url';
import { ChanCore } from '@app/chancore';
import { runChanBspPipeline } from '../../libs/signal/src/runtime/chan-bsp/chan-bsp.pipeline';
import {
  ChanBspEpisodeCursor,
  type ChanBspEpisodeIdentity,
} from '../../libs/signal/src/runtime/chan-bsp/chan-bsp.episode';
import { ChanVisualAdapter } from '../../libs/visual-command/src/adapters/chan-visual.adapter';
import type { VisualCommand } from '../../libs/visual-command/src/visual-command.types';
import { DynamicTacticsLoader } from '../../libs/strategy/src/tactics/dynamic-tactics-loader';
import {
  TacticalQuadrant,
  TacticalAction,
  type ChanFourQuadrantTactics,
  type ChanTacticsContext,
  type TacticalQuadrantDecision,
} from '../../libs/strategy/src/tactics/contracts/chan-four-quadrant-tactics.interface';
import {
  factorPluginRegistry,
  ensureStandardPluginsRegistered,
} from '../../libs/strategy/src/factor';
import { loadCanonicalKlines, PERIOD_NAME_MAP } from './provider';
import { StrategySeriesImputer } from '../../libs/market-data/src/projection/strategy-series-imputer';
import { KPriceProjector } from '../../libs/market-data/src/k-price-projector';
import type {
  StrategyBar,
  StrategyMarketSource,
} from '../../libs/market-data/src/strategy-bar';
import { CHAN_BSP_WINDOW_BUDGET } from '../../libs/signal/src/runtime/chan-bsp/chan-bsp.types';
import { toChanKSeries } from '../../libs/signal/src/runtime/chan-bsp/chan-bsp.k-mapper';
import { normalizeExternalDecimalText } from '../../libs/decimal/src/decimal8';

const PORT = Number(process.env.PORT) || 8001;

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
  });
}

function getBadgeText(quadrant: TacticalQuadrant): string {
  switch (quadrant) {
    case TacticalQuadrant.LeftBuy:
      return '1买';
    case TacticalQuadrant.RightBuy:
      return '2买';
    case TacticalQuadrant.LeftSell:
      return '1卖';
    case TacticalQuadrant.RightSell:
      return '2卖';
  }
}

function getBspBadgeText(bspType: string, quadrant: TacticalQuadrant): string {
  switch (bspType) {
    case 'first_buy':
      return '1买';
    case 'second_buy':
      return '2买';
    case 'third_buy':
      return '3买';
    case 'first_sell':
      return '1卖';
    case 'second_sell':
      return '2卖';
    case 'third_sell':
      return '3卖';
    default:
      return getBadgeText(quadrant);
  }
}

interface EvaluatedSignal {
  decision: TacticalQuadrantDecision;
  isBuy: boolean;
  bspType: string;
}

interface EvaluationResult {
  signals: EvaluatedSignal[];
  commands: VisualCommand[];
}

const evalCache = new Map<string, EvaluationResult>();

const pointInTimeVisualCache = new Map<string, VisualCommand[]>();

interface EvaluateSignalsOptions {
  filterFenxingContainment?: boolean;
  startDate?: string;
  endDate?: string;
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

function evaluateSignals(
  code: string,
  period: number,
  tactics: ChanFourQuadrantTactics,
  options?: EvaluateSignalsOptions,
): EvaluationResult {
  const filterFenxingContainment = options?.filterFenxingContainment ?? false;
  const runStartMs = options?.startDate
    ? new Date(options.startDate).getTime()
    : -Infinity;
  const runEndMs = options?.endDate
    ? new Date(options.endDate).getTime()
    : Infinity;

  const cacheKey = `${code}_${period}_${tactics.id}_${tactics.version}_${filterFenxingContainment}_${runStartMs}_${runEndMs}`;
  const cached = evalCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const fullKlines = loadCanonicalKlines({ code, period });

  // 1. 底图几何指令流（K线、笔、线段、中枢）
  const commands: VisualCommand[] = [];
  const chanCmds = ChanVisualAdapter.convert(fullKlines, {
    includeBi: true,
    includeDuan: true,
    includeZhongshu: true,
    includeBsp: false,
    filterFenxingContainment,
  });
  commands.push(...chanCmds);

  // 2. 线上标准数据流程：StrategySeriesImputer + 逐 Bar 循环喂入 + runChanBspPipeline + ChanBspEpisodeCursor
  const windowBudget =
    CHAN_BSP_WINDOW_BUDGET[period as 1 | 5 | 15 | 30 | 60] ?? 600;
  const imputer = new StrategySeriesImputer();
  const cursor = new ChanBspEpisodeCursor();
  const identity: ChanBspEpisodeIdentity = {
    definitionId: 1,
    securityId: 1,
    source: 'qmt',
    level: period,
    units: 'bi',
  };

  // 区分历史预热段 (< runStartMs) 与当前推演段 (>= runStartMs && <= runEndMs)
  const preWarmKlines: any[] = [];
  const replayKlines: any[] = [];

  for (const k of fullKlines) {
    const t = new Date(k.time).getTime();
    if (t < runStartMs) {
      preWarmKlines.push(k);
    } else if (t <= runEndMs) {
      replayKlines.push(k);
    }
  }

  // ① 预热准备阶段：对齐线上 BacktestRunExecutor.replaySecurity 初始窗口段
  // 逐根 append 历史 Bar 补齐，并在开盘前调用 pipeline 推进游标消费历史既有买卖点，杜绝旧信号漏入起始 Bar
  const preWarmSlice = preWarmKlines.slice(-windowBudget);
  for (const rawK of preWarmSlice) {
    imputer.append(toStrategyBar(rawK, period));
    while (imputer.read().length > windowBudget) {
      imputer.trim();
    }
  }

  if (imputer.read().length > 0) {
    const projectedWindow = imputer.read();
    const preEvents = runChanBspPipeline({
      klines: toChanKSeries(projectedWindow),
      units: 'bi',
    }).filter((e) => e.time.getTime() < runStartMs);
    if (preEvents.length > 0) {
      cursor.advance(identity, preEvents);
    }
  }

  // ② 计算阶段：严格使用循环把每一个 K 线单独喂进去，由线上真实流程自发返回结果
  const signals: EvaluatedSignal[] = [];
  const emittedKeys = new Set<string>();

  for (const rawK of replayKlines) {
    const bar = toStrategyBar(rawK, period);
    imputer.append(bar);
    while (imputer.read().length > windowBudget) {
      imputer.trim();
    }

    const projectedWindow = imputer.read();
    if (projectedWindow.length < 3) continue;

    const chanKlines = toChanKSeries(projectedWindow);

    // ① 调用后端标准生产流水线（包含合并 -> 笔 -> 中枢 -> 力度背驰 -> 买卖点检测）
    const events = runChanBspPipeline({
      klines: chanKlines,
      units: 'bi',
    });

    // ② 调用后端单调时序游标：仅当最新这根 Bar 刚确认了新买卖点时才输出 fresh 事件
    const fresh = cursor.advance(identity, events);
    if (fresh.length === 0) continue;

    // ③ 将刚确立的新买卖点输入到战术引擎裁决
    for (const event of fresh) {
      const eventTimeMs = event.time.getTime();
      // 严格门禁：事件时间必须在回测时间窗口内，杜绝开盘前旧买卖点
      if (eventTimeMs < runStartMs || eventTimeMs > runEndMs) continue;

      // 严格防重：同一时刻同类型买卖点仅发出一次
      const dedupeKey = `${eventTimeMs}_${event.type}`;
      if (emittedKeys.has(dedupeKey)) continue;
      emittedKeys.add(dedupeKey);

      const ctx: ChanTacticsContext = {
        symbol: code,
        period: String(period),
        klines: chanKlines as any,
        bis: [],
        zhongshus: [],
        lastPrice: event.price,
        timestamp: new Date(rawK.time),
        candidateBsp: {
          type: event.type as any,
          price: event.price,
          time: event.time,
          zhongshuCount: event.zhongshuIndex !== null ? 1 : 0,
        },
      };

      let decision: TacticalQuadrantDecision | undefined;
      if (event.type === 'first_buy') {
        decision = tactics.evaluateLeftBuy(ctx);
      } else if (event.type === 'second_buy' || event.type === 'third_buy') {
        decision = tactics.evaluateRightBuy(ctx);
      } else if (event.type === 'first_sell') {
        decision = tactics.evaluateLeftSell(ctx);
      } else if (event.type === 'second_sell' || event.type === 'third_sell') {
        decision = tactics.evaluateRightSell(ctx);
      }

      const isBuy = event.type.endsWith('_buy');
      const defaultQuadrant = isBuy
        ? event.type === 'first_buy'
          ? TacticalQuadrant.LeftBuy
          : TacticalQuadrant.RightBuy
        : event.type === 'first_sell'
          ? TacticalQuadrant.LeftSell
          : TacticalQuadrant.RightSell;

      const defaultReason =
        event.type === 'first_buy'
          ? '一买确认：趋势/中枢离开段背驰'
          : event.type === 'second_buy'
            ? '二买确认：一买后次回抽不破前低'
            : event.type === 'third_buy'
              ? '三买确认：突破中枢后次回抽不破ZG'
              : event.type === 'first_sell'
                ? '一卖确认：冲高离开段背驰冲顶'
                : event.type === 'second_sell'
                  ? '二卖确认：反抽不创新高破位'
                  : '三卖确认：跌破中枢后次回抽反抽不破ZD';

      const finalDecision: TacticalQuadrantDecision =
        decision && decision.triggered
          ? decision
          : {
              triggered: true,
              quadrant: defaultQuadrant,
              price: event.price,
              time: event.time,
              confidence:
                decision?.confidence && decision.confidence > 0
                  ? decision.confidence
                  : 85,
              action: isBuy
                ? TacticalAction.OpenLong
                : TacticalAction.CloseLong,
              reason:
                decision?.reason && decision.reason !== '未触发战术条件'
                  ? decision.reason
                  : defaultReason,
            };

      signals.push({
        decision: finalDecision,
        isBuy,
        bspType: event.type,
      });
    }
  }

  const result: EvaluationResult = {
    signals,
    commands,
  };
  evalCache.set(cacheKey, result);
  return result;
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
    strategyName: '上证指数 30m 缠论买卖点策略',
    strategyVersionId: 1,
    status: 'completed',
    source: 'qmt',
    targetUniverse: ['000001'],
    period: 30,
    startDate: '2025-07-03T05:30:00.000Z',
    endDate: '2026-09-24T07:00:00.000Z',
    signalCount: 80,
    matchedSecurityCount: 1,
    startedAt: '2026-09-25T05:00:00.000Z',
    completedAt: '2026-09-25T05:00:02.000Z',
    createdAt: '2026-09-25T05:00:00.000Z',
  },
  {
    id: 2,
    strategyDefinitionId: 1,
    strategyName: '上证指数 日线 缠论买卖点策略',
    strategyVersionId: 1,
    status: 'completed',
    source: 'qmt',
    targetUniverse: ['000001'],
    period: 1440,
    startDate: '2024-01-01T16:00:00.000Z',
    endDate: '2026-09-23T16:00:00.000Z',
    signalCount: 4,
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
    signalCount: 3,
    matchedSecurityCount: 1,
    startedAt: '2026-09-24T00:00:00.000Z',
    completedAt: '2026-09-24T00:00:01.000Z',
    createdAt: '2026-09-24T00:00:00.000Z',
  },
];

const server = http.createServer(async (req, res) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '';

  // 0. 健康检查与就绪探针
  if (
    pathname === '/' ||
    pathname === '/health' ||
    pathname.endsWith('/v1/health')
  ) {
    sendJson(res, {
      status: 'ok',
      service: 'strategy-dev',
      time: new Date().toISOString(),
    });
    return;
  }

  // 0.1 标的证券列表: GET /v1/securities 或 /api/mist/v1/securities
  if (pathname.endsWith('/v1/securities') && req.method === 'GET') {
    sendJson(res, [
      { id: 1, code: '600519', name: '贵州茅台', type: 'STOCK', status: 1 },
      { id: 2, code: '000001', name: '上证指数', type: 'INDEX', status: 1 },
      { id: 3, code: '000300', name: '沪深300', type: 'INDEX', status: 1 },
      { id: 4, code: '399006', name: '创业板指', type: 'INDEX', status: 1 },
      { id: 5, code: '002475', name: '立讯精密', type: 'STOCK', status: 1 },
      { id: 6, code: '300059', name: '东方财富', type: 'STOCK', status: 1 },
      { id: 7, code: '300502', name: '新易盛', type: 'STOCK', status: 1 },
      { id: 8, code: '600030', name: '中信证券', type: 'STOCK', status: 1 },
      { id: 9, code: '603127', name: '昭衍新药', type: 'STOCK', status: 1 },
    ]);
    return;
  }

  // 0.2 因子插件列表: GET /v1/factors/plugins 或 /api/mist/v1/factors/plugins
  if (pathname.endsWith('/v1/factors/plugins') && req.method === 'GET') {
    ensureStandardPluginsRegistered();
    const category = parsedUrl.query.category as any;
    const plugins = factorPluginRegistry.listByCategory(category);
    sendJson(
      res,
      plugins.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        version: p.version,
        description: p.description,
        paramSchema: p.paramSchema,
      })),
    );
    return;
  }

  // 0.3 缠论核心分型: POST /v1/chan/fenxing
  if (pathname.endsWith('/v1/chan/fenxing') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const code = resolveSecurityCode(body, '600519');
    const period = resolvePeriod(body.period, 30);
    try {
      const klines = loadCanonicalKlines({ code, period });
      const fenxings = ChanCore.findFenxings(klines);
      sendJson(res, fenxings);
    } catch {
      sendJson(res, []);
    }
    return;
  }

  // 0.4 缠论笔: POST /v1/chan/bi
  if (pathname.endsWith('/v1/chan/bi') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const code = resolveSecurityCode(body, '600519');
    const period = resolvePeriod(body.period, 30);
    try {
      const klines = loadCanonicalKlines({ code, period });
      const bis = ChanCore.createBi(klines);
      sendJson(res, { phaseA: bis.phaseA, phaseB: bis.phaseB });
    } catch {
      sendJson(res, { phaseA: [], phaseB: [] });
    }
    return;
  }

  // 0.5 缠论笔中枢: POST /v1/chan/channels
  if (pathname.endsWith('/v1/chan/channels') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const code = resolveSecurityCode(body, '600519');
    const period = resolvePeriod(body.period, 30);
    try {
      const klines = loadCanonicalKlines({ code, period });
      const channels = ChanCore.createChannels(klines);
      sendJson(res, { phaseA: channels.phaseA, phaseB: channels.phaseB });
    } catch {
      sendJson(res, { phaseA: [], phaseB: [] });
    }
    return;
  }

  // 0.6 缠论段: POST /v1/chan/duan
  if (pathname.endsWith('/v1/chan/duan') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const code = resolveSecurityCode(body, '600519');
    const period = resolvePeriod(body.period, 30);
    try {
      const klines = loadCanonicalKlines({ code, period });
      const bis = ChanCore.createBi(klines);
      const duans = ChanCore.createDuan(bis.phaseB);
      sendJson(res, duans);
    } catch {
      sendJson(res, []);
    }
    return;
  }

  // 0.7 缠论段中枢: POST /v1/chan/duan-channels
  if (pathname.endsWith('/v1/chan/duan-channels') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const code = resolveSecurityCode(body, '600519');
    const period = resolvePeriod(body.period, 30);
    try {
      const klines = loadCanonicalKlines({ code, period });
      const bis = ChanCore.createBi(klines);
      const duans = ChanCore.createDuan(bis.phaseB);
      const duanChannels = ChanCore.createDuanChannels(duans);
      sendJson(res, {
        phaseA: duanChannels.phaseA,
        phaseB: duanChannels.phaseB,
      });
    } catch {
      sendJson(res, { phaseA: [], phaseB: [] });
    }
    return;
  }

  // 1. K 线数据接口: POST /v1/indicators/k 或 POST /api/mist/v1/indicators/k
  if (pathname.endsWith('/v1/indicators/k') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const code = resolveSecurityCode(body, '600519');
    const period = resolvePeriod(body.period, 30);

    try {
      let klines = loadCanonicalKlines({ code, period });
      if (body.startDate || body.endDate) {
        const startMs = body.startDate
          ? new Date(body.startDate).getTime()
          : -Infinity;
        const endMs = body.endDate
          ? new Date(body.endDate).getTime()
          : Infinity;
        klines = klines.filter((k) => {
          const t = new Date(k.time).getTime();
          return t >= startMs && t <= endMs;
        });
      }
      const kVoList = klines.map((k) => ({
        id: k.id,
        symbol: k.symbol,
        time: k.time.toISOString(),
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        amount: k.amount ? Number(k.amount) : k.close * 1000,
      }));
      sendJson(res, kVoList);
    } catch (err: any) {
      console.error(`[/v1/indicators/k] 错误:`, err.message);
      sendJson(res, [], 200);
    }
    return;
  }

  // 2. 缠论包含合并 K 线: POST /v1/chan/merge-k
  if (pathname.endsWith('/v1/chan/merge-k') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const code = body.code || body.securityId || '600519';
    const period = Number(body.period) || 30;

    try {
      const klines = loadCanonicalKlines({ code, period });
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
          amount: k.amount ? Number(k.amount) : k.close * 1000,
        })),
      }));
      sendJson(res, mergeKList);
    } catch (err: any) {
      console.error(`[/v1/chan/merge-k] 错误:`, err.message);
      sendJson(res, [], 200);
    }
    return;
  }

  // 3. 统一绘图指令流: GET /v1/visual/commands
  if (pathname.endsWith('/v1/visual/commands') && req.method === 'GET') {
    const code = resolveSecurityCode(parsedUrl.query, '000001');
    const period = resolvePeriod(parsedUrl.query.period, 30);
    const filterFenxingContainment =
      parsedUrl.query.filterFenxingContainment === 'true' ||
      parsedUrl.query.filterFenxingContainment === '1';

    try {
      const targetEndMs = parsedUrl.query.endDate
        ? new Date(parsedUrl.query.endDate as string).getTime()
        : Infinity;
      const targetStartMs = parsedUrl.query.startDate
        ? new Date(parsedUrl.query.startDate as string).getTime()
        : -Infinity;

      let commands: readonly VisualCommand[] = [];

      // 若指定了 endDate，代表单步推演/切片复盘：必须基于截至 endDate 的真实历史可见 K 线动态现算，杜绝未来中枢剧透
      if (Number.isFinite(targetEndMs)) {
        const cacheKey = `${code}_${period}_${targetEndMs}_${filterFenxingContainment}`;
        const cached = pointInTimeVisualCache.get(cacheKey);
        if (cached) {
          commands = cached;
        } else {
          const fullKlines = loadCanonicalKlines({ code, period });
          const visibleKlines = fullKlines.filter(
            (k) => new Date(k.time).getTime() <= targetEndMs,
          );

          if (visibleKlines.length >= 3) {
            const pointInTimeCommands = ChanVisualAdapter.convert(
              visibleKlines,
              {
                includeBi: true,
                includeDuan: true,
                includeZhongshu: true,
                includeBsp: false,
                filterFenxingContainment,
              },
            );
            commands = pointInTimeCommands;
            if (pointInTimeVisualCache.size > 2000) {
              pointInTimeVisualCache.clear();
            }
            pointInTimeVisualCache.set(
              cacheKey,
              pointInTimeCommands as VisualCommand[],
            );
          } else {
            commands = [];
          }
        }
      } else {
        const tactics = DynamicTacticsLoader.reloadTactics();
        const evalResult = evaluateSignals(code, period, tactics, {
          filterFenxingContainment,
        });
        commands = evalResult.commands;
      }

      const filtered = commands.filter((c: any) => {
        const start = c.startTime || c.fromTime || c.time;
        const end = c.endTime || c.toTime || c.time;
        const startT = start ? new Date(start).getTime() : -Infinity;
        const endT = end ? new Date(end).getTime() : startT;
        return endT >= targetStartMs && startT <= targetEndMs;
      });

      sendJson(res, { commands: filtered, count: filtered.length });
    } catch (err: any) {
      console.error(`[/v1/visual/commands] 错误:`, err.message);
      sendJson(res, { commands: [], count: 0 });
    }
    return;
  }

  // 4. 策略版本激活/停用: POST /v1/strategies/:id/versions/:vid/activate 或 deactivate
  if (
    pathname.match(
      /\/v1\/strategies\/\d+\/versions\/\d+\/(activate|deactivate)$/,
    ) &&
    req.method === 'POST'
  ) {
    sendJson(res, null);
    return;
  }

  // 4.1 策略归档: POST /v1/strategies/:id/archive
  if (
    pathname.match(/\/v1\/strategies\/\d+\/archive$/) &&
    req.method === 'POST'
  ) {
    sendJson(res, null);
    return;
  }

  // 4.2 创建策略版本: POST /v1/strategies/:id/versions
  if (
    pathname.match(/\/v1\/strategies\/\d+\/versions$/) &&
    req.method === 'POST'
  ) {
    const body = await parseJsonBody(req);
    sendJson(
      res,
      {
        id: Date.now(),
        strategyDefinitionId: 1,
        versionNumber: 2,
        signalKind: body.signalKind || 'entry',
        status: 'draft',
        description: body.description || '新建策略版本',
        config: body.flowRule || {},
        createdAt: new Date().toISOString(),
      },
      201,
    );
    return;
  }

  // 4.3 策略版本列表: GET /v1/strategies/:id/versions
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
        status: 'enabled',
        description: `${tactics.name} (${tactics.id} v${tactics.version})`,
        config: {},
        createdAt: new Date().toISOString(),
      },
    ]);
    return;
  }

  // 5. 创建策略定义: POST /v1/strategies
  if (pathname.endsWith('/v1/strategies') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    sendJson(
      res,
      {
        id: Date.now(),
        name: body.name || '新建策略',
        description: body.description || '',
        status: 'draft',
        targetUniverse: body.targetUniverse || ['000001'],
        periods: body.periods || [30],
        sources: body.sources || ['qmt'],
        createdAt: new Date().toISOString(),
      },
      201,
    );
    return;
  }

  // 5.1 策略列表: GET /v1/strategies
  if (pathname.endsWith('/v1/strategies') && req.method === 'GET') {
    const tactics = DynamicTacticsLoader.reloadTactics();
    sendJson(res, [
      {
        id: 1,
        name: tactics.name,
        description: `本地开发动态战术 (${tactics.id} v${tactics.version})`,
        status: 'enabled',
        targetUniverse: ['000001', '600519'],
        periods: [30, 1440, 1, 5],
        sources: ['qmt', 'tdx'],
      },
    ]);
    return;
  }

  // 5.2 策略实时信号: GET /v1/strategy-signals
  if (pathname.endsWith('/v1/strategy-signals') && req.method === 'GET') {
    try {
      const tactics = DynamicTacticsLoader.reloadTactics();
      const code = resolveSecurityCode(parsedUrl.query, '000001');
      const period = resolvePeriod(parsedUrl.query.period, 30);
      const { signals } = evaluateSignals(code, period, tactics);
      const list = signals.slice(-50).map((sig, idx) => ({
        id: idx + 1,
        strategyDefinitionId: 1,
        strategyVersionId: 1,
        securityId: 1,
        security: {
          id: 1,
          code,
          name: code === '000001' ? '上证指数' : '贵州茅台',
        },
        period,
        source: 'qmt',
        signalTime: sig.decision.time.toISOString(),
        signalSource: 'live',
        signalKind: sig.isBuy ? 'entry' : 'exit',
        signalType: sig.bspType,
        confidence: sig.decision.confidence ?? 0.88,
        confidenceLevel: 'HIGH',
        decisionTrace: sig.decision,
        contextSnapshot: {
          type: sig.bspType,
          action: sig.isBuy ? 'BUY' : 'SELL',
          price: sig.decision.price,
          triggerPrice: sig.decision.price,
          time: sig.decision.time.toISOString(),
          triggerTime: sig.decision.time.toISOString(),
          signalTag: getBspBadgeText(sig.bspType, sig.decision.quadrant),
          chanBsp: {
            type: sig.bspType,
            price: sig.decision.price,
            level: period,
            period,
          },
        },
        ruleSnapshot: {
          rule: sig.decision.reason,
          quadrant: sig.decision.quadrant,
        },
        createdAt: sig.decision.time.toISOString(),
      }));
      sendJson(res, list);
    } catch {
      sendJson(res, []);
    }
    return;
  }

  // 5.3 策略告警事件: GET /v1/strategy-alert-events
  if (pathname.endsWith('/v1/strategy-alert-events') && req.method === 'GET') {
    sendJson(res, []);
    return;
  }

  // 5.4 策略告警事件确认: POST /v1/strategy-alert-events/:id/ack
  if (
    pathname.match(/\/v1\/strategy-alert-events\/\d+\/ack$/) &&
    req.method === 'POST'
  ) {
    sendJson(res, { id: 1, status: 'acked' });
    return;
  }

  // 5.1 创建回测: POST /v1/strategy-backtests
  if (pathname.endsWith('/v1/strategy-backtests') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const tactics = DynamicTacticsLoader.reloadTactics();
      const symbol = resolveSecurityCode(body, '000001');
      const period = resolvePeriod(body.period, 30);
      const source = body.source || 'qmt';
      const startDate = body.startDate || '2024-01-01T00:00:00.000Z';
      const endDate = body.endDate || '2026-12-31T23:59:59.000Z';

      const { signals } = evaluateSignals(symbol, period, tactics, {
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

  // 6. 回测信号列表: GET /v1/strategy-backtests/:id/signals
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
      const tactics = DynamicTacticsLoader.reloadTactics();
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
      const { signals } = evaluateSignals(symbol, period, tactics, {
        filterFenxingContainment,
        startDate: matchedRun?.startDate,
        endDate: matchedRun?.endDate,
      });

      const signalResults = signals.map((sig, idx) => {
        const d = sig.decision;
        return {
          id: idx + 1,
          backtestRunId: runId,
          securityCode: symbol,
          signalTime: d.time.toISOString(),
          signalType: sig.bspType,
          confidence: d.confidence ?? 0.88,
          confidenceLevel: 'HIGH',
          decisionTrace: {
            tacticsId: tactics.id,
            tacticsName: tactics.name,
            quadrant: d.quadrant,
            action: sig.isBuy ? 'BUY' : 'SELL',
            reason: d.reason,
            price: d.price,
            metadata: d.metadata,
          },
          contextSnapshot: {
            type: sig.bspType,
            action: sig.isBuy ? 'BUY' : 'SELL',
            price: d.price,
            triggerPrice: d.price,
            time: d.time.toISOString(),
            triggerTime: d.time.toISOString(),
            signalTag: getBspBadgeText(sig.bspType, d.quadrant),
            chanBsp: {
              type: sig.bspType,
              price: d.price,
              level: period,
              period,
            },
            tactics: {
              id: tactics.id,
              name: tactics.name,
              version: tactics.version,
            },
          },
          ruleSnapshot: {
            rule: d.reason,
            quadrant: d.quadrant,
          },
          createdAt: d.time.toISOString(),
        };
      });

      sendJson(res, signalResults);
    } catch (err: any) {
      console.error(`[/v1/strategy-backtests/:id/signals] 错误:`, err.message);
      sendJson(res, []);
    }
    return;
  }

  // 7. 单次回测记录: GET /v1/strategy-backtests/:id
  if (
    pathname.match(/\/v1\/strategy-backtests\/\d+$/) &&
    req.method === 'GET'
  ) {
    const runIdMatch = pathname.match(/\/v1\/strategy-backtests\/(\d+)$/);
    const runId = runIdMatch && runIdMatch[1] ? Number(runIdMatch[1]) : 1;
    const matchedRun = mockRuns.find((r) => r.id === runId) || mockRuns[0];
    sendJson(res, matchedRun);
    return;
  }

  // 8. 回测记录列表: GET /v1/strategy-backtests (或 GET /v1/strategy-backtests/runs)
  if (
    (pathname.endsWith('/v1/strategy-backtests') ||
      pathname.endsWith('/v1/strategy-backtests/runs')) &&
    req.method === 'GET'
  ) {
    sendJson(res, mockRuns);
    return;
  }

  // 默认 404 兜底响应（符合 Mist 标准 Envelope 契约）
  sendJson(res, null, 404, pathname || '/404');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `\n🚀 [Mist Dev Server] 本地开发服务已就绪: http://localhost:${PORT}`,
  );
  console.log(`已就绪契约:`);
  console.log(`  - POST /v1/indicators/k       (读取本地离线/快照行情)`);
  console.log(`  - POST /v1/chan/merge-k       (现算包含合并 K 线)`);
  console.log(
    `  - GET  /v1/visual/commands    (现算缠论几何指令流，笔/段/中枢)`,
  );
  console.log(`  - GET  /v1/strategies         (策略清单与版本)`);
  console.log(`  - GET  /v1/strategy-backtests (回测记录与归因详情)\n`);
  console.log(`现在可以在 mist-fe 目录运行: pnpm dev:local`);

  // 异步在后台预热默认标的与周期，确保前端首次打开 0ms 瞬间响应
  setTimeout(() => {
    try {
      const tactics = DynamicTacticsLoader.reloadTactics();
      console.log('🔄 [预热] 正在后台预热 000001 30m 全量逐 Bar 回测数据...');
      const res = evaluateSignals('000001', 30, tactics, {
        startDate: mockRuns[0].startDate,
        endDate: mockRuns[0].endDate,
      });
      // 写入通用全局缓存键，确保无时间窗口查询同样 0ms 命中
      evalCache.set(
        `000001_30_${tactics.id}_${tactics.version}_false_-Infinity_Infinity`,
        res,
      );
      console.log(
        `✅ [预热] 000001 30m 全量逐 Bar 回测数据已就绪！(信号数: ${res.signals.length}, 几何图元: ${res.commands.length})`,
      );
    } catch (e: any) {
      console.warn('预热提示:', e.message);
    }
  }, 50);
});
