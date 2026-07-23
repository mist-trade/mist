# 2026-07-23 Realtime Contract 生产 HIL、回滚与 Promotion

## 验收边界

本轮只关闭 `align-realtime-native-ingress-contracts` 的 tasks 5.2、5.3、5.5、
5.6 和 5.7。未实现 Redis、K 线产品化、schedule、B2，未运行 migration，未修改
bridge 文件。TDX/QMT terminal bridge 继续由操作员手工维护。

最终被测组件身份：

| 组件 | SHA / build |
| --- | --- |
| backend | `82f0884828c66aca04d411540a3386fe2b8ed709` |
| datasource | `fa6e95180c69dc6a95e8a816ed5ae34ed6b0c7fa` |
| deploy evidence tool | `b507b6a1e4f7c7f9ba3f3bef9929e4d24b03453a` |
| monitoring | `9974cbfcfbe34127eadd89fb22493e748a5c1c75` |
| TDX bridge | `mist-tdx-bridge-v1.1` |
| QMT bridge | `mist-qmt-realtime-bridge-v1.1` |

backend 原 release candidate 在真实 TDX native object 上发现 `Now`、`Open` 等字段为
provider-native numeric string，而 backend 错误只接受 JSON number。旧已验收 artifact 同样
记录 `Now: "1294.59"`。修复后严格接受有限 numeric string，但不修改完整 native object；
Node.js 24 CI 与 image run `29972354843` 通过，生产部署全程使用
`skip_migration=true`。

## Baseline

- TDX baseline：run `29972772547`。
- QMT baseline：run `29972839039`。
- 两源 terminal 在线、bridge build 为 v1.1、allowlist/active subscription 为空。
- 六张 protected tables 与 2026-07-22 baseline 一致。

## TDX `600030.SH`

- enable：run `29972889420`，backup ID
  `20260723T015217Z-5440b79a`。
- enabled evidence：run `29972961075`。schema v1、完整
  `get_market_snapshot` native object、fresh snapshot、per-symbol sequence、owner、订阅和
  `mist_realtime_*` metrics 全部收敛；backend drop count 全为 0。
- terminal recovery：run `29973032489`。owner 从
  `tdx-bridge-pid-16564` 切换为 `tdx-bridge-pid-14748`，stream epoch 更新，
  revision 重新收敛，官方 `600030.SH` POST 成功。
- datasource/backend restart 与 `post_restart`：run `29973106203`。新 epoch
  `tdx-bridge-pid-14748-gen-1-1784771836182232100`、sequence `3`、
  `fresh=true`，artifact JSON SHA-256
  `a41376082bd914f0427526a68989e9201e1ef48d5893b07df51c514f1a2e990b`。

## QMT `300502.SZ`

- enable：run `29973168303`，backup ID
  `20260723T015842Z-c1b41a60`。
- enabled evidence：run `29973234957`。实际 `get_full_tick` 返回完整 native
  tick，`timetag=20260723 10:00:15`，sequence `80`、`fresh=true`，owner
  `bigqmt-31448`。`qmtEmbeddedPython.pythonVersion=null` 仅表示 spike metadata
  未记录版本字符串；本轮以 v1.1 bridge 实际执行、fresh tick、recovery 和仓库 Python 3.6
  compatibility guards 验收，不将该字段作为阻断项。
- terminal recovery：run `29973312644`。owner 从 `bigqmt-31448` 切换为
  `bigqmt-23032`，`300502.SZ` 订阅恢复，historical/bridge smoke 通过；旧 owner 不再作为
  active generation 生效。
- datasource/backend restart 与 `post_restart`：run `29973456498`。新 epoch
  `9e38fca7-d764-4bc9-a0a8-99b0c9352daa`、sequence `15`、`fresh=true`，
  artifact JSON SHA-256
  `e897bb7f20d1f79ff156d6ee1b5d5a053853e5c7945185fc4f2fd5d1e206a000`。

## Explicit-off 与旧版本兼容回滚

- TDX disable：run `29973607837`，backup ID
  `20260723T020831Z-b1212b58`。
- QMT disable：run `29973668451`，backup ID
  `20260723T021004Z-02e16c88`。
- effective state：run `29973733387` 确认 datasource/backend 两侧 TDX/QMT 均为
  `off`。
- TDX `post_rollback`：run `29974124951`，realtime datasource route 与 backend
  diagnostic 均为 404，基础 health 均为 200，该 source realtime metrics 不输出；artifact
  JSON SHA-256
  `b41c5b3689e060d720cc38ef13ba11bf9fdc559eaad883b4f0247d70dd69e84b`。
- QMT `post_rollback`：run `29974174087`，同样满足 fail-closed；artifact JSON
  SHA-256
  `69689ff04ce24848eed8ca23c3611c69f3ba4dac146ffce9bf77b1c271fb43bb`。
- 旧 backend image `401b507694958c00982c5e285ccdb1087bf4590d` compatibility
  rollback：run `29974220670`，明确 `skip_migration=true`。
- TDX off-mode historical bars/snapshot smoke：run `29974439550`，通过。
- QMT off-mode historical bars、health、`get_market_data_ex`、`get_full_tick` 和 sector
  command smoke：run `29974484297`，通过。
- 候选 backend 恢复：run `29974532612`，明确 `skip_migration=true`。

## 最终双源 Promotion

- TDX promotion mode switch：run `29974607939`。
- QMT promotion mode switch：run `29974670464`。
- TDX promotion evidence：run `29974786909`，owner
  `tdx-bridge-pid-14748`、sequence `25`、`fresh=true`，三个 source-labelled
  metrics 同时 ready；artifact JSON SHA-256
  `e2fc3a4307eb1f552d712400860555147a05ae7b03f8e5b0b50badb6507119bc`。
- QMT promotion evidence：run `29974839097`，owner `bigqmt-23032`、sequence
  `264`、`fresh=true`，三个 source-labelled metrics 同时 ready；artifact JSON
  SHA-256
  `c92bdb0b5fb28e278842cb6c06fef9e7bb9fda038235639a9d5f6a170949e424`。

最终生产 desired state：

```text
TDX_REALTIME_MODE=builtin
TDX_REALTIME_ALLOWLIST=600030.SH
QMT_REALTIME_MODE=builtin
QMT_REALTIME_ALLOWLIST=300502.SZ
```

## Protected tables

baseline、enabled、post_restart、explicit-off post_rollback 和最终 promotion 均为：

| table | row count | content digest |
| --- | ---: | --- |
| `k` | 4375 | `91ccfd3e1bda07fa1b4e64b146460366cbbe27d63f052e8522d459813189226b` |
| `k_extensions_ef` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `k_extensions_tdx` | 4371 | `eba21ccd9ed20eb5ca15b50376bc1f5c642b88cf70bac43eb043de117f746a2d` |
| `k_extensions_qmt` | 4 | `bf9ecbf751d3d1b5b06dc229bf64b4502138998aca693b181e020a653c756af3` |
| `strategy_signals` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `strategy_alert_events` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

因此本轮 realtime transport/ingress promotion 未写 K、signal、alert 或 notification，
未修改业务数据库。

## Residual work

Redis 当天 snapshot/K 线产品化、schedule 与 B2 继续属于后续 focused change，不在本轮
创建或实施。

## 最终验证与仓库状态

2026-07-23 最终关闭检查：

- `npx --yes @fission-ai/openspec@latest validate align-realtime-native-ingress-contracts --strict`：通过，输出 `Change 'align-realtime-native-ingress-contracts' is valid`；以 Node.js 24 执行。
- `mist-deploy/scripts/test-realtime-contracts.ps1`：通过。
- `mist-deploy/scripts/test-workflow-config.ps1`：通过。
- 六仓库 `git diff --check` 与 `git diff --cached --check`：通过。
- backend SHA `82f0884828c66aca04d411540a3386fe2b8ed709` 的 `Build Docker Images` run `29972354843`：通过。
- deploy SHA `b507b6a1e4f7c7f9ba3f3bef9929e4d24b03453a` 的 `Test Deploy Scripts` run `29974766508`：通过。

仓库审计结果：

| repository | branch / upstream | audit result |
| --- | --- | --- |
| `mist` | `feat/theme-b-realtime-productization` / `origin/feat/theme-b-realtime-productization` | 仅有本 evidence、roadmap baseline 和 task closure 待提交；产品代码已 clean |
| `mist-datasource` | `feat/theme-b-realtime-productization` / `origin/feat/theme-b-realtime-productization` | clean；HEAD `9d6b3cada1e3c4a28487652bc2e14b6985d53e4a`，生产 runtime SHA 为其前一代码 commit `fa6e95180c69dc6a95e8a816ed5ae34ed6b0c7fa`，两者之间仅 operator documentation |
| `mist-deploy` | `feat/theme-b-realtime-productization` / `origin/feat/theme-b-realtime-productization` | clean；HEAD `b507b6a1e4f7c7f9ba3f3bef9929e4d24b03453a` |
| `mist-fe` | `feat/design-system-phase0` / 无 upstream | 存在本轮开始前已有的 `pnpm-lock.yaml`、`pnpm-workspace.yaml` 用户改动；与 Theme B 无关，本轮未修改或覆盖 |
| `mist-monitoring` | `feat/theme-b-realtime-productization` / `origin/feat/theme-b-realtime-productization` | clean；HEAD `9974cbfcfbe34127eadd89fb22493e748a5c1c75` |
| `mist-skills` | `master` / `origin/master` | clean；HEAD `9458f26f67eb69fee6136db5b0f72a3b222462ec` |

因此 all-repository status audit 已完成；不能把 `mist-fe` 的既有用户改动虚报为 clean，
也不以清理无关工作树作为 realtime change 的关闭条件。
