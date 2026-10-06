import { locateSpans } from './channel-span';
import { ChannelLevel } from '../contracts';

describe('locateSpans (中枢跨度定位与吸收中枢过滤)', () => {
  const t = (min: number) => new Date(2026, 0, 1, 9, min, 0, 0);

  const units = [
    { startTime: t(0), endTime: t(5) },
    { startTime: t(5), endTime: t(10) },
    { startTime: t(10), endTime: t(15) },
    { startTime: t(15), endTime: t(20) },
    { startTime: t(20), endTime: t(25) },
    { startTime: t(25), endTime: t(30) },
  ];

  it('正确匹配正常中枢起止下标', () => {
    const zhongshus = [
      {
        firstUnitTime: t(5),
        lastUnitTime: t(20),
        zg: 100,
        zd: 90,
        gg: 105,
        dd: 85,
        level: ChannelLevel.Bi,
      },
    ];

    const spans = locateSpans(units, zhongshus);
    expect(spans).toHaveLength(1);
    expect(spans[0].zhongshuIndex).toBe(0);
    expect(spans[0].firstIndex).toBe(1);
    expect(spans[0].lastIndex).toBe(3);
    expect(spans[0].zg).toBe(100);
    expect(spans[0].zd).toBe(90);
  });

  it('被吸收中枢（absorbed: true）必须被直接跳过，不生成 ChannelSpan', () => {
    const zhongshus = [
      {
        // 局部中枢 1（被吸收）
        firstUnitTime: t(5),
        lastUnitTime: t(15),
        zg: 98,
        zd: 90,
        gg: 100,
        dd: 88,
        level: ChannelLevel.Bi,
        absorbed: true,
      },
      {
        // 扩展外层大中枢（未被吸收）
        firstUnitTime: t(5),
        lastUnitTime: t(20),
        zg: 100,
        zd: 90,
        gg: 105,
        dd: 85,
        level: ChannelLevel.Bi,
        absorbed: false,
      },
      {
        // 局部中枢 2（被吸收，与扩展大中枢共享右边界 lastUnitTime: t(20)）
        firstUnitTime: t(15),
        lastUnitTime: t(20),
        zg: 100,
        zd: 92,
        gg: 105,
        dd: 90,
        level: ChannelLevel.Bi,
        absorbed: true,
      },
    ];

    const spans = locateSpans(units, zhongshus);
    // 两个 absorbed: true 的局部中枢全部被过滤，仅保留扩展外层大中枢
    expect(spans).toHaveLength(1);
    expect(spans[0].zhongshuIndex).toBe(1);
    expect(spans[0].firstIndex).toBe(1);
    expect(spans[0].lastIndex).toBe(3);
    expect(spans[0].zg).toBe(100);
    expect(spans[0].zd).toBe(90);
  });
});
