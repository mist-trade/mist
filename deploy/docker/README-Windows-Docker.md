# Mist Windows Docker 生产部署

本文只描述当前生产拓扑。部署脚本和 workflow 的唯一所有者是
`mist-deploy`；本目录保存 backend 镜像内的迁移与 Compose 契约，不是另一套部署入口。

## 拓扑

```text
Windows Docker Desktop
  mysql
  mist-backend :8001
  chan-api :8008
  mist-fe
  web-gateway :80
  mist-migrate（一次性）

Windows Host / WinSW
  mist-tdx-datasource :9001
  mist-qmt-datasource :9002

Windows 用户会话
  TDX Desktop + builtin bridge
  QMT Desktop + builtin bridge
```

Datasource 不进入 Docker。Backend 容器使用：

```env
TDX_BASE_URL=http://host.docker.internal:9001
QMT_BASE_URL=http://host.docker.internal:9002
```

## Windows 目录

```text
E:\quant\MistDocker
  compose.yaml
  nginx\templates\default.conf.template
  .env
  .deploy-history
  mysql-data\
  backups\
  diagnostics\

F:\quant\MistAPI\datasource
  .env
  logs\
  services\mist-tdx-datasource\
  services\mist-qmt-datasource\
```

生产密码只保存在 `E:\quant\MistDocker\.env`。MySQL 使用 host bind
`MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`。

## 镜像与迁移

同一个 backend 镜像包含：

```text
dist/apps/mist/main.js
dist/apps/chan/main.js
deploy/database/migrations
tools/run-migrations.mjs
```

`mist-backend` 使用默认命令，`chan-api` 覆盖为
`node dist/apps/chan/main.js`。迁移由 `mist-migrate` 显式执行；所有环境都必须保持
TypeORM `synchronize: false`。

## 正式部署入口

使用 `mist-deploy` 的 GitHub Actions：

```text
Deploy Windows Mist Stack
```

Backend、frontend 和 previous tags 都使用精确 commit SHA。部署顺序为：拉取镜像、
启动 MySQL、生产备份、执行迁移、重建 backend/Chan/frontend、最后重建
`web-gateway` 并执行 host 与 container-to-host health。

不要使用 `latest`，不要在这里直接维护 Windows applied `compose.yaml`，也不要用
Docker 部署去重启 datasource 或桌面终端。

## 独立运维入口

| 目标 | Workflow |
|---|---|
| TDX datasource | `Manage Windows TDX Datasource` |
| QMT datasource | `Manage Windows QMT Datasource` |
| TDX desktop | `Recover Windows TDX Runtime` |
| QMT desktop | `Recover Windows QMT Runtime` |
| 数据库恢复演练 | `Test Windows MySQL Restore` |

完整步骤与当前已通过证据见
[`../../docs/production-baseline-verification.md`](../../docs/production-baseline-verification.md)。
