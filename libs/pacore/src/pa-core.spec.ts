import { PaCore } from './pa-core';
import { PaK, SweepType } from './contracts';

describe('PaCore Facade (纯几何门面集成测试)', () => {
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

  it('executeFullAnalysis 正确汇聚全部纯几何特征', () => {
    const klines: PaK[] = [
      createBar(1, 100, 105, 99, 104),
      createBar(2, 104, 115, 103, 114),
      createBar(3, 114, 120, 110, 118),
      createBar(4, 116, 117, 108, 116.5), // 下影线 Pin Bar
    ];

    const result = PaCore.executeFullAnalysis(klines);

    expect(result.fvgs).toHaveLength(1);
    expect(result.fvgs[0].consequentEncroachment).toBe(107.5);
    expect(result.projections).toHaveLength(1);
    expect(result.pinBars.length).toBeGreaterThanOrEqual(1);
  });

  it('checkLiquiditySweep 正确检测关键位扫损', () => {
    // 关键位 100，当根下探至 98 扫损，收盘拉回 101
    const bar = createBar(1, 100.5, 102, 98, 101);
    const sweep = PaCore.checkLiquiditySweep(
      bar,
      1,
      100,
      SweepType.BullishSweep,
    );

    expect(sweep).not.toBeNull();
    expect(sweep?.extremePrice).toBe(98);
    expect(sweep?.sweepDepth).toBe(2);
    expect(sweep?.rejectionWickRatio).toBe(3 / 4);
  });
});
