/**
 * TdxRealtimeClient — formal WS consumer for the TDX realtime pathway.
 *
 * It consumes the typed wire (TdxRealtimeSnapshotFrame) and
 * performs strict validation: provider-native numeric values, RFC3339, epoch,
 * sequence, exact identity. No silent fills.
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
  TdxRealtimeSnapshotFrame,
  ACCEPTED_CONTRACT_TUPLE,
} from './realtime.types';
import { TdxRealtimeStore } from './realtime.store';
import { TdxRealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { RealtimeSnapshotIngressService } from '../../../realtime/realtime-snapshot-ingress.service';
import {
  readTdxNativeNumber,
  toTdxCanonicalSnapshot,
} from './realtime-native.adapter';

interface ReadyPayload {
  mode?: string;
  payloadType?: string;
  schemaVersion?: number;
  source?: string;
  sequenceScope?: string;
  acquisitionProfile?: string;
  streamEpoch?: string | null;
  generation?: number;
  datasourceBuildId?: string;
  bridgeBuildId?: string | null;
  ownerId?: string | null;
}

type FrameValidationResult =
  | { frame: TdxRealtimeSnapshotFrame; reason: null }
  | { frame: null; reason: 'contractMismatch' | 'validationError' };

interface StreamStartedPayload {
  payloadType?: string;
  schemaVersion?: number;
  source?: string;
  sequenceScope?: string;
  acquisitionProfile?: string;
  streamEpoch?: string;
  generation?: number;
  mode?: string;
  ownerId?: string;
  bridgeBuildId?: string;
}

export const TDX_REALTIME_DESIRED_POSTER = Symbol(
  'TDX_REALTIME_DESIRED_POSTER',
);

export type TdxRealtimeDesiredPoster = (
  endpoint: string,
  symbols: string[],
) => Promise<void>;

@Injectable()
export class TdxRealtimeClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TdxRealtimeClient.name);
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
    private readonly store: TdxRealtimeStore,
    private readonly allowlist: TdxRealtimeAllowlistResolver,
    @Optional()
    @Inject(TDX_REALTIME_DESIRED_POSTER)
    private readonly desiredPoster?: TdxRealtimeDesiredPoster,
    @Optional()
    private readonly ingress?: RealtimeSnapshotIngressService,
  ) {
    const baseUrl =
      this.configService.get<string>('TDX_BASE_URL') ?? 'http://127.0.0.1:9001';
    this.clientId =
      this.configService.get<string>('TDX_WS_CLIENT_ID') ??
      'mist-backend-tdx-realtime';
    this.desiredEndpoint = `${baseUrl}/tdx/bridge/desired`;
    const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
    this.wsUrl = `${wsBaseUrl}/ws/realtime/tdx/${this.clientId}`;
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
    this.logger.log(`connecting realtime WS: ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.logger.log('realtime WS TCP connected');
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
      this.logger.error(`realtime WS error: ${err.message}`);
    });

    this.ws.on('close', () => {
      this.store.markDisconnected();
      if (!this.isShuttingDown) {
        this.logger.warn(
          `realtime WS closed, reconnecting in ${this.reconnectDelayMs}ms`,
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
        'TDX_REALTIME_WS_DECODE_ERROR',
      );
      return;
    }
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
      this.store.recordDrop(
        'validationError',
        null,
        'TDX_REALTIME_WS_MESSAGE_INVALID',
      );
      return;
    }
    const obj = msg as Record<string, unknown>;
    const type = obj['type'];
    const data = (obj['data'] ?? {}) as Record<string, unknown>;

    if (type === 'realtime.ready') {
      this.handleReady(data as unknown as ReadyPayload);
    } else if (type === 'realtime.stream_started') {
      this.handleStreamStarted(data as unknown as StreamStartedPayload);
    } else if (type === 'realtime.native_snapshot') {
      this.handleSnapshot(data);
    } else if (type === 'pong') {
      // heartbeat ack
    }
  }

  private handleReady(payload: ReadyPayload): void {
    if (payload.mode !== 'builtin') {
      this.logger.error(
        `ready mode mismatch: got ${payload.mode ?? 'undefined'}, expected builtin`,
      );
      this.contractRejected = true;
      this.store.recordDrop(
        'contractMismatch',
        null,
        'TDX_REALTIME_MODE_MISMATCH',
      );
      this.store.setRuntimeError(
        'TDX_REALTIME_MODE_MISMATCH',
        'ready mode does not match builtin',
      );
      return;
    }
    // Contract tuple check (exact match, no degradation).
    if (
      payload.payloadType !== ACCEPTED_CONTRACT_TUPLE.payloadType ||
      payload.schemaVersion !== ACCEPTED_CONTRACT_TUPLE.schemaVersion ||
      payload.source !== ACCEPTED_CONTRACT_TUPLE.source ||
      payload.sequenceScope !== ACCEPTED_CONTRACT_TUPLE.sequenceScope ||
      payload.acquisitionProfile !== ACCEPTED_CONTRACT_TUPLE.acquisitionProfile
    ) {
      this.logger.error(
        `contract mismatch on ready: got ${JSON.stringify({
          payloadType: payload.payloadType,
          schemaVersion: payload.schemaVersion,
          source: payload.source,
          sequenceScope: payload.sequenceScope,
          acquisitionProfile: payload.acquisitionProfile,
        })}, refusing to subscribe`,
      );
      this.contractRejected = true;
      this.store.recordDrop(
        'contractMismatch',
        null,
        'TDX_REALTIME_CONTRACT_MISMATCH',
      );
      this.store.setRuntimeError(
        'TDX_REALTIME_CONTRACT_MISMATCH',
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
      currentGeneration: payload.generation ?? null,
    });

    // Atomic epoch/generation pairing:
    // - (null epoch, null generation) = no active owner → clear state.
    // - (non-null epoch, positive int generation) = active owner → establish baseline.
    // - Any mismatch (epoch without generation, or vice versa) → reject.
    const epoch = payload.streamEpoch ?? null;
    const gen = payload.generation ?? 0;
    if (epoch === null && gen === 0) {
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
        'TDX_REALTIME_READY_STATE_INVALID',
      );
      this.store.setRuntimeError(
        'TDX_REALTIME_READY_STATE_INVALID',
        'ready epoch and generation must both be null or both be valid',
      );
    }
  }

  private handleStreamStarted(payload: StreamStartedPayload): void {
    if (this.contractRejected) {
      this.logger.warn('stream_started ignored: contract rejected');
      return;
    }
    if (payload.mode !== 'builtin') {
      this.logger.warn(`stream_started ignored: mode=${payload.mode}`);
      return;
    }
    if (
      payload.payloadType !== ACCEPTED_CONTRACT_TUPLE.payloadType ||
      payload.schemaVersion !== ACCEPTED_CONTRACT_TUPLE.schemaVersion ||
      payload.source !== ACCEPTED_CONTRACT_TUPLE.source ||
      payload.sequenceScope !== ACCEPTED_CONTRACT_TUPLE.sequenceScope ||
      payload.acquisitionProfile !== ACCEPTED_CONTRACT_TUPLE.acquisitionProfile
    ) {
      this.store.recordDrop(
        'contractMismatch',
        null,
        'TDX_REALTIME_CONTRACT_MISMATCH',
      );
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
        'TDX_REALTIME_STREAM_STARTED_INVALID',
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
        'TDX_REALTIME_CONTRACT_REJECTED',
      );
      return;
    }
    // Strict validation — no alias parsing, no fills.
    const validation = this.validateFrame(data);
    if (validation.frame === null) {
      const errorCode =
        validation.reason === 'contractMismatch'
          ? 'TDX_REALTIME_CONTRACT_MISMATCH'
          : 'TDX_REALTIME_FRAME_VALIDATION_ERROR';
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
        'TDX_REALTIME_SYMBOL_NOT_AUTHORIZED',
      );
      return;
    }

    // Epoch/sequence fence (synchronous CAS).
    const accepted = this.store.applyIfCurrentAndNewer(
      frame.symbol,
      frame.streamEpoch,
      frame.sequence,
      frame,
    );
    if (accepted) this.ingress?.handleSnapshot(toTdxCanonicalSnapshot(frame));
  }

  private validateFrame(data: Record<string, unknown>): FrameValidationResult {
    try {
      if (!hasExactKeys(data, FRAME_KEYS)) {
        return { frame: null, reason: 'validationError' };
      }
      if (
        data['payloadType'] !== ACCEPTED_CONTRACT_TUPLE.payloadType ||
        data['schemaVersion'] !== ACCEPTED_CONTRACT_TUPLE.schemaVersion ||
        data['source'] !== ACCEPTED_CONTRACT_TUPLE.source ||
        data['sequenceScope'] !== ACCEPTED_CONTRACT_TUPLE.sequenceScope ||
        data['acquisitionProfile'] !==
          ACCEPTED_CONTRACT_TUPLE.acquisitionProfile
      ) {
        return { frame: null, reason: 'contractMismatch' };
      }

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
      if (typeof capturedAt !== 'string' || !isStrictRfc3339(capturedAt))
        return { frame: null, reason: 'validationError' };
      const native = data['native'];
      if (
        !isRecord(native) ||
        !hasPositiveNumber(native, ['Now', 'now', 'Price', 'price'])
      )
        return { frame: null, reason: 'validationError' };

      return {
        reason: null,
        frame: data as unknown as TdxRealtimeSnapshotFrame,
      };
    } catch {
      return { frame: null, reason: 'validationError' };
    }
  }
}

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const FRAME_KEYS = [
  'payloadType',
  'schemaVersion',
  'source',
  'acquisitionProfile',
  'streamEpoch',
  'sequence',
  'sequenceScope',
  'symbol',
  'capturedAt',
  'native',
] as const;

function hasExactKeys(
  object: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(object);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasPositiveNumber(
  native: Record<string, unknown>,
  aliases: readonly string[],
): boolean {
  const value = readTdxNativeNumber(native, aliases);
  return value !== null && value > 0;
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
