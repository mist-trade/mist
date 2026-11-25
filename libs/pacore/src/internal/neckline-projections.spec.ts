import { NecklinePatternType, NecklineStatus, PaK } from '../contracts';
import { InvalidSeriesError } from '../errors';
import { PaCore } from '../pa-core';
import { NecklineProjectionEngine } from './neckline-projections';

const BASE_TIMESTAMP = new Date('2026-01-01T09:30:00.000Z').getTime();
const BAR_INTERVAL_MS = 5 * 60 * 1000;

function createBar(
  id: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 10000,
): PaK {
  return {
    id,
    time: new Date(BASE_TIMESTAMP + id * BAR_INTERVAL_MS),
    open,
    high,
    low,
    close,
    volume,
    amount: volume * ((open + close) / 2),
  };
}

class SyntheticBarSeriesBuilder {
  private bars: PaK[] = [];
  private currentId = 0;

  public pushBar(
    open: number,
    high: number,
    low: number,
    close: number,
    volume?: number,
  ): this {
    this.currentId++;
    this.bars.push(createBar(this.currentId, open, high, low, close, volume));
    return this;
  }

  public pushFlatBars(count: number, price: number): this {
    for (let i = 0; i < count; i++) {
      this.pushBar(price, price, price, price);
    }
    return this;
  }

  public build(): readonly PaK[] {
    return Object.freeze([...this.bars]);
  }
}

describe('NecklineProjectionEngine (颈线映射与空间测距算子引擎)', () => {
  it('场景 1: 标准 W 底完整生命周期 [Forming -> Breakout -> TargetReached (1:1)]', () => {
    const builder = new SyntheticBarSeriesBuilder();
    // 跌至第一底 (Low=90)
    builder.pushBar(105, 106, 99, 100);
    builder.pushBar(100, 101, 94, 95);
    builder.pushBar(95, 96, 90, 91); // i=3: Bottom 1 (Low=90)

    // 反弹确立颈线峰值 (High=100)
    builder.pushBar(91, 95, 91, 94);
    builder.pushBar(94, 98, 93, 97);
    builder.pushBar(97, 100, 96, 99.5); // i=6: Peak (High=100, Neckline=100)

    // 回调构筑第二底 (不破第一底, Low=91)
    builder.pushBar(99.5, 100, 94, 95);
    builder.pushBar(95, 96, 91, 92);
    builder.pushBar(92, 94, 91, 93.5); // i=9: Bottom 2 (Low=91)

    // 上攻并在 i=12 收盘放量突破颈线 (Close=101.8 > 100)
    builder.pushBar(93.5, 97, 93, 96.5);
    builder.pushBar(96.5, 99.8, 96, 99.2);
    builder.pushBar(99.2, 102.5, 98.5, 101.8, 50000); // i=12: Breakout

    // 持续推进达标 1:1 目标位 (Target=110.00)
    builder.pushBar(101.8, 105, 101, 104.5);
    builder.pushBar(104.5, 108, 104, 107.5);
    builder.pushBar(107.5, 110.8, 107, 110.2); // i=15: High=110.8 >= 110.00

    const klines = builder.build();
    const projections = NecklineProjectionEngine.findProjections(klines);

    expect(projections.length).toBeGreaterThanOrEqual(1);
    const w = projections[0];

    // 断言形态类型与静态参数
    expect(w.patternType).toBe(NecklinePatternType.DoubleBottom);
    expect(w.direction).toBe('up');
    expect(w.necklinePrice).toBe(100.0);
    expect(w.extremumPrice).toBe(90.0);
    expect(w.targets.baseHeight).toBe(10.0);
    expect(w.targets.target1_0).toBe(110.0);
    expect(w.targets.target1_618).toBeCloseTo(116.18, 2);

    // 断言状态机推演
    expect(w.status).toBe(NecklineStatus.TargetReached);
    expect(w.breakout).toBeDefined();
    expect(w.breakout?.breakoutPrice).toBe(101.8);
  });

  it('场景 2: 标准 M 头跌破并回踩颈线确认 [Forming -> Breakout -> PullbackRetested -> TargetReached (1.618)]', () => {
    const builder = new SyntheticBarSeriesBuilder();
    // 冲高至第 1 顶 (High=120)
    builder.pushBar(100, 108, 99, 107);
    builder.pushBar(107, 115, 106, 114);
    builder.pushBar(114, 120, 113, 118); // i=3: Top 1 (High=120)

    // 回落确定颈线波谷 (Low=110)
    builder.pushBar(118, 118, 112, 113);
    builder.pushBar(113, 114, 110, 111);
    builder.pushBar(111, 113, 110, 112); // i=6: Trough (Low=110, Neckline=110)

    // 再次冲高构筑第 2 顶 (High=119.5)
    builder.pushBar(112, 117, 111, 116);
    builder.pushBar(116, 119.5, 115, 118.5); // i=8: Top 2 (High=119.5)
    builder.pushBar(118.5, 118.5, 113, 114);

    // 收盘实体跌破颈线 110.00
    builder.pushBar(114, 114, 109.8, 110.2);
    builder.pushBar(110.2, 110.5, 108.0, 108.5); // i=11: Close=108.5 < 110 (Breakout)

    // 弱势反抽颈线 Retest (刺探 110.30, 收盘受阻回落 109.40)
    builder.pushBar(108.5, 109.8, 108.2, 109.5);
    builder.pushBar(109.5, 110.3, 109.0, 109.4); // i=13: Retested (测试阻力有效)

    // 暴跌至 1.618 目标位 (93.82)
    builder.pushBar(109.4, 109.5, 102.0, 103.0);
    builder.pushBar(103.0, 103.5, 96.0, 97.0);
    builder.pushBar(97.0, 97.5, 93.5, 94.0); // i=16: Low=93.5 <= 93.82 (TargetReached)

    const klines = builder.build();
    const projections = NecklineProjectionEngine.findProjections(klines);

    expect(projections.length).toBeGreaterThanOrEqual(1);
    const m = projections[0];

    expect(m.patternType).toBe(NecklinePatternType.DoubleTop);
    expect(m.direction).toBe('down');
    expect(m.necklinePrice).toBe(110.0);
    expect(m.extremumPrice).toBe(120.0);
    expect(m.targets.baseHeight).toBe(10.0);
    expect(m.targets.target1_0).toBe(100.0);
    expect(m.targets.target1_618).toBeCloseTo(93.82, 2);

    expect(m.status).toBe(NecklineStatus.TargetReached);
    expect(m.retestZone.isRetested).toBe(true);
  });

  it('场景 3: 倒头肩底 5 点拓扑识别与水平颈线计算', () => {
    const builder = new SyntheticBarSeriesBuilder();
    // 基础缓冲
    builder.pushBar(100, 101, 98, 99);
    builder.pushBar(99, 100, 97, 98);
    // 左肩: Low=92 (i=3)
    builder.pushBar(98, 99, 92, 93);
    // 颈线峰 1: High=100 (i=5)
    builder.pushBar(93, 97, 93, 96);
    builder.pushBar(96, 100, 95, 99.5);
    // 头部深探: Low=85 (i=7)
    builder.pushBar(99.5, 99.5, 90, 91);
    builder.pushBar(91, 92, 85, 86);
    // 颈线峰 2: High=100 (i=9)
    builder.pushBar(86, 95, 86, 94);
    builder.pushBar(94, 100, 94, 99.8);
    // 右肩: Low=91.5 (i=11)
    builder.pushBar(99.8, 99.8, 94, 95);
    builder.pushBar(95, 96, 91.5, 93);
    // 突破 Bar: Close=102 (i=13)
    builder.pushBar(93, 98, 93, 97);
    builder.pushBar(97, 102.5, 97, 102);

    const klines = builder.build();
    const projections = NecklineProjectionEngine.findProjections(klines);

    const ihs = projections.find(
      (p) => p.patternType === NecklinePatternType.HeadAndShouldersBottom,
    );
    expect(ihs).toBeDefined();
    expect(ihs?.necklinePrice).toBe(100.0);
    expect(ihs?.extremumPrice).toBe(85.0);
    expect(ihs?.targets.baseHeight).toBe(15.0);
    expect(ihs?.targets.target1_0).toBe(115.0);
    expect(ihs?.status).toBe(NecklineStatus.Breakout);
  });

  it('场景 4: 仅影线刺破颈线 (Wick Sweep) 严禁激活突破状态，维持 Forming', () => {
    const builder = new SyntheticBarSeriesBuilder();
    builder.pushBar(105, 106, 99, 100);
    builder.pushBar(100, 101, 94, 95);
    builder.pushBar(95, 96, 90, 91); // 底1: Low=90

    builder.pushBar(91, 95, 91, 94);
    builder.pushBar(94, 98, 93, 97);
    builder.pushBar(97, 100, 96, 99.5); // 颈线: High=100

    builder.pushBar(99.5, 100, 94, 95);
    builder.pushBar(95, 96, 91, 92);
    builder.pushBar(92, 94, 91, 93.5); // 底2: Low=91

    // 假突破关键 Bar: High=102.50 刺穿颈线, 但收盘 Close=99.20 坚决回落!
    builder.pushBar(93.5, 97, 93, 96.5);
    builder.pushBar(96.5, 102.5, 96, 99.2); // 影线冲过 100，收盘 99.2
    builder.pushBar(99.2, 99.8, 97.0, 98.0);

    const klines = builder.build();
    const projections = NecklineProjectionEngine.findProjections(klines);

    expect(projections.length).toBeGreaterThanOrEqual(1);
    const w = projections[0];

    // 核心因果断言: 状态未突破，保持 Forming
    expect(w.status).toBe(NecklineStatus.Forming);
    expect(w.breakout).toBeUndefined();
  });

  it('场景 5: 突破后次根 Bar 恶性反切深幅贯穿颈线，状态跃迁为 Invalidated', () => {
    const builder = new SyntheticBarSeriesBuilder();
    builder.pushBar(105, 106, 99, 100);
    builder.pushBar(100, 101, 94, 95);
    builder.pushBar(95, 96, 90, 91); // 底1

    builder.pushBar(91, 95, 91, 94);
    builder.pushBar(94, 98, 93, 97);
    builder.pushBar(97, 100, 96, 99.5); // 颈线 100

    builder.pushBar(99.5, 100, 94, 95);
    builder.pushBar(95, 96, 91, 92);
    builder.pushBar(92, 94, 91, 93.5); // 底2

    // 收盘站上 100.8 确立突破
    builder.pushBar(93.5, 97, 93, 96.5);
    builder.pushBar(96.5, 101, 96.5, 100.8);

    // 突发恶性反向大阴棒跌穿颈线 (Close=93.00 << 100.00 - 0.5 * 10)
    builder.pushBar(100.8, 101, 92.5, 93.0);

    const klines = builder.build();
    const projections = NecklineProjectionEngine.findProjections(klines);

    expect(projections.length).toBeGreaterThanOrEqual(1);
    const w = projections[0];

    expect(w.status).toBe(NecklineStatus.Invalidated);
  });

  it('场景 6: 构筑阶段第二底直接砸穿第一底极值，状态标记为 Invalidated', () => {
    const builder = new SyntheticBarSeriesBuilder();
    builder.pushBar(105, 106, 99, 100);
    builder.pushBar(100, 101, 94, 95);
    builder.pushBar(95, 96, 90, 91); // 底1: Low=90.00

    builder.pushBar(91, 95, 91, 94);
    builder.pushBar(94, 98, 93, 97);
    builder.pushBar(97, 100, 96, 99.5); // 峰值: High=100.00

    // 第二底直接深破前低: Low=88.50, Close=88.50 < 90.00
    builder.pushBar(99.5, 100, 94, 95);
    builder.pushBar(95, 96, 91, 92);
    builder.pushBar(92, 94, 90.5, 91.5);
    builder.pushBar(91.5, 92.0, 88.0, 88.5); // 穿透第一底

    const klines = builder.build();
    const projections = NecklineProjectionEngine.findProjections(klines);

    // 形态要么被过滤，要么标记为 Invalidated
    const active = projections.filter(
      (p) => p.status !== NecklineStatus.Invalidated,
    );
    expect(active.length).toBe(0);
  });

  it('场景 7: 边界异常防御 (空数组、样本过短、非严格单调递增时间戳防御)', () => {
    // 1. 空数组
    expect(() => PaCore.findNecklines([])).toThrow(InvalidSeriesError);

    // 2. 样本过短，安全返回空数组
    const shortBars = [createBar(1, 10, 12, 9, 11)];
    expect(() => PaCore.findNecklines(shortBars)).not.toThrow();
    expect(PaCore.findNecklines(shortBars)).toEqual([]);

    // 3. 价格倒挂防御: High < Low
    const invertedBar = [
      {
        id: 1,
        time: new Date('2026-01-01T09:30:00Z'),
        open: 10,
        high: 8, // High < Low!
        low: 12,
        close: 9,
      },
    ];
    expect(() => PaCore.findNecklines(invertedBar)).toThrow(/high.*<.*low/i);

    // 4. 零振幅 Flat 序列防除以 0
    const flatBars = new SyntheticBarSeriesBuilder()
      .pushFlatBars(20, 100)
      .build();
    expect(() => PaCore.findNecklines(flatBars)).not.toThrow();
    expect(PaCore.findNecklines(flatBars)).toEqual([]);
  });

  it('场景 8: PaCore 门面与 analyze 聚合输出包含 necklines', () => {
    const builder = new SyntheticBarSeriesBuilder();
    builder.pushBar(105, 106, 99, 100);
    builder.pushBar(100, 101, 94, 95);
    builder.pushBar(95, 96, 90, 91);
    builder.pushBar(91, 95, 91, 94);
    builder.pushBar(94, 98, 93, 97);
    builder.pushBar(97, 100, 96, 99.5);
    builder.pushBar(99.5, 100, 94, 95);
    builder.pushBar(95, 96, 91, 92);
    builder.pushBar(92, 94, 91, 93.5);
    builder.pushBar(93.5, 97, 93, 96.5);
    builder.pushBar(96.5, 99.8, 96, 99.2);
    builder.pushBar(99.2, 102.5, 98.5, 101.8);

    const klines = builder.build();
    const result = PaCore.analyze(klines);

    expect(result).toBeDefined();
    expect(result.necklines).toBeDefined();
    expect(Array.isArray(result.necklines)).toBe(true);
    expect(result.necklines.length).toBeGreaterThanOrEqual(1);
  });

  it('场景 9: Breakout 同棒同时触达 1:1 目标位与回抽敏感带时，保持 TargetReached 不被覆盖回 PullbackRetested', () => {
    const builder = new SyntheticBarSeriesBuilder();
    builder.pushBar(105, 106, 99, 100);
    builder.pushBar(100, 101, 94, 95);
    builder.pushBar(95, 96, 90, 91); // 底1: Low=90
    builder.pushBar(91, 95, 91, 94);
    builder.pushBar(94, 98, 93, 97);
    builder.pushBar(97, 100, 96, 99.5); // 颈线: High=100
    builder.pushBar(99.5, 100, 94, 95);
    builder.pushBar(95, 96, 91, 92);
    builder.pushBar(92, 94, 91, 93.5); // 底2: Low=91
    builder.pushBar(93.5, 97, 93, 96.5);
    builder.pushBar(96.5, 99.8, 96, 99.2);
    builder.pushBar(99.2, 102.5, 98.5, 101.8, 50000); // 突破: Close=101.8 > 100
    // 同棒大波动：下探回踩敏感带 (Low=100.5 <= 101) 并直接拉升触达 1:1 目标 (High=110.5 >= 110)
    builder.pushBar(101.8, 110.5, 100.5, 109.0);

    const projections = NecklineProjectionEngine.findProjections(
      builder.build(),
    );
    expect(projections.length).toBeGreaterThanOrEqual(1);
    const w = projections[0];

    expect(w.status).toBe(NecklineStatus.TargetReached);
    expect(w.retestZone.isRetested).toBe(true);
  });
});
