import {
  BiStatus,
  BiType,
  ChannelType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type { ChanBi } from '../contracts';
import { ChannelCalculator } from './channel';
import { REAL_5M_JAN2026_FIRST_CENTRAL_BIS } from './channel-departure-closure.spec';
import { CentralStateMachine } from './channel-lifecycle';

function makeBi(
  idx: number,
  trend: TrendDirection,
  low: number,
  high: number,
): ChanBi {
  const isUp = trend === TrendDirection.Up;
  return {
    startTime: new Date(2026, 0, idx + 1, 9, 30),
    endTime: new Date(2026, 0, idx + 1, 10, 0),
    high,
    low,
    trend,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 5,
    originIds: [idx * 2, idx * 2 + 1],
    originData: [],
    startFenxing: {
      type: isUp ? FenxingType.Bottom : FenxingType.Top,
      high,
      low,
      leftIds: [idx * 2 - 1],
      middleIds: [idx * 2],
      rightIds: [idx * 2 + 1],
      middleIndex: idx,
      middleOriginId: idx * 2,
    },
    endFenxing: {
      type: isUp ? FenxingType.Top : FenxingType.Bottom,
      high,
      low,
      leftIds: [idx * 2],
      middleIds: [idx * 2 + 1],
      rightIds: [idx * 2 + 2],
      middleIndex: idx + 1,
      middleOriginId: idx * 2 + 1,
    },
  } as ChanBi;
}

describe('ChannelCalculator 有限状态机算法套件', () => {
  const calculator = new ChannelCalculator();

  describe('一、5分钟级别前5个中枢（47笔真实构件）全量回归门禁', () => {
    it('在真实 5M 全量序列上输出 5 个中枢，各中枢几何与包含的 47 笔毫秒级对齐，并保持正确的扩展标记', () => {
      const res = calculator.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);

      expect(res.phaseA).toHaveLength(5);
      expect(res.phaseB).toHaveLength(5);

      const [c0, c1, c2, c3, c4] = res.phaseB;

      // 中枢 #0：9笔上涨中枢（单中枢维持普通中枢 expanded: false）
      expect(c0.trend).toBe(TrendDirection.Up);
      expect(c0.bis).toHaveLength(9);
      expect(c0.zg).toBe(4088.01);
      expect(c0.zd).toBe(4075.7);
      expect(c0.gg).toBe(4098.78);
      expect(c0.dd).toBe(4067.12);
      expect(c0.expanded).toBe(false);
      expect(c0.type).toBe(ChannelType.Complete);

      // 中枢 #1：7笔上涨中枢
      expect(c1.trend).toBe(TrendDirection.Up);
      expect(c1.bis).toHaveLength(7);
      expect(c1.zg).toBe(4167.16);
      expect(c1.zd).toBe(4151.9);
      expect(c1.gg).toBe(4179.7);
      expect(c1.dd).toBe(4126.23);
      expect(c1.expanded).toBe(false);

      // 中枢 #2：5笔下跌中枢
      expect(c2.trend).toBe(TrendDirection.Down);
      expect(c2.bis).toHaveLength(5);
      expect(c2.zg).toBe(4133.07);
      expect(c2.zd).toBe(4104.42);
      expect(c2.gg).toBe(4138.55);
      expect(c2.dd).toBe(4103.62);
      expect(c2.expanded).toBe(false);

      // 中枢 #3：13笔下跌中枢（单中枢维持普通中枢 expanded: false）
      expect(c3.trend).toBe(TrendDirection.Down);
      expect(c3.bis).toHaveLength(13);
      expect(c3.zg).toBe(4108.71);
      expect(c3.zd).toBe(4100.65);
      expect(c3.gg).toBe(4128.93);
      expect(c3.dd).toBe(4090.06);
      expect(c3.expanded).toBe(false);

      // 中枢 #4：13笔上涨中枢（单中枢维持普通中枢 expanded: false）
      expect(c4.trend).toBe(TrendDirection.Up);
      expect(c4.bis).toHaveLength(13);
      expect(c4.zg).toBe(4127.82);
      expect(c4.zd).toBe(4120.63);
      expect(c4.gg).toBe(4143.75);
      expect(c4.dd).toBe(4109.92);
      expect(c4.expanded).toBe(false);

      // 统计所有中枢构件总笔数：9 + 7 + 5 + 13 + 13 = 47 笔
      const totalBis = res.phaseB.reduce((sum, c) => sum + c.bis.length, 0);
      expect(totalBis).toBe(47);
    });
  });

  describe('二、中枢进入笔与离开笔严格同向（奇偶同向公理）', () => {
    it('所有封存的 Complete 中枢，离开笔必须与进入笔方向严格一致，且构件数必须为奇数', () => {
      const res = calculator.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);
      for (const channel of res.phaseB) {
        if (channel.type === ChannelType.Complete) {
          const entryBi = channel.bis[0];
          const leaveBi = channel.bis[channel.bis.length - 1];
          // 首尾同向
          expect(leaveBi.trend).toBe(entryBi.trend);
          expect(channel.trend).toBe(entryBi.trend);
          // 构件总数为奇数笔（5, 7, 9, 11, 13...）
          expect(channel.bis.length % 2).toBe(1);
          expect(channel.bis.length).toBeGreaterThanOrEqual(5);
        }
      }
    });

    it('向上中枢进入笔为 Up，离开笔必须为 Up；向下中枢进入笔为 Down，离开笔必须为 Down', () => {
      const upBis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140),
        makeBi(4, TrendDirection.Up, 115, 160), // 离开笔 Up
        makeBi(5, TrendDirection.Down, 145, 160), // 3B
      ];
      const resUp = calculator.createChannels(upBis);
      expect(resUp.phaseB).toHaveLength(1);
      expect(resUp.phaseB[0].bis[0].trend).toBe(TrendDirection.Up);
      expect(resUp.phaseB[0].bis[resUp.phaseB[0].bis.length - 1].trend).toBe(
        TrendDirection.Up,
      );

      const downBis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185),
        makeBi(4, TrendDirection.Down, 140, 185), // 离开笔 Down
        makeBi(5, TrendDirection.Up, 140, 155), // 3S
      ];
      const resDown = calculator.createChannels(downBis);
      expect(resDown.phaseB).toHaveLength(1);
      expect(resDown.phaseB[0].bis[0].trend).toBe(TrendDirection.Down);
      expect(
        resDown.phaseB[0].bis[resDown.phaseB[0].bis.length - 1].trend,
      ).toBe(TrendDirection.Down);
    });
  });

  describe('三、离开笔 candidate list 记录与决策选取', () => {
    it('顺势突破极值时完整记录候选离开笔快照，回退时选取极值匹配的最佳离开笔', () => {
      // 构造多次顺势破高后反转回踩的走势
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140], GG=150
        makeBi(4, TrendDirection.Up, 115, 160), // 候选离开笔 1 (high=160, 破 GG)
        makeBi(5, TrendDirection.Down, 142, 160), // 3B
        makeBi(6, TrendDirection.Up, 142, 155), // 冲高 155 未破 160
        makeBi(7, TrendDirection.Down, 110, 155), // 暴跌击穿 ZD(120)，触发反转决断
      ];

      const res = calculator.createChannels(bis);
      expect(res.phaseB).toHaveLength(1);
      const c = res.phaseB[0];
      // 成功回退至候选离开笔 1 (b4)，离开笔 high 严格等于当时的 GG 160
      expect(c.bis).toHaveLength(5);
      expect(c.gg).toBe(150);
      expect(c.bis[4].high).toBe(160);
    });
  });

  describe('四、有限状态机（FSM）状态转移完整覆盖', () => {
    it('未离开反向崩塌守卫：未曾离开便反向击穿，状态机转换至 Collapsed，不输出伪中枢', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140),
        makeBi(4, TrendDirection.Up, 115, 135), // 内部震荡，未离开
        makeBi(5, TrendDirection.Down, 90, 135), // 暴跌直接砸穿 ZD 与 DD
      ];
      const res = calculator.createChannels(bis);
      expect(res.phaseB.some((c) => c.trend === TrendDirection.Up)).toBe(false);
    });

    it('序列末端未完成：转换为 Uncomplete 状态，正确标记 ChannelType.UnComplete', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140),
      ];
      const res = calculator.createChannels(bis);
      expect(res.phaseB).toHaveLength(1);
      expect(res.phaseB[0].type).toBe(ChannelType.UnComplete);
    });
  });

  describe('五、延伸与中枢扩展的区分，严格重叠门禁（Strict Overlap Guard）', () => {
    it('单中枢维持普通中枢（expanded=false），仅两中枢满足扩展条件时才产出扩展大框', () => {
      const res = calculator.createChannels(REAL_5M_JAN2026_FIRST_CENTRAL_BIS);
      // 单中枢内部无论震荡 7 笔、9 笔还是 13 笔，单体自身均不是扩展大框（expanded 为 false）
      expect(res.phaseB[1].bis).toHaveLength(7);
      expect(res.phaseB[1].expanded).toBe(false);

      // 中枢 #0 为 9 笔中枢，单体自身维持 expanded=false
      expect(res.phaseB[0].bis).toHaveLength(9);
      expect(res.phaseB[0].expanded).toBe(false);

      // 中枢 #3、#4 为 13 笔中枢，单体自身维持 expanded=false
      expect(res.phaseB[3].bis).toHaveLength(13);
      expect(res.phaseB[3].expanded).toBe(false);
      expect(res.phaseB[4].bis).toHaveLength(13);
      expect(res.phaseB[4].expanded).toBe(false);
    });

    it('严格重叠门禁（Strict Overlap Guard）：悬空逃逸笔（与 [ZD, ZG] 无交集）严禁被吸纳进中枢延伸', () => {
      // 构造初始核心 [120, 140]
      // 后续笔如果完全悬空（例如 low=160, high=180，远在 ZG 140 之上），严禁当成延伸吸纳
      const fsm = new CentralStateMachine<ChanBi>(
        0,
        [
          makeBi(0, TrendDirection.Up, 100, 150),
          makeBi(1, TrendDirection.Down, 120, 150),
          makeBi(2, TrendDirection.Up, 120, 140),
          makeBi(3, TrendDirection.Down, 115, 140),
        ],
        {
          geometry: { zg: 140, zd: 120, gg: 150, dd: 100 },
          isUp: true,
        },
      );

      const hangingBi1 = makeBi(4, TrendDirection.Up, 160, 180);
      const hangingBi2 = makeBi(5, TrendDirection.Down, 165, 180);

      // 悬空笔检验：canAbsorbExtension 必须返回 false！
      expect(fsm.canAbsorbExtension(hangingBi1, hangingBi2)).toBe(false);
    });
  });

  describe('六、候选中枢有效性断言 isCandidateChannelValid', () => {
    it('完成笔中枢必须 >= 5 笔（离开笔包含在内），只有 3 笔或 4 笔的 Complete 中枢判定为无效', () => {
      const dummyBi = makeBi(0, TrendDirection.Up, 100, 150);

      // 3 笔即使 zg > zd，也不构成笔中枢
      const central3Bis: any = {
        bis: [dummyBi, dummyBi, dummyBi],
        zg: 140,
        zd: 120,
        type: ChannelType.Complete,
      };
      expect(calculator.isCandidateChannelValid(central3Bis)).toBe(false);

      // 4 笔若标记为 Complete，缺少离开笔，判定为无效
      const central4BisComplete: any = {
        bis: [dummyBi, dummyBi, dummyBi, dummyBi],
        zg: 140,
        zd: 120,
        type: ChannelType.Complete,
      };
      expect(calculator.isCandidateChannelValid(central4BisComplete)).toBe(
        false,
      );

      // 4 笔若是末端未完成中枢 (UnComplete)，属于合法核心
      const central4BisUncomplete: any = {
        bis: [dummyBi, dummyBi, dummyBi, dummyBi],
        zg: 140,
        zd: 120,
        type: ChannelType.UnComplete,
      };
      expect(calculator.isCandidateChannelValid(central4BisUncomplete)).toBe(
        true,
      );

      // 5 笔且 Complete 且 zg > zd，为标准有效完成笔中枢
      const central5BisComplete: any = {
        bis: [dummyBi, dummyBi, dummyBi, dummyBi, dummyBi],
        zg: 140,
        zd: 120,
        type: ChannelType.Complete,
      };
      expect(calculator.isCandidateChannelValid(central5BisComplete)).toBe(
        true,
      );
    });
  });
});
