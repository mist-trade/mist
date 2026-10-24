import type { QualitySegment } from './vendor-import';

/**
 * Numeric quality catalog for the `vendor_a` dataset (purchased 5-minute index
 * history, 2026-10-24 import).
 *
 * Rules applied here:
 * - A field is 0 only when its value cannot be used as delivered and cannot be
 *   corrected by a known constant factor.
 * - `caliber_epoch` changes when the provider's aggregation basis changes but
 *   the values stay valid inside each basis.
 * - 000001 before 2011-07-27 mixes fund volume into index volume (+7~19% volume,
 *   +0.8~2.7% amount): both quantities are marked unusable (conservative rule).
 * - 000300 has four days whose intraday high/low are wrong while open/close are
 *   correct: only high/low are invalidated.
 * - 399001 is a constituent-based caliber; it is internally consistent, so it
 *   stays valid (caliber differences are not validity errors).
 * - 399006 changes basis in 2017: valid on both sides, epoch split at 2017-01-01.
 * - 399673 in 2014 has volume ≈38.9x and amount ≈7.7x its later level with no
 *   constant correction factor: both quantities are unusable.
 */
export const VENDOR_A_QUALITY_PROFILES: Readonly<
  Record<string, readonly QualitySegment[]>
> = {
  '000001': [
    { from: '2005-01-04', to: '2011-07-26', volumeValid: 0, amountValid: 0 },
    { from: '2011-07-27', volumeValid: 1, amountValid: 1, caliberEpoch: 2 },
  ],
  '399001': [],
  '399006': [
    { from: '2010-06-01', caliberEpoch: 1 },
    { from: '2017-01-01', caliberEpoch: 2 },
  ],
  '000300': [
    { from: '2005-06-09', to: '2005-06-09', highValid: 0, lowValid: 0 },
    { from: '2006-08-07', to: '2006-08-07', highValid: 0, lowValid: 0 },
    { from: '2006-08-21', to: '2006-08-21', highValid: 0, lowValid: 0 },
    { from: '2006-09-18', to: '2006-09-18', highValid: 0, lowValid: 0 },
  ],
  '399673': [
    { from: '2014-06-18', to: '2014-12-31', volumeValid: 0, amountValid: 0 },
    { from: '2015-01-01', volumeValid: 1, amountValid: 1, caliberEpoch: 2 },
  ],
};
