# Proposal: Support External Factor Plugins & Isolate Proprietary Strategies

## 1. 背景与问题 (Background & Problem)

1. **专有策略与心法泄漏风险**：
   - 目前主仓库 `mist/libs/strategy/src/tactics/` 遗留了非标准的实验性战术接口与耦合代码；
   - 将特定策略逻辑与划分方式暴露在公开代码库中，破坏了公共量化底座的中立性；
   - 商业级量化系统要求公开核心底座保持纯净中立，各类专有策略必须 100% 物理隔离在独立私有仓库中。
2. **缺乏通用的外部插件发现与挂载机制**：
   - 目前求值内核的因子插件通过 `standard-plugins.ts` 静态注册；
   - 缺少对外部独立插件的动态反射发现机制，导致外部私有插件无法在不污染公仓代码的前提下优雅挂载。

## 2. 解决方案概述 (Proposed Solution)

1. **公开主仓彻底清理遗留战术代码**：
   - 彻底删除 `mist/libs/strategy/src/tactics/` 目录及其内部所有文件；
   - 公开主仓中不保留任何特定策略心法或战术概念，保持公共量化底座的标准纯粹性。
2. **实现通用的外部因子插件加载机制 (`ExternalFactorPluginLoader`)**：
   - 在 `libs/strategy/src/factor/` 中实现通用的外部插件加载器；
   - 面向公共标准契约 `FactorPlugin`（`id`, `name`, `category`, `evaluate(context, params)`）动态加载外部插件；
   - 探测外部路径（环境变量 `MIST_PRIVATE_PLUGINS_DIR` 或平级目录 `../external-plugins`）；
   - 在外部插件不存在时（开源环境/公共 CI），平滑降级，零报错。
3. **专有策略完整收敛于独立私有仓 (`external-plugins`)**：
   - 专有策略的所有架构设计、买卖点划分逻辑与核心算法全部移入平级独立私有仓；
   - 私有仓自行实现其专有逻辑，并封装导出标准的 `FactorPlugin` 供公共引擎反射加载。
4. **CI 架构防泄漏门禁**：
   - 新增 AST 静态扫描门禁，断言主仓中不存在任何私有路径引用与专有策略泄漏。
