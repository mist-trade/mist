import {
  DataSource,
  Period,
  StrategySignalKind,
  StrategySignalSource,
} from '@app/shared-data';
import { availabilityKey } from '@app/strategy';
import { StrategySignalService } from './strategy-signal.service';
import {
  StrategySignalSecurityVo,
  StrategySignalVo,
} from '../vo/strategy-signal.vo';

describe('StrategySignalService', () => {
  it('maps entities into explicit StrategySignalVo instances without leaking ORM relation fields', async () => {
    const signalTime = new Date('2026-10-28T06:30:00.000Z');
    const pivotTime = new Date('2026-10-28T05:30:00.000Z');
    const createdAt = new Date('2026-10-28T06:30:05.000Z');
    const rawOrmEntity = {
      id: 42,
      strategyDefinitionId: 3,
      strategyVersionId: 7,
      securityId: 9,
      period: Period.THIRTY_MIN,
      source: DataSource.QMT,
      signalTime,
      pivotTime,
      signalSource: StrategySignalSource.LIVE,
      signalKind: StrategySignalKind.ENTRY,
      signalType: 'second_buy',
      contextSnapshot: {
        triggerPrice: 12.5,
        pivotPrice: 11.8,
        badgeText: '二买',
        displayTag: 'CHAN_SECOND_BUY',
        styleMeta: { color: '#16a34a', position: 'below' },
        triggerPeriod: 30,
      },
      decisionTrace: { trace: [{ nodeId: 'n1', passed: true }] },
      ruleSnapshot: { units: 'bi' },
      createdAt,
      security: {
        id: 9,
        code: '000001',
        name: '平安银行',
        exchange: 'SZ',
        status: 'active',
        secretOrmColumn: 'should-not-leak',
      },
      strategyDefinition: { id: 3, name: 'leaked-definition' },
      strategyVersion: { id: 7, rule: { leaked: true } },
      internalOrmTracker: 'should-not-leak',
    };

    const repository = {
      find: jest.fn().mockResolvedValue([rawOrmEntity]),
    };

    const service = new StrategySignalService(repository as never);
    const result = await service.findAll({});

    expect(result).toHaveLength(1);
    const vo = result[0];
    expect(vo).toBeInstanceOf(StrategySignalVo);
    expect(vo.security).toBeInstanceOf(StrategySignalSecurityVo);
    expect(vo).toEqual({
      id: 42,
      strategyDefinitionId: 3,
      strategyVersionId: 7,
      securityId: 9,
      security: {
        id: 9,
        code: '000001',
        name: '平安银行',
      },
      period: Period.THIRTY_MIN,
      source: DataSource.QMT,
      signalTime,
      effectiveTime: availabilityKey({
        period: Period.THIRTY_MIN,
        timestamp: signalTime,
      }),
      pivotTime,
      signalSource: StrategySignalSource.LIVE,
      signalKind: StrategySignalKind.ENTRY,
      signalType: 'second_buy',
      decisionTrace: { trace: [{ nodeId: 'n1', passed: true }] },
      contextSnapshot: rawOrmEntity.contextSnapshot,
      ruleSnapshot: { units: 'bi' },
      createdAt,
      pivotPrice: 11.8,
      badgeText: '二买',
      displayTag: 'CHAN_SECOND_BUY',
      styleMeta: { color: '#16a34a', position: 'below' },
      triggerPeriod: 30,
    });

    expect(vo).not.toHaveProperty('strategyDefinition');
    expect(vo).not.toHaveProperty('strategyVersion');
    expect(vo).not.toHaveProperty('internalOrmTracker');
    expect(vo.security).not.toHaveProperty('exchange');
    expect(vo.security).not.toHaveProperty('status');
    expect(vo.security).not.toHaveProperty('secretOrmColumn');
  });

  it('defaults optional metadata fields to null and falls back to decisionTrace when absent in contextSnapshot', async () => {
    const signalTime = new Date('2026-10-28T06:30:00.000Z');
    const createdAt = new Date('2026-10-28T06:30:05.000Z');
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 43,
          strategyDefinitionId: 3,
          strategyVersionId: 7,
          securityId: 9,
          period: Period.FIVE_MIN,
          source: DataSource.TDX,
          signalTime,
          pivotTime: null,
          signalSource: StrategySignalSource.LIVE,
          signalKind: StrategySignalKind.EXIT,
          signalType: 'LEGACY_DSL',
          contextSnapshot: { triggerPrice: 10.5 },
          decisionTrace: { badgeText: '轨迹卖点', displayTag: 'TRACE_TAG' },
          ruleSnapshot: {},
          createdAt,
        },
      ]),
    };

    const service = new StrategySignalService(repository as never);
    const [vo] = await service.findAll({ limit: 10 });

    expect(vo.pivotTime).toBeNull();
    expect(vo.pivotPrice).toBeNull();
    expect(vo.badgeText).toBe('轨迹卖点');
    expect(vo.displayTag).toBe('TRACE_TAG');
    expect(vo.styleMeta).toBeNull();
    expect(vo.triggerPeriod).toBeNull();
    expect(vo.security).toBeUndefined();
  });
});
