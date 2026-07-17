import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

describe('experimental QMT no-K dependency boundary', () => {
  it('imports no K, collector, aggregation, strategy, signal, alert, or trading code', () => {
    const forbidden = [
      'HistoricalCollectorModule',
      'CollectorService',
      'KCandleAggregator',
      'StrategyScanService',
      '/collector/',
      '/strategy/',
      'StrategySignal',
      'StrategyAlert',
      'TradeOrder',
    ];
    const violations: string[] = [];
    for (const filename of readdirSync(__dirname)) {
      if (!filename.endsWith('.ts') || filename.endsWith('.spec.ts')) continue;
      const sourceText = readFileSync(join(__dirname, filename), 'utf8');
      const source = ts.createSourceFile(
        filename,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const text = statement.getText(source);
        for (const token of forbidden) {
          if (text.includes(token)) violations.push(`${filename}: ${text}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('adds no public latest-snapshot route', () => {
    const source = readFileSync(
      join(__dirname, 'experimental-qmt-diagnostic.controller.ts'),
      'utf8',
    );
    expect(source).not.toContain('/v1/market/snapshots/latest');
    expect(source).toContain('internal/experimental/qmt/realtime');
  });
});
