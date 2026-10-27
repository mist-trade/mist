#!/usr/bin/env node
/**
 * 本地极简 Dev API 服务 (零微服务开销，直连 mist-fe 工作台)
 *
 * 端口: 8001 (默认与 mist-backend 生产端口一致)
 * 职责: 模拟生产 API 契约，支持 mist-fe 无感读取本地行情与动态渲染私有策略买卖点
 * 准则: 严格薄网关，核心推演 100% 走策略树决策流与 StrategyEvaluationKernel 统一内核，严禁私自手写伪回测
 */

import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { ChanCore, type ChanK } from '@app/chancore';
import { isValidDate } from '@app/utils';
import { ChanVisualAdapter } from '../../libs/visual-command/src/adapters/chan-visual.adapter';

import {
  StrategySimulationSession,
  SIMULATION_LOCAL_FIXTURE_IDENTITY,
  type SimulationFrame,
  type SimulationSignal,
} from '../../libs/strategy/src/simulation';
import {
  StrategyEvaluationKernel,
  type KernelSignal,
} from '../../libs/strategy/src/kernel';
import { SimulatedBroker } from '../../libs/strategy/src/execution/simulated-broker';
import { PositionStateMachine } from '../../libs/strategy/src/position/position-state-machine';
import { ExecutionRiskArbiter } from '../../libs/strategy/src/execution/execution-risk-arbiter';
import { formatShanghaiDateString } from '@app/timezone';
import {
  computePerformanceSummary,
  computeUnderwaterDuration,
} from '@app/indicators';
import { StressTestingSuiteOrchestrator } from '../../libs/strategy/src/stress-testing';
import { InMemoryFactorPluginRegistry } from '../../libs/strategy/src/factor/factor-plugin-registry';
import { ensureStandardPluginsRegistered } from '../../libs/strategy/src/factor/standard-plugins';
import { ExternalFactorPluginLoader } from '../../libs/strategy/src/factor/external-plugin-loader';
import {
  ORDER_SIDES,
  ORDER_TYPES,
} from '../../libs/strategy/src/strategy.constants';
import type { DecisionFlowNode } from '../../libs/strategy/src/decision-flow/decision-flow.types';
import {
  compileStoredDefinitionVersion,
  deriveContextRequirements,
  StoredDefinitionCompileError,
  type StoredDefinitionSourceKind,
} from '../../libs/strategy/src/decision-flow/stored-definition-compiler';
import { HistoricalBarSource } from '../../libs/strategy/src/kernel/historical-bar-source';
import {
  InMemoryReplayPort,
  ReplaySeriesMissingError,
} from '../../libs/strategy/src/kernel/adapters/in-memory-replay-port';
import { mapKernelSignalToSimulationSignal } from '../../libs/strategy/src/simulation/kernel-signal-mapper';
import type { StrategySignalKind } from '../../libs/strategy/src/rules/strategy-rule.types';
import {
  loadCanonicalKlines,
  PERIOD_NAME_MAP,
  PRIVATE_DATA_DIR,
  REVERSE_PERIOD_MAP,
} from './provider';
import { KPriceProjector } from '../../libs/market-data/src/k-price-projector';
import type {
  StrategyBar,
  StrategyMarketSource,
} from '../../libs/market-data/src/strategy-bar';
import { normalizeExternalDecimalText } from '../../libs/decimal/src/decimal8';
import {
  DEFAULT_DEV_PORT,
  DEFAULT_DEV_SECURITY_CODE,
  DEFAULT_DEV_PERIOD,
  DEFAULT_DEV_KLINE_LIMIT,
  DEFAULT_DEV_SECURITY_ID,
  DEFAULT_DEV_MARKET_SOURCE,
  DEFAULT_DEV_API_PATH,
  LOOPBACK_IPS,
  LOOPBACK_IPV4_PREFIX,
  DEV_HTTP_STATUS,
  DEV_CORS_HEADERS,
  SSE_HEARTBEAT_INTERVAL_MS,
  SESSION_INACTIVE_TTL_MS,
  MAX_DEV_SESSIONS,
  MAX_SNAPSHOT_DUMP_FILES,
} from './strategy-dev.constants';

const PORT = Number(process.env.PORT) || DEFAULT_DEV_PORT;

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
      DEV_HTTP_STATUS.FORBIDDEN,
    );
    return false;
  }

  const remoteIp = req.socket?.remoteAddress || '';
  const isLoopback =
    LOOPBACK_IPS.includes(remoteIp as any) ||
    remoteIp.startsWith(LOOPBACK_IPV4_PREFIX) ||
    remoteIp === '';

  const allowRemoteDev = process.env.ALLOW_REMOTE_DEV_SIMULATION === 'true';

  if (!isLoopback && !allowRemoteDev && process.env.NODE_ENV !== 'test') {
    sendJson(
      res,
      {
        error: `Forbidden: Strategy simulation suite is strictly restricted to local development environment. Request from unauthorized host (${remoteIp}) was rejected.`,
      },
      DEV_HTTP_STATUS.FORBIDDEN,
    );
    return false;
  }

  return true;
}

function resolveSecurityCode(
  rawQuery: any,
  fallback = DEFAULT_DEV_SECURITY_CODE,
): string {
  return String(
    rawQuery?.code || rawQuery?.symbol || rawQuery?.securityCode || fallback,
  );
}

function resolvePeriod(rawPeriod: any, fallback = DEFAULT_DEV_PERIOD): number {
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

function wrapEnvelope(
  data: any,
  statusCode: number = DEV_HTTP_STATUS.OK,
  reqPath = DEFAULT_DEV_API_PATH,
) {
  return JSON.stringify({
    success:
      statusCode >= DEV_HTTP_STATUS.OK &&
      statusCode < DEV_HTTP_STATUS.SUCCESS_MAX,
    statusCode,
    message:
      statusCode >= DEV_HTTP_STATUS.OK &&
      statusCode < DEV_HTTP_STATUS.SUCCESS_MAX
        ? 'SUCCESS'
        : 'ERROR',
    requestId: `dev-${Date.now()}`,
    timestamp: new Date().toISOString(),
    path: reqPath && reqPath.trim().length > 0 ? reqPath : DEFAULT_DEV_API_PATH,
    data,
  });
}

function sendJson(
  res: http.ServerResponse,
  data: any,
  statusCode: number = DEV_HTTP_STATUS.OK,
  reqPath = DEFAULT_DEV_API_PATH,
) {
  res.writeHead(statusCode, DEV_CORS_HEADERS);
  res.end(wrapEnvelope(data, statusCode, reqPath));
}

function pruneDumpFiles(dumpDir: string, maxFiles: number): void {
  try {
    if (!fs.existsSync(dumpDir)) return;
    const files = fs
      .readdirSync(dumpDir)
      .filter((file) => file.endsWith('.json') && file !== 'latest-dump.json')
      .map((file) => {
        const filePath = path.join(dumpDir, file);
        return { file: filePath, mtime: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxFiles) {
      for (const toDelete of files.slice(maxFiles)) {
        try {
          fs.unlinkSync(toDelete.file);
        } catch {
          // ignore individual deletion failure
        }
      }
    }
  } catch {
    // ignore directory traversal failure
  }
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
  securityId = DEFAULT_DEV_SECURITY_ID,
  source: StrategyMarketSource = DEFAULT_DEV_MARKET_SOURCE,
  securityCode = DEFAULT_DEV_SECURITY_CODE,
): StrategyBar {
  return Object.freeze({
    securityId,
    securityCode: rawK.symbol || securityCode,
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
  currentStatus?: string,
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
    latestSignals: frame.latestSignals ?? [],
    status: currentStatus ?? frame.status,
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
    strategyName: '上证指数 30m 缠论形态增强买卖点回测 (无止损止盈)',
    strategyVersionId: 1,
    status: 'completed',
    source: 'qmt',
    targetUniverse: ['000001'],
    period: 30,
    startDate: '2025-07-03T05:30:00.000Z',
    endDate: '2026-09-24T07:00:00.000Z',
    signalCount: 51,
    matchedSecurityCount: 1,
    startedAt: '2026-09-25T05:00:00.000Z',
    completedAt: '2026-09-25T05:00:02.000Z',
    createdAt: '2026-09-25T05:00:00.000Z',
  },
  {
    id: 2,
    strategyDefinitionId: 1,
    strategyName: '上证指数 日线 缠论形态增强买卖点回测 (无止损止盈)',
    strategyVersionId: 1,
    status: 'completed',
    source: 'qmt',
    targetUniverse: ['000001'],
    period: 1440,
    startDate: '2015-01-01T00:00:00.000Z',
    endDate: '2026-10-13T16:00:00.000Z',
    signalCount: 10,
    matchedSecurityCount: 1,
    startedAt: '2026-09-25T04:50:00.000Z',
    completedAt: '2026-09-25T04:50:01.000Z',
    createdAt: '2026-09-25T04:50:00.000Z',
  },
  {
    id: 3,
    strategyDefinitionId: 1,
    strategyName: '上证指数 5m 缠论形态增强买卖点回测 (无止损止盈)',
    strategyVersionId: 1,
    status: 'completed',
    source: 'qmt',
    targetUniverse: ['000001'],
    period: 5,
    startDate: '2025-07-03T05:30:00.000Z',
    endDate: '2026-09-24T07:00:00.000Z',
    signalCount: 4,
    matchedSecurityCount: 1,
    startedAt: '2026-09-25T04:45:00.000Z',
    completedAt: '2026-09-25T04:45:01.000Z',
    createdAt: '2026-09-25T04:45:00.000Z',
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
  mode?: string;
  pluginId?: string;
  enableStopLoss?: boolean;
  strategyDefinitionId?: number;
  /** 插件推导的 context 需求指纹：插件声明变化时使旧缓存失效 */
  contextFingerprint?: string;
  /** 存量定义本地重放的版本标签 */
  definitionVersionLabel?: string;
}): string {
  const start = isValidDate(options.startDate)
    ? options.startDate.toISOString()
    : options.startDate || '';
  const end = isValidDate(options.endDate)
    ? options.endDate.toISOString()
    : options.endDate || '';
  return `${options.code}:${options.period}:${Boolean(options.filterFenxingContainment)}:${options.mode || ''}:${options.pluginId || ''}:${Boolean(options.enableStopLoss)}:${options.strategyDefinitionId ?? ''}:${options.contextFingerprint || ''}:${options.definitionVersionLabel || ''}:${start}:${end}`;
}

/** 有界请求错误：dev 回测链路 fail-closed 的 HTTP 映射载体 */
class DevBacktestRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DevBacktestRequestError';
  }
}

/**
 * 存量定义本地重放目录（`.data/` 已 gitignore）：
 * 导出文件含私有插件参数与树形态，仅存本地，严禁提交/外传。
 */
// 存量定义重放目录：私有仓 market-data/strategy-definitions（含私有插件参数）
const LOCAL_DEFINITIONS_DIR = path.join(
  PRIVATE_DATA_DIR,
  'strategy-definitions',
);

interface LocalStoredDefinition {
  kind: StoredDefinitionSourceKind;
  rule: Record<string, unknown>;
  signalKind?: StrategySignalKind;
  versionLabel: string;
}

/**
 * 加载本地导出的存量定义（`pnpm dev:sync --definition <id>` 产物）：
 * `<id>_v<version>.json` 中取最高版本。未找到 → 返回 null（回落硬编码预设树）。
 */
function loadLocalStoredDefinition(
  definitionId: number,
): LocalStoredDefinition | null {
  if (!fs.existsSync(LOCAL_DEFINITIONS_DIR)) return null;
  const prefix = `${definitionId}_v`;
  const files = fs
    .readdirSync(LOCAL_DEFINITIONS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  if (files.length === 0) return null;
  files.sort((a, b) => {
    const va = Number(a.slice(prefix.length, -'.json'.length)) || 0;
    const vb = Number(b.slice(prefix.length, -'.json'.length)) || 0;
    return va - vb;
  });
  const latest = files[files.length - 1];
  const raw = JSON.parse(
    fs.readFileSync(path.join(LOCAL_DEFINITIONS_DIR, latest), 'utf-8'),
  ) as {
    kind?: StoredDefinitionSourceKind;
    rule?: Record<string, unknown>;
    signalKind?: StrategySignalKind;
  };
  if (!raw?.rule || typeof raw.rule !== 'object') {
    throw new DevBacktestRequestError(
      422,
      'DEFINITION_EXPORT_INVALID',
      `存量定义导出文件缺少 rule 字段: ${latest}，请重新执行 pnpm dev:sync --definition ${definitionId}`,
    );
  }
  return {
    kind: raw.kind ?? 'decision_flow',
    rule: raw.rule,
    ...(raw.signalKind ? { signalKind: raw.signalKind } : {}),
    versionLabel: latest.replace('.json', ''),
  };
}

/**
 * 构造自定义决策流树：支持单因子消融与复合决策流
 */
function createCustomDecisionFlow(
  mode?: string,
  pluginId?: string,
  strategyDefinitionId?: number,
): DecisionFlowNode {
  if (mode === 'single' && pluginId) {
    const params: Record<string, unknown> = {};
    if (pluginId === 'plugin.regime.shanghai-index') {
      params.mode = 'dual_speed';
    }
    if (pluginId === 'plugin.chan.bsp') {
      params.units = 'bi';
      params.direction = 'both';
      params.points = { first: true, second: true, third: true };
      params.requiredBarCount = 60;
      params.deduplicate = true;
    }
    return {
      id: `guard_${pluginId.replace(/\./g, '_')}`,
      type: 'GUARD',
      name: `因子插件评估门禁: ${pluginId}`,
      pluginId,
      params,
      requiredAction: 'BOTH',
      minConfidence: 0.5,
      onPass: {
        id: `term_${pluginId.replace(/\./g, '_')}_pass`,
        type: 'TERMINAL',
        action: 'INHERIT',
        signalTag: pluginId,
        reason: `${pluginId} 触发买卖决策`,
      },
      onFail: {
        id: `term_${pluginId.replace(/\./g, '_')}_fail`,
        type: 'TERMINAL',
        action: 'ABORT',
        reason: '未满足因子确认条件',
      },
    };
  }

  if (
    strategyDefinitionId === 3 ||
    mode === 'full_resonance' ||
    mode === 'enhanced'
  ) {
    return {
      id: 'guard_regime_shanghai',
      type: 'GUARD',
      name: '上证宏观大周期滤网',
      pluginId: 'plugin.regime.shanghai-index',
      params: { mode: 'dual_speed' },
      requiredAction: 'BUY',
      minConfidence: 0.6,
      // 牛市多头环境分支 (onPass: 宏观 BUY)
      onPass: {
        id: 'guard_bull_chan_bsp',
        type: 'GUARD',
        name: '牛市缠论形态主门禁',
        pluginId: 'plugin.chan.bsp',
        params: {
          units: 'bi',
          direction: 'both',
          points: { first: true, second: true, third: true },
          requiredBarCount: 60,
          deduplicate: true,
        },
        requiredAction: 'BOTH',
        minConfidence: 0.5,
        onPass: {
          id: 'guard_bull_vpci',
          type: 'GUARD',
          name: 'VPCI量价共振增强校验',
          pluginId: 'plugin.tactics.volume-price-confirmation',
          params: {},
          requiredAction: 'BUY',
          minConfidence: 0.5,
          onPass: {
            id: 'term_bull_chan_enhanced',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'ENHANCED_CHAN_BSP',
            reason: '牛市顺势下缠论形态结构确立且通过私有量价共振增强确认',
          },
          onFail: {
            id: 'term_bull_chan_standard',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'BULL_CHAN_BSP',
            reason: '牛市顺势下缠论标准形态买卖点确立',
          },
        },
        // 若缠论未出笔形态，由波动率挤压放量爆发增强捕捉额外爆发买点
        onFail: {
          id: 'guard_bull_squeeze',
          type: 'GUARD',
          name: '私有波动率挤压放量战术买点增强',
          pluginId: 'plugin.tactics.volatility-squeeze-fire',
          params: { minVolumeTsRank: 0.65, minEntityAtrRatio: 0.65 },
          requiredAction: 'BUY',
          minConfidence: 0.5,
          onPass: {
            id: 'term_bull_squeeze_fire',
            type: 'TERMINAL',
            action: 'BUY',
            signalTag: 'TACTICS_FIRE_BUY',
            reason: '宏观牛市蓄能挤压释放爆发买点',
          },
          // 若亦未触发挤压爆发，由牛市微观左右侧战术插件确认买卖点
          onFail: {
            id: 'guard_bull_tactics',
            type: 'GUARD',
            name: '牛市微观左右侧战术增强',
            pluginId: 'plugin.tactics.bull-left-right-bsp',
            params: { fallbackToMainBars: true },
            requiredAction: 'BOTH',
            minConfidence: 0.5,
            onPass: {
              id: 'term_bull_tactics_pass',
              type: 'TERMINAL',
              action: 'INHERIT',
              signalTag: 'BULL_TACTICS_SIGNAL',
              reason: '宏观牛市下触发左右侧微观战术信号',
            },
            onFail: {
              id: 'term_bull_abort',
              type: 'TERMINAL',
              action: 'ABORT',
              reason: '牛市环境中未满足缠论形态或战术增强触发条件',
            },
          },
        },
      },
      // 熊市/非牛市环境分支 (onFail: 宏观 SELL 或 NEUTRAL)
      onFail: {
        id: 'guard_regime_bear_check',
        type: 'GUARD',
        name: '上证宏观走熊与防守研判',
        pluginId: 'plugin.regime.shanghai-index',
        params: { mode: 'dual_speed' },
        requiredAction: 'SELL',
        minConfidence: 0.6,
        onPass: {
          id: 'guard_bear_tactics',
          type: 'GUARD',
          name: '熊市左右侧战术研判门禁',
          pluginId: 'plugin.tactics.bear-left-right-bsp',
          params: { fallbackToMainBars: true },
          requiredAction: 'BOTH',
          minConfidence: 0.5,
          onPass: {
            id: 'term_bear_tactics_pass',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'BEAR_TACTICS_SIGNAL',
            reason: '熊市左右侧战术买点触发',
          },
          onFail: {
            id: 'term_regime_defend_sell',
            type: 'TERMINAL',
            action: 'SELL',
            signalTag: 'REGIME_DEFEND_SELL',
            reason: '上证指数宏观走熊清仓防守',
          },
        },
        onFail: {
          id: 'term_regime_neutral_abort',
          type: 'TERMINAL',
          action: 'ABORT',
          reason: '上证指数震荡纠缠，维持观望',
        },
      },
    };
  }

  if (
    strategyDefinitionId === 2 ||
    mode === 'composite' ||
    mode === 'tactics'
  ) {
    return {
      id: 'guard_regime_shanghai',
      type: 'GUARD',
      name: '上证宏观大周期滤网',
      pluginId: 'plugin.regime.shanghai-index',
      params: { mode: 'dual_speed' },
      requiredAction: 'BUY',
      minConfidence: 0.6,
      // 牛市多头环境分支 (onPass: 宏观 BUY)
      onPass: {
        id: 'guard_bull_chan_bsp',
        type: 'GUARD',
        name: '牛市缠论形态主门禁',
        pluginId: 'plugin.chan.bsp',
        params: {
          units: 'bi',
          direction: 'both',
          points: { first: true, second: true, third: true },
          requiredBarCount: 60,
          deduplicate: true,
        },
        requiredAction: 'BOTH',
        minConfidence: 0.5,
        onPass: {
          id: 'term_bull_chan_pass',
          type: 'TERMINAL',
          action: 'INHERIT',
          signalTag: 'BULL_CHAN_BSP',
          reason: '宏观牛市顺势下缠论标准形态买卖点确立',
        },
        // 若缠论未出笔形态，由牛市微观左右侧战术插件确认买卖点
        onFail: {
          id: 'guard_bull_tactics',
          type: 'GUARD',
          name: '牛市微观左右侧战术增强',
          pluginId: 'plugin.tactics.bull-left-right-bsp',
          params: { fallbackToMainBars: true },
          requiredAction: 'BOTH',
          minConfidence: 0.5,
          onPass: {
            id: 'term_bull_tactics_pass',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'BULL_TACTICS_SIGNAL',
            reason: '宏观牛市下触发左右侧微观战术信号',
          },
          onFail: {
            id: 'term_bull_abort',
            type: 'TERMINAL',
            action: 'ABORT',
            reason: '牛市环境中未满足缠论形态或左右侧战术触发条件',
          },
        },
      },
      // 熊市/非牛市环境分支 (onFail: 宏观 SELL 或 NEUTRAL)
      onFail: {
        id: 'guard_regime_bear_check',
        type: 'GUARD',
        name: '上证宏观走熊与防守研判',
        pluginId: 'plugin.regime.shanghai-index',
        params: { mode: 'dual_speed' },
        requiredAction: 'SELL',
        minConfidence: 0.6,
        onPass: {
          id: 'guard_bear_tactics',
          type: 'GUARD',
          name: '熊市左右侧战术研判门禁',
          pluginId: 'plugin.tactics.bear-left-right-bsp',
          params: { fallbackToMainBars: true },
          requiredAction: 'BOTH',
          minConfidence: 0.5,
          onPass: {
            id: 'term_bear_tactics_pass',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'BEAR_TACTICS_SIGNAL',
            reason: '熊市左右侧战术买点触发',
          },
          onFail: {
            id: 'term_regime_defend_sell',
            type: 'TERMINAL',
            action: 'SELL',
            signalTag: 'REGIME_DEFEND_SELL',
            reason: '上证指数宏观走熊清仓防守',
          },
        },
        onFail: {
          id: 'term_regime_neutral_abort',
          type: 'TERMINAL',
          action: 'ABORT',
          reason: '上证指数震荡纠缠，维持观望',
        },
      },
    };
  }

  return createEnhancedChanDecisionFlow();
}

/**
 * 构造标准纯原典缠论买卖点决策流树：
 * 彻底移除 volume-price-confirmation 与 volatility-squeeze-fire，
 * 100% 遵照缠论原典形态买卖点。
 */
function createEnhancedChanDecisionFlow(): DecisionFlowNode {
  return {
    id: 'guard_chan_bsp_primary',
    type: 'GUARD',
    name: '缠论标准形态买卖点主门禁',
    pluginId: 'plugin.chan.bsp',
    params: {
      units: 'bi',
      direction: 'both',
      points: { first: true, second: true, third: true },
      requiredBarCount: 60,
      deduplicate: true,
    },
    requiredAction: 'BOTH',
    minConfidence: 0.5,
    onPass: {
      id: 'term_chan_bsp_standard',
      type: 'TERMINAL',
      action: 'INHERIT',
      signalTag: 'CHAN_BSP',
      reason: '缠论原典形态买卖点确立',
    },
    onFail: {
      id: 'term_abort',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: '未满足缠论形态买卖点触发条件',
    },
  };
}

interface RunBacktestOptions {
  code: string;
  period: number;
  startDate?: string | Date;
  endDate?: string | Date;
  filterFenxingContainment?: boolean;
  mode?: 'single' | 'composite' | 'tactics' | 'full_resonance' | 'enhanced';
  pluginId?: string;
  strategyDefinitionId?: number;
  initialCash?: number;
  runStressSuite?: boolean;
  enableStopLoss?: boolean;
}

// 全量执行仿真并获取回测结果的统一纯净胶水（统一内核 push 驱动 + Next-Bar 因果撮合 + Polars 绩效）
async function runUnifiedSimulationBacktest(options: RunBacktestOptions) {
  const initialCash = options.initialCash ?? 1_000_000;

  // 1. 初始化插件注册表并动态加载外部插件（含私有战术插件）
  const registry = new InMemoryFactorPluginRegistry();
  ensureStandardPluginsRegistered(registry);
  ExternalFactorPluginLoader.registerExternalPlugins(registry);

  // 2. 决策流解析：存量定义本地重放优先（与生产同一编译路径）→ 硬编码预设树
  //    （内置预设仅 1/2/3；其余 definitionId 必须先导出本地定义，fail-closed）
  const isLegacyPresetId =
    typeof options.strategyDefinitionId === 'number' &&
    [1, 2, 3].includes(options.strategyDefinitionId);
  const storedDefinition =
    typeof options.strategyDefinitionId === 'number' && !isLegacyPresetId
      ? loadLocalStoredDefinition(options.strategyDefinitionId)
      : null;
  let flow: DecisionFlowNode;
  let requiredBarCount = 300;
  let definitionVersionLabel: string | null = null;
  if (storedDefinition) {
    const compiled = compileStoredDefinitionVersion(
      {
        kind: storedDefinition.kind,
        rule: storedDefinition.rule,
        signalKind: storedDefinition.signalKind,
      },
      registry,
    );
    flow = compiled.flow;
    requiredBarCount = compiled.requiredBarCount;
    definitionVersionLabel = storedDefinition.versionLabel;
  } else if (typeof options.strategyDefinitionId === 'number') {
    throw new DevBacktestRequestError(
      422,
      'DEFINITION_NOT_FOUND',
      `本地未找到存量定义 ${options.strategyDefinitionId} 的导出文件（内置预设仅支持 1/2/3）` +
        ` — 请先执行: pnpm dev:sync --definition ${options.strategyDefinitionId}`,
    );
  } else {
    flow = createCustomDecisionFlow(
      options.mode,
      options.pluginId,
      options.strategyDefinitionId,
    );
  }
  // context 需求由插件元数据推导（编译边界唯一实现，调用方不可传 lookback）
  const contextRequirements = deriveContextRequirements(flow, registry);

  // 3. 缓存键（含 context 指纹与定义版本）
  const cacheKey = getBacktestCacheKey({
    ...options,
    contextFingerprint: JSON.stringify(contextRequirements),
    ...(definitionVersionLabel ? { definitionVersionLabel } : {}),
  });
  const cachedSignals = backtestSignalsCache.get(cacheKey);
  if (
    cachedSignals &&
    !options.runStressSuite &&
    !options.mode &&
    !options.pluginId &&
    !options.strategyDefinitionId
  ) {
    return {
      signals: cachedSignals,
      kernel: null,
      navSeries: [],
      closedTrades: [],
      performance: null,
      stressReport: null,
      replay: undefined,
      maxUnderwaterDuration: undefined,
    };
  }

  // 4. 多周期数据装载：周期集合 = 求值 ∪ context，逐周期映射 + A 股边界过滤
  const MIN_A_SHARE_DATE = new Date('1996-12-16T00:00:00.000Z');
  const demandedPeriods = Array.from(
    new Set<number>([
      options.period,
      ...Object.keys(contextRequirements).map(Number),
    ]),
  );
  const seriesMap = new Map<number, StrategyBar[]>();
  for (const period of demandedPeriods) {
    let klines: ChanK[];
    try {
      // exact：多周期 context 严禁静默回退到同 symbol 其他周期数据集
      klines = loadCanonicalKlines({ code: options.code, period, exact: true });
    } catch (err: any) {
      const periodName = REVERSE_PERIOD_MAP[period] ?? `${period}m`;
      throw new DevBacktestRequestError(
        422,
        'DATA_MISSING',
        `本地未找到 ${options.code} 周期 ${periodName} 行情数据（多周期回放需要）: ${err.message}` +
          ` — 请先执行: pnpm dev:sync --code ${options.code} --periods ${periodName}`,
      );
    }
    const periodBars = klines
      .map((k) =>
        toStrategyBar(
          k,
          period,
          DEFAULT_DEV_SECURITY_ID,
          (k as { source?: StrategyMarketSource }).source ??
            DEFAULT_DEV_MARKET_SOURCE,
          options.code,
        ),
      )
      .filter((b) => b.timestamp.getTime() >= MIN_A_SHARE_DATE.getTime());
    seriesMap.set(period, periodBars);
  }

  // 5. 内存 replay port（缺数据/乱序 fail-closed）
  const port = new InMemoryReplayPort({
    securityId: DEFAULT_DEV_SECURITY_ID,
    securityCode: options.code,
    series: seriesMap,
  });

  // 6. 公开相边界（startDate 缺省 = A 股现代样本边界，等价全公开）
  const publicFrom = options.startDate
    ? new Date(options.startDate)
    : new Date(MIN_A_SHARE_DATE.getTime());
  let lastTimestampMs = 0;
  for (const bars of seriesMap.values()) {
    const last = bars[bars.length - 1];
    if (last && last.timestamp.getTime() > lastTimestampMs) {
      lastTimestampMs = last.timestamp.getTime();
    }
  }
  const endAt = options.endDate
    ? new Date(options.endDate)
    : new Date(lastTimestampMs);

  const kernel = new StrategyEvaluationKernel({
    securityId: DEFAULT_DEV_SECURITY_ID,
    securityCode: options.code,
    publicFrom,
    registry,
    plans: [
      {
        definitionId: SIMULATION_LOCAL_FIXTURE_IDENTITY.definitionId,
        versionId: SIMULATION_LOCAL_FIXTURE_IDENTITY.versionId,
        flow,
        ruleSnapshot: Object.freeze({}),
        period: options.period,
        requiredBarCount,
        contextRequirements,
      },
    ],
  });

  // 7. 多序列合并推流（HistoricalBarSource：k 路归并，onBar/onSignal 仅求值周期）
  const replaySource = new HistoricalBarSource(port, {
    securityId: DEFAULT_DEV_SECURITY_ID,
    securityCode: options.code,
    selection: { kind: 'canonical' },
    evaluationPeriod: options.period,
    contextPeriods: contextRequirements,
    preWarmEndAt: publicFrom,
    publicFrom,
    endAt,
    requiredBars: requiredBarCount,
  });

  // 8. 初始化因果经纪商与持仓状态机（T+1 / 日结 / 解锁按日线节奏）
  const broker = new SimulatedBroker({
    initialCash,
    slippageRatio: 0.0005,
  });
  const evaluationBars = seriesMap.get(options.period) ?? [];
  broker.registerSecurity(options.code, {
    name: options.code === '000001' ? '上证指数' : options.code,
    preClose: evaluationBars[0]?.open ?? 1000,
  });
  const position = new PositionStateMachine(
    DEFAULT_DEV_SECURITY_ID,
    options.code,
    initialCash,
  );
  const enableStopLoss =
    options.enableStopLoss === true ||
    (options.enableStopLoss !== false &&
      (options.mode === 'composite' ||
        options.mode === 'full_resonance' ||
        options.mode === 'enhanced' ||
        options.strategyDefinitionId === 2 ||
        options.strategyDefinitionId === 3));
  const arbiter = enableStopLoss
    ? new ExecutionRiskArbiter({
        hardStopLossRatio: -0.08,
      })
    : null;

  const collectedSignals: SimulationSignal[] = [];
  let lastDateStr: string | null = null;
  let lastEvalBar: StrategyBar | null = null;
  let evalBarCount = 0;
  let pushCount = 0;

  const replaySummary = await replaySource.drive(
    kernel,
    // onSignal（仅求值周期）：信号收集 + 因果委托下达（Next-Bar 撮合，本 Bar 收盘下达）
    async (kSig: KernelSignal, bar: StrategyBar) => {
      const simSig = mapKernelSignalToSimulationSignal(kSig, {
        securityCode: options.code,
        period: options.period,
      });
      collectedSignals.push(simSig);

      const hasPendingOrder = broker
        .getOpenOrders()
        .some((o) => o.securityCode === options.code);

      if (simSig.isBuy || kSig.signalKind === 'entry') {
        const availableCash = broker.getAccount().availableCash;
        const buyShares =
          Math.floor((availableCash * 0.95) / bar.close / 100) * 100;
        if (
          buyShares >= 100 &&
          (position.getStatus() === 'EMPTY' ||
            position.getStatus() === 'CLOSED') &&
          !hasPendingOrder
        ) {
          broker.submitOrder({
            securityId: DEFAULT_DEV_SECURITY_ID,
            securityCode: options.code,
            side: ORDER_SIDES.BUY,
            orderType: ORDER_TYPES.MARKET,
            quantity: buyShares,
            signalTime: bar.timestamp,
            entryReason:
              kSig.displayTag ||
              kSig.signalType ||
              kSig.badgeText ||
              simSig.badgeText ||
              'BUY_SIGNAL',
          });
        }
      } else if (!simSig.isBuy || kSig.signalKind === 'exit') {
        if (!hasPendingOrder && position.getStatus() === 'HOLDING') {
          const sellDto = position.onSignal(kSig);
          if (sellDto) {
            broker.submitOrder(sellDto);
          }
        }
      }
    },
    // onBar（仅求值周期）：跨日日结 / Next-Bar 撮合 / 持仓盯市 / 风控裁决
    async (bar: StrategyBar) => {
      evalBarCount += 1;
      const currentDateStr = formatShanghaiDateString(bar.timestamp);
      if (lastDateStr !== null && currentDateStr !== lastDateStr) {
        broker.settleDayClose(lastDateStr);
        if (lastEvalBar !== null) {
          position.onDayClose(lastEvalBar);
        }
      }
      lastDateStr = currentDateStr;

      const fills = broker.onBar(bar);
      for (const fill of fills) {
        position.onOrderFilled(fill);
      }
      position.onBar(bar);

      // 风控裁决器检查（仅当明确开启止损时生效）。注：drive 序为 push → onBar →
      // onSignal，同 Bar 上风控单先于信号单下达（旧循环相反）；两者皆为清仓卖单，
      // 经济结果等价，仅 entryReason 归因可能不同。
      const hasPendingOrderForArbiter = broker
        .getOpenOrders()
        .some((o) => o.securityCode === options.code);
      if (
        arbiter &&
        !hasPendingOrderForArbiter &&
        position.getStatus() === 'HOLDING'
      ) {
        const arbiterSellDto = arbiter.arbitrate({
          bar,
          position: position.getSnapshot(),
          availableCash: broker.getAccount().availableCash,
        });
        if (arbiterSellDto) {
          broker.submitOrder(arbiterSellDto);
        }
      }

      lastEvalBar = bar;
      if (evalBarCount % 500 === 0) {
        console.log(
          `📊 [Backtest] ${options.code} 步进游标: ${evalBarCount} 根求值 Bar (${bar.timestamp.toISOString().slice(0, 10)})`,
        );
      }
    },
    // onPushed：异步让渡事件循环，确保单线程 Node.js 维持 HTTP 响应流畅
    async () => {
      pushCount += 1;
      if (pushCount % 50 === 0) {
        await new Promise<void>((r) => setImmediate(r));
      }
    },
  );

  // 最后一根 Bar 的日终结算
  if (lastEvalBar !== null && lastDateStr !== null) {
    broker.settleDayClose(lastDateStr);
    position.onDayClose(lastEvalBar);
  }

  // 提取净值时序与平仓交易
  const navSeries = position.getNavHistory().map((n) => n.totalEquity);
  const closedTrades = position.getClosedTrades();

  // 基于 Rust Polars 计算量化绩效
  const performance = computePerformanceSummary(navSeries, closedTrades, {
    initialCash,
  });
  // 最长挫跌时期（连续 underwater 交易日数，Polars 向量化）
  const maxUnderwaterDuration = computeUnderwaterDuration(navSeries);

  // 极端压力测试联动
  let stressReport: any = undefined;
  if (options.runStressSuite) {
    const orchestrator = new StressTestingSuiteOrchestrator();
    const suiteReport = await orchestrator.execute({
      scenarios: [
        'CRASH_2015',
        'CIRCUIT_2016',
        'BEAR_2018',
        'SQUEEZE_2024',
        'PULSE_2024',
      ],
      runner: async (scenarioDef) => {
        const scenarioResult = await runUnifiedSimulationBacktest({
          code: options.code,
          period: options.period,
          startDate: scenarioDef.startDate,
          endDate: scenarioDef.endDate,
          mode: options.mode,
          pluginId: options.pluginId,
          strategyDefinitionId: options.strategyDefinitionId,
          enableStopLoss: options.enableStopLoss,
          initialCash,
          runStressSuite: false,
        });
        return {
          navSeries: scenarioResult.navSeries,
          trades: scenarioResult.closedTrades,
          initialCash,
        };
      },
    });

    stressReport = {
      overallRating: suiteReport.healthCard.overallRating,
      overallHealthScore: suiteReport.healthCard.overallHealthScore,
      hasBankruptcy: suiteReport.healthCard.hasBankruptcy,
      worstDailyReturn: suiteReport.healthCard.worstDailyReturn,
      totalLiquidityPenalty: suiteReport.healthCard.totalLiquidityPenalty,
      scenarioOutcomes: suiteReport.scenarioOutcomes.map((o) => ({
        scenarioId: o.scenario.id,
        scenarioName: o.scenario.name,
        riskGrade: o.survivalAssessment.riskGrade,
        maxDrawdown: o.metrics.maxDrawdown,
        sharpeRatio: o.metrics.sharpeRatio,
        liquidityPenaltyLoss: o.survivalAssessment.liquidityPenaltyLoss,
      })),
    };
  }

  if (
    !options.runStressSuite &&
    !options.mode &&
    !options.pluginId &&
    !options.strategyDefinitionId
  ) {
    backtestSignalsCache.set(cacheKey, collectedSignals);
  }

  return {
    signals: collectedSignals,
    kernel,
    navSeries,
    closedTrades,
    performance,
    maxUnderwaterDuration,
    stressReport,
    replay: replaySummary,
    ...(definitionVersionLabel ? { definitionVersionLabel } : {}),
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '';

  // 跨域预检
  if (req.method === 'OPTIONS') {
    res.writeHead(DEV_HTTP_STATUS.NO_CONTENT, DEV_CORS_HEADERS);
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
    const code = resolveSecurityCode(rawParams, DEFAULT_DEV_SECURITY_CODE);
    const period = resolvePeriod(rawParams.period, DEFAULT_DEV_PERIOD);
    const hasExplicitLimit =
      rawParams.limit !== undefined &&
      rawParams.limit !== null &&
      String(rawParams.limit).trim().length > 0;
    const limit = hasExplicitLimit
      ? Number(rawParams.limit)
      : rawParams.startDate
        ? Infinity
        : DEFAULT_DEV_KLINE_LIMIT;

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
      const sliced = Number.isFinite(limit)
        ? filteredKlines.slice(-limit)
        : filteredKlines;
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
    const code = resolveSecurityCode(
      parsedUrl.query,
      DEFAULT_DEV_SECURITY_CODE,
    );
    const period = resolvePeriod(parsedUrl.query.period, DEFAULT_DEV_PERIOD);
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
      const includeBsp = parsedUrl.query.includeBsp !== 'false';
      const commands = ChanVisualAdapter.convert(targetKlines, {
        includeBi: true,
        includeDuan: true,
        includeZhongshu: true,
        includeBsp,
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
      const code = resolveSecurityCode(body, DEFAULT_DEV_SECURITY_CODE);
      const period = resolvePeriod(body.period, DEFAULT_DEV_PERIOD);
      const filterFenxingContainment = Boolean(body.filterFenxingContainment);

      const fullKlines = loadCanonicalKlines({ code, period });
      const bars = fullKlines.map((k) => toStrategyBar(k, period));
      let flow = body.flow;
      let ruleSnapshot = body.ruleSnapshot;
      let windowBudget = body.windowBudget;
      const definitionId =
        body.definitionId ?? SIMULATION_LOCAL_FIXTURE_IDENTITY.definitionId;
      const versionId =
        body.versionId ?? SIMULATION_LOCAL_FIXTURE_IDENTITY.versionId;

      if (!flow && body.rule) {
        const compiled = compileStoredDefinitionVersion({
          kind: body.kind ?? 'decision_flow',
          rule: body.rule,
          signalKind: body.signalKind,
        });
        flow = compiled.flow;
        ruleSnapshot = compiled.ruleSnapshot;
        windowBudget = compiled.requiredBarCount;
      }
      flow ||= createEnhancedChanDecisionFlow();

      const session = new StrategySimulationSession(bars, {
        securityCode: code,
        period,
        startDate: body.startDate,
        endDate: body.endDate,
        filterFenxingContainment,
        definitionId,
        versionId,
        ruleSnapshot,
        windowBudget,
        flow,
      });

      // 初始化首帧 (cursor 0)，确保会话就绪且首帧在客户端连接前已同步可用
      if (session.totalBars > 0 && session.currentCursor < 0) {
        await session.stepNext();
      }

      // 容量防爆保护：超过最大活跃会话数时淘汰最旧会话
      if (activeSessions.size >= MAX_DEV_SESSIONS) {
        const oldestSessionId = activeSessions.keys().next().value;
        if (oldestSessionId) {
          console.log(
            `[SIMULATION] 会话达到容量上限 (${MAX_DEV_SESSIONS})，自动淘汰最旧会话: ${oldestSessionId}`,
          );
          activeSessions.get(oldestSessionId)?.destroy();
          activeSessions.delete(oldestSessionId);
          sessionStreamClients.delete(oldestSessionId);
        }
      }

      activeSessions.set(session.sessionId, session);
      sessionStreamClients.set(session.sessionId, new Set());
      console.log(
        `[SIMULATION] POST /v1/simulation/start sessionId=${session.sessionId} code=${code} period=${period}`,
      );

      // 绑定广播监听器：当会话产生新帧或状态变动时，向所有连接中的 SSE 客户端推送
      session.setListeners({
        onFrame: (frame) => {
          const clients = sessionStreamClients.get(session.sessionId);
          if (!clients || clients.size === 0) return;
          const payloadString = formatFramePayload(
            frame,
            session.startDate,
            session.currentStatus,
          );
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

      // 超时无活动自动清理
      setTimeout(() => {
        if (activeSessions.has(session.sessionId)) {
          activeSessions.get(session.sessionId)?.destroy();
          activeSessions.delete(session.sessionId);
          sessionStreamClients.delete(session.sessionId);
        }
      }, SESSION_INACTIVE_TTL_MS);

      sendJson(res, session.getSummary(), DEV_HTTP_STATUS.CREATED);
    } catch (err: any) {
      console.error(`[POST /v1/simulation/start] 错误:`, err.message);
      sendJson(
        res,
        { error: err.message },
        DEV_HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
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
    console.log(
      `[SIMULATION] GET /v1/simulation/stream sessionId=${sessionId} (clients: ${clients.size})`,
    );

    // 立即补发当前游标所在帧给该连接作为初始数据
    const currentFrame = session.getCurrentFrame();
    if (currentFrame) {
      try {
        res.write(
          `event: frame\ndata: ${formatFramePayload(currentFrame, session.startDate, session.currentStatus)}\n\n`,
        );
      } catch {}
    }
    // 立即发送当前会话状态事件，确保客户端准确同步播放/暂停态
    try {
      res.write(
        `event: status\ndata: ${JSON.stringify({ status: session.currentStatus })}\n\n`,
      );
    } catch {}

    // 心跳保活定时器（每 15 秒发送注释行），防止浏览器或代理在暂停空闲时挂起/断连
    const pingTimer = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(pingTimer);
      }
    }, SSE_HEARTBEAT_INTERVAL_MS);

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
        sendJson(
          res,
          { error: `Session not found: ${sessionId}` },
          DEV_HTTP_STATUS.NOT_FOUND,
        );
        return;
      }

      console.log(
        `[SIMULATION] POST /v1/simulation/control sessionId=${sessionId} action=${body.action} param=${body.param}`,
      );
      await session.control({
        action: body.action,
        param: body.param,
      });

      sendJson(res, session.getSummary());
    } catch (err: any) {
      console.error(`[POST /v1/simulation/control] 错误:`, err.message);
      sendJson(
        res,
        { error: err.message },
        DEV_HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
    return;
  }

  // 4.4 销毁仿真会话: POST /v1/simulation/stop
  if (pathname.endsWith('/v1/simulation/stop') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const sessionId = String(body.sessionId || '');
    console.log(`[SIMULATION] POST /v1/simulation/stop sessionId=${sessionId}`);
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
      const dump = session.dumpCurrentState();
      const currentFrame = session.getCurrentFrame();
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

        // 诊断快照轮转修剪：最多保留最近 MAX_SNAPSHOT_DUMP_FILES 份，防磁盘膨胀
        pruneDumpFiles(dumpDir, MAX_SNAPSHOT_DUMP_FILES);
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
    sendJson(res, [
      {
        id: 1,
        name: '纯原典缠论买卖点策略树',
        description:
          '100% 遵照标准缠论一/二/三类买卖点形态进出场，彻底移除所有外挂指标与硬止损止盈',
        kind: 'decision_flow',
        status: 'active',
        activeVersionNumber: 1,
        periods: [1, 5, 15, 30, 60, 1440],
        sources: ['qmt', 'tdx'],
      },
      {
        id: 2,
        name: '上证大盘宏观+纯缠论+牛熊左右侧战术联动策略树',
        description:
          '双频宏观状态机判定大周期牛熊，牛市顺势执行缠论形态主门禁与微观左右侧止盈战术，熊市执行双中枢背驰极限抄底与破位逃命清仓防守',
        kind: 'decision_flow',
        status: 'active',
        activeVersionNumber: 1,
        periods: [1, 5, 15, 30, 60, 1440],
        sources: ['qmt', 'tdx'],
      },
      {
        id: 3,
        name: '上证宏观+缠论+牛熊战术+量价共振与挤压突破全增强策略树',
        description:
          '在策略2基础上叠加私有战术增强：牛市缠论买点融合VPCI量价共振增强与通道挤压放量爆发买点，熊市极限背驰抄底与防守清仓',
        kind: 'decision_flow',
        status: 'active',
        activeVersionNumber: 1,
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
    const idMatch = pathname.match(/\/v1\/strategies\/(\d+)\/versions$/);
    const stratId = idMatch && idMatch[1] ? Number(idMatch[1]) : 1;
    if (stratId === 3) {
      sendJson(res, [
        {
          id: 3,
          strategyDefinitionId: 3,
          versionNumber: 1,
          signalKind: 'both',
          status: 'active',
          description:
            '上证宏观+缠论+牛熊战术+量价共振与挤压突破全增强决策流 (动态牛熊分流+量价突破增强)',
          config: { mode: 'full_resonance' },
          createdAt: new Date('2026-10-19').toISOString(),
        },
      ]);
    } else if (stratId === 2) {
      sendJson(res, [
        {
          id: 2,
          strategyDefinitionId: 2,
          versionNumber: 1,
          signalKind: 'both',
          status: 'active',
          description:
            '上证大盘宏观+纯缠论+牛熊左右侧战术联动决策流 (动态牛熊分流)',
          config: { mode: 'composite' },
          createdAt: new Date('2026-10-19').toISOString(),
        },
      ]);
    } else {
      sendJson(res, [
        {
          id: 1,
          strategyDefinitionId: 1,
          versionNumber: 1,
          signalKind: 'both',
          status: 'active',
          description: '纯原典缠论标准形态买卖点决策流 (无止损止盈)',
          config: {},
          createdAt: new Date('2026-09-01').toISOString(),
        },
      ]);
    }
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
      const symbol = resolveSecurityCode(body, DEFAULT_DEV_SECURITY_CODE);
      const period = resolvePeriod(body.period, DEFAULT_DEV_PERIOD);
      const source = body.source || DEFAULT_DEV_MARKET_SOURCE;
      const strategyDefinitionId =
        typeof body.strategyDefinitionId === 'number' ||
        typeof body.strategyDefinitionId === 'string'
          ? Number(body.strategyDefinitionId)
          : undefined;
      const mode =
        body.mode === 'single' ||
        body.mode === 'composite' ||
        body.mode === 'tactics' ||
        body.mode === 'full_resonance' ||
        body.mode === 'enhanced'
          ? body.mode
          : strategyDefinitionId === 3
            ? 'full_resonance'
            : strategyDefinitionId === 2
              ? 'composite'
              : undefined;
      const pluginId =
        typeof body.pluginId === 'string' ? body.pluginId : undefined;
      const startDate = body.startDate || '1996-12-16T00:00:00.000Z';
      const endDate = body.endDate || '2026-12-31T23:59:59.000Z';
      const initialCash = Number(body.initialCash) || 1_000_000;
      const runStressSuite =
        body.runStressSuite === true || body.runStressSuite === 'true';
      const enableStopLoss =
        body.enableStopLoss === true ||
        (body.enableStopLoss !== false &&
          (mode === 'composite' ||
            mode === 'full_resonance' ||
            mode === 'enhanced' ||
            strategyDefinitionId === 2 ||
            strategyDefinitionId === 3) &&
          body.disableStopLoss !== true &&
          body.noStopLoss !== true);

      // 统一走策略树仿真引擎计算
      const {
        signals,
        performance,
        stressReport,
        closedTrades,
        replay,
        maxUnderwaterDuration,
      } = await runUnifiedSimulationBacktest({
        code: symbol,
        period,
        mode,
        pluginId,
        strategyDefinitionId,
        startDate,
        endDate,
        initialCash,
        runStressSuite,
        enableStopLoss,
      });

      // 计算更细致的交易盈亏统计（区分 Profit Factor 获利因子 与 Payoff Ratio 单笔盈亏比）
      const winTrades = (closedTrades || []).filter(
        (t: any) => t.realizedPnl > 0,
      );
      const lossTrades = (closedTrades || []).filter(
        (t: any) => t.realizedPnl < 0,
      );
      const totalWinPnl = winTrades.reduce(
        (sum: number, t: any) => sum + t.realizedPnl,
        0,
      );
      const totalLossPnl = Math.abs(
        lossTrades.reduce((sum: number, t: any) => sum + t.realizedPnl, 0),
      );
      const avgWin = winTrades.length > 0 ? totalWinPnl / winTrades.length : 0;
      const avgLoss =
        lossTrades.length > 0 ? totalLossPnl / lossTrades.length : 0;
      const payoffRatio =
        avgLoss > 0 ? Math.round((avgWin / avgLoss) * 10000) / 10000 : 0;

      const strategyNameStr =
        strategyDefinitionId === 3 ||
        mode === 'full_resonance' ||
        mode === 'enhanced'
          ? '大盘+缠论+牛熊战术+量价挤压全增强策略'
          : strategyDefinitionId === 2 ||
              mode === 'composite' ||
              mode === 'tactics'
            ? '大盘+缠论+牛熊左右侧战术联动策略'
            : pluginId || '纯原典缠论策略';
      const newId =
        mockRuns.length > 0 ? Math.max(...mockRuns.map((r) => r.id)) + 1 : 1;
      const newRun: DevBacktestRun = {
        id: newId,
        strategyDefinitionId: strategyDefinitionId || 1,
        strategyName: `${symbol === '000001' ? '上证指数' : symbol} ${period === 1440 ? '日线' : period + 'm'} ${strategyNameStr}回测`,
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
          symbol,
          period,
          mode: mode ?? 'composite',
          pluginId,
          performance: {
            sharpeRatio: performance?.sharpeRatio ?? 0,
            totalReturnRatio: performance?.totalReturn ?? 0,
            annualizedReturnRatio: performance?.annualizedReturn ?? 0,
            maxDrawdown: performance?.maxDrawdown ?? 0,
            maxUnderwaterDuration: maxUnderwaterDuration ?? 0,
            winRate: performance?.winRate ?? 0,
            profitFactor: performance?.profitLossRatio ?? 0,
            payoffRatio,
            totalTrades: performance?.tradeCount ?? 0,
            winTradeCount: winTrades.length,
            lossTradeCount: lossTrades.length,
            totalWinPnl: Math.round(totalWinPnl * 100) / 100,
            totalLossPnl: Math.round(totalLossPnl * 100) / 100,
            avgWinPnl: Math.round(avgWin * 100) / 100,
            avgLossPnl: Math.round(avgLoss * 100) / 100,
            initialCash,
            endingEquity:
              performance?.totalReturn !== undefined
                ? Math.round(
                    initialCash * (1 + performance.totalReturn) * 100,
                  ) / 100
                : initialCash,
          },
          trades: closedTrades,
          stressReport,
          signalCount: signals.length,
          ...(replay
            ? {
                replay: {
                  prewarmStatus: replay.prewarmStatus,
                  prewarmActual: replay.prewarmActual,
                  barCount: replay.barCount,
                  publicBarCount: replay.publicBarCount,
                  perPeriodPrewarm: replay.perPeriodPrewarm,
                },
              }
            : {}),
          pollUrl: `/v1/strategy-backtests/${newRun.id}`,
          acceptedAt: newRun.createdAt,
        },
        200,
      );
    } catch (err: any) {
      console.error(`[POST /v1/strategy-backtests] 错误:`, err.message);
      if (err instanceof DevBacktestRequestError) {
        sendJson(res, { error: err.message, code: err.code }, err.statusCode);
      } else if (err instanceof StoredDefinitionCompileError) {
        sendJson(
          res,
          { error: err.message, code: err.code },
          DEV_HTTP_STATUS.UNPROCESSABLE_ENTITY,
        );
      } else if (err instanceof ReplaySeriesMissingError) {
        sendJson(
          res,
          { error: err.message, code: 'DATA_MISSING' },
          DEV_HTTP_STATUS.UNPROCESSABLE_ENTITY,
        );
      } else {
        sendJson(res, { error: err.message }, 500);
      }
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
        triggerTime: sig.triggerTime || sig.signalTime,
        pivotTime: sig.pivotTime || sig.signalTime,
        signalType: sig.signalType,
        confidence: sig.confidence,
        confidenceLevel: 'HIGH',
        decisionTrace: sig.decisionTrace,
        contextSnapshot: {
          type: sig.signalType,
          action: sig.isBuy ? 'BUY' : 'SELL',
          price: sig.triggerPrice,
          triggerPrice: sig.triggerPrice,
          pivotPrice: sig.pivotPrice ?? sig.triggerPrice,
          time: sig.signalTime,
          triggerTime: sig.triggerTime || sig.signalTime,
          pivotTime: sig.pivotTime || sig.signalTime,
          badgeText: sig.badgeText,
          signalTag: sig.badgeText,
          chanBsp: {
            type: sig.signalType,
            price: sig.pivotPrice ?? sig.triggerPrice,
            triggerPrice: sig.triggerPrice,
            pivotPrice: sig.pivotPrice ?? sig.triggerPrice,
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

// 会话级单测经 DEV_SERVER_AUTOSTART=false 复用本模块导出，不启动 HTTP 监听
if (process.env.DEV_SERVER_AUTOSTART !== 'false') {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `\n🚀 [Mist Dev Server] 本地开发服务已就绪: http://localhost:${PORT}`,
    );
    console.log(`已就绪契约:`);
    console.log(`  - POST /v1/indicators/k       (读取本地离线/快照行情)`);
    console.log(`  - POST /v1/chan/merge-k       (现算包含合并 K 线)`);
    console.log(
      `  - GET  /v1/visual/commands    (现算纯几何指令流，笔/段/中枢)`,
    );
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
        if (process.env.SKIP_DEV_PREHEAT === 'true') {
          console.log(
            `⏩ [预热] 检测到环境变量 SKIP_DEV_PREHEAT=true，跳过启动全量预热。`,
          );
          return;
        }
        console.log(`🔄 [预热] 正在后台基于策略树预热决策流回测数据...`);
        for (const run of mockRuns) {
          const symbol = run.targetUniverse[0] || '000001';
          const { signals } = await runUnifiedSimulationBacktest({
            code: symbol,
            period: run.period,
            startDate: run.startDate,
            endDate: run.endDate,
            enableStopLoss: false,
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
}

export { runUnifiedSimulationBacktest };
