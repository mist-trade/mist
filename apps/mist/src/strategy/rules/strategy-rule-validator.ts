import { BadRequestException, Injectable } from '@nestjs/common';
import {
  StrategyRuleFieldDefinition,
  StrategyRuleOperator,
  StrategyRuleValidationSummary,
} from './strategy-rule.types';
import { getStrategyRuleField } from './strategy-rule-field.catalog';

const ALLOWED_OPERATORS: StrategyRuleOperator[] = [
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'neq',
  'crossesAbove',
  'crossesBelow',
];
const EXECUTABLE_KEYS = ['code', 'script', 'language', 'sql', 'function'];

type ValidationState = {
  fieldRoots: Set<string>;
  operators: Set<StrategyRuleOperator>;
  requiredLookbackBars: number;
};

@Injectable()
export class StrategyRuleValidator {
  validate(rule: unknown): StrategyRuleValidationSummary {
    const state: ValidationState = {
      fieldRoots: new Set<string>(),
      operators: new Set<StrategyRuleOperator>(),
      requiredLookbackBars: 0,
    };
    const conditionCount = this.visit(rule, state);

    if (conditionCount === 0) {
      throw new BadRequestException(
        'Strategy rule must contain at least one condition',
      );
    }

    return {
      ruleSchemaVersion: 'v1',
      conditionCount,
      fieldRoots: [...state.fieldRoots].sort(),
      operators: [...state.operators].sort(),
      requiredLookbackBars: state.requiredLookbackBars,
    };
  }

  private visit(node: unknown, state: ValidationState): number {
    if (!this.isRecord(node)) {
      throw new BadRequestException('Strategy rule nodes must be objects');
    }

    this.assertNoExecutableKeys(node);

    if ('all' in node || 'any' in node) {
      return this.visitGroup(node, state);
    }

    return this.visitCondition(node, state);
  }

  private visitGroup(
    node: Record<string, unknown>,
    state: ValidationState,
  ): number {
    const all = node.all;
    const any = node.any;

    if (all !== undefined && any !== undefined) {
      throw new BadRequestException(
        'Strategy rule group must use either all or any, not both',
      );
    }

    const children = all ?? any;
    if (!Array.isArray(children) || children.length === 0) {
      throw new BadRequestException(
        'Strategy rule group must contain at least one child expression',
      );
    }

    return children.reduce(
      (count, child) => count + this.visit(child, state),
      0,
    );
  }

  private visitCondition(
    node: Record<string, unknown>,
    state: ValidationState,
  ): number {
    if (typeof node.field !== 'string' || node.field.length === 0) {
      throw new BadRequestException('Strategy condition field is required');
    }
    if (
      typeof node.operator !== 'string' ||
      !ALLOWED_OPERATORS.includes(node.operator as StrategyRuleOperator)
    ) {
      throw new BadRequestException(
        `Unsupported strategy operator: ${String(node.operator)}`,
      );
    }
    if (!('value' in node)) {
      throw new BadRequestException('Strategy condition value is required');
    }

    const field = getStrategyRuleField(node.field);
    if (!field) {
      throw new BadRequestException(
        `Unsupported strategy field: ${node.field}`,
      );
    }

    this.assertConditionCompatibility(node, field);

    const [root] = field.path.split('.');
    state.fieldRoots.add(root);
    state.operators.add(node.operator as StrategyRuleOperator);
    state.requiredLookbackBars = Math.max(
      state.requiredLookbackBars,
      field.requiredLookbackBars,
    );
    return 1;
  }

  private assertConditionCompatibility(
    node: Record<string, unknown>,
    field: StrategyRuleFieldDefinition,
  ): void {
    const operator = node.operator as StrategyRuleOperator;
    if (
      field.valueType === 'string' &&
      operator !== 'eq' &&
      operator !== 'neq'
    ) {
      throw new BadRequestException(
        `Operator ${operator} is not supported for ${field.path}`,
      );
    }

    if (field.valueType === 'number') {
      if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
        throw new BadRequestException(
          `Strategy field ${field.path} requires a finite numeric value`,
        );
      }
      return;
    }

    if (typeof node.value !== 'string') {
      throw new BadRequestException(
        `Strategy field ${field.path} requires a string value`,
      );
    }
  }

  private assertNoExecutableKeys(node: Record<string, unknown>): void {
    const executableKey = EXECUTABLE_KEYS.find((key) => key in node);
    if (executableKey) {
      throw new BadRequestException(
        `Executable strategy field is not allowed: ${executableKey}`,
      );
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
