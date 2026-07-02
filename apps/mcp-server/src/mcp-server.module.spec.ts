import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('McpServerModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      mysql_server_host: 'localhost',
      mysql_server_username: 'root',
      mysql_server_password: 'password',
      mysql_server_database: 'mist_test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('does not register unimplemented Segment MCP tools as ordinary providers', async () => {
    const { McpServerModule } = await import('./mcp-server.module');
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, McpServerModule) ?? [];
    const providerNames = providers.map((provider: unknown) => {
      if (typeof provider === 'function') {
        return provider.name;
      }
      if (
        provider &&
        typeof provider === 'object' &&
        'provide' in provider &&
        typeof provider.provide === 'function'
      ) {
        return provider.provide.name;
      }
      return String(provider);
    });

    expect(providerNames).not.toContain('SegmentMcpService');
    expect(providerNames).not.toContain('create_segment');
    expect(providerNames).not.toContain('create_segment_channel');
  });
});
