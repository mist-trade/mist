import type { StrategyBar } from '@app/market-data';
import type { KernelSignal, SignalChannelRef } from '../kernel/kernel.types';
import { CompositeVirtualExitPolicy } from './composite-virtual-exit.policy';
import { PriceLevelExitPolicy } from './price-level-exit.policy';
import type {
  VirtualExitChannelSpec,
  VirtualExitPolicyPort,
  VirtualExitProposal,
} from './virtual-exit.port';

const CHANNEL_A: SignalChannelRef = {
  definitionId: 1,
  versionId: 1,
  period: 30,
};
const CHANNEL_B: SignalChannelRef = {
  definitionId: 2,
  versionId: 1,
  period: 30,
};

function bar(
  close: number,
  timestamp = new Date('2026-01-06T06:00:00Z'),
): StrategyBar {
  return {
    securityId: 1,
    securityCode: '000001',
    source: 'tdx',
    period: 30,
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: '1000',
    amount: '1000000',
    type: 'complete',
  };
}

function entrySignal(
  channel: SignalChannelRef,
  triggerPrice = 10,
): KernelSignal {
  return {
    definitionId: channel.definitionId,
    versionId: channel.versionId,
    signalKind: 'entry',
    channel,
    signalTime: new Date('2026-01-05T07:35:00Z'),
    triggerPrice,
    pivotTime: null,
    pivotPrice: null,
    signalType: 'TEST_ENTRY',
    decisionTrace: {},
    contextSnapshot: {},
    ruleSnapshot: {},
  };
}

function makeProposal(
  channel: SignalChannelRef,
  ownerPluginId: string,
  exitKind: string,
): VirtualExitProposal {
  return {
    channel,
    ownerPluginId,
    ruleId: `${ownerPluginId}:${exitKind}`,
    exitKind,
    reason: exitKind,
    badgeText: exitKind,
  };
}

describe('CompositeVirtualExitPolicy（组合同步与去重）', () => {
  it('透传可选钩子 onPrewarmBar 与 onExternalExit 至双路委托', () => {
    const primaryOnPrewarm = jest.fn();
    const primaryOnExternalExit = jest.fn();
    const fallbackOnPrewarm = jest.fn();
    const fallbackOnExternalExit = jest.fn();

    const primary: VirtualExitPolicyPort = {
      configure: jest.fn(),
      onSignal: jest.fn(),
      onBar: jest.fn().mockReturnValue([]),
      onPrewarmBar: primaryOnPrewarm,
      onExternalExit: primaryOnExternalExit,
    };
    const fallback: VirtualExitPolicyPort = {
      configure: jest.fn(),
      onSignal: jest.fn(),
      onBar: jest.fn().mockReturnValue([]),
      onPrewarmBar: fallbackOnPrewarm,
      onExternalExit: fallbackOnExternalExit,
    };

    const composite = new CompositeVirtualExitPolicy(primary, fallback);
    const prewarm = bar(10);
    const extProposal = makeProposal(CHANNEL_A, 'ext', 'MANUAL');

    composite.onPrewarmBar(prewarm, 30);
    composite.onExternalExit(extProposal);

    expect(primaryOnPrewarm).toHaveBeenCalledWith(prewarm, 30);
    expect(fallbackOnPrewarm).toHaveBeenCalledWith(prewarm, 30);
    expect(primaryOnExternalExit).toHaveBeenCalledWith(extProposal);
    expect(fallbackOnExternalExit).toHaveBeenCalledWith(extProposal);
  });

  it('primary 触发通道出场时先同步 fallback.onExternalExit，并抑制同通道重复提案', () => {
    const primary = new PriceLevelExitPolicy();
    const fallbackLots = new Set<string>(['1:30', '2:30']);
    const fallbackExternalCalls: VirtualExitProposal[] = [];

    const fallback: VirtualExitPolicyPort = {
      configure: jest.fn(),
      onSignal: jest.fn(),
      onExternalExit: (proposal) => {
        fallbackExternalCalls.push(proposal);
        fallbackLots.delete(
          `${proposal.channel.definitionId}:${proposal.channel.period}`,
        );
      },
      onBar: () => {
        // 故意同时返回已被 primary 退出的 CHANNEL_A（模拟未及时响应或滞后实现）与 CHANNEL_B
        return [
          makeProposal(CHANNEL_A, 'plugin.private.struct', 'STRUCT_A'),
          makeProposal(CHANNEL_B, 'plugin.private.struct', 'STRUCT_B'),
        ];
      },
    };

    const specs: VirtualExitChannelSpec[] = [
      {
        channel: CHANNEL_A,
        bindings: [
          { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.05 } },
        ],
      },
      {
        channel: CHANNEL_B,
        bindings: [
          { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.2 } },
        ],
      },
    ];
    const composite = new CompositeVirtualExitPolicy(primary, fallback);
    composite.configure(specs);
    composite.onSignal(entrySignal(CHANNEL_A, 10));
    composite.onSignal(entrySignal(CHANNEL_B, 10));

    // 收盘 9.4：CHANNEL_A 触发 primary stop，CHANNEL_B 未触发 primary 但触发 fallback
    const merged = composite.onBar(bar(9.4), 30);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => [p.channel.definitionId, p.exitKind])).toEqual([
      [1, 'stop'],
      [2, 'STRUCT_B'],
    ]);

    // primary 的退场已通知 fallback；fallback 的 CHANNEL_B 退场已通知 primary 清理 lot
    expect(fallbackExternalCalls).toHaveLength(1);
    expect(fallbackExternalCalls[0]?.channel).toEqual(CHANNEL_A);
    expect(fallbackLots.has('1:30')).toBe(false);

    // 后续 bar 跌破 CHANNEL_B -20% 止损线时，primary 不应再对已被 fallback 平仓的 CHANNEL_B 二次退出
    expect(
      primary.onBar(bar(7.5, new Date('2026-01-07T06:00:00Z')), 30),
    ).toHaveLength(0);
  });
});
