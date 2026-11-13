import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CollectorSyncEvent,
  CollectorSyncStatus,
  CollectorVerificationStatus,
  DataSource,
  Period,
  RealtimeSubscriptionAssignment,
  Security,
} from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { BaseKInput, saveBaseK } from '../sources/k-save.helper';
import { PushBarsDto } from './dto/reconciliation.dto';
import {
  KlineVerificationValidator,
  BarData,
} from './helpers/kline-verification.validator';
import { SyncCheckpointManager } from './helpers/sync-checkpoint.manager';
import { addDays, subDays } from 'date-fns';

export interface SyncManifestItem {
  securityId: number;
  symbol: string;
  code: string;
  periods: string[];
  startDate: string;
  endDate: string;
}

export interface SyncManifestResponse {
  source: 'tdx' | 'qmt';
  generatedAt: string;
  targetTradingDay: string;
  items: SyncManifestItem[];
}

export interface PushBarsResult {
  success: boolean;
  securityId: number;
  symbol: string;
  period: string;
  barsSaved: number;
  verification: {
    status: 'PASSED' | 'FAILED';
    reasons: string[];
  };
  checkpointAdvanced: boolean;
  verifiedUntil?: string;
}

@Injectable()
export class ReconciliationCollectorService {
  private readonly logger = new Logger(ReconciliationCollectorService.name);

  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(RealtimeSubscriptionAssignment)
    private readonly assignmentRepo: Repository<RealtimeSubscriptionAssignment>,
    @InjectRepository(Security)
    private readonly securityRepo: Repository<Security>,
    @InjectRepository(CollectorSyncEvent)
    private readonly syncEventRepo: Repository<CollectorSyncEvent>,
    private readonly timezoneService: TimezoneService,
    private readonly checkpointManager: SyncCheckpointManager,
    private readonly validator: KlineVerificationValidator,
  ) {}

  /**
   * 生成指定边缘数据源的增量补全清单 (Sync Manifest)
   */
  async generateManifest(sourceParam: string): Promise<SyncManifestResponse> {
    const sourceLower = sourceParam?.toLowerCase();
    if (sourceLower !== 'tdx' && sourceLower !== 'qmt') {
      throw new BadRequestException(
        `Invalid source parameter: '${sourceParam}'. Must be 'tdx' or 'qmt'.`,
      );
    }
    const source = sourceLower as 'tdx' | 'qmt';

    const now = this.timezoneService.getCurrentBeijingTime();
    const isTradingDay = await this.timezoneService.isTradingDay(now);

    let targetDate: Date;
    // 当日收盘后（>= 15:00）且为交易日，以当日为最新闭合日；否则取前一交易日
    if (
      isTradingDay &&
      (now.getHours() > 15 || (now.getHours() === 15 && now.getMinutes() >= 0))
    ) {
      targetDate = now;
    } else {
      const prevTradingDay =
        await this.timezoneService.resolvePreviousTradingDay(now);
      targetDate = prevTradingDay ?? now;
    }

    const targetTradingDay = this.timezoneService.formatTradingDay(targetDate);

    // 1. 获取池子 B 归属于该 source 的所有活跃订阅标的
    const assignments = await this.assignmentRepo.find({
      relations: ['sourceConfig', 'security'],
      where: {
        sourceConfig: {
          source: source === 'tdx' ? DataSource.TDX : DataSource.QMT,
        },
      },
    });

    const securitiesMap = new Map<string, Security>();
    for (const a of assignments) {
      if (a.security && a.security.code) {
        securitiesMap.set(a.security.code, a.security);
      }
    }

    // 2. 专属核心指数追加（严格各司其职）
    const dedicatedIndices =
      source === 'tdx' ? ['880003'] : ['000001', '399006', '000688'];
    for (const idxCode of dedicatedIndices) {
      if (!securitiesMap.has(idxCode)) {
        const idxSec = await this.securityRepo.findOne({
          where: { code: idxCode },
        });
        if (idxSec) {
          securitiesMap.set(idxCode, idxSec);
        }
      }
    }

    // 3. 周期定义（方案 A：收敛为 DAY, 5m, 30m，排除 1m）
    const periods = ['1d', '5m', '30m'];
    if (targetDate.getDay() === 5) {
      periods.push('1w');
    }
    const tomorrow = addDays(targetDate, 1);
    if (tomorrow.getMonth() !== targetDate.getMonth()) {
      periods.push('1M');
    }

    // 4. 根据 checkpoint 过滤缺口
    const items: SyncManifestItem[] = [];
    for (const [code, sec] of securitiesMap.entries()) {
      const checkpoint = this.checkpointManager.getCheckpoint(source, code);
      if (checkpoint && checkpoint.verifiedUntil >= targetTradingDay) {
        // 已推进到最新，无需补充
        continue;
      }

      let startDate: string;
      if (checkpoint && checkpoint.verifiedUntil) {
        startDate = checkpoint.verifiedUntil;
      } else {
        // 无检查点时默认回溯 30 天
        const defaultBacktrackDate = subDays(targetDate, 30);
        startDate = this.timezoneService.formatTradingDay(defaultBacktrackDate);
      }

      items.push({
        securityId: sec.id,
        symbol: code,
        code,
        periods,
        startDate,
        endDate: targetTradingDay,
      });
    }

    return {
      source,
      generatedAt: now.toISOString(),
      targetTradingDay,
      items,
    };
  }

  /**
   * 接收边缘端分批推送的 K 线，执行 4 级校验与入库，并推进水位
   */
  async pushBars(dto: PushBarsDto): Promise<PushBarsResult> {
    const rawSymbol = dto.symbol.trim();
    // 兼容可能传入的带后缀 symbol（如 600000.SH -> 600000）
    const cleanCode = rawSymbol.includes('.')
      ? rawSymbol.split('.')[0]
      : rawSymbol;

    const security = await this.securityRepo.findOne({
      where: [{ code: cleanCode }, { code: rawSymbol }],
    });
    if (!security) {
      throw new NotFoundException(
        `Security not found for symbol '${dto.symbol}'`,
      );
    }

    const periodEnum = this.resolvePeriod(dto.period);
    const sourceEnum =
      dto.source.toLowerCase() === 'tdx' ? DataSource.TDX : DataSource.QMT;

    // 1. 停牌免死判定 (Level 4)
    if (dto.bars.length === 0) {
      if (this.validator.isSuspendedExempt(security, 0)) {
        return {
          success: true,
          securityId: security.id,
          symbol: security.code,
          period: dto.period,
          barsSaved: 0,
          verification: {
            status: 'PASSED',
            reasons: ['Suspension exempt: 0 bars on suspended security'],
          },
          checkpointAdvanced: false,
        };
      }
      throw new BadRequestException(
        'Empty bars payload received for non-suspended security',
      );
    }

    // 2. 单 Bar 几何因果律校验 (Level 1)
    const geomResult = this.validator.verifyGeometry(dto.bars as BarData[]);
    if (!geomResult.passed) {
      await this.recordSyncEvent(
        dto.source,
        security,
        dto.period,
        dto.bars.length,
        0,
        null,
        null,
        CollectorSyncStatus.FAILED,
        CollectorVerificationStatus.FAILED,
        `Level 1 Geometry Failed: ${geomResult.errors.join('; ')}`,
      );
      throw new BadRequestException(
        `Bar geometry validation failed: ${geomResult.errors.join('; ')}`,
      );
    }

    // 3. 条数单调性校验 (Level 2)
    const monoResult = this.validator.verifyMonotonicityAndCount(
      dto.bars as BarData[],
      periodEnum,
    );
    if (!monoResult.passed) {
      await this.recordSyncEvent(
        dto.source,
        security,
        dto.period,
        dto.bars.length,
        0,
        null,
        null,
        CollectorSyncStatus.FAILED,
        CollectorVerificationStatus.FAILED,
        `Level 2 Monotonicity Failed: ${monoResult.errors.join('; ')}`,
      );
      throw new BadRequestException(
        `Monotonicity validation failed: ${monoResult.errors.join('; ')}`,
      );
    }

    // 4. 转换标准入库实体并执行事务入库
    const baseKInputs: BaseKInput[] = dto.bars.map((b) => {
      const rawTs = b.timestamp;
      const ms = rawTs < 1e11 ? rawTs * 1000 : rawTs;
      return {
        timestamp: new Date(ms),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: String(b.volume),
        amount: b.amount != null ? String(b.amount) : null,
      };
    });

    const startTime = baseKInputs[0]?.timestamp.toISOString();
    const endTime =
      baseKInputs[baseKInputs.length - 1]?.timestamp.toISOString();

    let savedCount = 0;
    await this.entityManager.transaction(async (manager) => {
      const savedMap = await saveBaseK(
        manager,
        baseKInputs,
        security,
        sourceEnum,
        periodEnum,
      );
      savedCount = savedMap.size;

      const event = manager.create(CollectorSyncEvent, {
        source: dto.source.toLowerCase(),
        securityId: security.id,
        symbol: security.code,
        period: dto.period,
        barsReceived: dto.bars.length,
        barsSaved: savedCount,
        startTime,
        endTime,
        status: CollectorSyncStatus.SUCCESS,
        verificationStatus: CollectorVerificationStatus.PASSED,
        errorMessage: null,
      });
      await manager.save(CollectorSyncEvent, event);
    });

    // 5. 推进检查点水位 (若为日级别，提取最新日K日期向前推进)
    let checkpointAdvanced = false;
    let verifiedUntil: string | undefined;
    if (periodEnum === Period.DAY && baseKInputs.length > 0) {
      const latestBar = baseKInputs[baseKInputs.length - 1];
      verifiedUntil = this.timezoneService.formatTradingDay(
        latestBar.timestamp,
      );
      this.checkpointManager.updateCheckpoint(
        security.id,
        security.code,
        dto.source.toLowerCase(),
        verifiedUntil,
      );
      checkpointAdvanced = true;
    }

    return {
      success: true,
      securityId: security.id,
      symbol: security.code,
      period: dto.period,
      barsSaved: savedCount,
      verification: {
        status: 'PASSED',
        reasons: [],
      },
      checkpointAdvanced,
      verifiedUntil,
    };
  }

  private resolvePeriod(p: string): Period {
    const normalized = p.toLowerCase().trim();
    if (normalized === '1d' || normalized === 'day' || normalized === 'd') {
      return Period.DAY;
    }
    if (normalized === '5m') {
      return Period.FIVE_MIN;
    }
    if (normalized === '30m') {
      return Period.THIRTY_MIN;
    }
    if (normalized === '1w' || normalized === 'week' || normalized === 'w') {
      return Period.WEEK;
    }
    if (normalized === '1m' || normalized === 'month' || normalized === 'm') {
      return Period.MONTH;
    }
    throw new BadRequestException(`Unsupported period: '${p}'`);
  }

  private async recordSyncEvent(
    source: string,
    security: Security,
    period: string,
    barsReceived: number,
    barsSaved: number,
    startTime: string | null,
    endTime: string | null,
    status: CollectorSyncStatus,
    verificationStatus: CollectorVerificationStatus,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      const event = this.syncEventRepo.create({
        source: source.toLowerCase(),
        securityId: security.id,
        symbol: security.code,
        period,
        barsReceived,
        barsSaved,
        startTime,
        endTime,
        status,
        verificationStatus,
        errorMessage,
      });
      await this.syncEventRepo.save(event);
    } catch (err) {
      this.logger.error(`Failed to record collector sync event: ${err}`);
    }
  }
}
