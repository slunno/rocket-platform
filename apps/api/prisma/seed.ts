import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

dotenv.config({ path: '../../.env' });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to seed the database.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const people = [
  { id: 'demo-user', username: 'alex.nogueira', displayName: 'Alex Nogueira', status: 'ONLINE' as const },
  { id: 'ana', username: 'ana.souza', displayName: 'Ana Souza', status: 'ONLINE' as const },
  { id: 'marcos', username: 'marcos.ribeiro', displayName: 'Marcos Ribeiro', status: 'AWAY' as const },
  { id: 'bruna', username: 'bruna.costa', displayName: 'Bruna Costa', status: 'OFFLINE' as const },
  { id: 'luiz', username: 'luiz.fernando', displayName: 'Luiz Fernando', status: 'ONLINE' as const },
];

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'rocket-labs' },
    update: { name: 'Rocket Labs' },
    create: { id: 'rocket-labs', name: 'Rocket Labs', slug: 'rocket-labs' },
  });

  for (const person of people) {
    await prisma.user.upsert({ where: { id: person.id }, update: person, create: person });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: person.id } },
      update: {},
      create: { workspaceId: workspace.id, userId: person.id, role: person.id === 'demo-user' ? 'OWNER' : 'MEMBER' },
    });
  }

  const specs = [
    { id: 'produto', name: 'produto', description: 'Ideias, melhorias e tudo que estamos construindo.', type: 'CHANNEL' as const, members: ['demo-user', 'ana', 'marcos', 'luiz'] },
    { id: 'geral', name: 'geral', description: 'Um espaço para toda a equipe.', type: 'CHANNEL' as const, members: people.map((person) => person.id) },
    { id: 'engenharia', name: 'engenharia', description: 'Discussões técnicas e atualizações de engenharia.', type: 'CHANNEL' as const, members: ['demo-user', 'marcos', 'luiz'] },
    { id: 'dm-ana', name: 'Ana Souza', description: null, type: 'DIRECT' as const, members: ['demo-user', 'ana'] },
    { id: 'dm-marcos', name: 'Marcos Ribeiro', description: null, type: 'DIRECT' as const, members: ['demo-user', 'marcos'] },
    { id: 'dm-bruna', name: 'Bruna Costa', description: null, type: 'DIRECT' as const, members: ['demo-user', 'bruna'] },
  ];

  for (const spec of specs) {
    await prisma.conversation.upsert({
      where: { id: spec.id },
      update: { name: spec.name, description: spec.description, type: spec.type },
      create: { id: spec.id, name: spec.name, description: spec.description, type: spec.type, workspaceId: workspace.id },
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
    await prisma.message.createMany({ data: [
      { conversationId: 'produto', authorId: 'ana', text: 'Bom dia, time! Separei aqui os pontos da nova experiência de conversas. Quando puderem, deem uma olhada no protótipo.' },
      { conversationId: 'produto', authorId: 'marcos', text: 'A navegação está bem mais clara. Gostei de como os canais ficaram organizados.' },
      { conversationId: 'produto', authorId: 'demo-user', text: 'Também curti. Acho que podemos aproveitar para deixar a busca sempre visível e facilitar a troca entre conversas.' },
      { conversationId: 'produto', authorId: 'luiz', text: 'Faz sentido. No backend, vou separar as conversas por tipo e manter as mensagens em tempo real via WebSocket.' },
      { conversationId: 'produto', authorId: 'ana', text: 'Já deixei os comentários no protótipo. A gente pode fechar os detalhes na nossa conversa de amanhã?' },
    ] });
  }

  console.log('Rocket demo data is ready.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
