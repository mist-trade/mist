import { Injectable, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface SecurityCheckpoint {
  securityId: number;
  symbol: string;
  source: 'tdx' | 'qmt';
  verifiedUntil: string; // 'YYYY-MM-DD'
  updatedAt: string; // ISO 8601
}

export interface SyncCheckpointsFile {
  version: 1;
  checkpoints: Record<string, SecurityCheckpoint>; // key: `${source}:${symbol}`
}

@Injectable()
export class SyncCheckpointManager {
  private readonly logger = new Logger(SyncCheckpointManager.name);
  private readonly filePath: string;
  private cache: SyncCheckpointsFile | null = null;

  constructor(@Optional() filePath?: string) {
    this.filePath =
      filePath || path.resolve(process.cwd(), '.data', 'sync-checkpoints.json');
  }

  private ensureLoaded(): SyncCheckpointsFile {
    if (this.cache) {
      return this.cache;
    }

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          parsed.version === 1 &&
          typeof parsed.checkpoints === 'object'
        ) {
          this.cache = parsed;
          return this.cache!;
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to read sync checkpoints from ${this.filePath}, initializing new cache: ${err}`,
      );
    }

    this.cache = {
      version: 1,
      checkpoints: {},
    };
    return this.cache;
  }

  private persist(): void {
    if (!this.cache) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.cache, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      this.logger.error(
        `Failed to persist sync checkpoints to ${this.filePath}: ${err}`,
      );
    }
  }

  public getCheckpoint(
    source: string,
    symbol: string,
  ): SecurityCheckpoint | null {
    const data = this.ensureLoaded();
    const key = `${source.toLowerCase()}:${symbol.toUpperCase()}`;
    return data.checkpoints[key] ?? null;
  }

  public updateCheckpoint(
    securityId: number,
    symbol: string,
    source: string,
    verifiedUntil: string,
  ): void {
    const data = this.ensureLoaded();
    const key = `${source.toLowerCase()}:${symbol.toUpperCase()}`;
    const existing = data.checkpoints[key];

    // verifiedUntil 只能单调向前推进（不能倒退）
    if (existing && existing.verifiedUntil >= verifiedUntil) {
      return;
    }

    data.checkpoints[key] = {
      securityId,
      symbol: symbol.toUpperCase(),
      source: source.toLowerCase() as 'tdx' | 'qmt',
      verifiedUntil,
      updatedAt: new Date().toISOString(),
    };

    this.persist();
  }

  public getAllCheckpoints(): Record<string, SecurityCheckpoint> {
    return { ...this.ensureLoaded().checkpoints };
  }
}
