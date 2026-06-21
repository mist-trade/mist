import { Test, TestingModule } from '@nestjs/testing';
import { IndicatorService } from './indicator.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security, K } from '@app/shared-data';
import { DataSourceService } from '@app/utils';

describe('IndicatorService', () => {
  let service: IndicatorService;

  const mockSecurityRepository = {
    find: jest.fn(),
  };

  const mockKRepository = {
    find: jest.fn(),
  };

  const mockDataSourceService = {
    select: jest.fn().mockReturnValue('ef'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndicatorService,
        {
          provide: getRepositoryToken(Security),
          useValue: mockSecurityRepository,
        },
        {
          provide: getRepositoryToken(K),
          useValue: mockKRepository,
        },
        {
          provide: DataSourceService,
          useValue: mockDataSourceService,
        },
      ],
    }).compile();

    service = module.get<IndicatorService>(IndicatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('uses a fallback indicator engine when native talib is unavailable', async () => {
    jest.resetModules();
    jest.doMock(
      'talib',
      () => {
        throw new Error('native talib unavailable');
      },
      { virtual: true },
    );

    const { IndicatorService: IndicatorServiceWithFallback } = await import(
      './indicator.service'
    );
    const fallbackService = new IndicatorServiceWithFallback(
      mockSecurityRepository as any,
      mockKRepository as any,
      mockDataSourceService as any,
    );

    expect(() => fallbackService.onModuleInit()).not.toThrow();

    const result = await fallbackService.runRSI(
      Array.from({ length: 20 }, (_, index) => index + 1),
      14,
    );

    expect(result.nbElement).toBeGreaterThan(0);
    expect(result.rsi.every((value) => Number.isFinite(value))).toBe(true);
  });
});
