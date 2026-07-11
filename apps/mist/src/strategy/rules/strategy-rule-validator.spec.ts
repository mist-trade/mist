import { BadRequestException } from '@nestjs/common';
import { STRATEGY_RULE_FIELD_CATALOG } from './strategy-rule-field.catalog';
import { StrategyRuleValidator } from './strategy-rule-validator';

describe('StrategyRuleValidator', () => {
  let validator: StrategyRuleValidator;

  beforeEach(() => {
    validator = new StrategyRuleValidator();
  });

  it('registers only the V1 fields that have a shared historical resolver', () => {
    expect(Object.keys(STRATEGY_RULE_FIELD_CATALOG).sort()).toEqual([
      'indicator.adx14',
      'indicator.atr14',
      'indicator.kdj.d',
      'indicator.kdj.j',
      'indicator.kdj.k',
      'indicator.ma13',
      'indicator.ma60',
      'indicator.macd.histogram',
      'indicator.macd.macd',
      'indicator.macd.signal',
      'indicator.rsi14',
      'k.amount',
      'k.close',
      'k.high',
      'k.low',
      'k.open',
      'k.volume',
      'security.code',
      'security.type',
    ]);
  });

  it('accepts declarative expressions over the registered V1 field catalog', () => {
    const summary = validator.validate({
      all: [
        { field: 'k.close', operator: 'gt', value: 10 },
        {
          field: 'indicator.macd.histogram',
          operator: 'crossesAbove',
          value: 0,
        },
        { field: 'security.type', operator: 'eq', value: 'STOCK' },
      ],
    });

    expect(summary).toEqual({
      ruleSchemaVersion: 'v1',
      conditionCount: 3,
      fieldRoots: ['indicator', 'k', 'security'],
      operators: ['crossesAbove', 'eq', 'gt'],
      requiredLookbackBars: 34,
    });
  });

  it('rejects nested fields that are not in the V1 field catalog', () => {
    expect(() =>
      validator.validate({
        field: 'indicator.macd.unknown',
        operator: 'gt',
        value: 0,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects Chan fields until an as-of resolver is registered', () => {
    expect(() =>
      validator.validate({
        field: 'chan.bi.direction',
        operator: 'eq',
        value: 'up',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects comparison operators that are incompatible with a string field', () => {
    expect(() =>
      validator.validate({
        field: 'security.code',
        operator: 'crossesAbove',
        value: 10,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects unsupported operators before persistence', () => {
    expect(() =>
      validator.validate({
        field: 'k.close',
        operator: 'eval',
        value: 'close > 10',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects arbitrary executable code fields', () => {
    expect(() =>
      validator.validate({
        language: 'javascript',
        code: 'return k.close > 10',
      }),
    ).toThrow(BadRequestException);
  });
});
