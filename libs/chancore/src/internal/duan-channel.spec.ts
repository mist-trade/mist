import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
  DuanType,
  TrendDirection,
} from '../contracts';
import type { ChanBi, ChanDuan, ChanDuanChannel } from '../contracts';
import { DuanChannelCalculator } from './duan-channel';

describe('DuanChannelCalculator (段级中枢，对称重叠无方向)', () => {
  it('returns empty two-phase result for fewer than 3 Duan', () => {
    const calc = new DuanChannelCalculator();
    expect(calc.createDuanChannels([])).toEqual({ phaseA: [], phaseB: [] });
    expect(
      calc.createDuanChannels([
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
      ]),
    ).toEqual({ phaseA: [], phaseB: [] });
  });

  it('forms a Duan-level Channel from a 3-Duan window with symmetric overlap', () => {
    // d0 up(0..10) d1 down(2..8) d2 up(3..9)：重叠 = [max低点=3, min高点=8]
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
    ];

    const result = new DuanChannelCalculator().createDuanChannels(duans);

    expect(result.phaseA).toHaveLength(1);
    expect(result.phaseB).toHaveLength(1);
    const channel = result.phaseB[0];
    expect(channel.level).toBe(ChannelLevel.Duan); // 接线 ChannelLevel.Duan
    expect(channel.type).toBe(ChannelType.UnComplete);
    expect(channel.status).toBe(ChannelStatus.Valid);
    expect(channel.expanded).toBe(false); // 普通同级中枢，非扩张合并产物
    expect(channel.zg).toBe(8); // min(10,8,9)
    expect(channel.zd).toBe(3); // max(0,2,3)
    expect(channel.gg).toBe(10); // max(10,8,9)
    expect(channel.dd).toBe(0); // min(0,2,3)
    expect(channel.duans).toHaveLength(3);
    expect('trend' in channel).toBe(false); // 中枢无方向，无 trend 字段
    expect(channel.startId).toBe(duans[0].originIds[0]);
    expect(channel.endId).toBe(
      duans[2].originIds[duans[2].originIds.length - 1],
    );
    expect(channel.displayStartId).toBe(duans[0].originIds[1]); // 首段中间原始 K id
    expect(channel.displayEndId).toBe(duans[2].originIds[1]);
  });

  it('rejects a candidate whose symmetric overlap is degenerate (zg === zd)', () => {
    // d0 up(5..10) d1 down(0..5) d2 up(5..10)：min高点=5 === max低点=5 → 无重叠区间，不成候选
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 5, 0),
      makeDuan('down', 5, 0, 1),
      makeDuan('up', 10, 5, 2),
    ];

    const result = new DuanChannelCalculator().createDuanChannels(duans);

    expect(result.phaseA).toHaveLength(0);
    expect(result.phaseB).toHaveLength(0);
  });

  it('extends a base Channel by pairs of Duan and updates to dynamic common intersection (zg/zd)', () => {
    // 5 段：3 段基础中枢 (d0..d2) 尾部延伸 +2 段 (d3,d4)，共同收敛为 5 段公共交集 [4, 7]
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
      makeDuan('down', 7, 4, 3),
      makeDuan('up', 8, 4, 4),
    ];

    const result = new DuanChannelCalculator().createDuanChannels(duans);

    // 延伸 + 重合合并后应收敛为一个覆盖全部 5 段的段级中枢
    expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
    const merged = result.phaseB.reduce((a, b) =>
      b.duans.length > a.duans.length ? b : a,
    );
    expect(merged.duans.length).toBeGreaterThanOrEqual(5);
    // 动态公共重叠交集：zg = min(10,8,9,7,8) = 7, zd = max(0,2,3,4,4) = 4
    expect(merged.zg).toBe(7);
    expect(merged.zd).toBe(4);
    expect(merged.gg).toBe(10); // max(10,8,9,7,8)
    expect(merged.dd).toBe(0); // min(0,2,3,4,4)
    expect(merged.expanded).toBe(false); // 单一中枢无相邻对，非扩张
    expect(merged.zg).toBeGreaterThan(merged.zd);
  });

  it('terminates extension when dynamic common intersection becomes empty (zg <= zd)', () => {
    // 3 段基础中枢在 [3, 8] 震荡，后续第 4、5 段跌至 0..2（最高 2 < 最低 3），交集为空无法延伸
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
      makeDuan('down', 2, 0, 3), // 脱离重叠区 (high=2 < zd=3)
      makeDuan('up', 2, 0, 4),
    ];

    const result = new DuanChannelCalculator().createDuanChannels(duans);
    expect(result.phaseB).toHaveLength(1);
    expect(result.phaseB[0].duans).toHaveLength(3);
  });

  it('excludes an unconfirmed tail Duan (status unknown) from Duan-level Channel derivation', () => {
    const confirmed: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
    ];
    const tail = makeUncompleteDuan('down', 7, 4, 3);
    const calc = new DuanChannelCalculator();
    expect(calc.createDuanChannels([...confirmed, tail])).toEqual(
      calc.createDuanChannels(confirmed),
    );
  });
  it('is deterministic across repeated calls and does not mutate input', () => {
    const duans: ChanDuan[] = [
      makeDuan('up', 10, 0, 0),
      makeDuan('down', 8, 2, 1),
      makeDuan('up', 9, 3, 2),
      makeDuan('down', 7, 4, 3),
      makeDuan('up', 8, 4, 4),
    ];
    const calc = new DuanChannelCalculator();
    const first = calc.createDuanChannels(duans);
    const second = calc.createDuanChannels(duans);
    expect(second).toEqual(first);
    expect(duans.map((d) => d.high)).toEqual([10, 8, 9, 7, 8]);
  });

  it('confirms departure segment on trend breakout and isolates subsequent 3-buy/3-sell into new structure', () => {
    // 模拟 1月22日 5M 形态：
    // d0..d2 形成基础中枢
    // d3 为内部回拉段，d4 为顺势突破离开段（high 4160.99 > zg 4128.93）
    // d5 为 3买试探回抽跌回中枢（3买转2卖），d6/d7 为后续二卖冲高与破位
    const duans: ChanDuan[] = [
      makeDuan('up', 4140.23, 4096.85, 0),
      makeDuan('down', 4140.23, 4090.06, 1),
      makeDuan('up', 4128.93, 4090.06, 2),
      makeDuan('down', 4128.93, 4109.92, 3),
      makeDuan('up', 4160.99, 4109.92, 4),
      makeDuan('down', 4160.99, 4101.83, 5),
      makeDuan('up', 4170.21, 4101.83, 6),
      makeDuan('down', 4170.21, 4002.78, 7),
    ];

    const calc = new DuanChannelCalculator();
    const result = calc.createDuanChannels(duans);

    // 中枢 0 应包含 [d0..d4]，离开段为 d4，GG 必须等于离开段的高点 4160.99，杜绝 departure < GG 的倒挂
    expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
    const firstChannel = result.phaseB[0];
    expect(firstChannel.duans).toHaveLength(5);
    expect(firstChannel.gg).toBe(4160.99);
    expect(firstChannel.zd).toBe(4109.92); // 内部段 d3 动态收敛中枢底
    expect(firstChannel.zg).toBe(4128.93);

    // 后续段（从 d4 起算）作为独立新结构推演，二卖高点 4170.21 不会反向污染中枢 0 的 GG
    if (result.phaseB.length > 1) {
      const secondChannel = result.phaseB[1];
      expect(secondChannel.gg).toBe(4170.21);
      expect(secondChannel.dd).toBe(4002.78);
    }
  });

  describe('Duan Channel Extension & Expansion (段中枢延伸与扩展)', () => {
    it('merges adjacent Duan Channels with overlapping [ZD, ZG] into an extended Channel in Phase B', () => {
      // 中枢1 (d0..d2): d0 up(0..10), d1 dn(2..8), d2 up(3..9) -> [ZD=3, ZG=8]
      // 连接段 d3: dn(4..7)
      // 中枢2 (d3..d5): d3 dn(4..7), d4 up(4..8), d5 dn(5..7) -> [ZD=5, ZG=7]
      // 两中枢共享连接段 d3，且核心区间 [3,8] 与 [5,7] 存在公共交集 [5,7]
      // Phase B 应该延伸合并为包含全部段的单一大段中枢
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 7, 4, 3), // 连接段
        makeDuan('up', 8, 4, 4),
        makeDuan('down', 7, 5, 5),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);

      // Phase B 应具备延伸合并产物
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const extended = result.phaseB.find((c) => c.duans.length >= 5);
      expect(extended).toBeDefined();
      expect(extended!.zg).toBe(7); // min(8, 7)
      expect(extended!.zd).toBe(5); // max(3, 5)
    });

    it('generates an expanded outer Channel when adjacent Duan Channels have disjoint [ZD, ZG] but overlapping [DD, GG]', () => {
      // 场景:
      // 中枢1 (d0..d4): 基础区间 [2, 8]，d4 向上离开突破至 14，极值波动 [0, 10] (或 [0, 14])
      // 中枢2 (d5..d7): 在上方形成新中枢 [11, 14]，但次回拉探至 9 (极值波动 [9, 15])
      // 两中枢 [ZD, ZG] 不重叠: [2, 8] 与 [11, 14] 无交集
      // 但 [DD, GG] 产生重叠: 中枢1波动高点 10 > 中枢2回探低点 9，符合缠论定理二的中枢扩展（形成高一级中枢大框）
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 10, 2, 1),
        makeDuan('up', 8, 2, 2),
        makeDuan('down', 8, 6, 3),
        makeDuan('up', 14, 6, 4), // 顺势突破中枢1封存离开
        makeDuan('down', 14, 9, 5), // 回拉探至 9 (进入中枢1极值重叠区)
        makeDuan('up', 15, 9, 6),
        makeDuan('down', 15, 11, 7),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);

      // Phase B 必须根据缠论扩展定理，生成 expanded: true 的高一级扩展中枢大框
      const expandedChannel = result.phaseB.find((c) => c.expanded === true);
      expect(expandedChannel).toBeDefined();
      expect(expandedChannel!.zg).toBe(11); // 高一级中枢上沿
      expect(expandedChannel!.zd).toBe(8); // 高一级中枢下沿
    });

    it('merges adjacent channels with overlapping [ZD, ZG] via applyDuanChannelExtensionAndExpansion', () => {
      const calc = new DuanChannelCalculator();
      const d0 = makeDuan('up', 10, 0, 0);
      const d1 = makeDuan('down', 8, 2, 1);
      const d2 = makeDuan('up', 9, 3, 2);
      const d3 = makeDuan('down', 7, 4, 3);
      const d4 = makeDuan('up', 8, 5, 4);

      const c1: ChanDuanChannel = {
        duans: [d0, d1, d2],
        zg: 8,
        zd: 3,
        gg: 10,
        dd: 0,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        startId: 1,
        endId: 202,
        displayStartId: 101,
        displayEndId: 201,
        expanded: false,
      };

      const c2: ChanDuanChannel = {
        duans: [d2, d3, d4], // d2 共享重叠
        zg: 7,
        zd: 5,
        gg: 9,
        dd: 4,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        startId: 201,
        endId: 402,
        displayStartId: 301,
        displayEndId: 401,
        expanded: false,
      };

      const merged = calc.applyDuanChannelExtensionAndExpansion([c1, c2]);
      expect(merged).toHaveLength(1);
      expect(merged[0].zg).toBe(7); // min(8, 7)
      expect(merged[0].zd).toBe(5); // max(3, 5)
      expect(merged[0].duans).toHaveLength(5); // d0, d1, d2, d3, d4 (d2 去重)
    });

    it('handles multiple channels chain expansion and single-element bounds', () => {
      const calc = new DuanChannelCalculator();
      const empty = calc.applyDuanChannelExtensionAndExpansion([]);
      expect(empty).toEqual([]);

      const d0 = makeDuan('up', 10, 0, 0);
      const c1: ChanDuanChannel = {
        duans: [d0, d0, d0],
        zg: 8,
        zd: 3,
        gg: 10,
        dd: 0,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        startId: 1,
        endId: 2,
        displayStartId: 1,
        displayEndId: 2,
        expanded: false,
      };
      const single = calc.applyDuanChannelExtensionAndExpansion([c1]);
      expect(single).toHaveLength(1);

      // 3 个连续中枢极值交集扩展
      const c2: ChanDuanChannel = {
        ...c1,
        zg: 15,
        zd: 12,
        gg: 16,
        dd: 9, // 与 c1(gg:10) 重叠于 [9, 10]
      };
      const c3: ChanDuanChannel = {
        ...c1,
        zg: 20,
        zd: 18,
        gg: 21,
        dd: 9.5, // 与 c1/c2 重叠
      };
      const multiExpanded = calc.applyDuanChannelExtensionAndExpansion([
        c1,
        c2,
        c3,
      ]);
      const expandedBox = multiExpanded.find((c) => c.expanded === true);
      expect(expandedBox).toBeDefined();
    });

    it('validates candidate channel correctly with isCandidateChannelValid', () => {
      const calc = new DuanChannelCalculator();
      const d0 = makeDuan('up', 10, 0, 0);
      const validChannel: ChanDuanChannel = {
        duans: [d0, d0, d0],
        zg: 10,
        zd: 5,
        gg: 12,
        dd: 2,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        startId: 1,
        endId: 2,
        displayStartId: 1,
        displayEndId: 2,
        expanded: false,
      };
      expect(calc.isCandidateChannelValid(validChannel)).toBe(true);

      const invalidLen: ChanDuanChannel = {
        ...validChannel,
        duans: [d0, d0],
      };
      expect(calc.isCandidateChannelValid(invalidLen)).toBe(false);

      const invalidOverlap: ChanDuanChannel = {
        ...validChannel,
        zg: 5,
        zd: 5,
      };
      expect(calc.isCandidateChannelValid(invalidOverlap)).toBe(false);
    });
  });
});

/** 构造最小 ChanDuan（段级中枢只读 startTime/endTime/high/low/trend/originIds）。 */
function makeDuan(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanDuan {
  const startTime = new Date(2026, 6, 1, 9, id * 10, 0, 0);
  const endTime = new Date(2026, 6, 1, 9, (id + 1) * 10, 0, 0);
  const startBi: ChanBi = {
    startTime,
    endTime,
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1],
    originData: [],
    startFenxing: null,
    endFenxing: null,
  };
  return {
    startTime,
    endTime,
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: DuanType.Complete,
    status: DuanStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1, id * 100 + 2],
    originBis: [startBi],
    startBi,
    endBi: startBi,
  };
}

/**
 * 未确认尾段（UnComplete / status=Unknown / endBi=null）——
 * 18 课"次级别前三个走势类型都是完成的才构成中枢"：不得进入段中枢。
 */
function makeUncompleteDuan(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanDuan {
  return {
    ...makeDuan(trend, high, low, id),
    type: DuanType.UnComplete,
    status: DuanStatus.Unknown,
    endBi: null,
  };
}
