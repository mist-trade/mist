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

export type StrategyRuleValidationSummary = {
  ruleSchemaVersion: 'v1';
  conditionCount: number;
  fieldRoots: string[];
  operators: StrategyRuleOperator[];
};
