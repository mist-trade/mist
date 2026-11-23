import { FvgType, PaCore, PaK, PinBarDirection } from '@app/pacore';
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
  /** 最小 FVG 尺寸门槛 */
  readonly minFvgSize?: number;
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
      minFvgSize,
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

    return commands;
  }
}
