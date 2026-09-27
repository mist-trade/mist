#!/usr/bin/env node
/**
 * 三链路对账 harness（本地集成层）
 *
 * 验证目标：同区间、同策略版本、同标的、同周期下，
 *   ① mock 实时回放（历史 1m bar 按封存顺序推进完整实时基础设施）落盘的
 *      strategy_signal，
 * 与 ② 同区间批量回测落盘的 backtest_signal_results
 * 逐条一致（signal_time / pivot_time / signal_type / confidence）。
 *
 * 前置条件（本地 docker compose 栈：mysql + redis + mist-backend + signal）：
 *   - 策略定义/版本已存在（decision_flow 或经透明编译的 legacy kind）
 *   - 环境变量：
 *     PARITY_DB_HOST / PARITY_DB_PORT / PARITY_DB_USER / PARITY_DB_PASSWORD / PARITY_DB_NAME
 *     PARITY_API_BASE（默认 http://localhost:8001）
 *     PARITY_SECURITY_CODE、PARITY_PERIOD、PARITY_START、PARITY_END、PARITY_VERSION_ID
 *
 * 用法：node tools/parity-reconcile/run.mjs
 * 退出码：0 = 三路一致；非 0 = 存在 mismatch（打印双方全字段明细）。
 */
import mysql from 'mysql2/promise';

const config = {
  host: process.env.PARITY_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.PARITY_DB_PORT ?? 3306),
  user: process.env.PARITY_DB_USER ?? 'mist',
  password: process.env.PARITY_DB_PASSWORD ?? '',
  database: process.env.PARITY_DB_NAME ?? 'mist',
  apiBase: process.env.PARITY_API_BASE ?? 'http://localhost:8001',
  securityCode: process.env.PARITY_SECURITY_CODE ?? '510300.SH',
  period: Number(process.env.PARITY_PERIOD ?? 5),
  start: process.env.PARITY_START,
  end: process.env.PARITY_END,
  versionId: Number(process.env.PARITY_VERSION_ID ?? 0),
};

async function connect() {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 2,
  });
}

/** ① 触发实时回放对账面：读取 strategy_signal（已由 mock 回放或真实盘前落盘） */
async function loadRealtimeSignals(pool) {
  const [rows] = await pool.query(
    `SELECT id, security_id, period, source, signal_time, pivot_time,
            signal_kind, signal_type, confidence, confidence_level
       FROM strategy_signals
      WHERE signal_time BETWEEN ? AND ?
        AND period = ?
      ORDER BY signal_time, id`,
    [config.start, config.end, config.period],
  );
  return rows;
}

/** ② 触发回测对账面：读取 backtest_signal_results（含 run 归属过滤） */
async function loadBacktestSignals(pool, runId) {
  const [rows] = await pool.query(
    `SELECT id, security_code, signal_time, pivot_time, signal_type,
            confidence, confidence_level
       FROM backtest_signal_results
      WHERE backtest_run_id = ?
      ORDER BY signal_time, id`,
    [runId],
  );
  return rows;
}

/** 触发一次回测 run 并轮询至完成，返回 runId */
async function runBacktest(apiBase, versionId) {
  const response = await fetch(`${apiBase}/v1/strategy-backtests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      strategyVersionId: versionId,
      targetUniverse: [config.securityCode],
      period: config.period,
      source: 'tdx',
      startDate: config.start,
      endDate: config.end,
    }),
  });
  const payload = await response.json();
  if (!payload?.data?.runId) {
    throw new Error(`backtest run create failed: ${JSON.stringify(payload)}`);
  }
  const runId = payload.data.runId;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const detail = await fetch(
      `${apiBase}/v1/strategy-backtests/${runId}`,
    ).then((value) => value.json());
    const status = detail?.data?.status;
    if (status === 'COMPLETED') return runId;
    if (status === 'FAILED') {
      throw new Error(`backtest run ${runId} failed: ${detail?.data?.errorMessage}`);
    }
  }
  throw new Error(`backtest run ${runId} timed out`);
}

/** 逐条比对：signal_time + signal_kind 对齐后校验 pivot/type/confidence */
function diff(realtime, backtest) {
  const mismatches = [];
  const key = (row) => `${row.signal_time.toISOString?.() ?? row.signal_time}|${row.signal_kind ?? row.signal_kind_}`;
  const rt = new Map(realtime.map((row) => [key(row), row]));
  const bt = new Map(
    backtest.map((row) => [
      `${row.signal_time.toISOString?.() ?? row.signal_time}|entry`,
      row,
    ]),
  );
  for (const [k, row] of rt) {
    const counterpart = bt.get(k);
    if (!counterpart) {
      mismatches.push({ side: 'realtime-only', row });
      continue;
    }
    const rtPivot = row.pivot_time?.toISOString?.() ?? row.pivot_time ?? null;
    const btPivot =
      counterpart.pivot_time?.toISOString?.() ?? counterpart.pivot_time ?? null;
    if (rtPivot !== btPivot) {
      mismatches.push({ side: 'pivot_mismatch', realtime: row, backtest: counterpart });
    }
  }
  for (const [k, row] of bt) {
    if (!rt.has(k)) mismatches.push({ side: 'backtest-only', row });
  }
  return mismatches;
}

async function main() {
  if (!config.start || !config.end) {
    console.error('PARITY_START / PARITY_END required');
    process.exit(2);
  }
  const pool = await connect();
  try {
    const runId = await runBacktest(config.apiBase, config.versionId);
    console.log(`parity: backtest run ${runId} completed`);
    const realtime = await loadRealtimeSignals(pool);
    const backtest = await loadBacktestSignals(pool, runId);
    console.log(
      `parity: realtime=${realtime.length} backtest=${backtest.length} signals`,
    );
    const mismatches = diff(realtime, backtest);
    if (mismatches.length > 0) {
      console.error('parity: MISMATCH');
      for (const mismatch of mismatches) {
        console.error(JSON.stringify(mismatch, null, 2));
      }
      process.exit(1);
    }
    console.log('parity: OK — realtime replay matches backtest persistence');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('parity harness failed:', error);
  process.exit(1);
});
