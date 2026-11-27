import {
  NotificationChannel,
  StrategyAlertDeliveryStatus,
  StrategyAlertStatus,
} from '@app/shared-data';
import { In, QueryFailedError } from 'typeorm';
import type { ChannelAdapter } from '../channels/channel-adapter.port';
import { AlertFanoutService } from './alert-fanout.service';

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
  effectiveTime: '2026-11-24T02:00:00.000Z',
});

function groupJob(alertEventIds: number[]) {
  return { contractVersion: 2 as const, group: { ...GROUP }, alertEventIds };
}

describe('AlertFanoutService', () => {
  let alertEvents: Repo;
  let deliveries: Repo;
  let queue: { enqueueChannel: jest.Mock };
  let service: AlertFanoutService;

  function makeService(adapters: ChannelAdapter[]): AlertFanoutService {
    return new AlertFanoutService(
      alertEvents as any,
      deliveries as any,
      adapters,
      queue as any,
    );
  }

  beforeEach(() => {
    alertEvents = mockRepo();
    deliveries = mockRepo();
    queue = { enqueueChannel: jest.fn().mockResolvedValue(undefined) };
    const wechat: ChannelAdapter = {
      channel: NotificationChannel.WECHAT,
      send: jest.fn(),
    };
    const qq: ChannelAdapter = {
      channel: NotificationChannel.QQ,
      send: jest.fn(),
    };
    service = makeService([wechat, qq]);
  });

  it('creates pending delivery rows for every group event + enqueues one channel job per channel', async () => {
    alertEvents.find.mockResolvedValueOnce([{ id: 5 }, { id: 6 }]);
    deliveries.find.mockResolvedValueOnce([]); // no existing rows

    await service.run(groupJob([5, 6]));

    expect(deliveries.find).toHaveBeenCalledTimes(1);
    expect(deliveries.save).toHaveBeenCalledTimes(2);
    expect(deliveries.save).toHaveBeenCalledWith([
      {
        strategyAlertEventId: 5,
        channel: NotificationChannel.WECHAT,
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
      },
      {
        strategyAlertEventId: 6,
        channel: NotificationChannel.WECHAT,
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
      },
    ]);
    expect(deliveries.save).toHaveBeenCalledWith([
      {
        strategyAlertEventId: 5,
        channel: NotificationChannel.QQ,
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
      },
      {
        strategyAlertEventId: 6,
        channel: NotificationChannel.QQ,
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
      },
    ]);
    // one channel job per channel carrying the whole group
    expect(queue.enqueueChannel).toHaveBeenCalledTimes(2);
    expect(queue.enqueueChannel).toHaveBeenCalledWith(
      GROUP,
      [5, 6],
      NotificationChannel.WECHAT,
    );
    expect(queue.enqueueChannel).toHaveBeenCalledWith(
      GROUP,
      [5, 6],
      NotificationChannel.QQ,
    );
  });

  it('skips terminal (SENT/DEAD_LETTERED) rows, still creates/enqueues PENDING/FAILED ones', async () => {
    alertEvents.find.mockResolvedValueOnce([{ id: 5 }, { id: 6 }]);
    // wechat: event5 done, event6 pending; qq: none
    deliveries.find.mockResolvedValueOnce([
      {
        strategyAlertEventId: 5,
        channel: NotificationChannel.WECHAT,
        status: StrategyAlertDeliveryStatus.SENT,
      },
      {
        strategyAlertEventId: 6,
        channel: NotificationChannel.WECHAT,
        status: StrategyAlertDeliveryStatus.PENDING,
      },
    ]);

    await service.run(groupJob([5, 6]));

    // wechat rows already present → only qq rows missing → saved in batch
    expect(deliveries.save).toHaveBeenCalledTimes(1);
    expect(deliveries.save).toHaveBeenCalledWith([
      {
        strategyAlertEventId: 5,
        channel: NotificationChannel.QQ,
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
      },
      {
        strategyAlertEventId: 6,
        channel: NotificationChannel.QQ,
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
      },
    ]);
    expect(queue.enqueueChannel).toHaveBeenCalledTimes(2);
    expect(queue.enqueueChannel).toHaveBeenCalledWith(
      GROUP,
      [5, 6],
      NotificationChannel.QQ,
    );
  });

  it('does nothing when every event in the group was cascade-deleted', async () => {
    alertEvents.find.mockResolvedValueOnce([]);
    await service.run(groupJob([5]));
    expect(queue.enqueueChannel).not.toHaveBeenCalled();
    expect(deliveries.save).not.toHaveBeenCalled();
  });

  it('delivers the surviving events and warns when some group members are missing', async () => {
    alertEvents.find.mockResolvedValueOnce([{ id: 6 }]); // 5 deleted
    deliveries.find.mockResolvedValueOnce([]);

    await service.run(groupJob([5, 6]));

    expect(deliveries.save).toHaveBeenCalledTimes(2);
    expect(queue.enqueueChannel).toHaveBeenCalledTimes(2);
    expect(queue.enqueueChannel).toHaveBeenCalledWith(
      GROUP,
      [5, 6],
      NotificationChannel.WECHAT,
    );
  });

  it('fails every group event when no channels are configured', async () => {
    service = makeService([]);
    alertEvents.find.mockResolvedValueOnce([{ id: 5 }, { id: 6 }]);
    await service.run(groupJob([5, 6]));
    expect(alertEvents.update).toHaveBeenCalledWith(
      { id: In([5, 6]) },
      { status: StrategyAlertStatus.FAILED },
    );
    expect(queue.enqueueChannel).not.toHaveBeenCalled();
  });

  it('swallows the exact delivery-row unique-constraint race (concurrent fanout)', async () => {
    alertEvents.find.mockResolvedValueOnce([{ id: 5 }]);
    deliveries.find.mockResolvedValueOnce([]);
    deliveries.save.mockRejectedValueOnce(
      dupError(
        "Duplicate entry '5-wechat' for key 'strategy_alert_deliveries.uq_strategy_alert_deliveries_event_channel'",
      ),
    );

    await service.run(groupJob([5]));

    // still enqueued despite the dup-entry on save
    expect(queue.enqueueChannel).toHaveBeenCalledTimes(2);
  });

  it('fails the job loudly when delivery-row save fails for a non-unique reason', async () => {
    alertEvents.find.mockResolvedValueOnce([{ id: 5 }]);
    deliveries.find.mockResolvedValueOnce([]);
    const failure = new Error('connection lost');
    deliveries.save.mockRejectedValueOnce(failure);

    await expect(service.run(groupJob([5]))).rejects.toBe(failure);
    // No channel job for a row that does not exist
    expect(queue.enqueueChannel).not.toHaveBeenCalled();
  });
});

function dupError(sqlMessage: string): Error {
  const driver = Object.assign(new Error(sqlMessage), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlMessage,
  });
  return new QueryFailedError('INSERT', [], driver);
}
