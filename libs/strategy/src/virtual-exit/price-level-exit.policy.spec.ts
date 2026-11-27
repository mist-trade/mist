import type { StrategyBar } from '@app/market-data';
import { PriceLevelExitPolicy } from './price-level-exit.policy';
import type {
  VirtualExitChannelSpec,
  VirtualExitRuleBinding,
} from './virtual-exit.port';
import type { KernelSignal } from '../kernel/kernel.types';

const CHANNEL = { definitionId: 1, versionId: 1, period: 30 };

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

function entrySignal(triggerPrice: number): KernelSignal {
  return {
    definitionId: CHANNEL.definitionId,
    versionId: CHANNEL.versionId,
    signalKind: 'entry',
    channel: CHANNEL,
    signalTime: new Date('2026-01-05T07:35:00Z'),
    triggerPrice,
    pivotTime: null,
    pivotPrice: null,
    signalType: 'CHAN_SECOND_BUY',
    decisionTrace: {},
    contextSnapshot: {},
    ruleSnapshot: {},
  };
}

function exitSignal(): KernelSignal {
  return {
    ...entrySignal(0),
    signalKind: 'exit',
    signalType: 'CHAN_SECOND_SELL',
    triggerPrice: 0,
  };
}

function configure(
  policy: PriceLevelExitPolicy,
  rules: VirtualExitRuleBinding[],
): void {
  const specs: VirtualExitChannelSpec[] = [
    { channel: CHANNEL, bindings: rules },
  ];
  policy.configure(specs);
}

describe('PriceLevelExitPolicy（价格型虚拟出场求值器）', () => {
  it('stop：收盘跌破成本 × (1 + lossRatio) 触发，产出出场提案并平批', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      {
        ownerPluginId: 'plugin.exit.price-defense',
        rule: { kind: 'stop', lossRatio: -0.08 },
      },
    ]);
    policy.onSignal(entrySignal(10));

    // 9.19 < 9.2 → 触发
    const proposals = policy.onBar(bar(9.19), 30);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].ownerPluginId).toBe('plugin.exit.price-defense');
    expect(proposals[0].exitKind).toBe('stop');
    expect(proposals[0].ruleId).toBe('plugin.exit.price-defense:stop:default');
    expect(proposals[0].channel).toEqual(CHANNEL);
    expect(proposals[0].evidence).toMatchObject({
      entryPrice: 10,
      lossRatio: -0.08,
    });

    // 触发即平批：同 bar 再次求值不重复触发
    expect(policy.onBar(bar(9.0), 30)).toHaveLength(0);
  });

  it('stop：未破线不触发，持仓继续推进', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.08 } },
    ]);
    policy.onSignal(entrySignal(10));
    expect(policy.onBar(bar(9.21), 30)).toHaveLength(0);
    expect(policy.onBar(bar(10.5), 30)).toHaveLength(0);
  });

  it('breakeven：峰值浮盈达标后跌破成本触发；未达峰值不触发', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'breakeven', activationGain: 0.1 } },
    ]);
    policy.onSignal(entrySignal(10));

    // 浮盈 12% → 峰值达标
    expect(policy.onBar(bar(11.2), 30)).toHaveLength(0);
    // 回落至成本下方 → 保本离场
    const proposals = policy.onBar(bar(9.9), 30);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].exitKind).toBe('breakeven');
    expect(proposals[0].evidence).toMatchObject({ peakPrice: 11.2 });
  });

  it('trailing：峰值浮盈达标后自峰值回撤超阈值触发', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      {
        ownerPluginId: 'p',
        rule: { kind: 'trailing', activationGain: 0.1, drawdownRatio: 0.05 },
      },
    ]);
    policy.onSignal(entrySignal(10));

    // 峰值 11.5（+15%）
    policy.onBar(bar(11.5), 30);
    // 回撤至 10.95 = 峰值 × 0.95 边界 → 不触发（>= 阈值）
    expect(policy.onBar(bar(10.95), 30)).toHaveLength(0);
    // 回撤至 10.9 < 10.925 → 触发
    const proposals = policy.onBar(bar(10.9), 30);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].exitKind).toBe('trailing');
    expect(proposals[0].evidence).toMatchObject({
      peakPrice: 11.5,
      drawdownRatio: 0.05,
    });
  });

  it('time_expired：持有 Bar 数达上限触发', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'time_expired', maxHoldingBars: 3 } },
    ]);
    policy.onSignal(entrySignal(10));
    expect(policy.onBar(bar(10), 30)).toHaveLength(0); // 1
    expect(policy.onBar(bar(10), 30)).toHaveLength(0); // 2
    const proposals = policy.onBar(bar(10), 30); // 3
    expect(proposals).toHaveLength(1);
    expect(proposals[0].exitKind).toBe('time_expired');
    expect(proposals[0].evidence).toMatchObject({
      barsHeld: 3,
      maxHoldingBars: 3,
    });
  });

  it('多规则按声明顺序首条终局生效', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'breakeven', activationGain: 0.5 } }, // 未达标
      { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.08 } },
    ]);
    policy.onSignal(entrySignal(10));
    const proposals = policy.onBar(bar(9.0), 30);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].exitKind).toBe('stop');
  });

  it('EXIT 信号平批后不再触发；重新 ENTRY 后恢复求值', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.08 } },
    ]);
    policy.onSignal(entrySignal(10));
    policy.onSignal(exitSignal());
    expect(policy.onBar(bar(9.0), 30)).toHaveLength(0);

    policy.onSignal({ ...entrySignal(12) });
    expect(policy.onBar(bar(11.0), 30)).toHaveLength(1); // 11 < 12×0.92=11.04
  });

  it('非本周期 bar 与结构性规则通道均跳过', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'structural_breakdown' } },
    ]);
    policy.onSignal(entrySignal(10));
    // 通道只含结构型规则 → configure 过滤后无求值通道
    expect(policy.onBar(bar(9.0), 30)).toHaveLength(0);

    const p2 = new PriceLevelExitPolicy();
    configure(p2, [
      { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.08 } },
    ]);
    p2.onSignal(entrySignal(10));
    // 其它周期 bar 不求值
    expect(
      p2.onBar(bar(9.0, new Date('2026-01-06T07:00:00Z')), 60),
    ).toHaveLength(0);
  });

  it('configure 重置清空全部虚拟持仓', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.08 } },
    ]);
    policy.onSignal(entrySignal(10));
    policy.configure([]);
    expect(policy.onBar(bar(9.0), 30)).toHaveLength(0);
  });

  it('扩展外部虚拟出场规则可透传共存且不影响内置价位规则求值', () => {
    const policy = new PriceLevelExitPolicy();
    const externalRule = {
      kind: 'pa_measured_move_tp' as const,
      id: 'pa.tp1',
      targetRatio: 1.0,
    };
    configure(policy, [
      { ownerPluginId: 'plugin.private.pa', rule: externalRule },
      { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.05 } },
    ]);
    policy.onSignal(entrySignal(10));
    // 外部自定义规则由外部策略求值器处理，PriceLevelExitPolicy 仅触发同通道内置规则
    const proposals = policy.onBar(bar(9.4), 30);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.exitKind).toBe('stop');
  });

  it('缺少或出现 NaN 规则字段/价格时不触发误平仓，且 updateLotWatermark 防御非有限值', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      {
        ownerPluginId: 'p',
        rule: {
          kind: 'trailing',
          activationGain: 0.1,
          drawdownRatio: undefined as unknown as number,
        },
      },
      {
        ownerPluginId: 'p',
        rule: {
          kind: 'stop',
          lossRatio: Number.NaN,
        },
      },
      {
        ownerPluginId: 'p',
        rule: {
          kind: 'breakeven',
          activationGain: Number.NaN,
        },
      },
      {
        ownerPluginId: 'p',
        rule: {
          kind: 'time_expired',
          maxHoldingBars: Number.NaN,
        },
      },
    ]);
    policy.onSignal(entrySignal(10));

    // 盈利 bar 与 NaN close bar 均不得误触发，且峰值不被 NaN 污染
    expect(policy.onBar(bar(12.5), 30)).toHaveLength(0);
    expect(policy.onBar(bar(Number.NaN), 30)).toHaveLength(0);
    expect(policy.onBar(bar(0), 30)).toHaveLength(0);
    expect(policy.onBar(bar(11.0), 30)).toHaveLength(0);

    // 有效 trailing 规则在遭遇 NaN bar 后，仍能沿用有效 peakPrice 正常求值
    const p2 = new PriceLevelExitPolicy();
    configure(p2, [
      {
        ownerPluginId: 'p',
        rule: { kind: 'trailing', activationGain: 0.1, drawdownRatio: 0.05 },
      },
    ]);
    p2.onSignal(entrySignal(10));
    expect(p2.onBar(bar(12.0), 30)).toHaveLength(0); // peak = 12
    expect(p2.onBar(bar(Number.NaN), 30)).toHaveLength(0); // 不得破坏 peak 或误退出
    const triggered = p2.onBar(bar(11.3), 30); // 11.3 < 12 * 0.95 = 11.4
    expect(triggered).toHaveLength(1);
    expect(triggered[0]?.exitKind).toBe('trailing');
  });

  it('onExternalExit 清理对应通道虚拟持仓跟踪', () => {
    const policy = new PriceLevelExitPolicy();
    configure(policy, [
      { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.05 } },
    ]);
    policy.onSignal(entrySignal(10));
    policy.onExternalExit({
      channel: CHANNEL,
      ownerPluginId: 'external.plugin',
      ruleId: 'ext-1',
      exitKind: 'STRUCTURAL_EXIT',
      reason: '外部结构出场',
      badgeText: '结构出场',
    });

    expect(policy.onBar(bar(9.0), 30)).toHaveLength(0);
  });

  it('Probe A & B：next_bar_open 严守 D1 开盘成交与自然日 T+1，冻结期不误平也不误删持仓', () => {
    const dailyChannel = { definitionId: 11, versionId: 1, period: 1440 };
    const dailyBar = (dayIso: string, close: number): StrategyBar => ({
      securityId: 1,
      securityCode: '000001',
      source: 'tdx',
      period: 1440,
      timestamp: new Date(dayIso),
      open: close,
      high: close,
      low: close,
      close,
      volume: '1000',
      amount: '10000',
      type: 'complete',
    });
    const pNext = new PriceLevelExitPolicy({ executionMode: 'next_bar_open' });
    pNext.configure([
      {
        channel: dailyChannel,
        bindings: [
          {
            ownerPluginId: 'p',
            rule: { kind: 'time_expired', maxHoldingBars: 1 },
          },
        ],
      },
    ]);
    pNext.onSignal({
      definitionId: 11,
      versionId: 1,
      signalKind: 'entry',
      channel: dailyChannel,
      signalTime: new Date('2026-01-05T00:00:00+08:00'),
      triggerPrice: 10.0,
      pivotTime: null,
      pivotPrice: null,
      signalType: 'FIRST_BUY',
      decisionTrace: {},
      contextSnapshot: {},
      ruleSnapshot: {},
    });

    // D1 (2026-01-06) 为 Next-Bar Open 建仓日：barsHeld 推进但 T+1 冻结，绝不得误发 time_expired(1) 且保留持仓
    expect(
      pNext.onBar(dailyBar('2026-01-06T00:00:00+08:00', 10.1), 1440),
    ).toHaveLength(0);
    // D2 (2026-01-07) 解锁后正常触发超时出场
    const d2Exits = pNext.onBar(
      dailyBar('2026-01-07T00:00:00+08:00', 10.2),
      1440,
    );
    expect(d2Exits).toHaveLength(1);
    expect(d2Exits[0]?.exitKind).toBe('time_expired');

    // Probe B：assumed_close + enforceT1 时同日盘中跌破止损线不发射、不删批，次日再跌正常止损
    const pIntraday = new PriceLevelExitPolicy({
      executionMode: 'assumed_close',
      enforceT1: true,
    });
    pIntraday.configure([
      {
        channel: CHANNEL,
        bindings: [
          { ownerPluginId: 'p', rule: { kind: 'stop', lossRatio: -0.02 } },
        ],
      },
    ]);
    pIntraday.onSignal({
      ...entrySignal(10.0),
      signalTime: new Date('2026-01-05T10:00:00+08:00'),
    });
    expect(
      pIntraday.onBar(bar(9.5, new Date('2026-01-05T14:00:00+08:00')), 30),
    ).toHaveLength(0);
    const unlocked = pIntraday.onBar(
      bar(9.4, new Date('2026-01-06T10:00:00+08:00')),
      30,
    );
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]?.exitKind).toBe('stop');
  });
});
