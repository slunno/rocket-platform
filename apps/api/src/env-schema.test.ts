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
    expect(result.MAIL_PROVIDER).toBe('log');
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

  it('exige e-mail SMTP configurado para produção', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-with-at-least-32-characters',
      DEMO_AUTH_ENABLED: 'false',
      MAIL_PROVIDER: 'smtp',
    });

    expect(result.success).toBe(false);
  });

  it('aceita a configuração SMTP completa em produção', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-with-at-least-32-characters',
      DEMO_AUTH_ENABLED: 'false',
      MAIL_PROVIDER: 'smtp',
      MAIL_FROM: 'Rocket <noreply@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'rocket',
      SMTP_PASSWORD: 'smtp-secret',
    });

    expect(result.success).toBe(true);
  });
});
