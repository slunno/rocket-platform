# Rocket

Plataforma de comunicação corporativa da AKR Brands, em português do Brasil. O Rocket reúne conversas, equipes e colaboração em um monorepo com interface web e API.

## Estado do projeto

O repositório está no **Bloco 0 — Fundação e higiene**. Consulte [`docs/ROADMAP.md`](docs/ROADMAP.md) para o plano completo, critérios de aceite, status e pendências.

## O que existe hoje

- Interface React com conversas, mensagens, busca rápida (`Ctrl/Cmd + K`), painel de detalhes, reações de demonstração, toasts e modo local com dados fictícios.
- API Express com sessão de demonstração para desenvolvimento, listagem de conversas e mensagens, envio de mensagens e eventos Socket.IO.
- Modelo Prisma para usuários, espaços de trabalho, conversas, mensagens, anexos e reações, com migração inicial versionada.
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
docs/                     Roadmap e decisões técnicas
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

| Variável            | Uso                                                            |
| ------------------- | -------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | Senha local do container PostgreSQL                            |
| `DATABASE_URL`      | Conexão PostgreSQL usada pela API, Prisma e seed               |
| `JWT_SECRET`        | Segredo dos tokens de demonstração; mínimo de 32 caracteres    |
| `DEMO_AUTH_ENABLED` | Habilita a sessão demo fora de produção                        |
| `NODE_ENV`          | `development`, `test` ou `production`; padrão `development`    |
| `API_PORT`          | Porta da API; padrão `4000`                                    |
| `WEB_ORIGIN`        | Origem CORS permitida; padrão `http://localhost:5173`          |
| `VITE_API_URL`      | URL da API consumida pelo Vite; padrão `http://localhost:4000` |

A API falha cedo com a lista das variáveis inválidas. A rota de sessão demo retorna 404 em produção, e a configuração rejeita autenticação demo habilitada quando `NODE_ENV=production`.

## Identidade visual

A interface atual ainda usa o tema do protótipo inicial. O sistema visual monocromático por tokens, temas claro/escuro/alto contraste e marca configurável será entregue no Bloco 1; depois dele, a paleta poderá ser trocada nos tokens sem editar componentes.

## Próximas etapas

Autenticação e perfis reais, equipes e canais, mensageria completa, anexos, presença, busca, calendário, reuniões e recursos de administração estão planejados em [`docs/ROADMAP.md`](docs/ROADMAP.md) e ainda não devem ser considerados disponíveis.
