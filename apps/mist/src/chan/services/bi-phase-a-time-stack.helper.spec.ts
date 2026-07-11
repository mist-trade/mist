import { BiStatus, BiType } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { BiVo } from '../vo/bi.vo';
import type { FenxingVo } from '../vo/fenxing.vo';
import {
  reducePhaseATimeStack,
  type PhaseATimeStackOperations,
} from './bi-phase-a-time-stack.helper';

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

function createOperations(
  canMerge: PhaseATimeStackOperations['canMergeThreeBis'],
  isValid: PhaseATimeStackOperations['isCandidateBiValid'] = () => true,
): jest.Mocked<PhaseATimeStackOperations> {
  return {
    canMergeThreeBis: jest.fn(canMerge),
    mergeThreeBis: jest.fn((first, third) => ({
      ...first,
      endTime: third.endTime,
      highest: Math.max(first.highest, third.highest),
      lowest: Math.min(first.lowest, third.lowest),
      status: BiStatus.Unknown,
      independentCount: first.independentCount + third.independentCount,
      originIds: [...first.originIds, ...third.originIds],
      endFenxing: third.endFenxing,
    })),
    isCandidateBiValid: jest.fn(isValid),
  };
}

describe('reducePhaseATimeStack', () => {
  it('repeats top-three reduction until the new stack top is stable', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
      createBi(3, 4, TrendDirection.Down, BiStatus.Invalid),
      createBi(4, 5, TrendDirection.Up, BiStatus.Valid),
    ];
    const allowed = new Set(['2-3|3-4|4-5', '0-1|1-2|2-5']);
    const operations = createOperations(
      (first, middle, third) =>
        allowed.has(
          `${rangeKey(first)}|${rangeKey(middle)}|${rangeKey(third)}`,
        ),
      (bi) => bi.startFenxing?.middleIndex === 0,
    );

    const result = reducePhaseATimeStack(candidates, operations);

    expect(result).toHaveLength(1);
    expect(rangeKey(result[0])).toBe('0-5');
    expect(result[0].status).toBe(BiStatus.Valid);
    expect(operations.mergeThreeBis).toHaveBeenCalledTimes(2);
    expect(operations.isCandidateBiValid).toHaveBeenCalledTimes(2);
  });

  it('stops when the top three are all Valid', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Valid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const operations = createOperations(() => true);

    const result = reducePhaseATimeStack(candidates, operations);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(operations.canMergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains an Invalid top group when it cannot merge', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const operations = createOperations(() => false);

    const result = reducePhaseATimeStack(candidates, operations);

    expect(result.map(rangeKey)).toEqual(['0-1', '1-2', '2-3']);
    expect(operations.mergeThreeBis).not.toHaveBeenCalled();
  });

  it('retains leading Invalid candidates', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Invalid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
    ];
    const result = reducePhaseATimeStack(
      candidates,
      createOperations(() => false),
    );
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
    expect(() =>
      reducePhaseATimeStack(
        candidates,
        createOperations(() => false),
      ),
    ).toThrow('non-contiguous Bis 0-1 -> 2-3');
  });

  it('rejects a merged Bi that changes the outer boundary', () => {
    const candidates = [
      createBi(0, 1, TrendDirection.Up, BiStatus.Valid),
      createBi(1, 2, TrendDirection.Down, BiStatus.Invalid),
      createBi(2, 3, TrendDirection.Up, BiStatus.Valid),
    ];
    const operations = createOperations(() => true);
    operations.mergeThreeBis.mockImplementation(() =>
      createBi(1, 3, TrendDirection.Up, BiStatus.Unknown),
    );
    expect(() => reducePhaseATimeStack(candidates, operations)).toThrow(
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

    const result = reducePhaseATimeStack(
      candidates,
      createOperations(() => false),
    );

    expect(candidates).toEqual([first, second]);
    expect(result[0]).not.toBe(first);
    expect(result[1]).not.toBe(second);
  });
});
