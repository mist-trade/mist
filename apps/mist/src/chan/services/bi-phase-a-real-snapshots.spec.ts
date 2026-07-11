import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BiStatus, BiType } from '../enums/bi.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import type { BiVo } from '../vo/bi.vo';
import type { MergedKVo } from '../vo/merged-k.vo';
import { BiService } from './bi.service';

const FIXTURES_DIR = join(__dirname, '__fixtures__');

function loadMergedKSnapshot(filename: string): MergedKVo[] {
  const raw = JSON.parse(
    readFileSync(join(FIXTURES_DIR, filename), 'utf8'),
  ) as Record<string, unknown>[];

  return raw.map((merge) => ({
    startTime: new Date(merge.startTime as string),
    endTime: new Date(merge.endTime as string),
    highest: Number(merge.highest),
    lowest: Number(merge.lowest),
    trend: merge.trend as TrendDirection,
    mergedCount: Number(merge.mergedCount),
    mergedIds: (merge.mergedIds as number[]).map(Number),
    mergedData: (merge.mergedData as Record<string, unknown>[]).map((k) => ({
      id: Number(k.id),
      symbol: String(k.symbol),
      time: new Date(k.time as string),
      amount: Number(k.amount),
      open: Number(k.open),
      close: Number(k.close),
      highest: Number(k.highest),
      lowest: Number(k.lowest),
    })),
  })) as MergedKVo[];
}

type IndexedRange = readonly [number, number];

function isValidCompleteBi(bi: BiVo): boolean {
  return (
    bi.type === BiType.Complete &&
    bi.status === BiStatus.Valid &&
    Boolean(bi.startFenxing && bi.endFenxing)
  );
}

function indexedRange(bi: BiVo): IndexedRange {
  if (!bi.startFenxing || !bi.endFenxing) {
    throw new Error('Expected a Complete Bi with both fenxings');
  }
  return [bi.startFenxing.middleIndex, bi.endFenxing.middleIndex];
}

function findValidCompleteOverlaps(bis: readonly BiVo[]) {
  const validBis = bis.filter(isValidCompleteBi);
  const overlaps: Array<{ outer: IndexedRange; inner: IndexedRange }> = [];

  for (let left = 0; left < validBis.length; left++) {
    for (let right = left + 1; right < validBis.length; right++) {
      const leftRange = indexedRange(validBis[left]);
      const rightRange = indexedRange(validBis[right]);
      if (leftRange[0] < rightRange[1] && rightRange[0] < leftRange[1]) {
        overlaps.push({ outer: leftRange, inner: rightRange });
      }
    }
  }
  return overlaps;
}

function hasIndexedBi(
  bis: readonly BiVo[],
  expected: {
    start: number;
    end: number;
    trend: TrendDirection;
    status: BiStatus;
  },
): boolean {
  return bis.some(
    (bi) =>
      bi.startFenxing?.middleIndex === expected.start &&
      bi.endFenxing?.middleIndex === expected.end &&
      bi.trend === expected.trend &&
      bi.status === expected.status,
  );
}

function expectContinuousLocalFixedPoint(
  service: BiService,
  bis: readonly BiVo[],
): void {
  const complete = bis.filter(
    (bi) => bi.type === BiType.Complete && bi.startFenxing && bi.endFenxing,
  );

  for (let index = 1; index < complete.length; index++) {
    expect(complete[index].startFenxing?.middleIndex).toBe(
      complete[index - 1].endFenxing?.middleIndex,
    );
  }

  for (let index = 0; index + 2 < complete.length; index++) {
    const triple = complete.slice(index, index + 3);
    if (triple.every((bi) => bi.status === BiStatus.Valid)) continue;
    expect(service['canMergeThreeBis'](triple[0], triple[1], triple[2])).toBe(
      false,
    );
  }
}

describe('BiService Phase A full real snapshots', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BiService],
    }).compile();
    service = module.get(BiService);
  });

  it('keeps the full CSI 300 Phase A stack non-overlapping', () => {
    const data = loadMergedKSnapshot('csi300-2024-2025-full.json');
    const { phaseA } = service.getBi(data);
    const overlaps = findValidCompleteOverlaps(phaseA);
    const keepsKnownWitness = overlaps.some(
      ({ outer, inner }) =>
        outer[0] === 206 &&
        outer[1] === 302 &&
        inner[0] === 222 &&
        inner[1] === 228,
    );

    expect({ overlaps, keepsKnownWitness }).toEqual({
      overlaps: [],
      keepsKnownWitness: false,
    });
    expectContinuousLocalFixedPoint(service, phaseA);
  });

  it('preserves the complete Shanghai index regression', () => {
    const data = loadMergedKSnapshot('shanghai-index-2024-2025-full.json');
    const { phaseA, phaseB } = service.getBi(data);

    expect(phaseA).toHaveLength(35);
    expect(phaseB).toHaveLength(25);
    expect(
      hasIndexedBi(phaseA, {
        start: 142,
        end: 146,
        trend: TrendDirection.Down,
        status: BiStatus.Invalid,
      }),
    ).toBe(true);
    expect(
      hasIndexedBi(phaseB, {
        start: 142,
        end: 195,
        trend: TrendDirection.Down,
        status: BiStatus.Valid,
      }),
    ).toBe(true);
    expect(
      hasIndexedBi(phaseB, {
        start: 266,
        end: 317,
        trend: TrendDirection.Up,
        status: BiStatus.Valid,
      }),
    ).toBe(true);
    expectContinuousLocalFixedPoint(service, phaseA);
  });
});
