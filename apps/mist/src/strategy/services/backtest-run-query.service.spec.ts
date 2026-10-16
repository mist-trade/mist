import { BacktestRunQueryService } from './backtest-run-query.service';
import { BacktestRunStatus, DataSource, Period } from '@app/shared-data';

describe('BacktestRunQueryService', () => {
  let service: BacktestRunQueryService;
  let runRepo: any;
  let resultRepo: any;
  let tradeRepo: any;

  beforeEach(() => {
    runRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    resultRepo = {
      createQueryBuilder: jest.fn(),
    };
    tradeRepo = {
      findAndCount: jest.fn(),
    };
    service = new BacktestRunQueryService(runRepo, resultRepo, tradeRepo);
  });

  describe('listRuns', () => {
    it('queries runs with default limit and maps them to Vo', async () => {
      const mockRuns = [
        {
          id: 1,
          strategyDefinitionId: 10,
          strategyVersionId: 10,
          targetUniverse: ['000001'],
          period: Period.FIVE_MIN,

          source: DataSource.TDX,
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: new Date('2026-02-01T00:00:00Z'),
          status: BacktestRunStatus.COMPLETED,
          signalCount: 5,
          matchedSecurityCount: 1,
          targetIssues: [],
          startedAt: new Date('2026-02-01T00:00:00Z'),
          completedAt: new Date('2026-02-01T00:01:00Z'),
          errorMessage: null,
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:01:00Z'),
        },
      ];

      const qb: any = {
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockRuns),
      };
      runRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listRuns({
        strategyDefinitionId: 10,
        limit: 20,
      });
      expect(runRepo.createQueryBuilder).toHaveBeenCalledWith('run');
      expect(qb.orderBy).toHaveBeenCalledWith('run.id', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.where).toHaveBeenCalledWith(
        'run.strategyDefinitionId = :strategyDefinitionId',
        { strategyDefinitionId: 10 },
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].strategyDefinitionId).toBe(10);
    });

    it('bounds limit between 1 and 100', async () => {
      const qb: any = {
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      runRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listRuns({ limit: 500 });
      expect(qb.take).toHaveBeenCalledWith(100);

      await service.listRuns({ limit: 0 });
      expect(qb.take).toHaveBeenCalledWith(1);
    });
  });

  describe('listSignals', () => {
    it('returns signals with confidence, confidenceLevel, and decisionTrace', async () => {
      runRepo.findOne.mockResolvedValue({
        id: 1,
        status: BacktestRunStatus.COMPLETED,
      });

      const mockResults = [
        {
          id: 101,
          backtestRunId: 1,
          securityCode: '600000.SH',
          signalTime: new Date('2026-01-05T01:30:00Z'),
          pivotTime: new Date('2026-01-05T01:28:00Z'),
          signalType: 'first_buy',
          confidence: 85,
          confidenceLevel: 'HIGH',
          decisionTrace: { status: 'SIGNAL_EMITTED', signalTag: 'TEST' },
          contextSnapshot: { price: 10.5 },
          ruleSnapshot: { type: 'TERMINAL' },
          createdAt: new Date('2026-01-05T01:30:01Z'),
        },
      ];

      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockResults),
      };
      resultRepo.createQueryBuilder.mockReturnValue(qb);

      const page: any = await service.listSignals(1, { limit: 50 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toEqual({
        id: 101,
        backtestRunId: 1,
        securityCode: '600000.SH',
        signalTime: '2026-01-05T01:30:00.000Z',
        pivotTime: '2026-01-05T01:28:00.000Z',
        signalType: 'first_buy',
        confidence: 85,
        confidenceLevel: 'HIGH',
        decisionTrace: { status: 'SIGNAL_EMITTED', signalTag: 'TEST' },
        contextSnapshot: { price: 10.5 },
        ruleSnapshot: { type: 'TERMINAL' },
        createdAt: '2026-01-05T01:30:01.000Z',
      });
      expect(qb.select).toHaveBeenCalledWith(
        expect.arrayContaining([
          'result.signalType',
          'result.confidence',
          'result.confidenceLevel',
          'result.decisionTrace',
        ]),
      );
    });
  });

  describe('listTrades', () => {
    it('returns paginated trades mapped to BacktestTradeResultVo', async () => {
      runRepo.findOne.mockResolvedValue({
        id: 1,
        status: BacktestRunStatus.COMPLETED,
      });

      const mockTrades = [
        {
          id: 501,
          backtestRunId: 1,
          securityId: 10,
          securityCode: '600000.SH',
          entryTime: new Date('2026-01-05T01:30:00Z'),
          exitTime: new Date('2026-01-08T01:30:00Z'),
          holdingBars: 3,
          entryPrice: '10.5000',
          exitPrice: '11.2000',
          quantity: 1000,
          realizedPnl: '700.0000',
          returnRatio: '0.0667',
          exitReason: 'SIGNAL_EXIT',
          createdAt: new Date('2026-01-08T01:30:01Z'),
        },
      ];

      tradeRepo.findAndCount.mockResolvedValue([mockTrades, 1]);

      const page: any = await service.listTrades(1, { limit: 50, offset: 0 });
      expect(page.total).toBe(1);
      expect(page.limit).toBe(50);
      expect(page.offset).toBe(0);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toEqual({
        id: 501,
        backtestRunId: 1,
        securityId: 10,
        securityCode: '600000.SH',
        entryTime: '2026-01-05T01:30:00.000Z',
        exitTime: '2026-01-08T01:30:00.000Z',
        holdingBars: 3,
        entryPrice: 10.5,
        exitPrice: 11.2,
        quantity: 1000,
        realizedPnl: 700,
        returnRatio: 0.0667,
        exitReason: 'SIGNAL_EXIT',
        createdAt: '2026-01-08T01:30:01.000Z',
      });
    });
  });
});
