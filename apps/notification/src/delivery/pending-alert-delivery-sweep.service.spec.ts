import {
  PendingAlertDeliverySweepService,
  PENDING_SWEEP_INTERVAL_MS,
  PENDING_SWEEP_STALENESS_MS,
  PENDING_SWEEP_MAX_PER_PASS,
} from './pending-alert-delivery-sweep.service';

function createService() {
  const alertEvents = {
    find: jest.fn(),
  };
  const deliveries = {
    find: jest.fn(),
  };
  const signals = {
    find: jest.fn(),
  };
  const queue = { enqueueFanout: jest.fn().mockResolvedValue(undefined) };
  const service = new PendingAlertDeliverySweepService(
    alertEvents as never,
    deliveries as never,
    signals as never,
    queue as never,
  );
  return { service, alertEvents, deliveries, signals, queue };
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

  it('re-enqueues stranded events grouped by (securityId, effectiveTime)', async () => {
    const { service, alertEvents, deliveries, signals, queue } =
      createService();
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    alertEvents.find.mockResolvedValue([
      pendingEvent(1, stale, 5),
      pendingEvent(2, stale, 6), // same signal seal moment → same group
    ]);
    deliveries.find.mockResolvedValue([]);
    signals.find.mockResolvedValue([signal(5), signal(6)]);

    await service.sweep();

    // both events share one (securityId, effectiveTime) group → ONE fanout job
    expect(queue.enqueueFanout).toHaveBeenCalledTimes(1);
    expect(queue.enqueueFanout).toHaveBeenCalledWith(
      {
        securityId: 9,
        effectiveTime: '2026-08-12T01:35:00.000Z',
        tradingDay: '2026-08-12',
      },
      [1, 2],
    );
    expect(service.getRecoveredTotal()).toBe(2);
  });

  it('separates groups across different effective moments', async () => {
    const { service, alertEvents, deliveries, signals, queue } =
      createService();
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    alertEvents.find.mockResolvedValue([
      pendingEvent(1, stale, 5),
      pendingEvent(2, stale, 6),
    ]);
    deliveries.find.mockResolvedValue([]);
    signals.find.mockResolvedValue([
      signal(5),
      { ...signal(6), signalTime: new Date('2026-08-12T01:30:00.000Z') }, // 09:30 CST → different slot
    ]);

    await service.sweep();

    expect(queue.enqueueFanout).toHaveBeenCalledTimes(2);
    expect(service.getRecoveredTotal()).toBe(2);
  });

  it('skips events that already have delivery rows (in-flight/replay)', async () => {
    const { service, alertEvents, deliveries, signals, queue } =
      createService();
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    alertEvents.find.mockResolvedValue([
      pendingEvent(1, stale, 5),
      pendingEvent(2, stale, 6),
    ]);
    deliveries.find.mockResolvedValue([
      { strategyAlertEventId: 2 }, // event 2 has a row => not stranded
    ]);
    signals.find.mockResolvedValue([signal(5)]);

    await service.sweep();

    expect(queue.enqueueFanout).toHaveBeenCalledTimes(1);
    expect(queue.enqueueFanout).toHaveBeenCalledWith(
      {
        securityId: 9,
        effectiveTime: '2026-08-12T01:35:00.000Z',
        tradingDay: '2026-08-12',
      },
      [1],
    );
    expect(service.getRecoveredTotal()).toBe(1);
  });

  it('skips events whose signal row is missing (cannot derive the group)', async () => {
    const { service, alertEvents, deliveries, signals, queue } =
      createService();
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    alertEvents.find.mockResolvedValue([pendingEvent(1, stale, 999)]);
    deliveries.find.mockResolvedValue([]);
    signals.find.mockResolvedValue([]);

    await service.sweep();

    expect(queue.enqueueFanout).not.toHaveBeenCalled();
    expect(service.getRecoveredTotal()).toBe(0);
  });

  it('skips fresh events below the staleness threshold', async () => {
    const { service, alertEvents, deliveries, queue } = createService();
    // The query itself filters by createdAt; a fresh event must not be
    // returned by the repository (the service trusts the threshold filter).
    alertEvents.find.mockResolvedValue([]);
    deliveries.find.mockResolvedValue([]);

    await service.sweep();

    expect(alertEvents.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: PENDING_SWEEP_MAX_PER_PASS,
      }),
    );
    expect(queue.enqueueFanout).not.toHaveBeenCalled();
  });

  it('does not run overlapping passes (async re-entrancy guard)', async () => {
    const { service, alertEvents, deliveries, signals, queue } =
      createService();
    let release: () => void = () => undefined;
    alertEvents.find.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([pendingEvent(1, new Date(), 5)]);
      }),
    );
    deliveries.find.mockResolvedValue([]);
    signals.find.mockResolvedValue([signal(5)]);

    const first = service.sweep();
    // Second pass while the first is still awaiting must be a no-op.
    await service.sweep();
    release();
    await first;

    expect(queue.enqueueFanout).toHaveBeenCalledTimes(1);
  });
});
