import type { StrategyBar } from '@app/market-data';
import { StrategySimulationEngine } from './strategy-simulation.engine';
import type {
  SimulationControlCommand,
  SimulationFrame,
  SimulationSessionConfig,
  SimulationSessionStatus,
  SimulationSessionSummary,
} from './strategy-simulation.types';

export interface SimulationSessionListeners {
  readonly onFrame?: (frame: SimulationFrame) => void;
  readonly onStatusChange?: (status: SimulationSessionStatus) => void;
  readonly onError?: (error: Error) => void;
}

export class StrategySimulationSession {
  public readonly engine: StrategySimulationEngine;
  private status: SimulationSessionStatus = 'idle';
  private speedMs = 500;
  private timer: NodeJS.Timeout | null = null;
  private listeners: SimulationSessionListeners = {};
  private isProcessing = false;

  constructor(
    allBars: readonly StrategyBar[],
    config: SimulationSessionConfig,
    listeners?: SimulationSessionListeners,
  ) {
    this.engine = new StrategySimulationEngine(allBars, config);
    if (listeners) {
      this.listeners = listeners;
    }
  }

  public get sessionId(): string {
    return this.engine.sessionId;
  }

  public get currentStatus(): SimulationSessionStatus {
    return this.status;
  }

  public setListeners(listeners: SimulationSessionListeners): void {
    this.listeners = { ...this.listeners, ...listeners };
  }

  public getSummary(): SimulationSessionSummary {
    return {
      sessionId: this.sessionId,
      securityCode: this.engine.securityCode,
      period: this.engine.period,
      totalBars: this.engine.totalBars,
      preWarmBars: this.engine.preWarmCount,
      currentCursor: this.engine.currentCursor,
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
        return this.engine.getCurrentFrame();
      case 'pause':
        this.pause();
        return this.engine.getCurrentFrame();
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
        return this.engine.getCurrentFrame();
      default:
        return this.engine.getCurrentFrame();
    }
  }

  public play(): void {
    if (this.engine.isCompleted && this.engine.totalBars > 0) {
      // 若已播完再次点击播放，从头重置
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
    const frame = await this.engine.stepNext();
    if (frame) {
      this.listeners.onFrame?.(frame);
    }
    if (this.engine.isCompleted) {
      this.pause();
      this.setStatus('completed');
    }
    return frame;
  }

  public stepPrev(): SimulationFrame | null {
    const frame = this.engine.stepPrev();
    if (frame) {
      this.listeners.onFrame?.(frame);
    }
    return frame;
  }

  public async seek(targetIndex: number): Promise<SimulationFrame | null> {
    const frame = await this.engine.seek(targetIndex);
    if (frame) {
      this.listeners.onFrame?.(frame);
    }
    if (this.engine.isCompleted) {
      this.setStatus('completed');
    }
    return frame;
  }

  public destroy(): void {
    this.clearTimer();
    this.listeners = {};
    this.setStatus('completed');
  }

  private startTimer(): void {
    this.clearTimer();
    this.setStatus('playing');

    this.timer = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      try {
        const frame = await this.engine.stepNext();
        if (frame) {
          this.listeners.onFrame?.(frame);
        }
        if (this.engine.isCompleted) {
          this.clearTimer();
          this.setStatus('completed');
        }
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
