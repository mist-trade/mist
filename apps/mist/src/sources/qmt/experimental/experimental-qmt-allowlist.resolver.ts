import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Security,
  SecuritySourceConfig,
  SecurityStatus,
} from '@app/shared-data';
import { Repository } from 'typeorm';

export interface QmtExperimentalAllowlistEntry {
  formatCode: string;
  securityId: number;
}

@Injectable()
export class ExperimentalQmtAllowlistResolver implements OnModuleInit {
  private readonly logger = new Logger(ExperimentalQmtAllowlistResolver.name);
  private readonly requested: string[];
  private readonly resolved = new Map<string, QmtExperimentalAllowlistEntry>();

  constructor(
    config: ConfigService,
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigs: Repository<SecuritySourceConfig>,
  ) {
    this.requested = (config.get<string>('QMT_EXPERIMENTAL_ALLOWLIST') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  async onModuleInit(): Promise<void> {
    if (new Set(this.requested).size !== this.requested.length) {
      throw new BadRequestException(
        'QMT_EXPERIMENTAL_ALLOWLIST contains duplicate formatCodes',
      );
    }
    if (this.requested.length > 5) {
      throw new BadRequestException(
        `QMT_EXPERIMENTAL_ALLOWLIST has ${this.requested.length} entries; maximum is 5`,
      );
    }
    if (this.requested.length === 0) {
      this.logger.warn(
        'QMT_EXPERIMENTAL_ALLOWLIST is empty; native subscriptions remain empty',
      );
      return;
    }
    for (const formatCode of this.requested) {
      const entry = await this.resolveExact(formatCode);
      this.resolved.set(formatCode, entry);
    }
  }

  isAuthorized(formatCode: string): boolean {
    return this.resolved.has(formatCode);
  }

  get entriesList(): readonly QmtExperimentalAllowlistEntry[] {
    return [...this.resolved.values()];
  }

  private async resolveExact(
    formatCode: string,
  ): Promise<QmtExperimentalAllowlistEntry> {
    const rows = await this.sourceConfigs
      .createQueryBuilder('cfg')
      .innerJoin(Security, 'sec', 'sec.id = cfg.securityId')
      .where('cfg.source = :source', { source: DataSource.QMT })
      .andWhere('cfg.enabled = :enabled', { enabled: true })
      .andWhere('sec.status = :status', { status: SecurityStatus.ACTIVE })
      .andWhere('BINARY cfg.formatCode = :formatCode', { formatCode })
      .select(['cfg.securityId AS securityId', 'cfg.formatCode AS formatCode'])
      .getRawMany<{ securityId: number; formatCode: string }>();

    if (rows.length !== 1) {
      throw new BadRequestException(
        `QMT allowlist entry '${formatCode}' matched ${rows.length} records (expected exactly 1)`,
      );
    }
    return rows[0];
  }
}
