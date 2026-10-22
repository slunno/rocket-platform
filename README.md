# Rocket

Base inicial para uma plataforma própria de comunicação corporativa. O repositório separa a experiência web da API e mantém contratos simples entre elas.

## Estrutura

```text
apps/
  web/                 Interface React + TypeScript + Vite
  api/                 API Express + Socket.IO
    prisma/            Modelo PostgreSQL e dados de demonstração
docker-compose.yml     PostgreSQL e Redis para desenvolvimento
```

## O que já está preparado

- Interface em português com canais, mensagens diretas, busca rápida (`Ctrl/Cmd + K`), detalhes da conversa, reações de demonstração e compositor de mensagens.
- API com sessão de demonstração local, listagem de conversas, histórico e envio de mensagens.
- Eventos Socket.IO para mensagens novas em conversas das quais a pessoa participa.
- Modelo de dados para espaços, pessoas, canais, membros, mensagens, respostas, anexos e reações.
- Dados fictícios para experimentar a interface mesmo sem API ou banco configurados. O modo local não sincroniza mensagens entre pessoas.

## Requisitos

- Node.js 20 ou superior
- Docker Desktop (para iniciar PostgreSQL e Redis localmente)

## Rodar localmente

1. Instale as dependências: `npm install`.
2. Copie `.env.example` para `.env` e substitua os valores de `POSTGRES_PASSWORD`, `DATABASE_URL` e `JWT_SECRET`. Use a mesma senha local do PostgreSQL nos dois primeiros valores e um segredo longo e aleatório para o JWT.
3. Inicie os serviços de dados: `docker compose up -d`.
4. Gere o cliente e aplique a primeira migração: `npm run db:generate` e `npm run db:migrate`.
5. Carregue os dados de demonstração: `npm run db:seed`.
6. Inicie a interface e a API: `npm run dev`.
7. Abra `http://localhost:5173`.

O endpoint de sessão demo fica habilitado apenas fora de produção e somente quando `DEMO_AUTH_ENABLED=true`. Em produção, conecte o fluxo a SSO/IdP da empresa, configure segredo seguro, armazenamento de arquivos, política de retenção, limites e observabilidade antes de publicar.

## Próximas etapas de produto

1. Login corporativo e gestão de espaços/permissões.
2. Criação de canais e convites com persistência.
3. Upload de arquivos, respostas em tópicos, edição e exclusão de mensagens.
4. Presença, indicadores de leitura e notificações.
5. Busca de mensagens, auditoria e políticas de retenção.
6. Redis adapter para escalar Socket.IO horizontalmente e fila de tarefas para notificações.

O Redis está incluído no ambiente local como ponto de partida para presença, filas e distribuição de eventos entre instâncias; a API inicial ainda mantém os eventos em uma única instância.
