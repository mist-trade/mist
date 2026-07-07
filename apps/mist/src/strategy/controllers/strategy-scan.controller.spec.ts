import { StrategyScanController } from './strategy-scan.controller';

describe('StrategyScanController', () => {
  it('delegates manual scan requests to the scan service', async () => {
    const service = {
      runScan: jest.fn().mockResolvedValue({ scannedStrategies: 1 }),
    };
    const controller = new StrategyScanController(service as any);
    const dto = { strategyDefinitionId: 1 };

    await expect(controller.runScan(dto)).resolves.toEqual({
      scannedStrategies: 1,
    });
    expect(service.runScan).toHaveBeenCalledWith(dto);
  });
});
