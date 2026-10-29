import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketMacroIndicator } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import {
  MarketBreadthCollectionService,
  StockQuoteSnapshot,
} from './market-breadth-collection.service';

describe('MarketBreadthCollectionService', () => {
  let service: MarketBreadthCollectionService;
  let mockRepo: any;
  let mockTimezoneService: any;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation(() => new MarketMacroIndicator()),
      save: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
    };

    mockTimezoneService = {
      getCurrentBeijingTime: jest
        .fn()
        .mockReturnValue(new Date('2026-10-29T21:30:00+08:00')),
      isTradingDay: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketBreadthCollectionService,
        {
          provide: getRepositoryToken(MarketMacroIndicator),
          useValue: mockRepo,
        },
        {
          provide: TimezoneService,
          useValue: mockTimezoneService,
        },
      ],
    }).compile();

    service = module.get<MarketBreadthCollectionService>(
      MarketBreadthCollectionService,
    );
  });

  it('aggregates cross-sectional breadth correctly', () => {
    const quotes: StockQuoteSnapshot[] = [
      { code: '000001', close: 10, cys13: -15.0, aboveMa250: false },
      { code: '000002', close: 15, cys13: -13.0, aboveMa250: false },
      { code: '600519', close: 1600, cys13: -5.0, aboveMa250: true },
      { code: '300750', close: 200, cys13: 2.0, aboveMa250: true },
    ];

    const result = service.aggregateBreadth('2026-10-29', quotes, -12.0);
    expect(result.tradingDate).toBe('2026-10-29');
    expect(result.sampleCount).toBe(4);
    // 2 out of 4 have CYS < -12.0 -> 0.5
    expect(result.breadthCys13OversoldRatio).toBe(0.5);
    // 2 out of 4 have aboveMa250 == true -> 0.5
    expect(result.breadthAboveMa250Ratio).toBe(0.5);
  });

  it('persists aggregated macro indicator into repository', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    const saved = await service.saveMacroIndicator({
      tradingDate: '2026-10-29',
      breadthCys13OversoldRatio: 0.42,
      breadthAboveMa250Ratio: 0.15,
      sampleCount: 5000,
      allATurnoverRate: 1.25,
      erpPercentile10y: 0.95,
    });

    expect(mockRepo.save).toHaveBeenCalled();
    expect(saved.tradingDate).toBe('2026-10-29');
    expect(saved.breadthCys13OversoldRatio).toBe(0.42);
    expect(saved.breadthAboveMa250Ratio).toBe(0.15);
  });

  it('skips execution on non-trading days', async () => {
    mockTimezoneService.isTradingDay.mockResolvedValue(false);

    const result = await service.runNightlyAggregation([]);
    expect(result).toBeNull();
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
