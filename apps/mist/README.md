# Mist Backend 应用

`apps/mist` 是 Mist 的主 NestJS API，负责证券配置、历史数据采集、技术指标、缠论
业务接口、策略定义/信号/告警和 datasource realtime client。

## 启动

```bash
pnpm install
pnpm run start:dev:mist
```

默认地址：

- API：`http://127.0.0.1:8001`
- 健康检查：`GET /app/hello`
- Swagger：`http://127.0.0.1:8001/api-docs`

生产环境通过 nginx 同源网关访问 `/api/mist/*`，frontend、skills 和 AstrBot 不应
直连 datasource。

## 主要接口

- `POST /v1/indicators/k`
- `POST /v1/indicators/macd`
- `POST /v1/indicators/rsi`
- `POST /v1/indicators/kdj`
- `POST /v1/chan/merge-k`
- `POST /v1/chan/bi`
- `POST /v1/chan/channel`
- `/v1/strategy-definitions`
- `/v1/strategy-signals`
- `/v1/strategy-alert-events`

接口细节以运行时 Swagger 和 contract tests 为准。

## Datasource

- TDX HTTP：`TDX_BASE_URL`
- QMT HTTP：`QMT_BASE_URL`
- TDX/QMT realtime：独立 WebSocket client 与独立 native frame contract

历史数据可持久化到 `k` 与 provider extension 表。当前 realtime transport 为
memory-only，不写数据库或生成通知。详细链路见
[`../../docs/backend-datasource-integration.md`](../../docs/backend-datasource-integration.md)。

## 数据库

TypeORM `synchronize` 在所有环境均关闭。使用：

```bash
pnpm run db:migrate
```

迁移文件位于 `deploy/database/migrations`。

## 验证

```bash
env TZ=UTC pnpm run test:ci
pnpm run lint
pnpm run typecheck
pnpm run ci:contracts
```

## 许可证

BSD-3-Clause
