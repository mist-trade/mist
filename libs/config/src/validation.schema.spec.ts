import { mistEnvSchema } from './validation.schema';

const baseEnv = {
  mysql_server_host: 'localhost',
  mysql_server_username: 'mist',
  mysql_server_password: 'mist',
  mysql_server_database: 'mist',
};

describe('mistEnvSchema data source configuration', () => {
  it.each(['qmt', 'QMT'])('accepts DEFAULT_DATA_SOURCE=%s', (source) => {
    const { error, value } = mistEnvSchema.validate({
      ...baseEnv,
      DEFAULT_DATA_SOURCE: source,
    });

    expect(error).toBeUndefined();
    expect(value.DEFAULT_DATA_SOURCE).toBe(source);
  });

  it.each(['mqmt', 'MINI_QMT'])(
    'rejects legacy DEFAULT_DATA_SOURCE=%s',
    (source) => {
      const { error } = mistEnvSchema.validate({
        ...baseEnv,
        DEFAULT_DATA_SOURCE: source,
      });

      expect(error?.message).toContain('DEFAULT_DATA_SOURCE');
    },
  );

  it('validates QMT historical bars base URL and keeps realtime client id', () => {
    const { error, value } = mistEnvSchema.validate({
      ...baseEnv,
      QMT_BASE_URL: 'http://127.0.0.1:9002',
      QMT_WS_CLIENT_ID: 'mist-backend-qmt-live',
      QMT_REALTIME_MODE: 'builtin_experimental',
      QMT_EXPERIMENTAL_ALLOWLIST: '600519.SH',
    });

    expect(error).toBeUndefined();
    expect(value.QMT_BASE_URL).toBe('http://127.0.0.1:9002');
    expect(value.QMT_WS_CLIENT_ID).toBe('mist-backend-qmt-live');
    expect(value.QMT_REALTIME_MODE).toBe('builtin_experimental');
    expect(value.QMT_EXPERIMENTAL_ALLOWLIST).toBe('600519.SH');
  });

  it('defaults QMT realtime off and rejects unknown modes', () => {
    const defaults = mistEnvSchema.validate(baseEnv);
    expect(defaults.error).toBeUndefined();
    expect(defaults.value.QMT_REALTIME_MODE).toBe('off');

    const invalid = mistEnvSchema.validate({
      ...baseEnv,
      QMT_REALTIME_MODE: 'legacy',
    });
    expect(invalid.error?.message).toContain('QMT_REALTIME_MODE');
  });
});
