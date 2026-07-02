import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMcpService } from './data-mcp.service';
import { Security, K, Period } from '@app/shared-data';
import { DataSourceService } from '@app/utils';
import { DataSource } from '@app/shared-data';
import { ValidationHelper } from '../utils/validation.helpers';

describe('DataMcpService', () => {
  let service: DataMcpService;
  let securityRepository: Repository<Security>;
  let kRepository: Repository<K>;

  const mockSecurity = {
    id: 1,
    code: '000001',
    name: '上证指数',
    type: 'INDEX',
    exchange: 'SH',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceConfigs: [],
    ks: [],
  } as any;

  const mockK = {
    id: 1,
    security: mockSecurity,
    source: 'aktools',
    period: Period.ONE_MIN,
    timestamp: new Date('2024-01-01T09:30:00Z'),
    open: 3000,
    close: 3010,
    high: 3020,
    low: 2990,
    volume: 1000000,
    amount: 100000000,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMcpService,
        {
          provide: getRepositoryToken(Security),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(K),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: DataSourceService,
          useValue: {
            select: jest.fn((source?: string) => {
              if (!source) return DataSource.EAST_MONEY;
              if (source === 'ef' || source === 'EAST_MONEY')
                return DataSource.EAST_MONEY;
              if (source === 'tdx' || source === 'TDX') return DataSource.TDX;
              if (source === 'mqmt' || source === 'MINI_QMT')
                return DataSource.MINI_QMT;
              return DataSource.EAST_MONEY;
            }),
            selectOrFail: jest.fn(),
            normalize: jest.fn(),
            isValid: jest.fn(),
            getDefault: jest.fn(() => DataSource.EAST_MONEY),
          },
        },
      ],
    }).compile();

    service = module.get<DataMcpService>(DataMcpService);
    securityRepository = module.get<Repository<Security>>(
      getRepositoryToken(Security),
    );
    kRepository = module.get<Repository<K>>(getRepositoryToken(K));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listIndices', () => {
    it('should return list of indices', async () => {
      const mockSecurities = [mockSecurity];
      jest.spyOn(securityRepository, 'find').mockResolvedValue(mockSecurities);

      const result = (await service.listIndices()) as unknown as {
        success: boolean;
        data: any[];
      };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('symbol', '000001');
      expect(result.data[0]).toHaveProperty('name', '上证指数');
    });
  });

  describe('getKlineData', () => {
    it('should return k-line data for valid symbol and period', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(mockSecurity);

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockK]),
      };

      jest
        .spyOn(kRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = (await service.getKlineData(
        '000001',
        '1min' as any,
        10,
      )) as unknown as { success: boolean; data: any[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('time');
      expect(result.data[0]).toHaveProperty('open', 3000);
      expect(result.data[0]).toHaveProperty('close', 3010);
    });

    it('should return error for invalid symbol', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(null);

      const result = (await service.getKlineData(
        '999999',
        '1min' as any,
        10,
      )) as unknown as { success: boolean; error: { message: string } };

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not found');
    });

    it('should return error for invalid limit', async () => {
      const result = (await service.getKlineData(
        '000001',
        '1min' as any,
        0,
      )) as unknown as { success: boolean; error: { message: string } };

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('limit must be at least 1');
    });

    it('should reject symbols that disappear after sanitization before querying', async () => {
      const sanitizeSpy = jest
        .spyOn(ValidationHelper, 'sanitizeString')
        .mockReturnValueOnce('000001')
        .mockReturnValueOnce(null);

      const result = (await service.getKlineData(
        '000001',
        '1min' as any,
        10,
      )) as unknown as { success: boolean; error: { message: string } };

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Symbol cannot be empty');
      expect(securityRepository.findOne).not.toHaveBeenCalled();

      sanitizeSpy.mockRestore();
    });
  });

  describe('getDailyKline', () => {
    it('should return daily k-line data using the shared row shape', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(mockSecurity);

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockK]),
      };

      jest
        .spyOn(kRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = (await service.getDailyKline('000001', 10)) as unknown as {
        success: boolean;
        data: any[];
      };

      expect(result.success).toBe(true);
      expect(result.data[0]).toMatchObject({
        id: 1,
        time: mockK.timestamp,
        open: 3000,
        close: 3010,
        highest: 3020,
        lowest: 2990,
        volume: '1000000',
        amount: 100000000,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'bar.period = :period',
        { period: Period.DAY },
      );
    });
  });

  describe('getLatestData', () => {
    it('assigns latest rows by period key rather than by raw array position', async () => {
      jest.spyOn(securityRepository, 'findOne').mockResolvedValue(mockSecurity);

      const rowsByPeriod = new Map<Period, K>([
        [Period.DAY, { ...mockK, id: 10, period: Period.DAY } as any],
        [Period.ONE_MIN, { ...mockK, id: 11, period: Period.ONE_MIN } as any],
        [Period.FIVE_MIN, { ...mockK, id: 12, period: Period.FIVE_MIN } as any],
        [
          Period.FIFTEEN_MIN,
          { ...mockK, id: 13, period: Period.FIFTEEN_MIN } as any,
        ],
        [
          Period.THIRTY_MIN,
          { ...mockK, id: 14, period: Period.THIRTY_MIN } as any,
        ],
        [
          Period.SIXTY_MIN,
          { ...mockK, id: 15, period: Period.SIXTY_MIN } as any,
        ],
      ]);

      jest.spyOn(kRepository, 'createQueryBuilder').mockImplementation(() => {
        let period: Period | undefined;
        const mockQueryBuilder: Record<string, jest.Mock> = {
          leftJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn(
            (
              condition: string,
              params: { period?: Period },
            ): Record<string, jest.Mock> => {
              if (condition === 'bar.period = :period') {
                period = params.period;
              }
              return mockQueryBuilder;
            },
          ),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getOne: jest.fn(async () =>
            period == null ? null : rowsByPeriod.get(period),
          ),
        };
        return mockQueryBuilder as any;
      });

      const result = (await service.getLatestData('000001')) as unknown as {
        success: boolean;
        data: Record<string, any>;
      };

      expect(result.success).toBe(true);
      expect(result.data.daily.id).toBe(10);
      expect(result.data['1min'].id).toBe(11);
      expect(result.data['5min'].id).toBe(12);
      expect(result.data['15min'].id).toBe(13);
      expect(result.data['30min'].id).toBe(14);
      expect(result.data['60min'].id).toBe(15);
    });
  });
});
