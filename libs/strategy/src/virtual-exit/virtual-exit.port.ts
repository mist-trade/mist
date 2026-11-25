import type { StrategyBar } from '@app/market-data';
import type { KernelSignal, SignalChannelRef } from '../kernel/kernel.types';

/**
 * 虚拟出场规则的**词汇表**（不是实现）。
 *
 * 规则的具体阈值由插件在私仓声明；规则的求值算法由私仓实现的
 * `VirtualExitPolicyPort` 承担。开源仓只定义"有哪些规则种类"。
 */
/**
 * 内置价位/时间防守虚拟出场规则种类常量（与 {@link PriceLevelVirtualExitRule} 联合严格对齐）。
 */
export const PRICE_LEVEL_RULE_KINDS = Object.freeze({
  BREAKEVEN: 'breakeven',
  STOP: 'stop',
  TRAILING: 'trailing',
  TIME_EXPIRED: 'time_expired',
} as const);

/**
 * 开源通用价位/时间防守虚拟出场规则（由 {@link PriceLevelExitPolicy} 原生求值）。
 */
export type PriceLevelVirtualExitRule =
  | {
      /** 浮盈回吐保护：峰值浮盈曾达 activationGain，随后收盘跌破均价 */
      readonly kind: 'breakeven';
      readonly activationGain: number;
      readonly id?: string;
    }
  | {
      /** 均价止损：收盘跌破 avgCost × (1 + lossRatio)，lossRatio 为负数 */
      readonly kind: 'stop';
      readonly lossRatio: number;
      readonly id?: string;
    }
  | {
      /** 均价移动止盈：峰值浮盈达 activationGain 后，自峰值回撤 drawdownRatio */
      readonly kind: 'trailing';
      readonly activationGain: number;
      readonly drawdownRatio: number;
      readonly id?: string;
    }
  | {
      /** 持仓超时：持有 Bar 数达上限 */
      readonly kind: 'time_expired';
      readonly maxHoldingBars: number;
      readonly id?: string;
    };

/**
 * 可扩展外部虚拟出场规则（内核只透传给外部 {@link VirtualExitPolicyPort} 求值，
 * 开源核心不枚举也不强绑定具体扩展战术字段）。
 */
export interface ExternalVirtualExitRule {
  readonly kind: string;
  readonly id?: string;
  readonly [key: string]: unknown;
}

/**
 * 通道级虚拟出场规则：内置价位/时间防守规则 + 可扩展外部规则。
 */
export type VirtualExitRule =
  | PriceLevelVirtualExitRule
  | ExternalVirtualExitRule;

export interface VirtualExitRuleBinding<
  TRule extends VirtualExitRule = VirtualExitRule,
> {
  /** 声明该规则的插件，仅用于归因 */
  readonly ownerPluginId: string;
  readonly rule: TRule;
}

/** 一个通道可用的全部规则绑定。 */
export interface VirtualExitChannelSpec {
  readonly channel: SignalChannelRef;
  readonly bindings: readonly VirtualExitRuleBinding[];
}

/** 策略返回的出场提案，由内核转换为 KernelSignal。 */
export interface VirtualExitProposal {
  readonly channel: SignalChannelRef;
  /** 声明该规则的插件，写入信号 originPluginId 用于归因 */
  readonly ownerPluginId: string;
  readonly ruleId: string;
  readonly exitKind: string;
  readonly reason: string;
  readonly badgeText: string;
  readonly confidence?: number;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

/**
 * 虚拟出场策略端口。
 *
 * 内核在每个求值周期 bar 上按先出后进次序调用：先 `onBar` 推进前序已持仓，再 `onSignal` 消费当根新信号。
 * 实现方负责维护通道虚拟持仓；内核不感知任何持仓细节。
 */
export interface VirtualExitPolicyPort {
  /** 内核构造时推送一次：全部通道及其规则绑定 */
  configure(specs: readonly VirtualExitChannelSpec[]): void;
  /** 消费本 bar 产出的真实信号（ENTRY / EXIT） */
  onSignal(signal: KernelSignal): void;
  /** 推进指定周期的全部通道，返回触发的出场提案 */
  onBar(bar: StrategyBar, period: number): readonly VirtualExitProposal[];
}
