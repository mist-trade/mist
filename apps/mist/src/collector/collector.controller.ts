import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CollectDto } from './dto/collect.dto';
import { PushBarsDto } from './dto/reconciliation.dto';
import { CollectionStrategyRegistry } from './strategies/collection-strategy.registry';
import { SecurityService } from '../security/security.service';
import { TimezoneService } from '@app/timezone';
import {
  ReconciliationCollectorService,
  SyncManifestResponse,
  PushBarsResult,
} from './reconciliation-collector.service';

@ApiTags('collector v1')
@Controller('v1/collector')
export class CollectorController {
  constructor(
    private readonly securityService: SecurityService,
    private readonly registry: CollectionStrategyRegistry,
    private readonly timezoneService: TimezoneService,
    private readonly reconciliationService: ReconciliationCollectorService,
  ) {}

  @Get('sync-manifest')
  @ApiOperation({ summary: '获取边缘数据源 K 线增量自愈补全清单' })
  @ApiQuery({ name: 'source', enum: ['tdx', 'qmt'], required: true })
  async getSyncManifest(
    @Query('source') source: string,
  ): Promise<SyncManifestResponse> {
    return this.reconciliationService.generateManifest(source);
  }

  @Post('push-bars')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '接收边缘端推送的 K 线进行4级全景校验、入库与推进水位',
  })
  async pushBars(@Body() dto: PushBarsDto): Promise<PushBarsResult> {
    return this.reconciliationService.pushBars(dto);
  }

  @Post('collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发K线数据采集' })
  async collect(
    @Body() dto: CollectDto,
  ): Promise<{ code: string; period: number; count: number }> {
    // 1. Resolve security (throws NotFoundException if not found)
    const security = await this.securityService.findSecurityByCode(dto.code);

    // 2. Validate source against security's configured sources
    const sourceConfigs = await this.securityService.getSecuritySources(
      dto.code,
    );
    const enabledSources = sourceConfigs.filter((c) => c.enabled);

    if (enabledSources.length === 0) {
      throw new BadRequestException(
        `No enabled data source configured for security: ${dto.code}`,
      );
    }

    if (dto.source) {
      const matched = enabledSources.find((c) => c.source === dto.source);
      if (!matched) {
        const configuredSources = enabledSources
          .map((c) => c.source)
          .join(', ');
        throw new BadRequestException(
          `Source mismatch: requested '${dto.source}', but security ${dto.code} only has configured sources: ${configuredSources}`,
        );
      }
    }

    // 3. Resolve strategy and collect with user-provided dates
    const strategy = this.registry.resolve(dto.source);
    const startDate = this.timezoneService.parseDateString(dto.startDate);
    const endDate = this.timezoneService.parseDateString(dto.endDate);

    const count = await strategy.collectForSecurity(
      security,
      dto.period,
      startDate,
      endDate,
    );

    return { code: dto.code, period: dto.period, count };
  }
}
