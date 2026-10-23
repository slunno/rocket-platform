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

  const teams = [
    {
      slug: 'produto-e-estilo',
      name: 'Produto e Estilo',
      description: 'Desenvolvimento, modelagem e calendário de coleção.',
      channel: {
        id: 'produto',
        slug: 'produto-e-estilo',
        name: 'produto-e-estilo',
        description: 'Desenvolvimento de produto, modelagem e calendário de coleção.',
        members: ['demo-user', 'ana', 'marcos', 'luiz'],
      },
    },
    {
      slug: 'comercial',
      name: 'Comercial',
      description: 'Metas, representantes e relacionamento com os canais de venda.',
      channel: {
        id: 'comercial',
        slug: 'comercial',
        name: 'comercial',
        description: 'Metas, representantes e novidades das coleções.',
        members: ['demo-user', 'ana', 'marcos', 'luiz'],
      },
    },
    {
      slug: 'producao',
      name: 'Produção',
      description: 'Planejamento e acompanhamento das ordens de produção.',
      channel: {
        id: 'producao',
        slug: 'producao',
        name: 'producao',
        description: 'Planejamento e acompanhamento das ordens de produção.',
        members: ['demo-user', 'ana', 'marcos', 'luiz'],
      },
    },
    {
      slug: 'marketing',
      name: 'Marketing',
      description: 'Campanhas, conteúdo e materiais das marcas.',
      channel: {
        id: 'marketing',
        slug: 'marketing',
        name: 'marketing',
        description: 'Campanhas, conteúdo e materiais das marcas.',
        members: ['demo-user', 'ana', 'bruna', 'luiz'],
      },
    },
    {
      slug: 'logistica',
      name: 'Logística',
      description: 'Estoque, expedição e entregas.',
      channel: {
        id: 'logistica',
        slug: 'logistica',
        name: 'logistica',
        description: 'Estoque, expedição e entregas para os canais de venda.',
        members: ['demo-user', 'marcos', 'bruna'],
      },
    },
    {
      slug: 'ti',
      name: 'Tecnologia',
      description: 'Suporte interno, sistemas e melhorias de tecnologia.',
      channel: {
        id: 'ti',
        slug: 'ti',
        name: 'ti',
        description: 'Suporte interno, sistemas e melhorias de tecnologia.',
        members: ['demo-user', 'marcos', 'luiz'],
      },
    },
  ];

  const generalTeam = await prisma.team.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: 'akr-brands' } },
    update: { name: 'AKR Brands', archivedAt: null },
    create: {
      workspaceId: workspace.id,
      name: 'AKR Brands',
      slug: 'akr-brands',
      description: 'Espaço principal da organização.',
    },
  });
  const migratedGeneralChannel = await prisma.channel.findUnique({
    where: { teamId_slug: { teamId: generalTeam.id, slug: 'geral' } },
  });
  const generalChannel = migratedGeneralChannel
    ? await prisma.channel.update({
        where: { id: migratedGeneralChannel.id },
        data: {
          name: 'geral',
          description: 'Avisos e alinhamentos gerais da AKR Brands.',
          visibility: 'PUBLIC',
          archivedAt: null,
        },
      })
    : await prisma.channel.upsert({
        where: { id: 'geral' },
        update: {
          teamId: generalTeam.id,
          name: 'geral',
          slug: 'geral',
          description: 'Avisos e alinhamentos gerais da AKR Brands.',
          visibility: 'PUBLIC',
          archivedAt: null,
        },
        create: {
          id: 'geral',
          teamId: generalTeam.id,
          name: 'geral',
          slug: 'geral',
          description: 'Avisos e alinhamentos gerais da AKR Brands.',
          visibility: 'PUBLIC',
        },
      });

  for (const person of people) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: generalTeam.id, userId: person.id } },
      update: {},
      create: { teamId: generalTeam.id, userId: person.id },
    });
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: generalChannel.id, userId: person.id } },
      update: {},
      create: { channelId: generalChannel.id, userId: person.id },
    });
  }

  for (const teamSpec of teams) {
    const team = await prisma.team.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: teamSpec.slug } },
      update: { name: teamSpec.name, description: teamSpec.description, archivedAt: null },
      create: {
        workspaceId: workspace.id,
        name: teamSpec.name,
        slug: teamSpec.slug,
        description: teamSpec.description,
      },
    });
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: 'demo-user' } },
      update: {},
      create: { teamId: team.id, userId: 'demo-user' },
    });
    const channel = await prisma.channel.upsert({
      where: { id: teamSpec.channel.id },
      update: {
        teamId: team.id,
        name: teamSpec.channel.name,
        slug: teamSpec.channel.slug,
        description: teamSpec.channel.description,
        visibility: 'PUBLIC',
        archivedAt: null,
      },
      create: {
        id: teamSpec.channel.id,
        teamId: team.id,
        name: teamSpec.channel.name,
        slug: teamSpec.channel.slug,
        description: teamSpec.channel.description,
        visibility: 'PUBLIC',
      },
    });
    for (const userId of teamSpec.channel.members) {
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        update: {},
        create: { teamId: team.id, userId },
      });
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId } },
        update: {},
        create: { channelId: channel.id, userId },
      });
    }
  }

  const directConversationSpecs = [
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

  for (const spec of directConversationSpecs) {
    await prisma.conversation.upsert({
      where: { id: spec.id },
      update: { name: spec.name, description: spec.description, type: spec.type },
      create: {
        id: spec.id,
        name: spec.name,
        description: spec.description,
        type: spec.type,
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

  const existing = await prisma.message.count({ where: { channelId: 'produto' } });
  if (existing === 0) {
    await prisma.message.createMany({
      data: [
        {
          channelId: 'produto',
          authorId: 'ana',
          text: 'Bom dia, time! Separei as referências de tecido e modelagem para a próxima coleção. Vou compartilhar o material aqui.',
        },
        {
          channelId: 'produto',
          authorId: 'marcos',
          text: 'A proposta de cores está alinhada com o calendário. Também revisei as medidas da primeira peça piloto.',
        },
        {
          channelId: 'produto',
          authorId: 'demo-user',
          text: 'Ótimo. Vamos confirmar os prazos com Produção antes de fechar a grade de tamanhos.',
        },
        {
          channelId: 'produto',
          authorId: 'luiz',
          text: 'Atualizei a ficha técnica com os comentários da prova. A versão revisada está pronta para validação.',
        },
        {
          channelId: 'produto',
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
