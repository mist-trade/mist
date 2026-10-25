# 实施计划：Canonical 行情序列（A）

> 对应 change：`openspec/changes/introduce-canonical-market-series`
> 目标：下游只认 `(security, period)`；拼接由私有策略配置驱动，读时组装、不落库。

## 0. 不变量

1. `k` 表只存原始 provider 行；**不写任何 canonical/拼接行**；
2. 公共仓不出现任何日期边界、源优先级、标的名单；
3. `k.source` 保留；读接口不再接受 `source`；
4. 新回测 run 记 `source='canonical'` + `data_policy_version`；信号行记该根 bar 的真实来源；
5. 旧 run 原样可读、可按原 provider 回放，不改写；
6. 私有策略缺失/非法 → 显式失败，绝不返回空数组。

## 1. 公共 canonical 核心（`libs/market-data`）

### 1.1 新增 `src/canonical/splice-policy.types.ts`

```ts
export interface SpliceSegment {
  readonly source: DataSource;
  readonly from?: string;   // YYYY-MM-DD，含
  readonly before?: string; // YYYY-MM-DD，不含
}
export interface SplicePolicyOverride {
  readonly security: string;
  readonly periods: Readonly<Record<string, readonly SpliceSegment[]>>;
}
export interface SplicePolicy {
  readonly version: string;
  readonly defaults: Readonly<Record<string, readonly SpliceSegment[]>>;
  readonly overrides?: readonly SplicePolicyOverride[];
}
export interface SplicePolicyProvider {
  readonly id: string;
  load(): SplicePolicy | null;
}
export interface ResolvedSegment {
  readonly source: DataSource;
  readonly from: Date | null;
  readonly before: Date | null;
}
export type CanonicalErrorCode =
  | 'CANONICAL_POLICY_UNAVAILABLE'
  | 'CANONICAL_POLICY_INVALID'
  | 'CANONICAL_SEGMENT_UNRESOLVED';
export class CanonicalDataError extends Error {
  constructor(readonly code: CanonicalErrorCode, message: string) { ... }
}
```

### 1.2 新增 `src/canonical/splice-policy.ts`

```ts
export function parseSplicePolicy(raw: unknown): SplicePolicy; // 结构校验，非法抛 CANONICAL_POLICY_INVALID
export function assertSplicePolicy(policy: SplicePolicy): void;
export function resolveSegments(
  policy: SplicePolicy,
  securityCode: string,
  period: number,
): readonly ResolvedSegment[]; // override → defaults → 抛 CANONICAL_SEGMENT_UNRESOLVED
```

校验规则：每段按时间有序；**允许重叠，前段优先**；只有首段可省 `from`、只有末段可省 `before`；`source` 必须是 `DataSource` 已知值；`version` 非空；period key 必须是数字字符串。

新增 `clipSegments(segments)`：按顺序用"前序段覆盖区间并集"裁剪后段，输出互不相交的有效区间（可能一段裁成多段）。

日期解析固定北京时间：`new Date(`${date}T00:00:00+08:00`)`。

### 1.3 新增 `src/canonical/canonical-series.ts`

```ts
export interface CanonicalSegmentRead {
  readonly securityId: number;
  readonly source: DataSource;
  readonly period: number;
  readonly from: Date | null;   // 含
  readonly before: Date | null; // 不含
  readonly afterTimestamp: Date | null; // 不含
  readonly order: 'asc' | 'desc';
  readonly limit: number;
}
export interface CanonicalSegmentReader {
  read(params: CanonicalSegmentRead): Promise<readonly StrategyBar[]>;
}

export async function loadCanonicalWindow(
  reader: CanonicalSegmentReader,
  segments: readonly ResolvedSegment[],
  params: { securityId: number; period: number; endAt: Date; requiredBars: number },
): Promise<readonly StrategyBar[]>;

export async function readCanonicalRange(
  reader: CanonicalSegmentReader,
  segments: readonly ResolvedSegment[],
  params: { securityId: number; period: number; startAt: Date; endAt: Date },
): Promise<readonly StrategyBar[]>;

export async function readCanonicalPage(
  reader: CanonicalSegmentReader,
  segments: readonly ResolvedSegment[],
  params: {
    securityId: number; period: number;
    startAt: Date; endAt: Date;
    afterTimestamp?: Date; limit: number;
  },
): Promise<{ bars: readonly StrategyBar[]; nextAfterTimestamp: Date | null }>;
```

语义：
- window：从末段向前走，`before=min(seg.before,endAt)`，取满 `requiredBars` 后反转升序；
- range/page：从首段向后走，段区间取 `[max(startAt,seg.from), min(seg.before,endAt+1ms))`，段间不重叠，时间戳游标单调；
- 缺口不补造，空段跳过。

### 1.4 导出

`libs/market-data/src/index.ts` 增加上述类型与函数。

### 1.5 单测 `src/canonical/*.spec.ts`

- 解析/校验：默认、override、乱序、重叠、首末缺省、未知 source、缺 period；
- 组合：跨 1/2/3 段、窗口反向跨段、页尾正好落段边界、缺口、空段、`limit` 截断；
- 裁剪：两段重叠（前段胜）、后段横跨前段被裁成两段、完全被覆盖变空段、多段链式覆盖。

## 2. 私有策略加载（`libs/strategy`）

新增 `src/market-data/canonical-policy.loader.ts`（`libs/strategy` 已有私仓加载职责）：

```ts
export class CanonicalPolicyLoader {
  static setCustomPaths(paths: string[]): void;
  static resetConfiguration(): void;
  static load(): SplicePolicy; // 无 provider / 无策略 → 抛 CANONICAL_POLICY_UNAVAILABLE
}
```

- 候选路径复用现有约定：`MIST_PRIVATE_PLUGINS_DIR` → 同级 `../mist-alpha-private`；
- 私有入口导出约定：`export const marketDataPolicy: SplicePolicyProvider`（或 `marketDataPolicies: SplicePolicyProvider[]`，取 id 匹配）；
- 与 `ExternalFactorPluginLoader` 共用"路径解析"小工具（把现有 `getCandidatePaths` 抽成 `private-module-paths.ts`，现有加载器改为调用它，行为不变）。

单测：临时目录写 provider → 能加载；目录不存在 → `CANONICAL_POLICY_UNAVAILABLE`；返回非法结构 → `CANONICAL_POLICY_INVALID`。

## 3. 数据库（迁移 031）

`deploy/database/migrations/031_add_canonical_backtest_source.sql`：

```sql
SET NAMES utf8mb4;

ALTER TABLE `backtest_runs`
  MODIFY COLUMN `source` enum('ef','tdx','qmt','vendor_a','canonical')
  NOT NULL DEFAULT 'ef';

ALTER TABLE `backtest_runs`
  ADD COLUMN `data_policy_version` varchar(64) NULL AFTER `source`;

-- 回读
SELECT COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='backtest_runs' AND COLUMN_NAME='source';
SELECT COUNT(*) FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='backtest_runs' AND COLUMN_NAME='data_policy_version';
```

实体：`BacktestRun` 增加 `dataPolicyVersion: string | null`；`backtest_signal_results.source` 不变（永远写物理来源）。

## 4. 回测

### 4.1 端口选择器（`libs/market-data/src/strategy-market-data.port.ts`）

把 replay 的 `source` 换成显式选择器：

```ts
export type ReplayDataSelection =
  | { readonly kind: 'canonical' }
  | { readonly kind: 'provider'; readonly source: StrategyHistorySource };

export interface StrategyReplayWindowCriteria {
  readonly securityId: number;
  readonly period: number;
  readonly selection: ReplayDataSelection;
  readonly endAt: Date;
  readonly requiredBars: number;
}
export interface StrategyReplayPageCriteria {
  readonly securityId: number;
  readonly period: number;
  readonly selection: ReplayDataSelection;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly afterTimestamp?: Date;
}
```

### 4.2 `apps/backtest/src/backtest-market-data.adapter.ts`

- 注入 `@InjectRepository(K)`（现有）+ `CanonicalPolicyLoader`（或注入已解析的 policy 单例）；
- `loadReplayWindow`：
  - `selection.kind === 'provider'` → 现有单源逻辑；
  - `'canonical'` → `resolveSegments` + `loadCanonicalWindow`；
- `readReplayPage`：同构，canonical 走 `readCanonicalPage`；
- 新增 `KRepositorySegmentReader implements CanonicalSegmentReader`（同一文件或独立文件），查询：
  ```ts
  repo.createQueryBuilder('k')
    .where('k.securityId = :securityId')
    .andWhere('k.source = :source')
    .andWhere('k.period = :period')
    // from 含 / before 不含 / afterTimestamp 不含，按 order 排序，take(limit)
  ```
  行 → `mapKToStrategyBar`。

### 4.3 `HistoricalBarSource`

`criteria.source` → `criteria.selection`，透传给 port；其余逻辑不变。

### 4.4 `BacktestRunExecutor`

- `replay(run)`：
  ```ts
  const selection: ReplayDataSelection =
    run.source === DataSource.CANONICAL
      ? { kind: 'canonical' }
      : { kind: 'provider', source: run.source as StrategyHistorySource };
  ```
- 信号落库：`mapKernelSignalToPersistencePayload(signal, { ..., source: bar.source })`（真实来源）。
- `BACKTEST_SOURCE_UNSUPPORTED` 判定保留：`canonical` 或合法 legacy provider。

### 4.5 创建入口

- `CreateBacktestRunDto`：删除 `source`（全局 `forbidNonWhitelisted` 已开启 → 携带即 400）；
- `CreateBacktestSuiteDto`：同样删除；
- `BacktestRunCommandService`（`create` 与 `createSuite` 两处 save）：
  ```ts
  source: DataSource.CANONICAL,
  dataPolicyVersion: CanonicalPolicyLoader.load().version,
  ```
- Suite 子 run 沿用 `masterRun.source`（= canonical）与同一 policy version。

## 5. 指标 / 可视化

- `IndicatorQueryDto`、`QueryVisualCommandsDto` 删除 `source`；
- `IndicatorService.findKData` 签名改为 `{ code, period, startDate, endDate }`，返回 `readonly StrategyBar[]`：
  - 查 `securities` 得 id；
  - `resolveSegments(policy, code, period)`；
  - `readCanonicalRange(reader, segments, ...)`；
- `VisualController`：`findKData` 不再传 source；`toChanKlines` 去掉 source 形参（bar 已自带真实来源）。

## 6. 本地 dev

`tools/strategy-dev/sync.ts`：
- `CanonicalPolicyLoader.load()` 取策略；
- 按 `(code, period)` 解析段，生成单条 SQL 谓词：
  ```sql
  WHERE s.code=:code AND k.period=:period AND (
    (k.source='vendor_a' AND k.timestamp < '2025-07-04 00:00:00')
    OR (k.source='qmt' AND k.timestamp >= '2025-07-04 00:00:00')
  )
  ORDER BY k.timestamp ASC
  ```
- 输出的 JSON 已是一条 canonical 序列；不再做 JSON 层二次拼接。

## 7. 前端

- `app/api/client.ts`：回测创建/指标/可视化相关类型删除 `source`；实时订阅相关保留；
- `BacktestConfigPanel.tsx`、`DualTimeframeChanPage.tsx`、`KLineLivePage.tsx`：移除数据源下拉；
- 保留 `DataSourceValue` 给实时订阅页。

## 8. 私有仓（`mist-alpha-private`）

```
src/market-data/policy.ts        // SplicePolicy 常量（5m/30m/1d 三段规则）
src/market-data/provider.ts      // marketDataPolicy: SplicePolicyProvider
src/index.ts                     // export { marketDataPolicy }
```

部署：现有 `/app/private-plugins` 挂载即可生效，无新增 env。

## 9. 测试清单

| 层 | 用例 |
|---|---|
| policy | 默认/覆盖/非法段/未知源/缺 period |
| composition | 跨 1~3 段窗口、页尾落边界、缺口、空段 |
| loader | 正常加载 / 目录缺失 / 结构非法 |
| adapter | canonical 读、legacy provider 读、参数校验 |
| executor | canonical run 写 `canonical` + policy version；信号 source=bar.source；legacy run 不改写 |
| DTO | 携带 `source` → 400 `VALIDATION_ERROR` |
| 静态 | 公共读 DTO 不含 `source`；`libs/`、`apps/` 不含拼接日期常量（除测试） |
| 回归 | 000001 30m 2005→2026 canonical 与手工 UNION 逐 bar 0 差异 |

## 10. 验证命令

```bash
pnpm -C mist typecheck
pnpm -C mist test libs/market-data libs/strategy apps/backtest apps/mist/src/indicator apps/mist/src/visual
pnpm -C mist test:ci
pnpm -C mist-fe typecheck && pnpm -C mist-fe test:ci
openspec validate introduce-canonical-market-series --strict
```

## 11. 执行顺序

1. 公共 canonical 核心 + 单测；
2. 私有加载器 + 单测；
3. 迁移 031 + 实体；
4. 回测（端口 → adapter → executor → 创建入口 → DTO）；
5. 指标 / 可视化；
6. 本地 dev；
7. 前端；
8. 私有仓 policy；
9. 生产：迁移 → 部署（挂载私有策略）→ 回归（canonical vs 手工 UNION）→ 端到端 2005→2026 回测。

## 12. 回滚

- 代码：回退镜像即可（DB 只加列与枚举值，旧代码兼容）；
- 数据：无需回滚（没有新增拼接行）；
- 旧 run 不受影响。
