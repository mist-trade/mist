import type { StrategyBar } from '@app/market-data';
import { channelKeyOf, type KernelSignal } from '../kernel/kernel.types';
import type {
  VirtualExitChannelSpec,
  VirtualExitPolicyPort,
  VirtualExitProposal,
} from './virtual-exit.port';

/**
 * 组合虚拟出场策略：公共域价格型求值器常驻 + 可选的私仓结构型实现。
 *
 * - configure：同一批 specs 广播给两路（各自按自己的职责面过滤通道）；
 * - onSignal / onPrewarmBar / onExternalExit：双路透传同步；
 * - onBar：primary 优先执行，并即时经 onExternalExit 同步 fallback；
 *   fallback 随后执行，过滤本 Bar 已被 primary 退出的同通道提案，
 *   其余提案回传 primary.onExternalExit 保持双路虚拟持仓一致。
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

  public onPrewarmBar(bar: StrategyBar, period: number): void {
    this.primary.onPrewarmBar?.(bar, period);
    this.fallback.onPrewarmBar?.(bar, period);
  }

  public onExternalExit(proposal: VirtualExitProposal): void {
    this.primary.onExternalExit?.(proposal);
    this.fallback.onExternalExit?.(proposal);
  }

  public onBar(
    bar: StrategyBar,
    period: number,
  ): readonly VirtualExitProposal[] {
    const primaryProposals = this.primary.onBar(bar, period);
    const exitedChannels = new Set<string>();
    const merged: VirtualExitProposal[] = [];

    for (const proposal of primaryProposals) {
      const key = channelKeyOf(proposal.channel);
      if (exitedChannels.has(key)) continue;
      exitedChannels.add(key);
      merged.push(proposal);
      this.fallback.onExternalExit?.(proposal);
    }

    const fallbackProposals = this.fallback.onBar(bar, period);
    for (const proposal of fallbackProposals) {
      const key = channelKeyOf(proposal.channel);
      if (exitedChannels.has(key)) continue;
      exitedChannels.add(key);
      merged.push(proposal);
      this.primary.onExternalExit?.(proposal);
    }

    return merged;
  }
}
