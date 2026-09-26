# 本地策略 Dev 极速研发与前后端可视化闭环设计方案

> **状态**：设计就绪 (Design Ready)  
> **适用范围**：`mist` (主后端/算法/策略)、`mist-fe` (前端工作台)  
> **核心目标**：彻底解决「每次改缠论策略都必须部署到 Windows Box 重新建策略」的笨重闭环，将策略调优耗时从 **15分钟** 压缩至 **150毫秒**，实现「数据离线持久化 + 私有法宝热重载 + TradingView 前端秒级验证 + 存量测试金样回归」的完整闭环。

---

## 一、背景痛点与设计原则

### 1.1 现状与痛点
- **远端依赖过重**：策略目前强依赖 `apps/signal`、`apps/backtest`、MySQL 数据库实体表（`strategy_definitions`, `strategy_versions`）、Redis 72h 桶和 BullMQ 队列。
- **调参验证缓慢**：日常研发中只需调整 `my-secret-tactics.ts` 里的底分型过滤、次级别 MACD 穿越门禁或中枢数量，就必须经历：提交代码 ➔ 打包 Docker 镜像 ➔ 部署到 Windows Box ➔ 重启容器 ➔ 发起回测/等实盘 tick ➔ 查数据库。单次往返 5~15 分钟，严重制约量化策略迭代。
- **前期资产碎片化**：
  - 几何算法期在 `mist-fe/__fixtures__` 沉淀了 5 组黄金 K 线快照（茅台、上证、创业板等）与 `tools/export-chan-bi-phases.cjs` 离线计算脚本，但**仅覆盖几何图形，没有策略买卖点抽象**；
  - 生产期在 `mist-deploy` 跑通了成熟的 `ssh mist-box` 免密取数机制，但**仅用于运维巡检与审计，未开放给日常开发**。

### 1.2 核心设计原则
1. **轻重解耦**：重型集群留在远端作为生产托管，纯算力（Rust `nodejs-polars`、`@app/chancore`、`DynamicTacticsLoader`）全部在本地原生执行；
2. **存量兼容与资产盘活**：100% 吸收复用前期的 5 套黄金基线数据与回归测试体系，支持「无网时跑存量快照，连网时同步最新生产数据」；
3. **前后端标准化契约串联**：前端 `mist-fe` 零代码侵入，通过本地轻量 Dev API Server 模拟生产协议，直接在 TradingView 画布上呈现本地策略的实时买卖点图钉与归因抽屉；
4. **物理级安全隔离**：本地 `.data/` 离线缓存与 `private/` 私有交易法宝受 `.gitignore` 严格保护，杜绝任何数据与独门战术泄露风险。

---

## 二、架构全景与调用链路

```
 ┌───────────────────────────────────────────────────────────────┐
 │ 远端 Windows API Box (192.168.31.182 / ssh mist-box)           │
 │ 包含真实的 A 股全量 K 线 (mist-mysql 容器)                       │
 └───────────────────────────────┬───────────────────────────────┘
                                 │ ① 增量取数 (SSH 免密管道)
                                 │   pnpm dev:sync --code 600519 --periods 1d,30m,5m
                                 ▼
 ┌───────────────────────────────────────────────────────────────┐
 │ 统一数据提供层 (Unified K-Line Data Provider)                  │
 │ ┌───────────────────────────┐   ┌───────────────────────────┐ │
 │ │ Mode A: 存量黄金快照用例   │   │ Mode B: 本地增量缓存      │ │
 │ │ (__fixtures__/snapshots/) │   │ (.data/kline/*.json)      │ │
 │ └─────────────┬─────────────┘   └─────────────┬─────────────┘ │
 └───────────────┼───────────────────────────────┼───────────────┘
                 │ 统一标准化为 ChanK[]           │
                 ▼                               ▼
 ┌───────────────────────────────────────────────────────────────┐
 │ 本地核心算力层 (Local Core Engine)                             │
 │  - @app/chancore (Rust nodejs-polars 向量底座)                │
 │  - libs/strategy/DynamicTacticsLoader                         │
 │  - libs/strategy/src/tactics/private/my-secret-tactics.ts     │
 └───────────────┬───────────────────────────────┬───────────────┘
                 │                               │
                 │ ② 终端纯净调参                 │ ③ 前端联调 (HTTP 8001)
                 ▼                               ▼
 ┌──────────────────────────────┐ ┌──────────────────────────────┐
 │ tools/dev-strategy-runner.ts │ │ tools/dev-server.ts          │
 │ - 滚动时序买卖点回测         │ │ 标准契约端点：               │
 │ - 胜率 / 盈亏比 / 回撤统计   │ │  - POST /v1/indicators/k     │
 │ - ASCII 信号明细表格         │ │  - GET  /v1/visual/commands  │
 │ - tsx watch 秒级热更新 (<150ms)│ │  - GET  /v1/strategy-backtests │
 └──────────────────────────────┘ └──────────────┬───────────────┘
                                                 │
                                                 ▼
                                  ┌──────────────────────────────┐
                                  │ mist-fe 前端工程 (port 3000) │
                                  │ - TradingView 原生 K 线图     │
                                  │ - 笔/段/中枢动态覆盖         │
                                  │ - 策略买卖点图钉与归因抽屉   │
                                  │ - chan-tests 算法回归比对    │
                                  └──────────────────────────────┘
```

---

## 三、存量数据与存量测试的无缝接入方案

你特别关心的**「残留数据和测试如何接入」**，通过以下三步彻底融为一体：

### 3.1 数据层融合：统一 K 线提供器 (`UnifiedKLineProvider`)
目前系统存在两类数据源：
1. **存量静态黄金快照**：位于 `mist-fe/__fixtures__/snapshots/chan/`（包含茅台 `maotai-2024-2026`、上证指数 `shanghai-index-2024-2025` 等 5 个经典历史走势）；
2. **增量生产实时数据**：通过 `ssh mist-box` 动态从 MySQL 拉取的最新数据（存储在 `mist/.data/kline/<symbol>_<period>.json`）。

**接入设计**：设计统一数据适配器，自动感知并兼容两种格式：
```typescript
export interface KLineLoadOptions {
  caseKey?: string;   // 优先使用存量快照：如 'maotai-2024-2026'
  code?: string;      // 或使用指定代码：如 '600519'
  period?: string | number; // '1d', '30m', '5m'
}

export function loadCanonicalKlines(options: KLineLoadOptions): ChanK[] {
  // 1. 如果指定了 caseKey，直接定位到 mist-fe 现存快照 k.json
  if (options.caseKey) {
    const fixturePath = path.resolve(REPO_ROOT, `../mist-fe/__fixtures__/snapshots/chan/${options.caseKey}/k.json`);
    if (fs.existsSync(fixturePath)) {
      return normalizeFixtureKlines(JSON.parse(fs.readFileSync(fixturePath, 'utf-8')));
    }
  }

  // 2. 否则从本地 .data/kline/ 缓存加载
  const cachePath = path.resolve(REPO_ROOT, `.data/kline/${options.code}_${options.period}.json`);
  if (fs.existsSync(cachePath)) {
    return normalizeCacheKlines(JSON.parse(fs.readFileSync(cachePath, 'utf-8')));
  }

  throw new Error(`数据未找到，请先拉取或指定已有快照。`);
}
```
**收益**：即使开发机器完全断网或离开局域网，直接使用存量的茅台和上证快照即可立即开工调参。

### 3.2 存量离线工具盘活：升级 `export-chan-bi-phases.cjs` 等脚本
- **现状**：`mist/tools/` 留存了 `export-chan-bi-phases.cjs` 与 `export-chan-channel-phases.cjs`，它们曾用于几何形态两阶段归约导出。
- **接入**：
  1. 将其纳入统一脚本治理体系，升级其底层调用现代 `@app/chancore`（Rust 向量引擎）；
  2. 保留原有输入输出格式，确保 `mist-fe/scripts/generate-snapshots.mjs` 中的 `--bi-from-merge-k` 离线模式继续可用。

### 3.3 存量回归测试升级：策略防退化黄金基线（Regression Guard）
- **现状**：前端现有的 `shanghai-phase-fixture.test.ts` 只能断言笔的数量（如 Phase A=33 笔，Phase B=27 笔）。
- **接入**：
  - 基于已有的 5 套黄金走势快照，增加策略层回归测试套件 `test/tactics-regression.spec.ts`；
  - 对经典走势下的买卖点输出建立黄金断言（例如：茅台 2024-2026 在特定底背驰位置**必须且只能**触发一次 LeftBuy）；
  - **研发收益**：当你优化战术逻辑时，运行 `pnpm test:tactics` 能在 1 秒内确保本次修改**没有在历史经典用例上引起策略退化（Regression）**。

---

## 四、前后端串联在 `mist-fe` 验证方案

### 4.1 为什么要轻量 Dev Server？
如果让 `mist-fe` 直接读本地文件，会打破 `mist` 和 `mist-fe` 现有的独立仓库边界。最优雅的方式是在 `mist/tools/dev-server.ts` 启动一个极轻量的 HTTP 代理服务（占用端口 8001），复用 `mist-fe` 现有的所有接口路由：

| 前端请求路由 | `dev-server.ts` 响应行为 | 数据源 / 计算源 |
|---|---|---|
| `POST /api/mist/v1/indicators/k` | 返回指定标的与周期的 K 线数组 | 读取本地 `.data/kline/` 或 `__fixtures__/` |
| `GET /api/mist/v1/visual/commands` | 返回折线（笔/段）、矩形（中枢）及买卖点图钉 | 调用 `@app/chancore` + `DynamicTacticsLoader` 现算 |
| `GET /api/mist/v1/strategy-backtests/runs` | 返回虚拟本地运行任务列表 | 内存构造单个虚拟任务 `Local Dev Live Run` |
| `GET /api/mist/v1/strategy-backtests/runs/:id/signals` | 返回策略触发的买卖点清单与归因细节 | 策略判决收集的信号明细 |

### 4.2 前端联调步骤
1. **启动后端 Dev Server**：
   ```bash
   # 在 mist 目录
   pnpm dev:server
   ```
2. **启动前端工作台**：
   ```bash
   # 在 mist-fe 目录
   pnpm dev:local
   ```
   *（内部透传环境变量 `MIST_API_PROXY_TARGET=http://localhost:8001`）*
3. **在浏览器中验证**：
   - 打开 `http://localhost:3000/backtests`；
   - 页面直接渲染本地数据生成的 TradingView 原生 K 线；
   - 黄色笔折线、洋红色线段、笔中枢阴影与策略的 `▲ 一买`、`▲ 二买`、`▼ 一卖` 标签完全融合展示；
   - 点击买卖点图钉，右侧滑出抽屉，实时显示该点的 MACD 能量面积、背驰比例、置信度与触发理由。

---

## 五、目录组织与文件位置规范

经过对多仓工作区现状的审计，规范后的文件结构如下：

```text
/Users/moyui/sean/mist/
├── mist/                                    # 主后端 / 算力与策略仓
│   ├── .data/                               # [新建] 本地离线持久化数据 (Git 严格忽略)
│   │   └── kline/
│   │       ├── 600519_1d.json               # 茅台日线离线缓存
│   │       ├── 600519_30m.json              # 茅台30分钟离线缓存
│   │       └── 600519_5m.json               # 茅台5分钟离线缓存
│   ├── libs/strategy/
│   │   └── src/tactics/
│   │       ├── contracts/                   # 公共战术四象限接口 (已存在)
│   │       ├── default/                     # 开源标准战术实现 (已存在)
│   │       ├── private/                     # 个人独门交易法宝 (已存在，Git 严格忽略)
│   │       │   └── my-secret-tactics.ts     # 核心调参文件
│   │       └── dynamic-tactics-loader.ts    # 动态加载器 (已存在)
│   ├── tools/
│   │   ├── dev-sync-data.ts                 # [新建] SSH 管道取数工具
│   │   ├── dev-strategy-runner.ts           # [新建] 纯终端极速调参与模拟撮合运行器
│   │   ├── dev-server.ts                    # [新建] 对接 mist-fe 的极简 Dev API 服务
│   │   ├── export-chan-bi-phases.cjs        # [保留/升级] 存量笔归约导出工具
│   │   └── export-chan-channel-phases.cjs   # [保留/升级] 存量中枢归约导出工具
│   └── package.json                         # 注册快捷命令 (dev:sync, dev:strategy, dev:server)
│
└── mist-fe/                                 # 前端仓
    ├── __fixtures__/                        # 存量黄金快照库 (完全保留并作为离线基线)
    │   ├── cases/                           # 经典用例声明 (茅台、上证指数等)
    │   └── snapshots/chan/                  # 存量黄金 JSON 数据
    ├── app/
    │   ├── backtests/                       # 现有回测工作台 (TradingView 图表驱动)
    │   └── chan-tests/                      # 现有算法回归测试台 (保留用于形态回归)
    └── package.json                         # 新增 "dev:local": "cross-env MIST_API_PROXY_TARGET=http://localhost:8001 next dev"
```

---

## 六、实施步骤与分工

| 序号 | 任务模块 | 核心工作内容 | 验证指标 |
|---|---|---|---|
| **Step 1** | **Git 规则加固** | 在 `mist/.gitignore` 中追加 `.data/` 与 `*.kline.json` | `git status` 确认本地数据不入库 |
| **Step 2** | **取数与适配层** | 编写 `mist/tools/dev-sync-data.ts`，支持 `--code`、`--periods` 并自动解析为 `ChanK[]` | 执行同步命令 3 秒内抓取 2000 根数据落盘 |
| **Step 3** | **统一适配器** | 编写数据加载逻辑，同时兼容 `__fixtures__` 存量用例与本地 `.data/` 缓存 | 能够免连网直接跑 `maotai-2024-2026` 存量用例 |
| **Step 4** | **终端 Dev 引擎** | 编写 `mist/tools/dev-strategy-runner.ts`，支持滚动判决与 `--watch` 监听 | 修改 `my-secret-tactics.ts` 后终端 < 150ms 刷新结果 |
| **Step 5** | **前后端联调服务** | 编写 `mist/tools/dev-server.ts`，对接 `/v1/indicators/k` 与 `/v1/visual/commands` | 浏览器 `http://localhost:3000/backtests` 精确渲染买卖点图钉 |
| **Step 6** | **存量防退化回归** | 编写 Jest 战术基线回归测试，以 5 套快照为基准防止逻辑退化 | `pnpm test:tactics` 全绿 |
