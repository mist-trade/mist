# OpenSpec 缺口清单（2026-10-12 修订，基线 10-12）

> 本文件是 Mist 平台 OpenSpec 缺口全景的**唯一权威清单**。**更新任何 change 状态时同步修订本文件。**

## 状态速览

- `specs/`：**72 个已采纳 spec**（新增 `chan-channel-departure-guard`、`chan-fibonacci-overlay`、`strategy-evaluation-pipeline`）
- `changes/`：**5 个 active change**（`add-shanghai-regime-and-left-right-bsp-plugins` 待执行，`upgrade-backtest-decision-and-parity-engine` 待执行，`add-pre-market-strategy-hydration` 待执行，`integrate-native-terminal-visualization` 部分延期，`capture-realtime-provider-anomalies` 待真实被动触发）
- **核心架构演进闭环**（2026-09 ~ 2026-10）：
  - 策略统一 push 求值内核与三链路同构落地，双时间戳 `pivot_time` 落盘（`unify-strategy-evaluation-pipeline` 归档）
  - 缠论 9 段延伸升级与波动扩展解耦（`differentiate-chan-central-extension-upgrade-and-expansion` 归档）
  - 离开段极值与三类买卖点刚性硬门禁（`enforce-chan-channel-departure-extreme-guard` 归档）
  - 多级别背驰与一类点趋势背驰纯化（`remediate-chan-divergence-multi-level-gates` 归档）
  - 动态外部因子插件与私有策略隔离（`support-external-factor-plugins` 归档）
  - Rust Polars 斐波那契指标、因子插件与 TV 工业可视化（`add-chan-fibonacci-overlay` 归档）

---

## 1. 活跃 / 待执行 Change

| Change | 进度 | 状态与说明 |
|---|---|---|
| `add-shanghai-regime-and-left-right-bsp-plugins` | 0/18 | 新建待执行：上证指数全局牛熊插件 + 主仓纯透传 + 全仓清理茅台换000001 |
| `upgrade-backtest-decision-and-parity-engine` | 0/10 | 未开始：量化回测决策状态机、严格 A 股模拟撮合与 Exit Trinity 出局三部曲（Migration 027） |
| `add-pre-market-strategy-hydration` | 0/17 | 未开始：09:20 盘前活跃策略滑窗预热与 Polars 静态数据质检 |
| `integrate-native-terminal-visualization` | 4/12 | 阶段一通用指令层完成；阶段二 QMT 哑执行器与阶段三通达信 DLL 插件 deferred |
| `capture-realtime-provider-anomalies` | 13/14 | 被动契约：只读采集器/脱敏/Runbook 均已就绪，§4.3 等首个真实 incident 自然发生后复盘 |

---

## 2. 近期归档（2026-09 ~ 2026-10-12）

| 日期 | Change | 内容与进度 |
|---|---|---|
| **10-12** | `unify-strategy-evaluation-pipeline` | 14/14：统一求值内核 push 化、双 BarSource 适配、RealtimeKernelPool、双时间戳 Migration 026、三链路同构门禁 |
| **10-12** | `differentiate-chan-central-extension-upgrade-and-expansion` | 11/11：段中枢 9 段延伸升级（深紫）与波动重叠扩展（玫紫虚线）彻底正交解耦 |
| **10-12** | `enforce-chan-channel-departure-extreme-guard` | 11/11：离开段破极值与三类点确认硬门禁，防大周期反向走势泄漏 |
| **10-12** | `remediate-chan-divergence-multi-level-gates` | 12/12：双级别背驰硬门禁对齐与一类买卖点严格趋势背驰纯化（BUG-CHAN-009） |
| **10-12** | `support-external-factor-plugins` | 13/13：支持外部目录动态加载私有因子插件，主仓彻底解耦私有战术 |
| **10-12** | `add-chan-fibonacci-overlay` | 15/15：Rust Polars 向量化斐波那契指标、因子插件与 TradingView 官方色带可视化 |

---

## 5. 跨环境与实盘运行验收（HIL 待办）

以下属于在代码与单测已完成后，依赖 **Windows 宿主 + 真实行情终端 + 交易时段** 的在线验收与调优：

1. **实时策略实盘观察与切 On 决策**：`REALTIME_PRODUCTIZATION_MODE=shadow` 实盘运行观察，评估切换为 `on`。
2. **实时订阅断流恢复实盘演练**：真实 TDX/QMT 进程重启后断流检测与 A7 告警阈值实盘校准。
3. **盘前巡检与收盘同步生产观察**：部署到 Windows Appliance（`mist-schedule` 容器）后观察 09:05 简报与 22:30/06:30 同步任务。

---

## 6. 明确废弃与已清理项

- `feat/strategy-portfolio-backtesting`（多策略组合回测）：已标记**废弃**，清理过时远端分支。
- `migrate-stack-to-linux-node-with-ssh-tunnel`（Linux 迁移）：提案已**放弃并删除**。
- `feat/realtime-subscription-recovery`：已完全合并至 master，清理过时分支。
