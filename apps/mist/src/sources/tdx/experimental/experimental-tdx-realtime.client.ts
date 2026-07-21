/**
 * ExperimentalTdxRealtimeClient — independent WS consumer for the experimental
 * TDX realtime pathway.
 *
 * It consumes the typed wire (ExperimentalTdxSnapshotFrame) and
 * performs strict validation: JSON number/null, RFC3339, epoch, sequence,
 * exact identity. No alias parsing, no silent fills.
 *
 * Instantiated on every Mist backend start.
 */
import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import {
  ExperimentalTdxSnapshotFrame,
  ACCEPTED_CONTRACT_TUPLE,
} from './experimental-realtime.types';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';

interface ReadyPayload {
  mode?: string;
  payloadType?: string;
  schemaVersion?: number;
  draftRevision?: number;
  acquisitionProfile?: string;
  currentStreamEpoch?: string | null;
  currentGeneration?: number | null;
  datasourceBuildId?: string;
  bridgeBuildId?: string | null;
  ownerId?: string | null;
}

type FrameValidationResult =
  | { frame: ExperimentalTdxSnapshotFrame; reason: null }
  | { frame: null; reason: 'contractMismatch' | 'validationError' };

interface StreamStartedPayload {
  streamEpoch?: string;
  generation?: number;
  mode?: string;
  ownerId?: string;
  bridgeBuildId?: string;
}

export const EXPERIMENTAL_TDX_DESIRED_POSTER = Symbol(
  'EXPERIMENTAL_TDX_DESIRED_POSTER',
);

export type ExperimentalTdxDesiredPoster = (
  endpoint: string,
  symbols: string[],
) => Promise<void>;

@Injectable()
export class ExperimentalTdxRealtimeClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExperimentalTdxRealtimeClient.name);
  private readonly wsUrl: string;
  private readonly clientId: string;
  private readonly reconnectDelayMs: number;
  private readonly desiredEndpoint: string;
  private ws: WebSocket | null = null;
  private isShuttingDown = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private desiredSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private desiredSyncInFlight = false;
  private desiredSyncRetryAttempt = 0;
  // Contract rejected flag: set when ready carries a mismatched contract tuple.
  // Once rejected, stream_started and snapshots are ignored until a valid ready.
  private contractRejected = false;
  // Tracks whether a valid ready has been received on this connection.
  private readyReceived = false;
  // Highest generation seen (monotonicity fence for stream_started).
  private lastGeneration: number | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly store: InMemoryRealtimeStore,
    private readonly allowlist: ExperimentalAllowlistResolver,
    @Optional()
    @Inject(EXPERIMENTAL_TDX_DESIRED_POSTER)
    private readonly desiredPoster?: ExperimentalTdxDesiredPoster,
  ) {
    const baseUrl =
      this.configService.get<string>('TDX_BASE_URL') ?? 'http://127.0.0.1:9001';
    this.clientId =
      this.configService.get<string>('TDX_WS_CLIENT_ID') ??
      'mist-backend-tdx-experimental';
    this.desiredEndpoint = `${baseUrl}/tdx/bridge/desired`;
    const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
    this.wsUrl = `${wsBaseUrl}/ws/tdx-experimental/${this.clientId}`;
    this.reconnectDelayMs = this.configService.get<number>(
      'TDX_WS_RECONNECT_DELAY_MS',
      5000,
    );
  }

  async onModuleInit(): Promise<void> {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.desiredSyncTimer) clearTimeout(this.desiredSyncTimer);
    this.ws?.close();
  }

  /**
   * Send the complete allowlist on the realtime WebSocket. Tests may inject a
   * poster to exercise retry behavior without a live socket.
   */
  private requestDesiredSync(): void {
    if (this.isShuttingDown || this.desiredSyncInFlight) return;
    if (this.desiredSyncTimer) {
      clearTimeout(this.desiredSyncTimer);
      this.desiredSyncTimer = null;
    }
    this.desiredSyncInFlight = true;
    void this.syncDesiredFromAllowlist().then((succeeded) => {
      this.desiredSyncInFlight = false;
      if (this.isShuttingDown) return;
      if (succeeded) {
        this.desiredSyncRetryAttempt = 0;
        return;
      }
      const delayMs = Math.min(
        1000 * 2 ** this.desiredSyncRetryAttempt,
        30_000,
      );
      this.desiredSyncRetryAttempt += 1;
      this.logger.warn(`syncDesired: retrying in ${delayMs}ms`);
      this.desiredSyncTimer = setTimeout(() => {
        this.desiredSyncTimer = null;
        this.requestDesiredSync();
      }, delayMs);
    });
  }

  private async syncDesiredFromAllowlist(): Promise<boolean> {
    const symbols = this.allowlist.entriesList.map((e) => e.formatCode);
    try {
      if (this.desiredPoster) {
        await this.desiredPoster(this.desiredEndpoint, symbols);
      } else {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error('realtime WebSocket is not open');
        }
        this.ws.send(JSON.stringify({ type: 'sync_subscriptions', symbols }));
      }
      this.logger.log(`syncDesired: sent ${symbols.length} symbols`);
      return true;
    } catch (err) {
      this.logger.error(
        `syncDesired failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private connect(): void {
    if (this.isShuttingDown) return;
    this.logger.log(`connecting experimental WS: ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.logger.log('experimental WS TCP connected');
      // Do NOT markConnected yet — wait for a valid `ready` with matching contract.
      this.contractRejected = false;
      this.readyReceived = false;
      this.lastGeneration = null;
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data.toString()).catch((err) => {
        this.logger.error(`message handling error: ${err}`);
      });
    });

    this.ws.on('error', (err) => {
      this.logger.error(`experimental WS error: ${err.message}`);
    });

    this.ws.on('close', () => {
      this.store.markDisconnected();
      if (!this.isShuttingDown) {
        this.logger.warn(
          `experimental WS closed, reconnecting in ${this.reconnectDelayMs}ms`,
        );
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          this.reconnectDelayMs,
        );
      }
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.logger.warn('dropped non-JSON WS message');
      this.store.recordDrop(
        'decodeError',
        null,
        'TDX_EXPERIMENTAL_WS_DECODE_ERROR',
      );
      return;
    }
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
      this.store.recordDrop(
        'validationError',
        null,
        'TDX_EXPERIMENTAL_WS_MESSAGE_INVALID',
      );
      return;
    }
    const obj = msg as Record<string, unknown>;
    const type = obj['type'];
    const data = (obj['data'] ?? {}) as Record<string, unknown>;

    if (type === 'ready') {
      this.handleReady(data as unknown as ReadyPayload);
    } else if (type === 'stream_started') {
      this.handleStreamStarted(data as unknown as StreamStartedPayload);
    } else if (type === 'tdx.experimental.snapshot') {
      this.handleSnapshot(data);
    } else if (type === 'pong') {
      // heartbeat ack
    }
  }

  private handleReady(payload: ReadyPayload): void {
    // Mode check: must be builtin_experimental.
    if (payload.mode !== 'builtin_experimental') {
      this.logger.error(
        `ready mode mismatch: got ${payload.mode ?? 'undefined'}, expected builtin_experimental`,
      );
      this.contractRejected = true;
      this.store.recordDrop(
        'contractMismatch',
        null,
        'TDX_EXPERIMENTAL_MODE_MISMATCH',
      );
      this.store.setRuntimeError(
        'TDX_EXPERIMENTAL_MODE_MISMATCH',
        'ready mode does not match builtin_experimental',
      );
      return;
    }
    // Contract tuple check (exact match, no degradation).
    if (
      payload.payloadType !== ACCEPTED_CONTRACT_TUPLE.payloadType ||
      payload.schemaVersion !== ACCEPTED_CONTRACT_TUPLE.schemaVersion ||
      payload.draftRevision !== ACCEPTED_CONTRACT_TUPLE.draftRevision ||
      payload.acquisitionProfile !== ACCEPTED_CONTRACT_TUPLE.acquisitionProfile
    ) {
      this.logger.error(
        `contract mismatch on ready: got ${JSON.stringify({
          payloadType: payload.payloadType,
          schemaVersion: payload.schemaVersion,
          draftRevision: payload.draftRevision,
          acquisitionProfile: payload.acquisitionProfile,
        })}, refusing to subscribe`,
      );
      this.contractRejected = true;
      this.store.recordDrop(
        'contractMismatch',
        null,
        'TDX_EXPERIMENTAL_CONTRACT_MISMATCH',
      );
      this.store.setRuntimeError(
        'TDX_EXPERIMENTAL_CONTRACT_MISMATCH',
        'ready contract tuple is not accepted by this build',
      );
      return;
    }
    // Contract accepted — mark connected (deferred from TCP open).
    this.contractRejected = false;
    this.readyReceived = true;
    this.store.markConnected();
    this.store.clearRuntimeError();
    this.store.updateRuntimeMetadata({
      ready: true,
      ownerId: payload.ownerId ?? null,
      datasourceBuildId: payload.datasourceBuildId ?? null,
      bridgeBuildId: payload.bridgeBuildId ?? null,
      currentGeneration: payload.currentGeneration ?? null,
    });

    // Atomic epoch/generation pairing:
    // - (null epoch, null generation) = no active owner → clear state.
    // - (non-null epoch, positive int generation) = active owner → establish baseline.
    // - Any mismatch (epoch without generation, or vice versa) → reject.
    const epoch = payload.currentStreamEpoch ?? null;
    const gen = payload.currentGeneration ?? null;
    if (epoch === null && gen === null) {
      this.logger.log('ready: no active owner/epoch, clearing store');
      this.lastGeneration = null;
      this.store.clearAll();
      this.store.updateRuntimeMetadata({
        ownerId: null,
        bridgeBuildId: null,
        currentGeneration: null,
      });
      this.requestDesiredSync();
    } else if (
      epoch !== null &&
      typeof gen === 'number' &&
      Number.isInteger(gen) &&
      gen >= 1
    ) {
      this.logger.log(`ready: recovering epoch ${epoch} gen=${gen}`);
      this.lastGeneration = gen;
      this.store.beginEpoch(epoch);
      this.requestDesiredSync();
    } else {
      this.logger.error(
        `ready: invalid epoch/generation pairing (epoch=${epoch}, gen=${gen}), rejecting`,
      );
      this.contractRejected = true;
      this.readyReceived = false;
      this.store.clearAll();
      this.store.markDisconnected();
      this.store.recordDrop(
        'validationError',
        null,
        'TDX_EXPERIMENTAL_READY_STATE_INVALID',
      );
      this.store.setRuntimeError(
        'TDX_EXPERIMENTAL_READY_STATE_INVALID',
        'ready epoch and generation must both be null or both be valid',
      );
    }
  }

  private handleStreamStarted(payload: StreamStartedPayload): void {
    if (this.contractRejected) {
      this.logger.warn('stream_started ignored: contract rejected');
      return;
    }
    // Strict mode check: must be exactly builtin_experimental.
    if (payload.mode !== 'builtin_experimental') {
      this.logger.warn(`stream_started ignored: mode=${payload.mode}`);
      return;
    }
    if (!this.readyReceived) {
      this.logger.warn('stream_started ignored: no valid ready received first');
      return;
    }
    // Atomic validation: BOTH epoch (non-empty string) AND generation (positive
    // int) must be valid before committing ANY state. No partial updates.
    const gen = payload.generation;
    const epoch = payload.streamEpoch;
    const ownerId = payload.ownerId;
    const bridgeBuildId = payload.bridgeBuildId;
    if (
      typeof epoch !== 'string' ||
      epoch.length === 0 ||
      typeof gen !== 'number' ||
      !Number.isInteger(gen) ||
      gen < 1 ||
      typeof ownerId !== 'string' ||
      ownerId.length === 0 ||
      typeof bridgeBuildId !== 'string' ||
      bridgeBuildId.length === 0
    ) {
      this.logger.warn(
        `stream_started ignored: invalid generation identity (epoch=${epoch}, gen=${gen}, owner=${ownerId}, build=${bridgeBuildId})`,
      );
      this.store.recordDrop(
        'validationError',
        null,
        'TDX_EXPERIMENTAL_STREAM_STARTED_INVALID',
      );
      return;
    }
    // Monotonicity: reject stale (lower or equal) generation.
    if (this.lastGeneration !== null && gen <= this.lastGeneration) {
      this.logger.warn(
        `stream_started ignored: stale generation ${gen} <= ${this.lastGeneration}`,
      );
      return;
    }
    // Commit both atomically (no await between, synchronous).
    this.lastGeneration = gen;
    this.logger.log(`stream_started: new epoch ${epoch} gen=${gen}`);
    this.store.beginEpoch(epoch);
    this.store.updateRuntimeMetadata({
      ready: true,
      ownerId,
      bridgeBuildId,
      currentGeneration: gen,
    });
    this.requestDesiredSync();
  }

  private handleSnapshot(data: Record<string, unknown>): void {
    if (this.contractRejected) {
      this.logger.warn('snapshot ignored: contract rejected');
      this.store.recordDrop(
        'contractMismatch',
        typeof data['symbol'] === 'string' ? data['symbol'] : null,
        'TDX_EXPERIMENTAL_CONTRACT_REJECTED',
      );
      return;
    }
    // Strict validation — no alias parsing, no fills.
    const validation = this.validateFrame(data);
    if (validation.frame === null) {
      const errorCode =
        validation.reason === 'contractMismatch'
          ? 'TDX_EXPERIMENTAL_CONTRACT_MISMATCH'
          : 'TDX_EXPERIMENTAL_FRAME_VALIDATION_ERROR';
      const symbol = typeof data['symbol'] === 'string' ? data['symbol'] : null;
      this.store.recordDrop(validation.reason, symbol, errorCode);
      if (validation.reason === 'contractMismatch') {
        this.store.setRuntimeError(
          errorCode,
          'snapshot contract tuple is not accepted by this build',
        );
      }
      return;
    }
    const frame = validation.frame;

    // Exact identity authorization.
    if (!this.allowlist.isAuthorized(frame.symbol)) {
      this.logger.debug(
        `dropped snapshot: symbol ${frame.symbol} not in allowlist`,
      );
      this.store.recordDrop(
        'symbolNotAuthorized',
        frame.symbol,
        'TDX_EXPERIMENTAL_SYMBOL_NOT_AUTHORIZED',
      );
      return;
    }

    // Epoch/sequence fence (synchronous CAS).
    this.store.applyIfCurrentAndNewer(
      frame.symbol,
      frame.streamEpoch,
      frame.sequence,
      frame,
    );
  }

  /**
   * Strictly validate a raw data object into a typed frame.
   * Returns null on any validation failure (reject, no fill).
   */
  private validateFrame(data: Record<string, unknown>): FrameValidationResult {
    try {
      if (!hasExactKeys(data, ROOT_REQUIRED_KEYS, ROOT_ALLOWED_KEYS)) {
        return { frame: null, reason: 'validationError' };
      }
      const payloadType = data['payloadType'];
      if (payloadType !== ACCEPTED_CONTRACT_TUPLE.payloadType)
        return { frame: null, reason: 'contractMismatch' };
      const schemaVersion = data['schemaVersion'];
      if (schemaVersion !== ACCEPTED_CONTRACT_TUPLE.schemaVersion)
        return { frame: null, reason: 'contractMismatch' };
      const draftRevision = data['draftRevision'];
      if (draftRevision !== ACCEPTED_CONTRACT_TUPLE.draftRevision)
        return { frame: null, reason: 'contractMismatch' };
      const acquisitionProfile = data['acquisitionProfile'];
      if (acquisitionProfile !== ACCEPTED_CONTRACT_TUPLE.acquisitionProfile)
        return { frame: null, reason: 'contractMismatch' };
      // Validate contractStatus.
      const contractStatus = data['contractStatus'];
      if (contractStatus !== 'experimental')
        return { frame: null, reason: 'validationError' };
      // Validate unitStatus.
      const unitStatus = data['unitStatus'];
      if (unitStatus !== 'native-unverified')
        return { frame: null, reason: 'validationError' };

      const streamEpoch = data['streamEpoch'];
      if (typeof streamEpoch !== 'string' || streamEpoch.length === 0)
        return { frame: null, reason: 'validationError' };
      const sequence = data['sequence'];
      if (
        typeof sequence !== 'number' ||
        !Number.isInteger(sequence) ||
        sequence < 1 ||
        sequence > Number.MAX_SAFE_INTEGER
      )
        return { frame: null, reason: 'validationError' };
      const symbol = data['symbol'];
      if (typeof symbol !== 'string' || symbol.length === 0)
        return { frame: null, reason: 'validationError' };
      const capturedAt = data['capturedAt'];
      if (typeof capturedAt !== 'string' || !this.isRfc3339(capturedAt))
        return { frame: null, reason: 'validationError' };
      const eventTime = data['eventTime'] ?? null;
      if (eventTime !== null) {
        if (typeof eventTime !== 'string' || !this.isRfc3339(eventTime))
          return { frame: null, reason: 'validationError' };
      }

      const snapRaw = data['snapshot'];
      if (
        typeof snapRaw !== 'object' ||
        snapRaw === null ||
        Array.isArray(snapRaw)
      )
        return { frame: null, reason: 'validationError' };
      const snap = snapRaw as Record<string, unknown>;
      if (!this.validatePrices(snap))
        return { frame: null, reason: 'validationError' };

      const qualityRaw = data['quality'];
      if (!this.validateQuality(qualityRaw))
        return { frame: null, reason: 'validationError' };

      if (!Object.prototype.hasOwnProperty.call(data, 'eventTime')) {
        data['eventTime'] = null;
      }
      for (const key of SNAPSHOT_ALLOWED_KEYS) {
        if (
          key !== 'last' &&
          !Object.prototype.hasOwnProperty.call(snap, key)
        ) {
          snap[key] = null;
        }
      }

      return {
        reason: null,
        frame: data as unknown as ExperimentalTdxSnapshotFrame,
      };
    } catch {
      return { frame: null, reason: 'validationError' };
    }
  }

  private validatePrices(snap: Record<string, unknown>): boolean {
    if (!hasExactKeys(snap, ['last'], SNAPSHOT_ALLOWED_KEYS)) return false;
    const last = this.requireFiniteNumber(snap['last']);
    if (last === null) return false;
    // Optional fields: null/undefined allowed; present-but-invalid → reject frame.
    const open = optionalFiniteNumberStrict(snap['open']);
    if (open === INVALID) return false;
    const high = optionalFiniteNumberStrict(snap['high']);
    if (high === INVALID) return false;
    const low = optionalFiniteNumberStrict(snap['low']);
    if (low === INVALID) return false;
    const lastClose = optionalFiniteNumberStrict(snap['lastClose']);
    if (lastClose === INVALID) return false;
    const nativeVolume = optionalFiniteNumberStrict(snap['nativeVolume']);
    if (nativeVolume === INVALID) return false;
    const nativeAmount = optionalFiniteNumberStrict(snap['nativeAmount']);
    if (nativeAmount === INVALID) return false;
    return true;
  }

  private validateQuality(raw: unknown): boolean {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      return false;
    const q = raw as Record<string, unknown>;
    if (!hasExactKeys(q, [], QUALITY_ALLOWED_KEYS)) return false;
    for (const key of QUALITY_ALLOWED_KEYS) {
      if (!(key in q)) continue;
      if (typeof q[key] !== 'boolean') return false;
    }
    return true;
  }

  /** Required finite number; rejects null, undefined, NaN, Infinity, booleans. */
  private requireFiniteNumber(v: unknown): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return v;
  }

  /**
   * Strict RFC3339 check: must be date-time with timezone offset.
   * Rejects pure dates ("2026-07-17") and offset-less times.
   */
  private isRfc3339(value: string): boolean {
    return isStrictRfc3339(value);
  }
}

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const ROOT_REQUIRED_KEYS = [
  'payloadType',
  'schemaVersion',
  'draftRevision',
  'contractStatus',
  'acquisitionProfile',
  'streamEpoch',
  'sequence',
  'symbol',
  'capturedAt',
  'snapshot',
  'unitStatus',
  'quality',
] as const;
const ROOT_ALLOWED_KEYS = [...ROOT_REQUIRED_KEYS, 'eventTime'] as const;
const SNAPSHOT_ALLOWED_KEYS = [
  'last',
  'open',
  'high',
  'low',
  'lastClose',
  'nativeVolume',
  'nativeAmount',
] as const;
const QUALITY_ALLOWED_KEYS = [
  'stale',
  'partialPrices',
  'nativeTimeUnavailable',
] as const;

function hasExactKeys(
  object: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return (
    required.every((key) =>
      Object.prototype.hasOwnProperty.call(object, key),
    ) && Object.keys(object).every((key) => allowedSet.has(key))
  );
}

function isStrictRfc3339(value: string): boolean {
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const calendarProbe = new Date(0);
  calendarProbe.setUTCFullYear(year, month - 1, day);
  calendarProbe.setUTCHours(hour, minute, second, 0);
  return (
    calendarProbe.getUTCFullYear() === year &&
    calendarProbe.getUTCMonth() === month - 1 &&
    calendarProbe.getUTCDate() === day &&
    calendarProbe.getUTCHours() === hour &&
    calendarProbe.getUTCMinutes() === minute &&
    calendarProbe.getUTCSeconds() === second
  );
}

/** Sentinel for "present but invalid" — caller rejects the frame. */
const INVALID = Symbol('invalid');

/** Optional finite number: null/undefined → null; present-but-invalid → INVALID. */
function optionalFiniteNumberStrict(
  v: unknown,
): number | null | typeof INVALID {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return INVALID;
  return v;
}
