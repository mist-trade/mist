import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TdxSource } from './tdx-source.service';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { DataSource } from 'typeorm';
import {
  Period,
  Security,
  DataSource as AppDataSource,
} from '@app/shared-data';
import { UtilsService, PeriodMappingService } from '@app/utils';

describe('TdxSource', () => {
  let service: TdxSource;
  let mockAxiosGet: jest.Mock;
  let mockAxiosPost: jest.Mock;
  let mockTypeOrmDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    mockAxiosGet = jest.fn();
    mockAxiosPost = jest.fn();

    const mockAxiosInstance = {
      get: mockAxiosGet,
      post: mockAxiosPost,
    } as unknown as jest.Mocked<AxiosInstance>;

    mockTypeOrmDataSource = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TdxSource,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9001';
              return undefined;
            }),
          },
        },
        {
          provide: UtilsService,
          useFactory: () => ({
            createAxiosInstance: jest.fn(() => mockAxiosInstance),
          }),
        },
        {
          provide: PeriodMappingService,
          useValue: {
            toSourceFormat: jest.fn((period: Period, source: AppDataSource) => {
              if (source === AppDataSource.TDX) {
                switch (period) {
                  case Period.ONE_MIN:
                    return '1m';
                  case Period.FIVE_MIN:
                    return '5m';
                  case Period.FIFTEEN_MIN:
                    return '15m';
                  case Period.THIRTY_MIN:
                    return '30m';
                  case Period.SIXTY_MIN:
                    return '60m';
                  case Period.DAY:
                    return '1d';
                  case Period.WEEK:
                    return '1w';
                  case Period.MONTH:
                    return '1M';
                  default:
                    return null;
                }
              }
              return null;
            }),
            isSupported: jest.fn((period: Period, source: AppDataSource) => {
              if (source === AppDataSource.TDX) {
                return [
                  Period.ONE_MIN,
                  Period.FIVE_MIN,
                  Period.FIFTEEN_MIN,
                  Period.THIRTY_MIN,
                  Period.SIXTY_MIN,
                  Period.DAY,
                  Period.WEEK,
                  Period.MONTH,
                ].includes(period);
              }
              return false;
            }),
          },
        },
        {
          provide: DataSource,
          useValue: mockTypeOrmDataSource,
        },
      ],
    }).compile();

    service = module.get<TdxSource>(TdxSource);

    // Mock axios.create to return our mock
    (service as any).axios = {
      get: mockAxiosGet,
      post: mockAxiosPost,
    };
  });

  describe('isSupportedPeriod', () => {
    it('should return true for directly supported periods', () => {
      expect(service.isSupportedPeriod(Period.ONE_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIVE_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.FIFTEEN_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.THIRTY_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.SIXTY_MIN)).toBe(true);
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true);
      expect(service.isSupportedPeriod(Period.WEEK)).toBe(true);
      expect(service.isSupportedPeriod(Period.MONTH)).toBe(true);
    });

    it('should return false for unsupported periods', () => {
      expect(service.isSupportedPeriod(Period.QUARTER)).toBe(false);
      expect(service.isSupportedPeriod(Period.YEAR)).toBe(false);
    });
  });

  describe('saveK', () => {
    it('should be a no-op for empty data', async () => {
      await expect(
        service.saveK([], {} as Security, Period.ONE_MIN),
      ).resolves.toBeUndefined();
    });
  });

  describe('normalized /v1 HTTP contract', () => {
    const expectBadGatewayWithMessage = async (
      promise: Promise<unknown>,
      message: string,
    ) => {
      await expect(promise).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        message: expect.stringContaining(message),
      });
    };

    it('fetchK posts to /v1/bars/query and maps normalized bars', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: [
              {
                symbol: '600519.SH',
                period: '1m',
                barTime: '2026-06-26T09:31:00+08:00',
                open: 10.1,
                high: 10.3,
                low: 10.0,
                close: 10.2,
                volume: 1200,
                amount: 12345.6,
                provider: 'tdx',
                receivedAt: '2026-06-26T09:31:02+08:00',
              },
            ],
          },
          meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
          error: null,
        },
      });

      const result = await service.fetchK({
        code: '600519',
        formatCode: '600519.SH',
        period: Period.ONE_MIN,
        startDate: new Date('2026-06-26T00:00:00+08:00'),
        endDate: new Date('2026-06-26T23:59:59+08:00'),
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        '/v1/bars/query',
        expect.objectContaining({
          symbols: ['600519.SH'],
          // Python /v1 currently accepts the same TDX period tokens as PeriodMappingService.
          period: '1m',
          startTime: '2026-06-25T16:00:00.000Z',
          endTime: '2026-06-26T15:59:59.000Z',
        }),
      );
      expect(mockAxiosGet).not.toHaveBeenCalled();
      expect(result[0]).toEqual({
        timestamp: new Date('2026-06-26T09:31:00+08:00'),
        open: 10.1,
        high: 10.3,
        low: 10.0,
        close: 10.2,
        volume: 1200,
        amount: 12345.6,
      });
    });

    it('throws bad gateway when normalized bars payload is not an array', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            bars: {},
          },
          meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
          error: null,
        },
      });

      await expectBadGatewayWithMessage(
        service.fetchK({
          code: '600519',
          formatCode: '600519.SH',
          period: Period.ONE_MIN,
          startDate: new Date('2026-06-26T00:00:00+08:00'),
          endDate: new Date('2026-06-26T23:59:59+08:00'),
        }),
        'Invalid normalized TDX bars response',
      );
    });

    it('fetchSnapshot posts to /v1/snapshots/query and maps normalized snapshot', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            snapshots: [
              {
                symbol: '600519.SH',
                last: 10.2,
                open: 10.1,
                high: 10.3,
                low: 10.0,
                lastClose: 9.9,
                volume: 1200,
                amount: 12345.6,
                provider: 'tdx',
                asOf: '2026-06-26T09:31:02+08:00',
              },
            ],
          },
          meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
          error: null,
        },
      });

      const result = await service.fetchSnapshot('600519.SH');

      expect(mockAxiosPost).toHaveBeenCalledWith('/v1/snapshots/query', {
        symbols: ['600519.SH'],
      });
      expect(mockAxiosGet).not.toHaveBeenCalled();
      expect(result).toEqual({
        stockCode: '600519.SH',
        now: 10.2,
        open: 10.1,
        high: 10.3,
        low: 10.0,
        lastClose: 9.9,
        volume: 1200,
        amount: 12345.6,
        timestamp: new Date('2026-06-26T09:31:02+08:00'),
      });
    });

    it('throws bad gateway when normalized snapshot is missing lastClose', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            snapshots: [
              {
                symbol: '600519.SH',
                last: 10.2,
                open: 10.1,
                high: 10.3,
                low: 10.0,
                volume: 1200,
                amount: 12345.6,
                provider: 'tdx',
                asOf: '2026-06-26T09:31:02+08:00',
              },
            ],
          },
          meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
          error: null,
        },
      });

      await expectBadGatewayWithMessage(
        service.fetchSnapshot('600519.SH'),
        'lastClose',
      );
    });

    it('throws bad gateway when normalized snapshots payload is not an array', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: true,
          provider: 'tdx',
          data: {
            snapshots: {},
          },
          meta: { transport: 'http', asOf: '2026-06-26T09:31:02+08:00' },
          error: null,
        },
      });

      await expectBadGatewayWithMessage(
        service.fetchSnapshot('600519.SH'),
        'Invalid normalized TDX snapshot response',
      );
    });

    it('throws bad gateway when envelope ok is false', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          ok: false,
          provider: 'tdx',
          data: null,
          meta: null,
          error: {
            code: 'TDX_HTTP_UNAVAILABLE',
            message: 'down',
            retryable: true,
            details: {},
          },
        },
      });

      await expect(service.fetchSnapshot('600519.SH')).rejects.toThrow(
        'TDX_HTTP_UNAVAILABLE',
      );
    });
  });
});
