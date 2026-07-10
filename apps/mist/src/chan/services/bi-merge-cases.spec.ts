import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BiService } from './bi.service';
import { ChannelService } from './channel.service';
import { KMergeService } from './k-merge.service';
import { TrendService } from './trend.service';
import { BiStatus } from '../enums/bi.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { UtilsService } from '@app/utils';
import type { MergedKVo } from '../vo/merged-k.vo';

/**
 * BiService 阶段B（n笔合并后处理）测试套件
 *
 * 使用上证指数真实TDX数据（前复权日K，2024-2025），验证 invalid 笔的消化逻辑。
 * 数据来源：mist-fe/__fixtures__/snapshots/chan/shanghai-index-2024-2025 的合并K快照。
 *
 * 两个核心场景：
 * - 场景1：2024-10-08 国庆后跳空，invalid down 笔是下跌段起点（head）
 * - 场景2：2025-05~08 震荡，invalid 笔被夹在两个 valid 同向笔中间（middle）
 */

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(__dirname, '__fixtures__');

function loadFixture(filename: string): MergedKVo[] {
  const raw = JSON.parse(
    readFileSync(join(FIXTURES_DIR, filename), 'utf-8'),
  ) as Record<string, unknown>[];
  return raw.map((m) => ({
    startTime: new Date(m.startTime as string),
    endTime: new Date(m.endTime as string),
    highest: Number(m.highest),
    lowest: Number(m.lowest),
    trend: m.trend as TrendDirection,
    mergedCount: Number(m.mergedCount),
    mergedIds: (m.mergedIds as number[]).map((x) => Number(x)),
    mergedData: (m.mergedData as Record<string, unknown>[]).map((k) => ({
      id: Number(k.id),
      symbol: String(k.symbol),
      time: new Date(k.time as string),
      amount: Number(k.amount),
      open: Number(k.open),
      close: Number(k.close),
      highest: Number(k.highest),
      lowest: Number(k.lowest),
    })),
  })) as MergedKVo[];
}

// ---------------------------------------------------------------------------
// 断言工具
// ---------------------------------------------------------------------------

/** 断言 valid 笔严格交替（无连续同方向） */
function expectValidAlternating(
  bis: { trend: TrendDirection; status: BiStatus }[],
) {
  const validBis = bis.filter((b) => b.status === BiStatus.Valid);
  for (let i = 1; i < validBis.length; i++) {
    expect(validBis[i].trend).not.toBe(validBis[i - 1].trend);
  }
}

/** 断言 valid 笔无时间重叠（bi[i].startTime >= bi[i-1].endTime） */
function expectNoOverlap(
  bis: {
    startTime: Date;
    endTime: Date;
    status: BiStatus;
  }[],
) {
  const validBis = bis.filter((b) => b.status === BiStatus.Valid);
  for (let i = 1; i < validBis.length; i++) {
    expect(new Date(validBis[i].startTime).getTime()).toBeGreaterThanOrEqual(
      new Date(validBis[i - 1].endTime).getTime(),
    );
  }
}

/** 调试输出：打印笔序列 */
function debugBis(
  label: string,
  bis: {
    startTime: Date;
    endTime: Date;
    trend: TrendDirection;
    status: BiStatus;
    highest: number;
    lowest: number;
  }[],
) {
  // eslint-disable-next-line no-console
  console.log(
    `\n=== ${label} (${bis.length}笔, valid=${bis.filter((b) => b.status === BiStatus.Valid).length}) ===`,
  );
  bis.forEach((b, i) => {
    const s = new Date(b.startTime).toISOString().slice(0, 10);
    const e = new Date(b.endTime).toISOString().slice(0, 10);
    // eslint-disable-next-line no-console
    console.log(
      `  #${i} ${s}→${e} ${b.trend} st=${b.status} H=${b.highest} L=${b.lowest}`,
    );
  });
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('BiService phaseB — real data invalid bi merge', () => {
  let service: BiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiService,
        ChannelService,
        KMergeService,
        TrendService,
        UtilsService,
      ],
    }).compile();
    service = module.get<BiService>(BiService);
  });

  // ==========================================================================
  // 场景1：2024-10-08 国庆后跳空 — invalid 笔是下跌段起点（head）
  //
  // 真实数据特征：
  //   09-24 起持续上涨 → 10-07 见顶(3674.40) → 10-08 跳空低开
  //   10-07 的极端K线导致顶分型 lowest 被拉低(取min(prev,next))，
  //   使 10-07顶→10-15底 这笔被判 invalid（分型包含误判）。
  //
  // phaseA 输出在该区间：
  //   ...up(valid) 09-17→10-07
  //   down(INVALID) 10-07→10-15  ← C1，该被消化
  //   up(valid) 10-15→11-07
  //   down(valid) 11-07→11-26
  //   ...
  //   down(valid) 12-26→01-12    ← 底3140.98
  //
  // 期望 phaseB：10-07(顶3674) → 01-12(底3140) 形成超长下跌笔，
  //             吸收中间所有笔。valid 笔严格交替。
  // ==========================================================================

  describe('case1: 2024-10-08 extreme gap — invalid as segment start', () => {
    const data = loadFixture('case1-oct2024-extreme.json');

    it('phaseB valid bis are strictly alternating', () => {
      const result = service.getBi(data);
      debugBis('phaseA', result.phaseA);
      debugBis('phaseB', result.phaseB);
      expectValidAlternating(result.phaseB);
    });

    it('phaseB valid bis have no time overlap', () => {
      const result = service.getBi(data);
      expectNoOverlap(result.phaseB);
    });

    it('phaseB contains long down bi from Oct 2024 peak', () => {
      const result = service.getBi(data);
      const { phaseB } = result;

      // 找起始于 2024-10 月的 down 笔
      const longDown = phaseB.find(
        (b) =>
          b.trend === TrendDirection.Down &&
          new Date(b.startTime) >= new Date('2024-10-01') &&
          new Date(b.startTime) <= new Date('2024-10-15'),
      );

      // 这笔的 highest 应接近 3674（10-07 顶点）
      expect(longDown).toBeDefined();
      expect(longDown!.highest).toBeGreaterThan(3600);

      // 这笔应该跨越较长时间（到 2025-01 附近，>60天）
      const duration =
        new Date(longDown!.endTime).getTime() -
        new Date(longDown!.startTime).getTime();
      expect(duration).toBeGreaterThan(60 * 86400 * 1000);
    });
  });

  // ==========================================================================
  // 场景2：2025-05~08 震荡 — invalid 笔被夹在两个 valid 同向笔中间（middle）
  //
  // 真实数据特征：
  //   05-26 起上涨 → 07-22 见顶(3613) → 小幅震荡 → 08-13 见更高顶(3704)
  //
  // phaseA 输出在该区间：
  //   up(valid) 05-26→07-22     ← 底3332→顶3613
  //   down(INVALID) 07-22→07-23 ← 宽笔不够
  //   up(INVALID) 07-23→07-29
  //   down(INVALID) 07-29→08-03
  //   up(valid) 08-03→08-13     ← 底3547→顶3704（两端都超过前笔，递进）
  //
  // 期望 phaseB：05-26(up valid) 和 08-13(up valid) 之间的 invalid 笔被吸收。
  //             canMergeTwoBis 成立（#25顶3613 < #29顶3704，#25底3332 < #29底3547）。
  //             合并后 valid 笔严格交替，无两个连续 up。
  // ==========================================================================

  describe('case2: 2025-05~08 oscillation — invalid as middle', () => {
    const data = loadFixture('case2-may2025-oscillation.json');

    it('phaseB valid bis are strictly alternating', () => {
      const result = service.getBi(data);
      debugBis('phaseA', result.phaseA);
      debugBis('phaseB', result.phaseB);
      expectValidAlternating(result.phaseB);
    });

    it('phaseB valid bis have no time overlap', () => {
      const result = service.getBi(data);
      expectNoOverlap(result.phaseB);
    });

    it('phaseB has no consecutive same-direction valid bis in May-Aug', () => {
      const result = service.getBi(data);
      const { phaseB } = result;

      // 找 2025-05~08 区间的 valid 笔
      const inRange = phaseB.filter((b) => {
        const s = new Date(b.startTime);
        return s >= new Date('2025-05-01') && s <= new Date('2025-09-01');
      });
      const validInRange = inRange.filter((b) => b.status === BiStatus.Valid);

      for (let i = 1; i < validInRange.length; i++) {
        if (validInRange[i].trend === validInRange[i - 1].trend) {
          throw new Error(
            `连续同向 valid 笔: ${new Date(validInRange[i - 1].startTime).toISOString().slice(0, 10)}` +
              `(${validInRange[i - 1].trend}) → ${new Date(validInRange[i].startTime).toISOString().slice(0, 10)}` +
              `(${validInRange[i].trend})，中间 invalid 未被消化`,
          );
        }
      }
    });
  });
});
