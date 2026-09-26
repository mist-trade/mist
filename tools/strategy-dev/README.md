# Strategy Dev Tooling & Unified Environment

本目录聚合了策略本地极速研发与前后端可视化闭环的核心工具：
- `provider.ts`：统一 K 线数据提供器（支持存量快照与动态缓存）
- `sync.ts`：通过 `ssh mist-box` 提取远端行情
- `runner.ts`：本地轻量策略 CLI 运行器（支持 `--watch`）
- `server.ts`：对接 `mist-fe` 的本地 Dev API 服务（端口 8001）
- `export-chan-bi-phases.cjs`：存量笔归约计算脚本
- `export-chan-channel-phases.cjs`：存量中枢归约计算脚本
