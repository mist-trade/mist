import type { StrategyBar } from '@app/market-data';
import { StrategyEvaluationKernel } from '../kernel/strategy-evaluation-kernel';
import { mapKernelSignalToSimulationSignal } from './kernel-signal-mapper';
import type {
  SimulationControlCommand,
  SimulationFrame,
  SimulationSessionConfig,
  SimulationSessionStatus,
  SimulationSessionSummary,
  SimulationSignal,
  SimulationStateDump,
} from './strategy-simulation.types';

export interface SimulationSessionListeners {
  readonly onFrame?: (frame: SimulationFrame) => void;
  readonly onStatusChange?: (status: SimulationSessionStatus) => void;
  readonly onError?: (error: Error) => void;
}

/**
 * 本地推演会话：交互式步进/回看/跳转的帧缓存壳。
 *
 * 内核唯一（StrategyEvaluationKernel 纯 push 核心）：会话只负责
 * ① 预热段先行 push（kernel 按时间轴自动进预热相）；
 * ② 公开 Bar 逐根 push 并缓存 Frame（stepPrev/向后 seek 只读缓存，
 * 内核单调推进、绝不回退）。
 */
export class StrategySimulationSession {
  private readonly kernel: StrategyEvaluationKernel;
  private readonly preWarmBars: readonly StrategyBar[];
  private readonly publicBars: readonly StrategyBar[];
  private readonly frames: (SimulationFrame | undefined)[] = [];
  private readonly accumulatedSignals: SimulationSignal[] = [];
  private pushedPublicCount = 0;

  private status: SimulationSessionStatus = 'idle';
  private speedMs = 250;
  private timer: NodeJS.Timeout | null = null;
  private listeners: SimulationSessionListeners = {};
  private isProcessing = false;
  private cursor = -1;
  private preWarmSeeded = false;

  public readonly config: SimulationSessionConfig;

  constructor(
    allBars: readonly StrategyBar[],
    config: SimulationSessionConfig,
    listeners?: SimulationSessionListeners,
  ) {
    this.config = config;
    this.listeners = listeners ?? {};
    const publicFrom = config.startDate
      ? new Date(config.startDate)
      : new Date(-8640000000000000);
    const endAt = config.endDate ? new Date(config.endDate) : null;
    const bounded = endAt
      ? allBars.filter((bar) => bar.timestamp.getTime() <= endAt.getTime())
      : allBars;
    this.preWarmBars = Object.freeze(
      bounded.filter((bar) => bar.timestamp.getTime() < publicFrom.getTime()),
    );
    this.publicBars = Object.freeze(
      bounded.filter((bar) => bar.timestamp.getTime() >= publicFrom.getTime()),
    );
    this.kernel = new StrategyEvaluationKernel({
      securityId: config.securityId ?? 1,
      securityCode: config.securityCode,
      period: config.period,
      publicFrom,
      plans: [
        {
          definitionId: 0,
          versionId: 0,
          flow: config.flow,
          ruleSnapshot: Object.freeze({}),
          requiredBarCount: config.windowBudget ?? 600,
        },
      ],
    });
  }

  public get sessionId(): string {
    return `sim-${this.config.securityCode}-${this.config.period}`;
  }

  public get startDate(): string | Date | undefined {
    return this.config.startDate;
  }

  public get currentStatus(): SimulationSessionStatus {
    return this.status;
  }

  public get totalBars(): number {
    return this.publicBars.length;
  }

  public get currentCursor(): number {
    return this.cursor;
  }

  public get isCompleted(): boolean {
    return (
      this.publicBars.length === 0 || this.cursor >= this.publicBars.length - 1
    );
  }

  public setListeners(listeners: SimulationSessionListeners): void {
    this.listeners = { ...this.listeners, ...listeners };
  }

  public getSummary(): SimulationSessionSummary {
    return {
      sessionId: this.sessionId,
      securityCode: this.config.securityCode,
      period: this.config.period,
      totalBars: this.publicBars.length,
      preWarmBars: this.preWarmBars.length,
      currentCursor: this.cursor,
      status: this.status,
      speedMs: this.speedMs,
    };
  }

  /**
   * 执行播放控制命令
   */
  public async control(
    command: SimulationControlCommand,
  ): Promise<SimulationFrame | null> {
    switch (command.action) {
      case 'play':
        this.play();
        return this.getCurrentFrame();
      case 'pause':
        this.pause();
        return this.getCurrentFrame();
      case 'step_next':
        this.pause();
        return this.stepNext();
      case 'step_prev':
        this.pause();
        return this.stepPrev();
      case 'seek':
        this.pause();
        return this.seek(command.param ?? 0);
      case 'set_speed':
        if (
          typeof command.param === 'number' &&
          command.param >= 20 &&
          command.param <= 5000
        ) {
          this.speedMs = command.param;
          if (this.status === 'playing') {
            this.play(); // 重置当前定时器间隔
          }
        }
        return this.getCurrentFrame();
      default:
        return this.getCurrentFrame();
    }
  }

  public play(): void {
    if (this.isCompleted && this.publicBars.length > 0) {
      // 若已播完再次点击播放，从头重置（仅回看缓存帧，内核不重放）
      void this.seek(0).then(() => {
        this.startTimer();
      });
      return;
    }

    this.startTimer();
  }

  public pause(): void {
    this.clearTimer();
    this.setStatus('paused');
  }

  public async stepNext(): Promise<SimulationFrame | null> {
    if (this.cursor >= this.publicBars.length - 1) {
      return this.frames[this.cursor] ?? null;
    }
    await this.seedPreWarm();
    const next = this.cursor + 1;
    const cached = this.frames[next];
    if (cached) {
      this.cursor = next;
      return cached;
    }

    const bar = this.publicBars[next];
    const kernelSignals =
      next >= this.pushedPublicCount ? await this.kernel.push(bar) : [];
    this.pushedPublicCount = Math.max(this.pushedPublicCount, next + 1);

    const latestSignals = kernelSignals.map((signal) =>
      mapKernelSignalToSimulationSignal(signal, {
        securityCode: this.config.securityCode,
        period: this.config.period,
      }),
    );
    this.accumulatedSignals.push(...latestSignals);

    const frame: SimulationFrame = {
      sessionId: this.sessionId,
      cursor: next,
      total: this.publicBars.length,
      bar,
      windowBars: this.kernel.readWindow(),
      signals: [...this.accumulatedSignals],
      latestSignals,
      status: next >= this.publicBars.length - 1 ? 'completed' : 'idle',
    };
    this.frames[next] = frame;
    this.cursor = next;
    this.listeners.onFrame?.(frame);
    if (this.isCompleted) {
      this.pause();
      this.setStatus('completed');
    }
    return frame;
  }

  public stepPrev(): SimulationFrame | null {
    if (this.cursor <= 0) {
      if (this.cursor === 0) {
        return this.frames[0] ?? null;
      }
      return null;
    }
    this.cursor -= 1;
    const frame = this.frames[this.cursor] ?? null;
    if (frame) {
      this.listeners.onFrame?.(frame);
    }
    return frame;
  }

  public async seek(targetIndex: number): Promise<SimulationFrame | null> {
    if (this.publicBars.length === 0) return null;
    const clamped = Math.max(
      0,
      Math.min(this.publicBars.length - 1, targetIndex),
    );

    if (clamped <= this.cursor) {
      this.cursor = clamped;
      return this.frames[this.cursor] ?? null;
    }

    // 向前快进：依次推进补全，并定期 yield 事件循环保障 HTTP 响应
    while (this.cursor < clamped) {
      await this.stepNext();
      if (this.cursor % 20 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    return this.frames[this.cursor] ?? null;
  }

  public getCurrentFrame(): SimulationFrame | null {
    if (this.cursor < 0) return null;
    return this.frames[this.cursor] ?? null;
  }

  public getAllSignals(): readonly SimulationSignal[] {
    return this.accumulatedSignals;
  }

  public getGeneratedFrames(): readonly SimulationFrame[] {
    return this.frames
      .slice(0, this.cursor + 1)
      .filter((frame): frame is SimulationFrame => frame !== undefined);
  }

  /**
   * 导出当前推演会话的完整调试快照（含滑动窗口队列数据、当前 Bar 与全部信号）。
   */
  public dumpCurrentState(): SimulationStateDump {
    const currentFrame = this.getCurrentFrame();
    const windowBars = currentFrame
      ? currentFrame.windowBars
      : this.kernel.readWindow();
    return {
      sessionId: this.sessionId,
      securityCode: this.config.securityCode,
      period: this.config.period,
      cursor: this.cursor,
      totalBars: this.publicBars.length,
      preWarmBars: this.preWarmBars.length,
      currentBar: currentFrame?.bar ?? null,
      windowQueue: windowBars.map((projected) => ({
        time: projected.rawBar.timestamp.toISOString(),
        ohlc: projected.ohlc.effective,
        volume: projected.volume.effective,
        amount: projected.amount.effective,
        resolution: projected.ohlc.resolution,
      })),
      signals: currentFrame ? [...currentFrame.signals] : [],
      latestFrameSignals: currentFrame?.latestSignals ?? [],
    };
  }

  public destroy(): void {
    this.clearTimer();
    this.listeners = {};
    this.setStatus('completed');
  }

  /** 首次公开步进前，把预热段静默 push 进内核（kernel 按时间轴自动进预热相）。 */
  private async seedPreWarm(): Promise<void> {
    if (this.preWarmSeeded) return;
    this.preWarmSeeded = true;
    for (const bar of this.preWarmBars) {
      await this.kernel.push(bar);
    }
  }

  private startTimer(): void {
    this.clearTimer();
    this.setStatus('playing');

    this.timer = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      try {
        const frame = await this.stepNext();
        if (this.isCompleted) {
          this.clearTimer();
          this.setStatus('completed');
        }
        void frame;
      } catch (err: any) {
        this.listeners.onError?.(err);
      } finally {
        this.isProcessing = false;
      }
    }, this.speedMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private setStatus(newStatus: SimulationSessionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.listeners.onStatusChange?.(newStatus);
    }
  }
}
