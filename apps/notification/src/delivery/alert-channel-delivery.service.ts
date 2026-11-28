import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  NotificationChannel,
  Security,
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategyDefinition,
  StrategySignal,
} from '@app/shared-data';
import { toErrorMessage } from '@app/utils';
import type { AlertDeliveryChannelJobV2 } from '@app/contracts';
import {
  calculateExecutionFeesLi,
  foldVirtualFills,
  yuanToLi,
  type AttributedSignal,
  type KernelSignal,
  type SignalContributor,
  type SignalGroupInput,
  type TradeInstruction,
  type VirtualFillEvent,
  TradingEngine,
} from '@app/strategy';
import { formatShanghaiDateString } from '@app/timezone';

import {
  CHANNEL_ADAPTERS,
  type ChannelAdapter,
  type ChannelSendResult,
} from '../channels/channel-adapter.port';
import {
  buildTradingManual,
  formatPeriod,
  renderTraceChain,
} from '../trading/trading-manual';
import {
  NOTIFICATION_VIRTUAL_SEED_CAPITAL_LI,
  TRADING_ENGINE,
} from '../trading/trading-engine.provider';
import { VirtualFillLogService } from '../trading/virtual-fill-log.service';
import { NotificationDeliveryCounters } from './notification-delivery-counters';

const MAX_LAST_ERROR = 1024;
const RESONANCE_CONTRIBUTOR_SEPARATOR = ' + ';

/**
 * Handles deliver.channel for one (group, channel) job (V2): loads the whole
 * group's evidence, builds ONE channel-neutral grouped message, calls the channel
 * adapter once, writes the per-channel delivery result for every delivered row
 * (same providerMessageId), records metrics, and reconciles each AlertEvent
 * aggregate status. Transient failures throw so BullMQ retries; permanent
 * failures and exhausted retries dead-letter without throwing (job completes;
 * the DB rows are the source of truth).
 */
@Injectable()
export class AlertChannelDeliveryService {
  private readonly logger = new Logger(AlertChannelDeliveryService.name);
  private readonly securityMutexTails = new Map<number, Promise<void>>();

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategySignal)
    private readonly signals: Repository<StrategySignal>,
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitions: Repository<StrategyDefinition>,
    @Inject(CHANNEL_ADAPTERS)
    private readonly adapters: readonly ChannelAdapter[],
    private readonly counters: NotificationDeliveryCounters,
    @Inject(TRADING_ENGINE)
    private readonly engine: TradingEngine,
    @Inject(NOTIFICATION_VIRTUAL_SEED_CAPITAL_LI)
    private readonly seedCapitalLi: bigint,
    private readonly fillLog: VirtualFillLogService,
  ) {}

  async run(
    job: AlertDeliveryChannelJobV2,
    attemptsMade: number,
    maxAttempts: number,
  ): Promise<void> {
    // Bridge the contract's pure literal union to the NotificationChannel enum
    // (used by the entity column + adapters). Values are guaranteed equal by decode.
    const channel = toNotificationChannel(job.channel);
    const rows = await this.deliveries.find({
      where: {
        strategyAlertEventId: In(job.alertEventIds),
        channel,
      },
    });
    if (rows.length === 0) return;
    const work = rows.filter(
      (row) =>
        row.status !== StrategyAlertDeliveryStatus.SENT &&
        row.status !== StrategyAlertDeliveryStatus.DEAD_LETTERED,
    );
    if (work.length === 0) return; // idempotent skip: every row terminal

    const adapter = this.adapters.find((a) => a.channel === channel);
    if (!adapter) {
      // Short-circuit before loading evidence: no adapter for this channel.
      this.counters.recordDeadLetter(channel);
      for (const row of work) {
        await this.updateDeliveryStatus(
          row.id,
          StrategyAlertDeliveryStatus.DEAD_LETTERED,
          row.attemptCount,
          `no adapter configured for channel ${channel}`,
        );
        await this.reconcile(row.strategyAlertEventId);
      }
      return;
    }

    const alertEventIds = work.map((row) => row.strategyAlertEventId);
    const alertEvents = await this.alertEvents.find({
      where: { id: In(alertEventIds) },
    });
    if (alertEvents.length === 0) return;
    const signals = await this.signals.find({
      where: { id: In(alertEvents.map((event) => event.strategySignalId)) },
    });
    const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
    const securityIds = [
      ...new Set(signals.map((signal) => signal.securityId)),
    ];
    const definitionIds = [
      ...new Set(signals.map((signal) => signal.strategyDefinitionId)),
    ];
    const lockSecurityIds = [
      ...new Set([job.group.securityId, ...securityIds]),
    ].sort((a, b) => a - b);

    await this.withSecurityLocks(lockSecurityIds, async () => {
      const securities = await this.securities.find({
        where: { id: In(securityIds) },
      });
      const securitiesById = new Map(securities.map((s) => [s.id, s]));
      const definitions = await this.strategyDefinitions.find({
        where: { id: In(definitionIds) },
      });
      const definitionsById = new Map(definitions.map((d) => [d.id, d]));

      const items: {
        readonly alertEvent: StrategyAlertEvent;
        readonly signal: StrategySignal | null;
        readonly security: Security | null;
        readonly strategyDefinition: StrategyDefinition | null;
      }[] = [];
      for (const event of alertEvents) {
        const signal = signalsById.get(event.strategySignalId) ?? null;
        items.push({
          alertEvent: event,
          signal,
          security: signal
            ? (securitiesById.get(signal.securityId) ?? null)
            : null,
          strategyDefinition: signal
            ? (definitionsById.get(signal.strategyDefinitionId) ?? null)
            : null,
        });
      }

      const prepared = await this.decideAndRender(job.group, items);
      let result: ChannelSendResult;
      try {
        result = await adapter.send({ text: prepared.message });
      } catch (error) {
        result = {
          status: 'transient_failure',
          error: toErrorMessage(error),
        };
      }
      this.counters.recordAttempt(channel);

      if (result.status === 'sent') {
        // 指令即成交（REQ-LEDGER-04）：仅在渠道投递成功后写入虚拟成交回填，杜绝幽灵成交。
        for (const instruction of prepared.decision.instructions) {
          await this.appendAssumedFill(
            instruction,
            prepared.securityId,
            prepared.securityCode,
            prepared.tradingDay,
          );
        }
        this.counters.recordSent(channel);
        for (const row of work) {
          await this.deliveries.update(row.id, {
            status: StrategyAlertDeliveryStatus.SENT,
            attemptCount: row.attemptCount + 1,
            providerMessageId: result.providerMessageId ?? null,
            sentAt: new Date(),
            lastError: null,
          });
          await this.reconcile(row.strategyAlertEventId);
        }
        this.logger.log(
          `delivered group channel=${channel} events=[${alertEventIds.join(',')}] attempt=${attemptsMade + 1}`,
        );
        return;
      }

      const isLastAttempt = attemptsMade + 1 >= maxAttempts;
      const terminal = result.status === 'permanent_failure' || isLastAttempt;
      const newStatus = terminal
        ? StrategyAlertDeliveryStatus.DEAD_LETTERED
        : StrategyAlertDeliveryStatus.FAILED;
      this.counters.recordFailure(channel);
      for (const row of work) {
        await this.updateDeliveryStatus(
          row.id,
          newStatus,
          row.attemptCount + 1,
          result.error,
        );
        await this.reconcile(row.strategyAlertEventId);
      }

      if (result.status === 'transient_failure' && !terminal) {
        throw new Error(
          `transient delivery failure channel=${channel} events=[${alertEventIds.join(',')}]: ${result.error ?? 'unknown'}`,
        );
      }
      this.counters.recordDeadLetter(channel);
      this.logger.warn(
        `delivery dead-lettered channel=${channel} events=[${alertEventIds.join(',')}]: ${result.error ?? 'exhausted retries'}`,
      );
    });
  }

  private async withSecurityLocks<T>(
    sortedSecurityIds: readonly number[],
    operation: () => Promise<T>,
  ): Promise<T> {
    const acquireNext = (index: number): Promise<T> => {
      if (index >= sortedSecurityIds.length) {
        return operation();
      }
      const securityId = sortedSecurityIds[index];
      const prior =
        this.securityMutexTails.get(securityId) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = prior.then(() => current);
      this.securityMutexTails.set(securityId, tail);
      return prior.then(async () => {
        try {
          return await acquireNext(index + 1);
        } finally {
          release();
          if (this.securityMutexTails.get(securityId) === tail) {
            this.securityMutexTails.delete(securityId);
          }
        }
      });
    };
    return acquireNext(0);
  }

  /**
   * 交易层接管（REQ-ADAPT-02）：证据 → 归因信号组 → fold 账本快照 →
   * engine.decide → 交易手册渲染（只读无副作用；虚拟成交回填严格延后至 send 成功）。
   */
  private async decideAndRender(
    group: {
      readonly securityId: number;
      readonly effectiveTime: string;
      readonly tradingDay?: string;
    },
    items: {
      readonly alertEvent: StrategyAlertEvent;
      readonly signal: StrategySignal | null;
      readonly security: Security | null;
      readonly strategyDefinition: StrategyDefinition | null;
    }[],
  ): Promise<{
    readonly message: string;
    readonly decision: ReturnType<TradingEngine['decide']>;
    readonly securityId: number;
    readonly securityCode: string;
    readonly tradingDay: string;
  }> {
    const effectiveTime = new Date(group.effectiveTime);
    const tradingDay =
      group.tradingDay ?? formatShanghaiDateString(effectiveTime);
    const securityId = group.securityId;
    const first = items.find((item) => item.signal !== null) ?? items[0];
    const securityCode = first?.security?.code ?? String(securityId);
    const securityName = first?.security?.name ?? '';

    const attributed: AttributedSignal[] = items.map((item) =>
      this.toAttributed(item, effectiveTime),
    );
    const signalGroup: SignalGroupInput = {
      securityId,
      securityCode,
      effectiveTime,
      tradingDay,
      signals: attributed,
    };

    const fillEvents = await this.fillLog.loadBySecurity(securityId);
    // 排除属于当前批次自身的成交记录（应对多渠道扇出与重试）：
    // 若兄弟渠道已抢先回填或此前 attempt 曾写入成交，fold 快照必须排除当前组，
    // 确保 engine.decide 始终基于组前历史状态求值，杜绝 ALREADY_HOLDING 自拒绝（REQ-LEDGER-03）。
    const currentAlertEventIds = new Set(
      items.map((item) => String(item.alertEvent.id)),
    );
    const priorFills = fillEvents.filter(
      (fill) => !currentAlertEventIds.has(fill.idempotencyKey),
    );
    const snapshot = foldVirtualFills(
      priorFills,
      this.seedCapitalLi,
      tradingDay,
    );
    const decision = this.engine.decide(signalGroup, snapshot);

    const message = buildTradingManual({
      securityId,
      securityCode,
      securityName,
      effectiveTime,
      decision,
    });
    return {
      message,
      decision,
      securityId,
      securityCode,
      tradingDay,
    };
  }

  private toAttributed(
    item: {
      readonly alertEvent: StrategyAlertEvent;
      readonly signal: StrategySignal | null;
      readonly security: Security | null;
      readonly strategyDefinition: StrategyDefinition | null;
    },
    effectiveTime: Date,
  ): AttributedSignal {
    const signal = item.signal;
    const ctx = (signal?.contextSnapshot ?? {}) as Record<string, unknown>;
    const ctxTriggerPrice = ctx.triggerPrice;
    const triggerPrice =
      typeof ctxTriggerPrice === 'number' && ctxTriggerPrice > 0
        ? ctxTriggerPrice
        : 0; // 缺失 → 引擎 priceGate 显式 INVALID_PRICE 拒绝（可审计）
    const ctxPivotPrice = ctx.pivotPrice;
    const pivotPrice =
      typeof ctxPivotPrice === 'number' && Number.isFinite(ctxPivotPrice)
        ? ctxPivotPrice
        : null;
    const pivotTime = signal?.pivotTime
      ? signal.pivotTime instanceof Date
        ? signal.pivotTime.toISOString()
        : String(signal.pivotTime)
      : null;
    const kernelLike: KernelSignal = {
      definitionId: signal?.strategyDefinitionId ?? 0,
      versionId: signal?.strategyVersionId ?? 0,
      signalKind: signal?.signalKind ?? 'entry',
      signalTime: signal?.signalTime ?? effectiveTime,
      triggerPrice,
      pivotTime,
      pivotPrice,
      signalType: signal?.signalType ?? 'signal',
      decisionTrace: (signal?.decisionTrace ?? {}) as Record<string, unknown>,
      contextSnapshot: signal?.contextSnapshot ?? {},
      ruleSnapshot: signal?.ruleSnapshot ?? {},
    };
    return {
      idempotencyKey: String(item.alertEvent.id),
      signal: kernelLike,
      attribution: {
        strategyName: item.strategyDefinition?.name ?? '',
        periodLabel: formatPeriod(signal?.period),
        traceChain: renderTraceChain(signal),
      },
    };
  }

  /**
   * 线上实时投递估算记账（assumed_close 口径）：按指令参考价 instruction.referencePrice
   *（触发 Bar close）写入 virtual_fill_events；离线回测另由 SimulatedBroker 按 Next-Bar Open 撮合。
   */
  private async appendAssumedFill(
    instruction: TradeInstruction,
    securityId: number,
    securityCode: string,
    tradingDay: string,
  ): Promise<void> {
    const priceLi = yuanToLi(instruction.referencePrice);
    const fees = calculateExecutionFeesLi(
      instruction.action,
      priceLi,
      instruction.quantity,
      securityCode,
    );
    const turnoverLi = priceLi * BigInt(instruction.quantity);
    const netAmountLi =
      instruction.action === 'BUY'
        ? -(turnoverLi + fees.totalFeesLi)
        : turnoverLi - fees.totalFeesLi;
    const contributors = instruction.contributors;
    const instructionSnapshot: NonNullable<VirtualFillEvent['instruction']> = {
      instructionId: instruction.instructionId,
      action: instruction.action,
      reason: instruction.reason,
      strategyName: instruction.attribution.strategyName,
      periodLabel: instruction.attribution.periodLabel,
      ...(contributors && contributors.length > 1
        ? {
            contributorKeys: contributors.map((c) => c.idempotencyKey),
            contributorsSummary: formatContributorsSummary(contributors),
          }
        : {}),
    };
    await this.fillLog.append({
      idempotencyKey: instruction.idempotencyKey,
      securityId,
      securityCode,
      side: instruction.action,
      quantity: instruction.quantity,
      priceLi,
      feesLi: fees.totalFeesLi,
      netAmountLi,
      tradingDay,
      instruction: instructionSnapshot,
    });
  }

  private async updateDeliveryStatus(
    id: number,
    status: StrategyAlertDeliveryStatus,
    attemptCount: number,
    error?: string,
  ): Promise<void> {
    await this.deliveries.update(id, {
      status,
      attemptCount,
      lastError: truncate(error),
    });
  }

  private async reconcile(alertEventId: number): Promise<void> {
    const all = await this.deliveries.find({
      where: { strategyAlertEventId: alertEventId },
    });
    if (all.length === 0) return;
    const anyDeadLetter = all.some(
      (d) => d.status === StrategyAlertDeliveryStatus.DEAD_LETTERED,
    );
    const allSent = all.every(
      (d) => d.status === StrategyAlertDeliveryStatus.SENT,
    );
    let next: StrategyAlertStatus | null = null;
    if (anyDeadLetter) next = StrategyAlertStatus.FAILED;
    else if (allSent) next = StrategyAlertStatus.DELIVERED;
    if (next) await this.alertEvents.update(alertEventId, { status: next });
  }
}

function truncate(error?: string): string | null {
  if (!error) return null;
  return error.length > MAX_LAST_ERROR ? error.slice(0, MAX_LAST_ERROR) : error;
}

function toNotificationChannel(
  channel: 'qq' | 'wechat' | 'feishu',
): NotificationChannel {
  if (channel === 'qq') return NotificationChannel.QQ;
  if (channel === 'feishu') return NotificationChannel.FEISHU;
  return NotificationChannel.WECHAT;
}

function formatContributorsSummary(
  contributors: readonly SignalContributor[],
): string {
  const details = contributors
    .map((contributor) =>
      [
        contributor.attribution.strategyName,
        contributor.attribution.periodLabel,
        contributor.signalType,
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(RESONANCE_CONTRIBUTOR_SEPARATOR);
  return `共振(${contributors.length}): ${details}`;
}
