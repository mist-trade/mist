# parity-reconcile — 三链路对账 harness（本地集成层）

验证"实时回放落盘"与"批量回测落盘"在同区间/同策略/同标的/同周期下逐条一致。

## 原理

- **实时对账面**：`strategy_signal`（由 mysql-free mock 模式或真实封存 bar 落盘）
- **回测对账面**：`backtest_signal_results`（harness 自动创建回测 run 并轮询完成）
- 三层测试中的第 2 层：内核语义由 CI 的三路 parity 断言（`strategy-pipeline-homogeneity.guard.spec.ts`）
  覆盖；本 harness 验证的是**基础设施路径**（Redis / BullMQ / 持久化 / 交付接线）。

## 前置条件

1. 本地 docker compose 栈（mysql + redis + mist-backend + signal）或等效本地进程。
2. 已有可回测的策略版本（decision_flow kind，或经透明编译的 legacy kind）。
3. 环境：

```bash
export PARITY_DB_HOST=127.0.0.1
export PARITY_DB_PORT=3306
export PARITY_DB_USER=mist
export PARITY_DB_PASSWORD=...
export PARITY_DB_NAME=mist
export PARITY_API_BASE=http://localhost:8001
export PARITY_SECURITY_CODE=510300.SH
export PARITY_PERIOD=5
export PARITY_START='2026-09-01 01:30:00'
export PARITY_END='2026-09-05 07:00:00'
export PARITY_VERSION_ID=1
```

## 用法

```bash
node tools/parity-reconcile/run.mjs
```

- 退出码 0 = 两路逐条一致（signal_time + signal_kind 对齐，pivot_time 一致）
- 退出码 1 = mismatch（打印双方全字段明细）
- 回放触发：实时侧数据由 mock 实时回放（mock-realtime-mode 推进封存 bar）或
  真实盘面落盘产生；本脚本只做**只读对账**，不重放不重算（历史回测查看只读 DB 契约）。
