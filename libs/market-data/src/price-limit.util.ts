import { TRADING_RULES } from '@app/constants';
import type { StrategyBar } from './strategy-bar';

export interface PriceLimits {
  readonly limitUp: number;
  readonly limitDown: number;
}

/**
 * 判定标的是否为 ETF 基金 (上交所 510-518/588, 深交所 159)
 */
export function isEtfSecurity(code: string): boolean {
  const trimmed = code.trim().toUpperCase();
  const match = trimmed.match(/^(\d{6})/);
  const sixCode = match ? match[1] : trimmed;
  return /^(51[0-358]|588|159)\d{3}$/.test(sixCode);
}

/**
 * 判定标的是否为创业板或科创板 (创业板 300/301, 科创板 688，涨跌幅 20%)
 */
export function isChiNextOrStarMarket(code: string): boolean {
  const trimmed = code.trim().toUpperCase();
  const match = trimmed.match(/^(\d{6})/);
  const sixCode = match ? match[1] : trimmed;
  return /^(30[01]|688)\d{3}$/.test(sixCode);
}

/**
 * 获取标的法定涨跌幅限制比例（双创板 20%，主板及普通股票 10%）
 */
export function getPriceLimitRatio(securityCode?: string): number {
  if (securityCode && isChiNextOrStarMarket(securityCode)) {
    return TRADING_RULES.CHINEXT_STAR_LIMIT_RATIO;
  }
  return TRADING_RULES.MAIN_BOARD_LIMIT_RATIO;
}

/**
 * 计算 A 股标的当日法定涨跌停价格（四舍五入保留两位小数）
 */
export function calculatePriceLimits(
  prevClose: number,
  securityCode?: string,
): PriceLimits {
  const ratio = getPriceLimitRatio(securityCode);
  const limitUp = Math.round(prevClose * (1 + ratio) * 100) / 100;
  const limitDown = Math.round(prevClose * (1 - ratio) * 100) / 100;
  return { limitUp, limitDown };
}

/**
 * 判定当前 Bar 是否为一字涨停板（四价合一封死涨停，流动性为 0）
 */
export function isOneWordLimitUp(bar: StrategyBar, prevClose: number): boolean {
  if (prevClose <= 0) return false;
  const isFourPricesEqual =
    bar.open === bar.close && bar.high === bar.low && bar.open === bar.high;
  if (!isFourPricesEqual) return false;

  const { limitUp } = calculatePriceLimits(prevClose, bar.securityCode);
  return bar.open >= limitUp;
}

/**
 * 判定当前 Bar 是否为一字跌停板（四价合一封死跌停，流动性为 0，卖单无法脱身）
 */
export function isOneWordLimitDown(
  bar: StrategyBar,
  prevClose: number,
): boolean {
  if (prevClose <= 0) return false;
  const isFourPricesEqual =
    bar.open === bar.close && bar.high === bar.low && bar.open === bar.high;
  if (!isFourPricesEqual) return false;

  const { limitDown } = calculatePriceLimits(prevClose, bar.securityCode);
  return bar.open <= limitDown;
}
