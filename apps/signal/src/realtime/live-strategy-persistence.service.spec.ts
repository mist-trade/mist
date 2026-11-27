import { QueryFailedError } from 'typeorm';
import { isUniqueConstraintViolation } from '@app/shared-data';
import {
  LiveStrategyPersistenceService,
  liveStrategyAlertDedupeKey,
} from './live-strategy-persistence.service';

describe('LiveStrategyPersistenceService', () => {
  it('writes Signal and PENDING AlertEvent in one transaction', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, value) => value),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 77 })
        .mockResolvedValueOnce({ id: 88 }),
    };
    const dataSource = {
      transaction: jest.fn((operation) => operation(manager)),
    };
    const service = new LiveStrategyPersistenceService(dataSource as never);

    const result = await service.persist(candidate());
    expect(result.outcome).toBe('created');
    expect(result.alertEventId).toBe(88);

    expect(manager.query).toHaveBeenCalledWith(
      'SET SESSION innodb_lock_wait_timeout = 3',
    );
    expect(manager.create.mock.calls[0]?.[1]).toMatchObject({
      strategyDefinitionId: 3,
      strategyVersionId: 7,
      securityId: 9,
      signalTime: new Date('2026-08-04T06:44:00.000Z'),
      decisionTrace: { flowId: 'test_flow' },
      contextSnapshot: {
        k: { type: 'incomplete', close: 28 },
        triggerPrice: 28,
      },
    });
    expect(manager.create.mock.calls[1]?.[1]).toMatchObject({
      strategySignalId: 77,
      status: 'pending',
      dedupeKey: 'live-v1:3:7:9:tdx:5:entry:LEGACY_DSL:1785825840000',
    });
  });

  it('classifies only the exact named AlertEvent unique conflict', async () => {
    const exact = duplicateError(
      "Duplicate entry 'x' for key 'strategy_alert_events.uq_strategy_alert_events_dedupe_key'",
    );
    const service = new LiveStrategyPersistenceService({
      transaction: jest.fn().mockRejectedValue(exact),
    } as never);

    await expect(service.persist(candidate())).resolves.toMatchObject({
      outcome: 'duplicate_skipped',
      alertEventId: null,
    });
    expect(
      isUniqueConstraintViolation(exact, 'uq_strategy_alert_events_dedupe_key'),
    ).toBe(true);
    expect(
      isUniqueConstraintViolation(
        duplicateError("Duplicate entry 'x' for key 'some_other_unique'"),
        'uq_strategy_alert_events_dedupe_key',
      ),
    ).toBe(false);
    expect(
      isUniqueConstraintViolation(
        duplicateError('Duplicate entry without a named key'),
        'uq_strategy_alert_events_dedupe_key',
      ),
    ).toBe(false);
  });

  it('propagates an AlertEvent write failure without readback or retry', async () => {
    const failure = new Error('alert insert failed');
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, value) => value),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 77 })
        .mockRejectedValueOnce(failure),
    };
    const dataSource = {
      transaction: jest.fn((operation) => operation(manager)),
    };
    const service = new LiveStrategyPersistenceService(dataSource as never);

    await expect(service.persist(candidate())).rejects.toBe(failure);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  it('builds identity only from the approved result fields', () => {
    expect(liveStrategyAlertDedupeKey(candidate())).toBe(
      'live-v1:3:7:9:tdx:5:entry:LEGACY_DSL:1785825840000',
    );
  });

  describe('publishGroupedDeliveries (V2 batch grouping)', () => {
    function candidateAt(time: string, securityId = 9) {
      return { ...candidate(), signalTime: new Date(time), securityId };
    }

    it('groups created events by (securityId, effectiveTime) and enqueues one fanout per group', async () => {
      const publishGroup = jest.fn().mockResolvedValue(undefined);
      const service = new LiveStrategyPersistenceService(
        { transaction: jest.fn() } as never,
        { publishGroup } as never,
      );
      const a = {
        candidate: candidateAt('2026-08-04T06:40:00.000Z'),
        outcome: 'created' as const,
        alertEventId: 11,
      };
      const b = {
        candidate: candidateAt('2026-08-04T06:40:00.000Z'),
        outcome: 'created' as const,
        alertEventId: 12,
      };
      const c = {
        candidate: candidateAt('2026-08-04T06:45:00.000Z'),
        outcome: 'created' as const,
        alertEventId: 13,
      };

      await service.publishGroupedDeliveries([a, b, c]);

      // same (securityId, effectiveTime) collapses; different slot separates
      expect(publishGroup).toHaveBeenCalledTimes(2);
      expect(publishGroup).toHaveBeenCalledWith(
        {
          securityId: 9,
          effectiveTime: '2026-08-04T06:40:00.000Z',
          tradingDay: '2026-08-04',
        },
        [11, 12],
      );
      expect(publishGroup).toHaveBeenCalledWith(
        {
          securityId: 9,
          effectiveTime: '2026-08-04T06:45:00.000Z',
          tradingDay: '2026-08-04',
        },
        [13],
      );
    });

    it('is best-effort: a handoff failure is logged, never thrown', async () => {
      const publishGroup = jest.fn().mockRejectedValue(new Error('redis down'));
      const service = new LiveStrategyPersistenceService(
        { transaction: jest.fn() } as never,
        { publishGroup } as never,
      );

      await expect(
        service.publishGroupedDeliveries([
          {
            candidate: candidateAt('2026-08-04T06:40:00.000Z'),
            outcome: 'created',
            alertEventId: 11,
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it('is a no-op without the handoff port or without created events', async () => {
      const service = new LiveStrategyPersistenceService(
        { transaction: jest.fn() } as never,
        null,
      );
      await expect(
        service.publishGroupedDeliveries([
          {
            candidate: candidateAt('2026-08-04T06:40:00.000Z'),
            outcome: 'created',
            alertEventId: 11,
          },
        ]),
      ).resolves.toBeUndefined();

      const publishGroup = jest.fn();
      const withHandoff = new LiveStrategyPersistenceService(
        { transaction: jest.fn() } as never,
        { publishGroup } as never,
      );
      await withHandoff.publishGroupedDeliveries([
        {
          candidate: candidateAt('2026-08-04T06:40:00.000Z'),
          outcome: 'duplicate_skipped',
          alertEventId: null,
        },
      ]);
      expect(publishGroup).not.toHaveBeenCalled();
    });
  });

  describe('persistBatch', () => {
    it('returns empty list without opening a transaction when batch is empty', async () => {
      const dataSource = { transaction: jest.fn() };
      const service = new LiveStrategyPersistenceService(dataSource as never);

      await expect(service.persistBatch([])).resolves.toEqual([]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('persists multiple candidates in one transaction with one SET SESSION and per-candidate savepoint rollback on duplicate', async () => {
      const candA = candidate();
      const candB = { ...candidate(), definitionId: 4 };
      const candC = { ...candidate(), definitionId: 5 };
      const dupErr = duplicateError(
        "Duplicate entry 'x' for key 'strategy_alert_events.uq_strategy_alert_events_dedupe_key'",
      );

      const manager = {
        query: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entity, value) => value),
        save: jest
          .fn()
          // candA: Signal + AlertEvent
          .mockResolvedValueOnce({ id: 71 })
          .mockResolvedValueOnce({ id: 81 })
          // candB: Signal succeeds, AlertEvent hits duplicate constraint
          .mockResolvedValueOnce({ id: 72 })
          .mockRejectedValueOnce(dupErr)
          // candC: Signal + AlertEvent
          .mockResolvedValueOnce({ id: 73 })
          .mockResolvedValueOnce({ id: 83 }),
      };
      const dataSource = {
        transaction: jest.fn((operation) => operation(manager)),
      };
      const service = new LiveStrategyPersistenceService(dataSource as never);

      const results = await service.persistBatch([candA, candB, candC]);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(
        manager.query.mock.calls.filter(
          ([sql]) => sql === 'SET SESSION innodb_lock_wait_timeout = 3',
        ),
      ).toHaveLength(1);
      expect(
        manager.query.mock.calls.some(([sql]) =>
          String(sql).startsWith('ROLLBACK TO SAVEPOINT '),
        ),
      ).toBe(true);
      expect(results).toEqual([
        { outcome: 'created', alertEventId: 81, candidate: candA },
        {
          outcome: 'duplicate_skipped',
          alertEventId: null,
          candidate: candB,
        },
        { outcome: 'created', alertEventId: 83, candidate: candC },
      ]);
    });
  });
});

function candidate() {
  return {
    definitionId: 3,
    versionId: 7,
    securityId: 9,
    source: 'tdx' as const,
    period: 5,
    signalKind: 'entry' as const,
    signalTime: new Date('2026-08-04T06:44:00.000Z'),
    triggerPrice: 28,
    pivotTime: null,
    pivotPrice: null,
    signalType: 'LEGACY_DSL',
    barType: 'incomplete' as const,
    decisionTrace: { flowId: 'test_flow' },
    contextSnapshot: { k: { type: 'incomplete', close: 28 } },
    ruleSnapshot: { field: 'k.close', operator: 'gt', value: 27 },
  };
}

function duplicateError(sqlMessage: string): QueryFailedError {
  const driver = Object.assign(new Error(sqlMessage), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlMessage,
  });
  return new QueryFailedError('INSERT', [], driver);
}
