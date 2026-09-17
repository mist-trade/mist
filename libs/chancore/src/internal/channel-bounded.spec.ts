import {
  BiStatus,
  BiType,
  ChanCore,
  ChannelType,
  TrendDirection,
  type ChanBi,
} from '../index';
import { ChannelCalculator } from './channel';

function makeMockBi(
  trend: TrendDirection,
  low: number,
  high: number,
  startTime: string,
  endTime: string,
  idStart: number = 1,
  idEnd: number = 5,
  status: BiStatus = BiStatus.Valid,
): ChanBi {
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
    startFenxing: null,
    endFenxing: null,
  };
}

describe('ChannelCalculator.getAdjacentBoundedChannels', () => {
  it('returns empty result when macroBis is empty or has no valid strokes', () => {
    const calc = new ChannelCalculator();
    const subBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        20,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:35:00Z',
      ),
    ];

    expect(calc.getAdjacentBoundedChannels(subBis, [])).toEqual({
      phaseA: [],
      phaseB: [],
    });

    const invalidMacro = [
      makeMockBi(
        TrendDirection.Up,
        10,
        30,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
        1,
        5,
        BiStatus.Invalid,
      ),
    ];
    expect(calc.getAdjacentBoundedChannels(subBis, invalidMacro)).toEqual({
      phaseA: [],
      phaseB: [],
    });
  });

  it('returns empty result when subBis has fewer than 5 strokes', () => {
    const calc = new ChannelCalculator();
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        50,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
      ),
    ];
    const subBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        20,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        15,
        20,
        '2026-01-01T09:40:00Z',
        '2026-01-01T09:50:00Z',
      ),
    ];

    expect(calc.getAdjacentBoundedChannels(subBis, macroBis)).toEqual({
      phaseA: [],
      phaseB: [],
    });
  });

  it('computes central strictly bounded within a single macro bi', () => {
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        35,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
      ),
    ];

    // Standard 5-bi upward base central inside 09:30 ~ 11:30:
    // Bi1: Up 10 -> 22 (enters below ZD=16)
    // Bi2: Down 22 -> 16
    // Bi3: Up 16 -> 24
    // Bi4: Down 24 -> 17  (ZD = max(16, 17) = 17, ZG = min(22, 24) = 22)
    // Bi5: Up 17 -> 35 (exits above ZG=22)
    const subBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        22,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        16,
        22,
        '2026-01-01T09:40:00Z',
        '2026-01-01T09:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        16,
        24,
        '2026-01-01T09:50:00Z',
        '2026-01-01T10:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        17,
        24,
        '2026-01-01T10:00:00Z',
        '2026-01-01T10:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        17,
        35,
        '2026-01-01T10:10:00Z',
        '2026-01-01T10:20:00Z',
      ),
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);
    expect(result.phaseB).toHaveLength(1);
    const zs = result.phaseB[0];
    expect(zs.zd).toBe(17);
    expect(zs.zg).toBe(22);
    expect(zs.bis[0].startTime.getTime()).toBeGreaterThanOrEqual(
      new Date('2026-01-01T09:30:00Z').getTime(),
    );
    expect(zs.bis[zs.bis.length - 1].endTime.getTime()).toBeLessThanOrEqual(
      new Date('2026-01-01T11:30:00Z').getTime(),
    );
  });

  it('partitions sub-bis across multiple sequential macro bis without cross-boundary leakage', () => {
    // Macro Bi #1: Up from 09:30 to 11:30
    // Macro Bi #2: Down from 11:30 to 15:00
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        10,
        35,
        '2026-01-01T09:30:00Z',
        '2026-01-01T11:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        12,
        35,
        '2026-01-01T11:30:00Z',
        '2026-01-01T15:00:00Z',
      ),
    ];

    // Inside Macro #1 (09:30 ~ 11:30): 5-bi base central
    const subBisMacro1 = [
      makeMockBi(
        TrendDirection.Up,
        10,
        22,
        '2026-01-01T09:30:00Z',
        '2026-01-01T09:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        16,
        22,
        '2026-01-01T09:40:00Z',
        '2026-01-01T09:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        16,
        24,
        '2026-01-01T09:50:00Z',
        '2026-01-01T10:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        17,
        24,
        '2026-01-01T10:00:00Z',
        '2026-01-01T10:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        17,
        35,
        '2026-01-01T10:10:00Z',
        '2026-01-01T11:30:00Z',
      ),
    ];

    // Inside Macro #2 (11:30 ~ 15:00): 5-bi downward base central
    // Bi1: Down 35 -> 20 (enters above ZG=27)
    // Bi2: Up 20 -> 27
    // Bi3: Down 18 -> 27
    // Bi4: Up 18 -> 26 (ZG = min(27, 26) = 26, ZD = max(20, 18) = 20)
    // Bi5: Down 12 -> 26 (exits below ZD=20)
    const subBisMacro2 = [
      makeMockBi(
        TrendDirection.Down,
        20,
        35,
        '2026-01-01T11:30:00Z',
        '2026-01-01T11:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        20,
        27,
        '2026-01-01T11:50:00Z',
        '2026-01-01T13:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        18,
        27,
        '2026-01-01T13:30:00Z',
        '2026-01-01T13:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        18,
        26,
        '2026-01-01T13:50:00Z',
        '2026-01-01T14:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        12,
        26,
        '2026-01-01T14:10:00Z',
        '2026-01-01T14:50:00Z',
      ),
    ];

    const allSubBis = [...subBisMacro1, ...subBisMacro2];
    const result = ChanCore.createAdjacentBoundedChannels(allSubBis, macroBis);

    expect(result.phaseB).toHaveLength(2);
    // Central #1 is Upward, fully inside Macro #1
    expect(result.phaseB[0].trend).toBe(TrendDirection.Up);
    expect(
      result.phaseB[0].bis[result.phaseB[0].bis.length - 1].endTime.getTime(),
    ).toBeLessThanOrEqual(new Date('2026-01-01T11:30:00Z').getTime());

    // Central #2 is Downward, fully inside Macro #2
    expect(result.phaseB[1].trend).toBe(TrendDirection.Down);
    expect(result.phaseB[1].bis[0].startTime.getTime()).toBeGreaterThanOrEqual(
      new Date('2026-01-01T11:30:00Z').getTime(),
    );
  });

  it('correctly anchors sub-bis to macro fenxing extreme when sub-bi starts slightly before macro bar close time', () => {
    // 30m bar closes at 11:30 (so macroBi.startTime is 11:30)
    // but the 5m peak actually occurs at 11:25 (so subBi #1 starts at 11:25)
    const macroBis = [
      makeMockBi(
        TrendDirection.Down,
        20,
        50,
        '2026-01-01T11:30:00Z',
        '2026-01-01T13:30:00Z',
      ),
    ];

    const subBis = [
      makeMockBi(
        TrendDirection.Down,
        30,
        50,
        '2026-01-01T11:25:00Z', // 5m before macro 11:30!
        '2026-01-01T12:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        30,
        42,
        '2026-01-01T12:00:00Z',
        '2026-01-01T12:20:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        32,
        42,
        '2026-01-01T12:20:00Z',
        '2026-01-01T12:40:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        32,
        40,
        '2026-01-01T12:40:00Z',
        '2026-01-01T13:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        20,
        40,
        '2026-01-01T13:00:00Z',
        '2026-01-01T13:25:00Z',
      ),
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);
    expect(result.phaseB).toHaveLength(1);
    const zs = result.phaseB[0];
    expect(zs.trend).toBe(TrendDirection.Down);
    expect(zs.zg).toBe(40);
    expect(zs.zd).toBe(32);
    expect(zs.bis[0].startTime.toISOString()).toBe('2026-01-01T11:25:00.000Z');
  });

  it('correctly bounds 30m sub-bis inside daily macro bi when daily timestamps are midnight (00:00:00+08:00)', () => {
    // Daily Downward Bi: 2026-01-14 00:00:00+08:00 to 2026-02-03 00:00:00+08:00
    // (In UTC: 2026-01-13T16:00:00Z to 2026-02-02T16:00:00Z)
    // High: 4190.87, Low: 4002.78
    const macroBis = [
      makeMockBi(
        TrendDirection.Down,
        4002.78,
        4190.87,
        '2026-01-13T16:00:00Z',
        '2026-02-02T16:00:00Z',
      ),
    ];

    // 7 30m sub-bis forming a downward base central inside this daily stroke:
    // Notice subBi #1 starts on 2026-01-14 at 11:30 (03:30Z), 11.5 hours AFTER daily bar 00:00!
    // And subBi #7 ends on 2026-02-03 at 11:00 (03:00Z), 11 hours AFTER daily bar 00:00!
    const subBis = [
      makeMockBi(
        TrendDirection.Down,
        4096.85,
        4190.87,
        '2026-01-14T03:30:00Z',
        '2026-01-15T05:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4096.85,
        4140.23,
        '2026-01-15T05:30:00Z',
        '2026-01-16T02:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4080.29,
        4140.23,
        '2026-01-16T02:00:00Z',
        '2026-01-20T02:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4080.29,
        4160.99,
        '2026-01-20T02:30:00Z',
        '2026-01-26T03:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4101.83,
        4160.99,
        '2026-01-26T03:00:00Z',
        '2026-01-27T02:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4101.83,
        4170.21,
        '2026-01-27T02:30:00Z',
        '2026-01-29T06:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4002.78,
        4170.21,
        '2026-01-29T06:30:00Z',
        '2026-02-03T03:00:00Z',
      ),
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);
    expect(result.phaseB).toHaveLength(1);
    const zs = result.phaseB[0];
    expect(zs.trend).toBe(TrendDirection.Down);
    expect(zs.zg).toBe(4140.23);
    expect(zs.zd).toBe(4101.83);
    expect(zs.bis.length).toBe(7);
    expect(zs.bis[0].startTime.toISOString()).toBe('2026-01-14T03:30:00.000Z');
    expect(zs.bis[zs.bis.length - 1].endTime.toISOString()).toBe(
      '2026-02-03T03:00:00.000Z',
    );
  });

  it('correctly uses the departure stroke of the previous central as the entry stroke of the next central', () => {
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        3794.68,
        4114.84,
        '2026-03-22T16:00:00Z',
        '2026-04-22T16:00:00Z',
      ),
    ];

    const subBis = [
      // Bi 23: 03-23 15:00 -> 03-26 10:00
      makeMockBi(
        TrendDirection.Up,
        3794.68,
        3937.1,
        '2026-03-23T07:00:00Z',
        '2026-03-26T02:00:00Z',
        1,
        5,
      ),
      // Bi 24: 03-26 10:00 -> 03-27 10:00
      makeMockBi(
        TrendDirection.Down,
        3852.09,
        3937.1,
        '2026-03-26T02:00:00Z',
        '2026-03-27T02:00:00Z',
        5,
        10,
      ),
      // Bi 25: 03-27 10:00 -> 03-27 13:30
      makeMockBi(
        TrendDirection.Up,
        3852.09,
        3924.11,
        '2026-03-27T02:00:00Z',
        '2026-03-27T05:30:00Z',
        10,
        15,
      ),
      // Bi 26: 03-27 13:30 -> 03-30 10:00
      makeMockBi(
        TrendDirection.Down,
        3872.78,
        3924.11,
        '2026-03-27T05:30:00Z',
        '2026-03-30T02:00:00Z',
        15,
        20,
      ),
      // Bi 27: 03-30 10:00 -> 03-31 10:00
      makeMockBi(
        TrendDirection.Up,
        3872.78,
        3948.81,
        '2026-03-30T02:00:00Z',
        '2026-03-31T02:00:00Z',
        20,
        25,
      ),
      // Bi 28: 03-31 10:00 -> 03-31 15:00
      makeMockBi(
        TrendDirection.Down,
        3891.86,
        3948.81,
        '2026-03-31T02:00:00Z',
        '2026-03-31T07:00:00Z',
        25,
        30,
      ),
      // Bi 29: 03-31 15:00 -> 04-01 14:00
      makeMockBi(
        TrendDirection.Up,
        3891.86,
        3955.94,
        '2026-03-31T07:00:00Z',
        '2026-04-01T06:00:00Z',
        30,
        35,
      ),
      // Bi 30: 04-01 14:00 -> 04-03 13:30
      makeMockBi(
        TrendDirection.Down,
        3871.3,
        3955.94,
        '2026-04-01T06:00:00Z',
        '2026-04-03T05:30:00Z',
        35,
        40,
      ),
      // Bi 31: 04-03 13:30 -> 04-08 15:00 (departure of Central 0, entry of Central 1!)
      makeMockBi(
        TrendDirection.Up,
        3871.3,
        3995.0,
        '2026-04-03T05:30:00Z',
        '2026-04-08T07:00:00Z',
        40,
        45,
      ),
      // Bi 32: 04-08 15:00 -> 04-09 13:30
      makeMockBi(
        TrendDirection.Down,
        3955.25,
        3995.0,
        '2026-04-08T07:00:00Z',
        '2026-04-09T05:30:00Z',
        45,
        50,
      ),
      // Bi 33: 04-09 13:30 -> 04-10 10:30
      makeMockBi(
        TrendDirection.Up,
        3955.25,
        4011.02,
        '2026-04-09T05:30:00Z',
        '2026-04-10T02:30:00Z',
        50,
        55,
      ),
      // Bi 34: 04-10 10:30 -> 04-13 10:00
      makeMockBi(
        TrendDirection.Down,
        3966.2,
        4011.02,
        '2026-04-10T02:30:00Z',
        '2026-04-13T02:00:00Z',
        55,
        60,
      ),
      // Bi 35: 04-13 10:00 -> 04-15 10:30
      makeMockBi(
        TrendDirection.Up,
        3966.2,
        4050.62,
        '2026-04-13T02:00:00Z',
        '2026-04-15T02:30:00Z',
        60,
        65,
      ),
      // Bi 36: 04-15 10:30 -> 04-15 15:00
      makeMockBi(
        TrendDirection.Down,
        4020.9,
        4050.62,
        '2026-04-15T02:30:00Z',
        '2026-04-15T07:00:00Z',
        65,
        70,
      ),
      // Bi 37: 04-15 15:00 -> 04-23 10:00
      makeMockBi(
        TrendDirection.Up,
        4020.9,
        4114.84,
        '2026-04-15T07:00:00Z',
        '2026-04-23T02:00:00Z',
        70,
        75,
      ),
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);
    // 方案 1：原前两个区间重叠的同向中枢被吸收合并为 9 笔大中枢，最终产出 2 个独立趋势中枢
    expect(result.phaseB).toHaveLength(2);

    const [c0, c1] = result.phaseB;

    // Central 0（9 笔延伸中枢，满 9 笔结合扩展 expanded 为 true，离开笔为 Bi 31）
    expect(c0.zg).toBe(3924.11);
    expect(c0.zd).toBe(3891.86);
    expect(c0.expanded).toBe(true);
    expect(c0.bis).toHaveLength(9);
    expect(c0.bis[0].startTime.toISOString()).toBe('2026-03-23T07:00:00.000Z');
    expect(c0.bis[c0.bis.length - 1].endTime.toISOString()).toBe(
      '2026-04-08T07:00:00.000Z',
    );

    // Central 1（以 c0 的离开笔 Bi 31 作为进入笔，首尾相接，无价格重叠）
    expect(c1.zg).toBe(3995.0);
    expect(c1.zd).toBe(3966.2);
    expect(c1.bis).toHaveLength(5);
    expect(c1.bis[0].startTime.toISOString()).toBe('2026-04-03T05:30:00.000Z');
    expect(c1.bis[c1.bis.length - 1].endTime.toISOString()).toBe(
      '2026-04-15T02:30:00.000Z',
    );
    // 验证严格首尾相接拓扑契约
    expect(c0.bis[c0.bis.length - 1]).toBe(c1.bis[0]);
  });

  it('partitions sequential 30m macro strokes and 5m sub-bis without cross-stroke penetration or duplicate centrals', () => {
    // 3 Sequential 30m Macro Bis:
    // M1: Up 3958 -> 4103.93 (06-11 ~ 06-16 03:00Z)
    // M2: Down 4103.93 -> 4073.73 (06-16 03:00Z ~ 06-17 05:30Z)
    // M3: Up 4073.73 -> 4117.45 (06-17 05:30Z ~ 06-18 02:30Z)
    const macroBis = [
      makeMockBi(
        TrendDirection.Up,
        3958.0,
        4103.93,
        '2026-06-11T03:30:00Z',
        '2026-06-16T03:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4073.73,
        4103.93,
        '2026-06-16T03:00:00Z',
        '2026-06-17T05:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4073.73,
        4117.45,
        '2026-06-17T05:30:00Z',
        '2026-06-18T02:30:00Z',
      ),
    ];

    // 5m sub-bis around the M1 -> M2 peak (4103.93) and M2 -> M3 trough (4073.73)
    const subBis = [
      // In M1:
      makeMockBi(
        TrendDirection.Up,
        3958,
        4060,
        '2026-06-11T03:30:00Z',
        '2026-06-12T03:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4023,
        4060,
        '2026-06-12T03:00:00Z',
        '2026-06-12T06:50:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4023,
        4092,
        '2026-06-12T06:50:00Z',
        '2026-06-15T02:05:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4063,
        4092,
        '2026-06-15T02:05:00Z',
        '2026-06-15T05:15:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4063,
        4085,
        '2026-06-15T05:15:00Z',
        '2026-06-15T06:15:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4077,
        4085,
        '2026-06-15T06:15:00Z',
        '2026-06-16T02:00:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4077,
        4103.93,
        '2026-06-16T02:00:00Z',
        '2026-06-16T02:45:00Z',
      ), // Peak!

      // In M2:
      makeMockBi(
        TrendDirection.Down,
        4093.53,
        4103.93,
        '2026-06-16T02:45:00Z',
        '2026-06-16T03:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4093.53,
        4102.83,
        '2026-06-16T03:10:00Z',
        '2026-06-16T05:10:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4077.87,
        4102.83,
        '2026-06-16T05:10:00Z',
        '2026-06-16T05:45:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4077.87,
        4100.43,
        '2026-06-16T05:45:00Z',
        '2026-06-16T06:25:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4074.29,
        4100.43,
        '2026-06-16T06:25:00Z',
        '2026-06-17T01:35:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4074.29,
        4098.7,
        '2026-06-17T01:35:00Z',
        '2026-06-17T02:20:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4073.73,
        4098.7,
        '2026-06-17T02:20:00Z',
        '2026-06-17T05:10:00Z',
      ), // Trough!

      // In M3:
      makeMockBi(
        TrendDirection.Up,
        4073.73,
        4097.64,
        '2026-06-17T05:10:00Z',
        '2026-06-17T05:45:00Z',
      ),
      makeMockBi(
        TrendDirection.Down,
        4086.7,
        4097.64,
        '2026-06-17T05:45:00Z',
        '2026-06-17T06:15:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4086.7,
        4117.45,
        '2026-06-17T06:15:00Z',
        '2026-06-18T02:05:00Z',
      ), // Peak!
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);

    // Verify no duplicates
    const signatureSet = new Set<string>();
    for (const c of result.phaseB) {
      const sig = `${c.bis[0].startTime.toISOString()}_${c.zd}_${c.zg}`;
      expect(signatureSet.has(sig)).toBe(false);
      signatureSet.add(sig);
    }

    // Verify that centrals in M2 never cross before 06-16T02:45 or after 06-17T05:10
    const m2Centrals = result.phaseB.filter(
      (c) => c.trend === TrendDirection.Down,
    );
    for (const c of m2Centrals) {
      expect(c.bis[0].startTime.getTime()).toBeGreaterThanOrEqual(
        new Date('2026-06-16T02:45:00Z').getTime(),
      );
      expect(c.bis[c.bis.length - 1].endTime.getTime()).toBeLessThanOrEqual(
        new Date('2026-06-17T05:45:00Z').getTime(),
      );
    }
  });

  it('【BUG-CHAN-008】向下大笔切片顺势极值终笔对齐与历史中枢完整闭合', () => {
    // 真实 5m 真实行情 (000001) 2026-01-14 ~ 2026-01-16 走势：
    // Macro Bi #1: Down 4190.87 -> 4096.85 (01-14 03:30 ~ 01-15 05:30)
    // Macro Bi #2: Up 4096.85 -> 4140.23 (01-15 05:30 ~ 01-16 02:00)
    const macroBis = [
      makeMockBi(
        TrendDirection.Down,
        4096.85,
        4190.87,
        '2026-01-14T03:30:00Z',
        '2026-01-15T05:30:00Z',
      ),
      makeMockBi(
        TrendDirection.Up,
        4096.85,
        4140.23,
        '2026-01-15T05:30:00Z',
        '2026-01-16T02:00:00Z',
      ),
    ];

    const subBis = [
      // Sub [21]: down 4103.62 -> 4190.87 (03:25 ~ 06:05) -> Entry bi
      makeMockBi(
        TrendDirection.Down,
        4103.62,
        4190.87,
        '2026-01-14T03:25:00Z',
        '2026-01-14T06:05:00Z',
        358,
        372,
      ),
      // Sub [22]: up 4103.62 -> 4138.55 (06:05 ~ 06:35) -> Core bi 1
      makeMockBi(
        TrendDirection.Up,
        4103.62,
        4138.55,
        '2026-01-14T06:05:00Z',
        '2026-01-14T06:35:00Z',
        372,
        378,
      ),
      // Sub [23]: down 4104.42 -> 4138.55 (06:35 ~ 01:35) -> Core bi 2
      makeMockBi(
        TrendDirection.Down,
        4104.42,
        4138.55,
        '2026-01-14T06:35:00Z',
        '2026-01-15T01:35:00Z',
        378,
        384,
      ),
      // Sub [24]: up 4104.42 -> 4133.07 (01:35 ~ 02:00) -> Core bi 3
      makeMockBi(
        TrendDirection.Up,
        4104.42,
        4133.07,
        '2026-01-15T01:35:00Z',
        '2026-01-15T02:00:00Z',
        384,
        389,
      ),
      // Sub [25]: down 4096.85 -> 4133.07 (02:00 ~ 05:05) -> Departure bi (reaches macro trough 4096.85)
      makeMockBi(
        TrendDirection.Down,
        4096.85,
        4133.07,
        '2026-01-15T02:00:00Z',
        '2026-01-15T05:05:00Z',
        389,
        408,
      ),
      // Sub [26]: up 4096.85 -> 4116.70 (05:05 ~ 05:50) -> Bounce bi in next macro move
      makeMockBi(
        TrendDirection.Up,
        4096.85,
        4116.7,
        '2026-01-15T05:05:00Z',
        '2026-01-15T05:50:00Z',
        408,
        417,
      ),
      // Sub [27]: down 4098.20 -> 4116.70 (05:50 ~ 06:15)
      makeMockBi(
        TrendDirection.Down,
        4098.2,
        4116.7,
        '2026-01-15T05:50:00Z',
        '2026-01-15T06:15:00Z',
        417,
        422,
      ),
      // Sub [28]: up 4098.20 -> 4140.23 (06:15 ~ 01:40)
      makeMockBi(
        TrendDirection.Up,
        4098.2,
        4140.23,
        '2026-01-15T06:15:00Z',
        '2026-01-16T01:40:00Z',
        422,
        433,
      ),
      // Sub [29]: down 4100.65 -> 4140.23 (01:40 ~ 02:15)
      makeMockBi(
        TrendDirection.Down,
        4100.65,
        4140.23,
        '2026-01-16T01:40:00Z',
        '2026-01-16T02:15:00Z',
        433,
        440,
      ),
    ];

    const result = ChanCore.createAdjacentBoundedChannels(subBis, macroBis);

    // 1. 验证第 1 个中枢在向下大笔切片内正常密封完成 (Complete)，绝非 UnComplete 虚线中枢
    expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
    const central1 = result.phaseB[0];
    expect(central1.type).toBe(ChannelType.Complete);
    expect(central1.expanded).toBe(false);
    expect(central1.bis).toHaveLength(5);
    expect(central1.zd).toBeCloseTo(4104.42, 2);
    expect(central1.zg).toBeCloseTo(4133.07, 2);
    expect(central1.dd).toBeCloseTo(4096.85, 2);
    expect(central1.gg).toBeCloseTo(4190.87, 2);

    // 2. 验证中枢终点时间停在离开笔 05:05，绝未错误吞入 05:50 的反弹笔
    expect(central1.bis[central1.bis.length - 1].endTime.toISOString()).toBe(
      '2026-01-15T05:05:00.000Z',
    );

    // 3. 验证历史切片中枢绝不产生 UnComplete 标识
    const uncompletedCentrals = result.phaseB.filter(
      (c) => c.type === ChannelType.UnComplete,
    );
    expect(uncompletedCentrals).toHaveLength(0);
  });
});
