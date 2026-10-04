# 缠论全系统中枢架构重构与段中枢落地白皮书（Master 完备终极版）

> **版本**：v11.0 Master  
> **核心定位**：全量整合**核心几何算法演进**、**段中枢 7 种穷尽终结场景**、**中枢构件拆分**、**级别升级双级别契约 (方案 B: 原生 level 恒定 + upgradedLevel: Macro)**、**全仓 Bi vs Duan 命名对称对齐**、**废弃字段彻底清理**与**100% 严格 TDD（测试驱动开发：红-绿-重构）全生命周期工程矩阵**，作为本次重构的唯一权威指导规范。  
> **状态**：方案完全定稿 / TDD 测试先行执行就绪

---

## 一、核心几何算法与生命周期演化（第一性原理）

### 1. 中枢成立第一性原理（缠论第 17 课与进入/离开段本质）

#### ① 中枢构成的唯一原典定义（第 17 课）
“某级别走势类型中，被至少三个连续次级别走势类型所重叠的部分，称为缠中说禅走势中枢。”
- 走势中枢的诞生：由连续 3 个完成的次级别走势（线段 $S_1, S_2, S_3$）形成价格重叠：
  $$ZG = \min(g_1, g_2, g_3) > ZD = \max(d_1, d_2, d_3)$$
  核心区间 $[ZD, ZG]$ 瞬间锁定（原典第 20 课恒定区间，后续内部震荡绝不动态收窄）。
- 内部波动极值：
  $$GG = \max(g_1, g_2, g_3), \quad DD = \min(d_1, d_2, d_3)$$
  **$GG$ 与 $DD$ 是中枢构件自然产生的波动极值范围（“高高”与“低低”），纯属几何统计值，绝对不是进入或离开中枢的准入/准部门禁！**

#### ② 构件解耦：$a + A + b$ 的纯正时空映射
- **进入段 $a$**：
  发生在走势中枢 $A$ 产生之前，将走势带入该区域（第 17 课指出甚至可以没有进入段，如强趋势反转直接形成中枢）。
  **原典中绝对没有任何“进入段的极值要大于 GG 或小于 DD”的要求！中枢未成何来中枢 GG/DD！**
- **中枢内部构件 $A$**：
  初始由 3 段构成（`duans.length = 3`），后续每有一段触及 $[ZD, ZG]$，自然依时序压入 `duans`，严格保持线段“下-上-下-上-下”连续交替，**绝不允许发生丢段、更不允许两个同向段拼接！**
- **离开段 $b$**：
  发生在走势脱离中枢核心区间 $[ZD, ZG]$ 之时。
  **原典第 20 课与第 53 课明确强调：离开的唯一几何基准是 $[ZD, ZG]$，绝不是 $[DD, GG]$！第三类买点绝不要求突破 $GG$！只要回抽不跌回 $ZG$ 即告确立！**

---

### 2. 笔中枢 vs 段中枢双轨演化算法矩阵

| 算法维度 | 笔级中枢（`ChanBiChannel`） | 段级中枢（`ChanDuanChannel`） | 理论依据与差异本质 |
| :--- | :--- | :--- | :--- |
| **基础结构定式** | **1 进 + 中间 3 + 1 出**（基线 5 笔） | **1 进 + 中间 3 + 1 出**（基线 5 段） | 原典 17 课：任何中枢均至少需 3 个连续次级别构件重叠 |
| **内部构件数组** | `bis`: 中间内部振荡笔（基础 3 笔，延伸为 5, 7, 9... 笔） | `duans`: 中间内部振荡段（基础 3 段，延伸为 4, 5, 6, 7... 段） | 构件数组严格只放纯内部构件，严格上下交替连续，绝不丢段 |
| **进出解耦属性** | `entryBi`: $B_{entry}$（1 笔）<br>`leaveBi`: $B_{leave}$（1 笔，封存时确立） | `entryDuan`: $D_{entry}$（1 段）<br>`leaveDuan`: $D_{leave}$（1 段，封存时确立） | 显式解耦，供下游直接读取对比背驰 |
| **区间演化机制** | **动态收窄（Dynamic Narrowing）** | **原典第 20 课恒定区间（Invariant）** | 笔中枢动态收缩过滤微观毛刺；段中枢最初 3 段锁定 $[ZD, ZG]$，后续触碰即吸纳 |
| **极值区间 $[DD, GG]$** | 仅取 `bis` 内部构件极值，不被离开笔冲高污染 | 仅取 `duans` 内部构件极值，不被离开段冲高污染 | 离开段极值属于走势本身，绝不污染中枢 $[DD, GG]$ |
| **方向属性** | **有方向**（由 $B_{entry}.trend$ 确立，顺势离开） | **无方向**（无 `trend` 字段，纯对称价格交叠，双向离开） | 段中枢既可向上出三买，也可向下出三卖 |
| **$\ge 9$ 扩展机制** | 内部笔 `bis.length >= 9` 标记 `expanded: true`，持续支持 11、13 延伸 | 内部段 `duans.length >= 9` 标记 `expanded: true` 与 `upgradedLevel: ChannelLevel.Macro`，`level` 恒保持 `Duan` | 达到 9 单元升级高一级走势中枢，物理血统永不丢失 |
| **离开终结规则** | 保留原有 4 规则单向判定不变 | **原典三要素几何判定**（三买/三卖/新中枢/末端） | 彻底拔除反向击穿 DD 强制截断等私货规则 |
| **Phase B 延伸合并** | 首尾相接且方向一致、$[ZD, ZG]$ 重叠合并 | 首尾相接、$[ZD, ZG]$ 重叠合并（**无方向约束**） | 贪婪链式吸收合并，保持连接段连续性 |
| **Phase B 扩展大框** | 暂不启用跨中枢大框扩展，避免几何拓扑混乱 | 暂不启用跨中枢大框扩展，保留纯净中枢延伸 | 遵照用户指令：中枢扩展暂去掉，保留中枢延伸 |

---

### 3. 级别升级第一性原理与双级别契约（原典第 35 课定理三落地）

#### ① 升级的本质：走势级别/时间周期的跃迁（绝对不是“笔升级为段”）
- **为什么不是“笔升级到段”？**：
  在缠论原典严格定义中，“线段”必须由特征序列顶底分型破坏独立确认终结（原典第 62～67 课），具有独立的不可替代性，绝不能由 9 根笔拼凑替代。笔中枢是微观噪音过滤工具，属于辅助结构，**不做级别升级**，始终保持 `level: ChannelLevel.Bi`。
- **为什么是时间周期跃迁（如 1m 升 5m，5m 升 30m）？**：
  原典第 35 课定理三明确指出：*“前三段构成该级别中枢……若延伸出 9 个次级别走势类型（即 9 根线段），或者两个同级别中枢产生波动区间的重叠 $[DD, GG] \cap [DD', GG'] \neq \emptyset$，则形成更大级别的中枢。”*
  - 1 分钟图上的段中枢如果延伸 9 段或产生 $[DD, GG]$ 重叠扩展，在时间跨度与空间尺度上，**等价于 5 分钟图上的走势中枢**；
  - 5 分钟图上的段中枢如果 9 段延伸或扩展，**等价于 30 分钟图上的走势中枢**。

#### ② 方案 B：轻量非破坏性双级别契约（血统恒定 + 目标显式）
为彻底杜绝直接修改 `level = Macro` 导致的“血统丢失”（图层不知如何归属、下游不知构件是笔还是段）问题，采用方案 B：
- **`level: ChannelLevel`（物理构造型，血统永不变异）**：
  `ChanBiChannel` 恒为 `Bi`，`ChanDuanChannel` 恒为 `Duan`。全仓所有图层归属判断、构件数组访问（`bis` vs `duans`）完全不受影响，100% 保持稳定；
- **`expanded: boolean`（扩展标记）**：
  标识本中枢是否为 9 段延伸产物；
- **`upgradedLevel?: ChannelLevel`（升级目标级别）**：
  - 普通未升级段中枢：`undefined`；
  - 触发原典第 35 课 9 段延伸升级的段中枢：`ChannelLevel.Macro`（代表高一级别的走势中枢）；
- **前端与图层展现**：
  前端统一在段图层绘制，当检测到 `upgradedLevel === ChannelLevel.Macro` 时，在色块标签上追加标记 `[高一级扩展]`。

---

## 二、段中枢离开与终结的原典正统判定

回归缠论原典，中枢的生命周期判定极其纯粹，彻底剔除所有“破 DD/GG 截断”、“极值大小比较”等非原典私货：

```
                                  ┌──► 场景 1: 触碰区间震荡 ──────────────► 【中枢延伸，持续吸纳】
                                  │
                                  ├──► 场景 2: 向上冲破 ZG + 回拉不破 ZG ──► 【三买封存离开】(向上离开)
当前活跃段中枢 [ZD, ZG] 面对后续走势 ──┼──► 场景 3: 向下击穿 ZD + 反弹不破 ZD ──► 【三卖封存离开】(向下离开)
                                  │
                                  ├──► 场景 4: 后续走出独立新 3 段核心 ───► 【中枢新生，截断旧中枢】
                                  │
                                  └──► 场景 5: 数据序列末端到达 ──────────► 【尾部未完结中枢 (UnComplete)】
```

### 1. 场景 1：内部震荡延伸（Extension）
- **几何特征**：当前段 $curr$ 的价格区间触及或穿透中枢核心 $[ZD, ZG]$（$curr.high \ge ZD \land curr.low \le ZG$），且未形成三买/三卖离开；
- **状态机动作**：
  1. 顺理成章压入内部构件数组 `duans.push(curr)`，严格保持上下交替；
  2. 外扩更新波动极值：$GG = \max(GG, curr.high), DD = \min(DD, curr.low)$（仅作极值统计）；
  3. $[ZD, ZG]$ 恒定不变；
  4. 若内部段数达到 9 段，标记 `expanded = true` 与 `upgradedLevel = ChannelLevel.Macro`；
  5. 游标推进。

### 2. 场景 2：向上突破确立第三类买点（离开段封存）
- **几何特征**：当前段 $curr$ 向上脱离核心区间（$curr.high > ZG$），且紧随其后的回踩段 $pullback$（向下段）**最低点依然高于中枢上沿**（$pullback.low > ZG$）；
- **状态机动作**：确立 `leaveDuan = curr`，标记 `type = Complete`，旧中枢完满封存，游标推进至 $curr$ 终点。
- **原典守门**：**绝不要求 $curr.high > GG$！脱离 $[ZD, ZG]$ 并在其上站稳即是标准三买！**

### 3. 场景 3：向下跌破确立第三类卖点（离开段封存）
- **几何特征**：当前段 $curr$ 向下脱离核心区间（$curr.low < ZD$），且紧随其后的反弹段 $pullback$（向上段）**最高点依然低于中枢下沿**（$pullback.high < ZD$）；
- **状态机动作**：确立 `leaveDuan = curr`，标记 `type = Complete`，旧中枢完满封存，游标推进至 $curr$ 终点。
- **原典守门**：**绝不要求 $curr.low < DD$！脱离 $[ZD, ZG]$ 并在其下受阻即是标准三卖！**

### 4. 场景 4：中枢新生（定理一强制截断）
- **几何特征**：后续走势在不与 $[ZD, ZG]$ 重叠的新空间内，连续走出 3 段独立形成了新的合法中枢核心（$ZG_{new} > ZD_{new}$）；
- **状态机动作**：旧中枢在新中枢起点处截断封存，保证形成标准的多中枢趋势（$a + A + b + B + c$）。

### 5. 场景 5：数据流末端
- **几何特征**：到达最后一根段，未成离开确认；
- **状态机动作**：输出 `type = UnComplete`。

---

### 6. 原典段中枢速查表（私货彻底剔除后）

| 场景序号 | 场景名称 | 核心判据公式 | 内部构件变化 | 封存标志 (`isComplete`) | 离开段 (`leaveDuan`) | 原典依据 |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **1** | **内部震荡延伸** | 触及核心 $[ZD, ZG]$ 且未确立离开 | `duans.push(curr)` 严格交替 | `false` | `undefined` | 缠论第 20 课 |
| **2** | **向上三买离开** | $curr.high > ZG \land pullback.low > ZG$ | 不增加 | `true` | $curr$（向上离开） | 缠论第 20/53 课 |
| **3** | **向下三卖离开** | $curr.low < ZD \land pullback.high < ZD$ | 不增加 | `true` | $curr$（向下离开） | 缠论第 20/53 课 |
| **4** | **中枢新生闭合** | 后续 3 段形成不重叠的独立新核心 | 闭合封存 | `true` | 新中枢起点前截断 | 缠论第 18 课定理一 |
| **5** | **数据末端未完** | 到达历史/实时数据最后一根 | 保持当前 | `false`（UnComplete） | 最新候选段 | 边界处理 |

---

### 7. 段中枢历史代码 7 大私加判定排查与原典对齐清单

经与缠论原典逐课严密对账，排查出现有段中枢代码实现（`duan-channel.ts`）中存在的 7 大私加判定：

| 私加判定编号 | 历史代码实际判定位置与逻辑 | 缠论原文对齐分析与依据 | 实盘危害与扭曲表现 | 确认结论 |
| :--- | :--- | :--- | :--- | :---: |
| **判定 1：构件生硬拆分为“1进+1内+1出”** | `duan-channel.ts:180-248`：扫描 3 根段 $S_0, S_1, S_2$，强行把 $S_0$ 扣留为 `entryDuan`，中枢内部初始只有 `[S_1]`（1段）或 `[S_1, S_2]`（2段）。 | **第 17 课公理**：中枢“被至少三个连续次级别走势类型所重叠”。进入段在 $A$ 之前，中枢 $A$ 自身基线必须由至少 3 个连续线段构成。 | 中枢基线构件数不足 3 段，构件概念与进入段概念混淆。 | 🔴 **严重私加** |
| **判定 2：$GG/DD$ 统计排除第一段 $S_0$** | `duan-channel.ts:251-252`：`gg = Math.max(s1.high, s2.high)`，`dd = Math.min(s1.low, s2.low)`，刻意剔除 $S_0$。 | **第 17 课公式**：$GG = \max(g_1, g_2, g_3), DD = \min(d_1, d_2, d_3)$。必须包含构成中枢的全部 3 段。 | 漏算基础段极值，导致计算出的 $GG$ 偏小、$DD$ 偏大。 | 🔴 **私加错误** |
| **判定 3：离开段强加“突破 GG / 跌穿 DD”约束** | `duan-channel.ts:319, 349`（规则 2 衰竭离开）：要求 `curr.high > gg`、`curr.low < dd`。 | **第 20/53 课公理**：离开中枢的唯一基准是核心区间 $[ZD, ZG]$！第 20 课明言：“三买绝不要求创新高突破 GG，只要次回抽不破 ZG 即可”。 | 人为设卡，导致未破 $GG/DD$ 但已脱离 $[ZD, ZG]$ 确认三买/三卖的正常离开段被拒之门外。 | 🔴 **严重私加** |
| **判定 4：所谓“场景 5 单段贯穿 DD/GG 强制截断”** | `duan-channel.ts:366-375`：`curr.low < zd && curr.low < dd` 判定为场景 5，立即截断旧中枢且不给 `leaveDuan`。 | **第 20 课中枢延伸公理**：只要次回抽仍触及 $[ZD, ZG]$，该段无论多深依然是中枢内部震荡（刷新 $DD$ 即可），绝不能将中枢腰斩！ | **破坏力极大**：把 000001 30m #3 中枢（2025-11-14 跌至 3816.58）强行腰斩，导致关键向下段丢失！ | 🔴 **破坏性私加** |
| **判定 5：场景 6 中枢新生离开段附加内部起源限制** | `duan-channel.ts:278-290`：要求 `c0OriginatedInside` 且由 `c1` 走出三买三卖，否则不赋 `leaveDuan` 直接截断退出。 | **第 18 课定理一**：新中枢成立即确立趋势，两中枢之间的连接段自然归属为离开段，无需苛刻内部起源判定。 | 导致中枢封存时离开段频繁丢失变成 `undefined`。 | 🟡 **私加限制** |
| **判定 6：Phase B 延伸合并丢弃连接段** | `duan-channel.ts:120-128`：合并时直接执行 `[...c1.duans, ...c2.duans]`，抛弃介于两者间的 `c2.entryDuan`。 | **走势交替公理**：线段必须保持严格的“下-上-下-上”物理交替。丢弃中间段直接导致前后两同向段在同一中枢相连。 | 实盘 #3 中枢出现 11-05 向上段与 11-24 向上段直接相邻撞车，中间 11-14~11-24 向下段被吞噬。 | 🔴 **实现漏洞** |
| **判定 7：Phase B 延伸合并机械对区间求交集** | `duan-channel.ts:130-131`：`zg = Math.min(c1.zg, c2.zg), zd = Math.max(c1.zd, c2.zd)`。 | **第 20 课恒定区间公理**：中枢区间由最初 3 段锁定，延伸并不收窄。两中枢合并本质是同一中枢延伸，应保持原核心。 | 导致实盘 #3 中枢区间被机械交集压成 **13.73 点可笑薄片**（真实波动超 200 点）。 | 🔴 **私加收窄** |

## 三、中枢构件范围拆分与下游补丁彻底消灭

### 1. 彻底拆分中枢构件（$a + A + b$）
- 构件数组 `bis` / `duans` **纯净化为仅存放中枢内部振荡构件**；
- 进入单元（$a$）与离开单元（$b$）从数组中剥离，由 `entryBi / leaveBi` 与 `entryDuan / leaveDuan` 显式持有。

### 2. 彻底拔除全系统下游补丁代码（干净纯粹）
1. **前端绘图（`chan-visual.adapter.ts`）**：
   - 彻底删除原补丁：`zs.bis.length >= 2 ? zs.bis[1] : zs.bis[0]` 与 `toTime = centralExitBi.startTime`；
   - 笔中枢与段中枢 100% 结构同构：
     ```typescript
     // 笔中枢色块：纯内部构件 bis (3, 5, 7...)
     const fromIdx = getKIndex(zs.bis[0].startTime, zs.startId);
     const toIdx = getKIndex(zs.bis.at(-1).endTime, zs.endId);

     // 段中枢色块：纯内部构件 duans (1, 2, 3...)
     const fromIdx = getKIndex(zs.duans[0].startTime, zs.startId);
     const toIdx = getKIndex(zs.duans.at(-1).endTime, zs.endId);
     ```
     **自然、精准框定内部振荡核心，色块不位移、不遮盖进入与离开段！**
2. **买卖点与背驰检测（`buy-sell-point.ts`）**：
   - 彻底删除 `isBi && units.length >= 4 ? units[1] : units[0]` 与 `units.length - 2` 切片补丁；
   - 中枢跨度严格对应内部构件首末；
   - 进出背驰对比直接取 `channel.entryBi` vs `channel.leaveBi`（笔）以及 `channel.entryDuan` vs `channel.leaveDuan`（段）。

---

## 四、废弃字段彻底清理清单

在全仓所有代码、接口、VO 与测试中，**彻底物理删除 `displayStartId` 与 `displayEndId`**：
- `contracts.ts`；
- `channel-lifecycle.ts`（清理 `resolveChannelAnchorIds`）；
- `bi-channel.ts`（原 `channel.ts`）；
- `duan-channel.ts`；
- `apps/mist/src/chan/vo/bi-channel.vo.ts` 与 `duan-channel.vo.ts`；
- `apps/mist/src/chan/types/chan-analysis.types.ts`；
- `apps/mist/src/chan/chan-core.mapper.ts`；
- `mist-fe/app/api/types.ts`；
- 全仓相关单元测试断言与 mock fixture。

保留 `startId`（首构件第一根 K 线 ID）与 `endId`（末构件最后一根 K 线 ID）作为真实的物理时空边界。

---

## 五、全仓 Bi vs Duan 命名对称与零别名规范

全面清理历史含混命名，**不保留任何 `@deprecated` 别名**，一次性彻底重命名：

| 模块 / 文件 | 旧名字（含混） | **新规范名字（镜像对称）** | 对标的段中枢名字 | 改造说明 |
| :--- | :--- | :--- | :--- | :--- |
| **`contracts.ts`** | `ChanChannel` | **`ChanBiChannel`** | `ChanDuanChannel` | 继承 `BaseChanChannel` |
| **`contracts.ts`** | `ChanChannelTwoPhaseResult` | **`ChanBiChannelTwoPhaseResult`** | `ChanDuanChannelTwoPhaseResult` | 规范命名 |
| **`contracts.ts`** | `ChanBuySellPoint` | **`ChanBuySellPoint`**（含 `level`） | 同左（含 `level`） | 新增 `level: ChannelLevel` 字段 |
| **`contracts.ts`** | `ChanDivergence` | **`ChanDivergence`**（含 `level`） | 同左（含 `level`） | 新增 `level: ChannelLevel` 字段 |
| **`internal/bi-channel.ts`**| `channel.ts` / `ChannelCalculator`| **`bi-channel.ts` / `BiChannelCalculator`**| `duan-channel.ts` / `DuanChannelCalculator` | 文件与类彻底重命名 |
| **`internal/bi-channel.spec.ts`**| `channel.spec.ts` | **`bi-channel.spec.ts`** | `duan-channel.spec.ts` | 测试文件重命名 |
| **`channel-lifecycle.ts`** | `CentralStateMachine` | **`BiStateMachine`** | `DuanStateMachine` | 状态机对称 |
| **`channel-lifecycle.ts`** | `ChannelLifecycleEngine` | **`BiChannelLifecycleEngine`** | `DuanChannelLifecycleEngine` | 引擎对称 |
| **`chan-core.ts`** | `ChanCore.createChannels()` | **`ChanCore.createBiChannels()`** | `ChanCore.createDuanChannels()` | 门面方法对称 |
| **`vo/bi-channel.vo.ts`** | `channel.vo.ts` / `ChannelVo` | **`bi-channel.vo.ts` / `BiChannelVo`** | `duan-channel.vo.ts` / `DuanChannelVo` | 后端 VO 对称 |
| **`vo/bi-channel.vo.ts`** | `ChannelTwoPhaseVo` | **`BiChannelTwoPhaseVo`** | `DuanChannelTwoPhaseVo` | VO 对称 |
| **`chan-core.mapper.ts`** | `toChannelVo` | **`toBiChannelVo`** | `toDuanChannelVo` | 映射函数对称 |
| **`chan.controller.ts`** | `@Post('channel')` | **`@Post('bi-channel')`** | `@Post('duan-channel')` | REST 端点对称 |
| **前端 `app/api/types.ts`** | `IFetchChannel` | **`IFetchBiChannel`** | `IFetchDuanChannel` | 前端类型对称 |
| **前端 `app/api/types.ts`** | `IFetchChannelPhases` | **`IFetchBiChannelPhases`** | `IFetchDuanChannelPhases` | 前端类型对称 |
| **前端 `app/api/client.ts`**| `fetchChannel` | **`fetchBiChannel`** | `fetchDuanChannel` | 前端请求方法对称 |
| **前端 `app/api/client.ts`**| `normalizeChannelPhases` | **`normalizeBiChannelPhases`** | `normalizeDuanChannelPhases` | 前端转换方法对称 |
| **绘图图层 Layer** | `chan_bsp` | **`chan_bsp_bi`** | `chan_bsp_duan` | 绘图图层对称 |

---

## 六、精炼后的全套 TypeScript 契约定义（`contracts.ts`）

```typescript
/**
 * 缠论中枢级别枚举（包含原生级别与高一级别宏观枚举）
 */
export enum ChannelLevel {
  Bi = 'bi',       // 笔级中枢
  Duan = 'duan',   // 段级中枢（本级别标准中枢）
  Macro = 'macro', // 高一级中枢（等价于 1m->5m 或 5m->30m 的高一级别中枢，原典35课扩展/9段延伸产物）
}

/**
 * 缠论中枢公共抽象几何基底（消灭冗余，彻底删除 displayStartId/displayEndId）
 */
export interface BaseChanChannel {
  readonly zg: number;                  // 中枢上沿
  readonly zd: number;                  // 中枢下沿
  readonly gg: number;                  // 纯内部振荡极值高点
  readonly dd: number;                  // 纯内部振荡极值低点
  readonly level: ChannelLevel;         // 物理构造型级别（血统永不变异）：ChannelLevel.Bi | ChannelLevel.Duan
  readonly type: ChannelType;           // Complete | UnComplete
  readonly status: ChannelStatus;       // Valid
  readonly expanded: boolean;           // 中枢扩展标志（内部构件 >= 9 或 Phase B 扩展）
  readonly upgradedLevel?: ChannelLevel;// 升级目标级别（未升级为 undefined，升级后为 ChannelLevel.Macro 高一级中枢）
  readonly extended?: boolean;          // Phase B 延伸融合产物标志
  readonly startId: number;             // 真实物理起始 K 线 ID
  readonly endId: number;               // 真实物理终止 K 线 ID
}

/**
 * 笔级中枢（Bi-level Channel）
 */
export interface ChanBiChannel extends BaseChanChannel {
  /** 纯中间内部振荡笔序列（基础 3 笔，延伸为 5, 7, 9... 笔） */
  readonly bis: readonly ChanBi[];
  /** 1 笔进入（独立解耦） */
  readonly entryBi: ChanBi;
  /** 1 笔离开（封存确立离开时为离开笔） */
  readonly leaveBi?: ChanBi;
  /** 中枢方向（由进入笔确立） */
  readonly trend: TrendDirection;
}

export interface ChanBiChannelTwoPhaseResult {
  readonly phaseA: readonly ChanBiChannel[];
  readonly phaseB: readonly ChanBiChannel[];
}

/**
 * 段级中枢（Duan-level Channel）
 */
export interface ChanDuanChannel extends BaseChanChannel {
  /** 纯内部振荡段序列（基础 1 段，延伸为 2, 3, 4, 5, 6... 段） */
  readonly duans: readonly ChanDuan[];
  /** 1 段进入（独立解耦） */
  readonly entryDuan: ChanDuan;
  /** 1 段离开（封存确立离开时为真正离开段） */
  readonly leaveDuan?: ChanDuan;
  // 段中枢天然无方向，无 trend 字段
}

export interface ChanDuanChannelTwoPhaseResult {
  readonly phaseA: readonly ChanDuanChannel[];
  readonly phaseB: readonly ChanDuanChannel[];
}

/**
 * 买卖点输出（显式携带 level，一目了然区分笔买卖点 vs 段买卖点）
 */
export interface ChanBuySellPoint {
  readonly type: ChanBspType;
  readonly level: ChannelLevel;          // ChannelLevel.Bi | ChannelLevel.Duan
  readonly zhongshuIndex: number | null;
  readonly unitIndex: number;
  readonly price: number;
  readonly firstTypeIndex: number | null;
}

/**
 * 背驰输出（显式携带 level，区分笔背驰 vs 段背驰）
 */
export interface ChanDivergence {
  readonly type: ChanDivergenceType;
  readonly level: ChannelLevel;          // ChannelLevel.Bi | ChannelLevel.Duan
  readonly zhongshuIndex: number;
  readonly enterIndex: number;
  readonly leaveIndex: number;
  readonly enterForce: ChanUnitForce;
  readonly leaveForce: ChanUnitForce;
}
```

---

## 七、严格 TDD（测试驱动开发）全生命周期工程规范与测试矩阵

本项目重构涉及全仓核心几何算法、状态机、多层级 API 与前端渲染，**必须严格实行 100% 测试驱动开发（TDD）规范**：

```
       ┌────────────────────────────────────────────────────────┐
       │   1. 🔴 RED（测试先行）                                  │
       │   先写单元测试，运行确认失败（预期原因报红，无副作用验证）   │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │   2. 🟢 GREEN（最小实现）                                │
       │   编写刚好满足测试通过的最简生产代码，严禁过度设计（测试变绿）│
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │   3. 🔵 REFACTOR（重构收敛）                             │
       │   在全绿测试套件守护下，彻底清理历史补丁与冗余，保持全绿     │
       └────────────────────────────────────────────────────────┘
```

### 1. 核心 TDD 研发铁律
1. **测试先行（Test First）**：严禁在未编写失败测试前编写任何业务逻辑代码。每一个重构改动或新场景判定必须先有失败测试用例（红）；
2. **渐进最小实现（Minimal Implementation）**：生产代码只编写刚好满足测试通过的内容，严禁过度设计；
3. **回归守护（Regression Guard）**：每一次重构拔除历史补丁（如 `displayStartId`、`slice(1, -2)` 等）时，测试必须全程守护，杜绝任何意料外的破损；
4. **全仓门禁（Zero Tolerance Boundary）**：每个批次结束提交前，必须运行并通过该模块所有单测。

---

### 2. 五大 TDD 核心测试套件矩阵（覆盖笔、笔中枢、段中枢与全链路）

#### 套件 1：笔基底（ChanBi）与包含处理守护套件（`bi.spec.ts`、`bi.phase-a.spec.ts`、`bi.phase-b.spec.ts`）
- **覆盖范围**：原有笔生成算法、分型极值、顶底包含过滤与独立 K 线计数；
- **TDD 守护重点**：
  - [x] 顶底分型区间包含过滤测试（`filterFenxingContainment: false` vs `true`）；
  - [x] 独立 4 根 K 线成笔严格判定；
  - [x] Phase B 伪笔合并与转折测试；
  - [x] **回归保证**：确保中枢重构不反向污染底层的成笔逻辑。

#### 套件 2：笔中枢（ChanBiChannel & BiStateMachine）重构套件（`bi-channel.spec.ts`、`channel-lifecycle.spec.ts`）
- **覆盖范围**：原 `channel.ts` 重命名为 `bi-channel.ts`，状态机重构为 `BiStateMachine`；
- **TDD 先行用例设计**：
  - [ ] **用例 1（初生锁定）**：输入 1 根进入笔 + 3 根内部交叠笔，断言 `bis.length === 3`，`entryBi` 独立挂载，`zg/zd` 正确锁定；
  - [ ] **用例 2（动态收窄）**：输入后续内部震荡笔，断言 $[ZD, ZG]$ 动态向内收缩（`min(zg)` / `max(zd)`），且 `gg/dd` 取内部构件极值；
  - [ ] **用例 3（解耦隔离）**：当离开笔冲出时，断言 `bis` 数组**绝对不包含**离开笔，`leaveBi` 单独确立；
  - [ ] **用例 4（4 大离开规则）**：顺势突破确认三买/三卖、2s/2b 衰竭、极限反穿截断、新中枢新生，逐一验证封存；
  - [ ] **用例 5（Phase B）**：同向且 $[ZD, ZG]$ 重叠合并为延伸中枢；$[ZD, ZG]$ 无交集但 $[DD, GG]$ 有交集追加扩展大框；
  - [ ] **用例 6（彻底清场）**：断言生成的 `ChanBiChannel` 对象中无任何 `displayStartId` / `displayEndId` 字段。

#### 套件 3：段中枢（ChanDuanChannel & DuanStateMachine）7 大场景全景套件（`duan-channel.spec.ts`）
- **覆盖范围**：段中枢生命周期引擎、原典第 20 课恒定区间、7 大穷尽终结场景、级别升级；
- **TDD 先行用例设计**：
  - [ ] **用例 1（初生双重角色分支 A - 直接完满）**：输入 3 段走势，第 3 段向上突破并被第 4 段确立三买，断言：`duans.length === 1`（纯中间振荡段），`entryDuan = S0`，`leaveDuan = S2`，`type = Complete`，基线 3 段瞬间完满；
  - [ ] **用例 2（初生双重角色分支 B - 延伸吸纳）**：第 3 段未能突破或拉回，断言：`duans.length === 2`（`S1, S2` 均成为内部段），维持 `UnComplete`；
  - [ ] **用例 3（原典第 20 课恒定区间）**：连续吸纳 4、5、6 根内部段，断言：$[ZD, ZG]$ 恒定等于前 3 段锁定的交叠区间，绝对不发生动态收窄；
  - [ ] **用例 4（场景 1 与级别升级）**：内部段延伸达到 9 段，断言：`duans.length === 9`，`expanded === true`，`upgradedLevel === ChannelLevel.Macro`，而 `level === ChannelLevel.Duan` 保持不变！
  - [ ] **用例 5（场景 2 向上三买离开）**：$curr.high > ZG \land pullback.low > ZG$，断言：旧中枢在 $curr$ 处完满封存，`leaveDuan = curr`；
  - [ ] **用例 6（场景 3 向下三卖离开）**：$curr.low < ZD \land pullback.high < ZD$，断言：旧中枢向下完满封存，`leaveDuan = curr`；
  - [ ] **用例 7（场景 4 极值转折衰竭）**：冲破 $GG$ 后回踩未破 $ZD$，二次冲高未创新高（二卖），断言：在极值突破段处封存离开；
  - [ ] **用例 8（场景 5 极限反向贯穿）**：单段从上向下暴穿 $ZD$ 与 $DD$，断言：立即截断封存旧中枢，贯穿段不入内部；
  - [ ] **用例 9（场景 6 中枢新生强制闭合）**：后续走势在不重叠区间走出独立新 3 段核心，断言：旧中枢强制闭合，新中枢独立建立；
  - [ ] **用例 10（场景 7 数据尾部）**：走势在最新段未完结，断言：输出 `type: UnComplete`；
  - [ ] **用例 11（Phase B 扩展升级）**：两个相邻段中枢 $[ZD, ZG]$ 无重叠但 $[DD, GG]$ 有重叠，断言：生成大框，`expanded: true`，`upgradedLevel: ChannelLevel.Macro`，`level: ChannelLevel.Duan`。

#### 套件 4：买卖点与背驰双级别求值套件（`buy-sell-point.spec.ts`、`divergence.spec.ts`）
- **覆盖范围**：买卖点输出增加 `level`，背驰输出增加 `level`，彻底拔除历史 `slice` 补丁；
- **TDD 先行用例设计**：
  - [ ] **用例 1（笔级别 BSP/背驰）**：输入 `ChanBiChannel`，断言输出的买卖点与背驰对象中 `level === ChannelLevel.Bi`；
  - [ ] **用例 2（段级别 BSP/背驰）**：输入 `ChanDuanChannel`，断言输出的买卖点与背驰对象中 `level === ChannelLevel.Duan`；
  - [ ] **用例 3（直接进出对比）**：断言进出段直接使用 `entryBi vs leaveBi` / `entryDuan vs leaveDuan`，断言买卖点与背驰在无任何历史切片偏移补丁下计算精准。

#### 套件 5：前端绘图适配器与接口契约套件（`chan-visual.adapter.spec.ts`、`chan.controller.spec.ts`）
- **覆盖范围**：`ChanVisualAdapter` 绘图色块范围、REST API 端点；
- **TDD 先行用例设计**：
  - [ ] **用例 1（几何色块起止）**：断言中枢绘制矩形的起止坐标严格对齐 `units[0].startTime` 至 `units.at(-1).endTime`，绝无 `bis[1]` 或 `centralExitBi.startTime` 偏移补丁；
  - [ ] **用例 2（扩展标签渲染）**：当中枢带有 `upgradedLevel === ChannelLevel.Macro` 时，断言生成的指令中包含 `[高一级扩展]` 文本；
  - [ ] **用例 3（REST API 对称性）**：`POST /v1/chan/bi-channel` 与 `POST /v1/chan/duan-channel` 返回结构严格符合 VO 规范。

---

## 八、基于 TDD 红绿循环的 9 大原子推进步骤

```mermaid
flowchart TD
  S1[批次 1: contracts.ts 核心契约升级 (TDD)] --> S2[批次 2: channel-lifecycle.ts 状态机双轨重构 (TDD)]
  S2 --> S3[批次 3: 重构 bi-channel.ts 笔中枢 (TDD: 中间3笔+动态收窄)]
  S3 --> S4[批次 4: 重构 duan-channel.ts 段中枢 (TDD: 恒定区间+7大场景+升级)]
  S4 --> S5[批次 5: buy-sell-point 与 divergence 对齐 level 并拔除补丁 (TDD)]
  S5 --> S6[批次 6: backend apps/chan VO、Mapper 与 Controller 端点重命名 (TDD)]
  S6 --> S7[批次 7: visual-command 适配器与图层重构 (TDD)]
  S7 --> S8[批次 8: mist-fe 前端 types/client 彻底对齐为 IFetchBiChannel]
  S8 --> S9[批次 9: 全仓单元测试自动化回归与本地推演图表实盘核对]
```

### 具体批次与 TDD 红绿步骤

- **批次 1：`contracts.ts` 核心契约升级**
  - 【🔴 RED】编写契约类型与废弃字段检测单测，断言 `ChanBiChannel` / `ChanDuanChannel` 继承 `BaseChanChannel`，断言 `displayStartId / displayEndId` 不存在于类型上；
  - 【🟢 GREEN】更新 `libs/chancore/src/contracts.ts`，定义 `BaseChanChannel`，重命名 `ChanBiChannel`，加入 `upgradedLevel?: ChannelLevel`，彻底物理删除 `displayStartId / displayEndId`；
  - 【🔵 REFACTOR】编译并确认类型定义严格自洽。

- **批次 2：`channel-lifecycle.ts` 状态机双轨重构**
  - 【🔴 RED】编写 `channel-lifecycle.spec.ts`，先行测试 `BiStateMachine` 与 `DuanStateMachine` 不同的进入/内部构件计数与流转；
  - 【🟢 GREEN】实现 `BiStateMachine` 与 `BiChannelLifecycleEngine`，清理 `resolveChannelAnchorIds`；
  - 【🔵 REFACTOR】跑通生命周期状态机单测。

- **批次 3：重构 `bi-channel.ts` 笔中枢**
  - 【🔴 RED】重命名并编写 `bi-channel.spec.ts`，针对中间 3 笔纯内部振荡、动态收窄、解耦挂载 `entryBi/leaveBi` 编写失败用例；
  - 【🟢 GREEN】重命名 `libs/chancore/src/internal/bi-channel.ts` 并完成最小实现；
  - 【🔵 REFACTOR】拔除历史兼容代码，跑通套件 2 全部单测。

- **批次 4：重构 `duan-channel.ts` 段中枢**
  - 【🔴 RED】编写 `duan-channel.spec.ts`，覆盖初生双重角色分支、原典第 20 课恒定区间、7 大穷尽终结场景、9 段延伸升级与 Phase B 扩展大框；
  - 【🟢 GREEN】重构 `libs/chancore/src/internal/duan-channel.ts` 实现段中枢计算器；
  - 【🔵 REFACTOR】跑通套件 3 全部 11 个单测用例。

- **批次 5：买卖点与背驰双级别求值**
  - 【🔴 RED】编写 `buy-sell-point.spec.ts` 与 `divergence.spec.ts` 针对 `level: Bi` 与 `level: Duan` 的断言，以及无历史切片补丁的直接进出对比用例；
  - 【🟢 GREEN】重构买卖点与背驰计算逻辑，更新 `chan-core.ts` 门面（`createBiChannels`）；
  - 【🔵 REFACTOR】跑通套件 4 全部单测。

- **批次 6：后端 `apps/chan` VO、Mapper 与 Controller 端点重构**
  - 【🔴 RED】编写 `chan.controller.spec.ts`，测试 `POST /v1/chan/bi-channel` 与 `POST /v1/chan/duan-channel`；
  - 【🟢 GREEN】更新 `bi-channel.vo.ts`、`duan-channel.vo.ts`、`chan-core.mapper.ts` 与 Controller 端点；
  - 【🔵 REFACTOR】后端端点与 VO 映射全绿。

- **批次 7：绘图适配器 `chan-visual.adapter.ts` 重构**
  - 【🔴 RED】编写 `chan-visual.adapter.spec.ts`，断言色块起止时间严格取 `units[0].startTime` 至 `units.at(-1).endTime`，图层 `chan_bsp_bi` 与 `chan_bsp_duan`；
  - 【🟢 GREEN】重构适配器，彻底拔除所有 `bis[1]` 与 `centralExitBi.startTime` 偏移补丁；
  - 【🔵 REFACTOR】跑通套件 5 适配器单测。

- **批次 8：前端 `mist-fe` 契约与客户端对齐**
  - 【🔴 RED】TypeScript 编译检查，精准捕获前端旧 `IFetchChannel` / `fetchChannel` 引用处报错；
  - 【🟢 GREEN】重命名并更新 `mist-fe/app/api/types.ts` 与 `client.ts`；
  - 【🔵 REFACTOR】前端构建与类型检查通过。

- **批次 9：全仓自动化回归与实盘核对**
  - 【🟢 ALL GREEN】运行全仓单元测试流水线：`pnpm test libs/chancore`、`libs/visual-command`、`apps/chan`、`libs/strategy`；
  - 【👀 VISUAL CHECK】在本地前端 `http://localhost:3000/backtests` 上实盘核对 5m、30m 和日线图表，验证笔中枢、段中枢几何色块与买卖点标记。
