import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appModulePaths = [
  'apps/mist/src/app.module.ts',
  'apps/chan/src/chan-app.module.ts',
  'apps/schedule/src/schedule.module.ts',
  'apps/mcp-server/src/mcp-server.module.ts',
];

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('database schema safety', () => {
  it.each(appModulePaths)(
    '%s disables TypeORM synchronize explicitly',
    (modulePath) => {
      const source = readRepoFile(modulePath);

      expect(source).toContain('synchronize: false');
      expect(source).not.toMatch(
        /synchronize:\s*configService\.get\(['"]NODE_ENV['"]\)\s*!==\s*['"]production['"]/,
      );
    },
  );
});
