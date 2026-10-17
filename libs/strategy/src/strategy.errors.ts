/**
 * 策略模块（libs/strategy）核心领域异常定义
 */

export const A_SHARE_DATA_MIN_BOUNDARY = Object.freeze(
  new Date('1996-12-16T00:00:00.000Z'),
);

export class StrategyDomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StrategyInputError extends StrategyDomainException {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 历史数据防毒清洗门禁异常：
 * 1996-12-16 前 A 股无涨跌停限制且曾行 T+0 制度，标的极其稀缺，属于毒化现代模型的不可用数据。
 */
export class InvalidHistoricalDataBoundaryException extends StrategyDomainException {
  constructor(message?: string) {
    super(
      message ??
        'Invalid historical data boundary: Requested start date is prior to 1996-12-16T00:00:00.000Z. A-share data before 1996-12-16 lacks price limits and T+1 mechanisms, and is considered toxic for strategy evaluation.',
    );
  }
}
