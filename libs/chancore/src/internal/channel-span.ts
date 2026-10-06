import { ChannelLevel } from '../contracts';

/**
 * 中枢在单元序列（笔或段）中的有效跨度投影。
 * 供买卖点识别（三买/三卖回抽判定）与背驰检测（趋势链构造与盘整/趋势背驰）统一复用。
 */
export interface ChannelSpan {
  readonly zhongshuIndex: number;
  readonly firstIndex: number;
  readonly lastIndex: number;
  readonly zg: number;
  readonly zd: number;
  readonly gg: number;
  readonly dd: number;
  readonly level?: ChannelLevel;
  readonly difRetracedToZero?: boolean;
}

/** 按 startTime 精确匹配单元下标；找不到返回 -1。 */
export function indexOfUnitStart(
  units: readonly { readonly startTime: Date }[],
  target: Date,
): number {
  for (let i = 0; i < units.length; i++) {
    if (units[i].startTime.getTime() === target.getTime()) {
      return i;
    }
  }
  return -1;
}

/** 按 endTime 精确匹配单元下标；找不到返回 -1。 */
export function indexOfUnitEnd(
  units: readonly { readonly endTime: Date }[],
  target: Date,
): number {
  for (let i = 0; i < units.length; i++) {
    if (units[i].endTime.getTime() === target.getTime()) {
      return i;
    }
  }
  return -1;
}

/**
 * 中枢定位：首单元按 firstUnitTime(=首段/首笔startTime) 匹配；末单元按 lastUnitTime(=末段/末笔endTime) 匹配。
 * 找不到任一或区间倒置 → 跳过该中枢（不臆断）。
 */
export function locateSpans(
  units: readonly { readonly startTime: Date; readonly endTime: Date }[],
  zhongshus: readonly {
    readonly firstUnitTime: Date;
    readonly lastUnitTime: Date;
    readonly zg: number;
    readonly zd: number;
    readonly gg: number;
    readonly dd: number;
    readonly level?: ChannelLevel;
    readonly difRetracedToZero?: boolean;
    readonly absorbed?: boolean;
  }[],
): ChannelSpan[] {
  const spans: ChannelSpan[] = [];
  for (let z = 0; z < zhongshus.length; z++) {
    const zhongshu = zhongshus[z];
    if (zhongshu.absorbed) {
      continue; // 被大级别扩展中枢吸收的局部原初中枢，跳过定位（不发射买卖点与背驰）
    }
    const s = indexOfUnitStart(units, zhongshu.firstUnitTime);
    const e = indexOfUnitEnd(units, zhongshu.lastUnitTime);
    if (s === -1 || e === -1 || e < s) {
      continue; // 定位失败，跳过该中枢（不臆断）
    }
    spans.push({
      zhongshuIndex: z,
      firstIndex: s,
      lastIndex: e,
      zg: zhongshu.zg,
      zd: zhongshu.zd,
      gg: zhongshu.gg,
      dd: zhongshu.dd,
      level: zhongshu.level,
      difRetracedToZero: zhongshu.difRetracedToZero,
    });
  }
  return spans;
}
