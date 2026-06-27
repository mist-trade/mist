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
} from './types';

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

      return envelope.data.bars.map((bar) => ({
        timestamp: parseISO(bar.barTime),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        amount: bar.amount,
        forwardFactor: bar.forwardFactor,
      }));
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
      const response = await this.axios.get<{
        data: {
          date: string[];
          forward_factor: number[];
          backward_factor: number[];
        };
      }>('/api/tdx/divid-factors', {
        params: {
          stock_code: stockCode,
          start_time: format(startDate, 'yyyyMMdd'),
          end_time: format(endDate, 'yyyyMMdd'),
        },
      });

      if (!response.data?.data) {
        return [];
      }

      const { date, forward_factor, backward_factor } = response.data.data;
      return date.map((d, i) => ({
        timestamp: parseISO(d),
        forwardFactor: forward_factor[i],
        backwardFactor: backward_factor[i],
      }));
    } catch (error) {
      this.logger.error(`TDX fetchDividFactors error: ${error.message}`);
      return [];
    }
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

        const extensions = savedKs.map((k, i) => {
          const ext: Partial<TdxExtension> = {
            fullCode: formatCode,
          };
          if (data[i].forwardFactor !== undefined) {
            ext.forwardFactor = data[i].forwardFactor;
          }
          return manager.create(KExtensionTdx, {
            k,
            fullCode: ext.fullCode || '',
            forwardFactor: ext.forwardFactor ?? 0,
            backwardFactor: 0,
            volumeRatio: 0,
            turnoverRate: 0,
            turnoverAmount: 0,
            totalMarketValue: 0,
            floatMarketValue: 0,
            earningsPerShare: 0,
            priceEarningsRatio: 0,
            priceToBookRatio: 0,
          });
        });

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
}
