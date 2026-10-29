process.env.DEV_SERVER_AUTOSTART = 'false';
process.env.SKIP_DEV_PREHEAT = 'true';

import * as fs from 'fs';
import * as path from 'path';
import { runUnifiedSimulationBacktest } from './server';

interface RunDef {
  name: string;
  label: string;
  options: any;
}

const RUNS: RunDef[] = [
  {
    name: '08_enhanced_def3',
    label: '⑧ 复合-全增强树(def3+战术事件汇聚+孕线保活)',
    options: {
      code: '000001',
      period: 30,
      startDate: '2005-01-04T00:00:00+08:00',
      endDate: '2026-10-26T23:59:59+08:00',
      strategyDefinitionId: 3,
      mode: 'full_resonance',
      enableStopLoss: true,
      initialCash: 1_000_000,
    },
  },
  {
    name: '07_composite_stress',
    label: '⑦ 复合 composite + 五大压力沙盒',
    options: {
      code: '000001',
      period: 30,
      startDate: '2005-01-04T00:00:00+08:00',
      endDate: '2026-10-26T23:59:59+08:00',
      mode: 'composite',
      runStressSuite: true,
      enableStopLoss: true,
      initialCash: 1_000_000,
    },
  },
];

async function main() {
  const targetRun = process.argv[2] || '08_enhanced_def3';
  const outDir = '/tmp/backtest-results/2026-10-28-tactical-containment';
  fs.mkdirSync(outDir, { recursive: true });

  const toRun = RUNS.filter((r) => targetRun === 'all' || r.name === targetRun);
  if (toRun.length === 0) {
    console.error(`Unknown run target: ${targetRun}`);
    process.exit(1);
  }

  for (const item of toRun) {
    console.log(
      `\n================================================================`,
    );
    console.log(`🚀 开始回测任务: ${item.label} (${item.name})`);
    console.log(
      `标的: ${item.options.code} | 周期: ${item.options.period}m | 区间: ${item.options.startDate} ~ ${item.options.endDate}`,
    );
    console.log(
      `================================================================`,
    );

    const t0 = Date.now();
    try {
      const res = await runUnifiedSimulationBacktest(item.options);
      const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

      console.log(`\n✅ ${item.name} 回测完成! 耗时: ${elapsedSec}s`);
      console.log(`- 原始信号数: ${res.signals.length}`);
      console.log(`- 战术事件数: ${res.tacticalEvents?.length ?? 0}`);
      console.log(`- 实际成交笔数: ${res.closedTrades?.length ?? 0}`);
      console.log(`- 最长挫跌时期 (天): ${res.maxUnderwaterDuration ?? 'N/A'}`);
      console.log(`- 绩效指标:`, JSON.stringify(res.performance, null, 2));

      if (res.stressReport) {
        console.log(
          `- 压力测试评级:`,
          res.stressReport.overallRating,
          `健康分:`,
          res.stressReport.overallHealthScore,
        );
        console.table(res.stressReport.scenarioOutcomes);
      }

      const savePayload = {
        name: item.name,
        label: item.label,
        elapsedSeconds: Number(elapsedSec),
        options: item.options,
        performance: res.performance,
        maxUnderwaterDuration: res.maxUnderwaterDuration,
        signalCount: res.signals.length,
        tacticalEventCount: res.tacticalEvents?.length ?? 0,
        tradeCount: res.closedTrades?.length ?? 0,
        trades: res.closedTrades,
        stressReport: res.stressReport,
      };

      const outFile = path.join(outDir, `${item.name}.json`);
      fs.writeFileSync(outFile, JSON.stringify(savePayload, null, 2));
      console.log(`💾 结果已落盘至: ${outFile}`);
    } catch (err: any) {
      console.error(`❌ ${item.name} 运行失败:`, err);
    }
  }
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
