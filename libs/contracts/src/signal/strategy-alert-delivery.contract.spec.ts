import {
  alertDeliveryChannelJobId,
  alertDeliveryFanoutJobId,
  decodeAlertDeliveryChannelJobV2,
  decodeAlertDeliveryFanoutJobV2,
} from './strategy-alert-delivery.contract';

const GROUP = Object.freeze({
  securityId: 9,
  effectiveTime: '2026-11-24T02:00:00.000Z',
});

describe('strategy-alert-delivery contract', () => {
  describe('decodeAlertDeliveryFanoutJobV2', () => {
    it('accepts a valid V2 fanout job (group + ids)', () => {
      const decoded = decodeAlertDeliveryFanoutJobV2({
        contractVersion: 2,
        group: { ...GROUP },
        alertEventIds: [5, 6, 7],
      });
      expect(decoded).toEqual({
        contractVersion: 2,
        group: { ...GROUP },
        alertEventIds: [5, 6, 7],
      });
    });

    it('accepts the optional tradingDay observability field', () => {
      const decoded = decodeAlertDeliveryFanoutJobV2({
        contractVersion: 2,
        group: { ...GROUP, tradingDay: '2026-11-24' },
        alertEventIds: [5],
      });
      expect(decoded.group.tradingDay).toBe('2026-11-24');
    });

    it('accepts a single-element ids array (single-signal group)', () => {
      const decoded = decodeAlertDeliveryFanoutJobV2({
        contractVersion: 2,
        group: { ...GROUP },
        alertEventIds: [42],
      });
      expect(decoded.alertEventIds).toEqual([42]);
    });

    it.each([
      [
        'extra key',
        {
          contractVersion: 2,
          group: { ...GROUP },
          alertEventIds: [5],
          extra: 1,
        },
      ],
      [
        'wrong version',
        { contractVersion: 1, group: { ...GROUP }, alertEventIds: [5] },
      ],
      ['missing group', { contractVersion: 2, alertEventIds: [5] }],
      [
        'empty ids',
        { contractVersion: 2, group: { ...GROUP }, alertEventIds: [] },
      ],
      [
        'non-integer id',
        { contractVersion: 2, group: { ...GROUP }, alertEventIds: [1.5] },
      ],
      [
        'zero id',
        { contractVersion: 2, group: { ...GROUP }, alertEventIds: [0] },
      ],
      [
        'duplicate ids',
        { contractVersion: 2, group: { ...GROUP }, alertEventIds: [5, 5] },
      ],
      [
        'non-array ids',
        { contractVersion: 2, group: { ...GROUP }, alertEventIds: 5 },
      ],
      [
        'bad effectiveTime format',
        {
          contractVersion: 2,
          group: { securityId: 9, effectiveTime: '2026-11-24 02:00' },
          alertEventIds: [5],
        },
      ],
      [
        'extra group key',
        {
          contractVersion: 2,
          group: { ...GROUP, zone: 'cst' },
          alertEventIds: [5],
        },
      ],
    ])('rejects %s', (_label, bad) => {
      expect(() => decodeAlertDeliveryFanoutJobV2(bad)).toThrow(TypeError);
    });
  });

  describe('decodeAlertDeliveryChannelJobV2', () => {
    it('accepts a valid V2 channel job', () => {
      const decoded = decodeAlertDeliveryChannelJobV2({
        contractVersion: 2,
        group: { ...GROUP },
        channel: 'wechat',
        alertEventIds: [5, 6],
      });
      expect(decoded.channel).toBe('wechat');
    });

    it('accepts feishu as a valid channel', () => {
      const decoded = decodeAlertDeliveryChannelJobV2({
        contractVersion: 2,
        group: { ...GROUP },
        channel: 'feishu',
        alertEventIds: [5],
      });
      expect(decoded.channel).toBe('feishu');
    });

    it('rejects an unknown channel', () => {
      expect(() =>
        decodeAlertDeliveryChannelJobV2({
          contractVersion: 2,
          group: { ...GROUP },
          channel: 'sms',
          alertEventIds: [5],
        }),
      ).toThrow(/channel must be qq or wechat or feishu/);
    });

    it('rejects missing channel key', () => {
      expect(() =>
        decodeAlertDeliveryChannelJobV2({
          contractVersion: 2,
          group: { ...GROUP },
          alertEventIds: [5],
        }),
      ).toThrow(TypeError);
    });
  });

  describe('jobId builders', () => {
    it('fanout jobId is deterministic per group', () => {
      const a = alertDeliveryFanoutJobId({
        contractVersion: 2,
        group: { ...GROUP },
        alertEventIds: [5, 6],
      });
      const b = alertDeliveryFanoutJobId({
        contractVersion: 2,
        group: { ...GROUP },
        alertEventIds: [5],
      });
      expect(a).toBe(b);
      expect(a).toBe('deliver-fanout-v2-9-1795485600000');
    });

    it('channel jobId differs per channel and shares the group stem', () => {
      const qq = alertDeliveryChannelJobId({
        contractVersion: 2,
        group: { ...GROUP },
        channel: 'qq',
        alertEventIds: [5],
      });
      const wechat = alertDeliveryChannelJobId({
        contractVersion: 2,
        group: { ...GROUP },
        channel: 'wechat',
        alertEventIds: [5],
      });
      expect(qq).not.toBe(wechat);
      expect(qq).toBe('deliver-channel-v2-9-1795485600000-qq');
      expect(wechat).toBe('deliver-channel-v2-9-1795485600000-wechat');
    });
  });
});
