/**
 * 缠论走势中枢离开与闭合测试用例集（Channel Departure & Closure Test Cases）
 *
 * 本文件作为中枢离开判定标准与闭合封存机制的专项测试集合，
 * 用于承载用户明确定义的典型走势形态、边界案例与规则重构验证。
 */
import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
  DuanType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type { ChanBi, ChanDuan } from '../contracts';
import { ChannelCalculator } from './channel';
import { DuanChannelCalculator } from './duan-channel';

/**
 * 构造标准 Mock 笔
 */
export function makeMockBi(
  trend: TrendDirection,
  low: number,
  high: number,
  startTime: string,
  endTime: string,
  idStart: number = 1,
  idEnd: number = 5,
  status: BiStatus = BiStatus.Valid,
): ChanBi {
  const isUp = trend === TrendDirection.Up;
  return {
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    low,
    high,
    trend,
    type: BiType.Complete,
    status,
    originIds: Array.from(
      { length: idEnd - idStart + 1 },
      (_, i) => idStart + i,
    ),
    originData: [],
    independentCount: idEnd - idStart + 1,
    startFenxing: {
      type: isUp ? FenxingType.Bottom : FenxingType.Top,
      high: isUp ? low : high,
      low: isUp ? low : high,
      leftIds: [idStart],
      middleIds: [idStart],
      rightIds: [idStart],
      middleIndex: idStart,
      middleOriginId: idStart,
    },
    endFenxing: {
      type: isUp ? FenxingType.Top : FenxingType.Bottom,
      high: isUp ? high : low,
      low: isUp ? high : low,
      leftIds: [idEnd],
      middleIds: [idEnd],
      rightIds: [idEnd],
      middleIndex: idEnd,
      middleOriginId: idEnd,
    },
  };
}

/**
 * 构造标准 Mock 段
 */
export function makeMockDuan(
  trend: TrendDirection,
  low: number,
  high: number,
  startTime: string,
  endTime: string,
  startBiIndex: number = 0,
  endBiIndex: number = 2,
  status: DuanStatus = DuanStatus.Valid,
): ChanDuan {
  const dummyBi = makeMockBi(trend, low, high, startTime, endTime);
  return {
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    low,
    high,
    trend,
    type: DuanType.Complete,
    status,
    startBi: dummyBi,
    endBi: dummyBi,
    originBis: [dummyBi],
    originIds: [startBiIndex, endBiIndex],
    independentCount: endBiIndex - startBiIndex + 1,
  };
}

/**
 * 真实 5M 行情 (000001) 2026-01-05 10:10 ~ 2026-01-13 14:50 完整笔序列
 * 完整覆盖第 1 个 5M 中枢及其左右宽幅边界（共 20 笔）
 */
export const REAL_5M_JAN2026_FIRST_CENTRAL_BIS: readonly ChanBi[] = [
  // 1. 01-05 10:10 ~ 14:25 | 3992.78 -> 4025.26 (Up)
  makeMockBi(
    TrendDirection.Up,
    3992.78,
    4025.26,
    '2026-01-05T02:10:00.000Z',
    '2026-01-05T06:25:00.000Z',
    7,
    40,
  ),
  // 2. 01-05 14:25 ~ 14:50 | 4025.26 -> 4019.83 (Down)
  makeMockBi(
    TrendDirection.Down,
    4019.83,
    4025.26,
    '2026-01-05T06:25:00.000Z',
    '2026-01-05T06:50:00.000Z',
    40,
    45,
  ),
  // 3. 01-05 14:50 ~ 01-06 13:05 | 4019.83 -> 4071.28 (Up)
  makeMockBi(
    TrendDirection.Up,
    4019.83,
    4071.28,
    '2026-01-05T06:50:00.000Z',
    '2026-01-06T05:05:00.000Z',
    45,
    72,
  ),
  // 4. 01-06 13:05 ~ 13:50 | 4071.28 -> 4056.87 (Down)
  makeMockBi(
    TrendDirection.Down,
    4056.87,
    4071.28,
    '2026-01-06T05:05:00.000Z',
    '2026-01-06T05:50:00.000Z',
    72,
    81,
  ),
  // 5. 01-06 13:50 ~ 01-07 09:55 | 4056.87 -> 4093.30 (Up) -> 【第1中枢 进入笔 b0】
  makeMockBi(
    TrendDirection.Up,
    4056.87,
    4093.3,
    '2026-01-06T05:50:00.000Z',
    '2026-01-07T01:55:00.000Z',
    81,
    100,
  ),
  // 6. 01-07 09:55 ~ 10:30 | 4093.30 -> 4075.70 (Down) -> 【构件笔 b1】
  makeMockBi(
    TrendDirection.Down,
    4075.7,
    4093.3,
    '2026-01-07T01:55:00.000Z',
    '2026-01-07T02:30:00.000Z',
    100,
    107,
  ),
  // 7. 01-07 10:30 ~ 11:30 | 4075.70 -> 4098.78 (Up) -> 【构件笔 b2】
  makeMockBi(
    TrendDirection.Up,
    4075.7,
    4098.78,
    '2026-01-07T02:30:00.000Z',
    '2026-01-07T03:30:00.000Z',
    107,
    119,
  ),
  // 8. 01-07 11:30 ~ 13:50 | 4098.78 -> 4069.44 (Down) -> 【构件笔 b3】（初始核心确立 ZD=4075.70, ZG=4088.01/4093.30）
  makeMockBi(
    TrendDirection.Down,
    4069.44,
    4098.78,
    '2026-01-07T03:30:00.000Z',
    '2026-01-07T05:50:00.000Z',
    119,
    129,
  ),
  // 9. 01-07 13:50 ~ 14:20 | 4069.44 -> 4088.01 (Up) -> 【震荡延伸 b4】
  makeMockBi(
    TrendDirection.Up,
    4069.44,
    4088.01,
    '2026-01-07T05:50:00.000Z',
    '2026-01-07T06:20:00.000Z',
    129,
    135,
  ),
  // 10. 01-07 14:20 ~ 01-08 09:35 | 4088.01 -> 4072.39 (Down) -> 【震荡延伸 b5】
  makeMockBi(
    TrendDirection.Down,
    4072.39,
    4088.01,
    '2026-01-07T06:20:00.000Z',
    '2026-01-08T01:35:00.000Z',
    135,
    144,
  ),
  // 11. 01-08 09:35 ~ 11:05 | 4072.39 -> 4093.87 (Up) -> 【震荡延伸 b6】
  makeMockBi(
    TrendDirection.Up,
    4072.39,
    4093.87,
    '2026-01-08T01:35:00.000Z',
    '2026-01-08T03:05:00.000Z',
    144,
    162,
  ),
  // 12. 01-08 11:05 ~ 14:20 | 4093.87 -> 4067.12 (Down) -> 【震荡延伸 b7】
  makeMockBi(
    TrendDirection.Down,
    4067.12,
    4093.87,
    '2026-01-08T03:05:00.000Z',
    '2026-01-08T06:20:00.000Z',
    162,
    183,
  ),
  // 13. 01-08 14:20 ~ 01-09 10:50 | 4067.12 -> 4121.70 (Up) -> 【顺势突破离开笔】（冲至 4121.70，突破 GG 4098.78）
  makeMockBi(
    TrendDirection.Up,
    4067.12,
    4121.7,
    '2026-01-08T06:20:00.000Z',
    '2026-01-09T02:50:00.000Z',
    183,
    207,
  ),
  // 14. 01-09 10:50 ~ 11:10 | 4121.70 -> 4093.01 (Down) -> 【离开后回踩笔】（低点 4093.01 > ZG 4088.01，形成 3买）
  makeMockBi(
    TrendDirection.Down,
    4093.01,
    4121.7,
    '2026-01-09T02:50:00.000Z',
    '2026-01-09T03:10:00.000Z',
    207,
    211,
  ),
  // 15. 01-09 11:10 ~ 01-13 10:10 | 4093.01 -> 4179.70 (Up) -> 【3买后顺势第1笔大涨】（冲至 4179.70，突破前高 4121.70）
  makeMockBi(
    TrendDirection.Up,
    4093.01,
    4179.7,
    '2026-01-09T03:10:00.000Z',
    '2026-01-13T02:10:00.000Z',
    211,
    295,
  ),
  // 16. 01-13 10:10 ~ 10:40 | 4179.70 -> 4151.90 (Down)
  makeMockBi(
    TrendDirection.Down,
    4151.9,
    4179.7,
    '2026-01-13T02:10:00.000Z',
    '2026-01-13T02:40:00.000Z',
    295,
    301,
  ),
  // 17. 01-13 10:40 ~ 11:20 | 4151.90 -> 4173.74 (Up)
  makeMockBi(
    TrendDirection.Up,
    4151.9,
    4173.74,
    '2026-01-13T02:40:00.000Z',
    '2026-01-13T03:20:00.000Z',
    301,
    309,
  ),
  // 18. 01-13 11:20 ~ 13:40 | 4173.74 -> 4140.97 (Down)
  makeMockBi(
    TrendDirection.Down,
    4140.97,
    4173.74,
    '2026-01-13T03:20:00.000Z',
    '2026-01-13T05:40:00.000Z',
    309,
    319,
  ),
  // 19. 01-13 13:40 ~ 14:00 | 4140.97 -> 4167.16 (Up)
  makeMockBi(
    TrendDirection.Up,
    4140.97,
    4167.16,
    '2026-01-13T05:40:00.000Z',
    '2026-01-13T06:00:00.000Z',
    319,
    323,
  ),
  // 20. 01-13 14:00 ~ 14:50 | 4167.16 -> 4126.23 (Down)
  makeMockBi(
    TrendDirection.Down,
    4126.23,
    4167.16,
    '2026-01-13T06:00:00.000Z',
    '2026-01-13T06:50:00.000Z',
    323,
    333,
  ),
  // 21. 01-13 14:50 ~ 01-14 11:25 | 4126.23 -> 4190.87 (Up)
  makeMockBi(
    TrendDirection.Up,
    4126.23,
    4190.87,
    '2026-01-13T06:50:00.000Z',
    '2026-01-14T03:25:00.000Z',
    333,
    358,
  ),
  // 22. 01-14 11:25 ~ 14:05 | 4190.87 -> 4103.62 (Down)
  makeMockBi(
    TrendDirection.Down,
    4103.62,
    4190.87,
    '2026-01-14T03:25:00.000Z',
    '2026-01-14T06:05:00.000Z',
    358,
    372,
  ),
  // 23. 01-14 14:05 ~ 14:35 | 4103.62 -> 4138.55 (Up)
  makeMockBi(
    TrendDirection.Up,
    4103.62,
    4138.55,
    '2026-01-14T06:05:00.000Z',
    '2026-01-14T06:35:00.000Z',
    372,
    378,
  ),
  // 24. 01-14 14:35 ~ 01-15 09:35 | 4138.55 -> 4104.42 (Down)
  makeMockBi(
    TrendDirection.Down,
    4104.42,
    4138.55,
    '2026-01-14T06:35:00.000Z',
    '2026-01-15T01:35:00.000Z',
    378,
    384,
  ),
  // 25. 01-15 09:35 ~ 10:00 | 4104.42 -> 4133.07 (Up)
  makeMockBi(
    TrendDirection.Up,
    4104.42,
    4133.07,
    '2026-01-15T01:35:00.000Z',
    '2026-01-15T02:00:00.000Z',
    384,
    389,
  ),
  // 26. 01-15 10:00 ~ 13:05 | 4133.07 -> 4096.85 (Down)
  makeMockBi(
    TrendDirection.Down,
    4096.85,
    4133.07,
    '2026-01-15T02:00:00.000Z',
    '2026-01-15T05:05:00.000Z',
    389,
    408,
  ),
  // 27. 01-15 13:05 ~ 13:50 | 4096.85 -> 4116.70 (Up)
  makeMockBi(
    TrendDirection.Up,
    4096.85,
    4116.7,
    '2026-01-15T05:05:00.000Z',
    '2026-01-15T05:50:00.000Z',
    408,
    417,
  ),
  // 28. 01-15 13:50 ~ 14:15 | 4116.70 -> 4098.20 (Down)
  makeMockBi(
    TrendDirection.Down,
    4098.2,
    4116.7,
    '2026-01-15T05:50:00.000Z',
    '2026-01-15T06:15:00.000Z',
    417,
    422,
  ),
  // 29. 01-15 14:15 ~ 01-16 09:40 | 4098.20 -> 4140.23 (Up)
  makeMockBi(
    TrendDirection.Up,
    4098.2,
    4140.23,
    '2026-01-15T06:15:00.000Z',
    '2026-01-16T01:40:00.000Z',
    422,
    433,
  ),
  // 30. 01-16 09:40 ~ 10:15 | 4140.23 -> 4100.65 (Down)
  makeMockBi(
    TrendDirection.Down,
    4100.65,
    4140.23,
    '2026-01-16T01:40:00.000Z',
    '2026-01-16T02:15:00.000Z',
    433,
    440,
  ),
  // 31. 01-16 10:15 ~ 11:05 | 4100.65 -> 4120.40 (Up)
  makeMockBi(
    TrendDirection.Up,
    4100.65,
    4120.4,
    '2026-01-16T02:15:00.000Z',
    '2026-01-16T03:05:00.000Z',
    440,
    450,
  ),
  // 32. 01-16 11:05 ~ 13:10 | 4120.40 -> 4094.27 (Down)
  makeMockBi(
    TrendDirection.Down,
    4094.27,
    4120.4,
    '2026-01-16T03:05:00.000Z',
    '2026-01-16T05:10:00.000Z',
    450,
    457,
  ),
  // 33. 01-16 13:10 ~ 13:50 | 4094.27 -> 4119.23 (Up)
  makeMockBi(
    TrendDirection.Up,
    4094.27,
    4119.23,
    '2026-01-16T05:10:00.000Z',
    '2026-01-16T05:50:00.000Z',
    457,
    465,
  ),
  // 34. 01-16 13:50 ~ 14:10 | 4119.23 -> 4091.81 (Down)
  makeMockBi(
    TrendDirection.Down,
    4091.81,
    4119.23,
    '2026-01-16T05:50:00.000Z',
    '2026-01-16T06:10:00.000Z',
    465,
    469,
  ),
  // 35. 01-16 14:10 ~ 14:40 | 4091.81 -> 4108.71 (Up)
  makeMockBi(
    TrendDirection.Up,
    4091.81,
    4108.71,
    '2026-01-16T06:10:00.000Z',
    '2026-01-16T06:40:00.000Z',
    469,
    475,
  ),
  // 36. 01-16 14:40 ~ 01-19 09:35 | 4108.71 -> 4090.06 (Down)
  makeMockBi(
    TrendDirection.Down,
    4090.06,
    4108.71,
    '2026-01-16T06:40:00.000Z',
    '2026-01-19T01:35:00.000Z',
    475,
    480,
  ),
  // 37. 01-19 09:35 ~ 10:15 | 4090.06 -> 4126.52 (Up)
  makeMockBi(
    TrendDirection.Up,
    4090.06,
    4126.52,
    '2026-01-19T01:35:00.000Z',
    '2026-01-19T02:15:00.000Z',
    480,
    488,
  ),
  // 38. 01-19 10:15 ~ 10:45 | 4126.52 -> 4099.23 (Down)
  makeMockBi(
    TrendDirection.Down,
    4099.23,
    4126.52,
    '2026-01-19T02:15:00.000Z',
    '2026-01-19T02:45:00.000Z',
    488,
    494,
  ),
  // 39. 01-19 10:45 ~ 13:25 | 4099.23 -> 4123.41 (Up)
  makeMockBi(
    TrendDirection.Up,
    4099.23,
    4123.41,
    '2026-01-19T02:45:00.000Z',
    '2026-01-19T05:25:00.000Z',
    494,
    508,
  ),
  // 40. 01-19 13:25 ~ 13:55 | 4123.41 -> 4100.12 (Down)
  makeMockBi(
    TrendDirection.Down,
    4100.12,
    4123.41,
    '2026-01-19T05:25:00.000Z',
    '2026-01-19T05:55:00.000Z',
    508,
    514,
  ),
  // 41. 01-19 13:55 ~ 01-20 09:40 | 4100.12 -> 4128.93 (Up)
  makeMockBi(
    TrendDirection.Up,
    4100.12,
    4128.93,
    '2026-01-19T05:55:00.000Z',
    '2026-01-20T01:40:00.000Z',
    514,
    523,
  ),
  // 42. 01-20 09:40 ~ 10:30 | 4128.93 -> 4080.29 (Down)
  makeMockBi(
    TrendDirection.Down,
    4080.29,
    4128.93,
    '2026-01-20T01:40:00.000Z',
    '2026-01-20T02:30:00.000Z',
    523,
    533,
  ),
  // 43. 01-20 10:30 ~ 13:55 | 4080.29 -> 4117.96 (Up)
  makeMockBi(
    TrendDirection.Up,
    4080.29,
    4117.96,
    '2026-01-20T02:30:00.000Z',
    '2026-01-20T05:55:00.000Z',
    533,
    550,
  ),
  // 44. 01-20 13:55 ~ 14:35 | 4100.36 -> 4117.96 (Down)
  makeMockBi(
    TrendDirection.Down,
    4100.36,
    4117.96,
    '2026-01-20T05:55:00.000Z',
    '2026-01-20T06:35:00.000Z',
    550,
    558,
  ),
  // 45. 01-20 14:35 ~ 01-21 10:45 | 4100.36 -> 4135.96 (Up) -> 【大中枢 进入笔 b0】
  makeMockBi(
    TrendDirection.Up,
    4100.36,
    4135.96,
    '2026-01-20T06:35:00.000Z',
    '2026-01-21T02:45:00.000Z',
    558,
    579,
  ),
  // 46. 01-21 10:45 ~ 11:30 | 4118.82 -> 4135.96 (Down) -> 【构件笔 b1】
  makeMockBi(
    TrendDirection.Down,
    4118.82,
    4135.96,
    '2026-01-21T02:45:00.000Z',
    '2026-01-21T03:30:00.000Z',
    579,
    588,
  ),
  // 47. 01-21 11:30 ~ 14:05 | 4118.82 -> 4134.71 (Up) -> 【构件笔 b2】
  makeMockBi(
    TrendDirection.Up,
    4118.82,
    4134.71,
    '2026-01-21T03:30:00.000Z',
    '2026-01-21T06:05:00.000Z',
    588,
    601,
  ),
  // 48. 01-21 14:05 ~ 14:55 | 4110.45 -> 4134.71 (Down) -> 【构件笔 b3】
  makeMockBi(
    TrendDirection.Down,
    4110.45,
    4134.71,
    '2026-01-21T06:05:00.000Z',
    '2026-01-21T06:55:00.000Z',
    601,
    612,
  ),
  // 49. 01-21 14:55 ~ 01-22 10:15 | 4110.45 -> 4140.84 (Up) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Up,
    4110.45,
    4140.84,
    '2026-01-21T06:55:00.000Z',
    '2026-01-22T02:15:00.000Z',
    612,
    622,
  ),
  // 50. 01-22 10:15 ~ 10:35 | 4112.86 -> 4140.84 (Down) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Down,
    4112.86,
    4140.84,
    '2026-01-22T02:15:00.000Z',
    '2026-01-22T02:35:00.000Z',
    622,
    627,
  ),
  // 51. 01-22 10:35 ~ 11:15 | 4112.86 -> 4127.82 (Up) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Up,
    4112.86,
    4127.82,
    '2026-01-22T02:35:00.000Z',
    '2026-01-22T03:15:00.000Z',
    627,
    635,
  ),
  // 52. 01-22 11:15 ~ 13:05 | 4109.92 -> 4127.82 (Down) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Down,
    4109.92,
    4127.82,
    '2026-01-22T03:15:00.000Z',
    '2026-01-22T05:05:00.000Z',
    635,
    643,
  ),
  // 53. 01-22 13:05 ~ 01-23 10:15 | 4109.92 -> 4139.95 (Up) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Up,
    4109.92,
    4139.95,
    '2026-01-22T05:05:00.000Z',
    '2026-01-23T02:15:00.000Z',
    643,
    675,
  ),
  // 54. 01-23 10:15 ~ 10:35 | 4120.20 -> 4139.95 (Down) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Down,
    4120.2,
    4139.95,
    '2026-01-23T02:15:00.000Z',
    '2026-01-23T02:35:00.000Z',
    675,
    679,
  ),
  // 55. 01-23 10:35 ~ 14:10 | 4120.20 -> 4143.75 (Up) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Up,
    4120.2,
    4143.75,
    '2026-01-23T02:35:00.000Z',
    '2026-01-23T06:10:00.000Z',
    679,
    704,
  ),
  // 56. 01-23 14:10 ~ 14:40 | 4120.63 -> 4143.75 (Down) -> 【震荡延伸】
  makeMockBi(
    TrendDirection.Down,
    4120.63,
    4143.75,
    '2026-01-23T06:10:00.000Z',
    '2026-01-23T06:40:00.000Z',
    704,
    710,
  ),
  // 57. 01-23 14:40 ~ 01-26 10:40 | 4120.63 -> 4160.99 (Up) -> 【顺势离开笔】（终点 01-26 10:40，破 4143.75 创 4160.99）
  makeMockBi(
    TrendDirection.Up,
    4120.63,
    4160.99,
    '2026-01-23T06:40:00.000Z',
    '2026-01-26T02:40:00.000Z',
    710,
    728,
  ),
  // 58. 01-26 10:40 ~ 11:05 | 4124.70 -> 4160.99 (Down)
  makeMockBi(
    TrendDirection.Down,
    4124.7,
    4160.99,
    '2026-01-26T02:40:00.000Z',
    '2026-01-26T03:05:00.000Z',
    728,
    733,
  ),
  // 59. 01-26 11:05 ~ 14:35 | 4124.70 -> 4145.97 (Up) -> 【次高点反弹笔（2卖）】
  makeMockBi(
    TrendDirection.Up,
    4124.7,
    4145.97,
    '2026-01-26T03:05:00.000Z',
    '2026-01-26T06:35:00.000Z',
    733,
    757,
  ),
  // 60. 01-26 14:35 ~ 01-27 10:05 | 4101.83 -> 4145.97 (Down) -> 【3买转2卖确认下杀笔】
  makeMockBi(
    TrendDirection.Down,
    4101.83,
    4145.97,
    '2026-01-26T06:35:00.000Z',
    '2026-01-27T02:05:00.000Z',
    757,
    786,
  ),
];

/**
 * 真实 5M 行情 (000001) 2026-04-01 09:40 ~ 2026-04-09 14:45 完整笔序列
 * 完整覆盖 4月3日 极值低点（DD 3871.30）与 4月2日~4月7日 五笔下跌中枢（含 3买转2买 离开笔）
 */
export const REAL_5M_APR2026_CENTRAL_BIS: readonly ChanBi[] = [
  // 0. 04-01 09:40 ~ 13:35 | 3929.92 -> 3955.94 (Up)
  makeMockBi(
    TrendDirection.Up,
    3929.92,
    3955.94,
    '2026-04-01T01:40:00.000Z',
    '2026-04-01T05:35:00.000Z',
    1,
    30,
  ),
  // 1. 04-01 13:35 ~ 04-02 14:05 | 3955.94 -> 3900.12 (Down) -> 中枢进入笔 (Bi #1)
  makeMockBi(
    TrendDirection.Down,
    3900.12,
    3955.94,
    '2026-04-01T05:35:00.000Z',
    '2026-04-02T06:05:00.000Z',
    30,
    84,
  ),
  // 2. 04-02 14:05 ~ 04-03 09:35 | 3900.12 -> 3929.53 (Up) -> 核心构件笔 1 (Bi #2)
  makeMockBi(
    TrendDirection.Up,
    3900.12,
    3929.53,
    '2026-04-02T06:05:00.000Z',
    '2026-04-03T01:35:00.000Z',
    84,
    96,
  ),
  // 3. 04-03 09:35 ~ 04-03 13:25 | 3929.53 -> 3871.30 (Down) -> 核心构件笔 2 (Bi #3，4月3日打出 DD 3871.30)
  makeMockBi(
    TrendDirection.Down,
    3871.3,
    3929.53,
    '2026-04-03T01:35:00.000Z',
    '2026-04-03T05:25:00.000Z',
    96,
    124,
  ),
  // 4. 04-03 13:25 ~ 04-07 09:55 | 3871.30 -> 3902.61 (Up) -> 核心构件笔 3 (Bi #4，反弹定出 ZG 3902.61)
  makeMockBi(
    TrendDirection.Up,
    3871.3,
    3902.61,
    '2026-04-03T05:25:00.000Z',
    '2026-04-07T01:55:00.000Z',
    124,
    148,
  ),
  // 5. 04-07 09:55 ~ 04-07 13:20 | 3902.61 -> 3876.98 (Down) -> 顺势离开笔 (Bi #5，3买转2买成立离开笔)
  makeMockBi(
    TrendDirection.Down,
    3876.98,
    3902.61,
    '2026-04-07T01:55:00.000Z',
    '2026-04-07T05:20:00.000Z',
    148,
    171,
  ),
  // 6. 04-07 13:20 ~ 04-07 14:05 | 3876.98 -> 3890.43 (Up)
  makeMockBi(
    TrendDirection.Up,
    3876.98,
    3890.43,
    '2026-04-07T05:20:00.000Z',
    '2026-04-07T06:05:00.000Z',
    171,
    180,
  ),
  // 7. 04-07 14:05 ~ 04-07 14:40 | 3890.43 -> 3882.53 (Down)
  makeMockBi(
    TrendDirection.Down,
    3882.53,
    3890.43,
    '2026-04-07T06:05:00.000Z',
    '2026-04-07T06:40:00.000Z',
    180,
    187,
  ),
  // 8. 04-07 14:40 ~ 04-08 15:00 | 3882.53 -> 3995.00 (Up)
  makeMockBi(
    TrendDirection.Up,
    3882.53,
    3995,
    '2026-04-07T06:40:00.000Z',
    '2026-04-08T07:00:00.000Z',
    187,
    239,
  ),
  // 9. 04-08 15:00 ~ 04-09 09:50 | 3995.00 -> 3961.77 (Down)
  makeMockBi(
    TrendDirection.Down,
    3961.77,
    3995,
    '2026-04-08T07:00:00.000Z',
    '2026-04-09T01:50:00.000Z',
    239,
    243,
  ),
  // 10. 04-09 09:50 ~ 04-09 10:25 | 3961.77 -> 3979.13 (Up)
  makeMockBi(
    TrendDirection.Up,
    3961.77,
    3979.13,
    '2026-04-09T01:50:00.000Z',
    '2026-04-09T02:25:00.000Z',
    243,
    250,
  ),
  // 11. 04-09 10:25 ~ 04-09 13:25 | 3979.13 -> 3955.25 (Down)
  makeMockBi(
    TrendDirection.Down,
    3955.25,
    3979.13,
    '2026-04-09T02:25:00.000Z',
    '2026-04-09T05:25:00.000Z',
    250,
    268,
  ),
  // 12. 04-09 13:25 ~ 04-09 14:10 | 3955.25 -> 3970.15 (Up)
  makeMockBi(
    TrendDirection.Up,
    3955.25,
    3970.15,
    '2026-04-09T05:25:00.000Z',
    '2026-04-09T06:10:00.000Z',
    268,
    277,
  ),
  // 13. 04-09 14:10 ~ 04-09 14:45 | 3970.15 -> 3962.33 (Down)
  makeMockBi(
    TrendDirection.Down,
    3962.33,
    3970.15,
    '2026-04-09T06:10:00.000Z',
    '2026-04-09T06:45:00.000Z',
    277,
    284,
  ),
];

describe('中枢离开笔判定与闭合封存专项测试用例集 (Channel Departure & Closure Cases)', () => {
  const biCalc = new ChannelCalculator();
  const duanCalc = new DuanChannelCalculator();

  it('环境基准脚手架就绪：计算器与构件工厂可用', () => {
    expect(biCalc).toBeDefined();
    expect(duanCalc).toBeDefined();

    const sampleBi = makeMockBi(
      TrendDirection.Up,
      10,
      20,
      '2026-01-01T09:30:00Z',
      '2026-01-01T09:35:00Z',
    );
    expect(sampleBi.trend).toBe(TrendDirection.Up);

    const sampleDuan = makeMockDuan(
      TrendDirection.Down,
      20,
      10,
      '2026-01-01T09:30:00Z',
      '2026-01-01T10:30:00Z',
    );
    expect(sampleDuan.trend).toBe(TrendDirection.Down);

    expect(ChannelLevel.Bi).toBe('bi');
    expect(ChannelStatus.Valid).toBe(1);
    expect(ChannelType.Complete).toBe('complete');
  });

  interface ExpectedBiContract {
    readonly centralBiIndex: number;
    readonly globalBiIndex: number;
    readonly trend: TrendDirection;
    readonly low: number;
    readonly high: number;
    readonly startTime: string;
    readonly endTime: string;
  }

  interface ExpectedCentralContract {
    readonly index: number;
    readonly trend: TrendDirection;
    readonly count: number;
    readonly zg: number;
    readonly zd: number;
    readonly gg: number;
    readonly dd: number;
    readonly expanded: boolean;
    readonly type: ChannelType;
    readonly bis: readonly ExpectedBiContract[];
  }

  /**
   * 5分钟级别前5个中枢端到端全量数据契约：每一笔均由实盘走势严格固化，错一笔即熔断
   */
  const EXPECTED_5M_FIRST_5_CENTRALS: readonly ExpectedCentralContract[] = [
    // ==========================================
    // 中枢 #0：9笔上涨中枢 (2026-01-06 13:50 ~ 2026-01-09 10:50)
    // ==========================================
    {
      index: 0,
      trend: TrendDirection.Up,
      count: 9,
      zg: 4088.01,
      zd: 4075.7,
      gg: 4121.7,
      dd: 4056.87,
      expanded: true,
      type: ChannelType.Complete,
      bis: [
        {
          centralBiIndex: 0,
          globalBiIndex: 4,
          trend: TrendDirection.Up,
          low: 4056.87,
          high: 4093.3,
          startTime: '2026-01-06T05:50:00.000Z',
          endTime: '2026-01-07T01:55:00.000Z',
        },
        {
          centralBiIndex: 1,
          globalBiIndex: 5,
          trend: TrendDirection.Down,
          low: 4075.7,
          high: 4093.3,
          startTime: '2026-01-07T01:55:00.000Z',
          endTime: '2026-01-07T02:30:00.000Z',
        },
        {
          centralBiIndex: 2,
          globalBiIndex: 6,
          trend: TrendDirection.Up,
          low: 4075.7,
          high: 4098.78,
          startTime: '2026-01-07T02:30:00.000Z',
          endTime: '2026-01-07T03:30:00.000Z',
        },
        {
          centralBiIndex: 3,
          globalBiIndex: 7,
          trend: TrendDirection.Down,
          low: 4069.44,
          high: 4098.78,
          startTime: '2026-01-07T03:30:00.000Z',
          endTime: '2026-01-07T05:50:00.000Z',
        },
        {
          centralBiIndex: 4,
          globalBiIndex: 8,
          trend: TrendDirection.Up,
          low: 4069.44,
          high: 4088.01,
          startTime: '2026-01-07T05:50:00.000Z',
          endTime: '2026-01-07T06:20:00.000Z',
        },
        {
          centralBiIndex: 5,
          globalBiIndex: 9,
          trend: TrendDirection.Down,
          low: 4072.39,
          high: 4088.01,
          startTime: '2026-01-07T06:20:00.000Z',
          endTime: '2026-01-08T01:35:00.000Z',
        },
        {
          centralBiIndex: 6,
          globalBiIndex: 10,
          trend: TrendDirection.Up,
          low: 4072.39,
          high: 4093.87,
          startTime: '2026-01-08T01:35:00.000Z',
          endTime: '2026-01-08T03:05:00.000Z',
        },
        {
          centralBiIndex: 7,
          globalBiIndex: 11,
          trend: TrendDirection.Down,
          low: 4067.12,
          high: 4093.87,
          startTime: '2026-01-08T03:05:00.000Z',
          endTime: '2026-01-08T06:20:00.000Z',
        },
        {
          centralBiIndex: 8,
          globalBiIndex: 12,
          trend: TrendDirection.Up,
          low: 4067.12,
          high: 4121.7,
          startTime: '2026-01-08T06:20:00.000Z',
          endTime: '2026-01-09T02:50:00.000Z',
        },
      ],
    },
    // ==========================================
    // 中枢 #1：7笔上涨中枢 (2026-01-09 11:10 ~ 2026-01-14 11:25)
    // ==========================================
    {
      index: 1,
      trend: TrendDirection.Up,
      count: 7,
      zg: 4167.16,
      zd: 4151.9,
      gg: 4190.87,
      dd: 4093.01,
      expanded: false,
      type: ChannelType.Complete,
      bis: [
        {
          centralBiIndex: 0,
          globalBiIndex: 14,
          trend: TrendDirection.Up,
          low: 4093.01,
          high: 4179.7,
          startTime: '2026-01-09T03:10:00.000Z',
          endTime: '2026-01-13T02:10:00.000Z',
        },
        {
          centralBiIndex: 1,
          globalBiIndex: 15,
          trend: TrendDirection.Down,
          low: 4151.9,
          high: 4179.7,
          startTime: '2026-01-13T02:10:00.000Z',
          endTime: '2026-01-13T02:40:00.000Z',
        },
        {
          centralBiIndex: 2,
          globalBiIndex: 16,
          trend: TrendDirection.Up,
          low: 4151.9,
          high: 4173.74,
          startTime: '2026-01-13T02:40:00.000Z',
          endTime: '2026-01-13T03:20:00.000Z',
        },
        {
          centralBiIndex: 3,
          globalBiIndex: 17,
          trend: TrendDirection.Down,
          low: 4140.97,
          high: 4173.74,
          startTime: '2026-01-13T03:20:00.000Z',
          endTime: '2026-01-13T05:40:00.000Z',
        },
        {
          centralBiIndex: 4,
          globalBiIndex: 18,
          trend: TrendDirection.Up,
          low: 4140.97,
          high: 4167.16,
          startTime: '2026-01-13T05:40:00.000Z',
          endTime: '2026-01-13T06:00:00.000Z',
        },
        {
          centralBiIndex: 5,
          globalBiIndex: 19,
          trend: TrendDirection.Down,
          low: 4126.23,
          high: 4167.16,
          startTime: '2026-01-13T06:00:00.000Z',
          endTime: '2026-01-13T06:50:00.000Z',
        },
        {
          centralBiIndex: 6,
          globalBiIndex: 20,
          trend: TrendDirection.Up,
          low: 4126.23,
          high: 4190.87,
          startTime: '2026-01-13T06:50:00.000Z',
          endTime: '2026-01-14T03:25:00.000Z',
        },
      ],
    },
    // ==========================================
    // 中枢 #2：5笔下跌中枢 (2026-01-14 11:25 ~ 2026-01-15 13:05)
    // ==========================================
    {
      index: 2,
      trend: TrendDirection.Down,
      count: 5,
      zg: 4133.07,
      zd: 4104.42,
      gg: 4190.87,
      dd: 4096.85,
      expanded: false,
      type: ChannelType.Complete,
      bis: [
        {
          centralBiIndex: 0,
          globalBiIndex: 21,
          trend: TrendDirection.Down,
          low: 4103.62,
          high: 4190.87,
          startTime: '2026-01-14T03:25:00.000Z',
          endTime: '2026-01-14T06:05:00.000Z',
        },
        {
          centralBiIndex: 1,
          globalBiIndex: 22,
          trend: TrendDirection.Up,
          low: 4103.62,
          high: 4138.55,
          startTime: '2026-01-14T06:05:00.000Z',
          endTime: '2026-01-14T06:35:00.000Z',
        },
        {
          centralBiIndex: 2,
          globalBiIndex: 23,
          trend: TrendDirection.Down,
          low: 4104.42,
          high: 4138.55,
          startTime: '2026-01-14T06:35:00.000Z',
          endTime: '2026-01-15T01:35:00.000Z',
        },
        {
          centralBiIndex: 3,
          globalBiIndex: 24,
          trend: TrendDirection.Up,
          low: 4104.42,
          high: 4133.07,
          startTime: '2026-01-15T01:35:00.000Z',
          endTime: '2026-01-15T02:00:00.000Z',
        },
        {
          centralBiIndex: 4,
          globalBiIndex: 25,
          trend: TrendDirection.Down,
          low: 4096.85,
          high: 4133.07,
          startTime: '2026-01-15T02:00:00.000Z',
          endTime: '2026-01-15T05:05:00.000Z',
        },
      ],
    },
    // ==========================================
    // 中枢 #3：13笔下跌中枢 (2026-01-16 09:40 ~ 2026-01-20 10:30)
    // ==========================================
    {
      index: 3,
      trend: TrendDirection.Down,
      count: 13,
      zg: 4108.71,
      zd: 4100.65,
      gg: 4140.23,
      dd: 4080.29,
      expanded: true,
      type: ChannelType.Complete,
      bis: [
        {
          centralBiIndex: 0,
          globalBiIndex: 29,
          trend: TrendDirection.Down,
          low: 4100.65,
          high: 4140.23,
          startTime: '2026-01-16T01:40:00.000Z',
          endTime: '2026-01-16T02:15:00.000Z',
        },
        {
          centralBiIndex: 1,
          globalBiIndex: 30,
          trend: TrendDirection.Up,
          low: 4100.65,
          high: 4120.4,
          startTime: '2026-01-16T02:15:00.000Z',
          endTime: '2026-01-16T03:05:00.000Z',
        },
        {
          centralBiIndex: 2,
          globalBiIndex: 31,
          trend: TrendDirection.Down,
          low: 4094.27,
          high: 4120.4,
          startTime: '2026-01-16T03:05:00.000Z',
          endTime: '2026-01-16T05:10:00.000Z',
        },
        {
          centralBiIndex: 3,
          globalBiIndex: 32,
          trend: TrendDirection.Up,
          low: 4094.27,
          high: 4119.23,
          startTime: '2026-01-16T05:10:00.000Z',
          endTime: '2026-01-16T05:50:00.000Z',
        },
        {
          centralBiIndex: 4,
          globalBiIndex: 33,
          trend: TrendDirection.Down,
          low: 4091.81,
          high: 4119.23,
          startTime: '2026-01-16T05:50:00.000Z',
          endTime: '2026-01-16T06:10:00.000Z',
        },
        {
          centralBiIndex: 5,
          globalBiIndex: 34,
          trend: TrendDirection.Up,
          low: 4091.81,
          high: 4108.71,
          startTime: '2026-01-16T06:10:00.000Z',
          endTime: '2026-01-16T06:40:00.000Z',
        },
        {
          centralBiIndex: 6,
          globalBiIndex: 35,
          trend: TrendDirection.Down,
          low: 4090.06,
          high: 4108.71,
          startTime: '2026-01-16T06:40:00.000Z',
          endTime: '2026-01-19T01:35:00.000Z',
        },
        {
          centralBiIndex: 7,
          globalBiIndex: 36,
          trend: TrendDirection.Up,
          low: 4090.06,
          high: 4126.52,
          startTime: '2026-01-19T01:35:00.000Z',
          endTime: '2026-01-19T02:15:00.000Z',
        },
        {
          centralBiIndex: 8,
          globalBiIndex: 37,
          trend: TrendDirection.Down,
          low: 4099.23,
          high: 4126.52,
          startTime: '2026-01-19T02:15:00.000Z',
          endTime: '2026-01-19T02:45:00.000Z',
        },
        {
          centralBiIndex: 9,
          globalBiIndex: 38,
          trend: TrendDirection.Up,
          low: 4099.23,
          high: 4123.41,
          startTime: '2026-01-19T02:45:00.000Z',
          endTime: '2026-01-19T05:25:00.000Z',
        },
        {
          centralBiIndex: 10,
          globalBiIndex: 39,
          trend: TrendDirection.Down,
          low: 4100.12,
          high: 4123.41,
          startTime: '2026-01-19T05:25:00.000Z',
          endTime: '2026-01-19T05:55:00.000Z',
        },
        {
          centralBiIndex: 11,
          globalBiIndex: 40,
          trend: TrendDirection.Up,
          low: 4100.12,
          high: 4128.93,
          startTime: '2026-01-19T05:55:00.000Z',
          endTime: '2026-01-20T01:40:00.000Z',
        },
        {
          centralBiIndex: 12,
          globalBiIndex: 41,
          trend: TrendDirection.Down,
          low: 4080.29,
          high: 4128.93,
          startTime: '2026-01-20T01:40:00.000Z',
          endTime: '2026-01-20T02:30:00.000Z',
        },
      ],
    },
    // ==========================================
    // 中枢 #4：13笔上涨中枢 (2026-01-20 14:35 ~ 2026-01-26 10:40)
    // ==========================================
    {
      index: 4,
      trend: TrendDirection.Up,
      count: 13,
      zg: 4127.82,
      zd: 4120.63,
      gg: 4160.99,
      dd: 4100.36,
      expanded: true,
      type: ChannelType.Complete,
      bis: [
        {
          centralBiIndex: 0,
          globalBiIndex: 44,
          trend: TrendDirection.Up,
          low: 4100.36,
          high: 4135.96,
          startTime: '2026-01-20T06:35:00.000Z',
          endTime: '2026-01-21T02:45:00.000Z',
        },
        {
          centralBiIndex: 1,
          globalBiIndex: 45,
          trend: TrendDirection.Down,
          low: 4118.82,
          high: 4135.96,
          startTime: '2026-01-21T02:45:00.000Z',
          endTime: '2026-01-21T03:30:00.000Z',
        },
        {
          centralBiIndex: 2,
          globalBiIndex: 46,
          trend: TrendDirection.Up,
          low: 4118.82,
          high: 4134.71,
          startTime: '2026-01-21T03:30:00.000Z',
          endTime: '2026-01-21T06:05:00.000Z',
        },
        {
          centralBiIndex: 3,
          globalBiIndex: 47,
          trend: TrendDirection.Down,
          low: 4110.45,
          high: 4134.71,
          startTime: '2026-01-21T06:05:00.000Z',
          endTime: '2026-01-21T06:55:00.000Z',
        },
        {
          centralBiIndex: 4,
          globalBiIndex: 48,
          trend: TrendDirection.Up,
          low: 4110.45,
          high: 4140.84,
          startTime: '2026-01-21T06:55:00.000Z',
          endTime: '2026-01-22T02:15:00.000Z',
        },
        {
          centralBiIndex: 5,
          globalBiIndex: 49,
          trend: TrendDirection.Down,
          low: 4112.86,
          high: 4140.84,
          startTime: '2026-01-22T02:15:00.000Z',
          endTime: '2026-01-22T02:35:00.000Z',
        },
        {
          centralBiIndex: 6,
          globalBiIndex: 50,
          trend: TrendDirection.Up,
          low: 4112.86,
          high: 4127.82,
          startTime: '2026-01-22T02:35:00.000Z',
          endTime: '2026-01-22T03:15:00.000Z',
        },
        {
          centralBiIndex: 7,
          globalBiIndex: 51,
          trend: TrendDirection.Down,
          low: 4109.92,
          high: 4127.82,
          startTime: '2026-01-22T03:15:00.000Z',
          endTime: '2026-01-22T05:05:00.000Z',
        },
        {
          centralBiIndex: 8,
          globalBiIndex: 52,
          trend: TrendDirection.Up,
          low: 4109.92,
          high: 4139.95,
          startTime: '2026-01-22T05:05:00.000Z',
          endTime: '2026-01-23T02:15:00.000Z',
        },
        {
          centralBiIndex: 9,
          globalBiIndex: 53,
          trend: TrendDirection.Down,
          low: 4120.2,
          high: 4139.95,
          startTime: '2026-01-23T02:15:00.000Z',
          endTime: '2026-01-23T02:35:00.000Z',
        },
        {
          centralBiIndex: 10,
          globalBiIndex: 54,
          trend: TrendDirection.Up,
          low: 4120.2,
          high: 4143.75,
          startTime: '2026-01-23T02:35:00.000Z',
          endTime: '2026-01-23T06:10:00.000Z',
        },
        {
          centralBiIndex: 11,
          globalBiIndex: 55,
          trend: TrendDirection.Down,
          low: 4120.63,
          high: 4143.75,
          startTime: '2026-01-23T06:10:00.000Z',
          endTime: '2026-01-23T06:40:00.000Z',
        },
        {
          centralBiIndex: 12,
          globalBiIndex: 56,
          trend: TrendDirection.Up,
          low: 4120.63,
          high: 4160.99,
          startTime: '2026-01-23T06:40:00.000Z',
          endTime: '2026-01-26T02:40:00.000Z',
        },
      ],
    },
  ];

  it('验证真实 5M 2026年1月5日~1月27日全量笔序列基准数据完整性', () => {
    expect(REAL_5M_JAN2026_FIRST_CENTRAL_BIS).toHaveLength(60);
    // 验证严格趋势交替
    for (let i = 0; i < REAL_5M_JAN2026_FIRST_CENTRAL_BIS.length - 1; i++) {
      expect(REAL_5M_JAN2026_FIRST_CENTRAL_BIS[i].trend).not.toBe(
        REAL_5M_JAN2026_FIRST_CENTRAL_BIS[i + 1].trend,
      );
    }
  });

  it('验证真实 5M 2026年4月1日~4月9日全量笔序列基准数据完整性', () => {
    expect(REAL_5M_APR2026_CENTRAL_BIS).toHaveLength(14);
    // 验证严格趋势交替
    for (let i = 0; i < REAL_5M_APR2026_CENTRAL_BIS.length - 1; i++) {
      expect(REAL_5M_APR2026_CENTRAL_BIS[i].trend).not.toBe(
        REAL_5M_APR2026_CENTRAL_BIS[i + 1].trend,
      );
    }
  });

  describe('5分钟级别前5个中枢端到端全量锁定门禁 (E2E Contract Guard)', () => {
    it('端到端全量锁定：前5个中枢总数严格为5，每一笔（共47笔）的方向、高低点、起止时间与全局引用严格完全一致，错一笔即不通过', () => {
      const allRes = biCalc.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);
      expect(allRes.phaseB).toHaveLength(EXPECTED_5M_FIRST_5_CENTRALS.length);

      EXPECTED_5M_FIRST_5_CENTRALS.forEach((expected, cIdx) => {
        const actual = allRes.phaseB[cIdx];
        expect(actual).toBeDefined();
        // 1. 中枢级别全局参数严格断言
        expect(actual.trend).toBe(expected.trend);
        expect(actual.bis).toHaveLength(expected.count);
        expect(actual.zg).toBe(expected.zg);
        expect(actual.zd).toBe(expected.zd);
        expect(actual.gg).toBe(expected.gg);
        expect(actual.dd).toBe(expected.dd);
        expect(actual.expanded).toBe(expected.expanded);
        expect(actual.type).toBe(expected.type);

        // 2. 中枢内每一笔的全部参数严格逐笔断言（每一笔都不能错）
        expected.bis.forEach((expBi, bIdx) => {
          const actBi = actual.bis[bIdx];
          expect(actBi).toBeDefined();
          // 局部与全局索引对齐
          expect(bIdx).toBe(expBi.centralBiIndex);
          const globalIdx = REAL_5M_JAN2026_FIRST_CENTRAL_BIS.indexOf(actBi);
          expect(globalIdx).toBe(expBi.globalBiIndex);
          // 笔对象真源引用同一性（确认消费的是全局序列中的同一物理笔）
          expect(actBi).toBe(
            REAL_5M_JAN2026_FIRST_CENTRAL_BIS[expBi.globalBiIndex],
          );

          // 笔方向与高低点绝对一致
          expect(actBi.trend).toBe(expBi.trend);
          expect(actBi.low).toBe(expBi.low);
          expect(actBi.high).toBe(expBi.high);

          // 笔时间戳毫秒级精确对齐
          expect(actBi.startTime.toISOString()).toBe(expBi.startTime);
          expect(actBi.endTime.toISOString()).toBe(expBi.endTime);
        });
      });
    });
  });

  // 用户测试用例准备区域
  describe('用例 1：2026年1月6日13:50至1月9日10:50九笔中枢基准与后续3买离开', () => {
    it('全量序列应精准识别为 9 笔中枢，起止时间严格对齐，后续走出 3 买与离开', () => {
      const resAll = biCalc.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);
      process.stderr.write(
        `\n=== ALL CHANNELS (${resAll.phaseB.length}) ===\n`,
      );
      resAll.phaseB.forEach((c, i) => {
        const s = c.bis[0].startTime.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
        });
        const e = c.bis[c.bis.length - 1].endTime.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
        });
        process.stderr.write(
          `  [#${i}] ${c.trend} (${c.bis.length} bis) | ${s} ~ ${e} | ZG:${c.zg} ZD:${c.zd} GG:${c.gg} DD:${c.dd} | type: ${c.type}\n`,
        );
      });
      expect(resAll.phaseB.length).toBeGreaterThanOrEqual(1);

      const c0 = resAll.phaseB[0];
      // 1. 中间一共 9 笔中枢
      expect(c0.bis).toHaveLength(9);

      // 2. 起笔是 1月6日 13:50 (Bi 4)
      expect(c0.bis[0].startTime).toEqual(new Date('2026-01-06T05:50:00.000Z'));
      // 3. 终点是 1月9日 10:50 (Bi 12)
      expect(c0.bis[8].endTime).toEqual(new Date('2026-01-09T02:50:00.000Z'));

      // 4. 中枢状态与几何参数
      expect(c0.type).toBe(ChannelType.Complete);
      expect(c0.expanded).toBe(true);
      expect(c0.zg).toBe(4088.01);
      expect(c0.zd).toBe(4075.7);
      expect(c0.gg).toBe(4121.7);
      expect(c0.dd).toBe(4056.87);

      // 5. 后续走势：第 10 笔（Bi 13）为 3 买（回踩不破 ZG 4088.01）
      const bi13 = REAL_5M_JAN2026_FIRST_CENTRAL_BIS[13];
      expect(bi13.startTime).toEqual(new Date('2026-01-09T02:50:00.000Z')); // 10:50
      expect(bi13.endTime).toEqual(new Date('2026-01-09T03:10:00.000Z')); // 11:10
      expect(bi13.trend).toBe(TrendDirection.Down);
      expect(bi13.low).toBeGreaterThan(c0.zg); // 4093.01 > 4088.01 -> 严格三买

      // 6. 后续走势：第 11 笔（Bi 14）为顺势离开（主升大涨破 4121.70）
      const bi14 = REAL_5M_JAN2026_FIRST_CENTRAL_BIS[14];
      expect(bi14.startTime).toEqual(new Date('2026-01-09T03:10:00.000Z')); // 11:10
      expect(bi14.endTime).toEqual(new Date('2026-01-13T02:10:00.000Z')); // 01-13 10:10
      expect(bi14.trend).toBe(TrendDirection.Up);
      expect(bi14.high).toBeGreaterThan(c0.gg); // 4179.70 > 4121.70 -> 强力离开
    });
  });

  describe('用例 2：2026年1月9日11:10至1月14日11:25上涨中枢（对应30分钟向上笔）', () => {
    it('全量序列应精准识别为 7 笔上涨中枢，起止时间严格吻合，方向判定为 Up', () => {
      const resAll = biCalc.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);
      expect(resAll.phaseB.length).toBeGreaterThanOrEqual(2);

      const c1 = resAll.phaseB[1];
      // 1. 方向严格为 Up (对齐 30 分钟向上笔)
      expect(c1.trend).toBe(TrendDirection.Up);

      // 2. 中间一共 7 笔中枢 (1 进入 + 3 核心 + 2 延伸 + 1 顺势离开)
      expect(c1.bis).toHaveLength(7);

      // 3. 起笔是 1月9日 11:10 (Bi 14)
      expect(c1.bis[0].startTime).toEqual(new Date('2026-01-09T03:10:00.000Z'));
      // 4. 终点是 1月14日 11:25 (Bi 20)
      expect(c1.bis[6].endTime).toEqual(new Date('2026-01-14T03:25:00.000Z'));

      // 5. 几何参数与区间
      expect(c1.type).toBe(ChannelType.Complete);
      expect(c1.zg).toBe(4167.16);
      expect(c1.zd).toBe(4151.9);
      expect(c1.gg).toBe(4190.87);
      expect(c1.dd).toBe(4093.01);
    });

    it('检验增量切片下该中枢的稳定状态（截取至 1月14日11:25 Bi 20 冲高顶端）', () => {
      // 截取至 Bi 20 (从 index 0 到 20 共 21 笔)
      const bisUpToBi20 = REAL_5M_JAN2026_FIRST_CENTRAL_BIS.slice(0, 21);
      const resBi20 = biCalc.createChannels(bisUpToBi20, {
        allowUncomplete: true,
      });
      expect(resBi20.phaseB.length).toBeGreaterThanOrEqual(2);
      expect(resBi20.phaseB[1].trend).toBe(TrendDirection.Up);
      expect(resBi20.phaseB[1].bis).toHaveLength(7);
      expect(resBi20.phaseB[1].type).toBe(ChannelType.Complete);
    });
  });

  describe('用例 3：2026年1月14日11:25至1月20日10:30双下跌中枢（分别对应两笔30分钟向下笔）', () => {
    it('全量序列应分别产出独立的第3个中枢(01-14 11:25~01-15 13:05)与第4个中枢(01-16 09:40~01-20 10:30)，严禁碎裂错乱', () => {
      const resAll = biCalc.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);

      // 1. 检验第 3 个中枢：1月14日 11:25 ~ 1月15日 13:05 下跌中枢 (对应 30分钟一笔下 4190.87 -> 4096.85)
      const c2 = resAll.phaseB.find(
        (c) =>
          c.bis[0].startTime.getTime() ===
          new Date('2026-01-14T03:25:00.000Z').getTime(),
      );
      expect(c2).toBeDefined();
      expect(c2?.trend).toBe(TrendDirection.Down);
      expect(c2?.bis[c2.bis.length - 1].endTime).toEqual(
        new Date('2026-01-15T05:05:00.000Z'), // 01-15 13:05
      );
      expect(c2?.type).toBe(ChannelType.Complete);

      // 2. 检验第 4 个中枢：1月16日 09:40 ~ 1月20日 10:30 下跌中枢 (对应 30分钟一笔下 4140.23 -> 4080.29)
      const c3 = resAll.phaseB.find(
        (c) =>
          c.bis[0].startTime.getTime() ===
          new Date('2026-01-16T01:40:00.000Z').getTime(),
      );
      expect(c3).toBeDefined();
      expect(c3?.trend).toBe(TrendDirection.Down);
      expect(c3?.bis[c3.bis.length - 1].endTime).toEqual(
        new Date('2026-01-20T02:30:00.000Z'), // 01-20 10:30
      );
      expect(c3?.type).toBe(ChannelType.Complete);
    });
  });

  describe('用例 4：2026年1月20日10:30至1月26日10:40单一大中枢（对应30分钟向上笔）', () => {
    it('在1月20日10:30至1月26日10:40内应只有唯一下跌后转上的单一大中枢，起于01-20 14:35，离开起于01-23 14:40，严禁错误割裂为2个中枢', () => {
      const resAll = biCalc.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);

      // 筛选在 2026-01-20 10:30 至 2026-01-26 10:40 范围内的中枢
      const tStart = new Date('2026-01-20T02:30:00.000Z').getTime(); // 01-20 10:30
      const tEnd = new Date('2026-01-26T02:40:00.000Z').getTime(); // 01-26 10:40

      const channelsInRange = resAll.phaseB.filter((c) => {
        const cStart = c.bis[0].startTime.getTime();
        const cEnd = c.bis[c.bis.length - 1].endTime.getTime();
        return cStart >= tStart && cEnd <= tEnd;
      });

      // 1. 业务契约：整个对应 30 分钟一笔上，内部必须只有 1 个单一大中枢，严禁错误划分成 2 个中枢
      expect(channelsInRange.length).toBe(1);

      const bigChannel = channelsInRange[0];
      expect(bigChannel.trend).toBe(TrendDirection.Up);
      // 2. 进入笔起点：1月20日 14:35 (Bi 45)
      expect(bigChannel.bis[0].startTime).toEqual(
        new Date('2026-01-20T06:35:00.000Z'),
      );
      // 3. 离开笔终点：1月26日 10:40 (Bi 57)
      expect(bigChannel.bis[bigChannel.bis.length - 1].endTime).toEqual(
        new Date('2026-01-26T02:40:00.000Z'),
      );
      // 4. 离开笔的起点：1月23日 14:40 (Bi 57.startTime)
      const departureBi = bigChannel.bis[bigChannel.bis.length - 1];
      expect(departureBi.startTime).toEqual(
        new Date('2026-01-23T06:40:00.000Z'),
      );
      expect(bigChannel.type).toBe(ChannelType.Complete);
    });
  });

  describe('用例 5：2026年1月26日10:40至1月27日10:05三买转二卖中枢严禁延伸防污染', () => {
    it('前置大中枢必须在离开笔冲高极值(01-26 10:40)确定闭合封存，严禁将随后的 3 买与 2 卖吸收为中枢延伸', () => {
      const resAll = biCalc.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);

      // 1. 查找起于 01-20 14:35 的单一大中枢
      const bigChannel = resAll.phaseB.find(
        (c) =>
          c.bis[0].startTime.getTime() ===
          new Date('2026-01-20T06:35:00.000Z').getTime(),
      );
      expect(bigChannel).toBeDefined();
      expect(bigChannel?.trend).toBe(TrendDirection.Up);
      expect(bigChannel?.type).toBe(ChannelType.Complete);

      // 2. 离开笔终点必须是 01-26 10:40 (4160.99)
      const lastBi = bigChannel!.bis[bigChannel!.bis.length - 1];
      expect(lastBi.endTime).toEqual(new Date('2026-01-26T02:40:00.000Z'));
      expect(lastBi.high).toBe(4160.99);

      // 3. 离开笔高点必须等于中枢的 GG，绝不能因为错误吸纳后续 3买/2卖 导致离开笔异常
      expect(bigChannel?.gg).toBe(4160.99);
      expect(lastBi.high).toBe(bigChannel?.gg);

      // 4. 严禁吸纳 01-26 10:40 之后的任何笔（3买回踩 4124.70、2卖反弹 4145.97、下杀 4101.83）
      const hasPostDepartureBis = bigChannel!.bis.some(
        (b) =>
          b.startTime.getTime() >=
          new Date('2026-01-26T02:40:00.000Z').getTime(),
      );
      expect(hasPostDepartureBis).toBe(false);

      // 5. 校验后续走势结构（纯常量走势特征）：
      // Bi 57: 3买回踩 (01-26 10:40 ~ 11:05, low 4124.70 > ZD)
      const bi3Buy = REAL_5M_JAN2026_FIRST_CENTRAL_BIS[57];
      expect(bi3Buy.low).toBeGreaterThan(bigChannel!.zd);

      // Bi 58: 2卖反弹次高点 (01-26 11:05 ~ 14:35, high 4145.97 < GG 4160.99)
      const bi2Sell = REAL_5M_JAN2026_FIRST_CENTRAL_BIS[58];
      expect(bi2Sell.high).toBeLessThan(bigChannel!.gg);

      // Bi 59: 确认下杀 (01-26 14:35 ~ 01-27 10:05, low 4101.83)
      const biBreak = REAL_5M_JAN2026_FIRST_CENTRAL_BIS[59];
      expect(biBreak.low).toBeLessThan(bigChannel!.zd);
    });
  });

  describe('用例 6：2026年4月1日13:35至4月7日13:20五笔下跌中枢（4月3日极值3871.30与3买转2买成立离开）', () => {
    it('在2026年4月全量序列上精准识别出5笔下跌中枢，中枢极值DD(3871.30)对齐4月3日低点，第5笔离开笔为3买转2买成立并闭合', () => {
      const resAll = biCalc.createChannels(REAL_5M_APR2026_CENTRAL_BIS, {
        allowUncomplete: true,
      });

      expect(resAll.phaseB.length).toBeGreaterThanOrEqual(1);

      // 查找起于 04-01 13:35 (Bi #1) 的首个已封存下跌中枢
      const central = resAll.phaseB[0];
      expect(central).toBeDefined();
      expect(central.trend).toBe(TrendDirection.Down);
      expect(central.type).toBe(ChannelType.Complete);
      expect(central.expanded).toBe(false);

      // 1. 构件总数为 5 笔（奇偶同向公理：1 进入笔 + 3 核心构件 + 1 顺势离开笔）
      expect(central.bis).toHaveLength(5);

      // 2. 起止时间严格对齐
      // 进入笔起点：4月1日 13:35 (UTC 05:35)
      expect(central.bis[0].startTime).toEqual(
        new Date('2026-04-01T05:35:00.000Z'),
      );
      // 离开笔终点：4月7日 13:20 (UTC 05:20)
      expect(central.bis[4].endTime).toEqual(
        new Date('2026-04-07T05:20:00.000Z'),
      );

      // 3. 中枢核心几何区间 [ZD, ZG] 与全局极值 [DD, GG]
      // ZG = min(high(bi2), high(bi4)) = min(3929.53, 3902.61) = 3902.61
      // ZD = max(low(bi2), low(bi4)) = max(3900.12, 3871.30) = 3900.12
      // GG = max(high) = 3955.94 (Bi #1 进入笔高点)
      // DD = min(low) = 3871.30 (Bi #3 于 4月3日 13:25 探底创下的全局极低点)
      expect(central.zg).toBe(3902.61);
      expect(central.zd).toBe(3900.12);
      expect(central.gg).toBe(3955.94);
      expect(central.dd).toBe(3871.3);

      // 4. 4月3日核心构件验证 (Bi #3)
      const biApril3 = central.bis[2];
      expect(biApril3.trend).toBe(TrendDirection.Down);
      expect(biApril3.low).toBe(3871.3);
      expect(biApril3.low).toBe(central.dd);
      expect(biApril3.endTime).toEqual(new Date('2026-04-03T05:25:00.000Z')); // 4月3日 13:25

      // 5. 第 5 笔顺势离开笔（Bi #5）：3买转2买成立离开笔
      const departureBi = central.bis[4];
      expect(departureBi.trend).toBe(TrendDirection.Down);
      expect(departureBi.trend).toBe(central.bis[0].trend); // 离开笔与进入笔严格同向
      expect(departureBi.high).toBe(3902.61); // 触碰 ZG (3902.61)
      expect(departureBi.low).toBe(3876.98); // 脱离中枢核心区间 [ZD, ZG] (3876.98 < ZD 3900.12)
      expect(departureBi.low).toBeGreaterThan(central.dd); // 回踩不破前低 3871.30 (3买转2买/2B买点成立)

      // 6. 验证中枢在该离开笔后成功闭合封存，后方大级别反弹笔（Bi #8 冲高 3995.00）不会被错误回溯污染
      const hasPostApril7Bis = central.bis.some(
        (b) =>
          b.startTime.getTime() >=
          new Date('2026-04-07T05:20:00.000Z').getTime(),
      );
      expect(hasPostApril7Bis).toBe(false);
    });
  });
});
