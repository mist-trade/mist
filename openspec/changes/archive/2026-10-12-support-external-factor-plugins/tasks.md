# Tasks: Support External Factor Plugins & Isolate Proprietary Strategies

## 1. 清理公开主仓专有遗留代码 (`libs/strategy/src/tactics/`)
- [x] 1.1 彻底删除 `mist/libs/strategy/src/tactics/` 目录及其下属全部文件
- [x] 1.2 清理 `simulation/standard-simulation-flows.ts` 中对旧战术文件的假冒引用与冗余代码
- [x] 1.3 移除 `decision-flow/legacy-strategy-compiler.ts` 中的 `minConfidence: 0.7` 硬编码

## 2. 通用外部因子插件动态加载器 (`libs/strategy/src/factor/`)
- [x] 2.1 新建 `libs/strategy/src/factor/external-plugin-loader.ts`：
  - 实现通用探测逻辑（优先级：`process.env.MIST_PRIVATE_PLUGINS_DIR` -> `../external-plugins`）
  - 动态 import 并提取导出的 `FactorPlugin` 实例，提供安全容错与类型校验
  - 在无外部插件时平滑降级，零报错
- [x] 2.2 在 `libs/strategy/src/factor/standard-plugins.ts` 中集成外部插件自动发现与注册
- [x] 2.3 在 `libs/strategy/src/strategy-boundary.guard.spec.ts` 中针对 `external-plugin-loader.ts` 的环境变量探测配置合法白名单豁免

## 3. 私有专有仓多插件骨架与导出规范 (`external-plugins/`)
- [x] 3.1 整理平级独立私有仓 `external-plugins/` 目录结构、`package.json` 与 `tsconfig.json`
- [x] 3.2 搭建可扩展的多插件骨架目录结构（`src/plugins/`），仅构建符合 `FactorPlugin` 契约的标准空壳/骨架（Stub），不写入任何未确认的具体算法
- [x] 3.3 在私有仓入口 `src/index.ts` 中实现批量导出规范（`export const plugins: readonly FactorPlugin[] = [...]`），支持加载器自动遍历挂载多个独立私有插件

## 4. 架构防泄漏门禁与质量回归验证
- [x] 4.1 新建 `libs/strategy/src/factor/external-isolation.guard.spec.ts`：
  - 静态扫描全仓 TypeScript 文件，断言零包含私有路径或私有插件名的静态 import
  - 断言 Git Index 中不存在任何私有代码文件
  - 断言在外部私有模块不存在时，公共主仓单测与推演 100% 独立正常运行
- [x] 4.2 运行 `@app/chancore` 全量单元测试，确认纯数学底座保持原生绿色
- [x] 4.3 运行三大架构刚性门禁测试 (`dev-server-boundary`, `homogeneity`, `dual-timestamp`)
- [x] 4.4 运行全局工程检查：`check:magic`、`typecheck` 与 `test:ci` 全绿通过
