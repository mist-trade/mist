# Design: 每供应商独立源 + 数值化质量契约

## 1. 关键决策

### 决策 1：每个供应商一个独立 `source`（用户选定 B）

`DataSource` 新增 `VENDOR_A = 'vendor_a'`，后续 `vendor_b`、`vendor_c` 各自独立。

| 维度 | 结果 |
|---|---|
| 同 bar 多供应商并存 | ✅ 唯一键 `(security_id, source, period, timestamp)` 天然隔离 |
| 新增供应商成本 | 1 个枚举值 + 1 条 migration（`ALTER TABLE k MODIFY source ENUM(...,'vendor_b')`）；读路径、DTO、回测**无需改动** |
| 回测选择 | 一次回测绑定一个具体 vendor 源，不做优先级仲裁 |
| 采集链路 | `vendor_*` 不是可采集源：`post-close-sync`、`CollectionStrategyRegistry`、实时 allowlist 均不识别（保持现状） |

命名约定：第三方一律 `vendor_<slug>`；slug 由供应商中文名或数据特征决定，一旦写入生产不再改名（改枚举要 DDL + 回填）。

**注意一处刻意的不对称**：`security_source_configs.source` 的数据库枚举**不追加** `vendor_*`。TS 枚举共享会让 TypeORM 认为该列也接受 vendor 值，但该表语义是"采集源配置"，vendor 不参与采集；现有写入路径也不会产生 vendor 值。此不对称写入 design 记录，避免后人误判。

### 决策 2：质量用"数值掩码 + 归一因子 + 口径分段"表达，而不是标签

**问题**：`quality='bad'`、`volume_quality='constituent'` 这类标签没法进入任何计算，只能人工看。

**方案**：每个字段一个 `0/1` 掩码，量额再加乘性因子与口径分段号。新表 `k_quality`（与 `k` 1:1，**对所有数据源通用**，非 vendor 专用）。

```sql
CREATE TABLE IF NOT EXISTS `k_quality` (
  `id` int NOT NULL AUTO_INCREMENT,
  `k_id` int NOT NULL,
  `open_valid`   tinyint(1) NOT NULL DEFAULT 1 COMMENT '开盘价是否可直接参与计算',
  `high_valid`   tinyint(1) NOT NULL DEFAULT 1,
  `low_valid`    tinyint(1) NOT NULL DEFAULT 1,
  `close_valid`  tinyint(1) NOT NULL DEFAULT 1,
  `volume_valid` tinyint(1) NOT NULL DEFAULT 1 COMMENT '成交量是否可直接参与计算',
  `amount_valid` tinyint(1) NOT NULL DEFAULT 1 COMMENT '成交额是否可直接参与计算',
  `volume_scale` decimal(20,8) NOT NULL DEFAULT 1 COMMENT '量纲归一因子：volume*scale=可比口径',
  `amount_scale` decimal(20,8) NOT NULL DEFAULT 1,
  `caliber_epoch` smallint unsigned NOT NULL DEFAULT 1 COMMENT '口径分段号：同 epoch 内可比，跨 epoch 不可比',
  `manual_fix` tinyint(1) NOT NULL DEFAULT 0,
  `derived_from_period` int NULL COMMENT 'NULL=原生；5=由5分钟聚合',
  `dataset_version` varchar(64) NULL COMMENT '导入批次',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_k_quality_k_id` (`k_id`),
  CONSTRAINT `fk_k_quality_k` FOREIGN KEY (`k_id`) REFERENCES `k` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**为什么是可运算的**：

```sql
-- 只用可信收盘价
SELECT AVG(close) FROM k JOIN k_quality q ON q.k_id=k.id WHERE q.close_valid=1;

-- 缠论/ATR 需要的高低价
... WHERE q.high_valid=1 AND q.low_valid=1;

-- 归一化后的成交量（无效自动归零，已知单位错误自动校正）
SELECT SUM(k.volume * q.volume_valid * q.volume_scale) ...;

-- 只用同一口径段内的数据（跨断点不可比）
... WHERE q.caliber_epoch = 2;

-- 取"坏日"明细（高位/低位不可用的 bar）
SELECT * FROM k JOIN k_quality q ON q.k_id=k.id WHERE q.high_valid=0;
```

**为什么不用 0~1 的"质量分"**：分数需要标定依据，否则是拍脑袋；本数据集只有"对/错"两类事实（H/L 错、量错 N 倍），0/1 掩码 + 已知乘性因子是唯一有据可依的数值化方式。若将来供应商给出置信度，再扩展列。

**为什么 `scale` 本期恒为 1**：实测 399673 2014 的量/额与 2015 年比值分别是 38.9× 与 7.66×，**不是同一个常数**，无法用单一因子校正 → 只能判无效。`scale` 留给将来"手/股 ×100"这类已知固定单位错误。

**为什么需要 `caliber_epoch`**：399006 在 2017 年出现口径断点（成交量中位数 3.75e9 → 1.43e9，-62%），断点前后各自内部自洽，但**跨断点不可比**。掩码无法表达"有效但不可比"，分段号可以（`WHERE caliber_epoch=<当前段>`）。

**存储策略**：稠密写入（每根 vendor bar 一条 `k_quality`）。1.13M 行 × ~60B ≈ 68MB，换取任意查询不需要 `COALESCE`。

### 决策 3：本期数据的掩码映射

| 指数 / 区间 | O | H | L | C | volume_valid | amount_valid | epoch |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 全部默认 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 000300 2005-06-09 / 2006-08-07 / 2006-08-21 / 2006-09-18 | 1 | **0** | **0** | 1 | 1 | 1 | 1 |
| 000001 2005-01-04 ~ 2011-07-26 | 1 | 1 | 1 | 1 | **0** | **0** | 1 |
| 000001 2011-07-27 起 | 1 | 1 | 1 | 1 | 1 | 1 | **2** |
| 399001 全区间（2015-05-20 起） | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 399006 2010-06-01 ~ 2016-12-31 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 399006 2017-01-01 起 | 1 | 1 | 1 | 1 | 1 | 1 | **2** |
| 399673 2014 全年 | 1 | 1 | 1 | 1 | **0** | **0** | 1 |
| 399673 2015-01-01 起 | 1 | 1 | 1 | 1 | 1 | 1 | **2** |
| `manual_fix=1` 的 bar | 继承所在区间掩码 | — | — | — | — | — | — |

两条判断题已由用户 2026-10-24 拍板：

1. `000001` 2011-07-27 之前（量高 7~19%，额高 0.8~2.7%）**按保守原则** `volume_valid=0, amount_valid=0`。
2. `399006` 2017 起只是"口径变了"，值本身没错 → `volume_valid=1` + `caliber_epoch=2`（不是 0）。

30m 派生行的继承规则：六个掩码取 **AND**（组内任一 bar 不可用则整根不可用）；`scale` 取组内一致值，不一致记 0 有效性；`caliber_epoch` 取组内一致值。

### 决策 4：30m 用 session 内"每 6 根"分块

按时钟取整会在熔断日造出假 bar（2016-01-04 末根 5m 是 13:35，时钟映射会归到 14:00）。算法：

```
每个交易日：切上午段（≤11:30）/ 下午段（>11:30）
每段按顺序 6 根一组（末组可不足）
timestamp = 组内最后一根 5m 的时间戳
open=首根 open；high=max；low=min；close=末根 close；volume/amount=求和
```

实测：正常日 8 根；2016-01-04 → 6 根（末根 13:35 仅 1 根 5m）；2016-01-07 → 1 根（10:00）。

### 决策 5：拼接只在本地 dev 数据层

`backtest-runtime` 既有硬约束："MUST NOT query, merge or fall back to another source"。因此：

- **DB**：`vendor_a` 与 `qmt` 各自独立，回测单源读取；
- **本地 dev**：`tools/strategy-dev/sync.ts` 拉取时按 `qmt > tdx > vendor_a > ef` 去重，产出连续 JSON。

已知差异：本地拼接与 DB 单 vendor 回测在尾部两周可能不同（000001/399001 vendor 止于 2026-09-30，QMT 续到 10-14/16；399006 反之）。本地用于迭代，正式回测以 DB 单源为准。

### 决策 6：类型层拆分实时源与历史源

```ts
export type StrategyMarketSource = 'ef' | 'tdx' | 'qmt' | 'vendor_a';
export type StrategyRealtimeSource = 'tdx' | 'qmt';
export type StrategyHistorySource = StrategyRealtimeSource | 'vendor_a';
```

`StrategyReplayWindowCriteria/PageCriteria.source` 改用 `StrategyHistorySource`；实时池 `requireRealtimeSource` 仍只放行 tdx/qmt。

回测 allowlist 用**派生常量**而非手写数组，新增 vendor 自动生效：

```ts
export const BACKTEST_SOURCES = Object.values(DataSource)
  .filter((s) => s === 'tdx' || s === 'qmt' || s.startsWith('vendor_'));
```

### 决策 7：迁移 030 单独手工应用

生产 `schema_migrations` 停在 026，027~029 属于在途 change `upgrade-backtest-decision-and-parity-engine`。本次只执行 030 并手工写入 `schema_migrations`，不连带应用 027~029。

## 2. 迁移 030

```sql
SET NAMES utf8mb4;

ALTER TABLE `k`
  MODIFY COLUMN `source` enum('ef','tdx','qmt','vendor_a') NOT NULL DEFAULT 'ef'
  COMMENT '数据源：ef=东方财富，tdx=通达信，qmt=大QMT，vendor_a=第三方A';

-- k_quality 建表语句见决策 2
```

## 3. 代码改动清单

### mist

| 文件 | 改动 |
|---|---|
| `deploy/database/migrations/030_add_vendor_data_source.sql` | 新建（enum + `k_quality`） |
| `libs/shared-data/src/enums/data-source.enum.ts` | `VENDOR_A = 'vendor_a'` |
| `libs/shared-data/src/entities/k-quality.entity.ts` | 新建实体 |
| `libs/shared-data/src/entities/k.entity.ts` | 增加 `kQuality` OneToOne |
| `libs/shared-data/src/index.ts` | 导出 |
| `libs/market-data/src/strategy-bar.ts` | 源类型拆分（见决策 6） |
| `libs/market-data/src/strategy-market-data.port.ts` | replay 用 `StrategyHistorySource` |
| `libs/constants/src/market.constants.ts` | `MARKET_SOURCES.VENDOR_A`、`BACKTEST_SOURCES` |
| `apps/backtest/src/backtest-market-data.adapter.ts` | 断言用 `BACKTEST_SOURCES`；`toDataSource` 显式映射 |
| `apps/backtest/src/backtest-run.executor.ts` | 同上 |
| `apps/mist/src/strategy/dto/create-backtest-run.dto.ts` | `@IsIn(BACKTEST_SOURCES)` + OpenAPI |
| `tools/market-data-import/**` | 导入工具 + 单测 |
| `tools/strategy-dev/sync.ts` | 源优先级 |
| `tools/strategy-dev/provider.ts` | mtime 缓存 |

### mist-fe

| 文件 | 改动 |
|---|---|
| `app/api/client.ts` | `DataSourceValue` 加 `"vendor_a"` |
| `app/backtests/components/BacktestConfigPanel.tsx` | 下拉新增 vendor_a |
| `app/chan/DualTimeframeChanPage.tsx`、`app/k/KLineLivePage.tsx` | 同步 |

## 4. 导入工具（`tools/market-data-import/`）

TypeScript，复用 jest/typecheck/lint/magic 门禁：

```
vendor-import.lib.ts   纯函数：CSV 解析、校验、30m 分块、质量规则求值
vendor-import.ts       CLI：读 CSV → 校验 → 写 k.tsv / k_quality.tsv / manifest.json
vendor-import.spec.ts  正常日 / 熔断日 / 末组不足 / 质量继承 / 非法行拒绝
README.md              用法、SQL 模板、校验、回滚
```

输出两张 TSV：`k` 行（不含质量）与 `k_quality` 行（按 `security_id+period+timestamp` 与 k 对齐，导入时 join 回填 `k_id`）。

## 5. 校验与对账

### 5.1 导入前（工具内建，失败即非零退出）

- 时间戳唯一且严格递增；OHLC 包络自洽；价格 > 0；
- 每日 5m 根数 ∈ {48,31,6}；30m ∈ {8,6,1}；
- 按日聚合收盘 vs `.data/kline/<code>_1d.json` 相对误差 ≤0.1%；
- 输出质量分布报告（各掩码为 0 的 bar 数与区间），供人工复核。

### 5.2 导入后（SQL）

```sql
SELECT period, COUNT(*) FROM k WHERE source='vendor_a' GROUP BY period;   -- 971849 / 161979
SELECT COUNT(*) FROM k_quality q JOIN k ON k.id=q.k_id WHERE k.source='vendor_a'; -- 1133828
SELECT COUNT(*) FROM k WHERE source='vendor_a'
  AND (high < GREATEST(open,close) OR low > LEAST(open,close));            -- 0
SELECT high_valid, low_valid, volume_valid, amount_valid, COUNT(*)
  FROM k_quality q JOIN k ON k.id=q.k_id WHERE k.source='vendor_a' GROUP BY 1,2,3,4;
```

## 6. 本地 dev

`sync.ts` 的 `ORDER BY` 改为 `qmt 0 > tdx 1 > vendor_* 2 > else 3`；`provider.ts` 按路径+mtime+size 缓存解析结果（25 万根 5m ≈ 63MB JSON）。

## 7. 验证基线

| 门禁 | 命令 |
|---|---|
| 类型 | `pnpm -C mist typecheck && pnpm -C mist-fe typecheck` |
| 单测 | `pnpm -C mist test tools/market-data-import apps/backtest libs/market-data` |
| 全量 | `pnpm -C mist test:ci` |
| 架构门禁 | 三张 `*.guard.spec.ts` |
| 规格 | `openspec validate add-vendor-market-data-import --strict` |
| 生产 | 5.2 全部 SQL + 一次 `source=vendor_a` 的 30m 回测 |

## 8. 已知限制

- 同一 `vendor_*` 源在同一 bar 只有一条（不同供应商靠不同 source 并存，天然无冲突）；
- 质量掩码 V1 只落库，不回传 `StrategyBar`；
- 本地 dev 的 bar 来源在归因里统一标为 `qmt`（`server.ts` 的默认源），vendor 段不可区分；
- 4 个坏日参与 2005-2006 的缠论几何（掩码可过滤，但内核不自动读掩码）。
