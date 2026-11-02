import type { StrategyBar } from '@app/market-data';
import type { KernelSignal, SignalChannelRef } from '../kernel/kernel.types';

/**
 * 虚拟出场规则的**词汇表**（不是实现）。
 *
 * 规则的具体阈值由插件在私仓声明；规则的求值算法由私仓实现的
 * `VirtualExitPolicyPort` 承担。开源仓只定义"有哪些规则种类"。
 */
export type VirtualExitRule =
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
    };

export interface VirtualExitRuleBinding {
  /** 声明该规则的插件，仅用于归因 */
  readonly ownerPluginId: string;
  readonly rule: VirtualExitRule;
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
 * 内核在每个求值周期 bar 上调用：先 `onSignal` 消费真实信号，再 `onBar` 求值。
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
