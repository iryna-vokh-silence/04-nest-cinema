import { validateEnv } from './env.validation';

const VALID = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'cinema',
  DB_PASSWORD: 'cinema',
  DB_NAME: 'cinema',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_ACCESS_TTL_MINUTES: '15',
  REFRESH_TOKEN_TTL_DAYS: '7',
};

describe('validateEnv', () => {
  it('converts and returns a valid configuration with defaults', () => {
    const env = validateEnv({ ...VALID });
    expect(env).toMatchObject({
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      PORT: 3000,
      DB_LOGGING: false,
      JWT_ACCESS_TTL_MINUTES: 15,
      REFRESH_TOKEN_TTL_DAYS: 7,
      BCRYPT_SALT_ROUNDS: 10,
    });
    expect(
      validateEnv({ ...VALID, PORT: '8080', DB_LOGGING: 'true' }),
    ).toMatchObject({ PORT: 8080, DB_LOGGING: true });
  });

  it.each(Object.keys(VALID))('refuses to start without %s', (key) => {
    const env: Record<string, unknown> = { ...VALID };
    delete env[key];
    expect(() => validateEnv(env)).toThrow(`${key} is required`);
  });

  it('rejects invalid values', () => {
    expect(() => validateEnv({ ...VALID, DB_PORT: 'abc' })).toThrow('DB_PORT');
    expect(() => validateEnv({ ...VALID, DB_PORT: '70000' })).toThrow(
      'DB_PORT',
    );
    expect(() => validateEnv({ ...VALID, DB_HOST: '' })).toThrow('DB_HOST');
    expect(() => validateEnv({ ...VALID, PORT: '3.5' })).toThrow('PORT');
    expect(() => validateEnv({ ...VALID, DB_LOGGING: 'yes' })).toThrow(
      'DB_LOGGING',
    );
  });

  it('validates the authentication settings', () => {
    const bad: Record<string, string>[] = [
      { JWT_ACCESS_SECRET: 'short' },
      { JWT_ACCESS_TTL_MINUTES: '0' },
      { JWT_ACCESS_TTL_MINUTES: '15m' },
      { JWT_ACCESS_TTL_MINUTES: '1441' },
      { REFRESH_TOKEN_TTL_DAYS: '0' },
      { REFRESH_TOKEN_TTL_DAYS: '7d' },
      { REFRESH_TOKEN_TTL_DAYS: '366' },
      { BCRYPT_SALT_ROUNDS: '3' },
      { BCRYPT_SALT_ROUNDS: '16' },
      { ADMIN_EMAIL: 'not-an-email' },
      { ADMIN_PASSWORD: 'short' },
    ];
    for (const override of bad) {
      const [key] = Object.keys(override);
      expect(() => validateEnv({ ...VALID, ...override })).toThrow(key);
    }
    expect(
      validateEnv({
        ...VALID,
        BCRYPT_SALT_ROUNDS: '4',
        ADMIN_EMAIL: 'admin@cinema.local',
        ADMIN_PASSWORD: 'Admin12345',
      }),
    ).toMatchObject({
      BCRYPT_SALT_ROUNDS: 4,
      ADMIN_EMAIL: 'admin@cinema.local',
    });
  });
});
