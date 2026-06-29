import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MIGRATION_DIR = 'deploy/database/migrations';

export function loadMigrationConfig(env = process.env) {
  const database = readRequiredEnv(env, 'mysql_server_database');
  assertMysqlIdentifier(database, 'mysql_server_database');

  return {
    host: readRequiredEnv(env, 'mysql_server_host'),
    port: parsePort(env.mysql_server_port || '3306'),
    user: readRequiredEnv(env, 'mysql_server_username'),
    password: readRequiredEnv(env, 'mysql_server_password'),
    database,
  };
}

export async function runMigrations({
  env = process.env,
  migrationDir = env.MIGRATION_DIR || join(process.cwd(), DEFAULT_MIGRATION_DIR),
  mysqlModule,
  logger = console,
} = {}) {
  const config = loadMigrationConfig(env);
  const mysql = mysqlModule || (await import('mysql2/promise'));
  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true,
  });

  try {
    logger.log(`Run database migrations from ${migrationDir}`);
    await ensureMigrationTable(connection);

    const migrations = await listMigrationFiles(migrationDir);
    if (migrations.length === 0) {
      logger.warn(`No migration files found in ${migrationDir}`);
      return;
    }

    for (const migration of migrations) {
      const applied = await isMigrationApplied(connection, migration.name);
      if (applied) {
        logger.log(`Already applied ${migration.name}`);
        continue;
      }

      logger.log(`Applying ${migration.name}`);
      const sql = await readFile(migration.path, 'utf8');
      await connection.query(sql);
      await recordMigration(connection, migration.name);
      logger.log(`Applied ${migration.name}`);
    }
  } finally {
    await connection.end();
  }
}

async function ensureMigrationTable(connection) {
  await connection.execute(`
CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
  \`version\` varchar(190) NOT NULL,
  \`applied_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`version\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
}

async function listMigrationFiles(migrationDir) {
  const entries = await readdir(migrationDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({
      name: entry.name,
      path: join(migrationDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function isMigrationApplied(connection, version) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) AS count FROM `schema_migrations` WHERE `version` = ?',
    [version],
  );
  const first = Array.isArray(rows) ? rows[0] : undefined;
  return Number(first?.count || 0) > 0;
}

async function recordMigration(connection, version) {
  await connection.execute(
    'INSERT INTO `schema_migrations` (`version`) VALUES (?)',
    [version],
  );
}

function readRequiredEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`mysql_server_port must be a valid TCP port: ${value}`);
  }
  return port;
}

function assertMysqlIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(
      `${label} must contain only letters, numbers, and underscores: ${value}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
