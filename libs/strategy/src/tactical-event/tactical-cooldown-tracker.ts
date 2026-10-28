import type { TacticalEvent } from './tactical-event.types';

export class TacticalCooldownTracker {
  private readonly cooldownBars: number;
  private readonly lastEntryBars = new Map<string, number>();

  constructor(cooldownBars = 0) {
    this.cooldownBars = cooldownBars;
  }

  public accept(event: TacticalEvent, currentBarIndex: number): boolean {
    if (this.cooldownBars <= 0) {
      return true;
    }

    // 仅针对入场事件进行去抖冷却，出场及风控切断事件直接放行
    if (event.kind !== 'ENTRY') {
      return true;
    }

    const key = `${event.securityCode}:${event.action}`;
    const lastBar = this.lastEntryBars.get(key);

    if (
      lastBar !== undefined &&
      currentBarIndex - lastBar <= this.cooldownBars
    ) {
      // 处于冷却保护窗内，抑制同向入场事件
      return false;
    }

    this.lastEntryBars.set(key, currentBarIndex);
    return true;
  }

  public reset(): void {
    this.lastEntryBars.clear();
  }
}
