# Tasks: 第三方长历史行情接入（vendor_a + 数值化质量）

> **分阶段门禁**：每个 Phase 完成编码 + 单测 + 静态检查后**立即停顿**，提交阶段报告；未获批准不得进入下一 Phase。

---

## Phase 0: 数据库与类型地基

- [ ] **0.1 迁移 030**
  - 新建 `deploy/database/migrations/030_add_vendor_data_source.sql`
  - `k.source` 追加 `vendor_a`（保留 `DEFAULT 'ef'`）
  - 新建 `k_quality`（六掩码 + 两 scale + caliber_epoch + 溯源字段，见 design 决策 2）
  - 只做加法，不动 `ef/tdx/qmt` 既有行

- [ ] **0.2 共享实体与枚举**
  - `data-source.enum.ts`：`VENDOR_A = 'vendor_a'`
  - 新建 `k-quality.entity.ts`；`k.entity.ts` 增加 `kQuality` OneToOne；index 导出

- [ ] **0.3 市场源类型拆分**
  - `strategy-bar.ts`：`StrategyMarketSource` 加 `vendor_a`；`StrategyRealtimeSource` 收窄为 `tdx|qmt`；新增 `StrategyHistorySource`
  - replay 端口 criteria 改用 `StrategyHistorySource`
  - `market.constants.ts`：`MARKET_SOURCES.VENDOR_A`、派生 `BACKTEST_SOURCES`

- [ ] **0.4 地基门禁**
  - `pnpm -C mist typecheck`
  - `pnpm -C mist test libs/shared-data libs/market-data libs/strategy`
  - 三张架构门禁 spec

---

## Phase 1: 导入工具（`tools/market-data-import`）

- [ ] **1.1 纯函数库 `vendor-import.lib.ts`**
  - CSV 解析（utf-8 BOM、10 列、数值强校验）
  - 校验：时间戳唯一/递增、OHLC 包络、价格 > 0、每日根数分布
  - 30m 分块聚合（session 切分、每 6 根、末组保留）
  - 质量规则求值：按 design 决策 3 的映射表输出六掩码 / scale / epoch / code
  - 30m 质量继承：掩码取 AND、epoch 取组内一致、code 取最严重

- [ ] **1.2 CLI `vendor-import.ts`**
  - 参数：`--code --source vendor_a --dataset-version --security-id --input --out-dir`
  - 输出 `k_5m.tsv`、`k_30m.tsv`、`quality_5m.tsv`、`quality_30m.tsv`、`manifest.json`
  - 导入前对账：日聚合收盘 vs `.data/kline/<code>_1d.json`，相对误差 ≤0.1%
  - 输出质量分布报告（各掩码为 0 的条数与区间），失败即非零退出

- [ ] **1.3 单测 `vendor-import.spec.ts`**
  - 正常日 → 8 根 30m，时间戳集合精确
  - 熔断日 31 根 → 6 根（末根 13:35）；6 根 → 1 根（10:00）
  - 质量继承（bad 日 H/L=0、O/C=1；跨 epoch）
  - 非法行拒绝、末组不足保留

- [ ] **1.4 工具门禁**
  - `pnpm -C mist test tools/market-data-import`
  - `pnpm -C mist typecheck && pnpm -C mist lint:check && pnpm -C mist check:magic`

---

## Phase 2: 回测消费 vendor_a

- [ ] **2.1 契约放行**
  - DTO：`@IsIn(BACKTEST_SOURCES)` + OpenAPI enum
  - executor：`BACKTEST_SOURCE_UNSUPPORTED` 用派生集合判定
  - adapter：断言改用派生集合；`toDataSource` 显式映射，删除 `else → QMT` 兜底

- [ ] **2.2 前端**
  - `DataSourceValue` 加 `"vendor_a"`；回测/看盘下拉同步

- [ ] **2.3 单测**
  - DTO：vendor_a 通过、ef 拒绝 400
  - adapter：只查 `k.source='vendor_a'`，无跨源查询
  - executor：未知 source → `BACKTEST_SOURCE_UNSUPPORTED`

- [ ] **2.4 门禁**
  - `pnpm -C mist test apps/backtest apps/mist/src/strategy`
  - `pnpm -C mist-fe typecheck && pnpm -C mist-fe test:ci`

---

## Phase 3: 本地 dev 数据层

- [ ] **3.1 源优先级**：`sync.ts` 改 `qmt 0 > tdx 1 > vendor_* 2 > else 3`，保持去重/升序/limit 语义
- [ ] **3.2 解析缓存**：`provider.ts` 按路径 + mtime + size 缓存，文件变更失效
- [ ] **3.3 单测**：同 timestamp 保留 qmt；vendor 独有保留 vendor；缓存命中与失效
- [ ] **3.4 门禁**：`dev-server-boundary.guard.spec.ts` + 新增用例全绿

---

## Phase 4: 生产落地（收盘后窗口）

> 需用户明确批准；密码走环境变量，不落命令历史。

- [ ] **4.1 变更前快照**：`SHOW CREATE TABLE k`、当前行数与 source 分布
- [ ] **4.2 只应用 030**：执行 DDL + 手工写 `schema_migrations`，复核 `k.source` 含 vendor_a、`k_quality` 存在
- [ ] **4.3 生成数据**：5 个指数 5m/30m 的 k 与 quality TSV；核对 manifest（971,849 / 161,979）
- [ ] **4.4 传输**：`scp` → `docker cp` 到 `mist-mysql:/var/lib/mysql-files/`
- [ ] **4.5 导入**：临时表 → `LOAD DATA` → upsert `k` → join 回填 `k_quality`；分批打印行数
- [ ] **4.6 对账**：design §5.2 全部 SQL；抽查 000300 坏日 `high_valid=0`
- [ ] **4.7 幂等与回滚演练**：单指数删除后重导，行数与质量分布一致
- [ ] **4.8 回测冒烟**：`source=vendor_a`、30m、2015-01-01~2026-09-30 跑通

---

## Phase 5: 本地跑通与文档

- [ ] **5.1** `pnpm dev:sync --code <code> --periods 1d,30m,5m`（5 个指数）
- [ ] **5.2** `pnpm dev:server` + `mist-fe pnpm dev:local`，确认 2025-07 之前历史可见、切面连续
- [ ] **5.3 文档**：`tools/market-data-import/README.md`（用法/SQL/校验/回滚/质量口径）、`docs/` 数据来源与质量说明
- [ ] **5.4 收尾**：`pnpm -C mist test:ci`、`openspec validate add-vendor-market-data-import --strict`
