## Why

Phase A 目前把候选笔拆分到 `confirmed` 与 `pending` 两个数组。较新的时间段可能已经进入
`confirmed`，较旧的分支却仍留在 `pending`；随后取栈尾时又优先选择 `pending`，从而跳过
中间已经确认的笔。完整沪深300快照已经复现：算法生成 `206 -> 302 up(valid)`，同时保留
其内部八条 valid 笔。

Phase B 已负责消化 Phase A 遗留的多笔 invalid 区间，因此 Phase A 可以改成严格按时间排列
的单栈，并把自己的“连续三笔”规则反复执行到局部固定点。为了保持算法边界清楚，新的
Phase A 也应像 Phase B 一样先作为独立纯算法文件验证，再接入 `BiService`。

## What Changes

- 新增单文件纯算法 `bi-phase-a-time-stack.helper.ts`，不依赖 NestJS，也不直接依赖行情数据。
- helper 通过 operations 回调复用现有三笔合并、合并产物构造和 valid 判定原语。
- 候选笔按时间压入一个栈；每次入栈后反复归约栈顶三笔，直到不足三笔、三笔全 valid，或
  当前三笔无法合并。
- 候选入栈前和三笔合并前都校验共享 `middleIndex` 边界，禁止跨越已经存在的时间区间。
- 每次合并后重新判定 valid/invalid，并立即重新检查新的栈顶三笔。
- 无法归约的 valid、invalid 全部原位保留，作为完整有序输入交给 Phase B。
- 先独立验证 Phase A helper；通过后再由 `BiService` 组合 Phase A helper 与现有 Phase B
  helper，两个算法文件继续保持分离。
- 增加完整沪深300与完整上证指数真实快照回归，同时保留上证指数现有两个裁剪场景的 6 个
  Phase B 测试。
- 删除双数组来源标记、跨数组取尾、来源相关弹栈以及最终排序逻辑。
- 保持 `{ phaseA, phaseB }` 公共结构、HTTP 返回和 Channel 使用 Phase B 的行为不变。

## Capabilities

### New Capabilities

- `chan-bi-phase-a-reduction`：定义 Phase A 独立纯算法边界、单时间栈、栈顶三笔循环归约、
  与 Phase B 的分阶段集成，以及完整沪深300和上证指数回归要求。

### Modified Capabilities

无。

## Impact

- 后端新增 `apps/mist/src/chan/services/bi-phase-a-time-stack.helper.ts` 及其独立测试。
- `apps/mist/src/chan/services/bi.service.ts` 在 helper 独立验证后进行集成和双数组代码清理。
- 后端新增完整沪深300（388 根合并 K）与完整上证指数（386 根合并 K）测试数据。
- 后端通过后需要重新生成 `mist-fe` 的 Phase A/Phase B 快照，但不修改前端 API 或渲染协议。
- 不新增运行时依赖、开关、数据库变更或 HTTP 字段。
