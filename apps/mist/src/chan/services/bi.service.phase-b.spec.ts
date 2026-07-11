import { Test, TestingModule } from '@nestjs/testing';
import { BiStatus, BiType } from '../enums/bi.enum';
import { FenxingType } from '../enums/fenxing.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { BiVo } from '../vo/bi.vo';
import type { FenxingVo } from '../vo/fenxing.vo';
import { BiService } from './bi.service';

interface BiOptions {
  trend?: TrendDirection;
  status?: BiStatus;
  type?: BiType;
  highest?: number;
  lowest?: number;
  withFenxings?: boolean;
}

function createFenxing(id: number, type: FenxingType): FenxingVo {
  return {
    type,
    highest: 10,
    lowest: 0,
    leftIds: [id * 10 - 1],
    middleIds: [id * 10],
    rightIds: [id * 10 + 1],
    middleIndex: id,
    middleOriginId: id * 10,
  };
}

function createBi(id: number, options: BiOptions = {}): BiVo {
  const {
    trend = TrendDirection.Up,
    status = BiStatus.Valid,
    type = BiType.Complete,
    highest = 10,
    lowest = 0,
    withFenxings = type === BiType.Complete,
  } = options;

  return {
    startTime: new Date(Date.UTC(2026, 0, id * 2)),
    endTime: new Date(Date.UTC(2026, 0, id * 2 + 1)),
    highest,
    lowest,
    trend,
    type,
    status,
    independentCount: 1,
    originIds: [id],
    originData: [],
    startFenxing: withFenxings
      ? createFenxing(id * 2, FenxingType.Bottom)
      : null,
    endFenxing: withFenxings
      ? createFenxing(id * 2 + 1, FenxingType.Top)
      : null,
  };
}

function mockPhaseBPrimitives(
  service: BiService,
  overrides: {
    canMergeTwoBis?: (head: BiVo, tail: BiVo) => boolean;
    mergeTwoBis?: (head: BiVo, tail: BiVo) => BiVo;
    isCandidateBiValid?: (bi: BiVo) => boolean;
  } = {},
) {
  return {
    canMergeTwoBis: jest
      .spyOn(service as any, 'canMergeTwoBis')
      .mockImplementation(overrides.canMergeTwoBis ?? (() => true)),
    mergeTwoBis: jest.spyOn(service as any, 'mergeTwoBis').mockImplementation(
      overrides.mergeTwoBis ??
        ((head: BiVo, tail: BiVo) => ({
          ...head,
          endTime: tail.endTime,
          highest: Math.max(head.highest, tail.highest),
          lowest: Math.min(head.lowest, tail.lowest),
          status: BiStatus.Unknown,
          independentCount: head.independentCount + tail.independentCount,
          originIds: [...head.originIds, ...tail.originIds],
          endFenxing: tail.endFenxing,
        })),
    ),
    isCandidateBiValid: jest
      .spyOn(service as any, 'isCandidateBiValid')
      .mockImplementation(overrides.isCandidateBiValid ?? (() => true)),
  };
}

describe('BiService Phase B invalid-span merge', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();
    service = module.get<BiService>(BiService);
  });

  it.each([
    ['head', BiStatus.Invalid, BiStatus.Valid],
    ['tail', BiStatus.Valid, BiStatus.Invalid],
  ])(
    'merges when the %s endpoint is invalid',
    (_label, headStatus, tailStatus) => {
      const head = createBi(1, { status: headStatus as BiStatus });
      const tail = createBi(2, { status: tailStatus as BiStatus });
      const primitives = mockPhaseBPrimitives(service);

      const result = service['mergeBiSegments']([head, tail], []);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        originIds: [1, 2],
        status: BiStatus.Valid,
      });
      expect(primitives.mergeTwoBis).toHaveBeenCalledWith(
        expect.objectContaining({ originIds: [1] }),
        expect.objectContaining({ originIds: [2] }),
        [],
      );
    },
  );

  it('merges a span when only a middle Bi is invalid', () => {
    const head = createBi(1, { highest: 10, lowest: 0 });
    const middle = createBi(2, {
      trend: TrendDirection.Down,
      status: BiStatus.Invalid,
      highest: 9,
      lowest: 1,
    });
    const tail = createBi(3, { highest: 12, lowest: 2 });
    mockPhaseBPrimitives(service);

    const result = service['mergeBiSegments']([head, middle, tail], []);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      originIds: [1, 3],
      status: BiStatus.Valid,
    });
  });

  it('does not merge a pure-valid span', () => {
    const phaseABis = [createBi(1), createBi(2), createBi(3)];
    const primitives = mockPhaseBPrimitives(service);

    const result = service['mergeBiSegments'](phaseABis, []);

    expect(result).toEqual(phaseABis);
    result.forEach((bi: BiVo, index: number) =>
      expect(bi).not.toBe(phaseABis[index]),
    );
    expect(primitives.mergeTwoBis).not.toHaveBeenCalled();
  });

  it('rejects a span when a middle Bi breaks the endpoint price envelope', () => {
    const head = createBi(1, { highest: 10, lowest: 0 });
    const middle = createBi(2, {
      trend: TrendDirection.Down,
      status: BiStatus.Invalid,
      highest: 13,
      lowest: 1,
    });
    const tail = createBi(3, { highest: 12, lowest: 2 });
    const primitives = mockPhaseBPrimitives(service);

    const result = service['mergeBiSegments']([head, middle, tail], []);

    expect(result).toEqual([head, middle, tail]);
    expect(primitives.canMergeTwoBis).toHaveBeenCalled();
    expect(primitives.mergeTwoBis).not.toHaveBeenCalled();
  });

  it('chooses the shortest mergeable span and then the leftmost equal span', () => {
    const phaseABis = [
      createBi(1),
      createBi(2, { status: BiStatus.Invalid }),
      createBi(3),
      createBi(4, { status: BiStatus.Invalid }),
      createBi(5),
    ];
    const allowedPairs = new Set(['1:3', '2:3', '4:5']);
    const primitives = mockPhaseBPrimitives(service, {
      canMergeTwoBis: (head, tail) => {
        const headId = head.originIds[0];
        const tailId = tail.originIds[tail.originIds.length - 1];
        return allowedPairs.has(`${headId}:${tailId}`);
      },
    });

    service['mergeBiSegments'](phaseABis, []);

    expect(primitives.mergeTwoBis).toHaveBeenCalled();
    const [firstHead, firstTail] = primitives.mergeTwoBis.mock.calls[0] as [
      BiVo,
      BiVo,
    ];
    expect(firstHead.originIds).toEqual([2]);
    expect(firstTail.originIds).toEqual([3]);
  });

  it('restarts to a fixed point and revalidates every merged result', () => {
    const phaseABis = [
      createBi(1),
      createBi(2, { status: BiStatus.Invalid }),
      createBi(3),
    ];
    const primitives = mockPhaseBPrimitives(service, {
      isCandidateBiValid: (bi) => bi.originIds.length === 3,
    });

    const result = service['mergeBiSegments'](phaseABis, []);

    expect(primitives.mergeTwoBis).toHaveBeenCalledTimes(2);
    expect(primitives.isCandidateBiValid).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      originIds: [1, 2, 3],
      status: BiStatus.Valid,
    });
  });

  it('preserves unmergeable Invalid and UnComplete boundaries', () => {
    const invalid = createBi(1, { status: BiStatus.Invalid });
    const uncomplete = createBi(2, {
      trend: TrendDirection.Down,
      type: BiType.UnComplete,
      status: BiStatus.Unknown,
      withFenxings: false,
    });
    const tail = createBi(3);
    const primitives = mockPhaseBPrimitives(service);

    const result = service['mergeBiSegments']([invalid, uncomplete, tail], []);

    expect(result).toEqual([invalid, uncomplete, tail]);
    expect(result[0].status).toBe(BiStatus.Invalid);
    expect(result[1].type).toBe(BiType.UnComplete);
    expect(primitives.canMergeTwoBis).not.toHaveBeenCalled();
    expect(primitives.mergeTwoBis).not.toHaveBeenCalled();
  });

  it('does not mutate the input array or its Bi objects', () => {
    const first = Object.freeze(
      createBi(1, { status: BiStatus.Invalid }),
    ) as BiVo;
    const second = Object.freeze(createBi(2)) as BiVo;
    const phaseABis = Object.freeze([first, second]);
    mockPhaseBPrimitives(service);

    const result = service['mergeBiSegments'](phaseABis, []);

    expect(phaseABis).toEqual([first, second]);
    expect(first.status).toBe(BiStatus.Invalid);
    expect(second.status).toBe(BiStatus.Valid);
    expect(result[0]).not.toBe(first);
    expect(result[0]).not.toBe(second);
    expect(result[0].status).toBe(BiStatus.Valid);
  });
});
