import { BiStatus, BiType } from '../enums/bi.enum';
import type { BiVo } from '../vo/bi.vo';

export interface PhaseBMergeOperations {
  canMergeTwoBis(head: BiVo, tail: BiVo): boolean;
  mergeTwoBis(head: BiVo, tail: BiVo): BiVo;
  isCandidateBiValid(bi: BiVo): boolean;
}

function isMergeableSpan(
  bis: readonly BiVo[],
  headIndex: number,
  tailIndex: number,
  operations: PhaseBMergeOperations,
): boolean {
  const span = bis.slice(headIndex, tailIndex + 1);
  if (
    !span.every(
      (bi) => bi.type === BiType.Complete && bi.startFenxing && bi.endFenxing,
    )
  ) {
    return false;
  }

  const head = bis[headIndex];
  const tail = bis[tailIndex];
  if (head.trend !== tail.trend) {
    return false;
  }
  if (!span.some((bi) => bi.status === BiStatus.Invalid)) {
    return false;
  }
  if (!operations.canMergeTwoBis(head, tail)) {
    return false;
  }

  const envelopeHigh = Math.max(head.highest, tail.highest);
  const envelopeLow = Math.min(head.lowest, tail.lowest);
  return span
    .slice(1, -1)
    .every(
      (middle) =>
        middle.highest <= envelopeHigh && middle.lowest >= envelopeLow,
    );
}

export function mergeBiSegments(
  phaseABis: readonly BiVo[],
  operations: PhaseBMergeOperations,
): BiVo[] {
  const bis = phaseABis.map((bi) => ({ ...bi }));

  while (true) {
    let merged = false;

    for (let spanLength = 2; spanLength <= bis.length; spanLength++) {
      for (
        let headIndex = 0;
        headIndex + spanLength <= bis.length;
        headIndex++
      ) {
        const tailIndex = headIndex + spanLength - 1;
        if (!isMergeableSpan(bis, headIndex, tailIndex, operations)) {
          continue;
        }

        const mergedBi = operations.mergeTwoBis(bis[headIndex], bis[tailIndex]);
        const replacement: BiVo = {
          ...mergedBi,
          status: operations.isCandidateBiValid(mergedBi)
            ? BiStatus.Valid
            : BiStatus.Invalid,
        };
        bis.splice(headIndex, spanLength, replacement);
        merged = true;
        break;
      }

      if (merged) {
        break;
      }
    }

    if (!merged) {
      return bis;
    }
  }
}
