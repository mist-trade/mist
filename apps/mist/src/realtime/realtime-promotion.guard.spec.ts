import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';

describe('realtime promotion guard', () => {
  it('keeps retired contract names out of active backend sources', () => {
    const root = join(process.cwd(), 'apps/mist/src');
    const source = walk(root)
      .filter(
        (path) =>
          path.endsWith('.ts') &&
          !path.endsWith('realtime-promotion.guard.spec.ts'),
      )
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    for (const token of [
      'builtin_experimental',
      '/ws/tdx-experimental',
      '/ws/qmt-experimental',
      'tdx.experimental.snapshot',
      'qmt.experimental.snapshot',
      '/internal/experimental/',
    ]) {
      expect(source).not.toContain(token);
    }
  });
});

function walk(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
