import { Test, TestingModule } from '@nestjs/testing';
import { IndicatorService } from './indicator.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security, K } from '@app/shared-data';
import { DataSourceService } from '@app/utils';

describe('IndicatorService', () => {
  let service: IndicatorService;

  const close = Array.from(
    { length: 80 },
    (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.7,
  );
  const high = close.map((value, index) => value + 2 + (index % 4) * 0.1);
  const low = close.map((value, index) => value - 2 - (index % 3) * 0.1);

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

  it('keeps the MACD response shape and aligned first complete value', async () => {
    const result = await service.runMACD(close);

    expect(result.begIndex).toBe(33);
    expect(result.nbElement).toBe(result.macd.length);
    expect(Array.isArray(result.macd)).toBe(true);
    expect(Array.isArray(result.signal)).toBe(true);
    expect(Array.isArray(result.histogram)).toBe(true);
    expect(result.macd).toHaveLength(47);
    expect(result.signal).toHaveLength(result.macd.length);
    expect(result.histogram).toHaveLength(result.macd.length);
    expect(result.macd[0]).toBeCloseTo(4.010272, 6);
    expect(result.signal[0]).toBeCloseTo(5.290475, 6);
    expect(result.histogram[0]).toBeCloseTo(-1.280203, 6);
  });

  it('keeps the RSI response shape and period-based alignment', async () => {
    const result = await service.runRSI(close, 14);

    expect(result.begIndex).toBe(14);
    expect(result.nbElement).toBe(result.rsi.length);
    expect(Array.isArray(result.rsi)).toBe(true);
    expect(result.rsi).toHaveLength(66);
    expect(result.rsi[0]).toBeCloseTo(67.95, 2);
  });

  it('keeps KDJ fields aligned for Chan Theory consumers', async () => {
    const result = await service.runKDJ({
      high,
      low,
      close,
      period: 14,
      kSmoothing: 3,
      dSmoothing: 3,
    });

    expect(result.begIndex).toBe(17);
    expect(result.nbElement).toBe(result.K.length);
    expect(Array.isArray(result.K)).toBe(true);
    expect(Array.isArray(result.D)).toBe(true);
    expect(Array.isArray(result.J)).toBe(true);
    expect(result.K).toHaveLength(63);
    expect(result.D).toHaveLength(result.K.length);
    expect(result.J).toHaveLength(result.K.length);
    expect(result.K[0]).toBeCloseTo(57.023495, 6);
    expect(result.D[0]).toBeCloseTo(48.972518, 6);
    expect(result.J[0]).toBeCloseTo(3 * result.K[0] - 2 * result.D[0], 10);
  });

  it('keeps direct indicator array outputs finite and aligned', async () => {
    const adx = await service.runADX({ high, low, close, period: 14 });
    const atr = await service.runATR({ high, low, close, period: 14 });
    const dualMA = await service.runDualMA({
      close,
      shortPeriod: 13,
      longPeriod: 60,
    });

    expect(adx).toHaveLength(53);
    expect(atr).toHaveLength(66);
    expect(dualMA.shortMA).toHaveLength(68);
    expect(dualMA.longMA).toHaveLength(21);
    expect(adx[0]).toBeCloseTo(63.72878, 5);
    expect(atr[0]).toBeCloseTo(4.273998, 6);
    expect(dualMA.shortMA[0]).toBeCloseTo(105.944811, 6);
    expect(dualMA.longMA[0]).toBeCloseTo(120.758567, 6);
    expect(
      [...adx, ...atr, ...dualMA.shortMA, ...dualMA.longMA].every(
        Number.isFinite,
      ),
    ).toBe(true);
  });
});
