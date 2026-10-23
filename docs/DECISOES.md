# Decisões técnicas

## 2026-10-23 — Feed de atividade e notificações

- **Contexto:** menções, respostas, reações e aceite de convites precisam ficar disponíveis entre sessões e não podem revelar conteúdo de canais ou conversas após a perda de acesso.
- **Decisão:** persistir registros de atividade com destinatário, autor, tipo e destino, sem copiar o texto da mensagem; revalidar associação no feed; usar níveis individuais `ALL`, `MENTIONS` e `MUTED`; entregar eventos em tempo real por BullMQ/Redis e suprimir entregas quando o destinatário estiver em Não incomodar. A permissão de notificações do navegador é opt-in; quando VAPID está configurado, registrar assinatura Web Push ligada à conta.
- **Consequência:** o feed continua consultável quando a entrega em tempo real falha; o cliente recebe apenas metadados necessários para navegar. Service worker mostra notificações push mesmo com a aba fechada; sem VAPID, o navegador recebe notificações enquanto o Rocket está aberto. Assinaturas aceitam somente endpoints HTTPS de serviços conhecidos para evitar SSRF.

## 2026-10-23 — Presença distribuída

- **Contexto:** sockets podem estar distribuídos entre instâncias da API, e o estado online não deve revelar membros fora das conversas ou canais acessíveis.
- **Decisão:** usar `@socket.io/redis-adapter` e guardar sockets ativos em Redis com heartbeat de 20 segundos, TTL de 60 segundos e remoção atômica de sessões expiradas; entregar snapshots somente de membros compartilhados por conversas, canais privados autorizados ou equipes com canais públicos acessíveis.
- **Consequência:** Redis precisa ficar em rede privada com autenticação/TLS em produção. Quando o Socket.IO escalar com long-polling habilitado, a implantação precisa configurar sessões persistentes (sticky sessions); o adapter distribui Pub/Sub e não armazena o estado do aplicativo.

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

## 2026-10-23 — Edição, exclusão e reações de mensagens

- **Contexto:** alterações precisam respeitar autoria e refletir nas outras sessões sem apagar o histórico de forma irreversível.
- **Decisão:** somente quem criou a mensagem pode editar ou marcar como excluída; reações usam chave única por mensagem, pessoa e emoji; os eventos publicam a mensagem atualizada para os membros da sala autorizada.
- **Consequência:** o texto excluído permanece no banco sob `deletedAt`, listas normais o ocultam e a interface mostra o estado de exclusão; reações podem ser removidas e incluem participantes para exibição.

## 2026-10-23 — Indicador de digitação em salas autorizadas

- **Contexto:** participantes precisam saber quando outra pessoa está escrevendo sem confiar em identidade ou sala informada pelo navegador.
- **Decisão:** o socket valida o evento com schema compartilhado e só publica em uma sala que a conexão autenticada já integra; nome e ID vêm da sessão no servidor.
- **Consequência:** o navegador envia estados de início e parada, encerra após inatividade e remove indicadores remotos depois de três segundos sem atualização.

## 2026-10-23 — Respostas em tópicos

- **Contexto:** canais e chats precisam permitir conversas laterais sem misturar respostas à linha do tempo principal.
- **Decisão:** usar `Message.replyToId` existente, autorizar cada operação pelo acesso à mensagem inicial e limitar os tópicos a um nível; contar apenas respostas não excluídas.
- **Consequência:** respostas têm paginação por cursor, chave idempotente, eventos em tempo real e edição/exclusão pelos mesmos critérios de autoria das mensagens principais.

## 2026-10-23 — Identidade e unicidade dos chats

- **Contexto:** duas pessoas não podem criar DMs paralelas; grupos precisam manter seus participantes, foto e preferências sem confundir chats entre usuários.
- **Decisão:** usar uma chave única de IDs ordenados para DMs, consolidar DMs legadas duplicadas na migração e armazenar silenciar/fixar na associação individual. Grupos permitem até 50 pessoas, foto opcional por URL HTTPS e gerenciamento pelo criador; ao sair, o criador passa para a pessoa restante mais antiga.
- **Consequência:** mensagens legadas são preservadas durante a consolidação; para as mensagens que vierem de uma DM duplicada, a chave antiga `clientMessageId` é removida para evitar conflito ao mesclar, mas seu conteúdo e IDs permanecem. Alterações de grupo emitem `conversation:updated` para os clientes participantes.

## 2026-10-23 — Uploads e acesso a anexos

- **Contexto:** mensagens precisam anexar arquivos sem enviar bytes pela API e sem permitir que URLs públicas revelem conteúdo de canais privados.
- **Decisão:** usar armazenamento S3 compatível com MinIO, upload direto por formulário pré-assinado e bucket privado. Limitar cada arquivo a 25 MiB e cada mensagem a 10 anexos; aceitar somente tipos documentados, sanitizar nomes e verificar tamanho, MIME e assinatura do conteúdo ao concluir o upload. Downloads são URLs assinadas por cinco minutos, emitidas somente após autorização no chat/canal. A API nunca retorna `storageKey`.
- **Consequência:** arquivos incompletos ou inválidos não aparecem nas listagens e não podem ser baixados. A interface global e a aba de arquivos do canal só listam anexos de conversas/canais acessíveis. Respostas de tópicos não aceitam anexos nesta etapa; o compose de respostas não oferece esse fluxo.
- **Compatibilidade S3:** o bucket não é configurado pela API com CORS por bucket, pois essa operação não é compatível com a imagem MinIO legada usada no CI. O MinIO local recebe `MINIO_API_CORS_ALLOW_ORIGIN` como configuração global; em produção, configure CORS no serviço S3 para a origem web publicada. A verificação do MIME e da assinatura do arquivo permanece obrigatória na API.
- **Ambiente local e CI:** o runner do GitHub recebeu `unauthorized` ao baixar `quay.io/minio/minio`; a página do repositório oficial `minio/minio` no Docker Hub retorna 404. O Compose e o CI usam `bitnamilegacy/minio:2025.7.23` como serviço local de desenvolvimento/teste. A imagem é antiga e não recebe atualizações; em produção, configure um endpoint S3 compatível mantido e gerenciado pela implantação.
