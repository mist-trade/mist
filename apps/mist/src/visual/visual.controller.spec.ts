import { Test, TestingModule } from '@nestjs/testing';
import { TimezoneService } from '@app/timezone';
import { VisualCommandService } from '@app/visual-command';
import { Period } from '@app/shared-data';
import { IndicatorService } from '../indicator/indicator.service';
import { VisualController } from './visual.controller';

describe('VisualController', () => {
  let controller: VisualController;
  let mockVisualCommandService: Partial<VisualCommandService>;
  let mockIndicatorService: Partial<IndicatorService>;
  let mockTimezoneService: Partial<TimezoneService>;

  beforeEach(async () => {
    mockVisualCommandService = {
      generateCommands: jest.fn().mockReturnValue({
        code: '000001',
        period: 5,
        source: 'qmt',
        totalKlines: 10,
        commands: [
          {
            id: 'chan_bi_0_0_5',
            type: 'line',
            layer: 'chan_bi',
            startIndex: 0,
            endIndex: 5,
            startTime: '2026-08-27T09:30:00.000Z',
            endTime: '2026-08-27T09:55:00.000Z',
            startPrice: 100,
            endPrice: 110,
            color: '#FACC15',
          },
        ],
      }),
    };

    mockIndicatorService = {
      findKData: jest.fn().mockResolvedValue([
        {
          id: 1,
          security: { code: '000001' },
          timestamp: new Date('2026-08-27T09:30:00.000Z'),
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          volume: '1000',
          amount: '100000',
        },
      ]),
    };

    mockTimezoneService = {
      parseDateString: jest.fn((str) => new Date(str)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VisualController],
      providers: [
        {
          provide: VisualCommandService,
          useValue: mockVisualCommandService,
        },
        {
          provide: IndicatorService,
          useValue: mockIndicatorService,
        },
        {
          provide: TimezoneService,
          useValue: mockTimezoneService,
        },
      ],
    }).compile();

    controller = module.get<VisualController>(VisualController);
  });

  it('queries K-lines and returns standard visual commands payload', async () => {
    const result = await controller.getCommands({
      code: '000001',
      period: Period.FIVE_MIN,
      layers: 'chan_bi',
    });

    expect(result).toBeDefined();
    expect(result.code).toBe('000001');
    expect(result.commands.length).toBe(1);
    expect(mockIndicatorService.findKData).toHaveBeenCalled();
    expect(mockVisualCommandService.generateCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '000001',
        period: Period.FIVE_MIN,
        layers: ['chan_bi'],
      }),
    );
  });

  it('does not slice by count and passes all K-lines to generateCommands', async () => {
    const manyKs = Array.from({ length: 600 }, (_, i) => ({
      id: i + 1,
      security: { code: '000001' },
      timestamp: new Date(Date.UTC(2026, 7, 10, 9, 30, 0) + i * 60000),
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: '1000',
      amount: '100000',
    }));
    (mockIndicatorService.findKData as jest.Mock).mockResolvedValueOnce(manyKs);

    await controller.getCommands({
      code: '000001',
      period: Period.FIVE_MIN,
    });

    // All 600 bars must be passed through (no 500 slicing) via unified pipeline
    // Pipeline now does precision gate + Imputer; timestamps are deduped only if truly duplicate
    // Here each bar has unique timestamp (day + second offset), so all 600 survive after sorting
    expect(mockVisualCommandService.generateCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        klines: expect.arrayContaining([]),
      }),
    );
    const call = (mockVisualCommandService.generateCommands as jest.Mock).mock
      .calls[0][0];
    expect(call.klines.length).toBe(600);
  });

  it('loads macro K-lines and queries macroPeriod when specified', async () => {
    (mockIndicatorService.findKData as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 1,
          security: { code: '000001' },
          timestamp: new Date('2026-08-27T09:30:00.000Z'),
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          volume: '1000',
          amount: '100000',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 101,
          security: { code: '000001' },
          timestamp: new Date('2026-08-27T09:30:00.000Z'),
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: '5000',
          amount: '500000',
        },
      ]);

    await controller.getCommands({
      code: '000001',
      period: Period.FIVE_MIN,
      macroPeriod: Period.THIRTY_MIN,
    });

    expect(mockIndicatorService.findKData).toHaveBeenCalledTimes(2);
    expect(mockIndicatorService.findKData).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        period: Period.THIRTY_MIN,
      }),
    );
  });

  it('computes macroBis and passes it to generateCommands when macro K-lines form valid bis', async () => {
    // 构造足够生成笔的微观与宏观 K 线
    const subBars = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      security: { code: '000001' },
      timestamp: new Date(Date.UTC(2026, 7, 10, 9, 30, 0) + i * 5 * 60000),
      open: 100 + (i % 2 === 0 ? i : -i),
      high: 110 + i,
      low: 90 - i,
      close: 100 + i,
      volume: '1000',
      amount: '100000',
    }));

    // 宏观 K 线构成明确的顶底分型与笔（例如 10 根 30m）
    const macroBars = [
      {
        id: 1,
        timestamp: new Date('2026-08-10T01:30:00.000Z'),
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 2,
        timestamp: new Date('2026-08-10T02:00:00.000Z'),
        open: 102,
        high: 115,
        low: 101,
        close: 114,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 3,
        timestamp: new Date('2026-08-10T02:30:00.000Z'),
        open: 114,
        high: 130,
        low: 112,
        close: 128,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 4,
        timestamp: new Date('2026-08-10T03:00:00.000Z'),
        open: 128,
        high: 125,
        low: 110,
        close: 112,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 5,
        timestamp: new Date('2026-08-10T03:30:00.000Z'),
        open: 112,
        high: 114,
        low: 90,
        close: 92,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 6,
        timestamp: new Date('2026-08-10T04:00:00.000Z'),
        open: 92,
        high: 95,
        low: 80,
        close: 82,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 7,
        timestamp: new Date('2026-08-10T04:30:00.000Z'),
        open: 82,
        high: 100,
        low: 81,
        close: 98,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 8,
        timestamp: new Date('2026-08-10T05:00:00.000Z'),
        open: 98,
        high: 115,
        low: 97,
        close: 112,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 9,
        timestamp: new Date('2026-08-10T05:30:00.000Z'),
        open: 112,
        high: 125,
        low: 111,
        close: 124,
        volume: '1000',
        amount: '1000',
      },
      {
        id: 10,
        timestamp: new Date('2026-08-10T06:00:00.000Z'),
        open: 124,
        high: 120,
        low: 105,
        close: 108,
        volume: '1000',
        amount: '1000',
      },
    ].map((b) => ({ ...b, security: { code: '000001' } }));

    (mockIndicatorService.findKData as jest.Mock)
      .mockResolvedValueOnce(subBars)
      .mockResolvedValueOnce(macroBars);

    await controller.getCommands({
      code: '000001',
      period: Period.FIVE_MIN,
      macroPeriod: Period.THIRTY_MIN,
    });

    expect(mockVisualCommandService.generateCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '000001',
        period: Period.FIVE_MIN,
        chanOptions: expect.objectContaining({
          macroBis: expect.any(Array),
        }),
      }),
    );
  });
});
