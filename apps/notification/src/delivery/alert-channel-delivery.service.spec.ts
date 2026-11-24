import {
  NotificationChannel,
  StrategyAlertDeliveryStatus,
  StrategyAlertStatus,
} from '@app/shared-data';
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
    confidence: 88.5,
    confidenceLevel: 'HIGH',
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

  beforeEach(() => {
    alertEvents = mockRepo();
    signals = mockRepo();
    securities = mockRepo();
    deliveries = mockRepo();
    strategyDefinitions = mockRepo();
    adapter = { channel: NotificationChannel.WECHAT, send: jest.fn() };
    counters = new NotificationDeliveryCounters();
    service = new AlertChannelDeliveryService(
      alertEvents as any,
      signals as any,
      securities as any,
      deliveries as any,
      strategyDefinitions as any,
      [adapter],
      counters,
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
      confidence: 80.4,
      confidenceLevel: 'MEDIUM',
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
    // 卖出在前
    expect(text.indexOf('卖出')).toBeLessThan(text.indexOf('买入'));
    expect(text).toContain('- 卖出');
    expect(text).toContain('- 买入');
    // 每信号一行紧凑 trace 链
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
    expect(text).toContain('[Mist] [HIGH 88.5%] 000001 平安银行 二买 @ 12.5');
    expect(text).toContain('链路：regime 门禁 ✓ → chan 二买 ✓');
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
    expect(text).not.toContain('链路：');
    expect(text).toContain('二买');
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
});
