import { Injectable } from '@nestjs/common';
import type { ChanK } from '@app/chancore';
import {
  ChanVisualAdapter,
  type ChanVisualOptions,
} from './adapters/chan-visual.adapter';
import {
  FibonacciVisualAdapter,
  type FibonacciVisualOptions,
} from './adapters/fibonacci-visual.adapter';
import {
  PaVisualAdapter,
  type PaVisualOptions,
} from './adapters/pa-visual.adapter';
import type {
  VisualCommand,
  VisualCommandPayload,
} from './visual-command.types';

export interface GenerateVisualCommandsInput {
  readonly code: string;
  readonly period: number;
  readonly source: string;
  readonly klines: readonly ChanK[];
  readonly layers?: readonly string[];
  readonly chanOptions?: ChanVisualOptions;
  readonly fibOptions?: FibonacciVisualOptions;
  readonly paOptions?: PaVisualOptions;
}

@Injectable()
export class VisualCommandService {
  /**
   * Generates standard visual commands across requested layers.
   */
  generateCommands(input: GenerateVisualCommandsInput): VisualCommandPayload {
    const {
      code,
      period,
      source,
      klines,
      layers = ['chan'],
      chanOptions,
      fibOptions,
      paOptions,
    } = input;

    const layerSet = new Set(layers.map((l) => l.toLowerCase()));
    const allCommands: VisualCommand[] = [];

    const hasZs =
      layerSet.has('chan_zs') ||
      layerSet.has('chan_zs_bi') ||
      layerSet.has('chan_zs_duan');

    const hasBsp =
      layerSet.has('chan_bsp') ||
      layerSet.has('chan_bsp_bi') ||
      layerSet.has('chan_bsp_duan');

    // 1. Chan Layer
    if (
      layerSet.has('chan') ||
      layerSet.has('chan_bi') ||
      layerSet.has('chan_duan') ||
      hasZs ||
      hasBsp
    ) {
      const chanCmds = ChanVisualAdapter.convert(klines, {
        ...chanOptions,
        includeBi: !layerSet.has('chan') ? layerSet.has('chan_bi') : true,
        includeDuan: !layerSet.has('chan') ? layerSet.has('chan_duan') : true,
        includeZhongshu: !layerSet.has('chan') ? hasZs : true,
        includeBsp: !layerSet.has('chan') ? hasBsp : true,
      });
      allCommands.push(...chanCmds);
    }

    // 2. Fibonacci Layer (TradingView Official Style)
    if (layerSet.has('fibonacci')) {
      const fibCmds = FibonacciVisualAdapter.convert(klines, fibOptions);
      allCommands.push(...fibCmds);
    }

    // 3. Price Action Layer (FVG, 50% CE, Pin Bar, Projections)
    if (
      layerSet.has('pa') ||
      layerSet.has('pa_fvg') ||
      layerSet.has('pa_pin') ||
      layerSet.has('pa_projection')
    ) {
      const paCmds = PaVisualAdapter.convert(klines as any, {
        ...paOptions,
        includeFvg: !layerSet.has('pa') ? layerSet.has('pa_fvg') : true,
        includeCeLines: !layerSet.has('pa') ? layerSet.has('pa_fvg') : true,
        includePinBars: !layerSet.has('pa') ? layerSet.has('pa_pin') : true,
        includeProjections: !layerSet.has('pa')
          ? layerSet.has('pa_projection')
          : true,
      });
      allCommands.push(...paCmds);
    }

    return {
      code,
      period,
      source,
      totalKlines: klines.length,
      commands: Object.freeze(allCommands),
    };
  }
}
