import { buildSyncYearChunks, type SyncChunkSegment } from './sync';

describe('tools/strategy-dev/sync.ts — [DEV-P1-03] 分段年份分片边界', () => {
  const bj = (isoLocal: string) => new Date(`${isoLocal}+08:00`);

  it('当 segment.before 落在年中时包含边界末年分片（如 2026-06-01 包含 2026 年）', () => {
    const segments: SyncChunkSegment[] = [
      {
        source: 'tdx',
        from: bj('2024-01-01T00:00:00'),
        before: bj('2026-06-01T00:00:00'),
      },
    ];

    const chunks = buildSyncYearChunks(segments, bj('2026-11-27T15:00:00'));
    expect(chunks).toEqual([
      {
        source: 'tdx',
        from: bj('2024-01-01T00:00:00'),
        before: bj('2025-01-01T00:00:00'),
      },
      {
        source: 'tdx',
        from: bj('2025-01-01T00:00:00'),
        before: bj('2026-01-01T00:00:00'),
      },
      {
        source: 'tdx',
        from: bj('2026-01-01T00:00:00'),
        before: bj('2026-06-01T00:00:00'),
      },
    ]);
  });

  it('当 segment.before 恰为年初零点时自动跳过空分片而不溢出到下一年度', () => {
    const segments: SyncChunkSegment[] = [
      {
        source: 'tdx',
        from: bj('2024-01-01T00:00:00'),
        before: bj('2026-01-01T00:00:00'),
      },
    ];

    const chunks = buildSyncYearChunks(segments, bj('2026-11-27T15:00:00'));
    expect(chunks).toEqual([
      {
        source: 'tdx',
        from: bj('2024-01-01T00:00:00'),
        before: bj('2025-01-01T00:00:00'),
      },
      {
        source: 'tdx',
        from: bj('2025-01-01T00:00:00'),
        before: bj('2026-01-01T00:00:00'),
      },
    ]);
  });

  it('同一年内的前后截断区间 [2026-03-01, 2026-06-01) 不会丢失', () => {
    const segments: SyncChunkSegment[] = [
      {
        source: 'qmt',
        from: bj('2026-03-01T00:00:00'),
        before: bj('2026-06-01T00:00:00'),
      },
    ];

    const chunks = buildSyncYearChunks(segments, bj('2026-11-27T15:00:00'));
    expect(chunks).toEqual([
      {
        source: 'qmt',
        from: bj('2026-03-01T00:00:00'),
        before: bj('2026-06-01T00:00:00'),
      },
    ]);
  });

  it('多段拼接（前段无 from、后段无 before）按年无缝衔接至当前北京年份且无重叠缺口', () => {
    const segments: SyncChunkSegment[] = [
      {
        source: 'tdx',
        from: null,
        before: bj('2026-06-01T00:00:00'),
      },
      {
        source: 'qmt',
        from: bj('2026-06-01T00:00:00'),
        before: null,
      },
    ];

    const chunks = buildSyncYearChunks(segments, bj('2026-11-27T15:00:00'));
    expect(chunks[0]).toEqual({
      source: 'tdx',
      from: bj('1996-01-01T00:00:00'),
      before: bj('1997-01-01T00:00:00'),
    });

    const tdxTail = chunks.filter((c) => c.source === 'tdx').at(-1);
    const qmtHead = chunks.find((c) => c.source === 'qmt');
    const qmtTail = chunks.filter((c) => c.source === 'qmt').at(-1);

    expect(tdxTail).toEqual({
      source: 'tdx',
      from: bj('2026-01-01T00:00:00'),
      before: bj('2026-06-01T00:00:00'),
    });
    expect(qmtHead).toEqual({
      source: 'qmt',
      from: bj('2026-06-01T00:00:00'),
      before: bj('2027-01-01T00:00:00'),
    });
    expect(qmtTail).toEqual(qmtHead);
  });

  it('完全早于 CHUNK_START_YEAR(1996) 的分段返回空切片列表', () => {
    const segments: SyncChunkSegment[] = [
      {
        source: 'tdx',
        from: bj('1990-01-01T00:00:00'),
        before: bj('1996-01-01T00:00:00'),
      },
    ];
    expect(buildSyncYearChunks(segments, bj('2026-11-27T15:00:00'))).toEqual(
      [],
    );
  });
});
