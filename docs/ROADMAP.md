# Roadmap do Rocket

Fonte de acompanhamento dos blocos definidos no prompt mestre. Status: ✅ concluído · 🚧 em andamento · ⏳ pendente.

## Resumo

| Bloco                                        | Status          | Objetivo e critério de aceite                                                                                                                                          |
| -------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Fundação e higiene                       | ✅ Concluído    | Shared package, validação Zod, qualidade e migração inicial configurados; CI aplicou migração e seed em PostgreSQL e confirmou a inicialização HTTP da API e da web.   |
| 1 — Design system e shell                    | ✅ Concluído    | Shell responsivo, tokens monocromáticos, três temas persistidos, rotas principais, componentes separados e Lighthouse de acessibilidade 100.                           |
| 2 — Autenticação e perfil reais              | ✅ Concluído    | Cadastro, login, renovação rotativa, logout, recuperação e perfil testados com Argon2id, cookies seguros e rate limit.                                                 |
| 3 — Organização, equipes e canais            | ✅ Concluído    | Workspace → equipes → canais, convites, papéis e permissões de servidor validados com migração, testes integrados e smoke test no CI.                                  |
| 4 — Mensageria completa                      | 🚧 Em andamento | Cursor, idempotência, edição, exclusão, threads, reações, menções, marcadores de leitura, contadores de não lidas e ressincronização; validação multiusuário pendente. |
| 5 — Chats 1:1 e em grupo                     | ⏳ Pendente     | Busca de pessoas, DMs idempotentes, grupos, participantes, silenciar e fixar; sem duplicação de conversas.                                                             |
| 6 — Arquivos e anexos                        | ⏳ Pendente     | MinIO e StorageProvider com upload, preview e download autorizados, respeitando limites e tipos permitidos.                                                            |
| 7 — Presença, Atividade e Notificações       | ⏳ Pendente     | Presença via Redis, feed, notificações e preferências consistentes entre instâncias.                                                                                   |
| 8 — Busca                                    | ⏳ Pendente     | Busca PostgreSQL por mensagens, pessoas, canais e arquivos; resultados obedecem permissões.                                                                            |
| 9 — Calendário e Reuniões                    | ⏳ Pendente     | Calendário, eventos e reuniões LiveKit com autorização, áudio/vídeo e compartilhamento entre participantes.                                                            |
| 10 — Abas de canal e produtividade           | ⏳ Pendente     | Abas configuráveis de publicações, arquivos, notas e tarefas, com itens salvos/pinados persistidos.                                                                    |
| 11 — Administração, segurança e conformidade | ⏳ Pendente     | Administração, auditoria, retenção, LGPD e checklist sem vulnerabilidades altas abertas.                                                                               |
| 12 — Qualidade, observabilidade e entrega    | ⏳ Pendente     | E2E, logs e métricas, healthchecks, imagens Docker e deploy; instalação limpa e suíte E2E verdes no CI.                                                                |

## Critérios e tarefas por bloco

### Bloco 0 — Fundação e higiene

- Validar instalação e fluxo local descrito no README; corrigir erros de inicialização.
- Criar `packages/shared`, ESLint, Prettier, tsconfig base, Vitest e scripts raiz de lint, format, typecheck, teste e build.
- Versionar migração inicial, remover nome fixo do comando de migração e validar ambiente Zod no boot da API.
- Criar CI de install → lint → format check → typecheck → test → build.
- Manter README e decisões atualizados.
- **Aceite:** clone limpo executa seguindo README e CI fica verde, incluindo aplicação da migração e seed.

### Bloco 1 — Design system e shell da aplicação

- Refatorar o monólito da UI em layout, features, componentes, hooks e estilos.
- Criar tokens monocromáticos e temas claro, escuro e alto contraste; adicionar persistência, rotas, layout responsivo e painel redimensionável.
- Testar componentes e teclado; alcançar Lighthouse acessibilidade ≥ 95 e nenhum hex de cor fora de `tokens.css`.
- **Aceite:** trocar `--brand` nos tokens muda todo o app; shell funciona em desktop e mobile.

### Bloco 2 — Autenticação e perfil reais

- Implementar cadastro/login por e-mail e senha com Argon2id, access token curto, refresh rotativo em cookie httpOnly/SameSite, logout e logout global.
- Implementar recuperação com token de uso único e `MailProvider` de log no desenvolvimento.
- Perfil com nome, foto, cargo, fuso, idioma, presença manual e mensagem de status; demo apenas em desenvolvimento.
- Reautenticação de sockets após renovação, rate limit e bloqueio progressivo.
- **Aceite:** cadastro → login → sessão persistente → logout, com testes de integração inclusive de erros.

### Bloco 3 — Organização, Equipes e Canais

- Criar `Workspace → Team → Channel` com canal Geral, públicos/privados e migração que preserve os dados existentes.
- Documentar papéis de dono, admin, membro e convidado; CRUD de equipes/canais, membros, convites, visibilidade, favoritar e ocultar.
- Mostrar árvore de equipes/canais e substituir `window.prompt` por diálogo acessível.
- **Aceite:** admin gerencia equipes e membro só acessa o que sua função permite; autorização coberta por testes.

### Bloco 4 — Mensageria completa

- Cursor e envio otimista idempotente; editar/excluir, threads, reações, menções, preview simples e subconjunto de Markdown sanitizado.
- Não lidas calculadas no servidor, typing, eventos de atualização/exclusão/reação e ressincronização após reconexão.
- **Aceite:** dois usuários em abas distintas exercitam mensagens em tempo real; API e reducer cobertos por testes.

### Bloco 5 — Chats 1:1 e em grupo

- Buscar pessoas, criar DM idempotente, gerenciar grupos, participantes, saída, silenciar e fixar.
- Mostrar recentes, não lidas e prévia da última mensagem.
- **Aceite:** fluxos testados e nenhum par duplica DM.

### Bloco 6 — Arquivos e anexos

- Adicionar MinIO e `StorageProvider` compatível com S3, URLs pré-assinadas, limites, MIME verificado e nomes sanitizados.
- Upload por arrastar/colar/botão com progresso, cartões/previews e download autorizado.
- Abas e busca/ordenação global de arquivos.
- **Aceite:** upload, preview e download exercitados com testes de autorização.

### Bloco 7 — Presença, Atividade e Notificações

- Presença Redis com heartbeat e TTL; adapter Redis do Socket.IO e ausência por inatividade.
- Feed de atividade, notificações do app/navegador, preferências por conversa e modo Não incomodar.
- BullMQ para entrega assíncrona.
- **Aceite:** presença e preferências consistentes entre instâncias.

### Bloco 8 — Busca

- Full-text PostgreSQL com `tsvector`, GIN e configuração portuguesa para mensagens, pessoas, canais e arquivos.
- Filtros, destaques, grupos de resultado e atalhos em Ctrl+K.
- **Aceite:** busca rápida e sem revelar conteúdo de canais privados.

### Bloco 9 — Calendário e Reuniões

- Calendário dia/semana/mês, convidados, recorrência simples, lembretes e “Reunir agora”.
- LiveKit com lobby, áudio, vídeo, compartilhamento, participantes, mãos levantadas e chat; tokens emitidos pela API autorizada.
- Histórico de chamadas e ligação 1:1.
- **Aceite:** dois participantes entram com mídia e eventos aparecem no calendário.

### Bloco 10 — Abas de canal e produtividade

- Abas configuráveis de Publicações, Arquivos, Notas e Tarefas; notas colaborativas ou versionadas e kanban leve.
- Mensagens fixadas/salvas e lembretes.
- **Aceite:** abas persistem e só podem ser alteradas por quem tem permissão.

### Bloco 11 — Administração, segurança e conformidade

- Painel de usuários, equipes, funções, convites e desativação; auditoria, retenção, exportação e exclusão LGPD.
- Helmet, CORS/CSP, rate limits, proteção XSS/CSRF/SSRF e limites/sanitização.
- Registrar revisão de dependências e `docs/SEGURANCA.md`.
- **Aceite:** checklist completo sem vulnerabilidade alta aberta.

### Bloco 12 — Qualidade, observabilidade e entrega

- E2E Playwright para login, equipe, conversa em tempo real, upload, busca e reunião mockada.
- Pino com `requestId`, métricas, healthchecks, erros globais e Dockerfiles.
- Compose de referência, pipeline de imagens, guia de deploy, README, capturas, diagrama, changelog e tag v1.0.0.
- **Aceite:** ambiente limpo sobe com um comando e suíte E2E passa no CI.

## Registro de execução

### 2026-10-23 — Bloco 3 concluído; Bloco 4 iniciado

- **Status do Bloco 3:** ✅ Concluído e publicado em `main` nos commits `e033ff7` e `78b3fd3`.
- **Entregue:** modelo Prisma separado para equipe/canal e chat; migração preservando canais, associações e mensagens antigas; criação automática do canal `geral`; papéis de workspace e autorização na API e nos sockets; convites de sete dias com token armazenado em hash e envio por `MailProvider`; gestão de equipe/canal/membros, entrada em equipes públicas e preferências individuais de fixar/ocultar; árvore de navegação e diálogos próprios, incluindo aceitação de convite após autenticação.
- **Ajustes finais:** convite exibe o nome da equipe de destino; criação de canal navega usando os dados atualizados; admin não pode remover outro admin; teste de integração monta o roteador completo para verificar autorização dos endpoints de mensagens.
- **Validação local:** `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` (24 aprovados; 3 testes de integração ignorados localmente sem PostgreSQL), `npm run format:check`, `git diff --check` e `npm audit --audit-level=moderate` passaram; zero vulnerabilidades. A verificação visual com API mockada cobriu cadastro, criação de equipe e canal e o diálogo de convite.
- **CI #14:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39948022082), incluindo migração e testes integrados com PostgreSQL 17, build, seed e smoke test da API e web.
- **Próxima etapa:** iniciar o Bloco 4 — Mensageria completa — pela paginação por cursor e pelo envio idempotente, após revisar o estado atual das mensagens.

### 2026-10-23 — Bloco 4 em andamento

- **Status:** 🚧 Bloco em andamento; cursores, idempotência, edição, exclusão, reações, typing, tópicos, menções, texto formatado, marcadores de leitura e ressincronização estão implementados e o CI validou a integração PostgreSQL. Ainda falta conferir o fluxo simultâneo com duas sessões.
- **Entregue:** histórico de canais e conversas por cursor estável, carregamento das páginas anteriores mantendo a rolagem; envio com `clientMessageId` idempotente; reducer reconcilia mensagens otimistas, páginas e eventos. Edição/exclusão respeitam autoria; exclusão é lógica; reações são idempotentes e mostram participantes. O evento de digitação valida a sala no servidor e expira no cliente após inatividade. Respostas usam `replyToId`, têm cursor, ficam fora da linha do tempo principal e atualizam a contagem do tópico por socket. Menções têm autocomplete e o servidor rejeita pessoas fora da conversa. O renderizador próprio suporta negrito, itálico, código, listas e links HTTP(S) sem HTML bruto nem busca de metadados externos. Conversas e canais calculam não lidas no servidor, sincronizam a leitura entre sessões, exibem contadores e um separador de novas mensagens; ao reconectar, a interface busca novamente as páginas carregadas e os contadores da barra lateral.
- **Validação local:** lint, format check, typecheck e build passaram; 36 testes passaram e 3 testes de integração PostgreSQL foram ignorados por falta de banco local. O CI #20 validou tópicos, o CI #21 validou menções/Markdown e o CI #22 validou a nova migração e o ciclo não lida → lida com PostgreSQL, build, seed e smoke test.
- **CI #16:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39949362891), incluindo migração, integração de cursor/retries, build, seed e smoke test.
- **CI #17:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39950279520), incluindo testes integrados de edição, exclusão lógica e reações com PostgreSQL.
- **CI #18:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39951288085), incluindo build, migrações, seed e smoke test.
- **CI #19:** falhou porque o teste de retry ainda exigia igualdade exata com apenas `id` e `text`, embora a API devolva a mensagem completa; a asserção foi corrigida no commit `0ddd008`.
- **CI #20:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39953080484), incluindo teste integrado de idempotência de tópico, migração, build, seed e smoke test.
- **CI #21:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39955302804), incluindo autorização de menções, Markdown/preview, build, seed e smoke test.
- **CI #22:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39957321889), incluindo migração de marcadores, autorização, contagem e limpeza de não lidas, build, seed e smoke test.
- **Próxima etapa:** conferir o fluxo visual entre duas sessões quando houver ambiente integrado; continuar pelo Bloco 5 — busca de pessoas e criação idempotente de DMs.

### 2026-10-22 — Bloco 0 concluído

- **Status:** ✅ Concluído.
- **Entregue no checkout:** `@rocket/shared`, schemas Zod e constantes de socket, configuração Zod da API, testes Vitest iniciais, ESLint, Prettier, typecheck, CI e migração inicial gerada do schema.
- **Validação local:** lint, Prettier, typecheck, 7 testes, build e `npm audit` passaram; auditoria encontrou zero vulnerabilidades.
- **CI #1:** passou `npm ci`, lint, format check, typecheck, testes, build, `prisma migrate deploy` e seed sobre PostgreSQL 17.
- **CI #2:** passou o mesmo fluxo e o smoke test iniciou API e web, verificou `/api/health` com banco conectado e recebeu a página da aplicação.
- **Commits enviados:** `4755ff7 chore(fundacao): prepara base e migracao inicial`; `266c25a ci(fundacao): valida inicializacao no pipeline`.
- **Desvio registrado:** a checagem completa com PostgreSQL foi executada no runner do GitHub Actions porque o host local não possui Docker, `psql` nem PostgreSQL. O README mantém o fluxo local com Docker Compose.
- **Próximo bloco:** Bloco 1 — Design system e shell da aplicação.

### 2026-10-22 — Bloco 1 concluído

- **Status:** ✅ Concluído.
- **Entregue:** shell responsivo; rotas de chat, equipes/canais, atividade, calendário, arquivos e chamadas; tokens de cor centralizados; temas claro, escuro e alto contraste; marca configurável; largura da barra lateral e tema persistidos; layout e chat separados em componentes; busca global com navegação por teclado.
- **Acessibilidade:** Lighthouse marcou 100 na auditoria de acessibilidade em viewport mobile; foco visível, skip link, navegação por teclado, nomes acessíveis e suporte a movimento reduzido.
- **Validação local:** lint, formatação, typecheck, 14 testes, build, auditoria npm (zero vulnerabilidades) passaram; busca global cobre foco, setas e abertura de resultado; hexadecimais de cor aparecem somente em `apps/web/src/styles/tokens.css`.
- **Rotas de demonstração:** Atividade, Calendário, Arquivos e Chamadas têm shell e estados vazios; os fluxos completos pertencem aos blocos futuros.
- **Commits enviados:** `b4e0f8a chore(deps): prepara roteamento e testes da interface`; `38b2c2d feat(web): cria shell responsivo e sistema visual`; `07ddac6 test(web): cobre temas, rotas e busca por teclado`.
- **Próximo bloco:** Bloco 2 — Autenticação e perfil reais.

### 2026-10-23 — Bloco 2 concluído

- **Status:** ✅ Concluído e enviado para `main`.
- **Entregue:** schema e migração para sessões, recuperação de senha e limitação persistida; cadastro/login com Argon2id, access token curto, refresh rotativo, detecção de replay e revogação de família; logout local/global; recuperação com token de uso único e `MailProvider` de log/SMTP; perfil e status manual; autenticação e reautenticação do Socket.IO; telas de login, cadastro, recuperação e perfil.
- **Proteções:** cookie de refresh `HttpOnly`/`SameSite=Lax`, validação de origem em rotas que usam cookie, respostas genéricas na recuperação, bloqueio progressivo e chaves de limitação armazenadas como HMAC.
- **Validação local:** `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` (19 aprovados; 2 testes de integração ignorados localmente sem banco configurado), `npm run format:check`, `git diff --check` e `npm audit --audit-level=moderate` passaram; zero vulnerabilidades no audit. As telas de login, cadastro, recuperação e redefinição foram conferidas no navegador.
- **CI #11:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39942467614), incluindo migração e testes de integração com PostgreSQL, build, seed e smoke test da API e web.
- **Commits de implementação enviados:** `907fa01`, `e740f98`, `dff04da`, `ab94e1e`.
- **Próximo bloco:** Bloco 3 — Organização, equipes e canais.
