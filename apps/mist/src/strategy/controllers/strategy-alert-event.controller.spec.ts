import { StrategyAlertEventController } from './strategy-alert-event.controller';

describe('StrategyAlertEventController', () => {
  it('delegates alert delivery and acknowledgement commands to the service', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue([]),
      markDelivered: jest
        .fn()
        .mockResolvedValue({ id: 1, status: 'delivered' }),
      markFailed: jest.fn().mockResolvedValue({ id: 1, status: 'failed' }),
      acknowledge: jest.fn().mockResolvedValue({ id: 1, status: 'acked' }),
    };
    const controller = new StrategyAlertEventController(service as any);
    const deliveryDto = {
      deliveryResult: { channel: 'astrbot', messageId: 'msg-1' },
    };
    const failureDto = {
      deliveryResult: { channel: 'astrbot', error: 'bot unavailable' },
    };

    await controller.findAll({ status: 'pending' } as any);
    await controller.markDelivered('1', deliveryDto);
    await controller.markFailed('1', failureDto);
    await controller.acknowledge('1');

    expect(service.findAll).toHaveBeenCalledWith({ status: 'pending' });
    expect(service.markDelivered).toHaveBeenCalledWith(1, deliveryDto);
    expect(service.markFailed).toHaveBeenCalledWith(1, failureDto);
    expect(service.acknowledge).toHaveBeenCalledWith(1);
  });
});
