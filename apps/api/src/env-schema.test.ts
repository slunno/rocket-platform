import { describe, expect, it } from 'vitest';
import { envSchema } from './env-schema.js';

describe('configuração da API', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://rocket:local-password@localhost:5432/rocket?schema=public',
  };

  it('aplica valores padrão para desenvolvimento', () => {
    const result = envSchema.parse(validEnvironment);

    expect(result.API_PORT).toBe(4000);
    expect(result.DEMO_AUTH_ENABLED).toBe(false);
    expect(result.NODE_ENV).toBe('development');
  });

  it('rejeita URLs de banco de dados inválidas', () => {
    expect(envSchema.safeParse({ DATABASE_URL: 'http://localhost/db' }).success).toBe(false);
  });

  it('bloqueia autenticação demo em produção', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-with-at-least-32-characters',
      DEMO_AUTH_ENABLED: 'true',
    });

    expect(result.success).toBe(false);
  });

  it('bloqueia um segredo de exemplo em produção', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'replace-with-a-long-random-secret',
      DEMO_AUTH_ENABLED: 'false',
    });

    expect(result.success).toBe(false);
  });
});
