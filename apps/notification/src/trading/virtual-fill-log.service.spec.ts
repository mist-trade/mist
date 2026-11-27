import { VirtualFillLogService } from './virtual-fill-log.service';

describe('VirtualFillLogService', () => {
  it('projects only ledger columns and omits instruction JSON in loadBySecurity', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([
        {
          id: '10',
          alertEventId: '42',
          securityId: 9,
          securityCode: '000001',
          side: 'BUY',
          quantity: 100,
          price: '12.500',
          fees: '5000',
          netAmount: '-1255000',
          tradingDay: '2026-08-12',
        },
      ]),
      insert: jest.fn(),
    };
    const service = new VirtualFillLogService(repo as never);

    const fills = await service.loadBySecurity(9);

    expect(repo.find).toHaveBeenCalledWith({
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
      where: { securityId: 9 },
      order: { id: 'ASC' },
    });
    expect(fills).toEqual([
      {
        idempotencyKey: '42',
        securityId: 9,
        securityCode: '000001',
        side: 'BUY',
        quantity: 100,
        priceLi: 12_500n,
        feesLi: 5_000n,
        netAmountLi: -1_255_000n,
        tradingDay: '2026-08-12',
        instruction: undefined,
      },
    ]);
  });

  it('swallows duplicate entry error in append as an idempotent no-op', async () => {
    const repo = {
      find: jest.fn(),
      insert: jest
        .fn()
        .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY', errno: 1062 }),
    };
    const service = new VirtualFillLogService(repo as never);

    await expect(
      service.append({
        idempotencyKey: '42',
        securityId: 9,
        securityCode: '000001',
        side: 'BUY',
        quantity: 100,
        priceLi: 12_500n,
        feesLi: 5_000n,
        netAmountLi: -1_255_000n,
        tradingDay: '2026-08-12',
      }),
    ).resolves.toBeUndefined();
  });
});
