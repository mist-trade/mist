import {
  NotificationChannel,
  StrategyAlertDeliveryStatus,
  StrategyAlertStatus,
} from '@app/shared-data';
import { TradingEngine } from '@app/strategy';
import type { ChannelAdapter } from '../channels/channel-adapter.port';
import { AlertChannelDeliveryService } from './alert-channel-delivery.service';
import { NotificationDeliveryCounters } from './notification-delivery-counters';

type Repo = {
  findOne: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
  save: jest.Mock;
};

function mockRepo(): Repo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

const GROUP = Object.freeze({
  securityId: 9,
  effectiveTime: '2026-08-12T01:35:00.000Z',
});

function groupJob(channel: 'qq' | 'wechat' | 'feishu', ids: number[]) {
  return {
    contractVersion: 2 as const,
    group: { ...GROUP },
    channel,
    alertEventIds: ids,
  };
}

function delivery(
  overrides: Partial<{
    id: number;
    strategyAlertEventId: number;
    channel: NotificationChannel;
    status: StrategyAlertDeliveryStatus;
    attemptCount: number;
  }> = {},
) {
  return {
    id: 7,
    strategyAlertEventId: 1,
    channel: NotificationChannel.WECHAT,
    status: StrategyAlertDeliveryStatus.PENDING,
    attemptCount: 0,
    ...overrides,
  };
}

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    securityId: 9,
    strategyDefinitionId: 3,
    signalKind: 'entry',
    period: 30,
    signalTime: new Date('2026-08-12T09:35:00+08:00'),
    contextSnapshot: { triggerPrice: 12.5, badgeText: '二买' },
    decisionTrace: {
      trace: [
        { pluginId: 'plugin.regime.shanghai-index', name: 'regime 门禁' },
        { pluginId: 'plugin.chan.bsp', name: 'chan 二买' },
      ],
    },
    ...overrides,
  };
}

describe('AlertChannelDeliveryService (V2 grouped)', () => {
  let alertEvents: Repo;
  let signals: Repo;
  let securities: Repo;
  let deliveries: Repo;
  let strategyDefinitions: Repo;
  let adapter: jest.Mocked<ChannelAdapter>;
  let service: AlertChannelDeliveryService;
  let counters: NotificationDeliveryCounters;
  let fillLog: { loadBySecurity: jest.Mock; append: jest.Mock };

  beforeEach(() => {
    alertEvents = mockRepo();
    signals = mockRepo();
    securities = mockRepo();
    deliveries = mockRepo();
    strategyDefinitions = mockRepo();
    adapter = { channel: NotificationChannel.WECHAT, send: jest.fn() };
    counters = new NotificationDeliveryCounters();
    fillLog = {
      loadBySecurity: jest.fn().mockResolvedValue([]),
      append: jest.fn().mockResolvedValue(undefined),
    };
    service = new AlertChannelDeliveryService(
      alertEvents as any,
      signals as any,
      securities as any,
      deliveries as any,
      strategyDefinitions as any,
      [adapter],
      counters,
      new TradingEngine({ riskRules: [] }),
      1_000_000_000n,
      fillLog as any,
    );
  });

  /** Wire repo mocks for a group of events with their evidence. */
  function primeGroup(
    rows: ReturnType<typeof delivery>[],
    events: { id: number; strategySignalId: number }[],
    signalsOut: ReturnType<typeof makeSignal>[],
    reconcileRows: unknown[],
  ): void {
    deliveries.find.mockImplementation((opts: any) => {
      if (opts?.where?.channel !== undefined) return rows;
      return reconcileRows;
    });
    alertEvents.find.mockResolvedValue(events);
    signals.find.mockResolvedValue(signalsOut);
    securities.find.mockResolvedValue([
      { id: 9, code: '000001', name: '平安银行' },
    ]);
    strategyDefinitions.find.mockResolvedValue([{ id: 3, name: '全共振战术' }]);
  }

  it('sends ONE message for a multi-signal group, sells first, marks every row SENT with the same providerMessageId', async () => {
    const buySignal = makeSignal();
    const sellSignal = makeSignal({
      id: 6,
      strategyDefinitionId: 4,
      signalKind: 'exit',
      contextSnapshot: { triggerPrice: 12.1, badgeText: '顶背离' },
    });
    primeGroup(
      [
        delivery({ strategyAlertEventId: 1 }),
        delivery({ id: 8, strategyAlertEventId: 2 }),
      ],
      [
        { id: 1, strategySignalId: 5 },
        { id: 2, strategySignalId: 6 },
      ],
      [buySignal, sellSignal],
      [{ status: StrategyAlertDeliveryStatus.SENT }],
    );
    adapter.send.mockResolvedValue({
      status: 'sent',
      providerMessageId: 'mid-1',
    });

    await service.run(groupJob('wechat', [1, 2]), 0, 5);

    expect(adapter.send).toHaveBeenCalledTimes(1);
    const text = adapter.send.mock.calls[0][0].text as string;
    // 交易手册：买入指令产出（现金充足），同组卖出被显式拒绝（空仓）
    expect(text).toContain('[Mist 交易手册]');
    expect(text).toContain('▶ 买入');
    expect(text).toContain('✗ 卖出已拒绝：NO_POSITION');
    // 指令行携带紧凑 trace 链
    expect(text).toContain('regime 门禁 ✓ → chan 二买 ✓');
    expect(deliveries.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.SENT,
        attemptCount: 1,
        providerMessageId: 'mid-1',
        sentAt: expect.any(Date),
        lastError: null,
      }),
    );
    expect(deliveries.update).toHaveBeenCalledWith(
      8,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.SENT,
        providerMessageId: 'mid-1',
      }),
    );
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.DELIVERED,
    });
    expect(alertEvents.update).toHaveBeenCalledWith(2, {
      status: StrategyAlertStatus.DELIVERED,
    });
  });

  it('appends the compact trace chain to a single-signal group message', async () => {
    primeGroup(
      [delivery()],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal()],
      [{ status: StrategyAlertDeliveryStatus.SENT }],
    );
    adapter.send.mockResolvedValue({
      status: 'sent',
      providerMessageId: 'mid-2',
    });

    await service.run(groupJob('wechat', [1]), 0, 5);

    const text = adapter.send.mock.calls[0][0].text as string;
    expect(text).toContain('[Mist 交易手册] 000001 平安银行');
    expect(text).toContain('▶ 买入');
    expect(text).toContain('@ 12.50');
    expect(text).toContain('regime 门禁 ✓ → chan 二买 ✓');
  });

  it('falls back to the no-chain format when the signal has no decisionTrace', async () => {
    primeGroup(
      [delivery()],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal({ decisionTrace: null })],
      [{ status: StrategyAlertDeliveryStatus.SENT }],
    );
    adapter.send.mockResolvedValue({ status: 'sent' });

    await service.run(groupJob('wechat', [1]), 0, 5);

    const text = adapter.send.mock.calls[0][0].text as string;
    expect(text).not.toContain('regime 门禁 ✓');
    expect(text).toContain('▶ 买入');
  });

  it('marks FAILED and throws on transient failure with retries remaining', async () => {
    primeGroup(
      [delivery()],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal()],
      [{ status: StrategyAlertDeliveryStatus.FAILED }],
    );
    adapter.send.mockResolvedValue({
      status: 'transient_failure',
      error: 'timeout',
    });

    await expect(service.run(groupJob('wechat', [1]), 0, 5)).rejects.toThrow(
      /transient delivery failure/,
    );

    expect(deliveries.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.FAILED,
        attemptCount: 1,
        lastError: 'timeout',
      }),
    );
    // not DELIVERED (still has a non-sent channel)
    expect(alertEvents.update).not.toHaveBeenCalled();
  });

  it('dead-letters (no throw) on the last attempt of a transient failure', async () => {
    primeGroup(
      [delivery()],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal()],
      [{ status: StrategyAlertDeliveryStatus.DEAD_LETTERED }],
    );
    adapter.send.mockResolvedValue({
      status: 'transient_failure',
      error: 'still down',
    });

    // attemptsMade=4, maxAttempts=5 -> attempt 5 is the last
    await service.run(groupJob('wechat', [1]), 4, 5);

    expect(deliveries.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
        attemptCount: 1,
        lastError: 'still down',
      }),
    );
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.FAILED,
    });
  });

  it('dead-letters immediately on permanent failure (no retry, no throw)', async () => {
    primeGroup(
      [delivery()],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal()],
      [{ status: StrategyAlertDeliveryStatus.DEAD_LETTERED }],
    );
    adapter.send.mockResolvedValue({
      status: 'permanent_failure',
      error: 'not configured',
    });

    await service.run(groupJob('wechat', [1]), 0, 5);

    expect(deliveries.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
      }),
    );
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.FAILED,
    });
  });

  it('treats a throwing adapter as a transient failure', async () => {
    primeGroup(
      [delivery()],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal()],
      [{ status: StrategyAlertDeliveryStatus.FAILED }],
    );
    adapter.send.mockRejectedValue(new Error('network reset'));

    await expect(service.run(groupJob('wechat', [1]), 0, 5)).rejects.toThrow(
      /transient delivery failure/,
    );

    expect(deliveries.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.FAILED,
        lastError: 'network reset',
      }),
    );
  });

  it('dead-letters every group row when no adapter is configured for the channel', async () => {
    service = new AlertChannelDeliveryService(
      alertEvents as any,
      signals as any,
      securities as any,
      deliveries as any,
      strategyDefinitions as any,
      [], // no adapters configured
      counters,
      new TradingEngine({ riskRules: [] }),
      1_000_000_000n,
      fillLog as any,
    );
    const row = delivery({ channel: NotificationChannel.QQ });
    deliveries.find.mockImplementation(() => [row]);
    deliveries.update.mockResolvedValue(undefined);
    alertEvents.find.mockResolvedValue([{ id: 1, strategySignalId: 5 }]);
    deliveries.find.mockImplementation((opts: any) => {
      if (opts?.where?.channel !== undefined) return [row];
      return [{ status: StrategyAlertDeliveryStatus.DEAD_LETTERED }];
    });

    await service.run(groupJob('qq', [1]), 0, 5);

    expect(deliveries.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
      }),
    );
    // evidence never loaded (adapter check short-circuits before the batch load)
    expect(signals.find).not.toHaveBeenCalled();
  });

  it('is idempotent: skips when every delivery row is already terminal', async () => {
    deliveries.find.mockImplementation((opts: any) => {
      if (opts?.where?.channel !== undefined)
        return [delivery({ status: StrategyAlertDeliveryStatus.SENT })];
      return [];
    });

    await service.run(groupJob('wechat', [1]), 0, 5);

    expect(adapter.send).not.toHaveBeenCalled();
    expect(deliveries.update).not.toHaveBeenCalled();
    expect(alertEvents.update).not.toHaveBeenCalled();
  });

  it('reconciles FAILED when one channel is dead-lettered even if another is sent', async () => {
    primeGroup(
      [delivery()],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal()],
      [
        { status: StrategyAlertDeliveryStatus.SENT },
        { status: StrategyAlertDeliveryStatus.DEAD_LETTERED },
      ],
    );
    adapter.send.mockResolvedValue({ status: 'sent' });

    await service.run(groupJob('wechat', [1]), 0, 5);

    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.FAILED,
    });
  });

  it('excludes current group fills from prior attempts or sibling channels to prevent self-rejection', async () => {
    // 模拟兄弟渠道已抢先执行并回填了当前 alertEvent 1 的 fill 事件
    fillLog.loadBySecurity.mockResolvedValue([
      {
        idempotencyKey: '1',
        securityId: 9,
        securityCode: '000001',
        side: 'BUY',
        quantity: 100,
        priceLi: 12500n,
        feesLi: 5000n,
        netAmountLi: -1255000n,
        tradingDay: '2026-08-12',
      },
    ]);
    primeGroup(
      [delivery({ strategyAlertEventId: 1 })],
      [{ id: 1, strategySignalId: 5 }],
      [makeSignal()],
      [{ status: StrategyAlertDeliveryStatus.SENT }],
    );
    adapter.send.mockResolvedValue({ status: 'sent' });

    await service.run(groupJob('wechat', [1]), 0, 5);

    // 排除自身的 fill 后，快照重现组前状态，正常产出买入指令而不是被判定 ALREADY_HOLDING
    expect(adapter.send).toHaveBeenCalledWith({
      text: expect.stringContaining('▶ 买入'),
    });
    expect(adapter.send).not.toHaveBeenCalledWith({
      text: expect.stringContaining('ALREADY_HOLDING'),
    });
  });

  it('consolidates resonant same-direction entries and records contributorKeys in virtual fill instruction JSON', async () => {
    const buyA = makeSignal({
      id: 5,
      strategyDefinitionId: 3,
      period: 30,
      signalType: 'first_buy',
    });
    const buyB = makeSignal({
      id: 6,
      strategyDefinitionId: 4,
      period: 1440,
      signalType: 'golden_pocket',
      decisionTrace: {
        trace: [{ pluginId: 'plugin.fib', name: '斐波那契' }],
      },
    });
    deliveries.find.mockImplementation((opts: any) => {
      if (opts?.where?.channel !== undefined) {
        return [
          delivery({ id: 7, strategyAlertEventId: 2 }),
          delivery({ id: 8, strategyAlertEventId: 10 }),
        ];
      }
      return [{ status: StrategyAlertDeliveryStatus.SENT }];
    });
    alertEvents.find.mockResolvedValue([
      { id: 10, strategySignalId: 6 },
      { id: 2, strategySignalId: 5 },
    ]);
    signals.find.mockResolvedValue([buyA, buyB]);
    securities.find.mockResolvedValue([
      { id: 9, code: '000001', name: '平安银行' },
    ]);
    strategyDefinitions.find.mockResolvedValue([
      { id: 3, name: '策略A' },
      { id: 4, name: '策略B' },
    ]);
    adapter.send.mockResolvedValue({
      status: 'sent',
      providerMessageId: 'mid-resonance',
    });

    await service.run(groupJob('wechat', [10, 2]), 0, 5);

    expect(fillLog.append).toHaveBeenCalledTimes(1);
    expect(fillLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: '2',
        instruction: expect.objectContaining({
          instructionId: 'ti-2',
          action: 'BUY',
          contributorKeys: ['2', '10'],
          contributorsSummary:
            '共振(2): 策略A 30m first_buy + 策略B 日线 golden_pocket',
        }),
      }),
    );
    const text = adapter.send.mock.calls[0][0].text as string;
    expect(text).toContain(
      '共振(2): 策略A 30m first_buy + 策略B 日线 golden_pocket',
    );
    expect(text).not.toContain('ALREADY_HOLDING');
  });
});
