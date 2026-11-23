import { FvgMitigationStatus, FvgType, PaK } from '../contracts';
import { FairValueGapDetector } from './fair-value-gap';

describe('FairValueGapDetector (纯几何失衡缺口检测与状态机)', () => {
  const baseTime = new Date('2026-01-01T09:30:00Z').getTime();
  const createBar = (
    id: number,
    open: number,
    high: number,
    low: number,
    close: number,
  ): PaK => ({
    id,
    time: new Date(baseTime + id * 5 * 60 * 1000),
    open,
    high,
    low,
    close,
  });

  it('正确检测标准看涨 FVG 并计算 50% CE 轴心', () => {
    const klines: PaK[] = [
      createBar(1, 100, 105, 99, 104), // k0: high = 105
      createBar(2, 104, 115, 103, 114), // k1: displacement bar
      createBar(3, 114, 120, 110, 118), // k2: low = 110
    ];

    const fvgs = FairValueGapDetector.detect(klines);
    expect(fvgs).toHaveLength(1);

    const fvg = fvgs[0];
    expect(fvg.type).toBe(FvgType.Bullish);
    expect(fvg.gapBottom).toBe(105);
    expect(fvg.gapTop).toBe(110);
    expect(fvg.gapSize).toBe(5);
    expect(fvg.consequentEncroachment).toBe(107.5);
    expect(fvg.status).toBe(FvgMitigationStatus.Unmitigated);
  });

  it('正确检测标准看跌 FVG 并计算 50% CE 轴心', () => {
    const klines: PaK[] = [
      createBar(1, 120, 121, 115, 116), // k0: low = 115
      createBar(2, 116, 117, 105, 106), // k1: displacement bar down
      createBar(3, 106, 110, 104, 108), // k2: high = 110
    ];

    const fvgs = FairValueGapDetector.detect(klines);
    expect(fvgs).toHaveLength(1);

    const fvg = fvgs[0];
    expect(fvg.type).toBe(FvgType.Bearish);
    expect(fvg.gapTop).toBe(115);
    expect(fvg.gapBottom).toBe(110);
    expect(fvg.gapSize).toBe(5);
    expect(fvg.consequentEncroachment).toBe(112.5);
    expect(fvg.status).toBe(FvgMitigationStatus.Unmitigated);
  });

  it('追踪看涨 FVG 的回踩状态演化 (Tested -> CeFilled -> Invalidated)', () => {
    // 基础三棒看涨 FVG: bottom = 105, top = 110, CE = 107.5
    const klines: PaK[] = [
      createBar(1, 100, 105, 99, 104),
      createBar(2, 104, 115, 103, 114),
      createBar(3, 114, 120, 110, 118),
      createBar(4, 118, 119, 108, 117), // 回踩到 108 (刺入缺口，在 107.5 之上，Tested)
    ];

    let fvgs = FairValueGapDetector.detect(klines);
    expect(fvgs[0].status).toBe(FvgMitigationStatus.Tested);

    // 追加回踩跌破 50% CE (low = 106) 但收盘在 107
    klines.push(createBar(5, 117, 117, 106, 107));
    fvgs = FairValueGapDetector.detect(klines);
    expect(fvgs[0].status).toBe(FvgMitigationStatus.CeFilled);

    // 追加实体彻底击穿下沿 (close = 103 < 105)
    klines.push(createBar(6, 107, 107, 102, 103));
    fvgs = FairValueGapDetector.detect(klines);
    expect(fvgs[0].status).toBe(FvgMitigationStatus.Invalidated);
  });
});
