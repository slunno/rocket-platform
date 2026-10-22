import type { Conversation, Message, Person } from './types';

export const me: Person = {
  id: 'demo-user',
  name: 'Alex Nogueira',
  initials: 'AN',
  status: 'online',
  role: 'Produto',
};

export const people: Person[] = [
  me,
  {
    id: 'ana',
    name: 'Ana Souza',
    initials: 'AS',
    status: 'online',
    role: 'Product designer',
  },
  {
    id: 'marcos',
    name: 'Marcos Ribeiro',
    initials: 'MR',
    status: 'away',
    role: 'Engenharia',
  },
  {
    id: 'bruna',
    name: 'Bruna Costa',
    initials: 'BC',
    status: 'offline',
    role: 'Marketing',
  },
  {
    id: 'luiz',
    name: 'Luiz Fernando',
    initials: 'LF',
    status: 'online',
    role: 'Liderança',
  },
];

export const conversations: Conversation[] = [
  {
    id: 'produto',
    kind: 'CHANNEL',
    name: 'produto',
    description: 'Ideias, melhorias e tudo que estamos construindo.',
    members: [people[0], people[1], people[2], people[4]],
    lastMessage: 'Já deixei os comentários no protótipo.',
    lastAt: '10:42',
  },
  {
    id: 'geral',
    kind: 'CHANNEL',
    name: 'geral',
    description: 'Um espaço para toda a equipe.',
    members: people,
    unread: 3,
    lastMessage: 'Bom dia, pessoal! ☀️',
    lastAt: '09:18',
  },
  {
    id: 'engenharia',
    kind: 'CHANNEL',
    name: 'engenharia',
    description: 'Discussões técnicas e atualizações de engenharia.',
    members: [people[0], people[2], people[4]],
    lastMessage: 'O deploy foi concluído.',
    lastAt: 'Ontem',
  },
  {
    id: 'dm-ana',
    kind: 'DIRECT',
    name: 'Ana Souza',
    members: [people[0], people[1]],
    lastMessage: 'Perfeito, combinado!',
    lastAt: '10:28',
  },
  {
    id: 'dm-marcos',
    kind: 'DIRECT',
    name: 'Marcos Ribeiro',
    members: [people[0], people[2]],
    unread: 1,
    lastMessage: 'Você consegue revisar isso hoje?',
    lastAt: '09:54',
  },
  {
    id: 'dm-bruna',
    kind: 'DIRECT',
    name: 'Bruna Costa',
    members: [people[0], people[3]],
    lastMessage: 'Obrigada! ✨',
    lastAt: 'Ontem',
  },
];

const currentDate = new Date();
const previousDate = new Date(currentDate);
previousDate.setDate(previousDate.getDate() - 1);
const formatDayAndMonth = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(date);
const today = `Hoje, ${formatDayAndMonth(currentDate)}`;
const yesterday = `Ontem, ${formatDayAndMonth(previousDate)}`;

export const messages: Record<string, Message[]> = {
  produto: [
    {
      id: 'm1',
      author: people[1],
      text: 'Bom dia, time! ☀️ Separei aqui os pontos da nova experiência de conversas. Quando puderem, deem uma olhada no protótipo.',
      time: '09:32',
      date: today,
      reactions: [
        { emoji: '👀', count: 2 },
        { emoji: '✨', count: 1 },
      ],
    },
    {
      id: 'm2',
      author: people[2],
      text: 'A navegação está bem mais clara. Gostei de como os canais ficaram organizados.',
      time: '09:41',
      date: today,
      reactions: [{ emoji: '🙌', count: 2 }],
    },
    {
      id: 'm3',
      author: me,
      text: 'Também curti. Acho que podemos aproveitar para deixar a busca sempre visível e facilitar a troca entre conversas.',
      time: '10:02',
      date: today,
      mine: true,
    },
    {
      id: 'm4',
      author: people[4],
      text: 'Faz sentido. No backend, vou separar as conversas por tipo e manter as mensagens em tempo real via WebSocket.',
      time: '10:19',
      date: today,
      reactions: [{ emoji: '👍', count: 3 }],
      replyCount: 2,
    },
    {
      id: 'm5',
      author: people[1],
      text: 'Já deixei os comentários no protótipo. A gente pode fechar os detalhes na nossa conversa de amanhã?',
      time: '10:42',
      date: today,
    },
  ],
  geral: [
    {
      id: 'g1',
      author: people[4],
      text: 'Bom dia, pessoal! ☀️ Espero que todo mundo esteja bem. Vamos com tudo nessa semana!',
      time: '09:18',
      date: today,
      reactions: [
        { emoji: '☀️', count: 4 },
        { emoji: '💛', count: 2 },
      ],
    },
    {
      id: 'g2',
      author: people[3],
      text: 'Bom dia! Já estamos preparando as novidades para compartilhar com vocês.',
      time: '09:26',
      date: today,
    },
  ],
  engenharia: [
    {
      id: 'e1',
      author: people[2],
      text: 'O deploy foi concluído e está tudo certo no ambiente de staging. Se alguém encontrar algum problema, me avisa por aqui.',
      time: 'Ontem, 16:48',
      date: yesterday,
    },
  ],
  'dm-ana': [
    {
      id: 'a1',
      author: people[1],
      text: 'Oi, Alex! Conseguiu dar uma olhada naquela ideia para a página inicial?',
      time: '10:21',
      date: today,
    },
    {
      id: 'a2',
      author: me,
      text: 'Sim! Gostei bastante. Acho que ajuda a dar mais contexto logo no começo.',
      time: '10:24',
      date: today,
      mine: true,
    },
    {
      id: 'a3',
      author: people[1],
      text: 'Perfeito, combinado! Vou atualizar o protótipo hoje à tarde.',
      time: '10:28',
      date: today,
    },
  ],
  'dm-marcos': [
    {
      id: 'r1',
      author: people[2],
      text: 'Você consegue revisar isso hoje? É um ajuste pequeno no fluxo de mensagens.',
      time: '09:54',
      date: today,
    },
  ],
  'dm-bruna': [
    {
      id: 'b1',
      author: me,
      text: 'Separei as referências visuais para a próxima campanha. Te mando o link?',
      time: 'Ontem, 15:02',
      date: yesterday,
      mine: true,
    },
    { id: 'b2', author: people[3], text: 'Obrigada! ✨', time: 'Ontem, 15:16', date: yesterday },
  ],
};
