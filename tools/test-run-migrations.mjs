import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations } from './run-migrations.mjs';

const env = {
  mysql_server_host: 'mysql',
  mysql_server_port: '3306',
  mysql_server_username: 'mist',
  mysql_server_password: 'secret',
  mysql_server_database: 'mist',
};

async function withMigrationDir(files, callback) {
  const dir = mkdtempSync(join(tmpdir(), 'mist-migrations-'));
  try {
    for (const [name, sql] of Object.entries(files)) {
      writeFileSync(join(dir, name), sql, 'utf8');
    }
    return await callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function createFakeMysql({ initiallyApplied = [], failOnSql = '' } = {}) {
  const applied = new Set(initiallyApplied);
  const appliedInsertions = [];
  const migrationQueries = [];
  const executeCalls = [];
  let connectionOptions;
  let ended = false;

  const connection = {
    async execute(sql, params = []) {
      executeCalls.push({ sql, params });

      if (sql.includes('SELECT COUNT(*)') && sql.includes('schema_migrations')) {
        const version = params[0];
        return [[{ count: applied.has(version) ? 1 : 0 }], []];
      }

      if (sql.includes('INSERT INTO `schema_migrations`')) {
        const version = params[0];
        applied.add(version);
        appliedInsertions.push(version);
        return [{ affectedRows: 1 }, []];
      }

      return [{ affectedRows: 0 }, []];
    },

    async query(sql) {
      if (failOnSql && sql.includes(failOnSql)) {
        throw new Error(`migration failed for ${failOnSql}`);
      }
      migrationQueries.push(sql);
      return [{ affectedRows: 0 }, []];
    },

    async end() {
      ended = true;
    },
  };

  const mysqlModule = {
    async createConnection(options) {
      connectionOptions = options;
      return connection;
    },
  };

  return {
    mysqlModule,
    getState() {
      return {
        applied,
        appliedInsertions,
        connectionOptions,
        ended,
        executeCalls,
        migrationQueries,
      };
    },
  };
}

describe('runMigrations', () => {
  it('applies SQL files in filename order and records applied versions', async () => {
    await withMigrationDir(
      {
        '002_second.sql': 'SELECT 2;',
        '001_first.sql': 'SELECT 1;',
      },
      async (migrationDir) => {
        const fakeMysql = createFakeMysql();

        await runMigrations({
          env,
          migrationDir,
          mysqlModule: fakeMysql.mysqlModule,
          logger: { log() {}, warn() {}, error() {} },
        });

        const state = fakeMysql.getState();
        assert.equal(state.connectionOptions.host, 'mysql');
        assert.equal(state.connectionOptions.port, 3306);
        assert.equal(state.connectionOptions.user, 'mist');
        assert.equal(state.connectionOptions.password, 'secret');
        assert.equal(state.connectionOptions.database, 'mist');
        assert.equal(state.connectionOptions.multipleStatements, true);
        assert.deepEqual(state.migrationQueries, ['SELECT 1;', 'SELECT 2;']);
        assert.deepEqual(state.appliedInsertions, [
          '001_first.sql',
          '002_second.sql',
        ]);
        assert.equal(state.ended, true);
      },
    );
  });

  it('skips migrations already recorded in schema_migrations', async () => {
    await withMigrationDir(
      {
        '001_first.sql': 'SELECT 1;',
        '002_second.sql': 'SELECT 2;',
      },
      async (migrationDir) => {
        const fakeMysql = createFakeMysql({
          initiallyApplied: ['001_first.sql'],
        });

        await runMigrations({
          env,
          migrationDir,
          mysqlModule: fakeMysql.mysqlModule,
          logger: { log() {}, warn() {}, error() {} },
        });

        const state = fakeMysql.getState();
        assert.deepEqual(state.migrationQueries, ['SELECT 2;']);
        assert.deepEqual(state.appliedInsertions, ['002_second.sql']);
      },
    );
  });

  it('does not record a migration version when SQL application fails', async () => {
    await withMigrationDir(
      {
        '001_bad.sql': 'SELECT FAIL;',
      },
      async (migrationDir) => {
        const fakeMysql = createFakeMysql({ failOnSql: 'FAIL' });

        await assert.rejects(
          () =>
            runMigrations({
              env,
              migrationDir,
              mysqlModule: fakeMysql.mysqlModule,
              logger: { log() {}, warn() {}, error() {} },
            }),
          /migration failed for FAIL/,
        );

        const state = fakeMysql.getState();
        assert.deepEqual(state.appliedInsertions, []);
        assert.equal(state.ended, true);
      },
    );
  });

  it('rejects unsafe database names before connecting', async () => {
    const fakeMysql = createFakeMysql();

    await assert.rejects(
      () =>
        runMigrations({
          env: { ...env, mysql_server_database: 'mist-prod' },
          migrationDir: tmpdir(),
          mysqlModule: fakeMysql.mysqlModule,
          logger: { log() {}, warn() {}, error() {} },
        }),
      /mysql_server_database must contain only letters, numbers, and underscores/,
    );

    assert.equal(fakeMysql.getState().connectionOptions, undefined);
  });
});
