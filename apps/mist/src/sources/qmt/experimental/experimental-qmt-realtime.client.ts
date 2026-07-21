import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { ExperimentalQmtAllowlistResolver } from './experimental-qmt-allowlist.resolver';
import {
  ExperimentalQmtNativeSnapshot,
  ExperimentalQmtSnapshotFrame,
  QMT_EXPERIMENTAL_CONTRACT,
} from './experimental-qmt-realtime.types';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';

const MAX_FRAME_CLOCK_SKEW_MS = 60_000;
const FRAME_KEYS = [
  'payloadType',
  'schemaVersion',
  'draftRevision',
  'acquisitionProfile',
  'streamEpoch',
  'sequence',
  'symbol',
  'capturedAt',
  'native',
] as const;
const NATIVE_REQUIRED_KEYS = [
  'timetag',
  'lastPrice',
  'open',
  'high',
  'low',
  'lastClose',
  'volume',
  'amount',
] as const;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const QMT_TIMETAG_PATTERN = /^(?:\d{14}|\d{8} \d{2}:\d{2}:\d{2})$/;

export const EXPERIMENTAL_QMT_CLOCK = Symbol('EXPERIMENTAL_QMT_CLOCK');
export type ExperimentalQmtClock = () => number;

@Injectable()
export class ExperimentalQmtRealtimeClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExperimentalQmtRealtimeClient.name);
  private readonly wsUrl: string;
  private readonly reconnectDelayMs: number;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;
  private ready = false;
  private lastOwnerGeneration = 0;

  constructor(
    config: ConfigService,
    private readonly store: InMemoryQmtRealtimeStore,
    private readonly allowlist: ExperimentalQmtAllowlistResolver,
    @Optional()
    @Inject(EXPERIMENTAL_QMT_CLOCK)
    private readonly clock: ExperimentalQmtClock = Date.now,
  ) {
    const baseUrl =
      config.get<string>('QMT_BASE_URL') ?? 'http://127.0.0.1:9002';
    const clientId =
      config.get<string>('QMT_WS_CLIENT_ID') ?? 'mist-backend-qmt-experimental';
    this.wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws/qmt-experimental/${clientId}`;
    this.reconnectDelayMs = config.get<number>(
      'QMT_WS_RECONNECT_DELAY_MS',
      5000,
    );
  }

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ws?.close();
  }

  private connect(): void {
    if (this.shuttingDown) return;
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on('open', () => {
      this.ready = false;
      this.heartbeatTimer = setInterval(
        () => this.send({ type: 'ping' }),
        30_000,
      );
    });
    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(data.toString());
    });
    this.ws.on('error', (error) => {
      this.store.setError('QMT_EXPERIMENTAL_WS_ERROR', error.message);
    });
    this.ws.on('close', () => {
      this.ready = false;
      this.store.markDisconnected();
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (!this.shuttingDown) {
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          this.reconnectDelayMs,
        );
      }
    });
  }

  private handleMessage(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      this.store.recordDrop(
        'decodeError',
        null,
        'QMT_EXPERIMENTAL_WS_DECODE_ERROR',
      );
      return;
    }
    if (!isRecord(message) || !isRecord(message['data'])) {
      this.store.recordDrop(
        'validationError',
        null,
        'QMT_EXPERIMENTAL_WS_MESSAGE_INVALID',
      );
      return;
    }
    const data = message['data'];
    if (message['type'] === 'ready') this.handleReady(data);
    else if (message['type'] === 'stream_started')
      this.handleStreamStarted(data);
    else if (message['type'] === 'qmt.experimental.snapshot')
      this.handleSnapshot(data);
  }

  private handleReady(data: Record<string, unknown>): void {
    if (!matchesContract(data)) {
      this.rejectContract('ready');
      return;
    }
    const epoch = data['streamEpoch'];
    const sequence = data['sequence'];
    const ownerGeneration = data['ownerGeneration'];
    const ownerId = data['ownerId'];
    if (
      data['mode'] !== 'builtin_experimental' ||
      typeof epoch !== 'string' ||
      epoch.length === 0 ||
      !isSequence(sequence, true) ||
      !isSequence(ownerGeneration, true) ||
      !isOwnerIdentity(ownerId, ownerGeneration)
    ) {
      this.store.recordDrop(
        'validationError',
        null,
        'QMT_EXPERIMENTAL_READY_INVALID',
      );
      return;
    }
    this.ready = true;
    this.lastOwnerGeneration = ownerGeneration;
    this.store.beginEpoch(epoch, sequence);
    this.store.setOwner(ownerId, ownerGeneration);
    this.store.markConnected();
    this.store.clearError();
    this.sendDesired();
  }

  private handleStreamStarted(data: Record<string, unknown>): void {
    const epoch = data['streamEpoch'];
    const generation = data['ownerGeneration'];
    const ownerId = data['ownerId'];
    if (
      !this.ready ||
      !matchesContract(data) ||
      data['mode'] !== 'builtin_experimental' ||
      typeof epoch !== 'string' ||
      epoch.length === 0 ||
      !isSequence(generation, false) ||
      generation <= this.lastOwnerGeneration ||
      typeof ownerId !== 'string' ||
      ownerId.length === 0 ||
      data['sequence'] !== 0
    ) {
      this.store.recordDrop(
        'validationError',
        null,
        'QMT_EXPERIMENTAL_STREAM_STARTED_INVALID',
      );
      return;
    }
    this.lastOwnerGeneration = generation;
    this.store.beginEpoch(epoch, 0);
    this.store.setOwner(ownerId, generation);
    this.sendDesired();
  }

  private handleSnapshot(data: Record<string, unknown>): void {
    const symbol = typeof data['symbol'] === 'string' ? data['symbol'] : null;
    if (!this.ready) {
      this.store.recordDrop(
        'validationError',
        symbol,
        'QMT_EXPERIMENTAL_READY_REQUIRED',
      );
      return;
    }
    if (!matchesContract(data)) {
      this.rejectContract('snapshot', symbol);
      return;
    }
    const frame = this.validateFrame(data);
    if (!frame) return;
    if (!this.allowlist.isAuthorized(frame.symbol)) {
      this.store.recordDrop(
        'symbolNotAuthorized',
        frame.symbol,
        'QMT_EXPERIMENTAL_SYMBOL_NOT_AUTHORIZED',
      );
      return;
    }
    this.store.apply(frame);
  }

  private validateFrame(
    data: Record<string, unknown>,
  ): ExperimentalQmtSnapshotFrame | null {
    const symbol = typeof data['symbol'] === 'string' ? data['symbol'] : null;
    if (!hasExactKeys(data, FRAME_KEYS)) return this.invalidFrame(symbol);
    const epoch = data['streamEpoch'];
    const sequence = data['sequence'];
    const capturedAt = data['capturedAt'];
    const native = data['native'];
    if (
      typeof epoch !== 'string' ||
      epoch.length === 0 ||
      !isSequence(sequence, false) ||
      symbol === null ||
      !isRfc3339(capturedAt) ||
      !isValidNative(native)
    ) {
      return this.invalidFrame(symbol);
    }
    if (
      Math.abs(this.clock() - Date.parse(capturedAt)) > MAX_FRAME_CLOCK_SKEW_MS
    ) {
      this.store.recordDrop('stale', symbol, 'QMT_EXPERIMENTAL_FRAME_STALE');
      return null;
    }
    if (epoch !== this.store.currentEpoch) {
      this.store.recordDrop(
        'epochMismatch',
        symbol,
        'QMT_EXPERIMENTAL_EPOCH_MISMATCH',
      );
      return null;
    }
    return data as unknown as ExperimentalQmtSnapshotFrame;
  }

  private invalidFrame(symbol: string | null): null {
    this.store.recordDrop(
      'validationError',
      symbol,
      'QMT_EXPERIMENTAL_FRAME_VALIDATION_ERROR',
    );
    return null;
  }

  private rejectContract(context: string, symbol: string | null = null): void {
    this.store.recordDrop(
      'contractMismatch',
      symbol,
      'QMT_EXPERIMENTAL_CONTRACT_MISMATCH',
    );
    this.store.setError(
      'QMT_EXPERIMENTAL_CONTRACT_MISMATCH',
      `${context} contract tuple is unsupported`,
    );
  }

  private sendDesired(): void {
    this.send({
      type: 'sync_subscriptions',
      symbols: this.allowlist.entriesList.map((entry) => entry.formatCode),
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (error) {
      this.logger.error(error);
      this.store.setError(
        'QMT_EXPERIMENTAL_WS_SEND_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

function matchesContract(value: Record<string, unknown>): boolean {
  return (
    value['payloadType'] === QMT_EXPERIMENTAL_CONTRACT.payloadType &&
    value['schemaVersion'] === QMT_EXPERIMENTAL_CONTRACT.schemaVersion &&
    value['draftRevision'] === QMT_EXPERIMENTAL_CONTRACT.draftRevision &&
    value['acquisitionProfile'] === QMT_EXPERIMENTAL_CONTRACT.acquisitionProfile
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isSequence(value: unknown, allowZero: boolean): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= (allowZero ? 0 : 1)
  );
}

function isOwnerIdentity(
  ownerId: unknown,
  ownerGeneration: number,
): ownerId is string | null {
  return ownerGeneration === 0
    ? ownerId === null
    : typeof ownerId === 'string' && ownerId.length > 0;
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    RFC3339_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isValidNative(value: unknown): value is ExperimentalQmtNativeSnapshot {
  if (!isRecord(value)) return false;
  if (!NATIVE_REQUIRED_KEYS.every((key) => key in value)) return false;
  if (!QMT_TIMETAG_PATTERN.test(String(value['timetag']))) return false;
  for (const key of NATIVE_REQUIRED_KEYS.slice(1)) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]))
      return false;
  }
  return (
    (value['lastPrice'] as number) > 0 &&
    (value['volume'] as number) >= 0 &&
    (value['amount'] as number) >= 0
  );
}
