import { Module } from '@nestjs/common';
import { StrategyAlertEventController } from './controllers/strategy-alert-event.controller';
import { StrategyBacktestController } from './controllers/strategy-backtest.controller';
import { StrategyScanController } from './controllers/strategy-scan.controller';
import { StrategySignalController } from './controllers/strategy-signal.controller';
import { StrategyController } from './controllers/strategy.controller';
import { StrategyBacktestEngine } from './backtest/strategy-backtest.engine';
import { StrategyBacktestProcessor } from './backtest/strategy-backtest.processor';
import { StrategyCoreModule } from './strategy-core.module';

@Module({
  imports: [StrategyCoreModule],
  controllers: [
    StrategyController,
    StrategySignalController,
    StrategyAlertEventController,
    StrategyBacktestController,
    StrategyScanController,
  ],
  providers: [
    {
      provide: StrategyBacktestEngine,
      useFactory: () => new StrategyBacktestEngine(),
    },
    StrategyBacktestProcessor,
  ],
  exports: [StrategyCoreModule],
})
export class StrategyModule {}
