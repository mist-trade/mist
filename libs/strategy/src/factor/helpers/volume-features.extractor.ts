import {
  computeBollingerBandsSeries,
  computeKeltnerChannelsSeries,
  computeAtrObservation,
  computeTsRankObservation,
  computeVolumeObservation,
  computeVwapObservation,
  computeRppObservation,
  computeVpciObservation,
} from '@app/indicators';

export interface VolumeFeaturesAttribute {
  readonly isSqueezeOn: boolean;
  readonly isSqueezeFired: boolean;
  readonly bbBandwidth: number;
  readonly atr: number;
  readonly volumeTsRank: number;
  readonly volumeRatio: number;
  readonly close: number;
  readonly open: number;
  readonly deltaPrice: number;
  readonly vwap: number;
  readonly rpp: number;
  readonly vpci: number;
  readonly vpciSignal: number;
  readonly vpc: number;
  readonly vpr: number;
}

const MIN_BARS_FOR_FEATURES = 30;
const BB_PERIOD = 20;
const BB_MULTIPLIER = 2.0;
const KC_PERIOD = 20;
const KC_MULTIPLIER = 1.5;
const TS_RANK_PERIOD = 20;
const RPP_PERIOD = 20;
const ATR_PERIOD = 14;
const VPCI_SHORT = 5;
const VPCI_LONG = 20;
const VPCI_SIGNAL = 10;

interface ExtractedBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount: number | null;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseBar(item: unknown): ExtractedBar | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  // 1. Direct StrategyBarMinimal style
  if (
    typeof obj.close === 'number' &&
    typeof obj.open === 'number' &&
    typeof obj.high === 'number' &&
    typeof obj.low === 'number' &&
    typeof obj.volume === 'number'
  ) {
    return {
      open: obj.open,
      high: obj.high,
      low: obj.low,
      close: obj.close,
      volume: obj.volume,
      amount: toFiniteNumberOrNull(obj.amount),
    };
  }

  // 2. ProjectedStrategyBar style
  if (obj.ohlc && typeof obj.ohlc === 'object') {
    const ohlc = obj.ohlc as Record<string, unknown>;
    const eff = (ohlc.effective ?? ohlc.raw) as
      | Record<string, unknown>
      | undefined;
    const volObj = obj.volume as Record<string, unknown> | undefined;
    const rawVol =
      volObj?.effective ?? volObj?.raw ?? (obj.rawBar as any)?.volume;
    const vol = typeof rawVol === 'number' ? rawVol : Number(rawVol) || 0;
    const amountObj = obj.amount as Record<string, unknown> | undefined;
    const rawAmount =
      amountObj?.effective ??
      amountObj?.raw ??
      (obj.rawBar as any)?.amount ??
      (typeof obj.amount === 'number' || typeof obj.amount === 'string'
        ? obj.amount
        : undefined);

    if (
      eff &&
      typeof eff.close === 'number' &&
      typeof eff.open === 'number' &&
      typeof eff.high === 'number' &&
      typeof eff.low === 'number'
    ) {
      return {
        open: eff.open,
        high: eff.high,
        low: eff.low,
        close: eff.close,
        volume: vol,
        amount: toFiniteNumberOrNull(rawAmount),
      };
    }
  }

  // 3. rawBar fallback
  if (obj.rawBar && typeof obj.rawBar === 'object') {
    const raw = obj.rawBar as Record<string, unknown>;
    if (
      typeof raw.close === 'number' &&
      typeof raw.open === 'number' &&
      typeof raw.high === 'number' &&
      typeof raw.low === 'number'
    ) {
      const vol =
        typeof raw.volume === 'number' ? raw.volume : Number(raw.volume) || 0;
      return {
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: vol,
        amount: toFiniteNumberOrNull(raw.amount),
      };
    }
  }

  return null;
}

/**
 * 向量化特征提取器：将行情 Bar 转换为标准化的 VolumeFeaturesAttribute
 */
export function extractVolumeFeatures(
  bars: readonly unknown[],
): VolumeFeaturesAttribute | undefined {
  if (!bars || bars.length < MIN_BARS_FOR_FEATURES) {
    return undefined;
  }

  // 截取最近 50 根 Bar 进行特征提取，确保所有指标（最大长周期 20）充分收敛且大幅提升计算吞吐
  const inputBars = bars.length > 50 ? bars.slice(-50) : bars;

  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];
  const amounts: (number | null)[] = [];

  for (const b of inputBars) {
    const parsed = parseBar(b);
    if (!parsed) continue;
    opens.push(parsed.open);
    highs.push(parsed.high);
    lows.push(parsed.low);
    closes.push(parsed.close);
    volumes.push(parsed.volume);
    amounts.push(parsed.amount);
  }

  const total = closes.length;
  if (total < MIN_BARS_FOR_FEATURES) {
    return undefined;
  }

  // Fail-closed: the exact amount-weighted VWAP requires a usable amount series over the
  // whole window. Missing / non-finite amounts, or a non-positive amount sum (e.g. the
  // known all-zero QMT historical amount), suppress the whole feature bundle instead of
  // silently mixing口径 or zero-filling — plugins observe the absence via the existing
  // insufficient/degraded path.
  const amountUsable =
    amounts.length === closes.length &&
    amounts.every((a): a is number => a !== null && Number.isFinite(a)) &&
    amounts.reduce((sum, a) => sum + (a as number), 0) > 0;
  if (!amountUsable) {
    return undefined;
  }
  const amountArr = amounts as number[];

  // 1. Squeeze State Computation (Bollinger Bands vs Keltner Channels)
  const bbSeries = computeBollingerBandsSeries(closes, {
    period: BB_PERIOD,
    stdDevMultiplier: BB_MULTIPLIER,
  });
  const kcSeries = computeKeltnerChannelsSeries(highs, lows, closes, {
    period: KC_PERIOD,
    atrMultiplier: KC_MULTIPLIER,
  });

  // Align index: bb.begIndex = 19, kc.begIndex = 20
  // For bar index i in closes:
  // bb idx = i - bb.begIndex
  // kc idx = i - kc.begIndex
  const checkSqueezeAtBar = (barIdx: number): boolean => {
    const bbIdx = barIdx - bbSeries.begIndex;
    const kcIdx = barIdx - kcSeries.begIndex;
    if (bbIdx < 0 || kcIdx < 0) return false;
    return (
      bbSeries.upper[bbIdx] < kcSeries.upper[kcIdx] &&
      bbSeries.lower[bbIdx] > kcSeries.lower[kcIdx]
    );
  };

  const isCurrentSqueezeOn = checkSqueezeAtBar(total - 1);
  const wasPrevSqueezeOn = checkSqueezeAtBar(total - 2);
  const isSqueezeFired = wasPrevSqueezeOn && !isCurrentSqueezeOn;

  const bbBwLen = bbSeries.bandwidth.length;
  const bbBandwidth = bbBwLen > 0 ? bbSeries.bandwidth[bbBwLen - 1] : 0;

  // 2. Observations
  const atrObs = computeAtrObservation(highs, lows, closes, ATR_PERIOD);
  const tsRankObs = computeTsRankObservation(volumes, TS_RANK_PERIOD);
  const volObs = computeVolumeObservation(volumes, { periods: [5, 10, 20] });
  const vwapObs = computeVwapObservation(closes, volumes, {
    amounts: amountArr,
  });
  const rppObs = computeRppObservation(highs, lows, closes, RPP_PERIOD);
  const vpciObs = computeVpciObservation(closes, volumes, {
    shortPeriod: VPCI_SHORT,
    longPeriod: VPCI_LONG,
    signalPeriod: VPCI_SIGNAL,
  });

  const latestClose = closes[total - 1];
  const latestOpen = opens[total - 1];

  return {
    isSqueezeOn: isCurrentSqueezeOn,
    isSqueezeFired,
    bbBandwidth,
    atr: atrObs.atr,
    volumeTsRank: tsRankObs,
    volumeRatio: volObs.volumeRatio,
    close: latestClose,
    open: latestOpen,
    deltaPrice: latestClose - latestOpen,
    vwap: vwapObs.vwap,
    rpp: rppObs.rpp,
    vpci: vpciObs.vpci,
    vpciSignal: vpciObs.signalLine,
    vpc: vpciObs.vpc,
    vpr: vpciObs.vpr,
  };
}
