import { ConfigService } from '@nestjs/config';
import { createDefaultRiskRules, TradingEngine, yuanToLi } from '@app/strategy';

/**
 * 交易层引擎单例装配（design 5.2）：
 * - 实时执行端无硬止损（遵循零死板止损准则）；systemicCrunch 巡检常驻；
 * - SizingStrategy 默认 AllInWithBuffer(0.95)（统一漂移）；
 * - 种子资金 env `NOTIFICATION_VIRTUAL_SEED_CAPITAL` 默认 1,000,000 元
 *   （整数厘传入账本 fold，REQ-LEDGER-05）。
 */
export const TRADING_ENGINE = Symbol('TRADING_ENGINE');
export const NOTIFICATION_VIRTUAL_SEED_CAPITAL_LI = Symbol(
  'NOTIFICATION_VIRTUAL_SEED_CAPITAL_LI',
);

export const tradingEngineProvider = {
  provide: TRADING_ENGINE,
  useFactory(): TradingEngine {
    return new TradingEngine({ riskRules: createDefaultRiskRules() });
  },
};

export const seedCapitalProvider = {
  provide: NOTIFICATION_VIRTUAL_SEED_CAPITAL_LI,
  inject: [ConfigService],
  useFactory(config: ConfigService): bigint {
    const raw = Number(config.get<string>('NOTIFICATION_VIRTUAL_SEED_CAPITAL'));
    const yuan = Number.isFinite(raw) && raw > 0 ? raw : 1_000_000;
    return yuanToLi(yuan);
  },
};
