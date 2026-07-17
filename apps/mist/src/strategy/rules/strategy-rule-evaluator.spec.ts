import { StrategyRuleEvaluator } from './strategy-rule-evaluator';

describe('StrategyRuleEvaluator', () => {
  let evaluator: StrategyRuleEvaluator;

  beforeEach(() => {
    evaluator = new StrategyRuleEvaluator();
  });

  it('matches declarative expressions against K-line and security context', () => {
    const result = evaluator.evaluate(
      {
        all: [
          { field: 'k.close', operator: 'gt', value: 100 },
          { field: 'security.code', operator: 'eq', value: '600519' },
        ],
      },
      {
        k: { close: 120 },
        security: { code: '600519' },
      },
    );

    expect(result).toEqual({ matched: true });
  });

  it('returns a non-match when any required condition fails', () => {
    const result = evaluator.evaluate(
      {
        all: [
          { field: 'k.close', operator: 'gt', value: 100 },
          { field: 'security.code', operator: 'eq', value: '600519' },
        ],
      },
      {
        k: { close: 80 },
        security: { code: '600519' },
      },
    );

    expect(result).toEqual({ matched: false });
  });

  it('matches crossesAbove from the prior completed context', () => {
    const result = (evaluator as any).evaluate(
      { field: 'k.close', operator: 'crossesAbove', value: 100 },
      { k: { close: 101 } },
      { k: { close: 100 } },
    );

    expect(result).toEqual({ matched: true });
  });

  it('matches crossesBelow from the prior completed context', () => {
    const result = (evaluator as any).evaluate(
      { field: 'k.close', operator: 'crossesBelow', value: 100 },
      { k: { close: 99 } },
      { k: { close: 100 } },
    );

    expect(result).toEqual({ matched: true });
  });

  it('does not match a crossover without a prior completed value', () => {
    const result = evaluator.evaluate(
      { field: 'k.close', operator: 'crossesAbove', value: 100 },
      { k: { close: 101 } },
    );

    expect(result).toEqual({ matched: false });
  });

  it('does not treat a missing number indicator as satisfying neq', () => {
    // Regression: indicator.ma60 is absent (insufficient history). Previously
    // `undefined !== 0` returned true, producing a phantom entry signal.
    const result = evaluator.evaluate(
      { field: 'indicator.ma60', operator: 'neq', value: 0 },
      { k: { close: 120 }, indicator: {} },
    );

    expect(result).toEqual({ matched: false });
  });

  it('does not treat NaN as satisfying neq for a number field', () => {
    const result = evaluator.evaluate(
      { field: 'indicator.rsi14', operator: 'neq', value: 50 },
      { k: { close: 120 }, indicator: { rsi14: Number.NaN } },
    );

    expect(result).toEqual({ matched: false });
  });

  it('does not match eq when a number field is missing', () => {
    const result = evaluator.evaluate(
      { field: 'indicator.ma60', operator: 'eq', value: 0 },
      { k: { close: 120 }, indicator: {} },
    );

    expect(result).toEqual({ matched: false });
  });

  it('does not match neq when a string field is missing', () => {
    const result = evaluator.evaluate(
      { field: 'security.type', operator: 'neq', value: 'stock' },
      { k: { close: 120 }, security: { code: '600519' } },
    );

    expect(result).toEqual({ matched: false });
  });

  it('matches neq for a present, finite, differing number', () => {
    const result = evaluator.evaluate(
      { field: 'indicator.ma60', operator: 'neq', value: 0 },
      { k: { close: 120 }, indicator: { ma60: 105 } },
    );

    expect(result).toEqual({ matched: true });
  });
});
