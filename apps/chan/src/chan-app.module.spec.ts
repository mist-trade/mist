import * as fs from 'fs';
import * as path from 'path';

describe('ChanAppModule', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'chan-app.module.ts'),
    'utf8',
  );

  it('registers a TypeORM root connection for imported repository modules', () => {
    expect(source).toContain('TypeOrmModule.forRootAsync');
    expect(source).toContain('ConfigService');
    expect(source).toContain('SecuritySourceConfig');
  });
});
