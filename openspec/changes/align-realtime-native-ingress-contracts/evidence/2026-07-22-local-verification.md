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
- TDX 与 QMT terminal bridge 都要求操作员手动覆盖并重新加载；datasource/deploy/recovery 同步不会替代这个步骤。installed path 与文件摘要由操作员自行维护，生产证据只核验可观察的 `bridgeBuildId`、owner/generation 与协议行为。

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
  `bridgeArtifactSha256=unavailable`；该 sentinel 只作诊断，不作为发布门禁。Windows
  evidence 不请求 operator-managed installed path，改为核验 `bridgeBuildId` 与协议行为。
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

- 操作员已确认 TDX/QMT terminal bridge 均手工覆盖为 `fa6e951` 中的 v1.1 artifact；
  installed path 不进入发布契约，待 source 启用后由 evidence collector 核验运行时
  `bridgeBuildId`。
- 当前生产 eligible securities 不包含 HIL 固定标的 `600030.SH`；包含
  `300502.SZ`。TDX `enable` 前必须先以既有 security 管理边界补齐 `600030.SH`，不得
  偷换为其他标的。
- 当前为北京时间非交易时段，不执行或宣称 TDX/QMT freshness 验收。

## Pre-HIL baseline 与非交易时段 recovery checkpoint

按操作员边界修正后，evidence workflow 不再请求、保存或核验 terminal bridge installed
path/file SHA；owner process command line 也从 evidence 中移除。自动化仅核验运行时
`bridgeBuildId`、owner/generation、协议行为与 protected-table 不变性：

- deploy 修正：`fb8587d7981541dcc19c4a9f6e8c77cf59bb8b59`，CI
  `29933175130` 成功并 fast-forward 到 `mist-deploy/master`。
- baseline mode switch：`29931642597` 成功，backup ID
  `20260722T150513Z-8605aac3`；TDX/QMT 均为 `builtin` 且 allowlist 为空。
- TDX terminal recovery：`29932230292` 成功；新 owner
  `tdx-bridge-pid-18732`、新 epoch 已建立，官方 `600030.SH` HTTP probe 成功。该结果只
  证明非交易时段 recovery，不作为 freshness。
- QMT terminal recovery：`29932519716` 成功；owner 从 `bigqmt-31884` 切换为
  `bigqmt-33568`，随后稳定 baseline 观察到 owner `bigqmt-13428`、generation 3；
  `300502.SZ` historical smoke 成功。该结果只证明 recovery/cache path，不作为
  freshness。
- 最终脱敏 TDX baseline：workflow `29933373890` 成功，runtime build
  `mist-tdx-bridge-v1.1`，owner ready，空订阅与 backend/monitoring 收敛。
- 最终脱敏 QMT baseline：workflow `29933655170` 成功，runtime build
  `mist-qmt-realtime-bridge-v1.1`，owner generation 3，空订阅与 backend/monitoring
  收敛。
- 两份 artifact 均不含 bridge script path、`PYPlugins` 或 owner command line。

两源 protected-table baseline 完全一致：

| table | row count | content digest |
|---|---:|---|
| `k` | 4375 | `91ccfd3e1bda07fa1b4e64b146460366cbbe27d63f052e8522d459813189226b` |
| `k_extensions_ef` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `k_extensions_tdx` | 4371 | `eba21ccd9ed20eb5ca15b50376bc1f5c642b88cf70bac43eb043de117f746a2d` |
| `k_extensions_qmt` | 4 | `bf9ecbf751d3d1b5b06dc229bf64b4502138998aca693b181e020a653c756af3` |
| `strategy_signals` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `strategy_alert_events` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

task 5.1 完成。task 5.4 仅完成双源 owner/cache recovery；由于 baseline allowlist 为空，
subscription restoration 尚未验收。TDX `600030.SH` 当前也尚未成为 enabled ACTIVE `tdx`
source mapping，因此不能执行该标的的 enable/freshness 阶段。

## QMT 非交易时段订阅恢复与精确回滚

在不接触 operator-managed bridge 文件的前提下，使用固定标的 `300502.SZ` 完成 QMT
订阅恢复检查；该时段不支持 freshness 验收，因此只记录 owner、订阅和恢复行为：

- QMT enable：workflow `29933918414` 成功，backup ID
  `20260722T153417Z-d367de2e`。
- QMT terminal recovery：workflow `29934109626` 成功；owner 从
  `bigqmt-13428` 切换为 `bigqmt-30936`，日志明确确认
  `QMT realtime subscriptions restored: 300502.SZ`，且
  `restoredSubscriptions=[300502.SZ]`。historical bars smoke 只作为 cache/control path
  证据，不作为实时新鲜度。
- 使用同一 backup ID 执行精确配置回滚：workflow `29934289846` 成功并输出
  `MIST_REALTIME_MODE_ROLLED_BACK=20260722T153417Z-d367de2e`。
- 回滚后只读 status：workflow `29934722347` 成功，datasource/backend 两侧 TDX 与 QMT
  均为 `builtin`。
- 回滚后 QMT baseline：workflow `29935020629` 成功；datasource
  `activeSubscriptions=[]`、backend `allowlist=[]`，owner ready，runtime build 为
  `mist-qmt-realtime-bridge-v1.1`，bridge 维护边界标记为 `operator-managed`。
- 回滚后六张 protected tables 的 row count 与 content digest 与 pre-HIL baseline
  完全一致，未观察到 K 线、signal 或 notification 副作用。

因此 QMT 的非交易时段 subscription restoration 与 per-source config rollback 已验收；
task 5.4 仍不勾选，因为 TDX `600030.SH` 的 enabled ACTIVE `tdx` source mapping 尚未补齐，
无法用规定标的完成同等订阅恢复检查。双源 trading-session freshness 也仍待支持时段执行。
