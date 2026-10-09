# Tasks: differentiate-chan-central-extension-upgrade-and-expansion

## 1. 领域模型与计算引擎重构 (`libs/chancore`)
- [ ] 1.1 更新 `contracts.ts` 中 `BaseChanChannel` 注释，澄清 `expanded` 与 `upgradedLevel` 的独立职责
- [ ] 1.2 重构 `duan-channel-policy.ts`：内部段数达到 9 段时仅标记 `upgradedLevel: ChannelLevel.Macro` 与 `extended: true`，严禁赋值 `expanded = true`
- [ ] 1.3 重构 `duan-channel.ts`：延伸融合 `mergeExtendedDuanChannel` 达到 9 段时，同样仅标记 `upgradedLevel: Macro` 与 `extended: true`，严禁赋值 `expanded = true`
- [ ] 1.4 保持笔级计算 `bi-channel.ts` 与 `bi-channel-policy.ts` 的纯净微观定位，不引入 9 笔升级

## 2. 绘图适配与契约透传 (`libs/visual-command`)
- [ ] 2.1 在 `BandVisualCommand`（`visual-command.types.ts`）中补充 `readonly upgradedLevel?: ChannelLevel;`
- [ ] 2.2 重构 `ChanVisualAdapter.convert`：
  - 停止将 `isMacro` 粗暴塞入 `expanded` 字段，忠实透传中枢实际的 `expanded`、`extended` 与 `upgradedLevel`
  - 针对段中枢划分颜色：扩展大框赋予 `#E879F9`，9段升级赋予 `#A855F7`，普通段中枢赋予 `#818CF8`
  - 针对笔中枢：扩展赋予 `#F59E0B`，普通与延伸统一赋予 `#38BDF8`

## 3. 前端图表展示层适配 (`mist-fe`)
- [ ] 3.1 在 `mist-fe/app/api/types.ts` 与 `client.ts` 中同步校验 `upgradedLevel` 字段
- [ ] 3.2 重构 `TradingViewChart.tsx`：
  - 按照优先级（absorbed -> expanded -> upgradedLevel -> extended -> 常规）重构文案判断
  - 9段延伸升级展示为 `段中枢[9段延伸升级]`，颜色采用 `#A855F7`，采用 2.5px 加粗实线
  - 波动扩展大框展示为 `段中枢[高一级扩展]`，维持 `#E879F9`，采用 2.5px 加粗长虚线
  - 笔中枢所有延伸统一保持天蓝色 `#38BDF8`

## 4. 单测套件更新与回归验证
- [ ] 4.1 更新 `libs/chancore/src/internal/duan-channel.spec.ts`，增加 9 段延伸升级与波动扩展的独立断言测试
- [ ] 4.2 运行 chancore 全量单测验证
- [ ] 4.3 验证下游买卖点与背驰链路不受影响
