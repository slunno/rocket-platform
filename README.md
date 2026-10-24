# Rocket

Plataforma de comunicação corporativa da AKR Brands, em português do Brasil. O Rocket reúne conversas, equipes e colaboração em um monorepo com interface web e API.

## Estado do projeto

Os **Blocos 0 a 3, 6 e 8** estão concluídos. Os **Blocos 4, 5 e 7** têm implementação e CI, mas ainda aguardam conferência visual multiusuário. No **Bloco 9 — Calendário e Reuniões**, API, migração, serviço LiveKit e interface foram publicados em `d7f6d88`; o CI #49 passou com integração PostgreSQL/Redis/MinIO/LiveKit, build, seed e smoke test. Resta conferir mídia entre duas contas; a web local abre, mas a API não está disponível neste host sem Docker. O próximo bloco é Abas de canal e produtividade. Consulte [`docs/ROADMAP.md`](docs/ROADMAP.md) para critérios, evidências e pendências.

O plano para os aplicativos Android, iOS, Windows e macOS está em [`docs/PLANO_APLICATIVO_NATIVO.md`](docs/PLANO_APLICATIVO_NATIVO.md), incluindo arquitetura, fases, pré-requisitos e prompt de implementação.

## Status dos blocos

| Bloco                                        | Status          |
| -------------------------------------------- | --------------- |
| 0 — Fundação e higiene                       | ✅ Concluído    |
| 1 — Design system e shell                    | ✅ Concluído    |
| 2 — Autenticação e perfil reais              | ✅ Concluído    |
| 3 — Organização, equipes e canais            | ✅ Concluído    |
| 4 — Mensageria completa                      | 🚧 Em andamento |
| 5 — Chats 1:1 e em grupo                     | 🚧 Em andamento |
| 6 — Arquivos e anexos                        | ✅ Concluído    |
| 7 — Presença, atividade e notificações       | 🚧 Em andamento |
| 8 — Busca                                    | ✅ Concluído    |
| 9 — Calendário e reuniões                    | 🚧 Em andamento |
| 10 — Abas de canal e produtividade           | ⏳ Pendente     |
| 11 — Administração, segurança e conformidade | ⏳ Pendente     |
| 12 — Qualidade, observabilidade e entrega    | ⏳ Pendente     |

## O que existe hoje

- Interface React com shell responsivo, rotas, temas claro/escuro/alto contraste, tokens monocromáticos, busca rápida (`Ctrl/Cmd + K`), conversas, painel de detalhes, reações de demonstração e modo local com dados fictícios.
- Componentes separados por layout, conversa e elementos básicos de interface; tema e largura da barra lateral persistidos no navegador.
- Atividade lista menções, respostas, reações e aceite de convites, com filtros, leitura individual/em lote, alertas no app e notificações do navegador ativadas por escolha da pessoa. O calendário e as chamadas estão em implementação: eventos com recorrência e lembretes, convites e respostas, histórico, salas LiveKit protegidas por autorização e controles de áudio/vídeo/compartilhamento. A integração e a conferência de mídia entre duas contas ainda estão pendentes. Arquivos têm upload para MinIO/S3, prévias, download autorizado, busca e ordenação, incluindo arquivos de canal.
- API Express com cadastro e login por e-mail, senhas Argon2id, sessões persistentes com refresh rotativo, logout local/global, recuperação de senha, perfil e status manual; demonstração restrita à configuração de desenvolvimento. Também oferece espaços, equipes, canais públicos/privados, papéis, membros e convites por e-mail. Mensagens têm cursor, envio idempotente, edição, exclusão, reações, tópicos, menções restritas aos participantes, indicador de digitação e marcadores de leitura sincronizados por Socket.IO. DMs são únicas por par; grupos oferecem foto HTTPS, gestão de participantes e preferências de silenciar/fixar. Anexos têm limite de 25 MiB e são verificados por conteúdo antes de ficarem disponíveis.
- Busca global do bloco 8 concluída e validada no CI #47: PostgreSQL full-text encontra mensagens, pessoas, canais e arquivos no workspace ativo; filtros de autor, canal/conversa, datas e anexo; trechos destacados renderizados como texto seguro e resultados limitados às conversas acessíveis à pessoa.
- Modelo Prisma para usuários, espaços, equipes, canais, conversas diretas/em grupo, mensagens, atividade/notificações, anexos, reações, eventos e participantes de calendário/chamadas, membros e convites; migrações versionadas preservam as mensagens dos canais existentes.
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
docker-compose.yml        PostgreSQL 17, Redis 7, MinIO e LiveKit para desenvolvimento
livekit.yaml              Configuração local de mídia para desenvolvimento
```

## Requisitos

- Node.js 22 ou superior (o CI usa Node 22)
- Docker Desktop com Docker Compose, para PostgreSQL, Redis, MinIO e LiveKit locais

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

Em bash, substitua a cópia do arquivo por `cp .env.example .env`. O LiveKit local atende em `ws://localhost:7880`, com tráfego WebRTC TCP em `7881` e UDP em `7882`; a chave do `.env.example` serve apenas para desenvolvimento local. Em produção, use um servidor LiveKit separado, endpoint `wss://` e credenciais privadas.

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

| Variável                      | Uso                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`           | Senha local do container PostgreSQL                                                         |
| `DATABASE_URL`                | Conexão PostgreSQL usada pela API, Prisma e seed                                            |
| `JWT_SECRET`                  | Segredo dos tokens de acesso e das chaves de limitação; mínimo de 32 caracteres             |
| `DEMO_AUTH_ENABLED`           | Habilita a sessão demo fora de produção                                                     |
| `MAIL_PROVIDER`               | `log` em desenvolvimento ou `smtp` para envio real                                          |
| `MAIL_FROM`                   | Remetente dos e-mails de recuperação de senha                                               |
| `SMTP_HOST`                   | Host do servidor SMTP                                                                       |
| `SMTP_PORT`                   | Porta SMTP; padrão `587`                                                                    |
| `SMTP_SECURE`                 | Use `true` para TLS implícito, como na porta `465`                                          |
| `SMTP_USER`                   | Usuário SMTP                                                                                |
| `SMTP_PASSWORD`               | Senha SMTP                                                                                  |
| `STORAGE_ENDPOINT`            | Endpoint S3 compatível; padrão local `http://localhost:9000`                                |
| `STORAGE_REGION`              | Região usada pelo cliente S3; padrão `us-east-1`                                            |
| `STORAGE_BUCKET`              | Bucket para anexos; padrão `rocket-attachments`                                             |
| `STORAGE_ACCESS_KEY`          | Chave de acesso ao serviço S3/MinIO                                                         |
| `STORAGE_SECRET_KEY`          | Segredo de acesso ao serviço S3/MinIO                                                       |
| `STORAGE_FORCE_PATH_STYLE`    | Usa URLs path-style, necessário para MinIO local                                            |
| `STORAGE_MAX_FILE_SIZE_BYTES` | Limite configurável de tamanho; máximo aceito pela aplicação: 25 MiB                        |
| `NODE_ENV`                    | `development`, `test` ou `production`; padrão `development`                                 |
| `API_PORT`                    | Porta da API; padrão `4000`                                                                 |
| `WEB_ORIGIN`                  | Origem CORS permitida; padrão `http://localhost:5173`                                       |
| `REDIS_URL`                   | Redis para adapter Socket.IO, presença e fila BullMQ; padrão local `redis://localhost:6379` |
| `VITE_API_URL`                | URL da API consumida pelo Vite; padrão `http://localhost:4000`                              |
| `VITE_BRAND_NAME`             | Nome exibido na barra superior; padrão `Rocket`                                             |
| `VITE_BRAND_LOGO_URL`         | URL opcional para a imagem da marca na barra superior                                       |
| `VITE_DEMO_AUTH_ENABLED`      | Exibe o atalho para demonstração somente no Vite de desenvolvimento                         |
| `VAPID_PUBLIC_KEY`            | Chave pública VAPID para Push Web em segundo plano; opcional                                |
| `VAPID_PRIVATE_KEY`           | Chave privada VAPID; mantenha secreta e configure junto da chave pública                    |
| `VAPID_SUBJECT`               | Contato `mailto:` ou URL HTTPS para o serviço Web Push                                      |

A API falha cedo com a lista das variáveis inválidas. A rota de sessão demo retorna 404 em produção, e a configuração rejeita autenticação demo habilitada quando `NODE_ENV=production`. Produção exige `MAIL_PROVIDER=smtp` e as credenciais SMTP completas. O SMTP entrega recuperação de senha e convites; em desenvolvimento, os links são registrados no log da API e também podem ser copiados na interface. Para notificações Push com a aba fechada, gere um par VAPID com `npx web-push generate-vapid-keys --json` e configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`; sem essas chaves, a opção do navegador funciona enquanto o Rocket está aberto. Mantenha a chave privada fora do repositório.

## Identidade visual

A interface usa uma paleta monocromática concentrada em `apps/web/src/styles/tokens.css`, com temas claro, escuro e alto contraste. A marca na barra superior pode ser personalizada por `VITE_BRAND_NAME` e `VITE_BRAND_LOGO_URL`.

## Próximas etapas

O Bloco 9 foi publicado em `d7f6d88` e passou no CI #49, incluindo migrações, testes integrados com PostgreSQL/Redis, serviços MinIO/LiveKit, build, seed e smoke test. A conferência de mídia entre duas contas permanece pendente: o navegador integrado abre a web, mas a tela de calendário exige autenticação e a API local não está disponível sem Docker. O próximo passo independente é o Bloco 10 — Abas de canal e produtividade; também continuam pendentes conferências visuais multiusuário dos Blocos 4, 5 e 7. O plano para aplicativos Android, iOS, Windows e macOS está em [`docs/PLANO_APLICATIVO_NATIVO.md`](docs/PLANO_APLICATIVO_NATIVO.md); sua implementação vem após estabilizar os blocos 9 a 12. Consulte o [`roadmap`](docs/ROADMAP.md), as [permissões](docs/PERMISSOES.md) e a [API](docs/API.md).
