import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(?:ql)?:/.test(value), {
        message: 'Use uma URL PostgreSQL válida.',
      }),
    JWT_SECRET: z.string().min(32).default('local-only-secret-change-before-deployment-000000000'),
    DEMO_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  })
  .superRefine((env, context) => {
    if (
      env.NODE_ENV === 'production' &&
      [
        'local-only-secret-change-before-deployment-000000000',
        'replace-with-a-long-random-secret',
      ].includes(env.JWT_SECRET)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Defina um JWT_SECRET exclusivo com ao menos 32 caracteres em produção.',
      });
    }
    if (env.NODE_ENV === 'production' && env.DEMO_AUTH_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['DEMO_AUTH_ENABLED'],
        message: 'A autenticação demo deve ficar desativada em produção.',
      });
    }
  });
