/**
 * 管线门面（REQ-FACADE-01..05，design 第八节）：交易层的独立运行入口。
 *
 * 输入内存 Bars / 编译后 KernelPlan / 插件注册表；内部完成 Bar 归并驱动 →
 * 信号收集 → 分组（与线上扇出同一 groupSignals）→ 逐组 engine.decide →
 * 假定成交（assumed_close）或严格 Next-Bar Open / Next-5m-Bar Open 因果撮合 →
 * 交易手册（与投递消息同一渲染器）。
 * 零 NestJS / DB / Redis 依赖，可被私仓 esbuild 捆绑；回测执行器、dev server、
 * 实时投递与私仓脚本全部是它的数据适配器。
 */
import type { StrategyBar } from '@app/market-data';
import { formatShanghaiDateString } from '@app/timezone';
import { availabilityKey } from '../kernel/availability';
import { StrategyEvaluationKernel } from '../kernel/strategy-evaluation-kernel';
import type { KernelPlan, KernelSignal } from '../kernel/kernel.types';
import type { FactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { VirtualExitPolicyPort } from '../virtual-exit/virtual-exit.port';
import type { BrokerFeeConfig } from '../execution/execution.types';
import { SimulatedBroker } from '../execution/simulated-broker';
import {
  createAllInWithBuffer,
  createDefaultRiskRules,
  groupSignals,
  foldVirtualFills,
  buildTradingManual,
  renderTraceChainOf,
  TradingEngine,
  applySlippageLi,
  liToYuan,
  yuanToLi,
  type FeeConfigLi,
  type RiskRule,
  type SignalGroup,
  type SignalGroupInput,
  type TradingDecision,
  type VirtualFillEvent,
} from '../trading';
import { calculateExecutionFeesLi } from '../trading/fees';
import {
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
  TRADING_LAYER_DEFAULTS,
} from '../strategy.constants';

export type PipelineExecutionMode = 'assumed_close' | 'next_bar_open';

export interface PipelineInput {
  /** 内存 Bars（离线 K 线），键 = 周期 */
  readonly barsByPeriod: ReadonlyMap<number, readonly StrategyBar[]>;
  /** 编译后的内核求值计划（compileStoredDefinitionVersion 产物） */
  readonly plans: readonly KernelPlan[];
  readonly registry: FactorPluginRegistry;
  readonly securityId: number;
  readonly securityCode: string;
  /** 相位边界：timestamp < publicFrom 为预热相（不发射） */
  readonly publicFrom: Date;
  readonly virtualExitPolicy?: VirtualExitPolicyPort;
  /** 附加轻量监控周期（不触发主策略树，直接推进 virtualExitPolicy），如 [5] */
  readonly surveillancePeriods?: readonly number[];
  /** 种子资金（整数厘），默认 1,000,000 × 1000 */
  readonly seedCapitalLi?: bigint;
  /** 预算比例（SizingStrategy 参数透传），默认 0.95 */
  readonly cashAllocationRatio?: number;
  /** Bar 巡检规则，默认 systemic 常驻（离线研究默认无硬止损） */
  readonly riskRules?: readonly RiskRule[];
  /** 撮合模式：默认 assumed_close（向后兼容）；next_bar_open 启用严格次根开盘因果撮合 */
  readonly executionMode?: PipelineExecutionMode;
  /** next_bar_open 模式下的撮合周期（如 5 表示 5m 精细撮合）；缺省取主 plan.period */
  readonly executionPeriod?: number;
  /** next_bar_open 模式下的滑点比例，默认 0 */
  readonly slippageRatio?: number;
  /** 是否计提交易规费（佣金/过户费/印花税），默认 true */
  readonly feeEnabled?: boolean;
  /** 是否允许不足 100 股的单位份额（如宽基指数净值对齐），默认 false */
  readonly allowFractionalShares?: boolean;
  /** 证券名称（用于涨跌停 ST 标识判断，可选） */
  readonly securityName?: string;
}

export interface PipelineResult {
  readonly signals: readonly KernelSignal[];
  readonly groups: readonly {
    readonly group: SignalGroupInput;
    readonly decision: TradingDecision;
  }[];
  /** 内存 fill 日志（离线合成幂等 id，REQ-FACADE-04） */
  readonly fills: readonly VirtualFillEvent[];
  /** 交易手册（与线上投递消息同一渲染器，REQ-FACADE-05） */
  readonly report: string;
}

type GroupResultEntry = {
  readonly group: SignalGroupInput;
  readonly decision: TradingDecision;
};

interface MergedBarEntry {
  readonly period: number;
  readonly bar: StrategyBar;
  readonly availMs: number;
  readonly isExternal: number;
}

interface PendingOrderMeta {
  readonly idempotencyKey: string;
  readonly instruction: NonNullable<VirtualFillEvent['instruction']>;
}

const DEFAULT_SEED_LI = 1_000_000_000n; // 100 万元
const DEFAULT_EXECUTION_PERIOD = 1440;
const FRACTIONAL_UNIT_LOT_SIZE = 1;
const NEXT_BAR_DEFAULT_SLIPPAGE = 0;
const NEXT_BAR_EXECUTION_MODE = 'next_bar_open';
const ZERO_FEE_CONFIG_LI: FeeConfigLi = Object.freeze({
  commissionRate: 0,
  minCommissionLi: 0n,
  transferFeeRate: 0,
  stampDutyRate: 0,
});
const ZERO_BROKER_FEE_CONFIG: BrokerFeeConfig = Object.freeze({
  commissionRate: 0,
  minCommission: 0,
  transferFeeRate: 0,
  stampDutyRate: 0,
});

/**
 * 门面主函数：确定性——同输入 → 同输出（重放不产生重复回填，幂等锚点
 * 由信号 signalTime + signalKind 决定，与时间轴一一对应）。
 */
export async function runTradingPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const seedCapitalLi = input.seedCapitalLi ?? DEFAULT_SEED_LI;
  const lotSize = input.allowFractionalShares
    ? FRACTIONAL_UNIT_LOT_SIZE
    : TRADING_LAYER_DEFAULTS.DEFAULT_LOT_SIZE;
  const feeEnabled = input.feeEnabled !== false;
  const feeConfigLi = feeEnabled ? undefined : ZERO_FEE_CONFIG_LI;
  const cashAllocationRatio =
    input.cashAllocationRatio ??
    TRADING_LAYER_DEFAULTS.DEFAULT_CASH_ALLOCATION_RATIO;

  const engine = new TradingEngine({
    sizing: createAllInWithBuffer(cashAllocationRatio),
    riskRules: input.riskRules ?? createDefaultRiskRules(),
    lotSize,
    feeConfig: feeConfigLi,
  });

  const kernel = new StrategyEvaluationKernel({
    securityId: input.securityId,
    securityCode: input.securityCode,
    publicFrom: input.publicFrom,
    plans: input.plans,
    registry: input.registry,
    virtualExitPolicy: input.virtualExitPolicy,
    surveillancePeriods: input.surveillancePeriods,
  });

  // Bar 驱动顺序（REQ-FACADE-02）：预计算 (availabilityKey, isExternal) 做施瓦茨变换，避免 sort 比较器内 O(N log N) 重复时区换算
  const merged: MergedBarEntry[] = [];
  for (const [period, bars] of input.barsByPeriod.entries()) {
    for (const bar of bars) {
      merged.push({
        period,
        bar,
        availMs: availabilityKey({
          period,
          timestamp: bar.timestamp,
        }).getTime(),
        isExternal: bar.securityId !== input.securityId ? 0 : 1,
      });
    }
  }
  merged.sort(compareMergedBars);

  if (input.executionMode === NEXT_BAR_EXECUTION_MODE) {
    return runNextBarOpenPipeline({
      input,
      kernel,
      engine,
      merged,
      seedCapitalLi,
      lotSize,
      feeEnabled,
      cashAllocationRatio,
    });
  }

  return runAssumedClosePipeline({
    input,
    kernel,
    engine,
    merged,
    seedCapitalLi,
    feeConfigLi,
  });
}

function compareMergedBars(a: MergedBarEntry, b: MergedBarEntry): number {
  const keyDiff = a.availMs - b.availMs;
  if (keyDiff !== 0) return keyDiff;
  if (a.period !== b.period) return a.period - b.period;
  // 外部 Context 标的优先入窗，确保主标的当期求值能读取最新上下文
  if (a.isExternal !== b.isExternal) return a.isExternal - b.isExternal;
  const idDiff = (a.bar.securityId ?? 0) - (b.bar.securityId ?? 0);
  if (idDiff !== 0) return idDiff;
  return (a.bar.securityCode ?? '').localeCompare(b.bar.securityCode ?? '');
}

function resolveSignalPeriod(
  signal: KernelSignal,
  input: PipelineInput,
): number {
  return (
    signal.triggerPeriod ??
    signal.channel?.period ??
    input.plans[0]?.period ??
    0
  );
}

function buildSignalGroupInput(
  group: SignalGroup<KernelSignal>,
  input: PipelineInput,
): SignalGroupInput {
  return {
    securityId: input.securityId,
    securityCode: input.securityCode,
    effectiveTime: group.descriptor.effectiveTime,
    tradingDay: group.descriptor.tradingDay,
    signals: group.members.map((signal) => ({
      // 离线合成幂等锚点（REQ-FACADE-04）
      idempotencyKey: `offline-${signal.definitionId}-${signal.signalTime.getTime()}-${signal.signalKind}`,
      signal,
      attribution: {
        strategyName: `definition-${signal.definitionId}`,
        periodLabel: `${resolveSignalPeriod(signal, input)}m`,
        confidence: signal.confidence,
        confidenceLevel: signal.confidenceLevel,
        traceChain: renderTraceChainOf(signal.decisionTrace),
      },
    })),
  };
}

function renderPipelineReport(
  groupResults: readonly GroupResultEntry[],
  input: PipelineInput,
): string {
  // 交易手册（REQ-FACADE-05）：与线上投递同一渲染器；多组以空行分隔
  return groupResults
    .filter(
      (r) => r.decision.instructions.length + r.decision.rejections.length > 0,
    )
    .map((r) =>
      buildTradingManual({
        securityCode: input.securityCode,
        securityName: input.securityName ?? '',
        securityId: input.securityId,
        effectiveTime: r.group.effectiveTime,
        decision: r.decision,
      }),
    )
    .join('\n\n');
}

async function runAssumedClosePipeline(params: {
  readonly input: PipelineInput;
  readonly kernel: StrategyEvaluationKernel;
  readonly engine: TradingEngine;
  readonly merged: readonly MergedBarEntry[];
  readonly seedCapitalLi: bigint;
  readonly feeConfigLi?: FeeConfigLi;
}): Promise<PipelineResult> {
  const { input, kernel, engine, merged, seedCapitalLi, feeConfigLi } = params;
  const signals: KernelSignal[] = [];
  for (const { bar } of merged) {
    const emitted = await kernel.push(bar);
    signals.push(...emitted);
  }

  // 分组（REQ-FACADE-03）：与线上扇出同一实现
  const groups = groupSignals(signals, (signal) => ({
    securityId: input.securityId,
    period: resolveSignalPeriod(signal, input),
    signalTime: signal.signalTime,
  }));

  const fills: VirtualFillEvent[] = [];
  const groupResults: GroupResultEntry[] = [];

  // 组序：按 effectiveTime 升序（时间轴因果序）
  const ordered = [...groups.values()].sort(
    (a, b) =>
      a.descriptor.effectiveTime.getTime() -
      b.descriptor.effectiveTime.getTime(),
  );

  for (const rawGroup of ordered) {
    const group = buildSignalGroupInput(rawGroup, input);
    const snapshot = foldVirtualFills(
      fills,
      seedCapitalLi,
      rawGroup.descriptor.tradingDay,
    );
    const decision = engine.decide(group, snapshot);

    // 假定成交（指令即成交，厘算术；幂等键与指令一致 → 重放不重复回填）
    for (const instruction of decision.instructions) {
      const priceLi = yuanToLi(instruction.referencePrice);
      const fees = calculateExecutionFeesLi(
        instruction.action,
        priceLi,
        instruction.quantity,
        input.securityCode,
        feeConfigLi,
      );
      const turnoverLi = priceLi * BigInt(instruction.quantity);
      fills.push({
        idempotencyKey: instruction.idempotencyKey,
        securityId: input.securityId,
        securityCode: input.securityCode,
        side:
          instruction.action === ORDER_SIDES.BUY
            ? ORDER_SIDES.BUY
            : ORDER_SIDES.SELL,
        quantity: instruction.quantity,
        priceLi,
        feesLi: fees.totalFeesLi,
        netAmountLi:
          instruction.action === ORDER_SIDES.BUY
            ? -(turnoverLi + fees.totalFeesLi)
            : turnoverLi - fees.totalFeesLi,
        tradingDay: rawGroup.descriptor.tradingDay,
        fillTime: rawGroup.descriptor.effectiveTime,
        instruction: {
          instructionId: instruction.instructionId,
          action: instruction.action,
          reason: instruction.reason,
          strategyName: instruction.attribution.strategyName,
          periodLabel: instruction.attribution.periodLabel,
        },
      });
    }

    groupResults.push({ group, decision });
  }

  return {
    signals,
    groups: groupResults,
    fills,
    report: renderPipelineReport(groupResults, input),
  };
}

async function runNextBarOpenPipeline(params: {
  readonly input: PipelineInput;
  readonly kernel: StrategyEvaluationKernel;
  readonly engine: TradingEngine;
  readonly merged: readonly MergedBarEntry[];
  readonly seedCapitalLi: bigint;
  readonly lotSize: number;
  readonly feeEnabled: boolean;
  readonly cashAllocationRatio: number;
}): Promise<PipelineResult> {
  const {
    input,
    kernel,
    engine,
    merged,
    seedCapitalLi,
    lotSize,
    feeEnabled,
    cashAllocationRatio,
  } = params;

  const execPeriod =
    input.executionPeriod ?? input.plans[0]?.period ?? DEFAULT_EXECUTION_PERIOD;
  const fallbackPeriod = input.plans[0]?.period ?? DEFAULT_EXECUTION_PERIOD;
  const slippageRatio = input.slippageRatio ?? NEXT_BAR_DEFAULT_SLIPPAGE;

  // 预索引具备精细执行周期 Bar 的上海交易日；缺失精细分时的交易日自动回退至主周期开盘撮合
  const execDays = new Set<string>();
  let firstExecBar: StrategyBar | undefined;
  for (const entry of merged) {
    if (entry.bar.securityId !== input.securityId) continue;
    if (entry.period === execPeriod) {
      execDays.add(formatShanghaiDateString(entry.bar.timestamp));
      firstExecBar ??= entry.bar;
    } else if (!firstExecBar && entry.period === fallbackPeriod) {
      firstExecBar = entry.bar;
    }
  }

  const broker = new SimulatedBroker({
    initialCash: liToYuan(seedCapitalLi),
    slippageRatio,
    lotSize,
    feeConfig: feeEnabled ? undefined : ZERO_BROKER_FEE_CONFIG,
  });
  broker.registerSecurity(input.securityCode, {
    name: input.securityName ?? input.securityCode,
    ...(firstExecBar ? { preClose: firstExecBar.open } : {}),
  });

  const signals: KernelSignal[] = [];
  const pendingSignals: KernelSignal[] = [];
  const fills: VirtualFillEvent[] = [];
  const groupResults: GroupResultEntry[] = [];
  const pendingOrderMeta = new Map<string, PendingOrderMeta>();

  let lastExecTradingDay: string | null = null;
  let currentTradingDay = '';

  const submitSealedOrders = (
    beforeAvailMs: number,
    barDayForSnapshot: string | null,
    nextOpenBar: StrategyBar | null,
  ): void => {
    if (pendingSignals.length === 0) return;
    const sealed: KernelSignal[] = [];
    const remaining: KernelSignal[] = [];
    for (const sig of pendingSignals) {
      const availMs = availabilityKey({
        period: resolveSignalPeriod(sig, input),
        timestamp: sig.signalTime,
      }).getTime();
      if (availMs < beforeAvailMs) {
        sealed.push(sig);
      } else {
        remaining.push(sig);
      }
    }
    if (sealed.length === 0) return;
    pendingSignals.length = 0;
    pendingSignals.push(...remaining);

    const groups = groupSignals(sealed, (signal) => ({
      securityId: input.securityId,
      period: resolveSignalPeriod(signal, input),
      signalTime: signal.signalTime,
    }));
    const ordered = [...groups.values()].sort(
      (a, b) =>
        a.descriptor.effectiveTime.getTime() -
        b.descriptor.effectiveTime.getTime(),
    );

    const hasBlockedOrder = broker
      .getOpenOrders()
      .some(
        (o) =>
          o.securityCode === input.securityCode &&
          o.status === ORDER_STATUSES.BLOCKED,
      );

    for (const rawGroup of ordered) {
      const group = buildSignalGroupInput(rawGroup, input);
      const tradingDay = barDayForSnapshot ?? rawGroup.descriptor.tradingDay;
      const snapshot = foldVirtualFills(fills, seedCapitalLi, tradingDay);
      const decision = engine.decide(group, snapshot);

      if (hasBlockedOrder || !nextOpenBar) {
        groupResults.push({ group, decision });
        continue;
      }

      let scheduledSellProceedsLi = 0n;
      const updatedInstructions = [...decision.instructions];
      let instructionsAdjusted = false;
      for (let idx = 0; idx < decision.instructions.length; idx++) {
        const instruction = decision.instructions[idx];
        let submitQty = instruction.quantity;
        if (instruction.action === ORDER_SIDES.SELL) {
          const estSellLi = applySlippageLi(
            yuanToLi(nextOpenBar.open),
            ORDER_SIDES.SELL,
            slippageRatio,
          );
          const sellFees = calculateExecutionFeesLi(
            ORDER_SIDES.SELL,
            estSellLi,
            submitQty,
            input.securityCode,
            feeEnabled ? undefined : ZERO_FEE_CONFIG_LI,
          );
          scheduledSellProceedsLi +=
            estSellLi * BigInt(submitQty) - sellFees.totalFeesLi;
        } else {
          const estBuyLi = applySlippageLi(
            yuanToLi(nextOpenBar.open),
            ORDER_SIDES.BUY,
            slippageRatio,
          );
          if (
            input.allowFractionalShares ||
            estBuyLi > yuanToLi(instruction.referencePrice)
          ) {
            const availableCashLi =
              yuanToLi(broker.getAccount().availableCash) +
              scheduledSellProceedsLi;
            submitQty = computeAffordableQuantity({
              cashLi: availableCashLi,
              fillPriceLi: estBuyLi,
              cashAllocationRatio,
              lotSize,
              securityCode: input.securityCode,
              feeEnabled,
            });
            if (submitQty !== instruction.quantity) {
              updatedInstructions[idx] = {
                ...instruction,
                quantity: submitQty,
              };
              instructionsAdjusted = true;
            }
          }
        }

        if (submitQty <= 0) continue;
        const order = broker.submitOrder({
          securityId: input.securityId,
          securityCode: input.securityCode,
          side: instruction.action,
          orderType: ORDER_TYPES.MARKET,
          quantity: submitQty,
          signalTime: rawGroup.descriptor.effectiveTime,
          ...(instruction.action === ORDER_SIDES.BUY
            ? { entryReason: instruction.reason }
            : { exitReason: instruction.reason }),
          intentId: instruction.idempotencyKey,
        });
        if (order.status === ORDER_STATUSES.PENDING) {
          pendingOrderMeta.set(order.orderId, {
            idempotencyKey: instruction.idempotencyKey,
            instruction: {
              instructionId: instruction.instructionId,
              action: instruction.action,
              reason: instruction.reason,
              strategyName: instruction.attribution.strategyName,
              periodLabel: instruction.attribution.periodLabel,
            },
          });
        }
      }

      groupResults.push({
        group,
        decision: instructionsAdjusted
          ? { ...decision, instructions: updatedInstructions }
          : decision,
      });
    }
  };

  for (const { period, bar, availMs } of merged) {
    const isMainSec = bar.securityId === input.securityId;
    const barDay = isMainSec ? formatShanghaiDateString(bar.timestamp) : null;
    const isExecutionBar =
      isMainSec &&
      (period === execPeriod ||
        (period === fallbackPeriod &&
          barDay !== null &&
          !execDays.has(barDay)));

    if (isExecutionBar && barDay !== null) {
      if (lastExecTradingDay !== null && barDay !== lastExecTradingDay) {
        broker.settleDayClose(lastExecTradingDay);
      }
      lastExecTradingDay = barDay;
      currentTradingDay = barDay;

      submitSealedOrders(availMs, currentTradingDay, bar);

      const filledEvents = broker.onBar(bar);
      for (const filled of filledEvents) {
        const meta = pendingOrderMeta.get(filled.orderId);
        pendingOrderMeta.delete(filled.orderId);
        const priceLi = yuanToLi(filled.fillPrice);
        const feesLi = yuanToLi(filled.fees.totalFees);
        const turnoverLi = priceLi * BigInt(filled.filledQuantity);
        fills.push({
          idempotencyKey: meta?.idempotencyKey ?? `offline-${filled.orderId}`,
          securityId: input.securityId,
          securityCode: input.securityCode,
          side: filled.side,
          quantity: filled.filledQuantity,
          priceLi,
          feesLi,
          netAmountLi:
            filled.side === ORDER_SIDES.BUY
              ? -(turnoverLi + feesLi)
              : turnoverLi - feesLi,
          tradingDay: barDay,
          fillTime: filled.fillTime,
          instruction: meta?.instruction,
        });
      }
    }

    const emitted = await kernel.push(bar);
    if (emitted.length > 0) {
      signals.push(...emitted);
      pendingSignals.push(...emitted);
    }
  }

  // 回放末尾残余信号组补 flush（指令入队后无后续 Bar 撮合 → 不伪造未来成交）
  submitSealedOrders(Number.POSITIVE_INFINITY, null, null);

  return {
    signals,
    groups: groupResults,
    fills,
    report: renderPipelineReport(groupResults, input),
  };
}

function computeAffordableQuantity(params: {
  readonly cashLi: bigint;
  readonly fillPriceLi: bigint;
  readonly cashAllocationRatio: number;
  readonly lotSize: number;
  readonly securityCode: string;
  readonly feeEnabled: boolean;
}): number {
  const {
    cashLi,
    fillPriceLi,
    cashAllocationRatio,
    lotSize,
    securityCode,
    feeEnabled,
  } = params;
  if (fillPriceLi <= 0n || cashLi <= 0n) return 0;
  const sizing = createAllInWithBuffer(cashAllocationRatio);
  let qty = sizing({ cashLi, priceLi: fillPriceLi, lotSize }).quantity;
  const step = BigInt(lotSize);
  while (qty >= lotSize) {
    const turnoverLi = fillPriceLi * BigInt(qty);
    const feesLi = feeEnabled
      ? calculateExecutionFeesLi(
          ORDER_SIDES.BUY,
          fillPriceLi,
          qty,
          securityCode,
        ).totalFeesLi
      : 0n;
    if (turnoverLi + feesLi <= cashLi) {
      return qty;
    }
    qty -= Number(step);
  }
  return 0;
}
