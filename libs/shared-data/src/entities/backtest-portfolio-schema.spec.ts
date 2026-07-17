import { getMetadataArgsStorage } from 'typeorm';
import * as sharedData from '../index';

const portfolioExports = sharedData as Record<string, unknown>;

function getColumnName(
  target: object,
  propertyName: string,
): string | undefined {
  const column = getMetadataArgsStorage().columns.find(
    (item) => item.target === target && item.propertyName === propertyName,
  );
  return typeof column?.options.name === 'string'
    ? column.options.name
    : undefined;
}

function getTableName(target: unknown): string | undefined {
  const table = getMetadataArgsStorage().tables.find(
    (item) => item.target === target,
  );
  return table?.name;
}

describe('portfolio backtest shared-data schema', () => {
  it('exports consistently named portfolio fact entities', () => {
    expect(portfolioExports).toEqual(
      expect.objectContaining({
        BacktestSignal: expect.any(Function),
        BacktestOrder: expect.any(Function),
        BacktestTrade: expect.any(Function),
        BacktestEquityPoint: expect.any(Function),
      }),
    );

    expect(getTableName(portfolioExports.BacktestSignal)).toBe(
      'backtest_signals',
    );
    expect(getTableName(portfolioExports.BacktestOrder)).toBe(
      'backtest_orders',
    );
    expect(getTableName(portfolioExports.BacktestTrade)).toBe(
      'backtest_trades',
    );
    expect(getTableName(portfolioExports.BacktestEquityPoint)).toBe(
      'backtest_equity_points',
    );
  });

  it('maps paired strategy and asynchronous run fields to snake_case columns', () => {
    expect(new sharedData.StrategyDefinition()).toMatchObject({
      backtestEnabled: false,
    });
    expect(new sharedData.StrategyVersion()).toMatchObject({
      entryRule: {},
      exitRule: null,
      lookbackBars: 1,
    });
    expect(new sharedData.BacktestRun()).toMatchObject({
      stage: 'queued',
      processedWork: 0,
      totalWork: 0,
      progressPercent: 0,
      attemptCount: 0,
      marketDataFingerprint: null,
    });
    expect(sharedData.BacktestRunStatus.CANCELLED).toBe('cancelled');

    expect(
      getColumnName(sharedData.StrategyDefinition, 'backtestEnabled'),
    ).toBe('backtest_enabled');
    expect(
      getMetadataArgsStorage().columns.find(
        (item) =>
          item.target === sharedData.StrategyDefinition &&
          item.propertyName === 'backtestEnabled',
      )?.options.type,
    ).toBe('boolean');
    expect(getColumnName(sharedData.StrategyVersion, 'entryRule')).toBe(
      'entry_rule',
    );
    expect(getColumnName(sharedData.StrategyVersion, 'exitRule')).toBe(
      'exit_rule',
    );
    expect(getColumnName(sharedData.StrategyVersion, 'lookbackBars')).toBe(
      'lookback_bars',
    );
    expect(getColumnName(sharedData.BacktestRun, 'strategySnapshot')).toBe(
      'strategy_snapshot',
    );
    expect(getColumnName(sharedData.BacktestRun, 'configSnapshot')).toBe(
      'config_snapshot',
    );
    expect(getColumnName(sharedData.BacktestRun, 'marketDataFingerprint')).toBe(
      'market_data_fingerprint',
    );
    expect(getColumnName(sharedData.BacktestRun, 'leaseExpiresAt')).toBe(
      'lease_expires_at',
    );
    expect(getColumnName(sharedData.BacktestOrder, 'expiredAt')).toBe(
      'expired_at',
    );
  });
});
