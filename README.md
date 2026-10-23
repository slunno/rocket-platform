# Rocket

Plataforma de comunicação corporativa da AKR Brands, em português do Brasil. O Rocket reúne conversas, equipes e colaboração em um monorepo com interface web e API.

## Estado do projeto

Os **Blocos 0 — Fundação e higiene**, **1 — Design system e shell da aplicação**, **2 — Autenticação e perfil reais** e **3 — Organização, equipes e canais** estão concluídos. O **Bloco 4 — Mensageria completa** está em andamento, começando por histórico paginado e envio idempotente. Consulte [`docs/ROADMAP.md`](docs/ROADMAP.md) para o plano completo, critérios de aceite, status e pendências.

## Status dos blocos

| Bloco                                        | Status          |
| -------------------------------------------- | --------------- |
| 0 — Fundação e higiene                       | ✅ Concluído    |
| 1 — Design system e shell                    | ✅ Concluído    |
| 2 — Autenticação e perfil reais              | ✅ Concluído    |
| 3 — Organização, equipes e canais            | ✅ Concluído    |
| 4 — Mensageria completa                      | 🚧 Em andamento |
| 5 — Chats 1:1 e em grupo                     | ⏳ Pendente     |
| 6 — Arquivos e anexos                        | ⏳ Pendente     |
| 7 — Presença, atividade e notificações       | ⏳ Pendente     |
| 8 — Busca                                    | ⏳ Pendente     |
| 9 — Calendário e reuniões                    | ⏳ Pendente     |
| 10 — Abas de canal e produtividade           | ⏳ Pendente     |
| 11 — Administração, segurança e conformidade | ⏳ Pendente     |
| 12 — Qualidade, observabilidade e entrega    | ⏳ Pendente     |

## O que existe hoje

- Interface React com shell responsivo, rotas, temas claro/escuro/alto contraste, tokens monocromáticos, busca rápida (`Ctrl/Cmd + K`), conversas, painel de detalhes, reações de demonstração e modo local com dados fictícios.
- Componentes separados por layout, conversa e elementos básicos de interface; tema e largura da barra lateral persistidos no navegador.
- Rotas com conteúdo de demonstração para Atividade, Calendário, Arquivos e Chamadas; os respectivos fluxos completos permanecem nos blocos futuros do roadmap.
- API Express com cadastro e login por e-mail, senhas Argon2id, sessões persistentes com refresh rotativo, logout local/global, recuperação de senha, perfil e status manual; demonstração restrita à configuração de desenvolvimento. Também oferece espaços, equipes, canais públicos/privados, papéis, membros, convites por e-mail e mensagens autorizadas com cursor, envio idempotente, edição, exclusão, reações e indicador de digitação em salas Socket.IO autorizadas.
- Modelo Prisma para usuários, espaços, equipes, canais, conversas diretas/em grupo, mensagens, anexos, reações, membros e convites; migrações versionadas preservam as mensagens dos canais existentes.
- Dados de demonstração fictícios em contexto de moda e indústria: Comercial, Produto e Estilo, Produção, Marketing, Logística e TI.
- Pacote `@rocket/shared` com schemas Zod, tipos inferidos e nomes de eventos Socket.IO.
- Verificação de variáveis de ambiente da API no boot, com mensagens de erro em português.
- ESLint, Prettier, Vitest, typecheck separado, scripts de build e workflow de CI.

## Estrutura

```text
apps/
  web/                    Interface React 19 + TypeScript + Vite
  api/                    API Express 5 + Socket.IO + Prisma 7
    prisma/               Schema, migrações versionadas e seed
packages/
  shared/                 Schemas Zod, tipos e eventos compartilhados
docs/                     Roadmap, decisões, API e permissões
.github/workflows/        CI para pull requests e pushes na main
docker-compose.yml        PostgreSQL 17 e Redis 7 para desenvolvimento
```

## Requisitos

- Node.js 22 ou superior (o CI usa Node 22)
- Docker Desktop com Docker Compose, para PostgreSQL e Redis locais

## Rodar localmente

No PowerShell:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` e defina `POSTGRES_PASSWORD`, `DATABASE_URL` com a mesma senha, e `JWT_SECRET` com um valor aleatório de pelo menos 32 caracteres. Para desenvolvimento, mantenha `DEMO_AUTH_ENABLED=true`.

```powershell
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Abra <http://localhost:5173>. O ambiente local publica a API em `http://localhost:4000`, PostgreSQL em `localhost:5432` e Redis em `localhost:6379`; os serviços de dados ficam vinculados ao loopback.

Em bash, substitua a cópia do arquivo por `cp .env.example .env`.

## Qualidade

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm audit
```

Para formatar os arquivos suportados, use `npm run format`. O fluxo do GitHub Actions executa lint, verificação de formatação, typecheck, testes e build em pull requests e pushes na `main`.

## Variáveis de ambiente

| Variável                 | Uso                                                                             |
| ------------------------ | ------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`      | Senha local do container PostgreSQL                                             |
| `DATABASE_URL`           | Conexão PostgreSQL usada pela API, Prisma e seed                                |
| `JWT_SECRET`             | Segredo dos tokens de acesso e das chaves de limitação; mínimo de 32 caracteres |
| `DEMO_AUTH_ENABLED`      | Habilita a sessão demo fora de produção                                         |
| `MAIL_PROVIDER`          | `log` em desenvolvimento ou `smtp` para envio real                              |
| `MAIL_FROM`              | Remetente dos e-mails de recuperação de senha                                   |
| `SMTP_HOST`              | Host do servidor SMTP                                                           |
| `SMTP_PORT`              | Porta SMTP; padrão `587`                                                        |
| `SMTP_SECURE`            | Use `true` para TLS implícito, como na porta `465`                              |
| `SMTP_USER`              | Usuário SMTP                                                                    |
| `SMTP_PASSWORD`          | Senha SMTP                                                                      |
| `NODE_ENV`               | `development`, `test` ou `production`; padrão `development`                     |
| `API_PORT`               | Porta da API; padrão `4000`                                                     |
| `WEB_ORIGIN`             | Origem CORS permitida; padrão `http://localhost:5173`                           |
| `VITE_API_URL`           | URL da API consumida pelo Vite; padrão `http://localhost:4000`                  |
| `VITE_BRAND_NAME`        | Nome exibido na barra superior; padrão `Rocket`                                 |
| `VITE_BRAND_LOGO_URL`    | URL opcional para a imagem da marca na barra superior                           |
| `VITE_DEMO_AUTH_ENABLED` | Exibe o atalho para demonstração somente no Vite de desenvolvimento             |

A API falha cedo com a lista das variáveis inválidas. A rota de sessão demo retorna 404 em produção, e a configuração rejeita autenticação demo habilitada quando `NODE_ENV=production`. Produção exige `MAIL_PROVIDER=smtp` e as credenciais SMTP completas. O SMTP entrega recuperação de senha e convites; em desenvolvimento, os links são registrados no log da API e também podem ser copiados na interface.

## Identidade visual

A interface usa uma paleta monocromática concentrada em `apps/web/src/styles/tokens.css`, com temas claro, escuro e alto contraste. A marca na barra superior pode ser personalizada por `VITE_BRAND_NAME` e `VITE_BRAND_LOGO_URL`.

## Próximas etapas

Mensageria completa, anexos, presença, atividade, notificações, busca, calendário, reuniões, produtividade e recursos de administração seguem planejados em [`docs/ROADMAP.md`](docs/ROADMAP.md) e ainda não devem ser considerados disponíveis. Os papéis e as regras de acesso atuais estão em [`docs/PERMISSOES.md`](docs/PERMISSOES.md); os endpoints estão em [`docs/API.md`](docs/API.md).
