import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CanonicalDataError,
  assertSplicePolicy,
  type SplicePolicy,
  type SplicePolicyProvider,
} from '@app/market-data';

const CANDIDATE_INDEX_FILES: readonly string[] = Object.freeze([
  'index.ts',
  'index.js',
]);
const CANDIDATE_SUBDIRS: readonly string[] = Object.freeze(['src', 'dist']);
const PRIVATE_DIR_ENV_KEYS: readonly string[] = Object.freeze([
  'MIST_PRIVATE_PLUGINS_DIR',
  'MIST_PRIVATE_PLUGINS_PATH',
]);
const PRIVATE_PEER_DIR = 'mist-alpha-private';
const PARENT_DIR = '..';
const PEER_FROM_DIRNAME = '../../../../..';
const DYNAMIC_REQUIRE = 'require';
const PATH_LIST_SEPARATOR = ', ';

function isProvider(value: unknown): value is SplicePolicyProvider {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.load === 'function'
  );
}

/**
 * Loads the canonical splice policy from the private plugin directory.
 *
 * The public repository ships no policy content: boundaries, provider order and
 * security lists live in `mist-alpha-private` (or the directory named by
 * `MIST_PRIVATE_PLUGINS_DIR`). Missing or invalid policies fail explicitly; the
 * loader never falls back to a built-in default.
 */
export class CanonicalPolicyLoader {
  private static customPaths: string[] = [];
  private static cached: SplicePolicy | null = null;

  static setCustomPaths(paths: readonly string[]): void {
    this.customPaths = [...paths];
    this.cached = null;
  }

  static resetConfiguration(): void {
    this.customPaths = [];
    this.cached = null;
  }

  static load(): SplicePolicy {
    if (this.cached) return this.cached;

    const providers = this.discoverProviders();
    if (providers.length === 0) {
      throw new CanonicalDataError(
        'CANONICAL_POLICY_UNAVAILABLE',
        `no marketDataPolicy provider found in: ${this.getCandidatePaths().join(PATH_LIST_SEPARATOR)}`,
      );
    }

    for (const provider of providers) {
      const policy = provider.load();
      if (!policy) continue;
      assertSplicePolicy(policy);
      this.cached = policy;
      return policy;
    }

    throw new CanonicalDataError(
      'CANONICAL_POLICY_UNAVAILABLE',
      'marketDataPolicy provider returned no policy',
    );
  }

  private static discoverProviders(): readonly SplicePolicyProvider[] {
    const found = new Map<string, SplicePolicyProvider>();
    for (const candidate of this.getCandidatePaths()) {
      for (const entry of this.resolveEntryFiles(candidate)) {
        for (const provider of this.loadProviders(entry)) {
          if (!found.has(provider.id)) found.set(provider.id, provider);
        }
      }
    }
    return [...found.values()];
  }

  private static getCandidatePaths(): string[] {
    if (this.customPaths.length > 0) {
      return [...this.customPaths];
    }

    const paths: string[] = [];
    for (const key of PRIVATE_DIR_ENV_KEYS) {
      const value = process.env[key];
      if (value && value.trim().length > 0) paths.push(value.trim());
    }
    paths.push(path.resolve(process.cwd(), PARENT_DIR, PRIVATE_PEER_DIR));
    paths.push(path.resolve(__dirname, PEER_FROM_DIRNAME, PRIVATE_PEER_DIR));

    return [...new Set(paths)];
  }

  private static resolveEntryFiles(basePath: string): string[] {
    if (!fs.existsSync(basePath)) return [];
    try {
      if (fs.statSync(basePath).isFile()) return [basePath];
      if (!fs.statSync(basePath).isDirectory()) return [];

      const candidates: string[] = [];
      for (const dir of CANDIDATE_SUBDIRS) {
        for (const file of CANDIDATE_INDEX_FILES) {
          candidates.push(path.join(basePath, dir, file));
        }
      }
      for (const file of CANDIDATE_INDEX_FILES) {
        candidates.push(path.join(basePath, file));
      }

      return candidates.filter(
        (candidate) =>
          fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
      );
    } catch {
      return [];
    }
  }

  private static loadProviders(
    entryFile: string,
  ): readonly SplicePolicyProvider[] {
    let moduleExports: unknown;
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const dynamicRequire =
        typeof (globalThis as any).__non_webpack_require__ === 'function'
          ? (globalThis as any).__non_webpack_require__
          : eval(DYNAMIC_REQUIRE);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      moduleExports = dynamicRequire(entryFile);
    } catch {
      return [];
    }

    if (!moduleExports || typeof moduleExports !== 'object') return [];
    const bag = moduleExports as Record<string, unknown>;
    const providers: SplicePolicyProvider[] = [];

    if (isProvider(bag.marketDataPolicy)) {
      providers.push(bag.marketDataPolicy);
    }
    if (Array.isArray(bag.marketDataPolicies)) {
      for (const candidate of bag.marketDataPolicies) {
        if (isProvider(candidate)) providers.push(candidate);
      }
    }

    return providers;
  }
}
