# Theme B Realtime Workspace 与 Checkpoint 审计

## 审计时间与分支

- 日期：2026-07-22（Asia/Shanghai）
- 六仓库均已执行 `git fetch --prune origin`。
- 六仓库本地 `master` 与 `origin/master` 均为 `0 0`，主 worktree 无 dirty changes。
- 新集成分支：`feat/theme-b-realtime-productization`。

| Repository | Master SHA |
|---|---|
| `mist` | `f98e731b254baee5ec50ab1db7d38d19b4058232` |
| `mist-datasource` | `3d650e53169c0be67e2f4e84f5862f7ce78a872d` |
| `mist-deploy` | `6fedaba8def63b7835c51f24745616be5123623f` |
| `mist-fe` | `e330bd18aa739b09d6912374104b63553043a03e` |
| `mist-monitoring` | `48acdacc74bfc69115c91aaccf54969385f20a52` |
| `mist-skills` | `9458f26f67eb69fee6136db5b0f72a3b222462ec` |

## Portfolio Checkpoint

Backend checkpoint 为 `origin/feat/strategy-portfolio-backtesting`，相对 master 的提交依次为：

- `06fd1d4 feat: add strategy portfolio backtesting`
- `db365eb feat: add strategy portfolio backtesting`
- `4c7880b fix: converge strategy portfolio backtesting v3`
- `73befb9 chore: reconcile remote strategy backtesting checkpoint`

Frontend checkpoint 为同名远端分支，提交依次为：

- `dd18c2b feat: add strategy portfolio backtesting workspace`
- `13fac02 feat: add strategy portfolio backtesting workspace`
- `132c594 fix: converge strategy backtesting workspace v3`
- `52507d9 chore: reconcile remote strategy backtesting checkpoint`

本 realtime ingress change 不 cherry-pick 或 merge 上述提交，不引入 checkpoint 的 Chan 或 portfolio 历史。B2 实施时只按文件/提交审查后选择性移植。

## Migration 状态

- 当前 `mist` master 的 migration 文件为 `001` 至 `006`。
- `006_strategy_platform_core.sql` 不修改。
- checkpoint 包含 `007_strategy_portfolio_backtesting.sql` 与 `008_strategy_portfolio_backtesting_indexes.sql`，但它们不进入本 change，也不视为可复用编号。
- 生产 `schema_migrations` 的实际最大编号尚未在本地审计中验证。任何后续 MySQL change 必须先通过只读生产 inventory 和隔离 `MIST_TEST_MYSQL_URL` 决定新编号。
- 本 change 不创建、执行或回滚 MySQL migration。

## Worktree 结论

现有 Theme A、cross-repo smoke、Chan、alert 与 portfolio worktree 保留不动。实施只在六个主路径的新同名集成分支进行，不清理、不 reset、不整分支合并其他 worktree。
