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
- release candidate 已部署到生产主机，但 TDX/QMT effective state 均保持显式 `off`；尚未完成 bridge 覆盖、baseline/HIL、rollback 或最终 `builtin` promotion。
- TDX 与 QMT terminal bridge 都要求操作员手动覆盖并重新加载；datasource/deploy/recovery 同步不会替代这个步骤。生产证据必须对两个 installed artifact 分别记录实际路径和 SHA-256。

## 发布前 CI

- Backend CI/image：`29907214564`，成功，SHA `4103a7b4699c30c13d91b859d9323585ceb90349`。
- Datasource CI：`29907204092`，成功，SHA `b091032b60f4dcff7c4589809c9cf886eeaf432d`。
- Monitoring CI：`29907210917`，成功，SHA `0d5eac27ce709c2107e173bde462a622175d458d`。
- Deploy CI 首次运行 `29907174630` 揭示 Windows CRLF 导致 fixture SHA 不稳定；加入 `eol=lf` guard 后，`29907312377` 成功，修复 SHA `1353608db5123a411cb60619c65d815322d3983f`。

## HIL 前 bridge runtime 修复

QMT 手工覆盖 `mist_qmt_realtime_bridge.py` 后，大 QMT 内置策略编辑器报告
`__file__ is not defined`。根因是 embedded strategy execution 不保证 Python file-backed
module 语义，而 bridge 在进入 `init()` 前直接读取 `__file__` 计算 SHA-256。本地普通 import
会自动定义 `__file__`，原 guardrail 未覆盖这一真实运行方式。

修复边界：

- QMT 无 `__file__` 时正常加载并执行 `init()`，运行时
  `bridgeArtifactSha256=unavailable`；Windows evidence 继续对 installed path 执行
  `Get-FileHash -Algorithm SHA256`，该外部结果才是发布 artifact digest。
- TDX 同步移除模块加载阶段未保护的 `__file__` 访问；其官方 `tq.initialize(...)` 仍要求
  从 `PYPlugins/user` 注册真实文件，pathless 运行方式会得到明确 fatal message 而不是
  `NameError`。
- QMT/TDX build identity 分别提升为 `mist-qmt-realtime-bridge-v1.1` 与
  `mist-tdx-bridge-v1.1`。
- 新增 no-`__file__` execution contract tests；QMT 测试会真实调用 `init()` 并验证
  `run_time` 注册成功。

修复后本地验证：

- `.venv/bin/pytest -m "not live" -q`：342 tests 通过，只有既有 Starlette/httpx
  deprecation warning。
- `.venv/bin/ruff check .`：通过。
- `.venv/bin/pyright --pythonpath .venv/bin/python`：0 errors、0 warnings。
- QMT bridge SHA-256：`bbfde4c69e312903205c3fabe5669514a98ec940fdfcddc30e6be3fc45d0cfe5`。
- TDX bridge SHA-256：`928717d79a713dfd2ca493ecc849e64f2d2d81db4f8ca70549bc9f7ad2713ca5`。

该修复尚未执行 Windows HIL、commit、push 或生产 bridge 覆盖，release gate 保持未关闭。

## 最新精确 SHA CI 与 image gate

bridge runtime 修复提交并推送后，重新执行 release candidate 精确 SHA CI：

- Backend CI/image：`29928049235`，成功，SHA
  `1fdc78a9fc2021656643b37c1d617bd388a4aaab`；Node.js 24 validation 与
  linux/amd64 GHCR image build/push 均通过。
- Datasource CI：`29928062323`，成功，SHA
  `fa6e95180c69dc6a95e8a816ed5ae34ed6b0c7fa`。
- Monitoring CI：`29928078470`，成功，SHA
  `9974cbfcfbe34127eadd89fb22493e748a5c1c75`。
- Deploy CI：`29924017134`，成功，SHA
  `7b896c973438bfd9a2bd935ce3f0a286166e8f51`。

`normalize-tdx-qmt-source-layouts` 的最新 bridge、layout、测试与 image gate 已闭合，
`align-realtime-native-ingress-contracts` task 5.0 完成。Windows HIL、protected-table
digest 与生产发布 tasks 仍保持未完成。

## 生产 release candidate 安装 checkpoint

在 `mist-deploy/master` fast-forward 到
`7b896c973438bfd9a2bd935ce3f0a286166e8f51` 后，按 per-source rollback 边界安装
release candidate；本阶段未启用 realtime，也不构成 freshness/HIL 验收。

- TDX disable：workflow `29929068171` 成功，backup ID
  `20260722T143257Z-0190edb1`。
- QMT disable：workflow `29929231175` 成功，backup ID
  `20260722T143459Z-c51d354b`。
- TDX datasource：workflow `29929386631` 成功，精确 SHA
  `fa6e95180c69dc6a95e8a816ed5ae34ed6b0c7fa`，`:9001/health` 返回 200，
  WinSW service 为 `Running`。
- QMT datasource：workflow `29929506672` 成功，同一精确 SHA，`:9002/health`
  与 `/qmt/bridge/health` 返回 200，WinSW service 为 `Running`。
- backend：workflow `29929641468` 成功，部署 image tag
  `1fdc78a9fc2021656643b37c1d617bd388a4aaab`；frontend 保持
  `90b77c5cbc6dbd016d93fce5d38469831b949209`。
- deployment 明确使用 `MIST_SKIP_MIGRATION=true`，未运行或修改 migration；部署前备份为
  `E:\quant\MistDocker\backups\mist-20260722-224339.sql`。
- backend、web gateway、TDX/QMT host-side 与 container-side health 全部通过。
- status workflow `29930099407` 确认 datasource/backend 的 TDX 与 QMT effective
  state 均为 `off`。

当前阻塞：

- TDX/QMT terminal bridge 必须由操作员分别手工覆盖为 `fa6e951` 中的 v1.1 artifact，
  并提供两个实际 installed Windows path，之后才能让 evidence collector 对 installed
  file 计算并核对 SHA-256。
- 当前生产 eligible securities 不包含 HIL 固定标的 `600030.SH`；包含
  `300502.SZ`。TDX `enable` 前必须先以既有 security 管理边界补齐 `600030.SH`，不得
  偷换为其他标的。
- 当前为北京时间非交易时段，不执行或宣称 TDX/QMT freshness 验收。
