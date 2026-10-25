import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { MIST_ENTITIES } from './entity-graph';

/**
 * TypeORM entity-graph guard.
 *
 * Boot failure class: an entity declares a relation to another entity that is
 * missing from an application's registered `entities` array. TypeORM throws
 * `Entity metadata for X#y was not found` inside buildMetadatas and the process
 * exits (container crash-loop). Production hit this twice on 2026-10-24.
 *
 * Two invariants are frozen here, both without a database:
 *   1. the shared catalog itself is relation-closed;
 *   2. every application derives its `entities` array from that catalog instead
 *      of keeping a hand-written subset.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');

const ROOT_INCONFIG_FILES = [
  'apps/mist/src/app.module.ts',
  'apps/schedule/src/schedule.module.ts',
  'apps/chan/src/chan-app.module.ts',
  'apps/signal/src/signal-app.module.ts',
  'apps/backtest/src/backtest-app.module.ts',
  'apps/mist/src/realtime/hil/realtime-subscription-hil.ts',
];

const ALLOWED_ENTITIES_ARRAY =
  /entities:\s*\[\.\.\.(MIST_ENTITIES|realtimeSubscriptionHilEntities)\]/;

function listTypeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTypeScriptFiles(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('TypeORM entity graph guard', () => {
  it('builds metadata for the shared catalog without missing relations', async () => {
    const dataSource = new DataSource({
      type: 'mysql',
      database: 'metadata-only',
      entities: [...MIST_ENTITIES],
      synchronize: false,
    });

    await expect(
      (
        dataSource as unknown as { buildMetadatas(): Promise<unknown> }
      ).buildMetadatas(),
    ).resolves.toBeUndefined();
  });

  it.each(ROOT_INCONFIG_FILES)(
    '%s derives its entities array from the shared catalog',
    (relativePath) => {
      const source = fs.readFileSync(
        path.join(REPO_ROOT, relativePath),
        'utf8',
      );
      expect(source).toContain('MIST_ENTITIES');
      const blocks = source.match(/entities:\s*\[[^\]]*\]/g) ?? [];
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block.replace(/\s+/g, ' ')).toMatch(ALLOWED_ENTITIES_ARRAY);
      }
    },
  );

  it('no application keeps a hand-written entities array', () => {
    const offenders: string[] = [];
    for (const file of listTypeScriptFiles(path.join(REPO_ROOT, 'apps'))) {
      const source = fs.readFileSync(file, 'utf8');
      const blocks = source.match(/entities:\s*\[[^\]]*\]/g) ?? [];
      for (const block of blocks) {
        if (!ALLOWED_ENTITIES_ARRAY.test(block)) {
          offenders.push(
            `${path.relative(REPO_ROOT, file)}: ${block.slice(0, 60)}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the notification entity list is the shared catalog', async () => {
    const { NOTIFICATION_ENTITIES } = await import(
      '../../../apps/notification/src/notification-entities'
    );
    expect(NOTIFICATION_ENTITIES.map((entity) => entity.name).sort()).toEqual(
      [...MIST_ENTITIES].map((entity) => entity.name).sort(),
    );
  });
});
