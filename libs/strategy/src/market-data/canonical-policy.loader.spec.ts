import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CanonicalDataError, type SplicePolicy } from '@app/market-data';
import { CanonicalPolicyLoader } from './canonical-policy.loader';

const POLICY: SplicePolicy = {
  version: 'test-v1',
  defaults: {
    '5': [
      { source: 'vendor_a' as never, before: '2025-07-04' },
      { source: 'qmt' as never },
    ],
  },
};

function writeProvider(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-policy-'));
  fs.writeFileSync(path.join(dir, 'index.js'), body, 'utf8');
  return dir;
}

describe('CanonicalPolicyLoader', () => {
  afterEach(() => {
    CanonicalPolicyLoader.resetConfiguration();
  });

  it('loads a policy from a private provider module', () => {
    const dir = writeProvider(
      `module.exports = { marketDataPolicy: { id: 'test', load: () => (${JSON.stringify(POLICY)}) } };`,
    );
    CanonicalPolicyLoader.setCustomPaths([dir]);

    expect(CanonicalPolicyLoader.load().version).toBe('test-v1');
  });

  it('fails explicitly when no provider exists', () => {
    CanonicalPolicyLoader.setCustomPaths([
      path.join(os.tmpdir(), 'missing-dir'),
    ]);

    expect(() => CanonicalPolicyLoader.load()).toThrow(CanonicalDataError);
    try {
      CanonicalPolicyLoader.load();
    } catch (error) {
      expect((error as CanonicalDataError).code).toBe(
        'CANONICAL_POLICY_UNAVAILABLE',
      );
    }
  });

  it('rejects an invalid policy', () => {
    const dir = writeProvider(
      `module.exports = { marketDataPolicy: { id: 'bad', load: () => ({ version: 'v1', defaults: { '5': [{ source: 'mystery' }] } }) } };`,
    );
    CanonicalPolicyLoader.setCustomPaths([dir]);

    expect(() => CanonicalPolicyLoader.load()).toThrow(
      /not a known data source/,
    );
  });

  it('supports an array of providers', () => {
    const dir = writeProvider(
      `module.exports = { marketDataPolicies: [{ id: 'a', load: () => (${JSON.stringify(POLICY)}) }] };`,
    );
    CanonicalPolicyLoader.setCustomPaths([dir]);

    expect(CanonicalPolicyLoader.load().version).toBe('test-v1');
  });
});
