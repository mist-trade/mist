import type {
  StrategyBar,
  StrategyReplayMarketDataPort,
  StrategyReplayPage,
  StrategyReplayPageCriteria,
  StrategyReplayWindow,
  StrategyReplayWindowCriteria,
} from '@app/market-data';

/** 本地/测试 replay port 的缺省分页大小（drive 翻页粒度）。 */
export const DEFAULT_REPLAY_PAGE_SIZE = 2000;

/**
 * 有界数据缺失错误：声明的周期没有任何可回放 bar。
 * fail-closed —— 严禁静默空窗求值。
 */
export class ReplaySeriesMissingError extends Error {
  constructor(
    public readonly missingPeriods: readonly number[],
    message: string,
  ) {
    super(message);
    this.name = 'ReplaySeriesMissingError';
  }
}

export interface InMemoryReplayPortOptions {
  readonly securityId: number;
  readonly securityCode?: string;
  /** period → 升序 StrategyBar 序列（构造方负责过滤与映射，port 只做窗口/分页） */
  readonly series: ReadonlyMap<number, readonly StrategyBar[]>;
  readonly pageSize?: number;
}

function periodName(period: number): string {
  if (period === 1440) return '1d';
  return `${period}m`;
}

/**
 * 纯内存 `StrategyReplayMarketDataPort`（回测/推演 lane 的本地与测试适配器）：
 *
 * - `loadReplayWindow`：`endAt` 严格小于截取（canonical 契约）后取最近
 *   `requiredBars` 根；
 * - `readReplayPage`：`afterTimestamp` 严格大于翻页（不重复返回上一页末根），
 *   否则 `startAt` 起步；`nextAfterTimestamp = null` 表示该周期已耗尽；
 * - 构造时校验：声明周期序列缺失/为空 → `ReplaySeriesMissingError`；
 *   时间戳非严格递增 → 抛错（上游数据必须保序）。
 *
 * 严禁在此实现跨周期归并或可用时刻计算——归并统一由 `HistoricalBarSource`
 * 驱动（三链路同构的唯一排序基础）。
 */
export class InMemoryReplayPort implements StrategyReplayMarketDataPort {
  private readonly series: ReadonlyMap<number, readonly StrategyBar[]>;
  private readonly pageSize: number;

  constructor(options: InMemoryReplayPortOptions) {
    this.series = options.series;
    this.pageSize = options.pageSize ?? DEFAULT_REPLAY_PAGE_SIZE;

    const missing: number[] = [];
    for (const [period, bars] of this.series) {
      if (!Array.isArray(bars) || bars.length === 0) {
        missing.push(period);
        continue;
      }
      for (let i = 1; i < bars.length; i++) {
        if (bars[i].timestamp.getTime() <= bars[i - 1].timestamp.getTime()) {
          throw new ReplaySeriesMissingError(
            [],
            `in-memory replay series for period ${period} is not strictly ascending at index ${i}`,
          );
        }
      }
    }
    if (missing.length > 0) {
      const names = missing.map(periodName).join(',');
      throw new ReplaySeriesMissingError(
        missing,
        `in-memory replay series is empty for periods: ${missing.join(',')} — ` +
          `sync local data first (e.g. pnpm dev:sync --code ${options.securityCode ?? '<code>'} --periods ${names})`,
      );
    }
  }

  public async loadReplayWindow(
    criteria: StrategyReplayWindowCriteria,
  ): Promise<StrategyReplayWindow> {
    const bars = this.series.get(criteria.period) ?? [];
    const endMs = criteria.endAt.getTime();
    let windowEnd = bars.length;
    while (windowEnd > 0 && bars[windowEnd - 1].timestamp.getTime() >= endMs) {
      windowEnd -= 1;
    }
    const start = Math.max(0, windowEnd - criteria.requiredBars);
    return { bars: bars.slice(start, windowEnd) };
  }

  public async readReplayPage(
    criteria: StrategyReplayPageCriteria,
  ): Promise<StrategyReplayPage> {
    const bars = this.series.get(criteria.period) ?? [];
    const afterMs = criteria.afterTimestamp?.getTime() ?? null;
    const startMs = criteria.startAt.getTime();
    const endMs = criteria.endAt.getTime();

    // 二分定位下界：afterTimestamp 严格大于，否则 startAt 起步（含）。
    let lo = 0;
    if (afterMs !== null) {
      lo = this.lowerBound(bars, afterMs, /* exclusive */ true);
    } else {
      lo = this.lowerBound(bars, startMs, /* exclusive */ false);
    }

    const page: StrategyBar[] = [];
    for (let i = lo; i < bars.length && page.length < this.pageSize; i++) {
      const ts = bars[i].timestamp.getTime();
      if (ts > endMs) break;
      page.push(bars[i]);
    }

    // 仅当本页满页且区间内仍有剩余行时才继续翻页；否则视为耗尽
    //（drive 拿到 null 即标记 exhausted，杜绝空翻页）。
    const nextIndex = lo + page.length;
    let nextAfterTimestamp: Date | null = null;
    if (
      page.length === this.pageSize &&
      page.length > 0 &&
      nextIndex < bars.length &&
      bars[nextIndex].timestamp.getTime() <= endMs
    ) {
      nextAfterTimestamp = page[page.length - 1].timestamp;
    }

    return { bars: page, nextAfterTimestamp };
  }

  /** 首个满足 `ts > bound`（exclusive）或 `ts >= bound`（inclusive）的下标。 */
  private lowerBound(
    bars: readonly StrategyBar[],
    boundMs: number,
    exclusive: boolean,
  ): number {
    let lo = 0;
    let hi = bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const ts = bars[mid].timestamp.getTime();
      if (exclusive ? ts <= boundMs : ts < boundMs) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}
