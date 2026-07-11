import { StrategyEvaluationContextBuilder } from './strategy-evaluation-context.builder';

describe('StrategyEvaluationContextBuilder', () => {
  const createK = (index: number, close: number) => ({
    security: { code: '600519', type: 'STOCK' },
    timestamp: new Date(Date.UTC(2026, 0, index + 1)),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000n,
    amount: close * 1000,
  });

  it('calculates indicator values from bars completed at the evaluation time', () => {
    const builder = new StrategyEvaluationContextBuilder();
    const completedBars = Array.from({ length: 13 }, (_, index) =>
      createK(index, index + 1),
    );
    const current = completedBars[12];
    const futureBar = createK(13, 1000);

    const context = (builder as any).buildFromK(current, [
      ...completedBars,
      futureBar,
    ]);

    expect((context as any).indicator).toMatchObject({ ma13: 7 });
  });

  it('exposes every registered indicator from bounded completed history', () => {
    const builder = new StrategyEvaluationContextBuilder();
    const completedBars = Array.from({ length: 90 }, (_, index) =>
      createK(index, index + 1),
    );
    const current = completedBars[89];

    const context = (builder as any).buildFromK(current, completedBars, 89);

    expect((context as any).indicator).toMatchObject({
      macd: {
        macd: expect.any(Number),
        signal: expect.any(Number),
        histogram: expect.any(Number),
      },
      rsi14: expect.any(Number),
      kdj: {
        k: expect.any(Number),
        d: expect.any(Number),
        j: expect.any(Number),
      },
      adx14: expect.any(Number),
      atr14: expect.any(Number),
      ma13: expect.any(Number),
      ma60: expect.any(Number),
    });
  });
});
