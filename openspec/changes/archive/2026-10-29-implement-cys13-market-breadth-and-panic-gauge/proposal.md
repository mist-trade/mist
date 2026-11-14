# Proposal: Implement CYS13 Market Breadth and Panic Gauge (全市场 CYS13 超跌宽度与恐慌极值度量体系)

## Why

1. **指数失真与“接飞刀”摩擦 (Masked Panics & Catching Falling Knives)**：
   - A 股宽基指数（上证指数、沪深300）在熊市主跌浪与护盘期经常失真（例如国家队拉升四大行与高股息白马，指数跌幅受控，但微观中中小盘正在经历千股跌停与流动性枯竭）；
   - 单纯依赖 30m 缠论形态抓反弹，无法感知宏观流动性踩踏与被动平仓盘，容易在半山腰频繁止损割肉；
   - 现行系统缺少一套全市场视角的**横截面恐慌出清度量工具（Cross-Sectional Panic Gauge）**。

2. **单标的 CYS 缺陷与全市场横截面升维必要性 (Single-Stock CYS Noise vs Macro Breadth)**：
   - 单只个股出现 `CYS13 < -15%` 往往伴随个股基本面爆雷、造假或主力抛售，胜率仅 40%~50%；
   - 将 CYS13 升维至全市场横截面（统计全 A 市场 5300 只股票中 CYS13 跌破 -12% 的股票占比），根据大数定律彻底消除个股特质风险，纯净反映全市场去杠杆、雪球敲入、质押强平与流动性出清程度；
   - 历史回测表明，当全市场超跌比例突破 **35%~50%** 时，对应 2018年10月（2449点）、2020年3月（疫情底）、2022年4月（2863点）、2024年2月（2635点）等绝对历史大底，胜率接近 90%+。

3. **正统成本均线（CYC13）对缩量假突破的高效过滤 (CYC13 vs Classical MA)**：
   - 传统算术移动平均线（MA13）无法识别成交量权重，极易被无量诱多小阳线虚假挑穿，造成大量追高被套；
   - 正统成本均线（$\text{CYC13} = 0.01 \times \text{EMA}(\text{Amount}, 13) / \text{EMA}(\text{Vol}, 13)$）真实反映最近 13 个交易日所有真金白银进场者的加权持仓成本；放量站上 CYC13 代表全市场短线筹码脱离被套状态进入盈利，是极高信噪比的右侧发令枪。

## What Changes

1. **纯数学向量化指标核心 (`libs/indicators`)**：
   - 基于 Rust `nodejs-polars` SIMD 原语实现正统 **CYC（成本均线）** 与 **CYS（市场盈亏乖离率）** 纯算子；
   - 保持 TA-Lib 风格双轨制（`computeCycSeries`、`computeCysSeries` 与 Observation 切片）；
   - 严禁手写 JS/TS 循环，严禁引入 I/O 与环境变量依赖。

2. **全市场横截面超跌宽度计算与调度服务 (`apps/schedule`)**：
   - 在 `apps/schedule` 盘后批处理任务（每日 21:30 主任务，06:00 晨间兜底）中新增 `MarketBreadthCollectionService`；
   - 每日仅拉取一次全市场 5300 股收盘价与金额（`count=1`），在本地紧凑滑动缓存（最近 249 日，总内存 ~5.2MB）中执行 Rust Polars 向量化比对；
   - 计算并落盘：
     - `breadth_cys13_oversold_ratio`：全市场 $CYS13 < -12\%$ 个股占比（超跌宽度）；
     - `breadth_above_ma250_ratio`：全市场站上 MA250 个股占比；
     - `all_a_turnover_rate` 与 `all_a_turnover_percentile_10y`：全 A 日换手率 10 年分位数；
     - `erp_ratio` 与 `erp_percentile_10y`：股债性价比 10 年分位点与 Z-Score。

3. **数据库与 Redis 极速门禁落盘**：
   - 数据库 Migration `033_create_market_macro_indicators.sql`：每日增量写入 1 行；
   - Redis 极速截面缓存 `HSET mist:market:macro:latest`：供实盘决策流在 <1ms 内完成宏观恐慌出清判定与飞刀阻断。

4. **双层金标准对账验证体系 (Two-Tier Parity Reconciliation)**：
   - **单标的对账（Single-Asset Golden Fixture）**：茅台（600519）、平安（000001）与通达信官方正统 CYS13 / CYC13 数值在 $10^{-4}$ 精度上逐日 100% 对齐；
   - **全市场横截面对账（Cross-Sectional Breadth Parity）**：抽取历史 5 大极端出清交易日（2018-10-19、2020-03-23、2022-04-26、2024-02-05、2024-09-18），与同花顺问财全市场快照逐条比对，确保偏差 $\le 1.0\%$。

## Success Criteria

1. **架构与门禁 100% PASS**：
   - 纯数学指标位于 `libs/indicators`，严格基于 Rust Polars，不含任何 NestJS/DB 依赖；
   - 现有三大刚性架构门禁（`dev-server-boundary`、`homogeneity`、`dual-timestamp`）保持全绿；
2. **计算性能达标**：
   - 全市场 5300 只股票日终截面 CYS 宽度与站上 MA250 比例计算耗时 $\le 15\text{ms}$；全流程（数据获取 + 计算 + 落库 + Redis 刷新）总耗时 $\le 1.5\text{s}$；
3. **对账精度达标**：
   - 单标的 CYC/CYS 与通达信黄金测试快照误差 $\le 0.001\%$；
   - 历史极端日全市场超跌宽度与同花顺问财快照偏差 $\le 1.0\%$。
