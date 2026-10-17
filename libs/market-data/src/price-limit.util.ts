import { TRADING_RULES } from '@app/constants';
import type { StrategyBar } from './strategy-bar';

export interface PriceLimits {
  readonly limitUp: number;
  readonly limitDown: number;
}

export const ETF_SECURITY_PATTERN = /^(51[0-8]|56[0-3]|588|159)\d{3}$/;
export const CHINEXT_STAR_SECURITY_PATTERN = /^(30[01]|68[89])\d{3}$/;
export const BSE_SECURITY_PATTERN = /^(43|83|87|92)\d{4}$/;
export const ST_SECURITY_PATTERN = /ST/i;

function extractSixDigitCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const match = trimmed.match(/^(\d{6})/);
  return match ? match[1] : trimmed;
}

/**
 * 判定标的是否为 ETF 基金 (上交所 510-518/560-563/588, 深交所 159)
 */
export function isEtfSecurity(code: string): boolean {
  return ETF_SECURITY_PATTERN.test(extractSixDigitCode(code));
}

/**
 * 判定标的是否为创业板或科创板 (创业板 300/301, 科创板 688/689 CDR，涨跌幅 20%)
 */
export function isChiNextOrStarMarket(code: string): boolean {
  return CHINEXT_STAR_SECURITY_PATTERN.test(extractSixDigitCode(code));
}

/**
 * 判定标的是否为北交所股票 (43/83/87/92，涨跌幅 30%)
 */
export function isBseMarket(code: string): boolean {
  return BSE_SECURITY_PATTERN.test(extractSixDigitCode(code));
}

/**
 * 判定标的是否为风险警示股票 (ST / *ST，涨跌幅 5%)
 */
export function isStSecurity(codeOrName: string): boolean {
  return ST_SECURITY_PATTERN.test(codeOrName.trim());
}

/**
 * 获取标的法定涨跌幅限制比例（ST 5%，主板 10%，双创板 20%，北交所 30%）
 */
export function getPriceLimitRatio(
  securityCode?: string,
  securityName?: string,
): number {
  if (securityName && isStSecurity(securityName)) {
    return TRADING_RULES.ST_LIMIT_RATIO;
  }
  if (securityCode) {
    if (isStSecurity(securityCode)) {
      return TRADING_RULES.ST_LIMIT_RATIO;
    }
    if (isBseMarket(securityCode)) {
      return TRADING_RULES.BSE_LIMIT_RATIO;
    }
    if (isChiNextOrStarMarket(securityCode)) {
      return TRADING_RULES.CHINEXT_STAR_LIMIT_RATIO;
    }
  }
  return TRADING_RULES.MAIN_BOARD_LIMIT_RATIO;
}

/**
 * 计算 A 股标的当日法定涨跌停价格（四舍五入保留两位小数）
 */
export function calculatePriceLimits(
  prevClose: number,
  securityCode?: string,
  securityName?: string,
): PriceLimits {
  const ratio = getPriceLimitRatio(securityCode, securityName);
  const limitUp = Math.round(prevClose * (1 + ratio) * 100) / 100;
  const limitDown = Math.round(prevClose * (1 - ratio) * 100) / 100;
  return { limitUp, limitDown };
}

/**
 * 判定当前 Bar 是否为一字涨停板（四价合一封死涨停，流动性为 0）
 */
export function isOneWordLimitUp(
  bar: StrategyBar,
  prevClose: number,
  securityName?: string,
): boolean {
  if (prevClose <= 0) return false;
  const isFourPricesEqual =
    bar.open === bar.close && bar.high === bar.low && bar.open === bar.high;
  if (!isFourPricesEqual) return false;

  const { limitUp } = calculatePriceLimits(
    prevClose,
    bar.securityCode,
    securityName,
  );
  return bar.open >= limitUp;
}

/**
 * 判定当前 Bar 是否为一字跌停板（四价合一封死跌停，流动性为 0，卖单无法脱身）
 */
export function isOneWordLimitDown(
  bar: StrategyBar,
  prevClose: number,
  securityName?: string,
): boolean {
  if (prevClose <= 0) return false;
  const isFourPricesEqual =
    bar.open === bar.close && bar.high === bar.low && bar.open === bar.high;
  if (!isFourPricesEqual) return false;

  const { limitDown } = calculatePriceLimits(
    prevClose,
    bar.securityCode,
    securityName,
  );
  return bar.open <= limitDown;
}
