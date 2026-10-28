import { ChanBspFactorPlugin } from './chan-bsp.plugin';

describe('ChanBspFactorPlugin 增量与分型扳机测试', () => {
  let plugin: ChanBspFactorPlugin;

  beforeEach(() => {
    plugin = new ChanBspFactorPlugin();
    plugin.resetCursors();
  });

  it('默认 deduplicate 为 true，在 params 为空或未传 deduplicate 时自动生效', () => {
    const resolved = (plugin as any).resolveParams({});
    expect(resolved.deduplicate).toBe(true);
  });

  it('显式传入 deduplicate: false 时，允许关闭去重', () => {
    const resolved = (plugin as any).resolveParams({ deduplicate: false });
    expect(resolved.deduplicate).toBe(false);
  });

  it('requireConfirmedFenxing 默认关闭，显式开启后生效', () => {
    const resolvedDefault = (plugin as any).resolveParams({});
    expect(resolvedDefault.requireConfirmedFenxing).toBe(false);

    const resolvedActive = (plugin as any).resolveParams({
      requireConfirmedFenxing: true,
    });
    expect(resolvedActive.requireConfirmedFenxing).toBe(true);
  });
  function makeMockProjectedBar(time: Date, period = 30) {
    return {
      rawBar: {
        securityId: 1,
        source: 'qmt',
        period,
        timestamp: time,
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: '1000',
        amount: '10000',
        type: 'complete',
      },
      tradingDay: '2025-09-15',
      ohlc: {
        raw: { open: 10, high: 11, low: 9, close: 10 },
        effective: { open: 10, high: 11, low: 9, close: 10 },
        resolution: 'observed',
      },
      volume: {
        raw: '1000',
        effective: '1000',
        resolution: 'observed',
      },
      amount: {
        raw: '10000',
        effective: '10000',
        resolution: 'observed',
      },
    };
  }

  it('同一时间点同时出现2买和3买时，两者均作为有效候选信号保留并输出', async () => {
    const timeA = new Date('2025-09-15T10:00:00.000Z');
    const mockEvents = [
      {
        type: 'second_buy' as const,
        units: 'bi' as const,
        time: timeA,
        price: 3800,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 10,
      },
      {
        type: 'third_buy' as const,
        units: 'bi' as const,
        time: timeA,
        price: 3820,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 11,
      },
    ];

    jest.spyOn(plugin as any, 'detectEvents').mockReturnValue(mockEvents);

    const context = {
      securityId: 1,
      securityCode: '000001',
      timestamp: timeA,
      period: 30,
      bars: Array.from({ length: 60 }, (_, i) =>
        makeMockProjectedBar(new Date(timeA.getTime() + i * 60000), 30),
      ),
      attributes: new Map(),
    };

    const opinion = await plugin.evaluate(context as any);
    expect(opinion.action).toBe('BUY');
    expect(opinion.evidence?.allCandidatesCount).toBe(2);
    expect(opinion.evidence?.candidateEvents).toHaveLength(2);
    const types = (opinion.evidence?.candidateEvents as any[]).map(
      (e) => e.eventType,
    );
    expect(types).toContain('second_buy');
    expect(types).toContain('third_buy');
  });

  it('同一时间点出现多个相同类型的买卖点时，精确去重仅保留一次', async () => {
    const timeA = new Date('2025-09-15T10:00:00.000Z');
    const mockEvents = [
      {
        type: 'second_buy' as const,
        units: 'bi' as const,
        time: timeA,
        price: 3800,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 10,
      },
      {
        type: 'second_buy' as const,
        units: 'bi' as const,
        time: timeA,
        price: 3800,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 10,
      },
    ];

    jest.spyOn(plugin as any, 'detectEvents').mockReturnValue(mockEvents);

    const context = {
      securityId: 1,
      securityCode: '000001',
      timestamp: timeA,
      period: 30,
      bars: Array.from({ length: 60 }, (_, i) =>
        makeMockProjectedBar(new Date(timeA.getTime() + i * 60000), 30),
      ),
      attributes: new Map(),
    };

    const opinion = await plugin.evaluate(context as any);
    expect(opinion.action).toBe('BUY');
    expect(opinion.evidence?.allCandidatesCount).toBe(1);
    expect(opinion.evidence?.candidateEvents).toHaveLength(1);
    expect((opinion.evidence?.candidateEvents as any[])[0].eventType).toBe(
      'second_buy',
    );
  });

  it('时间 A 出现 3 买，时间 B（A+30m）再次出现 3 买时，两者均为有效信号正常输出', async () => {
    const timeA = new Date('2025-09-15T10:00:00.000Z');
    const timeB = new Date('2025-09-15T10:30:00.000Z');

    const makeContext = (time: Date) => ({
      securityId: 1,
      securityCode: '000001',
      timestamp: time,
      period: 30,
      bars: Array.from({ length: 60 }, (_, i) =>
        makeMockProjectedBar(new Date(time.getTime() + i * 60000), 30),
      ),
      attributes: new Map(),
    });

    // 第一次评估：时间 A 出现 3 买
    jest.spyOn(plugin as any, 'detectEvents').mockReturnValue([
      {
        type: 'third_buy' as const,
        units: 'bi' as const,
        time: timeA,
        price: 3800,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 10,
      },
    ]);

    const op1 = await plugin.evaluate(makeContext(timeA) as any);
    expect(op1.action).toBe('BUY');
    expect(op1.evidence?.candidateEvents).toHaveLength(1);
    expect((op1.evidence?.candidateEvents as any[])[0].time).toBe(
      timeA.toISOString(),
    );

    // 第二次评估：滑窗重扫仍检测到时间 A 的 3 买，以及时间 B 的新 3 买
    jest.spyOn(plugin as any, 'detectEvents').mockReturnValue([
      {
        type: 'third_buy' as const,
        units: 'bi' as const,
        time: timeA,
        price: 3800,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 10,
      },
      {
        type: 'third_buy' as const,
        units: 'bi' as const,
        time: timeB,
        price: 3850,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 12,
      },
    ]);

    const op2 = await plugin.evaluate(makeContext(timeB) as any);
    expect(op2.action).toBe('BUY');
    // 时间 A 的 3 买已被去重过滤，时间 B 的 3 买成功发射
    expect(op2.evidence?.allCandidatesCount).toBe(1);
    expect(op2.evidence?.candidateEvents).toHaveLength(1);
    expect((op2.evidence?.candidateEvents as any[])[0].time).toBe(
      timeB.toISOString(),
    );
  });

  it('不同时间周期（如 5m 与 30m）具有独立的作用域隔离', async () => {
    const timeA = new Date('2025-09-15T10:00:00.000Z');

    const makeContext = (period: number) => ({
      securityId: 1,
      securityCode: '000001',
      timestamp: timeA,
      period,
      bars: Array.from({ length: 60 }, (_, i) =>
        makeMockProjectedBar(new Date(timeA.getTime() + i * 60000), period),
      ),
      attributes: new Map(),
    });

    jest.spyOn(plugin as any, 'detectEvents').mockReturnValue([
      {
        type: 'second_buy' as const,
        units: 'bi' as const,
        time: timeA,
        price: 3800,
        zhongshuIndex: 1,
        zg: 3850,
        zd: 3750,
        unitIndex: 10,
      },
    ]);

    // 5m 周期触发
    const op5m = await plugin.evaluate(makeContext(5) as any);
    expect(op5m.action).toBe('BUY');

    // 30m 周期在相同时间点依然能独立触发，不受 5m 影响
    const op30m = await plugin.evaluate(makeContext(30) as any);
    expect(op30m.action).toBe('BUY');
  });

  it('支持 units: "duan" 线段级买卖点判定，正确输出线段级买卖点与双时间戳', async () => {
    const barTime = new Date('2025-09-15T11:30:00.000Z');
    const pivotTime = new Date('2025-09-15T10:45:00.000Z');

    const context = {
      securityId: 1,
      securityCode: '000001',
      timestamp: barTime,
      period: 5,
      bars: Array.from({ length: 60 }, (_, i) =>
        makeMockProjectedBar(new Date(barTime.getTime() - (60 - i) * 60000), 5),
      ),
      attributes: new Map(),
    };

    jest.spyOn(plugin as any, 'detectEvents').mockReturnValue([
      {
        type: 'third_buy' as const,
        units: 'duan' as const,
        time: pivotTime,
        price: 3900,
        zhongshuIndex: 0,
        zg: 3880,
        zd: 3820,
        unitIndex: 4,
      },
    ]);

    const op = await plugin.evaluate(context as any, {
      units: 'duan',
      requiredBarCount: 30,
    });
    expect(op.action).toBe('BUY');
    expect(op.reason).toContain('缠论线段级三买确认');
    expect(op.evidence?.units).toBe('duan');
    expect(op.evidence?.triggerTime).toBe(barTime.toISOString());
    expect(op.evidence?.pivotTime).toBe(pivotTime.toISOString());
    expect(op.evidence?.pivotPrice).toBe(3900);
  });

  it('透传官方合并K线 geometry.mergedKs，并正确计算 latestMergedIndex 与 isLatestContained', async () => {
    const baseTime = new Date('2025-09-15T09:30:00.000Z');
    // 构造 60 根连续 K 线，最后一根不包含（突破新高）
    const barsNonContained = Array.from({ length: 60 }, (_, i) => {
      const time = new Date(baseTime.getTime() + i * 60000);
      const bar = makeMockProjectedBar(time, 5);
      const high = 10 + i * 0.1;
      const low = 9 + i * 0.1;
      const close = 9.5 + i * 0.1;
      bar.ohlc.effective = { open: low, high, low, close };
      bar.ohlc.raw = { open: low, high, low, close };
      return bar;
    });

    const attributesNonContained = new Map<string, any>();
    const contextNonContained = {
      securityId: 1,
      securityCode: '000001',
      timestamp: new Date(baseTime.getTime() + 60 * 60000),
      period: 5,
      bars: barsNonContained,
      attributes: attributesNonContained,
    };

    await plugin.evaluate(contextNonContained as any);
    const geometry1 = attributesNonContained.get('chan.geometry');
    expect(geometry1).toBeDefined();
    expect(geometry1.mergedKs).toBeDefined();
    expect(Array.isArray(geometry1.mergedKs)).toBe(true);
    expect(geometry1.mergedKs.length).toBeGreaterThan(0);
    expect(geometry1.latestMergedIndex).toBe(geometry1.mergedKs.length - 1);
    expect(geometry1.isLatestContained).toBe(false);

    const firstMerged = geometry1.mergedKs[0];
    expect(typeof firstMerged.index).toBe('number');
    expect(typeof firstMerged.high).toBe('number');
    expect(typeof firstMerged.low).toBe('number');
    expect(typeof firstMerged.startTime).toBe('string');
    expect(typeof firstMerged.endTime).toBe('string');
    expect(typeof firstMerged.trend).toBe('string');
    expect(typeof firstMerged.mergedCount).toBe('number');

    // 构造第 60 根为孕线（完全落在第 59 根的 high 与 low 之内）
    const barsContained = Array.from({ length: 60 }, (_, i) => {
      const time = new Date(baseTime.getTime() + i * 60000);
      const bar = makeMockProjectedBar(time, 5);
      if (i === 58) {
        // 第 59 根：宽幅包容线
        bar.ohlc.effective = { open: 15, high: 20, low: 10, close: 16 };
      } else if (i === 59) {
        // 第 60 根：孕线包含在第 59 根内
        bar.ohlc.effective = { open: 14, high: 16, low: 13, close: 15 };
      } else {
        const high = 10 + i * 0.05;
        const low = 9 + i * 0.05;
        bar.ohlc.effective = { open: low, high, low, close: high };
      }
      bar.ohlc.raw = bar.ohlc.effective;
      return bar;
    });

    const attributesContained = new Map<string, any>();
    const contextContained = {
      securityId: 1,
      securityCode: '000001',
      timestamp: new Date(baseTime.getTime() + 60 * 60000),
      period: 5,
      bars: barsContained,
      attributes: attributesContained,
    };

    await plugin.evaluate(contextContained as any);
    const geometry2 = attributesContained.get('chan.geometry');
    expect(geometry2).toBeDefined();
    expect(geometry2.isLatestContained).toBe(true);
    expect(
      geometry2.mergedKs[geometry2.latestMergedIndex].mergedCount,
    ).toBeGreaterThan(1);
  });
});
