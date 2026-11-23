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

    // 包含 1:1 度量投射目标线
    const projLine = commands.find(
      (c) => c.layer === 'pa_projection' && c.type === 'line',
    );
    expect(projLine).toBeDefined();
    if (projLine && projLine.type === 'line') {
      expect(projLine.style).toBe('dotted');
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

  it('处理空序列返回空指令集', () => {
    expect(PaVisualAdapter.convert([])).toEqual([]);
  });
});
