import { DataSource, EntitySchema } from 'typeorm';
import { StrategyBacktestService } from './strategy-backtest.service';

type CursorIntegrationRow = {
  id: number;
  eventTime: Date;
};

const mysqlUrl = process.env.MIST_TEST_MYSQL_URL;
const describeMysql = mysqlUrl ? describe : describe.skip;
const tableName = `backtest_cursor_integration_${process.pid}`;
const CursorIntegrationEntity = new EntitySchema<CursorIntegrationRow>({
  name: 'BacktestCursorIntegrationRow',
  tableName,
  columns: {
    id: { type: Number, primary: true, generated: true },
    eventTime: {
      name: 'event_time',
      type: 'datetime',
      precision: 6,
    },
  },
  indices: [
    {
      name: `idx_${tableName}_time_id`,
      columns: ['eventTime', 'id'],
    },
  ],
});

describeMysql('StrategyBacktestService MySQL cursor integration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mysql',
      url: mysqlUrl,
      timezone: 'Z',
      entities: [CursorIntegrationEntity],
    });
    await dataSource.initialize();
    await dataSource.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    await dataSource.query(`
      CREATE TABLE \`${tableName}\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`event_time\` datetime(6) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_${tableName}_time_id\` (\`event_time\`, \`id\`)
      ) ENGINE=InnoDB
    `);
    await dataSource.query(`
      INSERT INTO \`${tableName}\` (\`event_time\`) VALUES
        ('2026-01-02 00:00:00.123456'),
        ('2026-01-02 00:00:00.123456'),
        ('2026-01-02 00:00:00.123457'),
        ('2026-01-03 00:00:00.000001')
    `);
  }, 30_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    await dataSource.destroy();
  });

  it('does not skip or duplicate rows across datetime(6)/id boundaries', async () => {
    const repository = dataSource.getRepository(CursorIntegrationEntity);
    const service = new StrategyBacktestService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const queryPage = async (
      direction: 'ASC' | 'DESC',
      cursor?: string,
    ): Promise<{
      items: CursorIntegrationRow[];
      nextCursor: string | null;
    }> =>
      (await (service as any).queryCursorPage(
        repository.createQueryBuilder('cursorRow').where('1 = 1'),
        'cursorRow',
        'eventTime',
        direction,
        { limit: 2, cursor },
      )) as {
        items: CursorIntegrationRow[];
        nextCursor: string | null;
      };

    const firstAscending = await queryPage('ASC');
    const ascendingCursor = JSON.parse(
      Buffer.from(firstAscending.nextCursor!, 'base64url').toString('utf8'),
    );
    const secondAscending = await queryPage(
      'ASC',
      firstAscending.nextCursor ?? undefined,
    );
    const firstDescending = await queryPage('DESC');
    const secondDescending = await queryPage(
      'DESC',
      firstDescending.nextCursor ?? undefined,
    );

    expect(firstAscending.items.map(({ id }) => id)).toEqual([1, 2]);
    expect(ascendingCursor).toEqual({
      time: '2026-01-02 00:00:00.123456',
      id: 2,
    });
    expect(secondAscending.items.map(({ id }) => id)).toEqual([3, 4]);
    expect(firstDescending.items.map(({ id }) => id)).toEqual([4, 3]);
    expect(secondDescending.items.map(({ id }) => id)).toEqual([2, 1]);
  });
});
