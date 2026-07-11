import { Test, TestingModule } from '@nestjs/testing';
import { BiStatus, BiType } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { BiVo } from '../vo/bi.vo';
import type { FenxingVo } from '../vo/fenxing.vo';
import { BiService } from './bi.service';

function createFenxing(index: number, type: FenxingType): FenxingVo {
  return {
    type,
    highest: index + 20,
    lowest: index + 10,
    leftIds: [index * 10 - 1],
    middleIds: [index * 10],
    rightIds: [index * 10 + 1],
    middleIndex: index,
    middleOriginId: index * 10,
  };
}

function createBi(
  start: number,
  end: number,
  trend: TrendDirection,
  status: BiStatus,
): BiVo {
  return {
    startTime: new Date(Date.UTC(2026, 0, start + 1)),
    endTime: new Date(Date.UTC(2026, 0, end + 1)),
    highest: end + 20,
    lowest: start + 10,
    trend,
    type: BiType.Complete,
    status,
    independentCount: end - start,
    originIds: [start, end],
    originData: [],
    startFenxing: createFenxing(
      start,
      trend === TrendDirection.Up ? FenxingType.Bottom : FenxingType.Top,
    ),
    endFenxing: createFenxing(
      end,
      trend === TrendDirection.Up ? FenxingType.Top : FenxingType.Bottom,
    ),
  };
}

function rangeKey(bi: BiVo): string {
  return `${bi.startFenxing?.middleIndex}-${bi.endFenxing?.middleIndex}`;
}

function mockPhaseAPrimitives(
  service: BiService,
  canMerge: (first: BiVo, middle: BiVo, third: BiVo) => boolean,
  isValid: (bi: BiVo) => boolean = () => true,
) {
  return {
    canMergeThreeBis: jest
      .spyOn(service as any, 'canMergeThreeBis')
      .mockImplementation(canMerge),
    mergeThreeBis: jest
      .spyOn(service as any, 'mergeThreeBis')
      .mockImplementation((first: BiVo, third: BiVo) => ({
        ...first,
        endTime: third.endTime,
        highest: Math.max(first.highest, third.highest),
        lowest: Math.min(first.lowest, third.lowest),
        status: BiStatus.Unknown,
        independentCount: first.independentCount + third.independentCount,
        originIds: [...first.originIds, ...third.originIds],
        endFenxing: third.endFenxing,
      })),
    isCandidateBiValid: jest
      .spyOn(service as any, 'isCandidateBiValid')
      .mockImplementation(isValid),
  };
}

describe('BiService Phase A time-stack reduction', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();
    service = module.get<BiService>(BiService);
  });

  it('repeats top-three reduction until the new stack top is stable', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
      createBi(3, 4, TrendDirection.Down, BiStatus.Invalid),
      createBi(4, 5, TrendDirection.Up, BiStatus.Valid),
    ];
    const allowed = new Set(['2-3|3-4|4-5', '0-1|1-2|2-5']);
    const primitives = mockPhaseAPrimitives(
      service,
      (first, middle, third) =>
        allowed.has(
          `${rangeKey(first)}|${rangeKey(middle)}|${rangeKey(third)}`,
        ),
      (bi) => bi.startFenxing?.middleIndex === 0,
    );

    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(result).toHaveLength(1);
    expect(rangeKey(result[0])).toBe('0-5');
    expect(result[0].status).toBe(BiStatus.Valid);
    expect(primitives.mergeThreeBis).toHaveBeenCalledTimes(2);
    expect(primitives.isCandidateBiValid).toHaveBeenCalledTimes(2);
  });

  it('stops when the top three are all Valid', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Valid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const primitives = mockPhaseAPrimitives(service, () => true);

    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(primitives.canMergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains an Invalid top group when it cannot merge', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const primitives = mockPhaseAPrimitives(service, () => false);

    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(primitives.mergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains leading Invalid candidates', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Invalid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
    ];
    mockPhaseAPrimitives(service, () => false);
    const result = service['reducePhaseATimeStack'](candidates, []);
    expect(result.map((bi) => bi.status)).toEqual([
      BiStatus.Invalid,
      BiStatus.Invalid,
    ]);
  });

  it('rejects a discontinuous candidate before pushing it', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(2, 3, TrendDirection.Down, BiStatus.Invalid),
    ];
    mockPhaseAPrimitives(service, () => false);
    expect(() => service['reducePhaseATimeStack'](candidates, [])).toThrow(
      'non-contiguous Bis 0-1 -> 2-3',
    );
  });

  it('rejects a merged Bi that changes the outer boundary', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const primitives = mockPhaseAPrimitives(service, () => true);
    primitives.mergeThreeBis.mockImplementation(() =>
      createBi(1, 3, TrendDirection.Up, BiStatus.Unknown),
    );
    expect(() => service['reducePhaseATimeStack'](candidates, [])).toThrow(
      'merged Bi 1-3 does not preserve 0-3',
    );
  });

  it('does not mutate the input array or Bi objects', () => {
    const first = Object.freeze(
      createBi(0, 1, TrendDirection.Up, BiStatus.Invalid),
    ) as BiVo;
    const second = Object.freeze(
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
    ) as BiVo;
    const candidates = Object.freeze([first, second]);

    mockPhaseAPrimitives(service, () => false);
    const result = service['reducePhaseATimeStack'](candidates, []);

    expect(candidates).toEqual([first, second]);
    expect(result[0]).not.toBe(first);
    expect(result[1]).not.toBe(second);
  });
});
