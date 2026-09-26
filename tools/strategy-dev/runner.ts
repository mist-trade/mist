#!/usr/bin/env node
/**
 * 本地策略 Dev 极速运行与回测评估器 (CLI 终端版)
 *
 * 用法:
 *   # 直接跑存量黄金快照 (无需任何网络)
 *   pnpm dev:strategy --case maotai-2024-2026
 *
 *   # 跑本地同步的股票缓存
 *   pnpm dev:strategy --code 600519 --period 30m
 */

import {
  ChanCore,
  ChannelType,
  type ChanChannel,
  type ChanDivergenceZhongshu,
  type ChanK,
} from '@app/chancore';
import { DynamicTacticsLoader } from '../../libs/strategy/src/tactics/dynamic-tactics-loader';
import {
  TacticalQuadrant,
  type TacticalQuadrantDecision,
  type ChanTacticsContext,
} from '../../libs/strategy/src/tactics/contracts/chan-four-quadrant-tactics.interface';
import {
  loadCanonicalKlines,
  listAvailableDatasets,
  type KLineLoadOptions,
} from './provider';

function toDivergenceZhongshu(c: ChanChannel): ChanDivergenceZhongshu {
  const units = c.bis;
  const first = units.length >= 4 ? units[1] : units[0];
  let last = units[units.length - 1];
  if (
    c.type === ChannelType.Complete &&
    units.length >= 5 &&
    units.length % 2 === 1
  ) {
    last = units[units.length - 2];
  }
  return {
    firstUnitTime: first ? first.startTime : units[0].startTime,
    lastUnitTime: last ? last.endTime : units[units.length - 1].endTime,
    zg: c.zg,
    zd: c.zd,
    gg: c.gg,
    dd: c.dd,
  };
}

interface RunnerCliOptions extends KLineLoadOptions {
  subPeriod?: string;
  parentPeriod?: string;
  initialCapital?: number;
}

function parseCliArgs(): RunnerCliOptions {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = args.find((a) => a.startsWith(prefix));
    if (found) return found.substring(prefix.length);
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return undefined;
  };

  const caseKey = getArg('case') || getArg('caseKey');
  const code = getArg('code') || (!caseKey ? '600519' : undefined);
  const period = getArg('period') || (!caseKey ? '30m' : undefined);
  const subPeriod = getArg('subPeriod') || getArg('sub');
  const parentPeriod = getArg('parentPeriod') || getArg('parent');
  const initialCapitalStr = getArg('capital') || '100000';

  return {
    caseKey,
    code,
    period,
    subPeriod,
    parentPeriod,
    initialCapital: Number(initialCapitalStr) || 100000,
  };
}

async function runStrategyDev(): Promise<void> {
  const startTime = Date.now();
  const options = parseCliArgs();

  let klines: ChanK[] = [];
  try {
    klines = loadCanonicalKlines(options);
  } catch (err: any) {
    console.error(`\n❌ 数据加载失败: ${err.message}`);
    console.log(`\n💡 本地当前可用的数据集清单:`);
    const available = listAvailableDatasets();
    console.table(
      available.map((d) => ({
        类型: d.type === 'fixture' ? '存量黄金快照' : '增量本地缓存',
        '用例/标的': d.key,
        代码: d.symbol,
        周期: d.period,
      })),
    );
    return;
  }

  // 1. 加载私有交易法宝 (或回退标准实现)
  const tactics = DynamicTacticsLoader.reloadTactics();
  const meta = DynamicTacticsLoader.getActiveMetadata();

  console.log(
    `\n╔════════════════════════════════════════════════════════════════════════╗`,
  );
  console.log(
    `║                   MIST STRATEGY LOCAL DEV RUNNER                       ║`,
  );
  console.log(
    `╚════════════════════════════════════════════════════════════════════════╝`,
  );
  console.log(` 战术引擎: ${tactics.name} (${tactics.id} v${tactics.version})`);
  console.log(
    ` 战术来源: ${meta.isPrivate ? '🔒 个人私有法宝 (private)' : '🌐 标准开源战术 (default)'}`,
  );
  console.log(
    ` 标的代码: ${klines[0]?.symbol || options.code || options.caseKey} | 样本 K 线数: ${klines.length} 根`,
  );
  console.log(
    ` 时间区间: ${klines[0]?.time.toISOString().substring(0, 10)} ~ ${klines[klines.length - 1]?.time.toISOString().substring(0, 10)}`,
  );
  console.log(
    `────────────────────────────────────────────────────────────────────────`,
  );

  // 2. 缠论形态极速求解 (基于 Rust nodejs-polars)
  const t0 = Date.now();
  const mergedK = ChanCore.mergeK(klines);
  const biResult = ChanCore.createBi(klines);
  const duans = ChanCore.createDuan(biResult.phaseB);
  const channels = ChanCore.createChannels(klines);
  const duanChannels = ChanCore.createDuanChannels(duans);
  const chanCalcDuration = Date.now() - t0;

  console.log(
    ` 缠论形态: 合并K ${mergedK.length} | 笔 ${biResult.phaseB.length} | 段 ${duans.length} | 笔中枢 ${channels.phaseB.length} | 段中枢 ${duanChannels.phaseB.length} (耗时 ${chanCalcDuration}ms)`,
  );
  console.log(
    `────────────────────────────────────────────────────────────────────────\n`,
  );

  // 3. 跨周期穿透支持 (若有上一级别或次级别)
  let parentKlines: ChanK[] | undefined;
  let subKlines: ChanK[] | undefined;
  if (options.parentPeriod && options.code) {
    try {
      parentKlines = loadCanonicalKlines({
        code: options.code,
        period: options.parentPeriod,
      });
    } catch {}
  }
  if (options.subPeriod && options.code) {
    try {
      subKlines = loadCanonicalKlines({
        code: options.code,
        period: options.subPeriod,
      });
    } catch {}
  }

  // 4. 时序滚动判决
  const signals: Array<{
    decision: TacticalQuadrantDecision;
    kIndex: number;
  }> = [];

  const minWindow = 30;
  for (let i = minWindow; i < klines.length; i++) {
    const windowK = klines.slice(0, i + 1);
    const currentK = windowK[windowK.length - 1];
    const currentTime = currentK.time;

    // 过滤截至当前时刻已成形的结构
    const ctx: ChanTacticsContext = {
      symbol: currentK.symbol,
      period: options.period || '30m',
      subPeriod: options.subPeriod,
      parentPeriod: options.parentPeriod,
      klines: windowK,
      parentKlines,
      subKlines,
      bis: biResult.phaseB.filter((b) => b.endTime <= currentTime),
      duans: duans.filter((d) => d.endTime <= currentTime),
      zhongshus: channels.phaseB
        .filter((c) => c.bis[c.bis.length - 1].endTime <= currentTime)
        .map(toDivergenceZhongshu),
      lastPrice: currentK.close,
      timestamp: currentTime,
    };

    const decs: TacticalQuadrantDecision[] = [
      tactics.evaluateLeftBuy(ctx),
      tactics.evaluateRightBuy(ctx),
      tactics.evaluateLeftSell(ctx),
      tactics.evaluateRightSell(ctx),
    ];

    for (const d of decs) {
      if (d && d.triggered) {
        signals.push({ decision: d, kIndex: i });
      }
    }
  }

  // 5. 打印信号明细表
  if (signals.length === 0) {
    console.log(
      `⚠️ 未触发任何买卖点信号。可以尝试放宽 ${tactics.name} 的触发门禁条件。\n`,
    );
  } else {
    console.log(`🎯 触发信号清单 (共 ${signals.length} 条信号):\n`);
    console.table(
      signals.map((s) => ({
        时刻: s.decision.time.toISOString().replace('T', ' ').substring(0, 19),
        象限买卖点: getQuadrantBadge(s.decision.quadrant),
        成交价: s.decision.price.toFixed(2),
        止损位: s.decision.stopLossPrice?.toFixed(2) ?? '--',
        置信度: s.decision.confidence,
        决策归因: s.decision.reason,
      })),
    );
  }

  // 6. 极简模拟撮合统计
  const sim = simulateTrades(signals.map((s) => s.decision));
  console.log(
    `────────────────────────────────────────────────────────────────────────`,
  );
  console.log(` 模拟交易撮合统计:`);
  console.log(
    ` 交易笔数: ${sim.totalTrades} | 胜率: ${sim.winRate.toFixed(1)}% | 盈亏比: ${sim.profitFactor.toFixed(2)} | 累计收益率: ${sim.cumulativeReturn.toFixed(2)}% | 最大回撤: ${sim.maxDrawdown.toFixed(2)}%`,
  );
  console.log(
    `────────────────────────────────────────────────────────────────────────`,
  );
  console.log(`⚡ 全流程总执行耗时: ${Date.now() - startTime}ms\n`);
}

function getQuadrantBadge(quadrant: TacticalQuadrant): string {
  switch (quadrant) {
    case TacticalQuadrant.LeftBuy:
      return '▲ 左侧买点 (1B抄底)';
    case TacticalQuadrant.RightBuy:
      return '▲ 右侧买点 (2B/3B顺势)';
    case TacticalQuadrant.LeftSell:
      return '▼ 左侧卖点 (冲高逃顶)';
    case TacticalQuadrant.RightSell:
      return '▼ 右侧卖点 (破位止损)';
  }
}

interface SimResult {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  cumulativeReturn: number;
  maxDrawdown: number;
}

function simulateTrades(decisions: TacticalQuadrantDecision[]): SimResult {
  let holding = false;
  let buyPrice = 0;
  let totalTrades = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let cumulativeMultiplier = 1.0;
  let peakMultiplier = 1.0;
  let maxDrawdown = 0;

  for (const d of decisions) {
    const isBuy =
      d.quadrant === TacticalQuadrant.LeftBuy ||
      d.quadrant === TacticalQuadrant.RightBuy;
    const isSell =
      d.quadrant === TacticalQuadrant.LeftSell ||
      d.quadrant === TacticalQuadrant.RightSell;

    if (!holding && isBuy) {
      holding = true;
      buyPrice = d.price;
    } else if (holding && isSell && buyPrice > 0) {
      holding = false;
      totalTrades += 1;
      const profitRate = (d.price - buyPrice) / buyPrice;
      cumulativeMultiplier *= 1 + profitRate;
      if (cumulativeMultiplier > peakMultiplier) {
        peakMultiplier = cumulativeMultiplier;
      }
      const dd = (peakMultiplier - cumulativeMultiplier) / peakMultiplier;
      if (dd > maxDrawdown) maxDrawdown = dd;

      if (profitRate > 0) {
        wins += 1;
        grossProfit += profitRate;
      } else {
        grossLoss += Math.abs(profitRate);
      }
      buyPrice = 0;
    }
  }

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;
  const cumulativeReturn = (cumulativeMultiplier - 1) * 100;

  return {
    totalTrades,
    winRate,
    profitFactor,
    cumulativeReturn,
    maxDrawdown: maxDrawdown * 100,
  };
}

runStrategyDev().catch((err) => {
  console.error('[Runner] 运行出错:', err);
  process.exit(1);
});
