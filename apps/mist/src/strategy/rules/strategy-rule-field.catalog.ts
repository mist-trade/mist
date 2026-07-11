import { StrategyRuleFieldDefinition } from './strategy-rule.types';

function getPathValue(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, context);
}

function createField(
  path: string,
  valueType: StrategyRuleFieldDefinition['valueType'],
  requiredLookbackBars: number,
): StrategyRuleFieldDefinition {
  return {
    path,
    valueType,
    requiredLookbackBars,
    resolve: (context) => getPathValue(context, path),
  };
}

export const STRATEGY_RULE_FIELD_CATALOG: Record<
  string,
  StrategyRuleFieldDefinition
> = {
  'k.open': createField('k.open', 'number', 0),
  'k.high': createField('k.high', 'number', 0),
  'k.low': createField('k.low', 'number', 0),
  'k.close': createField('k.close', 'number', 0),
  'k.volume': createField('k.volume', 'number', 0),
  'k.amount': createField('k.amount', 'number', 0),
  'security.code': createField('security.code', 'string', 0),
  'security.type': createField('security.type', 'string', 0),
  'indicator.macd.macd': createField('indicator.macd.macd', 'number', 34),
  'indicator.macd.signal': createField('indicator.macd.signal', 'number', 34),
  'indicator.macd.histogram': createField(
    'indicator.macd.histogram',
    'number',
    34,
  ),
  'indicator.rsi14': createField('indicator.rsi14', 'number', 14),
  'indicator.kdj.k': createField('indicator.kdj.k', 'number', 13),
  'indicator.kdj.d': createField('indicator.kdj.d', 'number', 13),
  'indicator.kdj.j': createField('indicator.kdj.j', 'number', 13),
  'indicator.adx14': createField('indicator.adx14', 'number', 28),
  'indicator.atr14': createField('indicator.atr14', 'number', 14),
  'indicator.ma13': createField('indicator.ma13', 'number', 12),
  'indicator.ma60': createField('indicator.ma60', 'number', 59),
};

export function getStrategyRuleField(
  path: string,
): StrategyRuleFieldDefinition | undefined {
  return STRATEGY_RULE_FIELD_CATALOG[path];
}
