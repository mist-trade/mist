# 2026-07-22 本地验证 checkpoint

## 范围

- 分支：六仓库均为 `feat/theme-b-realtime-productization`。
- 本 checkpoint 只验证正式 realtime transport/ingress promotion；仍为 memory-only。
- 未新增或修改 migration，`deploy/database/migrations/006-*` 保持不变。
- 未连接 `MIST_TEST_MYSQL_URL`，未修改生产数据库、生产配置或 Windows 运行实例。
- golden fixture SHA-256：`5d070445835b159222e4df70beae133650457c9a21e6cfe3d9b971863490472a`。

## 已通过

### `mist`

- `pnpm test -- --watchman=false --runInBand`：61 suites、334 tests 全部通过。
- `pnpm run lint:check`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run build:docker`：Mist/Chan webpack build 通过。
- `openspec validate align-realtime-native-ingress-contracts --strict`：通过。
- 本机 Node.js 为 22.12.0，低于仓库声明的 Node.js 24；上述命令均完成，但 CI/镜像仍须以 Node.js 24 复验。

### `mist-datasource`

- `UV_CACHE_DIR=.uv-cache uv run pytest -q`：333 tests 全部通过，只有 Starlette/httpx deprecation warning。
- `UV_CACHE_DIR=.uv-cache uv run ruff check .`：通过。
- `UV_CACHE_DIR=.uv-cache uv run pyright`：0 errors、0 warnings。

### `mist-deploy`

- `scripts/test-realtime-contracts.ps1`：通过。
- `scripts/test-docker-compose-config.ps1`：通过。
- `scripts/test-deploy-windows-monitoring.ps1`：通过。
- `scripts/test-workflow-config.ps1`：通过。
- 所有 PowerShell 验证均使用 `pwsh-preview`。

### `mist-monitoring`

- `go test ./...`：在允许 `httptest` 绑定 loopback 的环境中全部通过。
- `go build ./windows/mist-windows-exporter ./mac/mist-watchdog`：通过。
- `python3 -m unittest tests.test_metrics_contract`：5 tests 全部通过。

### 工作树一致性

- `mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring` 的 `git diff --check` 均通过。
- active runtime/config 已无 `builtin_experimental`、旧 experimental route 或 experimental env 名；历史 archive/evidence 不改写。

## 未关闭门禁

- Docker image build 两次停在拉取 `docker.io/library/node:24-alpine` metadata，均为 `DeadlineExceeded`；本机没有该 base image cache。应用 webpack build 已通过，但 Docker image gate 仍未关闭。
- 尚未执行 Windows HIL：TDX `600030.SH`、QMT `300502.SZ` 的交易时段 freshness、owner generation、订阅恢复、终端/datasource restart 仍待验证。
- 尚未记录 HIL 前后 protected-table row count/digest，也未执行 whole-version/config rollback。
- 尚未发布到生产；QMT 代码和部署模板默认已是 `builtin`，生产主机 effective state 未在本 checkpoint 中改动。
