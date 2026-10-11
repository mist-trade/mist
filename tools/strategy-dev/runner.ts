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
 *
 * 架构契约:
 *   严格遵循统一求值内核 (StrategyEvaluationKernel) push 驱动管线，
 *   严禁手写全量计算与事后切片伪循环（杜绝未来函数数据泄漏）。
 */

import type { ChanK } from '@app/chancore';
import {
  createTacticsDecisionFlow,
  type SimulationSignal,
} from '../../libs/strategy/src/simulation';
import {
  StrategyEvaluationKernel,
  type KernelSignal,
} from '../../libs/strategy/src/kernel';
import { mapKernelSignalToSimulationSignal } from '../../libs/strategy/src/simulation/kernel-signal-mapper';
import {
  loadCanonicalKlines,
  listAvailableDatasets,
  PERIOD_NAME_MAP,
  type KLineLoadOptions,
} from './provider';
import { KPriceProjector } from '../../libs/market-data/src/k-price-projector';
import type {
  StrategyBar,
  StrategyMarketSource,
} from '../../libs/market-data/src/strategy-bar';
import { normalizeExternalDecimalText } from '../../libs/decimal/src/decimal8';

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

function resolvePeriod(rawPeriod: any, fallback = 30): number {
  if (typeof rawPeriod === 'number' && !isNaN(rawPeriod) && rawPeriod > 0) {
    return rawPeriod;
  }
  if (typeof rawPeriod === 'string') {
    const trimmed = rawPeriod.trim().toLowerCase();
    if (PERIOD_NAME_MAP[trimmed]) return PERIOD_NAME_MAP[trimmed];
    const parsed = Number(trimmed);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function toStrategyBar(
  rawK: any,
  period: number,
  securityId = 1,
  source: StrategyMarketSource = 'tdx',
): StrategyBar {
  return Object.freeze({
    securityId,
    source,
    period,
    timestamp: new Date(rawK.time || rawK.timestamp),
    open: KPriceProjector(rawK.open),
    high: KPriceProjector(rawK.high),
    low: KPriceProjector(rawK.low),
    close: KPriceProjector(rawK.close),
    volume:
      rawK.volume !== null && rawK.volume !== undefined
        ? normalizeExternalDecimalText(String(rawK.volume))
        : null,
    amount:
      rawK.amount !== null && rawK.amount !== undefined
        ? normalizeExternalDecimalText(String(rawK.amount))
        : null,
    type: 'complete',
  });
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

  const periodNum = resolvePeriod(options.period, 30);
  const securityCode = String(
    klines[0]?.symbol || options.code || options.caseKey || '600519',
  );

  // 1. 初始化标准决策流树
  console.log(
    `\n╔════════════════════════════════════════════════════════════════════════╗`,
  );
  console.log(
    `║                   MIST STRATEGY LOCAL DEV RUNNER                       ║`,
  );
  console.log(
    `╚════════════════════════════════════════════════════════════════════════╝`,
  );
  console.log(` 决策引擎: 生产级策略树 (Decision Flow Tree)`);
  console.log(
    ` 标的代码: ${securityCode} | 周期: ${periodNum}m | 样本 K 线数: ${klines.length} 根`,
  );
  console.log(
    ` 时间区间: ${klines[0]?.time.toISOString().substring(0, 10)} ~ ${klines[klines.length - 1]?.time.toISOString().substring(0, 10)}`,
  );
  console.log(
    `────────────────────────────────────────────────────────────────────────`,
  );

  // 2. 编译策略树与初始化统一求值内核 (StrategyEvaluationKernel)
  const flow = createTacticsDecisionFlow();
  const bars = klines.map((k) => toStrategyBar(k, periodNum));

  const kernel = new StrategyEvaluationKernel({
    securityId: 1,
    securityCode,
    period: periodNum,
    publicFrom: new Date(-8640000000000000), // 全时序流式推演，无静默截断
    plans: [
      {
        definitionId: 0,
        versionId: 0,
        flow,
        ruleSnapshot: Object.freeze({}),
        requiredBarCount: 60,
      },
    ],
  });

  // 3. 逐 Bar 推流驱动内核求值 (生产同构管线，无未来函数泄漏)
  const signals: SimulationSignal[] = [];
  const t0 = Date.now();
  for (const bar of bars) {
    const rawSignals: readonly KernelSignal[] = await kernel.push(bar);
    for (const raw of rawSignals) {
      signals.push(
        mapKernelSignalToSimulationSignal(raw, {
          securityCode,
          period: periodNum,
        }),
      );
    }
  }
  const evalDuration = Date.now() - t0;

  console.log(
    ` 统一求值内核推流完成: ${bars.length} 根 Bar, 触发 ${signals.length} 条信号 (耗时 ${evalDuration}ms)`,
  );
  console.log(
    `────────────────────────────────────────────────────────────────────────\n`,
  );

  // 4. 打印信号明细表 (双时间戳与结构归因契约)
  if (signals.length === 0) {
    console.log(
      `⚠️ 未触发任何买卖点信号。可以尝试放宽策略树的触发门禁条件。\n`,
    );
  } else {
    console.log(`🎯 触发信号清单 (共 ${signals.length} 条信号):\n`);
    console.table(
      signals.map((s) => ({
        决策触发时刻: s.signalTime.replace('T', ' ').substring(0, 19),
        形态极值时刻: s.pivotTime.replace('T', ' ').substring(0, 19),
        信号类型: s.badgeText || s.signalType,
        方向: s.isBuy ? '▲ 买入' : '▼ 卖出',
        撮合基准价: s.triggerPrice.toFixed(2),
        形态止损位: s.pivotPrice ? s.pivotPrice.toFixed(2) : '--',
        置信度: s.confidence,
      })),
    );
  }

  // 5. 模拟撮合统计
  const sim = simulateTrades(signals);
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

interface SimResult {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  cumulativeReturn: number;
  maxDrawdown: number;
}

function simulateTrades(signals: readonly SimulationSignal[]): SimResult {
  let holding = false;
  let buyPrice = 0;
  let totalTrades = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let cumulativeMultiplier = 1.0;
  let peakMultiplier = 1.0;
  let maxDrawdown = 0;

  for (const s of signals) {
    if (!holding && s.isBuy) {
      holding = true;
      buyPrice = s.triggerPrice;
    } else if (holding && !s.isBuy && buyPrice > 0) {
      holding = false;
      totalTrades += 1;
      const profitRate = (s.triggerPrice - buyPrice) / buyPrice;
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
