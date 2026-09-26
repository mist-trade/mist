import type { StrategyBar } from '@app/market-data';
import { StrategySimulationEngine } from './strategy-simulation.engine';
import { StrategySimulationSession } from './strategy-simulation.session';
import {
  createChanBspDecisionFlow,
  createTacticsDecisionFlow,
} from './standard-simulation-flows';

function makeMockBars(count: number, startPrice = 10): StrategyBar[] {
  const bars: StrategyBar[] = [];
  const baseTime = new Date('2024-01-02T09:30:00.000Z').getTime();

  let price = startPrice;
  for (let i = 0; i < count; i++) {
    // 构造一些波动态，使得能形成笔与中枢
    const change = Math.sin(i / 5) * 0.5;
    price += change;
    const open = Math.round(price * 100) / 100;
    const close = Math.round((price + (i % 2 === 0 ? 0.2 : -0.2)) * 100) / 100;
    const high = Math.round((Math.max(open, close) + 0.3) * 100) / 100;
    const low = Math.round((Math.min(open, close) - 0.3) * 100) / 100;

    bars.push({
      securityId: 1,
      source: 'qmt',
      period: 30,
      timestamp: new Date(baseTime + i * 30 * 60 * 1000),
      open,
      high,
      low,
      close,
      volume: '10000',
      amount: '100000',
      type: 'complete',
    });
  }

  return bars;
}

describe('StrategySimulationEngine', () => {
  const mockBars = makeMockBars(100);

  it('correctly splits pre-warming and replay bars according to startDate', () => {
    const startDate = mockBars[30].timestamp;
    const engine = new StrategySimulationEngine(mockBars, {
      securityCode: '000001',
      period: 30,
      startDate,
      flow: createChanBspDecisionFlow(),
      windowBudget: 20,
    });

    expect(engine.preWarmCount).toBe(20);
    expect(engine.totalBars).toBe(70);
    expect(engine.currentCursor).toBe(-1);
  });

  it('steps forward bar by bar and captures visual commands and signals through Decision Flow', async () => {
    const engine = new StrategySimulationEngine(mockBars, {
      securityCode: '000001',
      period: 30,
      flow: createChanBspDecisionFlow(),
    });

    const frame1 = await engine.stepNext();
    expect(frame1).not.toBeNull();
    expect(frame1?.cursor).toBe(0);
    expect(frame1?.bar.timestamp).toEqual(mockBars[0].timestamp);
    expect(frame1?.windowBars).toBeDefined();
    expect(frame1?.windowBars.length).toBeGreaterThan(0);

    const frame2 = await engine.stepNext();
    expect(frame2?.cursor).toBe(1);
    expect(frame2?.bar.timestamp).toEqual(mockBars[1].timestamp);
  });

  it('supports stepPrev and seek with snapshot frame caching', async () => {
    const engine = new StrategySimulationEngine(mockBars, {
      securityCode: '000001',
      period: 30,
      flow: createChanBspDecisionFlow(),
    });

    // 快进到第 10 根
    const frame10 = await engine.seek(10);
    expect(frame10?.cursor).toBe(10);
    expect(engine.currentCursor).toBe(10);

    // 单步后退到第 9 根
    const frame9 = engine.stepPrev();
    expect(frame9?.cursor).toBe(9);
    expect(engine.currentCursor).toBe(9);

    // 回退到第 0 根
    const frame0 = await engine.seek(0);
    expect(frame0?.cursor).toBe(0);
    expect(engine.currentCursor).toBe(0);
  });

  it('integrates four-quadrant tactics into Decision Flow smoothly', async () => {
    const engine = new StrategySimulationEngine(mockBars, {
      securityCode: '000001',
      period: 30,
      flow: createTacticsDecisionFlow(),
    });

    await engine.seek(40);
    expect(engine.currentCursor).toBe(40);
    const frames = engine.getGeneratedFrames();
    expect(frames.length).toBe(41);
  });

  it('correctly maps specific Chan BSP types into 1买/2买/3买 badges', () => {
    const engine = new StrategySimulationEngine(mockBars, {
      securityCode: '000001',
      period: 30,
      flow: createChanBspDecisionFlow(),
    });

    const traceWithThirdBuy = [
      {
        nodeId: 'guard_chan_bsp',
        type: 'GUARD',
        name: '缠论形态买卖点标准门禁',
        action: 'BUY',
        confidence: 0.9,
        reason: '缠论笔级三买确认',
        evidence: {
          eventType: 'third_buy',
          units: 'bi',
          price: 3900,
        },
      },
    ];

    const extracted = (engine as any).extractBspEvidence(traceWithThirdBuy);
    expect(extracted).not.toBeNull();
    expect(extracted.type).toBe('third_buy');
    expect((engine as any).formatBadgeText('third_buy', true)).toBe('3买');
    expect((engine as any).formatBadgeText('first_buy', true)).toBe('1买');
    expect((engine as any).formatBadgeText('second_buy', true)).toBe('2买');
    expect((engine as any).formatBadgeText('third_buy', true)).toBe('3买');
    expect((engine as any).formatBadgeText('first_sell', false)).toBe('1卖');
    expect((engine as any).formatBadgeText('second_sell', false)).toBe('2卖');
    expect((engine as any).formatBadgeText('third_sell', false)).toBe('3卖');
  });

  it('silently hydrates pre-warm bars without emitting historical signals on bar 0', async () => {
    const bars = makeMockBars(100);
    const startDate = bars[40].timestamp;
    const engine = new StrategySimulationEngine(bars, {
      securityCode: '000001',
      period: 30,
      startDate,
      flow: createChanBspDecisionFlow(),
      windowBudget: 50,
    });

    const frame0 = await engine.stepNext();
    expect(frame0).not.toBeNull();
    expect(frame0?.cursor).toBe(0);
    // 第 0 步不应该泄漏预热区间已经形成的陈旧买卖点
    expect(frame0?.signals.length).toBe(0);
  });
});

describe('StrategySimulationSession', () => {
  const mockBars = makeMockBars(50);

  it('manages play/pause/step/seek lifecycle and dispatches events', async () => {
    const onFrame = jest.fn();
    const onStatusChange = jest.fn();

    const session = new StrategySimulationSession(
      mockBars,
      {
        securityCode: '000001',
        period: 30,
        flow: createChanBspDecisionFlow(),
      },
      { onFrame, onStatusChange },
    );

    expect(session.currentStatus).toBe('idle');

    // 1. step_next
    await session.control({ action: 'step_next' });
    expect(session.engine.currentCursor).toBe(0);
    expect(onFrame).toHaveBeenCalledTimes(1);

    // 2. seek
    await session.control({ action: 'seek', param: 5 });
    expect(session.engine.currentCursor).toBe(5);
    expect(onFrame).toHaveBeenCalledTimes(2);

    // 3. play & pause
    session.play();
    expect(session.currentStatus).toBe('playing');
    expect(onStatusChange).toHaveBeenCalledWith('playing');

    session.pause();
    expect(session.currentStatus).toBe('paused');
    expect(onStatusChange).toHaveBeenCalledWith('paused');

    // 4. destroy
    session.destroy();
    expect(session.currentStatus).toBe('completed');
  });
});
