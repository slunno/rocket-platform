# Decisões técnicas

Registros curtos de contexto, decisão e consequência.

## 2026-10-22 — Construção do pacote compartilhado

- **Contexto:** API e web precisam consumir contratos comuns sem copiar schemas.
- **Decisão:** `@rocket/shared` é compilado para `dist` antes de typecheck/build dos consumidores.
- **Consequência:** scripts raiz preservam essa ordem; o diretório `dist` continua gerado e ignorado pelo Git.

## 2026-10-22 — Migração inicial sem serviço PostgreSQL local

- **Contexto:** o ambiente de execução não disponibiliza Docker, `psql` nem PostgreSQL.
- **Decisão:** gerar a migração inicial com `prisma migrate diff` a partir do schema versionado, sem simular aplicação no banco.
- **Consequência:** o SQL fica revisável e commitável; Bloco 0 permanece em andamento até aplicação real e validação do seed.

## 2026-10-22 — Validação de ambiente

- **Contexto:** a API lia configuração diretamente de `process.env` e usava defaults inconsistentes.
- **Decisão:** validar `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `DEMO_AUTH_ENABLED`, `API_PORT` e `WEB_ORIGIN` com Zod antes de iniciar rotas/sockets.
- **Consequência:** inicialização falha cedo com campos e mensagens claros; demo habilitada em produção é rejeitada.

## 2026-10-22 — Dados de demonstração AKR

- **Contexto:** o seed inicial tinha espaços e canais de exemplo de uma empresa de tecnologia.
- **Decisão:** usar nomes fictícios e canais de Comercial, Produto e Estilo, Produção, Marketing, Logística e TI.
- **Consequência:** demonstração é coerente com moda/indústria e não depende de dados reais.
