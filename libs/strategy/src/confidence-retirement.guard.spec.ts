import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();

function collectFiles(
  dir: string,
  predicate: (relPath: string) => boolean,
  out: string[] = [],
): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') {
        continue;
      }
      collectFiles(fullPath, predicate, out);
    } else {
      const rel = relative(REPO_ROOT, fullPath).replace(/\\/g, '/');
      if (predicate(rel)) {
        out.push(rel);
      }
    }
  }
  return out;
}

describe('Confidence Subsystem Physical Retirement Guard', () => {
  it('ordering.ts has been physically removed', () => {
    expect(
      existsSync(join(REPO_ROOT, 'libs/strategy/src/trading/ordering.ts')),
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, 'libs/strategy/src/trading/consolidation.ts')),
    ).toBe(true);
  });

  it('has zero production references to retired confidence / consensus symbols', () => {
    const prodSourceFiles = [
      ...collectFiles(
        join(REPO_ROOT, 'libs'),
        (rel) =>
          rel.endsWith('.ts') &&
          !rel.endsWith('.spec.ts') &&
          !rel.startsWith('libs/indicators/src/risk-performance/'),
      ),
      ...collectFiles(
        join(REPO_ROOT, 'apps'),
        (rel) => rel.endsWith('.ts') && !rel.endsWith('.spec.ts'),
      ),
      ...collectFiles(
        join(REPO_ROOT, 'tools/strategy-dev'),
        (rel) => rel.endsWith('.ts') && !rel.endsWith('.spec.ts'),
      ),
      ...collectFiles(join(REPO_ROOT, 'test'), (rel) => rel.endsWith('.mjs')),
    ];

    const forbiddenPatterns: ReadonlyArray<{
      readonly label: string;
      readonly regex: RegExp;
      readonly allowInCompiler?: boolean;
    }> = [
      { label: 'sellFirstByConfidence', regex: /\bsellFirstByConfidence\b/ },
      { label: 'GroupOrderingStrategy', regex: /\bGroupOrderingStrategy\b/ },
      { label: 'BSP_CONFIDENCE', regex: /\bBSP_CONFIDENCE\b/ },
      {
        label: 'DEFAULT_TECHNICAL_FACTOR_CONFIDENCE',
        regex: /\bDEFAULT_TECHNICAL_FACTOR_CONFIDENCE\b/,
      },
      {
        label: 'DEFAULT_PRICE_LEVEL_CONFIDENCE',
        regex: /\bDEFAULT_PRICE_LEVEL_CONFIDENCE\b/,
      },
      { label: 'ConsensusNode', regex: /\bConsensusNode\b/ },
      { label: 'ConsensusPluginWeight', regex: /\bConsensusPluginWeight\b/ },
      { label: 'ConsensusVoteBreakdown', regex: /\bConsensusVoteBreakdown\b/ },
      { label: 'confidenceLevel', regex: /\bconfidenceLevel\b/ },
      { label: 'confidence_level', regex: /\bconfidence_level\b/ },
      {
        label: 'minConfidence',
        regex: /\bminConfidence\b/,
        allowInCompiler: true,
      },
      {
        label: 'confidence',
        regex: /\bconfidence\b/i,
        allowInCompiler: true,
      },
    ];

    const violations: string[] = [];
    for (const rel of prodSourceFiles) {
      const content = readFileSync(join(REPO_ROOT, rel), 'utf8');
      const isCompiler =
        rel === 'libs/strategy/src/decision-flow/stored-definition-compiler.ts';

      for (const { label, regex, allowInCompiler } of forbiddenPatterns) {
        if (isCompiler && allowInCompiler) continue;
        if (regex.test(content)) {
          violations.push(`${rel} matches ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('has zero confidence or minConfidence fields in trading fixtures and dev presets', () => {
    const jsonFiles = [
      ...collectFiles(join(REPO_ROOT, 'tools/strategy-dev/data/presets'), (r) =>
        r.endsWith('.json'),
      ),
      ...collectFiles(
        join(REPO_ROOT, 'libs/strategy/src/trading/__fixtures__'),
        (r) => r.endsWith('.json'),
      ),
    ];

    const violations: string[] = [];
    for (const rel of jsonFiles) {
      const content = readFileSync(join(REPO_ROOT, rel), 'utf8');
      if (
        /"(?:confidence|minConfidence|confidenceLevel|CONSENSUS)"/.test(content)
      ) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('preserves orthogonal statistical VaR/CVaR confidence in libs/indicators/src/risk-performance', () => {
    const riskPerfPath = join(
      REPO_ROOT,
      'libs/indicators/src/risk-performance/risk-performance.ts',
    );
    const content = readFileSync(riskPerfPath, 'utf8');
    expect(content).toContain('confidence');
  });
});
