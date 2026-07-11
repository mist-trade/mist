import { Injectable } from '@nestjs/common';
import { getStrategyRuleField } from './strategy-rule-field.catalog';

export type StrategyRuleEvaluationResult = {
  matched: boolean;
};

@Injectable()
export class StrategyRuleEvaluator {
  evaluate(
    rule: Record<string, unknown>,
    context: Record<string, unknown>,
    previousContext?: Record<string, unknown>,
  ): StrategyRuleEvaluationResult {
    return { matched: this.evaluateNode(rule, context, previousContext) };
  }

  private evaluateNode(
    node: Record<string, unknown>,
    context: Record<string, unknown>,
    previousContext?: Record<string, unknown>,
  ): boolean {
    if (Array.isArray(node.all)) {
      return node.all.every((child) =>
        this.evaluateNode(
          child as Record<string, unknown>,
          context,
          previousContext,
        ),
      );
    }
    if (Array.isArray(node.any)) {
      return node.any.some((child) =>
        this.evaluateNode(
          child as Record<string, unknown>,
          context,
          previousContext,
        ),
      );
    }

    return this.evaluateCondition(node, context, previousContext);
  }

  private evaluateCondition(
    condition: Record<string, unknown>,
    context: Record<string, unknown>,
    previousContext?: Record<string, unknown>,
  ): boolean {
    const field = getStrategyRuleField(String(condition.field));
    if (!field) return false;

    const actual = field.resolve(context);
    const expected = condition.value;

    switch (condition.operator) {
      case 'gt':
        return this.compareNumbers(
          actual,
          expected,
          (left, right) => left > right,
        );
      case 'gte':
        return this.compareNumbers(
          actual,
          expected,
          (left, right) => left >= right,
        );
      case 'lt':
        return this.compareNumbers(
          actual,
          expected,
          (left, right) => left < right,
        );
      case 'lte':
        return this.compareNumbers(
          actual,
          expected,
          (left, right) => left <= right,
        );
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'crossesAbove': {
        if (!previousContext) return false;
        const previousActual = field.resolve(previousContext);
        return this.compareNumbers(actual, expected, (current, threshold) =>
          this.compareNumbers(
            previousActual,
            threshold,
            (previous) => previous <= threshold && current > threshold,
          ),
        );
      }
      case 'crossesBelow': {
        if (!previousContext) return false;
        const previousActual = field.resolve(previousContext);
        return this.compareNumbers(actual, expected, (current, threshold) =>
          this.compareNumbers(
            previousActual,
            threshold,
            (previous) => previous >= threshold && current < threshold,
          ),
        );
      }
      default:
        return false;
    }
  }

  private compareNumbers(
    actual: unknown,
    expected: unknown,
    compare: (actual: number, expected: number) => boolean,
  ): boolean {
    if (
      typeof actual !== 'number' ||
      !Number.isFinite(actual) ||
      typeof expected !== 'number' ||
      !Number.isFinite(expected)
    ) {
      return false;
    }

    return compare(actual, expected);
  }
}
