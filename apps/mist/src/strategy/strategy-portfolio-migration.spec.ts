import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(process.cwd(), 'deploy/database/migrations');
const coreMigrationPath = join(migrationsDir, '006_strategy_platform_core.sql');
const portfolioMigrationPath = join(
  migrationsDir,
  '007_strategy_portfolio_backtesting.sql',
);

describe('strategy portfolio backtesting migration', () => {
  it('keeps the already-applied strategy core migration byte-for-byte unchanged', () => {
    const coreMigration = readFileSync(coreMigrationPath, 'utf8');
    const checksum = createHash('sha256').update(coreMigration).digest('hex');

    expect(checksum).toBe(
      '654937d497a1072fb7880e797f0a63b24e3da7f720cf2d528009a4c3875897a8',
    );
  });

  it('adds the additive 007 portfolio schema and preserves migration order', () => {
    const migrationExists = existsSync(portfolioMigrationPath);
    const migration = migrationExists
      ? readFileSync(portfolioMigrationPath, 'utf8')
      : '';

    expect(migrationExists).toBe(true);
    expect(migration).toContain('ALTER TABLE `strategy_definitions`');
    expect(migration).toContain('ADD COLUMN `backtest_enabled`');
    expect(migration).toContain('CHANGE COLUMN `rule` `entry_rule`');
    expect(migration).toContain('ADD COLUMN `exit_rule`');
    expect(migration).toContain('ADD COLUMN `lookback_bars`');
    expect(migration).toContain(
      'RENAME TABLE `backtest_signal_results` TO `backtest_signals`',
    );
    const retiredSignalRows = migration.indexOf(
      'DELETE FROM `backtest_signal_results`',
    );
    const retiredRunRows = migration.indexOf('DELETE FROM `backtest_runs`');
    const requiredSnapshotColumn = migration.indexOf(
      'ADD COLUMN `strategy_snapshot` json NOT NULL',
    );
    expect(retiredSignalRows).toBeGreaterThan(-1);
    expect(retiredRunRows).toBeGreaterThan(-1);
    expect(requiredSnapshotColumn).toBeGreaterThan(-1);
    expect(retiredRunRows).toBeLessThan(requiredSnapshotColumn);
    expect(migration).toContain(
      'DROP FOREIGN KEY `fk_backtest_signal_results_definition`',
    );
    expect(migration).toContain(
      'DROP FOREIGN KEY `fk_backtest_signal_results_version`',
    );
    const signalKindColumn = migration.indexOf(
      "ADD COLUMN `signal_kind` enum('entry', 'exit')",
    );
    const alertDedupeBackfill = migration.indexOf(
      'UPDATE `strategy_alert_events`',
    );
    expect(signalKindColumn).toBeGreaterThan(-1);
    expect(alertDedupeBackfill).toBeGreaterThan(signalKindColumn);
    expect(migration).toContain("CONCAT(`dedupe_key`, ':entry')");
    expect(migration).toContain("'cancelled'");

    for (const table of [
      'backtest_orders',
      'backtest_trades',
      'backtest_equity_points',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \`${table}\``);
    }

    for (const index of [
      'idx_backtest_orders_run_id',
      'idx_backtest_trades_run_id',
      'idx_backtest_equity_points_run_time',
      'uq_backtest_signals_run_security_time_kind',
      'uq_backtest_orders_signal_id',
      'uq_backtest_trades_entry_order_id',
    ]) {
      expect(migration).toContain(index);
    }

    expect(migration).toContain('`expired_at` datetime NULL');

    expect(migration).toContain(
      'FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE',
    );
  });
});
