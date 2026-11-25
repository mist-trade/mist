import { PaK } from '@app/pacore';
import { PaVisualAdapter } from './pa-visual.adapter';

describe('PaVisualAdapter (纯价格行为图元适配器)', () => {
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

  it('将 K 线序列中的 FVG、CE 轴心与空间投射转换为对应图元指令', () => {
    const klines: PaK[] = [
      createBar(1, 100, 105, 99, 104), // k0: high = 105
      createBar(2, 104, 115, 103, 114), // k1: displacement bar
      createBar(3, 114, 120, 110, 118), // k2: low = 110 (Bullish FVG: 105 ~ 110)
      createBar(4, 118, 119, 112, 117), // k3: 未触及
    ];

    const commands = PaVisualAdapter.convert(klines);

    // 包含 FVG 色带 (band)
    const band = commands.find(
      (c) => c.layer === 'pa_fvg' && c.type === 'band',
    );
    expect(band).toBeDefined();
    if (band && band.type === 'band') {
      expect(band.top).toBe(110);
      expect(band.bottom).toBe(105);
      expect(band.fill).toBe(true);
    }

    // 包含 50% CE 轴心虚线 (line)
    const ceLine = commands.find(
      (c) => c.layer === 'pa_fvg_ce' && c.type === 'line',
    );
    expect(ceLine).toBeDefined();
    if (ceLine && ceLine.type === 'line') {
      expect(ceLine.startPrice).toBe(107.5);
      expect(ceLine.style).toBe('dashed');
    }

    // 包含 1:1 度量投射目标线（不应退化为 gapTop=110，应基于推动起点 99 投射到 116）
    const projLine = commands.find(
      (c) => c.layer === 'pa_projection' && c.type === 'line',
    );
    expect(projLine).toBeDefined();
    if (projLine && projLine.type === 'line') {
      expect(projLine.style).toBe('dotted');
      expect(projLine.startPrice).toBe(116);
      expect(projLine.startPrice).toBeGreaterThan(110);
    }
  });

  it('正确将 Pin Bar 转换为图表箭头与文本图元', () => {
    const klines: PaK[] = [
      createBar(1, 100, 103, 99.5, 102), // 正常阳线，无下影线
      // 探底针：low = 90, high = 100, open = 98, close = 99 (下影线 = 8, 振幅 = 10)
      createBar(2, 98, 100, 90, 99),
    ];

    const commands = PaVisualAdapter.convert(klines, { includeFvg: false });

    const icon = commands.find(
      (c) => c.layer === 'pa_pin' && c.type === 'icon',
    );
    expect(icon).toBeDefined();
    if (icon && icon.type === 'icon') {
      expect(icon.shape).toBe('arrow_up');
      expect(icon.price).toBe(90);
    }

    const text = commands.find(
      (c) => c.layer === 'pa_pin' && c.type === 'text',
    );
    expect(text).toBeDefined();
    if (text && text.type === 'text') {
      expect(text.text).toBe('Pin多');
    }
  });

  it('正确将双底形态转换为颈线、骨架、测距标尺与目标位图元', () => {
    const klines: PaK[] = [
      createBar(1, 105, 106, 99, 100),
      createBar(2, 100, 101, 94, 95),
      createBar(3, 95, 96, 90, 91), // 底1: Low=90
      createBar(4, 91, 95, 91, 94),
      createBar(5, 94, 98, 93, 97),
      createBar(6, 97, 100, 96, 99.5), // 峰值: High=100
      createBar(7, 99.5, 100, 94, 95),
      createBar(8, 95, 96, 91, 92),
      createBar(9, 92, 94, 91, 93.5), // 底2: Low=91
      createBar(10, 93.5, 97, 93, 96.5),
      createBar(11, 96.5, 99.8, 96, 99.2),
      createBar(12, 99.2, 102.5, 98.5, 101.8), // 突破: Close=101.8 > 100
      createBar(13, 101.8, 111, 101, 110.5), // 达标 1:1 (110)
    ];

    const commands = PaVisualAdapter.convert(klines, {
      includeFvg: false,
      includePinBars: false,
    });

    // 1. 颈线基准实线 (pa_neckline)
    const neckLine = commands.find(
      (c) => c.layer === 'pa_neckline' && c.id.includes('neckline'),
    );
    expect(neckLine).toBeDefined();
    expect(neckLine?.type).toBe('line');
    if (neckLine && neckLine.type === 'line') {
      expect(neckLine.startPrice).toBe(100);
      expect(neckLine.style).toBe('solid');
      expect(neckLine.color).toBe('#06b6d4'); // 看涨青色
    }

    // 2. 1:1 对称目标线 (pa_neckline, style dashed, target=110)
    const target1Line = commands.find(
      (c) => c.layer === 'pa_neckline' && c.id.includes('t1_0'),
    );
    expect(target1Line).toBeDefined();
    if (target1Line && target1Line.type === 'line') {
      expect(target1Line.startPrice).toBe(110);
      expect(target1Line.style).toBe('dashed');
    }

    // 3. 目标价格文本标签 (pa_neckline)
    const labelCmd = commands.find(
      (c) => c.layer === 'pa_neckline' && c.type === 'text',
    );
    expect(labelCmd).toBeDefined();
    if (labelCmd && labelCmd.type === 'text') {
      expect(labelCmd.text).toContain('1:1目标 110.00');
    }

    // 4. 回抽敏感带 (band)
    const retestBand = commands.find(
      (c) => c.layer === 'pa_neckline' && c.type === 'band',
    );
    expect(retestBand).toBeDefined();
    if (retestBand && retestBand.type === 'band') {
      expect(retestBand.top).toBeGreaterThan(100);
      expect(retestBand.bottom).toBeLessThan(100);
      expect(retestBand.fill).toBe(true);
    }
  });

  it('图层过滤测试: 当 includeNecklines=false 时不产生任何 pa_neckline 指令', () => {
    const klines: PaK[] = [
      createBar(1, 105, 106, 99, 100),
      createBar(2, 100, 101, 94, 95),
      createBar(3, 95, 96, 90, 91),
      createBar(4, 91, 95, 91, 94),
      createBar(5, 94, 98, 93, 97),
      createBar(6, 97, 100, 96, 99.5),
      createBar(7, 99.5, 100, 94, 95),
      createBar(8, 95, 96, 91, 92),
      createBar(9, 92, 94, 91, 93.5),
      createBar(10, 93.5, 97, 93, 96.5),
      createBar(11, 96.5, 99.8, 96, 99.2),
      createBar(12, 99.2, 102.5, 98.5, 101.8),
    ];

    const commands = PaVisualAdapter.convert(klines, {
      includeNecklines: false,
    });

    const necklineCmds = commands.filter((c) => c.layer === 'pa_neckline');
    expect(necklineCmds).toHaveLength(0);
  });

  it('处理空序列返回空指令集', () => {
    expect(PaVisualAdapter.convert([])).toEqual([]);
  });
});
