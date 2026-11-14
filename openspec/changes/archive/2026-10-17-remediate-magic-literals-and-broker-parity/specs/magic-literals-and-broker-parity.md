# Spec Delta: 魔法数字四层分界治理与经纪商因果规约

## 1. 规约定义：法定交易规则集中化与代码识别

### 1.1 需求：交易所标的类型与代码识别
系统 SHALL 准确识别以下 A 股标的类型与代码范围：
- **ETF 标的**：MUST 匹配上交所及深交所全部现存 ETF 代码号段，包括但不限于 `510~518`、`560~563`、`588` 与 `159`；
- **双创板标的**：MUST 匹配创业板（`300`, `301`）与科创板全部标的（包含普通股票 `688` 与存托凭证 CDR `689`）；
- **北交所标的**：MUST 匹配北交所股票代码号段（`43`, `83`, `87`, `92` 开头）。

### 1.2 需求：税费计算准确性
系统在撮合卖出时：
- 若标的符合 `ETF` 识别规则，印花税 MUST 严格为 0；
- 若标的为普通 A 股股票，出让方（卖出）单边征收万分之 5 印花税；
- 经纪商佣金根据配置的 `commissionRate` 计算，且不低于 `minCommission`（若 `minCommission` 设置为 0，则允许免五）。

---

## 2. 规约定义：回测主循环因果撮合与 T+1 跨日结算

### 2.1 需求：收盘跨日结算闭环
- 在历史回测逐 Bar 推进主循环中，当遇到收盘 Bar（`isSessionCloseBar === true`）时：
  1. `SingleSecurityPositionManager` MUST 执行 `onDayClose(bar)` 记录当期盯市快照；
  2. `SimulatedBroker` MUST 执行 `settleDayClose(currentDateStr)`，将当日所有标的的 `frozenQuantity` 归零，并全额释放至 `availableQuantity`；
  3. 次日首根 Bar 及后续所有 Bar，在进行平仓/卖出委托时，前一交易日买入并持有的份额 MUST 处于已解锁可平仓状态，不得触发 `T1_LOCKED_SHARES` 拒单。

---

## 3. 规约定义：指标算子配置化与数值稳定性

### 3.1 需求：MACD 参数自定义
- `computeMacdSeries` SHALL 支持可选的 `MacdOptions` 配置入参；
- 当入参缺省时，系统 MUST 保持经典默认值：`fastPeriod = 12`, `slowPeriod = 26`, `signalPeriod = 9`；
- 最小有效序列长度 MUST 动态计算为 `slowPeriod + signalPeriod - 1`。

### 3.2 需求：卡玛比率数值稳定性
- 当 `maxDrawdown` 处于微小正数区间（`0 < maxDrawdown < 1e-4`）时，`computeCalmarRatio` MUST 截断限制为 `MAX_CALMAR_RATIO_CAP (999.0)`，严禁返回失真的超大异常浮点数值。

---

## 4. 规约定义：时间与时区工具刚性收敛门禁

### 4.1 需求：全仓时间工具调用收敛
- 所有模块业务代码中对北京时间的格式化，MUST 统一调用 `@app/timezone` 的 `formatShanghaiDateString` 或 `formatShanghaiDateTimeString`；
- 严禁在 `@app/timezone` 以外手写 `new Intl.DateTimeFormat` 实例；
- 严禁在 `@app/timezone` 以外手写字符串字面量 `'Asia/Shanghai'`，MUST 统一引用 `ASIA_SHANGHAI_TIMEZONE`；
- 严禁使用 `.toISOString().slice(0, 10)` 或 `.split('T')[0]` 提取 A 股交易日；
- 必须通过自动化静态扫描门禁 `timezone-boundary.guard.spec.ts` 进行 CI 刚性守护。

