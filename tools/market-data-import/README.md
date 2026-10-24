# 第三方行情导入工具（vendor）

把供应商交付的 5 分钟 CSV 转换成可直接 `LOAD DATA` 的 TSV：一份写 `k`，一份写 `k_quality`。
解析、校验、30 分钟派生与质量规则都在 `libs/market-data/src/vendor-import/`，本目录只做 IO。

## 用法

```bash
# 单个标的
pnpm data:vendor-import -- \
  --code 000001 --security-id 5 \
  --input-dir ~/股票数据/clean_manual \
  --out-dir /tmp/vendor-import

# 全部 5 个指数（catalog 已内置 security_id 与期望行数）
pnpm data:vendor-import -- --all \
  --input-dir ~/股票数据/clean_manual \
  --out-dir /tmp/vendor-import
```

可选参数：`--dataset-version clean_manual@2026-10-24`（写入 `k_quality.dataset_version`）、
`--skip-reconcile`（跳过与 `.data/kline/<code>_1d.json` 的日收盘对账）。

## 产物

| 文件 | 内容 |
|---|---|
| `<code>_k_5m.tsv` / `<code>_k_30m.tsv` | `security_id, period, timestamp, o,h,l,c, volume, amount` |
| `<code>_quality_5m.tsv` / `<code>_quality_30m.tsv` | 六掩码 + scale + epoch + manual_fix + derived_from_period + dataset_version |
| `<code>_manifest.json` | 行数、区间、每日根数分布、质量分布、日收盘对账结果 |

时间戳是北京墙钟的 **bar 右端**（09:35 / 15:00），与 `k` 现有 QMT 口径一致，导入时不做任何位移。

## 质量语义（`k_quality`）

- `*_valid = 0/1`：该字段能否直接参与运算，例如 `volume * volume_valid * volume_scale`；
- `volume_scale` / `amount_scale`：已知固定单位错误的归一因子，本期恒为 1；
- `caliber_epoch`：供应商口径分段号，同段内可比、跨段不可比；
- 不存自由文本原因码（词表会无限增长）。

本期映射见 `libs/market-data/src/vendor-import/vendor-a-quality-profiles.ts`：

| 标的 | 区间 | 规则 |
|---|---|---|
| 000300 | 2005-06-09 / 2006-08-07 / 2006-08-21 / 2006-09-18 | high/low 不可用（O/C 正确） |
| 000001 | 2005-01-04 ~ 2011-07-26 | 量额不可用（混入基金量，保守处理） |
| 399006 | 2017-01-01 起 | epoch 2（口径断点，值有效） |
| 399673 | 2014 全年 | 量额不可用（38.9x / 7.7x，无固定因子） |
| 399001 | 全区间 | 成分股口径，段内自洽，全部有效 |

## 导入（生产库）

1. 传输到容器（避开 `local_infile=OFF` 与宿主文件不可见）：

```bash
for f in /tmp/vendor-import/*.tsv; do
  ssh mist-box "docker exec -i mist-mysql sh -c \"cat > /var/lib/mysql-files/$(basename "$f")\"" < "$f"
done
```

2. 每个 `(security, period)` 一个会话，临时表 + `LOAD DATA` + 事务内 `DELETE` 后重灌：

```sql
CREATE TEMPORARY TABLE stg_k (...);
CREATE TEMPORARY TABLE stg_q (...);
LOAD DATA INFILE '/var/lib/mysql-files/<code>_k_5m.tsv' INTO TABLE stg_k
  FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n';
LOAD DATA INFILE '/var/lib/mysql-files/<code>_quality_5m.tsv' INTO TABLE stg_q
  FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n';
START TRANSACTION;
DELETE FROM k WHERE source='vendor_a' AND security_id=<id> AND period=5;
INSERT INTO k (...) SELECT ... FROM stg_k;
INSERT INTO k_quality (k_id, ...)
SELECT k.id, q.* FROM stg_q q
JOIN k ON k.security_id=q.security_id AND k.source='vendor_a'
      AND k.period=q.period AND k.timestamp=q.ts;
COMMIT;
```

3. 对账（期望值见 `manifest.json`）：

```sql
SELECT security_id, period, COUNT(*) FROM k WHERE source='vendor_a' GROUP BY 1,2;
SELECT COUNT(*) FROM k_quality q JOIN k ON k.id=q.k_id WHERE k.source='vendor_a';
SELECT COUNT(*) FROM k WHERE source='vendor_a'
  AND (high < GREATEST(open,close) OR low > LEAST(open,close));
```

## 回滚

```sql
DELETE FROM k WHERE source='vendor_a';
```

`k_quality` 通过外键级联清理，其它 source 不受影响。

## 重新导入

工具与导入 SQL 都幂等：重复导入同一批次结果一致；换批次时 `dataset_version` 会随之更新。

## 约束

- 行情 CSV/TSV **不得提交进仓库**；
- 新增供应商：`DataSource` 加一个 `vendor_<slug>` 值 + 一条 migration 放宽相关枚举，
  再在本工具 `DATASETS` 与 `vendor-a-quality-profiles.ts` 增加对应配置。
