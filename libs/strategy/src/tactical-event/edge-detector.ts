import type { KernelSignal } from '../kernel/kernel.types';

export class EdgeDetector {
  public readonly lastPluginState = new Map<string, string>();
  private readonly edgePlugins: Set<string>;

  constructor(edgePlugins: readonly string[] = []) {
    this.edgePlugins = new Set(edgePlugins);
  }

  public detect(signal: KernelSignal): KernelSignal | null {
    const pluginId = this.findMatchingPluginId(signal);
    if (!pluginId) {
      // 未配置边沿拦截的普通信号原样透传
      return signal;
    }

    const currentState = this.extractState(signal);
    const lastState = this.lastPluginState.get(pluginId);

    if (lastState === currentState) {
      // 状态无变化，抑制
      return null;
    }

    // 边沿跃迁：记录新状态并放行
    this.lastPluginState.set(pluginId, currentState);
    return signal;
  }

  public reset(): void {
    this.lastPluginState.clear();
  }

  private findMatchingPluginId(signal: KernelSignal): string | null {
    for (const plugin of this.edgePlugins) {
      if (
        signal.signalType === plugin ||
        signal.displayTag === plugin ||
        signal.decisionTrace?.pluginId === plugin ||
        (signal as any).pluginId === plugin
      ) {
        return plugin;
      }
    }
    return null;
  }

  private extractState(signal: KernelSignal): string {
    if (typeof (signal as any).action === 'string') {
      return (signal as any).action;
    }
    if (typeof signal.decisionTrace?.action === 'string') {
      return signal.decisionTrace.action as string;
    }
    if (signal.signalKind === 'entry') return 'BUY';
    if (signal.signalKind === 'exit') return 'SELL';
    return signal.signalType;
  }
}
