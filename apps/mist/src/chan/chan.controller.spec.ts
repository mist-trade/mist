import { Test, TestingModule } from '@nestjs/testing';
import { TimezoneService } from '@app/timezone';
import { Period } from '@app/shared-data';
import { ChanController } from './chan.controller';
import { ChanService } from './chan.service';
import { IndicatorService } from '../indicator/indicator.service';

describe('ChanController', () => {
  let controller: ChanController;
  let mockChanService: Partial<ChanService>;
  let mockIndicatorService: Partial<IndicatorService>;
  let mockTimezoneService: Partial<TimezoneService>;

  beforeEach(async () => {
    mockChanService = {
      mergeK: jest.fn().mockImplementation((k) => k),
      createBi: jest.fn().mockReturnValue({ confirmed: [], unconfirmed: [] }),
      getFenxings: jest.fn().mockReturnValue([]),
      createBiChannels: jest
        .fn()
        .mockReturnValue({ confirmed: [], unconfirmed: [] }),
      createDuan: jest.fn().mockReturnValue([]),
      createDuanChannels: jest
        .fn()
        .mockReturnValue({ confirmed: [], unconfirmed: [] }),
    };

    mockIndicatorService = {
      findKData: jest.fn().mockResolvedValue([
        {
          securityId: 7,
          securityCode: '000300',
          source: 'tdx',
          period: 1440,
          timestamp: new Date('2026-01-05T00:00:00.000Z'),
          open: 3800,
          high: 3850,
          low: 3790,
          close: 3840,
          volume: '1000000.00000000',
          amount: '500000000.00000000',
          type: 'sealed',
        },
        {
          securityId: 7,
          securityCode: '000300',
          source: 'tdx',
          period: 1440,
          timestamp: new Date('2026-01-06T00:00:00.000Z'),
          open: 3840,
          high: 3860,
          low: 3820,
          close: 3850,
          volume: '1100000.00000000',
          amount: '550000000.00000000',
          type: 'sealed',
        },
      ]),
    };

    mockTimezoneService = {
      parseDateString: jest
        .fn()
        .mockImplementation((val: string) => new Date(val)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChanController],
      providers: [
        { provide: ChanService, useValue: mockChanService },
        { provide: IndicatorService, useValue: mockIndicatorService },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();

    controller = module.get<ChanController>(ChanController);
  });

  it('maps sequential positive IDs for ChanK series and executes mergeK', async () => {
    const result = await controller.postMergeK({
      code: '000300',
      period: Period.DAY,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    });

    expect(mockIndicatorService.findKData).toHaveBeenCalledWith({
      code: '000300',
      period: Period.DAY,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-02-01'),
    });

    expect(mockChanService.mergeK).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1,
        symbol: '000300',
        open: 3800,
        high: 3850,
        low: 3790,
        close: 3840,
      }),
      expect.objectContaining({
        id: 2,
        symbol: '000300',
        open: 3840,
        high: 3860,
        low: 3820,
        close: 3850,
      }),
    ]);

    expect(result).toHaveLength(2);
  });

  it('delegates createBi, fenxing, channel, and duan with sequential ChanK series', async () => {
    const query = {
      code: '000300',
      period: Period.DAY,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    };

    await controller.postIndexBi(query);
    expect(mockChanService.createBi).toHaveBeenCalledWith({
      k: expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
    });

    await controller.postFenxing(query);
    expect(mockChanService.getFenxings).toHaveBeenCalledWith({
      k: expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
    });

    await controller.postBiChannel(query);
    expect(mockChanService.createBiChannels).toHaveBeenCalledWith({
      k: expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
    });

    await controller.postDuan(query);
    expect(mockChanService.createDuan).toHaveBeenCalledWith({
      k: expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
    });

    await controller.postDuanChannel(query);
    expect(mockChanService.createDuanChannels).toHaveBeenCalledWith({
      k: expect.arrayContaining([
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ]),
    });
  });
});
