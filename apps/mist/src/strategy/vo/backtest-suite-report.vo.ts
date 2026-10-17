import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StressTestSuiteReport, WfaReport } from '@app/strategy';
import { BacktestRunVo } from './backtest-run.vo';

export class BacktestSuiteReportVo {
  @ApiProperty({ description: '回测套件批次唯一标识' })
  suiteId!: string;

  @ApiProperty({ description: '套件类型', enum: ['WFA', 'STRESS_SUITE'] })
  type!: 'WFA' | 'STRESS_SUITE';

  @ApiProperty({ type: BacktestRunVo, description: '主回测运行快照' })
  masterRun!: BacktestRunVo;

  @ApiProperty({ type: [BacktestRunVo], description: '子阶段回测列表' })
  childRuns!: BacktestRunVo[];

  @ApiPropertyOptional({
    description: 'WFA 滚动前向回测聚合报告',
    nullable: true,
  })
  wfaReport?: WfaReport | null;

  @ApiPropertyOptional({
    description: '极端事件压力测试体检报告',
    nullable: true,
  })
  stressReport?: StressTestSuiteReport | null;
}
