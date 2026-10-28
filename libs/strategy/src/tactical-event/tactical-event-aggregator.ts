import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import { EdgeDetector } from './edge-detector';
import { TacticalCooldownTracker } from './tactical-cooldown-tracker';
import type {
  TacticalAggregatorConfig,
  TacticalEvent,
} from './tactical-event.types';
import { TemporalWindowEngine } from './temporal-window-engine';

export class TacticalEventAggregator {
  private readonly edgeDetector: EdgeDetector;
  private readonly windowEngine: TemporalWindowEngine;
  private readonly cooldownTracker: TacticalCooldownTracker;
  private currentBarIndex = 0;
  private lastBarTimestamp?: number;

  constructor(config: TacticalAggregatorConfig = {}) {
    this.edgeDetector = new EdgeDetector(config.edgePlugins ?? []);
    this.windowEngine = new TemporalWindowEngine(config.windows ?? []);
    this.cooldownTracker = new TacticalCooldownTracker(
      config.cooldownBars ?? 0,
    );
  }

  public push(
    signals: readonly KernelSignal[],
    bar: StrategyBar,
  ): TacticalEvent[] {
    this.advanceBar(bar);

    const result: TacticalEvent[] = [];

    // 1. 边沿跃迁检测
    const edgePassedSignals: KernelSignal[] = [];
    for (const signal of signals) {
      const passed = this.edgeDetector.detect(signal);
      if (passed) {
        edgePassedSignals.push(passed);
      }
    }

    // 2. 时序观察窗处理
    const candidateEvents: TacticalEvent[] = [];
    for (const signal of edgePassedSignals) {
      const events = this.windowEngine.push(signal, bar, this.currentBarIndex);
      candidateEvents.push(...events);
    }

    // 若当前根 Bar 无有效信号输入，仍需通知窗口引擎检查超时修剪
    if (signals.length === 0) {
      const timeoutEvents = this.windowEngine.onBar(bar, this.currentBarIndex);
      candidateEvents.push(...timeoutEvents);
    }

    // 3. 战术冷却去抖拦截
    for (const event of candidateEvents) {
      if (this.cooldownTracker.accept(event, this.currentBarIndex)) {
        result.push(event);
      }
    }

    return result;
  }

  public onBar(bar: StrategyBar): TacticalEvent[] {
    this.advanceBar(bar);

    const timeoutEvents = this.windowEngine.onBar(bar, this.currentBarIndex);
    const result: TacticalEvent[] = [];
    for (const event of timeoutEvents) {
      if (this.cooldownTracker.accept(event, this.currentBarIndex)) {
        result.push(event);
      }
    }
    return result;
  }

  public reset(): void {
    this.edgeDetector.reset();
    this.windowEngine.reset();
    this.cooldownTracker.reset();
    this.currentBarIndex = 0;
    this.lastBarTimestamp = undefined;
  }

  private advanceBar(bar: StrategyBar): void {
    const time = bar.timestamp.getTime();
    if (this.lastBarTimestamp === undefined) {
      this.lastBarTimestamp = time;
      this.currentBarIndex = 0;
    } else if (time > this.lastBarTimestamp) {
      this.lastBarTimestamp = time;
      this.currentBarIndex += 1;
    }
  }
}
