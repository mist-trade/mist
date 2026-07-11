import { Injectable } from '@nestjs/common';
import { ADX, ATR, MACD, RSI, SMA, Stochastic } from 'technicalindicators';

export type StrategyEvaluationBar = {
  security: {
    code: string;
    type: unknown;
  };
  source: string;
  period: number;
  timestamp: Date;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | bigint;
  amount: number | string;
};

export type StrategyEvaluationContext = {
  k: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
    timestamp: Date;
  };
  security: {
    code: string;
    type?: string;
  };
  indicator: {
    macd?: {
      macd: number;
      signal: number;
      histogram: number;
    };
    rsi14?: number;
    kdj?: {
      k: number;
      d: number;
      j: number;
    };
    adx14?: number;
    atr14?: number;
    ma13?: number;
    ma60?: number;
  };
};

@Injectable()
export class StrategyEvaluationContextBuilder {
  buildFromK(
    k: StrategyEvaluationBar,
    history: StrategyEvaluationBar[] = [k],
    lookbackBars?: number,
  ): StrategyEvaluationContext {
    const completedBars = this.selectCompletedBars(k, history, lookbackBars);

    return {
      k: {
        open: Number(k.open),
        high: Number(k.high),
        low: Number(k.low),
        close: Number(k.close),
        volume: Number(k.volume),
        amount: Number(k.amount),
        timestamp: k.timestamp,
      },
      security: {
        code: k.security.code,
        type: String(k.security.type),
      },
      indicator: this.calculateIndicators(completedBars),
    };
  }

  private selectCompletedBars(
    current: StrategyEvaluationBar,
    history: StrategyEvaluationBar[],
    lookbackBars?: number,
  ): StrategyEvaluationBar[] {
    const barsByTime = new Map<number, StrategyEvaluationBar>();
    for (const bar of [...history, current]) {
      if (
        bar.security.code !== current.security.code ||
        bar.period !== current.period ||
        bar.source !== current.source ||
        bar.timestamp > current.timestamp
      ) {
        continue;
      }
      barsByTime.set(bar.timestamp.getTime(), bar);
    }

    const completedBars = [...barsByTime.values()].sort(
      (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
    );
    if (lookbackBars === undefined) return completedBars;

    return completedBars.slice(-(lookbackBars + 1));
  }

  private calculateIndicators(
    bars: StrategyEvaluationBar[],
  ): StrategyEvaluationContext['indicator'] {
    const indicator: StrategyEvaluationContext['indicator'] = {};
    const close = bars.map((bar) => Number(bar.close));
    const high = bars.map((bar) => Number(bar.high));
    const low = bars.map((bar) => Number(bar.low));

    const macd = this.calculateMacd(close);
    if (macd) indicator.macd = macd;

    const rsi14 = this.lastNumber(RSI.calculate({ values: close, period: 14 }));
    if (rsi14 !== undefined) indicator.rsi14 = rsi14;

    const kdj = this.calculateKdj(high, low, close);
    if (kdj) indicator.kdj = kdj;

    const adx14 = this.lastNumber(
      ADX.calculate({ high, low, close, period: 14 }).map(
        (value) => (value as unknown as { adx?: unknown }).adx,
      ),
    );
    if (adx14 !== undefined) indicator.adx14 = adx14;

    const atr14 = this.lastNumber(
      ATR.calculate({ high, low, close, period: 14 }),
    );
    if (atr14 !== undefined) indicator.atr14 = atr14;

    const ma13 = this.lastNumber(SMA.calculate({ values: close, period: 13 }));
    if (ma13 !== undefined) indicator.ma13 = ma13;

    const ma60 = this.lastNumber(SMA.calculate({ values: close, period: 60 }));
    if (ma60 !== undefined) indicator.ma60 = ma60;

    return indicator;
  }

  private calculateMacd(
    close: number[],
  ): StrategyEvaluationContext['indicator']['macd'] | undefined {
    const values = MACD.calculate({
      values: close,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const value = values[values.length - 1];
    if (
      !value ||
      !this.isFiniteNumber(value.MACD) ||
      !this.isFiniteNumber(value.signal) ||
      !this.isFiniteNumber(value.histogram)
    ) {
      return undefined;
    }

    return {
      macd: value.MACD,
      signal: value.signal,
      histogram: value.histogram,
    };
  }

  private calculateKdj(
    high: number[],
    low: number[],
    close: number[],
  ): StrategyEvaluationContext['indicator']['kdj'] | undefined {
    const stochastic = Stochastic.calculate({
      high,
      low,
      close,
      period: 9,
      signalPeriod: 3,
    });
    const slowK = stochastic
      .filter((value) => this.isFiniteNumber(value.d))
      .map((value) => value.d);
    const d = SMA.calculate({ values: slowK, period: 3 });
    const k = slowK.slice(slowK.length - d.length);
    const kValue = this.lastNumber(k);
    const dValue = this.lastNumber(d);
    if (kValue === undefined || dValue === undefined) return undefined;

    return {
      k: kValue,
      d: dValue,
      j: 3 * kValue - 2 * dValue,
    };
  }

  private lastNumber(values: unknown[]): number | undefined {
    const value = values[values.length - 1];
    return this.isFiniteNumber(value) ? value : undefined;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}
