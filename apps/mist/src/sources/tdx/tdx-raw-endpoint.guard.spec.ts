import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAW_TDX_ENDPOINT = '/v1/raw/tdx/call';

function collectProductionTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectProductionTsFiles(path));
      continue;
    }
    if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('TDX datasource raw endpoint guard', () => {
  it('keeps normal Mist source code off the raw TDX debug endpoint', () => {
    const sourceRoot = join(process.cwd(), 'apps', 'mist', 'src');
    const offenders = collectProductionTsFiles(sourceRoot).filter((file) =>
      readFileSync(file, 'utf8').includes(RAW_TDX_ENDPOINT),
    );

    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });
});
