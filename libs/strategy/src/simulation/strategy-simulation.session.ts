import type { StrategyBar } from '@app/market-data';
import { availabilityKey } from '../kernel/availability';
import { StrategyEvaluationKernel } from '../kernel/strategy-evaluation-kernel';
import { ExternalFactorPluginLoader } from '../factor/external-plugin-loader';
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

export const SIMULATION_LOCAL_FIXTURE_IDENTITY = Object.freeze({
  definitionId: -1,
  versionId: -1,
});

/**
 * 本地推演会话：交互式步进/回看/跳转的帧缓存壳。
 *
 * 内核唯一（StrategyEvaluationKernel 纯 push 核心）：会话只负责
 * ① 预热段先行 push（kernel 按时间轴自动进预热相）；
 * ② 公开 Bar 逐根 push 并缓存 Frame（stepPrev/向后 seek 只读缓存，
 * 内核单调推进、绝不回退）。
 */
interface CompactSimulationFrame {
  readonly cursor: number;
  readonly total: number;
  readonly bar: StrategyBar;
  readonly windowBars: SimulationFrame['windowBars'];
  readonly signalCount: number;
  readonly latestSignals: readonly SimulationSignal[];
  readonly status: SimulationSessionStatus;
}

export class StrategySimulationSession {
  private readonly kernel: StrategyEvaluationKernel;
  private readonly preWarmBars: readonly StrategyBar[];
  private readonly publicBars: readonly StrategyBar[];
  private readonly externalPreWarmBars: readonly StrategyBar[];
  private readonly externalPublicBars: readonly StrategyBar[];
  private externalPublicCursor = 0;
  private readonly frames: (CompactSimulationFrame | undefined)[] = [];
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
    const externalAll = (config.externalBars ?? []).filter(
      (bar) => !endAt || bar.timestamp.getTime() <= endAt.getTime(),
    );
    const firstPublicAvail =
      this.publicBars.length > 0
        ? availabilityKey(this.publicBars[0]).getTime()
        : publicFrom.getTime();
    const externalSorted = [...externalAll].sort(
      (left, right) =>
        availabilityKey(left).getTime() - availabilityKey(right).getTime(),
    );
    this.externalPreWarmBars = Object.freeze(
      externalSorted.filter(
        (bar) => availabilityKey(bar).getTime() < firstPublicAvail,
      ),
    );
    this.externalPublicBars = Object.freeze(
      externalSorted.filter(
        (bar) => availabilityKey(bar).getTime() >= firstPublicAvail,
      ),
    );
    this.kernel = new StrategyEvaluationKernel({
      securityId: config.securityId ?? 1,
      securityCode: config.securityCode,
      publicFrom,
      virtualExitPolicy:
        ExternalFactorPluginLoader.createVirtualExitPolicy() ?? undefined,
      plans: [
        {
          definitionId:
            config.definitionId ??
            SIMULATION_LOCAL_FIXTURE_IDENTITY.definitionId,
          versionId:
            config.versionId ?? SIMULATION_LOCAL_FIXTURE_IDENTITY.versionId,
          flow: config.flow,
          ruleSnapshot: config.ruleSnapshot ?? Object.freeze({}),
          period: config.period,
          requiredBarCount: config.windowBudget ?? 600,
          contextRequirements: config.contextRequirements ?? {},
          externalContextRequirements: config.externalContextRequirements ?? [],
        },
      ],
      registry: config.registry,
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

  private materializeFrame(
    compact: CompactSimulationFrame | undefined,
  ): SimulationFrame | null {
    if (!compact) return null;
    return {
      sessionId: this.sessionId,
      cursor: compact.cursor,
      total: compact.total,
      bar: compact.bar,
      windowBars: compact.windowBars,
      signals: this.accumulatedSignals.slice(0, compact.signalCount),
      latestSignals: compact.latestSignals,
      status: compact.status,
    };
  }

  public async stepNext(): Promise<SimulationFrame | null> {
    if (this.cursor >= this.publicBars.length - 1) {
      return this.materializeFrame(this.frames[this.cursor]);
    }
    await this.seedPreWarm();
    const next = this.cursor + 1;
    const cached = this.frames[next];
    if (cached) {
      this.cursor = next;
      return this.materializeFrame(cached);
    }

    const bar = this.publicBars[next];
    const fresh = next >= this.pushedPublicCount;
    if (fresh) {
      // 公开段外部 bar 按 availabilityKey 因果归并（封堵日线 00:00 泄漏至日内步骤）
      const barAvail = availabilityKey(bar).getTime();
      let e = this.externalPublicCursor;
      while (
        e < this.externalPublicBars.length &&
        availabilityKey(this.externalPublicBars[e]).getTime() <= barAvail
      ) {
        await this.kernel.push(this.externalPublicBars[e++]);
      }
      this.externalPublicCursor = e;
    }
    const kernelSignals = fresh ? await this.kernel.push(bar) : [];
    this.pushedPublicCount = Math.max(this.pushedPublicCount, next + 1);

    const latestSignals = kernelSignals.map((signal) =>
      mapKernelSignalToSimulationSignal(signal, {
        securityCode: this.config.securityCode,
        period: this.config.period,
      }),
    );
    this.accumulatedSignals.push(...latestSignals);

    const compact: CompactSimulationFrame = {
      cursor: next,
      total: this.publicBars.length,
      bar,
      windowBars: this.kernel.readWindow(this.config.period),
      signalCount: this.accumulatedSignals.length,
      latestSignals,
      status: next >= this.publicBars.length - 1 ? 'completed' : 'idle',
    };
    this.frames[next] = compact;
    this.cursor = next;
    const frame = this.materializeFrame(compact)!;
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
        return this.materializeFrame(this.frames[0]);
      }
      return null;
    }
    this.cursor -= 1;
    const frame = this.materializeFrame(this.frames[this.cursor]);
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
      return this.materializeFrame(this.frames[this.cursor]);
    }

    // 向前快进：依次推进补全，并定期 yield 事件循环保障 HTTP 响应
    while (this.cursor < clamped) {
      await this.stepNext();
      if (this.cursor % 20 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    return this.materializeFrame(this.frames[this.cursor]);
  }

  public getCurrentFrame(): SimulationFrame | null {
    if (this.cursor < 0) return null;
    return this.materializeFrame(this.frames[this.cursor]);
  }

  /**
   * 导出当前推演会话的完整调试快照（含滑动窗口队列数据、当前 Bar 与全部信号）。
   */
  public dumpCurrentState(): SimulationStateDump {
    const currentFrame = this.getCurrentFrame();
    const windowBars = currentFrame
      ? currentFrame.windowBars
      : this.kernel.readWindow(this.config.period);
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
    // 预热段按 availabilityKey 因果归并：外部 bar 在其可用边界前先于标的 bar 推入
    let e = 0;
    for (const bar of this.preWarmBars) {
      const barAvail = availabilityKey(bar).getTime();
      while (
        e < this.externalPreWarmBars.length &&
        availabilityKey(this.externalPreWarmBars[e]).getTime() <= barAvail
      ) {
        await this.kernel.push(this.externalPreWarmBars[e++]);
      }
      await this.kernel.push(bar);
    }
    while (e < this.externalPreWarmBars.length) {
      await this.kernel.push(this.externalPreWarmBars[e++]);
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
      } catch (err: unknown) {
        this.listeners.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      } finally {
        this.isProcessing = false;
      }
    }, this.speedMs);
    this.timer?.unref?.();
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
