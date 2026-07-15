# Chan Application

缠论（Chan Theory）算法与 API 服务 - 提供 K 线合并、笔计算、中枢识别的接口。

## 功能特性

- **K 线合并（Merge K）**：基于包含关系对连续 K 线进行分组
- **笔识别（Bi Recognition）**：识别显著价格变动，使用 4 步递归算法
- **中枢识别（Channel Detection）**：两阶段算法识别中枢（Phase A 固定 5 笔滑窗枚举 + Phase B 定点迭代合并）

> 注：缠论回归测试已迁移到前端（`mist-fe/__fixtures__/`），后端只保留纯算法单元测试。

## 前置要求

- Node.js (v18+)
- MySQL 数据库

## 安装

```bash
# 安装依赖
pnpm install
```

## 运行应用

### 开发模式

```bash
pnpm run start:dev:chan
```

应用将在 `http://localhost:8008` 启动

### 生产构建

```bash
# 构建应用
pnpm run build

# 启动生产服务器
pnpm run start:prod:chan
```

## API 端点

### K 线合并
- `POST /v1/chan/merge-k` - 合并 K 线

### 笔识别
- `POST /v1/chan/bi` - 识别笔（4 步算法）

### 中枢识别
- `POST /v1/chan/channel` - 识别中枢（5 笔最小值）

### 健康检查
- `GET /app/hello` - 服务健康检查

## 测试

### 运行算法单元测试

```bash
# 所有缠论单元测试
pnpm run test -- chan
```

## 缠论算法说明

### K 线合并（Merge K）

基于包含关系对连续 K 线进行分组：
- 上升 K 线：当前 K 线的最高点 ≤ 前 K 线的最高点
- 下降 K 线：当前 K 线的最低点 ≥ 前 K 线的最低点

### 笔识别（Bi）

使用 4 步递归算法：
1. 识别所有分型（Fenxing）
2. 顶底交替
3. 生成候选笔 + 宽笔过滤
4. 递推状态机处理（支持回滚）

### 中枢识别（Channel）

采用**两阶段算法**（与笔的两阶段架构镜像，Phase B 共用 `mergeSpans` 驱动）：

**Phase A — 固定 5 笔滑窗枚举**：
- 至少 5 笔才能形成基础中枢，每个起点都尝试枚举（步进 1）
- 趋势交替 + 重叠检查：zg（中枢上沿）= 前 5 笔的最高点取最小值，zd（中枢下沿）= 前 5 笔的最低点取最大值，需 zg > zd
- 第 4、5 笔必须与 zg-zd 区间重叠
- 通过基础重叠的候选再用范围与极值规则标记 `Valid`/`Invalid`，Phase A 保留两者

**Phase B — 定点迭代合并**：
- 对 Phase A 输出做不动点合并（短跨度优先 + 最左优先）
- 时间重叠、同向、zone 兼容的中枢合并成大中枢（与笔的 `mergeBiSegments` 共享驱动，各注入领域谓词）
- 最终只输出 `Valid` 序列

## 故障排查

### 中枢识别结果异常

检查：
1. 笔识别是否正确（趋势交替）
2. Phase A：zg/zd 计算是否正确（前 5 笔的最高点最小值 / 最低点最大值）
3. Phase B：合并谓词（时间重叠、同向、zone 兼容）是否按预期归约

## 许可证

BSD-3-Clause
