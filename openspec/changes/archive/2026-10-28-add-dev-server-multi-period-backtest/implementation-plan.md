# 实施计划：add-dev-server-multi-period-backtest（代码级）

> 对应 spec：本目录 proposal/design/tasks。方案 A（求值周期=30m 驱动执行，
> context 5m/1440 只进窗口；持仓 T+1/日结/解锁按日线节奏；出场在 30m 节拍判定）。

## Phase 1：`deriveContextRequirements` 复用（libs/strategy）

**文件**：`libs/strategy/src/decision-flow/stored-definition-compiler.ts`

- 私有函数 `deriveContextRequirements(flow)`（依赖模块级单例
  `factorPluginRegistry`）改为导出纯函数：

```ts
export function deriveContextRequirements(
  flow: DecisionFlowNode,
  registry: FactorPluginRegistry,
): Readonly<Record<number, number>>
```

- 模块内 3 个调用点（:88/:106/:127）改为传 `ensureStandardPluginsRegistered()` 后
  的 `factorPluginRegistry`（行为零变化）；错误类型保持 `StoredDefinitionCompileError`
  （`DECISION_FLOW_RULE_INVALID`），HTTP 边界再映射 422。
- `libs/strategy/src/index.ts` barrel 导出。
- **测试**（新增 `stored-definition-compiler.context-requirements.spec.ts`）：
  1. flow 引用未注册插件 → 抛 `StoredDefinitionCompileError`，message 含 pluginId；
  2. 声明非法（`{30: 0}` / `{30: 1.5}`）→ 抛错；
  3. 两插件分别声明 `{1440: 10}` `{5: 40}` → 合并 `{1440: 10, 5: 40}`；
  4. 同周期声明 `{30: 100}` `{30: 200}` → 取 max 200；
  5. 全部插件无声明 → `{}`（等价现状）。

## Phase 2：内存 replay port（tools/strategy-dev，新文件）

**新文件**：`tools/strategy-dev/in-memory-replay-port.ts`

```ts
export class DevContextDataMissingError extends Error { readonly missingPeriods: number[] }

export class InMemoryReplayPort implements StrategyReplayMarketDataPort {
  constructor(options: {
    securityId: number;
    securityCode: string;
    /** period → 已过 A股边界过滤的 StrategyBar 升序数组（由 server 构造） */
    series: ReadonlyMap<number, readonly StrategyBar[]>;
    pageSize?: number; // 默认 2000
  });
  loadReplayWindow(c: StrategyReplayWindowCriteria): Promise<StrategyReplayWindow>;
  readReplayPage(c: StrategyReplayPageCriteria): Promise<StrategyReplayPage>;
}
```

- `loadReplayWindow`：`endAt` **严格小于**截取（canonical 契约）→ `slice(-requiredBars)`。
- `readReplayPage`：`(afterTimestamp ?? startAt) <= ts <= endAt`，返回至多 pageSize 根，
  `nextAfterTimestamp = 最后一根 ts`（无更多行时 `null` → drive 标记 exhausted）。
- Bar 构造复用 `server.ts` 的 `toStrategyBar`（迁至 port 内共享或抽
  `tools/strategy-dev/strategy-bar.util.ts`，guard 允许）；`source` 取每行真实
  `rawK.source`，缺省回落 `DEFAULT_DEV_MARKET_SOURCE`（旧格式文件兼容）。
- **fail-closed**：构造时某 period 数组为空/缺失 → 抛 `DevContextDataMissingError`，
  message 含 `pnpm dev:sync --code <code> --periods <缺失周期名列表>`。
- **测试**（`in-memory-replay-port.spec.ts`）：
  1. 窗口截取 `< endAt` 严格性（含等时刻 bar 不入窗）；
  2. 分页翻页 `nextAfterTimestamp` 链与 exhausted 终止；
  3. 时间戳严格递增预断言（乱序输入抛错）；
  4. 缺周期 → `DevContextDataMissingError` 且 message 含 sync 提示；
  5. `afterTimestamp` 排除语义（不重复返回上一页末根）。

## Phase 3：`runUnifiedSimulationBacktest` 多周期化（server.ts）

**改动块**（现 :747-1000 手写 `for (bars)` 循环整体替换）：

0. **存量定义本地重放（P5.4 对账通道，用户零手工确认）**：
   - `strategyDefinitionId` 解析顺序：本地定义文件优先 → 现有 1/2/3 硬编码公共树；
   - 本地定义文件路径 `mist/.data/strategy-definitions/<definitionId>_v<version>.json`
     （`.data/` 已 gitignore——rule JSON 含私有插件参数，**绝不进公仓**）；
   - 命中即走编译边界统一入口
     `compileStoredStrategyDefinition({kind, rule, signalKind})`（stored-definition-compiler）
     → `{flow, requiredBarCount, contextRequirements}` 直接填充 plan——与生产回测
     run 48 同一条编译路径；
   - 未命中且非 1/2/3 → 422 `DEFINITION_NOT_FOUND`（提示 `pnpm dev:sync --definition <id>`）。

1. **plan 构造**（替换 :817-833）：

```ts
const contextRequirements = deriveContextRequirements(flow, registry);
// StoredDefinitionCompileError → HTTP 422 { code: 'CONTEXT_REQUIREMENT_INVALID' }
const kernel = new StrategyEvaluationKernel({
  securityId: DEFAULT_DEV_SECURITY_ID,
  securityCode: options.code,
  publicFrom,
  registry,
  plans: [{
    definitionId: SIMULATION_LOCAL_FIXTURE_IDENTITY.definitionId,
    versionId: SIMULATION_LOCAL_FIXTURE_IDENTITY.versionId,
    flow, ruleSnapshot: Object.freeze({}),
    period: options.period,
    requiredBarCount: 300,
    contextRequirements,
  }],
});
```

2. **数据装载**：period 集合 = `{options.period} ∪ contextRequirements.keys()`；
   每周期 `loadCanonicalKlines({code, period})`（try/catch → 422
   `DATA_MISSING` + sync 提示）；`toStrategyBar` per-period 映射（source 透传）；
   `MIN_A_SHARE_DATE` 过滤保持（:783）。`InMemoryReplayPort` 构造。

3. **drive 推进**（替换 :867-973 手写循环）：

```ts
const source = new HistoricalBarSource(port, {
  securityId: DEFAULT_DEV_SECURITY_ID,
  securityCode: options.code,
  selection: { kind: 'canonical' },
  evaluationPeriod: options.period,
  contextPeriods: contextRequirements,
  preWarmEndAt: publicFrom,          // startDate 缺省时 = MIN_A_SHARE_DATE（全公开）
  publicFrom,
  endAt: options.endDate ? new Date(options.endDate) : lastDataTimestamp,
  requiredBars: 300,
});
const summary = await source.drive(
  kernel,
  async (signal, bar) => { /* 信号收集 + 买卖委托下达（原 :891-936 逻辑整体搬迁） */ },
  async (bar) => { /* 跨日日结 + broker.onBar 撮合 + 持仓 + 风控裁决（原 :871-886、:938-955） */ },
  async () => { /* setImmediate 让渡（每 50 根）+ 进度日志（求值 bar 每 500 根） */ },
);
```

   - 顺序差异说明：现循环是"先撮合后 push"，drive 是"push → onBar(撮合) →
     onSignal(下单)"——委托仍在 t 根 onSignal 下达、t+1 根 onBar 撮合，Next-Bar
     因果律不变；kernel push 与 broker 无耦合，语义等价。
   - 日结：onBar 内按 `formatShanghaiDateString` 跨日触发 `settleDayClose` +
     `position.onDayClose(lastBar)`（每交易日恰好一次）；循环后末根日结保留。
   - 无 `startDate` 时 `publicFrom = MIN_A_SHARE_DATE`（1996-12-16，通过
     `validateBoundary`；2005 数据下等价"全公开"，行为兼容现状）。

4. **响应**：追加只读 `replay: { prewarmStatus, prewarmActual, barCount,
   publicBarCount, perPeriodPrewarm }`（drive 返回 summary），既有字段零破坏。

5. **缓存**：`getBacktestCacheKey` 追加 `JSON.stringify(contextRequirements)`。

6. **压力套件**（:984-1010）：runner 透传现有 options，多周期自动生效，不改签名。

**测试**（`server.ts` 内逻辑以 spec 级验证——新增
`tools/strategy-dev/__tests__/multi-period-backtest.spec.ts`，直接 import server.ts
导出的 runUnifiedSimulationBacktest（需将其 `export`；dev server 已有先例））：
1. 纯 chan 30m 预设（无 context 声明）多周期改造前后信号序列一致（改造即对账）；
2. 声明 `{1440: 10}` 的桩插件：注入 30m+1440 双序列，逐日日结次数 = 交易日数；
3. context bar 推进全程 broker `getOpenOrders()`/持仓/NAV 无变化（仅求值 bar 触发）；
4. 缺 1440 数据文件 → 422 `DATA_MISSING`；
5. 未注册插件 → 422 `CONTEXT_REQUIREMENT_INVALID`。

## Phase 4：sync 保真（tools/strategy-dev/sync.ts）

0. **新增 `--definition <id>` 模式**（存量定义导出，供本地重放）：

```sql
SELECT id, name, kind, status FROM strategy_definitions WHERE id = <id>;
SELECT id, strategy_definition_id, version_number, rule_schema_version, rule, signal_kind
FROM strategy_versions WHERE strategy_definition_id = <id> ORDER BY version_number DESC;
```

   落盘 `mist/.data/strategy-definitions/<definitionId>_v<versionNumber>.json`
   （含 definition 元数据 + 最新版 rule JSON）；已在 `.data/` gitignore 范围内。
   **保密红线**：该 JSON 含私有插件参数，仅存本地，严禁提交/外传/贴对话。

1. SQL 改为（k_quality 关联 + source 列）：

```sql
SELECT k.source,
       UNIX_TIMESTAMP(k.timestamp)*1000 AS timeMs,
       k.open, k.high, k.low, k.close, k.volume, k.amount,
       q.open_valid, q.high_valid, q.low_valid, q.close_valid,
       q.volume_valid, q.amount_valid
FROM k
JOIN securities s ON k.security_id = s.id
LEFT JOIN k_quality q ON q.k_id = k.id
WHERE s.code = '<code>' AND k.period = <p> AND (<canonical 分段谓词>)
```

2. 行处理：`q` 为 NULL → 全有效；任一 OHLC 掩码 = 0 → **整行丢弃**；
   `volume_valid=0 → volume:null`、`amount_valid=0 → amount:null`；
   行对象新增 `source` 字段落盘。
3. 分段拉取：按年份切片循环（`k.timestamp >= '<y>-01-01' AND < '<y+1>-01-01'`，
   北京时区格式），本地按 timeMs 升序合并 + 首见去重（canonical 分段不重叠，
   去重仅防御）；单段 ~46k 行（5m 一年）远低于 maxBuffer。
4. 写盘：`rows.length > 50_000` → `JSON.stringify(rows)`（无缩进），否则维持缩进。
5. `tools/strategy-dev/README.md` 补 k_quality/source/分片说明。

## Phase 5：门禁与验证

**`libs/strategy/src/dev-server-boundary.guard.spec.ts` 新增断言**（server.ts 源扫描）：
1. `expect(serverSource).toMatch(/HistoricalBarSource/)`（回测推进必须复用）；
2. `expect(serverSource).not.toMatch(/mergeByAvailability/)`（归并选择器属 drive 内部）；
3. `expect(serverSource).not.toMatch(/from ['"].*kernel\/availability['"]/)`
   （availabilityKey 禁止 dev 侧直算，经 drive 共享）；
4. `expect(serverSource).not.toMatch(/execSync|mysql/)`（dev server 禁直连 DB）。

**验证命令**（按序）：

```bash
pnpm -C mist test libs/strategy/src/stored-definition-compiler.context-requirements.spec.ts
pnpm -C mist typecheck
pnpm -C mist test libs/strategy/src/dev-server-boundary.guard.spec.ts \
  libs/strategy/src/dev-server-api-boundary.guard.spec.ts \
  libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts \
  libs/strategy/src/strategy-dual-timestamp.guard.spec.ts
pnpm -C mist test:ci   # --forceExit 已内建；CPU 重活，分批跑（VRM 节制）
```

**数据同步（操作）**：

```bash
pnpm -C mist dev:sync --code 000001 --periods 1d,30m,5m
# 核对三份 data/kline/000001_*.json 起止：2005-01-04 → 最新收盘；
# 5m 文件应为紧凑 JSON 且含 source 字段、2011-07-27 前行 volume/amount=null
```

**同构对账（验收门禁，任务 5.4）**：

```bash
# ① 先锁定 run 48 实际版本（run 48 记录 strategyVersionId → 反查 definition id + version_number）
pnpm dev:sync --definition <run48-definition-id>
# ② 数据同步
pnpm dev:sync --code 000001 --periods 1d,30m,5m
# ③ 本地重放（存量定义编译路径，与生产同源）
pnpm dev:server &
curl -X POST localhost:8001/v1/strategy-backtests \
  -d '{"code":"000001","period":30,"startDate":"2005-01-04","endDate":"2026-10-20",
       "strategyDefinitionId":<run48-definition-id>}'
# 断言：信号与 run 48 逐条一致（2008-03-03 / 2012-06-14 段级三卖），
# decisionTrace 各 EXTRACTOR 节点 evidence.degraded=false，
# replay.prewarmStatus='full'，perPeriodPrewarm 5/30/1440 全满额
```

用户无需手工确认插件取值——树形态与参数 100% 来自生产库存量定义 verbatim 编译。

## 执行顺序与断点

Phase 1 → 2 → 3 → 4 → 5（代码连续落地，每 Phase 跑定向测试）→ 5.3 数据同步
（需 mist-box 可达）→ 5.4 对账 → Phase 6 报告。机器约束：`test:ci` 分批，
避免持续满载降频。
