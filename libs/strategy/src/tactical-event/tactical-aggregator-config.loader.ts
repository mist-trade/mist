import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  TacticalAggregatorConfig,
  TacticalWindowRule,
} from './tactical-event.types';

/** 私仓约定的战术汇聚配置文件名，位于私仓 `market-data/` 下。 */
const CONFIG_FILENAME = 'tactical-aggregator.json';
const PRIVATE_DATA_SUBDIR = 'market-data';
const PRIVATE_DIR_ENV_KEYS: readonly string[] = Object.freeze([
  'MIST_PRIVATE_PLUGINS_DIR',
  'MIST_PRIVATE_PLUGINS_PATH',
]);
const CONFIG_PATH_ENV_KEY = 'MIST_TACTICAL_AGGREGATOR_CONFIG_PATH';
const PRIVATE_PEER_DIR = 'mist-alpha-private';
const PARENT_DIR = '..';
const PEER_FROM_DIRNAME = '../../../../..';

export class InvalidTacticalAggregatorConfigError extends Error {
  readonly code = 'INVALID_TACTICAL_AGGREGATOR_CONFIG';
  override readonly name = 'InvalidTacticalAggregatorConfigError';

  constructor(
    readonly source: string,
    readonly detail: string,
  ) {
    super(`invalid tactical aggregator config at ${source}: ${detail}`);
  }
}

const EMPTY_CONFIG: TacticalAggregatorConfig = Object.freeze({});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(
  source: string,
  field: string,
  value: unknown,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new InvalidTacticalAggregatorConfigError(
      source,
      `${field} must be an array of strings`,
    );
  }
  return value as readonly string[];
}

function readWindowRule(
  source: string,
  index: number,
  value: unknown,
): TacticalWindowRule {
  if (!isRecord(value)) {
    throw new InvalidTacticalAggregatorConfigError(
      source,
      `windows[${index}] must be an object`,
    );
  }
  const triggerTag = value.triggerTag;
  const windowBars = value.windowBars;
  const compositeBadgeText = value.compositeBadgeText;
  if (typeof triggerTag !== 'string' || triggerTag.length === 0) {
    throw new InvalidTacticalAggregatorConfigError(
      source,
      `windows[${index}].triggerTag must be a non-empty string`,
    );
  }
  if (typeof windowBars !== 'number' || !Number.isFinite(windowBars)) {
    throw new InvalidTacticalAggregatorConfigError(
      source,
      `windows[${index}].windowBars must be a finite number`,
    );
  }
  if (
    typeof compositeBadgeText !== 'string' ||
    compositeBadgeText.length === 0
  ) {
    throw new InvalidTacticalAggregatorConfigError(
      source,
      `windows[${index}].compositeBadgeText must be a non-empty string`,
    );
  }
  const requiredConfirmationTags =
    readStringArray(
      source,
      `windows[${index}].requiredConfirmationTags`,
      value.requiredConfirmationTags,
    ) ?? [];
  const optionalBoostTags = readStringArray(
    source,
    `windows[${index}].optionalBoostTags`,
    value.optionalBoostTags,
  );

  return {
    triggerTag,
    windowBars,
    compositeBadgeText,
    requiredConfirmationTags,
    ...(typeof value.requiredSetupTag === 'string'
      ? { requiredSetupTag: value.requiredSetupTag }
      : {}),
    ...(typeof value.maxContainmentHoldBars === 'number'
      ? { maxContainmentHoldBars: value.maxContainmentHoldBars }
      : {}),
    ...(typeof value.invalidateOnPivotBreak === 'boolean'
      ? { invalidateOnPivotBreak: value.invalidateOnPivotBreak }
      : {}),
    ...(optionalBoostTags === undefined ? {} : { optionalBoostTags }),
    ...(value.action === 'BUY' || value.action === 'SELL'
      ? { action: value.action }
      : {}),
    ...(value.kind === 'ENTRY' ||
    value.kind === 'EXIT' ||
    value.kind === 'RISK_CUT'
      ? { kind: value.kind }
      : {}),
  };
}

function parseConfig(source: string, raw: unknown): TacticalAggregatorConfig {
  if (!isRecord(raw)) {
    throw new InvalidTacticalAggregatorConfigError(
      source,
      'root must be object',
    );
  }
  const windowsRaw = raw.windows;
  if (windowsRaw !== undefined && !Array.isArray(windowsRaw)) {
    throw new InvalidTacticalAggregatorConfigError(
      source,
      'windows must be an array',
    );
  }
  const windows =
    windowsRaw === undefined
      ? undefined
      : windowsRaw.map((item, index) => readWindowRule(source, index, item));

  return {
    ...(readStringArray(source, 'edgePlugins', raw.edgePlugins) === undefined
      ? {}
      : {
          edgePlugins: readStringArray(source, 'edgePlugins', raw.edgePlugins)!,
        }),
    ...(windows === undefined ? {} : { windows }),
    ...(typeof raw.cooldownBars === 'number'
      ? { cooldownBars: raw.cooldownBars }
      : {}),
  };
}

/**
 * 战术汇聚层配置加载器。
 *
 * 开源仓不携带任何策略内容：规则、插件 id 与参数均落在 `mist-alpha-private`
 * （或 `MIST_PRIVATE_PLUGINS_DIR` 指向的目录）的 `market-data/tactical-aggregator.json`。
 *
 * 取舍：文件缺失时返回空配置（公共仓可独立运行，只跑纯公开流）；
 * 文件存在但形状非法时显式抛错，绝不静默降级。
 */
export class TacticalAggregatorConfigLoader {
  private static customPaths: string[] = [];
  private static cached: TacticalAggregatorConfig | null = null;
  private static cachedSource: string | null = null;

  static setCustomPaths(paths: readonly string[]): void {
    this.customPaths = [...paths];
    this.cached = null;
    this.cachedSource = null;
  }

  static resetConfiguration(): void {
    this.customPaths = [];
    this.cached = null;
    this.cachedSource = null;
  }

  static load(): TacticalAggregatorConfig {
    return this.resolve().config;
  }

  static resolve(): {
    readonly config: TacticalAggregatorConfig;
    readonly source: string | null;
  } {
    if (this.cached !== null) {
      return { config: this.cached, source: this.cachedSource };
    }

    const candidates = this.getCandidatePaths();
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as unknown;
      const config = Object.freeze(parseConfig(candidate, raw));
      this.cached = config;
      this.cachedSource = candidate;
      return { config, source: candidate };
    }

    this.cached = EMPTY_CONFIG;
    this.cachedSource = null;
    return { config: EMPTY_CONFIG, source: null };
  }

  static getCandidatePaths(): readonly string[] {
    if (this.customPaths.length > 0) return this.customPaths;

    const paths: string[] = [];

    const explicit = process.env[CONFIG_PATH_ENV_KEY];
    if (explicit && explicit.trim().length > 0) {
      paths.push(explicit.trim());
    }

    for (const key of PRIVATE_DIR_ENV_KEYS) {
      const dir = process.env[key];
      if (dir && dir.trim().length > 0) {
        paths.push(path.join(dir.trim(), PRIVATE_DATA_SUBDIR, CONFIG_FILENAME));
      }
    }

    paths.push(
      path.resolve(
        process.cwd(),
        PARENT_DIR,
        PRIVATE_PEER_DIR,
        PRIVATE_DATA_SUBDIR,
        CONFIG_FILENAME,
      ),
    );
    paths.push(
      path.resolve(
        __dirname,
        PEER_FROM_DIRNAME,
        PRIVATE_PEER_DIR,
        PRIVATE_DATA_SUBDIR,
        CONFIG_FILENAME,
      ),
    );

    return [...new Set(paths)];
  }
}
