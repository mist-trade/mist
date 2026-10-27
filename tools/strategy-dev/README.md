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

- **k_quality 质量口径**：默认**裸值透传**（与生产回测对账一致——生产 canonical
  回放不消费质量掩码）；`--mask-quality` 可选降级（OHLC 废 → 丢行、量/额废 →
  `null`，供非对账场景的因子调试）；
- **数据落点（2026-10-27 迁移）**：行情 JSON 与存量定义统一落私有仓
  `mist-alpha-private/market-data/{kline,strategy-definitions}/`（随私仓提交备份；
  可用 `MIST_PRIVATE_DATA_DIR` 覆盖）。provider 读取优先级：私仓 →
  `tools/strategy-dev/data/kline`（历史兼容）→ `.data/kline`（历史兼容）。
  `.gitignore` 已确保公仓永不携带数据文件（第 91/93 行）。
- **source 透传**：每行携带真实分段来源（vendor_a/qmt），回放时进入
  `StrategyBar.source`，与生产信号审计对齐；
- **紧凑 JSON**：单文件 >50,000 行自动改为无缩进序列化；
- **存量定义重放**：导出文件落盘 `mist-alpha-private/market-data/strategy-definitions/<id>_v<n>.json`（私仓提交），
  dev server 回测传 `strategyDefinitionId` 即经编译边界 verbatim 编译（与生产
  回测同一条编译路径）；内置预设树仅 1/2/3，其余 id 必须先导出。
