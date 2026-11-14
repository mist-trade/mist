import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { SyncCheckpointManager } from './sync-checkpoint.manager';

describe('SyncCheckpointManager', () => {
  const testDir = path.resolve(__dirname, '../../../../../.data-test');
  const testFile = path.resolve(testDir, 'test-checkpoints.json');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('initializes empty checkpoints and updates single checkpoint correctly', () => {
    const manager = new SyncCheckpointManager(testFile);
    expect(manager.getCheckpoint('tdx', '880003')).toBeNull();

    manager.updateCheckpoint(1, '880003', 'tdx', '2026-11-10');
    const cp = manager.getCheckpoint('tdx', '880003');
    expect(cp).not.toBeNull();
    expect(cp?.verifiedUntil).toBe('2026-11-10');
    expect(cp?.symbol).toBe('880003');

    // Persistence check: read from disk with another manager instance
    const manager2 = new SyncCheckpointManager(testFile);
    const cp2 = manager2.getCheckpoint('tdx', '880003');
    expect(cp2?.verifiedUntil).toBe('2026-11-10');
  });

  it('guarantees monotonic advance of verifiedUntil', () => {
    const manager = new SyncCheckpointManager(testFile);
    manager.updateCheckpoint(1, '600000', 'qmt', '2026-11-10');

    // Attempting to move backward is ignored
    manager.updateCheckpoint(1, '600000', 'qmt', '2026-11-05');
    expect(manager.getCheckpoint('qmt', '600000')?.verifiedUntil).toBe(
      '2026-11-10',
    );

    // Monotonic advance succeeds
    manager.updateCheckpoint(1, '600000', 'qmt', '2026-11-12');
    expect(manager.getCheckpoint('qmt', '600000')?.verifiedUntil).toBe(
      '2026-11-12',
    );
  });

  it('resolves cleanly in NestJS DI container without string token error', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SyncCheckpointManager],
    }).compile();

    const manager = moduleRef.get<SyncCheckpointManager>(SyncCheckpointManager);
    expect(manager).toBeDefined();
    expect(manager).toBeInstanceOf(SyncCheckpointManager);
  });
});
