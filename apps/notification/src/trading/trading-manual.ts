/**
 * 交易手册渲染（REQ-MSG-01..03，design 第六节）：交易层产出的最终投递内容。
 * 信号列表渲染（notification-envelope）退役——渲染权归交易层报告模块。
 * 时间以 Asia/Shanghai 渲染（A 股本地时区）。
 */
import { formatShanghaiDateTimeString, MINUTES_PER_HOUR } from '@app/timezone';
import { liToYuan } from '@app/strategy';
import type { TradingDecision } from '@app/strategy';
import { SIGNAL_KINDS } from '@app/strategy';
import { PERIOD_MINUTES } from '@app/constants';
import type { StrategySignal } from '@app/shared-data';

/**
 * 紧凑 trace 链（2026-11-24 定稿）：每个节点 `短名 ✓`，' → ' 连接。
 * 节点短名取 trace.name，缺省回退 pluginId（剥 'plugin.' 前缀）；
 * 历史/异常行无 trace → 返回 null，消息回退无链格式。
 * （自 notification-envelope 迁入交易层报告模块，任务 3.2。）
 */
export function renderTraceChain(signal: StrategySignal | null): string | null {
  const trace = (
    signal?.decisionTrace as Record<string, unknown> | null | undefined
  )?.trace as unknown;
  if (!Array.isArray(trace) || trace.length === 0) return null;
  const segments: string[] = [];
  for (const item of trace) {
    if (!item || typeof item !== 'object') continue;
    const rawName =
      typeof item.name === 'string' && item.name.length > 0
        ? item.name
        : typeof item.pluginId === 'string'
          ? item.pluginId.replace(/^plugin\./, '')
          : null;
    if (!rawName) continue;
    segments.push(`${rawName} ✓`);
  }
  return segments.length > 0 ? segments.join(' → ') : null;
}

export interface TradingManualInput {
  readonly securityCode: string;
  readonly securityName: string;
  readonly effectiveTime: Date;
  readonly decision: TradingDecision;
}

export function buildTradingManual(input: TradingManualInput): string {
  const { decision } = input;
  const header = buildHeader(input);
  const lines = [
    ...decision.instructions.map((i) => renderInstruction(i)),
    ...decision.rejections.map((r) => renderRejection(r)),
  ];
  return [header, ...lines].join('\n');
}

function buildHeader(input: TradingManualInput): string {
  const { decision } = input;
  const name = input.securityName ? ` ${input.securityName}` : '';
  const cash = formatYuan(decision.accountAfter.cashLi);
  const holding = [...decision.accountAfter.positions.values()][0];
  const holdingSeg = holding
    ? ` / 持仓 ${holding.holdingQuantity.toLocaleString('en-US')}股 @ ${liToYuan(holding.costPriceLi).toFixed(2)}`
    : ' / 空仓';
  return `[Mist 交易手册] ${input.securityCode}${name} | ${formatShanghaiDateTimeString(input.effectiveTime)} ｜ 账户 可用 ${cash}${holdingSeg}`;
}

function renderInstruction(i: TradingDecision['instructions'][number]): string {
  const direction = i.action === 'SELL' ? '卖出' : '买入';
  const strategyName = i.attribution.strategyName || '';
  const periodLabel = i.attribution.periodLabel || '';
  const conf =
    i.attribution.confidence !== undefined
      ? ` [${i.attribution.confidenceLevel ?? 'CONF'} ${i.attribution.confidence.toFixed(1)}%]`
      : '';
  const seg = [strategyName, periodLabel, i.reason].filter(Boolean).join(' ');
  const chain = i.attribution.traceChain
    ? `\n    ${i.attribution.traceChain}`
    : '';
  return `▶ ${direction} ${i.quantity.toLocaleString('en-US')}股 @ ${i.referencePrice.toFixed(2)} ≈ ${formatYuan(i.estimatedValueLi)} ｜ ${seg}${conf}${chain}`;
}

function renderRejection(r: TradingDecision['rejections'][number]): string {
  const signal = r.signal;
  const direction =
    signal.signal.signalKind === SIGNAL_KINDS.EXIT ? '卖出' : '买入';
  const strategyName = signal.attribution.strategyName || '';
  const periodLabel = signal.attribution.periodLabel || '';
  const conf =
    signal.attribution.confidence !== undefined
      ? ` [${signal.attribution.confidenceLevel ?? 'CONF'} ${signal.attribution.confidence.toFixed(1)}%]`
      : '';
  const seg = [strategyName, periodLabel, signal.signal.signalType]
    .filter(Boolean)
    .join(' ');
  const chain = signal.attribution.traceChain
    ? ` ｜ ${signal.attribution.traceChain}`
    : '';
  return `✗ ${direction}已拒绝：${r.reason}（${r.detail}）｜ ${seg}${conf}${chain}`;
}

/** 厘 → 元展示（整数省小数；非整数保留至厘位）。 */
function formatYuan(li: bigint): string {
  const yuan = liToYuan(li);
  const rounded = Math.round(yuan * 1000) / 1000;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const [intPart, decimalPart] = text.split('.');
  const withCommas = Number(intPart).toLocaleString('en-US');
  return decimalPart ? `${withCommas}.${decimalPart}` : withCommas;
}

/** 周期标签（自 notification-envelope 迁入）。 */
export function formatPeriod(period: unknown): string {
  if (typeof period !== 'number') return '';
  if (period >= PERIOD_MINUTES['1d'])
    return period % PERIOD_MINUTES['1d'] === 0 ? '日线' : `${period}m`;
  if (period >= MINUTES_PER_HOUR)
    return period % MINUTES_PER_HOUR === 0
      ? `${period / MINUTES_PER_HOUR}h`
      : `${period}m`;
  return `${period}m`;
}
