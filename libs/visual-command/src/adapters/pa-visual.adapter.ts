import {
  FvgType,
  NecklineOptions,
  PaCore,
  PaK,
  PinBarDirection,
} from '@app/pacore';
import type {
  BandVisualCommand,
  IconVisualCommand,
  LineVisualCommand,
  TextVisualCommand,
  VisualCommand,
} from '../visual-command.types';

export interface PaVisualOptions {
  /** 是否包含 FVG 失衡色带 (默认 true) */
  readonly includeFvg?: boolean;
  /** 是否包含 50% CE 轴心虚线 (默认 true) */
  readonly includeCeLines?: boolean;
  /** 是否包含 Pin Bar (匹诺曹针) 图表标记 (默认 true) */
  readonly includePinBars?: boolean;
  /** 是否包含空间对称度量投射目标线 (默认 true) */
  readonly includeProjections?: boolean;
  /** 是否包含形态颈线与空间映射图元 (默认 true) */
  readonly includeNecklines?: boolean;
  /** 最小 FVG 尺寸门槛 */
  readonly minFvgSize?: number;
  /** 颈线分析参数配置 */
  readonly necklineOptions?: NecklineOptions;
}

/**
 * 价格行为学 (Price Action) 纯视觉指令适配器
 *
 * 将 @app/pacore 计算出的 FVG、50% CE、Pin Bar 与空间投射转化为可在图表中直接渲染的标准图元。
 */
export class PaVisualAdapter {
  public static convert(
    klines: readonly PaK[],
    options: PaVisualOptions = {},
  ): readonly VisualCommand[] {
    if (!klines || klines.length === 0) {
      return [];
    }

    const {
      includeFvg = true,
      includeCeLines = true,
      includePinBars = true,
      includeProjections = true,
      includeNecklines = true,
      minFvgSize,
      necklineOptions,
    } = options;

    const commands: VisualCommand[] = [];
    const lastBar = klines[klines.length - 1];
    const lastIndex = klines.length - 1;

    // 1. 失衡缺口 FVG & 50% CE 轴心
    if (includeFvg || includeCeLines || includeProjections) {
      const fvgs = PaCore.findFairValueGaps(klines, { minFvgSize });

      for (const fvg of fvgs) {
        const toIndex = fvg.firstMitigatedIndex ?? lastIndex;
        const toTime = (fvg.firstMitigatedTime ?? lastBar.time).toISOString();
        const fromTime = fvg.startTime.toISOString();
        const isBull = fvg.type === FvgType.Bullish;

        // (1) FVG 半透明失衡色带
        if (includeFvg) {
          const bandColor = isBull
            ? 'rgba(34, 197, 94, 0.20)' // 绿色半透明看涨失衡
            : 'rgba(239, 68, 68, 0.20)'; // 红色半透明看跌失衡

          const fvgBand: BandVisualCommand = {
            id: `cmd_${fvg.id}_band`,
            type: 'band',
            layer: 'pa_fvg',
            fromIndex: fvg.startIndex,
            toIndex,
            fromTime,
            toTime,
            top: fvg.gapTop,
            bottom: fvg.gapBottom,
            color: bandColor,
            fill: true,
            style: 'solid',
          };
          commands.push(fvgBand);
        }

        // (2) 50% CE 轴心虚线
        if (includeCeLines) {
          const ceColor = isBull ? '#10b981' : '#ef4444';
          const ceLine: LineVisualCommand = {
            id: `cmd_${fvg.id}_ce`,
            type: 'line',
            layer: 'pa_fvg_ce',
            startIndex: fvg.startIndex,
            endIndex: toIndex,
            startTime: fromTime,
            endTime: toTime,
            startPrice: fvg.consequentEncroachment,
            endPrice: fvg.consequentEncroachment,
            color: ceColor,
            width: 1,
            style: 'dashed',
          };
          commands.push(ceLine);
        }

        // (3) 空间对称度量投射目标线 (1:1 Measured Move)
        if (includeProjections) {
          const projection = PaCore.calculateProjection(fvg);
          const targetColor = isBull ? '#3b82f6' : '#f59e0b';
          const projLine: LineVisualCommand = {
            id: `cmd_${fvg.id}_proj_measured`,
            type: 'line',
            layer: 'pa_projection',
            startIndex: fvg.endIndex,
            endIndex: lastIndex,
            startTime: fvg.endTime.toISOString(),
            endTime: lastBar.time.toISOString(),
            startPrice: projection.measuredTarget,
            endPrice: projection.measuredTarget,
            color: targetColor,
            width: 1,
            style: 'dotted',
          };
          commands.push(projLine);
        }
      }
    }

    // 2. Pin Bar (匹诺曹长影针)
    if (includePinBars) {
      const pinBars = PaCore.findPinBars(klines);

      for (const pin of pinBars) {
        const isBull = pin.direction === PinBarDirection.Bullish;
        const pinTime = pin.time.toISOString();

        // 箭头标记
        const iconCmd: IconVisualCommand = {
          id: `cmd_pin_icon_${pin.index}`,
          type: 'icon',
          layer: 'pa_pin',
          index: pin.index,
          time: pinTime,
          price: pin.extremePrice,
          shape: isBull ? 'arrow_up' : 'arrow_down',
          color: isBull ? '#10b981' : '#ef4444',
        };
        commands.push(iconCmd);

        // 文本提示
        const textCmd: TextVisualCommand = {
          id: `cmd_pin_text_${pin.index}`,
          type: 'text',
          layer: 'pa_pin',
          index: pin.index,
          time: pinTime,
          price: pin.extremePrice,
          text: isBull ? 'Pin多' : 'Pin空',
          color: isBull ? '#10b981' : '#ef4444',
          position: isBull ? 'below' : 'above',
        };
        commands.push(textCmd);
      }
    }

    // 3. 形态颈线与空间映射 (Neckline Projections)
    if (includeNecklines) {
      const necklines = PaCore.findNecklines(klines, necklineOptions);

      for (const neck of necklines) {
        const isUp = neck.direction === 'up';
        const baseColor = isUp ? '#06b6d4' : '#f59e0b';
        const skeletonColor = isUp
          ? 'rgba(6, 182, 212, 0.45)'
          : 'rgba(245, 158, 11, 0.45)';
        const targetEndIndex =
          neck.breakout?.breakoutIndex !== undefined
            ? Math.max(neck.breakout.breakoutIndex + 10, lastIndex)
            : lastIndex;
        const targetEndTime = lastBar.time.toISOString();

        // (1) 颈线基准线 (solid line)
        const neckStartPivot = neck.pivots[1] ?? neck.pivots[0];
        const neckLineCmd: LineVisualCommand = {
          id: `cmd_${neck.id}_neckline`,
          type: 'line',
          layer: 'pa_neckline',
          startIndex: neckStartPivot.index,
          endIndex: targetEndIndex,
          startTime: neckStartPivot.time.toISOString(),
          endTime: targetEndTime,
          startPrice: neck.necklinePrice,
          endPrice: neck.necklinePrice,
          color: baseColor,
          width: 2,
          style: 'solid',
        };
        commands.push(neckLineCmd);

        // (2) 形态折线骨架 (dashed line[])
        for (let i = 0; i < neck.pivots.length - 1; i++) {
          const fromP = neck.pivots[i];
          const toP = neck.pivots[i + 1];
          const skelCmd: LineVisualCommand = {
            id: `cmd_${neck.id}_skel_${i}`,
            type: 'line',
            layer: 'pa_neckline',
            startIndex: fromP.index,
            endIndex: toP.index,
            startTime: fromP.time.toISOString(),
            endTime: toP.time.toISOString(),
            startPrice: fromP.price,
            endPrice: toP.price,
            color: skeletonColor,
            width: 1,
            style: 'dashed',
          };
          commands.push(skelCmd);
        }

        // (3) 垂直测距标尺 H (dotted line)
        const extremumPivot =
          neck.pivots.find((p) => p.price === neck.extremumPrice) ??
          neck.pivots[0];
        const rulerCmd: LineVisualCommand = {
          id: `cmd_${neck.id}_h_ruler`,
          type: 'line',
          layer: 'pa_neckline',
          startIndex: extremumPivot.index,
          endIndex: extremumPivot.index,
          startTime: extremumPivot.time.toISOString(),
          endTime: extremumPivot.time.toISOString(),
          startPrice: neck.extremumPrice,
          endPrice: neck.necklinePrice,
          color: '#8b5cf6',
          width: 1,
          style: 'dotted',
        };
        commands.push(rulerCmd);

        // (4) 1:1 对称目标线与 1.618 黄金扩展目标线
        const projStartIndex = neck.breakout
          ? neck.breakout.breakoutIndex
          : neck.endIndex;
        const projStartTime = neck.breakout
          ? neck.breakout.breakoutTime.toISOString()
          : neck.endTime.toISOString();

        const target1Cmd: LineVisualCommand = {
          id: `cmd_${neck.id}_t1_0`,
          type: 'line',
          layer: 'pa_neckline',
          startIndex: projStartIndex,
          endIndex: targetEndIndex,
          startTime: projStartTime,
          endTime: targetEndTime,
          startPrice: neck.targets.target1_0,
          endPrice: neck.targets.target1_0,
          color: '#3b82f6',
          width: 1,
          style: 'dashed',
        };
        commands.push(target1Cmd);

        const targetFibCmd: LineVisualCommand = {
          id: `cmd_${neck.id}_t1_618`,
          type: 'line',
          layer: 'pa_neckline',
          startIndex: projStartIndex,
          endIndex: targetEndIndex,
          startTime: projStartTime,
          endTime: targetEndTime,
          startPrice: neck.targets.target1_618,
          endPrice: neck.targets.target1_618,
          color: '#a855f7',
          width: 1,
          style: 'dotted',
        };
        commands.push(targetFibCmd);

        // (5) 目标价格文字标签
        const label1Cmd: TextVisualCommand = {
          id: `cmd_${neck.id}_txt_1_0`,
          type: 'text',
          layer: 'pa_neckline',
          index: projStartIndex,
          time: projStartTime,
          price: neck.targets.target1_0,
          text: `1:1目标 ${neck.targets.target1_0.toFixed(2)}`,
          color: '#3b82f6',
          position: isUp ? 'above' : 'below',
        };
        commands.push(label1Cmd);

        const labelFibCmd: TextVisualCommand = {
          id: `cmd_${neck.id}_txt_1_618`,
          type: 'text',
          layer: 'pa_neckline',
          index: projStartIndex,
          time: projStartTime,
          price: neck.targets.target1_618,
          text: `1.618扩展 ${neck.targets.target1_618.toFixed(2)}`,
          color: '#a855f7',
          position: isUp ? 'above' : 'below',
        };
        commands.push(labelFibCmd);

        // (6) 回抽支阻互换敏感带 (band)
        if (neck.breakout) {
          const bandCmd: BandVisualCommand = {
            id: `cmd_${neck.id}_retest_band`,
            type: 'band',
            layer: 'pa_neckline',
            fromIndex: neck.breakout.breakoutIndex,
            toIndex: targetEndIndex,
            fromTime: neck.breakout.breakoutTime.toISOString(),
            toTime: targetEndTime,
            top: neck.retestZone.top,
            bottom: neck.retestZone.bottom,
            color: isUp
              ? 'rgba(6, 182, 212, 0.15)'
              : 'rgba(245, 158, 11, 0.15)',
            fill: true,
            style: 'solid',
          };
          commands.push(bandCmd);
        }
      }
    }

    return commands;
  }
}
