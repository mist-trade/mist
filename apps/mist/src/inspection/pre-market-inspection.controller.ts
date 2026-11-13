import { Controller, Logger, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { toErrorMessage } from '@app/utils';

import {
  ASIA_SHANGHAI_TIMEZONE,
  CRON_PRE_MARKET_INSPECTION_0905,
  TimezoneService,
} from '@app/timezone';
import {
  PreMarketInspectionReport,
  PreMarketInspectionService,
} from './pre-market-inspection.service';

/**
 * Pre-Market Automated Health Inspection Controller.
 *
 * Runs comprehensive 6-dimension health & readiness probe at 09:05 on A-share trading days,
 * and pushes inspection report cards directly to Feishu.
 */
@Controller(['schedule', 'v1/inspection'])
export class PreMarketInspectionController {
  private readonly logger = new Logger(PreMarketInspectionController.name);

  constructor(
    private readonly timezoneService: TimezoneService,
    private readonly preMarketInspectionService: PreMarketInspectionService,
  ) {}

  /**
   * 盘前主动巡检 HTTP 触发入口（支持运维随时主动巡检并推送到飞书）
   */
  @Post('pre-market-inspection')
  async triggerPreMarketInspection(): Promise<PreMarketInspectionReport> {
    const now = this.timezoneService.getCurrentBeijingTime();
    return this.preMarketInspectionService.runInspection(now);
  }

  /**
   * 盘前主动巡检任务：周一至周五 09:05 触发（北京时间）
   */
  @Cron(CRON_PRE_MARKET_INSPECTION_0905, {
    name: 'schedule-pre-market-inspection-0905',
    timeZone: ASIA_SHANGHAI_TIMEZONE,
  })
  async handlePreMarketInspection(): Promise<void> {
    const now = this.timezoneService.getCurrentBeijingTime();
    if (!(await this.timezoneService.isTradingDay(now))) {
      this.logger.debug(
        'Skipping pre-market inspection: not an A-share trading day',
      );
      return;
    }

    try {
      const report = await this.preMarketInspectionService.runInspection(now);
      this.logger.log(
        `[Schedule] event=pre_market_inspection_completed targetDate=${report.targetDate} ` +
          `status=${report.overallStatus} sentToFeishu=${report.sentToFeishu}`,
      );
    } catch (error) {
      const message = toErrorMessage(error);
      this.logger.error(
        `[Schedule] event=pre_market_inspection_failed error="${message}"`,
      );
    }
  }
}
