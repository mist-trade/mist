export type StrategyRuleOperator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'crossesAbove'
  | 'crossesBelow';

export type StrategyRuleCondition = {
  field: string;
  operator: StrategyRuleOperator;
  value: unknown;
};

export type StrategyRuleGroup = {
  all?: StrategyRuleExpression[];
  any?: StrategyRuleExpression[];
};

export type StrategyRuleExpression = StrategyRuleCondition | StrategyRuleGroup;

export type StrategyRuleFieldValueType = 'number' | 'string';

export type StrategyRuleFieldDefinition = {
  path: string;
  valueType: StrategyRuleFieldValueType;
  requiredLookbackBars: number;
  resolve: (context: Record<string, unknown>) => unknown;
};

export type StrategyRuleValidationSummary = {
  ruleSchemaVersion: 'v1';
  conditionCount: number;
  fieldRoots: string[];
  operators: StrategyRuleOperator[];
  requiredLookbackBars: number;
};
