# API do Rocket

Todas as rotas abaixo usam o prefixo `/api`. Rotas de organização exigem `Authorization: Bearer <accessToken>`. A API valida corpos com schemas compartilhados do pacote `@rocket/shared` e responde erros no formato `{ "error": { "code": "...", "message": "..." } }`.

## Espaços de trabalho e membros

| Método e rota                                     | Ação                                                                              | Acesso                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /workspaces`                                 | Lista os espaços da pessoa autenticada e seus papéis.                             | Membro do espaço                                       |
| `POST /workspaces`                                | Cria espaço, proprietário, equipe `Geral` e canal `geral`.                        | Qualquer conta autenticada                             |
| `GET /workspaces/:workspaceId`                    | Retorna equipes e canais visíveis, associação, não lidas e preferências pessoais. | Membro; convidado vê somente equipes associadas        |
| `PATCH /workspaces/:workspaceId`                  | Atualiza os dados do espaço.                                                      | Proprietário ou administrador                          |
| `GET /workspaces/:workspaceId/members`            | Lista o diretório do espaço.                                                      | Proprietário, administrador ou membro                  |
| `PATCH /workspaces/:workspaceId/members/:userId`  | Define `ADMIN`, `MEMBER` ou `GUEST`.                                              | Proprietário ou administrador, com restrições de papel |
| `DELETE /workspaces/:workspaceId/members/:userId` | Remove uma pessoa do espaço. O proprietário não pode ser removido.                | Proprietário ou administrador                          |

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
| `POST /channels/:channelId/read`              | Atualiza o marcador pessoal de leitura do canal e emite `read:updated`.                    | Participante autorizado                           |
| `POST /channels/:channelId/messages`          | Publica mensagem com `clientMessageId` idempotente e emite `message:created` no canal.     | Participante autorizado                           |

## Convites

| Método e rota                                       | Ação                                                                    | Acesso                          |
| --------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `POST /workspaces/:workspaceId/invites`             | Envia convite por e-mail e retorna também o link para compartilhamento. | Proprietário ou administrador   |
| `GET /workspaces/:workspaceId/invites`              | Lista convites ativos ou já aceitos, sem expor o token.                 | Proprietário ou administrador   |
| `DELETE /workspaces/:workspaceId/invites/:inviteId` | Cancela convite ainda não aceito.                                       | Proprietário ou administrador   |
| `POST /invites/accept`                              | Aceita token vigente com a conta autenticada do destinatário.           | Conta com e-mail correspondente |

## Chats

| Método e rota                                           | Ação                                                                                       | Acesso                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `GET /conversations`                                    | Lista chats recentes com prévia, não lidas e preferências pessoais.                        | Pessoa participante                             |
| `POST /workspaces/:workspaceId/conversations/direct`    | Abre uma DM idempotente por par de pessoas; exige que ambas pertençam ao espaço.           | Membro não convidado do espaço                  |
| `POST /workspaces/:workspaceId/conversations`           | Cria grupo com nome, foto HTTPS opcional e até 50 participantes, incluindo a criadora.     | Membro não convidado e demais pessoas do espaço |
| `PATCH /conversations/:conversationId`                  | Atualiza nome, descrição e foto HTTPS do grupo.                                            | Criador do grupo                                |
| `PATCH /conversations/:conversationId/preference`       | Atualiza `muted` e/ou `pinned` da própria pessoa.                                          | Participante do chat                            |
| `POST /conversations/:conversationId/members`           | Adiciona pessoa do mesmo espaço ao grupo; repetição é idempotente.                         | Criador do grupo                                |
| `DELETE /conversations/:conversationId/members/:userId` | Remove participante ou permite que a própria pessoa saia; transfere autoria se necessário. | Criador do grupo ou a própria pessoa            |
| `GET /conversations/:conversationId/messages`           | Lista uma página de mensagens com cursor.                                                  | Participante do chat                            |
| `POST /conversations/:conversationId/read`              | Atualiza o marcador pessoal de leitura e emite `read:updated`.                             | Participante do chat                            |
| `POST /conversations/:conversationId/messages`          | Publica mensagem com `clientMessageId` idempotente.                                        | Participante do chat                            |

As DMs usam uma chave única derivada do par de IDs, então pedidos concorrentes reutilizam a mesma conversa. As alterações de grupo emitem `conversation:updated` para atualizar as listas das pessoas conectadas. Canais usam `channelId` e as rotas dedicadas acima. A listagem de conversas e espaços inclui `unread`; páginas de mensagens incluem `lastReadAt` e `unreadCount`. A contagem exclui mensagens próprias, respostas de tópicos e mensagens excluídas.

As rotas de mensagens recebem `limit` (1–100, padrão 50) e um `cursor` opcional identificado pela mensagem mais antiga da página atual. A resposta de listagem contém `{ "items": [...], "nextCursor": "...", "lastReadAt": "...", "unreadCount": 0 }`; `nextCursor` é `null` quando não há mensagens anteriores. Envios podem incluir `clientMessageId` UUID, único por pessoa e conversa/canal, para retries retornarem a mesma mensagem em vez de criar uma duplicata.

## Mensagens e reações

| Método e rota                                  | Ação                                                                      | Acesso                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `PATCH /messages/:messageId`                   | Edita texto e marca a mensagem como editada.                              | Autoria da mensagem                       |
| `DELETE /messages/:messageId`                  | Define `deletedAt` sem apagar o registro e notifica a sala em tempo real. | Autoria da mensagem                       |
| `PUT /messages/:messageId/reactions`           | Adiciona uma reação idempotente; resposta lista quem reagiu.              | Participante autorizado da conversa/canal |
| `DELETE /messages/:messageId/reactions/:emoji` | Remove a reação da pessoa autenticada.                                    | Participante autorizado da conversa/canal |
| `GET /messages/:messageId/replies`             | Lista respostas do tópico com `limit` e cursor.                           | Participante autorizado da conversa/canal |
| `POST /messages/:messageId/replies`            | Cria resposta idempotente no tópico da mensagem inicial.                  | Participante autorizado da conversa/canal |

Tópicos têm um nível: respostas não podem receber outras respostas. As respostas não aparecem na linha do tempo principal; a mensagem inicial informa `replyCount`, que não inclui respostas excluídas logicamente. Criar uma resposta emite `message:created` com `replyToId` e atualiza a mensagem inicial com `message:updated`.

## Socket.IO

O cliente envia `typing` com `{ "targetType": "CHANNEL" | "CONVERSATION", "targetId": "...", "isTyping": true | false }`. A API só encaminha o evento para a sala que o socket já está autorizado a acessar; o servidor obtém o nome da pessoa autenticada e o envia aos outros participantes.

Ao abrir uma conversa ou canal visível, o cliente chama a rota `/read` correspondente. A API grava o marcador por pessoa e envia `read:updated` à sala pessoal do usuário, sincronizando as demais sessões. Ao reconectar, o cliente busca novamente a página recente e os resumos de não lidas.
