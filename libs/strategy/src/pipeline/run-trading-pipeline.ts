/**
 * 管线门面（REQ-FACADE-01..05，design 第八节）：交易层的独立运行入口。
 *
 * 输入内存 Bars / 编译后 KernelPlan / 插件注册表；内部完成 Bar 归并驱动 →
 * 信号收集 → 分组（与线上扇出同一 groupSignals）→ 逐组 engine.decide →
 * 假定成交（内存 fill 日志，离线合成幂等 id）→ 交易手册（与投递消息同一渲染器）。
 * 零 NestJS / DB / Redis 依赖，可被私仓 esbuild 捆绑；回测执行器、dev server、
 * 实时投递与私仓脚本全部是它的数据适配器。
 */
import type { StrategyBar } from '@app/market-data';
import { availabilityKey } from '../kernel/availability';
import { StrategyEvaluationKernel } from '../kernel/strategy-evaluation-kernel';
import type { KernelPlan } from '../kernel/kernel.types';
import type { FactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { VirtualExitPolicyPort } from '../virtual-exit/virtual-exit.port';
import {
  createAllInWithBuffer,
  createDefaultRiskRules,
  groupSignals,
  foldVirtualFills,
  buildTradingManual,
  TradingEngine,
  yuanToLi,
  type RiskRule,
  type SignalGroupInput,
  type TradingDecision,
  type VirtualFillEvent,
} from '../trading';
import type { KernelSignal } from '../kernel/kernel.types';
import { calculateExecutionFeesLi } from '../trading/fees';
import { ORDER_SIDES, TRADING_LAYER_DEFAULTS } from '../strategy.constants';

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
  /** 种子资金（整数厘），默认 1,000,000 × 1000 */
  readonly seedCapitalLi?: bigint;
  /** 预算比例（SizingStrategy 参数透传），默认 0.95 */
  readonly cashAllocationRatio?: number;
  /** Bar 巡检规则，默认 systemic 常驻（离线研究默认无硬止损） */
  readonly riskRules?: readonly RiskRule[];
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

const DEFAULT_SEED_LI = 1_000_000_000n; // 100 万元

/**
 * 门面主函数：确定性——同输入 → 同输出（重放不产生重复回填，幂等锚点
 * 由信号 signalTime + signalKind 决定，与时间轴一一对应）。
 */
export async function runTradingPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const seedCapitalLi = input.seedCapitalLi ?? DEFAULT_SEED_LI;
  const engine = new TradingEngine({
    sizing: createAllInWithBuffer(
      input.cashAllocationRatio ??
        TRADING_LAYER_DEFAULTS.DEFAULT_CASH_ALLOCATION_RATIO,
    ),
    riskRules: input.riskRules ?? createDefaultRiskRules(),
  });

  const kernel = new StrategyEvaluationKernel({
    securityId: input.securityId,
    securityCode: input.securityCode,
    publicFrom: input.publicFrom,
    plans: input.plans,
    registry: input.registry,
    virtualExitPolicy: input.virtualExitPolicy,
  });

  // Bar 驱动顺序（REQ-FACADE-02）：合并全部周期按 (availabilityKey, period 升序)
  const merged = [...input.barsByPeriod.entries()]
    .flatMap(([period, bars]) => bars.map((bar) => ({ period, bar })))
    .sort((a, b) => {
      const keyDiff =
        availabilityKey({
          period: a.period,
          timestamp: a.bar.timestamp,
        }).getTime() -
        availabilityKey({
          period: b.period,
          timestamp: b.bar.timestamp,
        }).getTime();
      if (keyDiff !== 0) return keyDiff;
      return a.period - b.period;
    });

  const signals: KernelSignal[] = [];
  for (const { bar } of merged) {
    const emitted = await kernel.push(bar);
    signals.push(...emitted);
  }

  // 分组（REQ-FACADE-03）：与线上扇出同一实现
  const groups = groupSignals(signals, (signal) => ({
    securityId: input.securityId,
    period: signal.channel?.period ?? input.plans[0]?.period ?? 0,
    signalTime: signal.signalTime,
  }));

  const fills: VirtualFillEvent[] = [];
  const groupResults: {
    group: SignalGroupInput;
    decision: TradingDecision;
  }[] = [];

  // 组序：按 effectiveTime 升序（时间轴因果序）
  const ordered = [...groups.values()].sort(
    (a, b) =>
      a.descriptor.effectiveTime.getTime() -
      b.descriptor.effectiveTime.getTime(),
  );

  for (const { descriptor, members } of ordered) {
    const group: SignalGroupInput = {
      securityId: input.securityId,
      securityCode: input.securityCode,
      effectiveTime: descriptor.effectiveTime,
      tradingDay: descriptor.tradingDay,
      signals: members.map((signal) => ({
        // 离线合成幂等锚点（REQ-FACADE-04）
        idempotencyKey: `offline-${signal.definitionId}-${signal.signalTime.getTime()}-${signal.signalKind}`,
        signal,
        attribution: {
          strategyName: `definition-${signal.definitionId}`,
          periodLabel: `${signal.channel?.period ?? 0}m`,
          confidence: signal.confidence,
          confidenceLevel: signal.confidenceLevel,
          traceChain: null,
        },
      })),
    };

    const snapshot = foldVirtualFills(
      fills,
      seedCapitalLi,
      descriptor.tradingDay,
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
        tradingDay: descriptor.tradingDay,
        fillTime: descriptor.effectiveTime,
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

  // 交易手册（REQ-FACADE-05）：与线上投递同一渲染器；多组以空行分隔
  const report = groupResults
    .filter(
      (r) => r.decision.instructions.length + r.decision.rejections.length > 0,
    )
    .map((r) =>
      buildTradingManual({
        securityCode: input.securityCode,
        securityName: '',
        securityId: input.securityId,
        effectiveTime: r.group.effectiveTime,
        decision: r.decision,
      }),
    )
    .join('\n\n');

  return { signals, groups: groupResults, fills, report };
}
