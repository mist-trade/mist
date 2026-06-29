import { BadRequestException } from '@nestjs/common';
import { DataSource, Period } from '@app/shared-data';
import { CollectorController } from './collector.controller';

describe('CollectorController test-only TDX streaming endpoint', () => {
  const createHarness = () => {
    const security = { id: 2, code: '600030' };
    const securityService = {
      findSecurityByCode: jest.fn().mockResolvedValue(security),
      getSecuritySources: jest.fn().mockResolvedValue([
        {
          source: DataSource.TDX,
          enabled: true,
          formatCode: '600030.SH',
        },
      ]),
    };
    const registry = { resolve: jest.fn() };
    const timezoneService = { parseDateString: jest.fn() };
    const tdxStreamingStrategy = {
      collectForSecurity: jest.fn().mockResolvedValue(1),
      unsubscribeForSecurity: jest.fn().mockResolvedValue(1),
    };
    const controller = new CollectorController(
      securityService as any,
      registry as any,
      timezoneService as any,
      tdxStreamingStrategy as any,
    ) as any;

    return { controller, security, securityService, tdxStreamingStrategy };
  };

  it('subscribes through the existing backend TDX WebSocket leader for smoke tests', async () => {
    const { controller, security, securityService, tdxStreamingStrategy } =
      createHarness();

    await expect(
      controller.subscribeTdxStreaming({
        code: '600030',
        period: Period.ONE_MIN,
        testOnly: true,
      }),
    ).resolves.toEqual({
      code: '600030',
      period: Period.ONE_MIN,
      count: 1,
      testOnly: true,
    });

    expect(securityService.findSecurityByCode).toHaveBeenCalledWith('600030');
    expect(securityService.getSecuritySources).toHaveBeenCalledWith('600030');
    expect(tdxStreamingStrategy.collectForSecurity).toHaveBeenCalledWith(
      expect.objectContaining({
        ...security,
        sourceConfigs: [
          expect.objectContaining({
            source: DataSource.TDX,
            enabled: true,
            formatCode: '600030.SH',
          }),
        ],
      }),
      Period.ONE_MIN,
    );
  });

  it('rejects smoke subscriptions when the security has no enabled TDX source', async () => {
    const { controller, securityService, tdxStreamingStrategy } =
      createHarness();
    securityService.getSecuritySources.mockResolvedValue([
      {
        source: DataSource.EAST_MONEY,
        enabled: true,
        formatCode: '600030',
      },
    ]);

    await expect(
      controller.subscribeTdxStreaming({
        code: '600030',
        period: Period.ONE_MIN,
        testOnly: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tdxStreamingStrategy.collectForSecurity).not.toHaveBeenCalled();
  });

  it('requires an explicit testOnly flag before changing streaming subscriptions', async () => {
    const { controller, tdxStreamingStrategy } = createHarness();

    await expect(
      controller.subscribeTdxStreaming({
        code: '600030',
        period: Period.ONE_MIN,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tdxStreamingStrategy.collectForSecurity).not.toHaveBeenCalled();
  });

  it('unsubscribes a test streaming security through the backend leader', async () => {
    const { controller, security, tdxStreamingStrategy } = createHarness();

    await expect(
      controller.unsubscribeTdxStreaming({
        code: '600030',
        period: Period.ONE_MIN,
        testOnly: true,
      }),
    ).resolves.toEqual({
      code: '600030',
      period: Period.ONE_MIN,
      count: 1,
      testOnly: true,
    });

    expect(tdxStreamingStrategy.unsubscribeForSecurity).toHaveBeenCalledWith(
      expect.objectContaining({
        ...security,
        sourceConfigs: [
          expect.objectContaining({
            source: DataSource.TDX,
            enabled: true,
            formatCode: '600030.SH',
          }),
        ],
      }),
    );
  });
});
