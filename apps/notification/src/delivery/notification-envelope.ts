import {
  Security,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
} from '@app/shared-data';
import { formatShanghaiDateTimeString, MINUTES_PER_HOUR } from '@app/timezone';
import { PERIOD_MINUTES } from '@app/constants';

import { CHAN_BSP_UNITS, SIGNAL_KINDS, availabilityKey } from '@app/strategy';

export interface GroupedNotificationItem {
  readonly alertEvent: StrategyAlertEvent;
  readonly signal: StrategySignal | null;
  readonly security: Security | null;
  readonly strategyDefinition: StrategyDefinition | null;
}

/**
 * Channel-neutral grouped message built from persisted Signal/AlertEvent evidence
 * (V2, 2026-11-24 定稿，决策文档 7.1.4). The notification worker MUST NOT invoke
 * strategy computation; everything the channel needs is derived here from
 * already-committed evidence. Time is rendered in Asia/Shanghai (A-share market
 * local, UTC+8), not the process timezone.
 *
 * Format:
 * - one item: the legacy single-signal summary + an optional compact trace chain;
 * - several items: one header, then one line per signal — sells first, buys after,
 *   no netting; every line carries its own compact `decisionTrace.trace` chain.
 */
export function buildGroupedNotificationMessage(
  items: readonly GroupedNotificationItem[],
): string {
  if (items.length === 0) {
    return `[Mist] (empty delivery group)`;
  }
  if (items.length === 1) {
    return renderSingle(items[0]);
  }
  return renderGrouped(items);
}

function renderSingle(item: GroupedNotificationItem): string {
  const summary = buildLegacySummary(item);
  const chain = renderTraceChain(item.signal);
  return chain ? `${summary}\n链路：${chain}` : summary;
}

function renderGrouped(items: readonly GroupedNotificationItem[]): string {
  const first = items[0];
  const { securityCode, securityName } = securityOf(first);
  const header = `[Mist] ${securityCode}${securityName ? ` ${securityName}` : ''} | ${groupEffectiveTime(items)}`;
  const ordered = [...items].sort((a, b) => {
    const aSell = isSell(a.signal);
    const bSell = isSell(b.signal);
    if (aSell !== bSell) return aSell ? -1 : 1; // 卖出在前
    return (confidenceOf(b) ?? -1) - (confidenceOf(a) ?? -1);
  });
  const lines = ordered.map((item) => `- ${renderLine(item)}`);
  return [header, ...lines].join('\n');
}

function renderLine(item: GroupedNotificationItem): string {
  const { signal, strategyDefinition } = item;
  const ctx = (signal?.contextSnapshot ?? {}) as Record<string, unknown>;
  const direction = isSell(signal) ? '卖出' : '买入';
  const badge = directionLabel(signal?.signalKind, ctx, signal);
  const strategyName = strategyDefinition?.name ?? '';
  const periodLabel = signal ? formatPeriod(signal.period) : '';
  const price =
    typeof ctx.triggerPrice === 'number' ? ` @ ${ctx.triggerPrice}` : '';
  const confidence = confidenceOf(item);
  const conf =
    confidence !== null
      ? ` [${signal?.confidenceLevel ?? 'CONF'} ${confidence.toFixed(1)}%]`
      : '';
  const chain = renderTraceChain(signal);
  const parts = [
    [strategyName, periodLabel].filter(Boolean).join(' '),
    badge,
  ].filter(Boolean);
  const chainSeg = chain ? ` ｜ ${chain}` : '';
  return `${direction} ${parts.join(' ')}${price}${conf}${chainSeg}`;
}

function buildLegacySummary(item: GroupedNotificationItem): string {
  const { signal, strategyDefinition } = item;
  const ctx = (signal?.contextSnapshot ?? {}) as Record<string, unknown>;
  const { securityCode, securityName } = securityOf(item);
  const direction = directionLabel(signal?.signalKind, ctx, signal);
  const price =
    typeof ctx.triggerPrice === 'number' ? ` @ ${ctx.triggerPrice}` : '';
  const confidence = confidenceOf(item);
  const conf =
    confidence !== null
      ? ` [${signal?.confidenceLevel ?? 'CONF'} ${confidence.toFixed(1)}%]`
      : '';
  const strategyName = strategyDefinition?.name ?? '';
  const periodLabel = signal ? formatPeriod(signal.period) : '';
  const effectiveTime = signal
    ? formatShanghaiTime(
        availabilityKey({
          period: signal.period,
          timestamp: signal.signalTime,
        }),
      )
    : '';
  const seg = (...xs: string[]) => xs.filter(Boolean).join(' | ');
  const tail = seg(strategyName, periodLabel, effectiveTime);
  return `[Mist]${conf} ${securityCode}${securityName ? ` ${securityName}` : ''} ${direction}${price}${
    tail ? ` | ${tail}` : ''
  }`;
}

/** 紧凑 trace 链（2026-11-24 定稿）：每个节点 `短名 ✓`，' → ' 连接。
 *  节点短名取 trace.name，缺省回退 pluginId（剥 'plugin.' 前缀）；
 *  历史/异常行无 trace → 返回 null，消息回退无链格式。 */
export function renderTraceChain(signal: StrategySignal | null): string | null {
  const trace = (signal?.decisionTrace as any)?.trace;
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

function securityOf(item: GroupedNotificationItem): {
  securityCode: string;
  securityName: string;
} {
  return {
    securityCode:
      item.security?.code ??
      String(
        item.signal?.securityId ??
          item.alertEvent.strategySignalId ??
          item.alertEvent.id,
      ),
    securityName: item.security?.name ?? '',
  };
}

function isSell(signal: StrategySignal | null): boolean {
  return signal?.signalKind === SIGNAL_KINDS.EXIT;
}

function confidenceOf(item: GroupedNotificationItem): number | null {
  const { signal } = item;
  return signal?.confidence !== null && signal?.confidence !== undefined
    ? Number(signal.confidence)
    : null;
}

function groupEffectiveTime(items: readonly GroupedNotificationItem[]): string {
  const withSignal = items.find((item) => item.signal !== null);
  if (!withSignal?.signal) return '';
  return formatShanghaiTime(
    availabilityKey({
      period: withSignal.signal.period,
      timestamp: withSignal.signal.signalTime,
    }),
  );
}

function directionLabel(
  kind: unknown,
  ctx?: Record<string, unknown>,
  signal?: StrategySignal | null,
): string {
  const badgeText =
    (typeof ctx?.badgeText === 'string' && ctx.badgeText.length > 0
      ? ctx.badgeText
      : undefined) ??
    (typeof (signal as any)?.badgeText === 'string' &&
    (signal as any).badgeText.length > 0
      ? (signal as any).badgeText
      : undefined);
  if (badgeText) {
    return badgeText;
  }
  const chanBsp = ctx?.chanBsp as Record<string, unknown> | undefined;
  if (chanBsp && typeof chanBsp.type === 'string') {
    const unitLabel = chanBsp.units === CHAN_BSP_UNITS.DUAN ? '段级' : '笔级';
    return `${chanBsp.type} (${unitLabel})`;
  }
  if (kind === SIGNAL_KINDS.ENTRY) return '买入';
  if (kind === SIGNAL_KINDS.EXIT) return '卖出';
  return String(kind ?? 'signal');
}

function formatPeriod(period: unknown): string {
  if (typeof period !== 'number') return '';
  if (period >= PERIOD_MINUTES['1d'])
    return period % PERIOD_MINUTES['1d'] === 0 ? '日线' : `${period}m`;
  if (period >= MINUTES_PER_HOUR)
    return period % MINUTES_PER_HOUR === 0
      ? `${period / MINUTES_PER_HOUR}h`
      : `${period}m`;
  return `${period}m`;
}

function formatShanghaiTime(date: Date): string {
  return formatShanghaiDateTimeString(date);
}
