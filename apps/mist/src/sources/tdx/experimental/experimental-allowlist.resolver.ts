/**
 * ExperimentalAllowlistResolver — exact, case-sensitive identity binding.
 *
 * Reads `TDX_EXPERIMENTAL_ALLOWLIST` env (comma-separated formatCodes, ≤5).
 * Resolves each to exactly one DB record via `source=tdx + enabled=true +
 * status=ACTIVE + formatCode case-sensitive exact match`.
 *
 * Uses `BINARY` comparison in SQL to defeat MySQL utf8mb4_unicode_ci
 * case-insensitivity. Zero or multiple matches → fail-closed (refuse start).
 * Never falls back to normalizeSecurityCode (which strips exchange).
 */
import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Security,
  SecuritySourceConfig,
  DataSource,
  SecurityStatus,
} from '@app/shared-data';

export interface AllowlistEntry {
  formatCode: string;
  securityId: number;
}

@Injectable()
export class ExperimentalAllowlistResolver implements OnModuleInit {
  private readonly logger = new Logger(ExperimentalAllowlistResolver.name);
  private readonly allowlist: string[];
  private readonly entries = new Map<string, AllowlistEntry>();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigRepo: Repository<SecuritySourceConfig>,
    @InjectRepository(Security)
    private readonly securityRepo: Repository<Security>,
  ) {
    const raw = this.configService.get<string>(
      'TDX_EXPERIMENTAL_ALLOWLIST',
      '',
    );
    this.allowlist = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async onModuleInit(): Promise<void> {
    if (this.allowlist.length === 0) {
      this.logger.warn(
        'TDX_EXPERIMENTAL_ALLOWLIST is empty — experimental path will reject all symbols',
      );
      return;
    }
    if (this.allowlist.length > 5) {
      throw new BadRequestException(
        `TDX_EXPERIMENTAL_ALLOWLIST has ${this.allowlist.length} entries; maximum is 5`,
      );
    }
    // Resolve each entry: exactly one match, case-sensitive.
    for (const formatCode of this.allowlist) {
      const entry = await this.resolveExact(formatCode);
      this.entries.set(formatCode, entry);
      this.logger.log(
        `allowlist resolved: ${formatCode} → securityId=${entry.securityId}`,
      );
    }
  }

  /**
   * Resolve a formatCode to a securityId. Returns null if not in allowlist.
   * Throws if the symbol is in the allowlist but resolution failed at init.
   */
  resolve(formatCode: string): AllowlistEntry | null {
    // Case-sensitive exact match against allowlist.
    const exact = this.entries.get(formatCode);
    return exact ?? null;
  }

  isAuthorized(formatCode: string): boolean {
    return this.entries.has(formatCode);
  }

  get entriesList(): readonly AllowlistEntry[] {
    return [...this.entries.values()];
  }

  private async resolveExact(formatCode: string): Promise<AllowlistEntry> {
    // Query with BINARY comparison for case-sensitive exact match.
    // security_source_configs.formatCode joined to securities for status=ACTIVE.
    const rows = await this.sourceConfigRepo
      .createQueryBuilder('cfg')
      .innerJoin(Security, 'sec', 'sec.id = cfg.securityId')
      .where('cfg.source = :source', { source: DataSource.TDX })
      .andWhere('cfg.enabled = :enabled', { enabled: true })
      .andWhere('sec.status = :status', { status: SecurityStatus.ACTIVE })
      .andWhere('BINARY cfg.formatCode = :formatCode', { formatCode })
      .select(['cfg.securityId AS securityId', 'cfg.formatCode AS formatCode'])
      .getRawMany<{ securityId: number; formatCode: string }>();

    if (rows.length !== 1) {
      throw new BadRequestException(
        `allowlist entry '${formatCode}' matched ${rows.length} records (expected exactly 1); ` +
          'experimental runtime fails closed',
      );
    }
    return { formatCode: rows[0].formatCode, securityId: rows[0].securityId };
  }
}
