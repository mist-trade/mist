import pl from 'nodejs-polars';

export interface BiSlopeUnitInput {
  readonly priceChange: number; // 价格变动量 P1 - P0
  readonly barCount: number; // 跨越 Bar 根数
}

export interface BiSlopeObservationResult {
  readonly currentVelocity: number;
  readonly currentSlope: number;
  readonly velocityRatio?: number;
  readonly slopeRatio?: number;
  readonly isMomentumExhausted: boolean;
}

export interface BiSlopeSeriesResult {
  readonly velocities: readonly number[];
  readonly slopes: readonly number[];
  readonly velocityRatios: readonly (number | undefined)[];
  readonly slopeRatios: readonly (number | undefined)[];
  readonly momentumExhausted: readonly boolean[];
}

/**
 * Computes slope and physical displacement velocity for a single observation
 * and compares against an optional prior same-direction unit for momentum exhaustion.
 */
export function computeBiSlopeObservation(
  current: BiSlopeUnitInput,
  prior?: BiSlopeUnitInput,
): BiSlopeObservationResult {
  const currentBars = Math.max(1, current.barCount);
  const currentSlope = current.priceChange / currentBars;
  const currentVelocity = Math.abs(current.priceChange) / currentBars;

  if (!prior) {
    return {
      currentVelocity,
      currentSlope,
      velocityRatio: undefined,
      slopeRatio: undefined,
      isMomentumExhausted: false,
    };
  }

  const priorBars = Math.max(1, prior.barCount);
  const priorSlope = prior.priceChange / priorBars;
  const priorVelocity = Math.abs(prior.priceChange) / priorBars;

  const isSameDirection =
    (currentSlope > 0 && priorSlope > 0) ||
    (currentSlope < 0 && priorSlope < 0);

  if (!isSameDirection || priorVelocity === 0) {
    return {
      currentVelocity,
      currentSlope,
      velocityRatio: undefined,
      slopeRatio: undefined,
      isMomentumExhausted: false,
    };
  }

  const velocityRatio = currentVelocity / priorVelocity;
  const slopeRatio = priorSlope !== 0 ? currentSlope / priorSlope : undefined;
  const isMomentumExhausted = velocityRatio < 0.65;

  return {
    currentVelocity,
    currentSlope,
    velocityRatio,
    slopeRatio,
    isMomentumExhausted,
  };
}

/**
 * Computes slope and velocity series across an array of trend units,
 * automatically tracking prior same-direction units for momentum exhaustion ratios.
 */
export function computeBiSlopeSeries(
  units: readonly BiSlopeUnitInput[],
): BiSlopeSeriesResult {
  if (units.length === 0) {
    return {
      velocities: [],
      slopes: [],
      velocityRatios: [],
      slopeRatios: [],
      momentumExhausted: [],
    };
  }

  const df = pl.DataFrame({
    pc: pl
      .Series(
        'pc',
        units.map((u) => u.priceChange),
      )
      .cast(pl.Float64),
    bc: pl
      .Series(
        'bc',
        units.map((u) => Math.max(1, u.barCount)),
      )
      .cast(pl.Float64),
  });

  const slopes = df
    .getColumn('pc')
    .div(df.getColumn('bc'))
    .toArray() as number[];
  const velocities = df
    .getColumn('pc')
    .abs()
    .div(df.getColumn('bc'))
    .toArray() as number[];

  const velocityRatios: (number | undefined)[] = new Array(units.length);
  const slopeRatios: (number | undefined)[] = new Array(units.length);
  const momentumExhausted: boolean[] = new Array(units.length);

  for (let i = 0; i < units.length; i++) {
    const sCurr = slopes[i];
    const vCurr = velocities[i];

    // Find the most recent prior unit with matching direction
    let priorIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      const sPrior = slopes[j];
      if ((sCurr > 0 && sPrior > 0) || (sCurr < 0 && sPrior < 0)) {
        priorIdx = j;
        break;
      }
    }

    if (priorIdx >= 0 && velocities[priorIdx] > 0) {
      const vRatio = vCurr / velocities[priorIdx];
      const sRatio =
        slopes[priorIdx] !== 0 ? sCurr / slopes[priorIdx] : undefined;
      velocityRatios[i] = vRatio;
      slopeRatios[i] = sRatio;
      momentumExhausted[i] = vRatio < 0.65;
    } else {
      velocityRatios[i] = undefined;
      slopeRatios[i] = undefined;
      momentumExhausted[i] = false;
    }
  }

  return {
    velocities,
    slopes,
    velocityRatios,
    slopeRatios,
    momentumExhausted,
  };
}
