import { describe, expect, it } from 'vitest';
import {
  loginInputSchema,
  messageInputSchema,
  messageUpdateInputSchema,
  paginationQuerySchema,
  reactionInputSchema,
  typingInputSchema,
  channelCreateInputSchema,
  channelPreferenceInputSchema,
  memberInputSchema,
  fileListQuerySchema,
  globalSearchQuerySchema,
  profileUpdateInputSchema,
  registerInputSchema,
  teamCreateInputSchema,
  userSummarySchema,
  workspaceInviteInputSchema,
  workspaceInviteAcceptInputSchema,
  workspaceMemberRoleUpdateInputSchema,
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

  it('permite mensagem composta só por anexos, respeitando tipo e tamanho', () => {
    expect(
      messageInputSchema.safeParse({
        text: '',
        attachments: [{ fileName: 'colecao.png', mimeType: 'image/png', sizeBytes: 1024 }],
      }).success,
    ).toBe(true);
    expect(messageInputSchema.safeParse({ text: '', attachments: [] }).success).toBe(false);
    expect(
      messageInputSchema.safeParse({
        text: '',
        attachments: [{ fileName: 'script.svg', mimeType: 'image/svg+xml', sizeBytes: 100 }],
      }).success,
    ).toBe(false);
  });

  it('valida paginação de mensagens por cursor', () => {
    expect(paginationQuerySchema.parse({ cursor: 'msg-anterior' })).toEqual({
      limit: 50,
      cursor: 'msg-anterior',
    });
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ cursor: ' ' }).success).toBe(false);
  });

  it('valida busca e ordenação de arquivos', () => {
    expect(fileListQuerySchema.parse({ query: '  look  ', sortBy: 'size' })).toEqual({
      query: 'look',
      sortBy: 'size',
      limit: 50,
    });
    expect(fileListQuerySchema.safeParse({ sortBy: 'unknown' }).success).toBe(false);
  });

  it('normaliza e valida filtros da busca global', () => {
    expect(
      globalSearchQuerySchema.parse({ q: '  planejamento  ', workspaceId: 'space-1' }),
    ).toMatchObject({
      q: 'planejamento',
      workspaceId: 'space-1',
      type: 'all',
      hasAttachment: 'any',
      limit: 5,
    });
    expect(
      globalSearchQuerySchema.safeParse({
        q: 'ata',
        workspaceId: 'space-1',
        after: '2026-10-24T00:00:00.000Z',
        before: '2026-10-23T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(globalSearchQuerySchema.safeParse({ q: 'x', workspaceId: 'space-1' }).success).toBe(
      false,
    );
    expect(
      globalSearchQuerySchema.safeParse({ q: 'agenda', workspaceId: 'space-1', limit: 11 }).success,
    ).toBe(false);
  });

  it('valida conteúdo de edição e reações', () => {
    expect(messageUpdateInputSchema.parse({ text: '  Corrigida.  ' }).text).toBe('Corrigida.');
    expect(messageUpdateInputSchema.safeParse({ text: ' ' }).success).toBe(false);
    expect(reactionInputSchema.parse({ emoji: ' 👍 ' }).emoji).toBe('👍');
    expect(reactionInputSchema.safeParse({ emoji: '' }).success).toBe(false);
  });

  it('valida o alvo e o estado de digitação do socket', () => {
    expect(
      typingInputSchema.parse({ targetType: 'CHANNEL', targetId: 'channel-1', isTyping: true }),
    ).toMatchObject({ targetType: 'CHANNEL', isTyping: true });
    expect(
      typingInputSchema.safeParse({ targetType: 'WORKSPACE', targetId: 'w-1', isTyping: true })
        .success,
    ).toBe(false);
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

  it('valida equipes e canais com descrição opcional e visibilidade explícita', () => {
    expect(
      teamCreateInputSchema.parse({
        name: 'Produto e Estilo',
        description: 'Coleção e modelagem.',
      }),
    ).toMatchObject({
      name: 'Produto e Estilo',
    });
    expect(
      channelCreateInputSchema.parse({ name: 'Coleção', visibility: 'PRIVATE' }),
    ).toMatchObject({
      name: 'Coleção',
      visibility: 'PRIVATE',
    });
    expect(channelCreateInputSchema.safeParse({ name: 'x', visibility: 'INTERNAL' }).success).toBe(
      false,
    );
  });

  it('normaliza e valida convites, membros e preferências pessoais de canal', () => {
    expect(
      workspaceInviteInputSchema.parse({ email: '  PESSOA@EXAMPLE.COM ', teamId: 'team-1' }),
    ).toMatchObject({
      email: 'pessoa@example.com',
      role: 'MEMBER',
      teamId: 'team-1',
    });
    expect(
      workspaceInviteInputSchema.safeParse({ email: 'pessoa@example.com', role: 'OWNER' }).success,
    ).toBe(false);
    expect(workspaceInviteAcceptInputSchema.safeParse({ token: 'x'.repeat(32) }).success).toBe(
      true,
    );
    expect(workspaceInviteAcceptInputSchema.safeParse({ token: 'curto' }).success).toBe(false);
    expect(memberInputSchema.safeParse({ userId: '' }).success).toBe(false);
    expect(channelPreferenceInputSchema.parse({ favorite: true })).toEqual({ favorite: true });
    expect(channelPreferenceInputSchema.safeParse({}).success).toBe(false);
  });

  it('aceita somente funções que podem ser atribuídas a membros do espaço', () => {
    expect(workspaceMemberRoleUpdateInputSchema.parse({ role: 'ADMIN' })).toEqual({
      role: 'ADMIN',
    });
    expect(workspaceMemberRoleUpdateInputSchema.safeParse({ role: 'OWNER' }).success).toBe(false);
  });
});
