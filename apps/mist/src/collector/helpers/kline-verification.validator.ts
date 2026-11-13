import { Injectable } from '@nestjs/common';
import { Period, Security, SecurityStatus } from '@app/shared-data';

export interface BarData {
  timestamp: Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

export interface VerificationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class KlineVerificationValidator {
  /**
   * Level 1: 单 Bar 几何因果律校验
   */
  public verifyGeometry(bars: BarData[]): VerificationResult {
    const errors: string[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const ts =
        b.timestamp instanceof Date
          ? b.timestamp.toISOString()
          : String(b.timestamp);

      if (b.open <= 0 || b.high <= 0 || b.low <= 0 || b.close <= 0) {
        errors.push(
          `Bar ${i} (${ts}) price non-positive: open=${b.open}, high=${b.high}, low=${b.low}, close=${b.close}`,
        );
      }
      if (b.high < b.low) {
        errors.push(
          `Bar ${i} (${ts}) high < low: high=${b.high}, low=${b.low}`,
        );
      }
      if (b.high < Math.max(b.open, b.close)) {
        errors.push(
          `Bar ${i} (${ts}) high < max(open, close): high=${b.high}, open=${b.open}, close=${b.close}`,
        );
      }
      if (b.low > Math.min(b.open, b.close)) {
        errors.push(
          `Bar ${i} (${ts}) low > min(open, close): low=${b.low}, open=${b.open}, close=${b.close}`,
        );
      }
      if (b.volume < 0) {
        errors.push(`Bar ${i} (${ts}) volume < 0: volume=${b.volume}`);
      }
    }
    return {
      passed: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Level 2: 条数满格与时间严格单调性校验
   */
  public verifyMonotonicityAndCount(
    bars: BarData[],
    period: Period,
    expectedCount?: number,
  ): VerificationResult {
    const errors: string[] = [];
    // 1. 单调性
    for (let i = 1; i < bars.length; i++) {
      const prevTs =
        bars[i - 1].timestamp instanceof Date
          ? (bars[i - 1].timestamp as Date).getTime()
          : Number(bars[i - 1].timestamp);
      const currTs =
        bars[i].timestamp instanceof Date
          ? (bars[i].timestamp as Date).getTime()
          : Number(bars[i].timestamp);
      if (currTs <= prevTs) {
        errors.push(
          `Non-monotonic timestamps at index ${i}: current=${currTs} <= previous=${prevTs}`,
        );
      }
    }

    // 2. 满格条数校验（若传入期望满格数量）
    if (expectedCount !== undefined && bars.length !== expectedCount) {
      errors.push(
        `Bar count mismatch for period ${period}: expected ${expectedCount}, got ${bars.length}`,
      );
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Level 3: 跨周期三维对账校验（日K vs 48根5m K线）
   */
  public verifyCrossPeriodConsistency(
    dayBar: BarData,
    fiveMinBars: BarData[],
  ): VerificationResult {
    const errors: string[] = [];
    if (fiveMinBars.length === 0) {
      errors.push('Cannot verify cross-period consistency with empty 5m bars');
      return { passed: false, errors, warnings: [] };
    }

    const first5m = fiveMinBars[0];
    const last5m = fiveMinBars[fiveMinBars.length - 1];

    let maxHigh = -Infinity;
    let minLow = Infinity;
    let sumVolume = 0;

    for (const b of fiveMinBars) {
      if (b.high > maxHigh) maxHigh = b.high;
      if (b.low < minLow) minLow = b.low;
      sumVolume += b.volume;
    }

    const EPSILON = 1e-4;

    if (Math.abs(dayBar.open - first5m.open) > EPSILON) {
      errors.push(
        `Cross-period open mismatch: day.open=${dayBar.open}, first_5m.open=${first5m.open}`,
      );
    }
    if (Math.abs(dayBar.close - last5m.close) > EPSILON) {
      errors.push(
        `Cross-period close mismatch: day.close=${dayBar.close}, last_5m.close=${last5m.close}`,
      );
    }
    if (Math.abs(dayBar.high - maxHigh) > EPSILON) {
      errors.push(
        `Cross-period high mismatch: day.high=${dayBar.high}, 5m.maxHigh=${maxHigh}`,
      );
    }
    if (Math.abs(dayBar.low - minLow) > EPSILON) {
      errors.push(
        `Cross-period low mismatch: day.low=${dayBar.low}, 5m.minLow=${minLow}`,
      );
    }
    // 成交量在保留精度的浮点累计下允许极微小量差
    if (Math.abs(dayBar.volume - sumVolume) > 1.0) {
      errors.push(
        `Cross-period volume mismatch: day.volume=${dayBar.volume}, 5m.sumVolume=${sumVolume}`,
      );
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Level 4: 停牌免死判定
   */
  public isSuspendedExempt(security: Security, barCount: number): boolean {
    if (barCount === 0 && security.status === SecurityStatus.SUSPENDED) {
      return true;
    }
    return false;
  }
}
