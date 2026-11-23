import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FvgMitigationStatus,
  FvgType,
  PaCore,
  PaK,
  PinBarDirection,
} from '@app/pacore';

const KLINE_DIR =
  process.env.MIST_KLINE_DIR || path.resolve(__dirname, '../.data/kline');

interface RawBar {
  readonly id: number;
  readonly time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: string | number;
  readonly amount?: string | number;
}

function loadBars(fileName: string, limit?: number): PaK[] {
  const filePath = path.join(KLINE_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(
      `⚠️ [inspect-pa] 数据文件未找到: ${filePath}。如需运行真实数据体检，请设置环境变量 MIST_KLINE_DIR。`,
    );
    return [];
  }
  const rawData: RawBar[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const sliced = limit ? rawData.slice(-limit) : rawData;

  return sliced.map((b) => ({
    id: b.id,
    time: new Date(b.time),
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: b.volume ? Number(b.volume) : undefined,
    amount: b.amount ? Number(b.amount) : undefined,
  }));
}

function inspectPeriod(
  name: string,
  fileName: string,
  sampleLimit?: number,
): void {
  console.log(`\n======================================================`);
  console.log(
    `🔍 [纯指标诊断体检] 标的: 上证指数 (${name}) | 样本数: ${sampleLimit ?? '全量'}`,
  );
  console.log(`======================================================`);

  const bars = loadBars(fileName, sampleLimit);
  if (bars.length === 0) {
    console.log(`⏭️ [跳过] 无可用 K 线数据，跳过此周期扫描。`);
    return;
  }
  console.log(
    `📅 时间跨度: ${bars[0].time.toISOString().slice(0, 10)} ~ ${bars[bars.length - 1].time.toISOString().slice(0, 10)} (共 ${bars.length} 根 Bar)`,
  );

  // 1. 失衡缺口 FVG
  const fvgs = PaCore.findFairValueGaps(bars);
  const bullFvgs = fvgs.filter((f) => f.type === FvgType.Bullish);
  const bearFvgs = fvgs.filter((f) => f.type === FvgType.Bearish);

  const testedCount = fvgs.filter(
    (f) => f.status === FvgMitigationStatus.Tested,
  ).length;
  const ceFilledCount = fvgs.filter(
    (f) => f.status === FvgMitigationStatus.CeFilled,
  ).length;
  const invalidatedCount = fvgs.filter(
    (f) => f.status === FvgMitigationStatus.Invalidated,
  ).length;
  const unmitigatedCount = fvgs.filter(
    (f) => f.status === FvgMitigationStatus.Unmitigated,
  ).length;

  console.log(`\n--- 1. FVG (失衡缺口) 统计 ---`);
  console.log(
    `• 总检出失衡缺口数: ${fvgs.length} 条 (看涨: ${bullFvgs.length} | 看跌: ${bearFvgs.length})`,
  );
  console.log(`• 回补状态分布:`);
  console.log(
    `  - 活跃未触及 (Unmitigated): ${unmitigatedCount} (${((unmitigatedCount / fvgs.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  - 触碰 50% CE 轴心反弹有效 (Tested): ${testedCount} (${((testedCount / fvgs.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  - 击穿 CE 但未破外沿 (CeFilled): ${ceFilledCount} (${((ceFilledCount / fvgs.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  - 完全穿透回补失效 (Invalidated): ${invalidatedCount} (${((invalidatedCount / fvgs.length) * 100).toFixed(1)}%)`,
  );

  // 2. Pin Bar (匹诺曹长影针)
  const pinBars = PaCore.findPinBars(bars, { minWickRatio: 0.55 });
  const bullPins = pinBars.filter(
    (p) => p.direction === PinBarDirection.Bullish,
  );
  const bearPins = pinBars.filter(
    (p) => p.direction === PinBarDirection.Bearish,
  );

  console.log(`\n--- 2. Pin Bar (匹诺曹长影针) 统计 ---`);
  console.log(
    `• 检出高置信度长影针: ${pinBars.length} 根 (看涨锤头针: ${bullPins.length} | 看跌流星针: ${bearPins.length})`,
  );
  console.log(
    `• 出现频次密度: 平均每 ${(bars.length / Math.max(1, pinBars.length)).toFixed(1)} 根 Bar 出现一次`,
  );

  // 3. 空间投射抽样展现
  if (bullFvgs.length > 0) {
    const recentBullFvg = bullFvgs[bullFvgs.length - 1];
    const proj = PaCore.calculateProjection(recentBullFvg);

    console.log(`\n--- 3. 最新看涨 FVG 空间投射示例 ---`);
    console.log(`• FVG ID: ${recentBullFvg.id}`);
    console.log(
      `• 失衡区间: [${recentBullFvg.gapBottom.toFixed(2)} ~ ${recentBullFvg.gapTop.toFixed(2)}] (跨度: ${recentBullFvg.gapSize.toFixed(2)} 点)`,
    );
    console.log(
      `• 50% CE 核心轴心: ${recentBullFvg.consequentEncroachment.toFixed(2)} 点`,
    );
    console.log(`• 空间投射目标:`);
    console.log(
      `  - 1:1 对称度量目标 (Measured Move): ${proj.measuredTarget.toFixed(2)} 点`,
    );
    console.log(
      `  - +1.0 SD 第一阻力箱体: ${proj.sdTargets.sd1_0.toFixed(2)} 点`,
    );
    console.log(
      `  - +2.0 SD 机构目标箱体: ${proj.sdTargets.sd2_0.toFixed(2)} 点`,
    );
  }
}

function main(): void {
  console.log(`🚀 启动 @app/pacore 纯技术与指标全量诊断体检`);

  // 1. 扫描日线级别 (1d 全量)
  inspectPeriod('日线 1d', '000001_1d.json');

  // 2. 扫描 30分钟级别 (30m 最近 2500 根)
  inspectPeriod('30分钟 30m', '000001_30m.json', 2500);

  // 3. 扫描 5分钟级别 (5m 最近 2500 根)
  inspectPeriod('5分钟 5m', '000001_5m.json', 2500);

  console.log(`\n✅ 纯指标诊断执行完成。`);
}

main();
