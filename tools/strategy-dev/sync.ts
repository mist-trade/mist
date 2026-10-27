#!/usr/bin/env node
/**
 * 远程行情数据同步工具 (通过 SSH 从 mist-box 拉取并本地持久化)
 *
 * 行情同步（canonical SplicePolicy 分段拼接，k_quality 质量掩码置 null）:
 *   pnpm dev:sync --code 000001 --periods 1d,30m,5m
 *   pnpm dev:sync --code 000001 --periods 30m --limit 3000
 *
 * 存量策略定义导出（本地重放用，含私有插件参数，仅存 gitignored 本地目录）:
 *   pnpm dev:sync --definition 23
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveSegments } from '@app/market-data';
import { CanonicalPolicyLoader } from '@app/strategy';
import { PERIOD_NAME_MAP } from './provider';

interface SyncCliOptions {
  code: string;
  periods: string[];
  limit: number;
  definitionId?: number;
  /** k_quality 掩码降级（默认关：裸值透传 = 与生产回测对账口径一致） */
  maskQuality?: boolean;
  /** 用户是否显式传了 --code / --periods（决定 --definition 模式是否附带行情同步） */
  codeExplicit: boolean;
  periodsExplicit: boolean;
  boxHost?: string;
  password?: string;
}

const BEIJING_OFFSET_MS = 8 * 3600 * 1000;
/** 单文件行数超过该阈值时改用紧凑 JSON（971k 行 pretty-print 约 400MB 不可接受） */
const COMPACT_JSON_ROW_THRESHOLD = 50_000;
/** SSH 单次拉取的年份分片跨度（5m 一年 ≈ 46k 行，远低于 maxBuffer 预算） */
const CHUNK_YEARS = 1;
const CHUNK_START_YEAR = 1996; // A 股现代样本边界（涨跌停 + T+1 制度确立）

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
  const hasArg = (name: string): boolean =>
    args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

  const rawDefinition = getArg('definition');
  const codeExplicit = hasArg('code');
  const periodsExplicit = hasArg('periods') || hasArg('period');
  const rawCode = getArg('code') || '000001';
  const code = rawCode.replace(/\.(SH|SZ|BJ|sh|sz|bj)$/, '');
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
    ...(rawDefinition ? { definitionId: Number(rawDefinition) } : {}),
    ...(hasArg('mask-quality') ? { maskQuality: true } : {}),
    codeExplicit,
    periodsExplicit,
    boxHost,
    password,
  };
}

function formatBeijing(date: Date): string {
  return new Date(date.getTime() + BEIJING_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function runMysqlBatch(options: SyncCliOptions, sql: string): string {
  const escapedPassword = (options.password || 'change-me-root').replace(
    /'/g,
    "'\\''",
  );
  return execSync(
    `ssh ${options.boxHost} "docker exec -i mist-mysql mysql -uroot -p${escapedPassword} mist --batch --raw"`,
    {
      input: sql,
      maxBuffer: 200 * 1024 * 1024,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'ignore'],
    },
  );
}

interface QualityRawRow {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;
  source: string;
}

/**
 * k_quality 掩码行处理：
 * - 默认（maskQuality=false）裸值透传 —— 与生产回测完全一致（生产 canonical
 *   回放不消费 k_quality，掩码会与 run 对账分叉）；
 * - `--mask-quality` 时按掩码降级：任一 OHLC 掩码失效 → 整行丢弃；
 *   volume/amount 掩码失效 → 字段置 null（因子插件按 null 契约降级）；
 * - 无 k_quality 行（LEFT JOIN 为 NULL）→ 全字段有效。
 */
function mapQualityRow(
  parts: string[],
  maskQuality: boolean,
): QualityRawRow | null {
  const [
    timeMsStr,
    open,
    high,
    low,
    close,
    volume,
    amount,
    source,
    openValid,
    highValid,
    lowValid,
    closeValid,
    volumeValid,
    amountValid,
  ] = parts;
  const validOrOne = (v: string | undefined): number =>
    v === undefined || v === '' || v === 'NULL' ? 1 : Number(v);
  if (
    maskQuality &&
    (validOrOne(openValid) === 0 ||
      validOrOne(highValid) === 0 ||
      validOrOne(lowValid) === 0 ||
      validOrOne(closeValid) === 0)
  ) {
    return null;
  }
  const nullIfInvalid = (
    raw: string | undefined,
    valid: string | undefined,
  ): string | null => {
    if (!maskQuality) return raw && raw !== 'NULL' ? raw : null;
    return validOrOne(valid) === 0 ? null : raw && raw !== 'NULL' ? raw : null;
  };
  return {
    timeMs: Number(timeMsStr),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: nullIfInvalid(volume, volumeValid),
    amount: nullIfInvalid(amount, amountValid),
    source: source && source !== 'NULL' ? source : 'unknown',
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

  const policy = CanonicalPolicyLoader.load();
  const segments = resolveSegments(policy, options.code, periodValue);
  const limitDesc =
    options.limit > 0 ? `最多 ${options.limit} 根` : `全量最大存储范围`;
  console.log(
    `[Sync] 正在从 ${options.boxHost} 拉取 ${options.code} [${periodName}] (${limitDesc}, ${segments.length} 段拼接, 按年分片)...`,
  );

  // 分片拉取：canonical 分段 ∩ 年份桶，消除单次 maxBuffer 溢出
  const thisYear = new Date().getUTCFullYear() + 1;
  const chunks: { source: string; from: Date; before: Date }[] = [];
  for (const segment of segments) {
    const segStartYear = segment.from
      ? new Date(segment.from.getTime() + BEIJING_OFFSET_MS).getUTCFullYear()
      : CHUNK_START_YEAR;
    const segEndYear = segment.before
      ? new Date(segment.before.getTime() + BEIJING_OFFSET_MS).getUTCFullYear()
      : thisYear;
    const startYear = Math.max(CHUNK_START_YEAR, segStartYear);
    for (let y = startYear; y < segEndYear; y += CHUNK_YEARS) {
      const yearStart = new Date(Date.UTC(y, 0, 1) - BEIJING_OFFSET_MS);
      const yearEnd = new Date(
        Date.UTC(y + CHUNK_YEARS, 0, 1) - BEIJING_OFFSET_MS,
      );
      const from =
        segment.from && segment.from > yearStart ? segment.from : yearStart;
      const before =
        segment.before && segment.before < yearEnd ? segment.before : yearEnd;
      if (from >= before) continue;
      chunks.push({ source: segment.source, from, before });
    }
  }

  const seenTime = new Set<string>();
  const collected: QualityRawRow[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const parts = [`k.source = '${chunk.source}'`];
    parts.push(`k.timestamp >= '${formatBeijing(chunk.from)}'`);
    parts.push(`k.timestamp < '${formatBeijing(chunk.before)}'`);
    const sql = `
      SELECT
        UNIX_TIMESTAMP(k.timestamp) * 1000 AS timeMs,
        k.open, k.high, k.low, k.close, k.volume, k.amount,
        k.source,
        q.open_valid, q.high_valid, q.low_valid, q.close_valid,
        q.volume_valid, q.amount_valid
      FROM k
      JOIN securities s ON k.security_id = s.id
      LEFT JOIN k_quality q ON q.k_id = k.id
      WHERE s.code = '${options.code}'
        AND k.period = ${periodValue}
        AND (${parts.join(' AND ')})
      ORDER BY k.timestamp ASC;
    `
      .replace(/\s+/g, ' ')
      .trim();
    process.stdout.write(
      `[Sync] 分片 ${i + 1}/${chunks.length} [${chunk.source}] ${formatBeijing(chunk.from).slice(0, 10)} ~ ${formatBeijing(chunk.before).slice(0, 10)} ...`,
    );
    let rawOutput = '';
    try {
      rawOutput = runMysqlBatch(options, sql);
    } catch (err: any) {
      console.error(` 失败`);
      console.error(`[Sync] SSH 命令执行失败:`, err.message);
      console.error(
        `请检查: 1. ssh ${options.boxHost} 是否可达; 2. 宿主 Docker mist-mysql 是否处于运行状态。`,
      );
      return;
    }
    const lines = rawOutput.trim().split('\n').filter(Boolean);
    let added = 0;
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (cols.length < 8) continue;
      const row = mapQualityRow(cols, options.maskQuality === true);
      if (!row) continue;
      const timeKey = String(row.timeMs);
      if (seenTime.has(timeKey)) continue;
      seenTime.add(timeKey);
      collected.push(row);
      added += 1;
    }
    console.log(` +${added} 行`);
  }

  if (collected.length === 0) {
    console.warn(
      `[Sync] 未查到标的 ${options.code} [${periodName}] 的数据，请核对代码或数据源。`,
    );
    return;
  }

  // 时间严格升序整理
  collected.sort((a, b) => a.timeMs - b.timeMs);
  let rows = collected;
  if (options.limit > 0) {
    rows = rows.slice(Math.max(0, rows.length - options.limit));
  }

  const outRows = rows.map((r, idx) => ({
    id: idx + 1,
    symbol: options.code,
    time: new Date(r.timeMs).toISOString(),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    amount: r.amount,
    source: r.source,
  }));

  const outDir = path.resolve(__dirname, 'data/kline');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${options.code}_${periodName}.json`);
  const compact = outRows.length > COMPACT_JSON_ROW_THRESHOLD;
  fs.writeFileSync(
    outFile,
    compact ? JSON.stringify(outRows) : JSON.stringify(outRows, null, 2),
  );

  const firstTime = outRows[0]?.time ?? '-';
  const lastTime = outRows[outRows.length - 1]?.time ?? '-';
  console.log(
    `[Sync] 成功缓存 ${outRows.length} 根严格时序 K 线 (${firstTime} ~ ${lastTime}${compact ? ', 紧凑 JSON' : ''}): ${path.relative(process.cwd(), outFile)}`,
  );
}

async function exportDefinition(
  options: SyncCliOptions,
  definitionId: number,
): Promise<void> {
  console.log(
    `[Sync] 正在导出存量策略定义 ${definitionId}（含私有插件参数，仅存本地 gitignored 目录）...`,
  );

  const defOutput = runMysqlBatch(
    options,
    `SELECT id, name, kind, status FROM strategy_definitions WHERE id = ${definitionId};`,
  );
  const defLines = defOutput.trim().split('\n').filter(Boolean);
  if (defLines.length <= 1) {
    console.error(`[Sync] 未找到 definition id=${definitionId}。`);
    return;
  }
  const name = defLines[1].split('\t')[1];
  const kind = defLines[1].split('\t')[2];

  const verOutput = runMysqlBatch(
    options,
    `SELECT id, version_number, rule, signal_kind FROM strategy_versions WHERE strategy_definition_id = ${definitionId} ORDER BY version_number DESC;`,
  );
  const verLines = verOutput.trim().split('\n').filter(Boolean);
  if (verLines.length <= 1) {
    console.error(
      `[Sync] definition id=${definitionId} 无任何版本（strategy_versions 为空）。`,
    );
    return;
  }
  // 取最新版本（DESC 第一行）；rule 为 JSON 列，--raw 输出为紧凑 JSON 文本
  const header = verLines[0].split('\t');
  const col = (columnName: string): number => header.indexOf(columnName);
  const latest = verLines[1].split('\t');
  let rule: unknown;
  try {
    rule = JSON.parse(latest[col('rule')]);
  } catch (err: any) {
    console.error(`[Sync] rule JSON 解析失败:`, err.message);
    return;
  }

  const versionNumber = Number(latest[col('version_number')]) || 1;
  const outDir = path.resolve(__dirname, '../../.data/strategy-definitions');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${definitionId}_v${versionNumber}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        definitionId,
        name,
        kind,
        versionNumber,
        ...(latest[col('signal_kind')]
          ? { signalKind: latest[col('signal_kind')] }
          : {}),
        rule,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `[Sync] 定义 ${definitionId} v${versionNumber} 已导出: ${path.relative(process.cwd(), outFile)}`,
  );
  console.log(
    `[Sync] ⚠️ 该文件含私有插件参数与树形态：仅存本地（.data 已 gitignore），严禁提交/外传/贴对话。`,
  );
}

async function main() {
  const options = parseCliArgs();
  console.log(`====================================================`);
  console.log(` 远程行情抽取工具 (Target: ${options.boxHost})`);
  if (options.definitionId) {
    console.log(` 存量定义导出: definitionId=${options.definitionId}`);
  }
  console.log(` 标的: ${options.code} | 周期: ${options.periods.join(', ')}`);
  console.log(`====================================================`);

  if (options.definitionId) {
    await exportDefinition(options, options.definitionId);
  }

  // 仅 --definition（未显式给 --code/--periods）时跳过行情同步
  const skipKlineSync =
    options.definitionId && !options.codeExplicit && !options.periodsExplicit;
  if (!skipKlineSync) {
    for (const period of options.periods) {
      await syncSinglePeriod(options, period);
    }
  }

  if (options.definitionId) {
    console.log(
      `\n[Sync] 定义导出完毕！dev server 回测可直接传 strategyDefinitionId=${options.definitionId} 本地重放。`,
    );
    return;
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
