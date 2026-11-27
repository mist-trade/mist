import type { StrategyBar } from '@app/market-data';
import { SIGNAL_KINDS } from '../strategy.constants';
import type { KernelSignal, SignalChannelRef } from '../kernel/kernel.types';
import {
  PRICE_LEVEL_RULE_KINDS,
  type PriceLevelVirtualExitRule,
  type VirtualExitChannelSpec,
  type VirtualExitPolicyPort,
  type VirtualExitProposal,
  type VirtualExitRule,
  type VirtualExitRuleBinding,
} from './virtual-exit.port';

/**
 * 价格/时间型虚拟出场规则种类（本求值器可解释的子集）。
 *
 * 扩展/自定义结构型规则依赖外部上下文或形态证据，由外部 `VirtualExitPolicyPort`
 * 实现求值——configure 时通道内若只含外部规则则整通道跳过（非本求值器职责面）。
 */
const PRICE_LEVEL_KINDS: ReadonlySet<string> = new Set(
  Object.values(PRICE_LEVEL_RULE_KINDS),
);

/** 通道虚拟批次（单批次，A 股全进全出语义，与执行引擎 AllIn 一致）。 */
interface VirtualLot {
  /** 成本基准 = 入场信号 triggerPrice（确认 Bar 收盘价） */
  readonly entryPrice: number;
  readonly entryTime: Date;
  /** 持有期内确认 Bar 计数（含入场当根之后推进的 bar） */
  barsHeld: number;
  /** 持有期内最高 close（trailing 峰值基准） */
  peakPrice: number;
}

function isPriceLevelRule(
  rule: VirtualExitRule,
): rule is PriceLevelVirtualExitRule {
  return PRICE_LEVEL_KINDS.has(rule.kind);
}

function channelKey(channel: SignalChannelRef): string {
  return `${channel.definitionId}:${channel.versionId}:${channel.period}`;
}

/**
 * 公共域价格型虚拟出场求值器（插件决定规则、内核只透传、引擎只撮合的
 * 信号侧落地件，2026-11-25 hardStop 归属拍板后取代引擎 hardStop RiskRule）。
 *
 * - 虚拟持仓从内核信号流自推导（ENTRY 开批 / EXIT 平批，单批次全进全出），
 *   内核与引擎均不感知持仓细节；
 * - per-bar 收盘求值：触发 → 产出 VirtualExitProposal（内核转换为与真实
 *   信号同构的 exit 信号，进入引擎 decide 走组内先出后进与 Next-Bar 撮合）；
 * - 触发即平批（首条终局规则生效），防止同一持仓重复出场。
 */
export class PriceLevelExitPolicy implements VirtualExitPolicyPort {
  private readonly specs = new Map<
    string,
    {
      channel: SignalChannelRef;
      bindings: readonly VirtualExitRuleBinding<PriceLevelVirtualExitRule>[];
    }
  >();
  private readonly lots = new Map<string, VirtualLot>();

  public configure(specs: readonly VirtualExitChannelSpec[]): void {
    this.specs.clear();
    this.lots.clear();
    for (const spec of specs) {
      const bindings = spec.bindings.filter(
        (b): b is VirtualExitRuleBinding<PriceLevelVirtualExitRule> =>
          isPriceLevelRule(b.rule),
      );
      if (bindings.length === 0) continue;
      this.specs.set(channelKey(spec.channel), {
        channel: spec.channel,
        bindings,
      });
    }
  }

  public onSignal(signal: KernelSignal): void {
    const channel = signal.channel;
    if (!channel) return;
    const key = channelKey(channel);
    if (signal.signalKind === SIGNAL_KINDS.ENTRY) {
      if (
        !Number.isFinite(signal.triggerPrice) ||
        signal.triggerPrice <= 0 ||
        !(signal.signalTime instanceof Date) ||
        !Number.isFinite(signal.signalTime.getTime())
      ) {
        return;
      }
      if (!this.lots.has(key)) {
        this.lots.set(key, {
          entryPrice: signal.triggerPrice,
          entryTime: signal.signalTime,
          barsHeld: 0,
          peakPrice: signal.triggerPrice,
        });
      }
      return;
    }
    // EXIT（真实出场或虚拟出场信号回流）→ 平批
    this.lots.delete(key);
  }

  public onExternalExit(proposal: VirtualExitProposal): void {
    this.lots.delete(channelKey(proposal.channel));
  }

  public onBar(
    bar: StrategyBar,
    period: number,
  ): readonly VirtualExitProposal[] {
    const barTs = bar.timestamp.getTime();
    if (!Number.isFinite(barTs)) {
      return [];
    }
    const proposals: VirtualExitProposal[] = [];
    for (const [key, spec] of this.specs) {
      if (spec.channel.period !== period) continue;
      const lot = this.lots.get(key);
      if (!lot) continue;
      const entryTs = lot.entryTime.getTime();
      // 严禁在建仓信号同一根 Bar 上立即计持仓天数或触发出场
      if (!Number.isFinite(entryTs) || barTs <= entryTs) continue;
      lot.barsHeld += 1;
      this.updateLotWatermark(lot, bar.close);
      const proposal = this.evaluateBindings(spec, lot, bar);
      if (proposal) {
        // 触发即平批：出场信号回流 onSignal 前先本地清位，防重复
        this.lots.delete(key);
        proposals.push(proposal);
      }
    }
    return proposals;
  }

  private updateLotWatermark(lot: VirtualLot, closePrice: number): void {
    if (!Number.isFinite(closePrice) || closePrice <= 0) {
      return;
    }
    if (!Number.isFinite(lot.peakPrice) || closePrice > lot.peakPrice) {
      lot.peakPrice = closePrice;
    }
  }

  private evaluateBindings(
    spec: {
      channel: SignalChannelRef;
      bindings: readonly VirtualExitRuleBinding<PriceLevelVirtualExitRule>[];
    },
    lot: VirtualLot,
    bar: StrategyBar,
  ): VirtualExitProposal | null {
    for (const { ownerPluginId, rule } of spec.bindings) {
      const hit = this.evaluateRule(
        spec.channel,
        ownerPluginId,
        rule,
        lot,
        bar,
      );
      if (hit) return hit;
    }
    return null;
  }

  private evaluateRule(
    channel: SignalChannelRef,
    ownerPluginId: string,
    rule: PriceLevelVirtualExitRule,
    lot: VirtualLot,
    bar: StrategyBar,
  ): VirtualExitProposal | null {
    if (
      !Number.isFinite(lot.entryPrice) ||
      lot.entryPrice <= 0 ||
      !Number.isFinite(lot.peakPrice) ||
      lot.peakPrice <= 0 ||
      !Number.isFinite(bar.close) ||
      bar.close <= 0
    ) {
      return null;
    }
    const gainRatio = (bar.close - lot.entryPrice) / lot.entryPrice;
    if (!Number.isFinite(gainRatio)) {
      return null;
    }
    switch (rule.kind) {
      case PRICE_LEVEL_RULE_KINDS.STOP: {
        if (!Number.isFinite(rule.lossRatio)) return null;
        // 均价止损：收盘跌破 entryPrice × (1 + lossRatio)，lossRatio 为负数
        const stopPrice = lot.entryPrice * (1 + rule.lossRatio);
        if (!Number.isFinite(stopPrice) || bar.close >= stopPrice) return null;
        return this.proposal(
          channel,
          ownerPluginId,
          rule,
          `价格防守止损：收盘 ${bar.close} 跌破成本 ${lot.entryPrice} × (1 + ${rule.lossRatio})`,
          {
            close: bar.close,
            entryPrice: lot.entryPrice,
            lossRatio: rule.lossRatio,
            pnlRatio: gainRatio,
          },
        );
      }
      case PRICE_LEVEL_RULE_KINDS.BREAKEVEN: {
        if (!Number.isFinite(rule.activationGain)) return null;
        // 浮盈回吐保护：峰值浮盈曾达 activationGain，随后收盘跌破成本
        const peakGain = (lot.peakPrice - lot.entryPrice) / lot.entryPrice;
        if (!Number.isFinite(peakGain) || peakGain < rule.activationGain) {
          return null;
        }
        if (bar.close >= lot.entryPrice) return null;
        return this.proposal(
          channel,
          ownerPluginId,
          rule,
          `保本离场：峰值浮盈 ${(peakGain * 100).toFixed(2)}% 后收盘跌破成本 ${lot.entryPrice}`,
          {
            close: bar.close,
            entryPrice: lot.entryPrice,
            peakPrice: lot.peakPrice,
            peakGainRatio: peakGain,
          },
        );
      }
      case PRICE_LEVEL_RULE_KINDS.TRAILING: {
        if (
          !Number.isFinite(rule.activationGain) ||
          !Number.isFinite(rule.drawdownRatio) ||
          rule.drawdownRatio < 0 ||
          rule.drawdownRatio >= 1
        ) {
          return null;
        }
        // 均价移动止盈：峰值浮盈达 activationGain 后，收盘自峰值回撤 drawdownRatio
        const peakGain = (lot.peakPrice - lot.entryPrice) / lot.entryPrice;
        if (!Number.isFinite(peakGain) || peakGain < rule.activationGain) {
          return null;
        }
        const trailingFloor = lot.peakPrice * (1 - rule.drawdownRatio);
        if (!Number.isFinite(trailingFloor) || bar.close >= trailingFloor) {
          return null;
        }
        return this.proposal(
          channel,
          ownerPluginId,
          rule,
          `移动止盈：峰值 ${lot.peakPrice} 回撤超 ${(rule.drawdownRatio * 100).toFixed(2)}%（收盘 ${bar.close}）`,
          {
            close: bar.close,
            entryPrice: lot.entryPrice,
            peakPrice: lot.peakPrice,
            drawdownRatio: rule.drawdownRatio,
          },
        );
      }
      case PRICE_LEVEL_RULE_KINDS.TIME_EXPIRED: {
        if (!Number.isFinite(rule.maxHoldingBars) || rule.maxHoldingBars <= 0) {
          return null;
        }
        // 持仓超时：持有确认 Bar 数达上限
        if (lot.barsHeld < rule.maxHoldingBars) return null;
        return this.proposal(
          channel,
          ownerPluginId,
          rule,
          `持仓超时：已持有 ${lot.barsHeld} 根确认 Bar（上限 ${rule.maxHoldingBars}）`,
          {
            close: bar.close,
            barsHeld: lot.barsHeld,
            maxHoldingBars: rule.maxHoldingBars,
          },
        );
      }
      default:
        // 结构性规则种类：非本求值器职责面（configure 已过滤，防御性兜底）
        return null;
    }
  }

  private proposal(
    channel: SignalChannelRef,
    ownerPluginId: string,
    rule: PriceLevelVirtualExitRule,
    reason: string,
    evidence: Record<string, unknown>,
  ): VirtualExitProposal {
    return {
      channel,
      ownerPluginId,
      ruleId: `${ownerPluginId}:${rule.kind}:${rule.id ?? 'default'}`,
      exitKind: rule.kind,
      reason,
      badgeText: `防守出场·${rule.kind}`,
      evidence,
    };
  }
}
