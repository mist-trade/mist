# Tasks: Implement CYS13 Market Breadth and Panic Gauge (实施任务清单)

- [x] 1. 纯数学 Rust Polars CYC / CYS 算子实现 (`mist/libs/indicators`)
  - [x] 1.1 `libs/indicators/src/classic/cyc.ts`：实现 `computeCycSeries`、`computeCycObservation`，基于 `nodejs-polars` 实现成交金额与成交量指数平滑（EMA）相除
  - [x] 1.2 `libs/indicators/src/classic/cys.ts`：实现 `computeCysSeries`、`computeCysObservation`，基于 CYC 计算价格偏离乖离率
  - [x] 1.3 `libs/indicators/src/classic/market-breadth.ts`：实现横截面宽度聚合 `computeCysMarketBreadth` 与 `computeBinaryMarketBreadth`
  - [x] 1.4 `libs/indicators/src/classic/cyc.spec.ts` & `cys.spec.ts`：编写单元测试，覆盖基础周期、除零防守、停牌数据平滑与极值计算
  - [x] 1.5 `libs/indicators/src/classic/cyc.ts` & `cys.ts`：实现指数类专用正统 CYS13 算子（基于典型价 $(H+L+C)/3$ ），支持宽基指数与 880003 全A均价
  - [x] 1.6 编写指数 CYS13 与通达信黄金基准对账单测与回归验证 (`cys-parity.spec.ts`)
  - [x] 1.7 算子库通用定界：保持指标库纯数学底座与通用性，高阶策略派生交由上层因子消费端

- [x] 2. 单标的通达信金标准对账套件 (`mist/libs/indicators`)
  - [x] 2.1 建立高精度递归真值基准与噪声过滤检验
  - [x] 2.2 `libs/indicators/src/classic/cys-parity.spec.ts`：编写单标的对账断言，验证 Polars 计算值与通达信官方递推引擎误差 $\le 10^{-6}$

- [x] 3. 数据库迁移与实体模型 (`mist/deploy` & `mist/libs/shared-data`)
  - [x] 3.1 `deploy/database/migrations/033_create_market_macro_indicators.sql`：严格单调递增，创建 `market_macro_indicators` 宏观指标数据表
  - [x] 3.2 `libs/shared-data/src/entities/market-macro-indicator.entity.ts`：新增 TypeORM 实体定义，并注册入 `MIST_ENTITIES` 全局实体图谱及命名测试

- [x] 4. 全市场盘后调度与服务集成 (`mist/apps/schedule`)
  - [x] 4.1 `apps/schedule/src/market-breadth/market-breadth-collection.service.ts`：实现横截面超跌宽度与年线宽度聚合及落库
  - [x] 4.2 `apps/schedule/src/schedule.module.ts`：注册服务与 Repository 依赖
  - [x] 4.3 `libs/timezone/src/cron-schedules.constants.ts`：统一注册 `CRON_MARKET_BREADTH_NIGHTLY_2130`

- [x] 5. 全流程回归与门禁核验
  - [x] 5.1 运行全部 21 个 indicators 单测全绿通过（204 passed）
  - [x] 5.2 运行全仓五大刚性架构门禁（`dev-server-boundary`, `strategy-boundary`, `strategy-dual-timestamp`, `strategy-pipeline-homogeneity`, `indicators-boundary`）100% PASS
  - [x] 5.3 运行全仓类型检查 `npx tsc --noEmit --incremental false` 0 报错
