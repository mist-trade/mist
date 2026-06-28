import { Injectable, Logger } from '@nestjs/common';
import {
  ISourceFetcher,
  KFetchParams,
  KData,
} from '../source-fetcher.interface';
import { EfExtension, EfMinuteVo, EfDailyVo } from './types';
import { AxiosInstance } from 'axios';
import { UtilsService, PeriodMappingService } from '@app/utils';
import {
  DataSource,
  Period,
  K,
  KExtensionEf,
  Security,
} from '@app/shared-data';
import { DataSource as TypeOrmDataSource, In } from 'typeorm';
import { format, parseISO } from 'date-fns';

const EF_EXTENSION_UPSERT_COLUMNS = [
  'fullCode',
  'amplitude',
  'changePct',
  'changeAmt',
  'turnoverRate',
  'volumeCount',
  'innerVolume',
  'outerVolume',
  'prevClose',
  'prevOpen',
];

@Injectable()
export class EastMoneySource implements ISourceFetcher {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(EastMoneySource.name);

  constructor(
    private readonly utilsService: UtilsService,
    private readonly periodMappingService: PeriodMappingService,
    private readonly typeOrmDataSource: TypeOrmDataSource,
  ) {
    this.axios = this.utilsService.createAxiosInstance({
      baseURL: 'http://127.0.0.1:8080',
      timeout: 30000,
    });
  }

  async fetchK(params: KFetchParams): Promise<KData[]> {
    const { code, formatCode, period, startDate, endDate } = params;

    if (period === Period.DAY) {
      return this.fetchDaily(formatCode, startDate, endDate, period);
    }

    return this.fetchPeriod(code, period, startDate, endDate);
  }

  /**
   * 分钟级K线数据 - 使用 index_zh_a_hist_min_em 接口
   */
  private async fetchPeriod(
    code: string,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<KData[]> {
    const periodFormat = this.periodMappingService.toSourceFormat(
      period,
      DataSource.EAST_MONEY,
    );

    const response = await this.axios.get<EfMinuteVo[]>(
      '/api/public/index_zh_a_hist_min_em',
      {
        params: {
          symbol: code,
          period: periodFormat,
          start_date: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
          end_date: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
        },
      },
    );

    if (!response.data || !Array.isArray(response.data)) {
      this.logger.error(
        `Invalid response from East Money period API: ${JSON.stringify(response.data)}`,
      );
      throw new Error(
        `Invalid response from East Money period API: ${JSON.stringify(response.data)}`,
      );
    }

    return response.data.map((item): KData => {
      const timestamp = parseISO(item['时间']);
      const open = Number(item['开盘']);
      const high = Number(item['最高']);
      const low = Number(item['最低']);
      const close = Number(item['收盘']);
      const volume = Number(item['成交量']);
      const amount = item['成交额'] ? Number(item['成交额']) : undefined;

      // Only create extensions when at least one field is present
      const extAmplitude = item['振幅'] ?? undefined;
      const extChangePct = item['涨跌幅'] ?? undefined;
      const extChangeAmt = item['涨跌额'] ?? undefined;
      const extTurnoverRate = item['换手率'] ?? undefined;

      const extensions =
        extAmplitude != null ||
        extChangePct != null ||
        extChangeAmt != null ||
        extTurnoverRate != null
          ? {
              amplitude: extAmplitude,
              changePct: extChangePct,
              changeAmt: extChangeAmt,
              turnoverRate: extTurnoverRate,
            }
          : undefined;

      return {
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        amount,
        period,
        extensions,
      };
    });
  }

  /**
   * 日线K线数据 - 使用 stock_zh_index_daily_em 接口
   */
  private async fetchDaily(
    code: string,
    startDate: Date,
    endDate: Date,
    period: Period,
  ): Promise<KData[]> {
    const response = await this.axios.get<EfDailyVo[]>(
      '/api/public/stock_zh_index_daily_em',
      {
        params: {
          symbol: code,
          start_date: format(startDate, 'yyyyMMdd'),
          end_date: format(endDate, 'yyyyMMdd'),
        },
      },
    );

    if (!response.data || !Array.isArray(response.data)) {
      this.logger.error(
        `Invalid response from East Money daily API: ${JSON.stringify(response.data)}`,
      );
      throw new Error(
        `Invalid response from East Money daily API: ${JSON.stringify(response.data)}`,
      );
    }

    return response.data.map(
      (item): KData => ({
        timestamp: parseISO(item.date + 'T00:00:00Z'),
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume),
        amount: item.amount ? Number(item.amount) : undefined,
        period,
      }),
    );
  }

  async saveK(
    data: KData[],
    security: Security,
    period: Period,
  ): Promise<void> {
    if (data.length === 0) return;

    await this.typeOrmDataSource.transaction(async (manager) => {
      const kEntities = data.map((d) =>
        manager.create(K, {
          security,
          securityId: security.id,
          source: DataSource.EAST_MONEY,
          period,
          timestamp: d.timestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: BigInt(Math.round(d.volume)),
          amount: d.amount || 0,
        }),
      );
      await manager.upsert(K, kEntities, {
        conflictPaths: ['securityId', 'source', 'period', 'timestamp'],
      });

      const savedKs = await manager.find(K, {
        where: {
          security: { id: security.id },
          source: DataSource.EAST_MONEY,
          period,
          timestamp: In(data.map((d) => d.timestamp)),
        },
      });
      const savedKByTimestamp = new Map(
        savedKs.map((k) => [k.timestamp.getTime(), k]),
      );

      // Only save extensions for items that have them (minute-level data)
      const extensions = data
        .map((d) => ({
          k: savedKByTimestamp.get(d.timestamp.getTime()),
          ext: d.extensions as EfExtension | undefined,
        }))
        .filter(
          (item): item is { k: K; ext: EfExtension } =>
            item.k != null && item.ext != null,
        )
        .map(({ k, ext }) =>
          manager.create(KExtensionEf, {
            k,
            kId: k.id,
            fullCode: ext.fullCode ?? '',
            amplitude: ext.amplitude ?? 0,
            changePct: ext.changePct ?? 0,
            changeAmt: ext.changeAmt ?? 0,
            turnoverRate: ext.turnoverRate ?? 0,
          }),
        );

      if (extensions.length > 0) {
        const extensionValues = extensions.map((extension) => ({
          kId: extension.kId,
          fullCode: extension.fullCode,
          amplitude: extension.amplitude,
          changePct: extension.changePct,
          changeAmt: extension.changeAmt,
          turnoverRate: extension.turnoverRate,
          volumeCount: extension.volumeCount,
          innerVolume: extension.innerVolume,
          outerVolume: extension.outerVolume,
          prevClose: extension.prevClose,
          prevOpen: extension.prevOpen,
        }));

        await manager
          .createQueryBuilder()
          .insert()
          .into(KExtensionEf)
          .values(extensionValues)
          .orUpdate(EF_EXTENSION_UPSERT_COLUMNS, ['k_id'])
          .updateEntity(false)
          .execute();
      }
    });
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.EAST_MONEY);
  }
}
