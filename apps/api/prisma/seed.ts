import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to seed the database.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const people = [
  {
    id: 'demo-user',
    username: 'alex.nogueira',
    displayName: 'Alex Nogueira',
    status: 'ONLINE' as const,
  },
  { id: 'ana', username: 'ana.souza', displayName: 'Ana Souza', status: 'ONLINE' as const },
  {
    id: 'marcos',
    username: 'marcos.ribeiro',
    displayName: 'Marcos Ribeiro',
    status: 'AWAY' as const,
  },
  { id: 'bruna', username: 'bruna.costa', displayName: 'Bruna Costa', status: 'OFFLINE' as const },
  {
    id: 'luiz',
    username: 'luiz.fernando',
    displayName: 'Luiz Fernando',
    status: 'ONLINE' as const,
  },
];

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'akr-brands' },
    update: { name: 'AKR Brands' },
    create: { id: 'akr-brands', name: 'AKR Brands', slug: 'akr-brands' },
  });

  for (const person of people) {
    await prisma.user.upsert({ where: { id: person.id }, update: person, create: person });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: person.id } },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: person.id,
        role: person.id === 'demo-user' ? 'OWNER' : 'MEMBER',
      },
    });
  }

  const specs = [
    {
      id: 'produto',
      name: 'produto-e-estilo',
      description: 'Desenvolvimento de produto, modelagem e calendário de coleção.',
      type: 'CHANNEL' as const,
      members: ['demo-user', 'ana', 'marcos', 'luiz'],
    },
    {
      id: 'geral',
      name: 'geral',
      description: 'Avisos e alinhamentos gerais da AKR Brands.',
      type: 'CHANNEL' as const,
      members: people.map((person) => person.id),
    },
    {
      id: 'comercial',
      name: 'comercial',
      description: 'Metas, representantes e novidades das coleções.',
      type: 'CHANNEL' as const,
      members: ['demo-user', 'ana', 'marcos', 'luiz'],
    },
    {
      id: 'producao',
      name: 'producao',
      description: 'Planejamento e acompanhamento das ordens de produção.',
      type: 'CHANNEL' as const,
      members: ['demo-user', 'ana', 'marcos', 'luiz'],
    },
    {
      id: 'marketing',
      name: 'marketing',
      description: 'Campanhas, conteúdo e materiais das marcas.',
      type: 'CHANNEL' as const,
      members: ['demo-user', 'ana', 'bruna', 'luiz'],
    },
    {
      id: 'logistica',
      name: 'logistica',
      description: 'Estoque, expedição e entregas para os canais de venda.',
      type: 'CHANNEL' as const,
      members: ['demo-user', 'marcos', 'bruna'],
    },
    {
      id: 'ti',
      name: 'ti',
      description: 'Suporte interno, sistemas e melhorias de tecnologia.',
      type: 'CHANNEL' as const,
      members: ['demo-user', 'marcos', 'luiz'],
    },
    {
      id: 'dm-ana',
      name: 'Ana Souza',
      description: null,
      type: 'DIRECT' as const,
      members: ['demo-user', 'ana'],
    },
    {
      id: 'dm-marcos',
      name: 'Marcos Ribeiro',
      description: null,
      type: 'DIRECT' as const,
      members: ['demo-user', 'marcos'],
    },
    {
      id: 'dm-bruna',
      name: 'Bruna Costa',
      description: null,
      type: 'DIRECT' as const,
      members: ['demo-user', 'bruna'],
    },
  ];

  for (const spec of specs) {
    await prisma.conversation.upsert({
      where: { id: spec.id },
      update: { name: spec.name, description: spec.description, type: spec.type },
      create: {
        id: spec.id,
        name: spec.name,
        description: spec.description,
        type: spec.type,
        workspaceId: workspace.id,
      },
    });
    for (const userId of spec.members) {
      await prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId: spec.id, userId } },
        update: {},
        create: { conversationId: spec.id, userId },
      });
    }
  }

  const existing = await prisma.message.count({ where: { conversationId: 'produto' } });
  if (existing === 0) {
    await prisma.message.createMany({
      data: [
        {
          conversationId: 'produto',
          authorId: 'ana',
          text: 'Bom dia, time! Separei as referências de tecido e modelagem para a próxima coleção. Vou compartilhar o material aqui.',
        },
        {
          conversationId: 'produto',
          authorId: 'marcos',
          text: 'A proposta de cores está alinhada com o calendário. Também revisei as medidas da primeira peça piloto.',
        },
        {
          conversationId: 'produto',
          authorId: 'demo-user',
          text: 'Ótimo. Vamos confirmar os prazos com Produção antes de fechar a grade de tamanhos.',
        },
        {
          conversationId: 'produto',
          authorId: 'luiz',
          text: 'Atualizei a ficha técnica com os comentários da prova. A versão revisada está pronta para validação.',
        },
        {
          conversationId: 'produto',
          authorId: 'ana',
          text: 'Perfeito, vou consolidar os ajustes e levar a aprovação para a reunião de amanhã.',
        },
      ],
    });
  }

  console.log('Rocket demo data is ready.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
