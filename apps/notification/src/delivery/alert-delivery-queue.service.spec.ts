import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB,
  alertDeliveryFanoutJobId,
  alertDeliverySweepFanoutJobId,
} from '@app/contracts';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';

jest.mock('bullmq');

describe('AlertDeliveryQueueService', () => {
  const group = {
    securityId: 9,
    effectiveTime: '2026-11-24T02:00:00.000Z',
    tradingDay: '2026-11-24',
  };

  let mockQueue: { add: jest.Mock; close: jest.Mock };
  let service: AlertDeliveryQueueService;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (Queue as unknown as jest.Mock).mockImplementation(() => mockQueue);
    service = new AlertDeliveryQueueService(
      new ConfigService({
        MIST_REALTIME_REDIS_URL: 'redis://127.0.0.1:6379/0',
      }),
    );
  });

  it('enqueues primary fanout with deterministic group-scoped jobId', async () => {
    await service.enqueueFanout(group, [11, 12]);

    const expectedPayload = {
      contractVersion: 2 as const,
      group,
      alertEventIds: [11, 12],
    };
    expect(mockQueue.add).toHaveBeenCalledWith(
      STRATEGY_ALERT_DELIVERY_FANOUT_JOB,
      expectedPayload,
      expect.objectContaining({
        jobId: alertDeliveryFanoutJobId(expectedPayload),
      }),
    );
  });

  it('enqueues sweep fanout with alertDeliverySweepFanoutJobId to avoid primary fanout collision', async () => {
    await service.enqueueSweepFanout(group, [12, 11]);

    const expectedPayload = {
      contractVersion: 2 as const,
      group,
      alertEventIds: [12, 11],
    };
    const sweepJobId = alertDeliverySweepFanoutJobId(expectedPayload);
    expect(sweepJobId).not.toBe(alertDeliveryFanoutJobId(expectedPayload));
    expect(mockQueue.add).toHaveBeenCalledWith(
      STRATEGY_ALERT_DELIVERY_FANOUT_JOB,
      expectedPayload,
      expect.objectContaining({
        jobId: sweepJobId,
      }),
    );
  });
});
