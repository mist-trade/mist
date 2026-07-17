import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, SecurityStatus } from '@app/shared-data';
import { ExperimentalQmtAllowlistResolver } from './experimental-qmt-allowlist.resolver';

function buildResolver(raw: string, rows: unknown[] = []) {
  const query = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  const repository = { createQueryBuilder: jest.fn(() => query) };
  const config = { get: jest.fn(() => raw) } as unknown as ConfigService;
  return {
    resolver: new ExperimentalQmtAllowlistResolver(config, repository as never),
    query,
  };
}

describe('ExperimentalQmtAllowlistResolver', () => {
  it('allows an empty fail-closed allowlist', async () => {
    const { resolver } = buildResolver('');
    await expect(resolver.onModuleInit()).resolves.toBeUndefined();
    expect(resolver.entriesList).toEqual([]);
  });

  it.each([
    ['600519.SH,600519.SH', 'duplicate'],
    ['1.SH,2.SH,3.SH,4.SH,5.SH,6.SH', 'maximum is 5'],
  ])('rejects invalid list %s', async (raw, message) => {
    const { resolver } = buildResolver(raw);
    await expect(resolver.onModuleInit()).rejects.toThrow(message);
  });

  it.each<[unknown[]]>([[[]], [[{ securityId: 1 }, { securityId: 2 }]]])(
    'fails closed unless exact resolution is unique',
    async (rows) => {
      const { resolver } = buildResolver('600519.SH', rows);
      await expect(resolver.onModuleInit()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('resolves one enabled active QMT identity case-sensitively', async () => {
    const row = { formatCode: '600519.SH', securityId: 7 };
    const { resolver, query } = buildResolver('600519.SH', [row]);
    await resolver.onModuleInit();

    expect(query.where).toHaveBeenCalledWith('cfg.source = :source', {
      source: DataSource.QMT,
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      'BINARY cfg.formatCode = :formatCode',
      { formatCode: '600519.SH' },
    );
    expect(query.andWhere).toHaveBeenCalledWith('cfg.enabled = :enabled', {
      enabled: true,
    });
    expect(query.andWhere).toHaveBeenCalledWith('sec.status = :status', {
      status: SecurityStatus.ACTIVE,
    });
    expect(resolver.entriesList).toEqual([row]);
    expect(resolver.isAuthorized('600519.SH')).toBe(true);
    expect(resolver.isAuthorized('600519.sh')).toBe(false);
  });
});
