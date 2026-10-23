# Permissões de organização

As permissões são verificadas pela API em cada rota e no evento Socket.IO `channel:join`. A interface apenas reflete essas regras; ela não é a barreira de segurança.

## Papéis do espaço de trabalho

| Papel                       | Permissões                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proprietário (`OWNER`)**  | Administra equipes, canais, convites e membros; pode conceder ou retirar o papel de administrador. O papel de proprietário não pode ser removido pelo fluxo do Bloco 3.                                  |
| **Administrador (`ADMIN`)** | Administra equipes, canais, convites e membros. Pode alterar papéis entre membro e convidado, mas não pode conceder, retirar ou editar o papel de administrador nem remover outra pessoa administradora. |
| **Membro (`MEMBER`)**       | Acessa o espaço de trabalho, pode entrar em equipes e canais públicos e pode ler/escrever somente onde é membro.                                                                                         |
| **Convidado (`GUEST`)**     | Acessa somente as equipes associadas aos convites aceitos ou adicionadas por um administrador. Não consulta o diretório completo do espaço nem entra por conta própria em outras equipes.                |

## Equipes e canais

- A criação de espaço de trabalho cria a equipe **Geral** e o canal público `geral`. Cada equipe também recebe um canal público `geral`.
- Um membro do espaço pode descobrir equipes e entrar em uma equipe; a associação à equipe libera seus canais públicos.
- As mensagens de um canal privado ficam disponíveis apenas aos participantes. A API mostra seus metadados aos proprietários e administradores para que possam gerenciar a lista, sem liberar o conteúdo.
- Adicionar uma pessoa a um canal privado também a associa à equipe, mas não a outros canais privados.
- Sair de uma equipe remove a associação aos canais privados daquela equipe. Mensagens permanecem vinculadas ao canal arquivado ou ativo e seguem protegidas pelas verificações de acesso.
- Ao mudar uma pessoa existente para `GUEST`, a API remove suas associações atuais a equipes e canais privados e desconecta suas salas de socket; um administrador deve adicioná-la às equipes permitidas.
- Favoritar e ocultar são preferências individuais; não alteram o acesso de outras pessoas.

## Convites

- Proprietários e administradores podem convidar por e-mail como `MEMBER` ou `GUEST`, opcionalmente vinculando o convite a uma equipe.
- O token aleatório é armazenado como hash SHA-256, vence em sete dias e só pode ser aceito uma vez.
- O e-mail autenticado precisa corresponder ao destinatário do convite. Um convite para equipe inclui associação à equipe; os canais públicos dela ficam disponíveis.
- O envio usa o `MailProvider` existente: log no desenvolvimento e SMTP quando configurado. Na interface, o administrador também pode copiar o link.

## Respostas de acesso

Rotas que não devem revelar a existência de um recurso retornam `404`. Falta de papel de gestão em um recurso conhecido retorna `403`. Mensagens privadas continuam retornando `403` para quem pertence ao espaço, mas não ao canal.
