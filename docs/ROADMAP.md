# Roadmap do Rocket

Fonte de acompanhamento dos blocos definidos no prompt mestre. Status: ✅ concluído · 🚧 em andamento · ⏳ pendente.

## Resumo

| Bloco                                        | Status          | Objetivo e critério de aceite                                                                                                                                                                       |
| -------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Fundação e higiene                       | 🚧 Em andamento | Repositório instala e inicia seguindo o README; shared package, validação Zod, qualidade, migração inicial e CI estão configurados. Falta aplicar e exercitar a migração com PostgreSQL disponível. |
| 1 — Design system e shell                    | ⏳ Pendente     | Shell responsivo, tokens monocromáticos e testes de navegação/acessibilidade; trocar tokens altera a aparência geral.                                                                               |
| 2 — Autenticação e perfil reais              | ⏳ Pendente     | Cadastro, login, renovação rotativa, logout, recuperação e perfil testados com Argon2id, cookies seguros e rate limit.                                                                              |
| 3 — Organização, equipes e canais            | ⏳ Pendente     | Workspace → equipes → canais, papéis e permissões de servidor; membros acessam apenas conteúdo autorizado.                                                                                          |
| 4 — Mensageria completa                      | ⏳ Pendente     | Cursor, idempotência, edição, exclusão, threads, reações, menções, leitura e eventos em tempo real entre dois usuários.                                                                             |
| 5 — Chats 1:1 e em grupo                     | ⏳ Pendente     | Busca de pessoas, DMs idempotentes, grupos, participantes, silenciar e fixar; sem duplicação de conversas.                                                                                          |
| 6 — Arquivos e anexos                        | ⏳ Pendente     | MinIO e StorageProvider com upload, preview e download autorizados, respeitando limites e tipos permitidos.                                                                                         |
| 7 — Presença, Atividade e Notificações       | ⏳ Pendente     | Presença via Redis, feed, notificações e preferências consistentes entre instâncias.                                                                                                                |
| 8 — Busca                                    | ⏳ Pendente     | Busca PostgreSQL por mensagens, pessoas, canais e arquivos; resultados obedecem permissões.                                                                                                         |
| 9 — Calendário e Reuniões                    | ⏳ Pendente     | Calendário, eventos e reuniões LiveKit com autorização, áudio/vídeo e compartilhamento entre participantes.                                                                                         |
| 10 — Abas de canal e produtividade           | ⏳ Pendente     | Abas configuráveis de publicações, arquivos, notas e tarefas, com itens salvos/pinados persistidos.                                                                                                 |
| 11 — Administração, segurança e conformidade | ⏳ Pendente     | Administração, auditoria, retenção, LGPD e checklist sem vulnerabilidades altas abertas.                                                                                                            |
| 12 — Qualidade, observabilidade e entrega    | ⏳ Pendente     | E2E, logs e métricas, healthchecks, imagens Docker e deploy; instalação limpa e suíte E2E verdes no CI.                                                                                             |

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

### 2026-10-22 — Bloco 0 iniciado

- **Status:** 🚧 Em andamento.
- **Entregue no checkout:** `@rocket/shared`, schemas Zod e constantes de socket, configuração Zod da API, testes Vitest iniciais, ESLint, Prettier, typecheck, CI e migração inicial gerada do schema.
- **Validação local até agora:** `npm install` concluiu e a auditoria ficou sem vulnerabilidades após atualizar o Vitest; seis testes passaram e `npm run build` passou.
- **Pendência:** este ambiente não possui Docker, `psql` nem servidor PostgreSQL instalados. A migração foi gerada sem banco, mas ainda precisa ser aplicada e o seed exercitado em um ambiente com PostgreSQL.
- **Commits:** serão registrados quando o bloco for validado e commitado.
