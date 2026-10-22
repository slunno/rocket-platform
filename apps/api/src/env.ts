import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { envSchema } from './env-schema.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `- ${issue.path.join('.') || 'ambiente'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuração de ambiente inválida:\n${details}\nRevise o arquivo .env.example.`);
}

export const env = parsedEnv.data;
