# Design: Generic External Factor Plugin Loader & Proprietary IP Isolation

## 1. 架构拓扑 (Architecture Topology)

公开主仓与私有专有仓严格遵循单向解耦与动态发现架构：

```
/Users/moyui/sean/mist/                     <-- 多仓库工作区
├── mist/                                  <-- 【Public 开源主仓】(完全中立的量化计算底座)
│   ├── libs/chancore/                     <-- 纯数学原典实现
│   └── libs/strategy/src/factor/
│       ├── factor.types.ts                <-- 通用 FactorPlugin 标准契约
│       ├── external-plugin-loader.ts      <-- 通用外部插件动态加载器
│       ├── factor-plugin-registry.ts      <-- 因子插件注册表
│       └── external-isolation.guard.spec.ts<-- 架构防泄漏门禁
│
└── mist-alpha-private/                    <-- 【Private 独立私有仓】(与 mist 平级，专有策略)
    ├── .git/
    └── src/
        ├── index.ts                       <-- 导出私有 FactorPlugin[] 数组
        └── ...                            <-- 私有仓内部专有交易模型与算法
```

---

## 2. 核心设计规范 (Core Design Specifications)

### 2.1 公开主仓零专有概念 (Zero Proprietary Concepts in Public Repo)
* 删除 `mist/libs/strategy/src/tactics/` 目录及其内部的全部文件；
* 主仓不定义任何个人买卖点划分心法或专有交易战术；
* 主仓与外部插件交互的唯一契约是已有的标准抽象契约 `FactorPlugin`：
  ```typescript
  export interface FactorPlugin {
    readonly id: string;
    readonly name: string;
    readonly category: string;
    readonly paramSchema?: FactorPluginParamSchema;
    evaluate(context: FactorContext, params?: Record<string, unknown>): Promise<FactorOpinion>;
  }
  ```

### 2.2 通用外部多插件加载器 (`ExternalFactorPluginLoader`)
* 文件位置：`libs/strategy/src/factor/external-plugin-loader.ts`
* 职责：负责在运行时发现并向 `FactorPluginRegistry` 批量注册外部私有因子插件。
* 探测优先级链：
  1. 环境变量：`process.env.MIST_PRIVATE_PLUGINS_DIR` 或 `process.env.MIST_PRIVATE_PLUGINS_PATH`；
  2. 工作区平级目录：`../mist-alpha-private`；
  3. 未探测到或加载失败时：安全降级，不中断主进程，控制台输出调试日志。
* 批量多插件识别机制：
  - 支持私有仓同时存在任意多个 Plugin；
  - 自动识别以下导出形式：
    1. `module.plugins`: `readonly FactorPlugin[]` 数组（批量注册每一个插件）；
    2. `module.getPlugins()`: 返回 `FactorPlugin[]` 的工厂函数；
    3. 具名或默认导出的单一 `FactorPlugin` 实例；
  - 自动完成类型校验（`isFactorPlugin(obj)`），合法实例统一以其 `plugin.id` 注册进策略树内核。

### 2.3 私有专有仓骨架与导出规范 (`mist-alpha-private`)
* **仅搭建纯净骨架原则（Shell-Only Skeleton）**：
  - 本次变更**绝不私自实现任何未定论的具体交易算法或假想规则**；
  - 私有仓仅搭建符合 `FactorPlugin` 契约的标准可编译插件骨架（Stub），内部逻辑留白，供后续独立评估与编写；
* **多插件目录结构示例**：
  ```
  mist-alpha-private/
  ├── src/
  │   ├── plugins/          <-- 存放任意多个私有插件骨架
  │   └── index.ts          <-- 统一导出 plugins 数组
  ├── package.json
  └── tsconfig.json
  ```
* 入口文件（`src/index.ts`）标准导出：
  ```typescript
  export const plugins: readonly FactorPlugin[] = [
    // 注册私有插件骨架实例
  ];
  ```

---

## 3. 防泄漏与同构保障 (Guardrails & Parity)

1. **AST 静态扫描门禁 (`external-isolation.guard.spec.ts`)**：
   - 静态遍历 `mist` 仓库内所有 TypeScript 源码文件；
   - 断言不存在任何包含 `mist-alpha-private` 或指向私有目录的静态 `import` 或 `export`；
   - 扫描 Git Index，断言私有代码文件未被暂存或追踪。
2. **开源环境独立构建与回归**：
   - 在私有目录被移除或禁用的状态下，`mist` 的 `build`、`typecheck` 与 `test:ci` 必须 100% 独立绿灯通过。
