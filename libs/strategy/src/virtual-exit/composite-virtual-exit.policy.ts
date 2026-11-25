import type { StrategyBar } from '@app/market-data';
import type { KernelSignal } from '../kernel/kernel.types';
import type {
  VirtualExitChannelSpec,
  VirtualExitPolicyPort,
  VirtualExitProposal,
} from './virtual-exit.port';

/**
 * 组合虚拟出场策略：公共域价格型求值器常驻 + 可选的私仓结构型实现。
 *
 * - configure：同一批 specs 广播给两路（各自按自己的职责面过滤通道）；
 * - onSignal：双路广播（两路各自维护虚拟持仓，互不感知）；
 * - onBar：合并提案。同一通道同 bar 双路同时触发时公共域优先（价格型
 *   防守语义独立于结构型出场，先触发先成交）。
 */
export class CompositeVirtualExitPolicy implements VirtualExitPolicyPort {
  constructor(
    private readonly primary: VirtualExitPolicyPort,
    private readonly fallback: VirtualExitPolicyPort,
  ) {}

  public configure(specs: readonly VirtualExitChannelSpec[]): void {
    this.primary.configure(specs);
    this.fallback.configure(specs);
  }

  public onSignal(signal: KernelSignal): void {
    this.primary.onSignal(signal);
    this.fallback.onSignal(signal);
  }

  public onBar(
    bar: StrategyBar,
    period: number,
  ): readonly VirtualExitProposal[] {
    return [
      ...this.primary.onBar(bar, period),
      ...this.fallback.onBar(bar, period),
    ];
  }
}
