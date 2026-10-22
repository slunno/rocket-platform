import { describe, expect, it } from 'vitest';
import { messageInputSchema, userSummarySchema } from './index.js';

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
  });
});
