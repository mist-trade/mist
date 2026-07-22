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
- TDX/QMT default-builtin/explicit-off module matrix 与 env schema 定向测试：2 suites、14 tests 全部通过。
- `pnpm run ci:contracts`：通过，CI guard 已接受 `TDX_REALTIME_MODE=builtin`。
- `openspec validate align-realtime-native-ingress-contracts --strict`：通过。
- 本机 Node.js 为 22.12.0，低于仓库声明的 Node.js 24；上述命令均完成，但 CI/镜像仍须以 Node.js 24 复验。

### `mist-datasource`

- `UV_CACHE_DIR=/tmp/mist-uv-cache uv run pytest -m "not live" -q`：335 tests 全部通过，只有 Starlette/httpx deprecation warning。
- `UV_CACHE_DIR=.uv-cache uv run ruff check .`：通过。
- `UV_CACHE_DIR=.uv-cache uv run pyright`：0 errors、0 warnings。

### `mist-deploy`

- `scripts/test-realtime-contracts.ps1`：通过。
- `scripts/test-docker-compose-config.ps1`：通过。
- `scripts/test-deploy-windows-monitoring.ps1`：通过。
- `scripts/test-workflow-config.ps1`：通过。
- Windows CI 清单中的 14 个 deploy PowerShell test scripts 全部通过，覆盖 per-source `disable`、backup restore contract 和双源 monitoring mode 传递。
- 所有 PowerShell 验证均使用 `pwsh-preview`。

### `mist-monitoring`

- `go test ./...`：在允许 `httptest` 绑定 loopback 的环境中全部通过。
- `go vet ./...`：通过；TDX/QMT 任一 source 为 `off` 时 exporter 均跳过该 source realtime metrics。
- `go build ./windows/mist-windows-exporter ./mac/mist-watchdog`：通过。
- `python3 -m unittest tests.test_metrics_contract`：5 tests 全部通过。

### 工作树一致性

- `mist`、`mist-datasource`、`mist-deploy`、`mist-monitoring` 的 `git diff --check` 均通过。
- active runtime/config 已无 `builtin_experimental`、旧 experimental route 或 experimental env 名；历史 archive/evidence 不改写。

## 未关闭门禁

- 本机 Docker image build 两次停在拉取 `docker.io/library/node:24-alpine` metadata，均为 `DeadlineExceeded`；随后 GitHub Actions `29907214564` 使用 Node.js 24 完成 backend 验证、linux/amd64 image build 和 GHCR push，Docker image gate 已关闭。
- 尚未执行 Windows HIL：TDX `600030.SH`、QMT `300502.SZ` 的交易时段 freshness、owner generation、订阅恢复、终端/datasource restart 仍待验证。
- 尚未记录 HIL 前后 protected-table row count/digest，也未执行 whole-version/config rollback。
- 尚未发布到生产；TDX/QMT 代码和部署模板默认均为 `builtin`，生产主机 effective state 未在本 checkpoint 中改动。
- TDX 与 QMT terminal bridge 都要求操作员手动覆盖并重新加载；datasource/deploy/recovery 同步不会替代这个步骤。生产证据必须对两个 installed artifact 分别记录实际路径和 SHA-256。

## 发布前 CI

- Backend CI/image：`29907214564`，成功，SHA `4103a7b4699c30c13d91b859d9323585ceb90349`。
- Datasource CI：`29907204092`，成功，SHA `b091032b60f4dcff7c4589809c9cf886eeaf432d`。
- Monitoring CI：`29907210917`，成功，SHA `0d5eac27ce709c2107e173bde462a622175d458d`。
- Deploy CI 首次运行 `29907174630` 揭示 Windows CRLF 导致 fixture SHA 不稳定；加入 `eol=lf` guard 后，`29907312377` 成功，修复 SHA `1353608db5123a411cb60619c65d815322d3983f`。
