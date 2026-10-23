# Decisões técnicas

Registros curtos de contexto, decisão e consequência.

## 2026-10-22 — Construção do pacote compartilhado

- **Contexto:** API e web precisam consumir contratos comuns sem copiar schemas.
- **Decisão:** `@rocket/shared` é compilado para `dist` antes de typecheck/build dos consumidores.
- **Consequência:** scripts raiz preservam essa ordem; o diretório `dist` continua gerado e ignorado pelo Git.

## 2026-10-22 — Migração inicial sem serviço PostgreSQL local

- **Contexto:** o ambiente de execução não disponibiliza Docker, `psql` nem PostgreSQL.
- **Decisão:** gerar a migração inicial com `prisma migrate diff` a partir do schema versionado, sem simular aplicação no banco.
- **Consequência:** o SQL fica revisável e commitável; CI aplica a migração e executa o seed em PostgreSQL 17. A máquina local não foi usada para validação de banco.

## 2026-10-22 — Validação de ambiente

- **Contexto:** a API lia configuração diretamente de `process.env` e usava defaults inconsistentes.
- **Decisão:** validar `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `DEMO_AUTH_ENABLED`, `API_PORT` e `WEB_ORIGIN` com Zod antes de iniciar rotas/sockets.
- **Consequência:** inicialização falha cedo com campos e mensagens claros; demo habilitada em produção é rejeitada.

## 2026-10-22 — Dados de demonstração AKR

- **Contexto:** o seed inicial tinha espaços e canais de exemplo de uma empresa de tecnologia.
- **Decisão:** usar nomes fictícios e canais de Comercial, Produto e Estilo, Produção, Marketing, Logística e TI.
- **Consequência:** demonstração é coerente com moda/indústria e não depende de dados reais.

## 2026-10-22 — Shell, navegação e temas

- **Contexto:** o protótipo concentrava rotas, layout, conversa e componentes em um único arquivo e usava estilos sem uma fonte única de cores.
- **Decisão:** usar React Router 7, separar shell/layout/features/componentes, concentrar cores em `apps/web/src/styles/tokens.css` e oferecer temas claro, escuro e alto contraste.
- **Consequência:** o tema e a largura da barra lateral ficam em `localStorage`; os caminhos de Atividade, Calendário, Arquivos e Chamadas já existem com estados vazios até seus blocos funcionais.

## 2026-10-22 — Marca e avatares monocromáticos

- **Contexto:** organizações diferentes precisam adaptar a marca sem alterar o design system; os avatares do protótipo usavam cores aleatórias.
- **Decisão:** configurar nome e logo da barra superior por `VITE_BRAND_NAME` e `VITE_BRAND_LOGO_URL`, e derivar o tom monocromático do avatar pelo identificador estável da pessoa.
- **Consequência:** a identidade da barra pode ser personalizada por ambiente e a mesma pessoa mantém aparência previsível entre renderizações.

## 2026-10-23 — Sessões e recuperação de senha

- **Contexto:** a demonstração precisava evoluir para contas reais, sessões persistentes e recuperação sem expor credenciais ou tokens reutilizáveis.
- **Decisão:** usar hashes Argon2id para senhas, access tokens HS256 de 15 minutos e refresh tokens opacos com rotação, hash SHA-256 no banco, família de sessão e revogação em caso de replay; cookies `HttpOnly`/`SameSite=Lax`; tokens de recuperação de uso único com expiração de 20 minutos; `MailProvider` com log em desenvolvimento e SMTP em produção.
- **Consequência:** refresh e recuperação podem ser revogados no servidor, sockets são desconectados ao revogar sessões e produção precisa de segredo exclusivo e SMTP configurado. Tentativas de login usam chaves HMAC e bloqueio progressivo persistidos no PostgreSQL.
