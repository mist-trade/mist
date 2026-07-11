import { BiStatus, BiType } from '../enums/bi.enum';
import type { BiVo } from '../vo/bi.vo';
import type { FenxingVo } from '../vo/fenxing.vo';

type CompleteBi = BiVo & {
  startFenxing: FenxingVo;
  endFenxing: FenxingVo;
};

export interface PhaseATimeStackOperations {
  canMergeThreeBis(first: BiVo, middle: BiVo, third: BiVo): boolean;
  mergeThreeBis(first: BiVo, third: BiVo): BiVo;
  isCandidateBiValid(bi: BiVo): boolean;
}

function assertCompleteBi(bi: BiVo, label: string): asserts bi is CompleteBi {
  if (bi.type !== BiType.Complete || !bi.startFenxing || !bi.endFenxing) {
    throw new Error(
      `Phase A time stack invariant failed: ${label} must be Complete`,
    );
  }
}

function rangeOf(bi: CompleteBi): string {
  return `${bi.startFenxing.middleIndex}-${bi.endFenxing.middleIndex}`;
}

function assertAdjacent(previous: CompleteBi, current: CompleteBi): void {
  if (previous.endFenxing.middleIndex !== current.startFenxing.middleIndex) {
    throw new Error(
      `Phase A time stack invariant failed: non-contiguous Bis ${rangeOf(previous)} -> ${rangeOf(current)}`,
    );
  }
}

function assertOuterBoundary(
  merged: CompleteBi,
  first: CompleteBi,
  third: CompleteBi,
): void {
  const expectedStart = first.startFenxing.middleIndex;
  const expectedEnd = third.endFenxing.middleIndex;
  if (
    merged.startFenxing.middleIndex !== expectedStart ||
    merged.endFenxing.middleIndex !== expectedEnd
  ) {
    throw new Error(
      `Phase A time stack invariant failed: merged Bi ${rangeOf(merged)} does not preserve ${expectedStart}-${expectedEnd}`,
    );
  }
}

export function reducePhaseATimeStack(
  candidates: readonly BiVo[],
  operations: PhaseATimeStackOperations,
): BiVo[] {
  const stack: BiVo[] = [];

  for (const sourceCandidate of candidates) {
    const candidate: BiVo = { ...sourceCandidate };
    assertCompleteBi(candidate, 'candidate');

    if (stack.length > 0) {
      const previous = stack[stack.length - 1];
      assertCompleteBi(previous, 'stack tail');
      assertAdjacent(previous, candidate);
    }
    stack.push(candidate);

    while (stack.length >= 3) {
      const first = stack[stack.length - 3];
      const middle = stack[stack.length - 2];
      const third = stack[stack.length - 1];
      assertCompleteBi(first, 'first');
      assertCompleteBi(middle, 'middle');
      assertCompleteBi(third, 'third');
      assertAdjacent(first, middle);
      assertAdjacent(middle, third);

      const allValid =
        first.status === BiStatus.Valid &&
        middle.status === BiStatus.Valid &&
        third.status === BiStatus.Valid;
      if (allValid) break;
      if (!operations.canMergeThreeBis(first, middle, third)) break;

      const merged = operations.mergeThreeBis(first, third);
      assertCompleteBi(merged, 'merged Bi');
      assertOuterBoundary(merged, first, third);
      const replacement: BiVo = {
        ...merged,
        status: operations.isCandidateBiValid(merged)
          ? BiStatus.Valid
          : BiStatus.Invalid,
      };
      stack.splice(stack.length - 3, 3, replacement);
    }
  }

  return stack;
}
