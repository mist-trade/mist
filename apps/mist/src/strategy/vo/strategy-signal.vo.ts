import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DataSource,
  Period,
  StrategySignal,
  StrategySignalKind,
  StrategySignalSource,
} from '@app/shared-data';
import { availabilityKey } from '@app/strategy';

export class StrategySignalSecurityVo {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  static fromEntity(
    security: NonNullable<StrategySignal['security']>,
  ): StrategySignalSecurityVo {
    const vo = new StrategySignalSecurityVo();
    vo.id = security.id;
    vo.code = security.code;
    vo.name = security.name;
    return vo;
  }
}

export class StrategySignalVo {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  strategyDefinitionId!: number;

  @ApiProperty()
  strategyVersionId!: number;

  @ApiProperty()
  securityId!: number;

  @ApiPropertyOptional({ type: StrategySignalSecurityVo })
  security?: StrategySignalSecurityVo;

  @ApiProperty({ enum: Period })
  period!: Period;

  @ApiProperty({ enum: DataSource })
  source!: DataSource;

  @ApiProperty({ type: String, format: 'date-time' })
  signalTime!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      '信号生效时刻 = availabilityKey(signalTime, period)，用于展示/聚合',
  })
  effectiveTime!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  pivotTime?: Date | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  pivotPrice!: number | null;

  @ApiProperty({ enum: StrategySignalSource })
  signalSource!: StrategySignalSource;

  @ApiProperty({ enum: StrategySignalKind })
  signalKind!: StrategySignalKind;

  @ApiProperty()
  signalType!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  badgeText!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayTag!: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  styleMeta!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  triggerPeriod!: number | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  decisionTrace!: Record<string, unknown> | null;

  @ApiProperty({ type: Object })
  contextSnapshot!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  ruleSnapshot!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  static fromEntity(entity: StrategySignal): StrategySignalVo {
    const vo = new StrategySignalVo();
    vo.id = entity.id;
    vo.strategyDefinitionId = entity.strategyDefinitionId;
    vo.strategyVersionId = entity.strategyVersionId;
    vo.securityId = entity.securityId;
    if (entity.security) {
      vo.security = StrategySignalSecurityVo.fromEntity(entity.security);
    }
    vo.period = entity.period;
    vo.source = entity.source;
    vo.signalTime = entity.signalTime;
    vo.effectiveTime = availabilityKey({
      period: entity.period,
      timestamp: entity.signalTime,
    });
    vo.pivotTime = entity.pivotTime ?? null;
    vo.signalSource = entity.signalSource;
    vo.signalKind = entity.signalKind;
    vo.signalType = entity.signalType;
    vo.decisionTrace = entity.decisionTrace ?? null;
    vo.contextSnapshot = entity.contextSnapshot ?? {};
    vo.ruleSnapshot = entity.ruleSnapshot ?? {};
    vo.createdAt = entity.createdAt;
    vo.pivotPrice = readFiniteNumber(entity.contextSnapshot?.pivotPrice);
    vo.badgeText =
      readNonEmptyString(entity.contextSnapshot?.badgeText) ??
      readNonEmptyString(entity.decisionTrace?.badgeText);
    vo.displayTag =
      readNonEmptyString(entity.contextSnapshot?.displayTag) ??
      readNonEmptyString(entity.decisionTrace?.displayTag);
    vo.styleMeta = readPlainRecord(entity.contextSnapshot?.styleMeta);
    vo.triggerPeriod = readFiniteNumber(entity.contextSnapshot?.triggerPeriod);
    return vo;
  }
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
}
