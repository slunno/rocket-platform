# API do Rocket

Todas as rotas abaixo usam o prefixo `/api`. Rotas de organização exigem `Authorization: Bearer <accessToken>`. A API valida corpos com schemas compartilhados do pacote `@rocket/shared` e responde erros no formato `{ "error": { "code": "...", "message": "..." } }`.

## Espaços de trabalho e membros

| Método e rota                                     | Ação                                                                             | Acesso                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /workspaces`                                 | Lista os espaços da pessoa autenticada e seus papéis.                            | Membro do espaço                                       |
| `POST /workspaces`                                | Cria espaço, proprietário, equipe `Geral` e canal `geral`.                       | Qualquer conta autenticada                             |
| `GET /workspaces/:workspaceId`                    | Retorna equipes e canais visíveis, incluindo associação e preferências pessoais. | Membro; convidado vê somente equipes associadas        |
| `PATCH /workspaces/:workspaceId`                  | Atualiza os dados do espaço.                                                     | Proprietário ou administrador                          |
| `GET /workspaces/:workspaceId/members`            | Lista o diretório do espaço.                                                     | Proprietário, administrador ou membro                  |
| `PATCH /workspaces/:workspaceId/members/:userId`  | Define `ADMIN`, `MEMBER` ou `GUEST`.                                             | Proprietário ou administrador, com restrições de papel |
| `DELETE /workspaces/:workspaceId/members/:userId` | Remove uma pessoa do espaço. O proprietário não pode ser removido.               | Proprietário ou administrador                          |

## Equipes

| Método e rota                           | Ação                                                     | Acesso                                                       |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `POST /workspaces/:workspaceId/teams`   | Cria equipe com canal público `geral`.                   | Proprietário ou administrador                                |
| `PATCH /teams/:teamId`                  | Atualiza nome ou descrição.                              | Proprietário ou administrador do espaço                      |
| `DELETE /teams/:teamId`                 | Arquiva equipe e canais associados.                      | Proprietário ou administrador do espaço                      |
| `POST /teams/:teamId/join`              | Entra em equipe e libera canais públicos.                | Membro do espaço; convidado somente se já associado à equipe |
| `POST /teams/:teamId/members`           | Adiciona pessoa do espaço à equipe.                      | Proprietário ou administrador                                |
| `GET /teams/:teamId/members`            | Lista membros da equipe.                                 | Proprietário, administrador ou participante da equipe        |
| `DELETE /teams/:teamId/members/:userId` | Remove membro; participante pode sair da própria equipe. | Proprietário/administrador ou a própria pessoa               |

## Canais

| Método e rota                                 | Ação                                                                                       | Acesso                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `POST /teams/:teamId/channels`                | Cria canal `PUBLIC` ou `PRIVATE`.                                                          | Proprietário ou administrador do espaço           |
| `PATCH /channels/:channelId`                  | Atualiza nome, descrição ou visibilidade.                                                  | Proprietário ou administrador do espaço           |
| `DELETE /channels/:channelId`                 | Arquiva o canal.                                                                           | Proprietário ou administrador do espaço           |
| `POST /channels/:channelId/members`           | Adiciona pessoa do espaço a canal privado.                                                 | Proprietário ou administrador                     |
| `GET /channels/:channelId/members`            | Lista participantes ou, para canal público, participantes da equipe.                       | Participante; gestor pode consultar canal privado |
| `DELETE /channels/:channelId/members/:userId` | Retira participante de canal privado; pessoa pode sair do próprio canal.                   | Proprietário/administrador ou a própria pessoa    |
| `PATCH /channels/:channelId/preference`       | Atualiza `favorite` e/ou `hidden` da própria pessoa.                                       | Participante do canal                             |
| `GET /channels/:channelId/messages`           | Lista uma página de mensagens; aceita `limit` e `cursor` para buscar o histórico anterior. | Participante autorizado                           |
| `POST /channels/:channelId/messages`          | Publica mensagem com `clientMessageId` idempotente e emite `message:created` no canal.     | Participante autorizado                           |

## Convites

| Método e rota                                       | Ação                                                                    | Acesso                          |
| --------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `POST /workspaces/:workspaceId/invites`             | Envia convite por e-mail e retorna também o link para compartilhamento. | Proprietário ou administrador   |
| `GET /workspaces/:workspaceId/invites`              | Lista convites ativos ou já aceitos, sem expor o token.                 | Proprietário ou administrador   |
| `DELETE /workspaces/:workspaceId/invites/:inviteId` | Cancela convite ainda não aceito.                                       | Proprietário ou administrador   |
| `POST /invites/accept`                              | Aceita token vigente com a conta autenticada do destinatário.           | Conta com e-mail correspondente |

## Chats

`GET /conversations`, `GET /conversations/:conversationId/messages` e `POST /conversations/:conversationId/messages` permanecem reservadas a conversas `DIRECT` e `GROUP`. Canais usam `channelId` e as rotas dedicadas acima.

As rotas de mensagens recebem `limit` (1–100, padrão 50) e um `cursor` opcional identificado pela mensagem mais antiga da página atual. A resposta de listagem contém `{ "items": [...], "nextCursor": "..." }`; `nextCursor` é `null` quando não há mensagens anteriores. Envios podem incluir `clientMessageId` UUID, único por pessoa e conversa/canal, para retries retornarem a mesma mensagem em vez de criar uma duplicata.
