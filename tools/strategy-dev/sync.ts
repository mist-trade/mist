#!/usr/bin/env node
/**
 * 远程行情数据同步工具 (通过 SSH 从 mist-box 拉取并本地持久化)
 *
 * 用法:
 *   pnpm dev:sync --code 600519 --periods 1d,30m,5m
 *   pnpm dev:sync --code 000001 --periods 30m --limit 3000
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PERIOD_NAME_MAP } from './provider';

interface SyncCliOptions {
  code: string;
  periods: string[];
  limit: number;
  source?: string;
  boxHost?: string;
  password?: string;
}

function parseCliArgs(): SyncCliOptions {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = args.find((a) => a.startsWith(prefix));
    if (found) return found.substring(prefix.length);
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return undefined;
  };

  const code = getArg('code') || '600519';
  const periodStr = getArg('periods') || getArg('period') || '1d,30m';
  const limitStr = getArg('limit');
  let limit = 0; // 0 表示不设上限，拉取数据库最大存储范围
  if (limitStr) {
    if (limitStr.toLowerCase() === 'all' || limitStr.toLowerCase() === 'max') {
      limit = 0;
    } else {
      limit = Number(limitStr) || 0;
    }
  }
  const source = getArg('source');
  const boxHost = getArg('box') || 'mist-box';
  const password =
    getArg('password') ||
    process.env.MYSQL_ROOT_PASSWORD ||
    process.env.MIST_DB_PASSWORD ||
    'change-me-root';

  const periods = periodStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    code,
    periods,
    limit,
    source,
    boxHost,
    password,
  };
}

async function syncSinglePeriod(
  options: SyncCliOptions,
  periodName: string,
): Promise<void> {
  const periodValue = PERIOD_NAME_MAP[periodName];
  if (!periodValue) {
    console.warn(
      `[Sync] 周期名 "${periodName}" 不支持，跳过。支持: 1m, 5m, 15m, 30m, 60m, 1d`,
    );
    return;
  }

  const sourceCondition = options.source
    ? `AND k.source = '${options.source}'`
    : '';
  const orderAndLimit =
    options.limit > 0
      ? `ORDER BY k.timestamp DESC, CASE WHEN k.source = 'qmt' THEN 0 ELSE 1 END LIMIT ${options.limit * 2}`
      : `ORDER BY k.timestamp ASC, CASE WHEN k.source = 'qmt' THEN 0 ELSE 1 END`;

  const sql = `
    SELECT 
      UNIX_TIMESTAMP(k.timestamp) * 1000 AS timeMs,
      k.open, k.high, k.low, k.close, k.volume, k.amount
    FROM k
    JOIN securities s ON k.security_id = s.id
    WHERE s.code = '${options.code}'
      AND k.period = ${periodValue}
      ${sourceCondition}
    ${orderAndLimit};
  `
    .replace(/\s+/g, ' ')
    .trim();

  const limitDesc =
    options.limit > 0 ? `最多 ${options.limit} 根` : `全量最大存储范围`;
  console.log(
    `[Sync] 正在从 ${options.boxHost} 拉取 ${options.code} [${periodName}] (${limitDesc})...`,
  );

  let rawOutput = '';
  const escapedPassword = (options.password || 'change-me-root').replace(
    /'/g,
    "'\\''",
  );
  try {
    rawOutput = execSync(
      `ssh ${options.boxHost} "docker exec -i -e MYSQL_PWD='${escapedPassword}' mist-mysql mysql -uroot mist --batch --raw"`,
      {
        input: sql,
        maxBuffer: 100 * 1024 * 1024,
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
  } catch (err: any) {
    console.error(`[Sync] SSH 命令执行失败:`, err.message);
    console.error(
      `请检查: 1. ssh mist-box 是否可达; 2. 宿主 Docker mist-mysql 是否处于运行状态。`,
    );
    return;
  }

  const lines = rawOutput.trim().split('\n').filter(Boolean);
  if (lines.length <= 1) {
    console.warn(
      `[Sync] 未查到标的 ${options.code} [${periodName}] 的数据，请核对代码或数据源。`,
    );
    return;
  }

  // 第一行是列名，过滤并提取原始列表
  const rawRows = lines.slice(1).map((line, idx) => {
    const [timeMs, open, high, low, close, volume, amount] = line.split('\t');
    return {
      id: idx + 1,
      symbol: options.code,
      time: new Date(Number(timeMs)).toISOString(),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: volume && volume !== 'NULL' ? volume : null,
      amount: amount && amount !== 'NULL' ? amount : null,
    };
  });

  // 去重 (若多源重叠，保留第一个高优先级源) 并确保时间严格单调
  const seenTime = new Set<string>();
  let rows: typeof rawRows = [];
  for (const r of rawRows) {
    if (!seenTime.has(r.time)) {
      seenTime.add(r.time);
      rows.push(r);
    }
  }

  // 若按倒序限制了条数，截取后反转回时间升序
  if (options.limit > 0) {
    rows = rows.slice(0, options.limit).reverse();
  }

  // 重新编排统一连续序号
  rows.forEach((r, idx) => {
    r.id = idx + 1;
  });

  const outDir = path.resolve(__dirname, 'data/kline');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${options.code}_${periodName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));

  console.log(
    `[Sync] 成功缓存 ${rows.length} 根严格时序 K 线至: ${path.relative(process.cwd(), outFile)}`,
  );
}

async function main() {
  const options = parseCliArgs();
  console.log(`====================================================`);
  console.log(` 远程行情抽取工具 (Target: ${options.boxHost})`);
  console.log(` 标的: ${options.code} | 周期: ${options.periods.join(', ')}`);
  console.log(`====================================================`);

  for (const period of options.periods) {
    await syncSinglePeriod(options, period);
  }

  console.log(`\n[Sync] 全部周期同步完毕！现在可以运行:`);
  console.log(
    `  pnpm dev:strategy --code ${options.code} --period ${options.periods[0]}`,
  );
}

main().catch((err) => {
  console.error('[Sync] 致命错误:', err);
  process.exit(1);
});
