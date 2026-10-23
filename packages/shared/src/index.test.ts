import { describe, expect, it } from 'vitest';
import {
  loginInputSchema,
  messageInputSchema,
  profileUpdateInputSchema,
  registerInputSchema,
  userSummarySchema,
} from './index.js';

describe('contratos compartilhados', () => {
  it('normaliza espaços e aceita mensagens com até 10.000 caracteres', () => {
    const parsed = messageInputSchema.parse({ text: '  Olá, equipe!  ' });

    expect(parsed.text).toBe('Olá, equipe!');
  });

  it('rejeita mensagem vazia ou acima do limite', () => {
    expect(messageInputSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(messageInputSchema.safeParse({ text: 'a'.repeat(10_001) }).success).toBe(false);
  });

  it('valida os campos básicos de perfil retornados pela API', () => {
    expect(
      userSummarySchema.safeParse({
        id: 'user-1',
        username: 'ana.souza',
        displayName: 'Ana Souza',
        status: 'ONLINE',
      }).success,
    ).toBe(true);
    expect(
      userSummarySchema.safeParse({
        id: 'user-2',
        username: 'joao',
        displayName: 'João',
        status: 'DO_NOT_DISTURB',
      }).success,
    ).toBe(true);
  });

  it('normaliza e valida credenciais de autenticação', () => {
    expect(
      registerInputSchema.parse({
        email: '  ANA@EXAMPLE.COM ',
        password: 'a-strong-password-2026',
        displayName: ' Ana Souza ',
      }),
    ).toMatchObject({ email: 'ana@example.com', displayName: 'Ana Souza' });
    expect(loginInputSchema.safeParse({ email: 'bad-email', password: 'x' }).success).toBe(false);
    expect(
      registerInputSchema.safeParse({
        email: 'ana@example.com',
        password: 'short',
        displayName: 'Ana Souza',
      }).success,
    ).toBe(false);
  });

  it('valida atualização dos campos manuais do perfil', () => {
    expect(
      profileUpdateInputSchema.safeParse({
        status: 'BUSY',
        statusMessage: 'Em uma reunião',
        locale: 'pt-BR',
      }).success,
    ).toBe(true);
    expect(profileUpdateInputSchema.safeParse({ status: 'UNKNOWN' }).success).toBe(false);
  });
});
