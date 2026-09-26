import { FenxingType, type ChanK } from '@app/chancore';
import { detectLatestConfirmedFenxing } from './chan-fenxing-trigger';

describe('detectLatestConfirmedFenxing (分型边缘触发器)', () => {
  const makeK = (
    id: number,
    timeStr: string,
    open: number,
    high: number,
    low: number,
    close: number,
  ): ChanK => ({
    id,
    symbol: '000001',
    time: new Date(timeStr),
    open,
    high,
    low,
    close,
    volume: null,
    amount: null,
  });

  it('不足 3 根 K 线时返回 null', () => {
    const klines: ChanK[] = [
      makeK(1, '2026-01-01 09:30:00', 10, 11, 9, 10),
      makeK(2, '2026-01-01 09:35:00', 10, 10.5, 9.5, 10),
    ];
    expect(detectLatestConfirmedFenxing(klines)).toBeNull();
  });

  it('标准 3 根 K 线底分型在第 3 根确认 Bar 成功触发', () => {
    const klines: ChanK[] = [
      makeK(1, '2026-01-01 09:30:00', 12, 13, 11, 11.5), // 左侧根: high 13, low 11
      makeK(2, '2026-01-01 09:35:00', 11.5, 12, 9, 9.5), // 极值根: high 12, low 9 (创新低)
      makeK(3, '2026-01-01 09:40:00', 9.5, 12.5, 9.2, 12), // 确认根: high 12.5, low 9.2 (翻起)
    ];

    const res = detectLatestConfirmedFenxing(klines);
    expect(res).not.toBeNull();
    expect(res?.type).toBe(FenxingType.Bottom);
    expect(res?.extremumPrice).toBe(9);
    expect(res?.extremumTime).toEqual(new Date('2026-01-01 09:35:00'));
    expect(res?.confirmedTime).toEqual(new Date('2026-01-01 09:40:00'));
    expect(res?.stopLossPrice).toBe(9);
  });

  it('底分型确认后，第 4 根与第 5 根向上延伸 Bar 自动复位返回 null (单次边缘特性)', () => {
    const klines: ChanK[] = [
      makeK(1, '2026-01-01 09:30:00', 12, 13, 11, 11.5),
      makeK(2, '2026-01-01 09:35:00', 11.5, 12, 9, 9.5),
      makeK(3, '2026-01-01 09:40:00', 9.5, 12.5, 9.2, 12), // 确认 Bar: 触发
    ];

    // 第 3 根确认
    expect(detectLatestConfirmedFenxing(klines)?.type).toBe(FenxingType.Bottom);

    // 第 4 根延续向上（高点更高，低点更高）
    klines.push(makeK(4, '2026-01-01 09:45:00', 12, 13.5, 11.5, 13));
    expect(detectLatestConfirmedFenxing(klines)).toBeNull();

    // 第 5 根继续向上
    klines.push(makeK(5, '2026-01-01 09:50:00', 13, 14.5, 12.8, 14));
    expect(detectLatestConfirmedFenxing(klines)).toBeNull();
  });

  it('标准 3 根 K 线顶分型在第 3 根确认 Bar 成功触发', () => {
    const klines: ChanK[] = [
      makeK(1, '2026-01-01 09:30:00', 10, 11.5, 9.8, 11), // 左侧根
      makeK(2, '2026-01-01 09:35:00', 11, 13.5, 10.5, 13), // 极值根: high 13.5 (最高)
      makeK(3, '2026-01-01 09:40:00', 13, 12.5, 10.2, 10.5), // 确认根: 回落击穿
    ];

    const res = detectLatestConfirmedFenxing(klines);
    expect(res).not.toBeNull();
    expect(res?.type).toBe(FenxingType.Top);
    expect(res?.extremumPrice).toBe(13.5);
    expect(res?.extremumTime).toEqual(new Date('2026-01-01 09:35:00'));
    expect(res?.confirmedTime).toEqual(new Date('2026-01-01 09:40:00'));
  });

  it('包含关系的 K 线被合并后，不产生伪分型，合并确立后正确识别', () => {
    // K2 (high 10, low 9) 包含了 K3 (high 9.8, low 9.2) - 属于向下包含
    const klines: ChanK[] = [
      makeK(1, '2026-01-01 09:30:00', 11, 12, 10.5, 11),
      makeK(2, '2026-01-01 09:35:00', 10.5, 10, 9.0, 9.5),
      makeK(3, '2026-01-01 09:40:00', 9.5, 9.8, 9.2, 9.3), // 内包在 K2 内
    ];

    // 此时 K2 和 K3 应该被合并，合并后实际上只有 2 根合并 K 线，无法构成 3 根分型
    expect(detectLatestConfirmedFenxing(klines)).toBeNull();

    // 随后走出第 4 根强反弹 K4 (high 11, low 9.5)
    klines.push(makeK(4, '2026-01-01 09:45:00', 9.3, 11.0, 9.4, 10.8));

    // 现在 [K1, (K2+K3合并), K4] 构成了标准的 3 根合并底分型，且当前位于 K4
    const res = detectLatestConfirmedFenxing(klines);
    expect(res).not.toBeNull();
    expect(res?.type).toBe(FenxingType.Bottom);
    expect(res?.confirmedTime).toEqual(new Date('2026-01-01 09:45:00'));
    expect(res?.mergedCount).toBe(2); // K2+K3 合并
  });
});
