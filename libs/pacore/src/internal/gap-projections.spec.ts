import { FairValueGap, FvgMitigationStatus, FvgType } from '../contracts';
import { GapProjectionEngine } from './gap-projections';

describe('GapProjectionEngine (空间对称度量与标准差投射)', () => {
  it('计算看涨 FVG 的 1:1 对称度量投射与标准差目标箱体', () => {
    const fvg: FairValueGap = {
      id: 'test_fvg_bull',
      type: FvgType.Bullish,
      startIndex: 0,
      displacementIndex: 1,
      endIndex: 2,
      startTime: new Date('2026-01-01T09:30:00Z'),
      endTime: new Date('2026-01-01T09:40:00Z'),
      gapBottom: 100,
      gapTop: 110,
      gapSize: 10,
      consequentEncroachment: 105,
      status: FvgMitigationStatus.Unmitigated,
    };

    // 起点 originPrice = 90
    const projection = GapProjectionEngine.project(fvg, 90);
    expect(projection.direction).toBe('up');
    expect(projection.baseGapHeight).toBe(10);
    // 1:1 measured: 2 * 105 - 90 = 120
    expect(projection.measuredTarget).toBe(120);

    // 标准差扩展位: top = 110
    expect(projection.sdTargets.sd1_0).toBe(120); // 110 + 10
    expect(projection.sdTargets.sd2_0).toBe(130); // 110 + 20
    expect(projection.sdTargets.sd2_5).toBe(135); // 110 + 25
    expect(projection.sdTargets.sd4_0).toBe(150); // 110 + 40
  });

  it('计算看跌 FVG 的对称度量投射与标准差目标箱体', () => {
    const fvg: FairValueGap = {
      id: 'test_fvg_bear',
      type: FvgType.Bearish,
      startIndex: 0,
      displacementIndex: 1,
      endIndex: 2,
      startTime: new Date('2026-01-01T09:30:00Z'),
      endTime: new Date('2026-01-01T09:40:00Z'),
      gapTop: 100,
      gapBottom: 90,
      gapSize: 10,
      consequentEncroachment: 95,
      status: FvgMitigationStatus.Unmitigated,
    };

    // 起点 originPrice = 110
    const projection = GapProjectionEngine.project(fvg, 110);
    expect(projection.direction).toBe('down');
    expect(projection.baseGapHeight).toBe(10);
    // 1:1 measured: 2 * 95 - 110 = 80
    expect(projection.measuredTarget).toBe(80);

    // 标准差向下扩展位: bottom = 90
    expect(projection.sdTargets.sd1_0).toBe(80); // 90 - 10
    expect(projection.sdTargets.sd2_0).toBe(70); // 90 - 20
    expect(projection.sdTargets.sd2_5).toBe(65); // 90 - 25
    expect(projection.sdTargets.sd4_0).toBe(50); // 90 - 40
  });
});
