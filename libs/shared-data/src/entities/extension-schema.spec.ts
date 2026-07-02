import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('extension entity schema metadata', () => {
  it('keeps KExtensionEf.outerVolume number-compatible with decimal schema', () => {
    const source = readRepoFile(
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
    );

    expect(source).toMatch(/outerVolume:\s*number\s*(?:\|\s*null)?\s*=/);
    expect(source).not.toMatch(/outerVolume:\s*bigint/);
  });

  it('keeps nullable KExtensionEf fields nullable in TypeScript defaults', () => {
    const source = readRepoFile(
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
    );

    for (const field of [
      'fullCode',
      'amplitude',
      'changePct',
      'changeAmt',
      'turnoverRate',
      'volumeCount',
      'innerVolume',
      'outerVolume',
      'prevClose',
      'prevOpen',
    ]) {
      expect(source).toMatch(
        new RegExp(`${field}:\\s*[^=;]+\\|\\s*null\\s*=\\s*null`),
      );
    }
    expect(source).not.toMatch(/=\s*0n?;/);
  });

  it('exposes kId columns for extension one-to-one keys', () => {
    const extensionEntityPaths = [
      'libs/shared-data/src/entities/k-extension-ef.entity.ts',
      'libs/shared-data/src/entities/k-extension-tdx.entity.ts',
      'libs/shared-data/src/entities/k-extension-mqmt.entity.ts',
    ];

    for (const entityPath of extensionEntityPaths) {
      const source = readRepoFile(entityPath);

      expect(source).toContain("@Column({ name: 'k_id', select: false })");
      expect(source).toMatch(/kId!:\s*number/);
    }
  });

  it('keeps unique k_id keys in extension migration SQL', () => {
    const migration = readRepoFile(
      'deploy/database/migrations/001_init_core_tables.sql',
    );

    for (const table of [
      'k_extensions_ef',
      'k_extensions_tdx',
      'k_extensions_mqmt',
    ]) {
      expect(migration).toContain(`UNIQUE KEY \`uq_${table}_k_id\` (\`k_id\`)`);
    }
  });
});
