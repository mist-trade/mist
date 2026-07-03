import { KVo } from '../../indicator/vo/k.vo';
import { MergedKVo } from '../vo/merged-k.vo';

export interface MergedKRangeStats {
  highest: number;
  lowest: number;
  originIds: number[];
  originData: KVo[];
  independentCount: number;
}

export const uniqueKById = (items: KVo[]): KVo[] => {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

export const collectMergedKRange = (
  data: MergedKVo[],
  startIndex: number,
  endIndex: number,
): MergedKRangeStats => {
  const originIds: number[] = [];
  const originData: KVo[] = [];
  let highest = -Infinity;
  let lowest = Infinity;
  let independentCount = 0;

  for (const mergedK of data.slice(startIndex, endIndex + 1)) {
    highest = Math.max(highest, mergedK.highest);
    lowest = Math.min(lowest, mergedK.lowest);
    originIds.push(...mergedK.mergedIds);
    originData.push(...mergedK.mergedData);
    independentCount += mergedK.mergedData.length;
  }

  return {
    highest,
    lowest,
    originIds: Array.from(new Set(originIds)),
    originData: uniqueKById(originData),
    independentCount,
  };
};
