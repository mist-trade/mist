import { Test, TestingModule } from '@nestjs/testing';
import { BiService } from './bi.service';
import { TrendDirection } from '../enums/trend-direction.enum';

describe('BiService', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();

    service = module.get<BiService>(BiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('removeBiByIndex should remove only the requested item', () => {
    const bis = ['first', 'middle', 'last'];

    service['removeBiByIndex'](bis, 1);

    expect(bis).toEqual(['first', 'last']);
  });

  it('throws a clear invariant error when merging incomplete Bi values', () => {
    const incompleteBi = {
      trend: TrendDirection.Up,
      startFenxing: null,
      endFenxing: null,
    };

    expect(() =>
      service['mergeTwoBis'](incompleteBi as any, incompleteBi as any, []),
    ).toThrow('Bi invariant failed');
  });
});
