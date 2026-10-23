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

## 2026-10-23 — Separação de equipes, canais e conversas

- **Contexto:** o modelo antigo representava canais como `Conversation`, misturando publicações em equipe com chats diretos e em grupo.
- **Decisão:** criar `Team`, `Channel` e associações próprias; `Conversation` passa a conter apenas `DIRECT` e `GROUP`. Mensagens apontam para exatamente um chat ou canal.
- **Consequência:** a migração conserva os IDs dos canais antigos, converte mensagens e membros, e cria equipe/canal Geral para os espaços existentes. Um espaço legado criado sem workspace recebe como proprietário a primeira pessoa associada a um canal migrado.

## 2026-10-23 — Escopo de papéis e canais privados

- **Contexto:** o Bloco 3 precisa separar gestão da organização da participação no conteúdo privado.
- **Decisão:** proprietário e administrador gerenciam equipes, canais, membros e convites; somente proprietário pode conceder papel de administrador. Convidados ficam limitados às equipes vinculadas a convites ou adicionadas por um administrador. Administradores veem metadados necessários para gerenciar um canal privado, mas não recebem acesso às mensagens automaticamente.
- **Consequência:** a API e os sockets verificam associação no servidor; a interface usa as mesmas respostas para montar a navegação. Ao promover uma pessoa já existente para convidado, a API remove as associações atuais de equipes e canais e exige concessão explícita das equipes permitidas. As regras completas estão em `docs/PERMISSOES.md`.

## 2026-10-23 — Convites e entrega de e-mail

- **Contexto:** convites precisam funcionar com e-mail no desenvolvimento e em produção sem armazenar tokens reutilizáveis.
- **Decisão:** reutilizar `MailProvider`, com log local e SMTP configurável, guardar somente SHA-256 do token, expirar em sete dias e exigir correspondência de e-mail no aceite. A interface mostra o link para compartilhamento manual.
- **Consequência:** erro de envio cancela o convite recém-criado e retorna erro recuperável; o aceite é autenticado e de uso único.

## 2026-10-23 — Validação PostgreSQL do Bloco 3

- **Contexto:** o host local não tem Docker nem `psql`, então não pode aplicar migrações ou executar os testes de integração de banco.
- **Decisão:** manter os testes de autorização integrados sob `AUTH_INTEGRATION_TESTS=true`, para rodarem no workflow existente sobre PostgreSQL 17.
- **Consequência:** a validação local cobre tipagem, lint, testes sem banco e build; a conclusão do bloco depende do CI aplicar migrações e passar testes e seed.

## 2026-10-23 — Cursor e idempotência de mensagens

- **Contexto:** mensagens precisam carregar histórico antigo com custo previsível e suportar retries sem duplicar envios quando a resposta da rede se perde.
- **Decisão:** paginar por ID de mensagem no banco, ordenar por `createdAt` e `id` em ordem estável, e aceitar um UUID `clientMessageId` único por autor e conversa/canal.
- **Consequência:** a migração mantém compatibilidade com mensagens antigas via coluna nula; páginas informam `nextCursor` e retries com a mesma chave retornam o mesmo registro. A interface conserva a posição da rolagem ao inserir mensagens antigas e reconcilia otimistas pelo UUID.
