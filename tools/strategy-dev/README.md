# Strategy Dev Tooling & Unified Environment

本目录聚合了策略本地极速研发与前后端可视化闭环的核心工具：
- `provider.ts`：统一 K 线数据提供器（支持存量快照与动态缓存；多周期回测用 `exact: true` 禁用同 symbol 静默回退）
- `sync.ts`：通过 `ssh mist-box` 提取远端行情与存量策略定义
- `runner.ts`：本地轻量策略 CLI 运行器（支持 `--watch`）
- `server.ts`：对接 `mist-fe` 的本地 Dev API 服务（端口 8001）
- `export-chan-bi-phases.cjs`：存量笔归约计算脚本
- `export-chan-channel-phases.cjs`：存量中枢归约计算脚本

## 数据同步（sync.ts）

```bash
# 行情同步：canonical SplicePolicy 分段拼接（vendor_a/qmt），按年分片拉取
pnpm dev:sync --code 000001 --periods 1d,30m,5m

# 存量策略定义导出（本地重放；含私有插件参数，仅存 .data/，严禁提交/外传）
pnpm dev:sync --definition 23
```

- **k_quality 质量掩码**：任一 OHLC 掩码失效 → 整行丢弃；volume/amount 掩码失效
  → 字段落盘为 `null`（因子插件按 null 契约降级）；
- **source 透传**：每行携带真实分段来源（vendor_a/qmt），回放时进入
  `StrategyBar.source`，与生产信号审计对齐；
- **紧凑 JSON**：单文件 >50,000 行自动改为无缩进序列化；
- **存量定义重放**：导出文件落盘 `mist/.data/strategy-definitions/<id>_v<n>.json`，
  dev server 回测传 `strategyDefinitionId` 即经编译边界 verbatim 编译（与生产
  回测同一条编译路径）；内置预设树仅 1/2/3，其余 id 必须先导出。
