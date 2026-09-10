import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository, In } from 'typeorm';
import {
  K,
  DataSource,
  Period,
  Security,
  SecurityStatus,
} from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { DataSourceSelectionService, getSecurityFormatCode } from '@app/utils';
import { CollectorService } from './collector.service';
import { DataFreshnessValidator } from './helpers/data-freshness.validator';
import {
  HistoryDownloadClient,
  DownloadSource,
} from './history-download.client';
import { PostCloseSyncMetrics } from './observability/post-close-sync-metrics';
import {
  DataFreshnessStatus,
  PostCloseSyncReport,
  SecuritySyncTaskResult,
  SyncPostCloseCriteria,
} from './types/post-close-sync.types';

@Injectable()
export class PostCloseSyncService {
  private readonly logger = new Logger(PostCloseSyncService.name);

  private static readonly DEFAULT_PERIODS: Period[] = [
    Period.DAY,
    Period.ONE_MIN,
    Period.FIVE_MIN,
    Period.THIRTY_MIN,
  ];

  /** 下载端点单 job symbol 上限（QMT/TDX 路由校验一致）。 */
  private static readonly MAX_SYMBOLS_PER_JOB = 64;

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(K)
    private readonly kRepository: Repository<K>,
    private readonly collectorService: CollectorService,
    private readonly dataSourceSelectionService: DataSourceSelectionService,
    private readonly timezoneService: TimezoneService,
    private readonly freshnessValidator: DataFreshnessValidator,
    private readonly historyDownloadClient: HistoryDownloadClient,
    private readonly syncMetrics: PostCloseSyncMetrics,
  ) {}

  /**
   * 三段前置（design D1 判定树）：② 交易日判定 → ① 统计缺失 → ③ 提交下载 job
   * → 轮询完成。仅 QMT/TDX 源标的参与；缺口为空或预算超时 → 降级为既有路径
   * （采集照跑，数据可能部分缺失，由重试/晨间兜底自愈）。
   *
   * @returns 本轮下载已完成（poll outcome === 'all_done'）的 securityId 集合——
   *          采集仍 0 条时按"疑似停牌"归类（④，info 不算 notReady）。
   */
  private async ensureHistoryDownloaded(
    securities: Security[],
    periods: Period[],
    startWindow: Date,
    endWindow: Date,
    windowName: string,
  ): Promise<Set<number>> {
    const basePeriods = [
      ...new Set(
        periods
          .map((p): string | null =>
            p === Period.DAY
              ? '1d'
              : p === Period.ONE_MIN
                ? '1m'
                : p === Period.FIVE_MIN || p === Period.THIRTY_MIN
                  ? '5m'
                  : null,
          )
          .filter((p): p is string => p !== null),
      ),
    ];
    if (basePeriods.length === 0) {
      return new Set<number>();
    }

    // ② 真实数据判定：非交易日 → 无真实数据 → 跳过下载（不算缺口）。
    // isTradingDay 失败时内部回退周末判断（fail-open 到交易日，不阻塞流程）。
    if (!(await this.timezoneService.isTradingDay(startWindow))) {
      this.logger.log(
        `[PostCloseSync] event=history_download_skipped_non_trading_day ` +
          `date=${this.formatDateString(startWindow)} windowName=${windowName}`,
      );
      return new Set<number>();
    }

    // 下载窗口日期串用北京日历日（YYYYMMDD，TimezoneService.formatTradingDay）
    // ——toISOString 是 UTC，北京零点会回退到前一日（off-by-one），端点校验与
    // QMT 原生 API 都按日历日理解。
    const startStr = this.timezoneService.formatTradingDay(startWindow);
    const endStr = this.timezoneService.formatTradingDay(endWindow);
    const window = { start: startStr, end: endStr };

    // 下载端点要求 provider 全码（`^\d{6}\.(SH|SZ|BJ)$`），Security.code 是
    // 裸码 → 经 SecuritySourceConfig.formatCode 解析；解析失败跳过该标的
    // （warn 有界 reason），不阻塞其余标的。
    const gapEntriesBySource: Record<
      DownloadSource,
      Array<{ security: Security; providerCode: string }>
    > = { qmt: [], tdx: [] };
    for (const security of securities) {
      const source =
        await this.dataSourceSelectionService.getDataSourceForSecurity(
          security,
        );
      if (source !== DataSource.QMT && source !== DataSource.TDX) {
        continue;
      }
      const downloadSource = source as DownloadSource;
      let providerCode: string;
      try {
        providerCode = getSecurityFormatCode(security, source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[PostCloseSync] event=history_download_symbol_unresolved ` +
            `securityCode=${security.code} source=${downloadSource} ` +
            `error="${message.slice(0, 200)}"`,
        );
        continue;
      }
      const hasAllBasePeriods = (
        await Promise.all(
          basePeriods.map(async (base) => {
            const periodEnum: Period =
              base === '1m'
                ? Period.ONE_MIN
                : base === '5m'
                  ? Period.FIVE_MIN
                  : Period.DAY;
            const count = await this.kRepository.count({
              where: {
                security: { id: security.id },
                period: periodEnum,
                timestamp: Between(startWindow, endWindow),
              },
            });
            return count > 0;
          }),
        )
      ).every(Boolean);
      if (!hasAllBasePeriods) {
        gapEntriesBySource[downloadSource].push({ security, providerCode });
      }
    }

    // 端点单 job 上限 64 个 symbol → 按 64 分片提交（每片一个 job）。
    const submissions: Array<{
      source: DownloadSource;
      jobId: string;
      securityIds: number[];
    }> = [];
    for (const source of ['qmt', 'tdx'] as DownloadSource[]) {
      const entries = gapEntriesBySource[source];
      for (
        let i = 0;
        i < entries.length;
        i += PostCloseSyncService.MAX_SYMBOLS_PER_JOB
      ) {
        const chunk = entries.slice(
          i,
          i + PostCloseSyncService.MAX_SYMBOLS_PER_JOB,
        );
        const symbols = chunk.map((e) => e.providerCode);
        this.logger.log(
          `[PostCloseSync] event=history_download_submit source=${source} ` +
            `symbols=${symbols.join(',')} basePeriods=${basePeriods.join(',')} ` +
            `window=${window.start}..${window.end} windowName=${windowName}`,
        );
        try {
          const submission = await this.historyDownloadClient.submitDownloadJob(
            source,
            symbols,
            basePeriods,
            window,
          );
          submissions.push({
            source,
            jobId: submission.jobId,
            securityIds: chunk.map((e) => e.security.id),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[PostCloseSync] event=history_download_submit_failed source=${source} ` +
              `error="${message.slice(0, 200)}"`,
          );
        }
      }
    }
    if (submissions.length === 0) {
      return new Set<number>();
    }

    const budgetMs = HistoryDownloadClient.JOB_BUDGET_MS;
    const deadline = Date.now() + budgetMs;
    const downloadedSecurityIds = new Set<number>();
    const outcomes = await Promise.all(
      submissions.map(async ({ source, jobId, securityIds }) => {
        const outcome = await this.historyDownloadClient.pollUntilDone(
          source,
          jobId,
          Math.max(deadline - Date.now(), 0),
        );
        return { source, securityIds, outcome };
      }),
    );
    for (const { source, securityIds, outcome } of outcomes) {
      this.logger.log(
        `[PostCloseSync] event=history_download_poll source=${source} outcome=${outcome}`,
      );
      // ④ 前提：下载完成后仍空才可归类疑似停牌；any_failed/timeout 的窗口
      // 下载不完整，0 条仍按 notReady 处理。
      if (outcome === 'all_done') {
        for (const id of securityIds) {
          downloadedSecurityIds.add(id);
        }
      }
    }
    return downloadedSecurityIds;
  }

  /**
   * 执行收盘后权威 K 线数据同步
   */
  async syncPostClose(
    criteria: SyncPostCloseCriteria = {},
  ): Promise<PostCloseSyncReport> {
    const startTime = Date.now();
    const windowName = criteria.window ?? 'manual';

    const targetDate =
      criteria.targetDate ?? this.timezoneService.getCurrentBeijingTime();
    const targetDateStr = this.formatDateString(targetDate);

    const periods = criteria.periods?.length
      ? criteria.periods
      : PostCloseSyncService.DEFAULT_PERIODS;

    const securities = await this.resolveTargetSecurities(
      criteria.securityCodes,
    );

    this.logger.log(
      `[PostCloseSync] event=sync_started targetDate=${targetDateStr} window=${windowName} ` +
        `periods=${periods.join(',')} totalSecurities=${securities.length}`,
    );

    const { startWindow, endWindow } = this.calculateDateWindow(targetDateStr);

    // 三段前置（design D1 判定树）：② 交易日判定 → ① 统计缺失 → ③ 下载 →
    // 轮询完成后采集；④ 下载后仍空按疑似停牌归类。
    // 仅 QMT/TDX 源标的参与；缺口为空或预算超时 → 降级为既有路径（采集照跑）。
    const downloadedSecurityIds = await this.ensureHistoryDownloaded(
      securities,
      periods,
      startWindow,
      endWindow,
      windowName,
    );

    const concurrencyLimit = Math.max(1, criteria.concurrencyLimit ?? 5);
    const taskResults: SecuritySyncTaskResult[] = [];

    // 分批受控并发处理
    for (let i = 0; i < securities.length; i += concurrencyLimit) {
      const batch = securities.slice(i, i + concurrencyLimit);
      const batchPromises = batch.flatMap((security) =>
        periods.map((period) =>
          this.executeSingleSyncTask(
            security,
            period,
            startWindow,
            endWindow,
            targetDateStr,
            criteria.sourceOverride,
            downloadedSecurityIds.has(security.id),
          ),
        ),
      );

      const settled = await Promise.allSettled(batchPromises);
      for (const res of settled) {
        if (res.status === 'fulfilled') {
          taskResults.push(res.value);
        } else {
          taskResults.push({
            securityCode: 'UNKNOWN',
            period: Period.DAY,
            source: DataSource.QMT,
            success: false,
            freshnessStatus: DataFreshnessStatus.NOT_LATEST,
            count: 0,
            error:
              res.reason instanceof Error
                ? res.reason.message
                : String(res.reason),
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const succeededTasks = taskResults.filter((t) => t.success).length;
    const notReadyTasks = taskResults.filter(
      (t) =>
        !t.success &&
        !t.error &&
        t.freshnessStatus === DataFreshnessStatus.NOT_LATEST,
    ).length;
    const failedTasks = taskResults.filter(
      (t) => !t.success && Boolean(t.error),
    ).length;
    const suspendedTasks = taskResults.filter(
      (t) =>
        !t.success &&
        !t.error &&
        t.freshnessStatus === DataFreshnessStatus.SUSPENDED,
    ).length;
    const totalKLinesSaved = taskResults.reduce((acc, t) => acc + t.count, 0);

    // 记录 OTel 耗时与成功运行
    this.syncMetrics.recordDuration(windowName, durationMs);
    if (failedTasks === 0) {
      this.syncMetrics.recordSuccessfulRun(windowName);
    }

    this.logger.log(
      `[PostCloseSync] event=sync_finished targetDate=${targetDateStr} window=${windowName} ` +
        `totalTasks=${taskResults.length} succeeded=${succeededTasks} notReady=${notReadyTasks} ` +
        `failed=${failedTasks} suspended=${suspendedTasks} ` +
        `totalKLines=${totalKLinesSaved} durationMs=${durationMs}`,
    );

    return {
      targetDate: targetDateStr,
      window: windowName,
      totalSecurities: securities.length,
      totalTasks: taskResults.length,
      succeededTasks,
      notReadyTasks,
      failedTasks,
      suspendedTasks,
      totalKLinesSaved,
      durationMs,
      details: taskResults,
    };
  }

  private async executeSingleSyncTask(
    security: Security,
    period: Period,
    startWindow: Date,
    endWindow: Date,
    targetDateStr: string,
    sourceOverride?: DataSource,
    downloadAttempted = false,
  ): Promise<SecuritySyncTaskResult> {
    const source =
      sourceOverride ??
      (await this.dataSourceSelectionService.getDataSourceForSecurity(
        security,
      ));

    try {
      // 1. 调用底层 CollectorService 抓取并落库
      const count = await this.collectorService.collectKForSource(
        security.code,
        period,
        startWindow,
        endWindow,
        source,
      );

      // 2. 数据就绪自检（若返回 0 条记录且非停牌，视为数据源未就绪）
      if (count === 0) {
        // ④（design D1）：下载已完成仍 0 条 → 疑似停牌/当日无真实数据，
        // info 记录、不算 notReady 失败（停牌股每夜报缺口是噪声）。
        if (downloadAttempted) {
          this.syncMetrics.recordTask('suspended', source, period);
          this.logger.log(
            `[PostCloseSync] event=task_suspected_no_data securityCode=${security.code} ` +
              `source=${source} period=${period} reason="0 bars after download completed"`,
          );
          return {
            securityCode: security.code,
            period,
            source,
            success: false,
            freshnessStatus: DataFreshnessStatus.SUSPENDED,
            count: 0,
          };
        }
        const validation = this.freshnessValidator.validateFreshness(
          [],
          targetDateStr,
          period,
        );
        this.syncMetrics.recordTask('not_ready', source, period);
        this.logger.warn(
          `[PostCloseSync] event=task_unready securityCode=${security.code} source=${source} ` +
            `period=${period} freshnessStatus=${validation.status} reason="0 bars returned"`,
        );

        return {
          securityCode: security.code,
          period,
          source,
          success: false,
          freshnessStatus: validation.status,
          count: 0,
        };
      }

      this.syncMetrics.recordTask('succeeded', source, period);
      this.syncMetrics.recordKLinesSaved(source, period, count);

      return {
        securityCode: security.code,
        period,
        source,
        success: true,
        freshnessStatus: DataFreshnessStatus.READY,
        count,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.syncMetrics.recordTask('failed', source, period);

      this.logger.error(
        `[PostCloseSync] event=task_failed securityCode=${security.code} source=${source} ` +
          `period=${period} error="${errorMessage}"`,
      );

      return {
        securityCode: security.code,
        period,
        source,
        success: false,
        freshnessStatus: DataFreshnessStatus.NOT_LATEST,
        count: 0,
        error: errorMessage,
      };
    }
  }

  private async resolveTargetSecurities(
    securityCodes?: string[],
  ): Promise<Security[]> {
    if (securityCodes && securityCodes.length > 0) {
      return this.securityRepository.find({
        where: { code: In(securityCodes) },
      });
    }

    return this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
    });
  }

  private calculateDateWindow(targetDateStr: string): {
    startWindow: Date;
    endWindow: Date;
  } {
    const startWindow = this.timezoneService.parseDateString(
      `${targetDateStr} 00:00:00`,
    );
    const endWindow = this.timezoneService.parseDateString(
      `${targetDateStr} 23:59:59`,
    );
    return { startWindow, endWindow };
  }

  private formatDateString(date: Date): string {
    return this.timezoneService.formatDate(date);
  }
}
