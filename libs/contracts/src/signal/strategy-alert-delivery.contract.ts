/**
 * BullMQ contract for proactive strategy alert delivery (deliver-strategy-notifications).
 *
 * V2 (2026-11-24, batch-grouped): the producer (apps/signal) persists one AlertEvent
 * per committed KernelSignal, groups the batch by (securityId, effectiveTime) — the
 * group is complete at commit time because every same-effectiveTime signal originates
 * from the same candle_finalized trigger and the same processor transaction batch —
 * and enqueues ONE deliver.fanout job per group carrying the group's alertEventIds.
 * The worker (apps/notification) fans the group out to one channel job per configured
 * channel (same ids), each retried independently via BullMQ attempts/backoff, and the
 * channel handler renders ONE message for the whole group.
 *
 * No V1 compatibility: nothing is deployed; consumers decode V2 exactly (exact-keys).
 * Grouping is never persisted: the descriptor exists only inside the job payload and
 * is recomputed in memory on replay from the alert rows' signals (availabilityKey).
 *
 * Pure domain contract: intentionally does NOT import @app/shared-data (forbidden for
 * domain libs by the transport boundary guard). Channel values mirror the
 * NotificationChannel enum but are defined here as a local literal union.
 */
import { isRecord } from '@app/utils';

export type AlertDeliveryChannel = 'qq' | 'wechat' | 'feishu';

export const STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX = 'mist-bullmq';
export const STRATEGY_ALERT_DELIVERY_QUEUE_NAME = 'strategy-alert-delivery';
export const STRATEGY_ALERT_DELIVERY_FANOUT_JOB = 'deliver.fanout';
export const STRATEGY_ALERT_DELIVERY_CHANNEL_JOB = 'deliver.channel';
export const STRATEGY_ALERT_DELIVERY_WORKER_CONCURRENCY = 4;
/** Per-job hard deadline. Adapter calls are already bounded by NOTIFICATION_HTTP_TIMEOUT_MS;
 *  this caps the whole job (fan-out DB writes + channel send + reconcile). */
export const STRATEGY_ALERT_DELIVERY_JOB_TIMEOUT_MS = 30_000;

export const STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS = Object.freeze({
  attempts: 1,
  removeOnComplete: Object.freeze({ age: 86_400 }),
  removeOnFail: Object.freeze({ age: 604_800 }),
});

export const STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: Object.freeze({ type: 'exponential' as const, delay: 5_000 }),
  removeOnComplete: Object.freeze({ age: 86_400 }),
  removeOnFail: Object.freeze({ age: 604_800 }),
});

/** Observability descriptor of one (securityId, effectiveTime) aggregation group.
 *  Structurally separate from alertEventIds so a future V3 can extend the
 *  descriptor without touching the operative ids semantics. */
export interface AlertDeliveryGroupDescriptor {
  readonly securityId: number;
  /** RFC3339 instant of the group's availabilityKey (content-sealed moment). */
  readonly effectiveTime: string;
  /** Shanghai trading day (YYYY-MM-DD) the group belongs to; observability only. */
  readonly tradingDay?: string;
}

export interface AlertDeliveryFanoutJobV2 {
  readonly contractVersion: 2;
  readonly group: AlertDeliveryGroupDescriptor;
  readonly alertEventIds: readonly number[];
}

export interface AlertDeliveryChannelJobV2 {
  readonly contractVersion: 2;
  readonly group: AlertDeliveryGroupDescriptor;
  readonly channel: AlertDeliveryChannel;
  readonly alertEventIds: readonly number[];
}

const FANOUT_KEYS = Object.freeze([
  'contractVersion',
  'group',
  'alertEventIds',
]);
const CHANNEL_KEYS = Object.freeze([
  'contractVersion',
  'group',
  'channel',
  'alertEventIds',
]);
const GROUP_KEYS_REQUIRED = Object.freeze(['securityId', 'effectiveTime']);
const GROUP_KEYS_OPTIONAL = Object.freeze(['tradingDay']);
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const TRADING_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    actual.length === required.length &&
    actual.every((key, index) => key === required[index])
  );
}

function isPositiveSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function decodeGroup(
  input: unknown,
  jobName: string,
): AlertDeliveryGroupDescriptor {
  if (!isRecord(input)) {
    throw new TypeError(`${jobName} group must be an object`);
  }
  const keys = Object.keys(input).sort();
  const allowed = [...GROUP_KEYS_REQUIRED, ...GROUP_KEYS_OPTIONAL].sort();
  if (
    keys.length < GROUP_KEYS_REQUIRED.length ||
    !GROUP_KEYS_REQUIRED.every((key) => keys.includes(key)) ||
    keys.some((key) => !allowed.includes(key))
  ) {
    throw new TypeError(
      `${jobName} group must contain exactly securityId + effectiveTime (+ optional tradingDay)`,
    );
  }
  if (!isPositiveSafeInt(input.securityId)) {
    throw new TypeError(
      `${jobName} group.securityId must be a positive safe integer`,
    );
  }
  if (
    typeof input.effectiveTime !== 'string' ||
    !RFC3339_PATTERN.test(input.effectiveTime) ||
    !Number.isFinite(Date.parse(input.effectiveTime))
  ) {
    throw new TypeError(`${jobName} group.effectiveTime must be RFC3339`);
  }
  if (
    input.tradingDay !== undefined &&
    (typeof input.tradingDay !== 'string' ||
      !TRADING_DAY_PATTERN.test(input.tradingDay))
  ) {
    throw new TypeError(
      `${jobName} group.tradingDay must be YYYY-MM-DD when present`,
    );
  }
  const group: AlertDeliveryGroupDescriptor = Object.freeze({
    securityId: input.securityId,
    effectiveTime: input.effectiveTime,
    ...(input.tradingDay !== undefined ? { tradingDay: input.tradingDay } : {}),
  });
  return group;
}

function decodeAlertEventIds(
  input: unknown,
  jobName: string,
): readonly number[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.some((id) => !isPositiveSafeInt(id))
  ) {
    throw new TypeError(
      `${jobName} alertEventIds must be a non-empty array of positive safe integers`,
    );
  }
  const ids = [...input];
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(`${jobName} alertEventIds must not contain duplicates`);
  }
  return Object.freeze(ids);
}

export function decodeAlertDeliveryFanoutJobV2(
  input: unknown,
): AlertDeliveryFanoutJobV2 {
  if (!isRecord(input) || !hasExactKeys(input, FANOUT_KEYS)) {
    throw new TypeError(
      'deliver.fanout data must contain exactly the V2 fields',
    );
  }
  if (input.contractVersion !== 2) {
    throw new TypeError('deliver.fanout contractVersion must be 2');
  }
  return Object.freeze({
    contractVersion: 2,
    group: decodeGroup(input.group, 'deliver.fanout'),
    alertEventIds: decodeAlertEventIds(input.alertEventIds, 'deliver.fanout'),
  });
}

export function decodeAlertDeliveryChannelJobV2(
  input: unknown,
): AlertDeliveryChannelJobV2 {
  if (!isRecord(input) || !hasExactKeys(input, CHANNEL_KEYS)) {
    throw new TypeError(
      'deliver.channel data must contain exactly the V2 fields',
    );
  }
  if (input.contractVersion !== 2) {
    throw new TypeError('deliver.channel contractVersion must be 2');
  }
  if (
    input.channel !== 'qq' &&
    input.channel !== 'wechat' &&
    input.channel !== 'feishu'
  ) {
    throw new TypeError(
      'deliver.channel channel must be qq or wechat or feishu',
    );
  }
  return Object.freeze({
    contractVersion: 2,
    group: decodeGroup(input.group, 'deliver.channel'),
    channel: input.channel,
    alertEventIds: decodeAlertEventIds(input.alertEventIds, 'deliver.channel'),
  });
}

export function alertDeliveryFanoutJobId(
  job: AlertDeliveryFanoutJobV2,
): string {
  const accepted = decodeAlertDeliveryFanoutJobV2(job);
  return `deliver-fanout-v2-${accepted.group.securityId}-${Date.parse(
    accepted.group.effectiveTime,
  )}`;
}

export function alertDeliveryChannelJobId(
  job: AlertDeliveryChannelJobV2,
): string {
  const accepted = decodeAlertDeliveryChannelJobV2(job);
  return `deliver-channel-v2-${accepted.group.securityId}-${Date.parse(
    accepted.group.effectiveTime,
  )}-${accepted.channel}`;
}
