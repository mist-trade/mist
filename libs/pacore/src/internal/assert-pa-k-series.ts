import { PaK } from '../contracts';
import { InvalidSeriesError } from '../errors';

export function assertPaKSeries(series: readonly PaK[]): void {
  if (!series || series.length === 0) {
    throw new InvalidSeriesError('K-line series must not be empty.');
  }

  for (let i = 0; i < series.length; i++) {
    const k = series[i];
    if (k.high < k.low) {
      throw new InvalidSeriesError(
        `Invalid high/low bounds at index ${i}: high (${k.high}) < low (${k.low}).`,
      );
    }

    if (
      Number.isNaN(k.open) ||
      Number.isNaN(k.high) ||
      Number.isNaN(k.low) ||
      Number.isNaN(k.close) ||
      !Number.isFinite(k.open) ||
      !Number.isFinite(k.high) ||
      !Number.isFinite(k.low) ||
      !Number.isFinite(k.close)
    ) {
      throw new InvalidSeriesError(`Non-finite price found at index ${i}.`);
    }

    if (i > 0) {
      const prev = series[i - 1];
      if (k.time.getTime() <= prev.time.getTime()) {
        throw new InvalidSeriesError(
          `Timestamps must be strictly monotonic at index ${i}: ${k.time.toISOString()} <= ${prev.time.toISOString()}.`,
        );
      }
    }
  }
}
