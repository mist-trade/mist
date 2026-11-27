import { StrategyAlertDelivery } from '@app/shared-data';
import {
  PendingAlertDeliverySweepService,
  PENDING_SWEEP_INTERVAL_MS,
  PENDING_SWEEP_STALENESS_MS,
  PENDING_SWEEP_MAX_PER_PASS,
} from './pending-alert-delivery-sweep.service';

function createQueryBuilder(rows: unknown[] = []) {
  const qb = {
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

function createService(strandedRows: unknown[] = []) {
  const qb = createQueryBuilder(strandedRows);
  const alertEvents = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    find: jest.fn().mockResolvedValue(strandedRows),
  };
  const deliveries = {
    find: jest.fn().mockResolvedValue([]),
  };
  const signals = {
    find: jest.fn(),
  };
  const queue = {
    enqueueFanout: jest.fn().mockResolvedValue(undefined),
    enqueueSweepFanout: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PendingAlertDeliverySweepService(
    alertEvents as never,
    signals as never,
    queue as never,
  );
  return { service, alertEvents, qb, deliveries, signals, queue };
}

function pendingEvent(id: number, createdAt: Date, strategySignalId: number) {
  return { id, status: 'pending', createdAt, strategySignalId };
}

function signal(id: number, securityId = 9) {
  return {
    id,
    securityId,
    period: 30,
    signalTime: new Date('2026-08-12T01:35:00.000Z'), // 09:35 CST → eff 09:35 CST
  };
}

describe('PendingAlertDeliverySweepService', () => {
  it('exports bounded constants', () => {
    expect(PENDING_SWEEP_INTERVAL_MS).toBe(60_000);
    expect(PENDING_SWEEP_STALENESS_MS).toBe(5 * 60_000);
    expect(PENDING_SWEEP_MAX_PER_PASS).toBe(100);
  });

  it('re-enqueues stranded events grouped by (securityId, effectiveTime) using enqueueSweepFanout', async () => {
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    const { service, alertEvents, qb, signals, queue } = createService([
      pendingEvent(1, stale, 5),
      pendingEvent(2, stale, 6), // same signal seal moment → same group
    ]);
    signals.find.mockResolvedValue([signal(5), signal(6)]);

    await service.sweep();

    expect(alertEvents.createQueryBuilder).toHaveBeenCalledWith('e');
    expect(qb.leftJoin).toHaveBeenCalledWith(
      StrategyAlertDelivery,
      'd',
      'd.strategyAlertEventId = e.id',
    );
    expect(qb.andWhere).toHaveBeenCalledWith('d.id IS NULL');
    expect(qb.orderBy).toHaveBeenCalledWith('e.id', 'ASC');
    expect(qb.limit).toHaveBeenCalledWith(PENDING_SWEEP_MAX_PER_PASS);

    // both events share one (securityId, effectiveTime) group → ONE sweep fanout job
    expect(queue.enqueueSweepFanout).toHaveBeenCalledTimes(1);
    expect(queue.enqueueSweepFanout).toHaveBeenCalledWith(
      {
        securityId: 9,
        effectiveTime: '2026-08-12T01:35:00.000Z',
        tradingDay: '2026-08-12',
      },
      [1, 2],
    );
    expect(queue.enqueueFanout).not.toHaveBeenCalled();
    expect(service.getRecoveredTotal()).toBe(2);
  });

  it('discovers a stranded event behind >100 in-flight PENDING rows via SQL LEFT JOIN', async () => {
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    const strandedId = 150;
    const { service, alertEvents, qb, deliveries, signals, queue } =
      createService([pendingEvent(strandedId, stale, 500)]);
    signals.find.mockResolvedValue([signal(500)]);

    await service.sweep();

    // Must filter via SQL LEFT JOIN rather than fetching alertEvents.find({ take: 100 }) first
    expect(alertEvents.find).not.toHaveBeenCalled();
    expect(deliveries.find).not.toHaveBeenCalled();
    expect(qb.leftJoin).toHaveBeenCalledWith(
      StrategyAlertDelivery,
      'd',
      'd.strategyAlertEventId = e.id',
    );
    expect(qb.andWhere).toHaveBeenCalledWith('d.id IS NULL');
    expect(queue.enqueueSweepFanout).toHaveBeenCalledTimes(1);
    expect(queue.enqueueSweepFanout).toHaveBeenCalledWith(
      {
        securityId: 9,
        effectiveTime: '2026-08-12T01:35:00.000Z',
        tradingDay: '2026-08-12',
      },
      [strandedId],
    );
  });

  it('separates groups across different effective moments', async () => {
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    const { service, signals, queue } = createService([
      pendingEvent(1, stale, 5),
      pendingEvent(2, stale, 6),
    ]);
    signals.find.mockResolvedValue([
      signal(5),
      { ...signal(6), signalTime: new Date('2026-08-12T01:30:00.000Z') }, // 09:30 CST → different slot
    ]);

    await service.sweep();

    expect(queue.enqueueSweepFanout).toHaveBeenCalledTimes(2);
    expect(service.getRecoveredTotal()).toBe(2);
  });

  it('skips events whose signal row is missing (cannot derive the group)', async () => {
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    const { service, signals, queue } = createService([
      pendingEvent(1, stale, 999),
    ]);
    signals.find.mockResolvedValue([]);

    await service.sweep();

    expect(queue.enqueueSweepFanout).not.toHaveBeenCalled();
    expect(service.getRecoveredTotal()).toBe(0);
  });

  it('bounds query with staleness cutoff and PENDING_SWEEP_MAX_PER_PASS limit', async () => {
    const { service, qb, queue } = createService([]);

    await service.sweep();

    expect(qb.where).toHaveBeenCalledWith('e.status = :status', {
      status: 'pending',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('e.createdAt <= :cutoff', {
      cutoff: expect.any(Date),
    });
    expect(qb.limit).toHaveBeenCalledWith(PENDING_SWEEP_MAX_PER_PASS);
    expect(queue.enqueueSweepFanout).not.toHaveBeenCalled();
  });

  it('does not run overlapping passes (async re-entrancy guard)', async () => {
    const { service, qb, signals, queue } = createService();
    let release: () => void = () => undefined;
    qb.getMany.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([pendingEvent(1, new Date(), 5)]);
      }),
    );
    signals.find.mockResolvedValue([signal(5)]);

    const first = service.sweep();
    // Second pass while the first is still awaiting must be a no-op.
    await service.sweep();
    release();
    await first;

    expect(queue.enqueueSweepFanout).toHaveBeenCalledTimes(1);
  });
});
