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
| 5 — Chats 1:1 e em grupo                     | 🚧 Em andamento | Busca de pessoas, DMs idempotentes, grupos com foto HTTPS, participantes, silenciar e fixar; sem duplicação de conversas.                                              |
| 6 — Arquivos e anexos                        | ✅ Concluído    | MinIO e StorageProvider com upload, preview e download autorizados, respeitando limites e tipos permitidos; testes integrados e CI completos passaram.                 |
| 7 — Presença, Atividade e Notificações       | 🚧 Em andamento | Implementação e integração PostgreSQL/Redis passaram no CI #44; falta revisão visual manual, bloqueada pela política do navegador integrado para URLs locais.          |
| 8 — Busca                                    | ✅ Concluído    | Busca global validada no CI #47 com PostgreSQL e Redis e publicada em `main`.                                                                                          |
| 9 — Calendário e Reuniões                    | 🚧 Em andamento | Implementação publicada e CI #49 passou; falta validação manual de mídia entre duas contas.                                                                            |
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
- **Pendência:** conferir o fluxo visual entre duas sessões quando houver ambiente integrado. O trabalho do Bloco 5 prossegue como desvio registrado na seção seguinte.

### 2026-10-23 — Bloco 5 em andamento

- **Status:** 🚧 implementação de DMs e grupos no cliente/API concluída; os CIs #25 e #26 passaram com PostgreSQL, build, seed e smoke test. O Bloco 4 e este bloco ainda aguardam conferência visual de duas contas pelo navegador integrado.
- **Entregue no checkout:** chave única por par de usuários para DMs idempotentes, migração que consolida DMs antigas repetidas sem apagar mensagens, criação de grupos com até 50 pessoas e foto HTTPS, edição de nome/descrição/foto, gerenciamento de participantes, saída com transferência do criador, preferências de silenciar/fixar, lista ordenada por fixação/atividade e prévia da última mensagem. A interface busca pessoas do espaço atual, cria DMs e grupos, mostra avatares e sincroniza alterações de membros por Socket.IO.
- **Validação local:** lint, format check, typecheck, build e `npm audit --audit-level=moderate` passaram; 38 testes passaram e 3 testes PostgreSQL foram ignorados localmente porque o host não tem banco. Os testes de interface cobrem a busca, início de DM e criação de grupo.
- **CI #24:** [falhou](https://github.com/slunno/rocket-platform/actions/runs/39961257283) por uma referência à variável `directPath` antes da declaração no teste de integração. A ordem foi corrigida no commit `98c853e`.
- **CI #25:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39961517108), incluindo migração PostgreSQL, testes integrados de DMs e grupos, build, seed e smoke test.
- **CI #26:** [passou](https://github.com/slunno/rocket-platform/actions/runs/39962083825), incluindo lint, format check, typecheck, migração, testes, build, seed e smoke test com o cliente conectado.
- **Validação pendente:** exercitar a interface completa com duas contas pelo navegador integrado quando houver ambiente web/API conectado. O workspace não possui PostgreSQL local nem projeto Vercel conectado; nenhuma automação de computador foi usada.
- **Desvio de ordem:** o Bloco 5 começou antes da conferência visual final do Bloco 4. A API do Bloco 4 já passou pelo CI #22; a falta de ambiente para duas sessões mantém sua verificação visual pendente enquanto o trabalho da lista de chats prossegue.
- **Próxima etapa:** conferir criação de DM, criação de grupo, preferências e saída com duas contas pelo navegador integrado; depois fechar o Bloco 5 e retornar à conferência multiusuário do Bloco 4.

### 2026-10-23 — Bloco 6 concluído

- **Status:** ✅ implementação publicada em `main`; build, lint, typecheck, testes e auditoria passaram localmente. O CI #36 passou com PostgreSQL e MinIO, incluindo testes integrados, build, seed e smoke test.
- **Entregue no checkout:** armazenamento S3 compatível com MinIO e configuração local/CI; upload direto com formulário pré-assinado, limite de 25 MiB por arquivo, até 10 anexos por mensagem, lista de tipos permitidos, nome sanitizado e verificação do conteúdo real antes da conclusão. Anexos são autorizados pela conversa/canal, `storageKey` não sai da API, downloads usam URL curta assinada e arquivos só aparecem depois de verificados. A interface aceita botão, arrastar, colar e progresso; mostra prévias/cartões e oferece busca/ordenação global e aba de arquivos do canal.
- **Validação local:** `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` (48 passaram; 3 testes de integração ignorados sem PostgreSQL local), `npm run format:check`, `git diff --check` e `npm audit --audit-level=moderate` passaram.
- **CI #28:** falhou durante a inicialização do MinIO: `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z` retornou `unauthorized`; migrações PostgreSQL passaram. O serviço local de teste foi trocado para `bitnamilegacy/minio:2025.7.23`; a imagem é antiga e sem atualizações, portanto deve ficar restrita ao desenvolvimento/CI.
- **CI #29:** puxou a imagem MinIO, mas o processo não conseguiu gravar em `/data` (`file access denied`). O serviço foi ajustado para usar o diretório de dados da imagem Bitnami, `/bitnami/minio/data`; CI precisa ser repetido.
- **CI #30:** a imagem iniciou e o fluxo de upload alcançou o teste integrado; a criação da mensagem com anexo recebeu 500. O harness de integração agora devolve o detalhe do erro para identificar a chamada S3 que falha.
- **CI #31–32:** `PutBucketCors` falhou no MinIO legado com `A header you provided implies functionality that is not implemented`; a API não precisa alterar CORS do bucket durante cada operação. CORS agora é configurado globalmente no serviço MinIO via `MINIO_API_CORS_ALLOW_ORIGIN`, inclusive no Compose e no CI.
- **CI #33:** MinIO e o upload/download passaram; a integração revelou que a busca de arquivos do canal combinava o nome do arquivo com o texto da mensagem em vez de buscar por qualquer um dos campos. A consulta agora usa uma condição OR, com teste para nome e texto da mensagem.
- **CI #34:** a busca de arquivos do canal passou; a paginação de mensagens foi medida após criar registros adicionais do próprio teste de anexos. A verificação de paginação foi movida para antes desses registros, mantendo o cenário de três mensagens isolado.
- **CI #35:** a paginação isolada passou; a contagem antiga de mensagens raiz não incluía as duas mensagens com anexos criadas pelo teste. As expectativas agora incluem esses registros.
- **CI #36:** passou por inteiro com PostgreSQL 17 e MinIO; upload, verificação de conteúdo, autorização, download e listagens integradas passaram, além das verificações de qualidade e smoke test.
- **Limite funcional:** anexos em respostas de tópico são rejeitados explicitamente; o compositor de respostas não oferece envio de arquivo.
- **Pendências anteriores:** os Blocos 4 e 5 seguem com a validação visual multiusuário pendente por falta de um ambiente web/API com duas contas; essa conferência permanece registrada como desvio de ordem.
- **Próxima etapa:** iniciar o Bloco 7 com presença Redis por heartbeat/TTL e adapter Redis para Socket.IO; manter a conferência visual multiusuário dos Blocos 4 e 5 registrada para quando houver um ambiente com duas contas.

### 2026-10-23 — Bloco 7 validado no CI; Bloco 8 iniciado

- **Status:** 🚧 presença, feed e notificações implementados e publicados em `main`; o CI #44 validou migração e integração. Resta a conferência visual manual, bloqueada pela política de segurança do navegador integrado ao tentar abrir a URL local.
- **Entregue e validado anteriormente:** adapter Redis para Socket.IO; heartbeat autenticado a cada 20 segundos com TTL de 60 segundos, controle de múltiplos sockets por usuário, transições online/offline e snapshot inicial limitado a conversas, canais privados e equipes com canais públicos autorizados.
- **Implementado neste avanço:** notificações persistidas de menção, resposta, reação e aceite de convite; filtros e cursores do feed; leitura individual e em lote; contadores não lidos; preferências `ALL`, `MENTIONS` e `MUTED` por conversa/canal; Não incomodar suprime entrega em tempo real; worker BullMQ entrega por Socket.IO; alertas no app e notificações do navegador com permissão explícita.
- **Validação local:** `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check` e `npm audit --audit-level=moderate` passaram; auditoria encontrou zero vulnerabilidades. `npm run test`: 55 passaram e 6 foram ignorados. A integração local é ignorada sem PostgreSQL/Redis; ela passou no CI #44.
- **CI #38:** validou a etapa anterior de presença por lint, formatação, typecheck, migração PostgreSQL, testes de integração com Redis, build, seed e smoke test.
- **CI #40–41:** lint, formatação, typecheck e migração passaram; o teste de conversa esperava somente `muted` e `pinned`, sem o novo campo. Em `baebda3`, a asserção passou a conferir também o nível, inicialmente com o valor incorreto `ALL`.
- **CI #42:** confirmou que `muted: true` retorna `notificationLevel: MUTED`; o valor esperado foi corrigido em `219c18f`.
- **CI #43:** encontrou também uma asserção antiga para preferência de canal, que não esperava `notificationLevel: ALL`; ajustada em `87e1e5c`.
- **CI #44:** [passou](https://github.com/slunno/rocket-platform/actions/runs/40012567476), incluindo lint, formatação, typecheck, migração PostgreSQL, testes de integração com Redis e notificações, build, seed e smoke test.
- **Pendência visual:** a política de segurança do navegador integrado bloqueou `http://127.0.0.1:5181/chat/produto`; sem contornar esse bloqueio, a revisão manual de UI permanece pendente.
- **Desvio de ordem:** começar o Bloco 8 com apenas essa conferência manual do Bloco 7 pendente; a busca não depende dela e o bloqueio do navegador também mantém a validação visual dos Blocos 4 e 5 em aberto.
- **Bloco 8 iniciado:** busca global PostgreSQL para mensagens, pessoas, canais e arquivos, com índices GIN, filtros, snippets e autorização aplicada antes de retornar resultados.
- **Bloco 8 implementado no checkout:** migração cria índices GIN em mensagens, pessoas, canais e nomes de arquivo com configuração portuguesa; schema compartilhado valida query, workspace, tipo, autor, destino, datas, anexos e limite; API usa consultas parametrizadas, escopo obrigatório do workspace e associação autorizada a cada conversa/canal. Convidados não recebem dados do diretório. Resultados de mensagem/arquivo incluem snippets com marcadores que a interface transforma em nós React de texto, sem HTML injetado.
- **Interface:** `Ctrl/Cmd + K` busca mensagens, pessoas, canais e arquivos; mostra resultados em grupos, filtro por tipo/autor/local/período/anexo, estado de carregamento/erro, navegação de teclado e abertura do destino.
- **Validação local:** `npm run typecheck`, `npm run build`, `npm run lint`, `npm run format:check`, `git diff --check`, `npm run test` (57 aprovados; 7 ignorados por falta de PostgreSQL/Redis local) e `npm audit --audit-level=moderate` passaram; zero vulnerabilidades.
- **Validação pendente:** o teste integrado recém-adicionado verifica isolamento de workspace e canal privado, filtros, arquivos e diretório; precisa passar no CI com PostgreSQL e Redis antes de marcar o bloco como concluído.
- **CI #47:** [passou](https://github.com/slunno/rocket-platform/actions/runs/40016203445) no commit `1062f72`, incluindo lint, formatação, typecheck, migração PostgreSQL, testes integrados de busca, build, seed e smoke test.
- **Status final:** implementação publicada em `main`; busca por trecho do nome do arquivo corrigida e validada com PostgreSQL/Redis. Bloco 8 concluído.
- **Próximo bloco:** Bloco 9 — Calendário e Reuniões.

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

### 2026-10-24 — Bloco 9 em andamento

- **Status:** 🚧 Implementação de calendário e reuniões publicada em `d7f6d88`; o CI #49 validou fluxo completo automatizado. Resta a conferência manual de áudio/vídeo entre duas contas. O CI #48 encontrou que servidores de teste compartilhavam IP e somavam cadastros no rate limit legítimo; o harness passou a usar um endereço sintético exclusivo por servidor.
- **Calendário:** API autenticada para listar, criar, editar, excluir e responder a convites; validação de participantes pelo espaço de trabalho; recorrência diária/semanal/mensal com limite; visualizações de mês/semana/dia; edição de eventos e lembretes via BullMQ.
- **Reuniões:** tokens LiveKit emitidos pela API após autorização para evento aceito, conversa direta ou canal; histórico e estado de participantes; controles de entrada/saída/encerramento; UI com lobby, microfone, câmera, compartilhamento de tela, participantes, mãos levantadas e chat.
- **Ambiente local:** Compose agora inclui LiveKit Server `v1.13.10`, com chave de desenvolvimento local, e `.env.example` documenta as três variáveis necessárias. As portas são publicadas somente em loopback. O segredo configurado é exclusivo para desenvolvimento.
- **Validação local:** `npm run typecheck`, `npm run lint`, `npm run build`, `npm run format:check`, `git diff --check`, Prisma validate e `npm audit --audit-level=moderate` passaram; 60 testes passaram e 8 testes de integração foram ignorados por falta de serviços locais. O CI #49 passou em todas as etapas: lint, formatação, typecheck, migração PostgreSQL, testes integrados, build, seed e smoke test; CI também iniciou Redis, MinIO e LiveKit. A versão local do app abre no navegador integrado, mas redireciona ao login e não pode completar o fluxo sem API/banco locais.
- **Limite de validação local:** o host não tem o comando `docker`; portanto, não foi possível validar o Compose, executar a migração contra PostgreSQL nem testar fluxo de mídia real neste computador. A validação de integração ficará a cargo do CI; a mídia entre duas contas ainda precisa de uma sessão manual em navegador integrado.
- **Aplicativo nativo planejado:** `docs/PLANO_APLICATIVO_NATIVO.md` descreve Expo/React Native com LiveKit nativo para Android/iOS e Tauri 2 para Windows/macOS, etapas de prova técnica, MVP, distribuição, dependências externas e prompt de implementação. Não há app nativo implementado ainda; sua construção fica após os blocos 9–12 para usar contratos estáveis.
- **CI #49:** [passou](https://github.com/slunno/rocket-platform/actions/runs/40046031721) no commit `d7f6d88`, incluindo migração, todas as integrações, build, seed e smoke test.
- **Pendência manual:** validar entrada em sala, publicação/recepção de áudio e vídeo e encerramento com duas contas. O navegador integrado chega à rota e a web redireciona para `/entrar`; a API e o banco não estão rodando localmente, e o host não tem Docker.
- **Próxima etapa:** iniciar o Bloco 10 — Abas de canal e produtividade, mantendo a validação manual de mídia e as conferências multiusuário anteriores registradas para o próximo ambiente web/API utilizável.
