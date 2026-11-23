import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const sourceRoot = join(repositoryRoot, 'libs', 'pacore', 'src');
const runtimeFiles = typescriptFiles(sourceRoot).filter(
  (file) => !file.endsWith('.spec.ts'),
);

const forbiddenPackagePrefixes = [
  '@app',
  '@nestjs',
  'typeorm',
  'mysql2',
  'ioredis',
  'redis',
  'bullmq',
  'axios',
  'undici',
  'http',
  'https',
  'node:http',
  'node:https',
  'dotenv',
] as const;

describe('PaCore pure boundary', () => {
  it('is registered as one exact Nest library alias', () => {
    const nestConfig = JSON.parse(
      readFileSync(join(repositoryRoot, 'nest-cli.json'), 'utf8'),
    ) as {
      projects: Record<string, unknown>;
    };
    const tsConfig = JSON.parse(
      readFileSync(join(repositoryRoot, 'tsconfig.json'), 'utf8'),
    ) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as {
      jest: { moduleNameMapper: Record<string, string> };
    };

    expect(nestConfig.projects.pacore).toEqual({
      type: 'library',
      root: 'libs/pacore',
      entryFile: 'index',
      sourceRoot: 'libs/pacore/src',
      compilerOptions: {
        tsConfigPath: 'libs/pacore/tsconfig.lib.json',
      },
    });
    expect(tsConfig.compilerOptions.paths['@app/pacore']).toEqual([
      'libs/pacore/src/index.ts',
    ]);
    expect(tsConfig.compilerOptions.paths['@app/pacore/*']).toBeUndefined();
    expect(packageJson.jest.moduleNameMapper['^@app/pacore$']).toBe(
      '<rootDir>/libs/pacore/src/index.ts',
    );
  });

  it('keeps pacore free of forbidden external and internal dependencies', () => {
    const violations: string[] = [];

    for (const file of runtimeFiles) {
      const source = createSourceFile(file);

      ts.forEachChild(source, function visit(node) {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const specifier = node.moduleSpecifier.text;
          const isForbidden = forbiddenPackagePrefixes.some(
            (prefix) =>
              specifier === prefix || specifier.startsWith(`${prefix}/`),
          );

          if (isForbidden) {
            violations.push(
              `${toRelativePath(file)} imports forbidden package "${specifier}"`,
            );
          }
        }

        ts.forEachChild(node, visit);
      });
    }

    expect(violations).toEqual([]);
  });

  it('contains zero environment variable access', () => {
    const violations: string[] = [];

    for (const file of runtimeFiles) {
      const source = createSourceFile(file);

      ts.forEachChild(source, function visit(node) {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === 'env' &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'process'
        ) {
          violations.push(
            `${toRelativePath(file)} accesses process.env, which is forbidden in @app/pacore`,
          );
        }

        ts.forEachChild(node, visit);
      });
    }

    expect(violations).toEqual([]);
  });

  it('does not escape the pacore package using relative parent imports', () => {
    const violations: string[] = [];

    for (const file of runtimeFiles) {
      const source = createSourceFile(file);
      const fileDirectory = dirname(file);

      ts.forEachChild(source, function visit(node) {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text.startsWith('.')
        ) {
          const resolvedPath = resolve(
            fileDirectory,
            node.moduleSpecifier.text,
          );
          const relativeToSourceRoot = relative(sourceRoot, resolvedPath);

          if (
            relativeToSourceRoot.startsWith('..') ||
            resolve(fileDirectory, node.moduleSpecifier.text) === sourceRoot
          ) {
            violations.push(
              `${toRelativePath(file)} imports "${node.moduleSpecifier.text}" which escapes pacore`,
            );
          }
        }

        ts.forEachChild(node, visit);
      });
    }

    expect(violations).toEqual([]);
  });
});

function createSourceFile(filePath: string): ts.SourceFile {
  const content = readFileSync(filePath, 'utf8');
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function typescriptFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...typescriptFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRelativePath(filePath: string): string {
  return relative(repositoryRoot, filePath).split(sep).join('/');
}
