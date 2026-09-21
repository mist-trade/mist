# 缠论四象限交易战术架构（买卖分立与左右侧四象限）

## 一、概述
本模块实现了交易体系的核心解耦：
1. **买卖不对称**：买点与卖点独立算法、独立参数、独立状态机；
2. **左右侧四象限**：
   - **`LeftBuy` (左侧买点)**：逆势抄底，聚焦于离开段背驰衰竭与本级别底分型 + 次级别 MACD 黄白线上 0 轴；
   - **`RightBuy` (右侧买点)**：顺势追强，聚焦于二买（不破前低、排除前序 3S）与三买（脱离中枢回抽不跌回）；
   - **`LeftSell` (左侧卖点)**：冲高减仓，聚焦于高位顶背离与本级别顶分型 + 次级别死叉/下穿 0 轴；
   - **`RightSell` (右侧卖点)**：破位止损，聚焦于二卖（反弹不创新高）与三卖（反抽不上中枢破位主跌）。
3. **安全隐私隔离**：
   - 远端开源仓库仅持有标准接口（`ChanFourQuadrantTactics`）与安全加载器（`DynamicTacticsLoader`）；
   - 个人核心法宝存放在私有目录 `private/`，受 `.gitignore` 保护，绝对不会提交至公共 Git 仓库。

---

## 二、如何使用私有 Git 仓库管理您的法宝？

您可以把自己的交易法宝提交到一个**独立的私有 GitHub / 本地 Git 仓库**，有两种推荐方式：

### 方式 A（推荐）：Git Submodule 模式（私有子仓库）
1. 在 GitHub 上创建一个全新的私有仓库（例如 `mist-tactics-private`，权限设为 Private）；
2. 在本地主仓 `libs/strategy/src/tactics/` 目录下添加子模块：
   ```bash
   git submodule add git@github.com:your-username/mist-tactics-private.git libs/strategy/src/tactics/private
   ```
3. 在 `private/` 目录下编写您的代码，直接在此子目录下 `git commit` 和 `git push` 到您的私有仓库；
4. 部署时，在 Windows 机器上拉取该私有仓库，即可无缝热挂载。

### 方式 B：独立目录 + 环境变量映射模式
1. 将私有仓库克隆在您电脑的任意独立路径：
   `git clone git@github.com:your-username/mist-tactics-private.git /path/to/my-tactics`
2. 在本地开发或生产环境 `.env` 中指定：
   ```bash
   MIST_PRIVATE_TACTICS_DIR=/path/to/my-tactics
   ```
3. `DynamicTacticsLoader` 会自动优先加载该目录下的策略类，实现彻底的物理级代码解耦。

---

## 三、私有战术代码编写模板示例

在 `libs/strategy/src/tactics/private/my-secret-tactics.ts`（或 `.js`）中实现：

```typescript
import {
  ChanFourQuadrantTactics,
  ChanTacticsContext,
  TacticalAction,
  TacticalQuadrant,
  TacticalQuadrantDecision,
} from '../contracts/chan-four-quadrant-tactics.interface';

export class MySecretTactics implements ChanFourQuadrantTactics {
  readonly id = 'my-secret-alpha';
  readonly name = 'My Private Edge Tactics';
  readonly version = '1.0.0';

  /** ① 左侧抄底买点：本级别底分型 + 次级别 MACD 黄白线上0轴 */
  evaluateLeftBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    // 写入您的具体判决逻辑与次级别穿透检查
    return {
      triggered: false,
      quadrant: TacticalQuadrant.LeftBuy,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: '未满足左侧买点条件',
    };
  }

  /** ② 右侧顺势买点：排除前序 3S 之后的纯几何二买/三买 */
  evaluateRightBuy(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant: TacticalQuadrant.RightBuy,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: '未满足右侧买点条件',
    };
  }

  /** ③ 左侧逃顶卖点：高位顶分型 + 次级别 MACD 跌破0轴 */
  evaluateLeftSell(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant: TacticalQuadrant.LeftSell,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: '未满足左侧卖点条件',
    };
  }

  /** ④ 右侧破位卖点：破位坚决清仓止损 */
  evaluateRightSell(ctx: ChanTacticsContext): TacticalQuadrantDecision {
    return {
      triggered: false,
      quadrant: TacticalQuadrant.RightSell,
      price: ctx.lastPrice ?? 0,
      time: ctx.timestamp,
      confidence: 0,
      action: TacticalAction.None,
      reason: '未满足右侧卖点条件',
    };
  }
}

// 导出类名供动态加载器反射实例化
module.exports = { MySecretTactics };
```
