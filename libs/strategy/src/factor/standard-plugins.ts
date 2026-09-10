import {
  factorPluginRegistry,
  type FactorPluginRegistry,
} from './factor-plugin-registry';
import { ChanBspFactorPlugin } from './plugins/chan-bsp.plugin';
import { LegacyRuleDslPlugin } from './plugins/legacy-rule-dsl.plugin';
import { VolumeBreakoutPlugin } from './plugins/volume-breakout.plugin';
import { FinancialSafetyGuardPlugin } from './plugins/financial-guard.plugin';
import { NorthboundCapitalPlugin } from './plugins/northbound-capital.plugin';
import { FibonacciRetracementPlugin } from './plugins/fibonacci.plugin';

/**
 * 确保标准因子插件完成装配与注册
 */
export function ensureStandardPluginsRegistered(
  registry: FactorPluginRegistry = factorPluginRegistry,
): void {
  const standardPlugins = [
    new ChanBspFactorPlugin(),
    new LegacyRuleDslPlugin(),
    new VolumeBreakoutPlugin(),
    new FinancialSafetyGuardPlugin(),
    new NorthboundCapitalPlugin(),
    new FibonacciRetracementPlugin(),
  ];

  for (const plugin of standardPlugins) {
    if (!registry.has(plugin.id)) {
      registry.register(plugin);
    }
  }
}
