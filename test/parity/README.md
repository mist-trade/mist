# test/parity — 双轨对账集成测试套件（Parity Integration Test Suite）

验证目标：在相同历史区间、相同策略定义/版本、相同标的及周期下，验证“实时链路”与“批量回测”在真实数据库持久化层面上输出的 `KernelSignal`（含双时间戳、方向、细分形态、置信度等）100% 逐条同构。

## 架构定界

- **第 1 层：CI 自动化刚性门禁**：
  位于 `libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`，由 CI 无外部依赖极速运行。
- **第 2 层：黑盒持久化与集成对账**：
  位于 `test/parity/run.mjs`，在本地集成环境（包含 MySQL、Redis、mist-backend、signal）下对真实落盘数据进行对账。

## 运行前置条件

1. 本地启动服务栈（MySQL + Redis + mist-backend + signal）。
2. 配置环境变量：

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

## 执行方式

```bash
pnpm test:parity
# 或
node test/parity/run.mjs
```

- 退出码 `0`：双轨完全一致（`signal_time`、`pivot_time`、`signal_kind`、`signal_type`、`confidence` 逐条对齐）。
- 退出码 `1`：检出 mismatch 并详细打印差异行字段。
