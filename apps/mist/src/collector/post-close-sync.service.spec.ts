import { format } from 'date-fns';
import { DataSource, Period, Security, SecurityStatus } from '@app/shared-data';
import { PostCloseSyncService } from './post-close-sync.service';
import { DataFreshnessStatus } from './types/post-close-sync.types';

describe('PostCloseSyncService', () => {
  const createHarness = () => {
    const activeSecurities: Security[] = [
      {
        id: 1,
        code: '600519',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [
          { source: DataSource.QMT, enabled: true, formatCode: '600519.SH' },
        ],
      } as Security,
      {
        id: 2,
        code: '300059',
        status: SecurityStatus.ACTIVE,
        sourceConfigs: [
          { source: DataSource.TDX, enabled: true, formatCode: '300059.SZ' },
        ],
      } as Security,
    ];

    const securityRepository = {
      find: jest.fn().mockResolvedValue(activeSecurities),
    };

    const collectorService = {
      collectKForSource: jest.fn().mockResolvedValue(240),
    };

    const dataSourceSelectionService = {
      getDataSourceForSecurity: jest
        .fn()
        .mockImplementation((sec: Security) =>
          sec.code === '600519' ? DataSource.QMT : DataSource.TDX,
        ),
    };

    const timezoneService = {
      getCurrentBeijingTime: jest
        .fn()
        .mockReturnValue(new Date('2026-08-24T14:30:00Z')),
      parseDateString: jest.fn(
        (str: string) => new Date(str.replace(' ', 'T') + '+08:00'),
      ),
      formatDate: jest.fn((date: Date) => format(date, 'yyyy-MM-dd')),
      isTradingDay: jest.fn().mockResolvedValue(true),
    };

    const freshnessValidator = {
      validateFreshness: jest.fn().mockImplementation((bars: any[]) => ({
        status:
          bars && bars.length > 0
            ? DataFreshnessStatus.READY
            : DataFreshnessStatus.NOT_LATEST,
        barCount: bars?.length ?? 0,
        expectedBarCount: 240,
      })),
    };

    const syncMetrics = {
      recordTask: jest.fn(),
      recordKLinesSaved: jest.fn(),
      recordDuration: jest.fn(),
      recordSuccessfulRun: jest.fn(),
    };

    const kRepository = {
      count: jest.fn().mockResolvedValue(240),
    };

    const historyDownloadClient = {
      submitDownloadJob: jest
        .fn()
        .mockResolvedValue({ jobId: 'dl-test', tasks: [] }),
      pollUntilDone: jest.fn().mockResolvedValue('all_done'),
    };

    const service = new PostCloseSyncService(
      securityRepository as any,
      kRepository as any,
      collectorService as any,
      dataSourceSelectionService as any,
      timezoneService as any,
      freshnessValidator as any,
      historyDownloadClient as any,
      syncMetrics as any,
    );

    return {
      service,
      securityRepository,
      kRepository,
      collectorService,
      dataSourceSelectionService,
      timezoneService,
      freshnessValidator,
      historyDownloadClient,
      syncMetrics,
      activeSecurities,
    };
  };

  it('syncs default all core periods for active securities and logs metrics', async () => {
    const {
      service,
      collectorService,
      dataSourceSelectionService,
      syncMetrics,
    } = createHarness();

    const report = await service.syncPostClose({ window: 'nightly_2230' });

    expect(report.targetDate).toBe('2026-08-24');
    expect(report.window).toBe('nightly_2230');
    expect(report.totalSecurities).toBe(2);
    // 2 securities x 4 default periods (DAY, 1m, 5m, 30m) = 8 tasks
    expect(report.totalTasks).toBe(8);
    expect(report.succeededTasks).toBe(8);
    expect(report.failedTasks).toBe(0);
    expect(report.notReadyTasks).toBe(0);
    expect(report.totalKLinesSaved).toBe(240 * 8);

    expect(
      dataSourceSelectionService.getDataSourceForSecurity,
    ).toHaveBeenCalledWith(expect.objectContaining({ code: '600519' }));
    expect(collectorService.collectKForSource).toHaveBeenCalledWith(
      '600519',
      Period.DAY,
      expect.any(Date),
      expect.any(Date),
      DataSource.QMT,
    );
    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'succeeded',
      DataSource.QMT,
      Period.DAY,
    );
    expect(syncMetrics.recordSuccessfulRun).toHaveBeenCalledWith(
      'nightly_2230',
    );
  });

  it('records not_ready when collector returns 0 bars for an active security', async () => {
    const { service, collectorService, syncMetrics } = createHarness();
    collectorService.collectKForSource.mockImplementation(
      (code: string, period: Period) => {
        if (code === '300059' && period === Period.DAY) {
          return Promise.resolve(0); // not ready yet
        }
        return Promise.resolve(100);
      },
    );

    const report = await service.syncPostClose();

    expect(report.totalTasks).toBe(8);
    expect(report.succeededTasks).toBe(7);
    expect(report.notReadyTasks).toBe(1);
    expect(report.failedTasks).toBe(0);

    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'not_ready',
      DataSource.TDX,
      Period.DAY,
    );
  });

  it('isolates task errors without aborting other securities', async () => {
    const { service, collectorService, syncMetrics } = createHarness();
    collectorService.collectKForSource.mockImplementation(
      (code: string, period: Period) => {
        if (code === '600519' && period === Period.ONE_MIN) {
          throw new Error('QMT network socket closed');
        }
        return Promise.resolve(100);
      },
    );

    const report = await service.syncPostClose();

    expect(report.totalTasks).toBe(8);
    expect(report.succeededTasks).toBe(7);
    expect(report.failedTasks).toBe(1);

    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'failed',
      DataSource.QMT,
      Period.ONE_MIN,
    );
  });

  it('correctly resolves targetDate for late evening Beijing time (22:30) without jumping to next day', async () => {
    const { service, timezoneService } = createHarness();
    // Simulate Beijing time 2026-08-24 22:30:00
    timezoneService.getCurrentBeijingTime.mockReturnValue(
      new Date('2026-08-24T22:30:00+08:00'),
    );

    const report = await service.syncPostClose({ window: 'nightly_2230' });
    expect(report.targetDate).toBe('2026-08-24');
  });

  it('skips history download submission on non-trading days (D1 ②)', async () => {
    const { service, kRepository, timezoneService, historyDownloadClient } =
      createHarness();
    timezoneService.isTradingDay.mockResolvedValue(false);
    // 周末 k 表必然为空 → 若不判定交易日会全量判缺
    kRepository.count.mockResolvedValue(0);

    const report = await service.syncPostClose();

    expect(historyDownloadClient.submitDownloadJob).not.toHaveBeenCalled();
    expect(historyDownloadClient.pollUntilDone).not.toHaveBeenCalled();
    // 采集照跑（既有路径），但下载侧零动作
    expect(report.totalTasks).toBe(8);
  });

  it('classifies 0 bars after completed download as suspected suspended, not notReady (D1 ④)', async () => {
    const {
      service,
      kRepository,
      collectorService,
      syncMetrics,
      historyDownloadClient,
    } = createHarness();
    // 300059（id=2，TDX 源）k 表缺数据 → 提交下载 → all_done → 采集仍 0 条
    kRepository.count.mockImplementation(async (args: any) =>
      args?.where?.security?.id === 1 ? 240 : 0,
    );
    collectorService.collectKForSource.mockImplementation((code: string) =>
      code === '300059' ? Promise.resolve(0) : Promise.resolve(100),
    );

    const report = await service.syncPostClose();

    // 300059 的 4 个 period 全部走 SUSPENDED
    expect(report.suspendedTasks).toBe(4);
    expect(report.notReadyTasks).toBe(0);
    expect(report.failedTasks).toBe(0);
    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'suspended',
      DataSource.TDX,
      Period.DAY,
    );
    // 提交的是 provider 全码（端点校验 ^\d{6}\.(SH|SZ|BJ)$），窗口为北京日历日
    expect(historyDownloadClient.submitDownloadJob).toHaveBeenCalledWith(
      'tdx',
      ['300059.SZ'],
      ['1d', '1m', '5m'],
      { start: '20260824', end: '20260824' },
    );
  });

  it('skips securities whose provider symbol cannot be resolved (warn, no submit for them)', async () => {
    const {
      service,
      kRepository,
      historyDownloadClient,
      securityRepository,
      activeSecurities,
    } = createHarness();
    kRepository.count.mockResolvedValue(0);
    // 300059 清空 sourceConfigs → provider symbol 解析失败 → 跳过该标的，
    // 600519 正常解析提交
    const broken = {
      id: 2,
      code: '300059',
      status: SecurityStatus.ACTIVE,
      sourceConfigs: [],
    } as unknown as Security;
    securityRepository.find.mockResolvedValue([activeSecurities[0], broken]);

    await service.syncPostClose();

    expect(historyDownloadClient.submitDownloadJob).toHaveBeenCalledTimes(1);
    expect(historyDownloadClient.submitDownloadJob).toHaveBeenCalledWith(
      'qmt',
      ['600519.SH'],
      expect.anything(),
      expect.anything(),
    );
  });

  it('keeps notReady classification when download job times out (D1 ④ guard)', async () => {
    const {
      service,
      kRepository,
      collectorService,
      syncMetrics,
      historyDownloadClient,
    } = createHarness();
    kRepository.count.mockImplementation(async (args: any) =>
      args?.where?.security?.id === 1 ? 240 : 0,
    );
    historyDownloadClient.pollUntilDone.mockResolvedValue('timeout');
    collectorService.collectKForSource.mockImplementation((code: string) =>
      code === '300059' ? Promise.resolve(0) : Promise.resolve(100),
    );

    const report = await service.syncPostClose();

    // 下载未完成 → 0 条仍按 notReady，不进停牌归类
    expect(report.suspendedTasks).toBe(0);
    expect(report.notReadyTasks).toBe(4);
    expect(syncMetrics.recordTask).toHaveBeenCalledWith(
      'not_ready',
      DataSource.TDX,
      Period.DAY,
    );
  });
});
