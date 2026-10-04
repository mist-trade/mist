/**
 * 笔级走势中枢不可变性守护测试门禁（Bi-Channel Invariants Guard Spec）
 *
 * ======================================================================================
 * 架构定位：
 * ======================================================================================
 * 本测试套件是重构后专门为【笔中枢】建立的刚性不可变性守卫门禁：
 * 1. 守卫门禁 1：笔中枢首尾同向公理绝不破毁（leaveBi.trend === entryBi.trend）；
 * 2. 守卫门禁 2：笔中枢内部笔数奇数铁律绝不破毁（bis.length % 2 === 1 且 >= 3）；
 * 3. 守卫门禁 3：笔中枢穿底崩溃行为保真（反向击穿进入笔起点且无同向离开笔时必须崩塌）；
 * 4. 守卫门禁 4：笔中枢微观动态收窄行为保真（动态收窄内部公共重叠区间）；
 * 5. 与段中枢完全解耦隔离，确保段中枢的机制放开绝不波及笔中枢。
 * ======================================================================================
 */

import { BiStatus, BiType, ChannelType, TrendDirection } from '../contracts';
import type { ChanBi } from '../contracts';
import { BiChannelCalculator } from './bi-channel';

function makeBi(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanBi {
  const d = new Date(1700000000000 + id * 60000);
  return {
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    high,
    low,
    originIds: [id * 10, id * 10 + 9],
    startTime: d,
    endTime: new Date(d.getTime() + 60000),
    type: BiType.Complete,
    status: BiStatus.Valid,
  } as unknown as ChanBi;
}

describe('BiChannelCalculator Invariants Guard (笔中枢刚性不可变性守卫门禁)', () => {
  const calc = new BiChannelCalculator();

  it('守卫门禁 1 & 2：所有封存 Complete 笔中枢，离开笔必须与进入笔严格同向，内部笔数严格为奇数', () => {
    // 构造一个多笔震荡后顺势 3 买离开的序列
    const bis: ChanBi[] = [
      makeBi('up', 150, 100, 0), // b0 向上进入
      makeBi('down', 150, 120, 1), // b1 内部笔 1
      makeBi('up', 140, 120, 2), // b2 内部笔 2
      makeBi('down', 140, 125, 3), // b3 内部笔 3
      makeBi('up', 142, 122, 4), // b4 内部笔 4
      makeBi('down', 142, 128, 5), // b5 内部笔 5
      makeBi('up', 155, 128, 6), // b6 离开笔 (顺势冲破 150)
      makeBi('down', 155, 142, 7), // b7 回抽笔 (3买确认: low 142 > zg 140)
    ];

    const result = calc.createBiChannels(bis);
    expect(result.phaseB.length).toBeGreaterThanOrEqual(1);

    for (const channel of result.phaseB) {
      if (channel.type === ChannelType.Complete) {
        // 门禁 1：首尾同向公理
        expect(channel.leaveBi).toBeDefined();
        expect(channel.leaveBi!.trend).toBe(channel.entryBi.trend);
        expect(channel.trend).toBe(channel.entryBi.trend);

        // 门禁 2：内部笔数奇数铁律
        expect(channel.bis.length % 2).toBe(1);
        expect(channel.bis.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('守卫门禁 3：反向暴跌击穿进入笔起点且无同向离开笔候选时，笔中枢必须准确崩塌作废', () => {
    const bis: ChanBi[] = [
      makeBi('up', 150, 100, 0), // b0 进入笔 (起点 100)
      makeBi('down', 150, 120, 1), // b1
      makeBi('up', 140, 120, 2), // b2
      makeBi('down', 140, 125, 3), // b3
      // 随后反向暴跌击穿 100（跌到 80），且中途没有出现过顺势向上突破离开笔
      makeBi('up', 135, 125, 4),
      makeBi('down', 135, 80, 5), // 暴跌击穿 b0.low (100)
    ];

    const result = calc.createBiChannels(bis);
    // 门禁守卫：以 b0 (originId: 0) 为进入笔的向上中枢在暴跌击穿 100 后准确崩塌销毁，绝不输出以 b0 为进入笔的中枢
    expect(result.phaseB.some((c) => c.entryBi.originIds[0] === 0)).toBe(false);
  });

  it('守卫门禁 4：内部笔动态收窄 Invariant 保真', () => {
    const bis: ChanBi[] = [
      makeBi('up', 100, 50, 0), // b0
      makeBi('down', 100, 60, 1), // b1
      makeBi('up', 90, 60, 2), // b2
      makeBi('down', 90, 70, 3), // b3 -> 此时初始 [zd, zg] = [70, 90]
      makeBi('up', 88, 72, 4), // b4
      makeBi('down', 88, 75, 5), // b5 -> 动态收窄为 [75, 88]
      makeBi('up', 110, 75, 6), // b6 离开笔
      makeBi('down', 110, 92, 7), // b7 3买回抽
    ];

    const result = calc.createBiChannels(bis);
    expect(result.phaseB.length).toBe(1);
    const ch = result.phaseB[0];
    expect(ch.type).toBe(ChannelType.Complete);
    // 验证动态收窄效果
    expect(ch.zg).toBe(88);
    expect(ch.zd).toBe(75);
    expect(ch.bis.length).toBe(5); // 内部 5 笔（奇数）
  });
});
