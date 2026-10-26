import type { ProjectedStrategyBar, StrategyBar } from '@app/market-data';
import { getShanghaiHourAndMinute } from '@app/timezone';

/**
 * 多周期上下文的黑板键契约：`series.<period>`。
 * 内核在每次求值前为全部声明周期写入只读窗口快照；插件只读，禁止改写。
 */
export const SERIES_ATTRIBUTE_PREFIX = 'series.';

const LUNCH_TERMINAL_MINUTE = 11 * 60 + 30; // 11:30 终端桶
const CLOSE_TERMINAL_MINUTE = 15 * 60; // 15:00 终端桶（含收盘集合竞价）
const DAILY_AVAILABILITY_MINUTES = 15 * 60 + 1; // 日线末成分 = 15:00 终端桶 → 15:01 封存

export function contextSeriesKey(period: number): string {
  return `${SERIES_ATTRIBUTE_PREFIX}${period}`;
}

/**
 * 可用时刻（availability key）：bar 内容封存的时刻。
 *
 * 标签约定（2026-10-25 实测定案）：1m 左标、5/15/30/60m 右标、日线 00:00(D) 日期身份。
 * 裸标签跨周期比较不因果，统一换算成内容封存时刻：
 * - 1m：桶 [T, T+1min) → T+1min 封存；
 * - 5/15/30/60m 常规窗：右标即槽末；session 末根（11:30/15:00）随终端桶封存 → +1min；
 * - 1440：标签 00:00(D)，末成分 = D 日 15:00 终端桶 → D 日 15:01。
 */
export function availabilityKey(
  bar: Pick<StrategyBar, 'period' | 'timestamp'>,
): Date {
  const timestamp = bar.timestamp.getTime();
  if (bar.period === 1) {
    return new Date(timestamp + 60_000);
  }
  if (bar.period === 1440) {
    return new Date(timestamp + DAILY_AVAILABILITY_MINUTES * 60_000);
  }
  const { wallMinute } = getShanghaiHourAndMinute(bar.timestamp);
  if (
    wallMinute === LUNCH_TERMINAL_MINUTE ||
    wallMinute === CLOSE_TERMINAL_MINUTE
  ) {
    return new Date(timestamp + 60_000);
  }
  return new Date(timestamp);
}

/** 从共享黑板读取声明周期的只读窗口快照；未注入时返回 undefined。 */
export function readContextSeries(
  attributes: ReadonlyMap<string, unknown>,
  period: number,
): readonly ProjectedStrategyBar[] | undefined {
  const value = attributes.get(contextSeriesKey(period));
  if (value === undefined || value === null || !Array.isArray(value)) {
    return undefined;
  }
  return value as readonly ProjectedStrategyBar[];
}

/**
 * 插件读取了 plan 未声明的 context 周期。
 * 内核按 plan 捕获 → 跳过该次求值并记有界诊断；严禁降级为 NEUTRAL。
 */
export class MissingContextSeriesError extends Error {
  readonly code = 'MISSING_CONTEXT_SERIES';

  constructor(readonly period: number) {
    super(
      `context series for period ${period} is not declared on this evaluation plan`,
    );
    this.name = 'MissingContextSeriesError';
  }
}

export function isMissingContextSeriesError(
  error: unknown,
): error is MissingContextSeriesError {
  return (
    error instanceof Error &&
    ((error as { code?: unknown }).code === 'MISSING_CONTEXT_SERIES' ||
      error.name === 'MissingContextSeriesError')
  );
}
