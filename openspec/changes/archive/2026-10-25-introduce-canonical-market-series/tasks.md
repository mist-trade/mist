# Tasks: Canonical 行情序列

> 分阶段门禁：每阶段完成即停顿汇报；未获批准不进入下一阶段。

---

## Phase 0: 前置（归档 + 基线）

- [ ] **0.1 归档 `add-vendor-market-data-import`**
  - `openspec archive add-vendor-market-data-import -y`（含 delta 合并）
  - 确认 live `backtest-runtime` 已是 vendor 版需求
  - 本 change 的 REMOVED 块依赖该标题，未归档前无法校验/归档
- [ ] **0.2 基线**：记录当前 `k` 行数、`backtest_runs` 行数、`data_policy_version` 为空的行数

---

## Phase 1: 公共 canonical 核心（`libs/market-data`）

- [ ] **1.1 类型与校验**
  - `SplicePolicy` / `SpliceSegment` / `SplicePolicyProvider`
  - 段校验：有序、不重叠、首段可省 `from`、末段可省 `before`、source 必须已知
- [ ] **1.2 策略解析**
  - `resolveSegments(policy, securityCode, period)`：override 优先 → defaults → 缺失抛错
- [ ] **1.3 跨段组合（纯函数）**
  - `loadWindow(reader, plan, endAt, requiredBars)`：反向跨段、升序输出
  - `readPage(reader, plan, from, to, afterTimestamp, limit)`：正向跨段、时间戳游标
  - 段边界不重复、不跳漏、缺口不补
- [ ] **1.4 加载器**
  - 从 `MIST_PRIVATE_PLUGINS_DIR` 发现 `marketDataPolicy` provider（复用现有私有目录约定）
  - 缺失/非法：显式失败，不返回空
- [ ] **1.5 单测**
  - 解析：默认 / override / 非法段 / 未知 source
  - 组合：跨 1~3 段、窗口反向、页尾正好落在边界、缺口、空段
- [ ] **1.6 门禁**：`pnpm -C mist test libs/market-data && pnpm -C mist typecheck`

---

## Phase 2: 数据库

- [ ] **2.1 迁移 031**
  - `backtest_runs.source` 枚举追加 `canonical`
  - `backtest_runs` 新增 `data_policy_version varchar(64) NULL`
  - 不改 `k`，不新增数据行
- [ ] **2.2 实体与 DTO**
  - `BacktestRun` 增加 `dataPolicyVersion`
  - 旧 run 不回填

---

## Phase 3: 回测接入

- [ ] **3.1 契约**
  - `CreateBacktestRunDto` 删除 `source`，携带 `source` 的请求返回 `VALIDATION_ERROR`
  - `BacktestRunExecutor`：新 run 写 `source='canonical'` + `data_policy_version`
- [ ] **3.2 读取**
  - `BacktestMarketDataAdapter` 增加 canonical 路径（注入 reader + policy）
  - 保留 legacy 物理源路径：`source ∈ {tdx,qmt,vendor_*}` 的存量 PENDING run 仍按原源回放
  - 不再从 run 上读取 provider 来选择新 run 的数据
- [ ] **3.3 信号落库**
  - `mapKernelSignalToPersistencePayload` 的 source 改为**该根 bar 的真实来源**
- [ ] **3.4 单测**
  - canonical run：跨段读取、policy 版本落库、信号 origin
  - legacy run：按原 source 回放、不被改写
  - 携带 source 的 create 请求 → 400
- [ ] **3.5 门禁**：`pnpm -C mist test apps/backtest apps/mist/src/strategy`

---

## Phase 4: 指标 / 可视化

- [ ] **4.1** `IndicatorQueryDto` / `QueryVisualCommandsDto` 删除 `source`
- [ ] **4.2** `IndicatorService.findKData` 与 visual 读取改走 canonical
- [ ] **4.3** 单测：不再有 source 入参、跨段读取正确
- [ ] **4.4** 门禁：`pnpm -C mist test apps/mist/src/indicator apps/mist/src/visual`

---

## Phase 5: 私有策略与本地研发

- [ ] **5.1 私有仓**：新增 `marketDataPolicy` 配置（5m/30m/1d 三段规则）与 provider
- [ ] **5.2 dev:sync**：读取私有 policy，按段生成 UNION ALL SQL，输出已拼接序列
- [ ] **5.3 本地验证**：000001 5m/30m/1d 与"按 policy 手工 UNION"逐 bar 一致
- [ ] **5.4** 本地 dev server 起服务，页面能读到 2005 起的历史

---

## Phase 6: 前端

- [ ] **6.1** 回测配置、双周期缠论、K 线页移除数据源选择器与 `DataSourceValue` 依赖
- [ ] **6.2** `pnpm -C mist-fe typecheck && pnpm -C mist-fe test:ci`

---

## Phase 7: 生产与验收

- [ ] **7.1** 应用迁移 031 并记账
- [ ] **7.2** 部署私有 policy（挂载 `/app/private-plugins`）
- [ ] **7.3** 回归：同一区间 canonical 与手工分段 UNION 逐 bar 0 差异
- [ ] **7.4** 端到端：000001 30m，2005-01-04 ~ 2026-10-20 回测跑通，信号 `source` 为真实来源
- [ ] **7.5** 存量兼容：随机抽一个旧 run 确认可读、source 未变
- [ ] **7.6** 文档 + `openspec validate introduce-canonical-market-series --strict`
