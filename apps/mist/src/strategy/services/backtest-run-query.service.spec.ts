import { BacktestRunQueryService } from './backtest-run-query.service';
import { BacktestRunStatus, DataSource, Period } from '@app/shared-data';

describe('BacktestRunQueryService', () => {
  let service: BacktestRunQueryService;
  let runRepo: any;
  let resultRepo: any;

  beforeEach(() => {
    runRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    resultRepo = {
      createQueryBuilder: jest.fn(),
    };
    service = new BacktestRunQueryService(runRepo, resultRepo);
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
        confidence: 85,
        confidenceLevel: 'HIGH',
        decisionTrace: { status: 'SIGNAL_EMITTED', signalTag: 'TEST' },
        contextSnapshot: { price: 10.5 },
        ruleSnapshot: { type: 'TERMINAL' },
        createdAt: '2026-01-05T01:30:01.000Z',
      });
      expect(qb.select).toHaveBeenCalledWith(
        expect.arrayContaining([
          'result.confidence',
          'result.confidenceLevel',
          'result.decisionTrace',
        ]),
      );
    });
  });
});
