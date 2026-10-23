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
    expect(result.REDIS_URL).toBe('redis://localhost:6379');
    expect(result.MAIL_PROVIDER).toBe('log');
  });

  it('aceita VAPID completo e rejeita a configuração parcial', () => {
    expect(
      envSchema.safeParse({
        ...validEnvironment,
        VAPID_PUBLIC_KEY: 'public-vapid-key-that-is-long-enough',
        VAPID_PRIVATE_KEY: 'private-vapid-key-that-is-long-enough',
        VAPID_SUBJECT: 'mailto:ti@example.com',
      }).success,
    ).toBe(true);
    expect(
      envSchema.safeParse({
        ...validEnvironment,
        VAPID_PUBLIC_KEY: 'public-vapid-key-that-is-long-enough',
      }).success,
    ).toBe(false);
  });

  it('rejeita URLs de banco de dados inválidas', () => {
    expect(envSchema.safeParse({ DATABASE_URL: 'http://localhost/db' }).success).toBe(false);
  });

  it('rejeita Redis local em produção', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-with-at-least-32-characters',
      DEMO_AUTH_ENABLED: 'false',
      MAIL_PROVIDER: 'smtp',
      MAIL_FROM: 'Rocket <noreply@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'rocket',
      SMTP_PASSWORD: 'smtp-secret',
      REDIS_URL: 'rediss://localhost:6379',
      STORAGE_ENDPOINT: 'https://s3.example.com',
      STORAGE_ACCESS_KEY: 'production-access',
      STORAGE_SECRET_KEY: 'production-storage-secret',
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.path[0] === 'REDIS_URL')).toBe(true);
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
      REDIS_URL: 'rediss://cache.example.com:6380',
    });

    expect(result.success).toBe(false);
  });

  it('exige endpoint e credenciais de storage próprios em produção', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-with-at-least-32-characters',
      DEMO_AUTH_ENABLED: 'false',
      MAIL_PROVIDER: 'smtp',
      REDIS_URL: 'rediss://cache.example.com:6380',
      MAIL_FROM: 'Rocket <noreply@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'rocket',
      SMTP_PASSWORD: 'smtp-secret',
      STORAGE_ENDPOINT: 'https://s3.example.com',
      STORAGE_ACCESS_KEY: 'production-access',
      STORAGE_SECRET_KEY: 'production-storage-secret',
    });

    expect(result.success).toBe(true);
    expect(
      envSchema.safeParse({
        ...validEnvironment,
        NODE_ENV: 'production',
        JWT_SECRET: 'production-secret-with-at-least-32-characters',
        DEMO_AUTH_ENABLED: 'false',
        MAIL_PROVIDER: 'smtp',
        MAIL_FROM: 'Rocket <noreply@example.com>',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'rocket',
        SMTP_PASSWORD: 'smtp-secret',
      }).success,
    ).toBe(false);
  });

  it('aceita a configuração SMTP completa em produção', () => {
    const result = envSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-with-at-least-32-characters',
      DEMO_AUTH_ENABLED: 'false',
      MAIL_PROVIDER: 'smtp',
      REDIS_URL: 'rediss://cache.example.com:6380',
      MAIL_FROM: 'Rocket <noreply@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'rocket',
      SMTP_PASSWORD: 'smtp-secret',
      STORAGE_ENDPOINT: 'https://s3.example.com',
      STORAGE_ACCESS_KEY: 'production-access',
      STORAGE_SECRET_KEY: 'production-storage-secret',
    });

    expect(result.success).toBe(true);
  });
});
