/**
 * Canonical Cron Expressions for A-share Trading Pipeline (Asia/Shanghai).
 *
 * Use these constants in @Cron decorators across apps to ensure single-source-of-truth
 * schedule definitions.
 */

/** 09:05 Asia/Shanghai on exchange trading days (Monday - Friday). Pre-market automated health inspection. */
export const CRON_PRE_MARKET_INSPECTION_0905 = '0 5 9 * * 1-5';

/** 09:15 Asia/Shanghai on exchange trading days (Monday - Friday). Subscription lifecycle Read-Before-Reset barrier. */
export const CRON_SUBSCRIPTION_RESET_0915 = '0 15 9 * * 1-5';

/** 21:30 Asia/Shanghai on exchange trading days (Monday - Friday). Nightly post-close market breadth & panic gauge aggregation. */
export const CRON_MARKET_BREADTH_NIGHTLY_2130 = '30 21 * * 1-5';

/** 09:20 Asia/Shanghai on exchange trading days (Monday - Friday). Pre-market strategy kernel pool warmup barrier. */
export const CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5';
