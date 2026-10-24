import { z } from 'zod';
import { MAX_ATTACHMENT_SIZE_BYTES } from '@rocket/shared';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(?:ql)?:/.test(value), {
        message: 'Use uma URL PostgreSQL válida.',
      }),
    REDIS_URL: z
      .string()
      .url()
      .refine((value) => /^rediss?:/.test(value), {
        message: 'Use uma URL Redis válida.',
      })
      .default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32).default('local-only-secret-change-before-deployment-000000000'),
    DEMO_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    MAIL_PROVIDER: z.enum(['log', 'smtp']).default('log'),
    MAIL_FROM: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
    STORAGE_REGION: z.string().trim().min(1).default('us-east-1'),
    STORAGE_BUCKET: z.string().trim().min(3).max(63).default('rocket-attachments'),
    STORAGE_ACCESS_KEY: z.string().trim().min(3).default('rocket-minio'),
    STORAGE_SECRET_KEY: z.string().min(8).default('rocket-minio-secret'),
    STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    STORAGE_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_ATTACHMENT_SIZE_BYTES)
      .default(MAX_ATTACHMENT_SIZE_BYTES),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    VAPID_PUBLIC_KEY: z.string().trim().min(20).max(200).optional(),
    VAPID_PRIVATE_KEY: z.string().trim().min(20).max(200).optional(),
    VAPID_SUBJECT: z
      .string()
      .trim()
      .refine((value) => /^(mailto:|https:\/\/)/i.test(value), {
        message: 'Use um endereço mailto: ou uma URL HTTPS para VAPID_SUBJECT.',
      })
      .optional(),
    LIVEKIT_URL: z
      .string()
      .url()
      .refine((value) => ['ws:', 'wss:'].includes(new URL(value).protocol), {
        message: 'Use um endereço ws:// ou wss:// do servidor LiveKit.',
      })
      .optional(),
    LIVEKIT_API_KEY: z.string().trim().min(1).max(256).optional(),
    LIVEKIT_API_SECRET: z.string().min(32).max(1024).optional(),
  })
  .superRefine((env, context) => {
    const vapidSettings = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
    if (vapidSettings.some(Boolean) && !vapidSettings.every(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['VAPID_PUBLIC_KEY'],
        message: 'Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT em conjunto.',
      });
    }
    const liveKitSettings = [env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET];
    if (liveKitSettings.some(Boolean) && !liveKitSettings.every(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['LIVEKIT_URL'],
        message: 'Configure LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET em conjunto.',
      });
    }
    if (env.NODE_ENV === 'production' && env.LIVEKIT_URL) {
      const protocol = new URL(env.LIVEKIT_URL).protocol;
      if (protocol !== 'wss:') {
        context.addIssue({
          code: 'custom',
          path: ['LIVEKIT_URL'],
          message: 'Use wss:// para o servidor LiveKit em produção.',
        });
      }
    }
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
    let redisHostname = '';
    try {
      redisHostname = new URL(env.REDIS_URL).hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '');
    } catch {
      // The field-level URL validation already reports malformed Redis URLs.
    }
    if (
      env.NODE_ENV === 'production' &&
      (redisHostname === 'localhost' ||
        redisHostname === '::1' ||
        redisHostname === '0.0.0.0' ||
        redisHostname.startsWith('127.'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'Configure um serviço Redis remoto e privado em produção.',
      });
    }
    if (env.NODE_ENV === 'production' && env.MAIL_PROVIDER !== 'smtp') {
      context.addIssue({
        code: 'custom',
        path: ['MAIL_PROVIDER'],
        message: 'Configure um provedor SMTP de e-mail em produção.',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      (env.STORAGE_ENDPOINT === 'http://localhost:9000' ||
        env.STORAGE_ACCESS_KEY === 'rocket-minio' ||
        env.STORAGE_SECRET_KEY === 'rocket-minio-secret')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_ENDPOINT'],
        message: 'Configure um serviço S3 e credenciais próprias em produção.',
      });
    }
    if (env.MAIL_PROVIDER === 'smtp') {
      const requiredMailSettings = [
        'MAIL_FROM',
        'SMTP_HOST',
        'SMTP_USER',
        'SMTP_PASSWORD',
      ] as const;
      requiredMailSettings.forEach((setting) => {
        if (!env[setting]?.trim()) {
          context.addIssue({
            code: 'custom',
            path: [setting],
            message: `${setting} é obrigatório quando MAIL_PROVIDER=smtp.`,
          });
        }
      });
    }
  });
