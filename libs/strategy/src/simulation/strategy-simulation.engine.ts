import type { StrategyBar } from '@app/market-data';
import { StrategySeriesImputer } from '@app/market-data';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import { DecisionFlowEvaluator } from '../decision-flow/decision-flow-evaluator';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import { ensureStandardPluginsRegistered } from '../factor/standard-plugins';
import type { FactorContext } from '../factor/factor.types';
import type {
  SimulationFrame,
  SimulationSessionConfig,
  SimulationSignal,
  SimulationStateDump,
} from './strategy-simulation.types';

export class StrategySimulationEngine {
  public readonly sessionId: string;
  public readonly securityCode: string;
  public readonly period: number;
  public readonly windowBudget: number;

  private readonly flow: DecisionFlowNode;
  private readonly evaluator: DecisionFlowEvaluator;
  private readonly imputer: StrategySeriesImputer;

  private readonly preWarmBars: readonly StrategyBar[];
  private readonly replayBars: readonly StrategyBar[];

  private frames: SimulationFrame[] = [];
  private accumulatedSignals: SimulationSignal[] = [];
  private cursor = -1;

  constructor(
    allBars: readonly StrategyBar[],
    config: SimulationSessionConfig,
  ) {
    this.sessionId =
      config.sessionId ||
      `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.securityCode = config.securityCode;
    this.period = config.period;
    this.windowBudget = config.windowBudget ?? 600;
    this.flow = config.flow;

    const registry = new InMemoryFactorPluginRegistry();
    ensureStandardPluginsRegistered(registry);
    this.evaluator = new DecisionFlowEvaluator({ registry });
    this.imputer = new StrategySeriesImputer();

    // 1. 根据 startDate / endDate 切分预热段与回放段（严格对齐线上 BacktestRunExecutor）
    const runStartMs = config.startDate
      ? new Date(config.startDate).getTime()
      : -Infinity;
    const runEndMs = config.endDate
      ? new Date(config.endDate).getTime()
      : Infinity;

    const preWarmCandidates: StrategyBar[] = [];
    const replayCandidates: StrategyBar[] = [];

    for (const bar of allBars) {
      const t = bar.timestamp.getTime();
      if (t < runStartMs) {
        preWarmCandidates.push(bar);
      } else if (t <= runEndMs) {
        replayCandidates.push(bar);
      }
    }

    // 线上对齐：取前 windowBudget 根历史 Bar 进行静默预热
    this.preWarmBars = preWarmCandidates.slice(-this.windowBudget);
    this.replayBars = replayCandidates;

    // 执行静默预热滑窗装载
    this.preWarm();
  }

  public get totalBars(): number {
    return this.replayBars.length;
  }

  public get preWarmCount(): number {
    return this.preWarmBars.length;
  }

  public get currentCursor(): number {
    return this.cursor;
  }

  public get isCompleted(): boolean {
    return (
      this.replayBars.length === 0 || this.cursor >= this.replayBars.length - 1
    );
  }

  /**
   * 装载预热历史滑窗到 Imputer
   */
  private preWarm(): void {
    for (const bar of this.preWarmBars) {
      this.imputer.append(bar);
      while (this.imputer.read().length > this.windowBudget) {
        this.imputer.trim();
      }
    }
  }

  private isPreWarmed = false;

  /**
   * 静默预热求值：驱动策略树（Decision Flow）执行预热切片，
   * 使得因子插件（如 ChanBspFactorPlugin）的内部单调游标推进至预热结束时刻，
   * 杜绝历史已形成的买卖点在首根推流 Bar 被误判为新信号发射。
   */
  private async ensurePreWarmed(): Promise<void> {
    if (this.isPreWarmed) return;
    this.isPreWarmed = true;

    if (this.preWarmBars.length > 0) {
      const projectedBars = this.imputer.read();
      const lastPreWarmBar = this.preWarmBars[this.preWarmBars.length - 1];
      const context: FactorContext = {
        securityId: 1,
        securityCode: this.securityCode,
        timestamp: lastPreWarmBar.timestamp,
        period: this.period,
        bars: projectedBars,
        attributes: new Map(),
      };
      // 静默执行策略树求值，不记录任何信号
      await this.evaluator.evaluate(this.flow, context);
    }
  }

  /**
   * 单步向前推进一步（Step Next）
   */
  public async stepNext(): Promise<SimulationFrame | null> {
    await this.ensurePreWarmed();

    if (this.cursor >= this.replayBars.length - 1) {
      return this.frames[this.cursor] ?? null;
    }

    this.cursor += 1;
    if (this.frames[this.cursor]) {
      return this.frames[this.cursor];
    }

    const currentBar = this.replayBars[this.cursor];
    this.imputer.append(currentBar);
    while (this.imputer.read().length > this.windowBudget) {
      this.imputer.trim();
    }

    const projectedBars = this.imputer.read();

    // 策略树统一求值（纯策略树流程，不走孤立 chan_bsp 旁路）
    const context: FactorContext = {
      securityId: 1,
      securityCode: this.securityCode,
      timestamp: currentBar.timestamp,
      period: this.period,
      bars: projectedBars,
      attributes: new Map(),
    };

    const decision = await this.evaluator.evaluate(this.flow, context);
    const newSignals: SimulationSignal[] = [];

    if (decision.action === 'BUY' || decision.action === 'SELL') {
      const isBuy = decision.action === 'BUY';
      const bspEvidence = this.extractBspEvidence(decision.trace);
      const candidates =
        Array.isArray(bspEvidence?.candidateEvents) &&
        bspEvidence.candidateEvents.length > 0
          ? bspEvidence.candidateEvents
          : [
              {
                eventType: bspEvidence?.type || (isBuy ? 'buy' : 'sell'),
                price: bspEvidence?.price,
                time: bspEvidence?.time,
              },
            ];

      for (const cand of candidates) {
        const candType = String(
          cand.eventType || cand.type || (isBuy ? 'buy' : 'sell'),
        );
        const candIsBuy = candType.endsWith('_buy') || isBuy;
        const badgeText = this.formatBadgeText(candType, candIsBuy);
        const triggerPrice =
          typeof cand.price === 'number' && Number.isFinite(cand.price)
            ? cand.price
            : currentBar.close;
        const signalTime = cand.time || currentBar.timestamp.toISOString();

        const sig: SimulationSignal = {
          signalTime,
          signalType: candType,
          badgeText,
          triggerPrice,
          isBuy: candIsBuy,
          confidence: decision.confidence,
          decisionTrace: {
            action: decision.action,
            signalTag: decision.signalTag,
            confidence: decision.confidence,
            reason: decision.reason,
            trace: decision.trace,
          },
          securityCode: this.securityCode,
          period: this.period,
        };

        newSignals.push(sig);
        this.accumulatedSignals.push(sig);
      }
    }

    const frame: SimulationFrame = {
      sessionId: this.sessionId,
      cursor: this.cursor,
      total: this.replayBars.length,
      bar: currentBar,
      windowBars: projectedBars,
      signals: newSignals,
      status: this.isCompleted ? 'completed' : 'playing',
    };

    this.frames[this.cursor] = frame;
    return frame;
  }

  /**
   * 单步向后退回一步（Step Prev）
   */
  public stepPrev(): SimulationFrame | null {
    if (this.cursor <= 0) {
      if (this.cursor === 0) {
        return this.frames[0] ?? null;
      }
      return null;
    }

    this.cursor -= 1;
    return this.frames[this.cursor] ?? null;
  }

  /**
   * 跳转至指定游标索引（Seek）
   */
  public async seek(targetIndex: number): Promise<SimulationFrame | null> {
    if (this.replayBars.length === 0) return null;
    const clamped = Math.max(
      0,
      Math.min(this.replayBars.length - 1, targetIndex),
    );

    if (clamped <= this.cursor) {
      this.cursor = clamped;
      return this.frames[this.cursor] ?? null;
    }

    // 若向前快进，依次推进补全，并定期 yield 事件循环保障 HTTP 响应
    while (this.cursor < clamped) {
      await this.stepNext();
      if (this.cursor % 20 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    return this.frames[this.cursor] ?? null;
  }

  /**
   * 获取当前帧
   */
  public getCurrentFrame(): SimulationFrame | null {
    if (this.cursor < 0) return null;
    return this.frames[this.cursor] ?? null;
  }

  /**
   * 获取已累计的所有交易信号
   */
  public getAllSignals(): readonly SimulationSignal[] {
    return this.accumulatedSignals;
  }

  /**
   * 获取已生成的全部帧数据
   */
  public getGeneratedFrames(): readonly SimulationFrame[] {
    return this.frames.slice(0, this.cursor + 1);
  }

  private extractBspEvidence(
    trace: readonly any[] = [],
  ): { type?: string; [key: string]: any } | null {
    for (const item of trace) {
      if (item?.evidence && typeof item.evidence === 'object') {
        const rawType =
          item.evidence.eventType ||
          item.evidence.bspType ||
          item.evidence.type ||
          item.evidence.pointType ||
          item.evidence.signalType;
        if (rawType) {
          return { type: String(rawType), ...item.evidence };
        }
      }
      if (typeof item?.reason === 'string') {
        if (item.reason.includes('一买') || item.reason.includes('1买')) {
          return { type: 'first_buy', ...item.evidence };
        }
        if (item.reason.includes('二买') || item.reason.includes('2买')) {
          return { type: 'second_buy', ...item.evidence };
        }
        if (item.reason.includes('三买') || item.reason.includes('3买')) {
          return { type: 'third_buy', ...item.evidence };
        }
        if (item.reason.includes('一卖') || item.reason.includes('1卖')) {
          return { type: 'first_sell', ...item.evidence };
        }
        if (item.reason.includes('二卖') || item.reason.includes('2卖')) {
          return { type: 'second_sell', ...item.evidence };
        }
        if (item.reason.includes('三卖') || item.reason.includes('3卖')) {
          return { type: 'third_sell', ...item.evidence };
        }
      }
    }
    return null;
  }

  private formatBadgeText(signalType: string, isBuy: boolean): string {
    switch (signalType) {
      case 'first_buy':
        return '1买';
      case 'second_buy':
        return '2买';
      case 'third_buy':
        return '3买';
      case 'first_sell':
        return '1卖';
      case 'second_sell':
        return '2卖';
      case 'third_sell':
        return '3卖';
      default:
        return isBuy ? '买点' : '卖点';
    }
  }

  /**
   * 导出当前推演会话的完整调试快照 (含滑动窗口队列数据、当前 Bar 与全部信号)
   */
  public dumpCurrentState(): SimulationStateDump {
    const currentFrame = this.getCurrentFrame();
    return {
      sessionId: this.sessionId,
      securityCode: this.securityCode,
      period: this.period,
      cursor: this.cursor,
      totalBars: this.replayBars.length,
      preWarmBars: this.preWarmBars.length,
      currentBar: currentFrame?.bar ?? null,
      windowQueue: this.imputer.read().map((p) => ({
        time: p.rawBar.timestamp.toISOString(),
        ohlc: p.ohlc.effective,
        volume: p.volume.effective,
        amount: p.amount.effective,
        resolution: p.ohlc.resolution,
      })),
      signals: this.accumulatedSignals,
      latestFrameSignals: currentFrame?.signals ?? [],
    };
  }
}
