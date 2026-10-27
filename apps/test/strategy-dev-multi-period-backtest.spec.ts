/**
 * dev-server 多周期回测会话级验证（任务 3.5）。
 *
 * 直接复用 tools/strategy-dev/server.ts 导出的 runUnifiedSimulationBacktest
 * （DEV_SERVER_AUTOSTART=false 不启动 HTTP 监听），以真实 provider 数据装载 +
 * InMemoryReplayPort + HistoricalBarSource drive 全链路验证：
 * 1. 单周期（纯 plugin.chan.bsp GUARD）信号时序因果与预热诊断；
 * 2. 多周期（context 插件声明 1440）合并推流与 per-period 预热；
 * 3. context 数据缺失 fail-closed（DATA_MISSING）；
 * 4. 未注册插件 fail-closed（StoredDefinitionCompileError）；
 * 5. 存量定义本地重放（.data/strategy-definitions + definitionVersionLabel）；
 * 6. 未知存量定义 DEFINITION_NOT_FOUND。
 */
process.env.DEV_SERVER_AUTOSTART = 'false';
process.env.SKIP_DEV_PREHEAT = 'true';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SimulationSignal } from '../../libs/strategy/src/simulation/strategy-simulation.types';
import type { HistoricalReplaySummary } from '../../libs/strategy/src/kernel/historical-bar-source';
import type { ExternalFactorPluginLoader as LoaderType } from '../../libs/strategy/src/factor/external-plugin-loader';

interface BacktestResult {
  signals: readonly SimulationSignal[];
  replay?: HistoricalReplaySummary;
  definitionVersionLabel?: string;
}

const WORKTREE_ROOT = path.resolve(__dirname, '../..');
const KLINE_DIR = path.join(WORKTREE_ROOT, 'tools/strategy-dev/data/kline');
const DEFINITIONS_DIR = path.join(WORKTREE_ROOT, '.data/strategy-definitions');

const SYMBOL = 'TESTDP';
const TRADING_DAYS = 60;

function tradingDayISO(index: number): string {
  // 2026-01-05 周一起连续跳过周末的交易日
  const base = new Date('2026-01-05T00:00:00+08:00').getTime();
  const cursor = new Date(base);
  let counted = 0;
  while (counted < index) {
    cursor.setTime(cursor.getTime() + 24 * 3600_000);
    const day = cursor.getUTCDay(); // 以 +08 表示的 00:00 → UTC 前一日 16:00，仍对应当日本地星期
    // 修正：cursor 已是本地 00:00 的 +08 表示，UTC day 需换算
    const localDay = new Date(cursor.getTime() + 8 * 3600_000).getUTCDay();
    void day;
    if (localDay !== 0 && localDay !== 6) counted += 1;
  }
  return cursor.toISOString().replace('Z', '');
}

function klineRow(id: number, symbol: string, time: string, close: number) {
  return {
    id,
    symbol,
    time,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: '1000',
    amount: '100000',
    source: 'qmt',
  };
}

function buildFixtures(): { dayMidnights: string[] } {
  const dayMidnights: string[] = [];
  const bars30m: Record<string, unknown>[] = [];
  const bars1440: Record<string, unknown>[] = [];
  let id = 1;
  for (let d = 0; d < TRADING_DAYS; d++) {
    const midnight = tradingDayISO(d);
    dayMidnights.push(midnight);
    // 日线：标签 = 当日 00:00（+08）
    bars1440.push(
      klineRow(id++, SYMBOL, `${midnight.slice(0, 19)}+08:00`, 100 + d),
    );
    // 30m：右标槽末（10:00..15:00），跳过午休（11:30 后直落 13:30）
    const slotLabels = [
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
    ];
    for (const slot of slotLabels) {
      bars30m.push(
        klineRow(
          id++,
          SYMBOL,
          `${midnight.slice(0, 11)}${slot}:00+08:00`,
          100 + d + Math.random() * 0.1,
        ),
      );
    }
  }
  fs.mkdirSync(KLINE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(KLINE_DIR, `${SYMBOL}_30m.json`),
    JSON.stringify(bars30m),
  );
  fs.writeFileSync(
    path.join(KLINE_DIR, `${SYMBOL}_1d.json`),
    JSON.stringify(bars1440),
  );
  return { dayMidnights };
}

function writeTestPlugin(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const body = `
    const plugin = {
      id: 'plugin.test.daily-context',
      name: 'test daily context',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'session test plugin',
      resolveContextRequirements: () => ({ 1440: 5 }),
      evaluate: async () => ({ action: 'NEUTRAL', confidence: 0.5, reason: 'noop' }),
    };
    module.exports = { plugins: [plugin] };
  `;
  fs.writeFileSync(path.join(dir, 'index.js'), body);
}

describe('dev server multi-period backtest (session level)', () => {
  let pluginTmpDir: string;
  let dayMidnights: string[];
  let serverModule: {
    runUnifiedSimulationBacktest: (
      options: Record<string, unknown>,
    ) => Promise<BacktestResult>;
  };
  let loader: typeof LoaderType;

  beforeAll(async () => {
    ({ dayMidnights } = buildFixtures());
    pluginTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-test-plugins-'));
    writeTestPlugin(pluginTmpDir);
    // 模块导入在 env 变量之后（CommonJS require 经 ts-jest 动态解析）
    serverModule = (await import(
      '../../tools/strategy-dev/server'
    )) as unknown as {
      runUnifiedSimulationBacktest: (
        options: Record<string, unknown>,
      ) => Promise<BacktestResult>;
    };
    ({ ExternalFactorPluginLoader: loader } = (await import(
      '../../libs/strategy/src/factor/external-plugin-loader'
    )) as unknown as {
      ExternalFactorPluginLoader: typeof LoaderType;
    });
    // 仅加载测试插件（custom paths 覆盖默认私仓探测，测试密闭化）
    loader.setCustomPaths([pluginTmpDir]);
  });

  afterAll(() => {
    loader.resetConfiguration();
    fs.rmSync(path.join(KLINE_DIR, `${SYMBOL}_30m.json`), { force: true });
    fs.rmSync(path.join(KLINE_DIR, `${SYMBOL}_1d.json`), { force: true });
    fs.rmSync(DEFINITIONS_DIR, { recursive: true, force: true });
    fs.rmSync(pluginTmpDir, { recursive: true, force: true });
  });

  it('A1 单周期：chan.bsp GUARD 全链路 drive，信号因果与预热诊断', async () => {
    const startDate = `${dayMidnights[45].slice(0, 19)}+08:00`;
    const result = await serverModule.runUnifiedSimulationBacktest({
      code: SYMBOL,
      period: 30,
      startDate,
      mode: 'single',
      pluginId: 'plugin.chan.bsp',
      initialCash: 1_000_000,
    });

    expect(result.replay).toBeDefined();
    expect(result.replay!.prewarmStatus).toBe('full');
    expect(result.replay!.perPeriodPrewarm).toHaveLength(1);
    expect(result.replay!.perPeriodPrewarm[0].period).toBe(30);
    expect(result.replay!.perPeriodPrewarm[0].status).toBe('full');

    // 双时间戳因果：信号时间严格单调不减，且都落在公开相（>= startDate）
    const startMs = new Date(startDate).getTime();
    let last = 0;
    for (const sig of result.signals) {
      const t = new Date(sig.signalTime).getTime();
      expect(t).toBeGreaterThanOrEqual(startMs);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it('A2 多周期：context 插件声明 1440 → k 路归并 + per-period 预热', async () => {
    const startDate = `${dayMidnights[45].slice(0, 19)}+08:00`;
    const result = await serverModule.runUnifiedSimulationBacktest({
      code: SYMBOL,
      period: 30,
      startDate,
      mode: 'single',
      pluginId: 'plugin.test.daily-context',
      initialCash: 1_000_000,
    });

    expect(result.replay).toBeDefined();
    const periods = result.replay!.perPeriodPrewarm.map((p) => p.period);
    expect(periods).toEqual(expect.arrayContaining([30, 1440]));
    const daily = result.replay!.perPeriodPrewarm.find(
      (p) => p.period === 1440,
    );
    expect(daily!.status).toBe('full');
    expect(daily!.actual).toBeGreaterThanOrEqual(5);
  });

  it('A3 context 数据缺失 → fail-closed DATA_MISSING', async () => {
    const dailyFile = path.join(KLINE_DIR, `${SYMBOL}_1d.json`);
    fs.rmSync(dailyFile, { force: true });
    try {
      await expect(
        serverModule.runUnifiedSimulationBacktest({
          code: SYMBOL,
          period: 30,
          startDate: `${dayMidnights[45].slice(0, 19)}+08:00`,
          mode: 'single',
          pluginId: 'plugin.test.daily-context',
        }),
      ).rejects.toMatchObject({ code: 'DATA_MISSING' });
    } finally {
      // 重建供后续用例
      const bars1440: Record<string, unknown>[] = [];
      for (let d = 0; d < TRADING_DAYS; d++) {
        bars1440.push(
          klineRow(
            d + 1,
            SYMBOL,
            `${dayMidnights[d].slice(0, 19)}+08:00`,
            100 + d,
          ),
        );
      }
      fs.writeFileSync(dailyFile, JSON.stringify(bars1440));
    }
  });

  it('A4 未注册插件 → StoredDefinitionCompileError fail-closed', async () => {
    await expect(
      serverModule.runUnifiedSimulationBacktest({
        code: SYMBOL,
        period: 30,
        startDate: `${dayMidnights[45].slice(0, 19)}+08:00`,
        mode: 'single',
        pluginId: 'plugin.test.missing',
      }),
    ).rejects.toMatchObject({
      name: 'StoredDefinitionCompileError',
      code: 'DECISION_FLOW_RULE_INVALID',
    });
  });

  it('A5 存量定义本地重放：definitionVersionLabel 与编译产物生效', async () => {
    fs.mkdirSync(DEFINITIONS_DIR, { recursive: true });
    const definition = {
      kind: 'decision_flow',
      signalKind: 'entry',
      rule: {
        requiredBarCount: 300,
        rootNode: {
          id: 'guard_test_daily_context',
          type: 'GUARD',
          name: 'test gate',
          pluginId: 'plugin.test.daily-context',
          params: {},
          requiredAction: 'BOTH',
          minConfidence: 0.5,
          onPass: {
            id: 'term_pass',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'TEST_CTX',
            reason: 'pass',
          },
          onFail: {
            id: 'term_fail',
            type: 'TERMINAL',
            action: 'ABORT',
            reason: 'fail',
          },
        },
      },
    };
    fs.writeFileSync(
      path.join(DEFINITIONS_DIR, `${9001}_v1.json`),
      JSON.stringify(definition),
    );

    const result = await serverModule.runUnifiedSimulationBacktest({
      code: SYMBOL,
      period: 30,
      startDate: `${dayMidnights[45].slice(0, 19)}+08:00`,
      strategyDefinitionId: 9001,
    });

    expect(result.definitionVersionLabel).toBe('9001_v1');
    const periods = result.replay!.perPeriodPrewarm.map((p) => p.period);
    expect(periods).toEqual(expect.arrayContaining([30, 1440]));
  });

  it('A6 未知存量定义（非内置 1/2/3）→ DEFINITION_NOT_FOUND', async () => {
    await expect(
      serverModule.runUnifiedSimulationBacktest({
        code: SYMBOL,
        period: 30,
        startDate: `${dayMidnights[45].slice(0, 19)}+08:00`,
        strategyDefinitionId: 9999,
      }),
    ).rejects.toMatchObject({ code: 'DEFINITION_NOT_FOUND' });
  });
});
