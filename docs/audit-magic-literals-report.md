# Mist 全仓硬编码数字与字符串（魔法值）审计盘点报告

> 生成时间：2026-10-17T14:23:53.789Z
> 扫描文件总数：455 个
> 检出硬编码总量：2085 处（数字 428 处，字符串 1657 处）

## 一、高频魔法数字汇总（Top 30）

| 排名 | 硬编码数值 | 出现频次 | 典型分布位置 | 建议归宿分类 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `3` | 38 次 | `apps/backtest/src/backtest-run.executor.ts:418`, `apps/backtest/src/suite/backtest-suite.executor.ts:89`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:640` | 领域常量 (*.constants.ts) |
| 2 | `5` | 22 次 | `apps/mist/src/collector/post-close-sync.service.ts:275`, `apps/mist/src/realtime/realtime-security-allowlist.service.ts:165`, `apps/schedule/src/data-collection.controller.ts:107` | 领域常量 (*.constants.ts) |
| 3 | `60` | 20 次 | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1101`, `apps/mist/src/sources/services/k-boundary-calculator.ts:54`, `apps/mist/src/sources/services/k-boundary-calculator.ts:165` | 领域常量 (*.constants.ts) |
| 4 | `8` | 18 次 | `apps/backtest/src/backtest-admission.service.ts:37`, `apps/backtest/src/backtest-startup.service.ts:49`, `apps/backtest/src/health/health-state.service.ts:11` | 领域常量 (*.constants.ts) |
| 5 | `1000` | 18 次 | `apps/backtest/src/health/health-state.service.ts:173`, `apps/mist/src/collector/observability/post-close-sync-metrics.ts:51`, `apps/mist/src/collector/observability/post-close-sync-metrics.ts:80` | 环境超时/系统参数 (.env / @app/config) |
| 6 | `10` | 18 次 | `apps/mist/src/app.module.ts:158`, `apps/mist/src/collector/helpers/data-freshness.validator.ts:133`, `apps/mist/src/collector/helpers/data-freshness.validator.ts:145` | 领域常量 (*.constants.ts) |
| 7 | `4` | 18 次 | `apps/mist/src/realtime/candle/candle-bucket.util.ts:107`, `apps/mist/src/sources/qmt/qmt-source.service.ts:378`, `apps/mist/src/sources/qmt/qmt-source.service.ts:383` | 领域常量 (*.constants.ts) |
| 8 | `500` | 17 次 | `apps/mist/src/realtime/realtime-redis.service.ts:91`, `apps/mist/src/strategy/services/backtest-run-command.service.ts:169`, `apps/mist/src/strategy/services/backtest-run-command.service.ts:324` | 领域常量 (*.constants.ts) |
| 9 | `5000` | 16 次 | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1027`, `apps/mist/src/realtime/realtime-redis.service.ts:87`, `apps/mist/src/realtime/realtime-redis.service.ts:91` | 环境超时/系统参数 (.env / @app/config) |
| 10 | `6` | 16 次 | `apps/mist/src/sources/qmt/qmt-source.service.ts:378`, `apps/mist/src/sources/qmt/qmt-source.service.ts:383`, `apps/mist/src/sources/services/k-boundary-calculator.ts:90` | 领域常量 (*.constants.ts) |
| 11 | `10000` | 15 次 | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:35`, `apps/mist/src/sources/tdx/tdx-source.service.ts:355`, `libs/decimal/src/decimal8.ts:163` | 环境超时/系统参数 (.env / @app/config) |
| 12 | `20` | 13 次 | `apps/mist/src/realtime-subscriptions/dto/realtime-subscription-query.dto.ts:19`, `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:89`, `apps/mist/src/sources/qmt/realtime/realtime.client.ts:403` | 领域常量 (*.constants.ts) |
| 13 | `50` | 10 次 | `apps/mist/src/strategy/dto/backtest-signal-result-query.dto.ts:10`, `apps/mist/src/strategy/dto/list-backtest-runs-query.dto.ts:27`, `apps/mist/src/strategy/services/backtest-run-query.service.ts:89` | 领域常量 (*.constants.ts) |
| 14 | `200` | 9 次 | `apps/mist/src/collector/post-close-sync.service.ts:131`, `apps/mist/src/collector/post-close-sync.service.ts:199`, `libs/transport/src/http/http-openapi.decorator.ts:37` | 领域常量 (*.constants.ts) |
| 15 | `12` | 8 次 | `apps/backtest/src/suite/backtest-suite.executor.ts:88`, `apps/mist/src/sources/qmt/qmt-source.service.ts:383`, `libs/strategy/src/wfa/wfa-window-slicer.ts:15` | 领域常量 (*.constants.ts) |
| 16 | `0.5` | 8 次 | `libs/indicators/src/classic/rpp.ts:57`, `libs/indicators/src/time-series/ts-rank.ts:36`, `libs/indicators/src/time-series/ts-rank.ts:99` | 算法比例系数 (*.constants.ts) |
| 17 | `30` | 7 次 | `apps/mist/src/sources/services/k-boundary-calculator.ts:168`, `apps/signal/src/signal-registry.service.ts:142`, `tools/strategy-dev/runner.ts:75` | 领域常量 (*.constants.ts) |
| 18 | `15` | 7 次 | `apps/mist/src/sources/services/k-boundary-calculator.ts:176`, `apps/signal/src/signal-registry.service.ts:141`, `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:281` | 领域常量 (*.constants.ts) |
| 19 | `60000` | 6 次 | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1105`, `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:180`, `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:285` | 环境超时/系统参数 (.env / @app/config) |
| 20 | `14` | 5 次 | `apps/mist/src/indicator/indicator.service.ts:79`, `apps/mist/src/sources/qmt/qmt-source.service.ts:383`, `libs/indicators/src/classic/atr.ts:27` | 领域常量 (*.constants.ts) |
| 21 | `3000` | 5 次 | `apps/mist/src/realtime/realtime-redis.service.ts:88`, `apps/notification/src/delivery/alert-delivery-queue.service.ts:39`, `apps/notification/src/oo-alert/oo-alert-queue.service.ts:32` | 环境超时/系统参数 (.env / @app/config) |
| 22 | `11` | 5 次 | `apps/mist/src/sources/services/k-boundary-calculator.ts:169`, `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:465`, `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:472` | 领域常量 (*.constants.ts) |
| 23 | `37` | 4 次 | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:465`, `libs/chancore/src/chan-full-output.characterization.fixture.ts:77`, `libs/decimal/src/decimal8.ts:19` | 领域常量 (*.constants.ts) |
| 24 | `100000` | 4 次 | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:472`, `libs/chancore/src/chan-full-output.characterization.fixture.ts:84`, `libs/strategy/src/wfa/walk-forward.orchestrator.ts:29` | 环境超时/系统参数 (.env / @app/config) |
| 25 | `0.95` | 4 次 | `libs/indicators/src/risk-performance/risk-performance.ts:452`, `libs/indicators/src/risk-performance/risk-performance.ts:454`, `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:121` | 算法比例系数 (*.constants.ts) |
| 26 | `1440` | 4 次 | `tools/strategy-dev/server.ts:343`, `tools/strategy-dev/server.ts:1026`, `tools/strategy-dev/server.ts:1091` | 环境超时/系统参数 (.env / @app/config) |
| 27 | `9` | 3 次 | `apps/mist/src/sources/services/k-boundary-calculator.ts:168`, `libs/chancore/src/internal/duan-channel.ts:148`, `libs/indicators/src/classic/kdj.ts:36` | 领域常量 (*.constants.ts) |
| 28 | `503` | 3 次 | `apps/mist/src/strategy/services/backtest-run-command.service.ts:185`, `apps/mist/src/strategy/services/backtest-run-command.service.ts:340`, `apps/mist/src/strategy/services/backtest-run-command.service.ts:396` | 领域常量 (*.constants.ts) |
| 29 | `-8640000000000000` | 3 次 | `libs/strategy/src/simulation/strategy-simulation.session.ts:60`, `tools/strategy-dev/runner.ts:171`, `tools/strategy-dev/server.ts:467` | 领域常量 (*.constants.ts) |
| 30 | `400` | 3 次 | `libs/transport/src/http/http-exception.filter.ts:38`, `libs/transport/src/http/http-exception.filter.ts:79`, `libs/transport/src/http/http-openapi.decorator.ts:79` | 领域常量 (*.constants.ts) |

## 二、高频魔法字符串汇总（Top 30）

| 排名 | 硬编码字符串 | 出现频次 | 语法语境类别 | 典型分布位置 | 建议归宿分类 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `volume` | 23 次 | function-argument | `apps/mist/src/sources/east-money/east-money-source.service.ts:121`, `apps/mist/src/sources/east-money/east-money-source.service.ts:196`, `apps/mist/src/sources/qmt/qmt-source.service.ts:215` | 契约字面量 (*.constants.ts) |
| 2 | `qmt` | 21 次 | comparison, function-argument, object-property | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:275`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:367`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:856` | 契约字面量 (*.constants.ts) |
| 3 | `tdx` | 18 次 | function-argument, comparison, object-property | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:855`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:870`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:886` | 契约字面量 (*.constants.ts) |
| 4 | `high` | 16 次 | function-argument | `libs/indicators/src/classic/adx.ts:38`, `libs/indicators/src/classic/adx.ts:43`, `libs/indicators/src/classic/adx.ts:47` | 契约字面量 (*.constants.ts) |
| 5 | `low` | 16 次 | function-argument | `libs/indicators/src/classic/adx.ts:39`, `libs/indicators/src/classic/adx.ts:44`, `libs/indicators/src/classic/adx.ts:47` | 契约字面量 (*.constants.ts) |
| 6 | `discarded` | 13 次 | object-property, function-argument, comparison | `apps/mist/src/realtime/candle/candle-finalizer.ts:271`, `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:890`, `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:893` | 契约字面量 (*.constants.ts) |
| 7 | `amount` | 13 次 | function-argument, comparison | `apps/mist/src/sources/east-money/east-money-source.service.ts:125`, `apps/mist/src/sources/east-money/east-money-source.service.ts:198`, `apps/mist/src/sources/qmt/qmt-source.service.ts:234` | 契约字面量 (*.constants.ts) |
| 8 | `unavailable` | 12 次 | comparison, object-property | `apps/backtest/src/health/health-state.service.ts:64`, `apps/mist/src/strategy/services/backtest-run-command.service.ts:365`, `apps/mist/src/strategy/services/backtest-run-command.service.ts:393` | 契约字面量 (*.constants.ts) |
| 9 | `completed` | 12 次 | object-property, function-argument | `apps/backtest/src/observability/metrics.ts:76`, `apps/signal/src/realtime/candle-finalized-job.processor.ts:147`, `apps/signal/src/realtime/candle-finalized-job.processor.ts:198` | 契约字面量 (*.constants.ts) |
| 10 | `failure` | 12 次 | object-property, comparison | `apps/backtest/src/observability/metrics.ts:100`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:745`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:748` | 契约字面量 (*.constants.ts) |
| 11 | `off` | 11 次 | comparison | `apps/mist/src/app.module.ts:93`, `apps/mist/src/app.module.ts:107`, `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:204` | 契约字面量 (*.constants.ts) |
| 12 | `sealed` | 10 次 | function-argument, object-property, comparison | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:883`, `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:884`, `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:960` | 契约字面量 (*.constants.ts) |
| 13 | `queue_full` | 9 次 | function-argument, object-property, comparison | `apps/backtest/src/backtest-admission.service.ts:125`, `apps/backtest/src/backtest-admission.service.ts:145`, `apps/backtest/src/backtest-startup.service.ts:79` | 契约字面量 (*.constants.ts) |
| 14 | `up` | 9 次 | comparison | `libs/indicators/src/fibonacci/fibonacci.ts:261`, `libs/indicators/src/fibonacci/fibonacci.ts:278`, `libs/indicators/src/fibonacci/fibonacci.ts:343` | 契约字面量 (*.constants.ts) |
| 15 | `0.1.0` | 8 次 | function-argument | `apps/backtest/src/observability/metrics.ts:16`, `apps/mist/src/realtime/observability/candle-metrics.ts:26`, `apps/mist/src/realtime/observability/startup-compensation-metrics.ts:18` | 协议键/事件名 (*.constants.ts) |
| 16 | `success` | 8 次 | object-property, comparison | `apps/backtest/src/observability/metrics.ts:98`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:695`, `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:755` | 契约字面量 (*.constants.ts) |
| 17 | `chan` | 8 次 | object-property, function-argument | `apps/chan/src/health/health.controller.ts:19`, `apps/chan/src/health/health.controller.ts:20`, `apps/mist/src/main.ts:47` | 契约字面量 (*.constants.ts) |
| 18 | `, ` | 8 次 | function-argument | `apps/mist/src/collector/collector.controller.ts:50`, `apps/mist/src/sources/k-save.helper.ts:47`, `apps/mist/src/sources/services/data-source.service.ts:68` | 契约字面量 (*.constants.ts) |
| 19 | `1m` | 8 次 | comparison, object-property | `apps/mist/src/collector/post-close-sync.service.ts:139`, `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:958`, `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:974` | 契约字面量 (*.constants.ts) |
| 20 | `text` | 8 次 | object-property | `apps/notification/src/channels/feishu.channel-adapter.ts:69`, `apps/notification/src/channels/qq.channel-adapter.ts:60`, `apps/notification/src/channels/wechat.channel-adapter.ts:54` | 契约字面量 (*.constants.ts) |
| 21 | `tr` | 8 次 | function-argument | `libs/indicators/src/classic/adx.ts:67`, `libs/indicators/src/classic/adx.ts:72`, `libs/indicators/src/classic/adx.ts:89` | 契约字面量 (*.constants.ts) |
| 22 | `TERMINAL` | 8 次 | switch-case, object-property | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:283`, `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:291`, `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:51` | 业务状态枚举 (Enums / *.constants.ts) |
| 23 | `BUY` | 8 次 | comparison, object-property | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:324`, `libs/strategy/src/decision-flow/decision-trace-builder.ts:63`, `libs/strategy/src/decision-flow/decision-trace-builder.ts:74` | 业务状态枚举 (Enums / *.constants.ts) |
| 24 | `run_failed` | 7 次 | function-argument, object-property, comparison | `apps/backtest/src/backtest-admission.service.ts:108`, `apps/backtest/src/backtest-admission.service.ts:112`, `apps/backtest/src/health/health-state.service.ts:58` | 契约字面量 (*.constants.ts) |
| 25 | `ok` | 7 次 | object-property, comparison | `apps/backtest/src/health/health-state.service.ts:105`, `apps/chan/src/health/health.controller.ts:18`, `apps/mist/src/health/health.controller.ts:43` | 契约字面量 (*.constants.ts) |
| 26 | `failed` | 7 次 | object-property, function-argument, comparison | `apps/backtest/src/observability/metrics.ts:77`, `apps/mist/src/collector/post-close-sync.service.ts:441`, `apps/notification/src/observability/oo-alert-metrics.ts:32` | 契约字面量 (*.constants.ts) |
| 27 | `reset` | 7 次 | function-argument, comparison | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:171`, `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:220`, `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:225` | 契约字面量 (*.constants.ts) |
| 28 | `not_ready` | 6 次 | function-argument, object-property, comparison | `apps/backtest/src/backtest-admission.service.ts:93`, `apps/backtest/src/backtest-admission.service.ts:97`, `apps/backtest/src/health/health-state.service.ts:57` | 契约字面量 (*.constants.ts) |
| 29 | `builtin` | 6 次 | comparison | `apps/mist/src/app.module.ts:90`, `apps/mist/src/app.module.ts:104`, `apps/mist/src/sources/qmt/realtime/realtime.client.ts:297` | 契约字面量 (*.constants.ts) |
| 30 | `QMT_BASE_URL` | 6 次 | function-argument | `apps/mist/src/collector/history-download.client.ts:47`, `apps/mist/src/sources/qmt/qmt-source.service.ts:73`, `apps/mist/src/sources/qmt/realtime/realtime.client.ts:88` | 业务状态枚举 (Enums / *.constants.ts) |

## 三、硬编码重灾区文件列表（Top 20）

| 排名 | 文件路径 | 硬编码总数 |
| :--- | :--- | :--- |
| 1 | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts` | 119 处 |
| 2 | `tools/strategy-dev/server.ts` | 90 处 |
| 3 | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts` | 69 处 |
| 4 | `apps/schedule/src/pre-market-inspection.service.ts` | 63 处 |
| 5 | `apps/mist/src/sources/tdx/realtime/realtime.client.ts` | 55 处 |
| 6 | `apps/mist/src/sources/qmt/realtime/realtime.client.ts` | 54 处 |
| 7 | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts` | 50 处 |
| 8 | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts` | 38 处 |
| 9 | `apps/mist/src/strategy/services/backtest-run-command.service.ts` | 35 处 |
| 10 | `apps/backtest/src/observability/metrics.ts` | 31 处 |
| 11 | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts` | 31 处 |
| 12 | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts` | 31 处 |
| 13 | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts` | 30 处 |
| 14 | `libs/indicators/src/fibonacci/fibonacci.ts` | 30 处 |
| 15 | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts` | 30 处 |
| 16 | `libs/chancore/src/internal/bi.ts` | 28 处 |
| 17 | `apps/mist/src/sources/qmt/qmt-source.service.ts` | 27 处 |
| 18 | `libs/indicators/src/classic/adx.ts` | 26 处 |
| 19 | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts` | 24 处 |
| 20 | `apps/mist/src/sources/services/k-boundary-calculator.ts` | 24 处 |

## 四、完整明细清单

<details>
<summary>展开查看全部 2085 处详细命中文档</summary>

| 类型 | 数值/字符串 | 文件位置 | 上下文代码片段 |
| :--- | :--- | :--- | :--- |
| string | `BACKTEST_CONCURRENCY` | `apps/backtest/src/backtest-admission.service.ts:36:43` | `config.get<number>('BACKTEST_CONCURRENCY')` |
| string | `BACKTEST_QUEUE_CAPACITY` | `apps/backtest/src/backtest-admission.service.ts:37:40` | `config.get<number>('BACKTEST_QUEUE_CAPACITY')` |
| number | `8` | `apps/backtest/src/backtest-admission.service.ts:37:70` | `config.get<number>('BACKTEST_QUEUE_CAPACITY') ?? 8` |
| string | `not_ready` | `apps/backtest/src/backtest-admission.service.ts:93:33` | `this.health.recordCommand('not_ready')` |
| string | `not_ready` | `apps/backtest/src/backtest-admission.service.ts:97:39` | `code: 'not_ready'` |
| string | `accepted` | `apps/backtest/src/backtest-admission.service.ts:100:33` | `this.health.recordCommand('accepted')` |
| string | `run_failed` | `apps/backtest/src/backtest-admission.service.ts:108:33` | `this.health.recordCommand('run_failed')` |
| string | `run_failed` | `apps/backtest/src/backtest-admission.service.ts:112:39` | `code: 'run_failed'` |
| string | `accepted` | `apps/backtest/src/backtest-admission.service.ts:115:33` | `this.health.recordCommand('accepted')` |
| string | `queue_full` | `apps/backtest/src/backtest-admission.service.ts:125:33` | `this.health.recordCommand('queue_full')` |
| string | `accepted` | `apps/backtest/src/backtest-admission.service.ts:131:31` | `this.health.recordCommand('accepted')` |
| string | `queue_full` | `apps/backtest/src/backtest-admission.service.ts:145:41` | `code: 'queue_full'` |
| string | `k` | `apps/backtest/src/backtest-market-data.adapter.ts:50:27` | `this.repository .createQueryBuilder('k')` |
| string | `k.securityId` | `apps/backtest/src/backtest-market-data.adapter.ts:62:18` | `this.repository .createQueryBuilder('k') .select([ 'k.source', 'k.period', 'k.timestamp', 'k.open', ` |
| string | `k.securityId = :securityId` | `apps/backtest/src/backtest-market-data.adapter.ts:63:14` | `this.repository .createQueryBuilder('k') .select([ 'k.source', 'k.period', 'k.timestamp', 'k.open', ` |
| string | `k.source = :source` | `apps/backtest/src/backtest-market-data.adapter.ts:66:17` | `this.repository .createQueryBuilder('k') .select([ 'k.source', 'k.period', 'k.timestamp', 'k.open', ` |
| string | `k.period = :period` | `apps/backtest/src/backtest-market-data.adapter.ts:67:17` | `this.repository .createQueryBuilder('k') .select([ 'k.source', 'k.period', 'k.timestamp', 'k.open', ` |
| string | `k.timestamp >= :startAt` | `apps/backtest/src/backtest-market-data.adapter.ts:68:17` | `this.repository .createQueryBuilder('k') .select([ 'k.source', 'k.period', 'k.timestamp', 'k.open', ` |
| string | `k.timestamp <= :endAt` | `apps/backtest/src/backtest-market-data.adapter.ts:69:17` | `this.repository .createQueryBuilder('k') .select([ 'k.source', 'k.period', 'k.timestamp', 'k.open', ` |
| string | `k.timestamp > :afterTimestamp` | `apps/backtest/src/backtest-market-data.adapter.ts:72:22` | `query.andWhere('k.timestamp > :afterTimestamp', { afterTimestamp: criteria.afterTimestamp, })` |
| string | `k.timestamp` | `apps/backtest/src/backtest-market-data.adapter.ts:77:19` | `query.orderBy('k.timestamp', 'ASC')` |
| string | `BACKTEST_DATABASE_ERROR` | `apps/backtest/src/backtest-run.executor.ts:120:35` | `this.health.recordRunFailed('BACKTEST_DATABASE_ERROR', 0)` |
| string | `BACKTEST_RUN_TIMEOUT_MS` | `apps/backtest/src/backtest-run.executor.ts:216:31` | `this.config.get<number>('BACKTEST_RUN_TIMEOUT_MS')` |
| number | `1800000` | `apps/backtest/src/backtest-run.executor.ts:216:61` | `this.config.get<number>('BACKTEST_RUN_TIMEOUT_MS') ?? 1_800_000` |
| string | `BACKTEST_MAX_BARS_PER_RUN` | `apps/backtest/src/backtest-run.executor.ts:218:31` | `this.config.get<number>('BACKTEST_MAX_BARS_PER_RUN')` |
| number | `10000000` | `apps/backtest/src/backtest-run.executor.ts:218:63` | `this.config.get<number>('BACKTEST_MAX_BARS_PER_RUN') ?? 10_000_000` |
| string | `SECURITY_NOT_FOUND` | `apps/backtest/src/backtest-run.executor.ts:244:49` | `code: 'SECURITY_NOT_FOUND'` |
| string | `SECURITY_NOT_FOUND` | `apps/backtest/src/backtest-run.executor.ts:245:39` | `this.health.recordTargetIssue('SECURITY_NOT_FOUND')` |
| string | `NO_HISTORICAL_BARS` | `apps/backtest/src/backtest-run.executor.ts:290:49` | `code: 'NO_HISTORICAL_BARS'` |
| string | `NO_HISTORICAL_BARS` | `apps/backtest/src/backtest-run.executor.ts:291:39` | `this.health.recordTargetIssue('NO_HISTORICAL_BARS')` |
| number | `-0.08` | `apps/backtest/src/backtest-run.executor.ts:417:26` | `hardStopLossRatio: -0.08` |
| number | `3` | `apps/backtest/src/backtest-run.executor.ts:418:28` | `defaultCooldownBars: 3` |
| number | `0.995` | `apps/backtest/src/backtest-run.executor.ts:419:28` | `cashAllocationRatio: 0.995` |
| string | `BACKTEST_INTERRUPTED` | `apps/backtest/src/backtest-startup.service.ts:39:27` | `errorMessage: 'BACKTEST_INTERRUPTED'` |
| string | `BACKTEST_CONCURRENCY` | `apps/backtest/src/backtest-startup.service.ts:48:49` | `this.config.get<number>('BACKTEST_CONCURRENCY')` |
| string | `BACKTEST_QUEUE_CAPACITY` | `apps/backtest/src/backtest-startup.service.ts:49:46` | `this.config.get<number>('BACKTEST_QUEUE_CAPACITY')` |
| number | `8` | `apps/backtest/src/backtest-startup.service.ts:49:76` | `this.config.get<number>('BACKTEST_QUEUE_CAPACITY') ?? 8` |
| string | `BACKTEST_STARTUP_QUEUE_FULL` | `apps/backtest/src/backtest-startup.service.ts:68:23` | `errorMessage: 'BACKTEST_STARTUP_QUEUE_FULL'` |
| string | `status = :pendingStatus` | `apps/backtest/src/backtest-startup.service.ts:70:14` | `this.runs .createQueryBuilder() .update(BacktestRun) .set({ status: BacktestRunStatus.FAILED, comple` |
| string | `created_at <= :cutoff` | `apps/backtest/src/backtest-startup.service.ts:73:17` | `this.runs .createQueryBuilder() .update(BacktestRun) .set({ status: BacktestRunStatus.FAILED, comple` |
| string | `id NOT IN (:...admittedIds)` | `apps/backtest/src/backtest-startup.service.ts:75:25` | `overflow.andWhere('id NOT IN (:...admittedIds)', { admittedIds })` |
| string | `queue_full` | `apps/backtest/src/backtest-startup.service.ts:79:40` | `this.health.recordStartupFailure('queue_full', overflowResult.affected)` |
| number | `8` | `apps/backtest/src/health/health-state.service.ts:11:27` | `private queueCapacity = 8;` |
| string | `accepted` | `apps/backtest/src/health/health-state.service.ts:55:21` | `outcome === 'accepted'` |
| string | `queue_full` | `apps/backtest/src/health/health-state.service.ts:56:21` | `outcome === 'queue_full'` |
| string | `not_ready` | `apps/backtest/src/health/health-state.service.ts:57:21` | `outcome === 'not_ready'` |
| string | `run_failed` | `apps/backtest/src/health/health-state.service.ts:58:21` | `outcome === 'run_failed'` |
| string | `queue_full` | `apps/backtest/src/health/health-state.service.ts:63:18` | `kind === 'queue_full'` |
| string | `unavailable` | `apps/backtest/src/health/health-state.service.ts:64:18` | `kind === 'unavailable'` |
| string | `ok` | `apps/backtest/src/health/health-state.service.ts:105:15` | `status: 'ok'` |
| string | `backtest` | `apps/backtest/src/health/health-state.service.ts:106:16` | `service: 'backtest'` |
| string | `backtest` | `apps/backtest/src/health/health-state.service.ts:107:17` | `instance: 'backtest'` |
| string | `ready` | `apps/backtest/src/health/health-state.service.ts:110:31` | `this.state === 'ready'` |
| number | `1000` | `apps/backtest/src/health/health-state.service.ts:173:20` | `durationMs / 1_000` |
| string | `0.0.0.0` | `apps/backtest/src/main.ts:23:15` | `host: '0.0.0.0'` |
| string | `BACKTEST_RPC_PORT` | `apps/backtest/src/main.ts:24:34` | `config.get<number>('BACKTEST_RPC_PORT')` |
| number | `8005` | `apps/backtest/src/main.ts:24:58` | `config.get<number>('BACKTEST_RPC_PORT') ?? 8005` |
| string | `PORT` | `apps/backtest/src/main.ts:30:39` | `config.get<number>('PORT')` |
| number | `8004` | `apps/backtest/src/main.ts:30:50` | `config.get<number>('PORT') ?? 8004` |
| string | `backtest_metrics` | `apps/backtest/src/observability/metrics.ts:15:38` | `createIdempotentMetricRegistration('backtest_metrics', () => { const meter = metrics.getMeter('backt` |
| string | `backtest` | `apps/backtest/src/observability/metrics.ts:16:36` | `metrics.getMeter('backtest', '0.1.0')` |
| string | `0.1.0` | `apps/backtest/src/observability/metrics.ts:16:48` | `metrics.getMeter('backtest', '0.1.0')` |
| string | `mist_backtest_ready` | `apps/backtest/src/observability/metrics.ts:19:30` | `meter .createObservableGauge('mist_backtest_ready', { description: 'Backtest admission window open (` |
| string | `Backtest admission window open (1) or closed (0)` | `apps/backtest/src/observability/metrics.ts:20:22` | `description: 'Backtest admission window open (1) or closed (0)'` |
| string | `mist_backtest_active_runs` | `apps/backtest/src/observability/metrics.ts:27:30` | `meter .createObservableGauge('mist_backtest_active_runs', { description: 'Currently executing backte` |
| string | `Currently executing backtest runs` | `apps/backtest/src/observability/metrics.ts:28:22` | `description: 'Currently executing backtest runs'` |
| string | `mist_backtest_waiting_runs` | `apps/backtest/src/observability/metrics.ts:35:30` | `meter .createObservableGauge('mist_backtest_waiting_runs', { description: 'Backtest runs waiting in ` |
| string | `Backtest runs waiting in the admission queue` | `apps/backtest/src/observability/metrics.ts:36:22` | `description: 'Backtest runs waiting in the admission queue'` |
| string | `mist_backtest_capacity_total` | `apps/backtest/src/observability/metrics.ts:43:30` | `meter .createObservableGauge('mist_backtest_capacity_total', { description: 'Configured backtest que` |
| string | `Configured backtest queue capacity` | `apps/backtest/src/observability/metrics.ts:44:22` | `description: 'Configured backtest queue capacity'` |
| string | `mist_backtest_command_total` | `apps/backtest/src/observability/metrics.ts:51:30` | `meter .createObservableGauge('mist_backtest_command_total', { description: 'Backtest submit commands` |
| string | `Backtest submit commands by outcome` | `apps/backtest/src/observability/metrics.ts:52:22` | `description: 'Backtest submit commands by outcome'` |
| string | `accepted` | `apps/backtest/src/observability/metrics.ts:57:20` | `outcome: 'accepted'` |
| string | `queue_full` | `apps/backtest/src/observability/metrics.ts:60:20` | `outcome: 'queue_full'` |
| string | `not_ready` | `apps/backtest/src/observability/metrics.ts:63:20` | `outcome: 'not_ready'` |
| string | `run_failed` | `apps/backtest/src/observability/metrics.ts:66:20` | `outcome: 'run_failed'` |
| string | `mist_backtest_run_total` | `apps/backtest/src/observability/metrics.ts:71:30` | `meter .createObservableGauge('mist_backtest_run_total', { description: 'Backtest runs by terminal st` |
| string | `Backtest runs by terminal status` | `apps/backtest/src/observability/metrics.ts:72:22` | `description: 'Backtest runs by terminal status'` |
| string | `completed` | `apps/backtest/src/observability/metrics.ts:76:66` | `status: 'completed'` |
| string | `failed` | `apps/backtest/src/observability/metrics.ts:77:63` | `status: 'failed'` |
| string | `mist_backtest_duration_seconds` | `apps/backtest/src/observability/metrics.ts:81:30` | `meter .createObservableGauge('mist_backtest_duration_seconds', { description: 'Last backtest run dur` |
| string | `Last backtest run duration in seconds` | `apps/backtest/src/observability/metrics.ts:82:22` | `description: 'Last backtest run duration in seconds'` |
| string | `mist_backtest_persistence_total` | `apps/backtest/src/observability/metrics.ts:93:30` | `meter .createObservableGauge('mist_backtest_persistence_total', { description: 'Backtest result batc` |
| string | `Backtest result batches by persistence outcome` | `apps/backtest/src/observability/metrics.ts:94:22` | `description: 'Backtest result batches by persistence outcome'` |
| string | `success` | `apps/backtest/src/observability/metrics.ts:98:66` | `outcome: 'success'` |
| string | `failure` | `apps/backtest/src/observability/metrics.ts:100:20` | `outcome: 'failure'` |
| string | `mist_backtest_failure_total` | `apps/backtest/src/observability/metrics.ts:105:30` | `meter .createObservableGauge('mist_backtest_failure_total', { description: 'Backtest run failures by` |
| string | `Backtest run failures by reason class` | `apps/backtest/src/observability/metrics.ts:106:22` | `description: 'Backtest run failures by reason class'` |
| string | `mist_backtest_target_issue_total` | `apps/backtest/src/observability/metrics.ts:117:30` | `meter .createObservableGauge('mist_backtest_target_issue_total', { description: 'Backtest target iss` |
| string | `Backtest target issues by code` | `apps/backtest/src/observability/metrics.ts:118:22` | `description: 'Backtest target issues by code'` |
| string | `WFA` | `apps/backtest/src/suite/backtest-suite.executor.ts:51:31` | `run.scenarioId === 'WFA'` |
| string | `STRESS_SUITE` | `apps/backtest/src/suite/backtest-suite.executor.ts:51:59` | `run.scenarioId === 'STRESS_SUITE'` |
| string | `WFA` | `apps/backtest/src/suite/backtest-suite.executor.ts:61:34` | `masterRun.scenarioId === 'WFA'` |
| string | `STRESS_SUITE` | `apps/backtest/src/suite/backtest-suite.executor.ts:63:41` | `masterRun.scenarioId === 'STRESS_SUITE'` |
| string | `anchored` | `apps/backtest/src/suite/backtest-suite.executor.ts:87:35` | `wfaContext.windowType === 'anchored'` |
| number | `12` | `apps/backtest/src/suite/backtest-suite.executor.ts:88:69` | `wfaContext.trainDurationMonths ?? 12` |
| number | `3` | `apps/backtest/src/suite/backtest-suite.executor.ts:89:67` | `wfaContext.testDurationMonths ?? 3` |
| string | `TRAIN` | `apps/backtest/src/suite/backtest-suite.executor.ts:128:22` | `stage: 'TRAIN'` |
| string | `TEST` | `apps/backtest/src/suite/backtest-suite.executor.ts:152:22` | `stage: 'TEST'` |
| string | `STRESS` | `apps/backtest/src/suite/backtest-suite.executor.ts:283:22` | `stage: 'STRESS'` |
| string | `ok` | `apps/chan/src/health/health.controller.ts:18:15` | `status: 'ok'` |
| string | `chan` | `apps/chan/src/health/health.controller.ts:19:16` | `service: 'chan'` |
| string | `chan` | `apps/chan/src/health/health.controller.ts:20:17` | `instance: 'chan'` |
| string | `50mb` | `apps/chan/src/main.ts:13:36` | `limit: '50mb'` |
| string | `50mb` | `apps/chan/src/main.ts:14:42` | `limit: '50mb'` |
| number | `8008` | `apps/chan/src/main.ts:16:40` | `process.env.PORT ?? 8008` |
| string | `builtin` | `apps/mist/src/app.module.ts:90:22` | `normalized === 'builtin'` |
| string | `off` | `apps/mist/src/app.module.ts:93:22` | `normalized === 'off'` |
| string | `builtin` | `apps/mist/src/app.module.ts:104:22` | `normalized === 'builtin'` |
| string | `off` | `apps/mist/src/app.module.ts:107:22` | `normalized === 'off'` |
| string | `mysql` | `apps/mist/src/app.module.ts:133:21` | `type: 'mysql'` |
| string | `mysql_server_host` | `apps/mist/src/app.module.ts:134:39` | `configService.get('mysql_server_host')` |
| string | `mysql_server_port` | `apps/mist/src/app.module.ts:135:39` | `configService.get('mysql_server_port')` |
| string | `mysql_server_username` | `apps/mist/src/app.module.ts:136:43` | `configService.get('mysql_server_username')` |
| string | `mysql_server_password` | `apps/mist/src/app.module.ts:137:43` | `configService.get('mysql_server_password')` |
| string | `mysql_server_database` | `apps/mist/src/app.module.ts:138:43` | `configService.get('mysql_server_database')` |
| string | `+08:00` | `apps/mist/src/app.module.ts:139:25` | `timezone: '+08:00'` |
| string | `NODE_ENV` | `apps/mist/src/app.module.ts:141:42` | `configService.get('NODE_ENV')` |
| number | `10` | `apps/mist/src/app.module.ts:158:25` | `poolSize: 10` |
| string | `mysql2` | `apps/mist/src/app.module.ts:159:33` | `connectorPackage: 'mysql2'` |
| string | `sha256_password` | `apps/mist/src/app.module.ts:161:30` | `authPlugins: 'sha256_password'` |
| string | `, ` | `apps/mist/src/collector/collector.controller.ts:50:17` | `enabledSources .map((c) => c.source) .join(', ')` |
| number | `10` | `apps/mist/src/collector/helpers/data-freshness.validator.ts:133:40` | `String(bar.date).slice(0, 10)` |
| number | `10` | `apps/mist/src/collector/helpers/data-freshness.validator.ts:145:40` | `String(bar.time).slice(0, 10)` |
| string | `QMT_BASE_URL` | `apps/mist/src/collector/history-download.client.ts:47:33` | `configService.get<string>('QMT_BASE_URL')` |
| string | `TDX_BASE_URL` | `apps/mist/src/collector/history-download.client.ts:49:33` | `configService.get<string>('TDX_BASE_URL')` |
| number | `15000` | `apps/mist/src/collector/history-download.client.ts:53:18` | `timeout: 15000` |
| number | `15000` | `apps/mist/src/collector/history-download.client.ts:57:18` | `timeout: 15000` |
| string | `in_progress` | `apps/mist/src/collector/history-download.client.ts:113:32` | `status.aggregate !== 'in_progress'` |
| number | `8000` | `apps/mist/src/collector/history-download.client.ts:116:58` | `setTimeout(resolve, 8000)` |
| string | `mist-collector` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:13:36` | `metrics.getMeter('mist-collector', '1.0.0')` |
| string | `1.0.0` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:13:54` | `metrics.getMeter('mist-collector', '1.0.0')` |
| string | `mist_post_close_sync_tasks_total` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:16:7` | `meter.createCounter( 'mist_post_close_sync_tasks_total', { description: 'Total number of post-close ` |
| string | `Total number of post-close sync tasks partitioned by status, source and period` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:19:11` | `description: 'Total number of post-close sync tasks partitioned by status, source and period'` |
| string | `mist_post_close_sync_klines_saved_total` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:24:7` | `meter.createCounter( 'mist_post_close_sync_klines_saved_total', { description: 'Total number of K-li` |
| string | `Total number of K-lines saved by post-close sync` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:26:22` | `description: 'Total number of K-lines saved by post-close sync'` |
| string | `mist_post_close_sync_duration_seconds` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:31:7` | `meter.createHistogram( 'mist_post_close_sync_duration_seconds', { description: 'Duration of post-clo` |
| string | `Duration of post-close sync execution in seconds` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:33:22` | `description: 'Duration of post-close sync execution in seconds'` |
| string | `s` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:34:15` | `unit: 's'` |
| string | `mist_post_close_sync_last_success_age_seconds` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:39:30` | `meter .createObservableGauge('mist_post_close_sync_last_success_age_seconds', { description: 'Second` |
| string | `Seconds elapsed since last successful post-close synchronization run` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:41:11` | `description: 'Seconds elapsed since last successful post-close synchronization run'` |
| number | `1000` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:51:50` | `(now - lastSuccessTime) / 1000` |
| number | `1000` | `apps/mist/src/collector/observability/post-close-sync-metrics.ts:80:49` | `durationMs / 1000` |
| number | `200` | `apps/mist/src/collector/post-close-sync.service.ts:131:40` | `message.slice(0, 200)` |
| string | `1m` | `apps/mist/src/collector/post-close-sync.service.ts:139:24` | `base === '1m'` |
| string | `5m` | `apps/mist/src/collector/post-close-sync.service.ts:141:28` | `base === '5m'` |
| number | `200` | `apps/mist/src/collector/post-close-sync.service.ts:199:42` | `message.slice(0, 200)` |
| string | `all_done` | `apps/mist/src/collector/post-close-sync.service.ts:227:23` | `outcome === 'all_done'` |
| number | `5` | `apps/mist/src/collector/post-close-sync.service.ts:275:71` | `criteria.concurrencyLimit ?? 5` |
| string | `fulfilled` | `apps/mist/src/collector/post-close-sync.service.ts:297:28` | `res.status === 'fulfilled'` |
| string | `UNKNOWN` | `apps/mist/src/collector/post-close-sync.service.ts:301:27` | `securityCode: 'UNKNOWN'` |
| string | `suspended` | `apps/mist/src/collector/post-close-sync.service.ts:393:39` | `this.syncMetrics.recordTask('suspended', source, period)` |
| string | `not_ready` | `apps/mist/src/collector/post-close-sync.service.ts:412:37` | `this.syncMetrics.recordTask('not_ready', source, period)` |
| string | `succeeded` | `apps/mist/src/collector/post-close-sync.service.ts:428:35` | `this.syncMetrics.recordTask('succeeded', source, period)` |
| string | `failed` | `apps/mist/src/collector/post-close-sync.service.ts:441:35` | `this.syncMetrics.recordTask('failed', source, period)` |
| string | `fulfilled` | `apps/mist/src/collector/strategies/east-money-collection.strategy.ts:119:58` | `r.status === 'fulfilled'` |
| string | `rejected` | `apps/mist/src/collector/strategies/east-money-collection.strategy.ts:120:55` | `r.status === 'rejected'` |
| string | `fulfilled` | `apps/mist/src/collector/strategies/qmt-collection.strategy.ts:105:58` | `r.status === 'fulfilled'` |
| string | `rejected` | `apps/mist/src/collector/strategies/qmt-collection.strategy.ts:106:55` | `r.status === 'rejected'` |
| string | `fulfilled` | `apps/mist/src/collector/strategies/tdx-collection.strategy.ts:119:58` | `r.status === 'fulfilled'` |
| string | `rejected` | `apps/mist/src/collector/strategies/tdx-collection.strategy.ts:120:55` | `r.status === 'rejected'` |
| string | `REALTIME_PRODUCTIZATION_MODE` | `apps/mist/src/health/health.controller.ts:31:31` | `this.config.get<string>('REALTIME_PRODUCTIZATION_MODE')` |
| string | `on` | `apps/mist/src/health/health.controller.ts:32:34` | `rawProd === 'on'` |
| string | `shadow` | `apps/mist/src/health/health.controller.ts:32:54` | `rawProd === 'shadow'` |
| string | `REALTIME_STRATEGY_MODE` | `apps/mist/src/health/health.controller.ts:34:46` | `this.config.get<string>('REALTIME_STRATEGY_MODE')` |
| string | `on` | `apps/mist/src/health/health.controller.ts:36:20` | `rawStrat === 'on'` |
| string | `shadow` | `apps/mist/src/health/health.controller.ts:36:41` | `rawStrat === 'shadow'` |
| string | `ok` | `apps/mist/src/health/health.controller.ts:43:15` | `status: 'ok'` |
| string | `mist-backend` | `apps/mist/src/health/health.controller.ts:44:16` | `service: 'mist-backend'` |
| string | `backend` | `apps/mist/src/health/health.controller.ts:45:17` | `instance: 'backend'` |
| number | `14` | `apps/mist/src/indicator/indicator.service.ts:79:22` | `period: number = 14` |
| string | `REALTIME_PRODUCTIZATION_MODE` | `apps/mist/src/main.ts:12:40` | `app.get(ConfigService).get<string>('REALTIME_PRODUCTIZATION_MODE')` |
| string | `Mist API` | `apps/mist/src/main.ts:18:15` | `new DocumentBuilder() .setTitle('Mist API')` |
| string | `Stock market analysis and alert system - Technical indicators and Chan Theory analysis

## Multi-Data Source Support

This API supports multiple data sources for K-line data:

- **ef** - East Money (default)
- **tdx** - TongDaXin
- **qmt** - 大 QMT

Most endpoints accept an optional `source` parameter to specify which data source to use.
If not provided, the default source for the application will be used.

## API Endpoints

- **Health**: `GET /app/hello` - Health check
- **Indicators**: `POST /v1/indicators/*` - Technical indicators and K-line data (MACD, RSI, KDJ, K-line)
- **Chan Theory**: `POST /v1/chan/*` - Chan Theory analysis (Merge K, Bi, Fenxing, Channel)
- **Security**: `GET\|POST\|PUT\|DELETE /v1/securities*` and `/v1/security-sources` - Security management

## Unified Response Format

All HTTP endpoints return responses in a unified format with `success`, `statusCode`, `message`, `data`, `timestamp`, and `requestId` fields.` | `apps/mist/src/main.ts:20:7` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `2.0` | `apps/mist/src/main.ts:44:17` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `health` | `apps/mist/src/main.ts:45:13` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `Health check endpoints` | `apps/mist/src/main.ts:45:23` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `indicator` | `apps/mist/src/main.ts:46:13` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `Technical Indicators - MACD, RSI, KDJ, K-line data` | `apps/mist/src/main.ts:46:26` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `chan` | `apps/mist/src/main.ts:47:13` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `Chan Theory Analysis - Merge K, Bi, Fenxing, Channel` | `apps/mist/src/main.ts:47:21` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `security v1` | `apps/mist/src/main.ts:48:13` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `Security management endpoints (v1)` | `apps/mist/src/main.ts:48:28` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `realtime subscriptions v1` | `apps/mist/src/main.ts:50:7` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `Immutable realtime routing assignments and convergence inventory` | `apps/mist/src/main.ts:51:7` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `http://localhost:8001` | `apps/mist/src/main.ts:53:16` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `Local development` | `apps/mist/src/main.ts:53:41` | `new DocumentBuilder() .setTitle('Mist API') .setDescription( `Stock market analysis and alert system` |
| string | `api-docs` | `apps/mist/src/main.ts:57:23` | `SwaggerModule.setup('api-docs', app, document)` |
| number | `8001` | `apps/mist/src/main.ts:59:40` | `process.env.PORT ?? 8001` |
| number | `4` | `apps/mist/src/realtime/candle/candle-bucket.util.ts:107:45` | `zoned.getFullYear().toString().padStart(4, '0')` |
| string | `valid` | `apps/mist/src/realtime/candle/candle-finalizer.ts:110:31` | `candle.validity === 'valid'` |
| string | `sealed candle record` | `apps/mist/src/realtime/candle/candle-finalizer.ts:117:11` | `assertRealtimeRedisBytes( 'sealed candle record', compactRecord, REALTIME_REDIS_RECORD_LIMITS.sealed` |
| string | `candle manifest record` | `apps/mist/src/realtime/candle/candle-finalizer.ts:127:9` | `assertRealtimeRedisBytes( 'candle manifest record', JSON.stringify(manifest), REALTIME_REDIS_RECORD_` |
| number | `1000` | `apps/mist/src/realtime/candle/candle-finalizer.ts:140:28` | `nowMs / 1_000` |
| string | `valid` | `apps/mist/src/realtime/candle/candle-finalizer.ts:150:29` | `candle.validity === 'valid'` |
| string | `valid` | `apps/mist/src/realtime/candle/candle-finalizer.ts:157:36` | `candle.validity === 'valid'` |
| string | `closingCumulativeVolume` | `apps/mist/src/realtime/candle/candle-finalizer.ts:167:23` | `multi.hdel(wmK, 'closingCumulativeVolume')` |
| string | `closingCumulativeAmount` | `apps/mist/src/realtime/candle/candle-finalizer.ts:170:23` | `multi.hdel(wmK, 'closingCumulativeAmount')` |
| string | `valid` | `apps/mist/src/realtime/candle/candle-finalizer.ts:196:31` | `candle.validity === 'valid'` |
| string | `candle manifest record` | `apps/mist/src/realtime/candle/candle-finalizer.ts:251:9` | `assertRealtimeRedisBytes( 'candle manifest record', JSON.stringify(manifest), REALTIME_REDIS_RECORD_` |
| number | `1000` | `apps/mist/src/realtime/candle/candle-finalizer.ts:263:28` | `nowMs / 1_000` |
| string | `discarded` | `apps/mist/src/realtime/candle/candle-finalizer.ts:271:16` | `outcome: 'discarded'` |
| string | `provisional` | `apps/mist/src/realtime/candle/candle-finalizer.ts:335:10` | `q: 'provisional'` |
| string | `no_event_time` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:111:61` | `this.recordSkip(snapshot.source, snapshot.securityId, 'no_event_time')` |
| string | `no_event_time` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:112:53` | `reason: 'no_event_time'` |
| string | `out_of_session` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:117:61` | `this.recordSkip(snapshot.source, snapshot.securityId, 'out_of_session')` |
| string | `out_of_session` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:118:53` | `reason: 'out_of_session'` |
| string | `late_after_grace` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:125:53` | `reason: 'late_after_grace'` |
| string | `not_aggregation_eligible` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:161:11` | `this.recordSkip( snapshot.source, snapshot.securityId, 'not_aggregation_eligible', )` |
| string | `not_aggregation_eligible` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:165:19` | `reason: 'not_aggregation_eligible'` |
| string | `duplicate_or_late` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:185:53` | `reason: 'duplicate_or_late'` |
| string | `candidate_capacity_exceeded` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:191:17` | `reason: 'candidate_capacity_exceeded'` |
| string | `not_aggregation_eligible` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:198:17` | `reason: 'not_aggregation_eligible'` |
| string | `late_after_grace` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:434:53` | `reason: 'late_after_grace'` |
| string | `duplicate_or_late` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:439:53` | `reason: 'duplicate_or_late'` |
| string | `invalid_price` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:449:17` | `reason: 'invalid_price'` |
| string | `counter_reset` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:487:17` | `reason: 'counter_reset'` |
| string | `current` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:531:33` | `position: 'current'` |
| string | `prior` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:534:33` | `position: 'prior'` |
| string | `provisional` | `apps/mist/src/realtime/candle/open-candle-aggregator.ts:664:14` | `quality: 'provisional'` |
| string | `off` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:204:40` | `this.mode === 'off'` |
| string | `off` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:207:25` | `this.mode === 'off'` |
| string | `ingest_gated` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:210:39` | `trace.getActiveSpan()?.addEvent('ingest_gated', { reason })` |
| string | `ingestGated` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:211:43` | `trace.getActiveSpan()?.setAttribute('ingestGated', reason)` |
| string | `queue_overflow` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:226:39` | `trace.getActiveSpan()?.addEvent('queue_overflow', { securityId: snapshot.securityId, })` |
| string | `skippedReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:229:43` | `trace.getActiveSpan()?.setAttribute('skippedReason', 'queue_overflow')` |
| string | `queue_overflow` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:229:60` | `trace.getActiveSpan()?.setAttribute('skippedReason', 'queue_overflow')` |
| string | `queue_overflow` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:239:9` | `this.aggregator.markInvalid( snapshot.securityId, snapshot.source, 'queue_overflow', bucket?.bucketS` |
| string | `redis_client_unavailable` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:253:39` | `trace.getActiveSpan()?.addEvent('redis_client_unavailable', { securityId: snapshot.securityId, })` |
| string | `skippedReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:258:24` | `trace .getActiveSpan() ?.setAttribute('skippedReason', 'redis_client_unavailable')` |
| string | `redis_client_unavailable` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:258:41` | `trace .getActiveSpan() ?.setAttribute('skippedReason', 'redis_client_unavailable')` |
| string | `startup_boundary_skip` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:273:39` | `trace.getActiveSpan()?.addEvent('startup_boundary_skip', { securityId: snapshot.securityId, bucketSt` |
| string | `skippedReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:279:24` | `trace .getActiveSpan() ?.setAttribute('skippedReason', 'startup_boundary_skip')` |
| string | `startup_boundary_skip` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:279:41` | `trace .getActiveSpan() ?.setAttribute('skippedReason', 'startup_boundary_skip')` |
| string | `bucketStartMs` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:282:24` | `trace .getActiveSpan() ?.setAttribute('bucketStartMs', snapshotBucket.bucketStartMs)` |
| string | `quantity_missing_frame` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:296:39` | `trace.getActiveSpan()?.addEvent('quantity_missing_frame', { securityId: snapshot.securityId, source:` |
| string | `skipped` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:318:12` | `case 'skipped': if (outcome.reason === 'late_after_grace') { this.recordCount( this.lateAfterGraceCo` |
| string | `late_after_grace` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:319:32` | `outcome.reason === 'late_after_grace'` |
| string | `skippedReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:325:36` | `activeSpan?.setAttribute('skippedReason', 'late_after_grace')` |
| string | `late_after_grace` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:325:53` | `activeSpan?.setAttribute('skippedReason', 'late_after_grace')` |
| string | `bucketStartMs` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:328:15` | `activeSpan?.setAttribute( 'bucketStartMs', snapshotBucket.bucketStartMs, )` |
| string | `candidate_capacity_exceeded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:332:39` | `outcome.reason === 'candidate_capacity_exceeded'` |
| string | `skippedReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:339:13` | `activeSpan?.setAttribute( 'skippedReason', 'candidate_capacity_exceeded', )` |
| string | `candidate_capacity_exceeded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:340:13` | `activeSpan?.setAttribute( 'skippedReason', 'candidate_capacity_exceeded', )` |
| string | `bucketStartMs` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:344:15` | `activeSpan?.setAttribute( 'bucketStartMs', snapshotBucket.bucketStartMs, )` |
| string | `skipped` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:351:32` | `activeSpan?.addEvent('skipped', { reason: outcome.reason })` |
| string | `skippedReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:352:36` | `activeSpan?.setAttribute('skippedReason', outcome.reason)` |
| string | `bucketStartMs` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:355:15` | `activeSpan?.setAttribute( 'bucketStartMs', snapshotBucket.bucketStartMs, )` |
| string | `out_of_session` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:359:34` | `outcome.reason === 'out_of_session'` |
| string | `opened` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:371:12` | `case 'opened': await this.registerDueIfFirst( client, outcome.bucket, { securityId: snapshot.securit` |
| string | `updated` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:385:12` | `case 'updated': // Normally this is a local no-op. If the first registration failed, // the next acc` |
| string | `rolled-over` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:402:12` | `case 'rolled-over': await this.registerDueIfFirst( client, outcome.opened, { securityId: snapshot.se` |
| string | `invalidated` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:416:12` | `case 'invalidated': // A first snapshot can open an already-invalid candidate (for example, // a cou` |
| string | `due_registration_too_late` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:471:39` | `trace.getActiveSpan()?.addEvent('due_registration_too_late', { securityId: identity.securityId, buck` |
| string | `candle manifest record` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:508:9` | `assertRealtimeRedisBytes( 'candle manifest record', JSON.stringify(manifest), REALTIME_REDIS_RECORD_` |
| number | `1000` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:516:35` | `acceptedAt / 1_000` |
| string | `due_registration_failed` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:529:39` | `trace.getActiveSpan()?.addEvent('due_registration_failed', { securityId: identity.securityId, bucket` |
| string | `redis_due_registration_failed` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:544:11` | `this.aggregator.markInvalid( identity.securityId, identity.source, 'redis_due_registration_failed', ` |
| string | `ready` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:561:44` | `client.status !== 'ready'` |
| string | `LIMIT` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:578:9` | `client.zrangebyscore( dueKey(tradingDay), 0, now, 'LIMIT', 0, REALTIME_REDIS_RANGE_BATCH_SIZE, )` |
| string | `malformed_due_member` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:596:41` | `trace.getActiveSpan()?.addEvent('malformed_due_member', { member, })` |
| string | `due_admission_overflow` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:616:41` | `trace.getActiveSpan()?.addEvent('due_admission_overflow', { securityId: decoded.securityId, })` |
| string | `+inf` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:704:9` | `client.zrangebyscore( dueKey(tradingDay), 0, '+inf', 'LIMIT', 0, REALTIME_REDIS_RANGE_BATCH_SIZE, )` |
| string | `LIMIT` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:705:9` | `client.zrangebyscore( dueKey(tradingDay), 0, '+inf', 'LIMIT', 0, REALTIME_REDIS_RANGE_BATCH_SIZE, )` |
| string | `candle manifest record` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:719:11` | `assertRealtimeRedisBytes( 'candle manifest record', JSON.stringify(manifest), REALTIME_REDIS_RECORD_` |
| string | `candle.due.finalize` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:835:26` | `withCandleSpan('candle.due.finalize', async (span) => { span.setAttribute('source', decoded.source);` |
| string | `source` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:836:25` | `span.setAttribute('source', decoded.source)` |
| string | `securityId` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:837:25` | `span.setAttribute('securityId', decoded.securityId)` |
| string | `bucketStartMs` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:838:25` | `span.setAttribute('bucketStartMs', decoded.bucketStartMs)` |
| string | `already_sealed` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:840:23` | `span.addEvent('already_sealed')` |
| string | `finalization_horizon_exceeded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:859:23` | `span.addEvent('finalization_horizon_exceeded')` |
| string | `hard_horizon` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:860:63` | `message: 'hard_horizon'` |
| string | `valid` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:882:35` | `sealed.validity === 'valid'` |
| string | `sealed` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:883:27` | `span.addEvent('sealed')` |
| string | `verdict` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:884:31` | `span.setAttribute('verdict', 'sealed')` |
| string | `sealed` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:884:42` | `span.setAttribute('verdict', 'sealed')` |
| string | `discarded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:890:27` | `span.addEvent('discarded', { reason: sealed.invalidReason ?? 'invalid', })` |
| string | `verdict` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:893:31` | `span.setAttribute('verdict', 'discarded')` |
| string | `discarded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:893:42` | `span.setAttribute('verdict', 'discarded')` |
| string | `discardReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:895:15` | `span.setAttribute( 'discardReason', sealed.invalidReason ?? 'invalid', )` |
| string | `valid` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:907:33` | `sealed.validity === 'valid'` |
| string | `discarded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:922:21` | `span.addEvent('discarded', { reason })` |
| string | `verdict` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:923:25` | `span.setAttribute('verdict', 'discarded')` |
| string | `discarded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:923:36` | `span.setAttribute('verdict', 'discarded')` |
| string | `discardReason` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:924:25` | `span.setAttribute('discardReason', reason)` |
| string | `1m` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:958:15` | `period: '1m'` |
| string | `sealed` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:960:16` | `outcome: 'sealed'` |
| string | `1m` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:974:15` | `period: '1m'` |
| string | `discarded` | `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts:976:16` | `outcome: 'discarded'` |
| string | `harness.initialize` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:212:18` | `operation: 'harness.initialize'` |
| string | `HIL_INITIALIZATION_FAILED` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:214:15` | `reason: 'HIL_INITIALIZATION_FAILED'` |
| string | `syncSubscriptions.cleanup` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:219:39` | `recordOperation(operations, 'syncSubscriptions.cleanup', () => client.syncSubscriptions([]), )` |
| string | `getSubscriptions.afterCleanup` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:222:39` | `recordOperation(operations, 'getSubscriptions.afterCleanup', () => client.getSubscriptions(), )` |
| string | `test/fixtures/realtime/realtime-native-frame-v2.json` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:229:5` | `resolve( process.cwd(), 'test/fixtures/realtime/realtime-native-frame-v2.json', )` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:275:16` | `source === 'qmt'` |
| string | `mysql` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:289:19` | `type: 'mysql'` |
| string | `mysql_server_host` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:290:30` | `config.get('mysql_server_host')` |
| string | `mysql_server_port` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:291:30` | `config.get('mysql_server_port')` |
| string | `mysql_server_username` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:292:34` | `config.get('mysql_server_username')` |
| string | `mysql_server_password` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:293:34` | `config.get('mysql_server_password')` |
| string | `mysql_server_database` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:294:34` | `config.get('mysql_server_database')` |
| string | `+08:00` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:295:23` | `timezone: '+08:00'` |
| string | `mysql2` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:299:31` | `connectorPackage: 'mysql2'` |
| string | `mysql` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:322:19` | `type: 'mysql'` |
| string | `mysql_server_host` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:323:30` | `config.get('mysql_server_host')` |
| string | `mysql_server_port` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:324:30` | `config.get('mysql_server_port')` |
| string | `mysql_server_username` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:325:34` | `config.get('mysql_server_username')` |
| string | `mysql_server_password` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:326:34` | `config.get('mysql_server_password')` |
| string | `mysql_server_database` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:327:34` | `config.get('mysql_server_database')` |
| string | `+08:00` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:328:23` | `timezone: '+08:00'` |
| string | `mysql2` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:332:31` | `connectorPackage: 'mysql2'` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:367:18` | `source === 'qmt'` |
| string | `getSubscriptions.before` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:411:37` | `recordOperation(operations, 'getSubscriptions.before', () => client.getSubscriptions(), )` |
| string | `syncSubscriptions.target` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:417:5` | `recordOperation( operations, 'syncSubscriptions.target', () => client.syncSubscriptions([symbol]), )` |
| string | `captureRawFixture.whole` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:421:37` | `recordCapture(operations, 'captureRawFixture.whole', syncResult, () => capture('whole', symbol, sync` |
| string | `whole` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:422:15` | `capture('whole', symbol, syncStartedAt)` |
| string | `getSubscriptions.afterSync` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:425:37` | `recordOperation(operations, 'getSubscriptions.afterSync', () => client.getSubscriptions(), )` |
| string | `subscribe.overlay` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:431:5` | `recordOperation( operations, 'subscribe.overlay', () => client.subscribe(overlaySymbol), )` |
| string | `captureRawFixture.overlay` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:437:7` | `recordCapture( operations, 'captureRawFixture.overlay', subscribeResult, () => capture('overlay', ov` |
| string | `overlay` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:439:21` | `capture('overlay', overlaySymbol, subscribeStartedAt)` |
| string | `getSubscriptions.afterSubscribe` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:442:37` | `recordOperation(operations, 'getSubscriptions.afterSubscribe', () => client.getSubscriptions(), )` |
| string | `subscribe.overlay` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:447:5` | `successfulInteger( operations, 'subscribe.overlay', )` |
| string | `unsubscribe.overlay` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:449:37` | `recordOperation(operations, 'unsubscribe.overlay', () => client.unsubscribe(overlaySymbol), )` |
| string | `getSubscriptions.afterUnsubscribe` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:465:39` | `recordOperation(operations, 'getSubscriptions.afterUnsubscribe', () => client.getSubscriptions(), )` |
| string | `observeCallbackCessation.overlay` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:475:20` | `operation: 'observeCallbackCessation.overlay'` |
| string | `subscribe.overlayReplacement` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:487:9` | `recordOperation( operations, 'subscribe.overlayReplacement', () => client.subscribe(overlaySymbol), ` |
| string | `captureRawFixture.replacement` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:493:11` | `recordCapture( operations, 'captureRawFixture.replacement', replacementResult, () => capture('replac` |
| string | `replacement` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:495:25` | `capture('replacement', overlaySymbol, replacementStartedAt)` |
| string | `getSubscriptions.afterReplacementSubscribe` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:500:9` | `recordOperation( operations, 'getSubscriptions.afterReplacementSubscribe', () => client.getSubscript` |
| string | `subscribe.overlayReplacement` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:505:9` | `successfulInteger( operations, 'subscribe.overlayReplacement', )` |
| string | `getSubscriptions.afterReplacementSubscribe` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:511:11` | `successfulValue( operations, 'getSubscriptions.afterReplacementSubscribe', )` |
| string | `platform_unavailable` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:528:47` | `runtimeActiveSubscriptionObservation: 'platform_unavailable'` |
| string | `classifyQmtQuotaAndIdReuse` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:532:20` | `operation: 'classifyQmtQuotaAndIdReuse'` |
| string | `unsubscribe.overlayReplacement` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:543:41` | `recordOperation(operations, 'unsubscribe.overlayReplacement', () => client.unsubscribe(overlaySymbol` |
| string | `getSubscriptions.afterReplacementCleanup` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:548:9` | `recordOperation( operations, 'getSubscriptions.afterReplacementCleanup', () => client.getSubscriptio` |
| string | `whole` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:595:32` | `phase === 'whole'` |
| string | `sha256` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:609:24` | `createHash('sha256')` |
| string | `getSubscriptions.afterSync` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:633:49` | `successfulValue(operations, 'getSubscriptions.afterSync')` |
| string | `getSubscriptions.afterSubscribe` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:636:5` | `successfulValue( operations, 'getSubscriptions.afterSubscribe', )` |
| number | `3` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:640:16` | `[1, 2, 3]` |
| string | `getSubscriptions.afterUnsubscribe` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:646:37` | `successfulValue(operations, 'getSubscriptions.afterUnsubscribe')` |
| string | `getSubscriptions.afterReplacementCleanup` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:649:5` | `successfulValue( operations, 'getSubscriptions.afterReplacementCleanup', )` |
| string | `validateSubscriptions.exactState` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:665:20` | `operation: 'validateSubscriptions.exactState'` |
| string | `validateSubscriptions.exactState` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:670:20` | `operation: 'validateSubscriptions.exactState'` |
| string | `HIL_SUBSCRIPTION_STATE_INVALID` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:672:17` | `reason: 'HIL_SUBSCRIPTION_STATE_INVALID'` |
| string | `success` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:695:31` | `evidence?.result === 'success'` |
| string | `failure` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:745:31` | `prerequisite.result === 'failure'` |
| string | `failure` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:748:15` | `result: 'failure'` |
| string | `HIL_RAW_CAPTURE_PREREQUISITE_FAILED` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:749:15` | `reason: 'HIL_RAW_CAPTURE_PREREQUISITE_FAILED'` |
| string | `success` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:755:42` | `result: 'success'` |
| string | `none` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:755:61` | `reason: 'none'` |
| string | `failure` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:759:15` | `result: 'failure'` |
| string | `HIL_RAW_CAPTURE_FAILED` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:760:15` | `reason: 'HIL_RAW_CAPTURE_FAILED'` |
| string | `failure` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:799:15` | `result: 'failure'` |
| string | `HIL_OPERATION_THROWN` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:800:15` | `reason: 'HIL_OPERATION_THROWN'` |
| string | `success` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:814:15` | `result: 'success'` |
| string | `none` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:815:15` | `reason: 'none'` |
| string | `failure` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:821:13` | `result: 'failure'` |
| string | `sha256` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:830:21` | `createHash('sha256')` |
| string | `tdx` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:855:31` | `resolveClient('tdx', context)` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:856:31` | `resolveClient('qmt', context)` |
| number | `30000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:858:33` | `waitUntilReady(tdx.ready, 30_000)` |
| number | `30000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:859:33` | `waitUntilReady(qmt.ready, 30_000)` |
| string | `tdx.syncSubscriptions.soakTarget` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:862:39` | `recordOperation(operations, 'tdx.syncSubscriptions.soakTarget', () => tdx.client.syncSubscriptions([` |
| string | `qmt.syncSubscriptions.soakTarget` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:865:39` | `recordOperation(operations, 'qmt.syncSubscriptions.soakTarget', () => qmt.client.syncSubscriptions([` |
| string | `tdx` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:870:7` | `waitForFreshCanonicalSnapshot( tdx, 'tdx', tdxSymbol, setupStartedAt, 90_000, )` |
| number | `90000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:873:7` | `waitForFreshCanonicalSnapshot( tdx, 'tdx', tdxSymbol, setupStartedAt, 90_000, )` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:877:7` | `waitForFreshCanonicalSnapshot( qmt, 'qmt', qmtSymbol, setupStartedAt, 90_000, )` |
| number | `90000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:880:7` | `waitForFreshCanonicalSnapshot( qmt, 'qmt', qmtSymbol, setupStartedAt, 90_000, )` |
| string | `tdx` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:886:55` | `requireCurrentSnapshot(tdx, 'tdx', tdxSymbol)` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:887:55` | `requireCurrentSnapshot(qmt, 'qmt', qmtSymbol)` |
| number | `-5000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:893:28` | `tdxSnapshotAgeMs < -5_000` |
| number | `-5000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:895:28` | `qmtSnapshotAgeMs < -5_000` |
| string | `tdx` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:906:68` | `readBridgeHealth(tdxBridgeHealthUrl, 'tdx')` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:907:68` | `readBridgeHealth(qmtBridgeHealthUrl, 'qmt')` |
| string | `tdx` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:942:31` | `resolveClient('tdx', context)` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:943:31` | `resolveClient('qmt', context)` |
| string | `tdx.syncSubscriptions.cleanup` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:944:39` | `recordOperation(operations, 'tdx.syncSubscriptions.cleanup', () => tdx.client.syncSubscriptions([]),` |
| string | `qmt.syncSubscriptions.cleanup` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:947:39` | `recordOperation(operations, 'qmt.syncSubscriptions.cleanup', () => qmt.client.syncSubscriptions([]),` |
| string | `dual-source-soak` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:953:14` | `profile: 'dual-source-soak'` |
| string | `trading-session` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:954:19` | `sessionClass: 'trading-session'` |
| number | `5000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1027:33` | `AbortSignal.timeout(5_000)` |
| string | `subscription-journal.jsonl` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1079:18` | `name === 'subscription-journal.jsonl'` |
| string | `manifest` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1080:23` | `name.includes('manifest')` |
| string | `compaction-checkpoint` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1081:23` | `name.includes('compaction-checkpoint')` |
| string | `sealed-range-checkpoint` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1082:23` | `name.includes('sealed-range-checkpoint')` |
| string | `sha256` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1085:29` | `createHash('sha256')` |
| string | ` ` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1090:19` | `digest.update('\0')` |
| string | ` ` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1092:19` | `digest.update('\0')` |
| string | `dual-source-soak` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1098:40` | `process.env.MIST_HIL_PROFILE === 'dual-source-soak'` |
| string | `MIST_HIL_SOAK_DURATION_MS` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1100:7` | `positiveIntegerEnvironment( 'MIST_HIL_SOAK_DURATION_MS', 35 * 60 * 1000, )` |
| number | `35` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1101:7` | `35 * 60` |
| number | `60` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1101:12` | `35 * 60` |
| number | `1000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1101:17` | `35 * 60 * 1000` |
| string | `MIST_HIL_SOAK_INTERVAL_MS` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1104:7` | `positiveIntegerEnvironment( 'MIST_HIL_SOAK_INTERVAL_MS', 60_000, )` |
| number | `60000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1105:7` | `positiveIntegerEnvironment( 'MIST_HIL_SOAK_INTERVAL_MS', 60_000, )` |
| string | `MIST_HIL_SOAK_MAX_SNAPSHOT_AGE_MS` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1108:7` | `positiveIntegerEnvironment( 'MIST_HIL_SOAK_MAX_SNAPSHOT_AGE_MS', 180_000, )` |
| number | `180000` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1109:7` | `positiveIntegerEnvironment( 'MIST_HIL_SOAK_MAX_SNAPSHOT_AGE_MS', 180_000, )` |
| string | `MIST_HIL_TDX_SYMBOL` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1112:37` | `requireEnvironment('MIST_HIL_TDX_SYMBOL')` |
| string | `MIST_HIL_QMT_SYMBOL` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1113:37` | `requireEnvironment('MIST_HIL_QMT_SYMBOL')` |
| string | `failure` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1127:61` | `operation.result === 'failure'` |
| string | `tdx` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1139:17` | `source !== 'tdx'` |
| string | `qmt` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1139:37` | `source !== 'qmt'` |
| string | `capture` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1142:15` | `mode !== 'capture'` |
| string | `verify` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1142:37` | `mode !== 'verify'` |
| string | `verify` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1143:15` | `mode === 'verify'` |
| string | `verify` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1171:30` | `mode === 'verify'` |
| string | `failure` | `apps/mist/src/realtime/hil/realtime-subscription-hil.ts:1177:68` | `operation.result === 'failure'` |
| string | `mist-backend` | `apps/mist/src/realtime/observability/candle-metrics.ts:26:34` | `metrics.getMeter('mist-backend', '0.1.0')` |
| string | `0.1.0` | `apps/mist/src/realtime/observability/candle-metrics.ts:26:50` | `metrics.getMeter('mist-backend', '0.1.0')` |
| string | `mist_candle_sealed_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:29:28` | `meter .createObservableGauge('mist_candle_sealed_total', { description: 'Sealed realtime candles (pr` |
| string | `Sealed realtime candles (process-local)` | `apps/mist/src/realtime/observability/candle-metrics.ts:30:20` | `description: 'Sealed realtime candles (process-local)'` |
| string | `mist_candle_discard_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:37:28` | `meter .createObservableGauge('mist_candle_discard_total', { description: 'Discarded realtime candles` |
| string | `Discarded realtime candles by reason` | `apps/mist/src/realtime/observability/candle-metrics.ts:38:20` | `description: 'Discarded realtime candles by reason'` |
| string | `mist_candle_late_after_grace_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:56:28` | `meter .createObservableGauge('mist_candle_late_after_grace_total', { description: 'Frames skipped as` |
| string | `Frames skipped as late after grace` | `apps/mist/src/realtime/observability/candle-metrics.ts:57:20` | `description: 'Frames skipped as late after grace'` |
| string | `mist_candle_capacity_exceeded_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:70:28` | `meter .createObservableGauge('mist_candle_capacity_exceeded_total', { description: 'Frames skipped f` |
| string | `Frames skipped for candidate capacity` | `apps/mist/src/realtime/observability/candle-metrics.ts:71:20` | `description: 'Frames skipped for candidate capacity'` |
| string | `mist_candle_snapshot_overflow_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:84:28` | `meter .createObservableGauge('mist_candle_snapshot_overflow_total', { description: 'Queue admissions` |
| string | `Queue admissions rejected (snapshot overflow)` | `apps/mist/src/realtime/observability/candle-metrics.ts:85:20` | `description: 'Queue admissions rejected (snapshot overflow)'` |
| string | `mist_candle_due_admission_overflow_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:92:28` | `meter .createObservableGauge('mist_candle_due_admission_overflow_total', { description: 'Due members` |
| string | `Due members rejected (admission overflow)` | `apps/mist/src/realtime/observability/candle-metrics.ts:93:20` | `description: 'Due members rejected (admission overflow)'` |
| string | `mist_candle_due_scan_failure_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:102:28` | `meter .createObservableGauge('mist_candle_due_scan_failure_total', { description: 'Due scan failures` |
| string | `Due scan failures` | `apps/mist/src/realtime/observability/candle-metrics.ts:103:20` | `description: 'Due scan failures'` |
| string | `mist_candle_due_registration_failure_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:110:28` | `meter .createObservableGauge('mist_candle_due_registration_failure_total', { description: 'Due regis` |
| string | `Due registration failures` | `apps/mist/src/realtime/observability/candle-metrics.ts:111:20` | `description: 'Due registration failures'` |
| string | `mist_candle_finalization_horizon_exceeded_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:118:28` | `meter .createObservableGauge('mist_candle_finalization_horizon_exceeded_total', { description: 'Due ` |
| string | `Due members released at hard horizon` | `apps/mist/src/realtime/observability/candle-metrics.ts:119:20` | `description: 'Due members released at hard horizon'` |
| string | `mist_candle_skip_total` | `apps/mist/src/realtime/observability/candle-metrics.ts:128:28` | `meter .createObservableGauge('mist_candle_skip_total', { description: 'Snapshots skipped by reason',` |
| string | `Snapshots skipped by reason` | `apps/mist/src/realtime/observability/candle-metrics.ts:129:20` | `description: 'Snapshots skipped by reason'` |
| string | `mist-backend` | `apps/mist/src/realtime/observability/startup-compensation-metrics.ts:18:34` | `metrics.getMeter('mist-backend', '0.1.0')` |
| string | `0.1.0` | `apps/mist/src/realtime/observability/startup-compensation-metrics.ts:18:50` | `metrics.getMeter('mist-backend', '0.1.0')` |
| string | `mist_startup_compensation_total` | `apps/mist/src/realtime/observability/startup-compensation-metrics.ts:21:28` | `meter .createObservableGauge('mist_startup_compensation_total', { description: 'Startup strategy-tri` |
| string | `Startup strategy-trigger compensation outcome (one-shot marker)` | `apps/mist/src/realtime/observability/startup-compensation-metrics.ts:23:9` | `description: 'Startup strategy-trigger compensation outcome (one-shot marker)'` |
| string | `mist-backend` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:24:34` | `metrics.getMeter('mist-backend', '0.1.0')` |
| string | `0.1.0` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:24:50` | `metrics.getMeter('mist-backend', '0.1.0')` |
| string | `mist_realtime_subscription_desired_count` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:48:5` | `sourceGauge( 'mist_realtime_subscription_desired_count', 'Desired subscription symbols per source (D` |
| string | `Desired subscription symbols per source (DB assignments, ACTIVE)` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:49:5` | `sourceGauge( 'mist_realtime_subscription_desired_count', 'Desired subscription symbols per source (D` |
| string | `mist_realtime_subscription_active_count` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:53:5` | `sourceGauge( 'mist_realtime_subscription_active_count', 'Active subscription symbols per source (pro` |
| string | `Active subscription symbols per source (provider readback)` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:54:5` | `sourceGauge( 'mist_realtime_subscription_active_count', 'Active subscription symbols per source (pro` |
| string | `mist_realtime_subscription_converged_count` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:58:5` | `sourceGauge( 'mist_realtime_subscription_converged_count', 'Converged assignments per source', (entr` |
| string | `Converged assignments per source` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:59:5` | `sourceGauge( 'mist_realtime_subscription_converged_count', 'Converged assignments per source', (entr` |
| string | `mist_realtime_subscription_deferred_removal_count` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:63:5` | `sourceGauge( 'mist_realtime_subscription_deferred_removal_count', 'Assignments awaiting deferred rem` |
| string | `Assignments awaiting deferred removal per source` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:64:5` | `sourceGauge( 'mist_realtime_subscription_deferred_removal_count', 'Assignments awaiting deferred rem` |
| string | `mist_realtime_subscription_last_attempt_age_seconds` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:68:5` | `sourceGauge( 'mist_realtime_subscription_last_attempt_age_seconds', 'Seconds since last reconciliati` |
| string | `Seconds since last reconciliation attempt per source (null = never)` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:69:5` | `sourceGauge( 'mist_realtime_subscription_last_attempt_age_seconds', 'Seconds since last reconciliati` |
| string | `mist_realtime_subscription_last_success_age_seconds` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:73:5` | `sourceGauge( 'mist_realtime_subscription_last_success_age_seconds', 'Seconds since last successful r` |
| string | `Seconds since last successful reconciliation per source (null = never)` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:74:5` | `sourceGauge( 'mist_realtime_subscription_last_success_age_seconds', 'Seconds since last successful r` |
| string | `mist_realtime_subscription_trigger_total` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:79:28` | `meter .createObservableGauge('mist_realtime_subscription_trigger_total', { description: 'Reconciliat` |
| string | `Reconciliation triggers per source (bounded enum)` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:80:20` | `description: 'Reconciliation triggers per source (bounded enum)'` |
| string | `mist_realtime_subscription_result_total` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:95:28` | `meter .createObservableGauge('mist_realtime_subscription_result_total', { description: 'Reconciliati` |
| string | `Reconciliation results per source (bounded enum)` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:96:20` | `description: 'Reconciliation results per source (bounded enum)'` |
| string | `mist_realtime_allowlist_assigned_total` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:121:28` | `meter .createObservableGauge('mist_realtime_allowlist_assigned_total', { description: 'Assigned (DB-` |
| string | `Assigned (DB-declared) allowlist entries per source` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:122:20` | `description: 'Assigned (DB-declared) allowlist entries per source'` |
| string | `mist_realtime_allowlist_effective_total` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:131:28` | `meter .createObservableGauge('mist_realtime_allowlist_effective_total', { description: 'Effective (p` |
| string | `Effective (provider-converged) allowlist entries per source` | `apps/mist/src/realtime/observability/subscription-lifecycle-metrics.ts:133:9` | `description: 'Effective (provider-converged) allowlist entries per source'` |
| string | `mist-backend` | `apps/mist/src/realtime/observability/tracer.ts:5:19` | `trace.getTracer('mist-backend')` |
| string | `off` | `apps/mist/src/realtime/realtime-ingress.module.ts:111:19` | `mode === 'off'` |
| string | `realtime.native_snapshot` | `apps/mist/src/realtime/realtime-native-map.decoder.ts:45:24` | `parsed['type'] !== 'realtime.native_snapshot'` |
| string | `tdx` | `apps/mist/src/realtime/realtime-native-map.decoder.ts:65:27` | `expectedProvider === 'tdx'` |
| string | `MIST_REALTIME_REDIS_URL` | `apps/mist/src/realtime/realtime-redis.service.ts:50:40` | `this.config.get<string>('MIST_REALTIME_REDIS_URL')` |
| string | `REALTIME_PRODUCTIZATION_MODE` | `apps/mist/src/realtime/realtime-redis.service.ts:52:31` | `this.config.get<string>('REALTIME_PRODUCTIZATION_MODE')` |
| string | `off` | `apps/mist/src/realtime/realtime-redis.service.ts:68:26` | `this.mode !== 'off'` |
| number | `5000` | `apps/mist/src/realtime/realtime-redis.service.ts:87:23` | `connectTimeout: 5_000` |
| number | `3000` | `apps/mist/src/realtime/realtime-redis.service.ts:88:23` | `commandTimeout: 3_000` |
| number | `10` | `apps/mist/src/realtime/realtime-redis.service.ts:91:17` | `times > 10` |
| number | `500` | `apps/mist/src/realtime/realtime-redis.service.ts:91:46` | `times * 500` |
| number | `5000` | `apps/mist/src/realtime/realtime-redis.service.ts:91:51` | `Math.min(times * 500, 5_000)` |
| string | `reconnecting` | `apps/mist/src/realtime/realtime-redis.service.ts:100:25` | `this.ownedClient.on('reconnecting', (delay: number) => { this.logger.warn(`Realtime Redis reconnecti` |
| string | `assignment` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:67:27` | `this.assignments .createQueryBuilder('assignment')` |
| string | `source_config.format_code` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:68:15` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `formatCode` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:68:44` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `security.id` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:69:18` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `securityId` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:69:33` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `assignment.security` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:70:18` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `security` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:70:41` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `assignment.sourceConfig` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:71:18` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `source_config` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:71:45` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `security.type IN (:...types)` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:72:14` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `source_config.source = :source` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:75:17` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `source_config.enabled = :enabled` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:76:17` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `security.status = :status` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:77:17` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| string | `source_config.format_code` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:78:16` | `this.assignments .createQueryBuilder('assignment') .select('source_config.format_code', 'formatCode'` |
| number | `5` | `apps/mist/src/realtime/realtime-security-allowlist.service.ts:165:28` | `requested.length > 5` |
| string | `trading_day_rollover` | `apps/mist/src/realtime/realtime-snapshot-ingress.service.ts:48:39` | `trace.getActiveSpan()?.addEvent('trading_day_rollover', { securityId: snapshot.securityId, tradingDa` |
| string | `product_sink_failed` | `apps/mist/src/realtime/realtime-snapshot-ingress.service.ts:68:39` | `trace.getActiveSpan()?.addEvent('product_sink_failed', { securityId: snapshot.securityId, source: sn` |
| string | `1m` | `apps/mist/src/realtime/strategy-trigger/realtime-strategy-startup-compensation.service.ts:145:17` | `period: '1m'` |
| string | `sealed` | `apps/mist/src/realtime/strategy-trigger/realtime-strategy-startup-compensation.service.ts:147:18` | `outcome: 'sealed'` |
| string | `closed` | `apps/mist/src/realtime/strategy-trigger/realtime-strategy-startup-compensation.service.ts:158:29` | `watermark.outcome === 'closed'` |
| string | `discarded` | `apps/mist/src/realtime/strategy-trigger/realtime-strategy-startup-compensation.service.ts:162:36` | `watermark.outcome === 'discarded'` |
| string | `1m` | `apps/mist/src/realtime/strategy-trigger/realtime-strategy-startup-compensation.service.ts:167:15` | `period: '1m'` |
| string | `discarded` | `apps/mist/src/realtime/strategy-trigger/realtime-strategy-startup-compensation.service.ts:169:16` | `outcome: 'discarded'` |
| string | `new` | `apps/mist/src/realtime-subscriptions/dto/initialize-realtime-subscription.dto.ts:58:24` | `input.mode === 'new'` |
| string | `existing` | `apps/mist/src/realtime-subscriptions/dto/initialize-realtime-subscription.dto.ts:71:24` | `input.mode === 'existing'` |
| number | `20` | `apps/mist/src/realtime-subscriptions/dto/realtime-subscription-query.dto.ts:19:19` | `@ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @I` |
| string | `pending` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:57:15` | `result: 'pending'` |
| string | `success` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:91:15` | `result: 'success'` |
| string | `failure` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:105:15` | `result: 'failure'` |
| string | `readback_stale` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:117:22` | `failureReason: 'readback_stale'` |
| string | `failure` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:118:15` | `result: 'failure'` |
| string | `lifecycle_disabled` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:128:53` | `unknownProjection('lifecycle_disabled')` |
| string | `pending` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:137:22` | `convergence: 'pending'` |
| string | `control_failed` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:149:39` | `current.failureReason === 'control_failed'` |
| string | `transport_not_ready` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:156:51` | `unknownProjection('transport_not_ready')` |
| string | `converged` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:161:22` | `convergence: 'converged'` |
| string | `drifted` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:169:20` | `convergence: 'drifted'` |
| string | `off` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:255:16` | `mode === 'off'` |
| string | `lifecycle_disabled` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:256:46` | `reason: 'lifecycle_disabled'` |
| string | `pending` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:258:46` | `convergence: 'pending'` |
| string | `control_failed` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:263:37` | `current.failureReason === 'control_failed'` |
| string | `transport_not_ready` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:270:46` | `reason: 'transport_not_ready'` |
| string | `converged` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:275:36` | `convergence: 'converged'` |
| string | `drifted` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:280:18` | `convergence: 'drifted'` |
| number | `1000` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:286:60` | `(now.getTime() - at.getTime()) / 1000` |
| string | `RECONCILIATION_REQUIRED` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:302:23` | `reason.includes('RECONCILIATION_REQUIRED')` |
| string | `JOURNAL` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:305:23` | `reason.includes('JOURNAL')` |
| string | `CAPACITY` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:306:23` | `reason.includes('CAPACITY')` |
| string | `CONNECTION_STALE` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:307:23` | `reason.includes('CONNECTION_STALE')` |
| string | `TIMEOUT` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:309:21` | `reason.includes('TIMEOUT')` |
| string | `DISCONNECTED` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:310:21` | `reason.includes('DISCONNECTED')` |
| string | `SEND_FAILED` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:311:21` | `reason.includes('SEND_FAILED')` |
| string | `DEADLINE` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:312:21` | `reason.includes('DEADLINE')` |
| string | `qmt_reconciliation_required` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:321:16` | `reason === 'qmt_reconciliation_required'` |
| string | `qmt_journal_unhealthy` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:322:16` | `reason === 'qmt_journal_unhealthy'` |
| string | `source_capacity_blocked` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle-observation.store.ts:323:16` | `reason === 'source_capacity_blocked'` |
| string | `REALTIME_RECONCILE_INTERVAL_MS` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:134:23` | `this.config.get('REALTIME_RECONCILE_INTERVAL_MS')` |
| string | `realtime-subscription-reconcile` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:141:32` | `this.scheduler.addInterval('realtime-subscription-reconcile', interval)` |
| string | `incremental` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:149:26` | `this.enqueue(source, 'incremental', 'intraday_activation')` |
| string | `intraday_activation` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:149:41` | `this.enqueue(source, 'incremental', 'intraday_activation')` |
| string | `reset` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:171:28` | `this.enqueue(source, 'reset', 'weekday_0915')` |
| string | `weekday_0915` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:171:37` | `this.enqueue(source, 'reset', 'weekday_0915')` |
| string | `realtime-subscription-reconcile` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:178:37` | `this.scheduler.deleteInterval('realtime-subscription-reconcile')` |
| string | `reset` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:220:30` | `this.enqueue(source, 'reset', 'auto_reconcile_enabled')` |
| string | `auto_reconcile_enabled` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:220:39` | `this.enqueue(source, 'reset', 'auto_reconcile_enabled')` |
| string | `reset` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:225:28` | `this.enqueue(source, 'reset', 'scheduled_reconcile')` |
| string | `scheduled_reconcile` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:225:37` | `this.enqueue(source, 'reset', 'scheduled_reconcile')` |
| string | `reset` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:240:38` | `this.enqueue(observation.source, 'reset', 'accepted_ready')` |
| string | `accepted_ready` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:240:47` | `this.enqueue(observation.source, 'reset', 'accepted_ready')` |
| string | `reset` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:332:20` | `policy === 'reset'` |
| string | `assignment` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:395:27` | `this.assignmentRepository .createQueryBuilder('assignment')` |
| string | `source_config.formatCode` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:396:15` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `providerSymbol` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:396:43` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `security.id` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:397:18` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `securityId` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:397:33` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `security.status` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:398:18` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `securityStatus` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:398:37` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `assignment.security` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:399:18` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `security` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:399:41` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `assignment.sourceConfig` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:400:18` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `source_config` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:400:45` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `security.type IN (:...types)` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:401:14` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `source_config.source = :source` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:404:17` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `source_config.enabled = :enabled` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:405:17` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `source_config.formatCode` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:406:16` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.formatCode', 'pro` |
| string | `reset` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:445:22` | `current === 'reset'` |
| string | `reset` | `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts:445:46` | `incoming === 'reset'` |
| string | `new` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:72:29` | `dto.mode === 'new'` |
| number | `20` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:89:34` | `query.limit ?? 20` |
| string | `source_not_realtime` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:176:9` | `this.sourceConfigNotEligible( sourceConfigId, 'source_not_realtime', )` |
| string | `pessimistic_write` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:184:21` | `mode: 'pessimistic_write'` |
| string | `source_not_realtime` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:190:9` | `this.sourceConfigNotEligible( sourceConfigId, 'source_not_realtime', )` |
| string | `source_disabled` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:194:59` | `this.sourceConfigNotEligible(sourceConfigId, 'source_disabled')` |
| string | `provider_symbol_invalid` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:204:9` | `this.sourceConfigNotEligible( sourceConfigId, 'provider_symbol_invalid', )` |
| string | `security_not_stock` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:216:52` | `this.securityNotEligible(security.id, 'security_not_stock')` |
| string | `security_not_active` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:219:52` | `this.securityNotEligible(security.id, 'security_not_active')` |
| string | `source_config` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:257:27` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config')` |
| string | `pessimistic_write` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:258:16` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config') .setLock('pessimis` |
| string | `source_config.source = :source` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:259:14` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config') .setLock('pessimis` |
| string | `source_config.id` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:260:16` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config') .setLock('pessimis` |
| string | `assignment` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:270:27` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment')` |
| string | `assignment.security` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:271:18` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `security` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:271:41` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `assignment.sourceConfig` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:272:18` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `source_config` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:272:45` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `security.status = :active` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:273:14` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `security.type IN (:...types)` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:274:17` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `source_config.source = :source` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:277:17` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `source_config.enabled = :enabled` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:278:17` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('assignment') .innerJoin(` |
| string | `assignment` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:284:27` | `this.assignmentRepository .createQueryBuilder('assignment')` |
| string | `source_config.source` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:285:15` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `source` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:285:39` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `COUNT(*)` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:286:18` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `activeAssignmentCount` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:286:30` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `assignment.security` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:287:18` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `security` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:287:41` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `assignment.sourceConfig` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:288:18` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `source_config` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:288:45` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `security.status = :active` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:289:14` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `security.type IN (:...types)` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:290:17` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `source_config.enabled = :enabled` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:293:17` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `source_config.source` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:294:16` | `this.assignmentRepository .createQueryBuilder('assignment') .select('source_config.source', 'source'` |
| string | `existing` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:469:24` | `dto.mode === 'existing'` |
| string | `ER_DUP_ENTRY` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:487:23` | `driver.code !== 'ER_DUP_ENTRY'` |
| number | `1062` | `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts:487:58` | `driver.errno !== 1062` |
| string | `pessimistic_write` | `apps/mist/src/security/security.service.ts:98:23` | `mode: 'pessimistic_write'` |
| string | `source_config` | `apps/mist/src/security/security.service.ts:296:29` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config')` |
| string | `pessimistic_write` | `apps/mist/src/security/security.service.ts:297:18` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config') .setLock('pessimis` |
| string | `source_config.source = :source` | `apps/mist/src/security/security.service.ts:298:16` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config') .setLock('pessimis` |
| string | `source_config.id` | `apps/mist/src/security/security.service.ts:299:18` | `manager .getRepository(SecuritySourceConfig) .createQueryBuilder('source_config') .setLock('pessimis` |
| string | `pessimistic_write` | `apps/mist/src/security/security.service.ts:303:23` | `mode: 'pessimistic_write'` |
| string | `realtime_assignment` | `apps/mist/src/security/security.service.ts:314:29` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('realtime_assignment')` |
| string | `realtime_assignment.security` | `apps/mist/src/security/security.service.ts:315:20` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('realtime_assignment') .i` |
| string | `active_security` | `apps/mist/src/security/security.service.ts:315:52` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('realtime_assignment') .i` |
| string | `realtime_assignment.sourceConfig` | `apps/mist/src/security/security.service.ts:316:20` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('realtime_assignment') .i` |
| string | `active_source_config` | `apps/mist/src/security/security.service.ts:316:56` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('realtime_assignment') .i` |
| string | `active_security.status = :active` | `apps/mist/src/security/security.service.ts:317:16` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('realtime_assignment') .i` |
| string | `active_source_config.source = :source` | `apps/mist/src/security/security.service.ts:320:19` | `manager .getRepository(RealtimeSubscriptionAssignment) .createQueryBuilder('realtime_assignment') .i` |
| string | `pessimistic_write` | `apps/mist/src/security/security.service.ts:354:23` | `mode: 'pessimistic_write'` |
| string | `AKTOOLS_BASE_URL` | `apps/mist/src/sources/east-money/east-money-source.service.ts:56:40` | `this.configService.get<string>('AKTOOLS_BASE_URL')` |
| string | `/api/public/index_zh_a_hist_min_em` | `apps/mist/src/sources/east-money/east-money-source.service.ts:87:7` | `this.axios.get<EfMinuteVo[]>( '/api/public/index_zh_a_hist_min_em', { params: { symbol: code, period` |
| string | `yyyy-MM-dd HH:mm:ss` | `apps/mist/src/sources/east-money/east-money-source.service.ts:95:13` | `formatInTimeZone( startDate, MARKET_TIME_ZONE, 'yyyy-MM-dd HH:mm:ss', )` |
| string | `yyyy-MM-dd HH:mm:ss` | `apps/mist/src/sources/east-money/east-money-source.service.ts:100:13` | `formatInTimeZone( endDate, MARKET_TIME_ZONE, 'yyyy-MM-dd HH:mm:ss', )` |
| string | `volume` | `apps/mist/src/sources/east-money/east-money-source.service.ts:121:62` | `normalizeEastMoneyQuantity(item['成交量'], 'volume')` |
| string | `amount` | `apps/mist/src/sources/east-money/east-money-source.service.ts:125:57` | `normalizeEastMoneyQuantity(item['成交额'] ?? null, 'amount')` |
| string | `/api/public/stock_zh_index_daily_em` | `apps/mist/src/sources/east-money/east-money-source.service.ts:170:7` | `this.axios.get<EfDailyVo[]>( '/api/public/stock_zh_index_daily_em', { params: { symbol: code, start_` |
| string | `yyyyMMdd` | `apps/mist/src/sources/east-money/east-money-source.service.ts:174:69` | `formatInTimeZone(startDate, MARKET_TIME_ZONE, 'yyyyMMdd')` |
| string | `yyyyMMdd` | `apps/mist/src/sources/east-money/east-money-source.service.ts:175:65` | `formatInTimeZone(endDate, MARKET_TIME_ZONE, 'yyyyMMdd')` |
| string | `T00:00:00Z` | `apps/mist/src/sources/east-money/east-money-source.service.ts:191:41` | `item.date + 'T00:00:00Z'` |
| string | `volume` | `apps/mist/src/sources/east-money/east-money-source.service.ts:196:57` | `normalizeEastMoneyQuantity(item.volume, 'volume')` |
| string | `amount` | `apps/mist/src/sources/east-money/east-money-source.service.ts:198:59` | `normalizeEastMoneyQuantity(item.amount ?? null, 'amount')` |
| string | `, ` | `apps/mist/src/sources/k-save.helper.ts:47:97` | `invalidFields.join(', ')` |
| string | `QMT_BASE_URL` | `apps/mist/src/sources/qmt/qmt-source.service.ts:73:38` | `this.configService.get<string>('QMT_BASE_URL')` |
| string | `/v1/bars/query` | `apps/mist/src/sources/qmt/qmt-source.service.ts:89:9` | `this.axios.post<QmtEnvelope<QmtBarsResponseData>>( '/v1/bars/query', { fields: QMT_DEFAULT_FIELDS, s` |
| string | `QMT bars query failed` | `apps/mist/src/sources/qmt/qmt-source.service.ts:105:43` | `this.throwEnvelopeError(envelope, 'QMT bars query failed')` |
| string | `volume` | `apps/mist/src/sources/qmt/qmt-source.service.ts:215:56` | `this.readDecimal(symbolData, ['volume'], rowKey, 'volume')` |
| string | `amount` | `apps/mist/src/sources/qmt/qmt-source.service.ts:234:69` | `this.readDecimal(symbolData, ['amount'], rowKey, 'amount')` |
| string | `preClose` | `apps/mist/src/sources/qmt/qmt-source.service.ts:255:34` | `this.assignNumber(extension, 'preClose', symbolData, ['preClose'], rowKey)` |
| string | `openInterest` | `apps/mist/src/sources/qmt/qmt-source.service.ts:258:7` | `this.assignNumber( extension, 'openInterest', symbolData, ['openInterest'], rowKey, )` |
| string | `suspendFlag` | `apps/mist/src/sources/qmt/qmt-source.service.ts:265:7` | `this.assignNumber( extension, 'suspendFlag', symbolData, ['suspendFlag'], rowKey, )` |
| string | `settle` | `apps/mist/src/sources/qmt/qmt-source.service.ts:272:7` | `this.assignNumber( extension, 'settle', symbolData, ['settle', 'settlementPrice', 'settelementPrice'` |
| number | `4` | `apps/mist/src/sources/qmt/qmt-source.service.ts:378:26` | `text.slice(0, 4)` |
| number | `4` | `apps/mist/src/sources/qmt/qmt-source.service.ts:378:43` | `text.slice(4, 6)` |
| number | `6` | `apps/mist/src/sources/qmt/qmt-source.service.ts:378:46` | `text.slice(4, 6)` |
| number | `6` | `apps/mist/src/sources/qmt/qmt-source.service.ts:378:63` | `text.slice(6, 8)` |
| number | `8` | `apps/mist/src/sources/qmt/qmt-source.service.ts:378:66` | `text.slice(6, 8)` |
| number | `4` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:26` | `text.slice(0, 4)` |
| number | `4` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:43` | `text.slice(4, 6)` |
| number | `6` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:46` | `text.slice(4, 6)` |
| number | `6` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:63` | `text.slice(6, 8)` |
| number | `8` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:66` | `text.slice(6, 8)` |
| number | `8` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:83` | `text.slice(8, 10)` |
| number | `10` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:86` | `text.slice(8, 10)` |
| number | `10` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:104` | `text.slice(10, 12)` |
| number | `12` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:108` | `text.slice(10, 12)` |
| number | `12` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:126` | `text.slice(12, 14)` |
| number | `14` | `apps/mist/src/sources/qmt/qmt-source.service.ts:383:130` | `text.slice(12, 14)` |
| string | `T` | `apps/mist/src/sources/qmt/qmt-source.service.ts:387:41` | `text.replace(' ', 'T')` |
| string | `+08:00` | `apps/mist/src/sources/qmt/qmt-source.service.ts:387:48` | `text.replace(' ', 'T') + '+08:00'` |
| string | `lastPrice` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:15:64` | `requiredFiniteNumber(input.native['lastPrice'], 'lastPrice')` |
| string | `qmt` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:23:13` | `source: 'qmt'` |
| string | `latest-state` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:32:14` | `level: 'latest-state'` |
| string | `volume` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:47:25` | `quantityError('volume', 'invalid_type')` |
| string | `invalid_type` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:47:35` | `quantityError('volume', 'invalid_type')` |
| string | `volume` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:50:25` | `quantityError('volume', 'negative_value')` |
| string | `negative_value` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:50:35` | `quantityError('volume', 'negative_value')` |
| string | `volume` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:53:25` | `quantityError('volume', 'unsafe_integer')` |
| string | `unsafe_integer` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:53:35` | `quantityError('volume', 'unsafe_integer')` |
| string | `amount` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:64:25` | `quantityError('amount', 'invalid_type')` |
| string | `invalid_type` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:64:35` | `quantityError('amount', 'invalid_type')` |
| string | `amount` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:67:25` | `quantityError('amount', 'negative_value')` |
| string | `negative_value` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:67:35` | `quantityError('amount', 'negative_value')` |
| string | `amount` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:73:25` | `quantityError('amount', 'invalid_format')` |
| string | `invalid_format` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:73:35` | `quantityError('amount', 'invalid_format')` |
| number | `8` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:76:25` | `fraction.length > 8` |
| string | `amount` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:77:25` | `quantityError('amount', 'precision_exceeded')` |
| string | `precision_exceeded` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:77:35` | `quantityError('amount', 'precision_exceeded')` |
| string | `amount` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:85:7` | `quantityError( 'amount', error instanceof RangeError ? 'out_of_range' : 'invalid_format', )` |
| number | `1000` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:137:57` | `Math.abs(value - first) >= 1_000` |
| number | `1000000000000` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:144:14` | `value >= 1_000_000_000_000` |
| number | `1000000000` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:146:18` | `value >= 1_000_000_000` |
| number | `1000` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:147:19` | `value * 1_000` |
| number | `3` | `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts:163:92` | `fraction.padEnd(3, '0')` |
| string | `QMT_REALTIME_ALLOWLIST` | `apps/mist/src/sources/qmt/realtime/realtime-allowlist.resolver.ts:16:50` | `this.shared.initialize(DataSource.QMT, 'QMT_REALTIME_ALLOWLIST')` |
| string | `QMT_BASE_URL` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:88:40` | `config.get<string>('QMT_BASE_URL')` |
| string | `QMT_WS_CLIENT_ID` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:90:26` | `config.get<string>('QMT_WS_CLIENT_ID')` |
| string | `ws` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:91:46` | `baseUrl.replace(/^http/, 'ws')` |
| string | `QMT_WS_RECONNECT_DELAY_MS` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:93:7` | `config.get<number>( 'QMT_WS_RECONNECT_DELAY_MS', DEFAULT_WS_RECONNECT_DELAY_MS, )` |
| string | `QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:97:7` | `config.get<number>( 'QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS', DEFAULT_SUBSCRIPTION_CONTROL_TIMEOUT_MS, ` |
| string | `QMT_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:126:36` | `localFailure(unauthorized, 'QMT_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED')` |
| string | `QMT_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:143:34` | `localFailure(normalized, 'QMT_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED')` |
| string | `QMT_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:157:34` | `localFailure(normalized, 'QMT_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED')` |
| string | `QMT_SUBSCRIPTION_CONTROL_NOT_READY` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:182:30` | `localFailure(symbol, 'QMT_SUBSCRIPTION_CONTROL_NOT_READY')` |
| string | `QMT_SUBSCRIPTION_CONTROL_BUSY` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:187:30` | `localFailure(symbol, 'QMT_SUBSCRIPTION_CONTROL_BUSY')` |
| string | `QMT_SUBSCRIPTION_CONTROL_TIMEOUT` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:194:38` | `localFailure(symbol, 'QMT_SUBSCRIPTION_CONTROL_TIMEOUT')` |
| string | `QMT_SUBSCRIPTION_CONTROL_SEND_FAILED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:203:38` | `localFailure(symbol, 'QMT_SUBSCRIPTION_CONTROL_SEND_FAILED')` |
| string | `ping` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:222:47` | `type: 'ping'` |
| string | `QMT_REALTIME_WS_ERROR` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:234:27` | `this.store.setError('QMT_REALTIME_WS_ERROR', error.message)` |
| string | `decodeError` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:273:9` | `this.store.recordReject( 'decodeError', null, error instanceof Error ? error.message : 'QMT_REALTIME` |
| string | `realtime.ready` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:279:29` | `message['type'] === 'realtime.ready'` |
| string | `realtime.native_snapshot` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:287:29` | `message['type'] === 'realtime.native_snapshot'` |
| string | `qmt` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:295:31` | `message['provider'] !== 'qmt'` |
| string | `builtin` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:297:24` | `data['mode'] !== 'builtin'` |
| string | `QMT` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:299:26` | `data['source'] !== 'QMT'` |
| string | `latest-state` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:300:27` | `data['quality'] !== 'latest-state'` |
| string | `contractMismatch` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:307:9` | `this.store.recordReject( 'contractMismatch', null, 'QMT_REALTIME_READY_CONTRACT_MISMATCH', )` |
| string | `QMT_REALTIME_READY_CONTRACT_MISMATCH` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:309:9` | `this.store.recordReject( 'contractMismatch', null, 'QMT_REALTIME_READY_CONTRACT_MISMATCH', )` |
| string | `candle.snapshot.process` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:333:20` | `withCandleSpan('candle.snapshot.process', (span) => { span.setAttribute('source', 'qmt'); const reje` |
| string | `source` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:334:25` | `span.setAttribute('source', 'qmt')` |
| string | `qmt` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:334:35` | `span.setAttribute('source', 'qmt')` |
| string | `rejected` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:336:23` | `span.addEvent('rejected', { reason })` |
| string | `transport_not_ready` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:343:16` | `reject('transport_not_ready', null)` |
| string | `validationError` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:345:11` | `this.store.recordReject( 'validationError', null, 'QMT_REALTIME_READY_REQUIRED', )` |
| string | `QMT_REALTIME_READY_REQUIRED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:347:11` | `this.store.recordReject( 'validationError', null, 'QMT_REALTIME_READY_REQUIRED', )` |
| string | `qmt` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:353:59` | `decodeRealtimeNativeMapMessage(message, 'qmt')` |
| string | `symbol` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:372:27` | `span.setAttribute('symbol', providerSymbol)` |
| string | `capturedAt` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:373:27` | `span.setAttribute('capturedAt', decoded.data.capturedAt)` |
| string | `symbol_invalid` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:375:18` | `reject('symbol_invalid', providerSymbol)` |
| string | `validationError` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:377:13` | `this.store.recordReject( 'validationError', providerSymbol, 'QMT_REALTIME_NATIVE_INVALID', )` |
| string | `QMT_REALTIME_NATIVE_INVALID` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:379:13` | `this.store.recordReject( 'validationError', providerSymbol, 'QMT_REALTIME_NATIVE_INVALID', )` |
| string | `not_authorized` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:385:18` | `reject('not_authorized', providerSymbol)` |
| string | `symbolNotAuthorized` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:387:13` | `this.store.recordReject( 'symbolNotAuthorized', providerSymbol, 'QMT_REALTIME_SYMBOL_NOT_AUTHORIZED'` |
| string | `QMT_REALTIME_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:389:13` | `this.store.recordReject( 'symbolNotAuthorized', providerSymbol, 'QMT_REALTIME_SYMBOL_NOT_AUTHORIZED'` |
| number | `20` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:403:23` | `Object.keys(nativeRecord) .sort() .slice(0, 20)` |
| string | `converter_error` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:414:18` | `reject('converter_error', providerSymbol)` |
| string | `converterError` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:416:13` | `this.store.recordReject( 'converterError', providerSymbol, 'QMT_REALTIME_CONVERTER_FAILED', )` |
| string | `QMT_REALTIME_CONVERTER_FAILED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:418:13` | `this.store.recordReject( 'converterError', providerSymbol, 'QMT_REALTIME_CONVERTER_FAILED', )` |
| string | `qmt` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:432:31` | `message['provider'] !== 'qmt'` |
| string | `controlResponseRejected` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:438:9` | `this.store.recordReject( 'controlResponseRejected', null, 'QMT_SUBSCRIPTION_CONTROL_RESPONSE_REJECTE` |
| string | `QMT_SUBSCRIPTION_CONTROL_RESPONSE_REJECTED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:440:9` | `this.store.recordReject( 'controlResponseRejected', null, 'QMT_SUBSCRIPTION_CONTROL_RESPONSE_REJECTE` |
| string | `controlResponseRejected` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:447:9` | `this.store.recordReject( 'controlResponseRejected', pending.symbol, 'QMT_SUBSCRIPTION_CONTROL_RESPON` |
| string | `QMT_SUBSCRIPTION_CONTROL_RESPONSE_INVALID` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:449:9` | `this.store.recordReject( 'controlResponseRejected', pending.symbol, 'QMT_SUBSCRIPTION_CONTROL_RESPON` |
| string | `QMT_SUBSCRIPTION_CONTROL_DISCONNECTED` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:464:36` | `localFailure(pending.symbol, 'QMT_SUBSCRIPTION_CONTROL_DISCONNECTED')` |
| string | `success` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:474:19` | `keys[0] === 'success'` |
| string | `failure` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:475:19` | `keys[0] !== 'failure'` |
| number | `3` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:479:57` | `failureKeys.length !== 3` |
| number | `3` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:485:29` | `failureKeys.length === 3` |
| string | `subscribed` | `apps/mist/src/sources/qmt/realtime/realtime.client.ts:486:40` | `failure['subscriptionState'] !== 'subscribed'` |
| string | `DEFAULT_DATA_SOURCE` | `apps/mist/src/sources/services/data-source.service.ts:11:55` | `this.configService.get<string>('DEFAULT_DATA_SOURCE')` |
| string | `, ` | `apps/mist/src/sources/services/data-source.service.ts:68:34` | `enumValues.join(', ')` |
| string | `, ` | `apps/mist/src/sources/services/data-source.service.ts:69:45` | `Object.keys(DataSource).join(', ')` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:54:52` | `marketTime.getHours() * 60` |
| number | `6` | `apps/mist/src/sources/services/k-boundary-calculator.ts:90:57` | `marketDate.dayOfWeek + 6` |
| number | `7` | `apps/mist/src/sources/services/k-boundary-calculator.ts:90:62` | `(marketDate.dayOfWeek + 6) % 7` |
| number | `7` | `apps/mist/src/sources/services/k-boundary-calculator.ts:94:41` | `this.addMarketDays(startDate, 7)` |
| number | `3` | `apps/mist/src/sources/services/k-boundary-calculator.ts:115:58` | `marketDate.month / 3` |
| number | `3` | `apps/mist/src/sources/services/k-boundary-calculator.ts:115:63` | `Math.floor(marketDate.month / 3) * 3` |
| number | `3` | `apps/mist/src/sources/services/k-boundary-calculator.ts:123:24` | `startMonth + 3` |
| number | `6` | `apps/mist/src/sources/services/k-boundary-calculator.ts:131:47` | `marketDate.month < 6` |
| number | `6` | `apps/mist/src/sources/services/k-boundary-calculator.ts:131:55` | `marketDate.month < 6 ? 0 : 6` |
| number | `6` | `apps/mist/src/sources/services/k-boundary-calculator.ts:139:24` | `startMonth + 6` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:165:34` | `hours * 60` |
| number | `9` | `apps/mist/src/sources/services/k-boundary-calculator.ts:168:26` | `9 * 60` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:168:30` | `9 * 60` |
| number | `30` | `apps/mist/src/sources/services/k-boundary-calculator.ts:168:35` | `9 * 60 + 30` |
| number | `11` | `apps/mist/src/sources/services/k-boundary-calculator.ts:169:24` | `11 * 60` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:169:29` | `11 * 60` |
| number | `31` | `apps/mist/src/sources/services/k-boundary-calculator.ts:169:34` | `11 * 60 + 31` |
| number | `13` | `apps/mist/src/sources/services/k-boundary-calculator.ts:175:28` | `13 * 60` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:175:33` | `13 * 60` |
| number | `15` | `apps/mist/src/sources/services/k-boundary-calculator.ts:176:26` | `15 * 60` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:176:31` | `15 * 60` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:228:45` | `totalMinutes / 60` |
| number | `60` | `apps/mist/src/sources/services/k-boundary-calculator.ts:229:36` | `totalMinutes % 60` |
| number | `4` | `apps/mist/src/sources/services/k-boundary-calculator.ts:231:47` | `normalizedDate.year.toString().padStart(4, '0')` |
| string | `tdx` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:28:13` | `source: 'tdx'` |
| string | `Volume` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:34:59` | `readTdxNativeQuantity(input.native, 'Volume', 100)` |
| string | `Amount` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:35:59` | `readTdxNativeQuantity(input.native, 'Amount', 10_000)` |
| number | `10000` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:35:69` | `readTdxNativeQuantity(input.native, 'Amount', 10_000)` |
| string | `latest-state` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:37:14` | `level: 'latest-state'` |
| string | `invalid_type` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:59:7` | `quantityError( field, 'invalid_type', `TDX native ${field} must be a decimal string`, )` |
| string | `invalid_format` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:67:7` | `quantityError( field, 'invalid_format', `TDX native ${field} must be unsigned fixed-point text`, )` |
| number | `8` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:71:33` | `(match[2]?.length ?? 0) > 8` |
| string | `precision_exceeded` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:74:7` | `quantityError( field, 'precision_exceeded', `TDX native ${field} exceeds 8 fractional digits`, )` |
| string | `unexpected_key` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:103:7` | `quantityError( exactField, 'unexpected_key', `TDX native quantity must use exact key ${exactField}, ` |
| string | `Volume` | `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts:116:15` | `field === 'Volume'` |
| string | `TDX_REALTIME_ALLOWLIST` | `apps/mist/src/sources/tdx/realtime/realtime-allowlist.resolver.ts:16:50` | `this.shared.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST')` |
| string | `TDX_BASE_URL` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:97:40` | `config.get<string>('TDX_BASE_URL')` |
| string | `TDX_WS_CLIENT_ID` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:99:26` | `config.get<string>('TDX_WS_CLIENT_ID')` |
| string | `ws` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:100:46` | `baseUrl.replace(/^http/, 'ws')` |
| string | `TDX_WS_RECONNECT_DELAY_MS` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:102:7` | `config.get<number>( 'TDX_WS_RECONNECT_DELAY_MS', DEFAULT_WS_RECONNECT_DELAY_MS, )` |
| string | `TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:106:7` | `config.get<number>( 'TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS', DEFAULT_SUBSCRIPTION_CONTROL_TIMEOUT_MS, ` |
| string | `TDX_WS_HEARTBEAT_INTERVAL_MS` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:110:7` | `config.get<number>( 'TDX_WS_HEARTBEAT_INTERVAL_MS', DEFAULT_WS_HEARTBEAT_INTERVAL_MS, )` |
| string | `TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:139:36` | `localFailure(unauthorized, 'TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED')` |
| string | `TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:156:34` | `localFailure(normalized, 'TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED')` |
| string | `TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:170:34` | `localFailure(normalized, 'TDX_SUBSCRIPTION_SYMBOL_NOT_AUTHORIZED')` |
| string | `TDX_SUBSCRIPTION_CONTROL_NOT_READY` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:195:30` | `localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_NOT_READY')` |
| string | `TDX_SUBSCRIPTION_CONTROL_BUSY` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:200:30` | `localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_BUSY')` |
| string | `TDX_SUBSCRIPTION_CONTROL_TIMEOUT` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:207:38` | `localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_TIMEOUT')` |
| string | `TDX_SUBSCRIPTION_CONTROL_SEND_FAILED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:216:38` | `localFailure(symbol, 'TDX_SUBSCRIPTION_CONTROL_SEND_FAILED')` |
| string | `ping` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:235:47` | `type: 'ping'` |
| string | `TDX_REALTIME_WS_ERROR` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:247:27` | `this.store.setError('TDX_REALTIME_WS_ERROR', error.message)` |
| string | `decodeError` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:286:9` | `this.store.recordReject( 'decodeError', null, error instanceof Error ? error.message : 'TDX_REALTIME` |
| string | `realtime.ready` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:292:29` | `message['type'] === 'realtime.ready'` |
| string | `realtime.native_snapshot` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:300:29` | `message['type'] === 'realtime.native_snapshot'` |
| string | `tdx` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:308:31` | `message['provider'] !== 'tdx'` |
| string | `builtin` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:310:24` | `data['mode'] !== 'builtin'` |
| string | `TDX` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:312:26` | `data['source'] !== 'TDX'` |
| string | `latest-state` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:313:27` | `data['quality'] !== 'latest-state'` |
| string | `contractMismatch` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:320:9` | `this.store.recordReject( 'contractMismatch', null, 'TDX_REALTIME_READY_CONTRACT_MISMATCH', )` |
| string | `TDX_REALTIME_READY_CONTRACT_MISMATCH` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:322:9` | `this.store.recordReject( 'contractMismatch', null, 'TDX_REALTIME_READY_CONTRACT_MISMATCH', )` |
| string | `candle.snapshot.process` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:346:20` | `withCandleSpan('candle.snapshot.process', (span) => { span.setAttribute('source', 'tdx'); const reje` |
| string | `source` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:347:25` | `span.setAttribute('source', 'tdx')` |
| string | `tdx` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:347:35` | `span.setAttribute('source', 'tdx')` |
| string | `rejected` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:349:23` | `span.addEvent('rejected', { reason })` |
| string | `transport_not_ready` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:356:16` | `reject('transport_not_ready', null)` |
| string | `validationError` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:358:11` | `this.store.recordReject( 'validationError', null, 'TDX_REALTIME_READY_REQUIRED', )` |
| string | `TDX_REALTIME_READY_REQUIRED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:360:11` | `this.store.recordReject( 'validationError', null, 'TDX_REALTIME_READY_REQUIRED', )` |
| string | `tdx` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:366:59` | `decodeRealtimeNativeMapMessage(message, 'tdx')` |
| string | `symbol` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:383:25` | `span.setAttribute('symbol', providerSymbol)` |
| string | `capturedAt` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:384:25` | `span.setAttribute('capturedAt', decoded.data.capturedAt)` |
| string | `symbol_invalid` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:386:16` | `reject('symbol_invalid', providerSymbol)` |
| string | `validationError` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:388:11` | `this.store.recordReject( 'validationError', providerSymbol, 'TDX_REALTIME_NATIVE_INVALID', )` |
| string | `TDX_REALTIME_NATIVE_INVALID` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:390:11` | `this.store.recordReject( 'validationError', providerSymbol, 'TDX_REALTIME_NATIVE_INVALID', )` |
| string | `not_authorized` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:396:16` | `reject('not_authorized', providerSymbol)` |
| string | `symbolNotAuthorized` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:398:11` | `this.store.recordReject( 'symbolNotAuthorized', providerSymbol, 'TDX_REALTIME_SYMBOL_NOT_AUTHORIZED'` |
| string | `TDX_REALTIME_SYMBOL_NOT_AUTHORIZED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:400:11` | `this.store.recordReject( 'symbolNotAuthorized', providerSymbol, 'TDX_REALTIME_SYMBOL_NOT_AUTHORIZED'` |
| number | `20` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:414:21` | `Object.keys(nativeRecord) .sort() .slice(0, 20)` |
| string | `converter_error` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:426:16` | `reject('converter_error', providerSymbol)` |
| string | `converterError` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:428:11` | `this.store.recordReject( 'converterError', providerSymbol, 'TDX_REALTIME_CONVERTER_FAILED', )` |
| string | `TDX_REALTIME_CONVERTER_FAILED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:430:11` | `this.store.recordReject( 'converterError', providerSymbol, 'TDX_REALTIME_CONVERTER_FAILED', )` |
| string | `tdx` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:441:31` | `message['provider'] !== 'tdx'` |
| string | `controlResponseRejected` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:447:9` | `this.store.recordReject( 'controlResponseRejected', null, 'TDX_SUBSCRIPTION_CONTROL_RESPONSE_REJECTE` |
| string | `TDX_SUBSCRIPTION_CONTROL_RESPONSE_REJECTED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:449:9` | `this.store.recordReject( 'controlResponseRejected', null, 'TDX_SUBSCRIPTION_CONTROL_RESPONSE_REJECTE` |
| string | `controlResponseRejected` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:456:9` | `this.store.recordReject( 'controlResponseRejected', pending.symbol, 'TDX_SUBSCRIPTION_CONTROL_RESPON` |
| string | `TDX_SUBSCRIPTION_CONTROL_RESPONSE_INVALID` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:458:9` | `this.store.recordReject( 'controlResponseRejected', pending.symbol, 'TDX_SUBSCRIPTION_CONTROL_RESPON` |
| string | `TDX_SUBSCRIPTION_CONTROL_DISCONNECTED` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:473:36` | `localFailure(pending.symbol, 'TDX_SUBSCRIPTION_CONTROL_DISCONNECTED')` |
| string | `success` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:483:19` | `keys[0] === 'success'` |
| string | `failure` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:484:19` | `keys[0] !== 'failure'` |
| number | `3` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:488:57` | `failureKeys.length !== 3` |
| number | `3` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:494:29` | `failureKeys.length === 3` |
| string | `subscribed` | `apps/mist/src/sources/tdx/realtime/realtime.client.ts:495:40` | `failure['subscriptionState'] !== 'subscribed'` |
| string | `TDX_BASE_URL` | `apps/mist/src/sources/tdx/tdx-source.service.ts:74:38` | `this.configService.get<string>('TDX_BASE_URL')` |
| string | `/v1/bars/query` | `apps/mist/src/sources/tdx/tdx-source.service.ts:103:9` | `this.axios.post<TdxEnvelope<TdxBarsResponseData>>( '/v1/bars/query', { symbols: [formatCode], period` |
| string | `front` | `apps/mist/src/sources/tdx/tdx-source.service.ts:110:25` | `dividendType: 'front'` |
| string | `TDX bars query failed` | `apps/mist/src/sources/tdx/tdx-source.service.ts:117:43` | `this.throwEnvelopeError(envelope, 'TDX bars query failed')` |
| string | `volume` | `apps/mist/src/sources/tdx/tdx-source.service.ts:134:55` | `normalizeTdxBarQuantity(bar.volume, 'volume')` |
| string | `amount` | `apps/mist/src/sources/tdx/tdx-source.service.ts:135:55` | `normalizeTdxBarQuantity(bar.amount, 'amount')` |
| string | `/v1/reference/dividend-factors/query` | `apps/mist/src/sources/tdx/tdx-source.service.ts:161:9` | `this.axios.post< TdxEnvelope<TdxDividendFactorsResponseData> >('/v1/reference/dividend-factors/query` |
| string | `yyyyMMdd` | `apps/mist/src/sources/tdx/tdx-source.service.ts:163:66` | `formatInTimeZone(startDate, MARKET_TIME_ZONE, 'yyyyMMdd')` |
| string | `yyyyMMdd` | `apps/mist/src/sources/tdx/tdx-source.service.ts:164:62` | `formatInTimeZone(endDate, MARKET_TIME_ZONE, 'yyyyMMdd')` |
| number | `4` | `apps/mist/src/sources/tdx/tdx-source.service.ts:212:31` | `date.slice(0, 4)` |
| number | `4` | `apps/mist/src/sources/tdx/tdx-source.service.ts:212:48` | `date.slice(4, 6)` |
| number | `6` | `apps/mist/src/sources/tdx/tdx-source.service.ts:212:51` | `date.slice(4, 6)` |
| number | `6` | `apps/mist/src/sources/tdx/tdx-source.service.ts:212:68` | `date.slice(6, 8)` |
| number | `8` | `apps/mist/src/sources/tdx/tdx-source.service.ts:212:71` | `date.slice(6, 8)` |
| string | `amount` | `apps/mist/src/sources/tdx/tdx-source.service.ts:351:21` | `fieldName === 'amount'` |
| number | `10000` | `apps/mist/src/sources/tdx/tdx-source.service.ts:355:20` | `Decimal8.parseCanonical(normalized) .scaleByUnit(10_000)` |
| string | `Location` | `apps/mist/src/strategy/controllers/strategy-backtest.controller.ts:83:28` | `response.setHeader('Location', `/v1/strategy-backtests/${runId}`)` |
| string | `Location` | `apps/mist/src/strategy/controllers/strategy-backtest.controller.ts:87:28` | `response.setHeader('Location', `/v1/strategy-backtests/${error.runId}`)` |
| string | `Location` | `apps/mist/src/strategy/controllers/strategy-backtest.controller.ts:125:11` | `response.setHeader( 'Location', `/v1/strategy-backtests/suites/${suiteId}`, )` |
| string | `Location` | `apps/mist/src/strategy/controllers/strategy-backtest.controller.ts:132:28` | `response.setHeader('Location', `/v1/strategy-backtests/${error.runId}`)` |
| number | `50` | `apps/mist/src/strategy/dto/backtest-signal-result-query.dto.ts:10:11` | `@Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) limit = 50;` |
| number | `50` | `apps/mist/src/strategy/dto/list-backtest-runs-query.dto.ts:27:11` | `@ApiPropertyOptional({ description: 'Maximum number of runs to return (1-100)', default: 50, maximum` |
| string | `BACKTEST_COMMAND_TIMEOUT_MS` | `apps/mist/src/strategy/runtime/backtest-rpc.client.ts:52:31` | `this.config.get<number>('BACKTEST_COMMAND_TIMEOUT_MS')` |
| string | `ECONNREFUSED` | `apps/mist/src/strategy/runtime/backtest-rpc.client.ts:88:14` | `code === 'ECONNREFUSED'` |
| string | `ECONNRESET` | `apps/mist/src/strategy/runtime/backtest-rpc.client.ts:89:14` | `code === 'ECONNRESET'` |
| string | `EHOSTUNREACH` | `apps/mist/src/strategy/runtime/backtest-rpc.client.ts:90:14` | `code === 'EHOSTUNREACH'` |
| string | `ENETUNREACH` | `apps/mist/src/strategy/runtime/backtest-rpc.client.ts:91:14` | `code === 'ENETUNREACH'` |
| string | `BACKTEST_STARTUP_UNAVAILABLE` | `apps/mist/src/strategy/runtime/backtest-startup-compensation.service.ts:49:38` | `this.failPending(cutoff, 'BACKTEST_STARTUP_UNAVAILABLE')` |
| string | `timeout` | `apps/mist/src/strategy/runtime/backtest-startup-compensation.service.ts:67:72` | `error.kind === 'timeout'` |
| string | `BACKTEST_HEALTH_URL` | `apps/mist/src/strategy/runtime/backtest-startup-compensation.service.ts:76:41` | `this.config.get<string>('BACKTEST_HEALTH_URL')` |
| string | `STRATEGY_RUNTIME_REFRESH_FAILED` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:61:9` | `refreshException( BadGatewayException, 'STRATEGY_RUNTIME_REFRESH_FAILED', 'Strategy runtime refresh ` |
| string | `Strategy runtime refresh failed` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:62:9` | `refreshException( BadGatewayException, 'STRATEGY_RUNTIME_REFRESH_FAILED', 'Strategy runtime refresh ` |
| string | `STRATEGY_RUNTIME_REFRESH_TIMEOUT` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:77:7` | `refreshException( GatewayTimeoutException, 'STRATEGY_RUNTIME_REFRESH_TIMEOUT', 'Strategy runtime ref` |
| string | `Strategy runtime refresh timed out` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:78:7` | `refreshException( GatewayTimeoutException, 'STRATEGY_RUNTIME_REFRESH_TIMEOUT', 'Strategy runtime ref` |
| string | `SIGNAL_SERVICE_UNAVAILABLE` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:86:7` | `refreshException( ServiceUnavailableException, 'SIGNAL_SERVICE_UNAVAILABLE', 'Signal service is unav` |
| string | `Signal service is unavailable` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:87:7` | `refreshException( ServiceUnavailableException, 'SIGNAL_SERVICE_UNAVAILABLE', 'Signal service is unav` |
| string | `STRATEGY_RUNTIME_REFRESH_FAILED` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:94:5` | `refreshException( BadGatewayException, 'STRATEGY_RUNTIME_REFRESH_FAILED', 'Strategy runtime refresh ` |
| string | `Strategy runtime refresh failed` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:95:5` | `refreshException( BadGatewayException, 'STRATEGY_RUNTIME_REFRESH_FAILED', 'Strategy runtime refresh ` |
| string | `committed` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:113:18` | `persistence: 'committed'` |
| string | `ECONNREFUSED` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:123:14` | `code === 'ECONNREFUSED'` |
| string | `ECONNRESET` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:124:14` | `code === 'ECONNRESET'` |
| string | `EHOSTUNREACH` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:125:14` | `code === 'EHOSTUNREACH'` |
| string | `ENETUNREACH` | `apps/mist/src/strategy/runtime/signal-registry-rpc.client.ts:126:14` | `code === 'ENETUNREACH'` |
| string | `base64url` | `apps/mist/src/strategy/services/backtest-result-cursor.ts:20:48` | `Buffer.from(payload, 'utf8').toString('base64url')` |
| number | `512` | `apps/mist/src/strategy/services/backtest-result-cursor.ts:29:20` | `value.length > 512` |
| string | `=` | `apps/mist/src/strategy/services/backtest-result-cursor.ts:30:20` | `value.includes('=')` |
| string | `base64url` | `apps/mist/src/strategy/services/backtest-result-cursor.ts:37:44` | `Buffer.from(value, 'base64url')` |
| string | `VALIDATION_ERROR` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:85:15` | `code: 'VALIDATION_ERROR'` |
| string | `startDate must not be after endDate` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:86:18` | `message: 'startDate must not be after endDate'` |
| string | `STRATEGY_CONFIG_INVALID` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:118:17` | `code: 'STRATEGY_CONFIG_INVALID'` |
| string | `run_failed` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:146:33` | `result.error.code === 'run_failed'` |
| string | `missing` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:165:27` | `failed.status === 'missing'` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:169:11` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', run.id, )` |
| string | `queue_full` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:175:33` | `result.error.code === 'queue_full'` |
| number | `429` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:177:11` | `new BacktestCommandHttpException( 429, 'BACKTEST_QUEUE_FULL', 'Backtest queue is full', run.id, Back` |
| number | `503` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:185:9` | `new BacktestCommandHttpException( 503, 'BACKTEST_NOT_READY', 'Backtest service is not ready', run.id` |
| string | `VALIDATION_ERROR` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:212:15` | `code: 'VALIDATION_ERROR'` |
| string | `startDate must not be after endDate` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:213:18` | `message: 'startDate must not be after endDate'` |
| string | `STRATEGY_CONFIG_INVALID` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:243:17` | `code: 'STRATEGY_CONFIG_INVALID'` |
| string | `MASTER` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:274:16` | `stage: 'MASTER'` |
| string | `PENDING` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:290:26` | `initialStatus: 'PENDING'` |
| string | `run_failed` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:293:33` | `result.error.code === 'run_failed'` |
| string | `PENDING` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:316:26` | `initialStatus: 'PENDING'` |
| string | `missing` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:320:27` | `failed.status === 'missing'` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:324:11` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', masterRun.id, )` |
| string | `queue_full` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:330:33` | `result.error.code === 'queue_full'` |
| number | `429` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:332:11` | `new BacktestCommandHttpException( 429, 'BACKTEST_QUEUE_FULL', 'Backtest queue is full', masterRun.id` |
| number | `503` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:340:9` | `new BacktestCommandHttpException( 503, 'BACKTEST_NOT_READY', 'Backtest service is not ready', master` |
| string | `PENDING` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:352:24` | `initialStatus: 'PENDING'` |
| string | `timeout` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:363:22` | `error.kind === 'timeout'` |
| string | `unavailable` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:365:26` | `error.kind === 'unavailable'` |
| string | `timeout` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:369:24` | `error.kind === 'timeout'` |
| number | `504` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:372:11` | `new BacktestCommandHttpException( 504, 'BACKTEST_COMMAND_TIMEOUT', 'Backtest command timed out', run` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:387:9` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', runId, )` |
| string | `unavailable` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:393:24` | `error.kind === 'unavailable'` |
| number | `503` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:396:11` | `new BacktestCommandHttpException( 503, 'BACKTEST_UNAVAILABLE', 'Backtest service is unavailable', ru` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:411:9` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', runId, )` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:420:9` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', runId, BacktestRun` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:435:9` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', runId, BacktestRun` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:443:7` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', runId, )` |
| number | `500` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:475:9` | `new BacktestCommandHttpException( 500, 'INTERNAL_ERROR', 'Internal Server Error', runId, )` |
| string | `PENDING` | `apps/mist/src/strategy/services/backtest-run-command.service.ts:485:34` | `initialStatus: 'PENDING'` |
| string | `WFA` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:73:44` | `masterRun.scenarioId === 'WFA'` |
| number | `50` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:89:53` | `query?.limit ?? 50` |
| string | `run` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:91:27` | `this.runRepository .createQueryBuilder('run')` |
| string | `run.id` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:92:16` | `this.runRepository .createQueryBuilder('run') .orderBy('run.id', 'DESC')` |
| string | `run.strategyDefinitionId = :strategyDefinitionId` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:96:21` | `builder.where('run.strategyDefinitionId = :strategyDefinitionId', { strategyDefinitionId: query.stra` |
| string | `VALIDATION_ERROR` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:135:17` | `code: 'VALIDATION_ERROR'` |
| string | `Request validation failed` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:136:20` | `message: 'Request validation failed'` |
| number | `50` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:141:34` | `query.limit ?? 50` |
| string | `result` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:143:27` | `this.resultRepository .createQueryBuilder('result')` |
| string | `result.backtestRunId = :runId` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:158:14` | `this.resultRepository .createQueryBuilder('result') .select([ 'result.id', 'result.backtestRunId', '` |
| string | `result.signalTime` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:159:16` | `this.resultRepository .createQueryBuilder('result') .select([ 'result.id', 'result.backtestRunId', '` |
| string | `result.id` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:160:19` | `this.resultRepository .createQueryBuilder('result') .select([ 'result.id', 'result.backtestRunId', '` |
| string | `(result.signalTime > :signalTime OR (result.signalTime = :signalTime AND result.id > :id))` | `apps/mist/src/strategy/services/backtest-run-query.service.ts:164:9` | `builder.andWhere( '(result.signalTime > :signalTime OR (result.signalTime = :signalTime AND result.i` |
| string | `CHAN_BSP_KIND_RETIRED` | `apps/mist/src/strategy/services/strategy-definition.service.ts:42:15` | `code: 'CHAN_BSP_KIND_RETIRED'` |
| string | `chan_bsp kind is retired; create a decision_flow definition instead` | `apps/mist/src/strategy/services/strategy-definition.service.ts:44:11` | `message: 'chan_bsp kind is retired; create a decision_flow definition instead'` |
| string | `CHAN_BSP_KIND_RETIRED` | `apps/mist/src/strategy/services/strategy-definition.service.ts:123:19` | `code: 'CHAN_BSP_KIND_RETIRED'` |
| string | `chan_bsp kind is retired; re-enabling requires converting to a decision_flow definition` | `apps/mist/src/strategy/services/strategy-definition.service.ts:125:15` | `message: 'chan_bsp kind is retired; re-enabling requires converting to a decision_flow definition'` |
| string | `decision_flow` | `apps/mist/src/strategy/services/strategy-definition.service.ts:261:17` | `kind: 'decision_flow'` |
| number | `50` | `apps/mist/src/strategy/services/strategy-definition.service.ts:263:64` | `(rule as any)?.requiredBarCount ?? 50` |
| number | `50` | `apps/mist/src/strategy/services/strategy-signal.service.ts:24:52` | `query.limit ?? 50` |
| number | `60` | `apps/mist/src/visual/visual.controller.ts:94:38` | `60 * 24` |
| number | `24` | `apps/mist/src/visual/visual.controller.ts:94:43` | `60 * 24` |
| number | `3600` | `apps/mist/src/visual/visual.controller.ts:94:48` | `60 * 24 * 3600` |
| number | `1000` | `apps/mist/src/visual/visual.controller.ts:94:55` | `60 * 24 * 3600 * 1000` |
| string | `NOTIFICATION_HTTP_TIMEOUT_MS` | `apps/notification/src/channels/feishu.channel-adapter.ts:57:31` | `this.config.get<number>('NOTIFICATION_HTTP_TIMEOUT_MS')` |
| string | `permanent_failure` | `apps/notification/src/channels/feishu.channel-adapter.ts:62:17` | `status: 'permanent_failure'` |
| string | `FEISHU_WEBHOOK_MISSING` | `apps/notification/src/channels/feishu.channel-adapter.ts:64:20` | `errorCode: 'FEISHU_WEBHOOK_MISSING'` |
| string | `text` | `apps/notification/src/channels/feishu.channel-adapter.ts:69:17` | `msg_type: 'text'` |
| number | `1000` | `apps/notification/src/channels/feishu.channel-adapter.ts:74:61` | `Date.now() / 1000` |
| string | `sha256` | `apps/notification/src/channels/feishu.channel-adapter.ts:79:31` | `createHmac('sha256', stringToSign)` |
| string | `sent` | `apps/notification/src/channels/feishu.channel-adapter.ts:99:26` | `status: 'sent'` |
| string | `transient_failure` | `apps/notification/src/channels/feishu.channel-adapter.ts:108:17` | `status: 'transient_failure'` |
| string | `NOTIFICATION_QQ_BASE_URL` | `apps/notification/src/channels/qq.channel-adapter.ts:35:31` | `this.config.get<string>('NOTIFICATION_QQ_BASE_URL')` |
| string | `NOTIFICATION_QQ_TARGET` | `apps/notification/src/channels/qq.channel-adapter.ts:38:31` | `this.config.get<string>('NOTIFICATION_QQ_TARGET')` |
| string | `NOTIFICATION_QQ_MESSAGE_TYPE` | `apps/notification/src/channels/qq.channel-adapter.ts:41:31` | `this.config.get<string>('NOTIFICATION_QQ_MESSAGE_TYPE')` |
| string | `NOTIFICATION_QQ_ACCESS_TOKEN` | `apps/notification/src/channels/qq.channel-adapter.ts:42:43` | `this.config.get<string>('NOTIFICATION_QQ_ACCESS_TOKEN')` |
| string | `NOTIFICATION_HTTP_TIMEOUT_MS` | `apps/notification/src/channels/qq.channel-adapter.ts:44:31` | `this.config.get<number>('NOTIFICATION_HTTP_TIMEOUT_MS')` |
| string | `permanent_failure` | `apps/notification/src/channels/qq.channel-adapter.ts:49:17` | `status: 'permanent_failure'` |
| string | `QQ adapter not configured (NOTIFICATION_QQ_BASE_URL/TARGET missing)` | `apps/notification/src/channels/qq.channel-adapter.ts:51:11` | `error: 'QQ adapter not configured (NOTIFICATION_QQ_BASE_URL/TARGET missing)'` |
| string | `QQ_NOT_CONFIGURED` | `apps/notification/src/channels/qq.channel-adapter.ts:52:20` | `errorCode: 'QQ_NOT_CONFIGURED'` |
| string | `private` | `apps/notification/src/channels/qq.channel-adapter.ts:56:41` | `messageType === 'private'` |
| string | `text` | `apps/notification/src/channels/qq.channel-adapter.ts:60:25` | `type: 'text'` |
| string | `ok` | `apps/notification/src/channels/qq.channel-adapter.ts:76:27` | `json.status === 'ok'` |
| string | `sent` | `apps/notification/src/channels/qq.channel-adapter.ts:79:19` | `status: 'sent'` |
| string | `transient_failure` | `apps/notification/src/channels/qq.channel-adapter.ts:87:17` | `status: 'transient_failure'` |
| string | `transient_failure` | `apps/notification/src/channels/qq.channel-adapter.ts:92:17` | `status: 'transient_failure'` |
| string | `NOTIFICATION_HTTP_TIMEOUT_MS` | `apps/notification/src/channels/wechat.channel-adapter.ts:42:31` | `this.config.get<number>('NOTIFICATION_HTTP_TIMEOUT_MS')` |
| string | `permanent_failure` | `apps/notification/src/channels/wechat.channel-adapter.ts:47:17` | `status: 'permanent_failure'` |
| string | `WECOM_WEBHOOK_MISSING` | `apps/notification/src/channels/wechat.channel-adapter.ts:49:20` | `errorCode: 'WECOM_WEBHOOK_MISSING'` |
| string | `text` | `apps/notification/src/channels/wechat.channel-adapter.ts:54:16` | `msgtype: 'text'` |
| string | `sent` | `apps/notification/src/channels/wechat.channel-adapter.ts:67:26` | `status: 'sent'` |
| string | `transient_failure` | `apps/notification/src/channels/wechat.channel-adapter.ts:76:17` | `status: 'transient_failure'` |
| string | `transient_failure` | `apps/notification/src/delivery/alert-channel-delivery.service.ts:117:17` | `status: 'transient_failure'` |
| string | `sent` | `apps/notification/src/delivery/alert-channel-delivery.service.ts:123:27` | `result.status === 'sent'` |
| string | `permanent_failure` | `apps/notification/src/delivery/alert-channel-delivery.service.ts:140:40` | `result.status === 'permanent_failure'` |
| string | `transient_failure` | `apps/notification/src/delivery/alert-channel-delivery.service.ts:153:27` | `result.status === 'transient_failure'` |
| string | `qq` | `apps/notification/src/delivery/alert-channel-delivery.service.ts:203:19` | `channel === 'qq'` |
| string | `feishu` | `apps/notification/src/delivery/alert-channel-delivery.service.ts:204:19` | `channel === 'feishu'` |
| string | `MIST_REALTIME_REDIS_URL` | `apps/notification/src/delivery/alert-delivery-queue.service.ts:34:30` | `config.get<string>('MIST_REALTIME_REDIS_URL')` |
| number | `5000` | `apps/notification/src/delivery/alert-delivery-queue.service.ts:38:25` | `connectTimeout: 5_000` |
| number | `3000` | `apps/notification/src/delivery/alert-delivery-queue.service.ts:39:25` | `commandTimeout: 3_000` |
| string | `waiting` | `apps/notification/src/delivery/alert-delivery-queue.service.ts:101:45` | `this.queue.getJobCounts('waiting', 'active', 'delayed')` |
| string | `active` | `apps/notification/src/delivery/alert-delivery-queue.service.ts:101:56` | `this.queue.getJobCounts('waiting', 'active', 'delayed')` |
| string | `delayed` | `apps/notification/src/delivery/alert-delivery-queue.service.ts:101:66` | `this.queue.getJobCounts('waiting', 'active', 'delayed')` |
| string | ` \| ` | `apps/notification/src/delivery/notification-envelope.ts:113:60` | `xs.filter(Boolean).join(' \| ')` |
| string | `ok` | `apps/notification/src/health/health.controller.ts:9:15` | `status: 'ok'` |
| string | `notification` | `apps/notification/src/health/health.controller.ts:10:16` | `service: 'notification'` |
| string | `notification` | `apps/notification/src/health/health.controller.ts:11:17` | `instance: 'notification'` |
| number | `8006` | `apps/notification/src/main.ts:9:40` | `process.env.PORT ?? 8006` |
| string | `mist-notification` | `apps/notification/src/observability/delivery-metrics.ts:33:34` | `metrics.getMeter('mist-notification', '0.1.0')` |
| string | `0.1.0` | `apps/notification/src/observability/delivery-metrics.ts:33:55` | `metrics.getMeter('mist-notification', '0.1.0')` |
| string | `mist_notification_delivered_total` | `apps/notification/src/observability/delivery-metrics.ts:52:5` | `addChannelGauge( 'mist_notification_delivered_total', 'Delivered strategy alert notifications (proce` |
| string | `Delivered strategy alert notifications (process-local)` | `apps/notification/src/observability/delivery-metrics.ts:53:5` | `addChannelGauge( 'mist_notification_delivered_total', 'Delivered strategy alert notifications (proce` |
| string | `mist_notification_failed_total` | `apps/notification/src/observability/delivery-metrics.ts:57:5` | `addChannelGauge( 'mist_notification_failed_total', 'Failed delivery attempts (process-local)', (s) =` |
| string | `Failed delivery attempts (process-local)` | `apps/notification/src/observability/delivery-metrics.ts:58:5` | `addChannelGauge( 'mist_notification_failed_total', 'Failed delivery attempts (process-local)', (s) =` |
| string | `mist_notification_dead_letter_total` | `apps/notification/src/observability/delivery-metrics.ts:62:5` | `addChannelGauge( 'mist_notification_dead_letter_total', 'Dead-lettered deliveries (process-local)', ` |
| string | `Dead-lettered deliveries (process-local)` | `apps/notification/src/observability/delivery-metrics.ts:63:5` | `addChannelGauge( 'mist_notification_dead_letter_total', 'Dead-lettered deliveries (process-local)', ` |
| string | `mist_notification_attempt_total` | `apps/notification/src/observability/delivery-metrics.ts:67:5` | `addChannelGauge( 'mist_notification_attempt_total', 'Total delivery attempts (process-local)', (s) =` |
| string | `Total delivery attempts (process-local)` | `apps/notification/src/observability/delivery-metrics.ts:68:5` | `addChannelGauge( 'mist_notification_attempt_total', 'Total delivery attempts (process-local)', (s) =` |
| string | `strategy` | `apps/notification/src/observability/delivery-metrics.ts:76:12` | `key: 'strategy'` |
| string | `strategy` | `apps/notification/src/observability/delivery-metrics.ts:76:31` | `label: 'strategy'` |
| string | `ooAlert` | `apps/notification/src/observability/delivery-metrics.ts:77:12` | `key: 'ooAlert'` |
| string | `oo_alert` | `apps/notification/src/observability/delivery-metrics.ts:77:30` | `label: 'oo_alert'` |
| string | `mist_notification_queue_depth` | `apps/notification/src/observability/delivery-metrics.ts:80:28` | `meter .createObservableGauge('mist_notification_queue_depth', { description: 'Alert delivery BullMQ ` |
| string | `Alert delivery BullMQ queue depth (waiting/active/delayed) by queue` | `apps/notification/src/observability/delivery-metrics.ts:82:9` | `description: 'Alert delivery BullMQ queue depth (waiting/active/delayed) by queue'` |
| string | `waiting` | `apps/notification/src/observability/delivery-metrics.ts:88:48` | `state: 'waiting'` |
| string | `active` | `apps/notification/src/observability/delivery-metrics.ts:89:47` | `state: 'active'` |
| string | `delayed` | `apps/notification/src/observability/delivery-metrics.ts:90:48` | `state: 'delayed'` |
| string | `mist-notification` | `apps/notification/src/observability/delivery-metrics.ts:100:34` | `metrics.getMeter('mist-notification', '0.1.0')` |
| string | `0.1.0` | `apps/notification/src/observability/delivery-metrics.ts:100:55` | `metrics.getMeter('mist-notification', '0.1.0')` |
| string | `mist_notification_sweep_recovered_total` | `apps/notification/src/observability/delivery-metrics.ts:102:28` | `meter .createObservableGauge('mist_notification_sweep_recovered_total', { description: 'Stranded PEN` |
| string | `Stranded PENDING events re-enqueued by the delivery sweep (process-local)` | `apps/notification/src/observability/delivery-metrics.ts:104:9` | `description: 'Stranded PENDING events re-enqueued by the delivery sweep (process-local)'` |
| string | `mist-notification-oo-alert` | `apps/notification/src/observability/oo-alert-metrics.ts:19:34` | `metrics.getMeter('mist-notification-oo-alert', '0.1.0')` |
| string | `0.1.0` | `apps/notification/src/observability/oo-alert-metrics.ts:19:64` | `metrics.getMeter('mist-notification-oo-alert', '0.1.0')` |
| string | `mist_oo_alert_total` | `apps/notification/src/observability/oo-alert-metrics.ts:22:28` | `meter .createObservableGauge('mist_oo_alert_total', { description: 'OO health-alert deliveries by st` |
| string | `OO health-alert deliveries by status (sent/failed) and channel (process-local)` | `apps/notification/src/observability/oo-alert-metrics.ts:24:9` | `description: 'OO health-alert deliveries by status (sent/failed) and channel (process-local)'` |
| string | `sent` | `apps/notification/src/observability/oo-alert-metrics.ts:29:41` | `status: 'sent'` |
| string | `failed` | `apps/notification/src/observability/oo-alert-metrics.ts:32:41` | `status: 'failed'` |
| string | `NOTIFICATION_CHANNELS` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:50:34` | `configService.get<string>('NOTIFICATION_CHANNELS')` |
| string | `qq` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:55:35` | `channels.has('qq')` |
| string | `OO_ALERT_FEISHU_WEBHOOK` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:60:35` | `configService.get<string>('OO_ALERT_FEISHU_WEBHOOK')` |
| string | `NOTIFICATION_FEISHU_WEBHOOK` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:61:35` | `configService.get<string>('NOTIFICATION_FEISHU_WEBHOOK')` |
| string | `sent` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:107:29` | `result.status === 'sent'` |
| string | `permanent_failure` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:111:29` | `result.status === 'permanent_failure'` |
| string | `feishu` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:116:23` | `channel === 'feishu'` |
| string | `FEISHU_WEBHOOK_MISSING` | `apps/notification/src/oo-alert/oo-alert-delivery.worker.ts:116:56` | `result.errorCode === 'FEISHU_WEBHOOK_MISSING'` |
| string | `MIST_REALTIME_REDIS_URL` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:27:30` | `config.get<string>('MIST_REALTIME_REDIS_URL')` |
| number | `5000` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:31:25` | `connectTimeout: 5_000` |
| number | `3000` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:32:25` | `commandTimeout: 3_000` |
| number | `3` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:43:17` | `attempts: 3` |
| string | `exponential` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:44:24` | `type: 'exponential'` |
| number | `2000` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:44:46` | `delay: 2_000` |
| number | `1000` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:45:25` | `removeOnComplete: 1_000` |
| string | `waiting` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:55:45` | `this.queue.getJobCounts('waiting', 'active', 'delayed')` |
| string | `active` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:55:56` | `this.queue.getJobCounts('waiting', 'active', 'delayed')` |
| string | `delayed` | `apps/notification/src/oo-alert/oo-alert-queue.service.ts:55:66` | `this.queue.getJobCounts('waiting', 'active', 'delayed')` |
| string | `OO_ALERT_RECEIVER_TOKEN` | `apps/notification/src/oo-alert/oo-alert-receiver.controller.ts:44:46` | `this.config.get<string>('OO_ALERT_RECEIVER_TOKEN')` |
| number | `512` | `apps/notification/src/oo-alert/oo-alert-receiver.controller.ts:81:46` | `JSON.stringify(body).slice(0, 512)` |
| number | `5` | `apps/schedule/src/data-collection.controller.ts:107:26` | `now.getDay() === 5` |
| string | `nightly_2230` | `apps/schedule/src/data-collection.controller.ts:121:17` | `window: 'nightly_2230'` |
| number | `5` | `apps/schedule/src/data-collection.controller.ts:162:41` | `previousTradingDay.getDay() === 5` |
| string | `morning_0630` | `apps/schedule/src/data-collection.controller.ts:170:17` | `window: 'morning_0630'` |
| string | `ok` | `apps/schedule/src/health/health.controller.ts:18:15` | `status: 'ok'` |
| string | `schedule` | `apps/schedule/src/health/health.controller.ts:19:16` | `service: 'schedule'` |
| string | `schedule` | `apps/schedule/src/health/health.controller.ts:20:17` | `instance: 'schedule'` |
| number | `8003` | `apps/schedule/src/main.ts:8:40` | `process.env.PORT ?? 8003` |
| string | `TDX_BASE_URL` | `apps/schedule/src/pre-market-inspection.service.ts:128:38` | `this.configService.get<string>('TDX_BASE_URL')` |
| string | `QMT_BASE_URL` | `apps/schedule/src/pre-market-inspection.service.ts:131:38` | `this.configService.get<string>('QMT_BASE_URL')` |
| number | `5000` | `apps/schedule/src/pre-market-inspection.service.ts:140:37` | `AbortSignal.timeout(5000)` |
| string | `QMT Journal reconciliation required (control plane locked)` | `apps/schedule/src/pre-market-inspection.service.ts:149:13` | `errors.push( 'QMT Journal reconciliation required (control plane locked)', )` |
| string | `1. 首选：重启 QMT 终端 (XtItClient.exe，需人工登录)——bridge 重注册携带新 startedAt 后自动解锁，无需手工文件` | `apps/schedule/src/pre-market-inspection.service.ts:152:13` | `remediation.push( '1. 首选：重启 QMT 终端 (XtItClient.exe，需人工登录)——bridge 重注册携带新 startedAt 后自动解锁，无需手工文件', '2` |
| string | `2. 备选（终端无法重启）：手工生成 F:\quant\MistAPI\datasource\state\context-rebuild-observation.json，字段必须严格为 schemaVersion=1 / observation=qmt_context_rebuilt / affectedJournalSequence=journal 当前 record_sequence / recoveryMode=terminal_process_restarted / operatorEvidenceDigest=64位小写hex / observationTime=RFC3339；格式错误会导致 qmt-datasource 启动 crash loop` | `apps/schedule/src/pre-market-inspection.service.ts:153:13` | `remediation.push( '1. 首选：重启 QMT 终端 (XtItClient.exe，需人工登录)——bridge 重注册携带新 startedAt 后自动解锁，无需手工文件', '2` |
| string | `3. 验证：GET http://qmt-datasource:9002/health → subscriptions.reconciliationRequired=false` | `apps/schedule/src/pre-market-inspection.service.ts:154:13` | `remediation.push( '1. 首选：重启 QMT 终端 (XtItClient.exe，需人工登录)——bridge 重注册携带新 startedAt 后自动解锁，无需手工文件', '2` |
| string | `QMT Journal is corrupted or unreadable` | `apps/schedule/src/pre-market-inspection.service.ts:158:23` | `errors.push('QMT Journal is corrupted or unreadable')` |
| string | `degraded` | `apps/schedule/src/pre-market-inspection.service.ts:164:39` | `startupRecon['phase'] === 'degraded'` |
| number | `5000` | `apps/schedule/src/pre-market-inspection.service.ts:177:37` | `AbortSignal.timeout(5000)` |
| string | `TDX & QMT 数据源就绪，Journal 对账健康` | `apps/schedule/src/pre-market-inspection.service.ts:197:16` | `summary: 'TDX & QMT 数据源就绪，Journal 对账健康'` |
| string | `未获取到前一交易日（首日或日历初始化），跳过 K 线校验` | `apps/schedule/src/pre-market-inspection.service.ts:210:18` | `summary: '未获取到前一交易日（首日或日历初始化），跳过 K 线校验'` |
| string | `当前无 ACTIVE 订阅标的，K 线基线无需校验` | `apps/schedule/src/pre-market-inspection.service.ts:236:18` | `summary: '当前无 ACTIVE 订阅标的，K 线基线无需校验'` |
| number | `10` | `apps/schedule/src/pre-market-inspection.service.ts:268:40` | `missingItems.slice(0, 10)` |
| string | `, ` | `apps/schedule/src/pre-market-inspection.service.ts:270:45` | `[...missingTargets].join(', ')` |
| string | `, ` | `apps/schedule/src/pre-market-inspection.service.ts:301:13` | `Object.entries(bySource) .map(([s, c]) => `${s}: ${c} 标的`) .join(', ')` |
| string | `TDX_BASE_URL` | `apps/schedule/src/pre-market-inspection.service.ts:316:38` | `this.configService.get<string>('TDX_BASE_URL')` |
| string | `QMT_BASE_URL` | `apps/schedule/src/pre-market-inspection.service.ts:319:38` | `this.configService.get<string>('QMT_BASE_URL')` |
| string | `TDX Bridge TCP 未就绪 (bridge_ready=0)` | `apps/schedule/src/pre-market-inspection.service.ts:335:23` | `errors.push('TDX Bridge TCP 未就绪 (bridge_ready=0)')` |
| string | `QMT Bridge TCP 未就绪 (bridge_ready=0)` | `apps/schedule/src/pre-market-inspection.service.ts:352:23` | `errors.push('QMT Bridge TCP 未就绪 (bridge_ready=0)')` |
| string | `实时行情 Bridge / WS 链路异常` | `apps/schedule/src/pre-market-inspection.service.ts:362:18` | `summary: '实时行情 Bridge / WS 链路异常'` |
| string | `TDX / QMT Bridge TCP 与 WebSocket 就绪` | `apps/schedule/src/pre-market-inspection.service.ts:372:16` | `summary: 'TDX / QMT Bridge TCP 与 WebSocket 就绪'` |
| string | `SELECT 1` | `apps/schedule/src/pre-market-inspection.service.ts:384:37` | `this.securityRepo.query('SELECT 1')` |
| string | `SIGNAL_HEALTH_URL` | `apps/schedule/src/pre-market-inspection.service.ts:391:38` | `this.configService.get<string>('SIGNAL_HEALTH_URL')` |
| string | `底层基础设施或服务异常` | `apps/schedule/src/pre-market-inspection.service.ts:414:18` | `summary: '底层基础设施或服务异常'` |
| string | `MySQL 与 Signal 运行正常` | `apps/schedule/src/pre-market-inspection.service.ts:424:16` | `summary: 'MySQL 与 Signal 运行正常'` |
| string | `BACKEND_HEALTH_URL` | `apps/schedule/src/pre-market-inspection.service.ts:433:38` | `this.configService.get<string>('BACKEND_HEALTH_URL')` |
| string | `SIGNAL_HEALTH_URL` | `apps/schedule/src/pre-market-inspection.service.ts:436:38` | `this.configService.get<string>('SIGNAL_HEALTH_URL')` |
| string | `TDX_BASE_URL` | `apps/schedule/src/pre-market-inspection.service.ts:439:38` | `this.configService.get<string>('TDX_BASE_URL')` |
| string | `QMT_BASE_URL` | `apps/schedule/src/pre-market-inspection.service.ts:442:38` | `this.configService.get<string>('QMT_BASE_URL')` |
| string | `OO_ALERT_FEISHU_WEBHOOK` | `apps/schedule/src/pre-market-inspection.service.ts:445:38` | `this.configService.get<string>('OO_ALERT_FEISHU_WEBHOOK')` |
| string | `NOTIFICATION_FEISHU_WEBHOOK` | `apps/schedule/src/pre-market-inspection.service.ts:446:38` | `this.configService.get<string>('NOTIFICATION_FEISHU_WEBHOOK')` |
| string | `飞书告警 Webhook 未配置 (NOTIFICATION_FEISHU_WEBHOOK 缺失)` | `apps/schedule/src/pre-market-inspection.service.ts:461:19` | `errors.push('飞书告警 Webhook 未配置 (NOTIFICATION_FEISHU_WEBHOOK 缺失)')` |
| string | `在 .env 中配置有效飞书群机器人 Webhook: NOTIFICATION_FEISHU_WEBHOOK` | `apps/schedule/src/pre-market-inspection.service.ts:463:9` | `remediation.push( '在 .env 中配置有效飞书群机器人 Webhook: NOTIFICATION_FEISHU_WEBHOOK', )` |
| number | `5000` | `apps/schedule/src/pre-market-inspection.service.ts:470:37` | `AbortSignal.timeout(5000)` |
| string | `on` | `apps/schedule/src/pre-market-inspection.service.ts:487:26` | `prodMode !== 'on'` |
| string | `在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\MistDocker\.env -Key REALTIME_PRODUCTIZATION_MODE -Value on; docker compose up -d --force-recreate mist-backend` | `apps/schedule/src/pre-market-inspection.service.ts:490:13` | `remediation.push( '在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\\MistDocker\\.env -Key REALTIME_PROD` |
| string | `on` | `apps/schedule/src/pre-market-inspection.service.ts:493:27` | `stratMode !== 'on'` |
| string | `在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\MistDocker\.env -Key REALTIME_STRATEGY_MODE -Value on; docker compose up -d --force-recreate mist-backend` | `apps/schedule/src/pre-market-inspection.service.ts:496:13` | `remediation.push( '在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\\MistDocker\\.env -Key REALTIME_STRA` |
| string | `Backend Realtime Redis 处于不可用状态` | `apps/schedule/src/pre-market-inspection.service.ts:500:23` | `errors.push('Backend Realtime Redis 处于不可用状态')` |
| string | `检查 mist-realtime-redis 容器状态及 MIST_REALTIME_REDIS_URL 配置` | `apps/schedule/src/pre-market-inspection.service.ts:502:13` | `remediation.push( '检查 mist-realtime-redis 容器状态及 MIST_REALTIME_REDIS_URL 配置', )` |
| string | `Backend 订阅生命周期自动对账处于禁用状态 (autoReconcile=false)` | `apps/schedule/src/pre-market-inspection.service.ts:507:13` | `errors.push( 'Backend 订阅生命周期自动对账处于禁用状态 (autoReconcile=false)', )` |
| string | `在 MySQL 中执行: INSERT INTO runtime_configs (config_key, config_value) VALUES ('realtime_subscription_auto_reconcile', 'true') ON DUPLICATE KEY UPDATE config_value='true';` | `apps/schedule/src/pre-market-inspection.service.ts:510:13` | `remediation.push( "在 MySQL 中执行: INSERT INTO runtime_configs (config_key, config_value) VALUES ('real` |
| number | `5000` | `apps/schedule/src/pre-market-inspection.service.ts:522:37` | `AbortSignal.timeout(5000)` |
| string | `on` | `apps/schedule/src/pre-market-inspection.service.ts:533:30` | `realtimeMode !== 'on'` |
| string | `在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\MistDocker\.env -Key REALTIME_STRATEGY_MODE -Value on; docker compose up -d --force-recreate mist-signal` | `apps/schedule/src/pre-market-inspection.service.ts:536:13` | `remediation.push( '在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\\MistDocker\\.env -Key REALTIME_STRA` |
| number | `5000` | `apps/schedule/src/pre-market-inspection.service.ts:548:37` | `AbortSignal.timeout(5000)` |
| string | `builtin` | `apps/schedule/src/pre-market-inspection.service.ts:554:22` | `mode !== 'builtin'` |
| number | `5000` | `apps/schedule/src/pre-market-inspection.service.ts:565:37` | `AbortSignal.timeout(5000)` |
| string | `builtin` | `apps/schedule/src/pre-market-inspection.service.ts:571:22` | `mode !== 'builtin'` |
| string | `OO_ALERT_FEISHU_WEBHOOK` | `apps/schedule/src/pre-market-inspection.service.ts:603:38` | `this.configService.get<string>('OO_ALERT_FEISHU_WEBHOOK')` |
| string | `NOTIFICATION_FEISHU_WEBHOOK` | `apps/schedule/src/pre-market-inspection.service.ts:604:38` | `this.configService.get<string>('NOTIFICATION_FEISHU_WEBHOOK')` |
| string | `OO_ALERT_FEISHU_SECRET` | `apps/schedule/src/pre-market-inspection.service.ts:609:38` | `this.configService.get<string>('OO_ALERT_FEISHU_SECRET')` |
| string | `NOTIFICATION_FEISHU_SECRET` | `apps/schedule/src/pre-market-inspection.service.ts:610:38` | `this.configService.get<string>('NOTIFICATION_FEISHU_SECRET')` |
| string | `PASSED` | `apps/schedule/src/pre-market-inspection.service.ts:623:47` | `report.overallStatus === 'PASSED'` |
| string | `全系统就绪，距离 09:15 订阅重置还有 10 分钟，距离 09:30 开盘还有 25 分钟。` | `apps/schedule/src/pre-market-inspection.service.ts:639:9` | `rows.push( '全系统就绪，距离 09:15 订阅重置还有 10 分钟，距离 09:30 开盘还有 25 分钟。', )` |
| string | `————` | `apps/schedule/src/pre-market-inspection.service.ts:642:17` | `rows.push('————', '⚠️ 故障详情与排查指引：')` |
| string | `⚠️ 故障详情与排查指引：` | `apps/schedule/src/pre-market-inspection.service.ts:642:25` | `rows.push('————', '⚠️ 故障详情与排查指引：')` |
| string | `text` | `apps/schedule/src/pre-market-inspection.service.ts:659:35` | `tag: 'text'` |
| string | `text` | `apps/schedule/src/pre-market-inspection.service.ts:662:33` | `tag: 'text'` |
| string | `post` | `apps/schedule/src/pre-market-inspection.service.ts:677:19` | `msg_type: 'post'` |
| number | `1000` | `apps/schedule/src/pre-market-inspection.service.ts:684:58` | `Date.now() / 1000` |
| string | `sha256` | `apps/schedule/src/pre-market-inspection.service.ts:686:33` | `createHmac('sha256', stringToSign)` |
| string | `off` | `apps/signal/src/health/health-state.service.ts:26:34` | `this.realtimeMode === 'off'` |
| string | `off` | `apps/signal/src/health/health-state.service.ts:35:34` | `this.realtimeMode === 'off'` |
| string | `off` | `apps/signal/src/health/health-state.service.ts:46:34` | `this.realtimeMode === 'off'` |
| string | `success` | `apps/signal/src/health/health-state.service.ts:65:27` | `lastRefreshOutcome: 'success'` |
| string | `failed` | `apps/signal/src/health/health-state.service.ts:74:27` | `lastRefreshOutcome: 'failed'` |
| string | `ready` | `apps/signal/src/health/health-state.service.ts:86:14` | `state: 'ready'` |
| string | `running` | `apps/signal/src/health/health-state.service.ts:89:52` | `state: 'running'` |
| string | `ready` | `apps/signal/src/health/health-state.service.ts:117:16` | `state: 'ready'` |
| string | `idle` | `apps/signal/src/health/health-state.service.ts:128:14` | `state: 'idle'` |
| string | `failed` | `apps/signal/src/health/health-state.service.ts:157:20` | `lastOutcome: 'failed'` |
| string | `failed` | `apps/signal/src/health/health-state.service.ts:175:24` | `lastOutcome: 'failed'` |
| string | `idle` | `apps/signal/src/health/health-state.service.ts:179:38` | `state: 'idle'` |
| string | `ok` | `apps/signal/src/health/health-state.service.ts:184:15` | `status: 'ok'` |
| string | `signal` | `apps/signal/src/health/health-state.service.ts:185:16` | `service: 'signal'` |
| string | `signal` | `apps/signal/src/health/health-state.service.ts:186:17` | `instance: 'signal'` |
| string | `0.0.0.0` | `apps/signal/src/main.ts:17:15` | `host: '0.0.0.0'` |
| number | `9010` | `apps/signal/src/main.ts:18:53` | `process.env.SIGNAL_RPC_PORT ?? 9010` |
| number | `8010` | `apps/signal/src/main.ts:25:40` | `process.env.PORT ?? 8010` |
| string | `signal_metrics` | `apps/signal/src/observability/metrics.ts:9:38` | `createIdempotentMetricRegistration('signal_metrics', () => { const meter = metrics.getMeter('signal'` |
| string | `signal` | `apps/signal/src/observability/metrics.ts:10:36` | `metrics.getMeter('signal', '0.1.0')` |
| string | `0.1.0` | `apps/signal/src/observability/metrics.ts:10:46` | `metrics.getMeter('signal', '0.1.0')` |
| string | `mist_signal_ready` | `apps/signal/src/observability/metrics.ts:13:30` | `meter .createObservableGauge('mist_signal_ready', { description: 'Signal registry ready status (1 fo` |
| string | `Signal registry ready status (1 for ready, 0 for starting/error)` | `apps/signal/src/observability/metrics.ts:15:11` | `description: 'Signal registry ready status (1 for ready, 0 for starting/error)'` |
| string | `mist_signal_definition_count` | `apps/signal/src/observability/metrics.ts:22:30` | `meter .createObservableGauge('mist_signal_definition_count', { description: 'Number of active strate` |
| string | `Number of active strategy definitions loaded in signal registry` | `apps/signal/src/observability/metrics.ts:24:11` | `description: 'Number of active strategy definitions loaded in signal registry'` |
| string | `mist_signal_execution_plan_count` | `apps/signal/src/observability/metrics.ts:31:30` | `meter .createObservableGauge('mist_signal_execution_plan_count', { description: 'Number of compiled ` |
| string | `Number of compiled strategy execution plans in signal registry` | `apps/signal/src/observability/metrics.ts:33:11` | `description: 'Number of compiled strategy execution plans in signal registry'` |
| string | `mist_signal_queue_processed_total` | `apps/signal/src/observability/metrics.ts:40:30` | `meter .createObservableGauge('mist_signal_queue_processed_total', { description: 'Total jobs process` |
| string | `Total jobs processed by signal evaluation queue` | `apps/signal/src/observability/metrics.ts:41:22` | `description: 'Total jobs processed by signal evaluation queue'` |
| string | `mist_signal_queue_failed_total` | `apps/signal/src/observability/metrics.ts:48:30` | `meter .createObservableGauge('mist_signal_queue_failed_total', { description: 'Total jobs failed in ` |
| string | `Total jobs failed in signal evaluation queue` | `apps/signal/src/observability/metrics.ts:49:22` | `description: 'Total jobs failed in signal evaluation queue'` |
| number | `1000` | `apps/signal/src/observability/runtime-observability.service.ts:40:49` | `entry.duration / 1_000` |
| string | `failed` | `apps/signal/src/realtime/candle-finalized-bullmq.worker.ts:79:46` | `diagnostics.lastPersistenceOutcome === 'failed'` |
| string | `trading_day_validation:before` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:102:43` | `this.assertWithinDeadline(deadlineAt, 'trading_day_validation:before')` |
| string | `expired_trading_day` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:106:24` | `completed('expired_trading_day')` |
| string | `trading_day_validation:after` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:111:43` | `this.assertWithinDeadline(deadlineAt, 'trading_day_validation:after')` |
| string | `out_of_order_trigger_discarded` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:130:24` | `completed('out_of_order_trigger_discarded')` |
| string | `sealed` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:134:27` | `payload.outcome === 'sealed'` |
| string | `redis_observation` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:135:43` | `this.runStage(deadlineAt, 'redis_observation', () => this.resolveSealed(trigger, payload.triggerPric` |
| string | `completed` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:147:20` | `outcome: 'completed'` |
| string | `analysis_evaluation` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:170:9` | `this.runStage( deadlineAt, 'analysis_evaluation', () => this.evaluation.evaluate(bar, executionPlans` |
| string | `on` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:175:27` | `this.mode === 'on'` |
| string | `persistence` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:182:15` | `this.runStage( deadlineAt, 'persistence', async (): Promise<LiveStrategyPersistenceOutcome> => { con` |
| string | `completed` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:198:16` | `outcome: 'completed'` |
| string | `sealed` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:238:33` | `observation.outcome !== 'sealed'` |
| string | `tdx` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:258:24` | `source !== 'tdx'` |
| string | `qmt` | `apps/signal/src/realtime/candle-finalized-job.processor.ts:258:44` | `source !== 'qmt'` |
| string | `SET SESSION innodb_lock_wait_timeout = 3` | `apps/signal/src/realtime/live-strategy-persistence.service.ts:41:29` | `manager.query('SET SESSION innodb_lock_wait_timeout = 3')` |
| string | `MIST_REALTIME_REDIS_URL` | `apps/signal/src/realtime/notification/bullmq-strategy-alert-delivery-handoff.service.ts:35:30` | `config.get<string>('MIST_REALTIME_REDIS_URL')` |
| number | `5000` | `apps/signal/src/realtime/notification/bullmq-strategy-alert-delivery-handoff.service.ts:39:25` | `connectTimeout: 5_000` |
| number | `3000` | `apps/signal/src/realtime/notification/bullmq-strategy-alert-delivery-handoff.service.ts:40:25` | `commandTimeout: 3_000` |
| string | `MIST_REALTIME_REDIS_URL` | `apps/signal/src/realtime/signal-realtime-redis.service.ts:28:41` | `this.config.get<string>('MIST_REALTIME_REDIS_URL')` |
| number | `5000` | `apps/signal/src/realtime/signal-realtime-redis.service.ts:37:23` | `connectTimeout: 5_000` |
| number | `3000` | `apps/signal/src/realtime/signal-realtime-redis.service.ts:38:23` | `commandTimeout: 3_000` |
| number | `10` | `apps/signal/src/realtime/signal-realtime-redis.service.ts:40:17` | `times > 10` |
| number | `500` | `apps/signal/src/realtime/signal-realtime-redis.service.ts:40:46` | `times * 500` |
| number | `5000` | `apps/signal/src/realtime/signal-realtime-redis.service.ts:40:51` | `Math.min(times * 500, 5_000)` |
| string | `discarded` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:50:29` | `trigger.outcome === 'discarded'` |
| string | `discarded` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:52:18` | `outcome: 'discarded'` |
| string | `sealed` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:69:16` | `outcome: 'sealed'` |
| string | `sealed` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:121:20` | `outcome: 'sealed'` |
| string | `complete` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:158:11` | `type: 'complete'` |
| number | `60000` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:180:61` | `Math.floor(position.minuteOffset / period) * period * 60_000` |
| string | `volume` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:210:34` | `sumQuantity(ordered, 'volume')` |
| string | `amount` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:211:34` | `sumQuantity(ordered, 'amount')` |
| number | `4` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:255:28` | `tradingDay.slice(0, 4)` |
| number | `4` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:255:51` | `tradingDay.slice(4, 6)` |
| number | `6` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:255:54` | `tradingDay.slice(4, 6)` |
| number | `6` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:255:77` | `tradingDay.slice(6, 8)` |
| number | `8` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:255:80` | `tradingDay.slice(6, 8)` |
| number | `60000` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:285:35` | `trigger.timestamp.getTime() % 60_000` |
| number | `800` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:298:29` | `criteria.requiredBars > 800` |
| number | `60000` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:299:35` | `criteria.anchorAt.getTime() % 60_000` |
| string | `tdx` | `apps/signal/src/realtime/signal-strategy-market-data.adapter.ts:306:21` | `source === 'tdx'` |
| string | `off` | `apps/signal/src/signal-app.module.ts:100:16` | `mode === 'off'` |
| string | `chan_bsp` | `apps/signal/src/signal-registry.service.ts:72:49` | `compiled.executionPlan.sourceKind === 'chan_bsp'` |
| number | `5` | `apps/signal/src/signal-registry.service.ts:140:26` | `period === 5` |
| number | `15` | `apps/signal/src/signal-registry.service.ts:141:26` | `period === 15` |
| number | `30` | `apps/signal/src/signal-registry.service.ts:142:26` | `period === 30` |
| number | `60` | `apps/signal/src/signal-registry.service.ts:143:26` | `period === 60` |
| string | `decision_flow` | `apps/signal/src/signal-registry.service.ts:307:11` | `kind: 'decision_flow'` |
| number | `10001` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:465:9` | `10_001 + index * 37` |
| number | `37` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:465:26` | `index * 37` |
| number | `5` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:465:40` | `index % 5` |
| number | `11` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:465:45` | `(index % 5) * 11` |
| string | `000001` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:466:13` | `symbol: '000001'` |
| number | `11` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:472:21` | `index % 11` |
| number | `100000` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:472:46` | `100_000 + index * 137` |
| number | `137` | `libs/chancore/src/chan-duan-anchor.characterization.fixture.ts:472:64` | `index * 137` |
| number | `10001` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:77:9` | `10_001 + index * 37` |
| number | `37` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:77:26` | `index * 37` |
| number | `5` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:77:40` | `index % 5` |
| number | `11` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:77:45` | `(index % 5) * 11` |
| string | `000001` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:78:13` | `symbol: '000001'` |
| number | `11` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:84:21` | `index % 11` |
| number | `100000` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:84:46` | `100_000 + index * 137` |
| number | `137` | `libs/chancore/src/chan-full-output.characterization.fixture.ts:84:64` | `index * 137` |
| string | `id must be a positive safe integer` | `libs/chancore/src/internal/assert-chan-k-series.ts:15:31` | `inputError(index, 'id must be a positive safe integer')` |
| string | `symbol must be a non-empty string` | `libs/chancore/src/internal/assert-chan-k-series.ts:23:31` | `inputError(index, 'symbol must be a non-empty string')` |
| string | `time must be a valid Date` | `libs/chancore/src/internal/assert-chan-k-series.ts:31:31` | `inputError(index, 'time must be a valid Date')` |
| string | `time must be strictly increasing` | `libs/chancore/src/internal/assert-chan-k-series.ts:35:31` | `inputError(index, 'time must be strictly increasing')` |
| string | `high must be greater than or equal to low` | `libs/chancore/src/internal/assert-chan-k-series.ts:45:31` | `inputError(index, 'high must be greater than or equal to low')` |
| number | `3` | `libs/chancore/src/internal/bi-channel-policy.ts:266:31` | `internalBis.length >= 3` |
| number | `5` | `libs/chancore/src/internal/bi-channel.ts:221:43` | `mergedBis.length >= 5` |
| number | `3` | `libs/chancore/src/internal/bi-channel.ts:360:36` | `channel.bis.length >= 3` |
| number | `4` | `libs/chancore/src/internal/bi-channel.ts:362:65` | `channel.type === ChannelType.UnComplete ? 4 : 5` |
| number | `5` | `libs/chancore/src/internal/bi-channel.ts:362:69` | `channel.type === ChannelType.UnComplete ? 4 : 5` |
| string | `candidate` | `libs/chancore/src/internal/bi.ts:377:55` | `this.assertPhaseATimeStackCompleteBi(candidate, 'candidate')` |
| string | `stack tail` | `libs/chancore/src/internal/bi.ts:381:56` | `this.assertPhaseATimeStackCompleteBi(previous, 'stack tail')` |
| number | `3` | `libs/chancore/src/internal/bi.ts:386:30` | `stack.length >= 3` |
| number | `3` | `libs/chancore/src/internal/bi.ts:387:44` | `stack.length - 3` |
| string | `first` | `libs/chancore/src/internal/bi.ts:390:53` | `this.assertPhaseATimeStackCompleteBi(first, 'first')` |
| string | `middle` | `libs/chancore/src/internal/bi.ts:391:54` | `this.assertPhaseATimeStackCompleteBi(middle, 'middle')` |
| string | `third` | `libs/chancore/src/internal/bi.ts:392:53` | `this.assertPhaseATimeStackCompleteBi(third, 'third')` |
| string | `merged Bi` | `libs/chancore/src/internal/bi.ts:404:54` | `this.assertPhaseATimeStackCompleteBi(merged, 'merged Bi')` |
| number | `3` | `libs/chancore/src/internal/bi.ts:412:37` | `stack.length - 3` |
| number | `3` | `libs/chancore/src/internal/bi.ts:412:40` | `stack.splice(stack.length - 3, 3, replacement)` |
| string | `bi1` | `libs/chancore/src/internal/bi.ts:495:32` | `this.assertCompleteBi(bi1, 'bi1')` |
| string | `bi2` | `libs/chancore/src/internal/bi.ts:496:32` | `this.assertCompleteBi(bi2, 'bi2')` |
| string | `bi1` | `libs/chancore/src/internal/bi.ts:522:32` | `this.assertCompleteBi(bi1, 'bi1')` |
| string | `bi2` | `libs/chancore/src/internal/bi.ts:523:32` | `this.assertCompleteBi(bi2, 'bi2')` |
| string | `bi3` | `libs/chancore/src/internal/bi.ts:524:32` | `this.assertCompleteBi(bi3, 'bi3')` |
| string | `up-down-up` | `libs/chancore/src/internal/bi.ts:531:12` | `case 'up-down-up': { return ( bi1.startFenxing.low <= bi2.endFenxing.low && bi2.startFenxing.high <=` |
| string | `down-up-down` | `libs/chancore/src/internal/bi.ts:537:12` | `case 'down-up-down': return ( bi1.startFenxing.high >= bi2.endFenxing.high && bi2.startFenxing.low >` |
| string | `bi1` | `libs/chancore/src/internal/bi.ts:551:32` | `this.assertCompleteBi(bi1, 'bi1')` |
| string | `bi2` | `libs/chancore/src/internal/bi.ts:552:32` | `this.assertCompleteBi(bi2, 'bi2')` |
| string | `bi1` | `libs/chancore/src/internal/bi.ts:583:32` | `this.assertCompleteBi(bi1, 'bi1')` |
| string | `bi3` | `libs/chancore/src/internal/bi.ts:584:32` | `this.assertCompleteBi(bi3, 'bi3')` |
| string | `none` | `libs/chancore/src/internal/bi.ts:807:45` | `type: 'none'` |
| string | `none` | `libs/chancore/src/internal/bi.ts:811:45` | `type: 'none'` |
| string | `a_contains_b` | `libs/chancore/src/internal/bi.ts:817:46` | `type: 'a_contains_b'` |
| string | `b_contains_a` | `libs/chancore/src/internal/bi.ts:819:46` | `type: 'b_contains_a'` |
| string | `a_contains_b` | `libs/chancore/src/internal/bi.ts:824:46` | `type: 'a_contains_b'` |
| string | `b_contains_a` | `libs/chancore/src/internal/bi.ts:826:46` | `type: 'b_contains_a'` |
| string | `none` | `libs/chancore/src/internal/bi.ts:830:43` | `type: 'none'` |
| number | `3` | `libs/chancore/src/internal/channel-lifecycle.ts:68:22` | `items.length < 3` |
| number | `9` | `libs/chancore/src/internal/duan-channel.ts:148:38` | `cand.duans.length >= 9` |
| number | `3` | `libs/chancore/src/internal/duan-channel.ts:338:32` | `channel.duans.length < 3` |
| number | `5` | `libs/chancore/src/internal/duan.ts:50:24` | `reverseStart + 5` |
| number | `3` | `libs/chancore/src/internal/duan.ts:52:37` | `reverseStart + 3` |
| number | `5` | `libs/chancore/src/internal/duan.ts:53:37` | `reverseStart + 5` |
| number | `5` | `libs/chancore/src/internal/duan.ts:69:24` | `reverseStart + 5` |
| number | `3` | `libs/chancore/src/internal/duan.ts:71:37` | `reverseStart + 3` |
| number | `5` | `libs/chancore/src/internal/duan.ts:72:37` | `reverseStart + 5` |
| number | `3` | `libs/chancore/src/internal/duan.ts:118:39` | `bis.length - 3` |
| string | `queue_full` | `libs/contracts/src/backtest/backtest-run-submit.contract.ts:39:15` | `value !== 'queue_full'` |
| string | `not_ready` | `libs/contracts/src/backtest/backtest-run-submit.contract.ts:40:15` | `value !== 'not_ready'` |
| string | `run_failed` | `libs/contracts/src/backtest/backtest-run-submit.contract.ts:41:15` | `value !== 'run_failed'` |
| number | `4` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:62:47` | `tradingDay.slice(0, 4)` |
| number | `4` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:62:70` | `tradingDay.slice(4, 6)` |
| number | `6` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:62:73` | `tradingDay.slice(4, 6)` |
| number | `6` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:62:96` | `tradingDay.slice(6, 8)` |
| number | `8` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:62:99` | `tradingDay.slice(6, 8)` |
| number | `24` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:67:30` | `24 * 60` |
| number | `60` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:67:35` | `24 * 60` |
| number | `60000` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:67:40` | `24 * 60 * 60_000` |
| number | `1000` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:67:50` | `(start + 24 * 60 * 60_000) / 1_000` |
| string | `due member` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:79:5` | `assertRealtimeRedisBytes( 'due member', member, REALTIME_REDIS_RECORD_LIMITS.dueMember, )` |
| string | `due member` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:92:5` | `assertRealtimeRedisBytes( 'due member', member, REALTIME_REDIS_RECORD_LIMITS.dueMember, )` |
| number | `3` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:97:24` | `parts.length !== 3` |
| string | `provisional` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:129:17` | `value.q !== 'provisional'` |
| string | `tdx` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:182:17` | `value !== 'tdx'` |
| string | `qmt` | `libs/contracts/src/realtime/realtime-candle-redis.contract.ts:182:36` | `value !== 'qmt'` |
| string | `tdx` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:69:24` | `input.source !== 'tdx'` |
| string | `qmt` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:69:50` | `input.source !== 'qmt'` |
| string | `1m` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:72:24` | `input.period !== '1m'` |
| string | `sealed` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:82:25` | `input.outcome === 'sealed'` |
| string | `1m` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:95:15` | `period: '1m'` |
| string | `sealed` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:97:16` | `outcome: 'sealed'` |
| string | `discarded` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:101:25` | `input.outcome === 'discarded'` |
| string | `1m` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:111:15` | `period: '1m'` |
| string | `discarded` | `libs/contracts/src/signal/candle-finalized-trigger.contract.ts:113:16` | `outcome: 'discarded'` |
| string | `upserted` | `libs/contracts/src/signal/signal-registry-refresh.contract.ts:51:23` | `value.action !== 'upserted'` |
| string | `removed` | `libs/contracts/src/signal/signal-registry-refresh.contract.ts:51:54` | `value.action !== 'removed'` |
| string | `qq` | `libs/contracts/src/signal/strategy-alert-delivery.contract.ts:110:23` | `input.channel !== 'qq'` |
| string | `wechat` | `libs/contracts/src/signal/strategy-alert-delivery.contract.ts:111:23` | `input.channel !== 'wechat'` |
| string | `feishu` | `libs/contracts/src/signal/strategy-alert-delivery.contract.ts:112:23` | `input.channel !== 'feishu'` |
| number | `37` | `libs/decimal/src/decimal8.ts:19:22` | `value.length > 37` |
| number | `28` | `libs/decimal/src/decimal8.ts:30:24` | `integer.length > 28` |
| number | `37` | `libs/decimal/src/decimal8.ts:49:24` | `value.length > 37` |
| number | `8` | `libs/decimal/src/decimal8.ts:55:65` | `fraction.padEnd(8, '0')` |
| number | `8` | `libs/decimal/src/decimal8.ts:74:17` | `fraction .toString() .padStart(8, '0')` |
| number | `8` | `libs/decimal/src/decimal8.ts:113:61` | `places > 8` |
| number | `8` | `libs/decimal/src/decimal8.ts:116:34` | `8 - places` |
| number | `10000` | `libs/decimal/src/decimal8.ts:163:18` | `factor === 10_000` |
| string | `v` | `libs/indicators/src/classic/adx.ts:9:23` | `pl.Series('v', arr as any)` |
| string | `tail` | `libs/indicators/src/classic/adx.ts:13:32` | `pl.Series('tail', tail as any)` |
| string | `high` | `libs/indicators/src/classic/adx.ts:38:21` | `pl.Series('high', high as any)` |
| string | `low` | `libs/indicators/src/classic/adx.ts:39:20` | `pl.Series('low', low as any)` |
| string | `high` | `libs/indicators/src/classic/adx.ts:43:27` | `pl.col('high')` |
| string | `low` | `libs/indicators/src/classic/adx.ts:44:26` | `pl.col('low')` |
| string | `high` | `libs/indicators/src/classic/adx.ts:47:22` | `pl.col('high')` |
| string | `low` | `libs/indicators/src/classic/adx.ts:47:41` | `pl.col('low')` |
| string | `high` | `libs/indicators/src/classic/adx.ts:48:22` | `pl.col('high')` |
| string | `low` | `libs/indicators/src/classic/adx.ts:49:22` | `pl.col('low')` |
| string | `high` | `libs/indicators/src/classic/adx.ts:53:25` | `pl.col('high')` |
| string | `low` | `libs/indicators/src/classic/adx.ts:54:39` | `pl.col('low')` |
| string | `tr` | `libs/indicators/src/classic/adx.ts:67:18` | `trExpr.alias('tr')` |
| string | `plusDm` | `libs/indicators/src/classic/adx.ts:68:18` | `plusDm.alias('plusDm')` |
| string | `minusDm` | `libs/indicators/src/classic/adx.ts:69:19` | `minusDm.alias('minusDm')` |
| string | `tr` | `libs/indicators/src/classic/adx.ts:72:33` | `selected.getColumn('tr')` |
| string | `plusDm` | `libs/indicators/src/classic/adx.ts:73:34` | `selected.getColumn('plusDm')` |
| string | `minusDm` | `libs/indicators/src/classic/adx.ts:74:34` | `selected.getColumn('minusDm')` |
| string | `tr` | `libs/indicators/src/classic/adx.ts:89:18` | `pl.col('tr')` |
| string | `pdm` | `libs/indicators/src/classic/adx.ts:90:18` | `pl.col('pdm')` |
| string | `tr` | `libs/indicators/src/classic/adx.ts:90:36` | `pl.col('tr')` |
| string | `tr` | `libs/indicators/src/classic/adx.ts:93:18` | `pl.col('tr')` |
| string | `mdm` | `libs/indicators/src/classic/adx.ts:94:18` | `pl.col('mdm')` |
| string | `tr` | `libs/indicators/src/classic/adx.ts:94:36` | `pl.col('tr')` |
| string | `dx` | `libs/indicators/src/classic/adx.ts:105:26` | `dxExpr.alias('dx')` |
| string | `dx` | `libs/indicators/src/classic/adx.ts:106:16` | `diDf .select(dxExpr.alias('dx')) .getColumn('dx')` |
| string | `v` | `libs/indicators/src/classic/atr.ts:14:23` | `pl.Series('v', arr as any)` |
| string | `tail` | `libs/indicators/src/classic/atr.ts:18:32` | `pl.Series('tail', tail as any)` |
| number | `14` | `libs/indicators/src/classic/atr.ts:27:20` | `period: number = 14` |
| string | `high` | `libs/indicators/src/classic/atr.ts:49:21` | `pl.Series('high', high as any)` |
| string | `low` | `libs/indicators/src/classic/atr.ts:50:20` | `pl.Series('low', low as any)` |
| string | `high` | `libs/indicators/src/classic/atr.ts:54:22` | `pl.col('high')` |
| string | `low` | `libs/indicators/src/classic/atr.ts:54:41` | `pl.col('low')` |
| string | `high` | `libs/indicators/src/classic/atr.ts:55:22` | `pl.col('high')` |
| string | `low` | `libs/indicators/src/classic/atr.ts:56:22` | `pl.col('low')` |
| string | `tr` | `libs/indicators/src/classic/atr.ts:62:26` | `trExpr.alias('tr')` |
| string | `tr` | `libs/indicators/src/classic/atr.ts:63:16` | `df .select(trExpr.alias('tr')) .getColumn('tr')` |
| number | `14` | `libs/indicators/src/classic/atr.ts:80:20` | `period: number = 14` |
| string | `price` | `libs/indicators/src/classic/bollinger.ts:65:23` | `pl.Series('price', prices as any)` |
| string | `mean` | `libs/indicators/src/classic/bollinger.ts:75:28` | `pl.col('mean')` |
| string | `std` | `libs/indicators/src/classic/bollinger.ts:75:47` | `pl.col('std')` |
| string | `mean` | `libs/indicators/src/classic/bollinger.ts:76:28` | `pl.col('mean')` |
| string | `std` | `libs/indicators/src/classic/bollinger.ts:76:47` | `pl.col('std')` |
| string | `mean` | `libs/indicators/src/classic/bollinger.ts:78:18` | `pl.col('mean')` |
| string | `mean` | `libs/indicators/src/classic/bollinger.ts:79:47` | `pl.col('mean')` |
| string | `mean` | `libs/indicators/src/classic/bollinger.ts:83:12` | `pl.col('mean')` |
| string | `upper` | `libs/indicators/src/classic/bollinger.ts:84:21` | `upperExpr.alias('upper')` |
| string | `lower` | `libs/indicators/src/classic/bollinger.ts:85:21` | `lowerExpr.alias('lower')` |
| string | `bandwidth` | `libs/indicators/src/classic/bollinger.ts:86:18` | `bwExpr.alias('bandwidth')` |
| string | `mean` | `libs/indicators/src/classic/bollinger.ts:89:42` | `calculated.getColumn('mean')` |
| string | `upper` | `libs/indicators/src/classic/bollinger.ts:90:41` | `calculated.getColumn('upper')` |
| string | `lower` | `libs/indicators/src/classic/bollinger.ts:91:41` | `calculated.getColumn('lower')` |
| string | `bandwidth` | `libs/indicators/src/classic/bollinger.ts:92:38` | `calculated.getColumn('bandwidth')` |
| number | `13` | `libs/indicators/src/classic/dual-ma.ts:19:46` | `params?.shortPeriod ?? 13` |
| number | `60` | `libs/indicators/src/classic/dual-ma.ts:20:44` | `params?.longPeriod ?? 60` |
| number | `9` | `libs/indicators/src/classic/kdj.ts:36:36` | `params?.period ?? 9` |
| number | `3` | `libs/indicators/src/classic/kdj.ts:37:44` | `params?.kSmoothing ?? 3` |
| number | `3` | `libs/indicators/src/classic/kdj.ts:38:44` | `params?.dSmoothing ?? 3` |
| string | `high` | `libs/indicators/src/classic/kdj.ts:51:21` | `pl.Series('high', high as any)` |
| string | `low` | `libs/indicators/src/classic/kdj.ts:52:20` | `pl.Series('low', low as any)` |
| string | `low` | `libs/indicators/src/classic/kdj.ts:55:23` | `pl.col('low')` |
| string | `high` | `libs/indicators/src/classic/kdj.ts:56:24` | `pl.col('high')` |
| number | `50` | `libs/indicators/src/classic/kdj.ts:60:18` | `pl.lit(50)` |
| string | `fk` | `libs/indicators/src/classic/kdj.ts:64:29` | `fastKExpr.alias('fk')` |
| string | `fk` | `libs/indicators/src/classic/kdj.ts:65:16` | `df .select(fastKExpr.alias('fk')) .getColumn('fk')` |
| string | `middle` | `libs/indicators/src/classic/keltner.ts:74:34` | `pl.Series('middle', middle as any)` |
| string | `atr` | `libs/indicators/src/classic/keltner.ts:75:31` | `pl.Series('atr', atrArr as any)` |
| string | `middle` | `libs/indicators/src/classic/keltner.ts:82:28` | `pl.col('middle')` |
| string | `atr` | `libs/indicators/src/classic/keltner.ts:82:49` | `pl.col('atr')` |
| string | `middle` | `libs/indicators/src/classic/keltner.ts:83:28` | `pl.col('middle')` |
| string | `atr` | `libs/indicators/src/classic/keltner.ts:83:49` | `pl.col('atr')` |
| string | `middle` | `libs/indicators/src/classic/keltner.ts:86:12` | `pl.col('middle')` |
| string | `upper` | `libs/indicators/src/classic/keltner.ts:87:21` | `upperExpr.alias('upper')` |
| string | `lower` | `libs/indicators/src/classic/keltner.ts:88:21` | `lowerExpr.alias('lower')` |
| string | `upper` | `libs/indicators/src/classic/keltner.ts:91:38` | `calculated.getColumn('upper')` |
| string | `lower` | `libs/indicators/src/classic/keltner.ts:92:38` | `calculated.getColumn('lower')` |
| string | `v` | `libs/indicators/src/classic/macd.ts:32:23` | `pl.Series('v', arr as any)` |
| string | `tail` | `libs/indicators/src/classic/macd.ts:36:32` | `pl.Series('tail', tail as any)` |
| string | `volume` | `libs/indicators/src/classic/obv.ts:43:23` | `pl.Series('volume', volumes as any)` |
| string | `volume` | `libs/indicators/src/classic/obv.ts:54:32` | `pl.col('volume')` |
| string | `obv` | `libs/indicators/src/classic/obv.ts:55:61` | `signedVolExpr.cumSum().alias('obv')` |
| string | `obv` | `libs/indicators/src/classic/obv.ts:57:39` | `calculated.getColumn('obv')` |
| number | `20` | `libs/indicators/src/classic/rpp.ts:22:20` | `window: number = 20` |
| string | `high` | `libs/indicators/src/classic/rpp.ts:45:21` | `pl.Series('high', highs as any)` |
| string | `low` | `libs/indicators/src/classic/rpp.ts:46:20` | `pl.Series('low', lows as any)` |
| string | `low` | `libs/indicators/src/classic/rpp.ts:50:25` | `pl.col('low')` |
| string | `high` | `libs/indicators/src/classic/rpp.ts:51:26` | `pl.col('high')` |
| number | `0.5` | `libs/indicators/src/classic/rpp.ts:57:23` | `pl.lit(0.5)` |
| string | `rpp` | `libs/indicators/src/classic/rpp.ts:59:46` | `rppExpr.alias('rpp')` |
| string | `rpp` | `libs/indicators/src/classic/rpp.ts:61:39` | `calculated.getColumn('rpp')` |
| number | `20` | `libs/indicators/src/classic/rpp.ts:76:20` | `window: number = 20` |
| string | `v` | `libs/indicators/src/classic/rsi.ts:9:23` | `pl.Series('v', arr as any)` |
| string | `tail` | `libs/indicators/src/classic/rsi.ts:13:32` | `pl.Series('tail', tail as any)` |
| number | `14` | `libs/indicators/src/classic/rsi.ts:20:20` | `period: number = 14` |
| string | `ignore` | `libs/indicators/src/classic/rsi.ts:32:40` | `pl.col('close').diff(1, 'ignore')` |
| string | `gain` | `libs/indicators/src/classic/rsi.ts:36:43` | `gainExpr.alias('gain')` |
| string | `loss` | `libs/indicators/src/classic/rsi.ts:36:67` | `lossExpr.alias('loss')` |
| string | `gain` | `libs/indicators/src/classic/rsi.ts:38:34` | `diffDf.getColumn('gain')` |
| string | `loss` | `libs/indicators/src/classic/rsi.ts:39:35` | `diffDf.getColumn('loss')` |
| string | `gain` | `libs/indicators/src/classic/rsi.ts:48:21` | `pl.col('gain')` |
| string | `loss` | `libs/indicators/src/classic/rsi.ts:48:40` | `pl.col('loss')` |
| string | `loss` | `libs/indicators/src/classic/rsi.ts:50:18` | `pl.col('loss')` |
| string | `rsi` | `libs/indicators/src/classic/rsi.ts:55:27` | `rsiExpr.alias('rsi')` |
| string | `rsi` | `libs/indicators/src/classic/rsi.ts:56:16` | `rsiDf .select(rsiExpr.alias('rsi')) .getColumn('rsi')` |
| number | `5` | `libs/indicators/src/classic/volume.ts:33:45` | `[5, 10, 20]` |
| number | `10` | `libs/indicators/src/classic/volume.ts:33:48` | `[5, 10, 20]` |
| number | `20` | `libs/indicators/src/classic/volume.ts:33:52` | `[5, 10, 20]` |
| string | `volume` | `libs/indicators/src/classic/volume.ts:47:23` | `pl.Series('volume', volumes as any)` |
| string | `volume` | `libs/indicators/src/classic/volume.ts:61:31` | `pl.col('volume')` |
| string | `volume` | `libs/indicators/src/classic/volume.ts:64:18` | `pl.col('volume')` |
| string | `volume` | `libs/indicators/src/classic/volume.ts:68:12` | `pl.col('volume')` |
| string | `vma5` | `libs/indicators/src/classic/volume.ts:69:12` | `pl.col('vma5')` |
| string | `vma10` | `libs/indicators/src/classic/volume.ts:70:12` | `pl.col('vma10')` |
| string | `vma20` | `libs/indicators/src/classic/volume.ts:71:12` | `pl.col('vma20')` |
| string | `ratio` | `libs/indicators/src/classic/volume.ts:72:21` | `ratioExpr.alias('ratio')` |
| string | `volume` | `libs/indicators/src/classic/volume.ts:76:39` | `calculated.getColumn('volume')` |
| string | `vma5` | `libs/indicators/src/classic/volume.ts:77:40` | `calculated.getColumn('vma5')` |
| string | `vma10` | `libs/indicators/src/classic/volume.ts:78:41` | `calculated.getColumn('vma10')` |
| string | `vma20` | `libs/indicators/src/classic/volume.ts:79:41` | `calculated.getColumn('vma20')` |
| string | `ratio` | `libs/indicators/src/classic/volume.ts:80:41` | `calculated.getColumn('ratio')` |
| number | `5` | `libs/indicators/src/classic/volume.ts:99:45` | `[5, 10, 20]` |
| number | `10` | `libs/indicators/src/classic/volume.ts:99:48` | `[5, 10, 20]` |
| number | `20` | `libs/indicators/src/classic/volume.ts:99:52` | `[5, 10, 20]` |
| string | `price` | `libs/indicators/src/classic/vpci.ts:71:29` | `pl.Series('price', prices as any)` |
| string | `volume` | `libs/indicators/src/classic/vpci.ts:72:29` | `pl.Series('volume', volumes as any)` |
| string | `price` | `libs/indicators/src/classic/vpci.ts:79:25` | `pl.col('price')` |
| string | `volume` | `libs/indicators/src/classic/vpci.ts:79:45` | `pl.col('volume')` |
| string | `pv` | `libs/indicators/src/classic/vpci.ts:80:47` | `pvExpr.alias('pv')` |
| string | `pv` | `libs/indicators/src/classic/vpci.ts:83:29` | `pl.col('pv')` |
| string | `volume` | `libs/indicators/src/classic/vpci.ts:84:28` | `pl.col('volume')` |
| string | `price` | `libs/indicators/src/classic/vpci.ts:85:27` | `pl.col('price')` |
| string | `pv` | `libs/indicators/src/classic/vpci.ts:92:28` | `pl.col('pv')` |
| string | `volume` | `libs/indicators/src/classic/vpci.ts:93:27` | `pl.col('volume')` |
| string | `price` | `libs/indicators/src/classic/vpci.ts:94:26` | `pl.col('price')` |
| string | `volume` | `libs/indicators/src/classic/vpci.ts:121:27` | `pl.col('volume')` |
| string | `volume` | `libs/indicators/src/classic/vpci.ts:122:26` | `pl.col('volume')` |
| string | `vpc` | `libs/indicators/src/classic/vpci.ts:133:19` | `vpcExpr.alias('vpc')` |
| string | `vpr` | `libs/indicators/src/classic/vpci.ts:134:19` | `vprExpr.alias('vpr')` |
| string | `vpci` | `libs/indicators/src/classic/vpci.ts:135:20` | `vpciExpr.alias('vpci')` |
| string | `vpci` | `libs/indicators/src/classic/vpci.ts:139:29` | `pl.col('vpci')` |
| string | `signalLine` | `libs/indicators/src/classic/vpci.ts:140:53` | `signalExpr.alias('signalLine')` |
| string | `vpc` | `libs/indicators/src/classic/vpci.ts:142:35` | `stage2.getColumn('vpc')` |
| string | `vpr` | `libs/indicators/src/classic/vpci.ts:143:35` | `stage2.getColumn('vpr')` |
| string | `vpci` | `libs/indicators/src/classic/vpci.ts:144:36` | `stage2.getColumn('vpci')` |
| string | `signalLine` | `libs/indicators/src/classic/vpci.ts:145:38` | `stage2.getColumn('signalLine')` |
| number | `10` | `libs/indicators/src/fibonacci/fibonacci.ts:23:20` | `10 ** precision` |
| number | `1000000` | `libs/indicators/src/fibonacci/fibonacci.ts:26:29` | `value * 1e6` |
| number | `1000000` | `libs/indicators/src/fibonacci/fibonacci.ts:26:36` | `Math.round(value * 1e6) / 1e6` |
| string | `high` | `libs/indicators/src/fibonacci/fibonacci.ts:74:21` | `pl.Series('high', highs as any)` |
| string | `low` | `libs/indicators/src/fibonacci/fibonacci.ts:75:20` | `pl.Series('low', lows as any)` |
| string | `high` | `libs/indicators/src/fibonacci/fibonacci.ts:79:28` | `pl.col('high')` |
| string | `low` | `libs/indicators/src/fibonacci/fibonacci.ts:80:27` | `pl.col('low')` |
| string | `rHigh` | `libs/indicators/src/fibonacci/fibonacci.ts:93:21` | `rHighExpr.alias('rHigh')` |
| string | `rLow` | `libs/indicators/src/fibonacci/fibonacci.ts:94:20` | `rLowExpr.alias('rLow')` |
| string | `diff` | `libs/indicators/src/fibonacci/fibonacci.ts:95:20` | `diffExpr.alias('diff')` |
| string | `ratio` | `libs/indicators/src/fibonacci/fibonacci.ts:96:21` | `ratioExpr.alias('ratio')` |
| string | `rHigh` | `libs/indicators/src/fibonacci/fibonacci.ts:112:38` | `computedDf.getColumn('rHigh')` |
| string | `rLow` | `libs/indicators/src/fibonacci/fibonacci.ts:113:37` | `computedDf.getColumn('rLow')` |
| string | `diff` | `libs/indicators/src/fibonacci/fibonacci.ts:114:37` | `computedDf.getColumn('diff')` |
| string | `ratio` | `libs/indicators/src/fibonacci/fibonacci.ts:115:38` | `computedDf.getColumn('ratio')` |
| string | `high` | `libs/indicators/src/fibonacci/fibonacci.ts:186:21` | `pl.Series('high', trailingHigh as any)` |
| string | `low` | `libs/indicators/src/fibonacci/fibonacci.ts:187:20` | `pl.Series('low', trailingLow as any)` |
| string | `high` | `libs/indicators/src/fibonacci/fibonacci.ts:190:29` | `df.getColumn('high')` |
| string | `low` | `libs/indicators/src/fibonacci/fibonacci.ts:191:28` | `df.getColumn('low')` |
| string | `up` | `libs/indicators/src/fibonacci/fibonacci.ts:261:21` | `direction !== 'up'` |
| string | `down` | `libs/indicators/src/fibonacci/fibonacci.ts:261:43` | `direction !== 'down'` |
| string | `up` | `libs/indicators/src/fibonacci/fibonacci.ts:278:21` | `direction === 'up'` |
| number | `3` | `libs/indicators/src/fibonacci/fibonacci.ts:281:35` | `ratio.toFixed(3)` |
| number | `3` | `libs/indicators/src/fibonacci/fibonacci.ts:289:35` | `ratio.toFixed(3)` |
| number | `3` | `libs/indicators/src/fibonacci/fibonacci.ts:297:35` | `ratio.toFixed(3)` |
| number | `3` | `libs/indicators/src/fibonacci/fibonacci.ts:305:35` | `ratio.toFixed(3)` |
| string | `up` | `libs/indicators/src/fibonacci/fibonacci.ts:343:21` | `direction === 'up'` |
| number | `4` | `libs/indicators/src/fibonacci/fibonacci.ts:349:43` | `options?.precision ?? 4` |
| number | `10` | `libs/indicators/src/fibonacci/fibonacci.ts:351:27` | `10 ** precision` |
| number | `10` | `libs/indicators/src/fibonacci/fibonacci.ts:351:46` | `10 ** precision` |
| string | `up` | `libs/indicators/src/force/force.ts:29:34` | `unit.trend.toLowerCase() === 'up'` |
| string | `up` | `libs/indicators/src/force/force.ts:42:34` | `direction === 'up'` |
| string | `up` | `libs/indicators/src/force/force.ts:95:44` | `directions[unitIndex] === 'up'` |
| number | `0.95` | `libs/indicators/src/risk-performance/risk-performance.ts:452:45` | `computeValueAtRisk(returns, 0.95)` |
| number | `0.99` | `libs/indicators/src/risk-performance/risk-performance.ts:453:45` | `computeValueAtRisk(returns, 0.99)` |
| number | `0.95` | `libs/indicators/src/risk-performance/risk-performance.ts:454:49` | `computeConditionalVaR(returns, 0.95)` |
| number | `0.99` | `libs/indicators/src/risk-performance/risk-performance.ts:455:49` | `computeConditionalVaR(returns, 0.99)` |
| string | `computeRollingCorrSeries` | `libs/indicators/src/time-series/rolling-corr.ts:16:29` | `assertValidWindow(window, 'computeRollingCorrSeries')` |
| string | `computeRollingCorrSeries` | `libs/indicators/src/time-series/rolling-corr.ts:20:5` | `assertMatchingLengths( seriesX.length, seriesY.length, 'computeRollingCorrSeries', )` |
| string | `computeRollingCorrObservation` | `libs/indicators/src/time-series/rolling-corr.ts:95:29` | `assertValidWindow(window, 'computeRollingCorrObservation')` |
| string | `computeRollingCorrObservation` | `libs/indicators/src/time-series/rolling-corr.ts:99:5` | `assertMatchingLengths( seriesX.length, seriesY.length, 'computeRollingCorrObservation', )` |
| string | `computeRollingStdSeries` | `libs/indicators/src/time-series/rolling-std.ts:26:29` | `assertValidWindow(window, 'computeRollingStdSeries')` |
| string | `computeRollingStdSeries` | `libs/indicators/src/time-series/rolling-std.ts:27:44` | `validateDdof(options?.ddof, 'computeRollingStdSeries')` |
| string | `computeRollingStdObservation` | `libs/indicators/src/time-series/rolling-std.ts:72:29` | `assertValidWindow(window, 'computeRollingStdObservation')` |
| string | `computeRollingStdObservation` | `libs/indicators/src/time-series/rolling-std.ts:73:44` | `validateDdof(options?.ddof, 'computeRollingStdObservation')` |
| string | `computeDecayLinearSeries` | `libs/indicators/src/time-series/ts-decay-linear.ts:15:29` | `assertValidWindow(window, 'computeDecayLinearSeries')` |
| string | `computeDecayLinearObservation` | `libs/indicators/src/time-series/ts-decay-linear.ts:56:29` | `assertValidWindow(window, 'computeDecayLinearObservation')` |
| string | `computeTsDeltaSeries` | `libs/indicators/src/time-series/ts-delta-delay.ts:15:29` | `assertValidPeriod(period, 'computeTsDeltaSeries')` |
| string | `ignore` | `libs/indicators/src/time-series/ts-delta-delay.ts:27:32` | `s.diff(period, 'ignore')` |
| string | `computeTsDeltaObservation` | `libs/indicators/src/time-series/ts-delta-delay.ts:49:29` | `assertValidPeriod(period, 'computeTsDeltaObservation')` |
| string | `computeTsDelaySeries` | `libs/indicators/src/time-series/ts-delta-delay.ts:70:29` | `assertValidPeriod(period, 'computeTsDelaySeries')` |
| string | `computeTsDelayObservation` | `libs/indicators/src/time-series/ts-delta-delay.ts:104:29` | `assertValidPeriod(period, 'computeTsDelayObservation')` |
| string | `computeTsArgMaxSeries` | `libs/indicators/src/time-series/ts-extreme.ts:86:53` | `computeExtremeSeries(series, window, true, 'computeTsArgMaxSeries')` |
| string | `computeTsArgMaxObservation` | `libs/indicators/src/time-series/ts-extreme.ts:100:5` | `computeExtremeObservation( series, window, true, 'computeTsArgMaxObservation', )` |
| string | `computeTsArgMinSeries` | `libs/indicators/src/time-series/ts-extreme.ts:112:54` | `computeExtremeSeries(series, window, false, 'computeTsArgMinSeries')` |
| string | `computeTsArgMinObservation` | `libs/indicators/src/time-series/ts-extreme.ts:126:5` | `computeExtremeObservation( series, window, false, 'computeTsArgMinObservation', )` |
| string | `computeTsRankSeries` | `libs/indicators/src/time-series/ts-rank.ts:19:29` | `assertValidWindow(window, 'computeTsRankSeries')` |
| number | `0.5` | `libs/indicators/src/time-series/ts-rank.ts:36:60` | `normalize ? 0.5 : 1` |
| string | `val` | `libs/indicators/src/time-series/ts-rank.ts:40:23` | `pl.Series('val', series as any)` |
| string | `val` | `libs/indicators/src/time-series/ts-rank.ts:47:24` | `pl.col('val')` |
| string | `val` | `libs/indicators/src/time-series/ts-rank.ts:50:29` | `pl.col('val')` |
| string | `val` | `libs/indicators/src/time-series/ts-rank.ts:56:29` | `pl.col('val')` |
| string | `tsRank` | `libs/indicators/src/time-series/ts-rank.ts:69:48` | `finalExpr.alias('tsRank')` |
| string | `tsRank` | `libs/indicators/src/time-series/ts-rank.ts:70:42` | `calculated.getColumn('tsRank')` |
| string | `computeTsRankObservation` | `libs/indicators/src/time-series/ts-rank.ts:87:29` | `assertValidWindow(window, 'computeTsRankObservation')` |
| number | `0.5` | `libs/indicators/src/time-series/ts-rank.ts:99:24` | `normalize ? 0.5 : 1` |
| string | `trailing` | `libs/indicators/src/time-series/ts-rank.ts:102:23` | `pl.Series('trailing', trailing as any)` |
| number | `21` | `libs/market-data/src/k-price-projector.ts:30:30` | `trimmed.length > 21` |
| string | `complete` | `libs/market-data/src/k-strategy-bar-mapper.ts:96:11` | `type: 'complete'` |
| string | `ef` | `libs/market-data/src/market-data-pipeline.ts:141:54` | `source === 'ef'` |
| string | `tdx` | `libs/market-data/src/market-data-pipeline.ts:142:47` | `source === 'tdx'` |
| string | `qmt` | `libs/market-data/src/market-data-pipeline.ts:143:47` | `source === 'qmt'` |
| string | `volume` | `libs/market-data/src/projection/strategy-series-imputer.ts:203:11` | `imputeQuantity( bars, start, 'volume', bar.volume, volumeAnchors, offset, )` |
| string | `amount` | `libs/market-data/src/projection/strategy-series-imputer.ts:211:11` | `imputeQuantity( bars, start, 'amount', bar.amount, amountAnchors, offset, )` |
| string | `observed` | `libs/market-data/src/projection/strategy-series-imputer.ts:232:61` | `resolution: 'observed'` |
| string | `backfilled` | `libs/market-data/src/projection/strategy-series-imputer.ts:245:19` | `resolution: 'backfilled'` |
| string | `forwardFilled` | `libs/market-data/src/projection/strategy-series-imputer.ts:259:19` | `resolution: 'forwardFilled'` |
| string | `unavailable` | `libs/market-data/src/projection/strategy-series-imputer.ts:265:17` | `resolution: 'unavailable'` |
| string | `observed` | `libs/market-data/src/projection/strategy-series-imputer.ts:278:61` | `resolution: 'observed'` |
| string | `backfilled` | `libs/market-data/src/projection/strategy-series-imputer.ts:285:19` | `resolution: 'backfilled'` |
| string | `forwardFilled` | `libs/market-data/src/projection/strategy-series-imputer.ts:293:19` | `resolution: 'forwardFilled'` |
| string | `unavailable` | `libs/market-data/src/projection/strategy-series-imputer.ts:296:60` | `resolution: 'unavailable'` |
| string | `observed` | `libs/market-data/src/projection/strategy-series-imputer.ts:307:61` | `resolution: 'observed'` |
| string | `forwardFilled` | `libs/market-data/src/projection/strategy-series-imputer.ts:313:19` | `resolution: 'forwardFilled'` |
| string | `unavailable` | `libs/market-data/src/projection/strategy-series-imputer.ts:319:17` | `resolution: 'unavailable'` |
| string | `observed` | `libs/market-data/src/projection/strategy-series-imputer.ts:329:61` | `resolution: 'observed'` |
| string | `forwardFilled` | `libs/market-data/src/projection/strategy-series-imputer.ts:335:19` | `resolution: 'forwardFilled'` |
| string | `unavailable` | `libs/market-data/src/projection/strategy-series-imputer.ts:338:60` | `resolution: 'unavailable'` |
| string | `ER_DUP_ENTRY` | `libs/shared-data/src/utils/mysql-unique-conflict.util.ts:23:23` | `driver.code !== 'ER_DUP_ENTRY'` |
| number | `1062` | `libs/shared-data/src/utils/mysql-unique-conflict.util.ts:23:58` | `driver.errno !== 1062` |
| string | `exit` | `libs/signal/src/runtime/realtime-strategy-evaluation.service.ts:115:47` | `signal.signalKind === 'exit'` |
| string | `duan` | `libs/strategy/src/analysis/chan-derivation.ts:72:15` | `units === 'duan'` |
| number | `3` | `libs/strategy/src/analysis/chan-fenxing-trigger.ts:30:38` | `orderedK.length < 3` |
| string | `KDJ(9,3,3)` | `libs/strategy/src/analysis/strategy-kdj.ts:21:5` | `requireExactStrategyBars( bars, STRATEGY_KDJ_CALCULATION_BAR_COUNT, 'KDJ(9,3,3)', )` |
| string | `MACD(12,26,9)` | `libs/strategy/src/analysis/strategy-macd.ts:21:5` | `requireExactStrategyBars( bars, STRATEGY_MACD_CALCULATION_BAR_COUNT, 'MACD(12,26,9)', )` |
| string | `GUARD` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:58:12` | `case 'GUARD': { const plugin = this.getPlugin(node.pluginId); const opinion = await plugin.evaluate(` |
| string | `GUARD` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:64:17` | `type: 'GUARD'` |
| string | `BOTH` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:77:35` | `node.requiredAction === 'BOTH'` |
| string | `ANY` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:77:69` | `node.requiredAction === 'ANY'` |
| string | `ABORTED` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:119:19` | `status: 'ABORTED'` |
| string | `LOW` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:121:28` | `confidenceLevel: 'LOW'` |
| string | `BRANCH` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:127:12` | `case 'BRANCH': { const conditionResult = this.resolveCondition(node.condition, context); trace.push(` |
| string | `BRANCH` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:131:17` | `type: 'BRANCH'` |
| string | `EXTRACTOR` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:149:12` | `case 'EXTRACTOR': { const plugin = this.getPlugin(node.pluginId); const opinion = await plugin.evalu` |
| string | `EXTRACTOR` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:161:17` | `type: 'EXTRACTOR'` |
| string | `CONSENSUS` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:186:12` | `case 'CONSENSUS': { const targetAction = node.targetAction ?? DECISION_ACTIONS.BUY; const vetoAction` |
| string | `CONSENSUS` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:238:17` | `type: 'CONSENSUS'` |
| string | `ABORTED` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:273:19` | `status: 'ABORTED'` |
| string | `TERMINAL` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:283:12` | `case 'TERMINAL': { const finalAction = node.action === 'INHERIT' ? inheritedAction \|\| DECISION_ACTIO` |
| string | `INHERIT` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:285:27` | `node.action === 'INHERIT'` |
| string | `TERMINAL` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:291:17` | `type: 'TERMINAL'` |
| string | `ABORT` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:297:61` | `finalAction === 'ABORT'` |
| number | `85` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:297:75` | `finalAction === 'ABORT' ? 0 : 85` |
| string | `ABORT` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:300:29` | `finalAction === 'ABORT'` |
| string | `ABORTED` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:302:21` | `status: 'ABORTED'` |
| string | `SIGNAL_EMITTED` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:317:19` | `status: 'SIGNAL_EMITTED'` |
| string | `BUY` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:324:41` | `finalAction === 'BUY'` |
| string | `eq` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:374:12` | `case 'eq': return actual === expected;` |
| string | `ne` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:376:12` | `case 'ne': return actual !== expected;` |
| string | `gt` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:378:12` | `case 'gt': return Number(actual) > Number(expected);` |
| string | `gte` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:380:12` | `case 'gte': return Number(actual) >= Number(expected);` |
| string | `lt` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:382:12` | `case 'lt': return Number(actual) < Number(expected);` |
| string | `lte` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:384:12` | `case 'lte': return Number(actual) <= Number(expected);` |
| string | `in` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:386:12` | `case 'in': if (Array.isArray(expected)) { return expected.includes(actual); } return false;` |
| number | `80` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:397:18` | `score >= 80` |
| number | `65` | `libs/strategy/src/decision-flow/decision-flow-evaluator.ts:398:18` | `score >= 65` |
| string | `ABORTED` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:52:27` | `result.status === 'ABORTED'` |
| string | `GUARD` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:59:25` | `item.type === 'GUARD'` |
| string | `CONSENSUS` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:61:32` | `item.type === 'CONSENSUS'` |
| string | `BUY` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:63:39` | `v.action === 'BUY'` |
| string | `plugin.` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:64:42` | `v.pluginId.replace('plugin.', '')` |
| string | `+` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:66:58` | `positiveVoters.join('+')` |
| string | ` + ` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:72:53` | `keyMilestones.join(' + ')` |
| string | ` -> ` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:72:62` | `keyMilestones.join(' + ') + ' -> '` |
| string | `BUY` | `libs/strategy/src/decision-flow/decision-trace-builder.ts:74:25` | `result.action === 'BUY'` |
| string | `entry` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:39:40` | `plan.signalKind === 'entry'` |
| string | `guard_legacy_rule` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:42:11` | `id: 'guard_legacy_rule'` |
| string | `GUARD` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:43:13` | `type: 'GUARD'` |
| string | `存量规则DSL门禁` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:44:13` | `name: '存量规则DSL门禁'` |
| string | `plugin.legacy.rule-dsl` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:45:17` | `pluginId: 'plugin.legacy.rule-dsl'` |
| number | `0.5` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:48:22` | `minConfidence: 0.5` |
| string | `term_legacy_matched` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:50:13` | `id: 'term_legacy_matched'` |
| string | `TERMINAL` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:51:15` | `type: 'TERMINAL'` |
| string | `LEGACY_DSL` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:53:20` | `signalTag: 'LEGACY_DSL'` |
| string | `存量规则条件满足，触发信号` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:54:17` | `reason: '存量规则条件满足，触发信号'` |
| string | `term_legacy_unmatched` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:57:13` | `id: 'term_legacy_unmatched'` |
| string | `TERMINAL` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:58:15` | `type: 'TERMINAL'` |
| string | `ABORT` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:59:17` | `action: 'ABORT'` |
| string | `存量规则条件未满足` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:60:17` | `reason: '存量规则条件未满足'` |
| string | `both` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:71:39` | `plan.direction === 'both'` |
| string | `sell` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:74:28` | `plan.direction === 'sell'` |
| string | `sell` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:79:28` | `plan.direction === 'sell'` |
| string | `guard_chan_bsp` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:84:11` | `id: 'guard_chan_bsp'` |
| string | `GUARD` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:85:13` | `type: 'GUARD'` |
| string | `缠论买卖点门禁` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:86:13` | `name: '缠论买卖点门禁'` |
| string | `plugin.chan.bsp` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:87:17` | `pluginId: 'plugin.chan.bsp'` |
| number | `0.5` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:96:44` | `plan.minConfidence ?? 0.5` |
| string | `term_chan_bsp_matched` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:98:13` | `id: 'term_chan_bsp_matched'` |
| string | `TERMINAL` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:99:15` | `type: 'TERMINAL'` |
| string | `CHAN_BSP` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:101:20` | `signalTag: 'CHAN_BSP'` |
| string | `缠论买卖点结构确立` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:102:17` | `reason: '缠论买卖点结构确立'` |
| string | `term_chan_bsp_unmatched` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:105:13` | `id: 'term_chan_bsp_unmatched'` |
| string | `TERMINAL` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:106:15` | `type: 'TERMINAL'` |
| string | `ABORT` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:107:17` | `action: 'ABORT'` |
| string | `缠论形态未出现或未达买卖点确认门槛` | `libs/strategy/src/decision-flow/legacy-strategy-compiler.ts:108:17` | `reason: '缠论形态未出现或未达买卖点确认门槛'` |
| string | `decision_flow` | `libs/strategy/src/decision-flow/stored-definition-compiler.ts:64:10` | `case 'decision_flow': { const flow = input.rule as unknown as DecisionFlowNode; if (!flow \|\| typeof ` |
| string | `decision_flow` | `libs/strategy/src/decision-flow/stored-definition-compiler.ts:78:21` | `sourceKind: 'decision_flow'` |
| string | `rule_dsl` | `libs/strategy/src/decision-flow/stored-definition-compiler.ts:82:10` | `case 'rule_dsl': { try { const compilation = compileStoredStrategyRuleWithNormalized( input.rule, in` |
| string | `rule_dsl` | `libs/strategy/src/decision-flow/stored-definition-compiler.ts:95:23` | `sourceKind: 'rule_dsl'` |
| string | `chan_bsp` | `libs/strategy/src/decision-flow/stored-definition-compiler.ts:107:10` | `case 'chan_bsp': { const chanPlan = validateChanBspRule(input.rule); const flow = LegacyStrategyComp` |
| string | `chan_bsp` | `libs/strategy/src/decision-flow/stored-definition-compiler.ts:115:21` | `sourceKind: 'chan_bsp'` |
| string | `unavailable` | `libs/strategy/src/evaluation/strategy-context.builder.ts:48:15` | `status: 'unavailable'` |
| string | `insufficient_history` | `libs/strategy/src/evaluation/strategy-context.builder.ts:49:15` | `reason: 'insufficient_history'` |
| string | `unavailable` | `libs/strategy/src/evaluation/strategy-context.builder.ts:66:17` | `status: 'unavailable'` |
| string | `field_unavailable` | `libs/strategy/src/evaluation/strategy-context.builder.ts:67:17` | `reason: 'field_unavailable'` |
| string | `ready` | `libs/strategy/src/evaluation/strategy-context.builder.ts:103:13` | `status: 'ready'` |
| string | `k.open` | `libs/strategy/src/evaluation/strategy-context.builder.ts:195:10` | `case 'k.open':` |
| string | `k.high` | `libs/strategy/src/evaluation/strategy-context.builder.ts:196:10` | `case 'k.high':` |
| string | `k.low` | `libs/strategy/src/evaluation/strategy-context.builder.ts:197:10` | `case 'k.low':` |
| string | `k.close` | `libs/strategy/src/evaluation/strategy-context.builder.ts:198:10` | `case 'k.close': { const property = demand.field.slice(2) as \| 'open' \| 'high' \| 'low' \| 'close'; con` |
| string | `k.type` | `libs/strategy/src/evaluation/strategy-context.builder.ts:216:10` | `case 'k.type': return observation( current.rawBar.type, previous?.rawBar.type, demand.needsPrevious,` |
| string | `k.volume` | `libs/strategy/src/evaluation/strategy-context.builder.ts:222:10` | `case 'k.volume':` |
| string | `k.amount` | `libs/strategy/src/evaluation/strategy-context.builder.ts:223:10` | `case 'k.amount': { const property = demand.field.slice(2) as 'volume' \| 'amount'; const currentEvide` |
| string | `indicator.kdj.k` | `libs/strategy/src/evaluation/strategy-context.builder.ts:241:10` | `case 'indicator.kdj.k':` |
| string | `indicator.kdj.d` | `libs/strategy/src/evaluation/strategy-context.builder.ts:242:10` | `case 'indicator.kdj.d':` |
| string | `indicator.kdj.j` | `libs/strategy/src/evaluation/strategy-context.builder.ts:243:10` | `case 'indicator.kdj.j': { const property = demand.field.slice(-1) as 'k' \| 'd' \| 'j'; const currentV` |
| string | `indicator.macd.line` | `libs/strategy/src/evaluation/strategy-context.builder.ts:257:10` | `case 'indicator.macd.line':` |
| string | `indicator.macd.signal` | `libs/strategy/src/evaluation/strategy-context.builder.ts:258:10` | `case 'indicator.macd.signal':` |
| string | `indicator.macd.histogram` | `libs/strategy/src/evaluation/strategy-context.builder.ts:259:10` | `case 'indicator.macd.histogram': { const property = demand.field.slice('indicator.macd.'.length) as ` |
| string | `unavailable` | `libs/strategy/src/evaluation/strategy-context.builder.ts:296:64` | `projected.resolution === 'unavailable'` |
| string | `condition` | `libs/strategy/src/evaluation/strategy-context.builder.ts:311:23` | `node.kind === 'condition'` |
| string | `crossesAbove` | `libs/strategy/src/evaluation/strategy-context.builder.ts:329:28` | `condition.operator === 'crossesAbove'` |
| string | `crossesBelow` | `libs/strategy/src/evaluation/strategy-context.builder.ts:330:28` | `condition.operator === 'crossesBelow'` |
| string | `k.volume` | `libs/strategy/src/evaluation/strategy-context.builder.ts:339:17` | `field === 'k.volume'` |
| string | `k.amount` | `libs/strategy/src/evaluation/strategy-context.builder.ts:340:17` | `field === 'k.amount'` |
| string | `unavailable` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:29:27` | `prepared.status === 'unavailable'` |
| string | `evaluated` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:32:13` | `status: 'evaluated'` |
| string | `condition` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:42:21` | `node.kind === 'condition'` |
| string | `all` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:45:21` | `node.kind === 'all'` |
| string | `decimal` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:55:39` | `condition.catalog.valueType === 'decimal'` |
| string | `finiteNumber` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:70:39` | `condition.catalog.valueType === 'finiteNumber'` |
| string | `eq` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:85:30` | `condition.operator === 'eq'` |
| string | `ne` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:86:30` | `condition.operator === 'ne'` |
| string | `gt` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:118:10` | `case 'gt': return current > 0;` |
| string | `gte` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:120:10` | `case 'gte': return current >= 0;` |
| string | `lt` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:122:10` | `case 'lt': return current < 0;` |
| string | `lte` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:124:10` | `case 'lte': return current <= 0;` |
| string | `eq` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:126:10` | `case 'eq': return current === 0;` |
| string | `ne` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:128:10` | `case 'ne': return current !== 0;` |
| string | `crossesAbove` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:130:10` | `case 'crossesAbove': if (previous === undefined) throw new Error('crossover has no prior value'); re` |
| string | `crossesBelow` | `libs/strategy/src/evaluation/strategy-rule.evaluator.ts:134:10` | `case 'crossesBelow': if (previous === undefined) throw new Error('crossover has no prior value'); re` |
| number | `-0.08` | `libs/strategy/src/execution/execution-risk-arbiter.ts:70:60` | `options?.hardStopLossRatio ?? -0.08` |
| number | `3` | `libs/strategy/src/execution/execution-risk-arbiter.ts:71:64` | `options?.defaultCooldownBars ?? 3` |
| number | `0.995` | `libs/strategy/src/execution/execution-risk-arbiter.ts:72:64` | `options?.cashAllocationRatio ?? 0.995` |
| string | `SYSTEMIC_RISK_MELTDOWN` | `libs/strategy/src/execution/execution-risk-arbiter.ts:138:23` | `exitReason: 'SYSTEMIC_RISK_MELTDOWN'` |
| string | `HARD_STOP_LOSS` | `libs/strategy/src/execution/execution-risk-arbiter.ts:161:23` | `exitReason: 'HARD_STOP_LOSS'` |
| number | `0.5` | `libs/strategy/src/execution/execution-risk-arbiter.ts:209:40` | `this.cashAllocationRatio * 0.5` |
| string | `..` | `libs/strategy/src/factor/external-plugin-loader.ts:147:53` | `path.resolve(process.cwd(), '..', 'mist-alpha-private')` |
| string | `mist-alpha-private` | `libs/strategy/src/factor/external-plugin-loader.ts:147:59` | `path.resolve(process.cwd(), '..', 'mist-alpha-private')` |
| string | `../../../../..` | `libs/strategy/src/factor/external-plugin-loader.ts:152:7` | `path.resolve( __dirname, '../../../../..', 'mist-alpha-private', )` |
| string | `mist-alpha-private` | `libs/strategy/src/factor/external-plugin-loader.ts:153:7` | `path.resolve( __dirname, '../../../../..', 'mist-alpha-private', )` |
| string | `require` | `libs/strategy/src/factor/external-plugin-loader.ts:248:18` | `eval('require')` |
| number | `5` | `libs/strategy/src/factor/helpers/volume-features.extractor.ts:222:64` | `[5, 10, 20]` |
| number | `10` | `libs/strategy/src/factor/helpers/volume-features.extractor.ts:222:67` | `[5, 10, 20]` |
| number | `20` | `libs/strategy/src/factor/helpers/volume-features.extractor.ts:222:71` | `[5, 10, 20]` |
| string | `有效行情数据为空，未形成缠论K线` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:133:17` | `reason: '有效行情数据为空，未形成缠论K线'` |
| string | `未检测到满足条件的缠论买卖点` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:147:17` | `reason: '未检测到满足条件的缠论买卖点'` |
| string | `缠论买卖点已在先前批次发射，无需重复触发` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:191:19` | `reason: '缠论买卖点已在先前批次发射，无需重复触发'` |
| string | `_buy` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:198:45` | `latestEvent.type.endsWith('_buy')` |
| string | `_buy` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:202:31` | `e.type.endsWith('_buy')` |
| string | `_buy` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:202:58` | `e.type.endsWith('_buy')` |
| string | `当前最新K线未确立有效分型扳机(笔内延伸或包含)` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:213:19` | `reason: '当前最新K线未确立有效分型扳机(笔内延伸或包含)'` |
| string | `检测到买点结构，但最新确立分型为顶分型而非底分型` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:220:19` | `reason: '检测到买点结构，但最新确立分型为顶分型而非底分型'` |
| string | `检测到卖点结构，但最新确立分型为底分型而非顶分型` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:227:19` | `reason: '检测到卖点结构，但最新确立分型为底分型而非顶分型'` |
| string | `_buy` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:394:39` | `event.type.endsWith('_buy')` |
| string | `first_` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:399:31` | `event.type.startsWith('first_')` |
| string | `second_` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:400:31` | `event.type.startsWith('second_')` |
| string | `third_` | `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts:402:31` | `event.type.startsWith('third_')` |
| string | `有效行情数据为空，未形成缠论K线` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:103:17` | `reason: '有效行情数据为空，未形成缠论K线'` |
| string | `up` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:147:42` | `swingDirection === 'up'` |
| string | `up` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:163:26` | `swingDirection === 'up'` |
| string | `pullback` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:164:22` | `direction === 'pullback'` |
| string | `both` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:164:50` | `direction === 'both'` |
| string | `down` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:189:26` | `swingDirection === 'down'` |
| string | `rebound` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:190:22` | `direction === 'rebound'` |
| string | `both` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:190:49` | `direction === 'both'` |
| string | `up` | `libs/strategy/src/factor/plugins/fibonacci.plugin.ts:222:37` | `swingDirection === 'up'` |
| number | `8` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:44:66` | `typeof rawParams?.minRoe === 'number' ? rawParams.minRoe : 8.0` |
| number | `70` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:48:11` | `typeof rawParams?.maxDebtRatio === 'number' ? rawParams.maxDebtRatio : 70.0` |
| string | `roe` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:67:9` | `context.featureProvider.getFeature( 'roe', context.securityCode, )` |
| string | `debtRatio` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:74:9` | `context.featureProvider.getFeature( 'debtRatio', context.securityCode, )` |
| string | `BUY` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:94:17` | `action: 'BUY'` |
| number | `0.5` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:95:21` | `confidence: 0.5` |
| string | `未配置财务数据源，基本面门禁默认中立放行` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:96:17` | `reason: '未配置财务数据源，基本面门禁默认中立放行'` |
| string | `BUY` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:106:17` | `action: 'BUY'` |
| number | `0.9` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:107:21` | `confidence: 0.9` |
| string | `SELL` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:120:15` | `action: 'SELL'` |
| number | `0.95` | `libs/strategy/src/factor/plugins/financial-guard.plugin.ts:121:19` | `confidence: 0.95` |
| string | `NEUTRAL` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:55:17` | `action: 'NEUTRAL'` |
| string | `未提供有效的规则计划(plan)或规则定义(rule)` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:57:17` | `reason: '未提供有效的规则计划(plan)或规则定义(rule)'` |
| string | `unavailable` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:63:28` | `outcome.status === 'unavailable'` |
| string | `NEUTRAL` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:65:17` | `action: 'NEUTRAL'` |
| string | `NEUTRAL` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:73:17` | `action: 'NEUTRAL'` |
| string | `存量规则条件未满足` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:75:17` | `reason: '存量规则条件未满足'` |
| string | `entry` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:83:41` | `plan.signalKind === 'entry'` |
| number | `0.8` | `libs/strategy/src/factor/plugins/legacy-rule-dsl.plugin.ts:86:68` | `typeof params?.confidence === 'number' ? params.confidence : 0.8` |
| number | `1000` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:39:11` | `typeof rawParams?.minInflowWan === 'number' ? rawParams.minInflowWan : 1000` |
| string | `northbound_inflow` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:51:9` | `context.featureProvider.getFeature( 'northbound_inflow', context.securityCode, )` |
| string | `NEUTRAL` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:59:17` | `action: 'NEUTRAL'` |
| string | `未检测到北向资金数据，保持中立弃权` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:61:17` | `reason: '未检测到北向资金数据，保持中立弃权'` |
| number | `0.95` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:70:35` | `Math.min(0.95, 0.75 + excess * 0.2)` |
| number | `0.75` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:70:41` | `0.75 + excess * 0.2` |
| number | `0.2` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:70:57` | `excess * 0.2` |
| string | `BUY` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:73:17` | `action: 'BUY'` |
| string | `SELL` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:85:17` | `action: 'SELL'` |
| number | `0.85` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:86:21` | `confidence: 0.85` |
| string | `NEUTRAL` | `libs/strategy/src/factor/plugins/northbound-capital.plugin.ts:96:15` | `action: 'NEUTRAL'` |
| string | `tdx` | `libs/strategy/src/kernel/adapters/realtime-kernel-pool.ts:217:18` | `source !== 'tdx'` |
| string | `qmt` | `libs/strategy/src/kernel/adapters/realtime-kernel-pool.ts:217:38` | `source !== 'qmt'` |
| number | `60000` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:43:66` | `slotOffset * 60_000` |
| string | ` ` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:89:34` | `key.split('\u0000')` |
| number | `3` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:89:53` | `key.split('\u0000').slice(0, 3)` |
| string | ` ` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:89:61` | `key.split('\u0000').slice(0, 3).join('\u0000')` |
| string | `volume` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:118:31` | `sumQuantity(bars, 'volume')` |
| string | `amount` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:119:31` | `sumQuantity(bars, 'amount')` |
| string | `discarded` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:172:27` | `trigger.outcome === 'discarded'` |
| string | `complete` | `libs/strategy/src/kernel/adapters/realtime-period.builder.ts:184:24` | `sealedBar.type !== 'complete'` |
| string | `volumeFeatures` | `libs/strategy/src/kernel/strategy-evaluation-kernel.ts:163:22` | `attributes.set('volumeFeatures', vf)` |
| string | `SIGNAL_EMITTED` | `libs/strategy/src/kernel/strategy-evaluation-kernel.ts:190:31` | `decision.status !== 'SIGNAL_EMITTED'` |
| string | `BUY` | `libs/strategy/src/kernel/strategy-evaluation-kernel.ts:191:31` | `decision.action !== 'BUY'` |
| string | `SELL` | `libs/strategy/src/kernel/strategy-evaluation-kernel.ts:191:60` | `decision.action !== 'SELL'` |
| string | `BUY` | `libs/strategy/src/kernel/strategy-evaluation-kernel.ts:202:39` | `decision.action === 'BUY'` |
| string | `finiteNumber` | `libs/strategy/src/rules/strategy-field.catalog.ts:41:16` | `valueType: 'finiteNumber'` |
| string | `decimal` | `libs/strategy/src/rules/strategy-field.catalog.ts:48:16` | `valueType: 'decimal'` |
| string | `forwardFillWithinTradingDay` | `libs/strategy/src/rules/strategy-field.catalog.ts:51:20` | `missingPolicy: 'forwardFillWithinTradingDay'` |
| string | `finiteNumber` | `libs/strategy/src/rules/strategy-field.catalog.ts:56:16` | `valueType: 'finiteNumber'` |
| string | `finiteNumber` | `libs/strategy/src/rules/strategy-field.catalog.ts:63:16` | `valueType: 'finiteNumber'` |
| string | `create` | `libs/strategy/src/rules/strategy-rule.compiler.ts:42:48` | `compileStrategyRule(rule, signalKind, 'create')` |
| string | `stored` | `libs/strategy/src/rules/strategy-rule.compiler.ts:49:48` | `compileStrategyRule(rule, signalKind, 'stored')` |
| string | `stored` | `libs/strategy/src/rules/strategy-rule.compiler.ts:56:48` | `compileStrategyRule(rule, signalKind, 'stored')` |
| string | `all` | `libs/strategy/src/rules/strategy-rule.compiler.ts:101:41` | `keys[0] === 'all'` |
| string | `condition` | `libs/strategy/src/rules/strategy-rule.compiler.ts:192:11` | `kind: 'condition'` |
| string | `finiteNumber` | `libs/strategy/src/rules/strategy-rule.compiler.ts:211:29` | `catalog.valueType === 'finiteNumber'` |
| string | `barType` | `libs/strategy/src/rules/strategy-rule.compiler.ts:217:29` | `catalog.valueType === 'barType'` |
| string | `complete` | `libs/strategy/src/rules/strategy-rule.compiler.ts:218:19` | `value !== 'complete'` |
| string | `incomplete` | `libs/strategy/src/rules/strategy-rule.compiler.ts:218:43` | `value !== 'incomplete'` |
| string | `create` | `libs/strategy/src/rules/strategy-rule.compiler.ts:228:25` | `decimalBoundary === 'create'` |
| string | `entry` | `libs/strategy/src/rules/strategy-rule.compiler.ts:236:17` | `value !== 'entry'` |
| string | `exit` | `libs/strategy/src/rules/strategy-rule.compiler.ts:236:38` | `value !== 'exit'` |
| string | `crossesAbove` | `libs/strategy/src/rules/strategy-rule.compiler.ts:242:23` | `operator === 'crossesAbove'` |
| string | `crossesBelow` | `libs/strategy/src/rules/strategy-rule.compiler.ts:242:54` | `operator === 'crossesBelow'` |
| string | `entry` | `libs/strategy/src/simulation/kernel-signal-mapper.ts:14:39` | `signal.signalKind === 'entry'` |
| number | `60` | `libs/strategy/src/simulation/standard-simulation-flows.ts:29:57` | `options?.requiredBarCount ?? 60` |
| string | `both` | `libs/strategy/src/simulation/standard-simulation-flows.ts:33:19` | `direction === 'both'` |
| string | `sell` | `libs/strategy/src/simulation/standard-simulation-flows.ts:33:51` | `direction === 'sell'` |
| string | `both` | `libs/strategy/src/simulation/standard-simulation-flows.ts:35:19` | `direction === 'both'` |
| string | `sell` | `libs/strategy/src/simulation/standard-simulation-flows.ts:35:54` | `direction === 'sell'` |
| string | `guard_chan_bsp` | `libs/strategy/src/simulation/standard-simulation-flows.ts:38:9` | `id: 'guard_chan_bsp'` |
| string | `GUARD` | `libs/strategy/src/simulation/standard-simulation-flows.ts:39:11` | `type: 'GUARD'` |
| string | `缠论形态买卖点标准门禁` | `libs/strategy/src/simulation/standard-simulation-flows.ts:40:11` | `name: '缠论形态买卖点标准门禁'` |
| string | `plugin.chan.bsp` | `libs/strategy/src/simulation/standard-simulation-flows.ts:41:15` | `pluginId: 'plugin.chan.bsp'` |
| number | `0.6` | `libs/strategy/src/simulation/standard-simulation-flows.ts:50:20` | `minConfidence: 0.6` |
| string | `term_chan_bsp_passed` | `libs/strategy/src/simulation/standard-simulation-flows.ts:52:11` | `id: 'term_chan_bsp_passed'` |
| string | `TERMINAL` | `libs/strategy/src/simulation/standard-simulation-flows.ts:53:13` | `type: 'TERMINAL'` |
| string | `CHAN_BSP` | `libs/strategy/src/simulation/standard-simulation-flows.ts:55:18` | `signalTag: 'CHAN_BSP'` |
| string | `缠论结构确立，触发买卖点信号` | `libs/strategy/src/simulation/standard-simulation-flows.ts:56:15` | `reason: '缠论结构确立，触发买卖点信号'` |
| string | `term_chan_bsp_rejected` | `libs/strategy/src/simulation/standard-simulation-flows.ts:59:11` | `id: 'term_chan_bsp_rejected'` |
| string | `TERMINAL` | `libs/strategy/src/simulation/standard-simulation-flows.ts:60:13` | `type: 'TERMINAL'` |
| string | `ABORT` | `libs/strategy/src/simulation/standard-simulation-flows.ts:61:15` | `action: 'ABORT'` |
| string | `未满足缠论买卖点形态确认条件` | `libs/strategy/src/simulation/standard-simulation-flows.ts:62:15` | `reason: '未满足缠论买卖点形态确认条件'` |
| number | `250` | `libs/strategy/src/simulation/strategy-simulation.session.ts:42:21` | `private speedMs = 250;` |
| number | `-8640000000000000` | `libs/strategy/src/simulation/strategy-simulation.session.ts:60:18` | `new Date(-8640000000000000)` |
| number | `600` | `libs/strategy/src/simulation/strategy-simulation.session.ts:85:52` | `config.windowBudget ?? 600` |
| string | `play` | `libs/strategy/src/simulation/strategy-simulation.session.ts:142:12` | `case 'play': this.play(); return this.getCurrentFrame();` |
| string | `step_next` | `libs/strategy/src/simulation/strategy-simulation.session.ts:148:12` | `case 'step_next': this.pause(); return this.stepNext();` |
| string | `step_prev` | `libs/strategy/src/simulation/strategy-simulation.session.ts:151:12` | `case 'step_prev': this.pause(); return this.stepPrev();` |
| string | `seek` | `libs/strategy/src/simulation/strategy-simulation.session.ts:154:12` | `case 'seek': this.pause(); return this.seek(command.param ?? 0);` |
| string | `set_speed` | `libs/strategy/src/simulation/strategy-simulation.session.ts:157:12` | `case 'set_speed': if ( typeof command.param === 'number' && command.param >= 20 && command.param <= ` |
| number | `20` | `libs/strategy/src/simulation/strategy-simulation.session.ts:160:28` | `command.param >= 20` |
| number | `5000` | `libs/strategy/src/simulation/strategy-simulation.session.ts:161:28` | `command.param <= 5000` |
| string | `playing` | `libs/strategy/src/simulation/strategy-simulation.session.ts:164:31` | `this.status === 'playing'` |
| string | `paused` | `libs/strategy/src/simulation/strategy-simulation.session.ts:188:20` | `this.setStatus('paused')` |
| string | `completed` | `libs/strategy/src/simulation/strategy-simulation.session.ts:231:22` | `this.setStatus('completed')` |
| number | `20` | `libs/strategy/src/simulation/strategy-simulation.session.ts:266:25` | `this.cursor % 20` |
| string | `completed` | `libs/strategy/src/simulation/strategy-simulation.session.ts:310:20` | `this.setStatus('completed')` |
| string | `playing` | `libs/strategy/src/simulation/strategy-simulation.session.ts:324:20` | `this.setStatus('playing')` |
| string | `completed` | `libs/strategy/src/simulation/strategy-simulation.session.ts:333:26` | `this.setStatus('completed')` |
| string | `FAILED` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:93:24` | `riskGrade: 'FAILED'` |
| string | `FAILED` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:101:62` | `o.survivalAssessment.riskGrade !== 'FAILED'` |
| string | `CRITICAL` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:105:44` | `o.survivalAssessment.riskGrade === 'CRITICAL'` |
| string | `FAILED` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:106:44` | `o.survivalAssessment.riskGrade === 'FAILED'` |
| number | `10000` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:162:62` | `Math.min(...returns) * 10000` |
| number | `10000` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:162:71` | `Math.round(Math.min(...returns) * 10000) / 10000` |
| number | `0.35` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:174:30` | `metrics.maxDrawdown >= 0.35` |
| number | `-0.07` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:175:24` | `metrics.var99 <= -0.07` |
| number | `-0.3` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:176:30` | `metrics.totalReturn <= -0.3` |
| number | `0.18` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:180:30` | `metrics.maxDrawdown >= 0.18` |
| number | `-0.04` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:181:24` | `metrics.var95 <= -0.04` |
| number | `45` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:182:40` | `metrics.maxUnderwaterDuration >= 45` |
| string | `EXCELLENT` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:214:24` | `overallRating: 'EXCELLENT'` |
| number | `10000` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:250:15` | `(successfulOutcomes.reduce( (acc, o) => acc + o.metrics.sharpeRatio, 0, ) / successfulOutcomes.lengt` |
| number | `10000` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:251:15` | `Math.round( (successfulOutcomes.reduce( (acc, o) => acc + o.metrics.sharpeRatio, 0, ) / successfulOu` |
| number | `10000` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:262:15` | `(successfulOutcomes.reduce( (acc, o) => acc + o.metrics.totalReturn, 0, ) / successfulOutcomes.lengt` |
| number | `10000` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:263:15` | `Math.round( (successfulOutcomes.reduce( (acc, o) => acc + o.metrics.totalReturn, 0, ) / successfulOu` |
| number | `20` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:274:30` | `failedCount * 20` |
| number | `0.5` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:276:32` | `worstCaseDrawdown >= 0.5` |
| number | `35` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:277:18` | `score -= 35` |
| number | `0.35` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:278:39` | `worstCaseDrawdown >= 0.35` |
| number | `25` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:279:18` | `score -= 25` |
| number | `0.2` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:280:39` | `worstCaseDrawdown >= 0.2` |
| number | `15` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:281:18` | `score -= 15` |
| number | `0.1` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:282:39` | `worstCaseDrawdown >= 0.1` |
| number | `5` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:283:18` | `score -= 5` |
| number | `20` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:287:18` | `score -= 20` |
| number | `50` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:288:43` | `maxUnderwaterDuration >= 50` |
| number | `10` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:289:18` | `score -= 10` |
| number | `25` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:290:43` | `maxUnderwaterDuration >= 25` |
| number | `5` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:291:18` | `score -= 5` |
| number | `5000` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:294:35` | `totalLiquidityPenalty > 5000` |
| number | `15` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:295:18` | `score -= 15` |
| number | `5` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:297:18` | `score -= 5` |
| number | `-0.095` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:300:31` | `worstDailyReturn <= -0.095` |
| number | `15` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:301:18` | `score -= 15` |
| number | `-0.05` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:302:38` | `worstDailyReturn <= -0.05` |
| number | `5` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:303:18` | `score -= 5` |
| number | `50` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:310:30` | `overallHealthScore < 50` |
| number | `70` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:312:37` | `overallHealthScore < 70` |
| number | `85` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:314:37` | `overallHealthScore < 85` |
| string | `策略发生穿仓破产，必须立即检查仓位管理与硬止损强制平仓机制。` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:321:9` | `keyRecommendations.push( '策略发生穿仓破产，必须立即检查仓位管理与硬止损强制平仓机制。', )` |
| number | `0.25` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:324:30` | `worstCaseDrawdown >= 0.25` |
| string | `最坏回撤超过 25%，建议在统一动作裁决器中强化系统性雪崩 (SYSTEMIC_CRUNCH) 紧急清仓门禁。` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:326:9` | `keyRecommendations.push( '最坏回撤超过 25%，建议在统一动作裁决器中强化系统性雪崩 (SYSTEMIC_CRUNCH) 紧急清仓门禁。', )` |
| number | `50` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:329:34` | `maxUnderwaterDuration >= 50` |
| string | `最大回撤潜伏期超过 50 个交易日，建议引入止损后冷静期或震荡休眠机制，避免单边阴跌频繁假突破磨损。` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:331:9` | `keyRecommendations.push( '最大回撤潜伏期超过 50 个交易日，建议引入止损后冷静期或震荡休眠机制，避免单边阴跌频繁假突破磨损。', )` |
| string | `存在跌停流动性冻结导致的顺延滑点损失，建议引入大盘微观流动性恶化预警，在右侧二卖确认时尽早出场。` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:336:9` | `keyRecommendations.push( '存在跌停流动性冻结导致的顺延滑点损失，建议引入大盘微观流动性恶化预警，在右侧二卖确认时尽早出场。', )` |
| number | `-0.07` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:339:29` | `worstDailyReturn <= -0.07` |
| string | `存在极端单日断崖式跌幅，建议在持仓端控制单日敞口，防范隔夜跳空与突发跌停。` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:341:9` | `keyRecommendations.push( '存在极端单日断崖式跌幅，建议在持仓端控制单日敞口，防范隔夜跳空与突发跌停。', )` |
| string | `策略在五大历史极端压力测试中表现稳健，具备优异的极端行情生存能力与风控纪律。` | `libs/strategy/src/stress-testing/stress-testing-suite.orchestrator.ts:347:9` | `keyRecommendations.push( '策略在五大历史极端压力测试中表现稳健，具备优异的极端行情生存能力与风控纪律。', )` |
| number | `100000` | `libs/strategy/src/wfa/walk-forward.orchestrator.ts:29:54` | `options.initialCapital ?? 100000` |
| number | `10000` | `libs/strategy/src/wfa/walk-forward.orchestrator.ts:68:64` | `(totalOverfitting / foldResults.length) * 10000` |
| number | `10000` | `libs/strategy/src/wfa/walk-forward.orchestrator.ts:68:73` | `Math.round((totalOverfitting / foldResults.length) * 10000) / 10000` |
| number | `10000` | `libs/strategy/src/wfa/wfa-stitcher.ts:140:27` | `psi * 10000` |
| number | `10000` | `libs/strategy/src/wfa/wfa-stitcher.ts:140:36` | `Math.round(psi * 10000) / 10000` |
| number | `12` | `libs/strategy/src/wfa/wfa-window-slicer.ts:15:54` | `targetMonth / 12` |
| number | `12` | `libs/strategy/src/wfa/wfa-window-slicer.ts:16:43` | `targetMonth % 12` |
| number | `12` | `libs/strategy/src/wfa/wfa-window-slicer.ts:16:49` | `(targetMonth % 12) + 12` |
| number | `12` | `libs/strategy/src/wfa/wfa-window-slicer.ts:16:55` | `((targetMonth % 12) + 12) % 12` |
| number | `12` | `libs/strategy/src/wfa/wfa-window-slicer.ts:52:54` | `options.trainDurationMonths ?? 12` |
| number | `3` | `libs/strategy/src/wfa/wfa-window-slicer.ts:53:52` | `options.testDurationMonths ?? 3` |
| string | `anchored` | `libs/strategy/src/wfa/wfa-window-slicer.ts:72:32` | `options.windowType === 'anchored'` |
| string | `rolling` | `libs/strategy/src/wfa/wfa-window-slicer.ts:100:32` | `options.windowType === 'rolling'` |
| number | `10000` | `libs/timezone/src/timezone.service.ts:55:18` | `timeout: 10000` |
| string | `T` | `libs/timezone/src/timezone.service.ts:81:47` | `normalized.replace(' ', 'T')` |
| string | `+08:00` | `libs/timezone/src/timezone.service.ts:81:54` | `normalized.replace(' ', 'T') + '+08:00'` |
| string | `yyyy-MM-dd` | `libs/timezone/src/timezone.service.ts:110:25` | `format(date, 'yyyy-MM-dd')` |
| number | `10` | `libs/timezone/src/timezone.service.ts:129:23` | `maxLookbackDays = 10` |
| string | `yyyy-MM-dd` | `libs/timezone/src/timezone.service.ts:150:34` | `format(date, 'yyyy-MM-dd')` |
| string | `http://www.szse.cn/api/report/exchange/onepersistenthour/monthList` | `libs/timezone/src/timezone.service.ts:183:9` | `this.axios.get<SzseTradingDayResponse>( 'http://www.szse.cn/api/report/exchange/onepersistenthour/mo` |
| string | `yyyy-MM` | `libs/timezone/src/timezone.service.ts:186:37` | `format(date, 'yyyy-MM')` |
| string | `yyyy-MM-dd` | `libs/timezone/src/timezone.service.ts:202:44` | `format(date, 'yyyy-MM-dd')` |
| number | `6` | `libs/timezone/src/timezone.service.ts:226:33` | `day === 6` |
| number | `60` | `libs/timezone/src/trading-session.util.ts:29:43` | `zoned.getHours() * 60` |
| number | `6` | `libs/timezone/src/trading-session.util.ts:43:28` | `day === 6` |
| number | `60` | `libs/timezone/src/trading-session.util.ts:44:41` | `shanghai.getHours() * 60` |
| number | `4` | `libs/timezone/src/trading-session.util.ts:61:45` | `zoned.getFullYear().toString().padStart(4, '0')` |
| number | `4` | `libs/timezone/src/trading-session.util.ts:78:56` | `zoned.getFullYear().toString().padStart(4, '0')` |
| number | `4` | `libs/timezone/src/trading-session.util.ts:95:56` | `zoned.getFullYear().toString().padStart(4, '0')` |
| number | `15` | `libs/timezone/src/trading-session.util.ts:113:31` | `zoned.getHours() === 15` |
| number | `60` | `libs/timezone/src/trading-session.util.ts:134:24` | `hour * 60` |
| number | `500` | `libs/transport/src/http/http-code.ts:35:41` | `status >= 500` |
| number | `500` | `libs/transport/src/http/http-code.ts:42:16` | `status >= 500` |
| number | `400` | `libs/transport/src/http/http-exception.filter.ts:38:18` | `status === 400` |
| string | `VALIDATION_ERROR` | `libs/transport/src/http/http-exception.filter.ts:39:24` | `explicitCode === 'VALIDATION_ERROR'` |
| string | `X-Request-Id` | `libs/transport/src/http/http-exception.filter.ts:65:24` | `response.setHeader('X-Request-Id', requestId)` |
| number | `500` | `libs/transport/src/http/http-exception.filter.ts:71:49` | `return 500;` |
| number | `400` | `libs/transport/src/http/http-exception.filter.ts:79:50` | `status >= 400` |
| number | `599` | `libs/transport/src/http/http-exception.filter.ts:79:67` | `status <= 599` |
| number | `500` | `libs/transport/src/http/http-exception.filter.ts:94:19` | `status >= 500` |
| number | `500` | `libs/transport/src/http/http-exception.filter.ts:116:18` | `status < 500` |
| number | `8` | `libs/transport/src/http/http-exception.filter.ts:142:62` | `traces.length < 8` |
| string | `
Caused by: ` | `libs/transport/src/http/http-exception.filter.ts:149:22` | `traces.join('\nCaused by: ')` |
| number | `200` | `libs/transport/src/http/http-openapi.decorator.ts:37:60` | `options.status !== 200` |
| number | `204` | `libs/transport/src/http/http-openapi.decorator.ts:43:26` | `options.status === 204` |
| number | `400` | `libs/transport/src/http/http-openapi.decorator.ts:79:24` | `options.status < 400` |
| number | `599` | `libs/transport/src/http/http-openapi.decorator.ts:79:48` | `options.status > 599` |
| string | `integer` | `libs/transport/src/http/http-openapi.decorator.ts:112:31` | `type: 'integer'` |
| string | `integer` | `libs/transport/src/http/http-openapi.decorator.ts:127:31` | `type: 'integer'` |
| number | `200` | `libs/transport/src/http/http-openapi.decorator.ts:127:49` | `[200]` |
| string | `integer` | `libs/transport/src/http/http-openapi.decorator.ts:147:31` | `type: 'integer'` |
| string | `array` | `libs/transport/src/http/http-openapi.decorator.ts:159:28` | `type: 'array'` |
| number | `599` | `libs/transport/src/http/http-openapi.decorator.ts:183:61` | `status > 599` |
| string | `X-Request-Id` | `libs/transport/src/http/http-request-context.middleware.ts:13:24` | `response.setHeader('X-Request-Id', requestId)` |
| string | `/health` | `libs/transport/src/http/http-response.interceptor.ts:40:36` | `requestPath(request) === '/health'` |
| number | `200` | `libs/transport/src/http/http-response.interceptor.ts:50:27` | `response.status(200)` |
| number | `200` | `libs/transport/src/http/http-response.interceptor.ts:53:25` | `statusCode: 200` |
| number | `204` | `libs/transport/src/http/http-response.interceptor.ts:63:37` | `response.statusCode === 204` |
| string | `X-Request-Id` | `libs/transport/src/http/http-response.interceptor.ts:86:29` | `response.hasHeader('X-Request-Id')` |
| string | `X-Request-Id` | `libs/transport/src/http/http-response.interceptor.ts:87:26` | `response.setHeader('X-Request-Id', requestId)` |
| string | `?` | `libs/transport/src/http/http-response.interceptor.ts:95:29` | `request.url?.split('?')` |
| string | `VALIDATION_ERROR` | `libs/transport/src/http/http-validation-error.factory.ts:54:15` | `code: 'VALIDATION_ERROR'` |
| string | `Request validation failed` | `libs/transport/src/http/http-validation-error.factory.ts:55:18` | `message: 'Request validation failed'` |
| string | `RPC request` | `libs/transport/src/rpc/rpc-decoder.ts:15:56` | `exactRecord(value, ['meta', 'data'], 'RPC request')` |
| string | `RPC request data` | `libs/transport/src/rpc/rpc-decoder.ts:19:55` | `runDomainDecoder(dataDecoder, request.data, 'RPC request data')` |
| string | `RPC success` | `libs/transport/src/rpc/rpc-decoder.ts:36:63` | `exactRecord(value, ['ok', 'meta', 'data'], 'RPC success')` |
| string | `RPC success data` | `libs/transport/src/rpc/rpc-decoder.ts:45:9` | `runDomainDecoder( successDataDecoder, result.data, 'RPC success data', )` |
| string | `RPC rejection` | `libs/transport/src/rpc/rpc-decoder.ts:50:62` | `exactRecord(value, ['ok', 'meta', 'error'], 'RPC rejection')` |
| string | `RPC rejection error` | `libs/transport/src/rpc/rpc-decoder.ts:57:5` | `recordWithAllowedKeys( result.error, ['code'], ['data'], 'RPC rejection error', )` |
| string | `RPC error code` | `libs/transport/src/rpc/rpc-decoder.ts:59:63` | `runDomainDecoder(errorCodeDecoder, error.code, 'RPC error code')` |
| string | `RPC error data` | `libs/transport/src/rpc/rpc-decoder.ts:74:15` | `runDomainDecoder( errorDataDecoder as RpcDomainDecoder<TErrorData>, error.data, 'RPC error data', )` |
| string | `RPC meta` | `libs/transport/src/rpc/rpc-decoder.ts:83:54` | `exactRecord(value, ['correlationId'], 'RPC meta')` |
| string | `RPC request validation failed` | `libs/transport/src/rpc/rpc-envelope.ts:106:11` | `super('RPC request validation failed')` |
| number | `8` | `libs/transport/src/rpc/rpc-exception.filter.ts:84:62` | `traces.length < 8` |
| string | `
Caused by: ` | `libs/transport/src/rpc/rpc-exception.filter.ts:91:22` | `traces.join('\nCaused by: ')` |
| string | `[object Object]` | `libs/utils/src/error.util.ts:26:20` | `str !== '[object Object]'` |
| number | `10000` | `libs/utils/src/utils.service.ts:15:34` | `config.timeout \|\| 10000` |
| string | `duan` | `libs/visual-command/src/adapters/chan-swing.util.ts:25:17` | `units === 'duan'` |
| number | `3` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:46:36` | `klines.length < 3` |
| string | `line` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:103:17` | `type: 'line'` |
| string | `chan_bi` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:104:18` | `layer: 'chan_bi'` |
| string | `solid` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:113:18` | `style: 'solid'` |
| string | `band` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:153:17` | `type: 'band'` |
| string | `chan_zs_bi` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:154:18` | `layer: 'chan_zs_bi'` |
| string | `line` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:215:17` | `type: 'line'` |
| string | `chan_duan` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:216:18` | `layer: 'chan_duan'` |
| string | `solid` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:225:18` | `style: 'solid'` |
| string | `band` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:270:17` | `type: 'band'` |
| string | `chan_zs_duan` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:271:18` | `layer: 'chan_zs_duan'` |
| number | `3` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:298:37` | `bis.length >= 3` |
| string | `text` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:324:17` | `type: 'text'` |
| string | `chan_bsp_bi` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:325:18` | `layer: 'chan_bsp_bi'` |
| number | `3` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:337:27` | `duans.length >= 3` |
| string | `text` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:364:19` | `type: 'text'` |
| string | `chan_bsp_duan` | `libs/visual-command/src/adapters/chan-visual.adapter.ts:365:20` | `layer: 'chan_bsp_duan'` |
| string | `0.236` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:72:18` | `upper: '0.236'` |
| string | `0.382` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:72:34` | `lower: '0.382'` |
| string | `0.382` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:73:18` | `upper: '0.382'` |
| string | `0.5` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:73:34` | `lower: '0.5'` |
| string | `0.5` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:74:18` | `upper: '0.5'` |
| string | `0.618` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:74:32` | `lower: '0.618'` |
| string | `0.618` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:75:18` | `upper: '0.618'` |
| string | `0.786` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:75:34` | `lower: '0.786'` |
| string | `0.786` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:76:18` | `upper: '0.786'` |
| string | `band` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:91:19` | `type: 'band'` |
| string | `fibonacci` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:92:20` | `layer: 'fibonacci'` |
| string | `line` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:115:15` | `type: 'line'` |
| string | `fibonacci` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:116:16` | `layer: 'fibonacci'` |
| number | `1.5` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:125:55` | `ratioStr === '0' \|\| ratioStr === '1' ? 1.5 : 1` |
| string | `text` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:132:17` | `type: 'text'` |
| string | `fibonacci` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:133:18` | `layer: 'fibonacci'` |
| string | `above` | `libs/visual-command/src/adapters/fibonacci-visual.adapter.ts:139:21` | `position: 'above'` |
| string | `chan_zs` | `libs/visual-command/src/visual-command.service.ts:46:20` | `layerSet.has('chan_zs')` |
| string | `chan_zs_bi` | `libs/visual-command/src/visual-command.service.ts:47:20` | `layerSet.has('chan_zs_bi')` |
| string | `chan_zs_duan` | `libs/visual-command/src/visual-command.service.ts:48:20` | `layerSet.has('chan_zs_duan')` |
| string | `chan_bsp` | `libs/visual-command/src/visual-command.service.ts:51:20` | `layerSet.has('chan_bsp')` |
| string | `chan_bsp_bi` | `libs/visual-command/src/visual-command.service.ts:52:20` | `layerSet.has('chan_bsp_bi')` |
| string | `chan_bsp_duan` | `libs/visual-command/src/visual-command.service.ts:53:20` | `layerSet.has('chan_bsp_duan')` |
| string | `chan` | `libs/visual-command/src/visual-command.service.ts:57:20` | `layerSet.has('chan')` |
| string | `chan_bi` | `libs/visual-command/src/visual-command.service.ts:58:20` | `layerSet.has('chan_bi')` |
| string | `chan_duan` | `libs/visual-command/src/visual-command.service.ts:59:20` | `layerSet.has('chan_duan')` |
| string | `chan` | `libs/visual-command/src/visual-command.service.ts:65:34` | `layerSet.has('chan')` |
| string | `chan_bi` | `libs/visual-command/src/visual-command.service.ts:65:57` | `layerSet.has('chan_bi')` |
| string | `chan` | `libs/visual-command/src/visual-command.service.ts:66:36` | `layerSet.has('chan')` |
| string | `chan_duan` | `libs/visual-command/src/visual-command.service.ts:66:59` | `layerSet.has('chan_duan')` |
| string | `chan` | `libs/visual-command/src/visual-command.service.ts:67:40` | `layerSet.has('chan')` |
| string | `chan` | `libs/visual-command/src/visual-command.service.ts:68:35` | `layerSet.has('chan')` |
| string | `fibonacci` | `libs/visual-command/src/visual-command.service.ts:74:22` | `layerSet.has('fibonacci')` |
| string | `k.json` | `tools/strategy-dev/provider.ts:67:61` | `path.join(baseDir, options.caseKey, 'k.json')` |
| string | `, ` | `tools/strategy-dev/provider.ts:75:66` | `FIXTURE_DIRS.join(', ')` |
| string | `, ` | `tools/strategy-dev/provider.ts:114:19` | `listAvailableDatasets() .map((d) => d.key) .join(', ')` |
| string | `k.json` | `tools/strategy-dev/provider.ts:157:54` | `path.join(baseDir, ent.name, 'k.json')` |
| string | `meta.json` | `tools/strategy-dev/provider.ts:162:61` | `path.join(baseDir, ent.name, 'meta.json')` |
| string | `fixture` | `tools/strategy-dev/provider.ts:174:21` | `type: 'fixture'` |
| string | `.json` | `tools/strategy-dev/provider.ts:192:24` | `f.endsWith('.json')` |
| string | `.json` | `tools/strategy-dev/provider.ts:193:35` | `f.replace('.json', '')` |
| string | `cache` | `tools/strategy-dev/provider.ts:197:19` | `type: 'cache'` |
| string | `.json` | `tools/strategy-dev/provider.ts:198:28` | `f.replace('.json', '')` |
| string | `meta.json` | `tools/strategy-dev/provider.ts:220:53` | `path.join(baseDir, ent.name, 'meta.json')` |
| string | `k.json` | `tools/strategy-dev/provider.ts:228:49` | `path.join(baseDir, ent.name, 'k.json')` |
| string | `case` | `tools/strategy-dev/runner.ts:58:26` | `getArg('case')` |
| string | `caseKey` | `tools/strategy-dev/runner.ts:58:44` | `getArg('caseKey')` |
| string | `code` | `tools/strategy-dev/runner.ts:59:23` | `getArg('code')` |
| string | `period` | `tools/strategy-dev/runner.ts:60:25` | `getArg('period')` |
| string | `subPeriod` | `tools/strategy-dev/runner.ts:61:28` | `getArg('subPeriod')` |
| string | `sub` | `tools/strategy-dev/runner.ts:61:51` | `getArg('sub')` |
| string | `parentPeriod` | `tools/strategy-dev/runner.ts:62:31` | `getArg('parentPeriod')` |
| string | `parent` | `tools/strategy-dev/runner.ts:62:57` | `getArg('parent')` |
| string | `capital` | `tools/strategy-dev/runner.ts:63:36` | `getArg('capital')` |
| number | `100000` | `tools/strategy-dev/runner.ts:71:50` | `Number(initialCapitalStr) \|\| 100000` |
| number | `30` | `tools/strategy-dev/runner.ts:75:51` | `fallback = 30` |
| string | `complete` | `tools/strategy-dev/runner.ts:111:11` | `type: 'complete'` |
| number | `30` | `tools/strategy-dev/runner.ts:137:51` | `resolvePeriod(options.period, 30)` |
| number | `10` | `tools/strategy-dev/runner.ts:157:58` | `klines[0]?.time.toISOString().substring(0, 10)` |
| number | `10` | `tools/strategy-dev/runner.ts:157:126` | `klines[klines.length - 1]?.time.toISOString().substring(0, 10)` |
| number | `-8640000000000000` | `tools/strategy-dev/runner.ts:171:26` | `new Date(-8640000000000000)` |
| number | `60` | `tools/strategy-dev/runner.ts:178:27` | `requiredBarCount: 60` |
| number | `19` | `tools/strategy-dev/runner.ts:215:61` | `s.signalTime.replace('T', ' ').substring(0, 19)` |
| number | `19` | `tools/strategy-dev/runner.ts:216:60` | `s.pivotTime.replace('T', ' ').substring(0, 19)` |
| number | `99.9` | `tools/strategy-dev/runner.ts:287:65` | `grossProfit > 0 ? 99.9 : 0` |
| string | `Forbidden: Strategy simulation suite is strictly restricted to local development environment and disabled in production.` | `tools/strategy-dev/server.ts:80:11` | `error: 'Forbidden: Strategy simulation suite is strictly restricted to local development environment` |
| string | `.json` | `tools/strategy-dev/server.ts:168:39` | `file.endsWith('.json')` |
| string | `latest-dump.json` | `tools/strategy-dev/server.ts:168:60` | `file !== 'latest-dump.json'` |
| string | `complete` | `tools/strategy-dev/server.ts:229:11` | `type: 'complete'` |
| string | `上证指数 30m 缠论策略树决策流回测` | `tools/strategy-dev/server.ts:321:19` | `strategyName: '上证指数 30m 缠论策略树决策流回测'` |
| string | `completed` | `tools/strategy-dev/server.ts:323:13` | `status: 'completed'` |
| string | `qmt` | `tools/strategy-dev/server.ts:324:13` | `source: 'qmt'` |
| number | `30` | `tools/strategy-dev/server.ts:326:13` | `period: 30` |
| string | `2025-07-03T05:30:00.000Z` | `tools/strategy-dev/server.ts:327:16` | `startDate: '2025-07-03T05:30:00.000Z'` |
| string | `2026-09-24T07:00:00.000Z` | `tools/strategy-dev/server.ts:328:14` | `endDate: '2026-09-24T07:00:00.000Z'` |
| number | `51` | `tools/strategy-dev/server.ts:329:18` | `signalCount: 51` |
| string | `2026-09-25T05:00:00.000Z` | `tools/strategy-dev/server.ts:331:16` | `startedAt: '2026-09-25T05:00:00.000Z'` |
| string | `2026-09-25T05:00:02.000Z` | `tools/strategy-dev/server.ts:332:18` | `completedAt: '2026-09-25T05:00:02.000Z'` |
| string | `2026-09-25T05:00:00.000Z` | `tools/strategy-dev/server.ts:333:16` | `createdAt: '2026-09-25T05:00:00.000Z'` |
| string | `上证指数 日线 缠论策略树决策流回测` | `tools/strategy-dev/server.ts:338:19` | `strategyName: '上证指数 日线 缠论策略树决策流回测'` |
| string | `completed` | `tools/strategy-dev/server.ts:340:13` | `status: 'completed'` |
| string | `qmt` | `tools/strategy-dev/server.ts:341:13` | `source: 'qmt'` |
| number | `1440` | `tools/strategy-dev/server.ts:343:13` | `period: 1440` |
| string | `2024-01-01T16:00:00.000Z` | `tools/strategy-dev/server.ts:344:16` | `startDate: '2024-01-01T16:00:00.000Z'` |
| string | `2026-09-23T16:00:00.000Z` | `tools/strategy-dev/server.ts:345:14` | `endDate: '2026-09-23T16:00:00.000Z'` |
| string | `2026-09-25T04:50:00.000Z` | `tools/strategy-dev/server.ts:348:16` | `startedAt: '2026-09-25T04:50:00.000Z'` |
| string | `2026-09-25T04:50:01.000Z` | `tools/strategy-dev/server.ts:349:18` | `completedAt: '2026-09-25T04:50:01.000Z'` |
| string | `2026-09-25T04:50:00.000Z` | `tools/strategy-dev/server.ts:350:16` | `createdAt: '2026-09-25T04:50:00.000Z'` |
| number | `3` | `tools/strategy-dev/server.ts:353:9` | `id: 3` |
| string | `上证指数 5m 缠论策略树决策流回测` | `tools/strategy-dev/server.ts:355:19` | `strategyName: '上证指数 5m 缠论策略树决策流回测'` |
| string | `completed` | `tools/strategy-dev/server.ts:357:13` | `status: 'completed'` |
| string | `qmt` | `tools/strategy-dev/server.ts:358:13` | `source: 'qmt'` |
| number | `5` | `tools/strategy-dev/server.ts:360:13` | `period: 5` |
| string | `2025-07-03T05:30:00.000Z` | `tools/strategy-dev/server.ts:361:16` | `startDate: '2025-07-03T05:30:00.000Z'` |
| string | `2026-09-24T07:00:00.000Z` | `tools/strategy-dev/server.ts:362:14` | `endDate: '2026-09-24T07:00:00.000Z'` |
| number | `4` | `tools/strategy-dev/server.ts:363:18` | `signalCount: 4` |
| string | `2026-09-25T04:45:00.000Z` | `tools/strategy-dev/server.ts:365:16` | `startedAt: '2026-09-25T04:45:00.000Z'` |
| string | `2026-09-25T04:45:01.000Z` | `tools/strategy-dev/server.ts:366:18` | `completedAt: '2026-09-25T04:45:01.000Z'` |
| string | `2026-09-25T04:45:00.000Z` | `tools/strategy-dev/server.ts:367:16` | `createdAt: '2026-09-25T04:45:00.000Z'` |
| number | `200` | `tools/strategy-dev/server.ts:460:51` | `startIndex - 200` |
| number | `-8640000000000000` | `tools/strategy-dev/server.ts:467:16` | `new Date(-8640000000000000)` |
| number | `60` | `tools/strategy-dev/server.ts:480:27` | `requiredBarCount: 60` |
| string | `/v1/indicators/k` | `tools/strategy-dev/server.ts:518:24` | `pathname.endsWith('/v1/indicators/k')` |
| string | `/indicators/k` | `tools/strategy-dev/server.ts:519:25` | `pathname.endsWith('/indicators/k')` |
| string | `/v1/chan/merge-k` | `tools/strategy-dev/server.ts:581:25` | `pathname.endsWith('/v1/chan/merge-k')` |
| number | `200` | `tools/strategy-dev/server.ts:609:25` | `sendJson(res, [], 200)` |
| string | `/v1/visual/commands` | `tools/strategy-dev/server.ts:615:25` | `pathname.endsWith('/v1/visual/commands')` |
| string | `/v1/simulation/` | `tools/strategy-dev/server.ts:675:25` | `pathname.includes('/v1/simulation/')` |
| string | `/v1/simulation/start` | `tools/strategy-dev/server.ts:682:25` | `pathname.endsWith('/v1/simulation/start')` |
| string | `/v1/simulation/stream` | `tools/strategy-dev/server.ts:802:25` | `pathname.endsWith('/v1/simulation/stream')` |
| number | `404` | `tools/strategy-dev/server.ts:807:21` | `res.writeHead(404, { 'Content-Type': 'text/plain' })` |
| number | `200` | `tools/strategy-dev/server.ts:812:19` | `res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',` |
| string | `no-cache, no-transform` | `tools/strategy-dev/server.ts:814:24` | `'Cache-Control': 'no-cache, no-transform'` |
| string | `no` | `tools/strategy-dev/server.ts:817:28` | `'X-Accel-Buffering': 'no'` |
| string | `: stream-connected

` | `tools/strategy-dev/server.ts:819:15` | `res.write(': stream-connected\n\n')` |
| string | `: ping

` | `tools/strategy-dev/server.ts:850:19` | `res.write(': ping\n\n')` |
| string | `/v1/simulation/control` | `tools/strategy-dev/server.ts:869:25` | `pathname.endsWith('/v1/simulation/control')` |
| string | `/v1/simulation/stop` | `tools/strategy-dev/server.ts:905:25` | `pathname.endsWith('/v1/simulation/stop')` |
| string | `completed` | `tools/strategy-dev/server.ts:918:64` | `status: 'completed'` |
| string | `/v1/simulation/dump` | `tools/strategy-dev/server.ts:932:25` | `pathname.endsWith('/v1/simulation/dump')` |
| string | `No active simulation session found` | `tools/strategy-dev/server.ts:942:30` | `error: 'No active simulation session found'` |
| number | `404` | `tools/strategy-dev/server.ts:942:70` | `sendJson(res, { error: 'No active simulation session found' }, 404)` |
| string | `../../.data/simulation-dumps` | `tools/strategy-dev/server.ts:987:49` | `path.resolve(__dirname, '../../.data/simulation-dumps')` |
| string | `latest-dump.json` | `tools/strategy-dev/server.ts:992:30` | `path.join(dumpDir, 'latest-dump.json')` |
| number | `500` | `tools/strategy-dev/server.ts:1011:45` | `sendJson(res, { error: err.message }, 500)` |
| string | `/v1/strategies` | `tools/strategy-dev/server.ts:1017:25` | `pathname.endsWith('/v1/strategies')` |
| string | `缠论标准策略树` | `tools/strategy-dev/server.ts:1021:15` | `name: '缠论标准策略树'` |
| string | `基于策略树决策流与标准缠论买卖点` | `tools/strategy-dev/server.ts:1022:22` | `description: '基于策略树决策流与标准缠论买卖点'` |
| string | `decision_flow` | `tools/strategy-dev/server.ts:1023:15` | `kind: 'decision_flow'` |
| string | `active` | `tools/strategy-dev/server.ts:1024:17` | `status: 'active'` |
| number | `5` | `tools/strategy-dev/server.ts:1026:22` | `[1, 5, 15, 30, 60, 1440]` |
| number | `15` | `tools/strategy-dev/server.ts:1026:25` | `[1, 5, 15, 30, 60, 1440]` |
| number | `30` | `tools/strategy-dev/server.ts:1026:29` | `[1, 5, 15, 30, 60, 1440]` |
| number | `60` | `tools/strategy-dev/server.ts:1026:33` | `[1, 5, 15, 30, 60, 1440]` |
| number | `1440` | `tools/strategy-dev/server.ts:1026:37` | `[1, 5, 15, 30, 60, 1440]` |
| string | `entry` | `tools/strategy-dev/server.ts:1043:21` | `signalKind: 'entry'` |
| string | `active` | `tools/strategy-dev/server.ts:1044:17` | `status: 'active'` |
| string | `标准决策流版本 (集成标准缠论)` | `tools/strategy-dev/server.ts:1045:22` | `description: '标准决策流版本 (集成标准缠论)'` |
| string | `/v1/strategy-backtests` | `tools/strategy-dev/server.ts:1064:25` | `pathname.endsWith('/v1/strategy-backtests')` |
| string | `/v1/strategy-backtests` | `tools/strategy-dev/server.ts:1069:25` | `pathname.endsWith('/v1/strategy-backtests')` |
| string | `000001` | `tools/strategy-dev/server.ts:1091:37` | `symbol === '000001'` |
| number | `1440` | `tools/strategy-dev/server.ts:1091:78` | `period === 1440` |
| string | `m` | `tools/strategy-dev/server.ts:1091:101` | `period + 'm'` |
| string | `completed` | `tools/strategy-dev/server.ts:1093:17` | `status: 'completed'` |
| number | `1000` | `tools/strategy-dev/server.ts:1101:42` | `Date.now() - 1000` |
| string | `completed` | `tools/strategy-dev/server.ts:1113:19` | `status: 'completed'` |
| string | `回测任务执行完成` | `tools/strategy-dev/server.ts:1114:20` | `message: '回测任务执行完成'` |
| number | `202` | `tools/strategy-dev/server.ts:1118:9` | `sendJson( res, { runId: newRun.id, status: 'completed', message: '回测任务执行完成', pollUrl: `/v1/strategy-` |
| number | `500` | `tools/strategy-dev/server.ts:1122:45` | `sendJson(res, { error: err.message }, 500)` |
| number | `30` | `tools/strategy-dev/server.ts:1145:31` | `matchedRun?.period \|\| 30` |
| string | `HIGH` | `tools/strategy-dev/server.ts:1176:26` | `confidenceLevel: 'HIGH'` |
| string | `Not Found` | `tools/strategy-dev/server.ts:1231:26` | `error: 'Not Found'` |
| number | `404` | `tools/strategy-dev/server.ts:1231:57` | `sendJson(res, { error: 'Not Found', path: pathname }, 404)` |
| string | `0.0.0.0` | `tools/strategy-dev/server.ts:1234:21` | `server.listen(PORT, '0.0.0.0', () => { console.log( `\n🚀 [Mist Dev Server] 本地开发服务已就绪: http://localh` |
| number | `1440` | `tools/strategy-dev/server.ts:1265:46` | `run.period === 1440` |
| string | `code` | `tools/strategy-dev/sync.ts:35:26` | `getArg('code')` |
| string | `periods` | `tools/strategy-dev/sync.ts:37:28` | `getArg('periods')` |
| string | `period` | `tools/strategy-dev/sync.ts:37:49` | `getArg('period')` |
| string | `limit` | `tools/strategy-dev/sync.ts:38:27` | `getArg('limit')` |
| string | `all` | `tools/strategy-dev/sync.ts:41:36` | `limitStr.toLowerCase() === 'all'` |
| string | `max` | `tools/strategy-dev/sync.ts:41:72` | `limitStr.toLowerCase() === 'max'` |
| string | `source` | `tools/strategy-dev/sync.ts:47:25` | `getArg('source')` |
| string | `box` | `tools/strategy-dev/sync.ts:48:26` | `getArg('box')` |
| string | `password` | `tools/strategy-dev/sync.ts:50:12` | `getArg('password')` |
| string | `'\''` | `tools/strategy-dev/sync.ts:113:5` | `(options.password \|\| 'change-me-root').replace( /'/g, "'\\''", )` |
| number | `1024` | `tools/strategy-dev/sync.ts:120:26` | `100 * 1024` |
| number | `1024` | `tools/strategy-dev/sync.ts:120:33` | `100 * 1024 * 1024` |
| number | `120000` | `tools/strategy-dev/sync.ts:122:18` | `timeout: 120000` |
| string | `NULL` | `tools/strategy-dev/sync.ts:153:36` | `volume !== 'NULL'` |
| string | `NULL` | `tools/strategy-dev/sync.ts:154:36` | `amount !== 'NULL'` |
| string | `data/kline` | `tools/strategy-dev/sync.ts:178:42` | `path.resolve(__dirname, 'data/kline')` |

</details>
