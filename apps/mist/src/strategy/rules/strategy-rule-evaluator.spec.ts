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
});
