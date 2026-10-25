export { KPriceProjector } from './k-price-projector';
export type { StrategyPriceInput } from './k-price-projector';
export {
  VENDOR_CSV_COLUMNS,
  VendorImportError,
  aggregateSessionThirtyMinute,
  assertVendorSeries,
  buildVendorImport,
  parseVendorCsv,
  resolveQuality,
} from './vendor-import/vendor-import';
export type {
  BarQuality,
  BuildVendorImportOptions,
  QualitySegment,
  ValidityFlag,
  VendorCsvRow,
  VendorImportBundle,
  VendorKRow,
  VendorQualityRow,
  VendorSeriesValidationOptions,
} from './vendor-import/vendor-import';
export { VENDOR_A_QUALITY_PROFILES } from './vendor-import/vendor-a-quality-profiles';
export {
  mapKToStrategyBar,
  assertOhlcTopology,
  createCanonicalStrategyBar,
} from './k-strategy-bar-mapper';
export type { CanonicalStrategyBarInput } from './k-strategy-bar-mapper';
export type {
  StrategyBar,
  StrategyBarType,
  StrategyHistorySource,
  StrategyMarketSource,
  StrategyRealtimeSource,
} from './strategy-bar';
export type {
  StrategyMarketDataPort,
  StrategyMarketObservation,
  StrategyRealtimeMarketDataPort,
  StrategyRealtimeWindow,
  StrategyRealtimeWindowCriteria,
  StrategyReplayMarketDataPort,
  ReplayDataSelection,
  StrategyReplayPage,
  StrategyReplayPageCriteria,
  StrategyReplayWindow,
  StrategyReplayWindowCriteria,
  StrategyTrigger,
} from './strategy-market-data.port';
export {
  imputeSeries,
  StrategySeriesImputer,
} from './projection/strategy-series-imputer';
export type {
  ProjectedStrategyBar,
  ProjectedStrategyOhlc,
  ProjectedStrategyQuantity,
  StrategyImputationResolution,
  StrategyOhlcTuple,
} from './projection/strategy-series-imputer';
export { prepareMarketData } from './market-data-pipeline';
export type {
  MarketDataPipelineInput,
  MarketDataPipelineOutput,
  MarketDataPipelineDiagnostics,
} from './market-data-pipeline';
export {
  calculatePriceLimits,
  getPriceLimitRatio,
  isChiNextOrStarMarket,
  isEtfSecurity,
  isBseMarket,
  isStSecurity,
  isOneWordLimitUp,
  isOneWordLimitDown,
  ETF_SECURITY_PATTERN,
  CHINEXT_STAR_SECURITY_PATTERN,
  BSE_SECURITY_PATTERN,
  ST_SECURITY_PATTERN,
} from './price-limit.util';
export type { PriceLimits } from './price-limit.util';
export {
  assertSplicePolicy,
  clipSegments,
  resolveSegments,
} from './canonical/splice-policy';
export {
  loadCanonicalWindow,
  readCanonicalPage,
  readCanonicalRange,
} from './canonical/canonical-series';
export { CanonicalDataError } from './canonical/splice-policy.types';
export type {
  CanonicalErrorCode,
  ResolvedSegment,
  SplicePolicy,
  SplicePolicyOverride,
  SplicePolicyProvider,
  SpliceSegment,
} from './canonical/splice-policy.types';
export type {
  CanonicalPage,
  CanonicalPageParams,
  CanonicalRangeParams,
  CanonicalSegmentRead,
  CanonicalSegmentReader,
  CanonicalWindowParams,
} from './canonical/canonical-series';
