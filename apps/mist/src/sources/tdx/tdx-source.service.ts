import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { UtilsService, PeriodMappingService } from '@app/utils';
import {
  DataSource,
  Period,
  K,
  KExtensionTdx,
  Security,
} from '@app/shared-data';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { format, parseISO } from 'date-fns';
import { ITdxSourceFetcher } from './tdx-source.interface';
import {
  TdxResponse,
  TdxSnapshot,
  TdxExtension,
  TdxEnvelope,
  TdxBarsResponseData,
  TdxSnapshotsResponseData,
  TdxNormalizedBar,
  TdxDividendFactorsResponseData,
  TdxDividendFactorItem,
} from './types';

const TDX_BAR_FIELDS = [
  'Open',
  'High',
  'Low',
  'Close',
  'Volume',
  'Amount',
  'ForwardFactor',
  'VolInStock',
];

@Injectable()
export class TdxSource implements ITdxSourceFetcher {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(TdxSource.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly utilsService: UtilsService,
    private readonly periodMappingService: PeriodMappingService,
    private readonly typeOrmDataSource: TypeOrmDataSource,
  ) {
    this.baseUrl =
      this.configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    this.axios = this.utilsService.createAxiosInstance({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  async fetchK(params: {
    code: string;
    formatCode: string;
    period: Period;
    startDate: Date;
    endDate: Date;
  }): Promise<TdxResponse[]> {
    const { formatCode, period, startDate, endDate } = params;

    const periodFormat = this.periodMappingService.toSourceFormat(
      period,
      DataSource.TDX,
    );
    if (!periodFormat) {
      throw new HttpException(
        `Period ${period} not supported by TDX`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await this.axios.post<TdxEnvelope<TdxBarsResponseData>>(
        '/v1/bars/query',
        {
          symbols: [formatCode],
          period: periodFormat,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          fields: TDX_BAR_FIELDS,
          dividendType: 'front',
          fillData: true,
        },
      );
      const envelope = response.data;

      if (!envelope?.ok) {
        this.throwEnvelopeError(envelope, 'TDX bars query failed');
      }
      if (!Array.isArray(envelope.data?.bars)) {
        throw new HttpException(
          'Invalid normalized TDX bars response',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return envelope.data.bars.map((bar) => {
        const extensions = this.extractBarExtensions(bar);
        return {
          timestamp: parseISO(bar.barTime),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          amount: bar.amount,
          ...(extensions ? { extensions } : {}),
        };
      });
    } catch (error) {
      this.logger.error(`TDX fetchK error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch TDX data: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async fetchSnapshot(stockCode: string): Promise<TdxSnapshot> {
    try {
      const response = await this.axios.post<
        TdxEnvelope<TdxSnapshotsResponseData>
      >('/v1/snapshots/query', {
        symbols: [stockCode],
      });
      const envelope = response.data;

      if (!envelope?.ok) {
        this.throwEnvelopeError(envelope, 'TDX snapshot query failed');
      }
      if (!Array.isArray(envelope.data?.snapshots)) {
        throw new HttpException(
          'Invalid normalized TDX snapshot response',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const snapshot = envelope.data.snapshots[0];
      if (!snapshot) {
        throw new HttpException(
          'TDX snapshot response did not contain snapshots',
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (typeof snapshot.lastClose !== 'number') {
        throw new HttpException(
          'Invalid normalized TDX snapshot response: lastClose is required',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        stockCode: snapshot.symbol || stockCode,
        now: snapshot.last,
        open: snapshot.open,
        high: snapshot.high,
        low: snapshot.low,
        lastClose: snapshot.lastClose,
        volume: snapshot.volume,
        amount: snapshot.amount,
        timestamp: snapshot.asOf ? parseISO(snapshot.asOf) : new Date(),
      };
    } catch (error) {
      this.logger.error(`TDX fetchSnapshot error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch TDX snapshot: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async fetchDividFactors(
    stockCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    { timestamp: Date; forwardFactor: number; backwardFactor: number }[]
  > {
    try {
      const response = await this.axios.post<
        TdxEnvelope<TdxDividendFactorsResponseData>
      >('/v1/reference/dividend-factors/query', {
        symbol: stockCode,
        startTime: format(startDate, 'yyyyMMdd'),
        endTime: format(endDate, 'yyyyMMdd'),
      });
      const envelope = response.data;

      if (!envelope?.ok || !Array.isArray(envelope.data?.items)) {
        return [];
      }

      return envelope.data.items.flatMap((item) => {
        const mapped = this.mapDividendFactorItem(item);
        return mapped ? [mapped] : [];
      });
    } catch (error) {
      this.logger.error(`TDX fetchDividFactors error: ${error.message}`);
      return [];
    }
  }

  private mapDividendFactorItem(
    item: TdxDividendFactorItem,
  ): { timestamp: Date; forwardFactor: number; backwardFactor: number } | null {
    if (
      item.forwardFactor == null ||
      item.backwardFactor == null ||
      !item.date
    ) {
      return null;
    }

    return {
      timestamp: parseISO(this.normalizeDividendDate(item.date)),
      forwardFactor: item.forwardFactor,
      backwardFactor: item.backwardFactor,
    };
  }

  private normalizeDividendDate(date: string): string {
    if (/^\d{8}$/.test(date)) {
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    }
    return date;
  }

  async saveK(
    data: TdxResponse[],
    security: Security,
    period: Period,
  ): Promise<void> {
    if (data.length === 0) return;

    await this.typeOrmDataSource.transaction(async (manager) => {
      const sourceConfig = security.sourceConfigs?.find(
        (sc) => sc.source === DataSource.TDX,
      );
      const formatCode = sourceConfig?.formatCode || security.code;

      const kEntities = data.map((d) =>
        manager.create(K, {
          security,
          source: DataSource.TDX,
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

      try {
        const savedKs = await manager.save(K, kEntities);

        const extensions = savedKs.map((k, i) =>
          manager.create(
            KExtensionTdx,
            this.buildExtensionPayload(k, data[i].extensions, formatCode),
          ),
        );

        await manager.save(KExtensionTdx, extensions);
      } catch (error: any) {
        if (
          error.code === 'ER_DUP_ENTRY' ||
          error.message?.includes('Duplicate')
        ) {
          this.logger.warn('Duplicate K-line entry, skipping');
          return;
        }
        throw error;
      }
    });
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.TDX);
  }

  private throwEnvelopeError(
    envelope: TdxEnvelope<unknown> | undefined,
    fallbackMessage: string,
  ): never {
    const code = envelope?.error?.code || 'TDX_HTTP_ERROR';
    const message = envelope?.error?.message || fallbackMessage;
    throw new HttpException(`${code}: ${message}`, HttpStatus.BAD_GATEWAY);
  }

  private extractBarExtensions(
    bar: TdxNormalizedBar,
  ): TdxExtension | undefined {
    const extension: TdxExtension = {};
    if (bar.forwardFactor != null) {
      extension.forwardFactor = bar.forwardFactor;
    }
    if (bar.volInStock != null) {
      extension.volInStock = bar.volInStock;
    }
    return Object.keys(extension).length > 0 ? extension : undefined;
  }

  private buildExtensionPayload(
    k: K,
    ext: TdxExtension | undefined,
    fallbackFullCode: string,
  ): Partial<KExtensionTdx> {
    const payload: Partial<KExtensionTdx> = {
      k,
      fullCode: ext?.fullCode ?? fallbackFullCode,
    };

    if (ext?.forwardFactor != null) {
      payload.forwardFactor = ext.forwardFactor;
    }
    if (ext?.volInStock != null) {
      payload.volInStock = ext.volInStock;
    }
    if (ext?.backwardFactor != null) {
      payload.backwardFactor = ext.backwardFactor;
    }
    if (ext?.volumeRatio != null) {
      payload.volumeRatio = ext.volumeRatio;
    }
    if (ext?.turnoverRate != null) {
      payload.turnoverRate = ext.turnoverRate;
    }
    if (ext?.turnoverAmount != null) {
      payload.turnoverAmount = ext.turnoverAmount;
    }
    if (ext?.totalMarketValue != null) {
      payload.totalMarketValue = ext.totalMarketValue;
    }
    if (ext?.floatMarketValue != null) {
      payload.floatMarketValue = ext.floatMarketValue;
    }
    if (ext?.earningsPerShare != null) {
      payload.earningsPerShare = ext.earningsPerShare;
    }
    if (ext?.priceEarningsRatio != null) {
      payload.priceEarningsRatio = ext.priceEarningsRatio;
    }
    if (ext?.priceToBookRatio != null) {
      payload.priceToBookRatio = ext.priceToBookRatio;
    }

    return payload;
  }
}
