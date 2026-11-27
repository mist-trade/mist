import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VirtualFillEventEntity } from '@app/shared-data';
import type { VirtualFillEvent, VirtualFillLogPort } from '@app/strategy';
import { liToYuan, yuanToLi } from '@app/strategy';

/**
 * 账本持久化端口的 TypeORM 实现（REQ-ADAPT-04：域核心定义、app 层实现）。
 *
 * - append：追加成交事实，unique(alert_event_id) 幂等锚点（REQ-LEDGER-03）——
 *   投递重试 / 幂等重放的重复插入按 no-op 处理（ER_DUP_ENTRY 吞掉）；
 * - loadBySecurity：按 id 序加载，供 foldVirtualFills 重建账户快照（REQ-LEDGER-01）。
 * 实时锚点必须为正整数 alertEventId（离线合成键走内存日志，禁入 DB 端口）。
 */
@Injectable()
export class VirtualFillLogService implements VirtualFillLogPort {
  constructor(
    @InjectRepository(VirtualFillEventEntity)
    private readonly repo: Repository<VirtualFillEventEntity>,
  ) {}

  async append(event: VirtualFillEvent): Promise<void> {
    const alertEventId = Number(event.idempotencyKey);
    if (!Number.isSafeInteger(alertEventId) || alertEventId <= 0) {
      throw new Error(
        `VirtualFillLogService: 实时锚点必须为正整数 alertEventId，收到 "${event.idempotencyKey}"（离线合成键请走内存日志端口）`,
      );
    }
    try {
      await this.repo.insert({
        alertEventId: String(alertEventId),
        securityId: event.securityId,
        securityCode: event.securityCode,
        side: event.side,
        quantity: event.quantity,
        price: liToYuan(event.priceLi).toFixed(3),
        fees: event.feesLi.toString(),
        netAmount: event.netAmountLi.toString(),
        tradingDay: event.tradingDay,
        instruction: event.instruction,
      });
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        return; // 幂等重放：同锚点 fill 已存在，不二次回填（REQ-LEDGER-03）
      }
      throw err;
    }
  }

  async loadBySecurity(
    securityId: number,
  ): Promise<readonly VirtualFillEvent[]> {
    const rows = await this.repo.find({
      select: {
        id: true,
        alertEventId: true,
        securityId: true,
        securityCode: true,
        side: true,
        quantity: true,
        price: true,
        fees: true,
        netAmount: true,
        tradingDay: true,
      },
      where: { securityId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => ({
      idempotencyKey: row.alertEventId,
      securityId: row.securityId,
      securityCode: row.securityCode,
      side: row.side,
      quantity: row.quantity,
      priceLi: yuanToLi(Number(row.price)),
      feesLi: BigInt(row.fees),
      netAmountLi: BigInt(row.netAmount),
      tradingDay: row.tradingDay,
      instruction: undefined,
    }));
  }
}

function isDuplicateEntryError(err: unknown): boolean {
  const code = (err as { code?: string; errno?: number }) ?? {};
  return code.code === 'ER_DUP_ENTRY' || code.errno === 1062;
}
