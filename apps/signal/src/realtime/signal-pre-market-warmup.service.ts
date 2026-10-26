import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ASIA_SHANGHAI_TIMEZONE,
  CRON_PRE_MARKET_STRATEGY_WARMUP_0920,
  formatShanghaiDateString,
} from '@app/timezone';
import type { PreMarketWarmupTarget } from '@app/strategy';
import { SignalRegistryService } from '../signal-registry.service';
import type { SignalRegistrySnapshot } from '../signal-registry.types';
import { HealthStateService } from '../health/health-state.service';
import { TimezoneService } from '@app/timezone';
import { CandleFinalizedJobProcessor } from './candle-finalized-job.processor';

/**
 * 盘前策略内核池预热编排（09:20 屏障）：
 * 交易日 09:20 对全部活跃 `(securityId, source)` 组做全周期 canonical 预热，
 * 预构建组内核（publicFrom = anchor），首根封存 Bar 零历史 I/O。
 * 非交易日跳过；异常吞掉不外抛（退化兜底 = 开盘首根懒加载）。
 */
@Injectable()
export class SignalPreMarketWarmupService {
  private readonly logger = new Logger(SignalPreMarketWarmupService.name);

  constructor(
    private readonly registry: SignalRegistryService,
    private readonly processor: CandleFinalizedJobProcessor,
    private readonly timezoneService: TimezoneService,
    private readonly healthState: HealthStateService,
  ) {}

  @Cron(CRON_PRE_MARKET_STRATEGY_WARMUP_0920, {
    timeZone: ASIA_SHANGHAI_TIMEZONE,
  })
  async handlePreMarketWarmup(): Promise<void> {
    const now = new Date();
    try {
      if (!(await this.timezoneService.isTradingDay(now))) {
        this.logger.log('pre-market warmup skipped: non-trading day');
        return;
      }
      const targets = this.collectWarmupTargets(this.registry.capture());
      if (targets.length === 0) {
        this.logger.log('pre-market warmup skipped: no active targets');
        return;
      }
      const report = await this.processor.warmupRealtimeWindows(targets, now);
      if (report) {
        this.healthState.recordPreMarketWarmup(
          report,
          now.toISOString(),
          formatShanghaiDateString(now),
        );
        this.logger.log(
          `pre-market warmup: total=${report.total} succeeded=${report.succeeded} skipped=${report.skipped} failed=${report.failed}`,
        );
      }
    } catch (error) {
      // 预热失败绝不阻塞服务或触发主路径
      this.logger.warn(
        `pre-market warmup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** 从注册表快照推导全量活跃 (securityId, source) 预热目标（去重，plans 聚合）。 */
  private collectWarmupTargets(
    snapshot: SignalRegistrySnapshot,
  ): readonly PreMarketWarmupTarget[] {
    const pairs = new Set<string>();
    const pending: { securityId: number; source: 'tdx' | 'qmt' }[] = [];
    for (const definition of snapshot.definitions.values()) {
      for (const source of definition.sources) {
        if (source !== 'tdx' && source !== 'qmt') continue;
        for (const securityId of definition.securityIds) {
          const key = `${securityId}\u0000${source}`;
          if (pairs.has(key)) continue;
          pairs.add(key);
          pending.push({ securityId, source });
        }
      }
    }
    return pending
      .map((pair) => ({
        securityId: pair.securityId,
        source: pair.source,
        plans: this.registry.executionPlansFor(pair.securityId, pair.source),
      }))
      .filter((target) => target.plans.length > 0);
  }
}
