# Design: 上证指数牛熊插件、主仓纯透传架构与茅台全量清理设计

## 1. 架构总览：主仓纯透传管道 (Zero-Interpretation Transparent Pass-Through Pipeline)

```text
┌────────────────────────────────────────────────────────┐
│ 私有专有仓 (mist-alpha-private)                        │
│                                                        │
│  私有因子插件 (Private Factor Plugin)                  │
│    • 自主决策交易逻辑 (稍后与用户对齐定义)             │
│    • 100% 自主生成展示文本与元数据：                   │
│      - badgeText: "左侧1买" / "右侧2买" / ...          │
│      - reason: "..." (深度白盒归因)                    │
│      - styleMeta: { color: "#...", position: "below" } │
│      - evidence: { stopLossPrice, pivotTime, ... }     │
└───────────────────────────┬────────────────────────────┘
                            │ 标准 FactorOpinion (带 badgeText / styleMeta)
┌───────────────────────────▼────────────────────────────┐
│ 开源主仓 (mist) — 【纯透传信道，零硬编码解释】         │
│                                                        │
│  1. libs/strategy: FactorOpinion                       │
│     └── DecisionFlowEvaluator ──► KernelSignal         │
│         (原样透传 badgeText, styleMeta, evidence)      │
│  2. libs/strategy/src/simulation:                      │
│     └── mapKernelSignalToSimulationSignal              │
│         (彻底删除 formatBadgeText 硬编码，原样透传)    │
│  3. apps/notification:                                 │
│     └── 彻底删除 CHAN_BSP_TYPE_NAMES，优先透传 badgeText│
└───────────────────────────┬────────────────────────────┘
                            │ SSE / WebSocket / REST 纯数据透传
┌───────────────────────────▼────────────────────────────┐
│ 前端 (mist-fe) — 【纯图形挂载，零业务语义硬编码】     │
│                                                        │
│  1. backtest-signal-visual.util.ts                     │
│     (彻底删除 CHAN_LABEL_MAP 与 "1买" 硬编码判定)       │
│  2. BacktestSignalTable / BacktestReplayBar            │
│     (统一优先取用 sig.badgeText || "买点"/"卖点")      │
│  3. TradingViewChart (按 styleMeta 或默认色彩渲染)     │
└────────────────────────────────────────────────────────┘
```

---

## 2. 核心模块详细设计

### 2.1 模块 A：上证指数全局牛熊插件 (`ShanghaiRegimePlugin`)
- **文件位置**：`mist/libs/strategy/src/factor/plugins/shanghai-regime.plugin.ts`
- **契约标识**：`id = 'plugin.regime.shanghai-index'`, `category = 'REGIME'`
- **开源量化标准算法（参考 Dow Theory / 海通金工牛熊周期）**：
  采用工业界成熟度最高、最能防御 A 股单边大熊市的 **年线系统 + 双长均线斜率状态机**：
  1. **输入序列**：上证指数日线收盘价 $P(t)$；
  2. **向量化指标（Rust `nodejs-polars` SIMD 表达式实现，零循环）**：
     - $MA_{60}(t) = \text{rollingMean}(P, 60)$（季线）
     - $MA_{250}(t) = \text{rollingMean}(P, 250)$（年线）
     - $\text{Slope}_{250}(t) = \frac{MA_{250}(t) - MA_{250}(t-20)}{MA_{250}(t-20)}$（年线20日变动斜率）
  3. **状态转移判定**：
     - **牛市（BULL / `action: 'BUY'`）**：
       $$P(t) > MA_{250}(t) \quad \land \quad MA_{60}(t) > MA_{250}(t) \quad \land \quad \text{Slope}_{250}(t) \ge -0.005$$
       *(确信度 0.90，处于年线上方多头排列，年线未出现明确拐头向下)*
     - **熊市（BEAR / `action: 'SELL'`）**：
       $$P(t) < MA_{250}(t) \quad \land \quad MA_{60}(t) < MA_{250}(t) \quad \land \quad \text{Slope}_{250}(t) \le 0.005$$
       *(确信度 0.90，处于年线下方空头排列，年线压制向下)*
     - **震荡市（SIDEWAYS / `action: 'NEUTRAL'`）**：
       均线纠缠或突破未获斜率确认（确信度 0.50）。
  4. **本地 Mock 与线上真实环境一致性保障**：
     - 当评估上证指数自身时，直接消费 `context.bars`，本地和线上 100% 同构；
     - 当评估个股时，通过统一只读接口 `context.marketData.getBars('000001.SH', ...)` 读取：
       - 本地 mock 环境：从本地上证日线切片文件读取并严格截取至 `timestamp <= context.timestamp`；
       - 线上生产环境：从 MySQL `k` 表 / Redis 读取并截取至 `timestamp <= context.timestamp`；
       - 严格因果律守门，绝不访问未来数据。

---

### 2.2 模块 B：主仓与前端“纯透传（Transparent Pass-Through）”重构设计

#### 1. 契约层扩展 (`FactorOpinion`)
在 `mist/libs/strategy/src/factor/factor.types.ts` 中丰富元数据字段：
```ts
export interface FactorOpinion {
  readonly action: FactorAction;
  readonly confidence: number;
  readonly reason: string;
  readonly badgeText?: string;      // 插件自主生成的展示徽标（如 "左侧1买", "三卖", "爆量突破"）
  readonly displayTag?: string;     // 插件自主分类标签
  readonly styleMeta?: Readonly<{   // 插件自主指定的渲染建议（可选）
    color?: string;
    position?: 'above' | 'below';
  }>;
  readonly evidence?: Readonly<Record<string, unknown>>;
}
```

#### 2. 内核与仿真纯透传化
- **清理 `kernel-signal-mapper.ts`**：
  - 彻底删除 `formatBadgeText` 函数（移除其 `first_buy -> 1买` 等写死转换）；
  - `mapKernelSignalToSimulationSignal` 统一按优先级透传：
    ```ts
    const badgeText = signal.badgeText 
      ?? (signal.contextSnapshot as any)?.badgeText 
      ?? (signal.decisionTrace as any)?.badgeText 
      ?? (signal.action === 'BUY' ? '买点' : '卖点');
    ```
- **清理 `decision-pivot-evidence.ts`**：
  - 彻底删除通过 `reason.includes('一买')` 等正则匹配汉字识别极值证据的历史逻辑；
  - 严格以结构化 `evidence.pivotTime` / `evidence.pivotPrice` 为准。

#### 3. 前端纯透传化
- **清理 `backtest-signal-visual.util.ts`**：
  - 彻底删除 `CHAN_LABEL_MAP` 及所有 `rawType === "first_buy"` 的前置判断；
  - 统一直接取用 `sig.badgeText || (sig.isBuy ? "买点" : "卖点")`。
- **清理 `BacktestSignalTable.tsx` 与 `BacktestReplayBar.tsx`**：
  - 移除所有硬编码文字映射，统一优先渲染 `signal.badgeText`。

---

### 2.3 模块 C：私有仓插件挂载骨架与扩展约定

- **定位**：私有仓 `mist-alpha-private` 仅作为承载用户专有心法的容器；
- **左右买卖点算法**：**遵照用户指示暂停实现，等待与用户专门讨论**；
- **接口兼容**：在私有仓插件骨架中，规范化对接 `badgeText` 与 `styleMeta` 导出，确保一旦用户敲定买卖点逻辑后，能直接自主输出定制文本，无需改动开源主仓。

---

### 2.4 模块 D：全仓“茅台（Maotai / 600519）”全量清理设计

1. **快照与夹具物理清理**：
   - 删除 `mist-fe/__fixtures__/snapshots/chan/maotai-2024-2025/`
   - 删除 `mist-fe/__fixtures__/snapshots/chan/maotai-2024-2026/`
   - 删除 `mist-fe/__fixtures__/cases/chan/maotai-2024-2025.ts`
   - 删除 `mist-fe/__fixtures__/cases/chan/maotai-2024-2026.ts`
   - 从 `mist-fe/__fixtures__/cases/index.ts` 中移除茅台用例注册；
2. **默认标的与 UI 回退**：
   - `mist-fe/app/k/KLineLivePage.tsx` 的 `DEFAULT_CODE = "600519"` 改为 `"000001"`；
   - `mist/tools/strategy-dev/runner.ts`、`sync.ts` 默认回退值从 `'600519'` 改为 `'000001'`，默认用例改为 `'shanghai-index-2024-2025'`；
   - 清理所有 UI 下拉列表中茅台项目，仅保留上证指数；
3. **chancore 黄金夹具迁移**：
   - 将 `mist/libs/chancore/src/chan-full-output.characterization.fixture.ts` 替换为上证指数日线真实数据；
   - 同步更新 `chan-full-output.characterization.spec.ts` 中的 `EXPECTED_FULL_OUTPUT_SHA256` 与 `EXPECTED_FILTERED_CONTAINMENT_SHA256`；
4. **全仓测试与代码注释清洗**：
   - 替换各单测中使用的 `600519` 为 `000001`；
   - 彻底清理所有注释中提及的“茅台”字样。
