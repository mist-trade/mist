import {
  NotificationChannel,
  StrategyAlertDeliveryStatus,
  StrategyAlertStatus,
} from '@app/shared-data';
import { AlertReplayService } from './alert-replay.service';

type Repo = {
  findOne: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
};

function mockRepo(): Repo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

const GROUP = {
  securityId: 9,
  effectiveTime: '2026-08-12T01:35:00.000Z',
  tradingDay: '2026-08-12',
};

describe('AlertReplayService', () => {
  let alertEvents: Repo;
  let deliveries: Repo;
  let signals: Repo;
  let queue: { enqueueChannelReplay: jest.Mock };
  let service: AlertReplayService;

  beforeEach(() => {
    alertEvents = mockRepo();
    deliveries = mockRepo();
    signals = mockRepo();
    queue = { enqueueChannelReplay: jest.fn().mockResolvedValue(undefined) };
    service = new AlertReplayService(
      alertEvents as any,
      deliveries as any,
      signals as any,
      queue as any,
    );
  });

  function primeSignal(): void {
    signals.findOne.mockResolvedValue({
      id: 5,
      securityId: 9,
      period: 30,
      signalTime: new Date('2026-08-12T09:35:00+08:00'),
    });
  }

  it('throws NotFound when the AlertEvent does not exist', async () => {
    alertEvents.findOne.mockResolvedValueOnce(null);
    await expect(service.replay(99)).rejects.toThrow(/not found/i);
    expect(queue.enqueueChannelReplay).not.toHaveBeenCalled();
  });

  it('returns replayed=0 when no stuck deliveries', async () => {
    alertEvents.findOne.mockResolvedValueOnce({ id: 1, strategySignalId: 5 });
    deliveries.find.mockResolvedValueOnce([]);
    const res = await service.replay(1);
    expect(res).toEqual({ replayed: 0 });
    expect(queue.enqueueChannelReplay).not.toHaveBeenCalled();
    expect(alertEvents.update).not.toHaveBeenCalled();
  });

  it('skips with replayed=0 when the signal row is missing (cannot derive the V2 group)', async () => {
    alertEvents.findOne.mockResolvedValueOnce({ id: 1, strategySignalId: 5 });
    signals.findOne.mockResolvedValueOnce(null);
    deliveries.find.mockResolvedValueOnce([
      {
        id: 10,
        strategyAlertEventId: 1,
        channel: NotificationChannel.WECHAT,
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
      },
    ]);
    const res = await service.replay(1);
    expect(res).toEqual({ replayed: 0 });
    expect(deliveries.update).not.toHaveBeenCalled();
    expect(queue.enqueueChannelReplay).not.toHaveBeenCalled();
  });

  it('resets stuck rows to PENDING, re-enqueues each with the derived single-element group, drops AlertEvent to PENDING', async () => {
    alertEvents.findOne.mockResolvedValueOnce({
      id: 1,
      status: StrategyAlertStatus.FAILED,
      strategySignalId: 5,
    });
    primeSignal();
    deliveries.find.mockResolvedValueOnce([
      {
        id: 10,
        strategyAlertEventId: 1,
        channel: NotificationChannel.WECHAT,
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
      },
      {
        id: 11,
        strategyAlertEventId: 1,
        channel: NotificationChannel.QQ,
        status: StrategyAlertDeliveryStatus.FAILED,
      },
    ]);
    const res = await service.replay(1);
    expect(res).toEqual({ replayed: 2 });
    // each stuck row reset
    expect(deliveries.update).toHaveBeenCalledWith(10, {
      status: StrategyAlertDeliveryStatus.PENDING,
      attemptCount: 0,
      lastError: null,
    });
    expect(deliveries.update).toHaveBeenCalledWith(11, {
      status: StrategyAlertDeliveryStatus.PENDING,
      attemptCount: 0,
      lastError: null,
    });
    // re-enqueued per channel with the in-memory-derived group + single id
    expect(queue.enqueueChannelReplay).toHaveBeenCalledWith(
      GROUP,
      [1],
      NotificationChannel.WECHAT,
    );
    expect(queue.enqueueChannelReplay).toHaveBeenCalledWith(
      GROUP,
      [1],
      NotificationChannel.QQ,
    );
    // aggregate reset so reconcile can re-evaluate
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.PENDING,
    });
    const alertUpdateOrder = alertEvents.update.mock.invocationCallOrder[0];
    const firstEnqueueOrder =
      queue.enqueueChannelReplay.mock.invocationCallOrder[0];
    expect(alertUpdateOrder).toBeLessThan(firstEnqueueOrder);
  });

  it('is a no-op when the query returns no stuck rows (SENT excluded by query)', async () => {
    // The service queries with status In([FAILED, DEAD_LETTERED]); SENT rows never
    // appear in the result, so an all-SENT event yields [] and nothing is replayed.
    alertEvents.findOne.mockResolvedValueOnce({ id: 1, strategySignalId: 5 });
    deliveries.find.mockResolvedValueOnce([]);
    const res = await service.replay(1);
    expect(res).toEqual({ replayed: 0 });
    expect(queue.enqueueChannelReplay).not.toHaveBeenCalled();
    expect(alertEvents.update).not.toHaveBeenCalled();
  });
});
