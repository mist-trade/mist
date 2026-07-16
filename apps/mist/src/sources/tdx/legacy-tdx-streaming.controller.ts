/**
 * LegacyTdxStreamingController — legacy TDX realtime streaming test routes.
 *
 * These test-only subscribe/unsubscribe endpoints were previously on
 * CollectorController. They are moved here so that HistoricalCollectorModule
 * (which has CollectorController) has zero realtime dependencies, and this
 * controller lives in LegacyTdxRealtimeModule (mist + mode=legacy only).
 */
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DataSource, Security } from '@app/shared-data';
import { TdxStreamingTestSubscribeDto } from '../../collector/dto/tdx-streaming-test-subscribe.dto';
import { SecurityService } from '../../security/security.service';
import { WebSocketCollectionStrategy } from '../../collector/strategies/websocket-collection.strategy';

@ApiTags('collector v1')
@Controller('v1/collector')
export class LegacyTdxStreamingController {
  constructor(
    private readonly securityService: SecurityService,
    private readonly tdxStreamingStrategy: WebSocketCollectionStrategy,
  ) {}

  @Post('test/tdx-streaming/subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '测试专用：触发 TDX WebSocket 实时订阅' })
  async subscribeTdxStreaming(
    @Body() dto: TdxStreamingTestSubscribeDto,
  ): Promise<{ code: string; period: number; count: number; testOnly: true }> {
    this.assertTestOnly(dto);
    const security = await this.securityService.findSecurityByCode(dto.code);
    const securityWithSources = await this.attachEnabledTdxSources(security);

    const count = await this.tdxStreamingStrategy.collectForSecurity(
      securityWithSources,
      dto.period,
    );

    return { code: dto.code, period: dto.period, count, testOnly: true };
  }

  @Post('test/tdx-streaming/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '测试专用：取消 TDX WebSocket 实时订阅' })
  async unsubscribeTdxStreaming(
    @Body() dto: TdxStreamingTestSubscribeDto,
  ): Promise<{ code: string; period: number; count: number; testOnly: true }> {
    this.assertTestOnly(dto);
    const security = await this.securityService.findSecurityByCode(dto.code);
    const securityWithSources = await this.attachEnabledTdxSources(security);

    const count =
      await this.tdxStreamingStrategy.unsubscribeForSecurity(
        securityWithSources,
      );

    return { code: dto.code, period: dto.period, count, testOnly: true };
  }

  private async attachEnabledTdxSources(security: Security): Promise<Security> {
    const sourceConfigs = await this.assertEnabledTdxSource(security.code);
    return { ...security, sourceConfigs } as Security;
  }

  private async assertEnabledTdxSource(
    code: string,
  ): Promise<Awaited<ReturnType<SecurityService['getSecuritySources']>>> {
    const sourceConfigs = await this.securityService.getSecuritySources(code);
    const tdxSourceConfigs = sourceConfigs.filter(
      (config) => config.source === DataSource.TDX && config.enabled,
    );

    if (tdxSourceConfigs.length === 0) {
      throw new BadRequestException(
        `No enabled TDX data source configured for security: ${code}`,
      );
    }

    return tdxSourceConfigs;
  }

  private assertTestOnly(dto: TdxStreamingTestSubscribeDto): void {
    if (dto.testOnly !== true) {
      throw new BadRequestException(
        'testOnly must be true for this test-only endpoint',
      );
    }
  }
}
