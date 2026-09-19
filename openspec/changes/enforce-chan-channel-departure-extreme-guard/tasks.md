# Tasks: enforce-chan-channel-departure-extreme-guard

- [x] 1. 编写 OpenSpec spec delta 规范与契约定义
  - [x] 1.1 在 `openspec/changes/enforce-chan-channel-departure-extreme-guard/specs/chan-channel-departure-guard/spec.md` 中编写规格
- [x] 2. 编写单元测试与回归用例
  - [x] 2.1 在 `libs/chancore/src/internal/channel-departure-rules.spec.ts` 中增加无 3 买且未破 GG/DD 禁止作为离开笔的单元测试
  - [x] 2.2 在 `libs/chancore/src/internal/channel-departure-closure.spec.ts` 中增加 30 分钟笔中枢遭遇日线下跌笔的典型走势防跨越测试
- [x] 3. 核心实现与状态机重构 (`libs/chancore`)
  - [x] 3.1 修正 `libs/chancore/src/internal/channel-lifecycle.ts` 中 `shouldSealAtEnd` 与离开封存门禁
  - [x] 3.2 优化 `canAbsorbExtension` 与断裂脱离收口逻辑，杜绝向日线下跌笔非法吸纳
- [x] 4. 验证与回归保证
  - [x] 4.1 确保 5 分钟全量锁定用例（用例 1～6 及前 5 个锁定门禁）完全通过
  - [x] 4.2 确保 chancore 全量单元测试全部通过
