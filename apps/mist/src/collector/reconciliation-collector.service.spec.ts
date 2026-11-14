import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Security, SecurityStatus } from '@app/shared-data';
import { toZonedTime } from 'date-fns-tz';
import { ReconciliationCollectorService } from './reconciliation-collector.service';
import { KlineVerificationValidator } from './helpers/kline-verification.validator';

describe('ReconciliationCollectorService', () => {
  let service: ReconciliationCollectorService;
  let mockEntityManager: any;
  let mockAssignmentRepo: any;
  let mockSecurityRepo: any;
  let mockSyncEventRepo: any;
  let mockTimezoneService: any;
  let mockCheckpointManager: any;
  let validator: KlineVerificationValidator;

  beforeEach(() => {
    mockEntityManager = {
      transaction: jest.fn(async (cb) => {
        const txManager = {
          create: jest.fn((_entityClass, data) => ({ ...data })),
          save: jest.fn(async (_entityClass, data) => data),
          find: jest.fn(async () => [
            {
              id: '1',
              timestamp: new Date('2023-11-14T00:00:00Z'),
            },
          ]),
          createQueryBuilder: jest.fn(() => ({
            insert: jest.fn().mockReturnThis(),
            into: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orUpdate: jest.fn().mockReturnThis(),
            updateEntity: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ raw: [] }),
          })),
        };
        return cb(txManager);
      }),
    };

    mockAssignmentRepo = {
      find: jest.fn(),
    };

    mockSecurityRepo = {
      findOne: jest.fn(),
    };

    mockSyncEventRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (data) => data),
    };

    mockTimezoneService = {
      getCurrentBeijingTime: jest.fn(() =>
        toZonedTime(new Date('2026-11-12T08:00:00Z'), 'Asia/Shanghai'),
      ),
      isTradingDay: jest.fn(async () => true),
      resolvePreviousTradingDay: jest.fn(
        async () => new Date('2026-11-11T15:00:00+08:00'),
      ),
      formatTradingDay: jest.fn((d: Date) => d.toISOString().slice(0, 10)),
    };

    mockCheckpointManager = {
      getCheckpoint: jest.fn(),
      updateCheckpoint: jest.fn(),
    };

    validator = new KlineVerificationValidator();

    service = new ReconciliationCollectorService(
      mockEntityManager,
      mockAssignmentRepo,
      mockSecurityRepo,
      mockSyncEventRepo,
      mockTimezoneService,
      mockCheckpointManager,
      validator,
    );
  });

  describe('generateManifest', () => {
    it('rejects invalid source parameters', async () => {
      await expect(service.generateManifest('invalid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('generates manifest for TDX with assigned securities and 880003, strictly excluding 1m', async () => {
      const assignedSec = { id: 10, code: '600000' } as Security;
      mockAssignmentRepo.find.mockResolvedValue([
        {
          security: assignedSec,
          sourceConfig: { source: DataSource.TDX },
        },
      ]);

      const avgPriceSec = { id: 99, code: '880003' } as Security;
      mockSecurityRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.code === '880003') return avgPriceSec;
        return null;
      });

      mockCheckpointManager.getCheckpoint.mockImplementation(
        (_src: string, code: string) => {
          if (code === '600000') {
            return { verifiedUntil: '2026-11-10' };
          }
          return null;
        },
      );

      const manifest = await service.generateManifest('tdx');
      expect(manifest.source).toBe('tdx');
      expect(manifest.targetTradingDay).toBe('2026-11-12');

      const symbols = manifest.items.map((i) => i.symbol);
      expect(symbols).toContain('600000');
      expect(symbols).toContain('880003');

      // Schema check: 1m is strictly excluded!
      for (const item of manifest.items) {
        expect(item.periods).toEqual(
          expect.arrayContaining(['1d', '5m', '30m']),
        );
        expect(item.periods).not.toContain('1m');
      }

      // Checkpoint gap check
      const sec600000 = manifest.items.find((i) => i.symbol === '600000');
      expect(sec600000?.startDate).toBe('2026-11-10');
      expect(sec600000?.endDate).toBe('2026-11-12');
    });

    it('generates manifest for QMT with assigned securities and index bundle (000001, 399006, 000688)', async () => {
      mockAssignmentRepo.find.mockResolvedValue([]);
      mockSecurityRepo.findOne.mockImplementation(async ({ where }: any) => {
        return { id: 1, code: where.code } as Security;
      });

      const manifest = await service.generateManifest('qmt');
      expect(manifest.source).toBe('qmt');
      const symbols = manifest.items.map((i) => i.symbol);
      expect(symbols).toEqual(
        expect.arrayContaining(['000001', '399006', '000688']),
      );
      expect(symbols).not.toContain('880003');
    });
  });

  describe('pushBars', () => {
    it('throws NotFoundException if security does not exist', async () => {
      mockSecurityRepo.findOne.mockResolvedValue(null);
      await expect(
        service.pushBars({
          source: 'tdx',
          symbol: 'UNKNOWN',
          period: '1d',
          bars: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('exempts zero bars on suspended security', async () => {
      const sec = {
        id: 1,
        code: '000001',
        status: SecurityStatus.SUSPENDED,
      } as Security;
      mockSecurityRepo.findOne.mockResolvedValue(sec);

      const result = await service.pushBars({
        source: 'tdx',
        symbol: '000001',
        period: '1d',
        bars: [],
      });

      expect(result.success).toBe(true);
      expect(result.barsSaved).toBe(0);
      expect(result.verification.status).toBe('PASSED');
    });

    it('rejects geometry violation and writes failed audit event', async () => {
      const sec = { id: 1, code: '000001', status: 1 } as Security;
      mockSecurityRepo.findOne.mockResolvedValue(sec);

      await expect(
        service.pushBars({
          source: 'tdx',
          symbol: '000001',
          period: '1d',
          bars: [
            {
              timestamp: 1700000000,
              open: 10,
              high: 8, // high < open
              low: 7,
              close: 7.5,
              volume: 100,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSyncEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FAILED',
          verificationStatus: 'FAILED',
        }),
      );
    });

    it('saves compliant DAY bars, advances checkpoint and records audit event', async () => {
      const sec = { id: 1, code: '600000', status: 1 } as Security;
      mockSecurityRepo.findOne.mockResolvedValue(sec);

      const result = await service.pushBars({
        source: 'tdx',
        symbol: '600000',
        period: '1d',
        bars: [
          {
            timestamp: 1700000000, // 2023-11-14...
            open: 10,
            high: 11,
            low: 9.8,
            close: 10.5,
            volume: 5000,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.checkpointAdvanced).toBe(true);
      expect(mockCheckpointManager.updateCheckpoint).toHaveBeenCalledWith(
        1,
        '600000',
        'tdx',
        expect.any(String),
      );
    });
  });
});
