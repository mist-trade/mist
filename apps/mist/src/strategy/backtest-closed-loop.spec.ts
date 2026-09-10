import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
  DataSource,
  Period,
  Security,
  StrategyDefinition,
  StrategyKind,
  StrategyVersion,
} from '@app/shared-data';
import { StrategyBacktestController } from './controllers/strategy-backtest.controller';
import { BacktestRunCommandService } from './services/backtest-run-command.service';
import { BacktestRunQueryService } from './services/backtest-run-query.service';
import { BacktestRunExecutor } from '../../../backtest/src/backtest-run.executor';
import { HealthStateService } from '../../../backtest/src/health/health-state.service';
import { CreateBacktestRunDto } from './dto/create-backtest-run.dto';

describe('Strategy Backtest Closed-Loop Verification', () => {
  let controller: StrategyBacktestController;
  let commandService: BacktestRunCommandService;
  let queryService: BacktestRunQueryService;
  let executor: BacktestRunExecutor;

  // In-memory repositories representing the database
  let runStore: Map<number, BacktestRun>;
  let resultStore: BacktestSignalResult[];
  let definitionStore: Map<number, StrategyDefinition>;
  let versionStore: Map<number, StrategyVersion>;
  let securityStore: Security[];

  let nextRunId = 100;
  let nextResultId = 1000;

  beforeEach(() => {
    runStore = new Map();
    resultStore = [];
    definitionStore = new Map();
    versionStore = new Map();
    securityStore = [];

    // Seed strategy definition: Decision Flow
    const definition: StrategyDefinition = {
      id: 1,
      name: '趋势突破决策流策略',
      description: '基于技术指标与形态因子的决策流策略',
      kind: StrategyKind.DECISION_FLOW,
      periods: [Period.THIRTY_MIN],
      sources: [DataSource.TDX],
      targetUniverse: ['000001.SZ'],
      currentVersionId: 10,
      status: 'enabled' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StrategyDefinition;
    definitionStore.set(1, definition);

    // Seed strategy version with a valid decision_flow rule graph
    const version: StrategyVersion = {
      id: 10,
      strategyDefinitionId: 1,
      version: 1,
      rule: {
        id: 'term_breakout',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'MOMENTUM_BREAKOUT',
        reason: '动量突破确认买入',
        requiredBarCount: 3,
      },
      signalKind: 'entry',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as StrategyVersion;
    versionStore.set(10, version);

    // Seed target securities
    securityStore = [
      {
        id: 1,
        code: '000001.SZ',
        type: 'STOCK',
        status: 1,
      } as Security,
    ];

    // Build mock Repositories
    const runRepo: any = {
      create: jest.fn((dto: Partial<BacktestRun>) => {
        const entity = {
          ...dto,
          id: nextRunId++,
          signalCount: 0,
          matchedSecurityCount: 0,
          targetIssues: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as BacktestRun;
        return entity;
      }),
      save: jest.fn(async (entity: BacktestRun) => {
        runStore.set(entity.id, { ...entity });
        return entity;
      }),
      update: jest.fn(async (criteria: any, update: Partial<BacktestRun>) => {
        const id = typeof criteria === 'number' ? criteria : criteria.id;
        const existing = runStore.get(id);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          runStore.set(id, existing);
        }
        return { affected: 1 };
      }),
      findOne: jest.fn(async (options: any) => {
        const id = options?.where?.id;
        return runStore.get(id) ?? null;
      }),
      createQueryBuilder: jest.fn(() => {
        let definitionFilter: number | undefined;
        let limit = 50;
        const qb: any = {
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn((n: number) => {
            limit = n;
            return qb;
          }),
          where: jest.fn((_clause: string, params: any) => {
            if (params?.strategyDefinitionId) {
              definitionFilter = params.strategyDefinitionId;
            }
            return qb;
          }),
          getMany: jest.fn(async () => {
            let list = Array.from(runStore.values());
            if (definitionFilter !== undefined) {
              list = list.filter(
                (r) => r.strategyDefinitionId === definitionFilter,
              );
            }
            return list.slice(0, limit);
          }),
        };
        return qb;
      }),
    };

    const resultRepo: any = {
      create: jest.fn((input: any) => ({
        ...input,
      })),
      insert: jest.fn(async (items: any[]) => {
        const persisted = items.map((i) => ({
          id: nextResultId++,
          createdAt: new Date(),
          ...i,
        }));
        resultStore.push(...persisted);
        return { identifiers: persisted.map((i) => ({ id: i.id })) };
      }),
      createQueryBuilder: jest.fn(() => {
        let filterRunId: number | undefined;
        let limit = 51;
        const qb: any = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn((_clause: string, params: any) => {
            if (params?.runId !== undefined) {
              filterRunId = params.runId;
            }
            return qb;
          }),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          take: jest.fn((n: number) => {
            limit = n;
            return qb;
          }),
          getMany: jest.fn(async () => {
            let list = resultStore;
            if (filterRunId !== undefined) {
              list = list.filter((r) => r.backtestRunId === filterRunId);
            }
            return list.slice(0, limit);
          }),
        };
        return qb;
      }),
    };

    const versionRepo: any = {
      findOne: jest.fn(async (options: any) => {
        const id = options?.where?.id;
        return versionStore.get(id) ?? null;
      }),
    };

    const definitionRepo: any = {
      findOne: jest.fn(async (options: any) => {
        const id = options?.where?.id;
        return definitionStore.get(id) ?? null;
      }),
    };

    const securityRepo: any = {
      find: jest.fn(async () => securityStore),
    };

    const marketDataAdapter: any = {
      loadReplayWindow: jest.fn(async () => ({ bars: [] })),
      readReplayPage: jest.fn(async () => ({
        bars: [
          {
            securityId: 1,
            source: 'tdx',
            period: 30,
            timestamp: new Date('2026-01-05T01:30:00.000Z'),
            open: 10.0,
            high: 10.8,
            low: 9.9,
            close: 10.5,
            volume: '50000',
            amount: '520000',
            type: 'complete',
          },
        ],
        nextAfterTimestamp: undefined,
      })),
    };

    const dataSource: any = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          update: runRepo.update,
          delete: jest.fn().mockResolvedValue({ affected: 0 }),
        };
        return cb(manager);
      }),
    };

    const configService: any = {
      get: jest.fn((key: string) => {
        if (key === 'BACKTEST_RUN_TIMEOUT_MS') return 30_000;
        if (key === 'BACKTEST_MAX_BARS_PER_RUN') return 10_000;
        if (key === 'BACKTEST_CONCURRENCY') return 2;
        if (key === 'BACKTEST_QUEUE_CAPACITY') return 8;
        return undefined;
      }),
    };

    const healthService = new HealthStateService();

    // Instantiate executor (apps/backtest runtime)
    executor = new BacktestRunExecutor(
      runRepo,
      resultRepo,
      versionRepo,
      securityRepo,
      definitionRepo,
      marketDataAdapter,
      dataSource,
      configService,
      healthService,
    );

    // Mock RPC client: calls executor directly when submitted
    const rpcClient: any = {
      submit: jest.fn(async (runId: number) => {
        // Asynchronously execute to mimic real background execution
        setImmediate(async () => {
          await executor.execute(runId);
        });
        return { ok: true, data: null };
      }),
    };

    const requestContextService: any = {
      getRequestId: jest.fn(() => 'req-closed-loop-test'),
    };

    commandService = new BacktestRunCommandService(
      versionRepo,
      runRepo,
      rpcClient,
      requestContextService,
      definitionRepo,
    );

    queryService = new BacktestRunQueryService(runRepo, resultRepo);

    controller = new StrategyBacktestController(commandService, queryService);
  });

  it('completes full end-to-end backtest lifecycle with all interfaces and result contract', async () => {
    // 1. Trigger Backtest via POST /v1/strategy-backtests
    const createDto: CreateBacktestRunDto = {
      strategyVersionId: 10,
      targetUniverse: ['000001.SZ'],
      period: Period.THIRTY_MIN,
      source: DataSource.TDX,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-10T00:00:00.000Z',
    };

    const responseMock: any = {
      setHeader: jest.fn(),
    };

    const createReceipt: any = await controller.createRun(
      createDto,
      responseMock,
    );

    // Assert receipt response
    expect(createReceipt).toBeDefined();
    expect(createReceipt.runId).toBe(100);
    expect(createReceipt.initialStatus).toBe('PENDING');
    expect(responseMock.setHeader).toHaveBeenCalledWith(
      'Location',
      '/v1/strategy-backtests/100',
    );

    // 2. Wait for executor background execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Query Backtest Run status via GET /v1/strategy-backtests/:runId
    const runVo: any = await controller.findRun({ runId: 100 });

    expect(runVo).toBeDefined();
    expect(runVo.id).toBe(100);
    expect(runVo.strategyDefinitionId).toBe(1);
    expect(runVo.strategyVersionId).toBe(10);
    expect(runVo.status).toBe(BacktestRunStatus.COMPLETED);
    expect(runVo.signalCount).toBe(1);
    expect(runVo.matchedSecurityCount).toBe(1);
    expect(runVo.targetIssues).toEqual([]);
    expect(runVo.startedAt).toBeTruthy();
    expect(runVo.completedAt).toBeTruthy();
    expect(runVo.errorMessage).toBeNull();

    // 4. Query Backtest Signals via GET /v1/strategy-backtests/:runId/signals
    const signalsPage: any = await controller.listSignals(
      { runId: 100 },
      { limit: 50 },
    );

    expect(signalsPage).toBeDefined();
    expect(signalsPage.items).toHaveLength(1);
    expect(signalsPage.nextCursor).toBeNull();

    const signal = signalsPage.items[0];
    expect(signal.id).toBe(1000);
    expect(signal.backtestRunId).toBe(100);
    expect(signal.securityCode).toBe('000001.SZ');
    expect(signal.signalTime).toBe('2026-01-05T01:30:00.000Z');

    // Verify DecisionFlow result contracts: confidence, confidenceLevel, decisionTrace
    expect(signal.confidence).toBe(85);
    expect(signal.confidenceLevel).toBe('HIGH');
    expect(signal.decisionTrace).toBeDefined();
    expect(signal.decisionTrace.status).toBe('SIGNAL_EMITTED');
    expect(signal.decisionTrace.signalTag).toBe('MOMENTUM_BREAKOUT');
    expect(signal.decisionTrace.reason).toBe('动量突破确认买入');
    expect(signal.decisionTrace.trace).toBeDefined();

    // Verify snapshots
    expect(signal.contextSnapshot).toBeDefined();
    expect(signal.contextSnapshot.action).toBe('BUY');
    expect(signal.contextSnapshot.confidence).toBe(85);
    expect(signal.ruleSnapshot).toBeDefined();

    // 5. Query Backtest Runs list via GET /v1/strategy-backtests
    const listRuns: any = await controller.listRuns({
      strategyDefinitionId: 1,
      limit: 20,
    });

    expect(listRuns).toBeDefined();
    expect(listRuns).toHaveLength(1);
    expect(listRuns[0].id).toBe(100);
    expect(listRuns[0].status).toBe(BacktestRunStatus.COMPLETED);
    expect(listRuns[0].signalCount).toBe(1);
  });
});
