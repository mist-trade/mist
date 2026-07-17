import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

describe('experimental TDX no-K dependency boundary', () => {
  it('does not import collector, K aggregation, strategy, or persistence code', () => {
    const directory = __dirname;
    const forbidden = [
      'CollectorService',
      'KCandleAggregator',
      'StrategyScanService',
      'saveRawKData',
      '/collector/',
      '/strategy/',
    ];
    const violations: string[] = [];

    for (const filename of readdirSync(directory)) {
      if (!filename.endsWith('.ts') || filename.endsWith('.spec.ts')) continue;
      const sourceText = readFileSync(join(directory, filename), 'utf8');
      const source = ts.createSourceFile(
        filename,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const importText = statement.getText(source);
        for (const token of forbidden) {
          if (importText.includes(token)) {
            violations.push(`${filename}: ${importText}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
