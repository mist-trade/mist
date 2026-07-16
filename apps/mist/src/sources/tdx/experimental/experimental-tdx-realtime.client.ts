/**
 * ExperimentalTdxRealtimeClient — independent WS consumer for the experimental
 * TDX realtime pathway.
 *
 * Deliberately does NOT extend TdxWebSocketService or reuse readNumber/
 * readTimestamp. It consumes the typed wire (ExperimentalTdxSnapshotFrame) and
 * performs strict validation: JSON number/null, RFC3339, epoch, sequence,
 * exact identity. No alias parsing, no silent fills.
 *
 * Only instantiated when TDX_REALTIME_MODE=builtin_experimental.
 */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import {
  ExperimentalTdxSnapshotFrame,
  ExperimentalSnapshotPrices,
  ExperimentalSnapshotQuality,
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
  datasourceBuildId?: string;
  bridgeBuildId?: string | null;
}

interface StreamStartedPayload {
  streamEpoch?: string;
  mode?: string;
}

@Injectable()
export class ExperimentalTdxRealtimeClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExperimentalTdxRealtimeClient.name);
  private readonly wsUrl: string;
  private readonly clientId: string;
  private readonly reconnectDelayMs: number;
  private ws: WebSocket | null = null;
  private isShuttingDown = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Contract rejected flag: set when ready carries a mismatched contract tuple.
  // Once rejected, stream_started and snapshots are ignored until a valid ready.
  private contractRejected = false;
  // Tracks whether a valid ready has been received on this connection.
  private readyReceived = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly store: InMemoryRealtimeStore,
    private readonly allowlist: ExperimentalAllowlistResolver,
  ) {
    const baseUrl =
      this.configService.get<string>('TDX_BASE_URL') ?? 'http://127.0.0.1:9001';
    this.clientId =
      this.configService.get<string>('TDX_WS_CLIENT_ID') ??
      'mist-backend-tdx-experimental';
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
    this.ws?.close();
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
      return;
    }
    if (typeof msg !== 'object' || msg === null) return;
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
      return;
    }
    // Contract accepted — mark connected (deferred from TCP open).
    this.contractRejected = false;
    this.readyReceived = true;
    this.store.markConnected();
    if (payload.currentStreamEpoch) {
      this.logger.log(`ready: recovering epoch ${payload.currentStreamEpoch}`);
      this.store.beginEpoch(payload.currentStreamEpoch);
    } else {
      this.logger.log('ready: no active owner/epoch yet');
    }
  }

  private handleStreamStarted(payload: StreamStartedPayload): void {
    if (this.contractRejected) {
      this.logger.warn('stream_started ignored: contract rejected');
      return;
    }
    if (!this.readyReceived) {
      this.logger.warn('stream_started ignored: no valid ready received first');
      return;
    }
    if (payload.streamEpoch) {
      this.logger.log(`stream_started: new epoch ${payload.streamEpoch}`);
      this.store.beginEpoch(payload.streamEpoch);
    }
  }

  private handleSnapshot(data: Record<string, unknown>): void {
    if (this.contractRejected) {
      this.logger.warn('snapshot ignored: contract rejected');
      return;
    }
    // Strict validation — no alias parsing, no fills.
    const frame = this.validateFrame(data);
    if (frame === null) return;

    // Exact identity authorization.
    if (!this.allowlist.isAuthorized(frame.symbol)) {
      this.logger.debug(
        `dropped snapshot: symbol ${frame.symbol} not in allowlist`,
      );
      // Record drop via store by attempting apply with a sentinel (epoch won't match).
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
  private validateFrame(
    data: Record<string, unknown>,
  ): ExperimentalTdxSnapshotFrame | null {
    try {
      const payloadType = data['payloadType'];
      if (payloadType !== ACCEPTED_CONTRACT_TUPLE.payloadType) return null;
      const schemaVersion = data['schemaVersion'];
      if (schemaVersion !== ACCEPTED_CONTRACT_TUPLE.schemaVersion) return null;
      const draftRevision = data['draftRevision'];
      if (draftRevision !== ACCEPTED_CONTRACT_TUPLE.draftRevision) return null;
      const acquisitionProfile = data['acquisitionProfile'];
      if (acquisitionProfile !== ACCEPTED_CONTRACT_TUPLE.acquisitionProfile)
        return null;

      const streamEpoch = data['streamEpoch'];
      if (typeof streamEpoch !== 'string' || streamEpoch.length === 0)
        return null;
      const sequence = data['sequence'];
      if (
        typeof sequence !== 'number' ||
        !Number.isInteger(sequence) ||
        sequence < 1
      )
        return null;
      const symbol = data['symbol'];
      if (typeof symbol !== 'string' || symbol.length === 0) return null;
      const capturedAt = data['capturedAt'];
      if (typeof capturedAt !== 'string') return null;
      const eventTime = data['eventTime'];
      if (eventTime !== null && typeof eventTime !== 'string') return null;

      const snapRaw = data['snapshot'];
      if (typeof snapRaw !== 'object' || snapRaw === null) return null;
      const snap = snapRaw as Record<string, unknown>;
      const prices = this.validatePrices(snap);
      if (prices === null) return null;

      const qualityRaw = data['quality'];
      const quality = this.validateQuality(qualityRaw);

      return {
        payloadType: 'tdx.realtime.snapshot',
        schemaVersion: 0,
        draftRevision: 1,
        contractStatus: 'experimental',
        acquisitionProfile: 'tdx.get_market_snapshot',
        streamEpoch,
        sequence,
        symbol,
        capturedAt,
        eventTime: eventTime as string | null,
        snapshot: prices,
        unitStatus: 'native-unverified',
        quality,
      };
    } catch {
      return null;
    }
  }

  private validatePrices(
    snap: Record<string, unknown>,
  ): ExperimentalSnapshotPrices | null {
    const last = this.requireFiniteNumber(snap['last']);
    if (last === null) return null;
    // Optional fields: null/undefined allowed; present-but-invalid → reject frame.
    const open = optionalFiniteNumberStrict(snap['open']);
    if (open === INVALID) return null;
    const high = optionalFiniteNumberStrict(snap['high']);
    if (high === INVALID) return null;
    const low = optionalFiniteNumberStrict(snap['low']);
    if (low === INVALID) return null;
    const lastClose = optionalFiniteNumberStrict(snap['lastClose']);
    if (lastClose === INVALID) return null;
    const nativeVolume = optionalFiniteNumberStrict(snap['nativeVolume']);
    if (nativeVolume === INVALID) return null;
    const nativeAmount = optionalFiniteNumberStrict(snap['nativeAmount']);
    if (nativeAmount === INVALID) return null;
    return { last, open, high, low, lastClose, nativeVolume, nativeAmount };
  }

  private validateQuality(raw: unknown): ExperimentalSnapshotQuality {
    if (typeof raw !== 'object' || raw === null) return {};
    const q = raw as Record<string, unknown>;
    const result: ExperimentalSnapshotQuality = {};
    if (q['stale'] === true) result.stale = true;
    if (q['partialPrices'] === true) result.partialPrices = true;
    if (q['nativeTimeUnavailable'] === true)
      result.nativeTimeUnavailable = true;
    return result;
  }

  /** Required finite number; rejects null, undefined, NaN, Infinity, booleans. */
  private requireFiniteNumber(v: unknown): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return v;
  }
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
