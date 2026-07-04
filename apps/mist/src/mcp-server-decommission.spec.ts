import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function repoPath(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function readRepoFile(relativePath: string): string {
  return readFileSync(repoPath(relativePath), 'utf8');
}

describe('MCP server decommission', () => {
  it('keeps the MCP server runtime deleted from active backend entrypoints', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      pkg?: { scripts?: string[] };
    };
    const nestCli = readRepoFile('nest-cli.json');
    const compose = readRepoFile('docker-compose.yml');

    expect(existsSync(repoPath('apps/mcp-server'))).toBe(false);
    expect(existsSync(repoPath('libs/constants/src/mcp-errors.ts'))).toBe(
      false,
    );

    expect(packageJson.bin ?? {}).not.toHaveProperty('mist-mcp');
    expect(packageJson.dependencies ?? {}).not.toHaveProperty(
      '@modelcontextprotocol/sdk',
    );
    expect(packageJson.dependencies ?? {}).not.toHaveProperty(
      '@rekog/mcp-nest',
    );

    for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
      expect(name).not.toContain('mcp');
      expect(command).not.toContain('mcp-server');
    }

    for (const scriptPath of packageJson.pkg?.scripts ?? []) {
      expect(scriptPath).not.toContain('mcp-server');
    }

    expect(nestCli).not.toContain('"mcp-server"');
    expect(compose).not.toContain('mcp-server');
    expect(compose).not.toContain('mist-mcp-server');
    expect(compose).not.toContain('8009');
  });
});
