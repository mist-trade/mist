# 缠论段中枢（DuanChannel）机制分叉与架构解耦重构方案

> **文档位置**：[chan-duan-channel-divergence-refactoring-plan.md](file:///Users/moyui/sean/mist/docs/chan-duan-channel-divergence-refactoring-plan.md)  
> **核心目标**：
> 1. **彻底解耦**：将中枢生命周期的核心驱动逻辑与具体业务规则分离，抽象出独立的策略契约（`ChannelLifecyclePolicy`），让笔中枢（`BiChannel`）与段中枢（`DuanChannel`）各自拥有独立高内聚的策略实现，杜绝代码耦合与 `if-else` 分支污染；
> 2. **笔中枢零回退与独立 TDD 守护**：保证笔中枢现有规则 100% 保持原有行为，建立专属的不可变性 TDD 门禁守护；
> 3. **段中枢全面释放原典特性**：放开段中枢内部段数（支持 3, 4, 5, 6, 7... 任意整数）、解绑离开段方向（支持同向与反向离开）、精细化反向打穿判定（彻底杜绝误杀崩塌）、全景覆盖 8 大中枢结束场景。

---

## 一、重构背景与原典第一性原理（Why）

### 1.1 现有系统问题回顾与症结诊断
在现有实现中，笔中枢（`BiChannel`）与段中枢（`DuanChannel`）完全共用同一个状态机引擎（`ChannelLifecycleEngine` 与 `ChannelStateMachine`）。原设计中硬编码了一套“首尾严格同向”与“内部构件恒为奇数”的强假定：
1. **离开段方向硬编码同向**：
   `channel-lifecycle.ts:327` 中：
   ```ts
   if (curr.trend !== this.firstElem.trend) {
     return null; // 非同向段直接拒绝登记为离开段
   }
   ```
   这导致上涨进入的中枢（Up）只能向上离开，下跌进入的中枢（Down）只能向下离开。
2. **内部构件数被动绑定为奇数**：
   由于进入段与离开段必须同向，两者趋势一致（例如均为 Up）。根据走势交替性（Up 与 Down 必须严格交替），进入段与离开段之间夹着的一定是：
   $\text{Down} \to \text{Up} \to \text{Down} \dots \to \text{Down}$。
   其内部构件总数必然是奇数（3, 5, 7, 9...）。测试用例中甚至立下了“中枢构件奇偶同构与总数奇数铁律（Odd-Count Invariant Axiom）”的断言。
3. **“反向打穿进入段起点”判定简单粗暴，引发误杀**：
   现有代码在 `validateStandardCoreGeometry`、`canAbsorbExtension` 和 `piercesOppositeExtreme` 中规定：只要走势向反方向跌破/升破进入段起点（上涨中跌破 $a.low$，下跌中突破 $a.high$），直接调用 `sealOrCollapseAtBestCandidate()`。而由于前面第 1 点从未允许反向段登记为离开段候选，状态机找不到任何 candidate，最终直接调用 `collapse()`，将一个明明存在且有效的中枢**彻底抹杀作废**！

### 1.2 缠论原典依据与数学证明

#### 依据 A：《教你炒股票 17 课》—— 走势连接定理与走势方向的中立性
- **原典实录**（第 17 课问答 6 & 7）：
  > 网友提问：“从 30 分钟图上看，12 月 7 日-12 日为下跌，12 日-18 日为盘整期，今天下午上涨。是一个标准的‘下跌+盘整+上涨’...可我按‘下跌+盘整+下跌’考虑，判断它会再次下探，为什么错？”  
  > **缠师怒斥**：“**谁告诉你？股票一定要走出‘下跌+盘整+下跌’的？基本概念要搞清楚。**”  
  > 缠师评人民币汇率：“把一个好好的‘上涨+盘整+上涨’弄成‘**上涨+盘整+下跌**’，这时候还谈什么第一类买点？鼻子都给人牵着走了。”

- **数学拓扑证明**：
  若存在“上涨 + 盘整 + 下跌”：
  - 进入段 $a$：向上（Up）；
  - 盘整中枢 $A$：由前三段次级别重叠确定（$d_1(\text{Down}), d_2(\text{Up}), d_3(\text{Down})$）；
  - 离开段 $b$：**必须向下（Down）**才能构成其后的“下跌”！
  - 此时，进入段 $a(\text{Up})$ 与离开段 $b(\text{Down})$ **方向相反**！

#### 依据 B：《教你炒股票 20 课》—— 第三类买卖点对称定理
- **原典实录**：
  > “第三类买卖点定理：一个次级别走势类型向上离开缠中说禅走势中枢，然后以一个次级别走势类型回试，其低点不跌破 ZG，则构成第三类买点；一个次级别走势类型向下离开缠中说禅走势中枢，然后以一个次级别走势类型回抽，其高点不升破 ZD，则构成第三类卖点。”
  
  原典在定义第三类买卖点时，**从未附加“向上离开只能来自上涨中枢、向下离开只能来自下跌中枢”的任何前置限制**！
  - 上涨中枢向下离开后回抽不升破 ZD $\implies$ **第三类卖点**（转折为下跌走势）；
  - 下跌中枢向上离开后回试不跌破 ZG $\implies$ **第三类买点**（转折为上涨走势）。

#### 依据 C：《教你炒股票 57 课》—— 偶数构件的实盘复现
- **原典实录**：
  > 缠师分析 1-2、2-3、3-4 构成中枢，4-5 向下离开中枢，5-6 向上反抽不破中枢下沿确认第三类卖点。
  > 此时中枢内部有 4 段还是 3 段？取决于离开段是第几段。若 1-2(下)、2-3(上)、3-4(下) 构成中枢，4-5 作为离开段向下离开，内部为 3 段；
  > 但若进入段是 0-1(上)，1-2(下)、2-3(上)、3-4(下)、4-5(上) 在中枢内震荡，5-6 向下破位离开中枢，那么中枢内部包含 $[1\text{-}2, 2\text{-}3, 3\text{-}4, 4\text{-}5]$ **整整 4 根线段（偶数段）**！

---

## 二、离开段方向不限条件下：走势中枢结束全景大盘点（8 大场景全景）

在不针对离开段方向做出限制（离开段方向中立，可与进入段同向，也可与进入段反向）的前提下，走势中枢的“结束（封存/闭合/转化/破坏）”涵盖三大类、共 **8 大物理场景**。下表为全局对照全景矩阵：

| 大类 | 场景序号 | 结束机制名称 | 核心判据（向上上涨中枢示例） | 核心判据（向下下跌中枢示例） | 离开段方向 | 内部段数奇偶性 | 最终状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **一、完满离开封存** | **场景 1** | **第 3 类买卖点离开**（原典第20课定理三） | **同向 3 买**：$curr(\text{Up}) > ZG$ 且 $pullback.low > ZG$<br>**反向 3 卖**：$curr(\text{Down}) < ZD$ 且 $pullback.high < ZD$ | **同向 3 卖**：$curr(\text{Down}) < ZD$ 且 $pullback.high < ZD$<br>**反向 3 买**：$curr(\text{Up}) > ZG$ 且 $pullback.low > ZG$ | 同向（Up）或<br>**反向（Down）** | 同向：奇数 (3,5...)<br>**反向：偶数 (4,6...)** | Complete (Sealed) |
| | **场景 2** | **次级别衰竭转折离开**（2s/2b 背驰） | **同向 2s 顶背驰**：冲破 $GG$ 后回踩未破 $ZD$，二次冲高不创新高<br>**反向 2b 底背驰**：跌破 $DD$ 后反抽未过 $ZG$，二次下探不创新低 | **同向 2b 底背驰**：跌破 $DD$ 后反抽未过 $ZG$，二次下探不创新低<br>**反向 2s 顶背驰**：冲破 $GG$ 后回踩未破 $ZD$，二次冲高不创新高 | 同向或<br>**反向** | 同向：奇数<br>**反向：偶数** | Complete (Sealed) |
| | **场景 3** | **中枢新生强制闭合**（原典第20课定理二） | 离开段后在不重叠区间独立走出**新中枢**（同向高位新中枢，或**反向低位新中枢**） | 离开段后在不重叠区间独立走出**新中枢**（同向低位新中枢，或**反向高位新中枢**） | 同向或<br>**反向** | 同向：奇数<br>**反向：偶数** | Complete (Sealed) |
| | **场景 4** | **极限反向贯穿破位**（不可逆单边暴跌/暴涨） | 单段或连续暴跌脱离中枢下沿 $ZD$ 且深穿进入段起点 $a.low$ | 单段或连续暴涨脱离中枢上沿 $ZG$ 且深穿进入段起点 $a.high$ | **反向** | **偶数 (4,6...)** | Complete (Sealed) |
| **二、形态延伸与级别升级** | **场景 5** | **中枢延伸满 9 段升级**（原典第35课定理三） | 内部震荡段持续吸纳达到 9 段及以上（9, 10, 11... 段） | 内部震荡段持续吸纳达到 9 段及以上（9, 10, 11... 段） | 暂无（仍在震荡） | **任意整数 $\ge 9$** | Complete (Macro) |
| | **场景 6** | **同级别极值重叠扩展**（原典第35课定理二） | 两个相邻普通中枢 $[ZD, ZG]$ 不重叠但 $[DD, GG]$ 存在交集，两中枢结束独立存在，合并为 Macro 大框 | 两个相邻普通中枢 $[ZD, ZG]$ 不重叠但 $[DD, GG]$ 存在交集，两中枢结束独立存在，合并为 Macro 大框 | 依赖各自分别封存 | 各中枢各自保持 | Complete (Macro 框) |
| **三、走势边界与断裂收口** | **场景 7** | **走势到达数据末端**（Data End / Sequence Tail） | **7.1 震荡未完**：未脱离区间，虚线输出<br>**7.2 末端顺势冲破极值**：无回抽，离开封存<br>**7.3 末端反向跌破极值**：无反抽，离开封存 | **7.1 震荡未完**：未脱离区间，虚线输出<br>**7.2 末端顺势跌破极值**：无反抽，离开封存<br>**7.3 末端反向冲破极值**：无回抽，离开封存 | 7.1 无离开段<br>7.2 同向<br>7.3 **反向** | 7.1 任意整数 $\ge 3$<br>7.2 奇数<br>7.3 **偶数** | 7.1 UnComplete<br>7.2 Complete<br>7.3 Complete |
| | **场景 8** | **震荡断裂与历史最佳候选收口**（Departure Breakdown） | 走势脱离中枢且无法被吸纳，但后续走势未能走出标准 3 买/3 卖或新中枢，状态机决断**历史最佳候选离开段**封存 | 走势脱离中枢且无法被吸纳，但后续走势未能走出标准 3 买/3 卖或新中枢，状态机决断**历史最佳候选离开段**封存 | 取最佳候选离开段方向（同向或反向） | 依最佳候选离开段而定（奇数或偶数） | Complete (Sealed) |

---

## 三、笔中枢与段中枢的差异性抽离与解耦架构设计（Architecture Decoupling）

为了彻底解决“笔中枢硬编码逻辑捆绑段中枢”的历史包袱，同时**保证笔中枢现有规则 100% 不变、零风险回退**，我们采用**策略模式（Strategy Pattern）与策略委托（Policy Delegation）**进行彻底的解耦抽离。

### 3.1 差异维度盘点与抽象提炼

笔中枢与段中枢的差异本质上是**业务规则与形态学口径的差异**，而不是驱动执行流程的差异。下表清晰梳理了双方的 7 大差异维度及其抽象接口设计：

| 差异维度 | 笔中枢策略（`BiChannelLifecyclePolicy`） | 段中枢策略（`DuanChannelLifecyclePolicy`） | 统一抽象策略方法 |
| :--- | :--- | :--- | :--- |
| **1. 离开段候选准入** | **严格同向**：必须 `curr.trend === firstElem.trend`，且突破历史全景极值（破 GG 或 DD） | **方向中立**：同向突破极值（破 GG/DD）或**反向跌破/突破中枢（破 ZD/ZG 或 DD/GG）**均登记 | `evaluateCandidateDeparture(curr, idx, state): CandidateDeparture \| null` |
| **2. 离开确认与买卖点** | **仅同向确认**：<br>• 上涨中枢：3 买确认（回抽不跌破 ZG）<br>• 下跌中枢：3 卖确认（反抽不升破 ZD）<br>• 顺势 2s/2b 次级别背驰衰竭 | **双向确认（8 大场景全景）**：<br>• 上涨中枢：同向 3 买确认 或 **反向 3 卖确认（反抽不升破 ZD）**<br>• 下跌中枢：同向 3 卖确认 或 **反向 3 买确认（次回试不跌破 ZG）**<br>• 新中枢形成强制反向封存<br>• 双向 2s/2b 背驰衰竭 | `checkDepartureConfirmation(curr, nextIdx, pullback, candidate, data, state): boolean` |
| **3. 内部延伸吸纳门禁** | • 价格触及 $[ZD, ZG]$<br>• 配对回抽必须同时触及<br>• **起点守卫**：绝不可跌破/升破进入笔起点<br>• **成对吸纳**（维持内部奇数 3, 5, 7...） | • 价格触及 $[ZD, ZG]$<br>• **单段逐段吸纳**（放开为 3, 4, 5, 6, 7... 任意整数）<br>• 维持震荡期间允许宽幅波动 | `tryAbsorbExtension(curr, pullback, state): { absorbed: boolean; consumedCount: number }` |
| **4. 反向打穿进入起点** | 视为结构崩溃：若无同向 candidate，直接 `collapse()` 销毁中枢 | 视为反向离开或破坏：核心已确立前提下，反向深跌跌出中枢直接作为**反向离开段完满封存（Sealed）**，绝不崩溃 | `handleOppositePiercing(pullback, state): boolean` |
| **5. 序列末端处理** | 仅在同向顺势突破且破 GG/DD 时末端封存，否则丢弃或输出 UnComplete | 允许同向或反向脱离末端封存；若在震荡中输出含 3, 4, 5, 6... 任意段数的 UnComplete 中枢 | `checkTailSealing(curr, nextIdx, state): boolean` |
| **6. 历史最佳候选段决断** | 仅从同向候选中选出极值最高/最低者 | 支持从同向与反向候选列表中按时间序与脱离极值综合决断最佳离开段 | `sealOrCollapseOnBreakdown(state): boolean` |
| **7. 动态收窄与锁定** | `dynamicNarrowing: true`（微观动态收窄 $[ZD, ZG]$） | `dynamicNarrowing: false`（原典第 20 课锁定前 3 段区间不变） | `readonly dynamicNarrowing: boolean` |

---

### 3.2 架构解耦分层与交互时序

```mermaid
classDiagram
    class ChannelLifecycleEngine {
        +runSequentialLifecycle(data, policy) { phaseA, sequential }
    }
    
    class IChannelLifecyclePolicy~T, R~ {
        <<interface>>
        +allowUncomplete: boolean
        +dynamicNarrowing: boolean
        +validateCore(window)
        +evaluateCandidateDeparture(curr, idx, state)
        +checkDepartureConfirmation(curr, nextIdx, pullback, candidate, data, state)
        +handleOppositePiercing(pullback, state)
        +checkTailSealing(curr, nextIdx, state)
        +tryAbsorbExtension(curr, pullback, state)
        +sealOrCollapseOnBreakdown(state)
        +buildPhaseAChannel(...)
        +buildSealedChannel(...)
    }
    
    class BiChannelLifecyclePolicy {
        +保持原有笔中枢全部硬编码规则
        +严格同向离开
        +奇数内部笔铁律 (3, 5, 7...)
        +反向穿底崩溃 (strict_collapse)
        +微观动态收窄 (dynamicNarrowing=true)
    }
    
    class DuanChannelLifecyclePolicy {
        +原典第 17/20 课段中枢规则
        +离开段方向中立 (双向离开)
        +内部段放开为任意整数 (3, 4, 5, 6, 7...)
        +反向深跌封存 (seal_as_departure)
        +8 大中枢结束场景全景
        +前三段区间锁定 (dynamicNarrowing=false)
    }
    
    class BiChannelCalculator {
        -policy: BiChannelLifecyclePolicy
        +createBiChannels(data, options)
    }
    
    class DuanChannelCalculator {
        -policy: DuanChannelLifecyclePolicy
        +createDuanChannels(data, options)
    }
    
    ChannelLifecycleEngine --> IChannelLifecyclePolicy : 驱动并调用
    BiChannelLifecyclePolicy ..|> IChannelLifecyclePolicy : 实现
    DuanChannelLifecyclePolicy ..|> IChannelLifecyclePolicy : 实现
    BiChannelCalculator --> BiChannelLifecyclePolicy : 注入与配置
    DuanChannelCalculator --> DuanChannelLifecyclePolicy : 注入与配置
```

---

## 四、笔中枢零回退保证与独立 TDD 守护体系

### 4.1 笔中枢独立策略实现契约（`BiChannelLifecyclePolicy`）
在 `libs/chancore/src/internal/bi-channel-policy.ts` 中实现：
- 严格同向准入：`curr.trend === state.firstElem.trend && breaksExtreme`；
- 严格奇数内部笔：`tryAbsorbExtension` 必须成对吸纳（`nextIdx += 2`），保持内部为 3, 5, 7... 奇数笔；
- 严格穿底崩溃：`handleOppositePiercing` 中，一旦 `pullback` 击穿进入笔起点且无候选离开笔，直接 `state.collapse()`；
- 微观动态收窄：`dynamicNarrowing = true`。

### 4.2 笔中枢专属 TDD 门禁测试（`bi-channel-invariants.spec.ts`）
我们建立了专门针对笔中枢的**不可变性断言套件**，守住四大刚性底线：
1. **首尾同向刚性门禁**：断言全仓所有生成的 Complete 笔中枢，`leaveBi.trend === entryBi.trend` 100% 成立；
2. **内部奇数刚性门禁**：断言全仓所有 Complete 笔中枢，`bis.length % 2 === 1` 且 `bis.length >= 3` 100% 成立；
3. **穿底崩溃行为保真**：在已知反向穿底的笔测试用例中，断言中枢准确崩塌，不产出错误中枢；
4. **黄金样本逐笔对账**：使用现有 `chan-full-output.characterization.fixture.ts` 和所有既有 `bi-channel.spec.ts`，断言重构前后笔中枢数量、`startId`、`endId`、`zg`、`zd`、`gg`、`dd` **100% 逐 bit 一致**！

---

## 五、段中枢专属策略实现契约（`DuanChannelLifecyclePolicy`）

在 `libs/chancore/src/internal/duan-channel-policy.ts` 中实现：
1. **离开段方向中立**：
   - 只要 `curr` 顺势冲破 $GG/DD$ 或反向跌破/升破 $ZD/ZG$，均登记为 `CandidateDeparture`；
2. **全量 8 大场景离开确认**：
   - 场景 1：同向 3 买 / 3 卖，反向 3 卖 / 3 买；
   - 场景 2：同向 2s/2b，反向 2b/2s 次级别衰竭；
   - 场景 3：新中枢成型强制反向封存；
   - 场景 4：极限反向贯穿直接封存为反向离开段；
3. **单段逐段吸纳**：
   - `tryAbsorbExtension` 只要当前段触及 $[ZD, ZG]$，即推入 `elements`，`consumedCount = 1`；内部段数平滑支持 3, 4, 5, 6, 7... 任意整数；
4. **反向打穿精细化保护**：
   - 初生阶段若有效确立，后续深跌击穿 $a.low$ 自动收口为反向离开段封存，绝对禁止 `collapse`；
5. **恒定区间锁定**：
   - `dynamicNarrowing = false`，严格锁定前 3 段公共重叠区间 $[ZD, ZG]$。

---

## 六、下游模块受影响分析与契约保障

1. **买卖点计算器（`buy-sell-point.ts`）**：
   - `detectThird` 自身为纯几何结构判定（只依赖离开段方向与回抽极值，不依赖中枢原始 trend）；
   - 段中枢解绑后，自动产出反向 3 买与反向 3 卖，**零代码改动，天然契合**。
2. **可视化适配器（`chan-visual.adapter.ts`）**：
   - 矩形色块由内部首段起点至末段终点绘制，**完全兼容偶数内部段**；
   - Macro 扩展色块（`#E879F9`）与图层无缝渲染。
3. **策略决策流插件（`chan-bsp.plugin.ts`）**：
   - 自动接收来自段中枢的完备反向转折信号。

---

## 七、修改代码清单与模块解耦分布

| 模块 / 文件路径 | 架构职责定位 | 改造内容与解耦方式 |
| :--- | :--- | :--- |
| `libs/chancore/src/internal/channel-lifecycle.ts` | **通用生命周期框架** | 1. 提炼并导出 `ChannelLifecyclePolicy<T, R>` 策略契约接口；<br>2. `ChannelStateMachine` 提供通用的构件、极值、候选离开列表管理；<br>3. `ChannelLifecycleEngine` 改造为纯净调度器，彻底移除所有 `isTrendAlignedWithEntry` 等硬编码规则，全权委托 Policy 执行。 |
| `libs/chancore/src/internal/bi-channel-policy.ts` | **笔中枢专属策略（新增）** | 实现 `BiChannelLifecyclePolicy`，将原有的笔中枢业务规则（同向、奇数、严格崩溃、动态收窄）100% 完整迁移至此，与段中枢完全物理隔离。 |
| `libs/chancore/src/internal/duan-channel-policy.ts` | **段中枢专属策略（新增）** | 实现 `DuanChannelLifecyclePolicy`，实现段中枢专属的 8 大结束场景、双向离开、任意段数、深跌封存与区间锁定。 |
| `libs/chancore/src/internal/bi-channel.ts` | **笔中枢计算门面** | `sequentiallyConfirmChannels` 实例化并传入 `BiChannelLifecyclePolicy`。 |
| `libs/chancore/src/internal/duan-channel.ts` | **段中枢计算门面** | `sequentiallyConfirmChannels` 实例化并传入 `DuanChannelLifecyclePolicy`。 |
| `libs/chancore/src/internal/bi-channel.spec.ts` | **笔中枢既有单测** | 保持 100% 通过，绝不修改任何既有断言。 |
| `libs/chancore/src/internal/bi-channel-invariants.spec.ts` | **笔中枢不变性守护（新增）** | 针对笔中枢同向离开公理、奇数铁律、穿底崩溃行为建立专项刚性守护门禁。 |
| `libs/chancore/src/internal/duan-channel.spec.ts` | **段中枢单测重构与扩充** | 1. 重构旧的奇数铁律用例；<br>2. 补充全量 8 大场景全景驱动测试（涵盖反向 3 买/3 卖、偶数内部段 4/6、深跌封存等）。 |

---

## 九、原典形态学判定结论归档（Theory Conclusions）

详见专项规范文档：[chan-duan-channel-theory-and-boundary-rules.md](file:///Users/moyui/sean/mist/docs/chan-duan-channel-theory-and-boundary-rules.md)。

核心结论概括（两看两不看）：
1. **看 $[ZD, ZG]$ 重叠，不看是否穿透进入段起点**：
   - 依据《第 20 课》定理一与《第 39 课》，中枢确立后，任何震荡段只要价格区间与 $[ZD, ZG]$ 有交集，无论它跌穿 $a.low$ 还是升破 $a.high$，全属合法内部震荡，刷新 $DD/GG$ 后继续吸纳，绝不崩塌！
2. **看回抽是否破 $[ZD, ZG]$，不看离开段是否突破 $GG / DD$**：
   - 依据《第 20 课》第三类买卖点定理与《第 18 课》定理三，只要脱离段离开 $[ZD, ZG]$ 且次级别回试不破 $[ZD, ZG]$，第三类买卖点即告成立，中枢完满封存，离开段不强制要求突破中枢震荡期的历史极值 $GG/DD$。

