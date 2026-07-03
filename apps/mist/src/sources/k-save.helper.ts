import { DataSource, K, Period, Security } from '@app/shared-data';
import { EntityManager, In } from 'typeorm';

export const K_UPSERT_COLUMNS = [
  'open',
  'high',
  'low',
  'close',
  'volume',
  'amount',
];
export const K_CONFLICT_COLUMNS = [
  'securityId',
  'source',
  'period',
  'timestamp',
];

export interface BaseKInput {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

export async function saveBaseK(
  manager: EntityManager,
  data: BaseKInput[],
  security: Security,
  source: DataSource,
  period: Period,
): Promise<Map<number, K>> {
  const kEntities = data.map((d) =>
    manager.create(K, {
      security,
      securityId: security.id,
      source,
      period,
      timestamp: d.timestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: BigInt(Math.round(d.volume)),
      amount: d.amount ?? 0,
    }),
  );
  const kValues = kEntities.map((k) => ({
    securityId: k.securityId,
    source: k.source,
    period: k.period,
    timestamp: k.timestamp,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    amount: k.amount,
  }));

  await manager
    .createQueryBuilder()
    .insert()
    .into(K)
    .values(kValues)
    .orUpdate(K_UPSERT_COLUMNS, K_CONFLICT_COLUMNS)
    .updateEntity(false)
    .execute();

  const savedKs = await manager.find(K, {
    where: {
      security: { id: security.id },
      source,
      period,
      timestamp: In(data.map((d) => d.timestamp)),
    },
  });

  return new Map(savedKs.map((k) => [k.timestamp.getTime(), k]));
}
