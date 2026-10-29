# Proposal: 引入 Canonical 行情序列（下游不再感知数据来源）

## 1. 背景

当前 `k` 表的身份是 `(security_id, source, period, timestamp)`，`source` 同时承担了两件事：

1. **存储标记**：这批原始行是哪个供应商/终端采来的（应该保留）；
2. **消费维度**：下游必须选一个 source 才能查询（不该保留）。

第 2 件事带来三个问题：

- **业务上说不通**：一条指数或个股在某个周期上只有一条真实走势，不存在"同一根 K 线有两个版本供选择"；
- **下游被迫知道实现**：回测/指标/可视化/本地研发都要传 `source`，私有拼接策略一旦变化，调用方全部要跟着改；
- **拼接无处安放**：2005→今的连续序列需要 vendor_a + QMT 组合；若按 source 暴露，就要么物化（DB 膨胀）、要么让下游选（暴露私有策略）。

## 2. 目标

1. **一条 (security, period) 只有一条 canonical 序列**，下游只按标的 + 周期 + 时间范围读取，**不再有 source 参数**。
2. **拼接是 canonical 的内部实现**：由私有的 `SplicePolicy` 配置驱动，支持**任意 N 段**，可修改、可版本化，**不落库**。
3. **`k.source` 保留为来源标记**：原始行继续按 provider 区分；canonical 返回的每根 bar 仍带真实来源（审计用）。
4. **策略可复现**：回测 run 记录策略版本，信号行记录该根 bar 的真实来源。
5. **公共仓与私有策略解耦**：公共仓只提供通用的策略类型、校验、组合读取器与加载器，**不含任何日期边界、源优先级或标的名单**。

## 3. 范围

### 本 change（A）

- `SplicePolicy` 类型 + 校验 + 私有目录加载器；
- `CanonicalMarketDataResolver`（窗口/分页跨段组合，纯逻辑 + 端口）；
- 回测、指标、可视化、本地 sync 改为读 canonical，移除 `source` 入参；
- `backtest_runs` 记录策略版本；信号行记录真实来源；
- 私仓新增策略配置与 provider（几行代码）。

### 非目标（B 及以后）

- **实时链路切换 canonical（R2）**：与多周期一起做，本 change 不动实时窗口；
- **多周期求值**：内核仍单周期；
- 不删除 `k.source`，不清理历史 source 维度的数据；
- 不改变采集链路（tdx/qmt 仍按原方式写库）。

## 4. 影响面

| 仓库 | 影响 |
|---|---|
| `mist` | 新增 canonical 读取层；回测/指标/可视化 DTO 去掉 `source`；迁移 031（run 记录策略版本、`canonical` 标记值） |
| `external-plugins` | 新增 `marketDataPolicy` 配置与 provider |
| `mist-fe` | 回测/缠论/K 线页面移除数据源选择器 |
| `mist-deploy` | 私有策略目录已挂载（`/app/private-plugins`），无需新增 |
| 数据库 | 不新增拼接数据行；仅加列与枚举值 |

## 5. 风险

| 风险 | 处置 |
|---|---|
| 去掉 `source` 是破坏性 API 变更 | 一次性切换，前端同步修改；不接受旧参数（不保留降级） |
| 私有策略缺失/非法导致无法读数据 | 显式失败并给出清晰错误，绝不静默返回空 |
| 跨段分页/预热的边界错误 | 纯函数单测覆盖：跨 1 段、跨 2 段、窗口反向跨段、空段 |
| 与在途 change 的 spec 冲突 | 先归档 `add-vendor-market-data-import`，再基于归档后的 live spec 修改 `backtest-runtime` |
| 回测结果与历史 run 不可比 | 老 run 保留原 `source`；新 run 记录 `data_policy_version`，结果按版本解释 |
