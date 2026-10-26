import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { BullRegistrar } from '@nestjs/bullmq';
import { SignalRegistryService } from '../signal-registry.service';
import { CandleFinalizedJobProcessor } from './candle-finalized-job.processor';
import { SignalPreMarketWarmupService } from './signal-pre-market-warmup.service';
import { HealthStateService } from '../health/health-state.service';

@Injectable()
export class SignalRealtimeStartupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly registry: SignalRegistryService,
    private readonly registrar: BullRegistrar,
    private readonly processor: CandleFinalizedJobProcessor,
    private readonly warmupService: SignalPreMarketWarmupService,
    private readonly healthState: HealthStateService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.registry.initialize();
    this.processor.reconcileRegistry(this.registry.capture());
    this.unsubscribe = this.registry.subscribe((snapshot) =>
      this.processor.reconcileRegistry(snapshot),
    );
    this.registrar.register();
    this.healthState.recordWorkerRunning(true);
    // 注册表就绪后异步补热（幂等、不阻塞启动）；09:20 cron 为每日主屏障
    void this.warmupService.handlePreMarketWarmup();
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.healthState.recordWorkerRunning(false);
  }
}
