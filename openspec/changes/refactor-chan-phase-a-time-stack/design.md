## Context（背景）

当前 `BiService` 使用 `confirmed` 和 `pending` 两个数组处理 Phase A 候选笔，最终再将两个
数组拼接并按开始时间排序。这个状态模型允许较新的时间区间进入 `confirmed`，同时保留一个
更早的 `pending` 分支。由于取最后两笔时优先读取 `pending`，后续合并可能跳过时间上更新的
`confirmed` 区间。

完整沪深300快照中的关键错误发生在候选 step 126：`206 -> 222 up(valid)` 仍在 pending，
完整的 `222 -> 282` 已经进入 confirmed；算法却选择 `206 -> 222`、`282 -> 283`、
`283 -> 287` 作为三笔，最终扩张成 `206 -> 302 up(valid)`，内部八条 valid 笔仍然保留。

Phase B 已经以独立纯算法文件 `bi-phase-b-merge.helper.ts` 实现变长区间归约。Phase A 采用
同样的文件与回调边界，可以先独立证明单栈算法正确，再让 `BiService` 只负责组装两个阶段。

## Goals / Non-Goals（目标与非目标）

**目标：**

- 新增一个无 NestJS 依赖的 Phase A 单文件纯算法。
- 使用一个严格连续的时间栈替代 `confirmed`/`pending` 双数组。
- 每次候选入栈后，把连续栈顶三笔反复归约到局部固定点。
- 无法合并的 valid、invalid 保持原有时间位置，完整交给 Phase B。
- 把时间顺序和索引连续性变成构造不变量，而不是最终排序修补。
- 先完成 helper 独立测试，再接入 `BiService`，最后联合验证 Phase A 与 Phase B。
- 使用完整沪深300和完整上证指数建立真实数据回归。

**非目标：**

- 不修改 `canMergeThreeBis`、`canMergeTwoBis`、分型检测、宽笔判定和区间统计规则。
- 不重写 Phase B，也不在本 change 判断 Phase B 剩余长笔是否符合业务语义。
- 不引入运行时开关，也不保留双数组算法作为备用路径。
- 不修改 HTTP 返回结构或前端 Phase A/Phase B 选择器。

## Decisions（技术决策）

### 1. Phase A 使用独立纯算法单文件

新增文件：

```text
apps/mist/src/chan/services/bi-phase-a-time-stack.helper.ts
```

建议导出边界：

```typescript
export interface PhaseATimeStackOperations {
  canMergeThreeBis(first: BiVo, middle: BiVo, third: BiVo): boolean;
  mergeThreeBis(first: BiVo, third: BiVo): BiVo;
  isCandidateBiValid(bi: BiVo): boolean;
}

export function reducePhaseATimeStack(
  candidates: readonly BiVo[],
  operations: PhaseATimeStackOperations,
): BiVo[];
```

helper 只依赖 `BiVo` 与状态枚举，不依赖 `BiService`、NestJS 或合并 K 数据。`BiService` 通过
箭头函数回调复用现有私有原语，并由闭包把 `data` 传给 `mergeThreeBis`。helper 克隆输入，
不得修改候选数组或候选对象。

选择 operations 回调而不是把 Phase A 留在 `BiService` 内，是为了与 Phase B 保持相同架构，
同时允许独立测试时间栈状态转换。把 Phase A 和 Phase B 合并到同一 helper 被否决，因为两者
归约规则与固定点范围不同。

### 2. 单时间栈保持严格连续

候选笔按分型时间顺序进入一个 `BiVo[]`。候选入栈前，helper 校验：

```text
stack.last.endFenxing.middleIndex == candidate.startFenxing.middleIndex
```

任意相邻 Complete Bi 必须共享同一边界。合并成功时，只用栈顶三笔的首个起点和第三笔终点
构造替换项，因此替换后仍保留相同外边界。

这使 `BiSourceTag`、跨数组取尾、来源相关删除以及最终按时间排序全部失去必要性。

### 3. 栈顶三笔循环归约到局部固定点

每条候选入栈后执行：

```text
while 栈内至少有三笔:
  读取栈顶 bi1、bi2、bi3
  复核 bi1.end == bi2.start 且 bi2.end == bi3.start
  如果三笔全 valid：停止
  如果 canMergeThreeBis 返回 false：停止
  用 mergeThreeBis 合并三笔
  重新判定合并产物 valid/invalid
  用合并产物替换栈顶三笔
  继续检查新的栈顶三笔
```

每次成功归约把三笔变成一笔，栈长度减少 2，所以算法自然终止，不需要 `maxIterations`。

“每条候选最多归约一次”的方案被否决，因为它可能仅仅由于输入在此结束，就把 Phase A 自己
仍能处理的三笔留给 Phase B。循环归约能保证 Phase A 输出已经达到其三笔规则的局部固定点。

### 4. 连续性在入栈和合并两个边界校验

只在合并前校验还不够：栈不足三笔或栈顶三笔全 valid 时不会进入合并分支。因此 helper 必须：

1. 候选入栈前校验它与当前栈尾连续；
2. 三笔合并前再次复核两个共享边界。

任何不连续都属于内部不变量错误，错误信息必须包含冲突索引范围；不得静默接受、跨区间合并
或依靠排序修复。这从结构上阻止沪深300的 `206 -> 222` 跨过 `222 -> 282`。

### 5. 每次合并都重新判定状态

`mergeThreeBis` 继续返回 Unknown 状态。helper 使用 `isCandidateBiValid` 把合并产物重新标记为
Valid 或 Invalid，再决定是否继续下一轮栈顶归约。重新产生的 Invalid 可以继续参与归约。

### 6. 先独立验证 Phase A helper，再集成两个阶段

实施顺序固定为：

```text
Phase A helper 红灯单测
        ↓
实现并让 Phase A helper 独立测试通过
        ↓
保持 BiService 旧路径不变，确认 helper 本身稳定
        ↓
BiService 接入 reducePhaseATimeStack
        ↓
BiService 将 Phase A 输出交给 mergeBiSegments
        ↓
运行完整真实数据与 Channel 联合回归
```

最终 `BiService.getBi` 只组合两个独立算法文件：

```typescript
const phaseA = buildFinalUncompleteBi(
  reducePhaseATimeStack(candidates, phaseAOperations),
  data,
);
const phaseB = mergeBiSegments(phaseA, phaseBOperations);
```

两个 helper 不互相导入，也不合并成一个文件。

### 7. 完整沪深300与上证指数作为真实数据边界

后端测试目录各保存一份完整、可独立运行的真实合并 K 输入，不在运行时依赖 `mist-fe`：

- 沪深300 2024-2025：388 根合并 K；
- 上证指数 2024-2025：386 根合并 K。

沪深300首先用于证明旧实现的 8 对 valid 重叠以及 `206 -> 302`/`222 -> 228` 见证；修复后
要求 Complete Bi 连续、valid 无重叠、不存在仍可按 Phase A 规则归约的相邻三笔。

完整上证指数只读模拟结果为：

| 阶段 | 笔数 | 关键结构 |
|---|---:|---|
| 单栈 Phase A | 35 | `142 -> 146 down(invalid)`；`266 -> 317 up(valid)` |
| 现有 Phase B | 25 | `142 -> 195 down(valid)`；`266 -> 317 up(valid)` |

此外继续保留现有两个上证指数裁剪场景的 6 个 Phase B 测试，防止完整快照只验证总体数量却遗漏
国庆跳空与 2025 年 5–8 月震荡两个核心规则。

## Risks / Trade-offs（风险与权衡）

- **[风险] Phase A 输出数量会明显变化。** → 后端结构测试通过后再刷新前端快照，并逐项审核
  沪深300、上证指数、创业板和贵州茅台的 Phase A/Phase B 数量。
- **[风险] Phase A 与 Phase B 在部分输入上结果相同。** → 若 Phase A 已清除所有可归约三笔，
  阶段相同是合法结果，不为展示差异增加人为停止条件。
- **[风险] 两份完整真实快照增加仓库体积。** → 每个数据集只保存一份规范 fixture，并共享加载
  与结构断言 helper。
- **[风险] 不变量异常可能暴露新的候选连续性问题。** → 用包含索引的明确错误快速失败，不返回
  被污染的结构。
- **[风险] Phase B 仍可能生成结构连续但跨度较长的笔。** → 作为后续独立 change 评估，本次不
  修改 Phase B 规则。

## Migration Plan（实施与回退）

1. 加入完整沪深300和上证指数 fixture，确认沪深300在旧实现下按预期红灯。
2. 为 Phase A helper 添加纯单元测试并实现 helper，不改 `BiService` 生产路径。
3. helper 独立验证通过后，接入 `BiService` 并删除双数组逻辑。
4. 运行完整沪深300、完整上证指数、原上证两个裁剪场景及 Channel 联合回归。
5. 后端全量验证通过后，重新生成 `mist-fe` 快照并检查 `/chan-tests`。

Phase A helper、`BiService` 集成和前端快照刷新保持可独立回退。Phase B helper 不在本次修改。

## Open Questions（待确认问题）

无。Phase B 剩余长笔语义明确推迟到后续 change。
