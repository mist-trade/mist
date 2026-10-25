# Design: Canonical 行情序列

## 1. 模型

```
身份：  (security_id, period)          ← 下游唯一认知
内容：  一条连续序列，由 SplicePolicy 在读取时组装
存储：  k 表保留原始行与 source 标记；不写任何拼接行
```

`source` 的角色降级为**底表来源标记**：

- `k.source` 继续区分 `ef / tdx / qmt / vendor_a`；
- 读接口不再接受 `source`；
- canonical 返回的每根 bar 仍携带真实来源（`StrategyBar.source`），用于审计与信号落库。

## 2. SplicePolicy（私有配置，N 段）

```json
{
  "version": "2026-10-24.1",
  "defaults": {
    "5":    [{ "source": "vendor_a", "before": "2025-07-04" }, { "source": "qmt" }],
    "30":   [{ "source": "vendor_a", "before": "2025-07-04" }, { "source": "qmt" }],
    "1440": [{ "source": "qmt" }]
  },
  "overrides": [
    { "security": "000001", "periods": { "1440": [{ "source": "qmt" }] } }
  ]
}
```

规则：

- 段数任意（1~N），按时间顺序排列；
- 每段 `source` 必填，`from` / `before` 可选（北京时间日期，左闭右开）；
- 只有第一段可以省略 `from`，只有最后一段可以省略 `before`；
- 段之间不得重叠；缺口允许存在（数据本身缺失），但必须在读取结果中体现为真实空缺，不得补造；
- `source` 必须在 `k.source` 的已知枚举内；
- `version` 全局唯一，改配置必须升版本。

解析顺序：`overrides` 中匹配 security 且声明该 period 的规则优先，否则用 `defaults[period]`；都没有 → **显式失败**（不猜、不回退）。

## 3. 公共 / 私有边界

| 位置 | 内容 |
|---|---|
| `mist`（公共） | `SplicePolicy` 类型、校验、`CanonicalSeriesPlan`、跨段组合读取器、私有目录加载器 |
| `mist-alpha-private` | 具体 policy JSON + `marketDataPolicy` provider（数行） |

加载复用现有 `/app/private-plugins` 通道（`MIST_PRIVATE_PLUGINS_DIR`），与外部因子插件同源。公共仓**不含任何日期边界、源优先级或标的名单**。

## 4. 读取组合（纯逻辑 + 端口）

```ts
export interface CanonicalSegmentReader {
  read(data: {
    securityId: number;
    source: DataSource;
    period: number;
    from: Date | null;      // null = 无下界
    before: Date | null;    // null = 无上界
    afterTimestamp: Date | null;
    order: 'asc' | 'desc';
    limit: number;
  }): Promise<StrategyBar[]>;
}
```

### 预热窗口（反向）

```
segments = resolve(policy, security, period)
cursor = endAt
for segment from last to first:
    if segment 与 (?, cursor) 有交集:
        bars = reader.read({...segment, before: cursor, order:'desc', limit: remaining})
        prepend(bars); remaining -= bars.length
    if remaining == 0: break
return bars.reverse()   // 严格升序
```

### 分页（正向）

```
segments = resolve(...)
for segment intersecting (afterTimestamp ?? from, to]:
    bars = reader.read({...segment, afterTimestamp: cursor, order:'asc', limit: remaining})
    append; remaining -= len; cursor = last.timestamp
    if remaining == 0: break
return { bars, nextCursor: full ? last.timestamp : null }
```

段边界不重叠，因此**时间戳游标天然单调**，不需要复合游标；一页 1000 根、段长以年计，一页最多跨一个边界。

## 5. 接口与落库变更

| 项 | 变更 |
|---|---|
| `CreateBacktestRunDto.source` | **删除**（不保留降级） |
| `IndicatorQueryDto.source` / `QueryVisualCommandsDto.source` | **删除** |
| `BacktestMarketDataAdapter` | 改为 canonical 读取（注入 reader + policy），不再按 `run.source` 查库 |
| `backtest_runs` | `source` 枚举增加 `canonical`（标记位）；新增 `data_policy_version varchar(64) NULL` |
| `backtest_signal_results.source` | 写**该根 bar 的真实来源**（vendor_a / qmt / …） |
| `IndicatorService.findKData` | 走 canonical；不再解析 source |
| `tools/strategy-dev/sync.ts` | 读私有 policy，按段生成 SQL（UNION ALL），输出已拼接序列 |
| 前端 | 回测 / 双周期 / K 线页面移除数据源选择器 |

兼容性：历史 `backtest_runs` 保留原 `source` 值，不回填；新 run 写 `source='canonical'` + `data_policy_version`。新旧结果解释不同，`data_policy_version` 为空即"旧语义"。

## 6. 失败语义

- 无策略 / 策略版本缺失 / 请求周期未配置 → 请求失败，返回明确错误码，**不返回空数组**；
- 某段读取失败 → 整次读取失败，不降级到其它段；
- 段配置非法（重叠、乱序、source 未知）→ 应用启动或首次读取时快速失败。

## 7. 实时链路（B，目标 R2）

本 change 不动实时。目标形态记录在此，供 B 实施：

- 历史部分走 canonical（与回测同一策略、同一版本）；
- 当天部分由**实时触发源**提供（TDX 或 QMT 推来的 sealed bar），当天内不切换；
- 即"当天用谁由当天选中的触发源决定"，不是永久绑定某个源；
- `StrategyDefinition.sources` 仅约束触发源资格，不再约束历史来源。

## 8. 迁移步骤

1. 归档 `add-vendor-market-data-import`（已上线），使 live spec 与代码一致；
2. 落地本 change（公共能力 + 回测/指标/可视化切换 + 前端）；
3. 私有仓补 policy 与 provider，部署时挂载生效；
4. 全链路回归：同一区间 canonical 读数与"手工按段拼"逐 bar 一致。

## 9. 验证

- 纯函数单测：段解析（默认/覆盖/非法）、窗口反向跨 1~3 段、分页跨段、空段、缺口；
- 适配器单测：canonical 查询只命中 `k`，不再出现 source 过滤入参；
- 静态门禁：公共读 DTO 不得再出现 `source` 字段；公共仓不得出现拼接边界常量；
- 回归：以 000001 2005-01-04~2026-10-20 的 30m 为例，canonical 结果与"按 policy 手工 UNION"逐 bar 比对为 0 差异；
- 端到端：一次 2005→2026 的 30m 回测跑通，信号行 `source` 为真实来源。
