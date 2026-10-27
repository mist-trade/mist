import * as fs from 'fs';
import * as path from 'path';
import type { ChanK } from '@app/chancore';

export interface KLineLoadOptions {
  /** 指定已有快照用例名，如 'shanghai-index-2024-2025' */
  caseKey?: string;
  /** 股票或指数代码，如 '000001' */
  code?: string;
  /** 周期，如 '1d', '30m', '5m', '1m' 或数字 (1440, 30, 5, 1) */
  period?: string | number;
  /**
   * 精确周期匹配（多周期回放用）：禁用"同 symbol 任意数据集"静默回退，
   * 缺失即抛错（fail-closed，杜绝 30m 数据冒充 1440 context 的数据污染）。
   */
  exact?: boolean;
}

export interface AvailableDataset {
  type: 'fixture' | 'cache';
  key: string;
  symbol: string;
  period: string;
  path: string;
  count?: number;
}

const ROOT_DIR = path.resolve(__dirname, '../../..');
/**
 * 行情数据落点（优先级序）：
 * 1. 私有仓 mist-alpha-private/market-data/kline（权威落点，随私仓提交备份）；
 * 2. tools/strategy-dev/data/kline（历史兼容，.gitkeep）；
 * 3. .data/kline（本地运行时缓存，历史兼容）。
 * 可用 MIST_PRIVATE_DATA_DIR 覆盖私仓数据根（默认 peer 工作区约定）。
 */
const PRIVATE_DATA_DIR =
  process.env.MIST_PRIVATE_DATA_DIR ||
  path.resolve(__dirname, '../../../mist-alpha-private/market-data');
export { PRIVATE_DATA_DIR };
const LOCAL_CACHE_DIRS = [
  path.join(PRIVATE_DATA_DIR, 'kline'),
  path.resolve(__dirname, 'data/kline'),
  path.resolve(__dirname, '../../.data/kline'),
];
const FIXTURE_DIRS = [
  path.resolve(__dirname, 'data/fixtures'),
  path.resolve(__dirname, '../../.data/fixtures'),
  path.resolve(ROOT_DIR, 'mist-fe/__fixtures__/snapshots/chan'),
];

export const PERIOD_NAME_MAP: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '1d': 1440,
  day: 1440,
  week: 10080,
};

export const REVERSE_PERIOD_MAP: Record<number, string> = {
  1: '1m',
  3: '3m',
  5: '5m',
  15: '15m',
  30: '30m',
  60: '60m',
  1440: '1d',
  10080: '1w',
};

interface ParsedKlineCacheEntry {
  readonly mtimeMs: number;
  readonly size: number;
  readonly rows: unknown[];
}

/**
 * In-process parse cache. Long vendor series reach ~250k bars (~60MB JSON), so
 * re-parsing per request dominates the dev gateway latency. Entries invalidate
 * on mtime/size change; callers still receive freshly mapped objects.
 */
const PARSED_KLINE_CACHE = new Map<string, ParsedKlineCacheEntry>();

function readKlineCache(file: string): any {
  const stat = fs.statSync(file);
  const cached = PARSED_KLINE_CACHE.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.rows;
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (Array.isArray(parsed)) {
    PARSED_KLINE_CACHE.set(file, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      rows: parsed,
    });
  }
  return parsed;
}

/**
 * 统一加载标准化 ChanK 序列
 */
export function loadCanonicalKlines(options: KLineLoadOptions): ChanK[] {
  let targetFile: string | null = null;
  const code = options.code;

  // 1. 若指定了 caseKey，搜索快照目录
  if (options.caseKey) {
    for (const baseDir of FIXTURE_DIRS) {
      const candidate = path.join(baseDir, options.caseKey, 'k.json');
      if (fs.existsSync(candidate)) {
        targetFile = candidate;
        break;
      }
    }
    if (!targetFile) {
      throw new Error(
        `未找到快照用例 "${options.caseKey}"，已检查路径: ${FIXTURE_DIRS.join(', ')}`,
      );
    }
  } else if (options.code && options.period) {
    // 2. 否则根据 code + period 搜索本地缓存
    const pStr =
      typeof options.period === 'number'
        ? REVERSE_PERIOD_MAP[options.period] || `${options.period}m`
        : options.period;

    for (const dir of LOCAL_CACHE_DIRS) {
      const candidate = path.join(dir, `${options.code}_${pStr}.json`);
      if (fs.existsSync(candidate)) {
        targetFile = candidate;
        break;
      }
    }

    if (!targetFile) {
      if (options.exact) {
        throw new Error(
          `本地未找到 ${options.code} (${pStr}) 的 K 线数据缓存（exact 模式禁用回退）。` +
            `请先执行同步: pnpm dev:sync --code ${options.code} --periods ${pStr}`,
        );
      }
      // 尝试在快照里按代码找对应用例
      const foundInFixture = findFixtureByCodeAndPeriod(options.code, pStr);
      if (foundInFixture) {
        targetFile = foundInFixture;
      } else {
        // 二级平滑回退: 查找该代码的任意可用快照/缓存数据集
        const allDatasets = listAvailableDatasets();
        const matched = allDatasets.find((d) => d.symbol === options.code);
        if (matched) {
          targetFile = matched.path;
        }
      }
    }

    if (!targetFile) {
      throw new Error(
        `本地未找到 ${options.code} (${pStr}) 的 K 线数据缓存。\n` +
          `请先执行同步: pnpm dev:sync --code ${options.code} --periods ${pStr}\n` +
          `或使用已有快照: ${listAvailableDatasets()
            .map((d) => d.key)
            .join(', ')}`,
      );
    }
  } else {
    throw new Error('必须指定 --caseKey 或同时指定 --code 与 --period');
  }

  const rawData = readKlineCache(targetFile);
  if (!Array.isArray(rawData)) {
    throw new Error(`数据文件 ${targetFile} 内容非法: 必须为 K 线数组`);
  }

  return rawData.map((item: any, index: number) => ({
    id: Number(item.id || index + 1),
    symbol: String(item.symbol || code || 'UNKNOWN'),
    time: new Date(item.time || item.timestamp),
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume:
      item.volume !== undefined && item.volume !== null
        ? String(item.volume)
        : null,
    amount:
      item.amount !== undefined && item.amount !== null
        ? String(item.amount)
        : null,
    // 透传真实分段来源（dev:sync 落盘的 source 列），供 StrategyBar 审计对齐
    ...(item.source !== undefined && item.source !== null
      ? { source: String(item.source) }
      : {}),
  })) as ChanK[];
}

/**
 * 列出本地所有可直接使用的行情数据集（包括存量黄金快照与增量缓存）
 */
export function listAvailableDatasets(): AvailableDataset[] {
  const list: AvailableDataset[] = [];

  // 快照用例
  for (const baseDir of FIXTURE_DIRS) {
    if (fs.existsSync(baseDir)) {
      const cases = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const ent of cases) {
        if (ent.isDirectory()) {
          const kPath = path.join(baseDir, ent.name, 'k.json');
          if (fs.existsSync(kPath)) {
            let symbol = ent.name;
            let period = '1d';
            try {
              const metaPath = path.join(baseDir, ent.name, 'meta.json');
              if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                if (meta.testCase) {
                  symbol = meta.testCase.code || symbol;
                  period =
                    REVERSE_PERIOD_MAP[meta.testCase.period] ||
                    `${meta.testCase.period}m`;
                }
              }
            } catch {}
            list.push({
              type: 'fixture',
              key: ent.name,
              symbol,
              period,
              path: kPath,
            });
          }
        }
      }
      break; // 优先第一个有效目录
    }
  }

  // 本地增量缓存
  for (const cacheDir of LOCAL_CACHE_DIRS) {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          const parts = f.replace('.json', '').split('_');
          const symbol = parts[0];
          const period = parts[1] || 'unknown';
          list.push({
            type: 'cache',
            key: f.replace('.json', ''),
            symbol,
            period,
            path: path.join(cacheDir, f),
          });
        }
      }
    }
  }

  return list;
}

function findFixtureByCodeAndPeriod(
  code: string,
  periodStr: string,
): string | null {
  for (const baseDir of FIXTURE_DIRS) {
    if (!fs.existsSync(baseDir)) continue;
    const cases = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const ent of cases) {
      if (!ent.isDirectory()) continue;
      const metaPath = path.join(baseDir, ent.name, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          const p =
            REVERSE_PERIOD_MAP[meta?.testCase?.period] ||
            `${meta?.testCase?.period}m`;
          if (meta?.testCase?.code === code && p === periodStr) {
            return path.join(baseDir, ent.name, 'k.json');
          }
        } catch {}
      }
    }
  }
  return null;
}
