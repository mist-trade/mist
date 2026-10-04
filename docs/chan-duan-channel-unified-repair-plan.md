# 缠论段中枢（DuanChannel）基于 $a+3+b$ 同构的统一修复方案

> **文件定位**：缠论段中枢核心算法重构与规范化修复执行方案（修复指导专用文档）  
> **制定日期**：2026-10-03  
> **执行准则**：全流程强制贯彻 **测试驱动开发（TDD）**，红-绿-重构循环，CI/Guard 刚性守门，彻底清除私加伪规则，100% 忠实于缠论原典。

---

## 一、背景与问题根源综述

### 1.1 历史缺陷与架构精神分裂
在 Mist 系统的缠论核心库（`@app/chancore`）演进过程中，笔中枢（`bi-channel.ts`）与段中枢（`duan-channel.ts`）走向了严重割裂的技术路线：
1. **构件生硬拆分的致命缺陷**：
   * 原典第 17、18 课明确定义：走势中枢是“**被至少三个连续次级别走势类型所重叠的部分**”。
   * 然而，原 `duan-channel.ts:180-248` 在扫描到 3 根段 $S_0, S_1, S_2$ 时，强行将 $S_0$ 扣留为 `entryDuan`（进入段），将 $S_2$ 扣留为 `leaveDuan`（离开段），导致**中枢内部构件数组 `duans` 居然只有 1 根段 `[S_1]`**！
   * 这将“包含中枢的宏观走势形态 $a+A+b$”与“中枢本体 $A$ 自身的数学定义”完全混淆，严重违背中枢必须由至少 3 个连续构件重叠形成的铁律。
2. **私加非原典过滤规则**：
   * 在三买、三卖判定中，原代码私自增加了“进入段/离开段极值必须超越中枢内部高低点（$GG/DD$）”的苛刻门禁，原典中根本不存在此项约束；
   * 在 Phase B 中存在机械硬拼、方向污染以及跨中枢非法合并的逻辑残留。
3. **架构分裂与认知混乱**：
   * 笔中枢遵循 $a+3+b$ 的生命周期状态机，而段中枢却另搞一套孤立的、带有私加规则的伪中枢逻辑，严重破坏了缠论在不同级别上的**分形自相似性与递归同构性**。

### 1.2 核心破局方案：笔与段算法同构收敛（$a+3+b$）
用户与架构评审正式拍板：
* **彻底终结分裂，确立级别同构律**：不管是笔（Bi）还是线段（Duan），其中枢构建、延伸、封存的数学模型与生命周期算法完全统一为原典标准的 **$a + 3 + b$ 架构**！
* **构件语义严格纯化**：
  * $a$（进入构件）：独立解耦挂载于 `entryBi` / `entryDuan`；
  * $A$（中枢本体）：必须由 $\ge 3$ 个连续次级别构件（`bis` / `duans`）构成，区间 $[ZD, ZG]$ 严格由这组构件的公共价格重叠确立；
  * $b$（离开构件）：独立解耦挂载于 `leaveBi` / `leaveDuan`，由次级别离开+回抽不破确认后封存；
  * 封存完满形态总构件数：$1$ 进 + 至少 $3$ 内 + $1$ 出 $\ge 5$ 个构件。

---

## 二、缠论第一性原理与数学公理依据

### 2.1 走势中枢本体公理（第 17、18 课）
* **第 17 课公理**：
  > “某级别走势类型中，被**至少三个连续次级别走势类型所重叠**的部分，称为缠中说禅走势中枢。”
* **第 18 课数学定义**：
  > “次级别的连续三个走势类型 A、B、C，分别的高、低点是 $a_1/a_2, b_1/b_2, c_1/c_2$。则，中枢的区间就是 $[\max(a_2,b_2,c_2), \min(a_1,b_1,c_1)]$……”
* **推论**：
  中枢本体 $A$ 必须至少包含 3 根连续次级别构件（即 $A_1, A_2, A_3$）。内部数组 `duans` 长度在初生成立时**必须 $\ge 3$**。

### 2.2 走势类型与进出段公理（第 20、43、57 课）
* **走势类型公式**：$a + A + b$（盘整或趋势组成部分）。
* **进入段 $a$ 与离开段 $b$ 的拓扑分离**：
  * **第 57 课实证**：缠师在 1 分钟线段图上明确定义，线段 `12、23、34` 构成中枢，`01` 为中枢前的进入段，`45` 为次级别离开段，`56` 为次级别反抽段。
  * **公理结论**：走势中枢 $A$ 自身**绝对不包含**进入段 $a$ 与离开段 $b$！$a$ 在中枢之前发生，$b$ 在中枢确立之后向外突破发生。

### 2.3 中枢形成方向与 $Z$ 走势段公理（第 20 课）
* **第 20 课定理**：
  > “而中枢的形成无非两种：一种是回升形成的，一种是回调形成的。对于第一种有 $a_1=b_1, b_2=c_2$；对第二种有 $a_2=b_2, b_1=c_1$……显然，A、C段，其方向与中枢形成的方向是一致的……为方便起见，以后都把这些与中枢形成方向一致的次级别走势类型称为 Z 走势段……”
* **两种形成机制**：
  1. **回升形成（向上中枢）**：走势为“上 - 下 - 上”，第 1 段向上，第 3 段向上，形成方向为**向上**，$Z$ 走势段为向上段；
  2. **回调形成（向下中枢）**：走势为“下 - 上 - 下”，第 1 段向下，第 3 段向下，形成方向为**向下**，$Z$ 走势段为向下段。

### 2.4 第三类买卖点与封存公理（第 20 课）
* **第 20 课定理**：
  > “一个次级别走势类型向上离开缠中说禅走势中枢，然后以一个次级别走势类型回试，其低点不跌破 ZG，则构成第三类买点；一个次级别走势类型向下离开缠中说禅走势中枢，然后以一个次级别走势类型回抽，其高点不升破 ZD，则构成第三类卖点。”
* **三买三卖的唯一数学门禁**：
  * **三买**：次级别向上离开段 $b$，其次回抽段低点 $> ZG$；
  * **三卖**：次级别向下离开段 $b$，其次回抽段高点 $< ZD$；
  * **严禁私加门禁**：严禁加入“离开段高点必须 $> GG$”或“进入段低点必须 $< DD$”等任何私货！

### 2.5 构件奇偶同构与总数奇数铁律（Odd-Count Invariant Axiom）
* **定理定义**：
  在缠论走势中枢生命周期模型中，无论是笔中枢（BiChannel）还是段中枢（DuanChannel），任何确认封存的完整中枢形态（Complete），其构件总数以及内部构件数**在拓扑学与代数学上恒为奇数（Odd Numbers）**：
  $$\text{内部构件数 } |A| = 2k - 1 \quad (k \ge 2, \text{即 } |A| \in \{3, 5, 7, 9, 11, \dots\})$$
  $$\text{形态总构件数 } \text{Total} = |a| + |A| + |b| = 1 + (2k - 1) + 1 = 2k + 1 \quad (\text{即 } \text{Total} \in \{5, 7, 9, 11, 13, \dots\})$$
* **数学因果推导**：
  1. **相邻构件方向交替律**：走势中相邻两段（或两笔）方向必然相反（Up $\to$ Down $\to$ Up $\to$ Down...）；
  2. **中枢离开与进入首尾同向公理**：离开构件 $b$ 与进入构件 $a$ 必须同向（`b.trend === a.trend`，Up进必Up出，Down进必Down出）；
  3. **内部构件始末方向对称**：以向上中枢为例，$a$ 为向上段（结束于高点），则内部第 1 根构件 $d_1$ 必须向下；离开段 $b$ 为向上段（起始于低点），则内部最后一根构件 $d_m$ 必须向下。序列中奇数项全为向下段（$d_1, d_3, \dots$），因此末尾项 $m$ 必须为**奇数**；
  4. **总数必为奇数**：$1 (a) + \text{奇数 } (A) + 1 (b) = \text{奇数}$。
* **延伸合并同构守恒**：
  两相邻同向中枢 $C_1$ 与 $C_2$ 在 Phase B 发生延伸合并时，连接构件 $b_1 = a_2$ 被吸纳为大中枢的内部构件：
  $$|A_{merged}| = |A_1| + 1 + |A_2| = \text{奇数} + 1 + \text{奇数} = \text{奇数}$$
  $$\text{Total}_{merged} = 1 + |A_{merged}| + 1 = 1 + \text{奇数} + 1 = \text{奇数}$$
  奇数铁律在单中枢与链式延伸中具有绝对不变性。

### 2.6 中枢延伸（Extension）与中枢扩展（Expansion）的严密数学与理论公理界定
走势中枢的“延伸”与“扩展”是缠论原典第 17、20、35 课最核心的走势演化机制，二者在数学触发门槛、级别演化与形态呈现上具有不可混淆的本质区别：

| 维度 | 中枢延伸（Central Extension） | 中枢扩展（Central Expansion） |
| :--- | :--- | :--- |
| **原典公理出处** | 第 20 课定理二（走势中枢的延伸） | 第 35 课定理二（走势中枢的扩张/扩展）与定理三（9段升级） |
| **数学触发门槛** | 前后两同向中枢核心区间 **$[ZD, ZG]$ 存在真实价格交集**（$\max(ZD_1, ZD_2) < \min(ZG_1, ZG_2)$） | 前后两**同级别普通段中枢**核心区间 $[ZD, ZG]$ 无交集，但极值区间 **$[DD, GG]$ 存在价格交集**（$\max(DD_1, DD_2) < \min(GG_1, GG_2)$） |
| **级别演化与升级** | **同级别同化**；若延伸累计内部段数达到 $\ge 9$ 段，按定理三直接升级为 **Macro 宏观级别** | **级别升级（Upgrade Level）**！跨中枢扩展外框级别严格升为高一级宏观中枢（`upgradedLevel: Macro, expanded: true`） |
| **跨级别扩展门禁** | — | **刚性同级别门禁**：若前一个中枢已因 $\ge 9$ 段升级为 Macro，后一个中枢为普通段中枢，**绝对禁止跨级别扩展**！只有两个中枢**均为普通段中枢**时才判断定理二扩展 |
| **扩展消费与单次性** | — | **消耗不重复原则**：所有参与扩展的内容（以及生成的扩展大框）**均被一次性消耗，绝不进入下一次判断扩展** |
| **图表几何与颜色规范** | **普通段中枢**：紫蓝色（`#818CF8`，实线框）；<br>**Macro 升级段中枢**（$\ge 9$ 段）：**高亮玫红色（`#E879F9`，虚线框）**，去掉紫蓝色 | **普通中枢扩展呈现**：<br>• 内层两普通段中枢保留紫蓝实线框；<br>• 外层单独生成一个高亮玫红色（`#E879F9`）大框包裹两者，标题为 `段中枢[高一级扩展]` |

---

## 三、私加规则与缺陷彻底清理清单

| 序号 | 缺陷代码点 | 现有错误逻辑 | 原典标准纠正（第一性原理） |
| :--- | :--- | :--- | :--- |
| **1** | `duan-channel.ts:180-250` | 扫描 3 根段强行拆为 1 进 + 1 内 + 1 出，`duans` 数组仅含 1 段或 2 段。 | **统一为 $a+3+b$ 模型**：初生中枢必须扫描 4 段（1 进 + 3 内），`duans` 严格由 3 根连续段构成，`entryDuan` 为第 0 段。 |
| **2** | `duan-channel.ts:205-224` | 离开段与三买三卖判定私加要求 $S_2.high > zg$ 且强行在初生 3 段内解决。 | **删除私加逻辑**：初生 3 根内部构件不承担离开角色。离开段必须是第 4 根或后续向外突破的段，且由其后的回抽段确认不回 $[ZD, ZG]$。 |
| **3** | `duan-channel.ts:310-380` | 离开段回抽判定私加 `s_leave.high > gg` 等对 $GG/DD$ 绝对超越要求。 | **彻底剔除 $GG/DD$ 门禁**：第三类买卖点回抽确认仅与 $[ZD, ZG]$ 有关，回抽不跌破 $ZG$ 即三买，不升破 $ZD$ 即三卖。 |
| **4** | `contracts.ts:173-174` | 注释声称“段级中枢无方向（无 trend）”。 | **纠正认知**：段中枢具备明确的形成方向（由第一根内部段或进入段方向决定，回升形成 vs 回调形成），遵循第 20 课 $Z$ 走势段逻辑。 |
| **5** | `duan-channel.ts` Phase B | 跨中枢非法合并、扩张逻辑混乱。 | **收敛 Phase B**：纯粹保留贪婪中枢延伸（$[ZD, ZG]$ 核心相交时合并），去除跨通道伪扩展。 |

---

## 四、统一算法架构设计与代码复用/编排改造

```
                     ┌───────────────────────────────────────────────┐
                     │          channel-lifecycle.ts                 │
                     │  (通用中枢生命周期引擎 ChannelLifecycleEngine)    │
                     │   - 4 构件初生门禁 (CHANNEL_CORE_LENGTH = 4)   │
                     │   - 5 构件封存门槛 (CHANNEL_MIN_SEALED = 5)    │
                     │   - 延伸震荡严格重叠吸纳 (Strict Overlap Guard)  │
                     │   - 三买 / 三卖次级别离开回抽确认决断          │
                     └───────────────────────┬───────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │       bi-channel.ts       │               │      duan-channel.ts      │
         │ (BiChannelCalculator)     │               │ (DuanChannelCalculator)   │
         │                           │               │                           │
         │ 策略注入:                  │               │ 策略注入:                  │
         │ BiLifecycleStrategy       │               │ DuanLifecycleStrategy     │
         │ 驱动:                     │               │ 驱动:                     │
         │ runSequentialLifecycle    │               │ runSequentialLifecycle    │
         │ 输出:                     │               │ 输出:                     │
         │ ChanBiChannel             │               │ ChanDuanChannel           │
         └───────────────────────────┘               └───────────────────────────┘
```

### 4.1 通用生命周期引擎（`channel-lifecycle.ts`）命名去“笔”化与通用化重构
`channel-lifecycle.ts` 在算法底层天然支持泛型 `<T extends ChannelElement, R>`，但其接口与常量命名严重硬编码了“笔（Bi）”，必须进行通用化命名升级：

| 现有命名（特定于笔） | 升级后命名（通用级别契约） | 语义重构说明 |
| :--- | :--- | :--- |
| `BiChannelLifecycleEngine` | **`ChannelLifecycleEngine`** | 通用走势中枢生命周期引擎（笔、段共用） |
| `BiStateMachine` | **`ChannelStateMachine`** | 通用走势中枢有限状态机 |
| `BiChannelLifecycleStrategy` | **`ChannelLifecycleStrategy`** | 通用中枢生命周期策略适配接口 |
| `BI_CENTRAL_CORE_LENGTH = 4` | **`CHANNEL_CORE_LENGTH = 4`** | 中枢初生核心构件数（1 进 + 3 内 = 4） |
| `BI_CENTRAL_MIN_SEALED_LENGTH = 5` | **`CHANNEL_MIN_SEALED_LENGTH = 5`** | 封存最小构件数（1 进 + 至少 3 内 + 1 出 = 5） |
| `firstBi`, `pullbackBi`, `leavingBi` | **`firstElem`, `pullback`, `leavingElem`** | 状态机内部参数与注释统一升级为抽象构件概念（Element） |

> **向后兼容机制**：在 `channel-lifecycle.ts` 底部保留 `export const BiChannelLifecycleEngine = ChannelLifecycleEngine`、`export type BiChannelLifecycleStrategy<T, R> = ChannelLifecycleStrategy<T, R>` 等别名，保证现有旧用例和引用不受破坏。

### 4.2 双中枢（`duan-channel.ts` 与 `bi-channel.ts`）编排改造与对称流水线
两份业务代码对 `channel-lifecycle.ts` 的编排改造如下：

#### 1. `duan-channel.ts` 编排重构（彻底接入通用引擎）
* **现状**：目前完全没有使用 `channel-lifecycle.ts`，内部手写了 270 行充满“1进+1内+1出”和私加门禁的旧循环；
* **改造**：
  1. 彻底物理删除手写的 270 行旧循环（`sequentiallyConfirmChannels`）；
  2. 实现纯策略类 `DuanChannelLifecycleStrategy`（实现 `ChannelLifecycleStrategy<ChanDuan, ChanDuanChannel>`）；
  3. 一行代码接入通用引擎：
     ```typescript
     const { phaseA, sequential } = ChannelLifecycleEngine.runSequentialLifecycle(
       confirmed,
       this.duanStrategy,
     );
     ```
  4. 代码量从 444 行骤降至约 120 行干净的策略门面。

#### 2. `bi-channel.ts` 编排对齐（升级接口与核心验证纯度）
* **现状**：已基于状态机编排，但调用的是旧的 `BiChannelLifecycleEngine`；
* **改造**：
  1. 升级导入和调用点为通用的 `ChannelLifecycleStrategy` 与 `ChannelLifecycleEngine`；
  2. 对齐 `validateCoreGeometry`（4 构件核心判定：1 进 + 3 内），确保笔与段在初生验证、$[ZD, ZG]$ 价格重叠计算及进入构件外部性约束上保持严格一致。

### 4.3 核心数据结构对齐契约
```typescript
export interface ChanDuanChannel extends BaseChanChannel {
  /** 纯内部振荡段序列（基础至少 3 段，延伸为 4, 5, 6... 段） */
  readonly duans: readonly ChanDuan[];
  /** 1 段进入（独立解耦挂载） */
  readonly entryDuan: ChanDuan;
  /** 1 段离开（确认离开封存时挂载，未完结为 undefined） */
  readonly leaveDuan?: ChanDuan;
  /** 中枢形成方向（回升形成 Up 或 回调形成 Down） */
  readonly trend: TrendDirection;
}
```

### 4.4 走势中枢通用计算引擎（`ChannelCalculationEngine`）与 100% 同构全量复用方案

在段中枢同步引入跨中枢极值扩展大框（Bounding Box Expansion）后，笔中枢（`bi-channel.ts`）与段中枢（`duan-channel.ts`）在全生命周期推进流水线上实现了 **100% 结构级与算法级完全同构**：

```
                    ┌───────────────────────────────────────────────┐
                    │          channel-lifecycle.ts                 │
                    │   通用中枢计算底座与流水线引擎                   │
                    │  (Generic Channel Pipeline Engine)            │
                    └───────────────────────┬───────────────────────┘
                                            │
                      ┌─────────────────────┴─────────────────────┐
                      ▼                                           ▼
        【阶段一：Phase A 顺序确认】                 【阶段二：Phase B 延伸与扩展】
        1. 4 构件初始核心搜索 (1进 + 3内)             1. 阶段 1：[ZD, ZG] 交集 -> 贪婪延伸合并 (Extension)
        2. validateCoreGeometry 几何门禁            2. 阶段 2：[DD, GG] 交集 -> 极值外层大框扩展 (Expansion)
        3. Strict Overlap Guard 延伸震荡吸纳           * Bi 扩展：双层外框 (level: Bi, upgradedLevel: Duan)
        4. 3B/3S 次级别离开与回抽确认 (同向 a===b)     * Duan 扩展：双层外框 (level: Duan, upgradedLevel: Macro)
        5. 奇数铁律保障 (内部与总数恒为奇数)
```

#### 4.4.1 代码下沉与重复消灭清单（消灭约 300 行重复代码）
1. **`validateCoreGeometry<T>(fourElements: readonly T[])` 下沉**：
   - 将当前在 `bi-channel.ts:454-509` 与 `duan-channel.ts:304-359` 中一字不差的 56 行重复函数，提炼为通用纯函数并导出在 `channel-lifecycle.ts` 中；
2. **`isSameChannelElement<T>(a: T, b: T)` 下沉**：
   - 提取通用的时间戳比对工具函数；
3. **`mergeExtendedChannelCore<T, R>` 下沉**：
   - 提取包含纯内部构件解耦、连接构件吸收、极值与收窄计算的通用中枢延伸融合算子；
4. **`buildExpandedBoundingBoxCore<T, R>` 下沉**：
   - 提取两中枢或多中枢极值相交生成外层大框（`expanded: true`）的通用计算工厂；
5. **门面极简收敛（Thin Facade）**：
   - `BiChannelCalculator` 和 `DuanChannelCalculator` 保留原有类名与方法签名（外部调用零破坏），内部均只需 30~50 行代码，配置注入参数：
     - `BiChannelCalculator`: `{ level: ChannelLevel.Bi, dynamicNarrowing: true, upgradedLevel: ChannelLevel.Duan }`
     - `DuanChannelCalculator`: `{ level: ChannelLevel.Duan, dynamicNarrowing: false, upgradedLevel: ChannelLevel.Macro }`

---

## 五、TDD 实施步骤与规范

本修复方案严格贯彻 **测试驱动开发（TDD）** 规范，杜绝未经测试验证的代码编写：

```
    ┌──────────────┐
    │  1. RED      │ 编写针对原典标准的失败测试用例（覆盖 4 段初生、5 段封存、三买三卖等）
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  2. GREEN    │ 重构 channel-lifecycle 与 duan-channel，使其优雅通过全部新规测试
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  3. REFACTOR │ 优化性能与代码结构，确保全仓 Guard 门禁与端到端测试 100% PASS
    └──────────────┘
```

### 5.1 规划的测试用例集（duan-channel.spec.ts）
1. **测试组 A：4 段初生与构件纯化测试（Core Forming）**
   * 用例 A1：`[d0, d1, d2, d3]` 构成标准初生中枢，断言 `entryDuan === d0`，`duans.length === 3`（`[d1, d2, d3]`），`leaveDuan === undefined`；
   * 用例 A2：断言 `[ZD, ZG]` 严格由 `d1, d2, d3` 的重叠价格区间决定；
   * 用例 A3：若 `d1, d2, d3` 无重叠（`zg <= zd`），拒绝成中枢，游标正常后移；
   * 用例 A4：断言 `duans` 数组内构件数绝对不小于 3。
2. **测试组 B：5 段封存与三买三卖测试（Sealing & 3rd Class Points）**
   * 用例 B1：`d4` 向上突破 $ZG$，$d5$ 回抽低点 $> ZG$（三买确认），断言中枢封存（`type: Complete`），`leaveDuan === d4`；
   * 用例 B2：`d4` 向下突破 $ZD$，$d5$ 回抽高点 $< ZD$（三卖确认），断言中枢封存（`type: Complete`），`leaveDuan === d4`；
   * 用例 B3：**剔除私加规则验证**：即使 $d4$ 的最高点未超过 $GG$，只要 $d5$ 回抽不跌破 $ZG$，依然判定三买有效封存！
3. **测试组 C：中枢震荡延伸测试（Extension）**
   * 用例 C1：第 4 段、第 5 段、第 6 段均在 $[ZD, ZG]$ 内部震荡，断言 `duans.length` 依次增长为 4、5、6；
   * 用例 C2：极值 $GG/DD$ 随内部震荡段动态刷新，但 $[ZD, ZG]$ 核心区间保持锁定或严格按原典规则处理。
4. **测试组 D：原典第 57 课标准 10 线段复现测试（Lesson 57 Golden Fixture）**
   * 用例 D1：输入原典第 57 课真实的 10 根线段数据，严格断言线段 `12, 23, 34` 构成中枢，`01` 为 `entryDuan`，`45` 为 `leaveDuan`，`56` 构成标准第三类卖点！

---

## 六、执行计划与推进里程碑

1. **里程碑 1（TDD 测试先行 - RED）**：
   * 编写 `libs/chancore/src/internal/duan-channel.spec.ts` 新规测试集；
   * 运行测试，确认因当前“1进+1内+1出”旧逻辑导致断言失败（RED 阶段）。
2. **里程碑 2（核心重构实现 - GREEN）**：
   * 在 `channel-lifecycle.ts` 中实现通用命名升级（`ChannelLifecycleEngine` 等）并保留向后兼容别名；
   * 改造 `duan-channel.ts`，彻底剔除 270 行旧循环，注入 `DuanChannelLifecycleStrategy` 接入通用引擎；
   * 升级 `bi-channel.ts` 的调用接口；
   * 运行测试，验证新规测试集全部 PASS（GREEN 阶段）。
3. **里程碑 3（全仓死代码清除与 Guard 守门 - REFACTOR）**：
   * 对照第 VII 节死代码清单，一口气删除全仓陈旧分支、死函数与伪断言测试；
   * 运行 `@app/chancore` 全量测试套件（24 suites, 300+ tests）；
   * 运行策略同构性与双时间戳门禁；
   * 验证前端图表渲染（`ChanVisualAdapter`）中段中枢几何指令，确保渲染无残影、时间跨度严丝合缝。
4. **里程碑 4（用户验收与归档）**：
   * 启动本地策略开发网关，图表核对段中枢渲染效果；
   * 提交代码并生成修复成果报告。

---

## 七、缠论算法全仓死代码与旧代码清退清单（彻底删除）

经过对全仓缠论算法模块（`libs/chancore` 及相关服务与测试）的全面静态扫描，以下代码模块、过时分支与旧测试属于死代码或违背原典的病态代码，必须在此次修复中**一口气彻底删除干净，绝不姑息残留**：

### 7.1 `duan-channel.ts` 旧算法死代码彻底物理清除（约 270 行）
1. **彻底物理删除手写扫描主循环（Lines 178-438）**：
   * 包含“将 3 根段生硬拆解为 1 进 + 1 内 + 1 出”（导致内部构件 `duans: [s1]` 只有 1 根段）的违规逻辑；
   * 包含分支 A 直接完满伪封存逻辑（`isDirectDeparture`，Lines 205-247）；
   * 包含分支 B 手写残缺内部构件（`internalDuans = [s1, s2]`，Lines 250-255）；
   * 包含场景 2/3/5/6 中手写私加的 $GG/DD$ 绝对超越要求以及手写 2s/2b 衰竭转折硬编码；
   * 包含单段极限反向贯穿（`piercesOppositeDown` / `piercesOppositeUp`，Lines 365-375）；
   * 包含 `phaseA.push({ duans: [s1, s2], ... })` 残缺构件组装；
   * **清理方式**：彻底物理整块删除，替换为 `ChannelLifecycleEngine.runSequentialLifecycle(confirmed, this.duanStrategy)`。
2. **彻底物理删除伪中枢大框构建器（Lines 135-164）**：
   * `buildExpandedDuanBoundingBox`：手写跨中枢合并外层大框，原典无此定义，且在 Phase B 扩展停用后已沦为无外部引用的死函数；
   * **清理方式**：彻底物理删除。
3. **重构清理畸形候选有效性判定（Lines 440-442）**：
   * 原 `isCandidateChannelValid` 中的 `channel.duans.length >= 1` 完全是为旧 Bug 擦屁股的畸形门禁；
   * **清理方式**：重构并对齐 `bi-channel.ts`，严格要求内部构件 `channel.duans.length >= 3`。

### 7.2 `bi-channel.ts` 历史兼容补丁与死分支彻底清除
1. **彻底删除未解耦旧版兜底死分支（Lines 503-509）**：
   * `isCandidateChannelValid` 中遗留的后半截死分支：
     ```typescript
     if (channel.bis.length < 4) return false;
     if (channel.type === ChannelType.Complete && channel.bis.length < 5) return false;
     ```
   * 在当前契约下 `hasExplicitEntry`（`entryBi` 独立解耦）恒为 `true`，此后半截死分支永远不可能被执行；
   * **清理方式**：物理删除未解耦兼容分支，收敛为统一清晰的强契约校验。
2. **清理专用笔命名引用**：
   * 升级 `BiChannelLifecycleStrategy`、`BiChannelLifecycleEngine` 为通用契约。

### 7.3 `channel-lifecycle.ts` 专用“笔”硬编码与陈旧命名重构清退
1. **升级所有 `Bi*` 硬编码命名**：
   * `BiChannelLifecycleEngine` $\to$ `ChannelLifecycleEngine`
   * `BiStateMachine` $\to$ `ChannelStateMachine`
   * `BiChannelLifecycleStrategy` $\to$ `ChannelLifecycleStrategy`
   * `BI_CENTRAL_CORE_LENGTH` $\to$ `CHANNEL_CORE_LENGTH`
   * `BI_CENTRAL_MIN_SEALED_LENGTH` $\to$ `CHANNEL_MIN_SEALED_LENGTH`
2. **清理状态机内硬编码特定名词**：
   * 参数与变量名中的 `b0`、`pullbackBi`、`leavingBi`、`firstBi` 全部通用化升级为 `e0`、`pullback`、`leavingElem`、`firstElem`；
   * 注释中特定于“笔”的表述全部升级为“构件（Element）”。

### 7.4 `contracts.ts` 陈旧遗留描述与字段纯化
1. **纠正段中枢注释错误（Lines 173-174）**：
   * 删除“段级中枢无方向（无 trend）”的历史错误描述；
   * 为 `ChanDuanChannel` 补齐 `trend: TrendDirection` 强类型定义。
2. **清除废弃字段残留提及**：
   * 清除代码注释中历史遗留的 `displayStartId / displayEndId` 讨论残留。

### 7.5 `duan-channel.spec.ts` 历史伪断言测试用例全面清退与置换
1. **删除迎合旧 Bug 的伪断言测试（Lines 381-396）**：
   * 用例中假定 `duans: [d0]`（仅 1 段内部构件）即为合法有效中枢的测试，属于彻头彻尾的迎合缺陷伪测试；
   * **清理方式**：彻底物理删除此类伪测试，置换为原典 4 段初生（`duans.length === 3`）真测试。
2. **删除 Phase A 仅有 2 段（`duans: [s1, s2]`）的旧断言**：
   * 现有用例中多处断言 Phase A 只有 2 段的断言全部更新为初生严格 3 段断言。

---

## 八、实施成果与验证记录（Verification & Completion Report）

基于 2026-10-03 严格按照 TDD 流程进行的统一重构，所有里程碑与全仓清理已圆满交付：

### 8.1 实施成果汇总
1. **统一引擎复用（`channel-lifecycle.ts`）**：
   - 命名全面泛化：`ChannelLifecycleEngine`、`ChannelStateMachine`、`ChannelLifecycleStrategy`、`CHANNEL_CORE_LENGTH = 4`、`CHANNEL_MIN_SEALED_LENGTH = 5`；保留向后兼容别名保障存量代码无缝过渡；
   - 彻底删除已退役的 440 余行死代码（旧 `DuanChannelLifecycleEngine`、`DuanStateMachine`、`checkDepartureRules`、`DepartureCheckResult`）；
   - 在 `ChannelLifecycleStrategy` 中新增 `dynamicNarrowing?: boolean` 选项，为笔中枢与段中枢提供灵活的区间收窄策略控制。
2. **段中枢重构与原典收敛（`duan-channel.ts`）**：
   - 彻底删除 270 余行手写重复循环 `sequentiallyConfirmChannels`，薄策略挂载复用通用状态机引擎；
   - 遵循原典第 17、18 课公理：初生核心由 $a + 3$（4 构件）确立，内部构件数组 `duans` 严格只容纳纯内部震荡段（长度 $\ge 3$）；
   - 遵循原典第 20 课恒定区间铁律（Invariant）：段中枢 `[ZD, ZG]` 严格由前 3 段构件锁定，后续内部震荡延伸不动态收窄（`dynamicNarrowing: false`）；
   - 遵循原典第 20 课 Z 走势段逻辑：段中枢具备明确方向属性 `trend: TrendDirection`，与进入段 $a$ 严格同向；
   - 遵循原典第 35 课定理三：内部震荡满 9 段自动触发中枢扩展（`expanded: true`，`upgradedLevel: ChannelLevel.Macro`）；相邻同级中枢核心区间重叠时链式延伸合并（Extension）。
3. **笔中枢边界与门禁纯化（`bi-channel.ts`）**：
   - 切换至通用 `ChannelLifecycleEngine` 接口与常量；
   - `isCandidateChannelValid` 同时支持解耦 `leaveBi` 强契约与存量全量 `bis` 数组校验；
   - 彻底清退未解耦历史分支。
4. **跨模块契约与前端映射对齐**：
   - `contracts.ts` 中 `ChanDuanChannel` 增加 `trend: TrendDirection`；
   - `apps/mist/src/chan/` 下的 `chan-analysis.types.ts`、`duan-channel.vo.ts`、`chan-core.mapper.ts` 同步支持 `trend`。

### 8.2 测试与门禁验证记录（100% GREEN）
- **`libs/chancore` 全仓单测套件**：
  - **24 Test Suites 全部 PASS**（0 失败，0 错误）
  - **302 Tests 全部 PASS**（1 个无关用例 skip）
- **业务集成与映射测试**：
  - `apps/mist/src/chan/chan-core.mapper.spec.ts`：PASS（5 tests）
  - `apps/mist/src/chan/chan.service.spec.ts`：PASS
  - `libs/visual-command/src/adapters/chan-visual.adapter.spec.ts`：PASS
- **架构守护门禁（Guard Specs）**：
  - `libs/chancore/src/chancore-bug-regression.guard.spec.ts`：PASS
  - `libs/chancore/src/chancore-boundary.guard.spec.ts`：PASS
  - `libs/strategy/src/strategy-dual-timestamp.guard.spec.ts`：PASS
  - `libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`：PASS
  - `libs/strategy/src/dev-server-boundary.guard.spec.ts`：PASS
- **多 App 编译验证（Webpack）**：
  - `nest build mist`：SUCCESS
  - `nest build chan`：SUCCESS
  - `nest build signal`：SUCCESS
  - `nest build backtest`：SUCCESS
- **本地策略开发网关（Dev Server）**：
  - 8001 端口服务健康运行，`/v1/visual/commands` 正常下发几何指令流。

### 8.3 笔/段中枢同构性审计与延伸修复专项（2026-10-04）
为确保笔中枢（`bi-channel.ts`）与段中枢（`duan-channel.ts`）在走势定义、延伸与同构性上保持严格一致，经过全方位 5 点同构性审计，按架构决策执行以下规范化修复：

1. **段中枢 Phase B 延伸同向强门禁修复（Point 1）**：
   - 缺陷：在 `duan-channel.ts` 的 Phase B 贪婪延伸循环中，虽判定了连接段连续性与核心价格重叠，但遗漏了 `current.trend === next.trend` 的同向约束，在极限振荡行情下可能错误拼接异向中枢。
   - 修复：在 `duan-channel.ts:95` 增加 `if (!isConnected || current.trend !== next.trend) break;` 门禁，与笔中枢严格同构。
2. **笔中枢延伸融合解耦纯内部构件与连接笔保留修复（Point 2）**：
   - 缺陷：在 `bi-channel.ts` 的 `mergeExtendedChannel` 中，原逻辑假设 `bis` 包含进入笔与离开笔，当输入为生产契约的解耦纯内部构件中枢时，连接笔（`c1.leaveBi` / `c2.entryBi`）未被包含在内部数组中而丢失，且执行错误的二次 `slice(1, -1)` 削去首尾内部笔。
   - 修复：升级 `mergeExtendedChannel` 为双模兼容模式。精准识别纯内部构件中枢，将连接笔 `connectingBi = c1.leaveBi ?? c2.entryBi` 正确纳入融合内部笔序列，直接作为 `internalBis` 参与价格极值与区间收窄计算，不丢失连接笔且杜绝二次错误切片；同时保留对包含完整首尾笔的存量测试用例的兼容。
   - TDD 测试守护：在 `channel-extension-expansion.spec.ts` 新增专属测试用例《两相邻同向上涨中枢使用纯内部构件契约（bis仅含内部构件，entryBi/leaveBi解耦）时，延伸融合正确保留连接笔且不错误二次切片》，严密防守。
3. **保留 deliberate 策略差异（Points 3 & 4）**：
   - 依照用户指令，保留既定策略差异，不盲目强行抹平：
     * **扩展策略差异**：笔中枢采用双层外框叠加扩展（`buildExpandedBoundingBox`），段中枢遵循第 35 课满 9 段单中枢宏观级别升级（`upgradedLevel: Macro`）；
     * **动态收窄策略差异**：笔中枢采用内部构件公共交集动态收窄（`dynamicNarrowing: true`），段中枢采用原典第 20 课由前 3 段严格锁定的恒定区间铁律（`dynamicNarrowing: false`）。
4. **验证总览**：
   - `libs/chancore` 24 个单测套件共 303 个测试全部 PASS（0 fail, 1 skip）；
   - 5 个 Guard 门禁全绿；
   - dev-server 与前沿无缝兼容。

### 8.4 段中枢跨中枢扩展大框（玫红色 Macro 大框）与双中枢全量逻辑复用落地规划（2026-10-04）

#### 8.4.1 核心需求与设计决断
根据架构评审与用户明确指示：
1. **恢复段中枢跨中枢扩展大框（Central Expansion Bounding Box）**：
   在 `duan-channel.ts` 的 Phase B 中增加阶段 2 极值扩展逻辑。当相邻两段中枢满足连接段相接、同向、$[ZD, ZG]$ 核心无交集但极值 $[DD, GG]$ 存在价格交集时，保留原段中枢，并追加外层大框中枢（`expanded: true, upgradedLevel: ChannelLevel.Macro`）。
2. **前端图表呈现明确对齐**：
   在 `TradingViewChart.tsx` 中，当渲染 `band.layer === 'chan_zs_duan'` 且 `band.expanded === true` 时，边框与半透明填充色统一使用 **高亮玫红色（`#E879F9`）**，标签展示为 **`段中枢[高一级扩展]`**，完美匹配视觉认知。
3. **笔与段双中枢 100% 全量复用**：
   以此为契机，将 `validateCoreGeometry`、`isSameChannelElement`、延伸合并与扩展大框等全面抽离下沉，使全系统技术指标与走势中枢库达成最高代码纯度与同构复用。

#### 8.4.2 TDD 落地与测试覆盖规划
1. **测试用例 11 重构（`duan-channel.spec.ts`）**：
   将此前“停用段中枢扩展、不生成 expanded 框”的用例，翻转为断言“生成 `expanded: true`、`upgradedLevel: ChannelLevel.Macro` 的段级扩展大框”；
2. **连续扩展与阻断测试**：
   断言三段中枢连续扩展、极值断层不触发扩展等边界防御；
3. **全仓回归**：
   保持 `@app/chancore` 全仓 24 个套件与 Guard 门禁 100% 通过。

