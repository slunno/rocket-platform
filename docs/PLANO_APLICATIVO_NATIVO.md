# Plano de aplicativo móvel e desktop do Rocket

## Objetivo

Entregar aplicativos instaláveis para Android, iOS, Windows e macOS, mantendo a API do Rocket como backend e compartilhando schemas, contratos e identidade visual. Esta etapa é posterior à estabilização dos blocos 9 a 12 do roadmap web, para que os aplicativos usem contratos já validados.

## Decisão técnica recomendada

- **Android e iOS:** React Native com Expo Development Builds. Reutilizar `@rocket/shared` e os contratos da API, implementar uma interface móvel própria e usar o SDK nativo React Native do LiveKit para chamadas de mídia.
- **Windows e macOS:** Tauri 2 envolvendo a interface React existente de `apps/web`. Reutilizar a API, a autenticação e os fluxos web; integrar notificações, bandeja do sistema e atalhos em etapas próprias.
- **Compartilhado:** extrair autenticação, chamadas REST e validação de payloads para um pacote isomórfico, sem importar APIs de navegador nas aplicações nativas.

O SDK React Native do LiveKit cobre mídia WebRTC em Android e iOS, com dependências nativas próprias; isso merece uma prova técnica inicial antes de migrar toda a experiência. Tauri aceita frontends web existentes e compila para Windows, macOS e Linux. Capacitor continua sendo uma alternativa para acelerar um app móvel reaproveitando a UI web, mas não é a opção recomendada antes de validar chamadas, permissões e execução em segundo plano no WebView.

Referências primárias: [LiveKit React Native](https://docs.livekit.io/transport/sdk-platforms/react-native/), [Tauri 2](https://tauri.app/), [Capacitor com React](https://capacitorjs.com/solution/react).

## Estrutura proposta

```text
apps/
  mobile/
    app/                    Rotas e navegação móvel
    src/auth/               Sessão e login nativos
    src/features/           Chat, equipes, atividade, calendário e chamadas
    src/notifications/      Push, abertura de destino e preferências
    src/meetings/           UI e integração com LiveKit React Native
    android/                Projeto nativo gerado e versionado
    ios/                    Projeto nativo gerado e versionado
  desktop/
    src/                    Inicialização da UI web no desktop
    src-tauri/              Runtime Rust, permissões, updater e empacotamento
packages/
  api-client/               REST, sessão e Socket.IO sem dependência de DOM
  shared/                   Schemas Zod e contratos existentes do Rocket
```

## Plano de ação

### 1. Prova técnica e contratos

- Confirmar URL de produção da API, domínios de deep link e identificador das lojas.
- Criar um app Expo pequeno com login, refresh/rotação de sessão, Socket.IO e uma chamada LiveKit de duas contas.
- Confirmar permissões de câmera/microfone, áudio em segundo plano, troca de rede e reconexão em aparelho Android e iPhone.
- Testar a autenticação atual com WebView/runtime nativo. Se o cookie `httpOnly` atual não for confiável no cliente nativo, criar um fluxo próprio de sessão móvel com refresh rotativo e armazenamento em Keychain/Android Keystore; não mover tokens persistentes para `localStorage`.
- **Aceite:** login/logout e chamada com áudio/vídeo funcionando em aparelho real nos dois sistemas, sem contornar proteção de credenciais.

### 2. Fundação do monorepo

- Criar `apps/mobile`, `apps/desktop` e `packages/api-client` como workspaces npm.
- Extrair para `packages/api-client` o acesso REST, renovação de sessão, reconexão de socket e tratamento de erros tipado.
- Manter schemas Zod em `@rocket/shared`; separar adaptadores de armazenamento de sessão para web, mobile e desktop.
- Criar configurações por ambiente para endpoints públicos; credenciais privadas permanecem no servidor ou no cofre de CI.
- Adicionar builds de desenvolvimento para Android e Windows; preparar o projeto iOS em macOS com Xcode.

### 3. Aplicativo móvel MVP

- Criar navegação móvel com abas inferiores para Chat, Equipes, Atividade, Calendário e Chamadas.
- Implementar login, perfil e status; mensagens, threads, reações, pesquisa e anexos com os mesmos limites e permissões do servidor.
- Integrar notificações push de APNs/FCM, deep links para conversa/evento e preferências de notificações.
- Integrar chamadas LiveKit nativas com lobby, controles, troca de câmera, compartilhamento quando suportado e estado de rede.
- Adaptar seleção e upload de arquivos às APIs nativas; respeitar safe areas, teclado, acessibilidade e redução de movimento.

### 4. Aplicativo desktop

- Empacotar `apps/web` com Tauri 2 e restringir a janela às origens e capacidades necessárias.
- Implementar bandeja, notificações do sistema, links `rocket://`, atualização assinada e abertura automática opcional.
- Validar login/cookies, câmera, microfone e compartilhamento de tela no WebView de Windows e macOS.
- Manter atualizações do web app e do shell desktop compatíveis com versões suportadas da API.

### 5. Qualidade, segurança e distribuição

- Cobrir testes de sessão, deep links, push, upload, reconexão e chamadas; executar testes de integração com PostgreSQL, Redis, LiveKit e MinIO.
- Configurar GitHub Actions para lint, testes, builds Android/Windows e builds de iOS/macOS em runner macOS.
- Fazer testes internos com dois usuários, aparelho físico, Wi-Fi e rede móvel, câmera/microfone negados e reconexão após suspensão.
- Definir política de privacidade, termos, ícones/splash da marca, canal de suporte e procedimentos de revogação/atualização.
- Publicar primeiro em distribuição interna (TestFlight, Google Play Internal Testing e instaladores assinados); só depois preparar as lojas públicas.

## Requisitos externos para gerar e publicar os binários

- URL HTTPS pública da API e URL WSS pública do LiveKit para produção, com credenciais provisionadas no servidor.
- Mac com Xcode e certificados da Apple para compilar/assinar iOS/macOS; contas Apple Developer e Google Play Console para distribuição.
- Android Studio/SDK e JDK instalados para compilar e testar Android; certificados de assinatura do Android guardados em secret manager.
- Acesso a pelo menos um iPhone e um Android para validar câmera, áudio, push e suspensão em segundo plano.
- Identificador definitivo de pacote, ícones e splash oficiais, política de privacidade e endereço de suporte.

O workspace atual roda em Windows e não tem Docker disponível, então não consegue produzir ou validar aqui um IPA iOS nem executar a stack local completa. O repositório pode receber a estrutura e os arquivos-fonte, mas builds assinados de iOS/macOS exigem runner ou máquina macOS com Xcode. A documentação oficial do Capacitor também requer o toolchain da plataforma; ele pode ser considerado se a prova técnica do SDK de chamadas dentro do WebView passar.

## Prompt de implementação para a próxima etapa

```text
Continue o Rocket Platform a partir de docs/ROADMAP.md e docs/PLANO_APLICATIVO_NATIVO.md.

Primeiro conclua e publique os blocos 9 a 12 do roadmap web. Depois implemente o plano nativo em incrementos pequenos, com commits Conventional Commits em português. Use React Native/Expo para Android e iOS, Tauri 2 para Windows e macOS, e extraia um pacote isomórfico packages/api-client sem APIs de DOM. Reutilize @rocket/shared e a API existente. Integre o LiveKit React Native SDK nos aparelhos e o SDK LiveKit web no desktop.

Comece pela prova técnica de login/refresh, Socket.IO e chamada com duas contas em Android e iOS antes de construir todas as telas. Projete armazenamento de sessão com Keychain/Android Keystore; mantenha a rotação de refresh e nunca coloque segredos privados no app. Se o cookie httpOnly atual não funcionar com segurança no runtime nativo, desenhe e teste um fluxo nativo de sessão no servidor antes de avançar.

Adicione permissões de câmera/microfone, push APNs/FCM, deep links, upload nativo, testes automatizados e pipelines por plataforma. Não afirme que iOS foi validado sem compilar em macOS/Xcode e testar em aparelho ou simulador iOS. Não publicar binários em lojas sem os certificados, identificadores e contas do cliente. Atualize README.md, docs/ROADMAP.md e docs/DECISOES.md em cada marco e rode build, lint, typecheck, testes e auditoria antes de cada commit.

Dados que o cliente precisa fornecer antes de preparar uma distribuição real: domínio HTTPS da API, endpoint WSS do LiveKit, identificadores definitivos Android/iOS, ícones/splash aprovados, política de privacidade, suporte e acesso às contas/certificados das lojas. Receba segredos somente por um cofre seguro, nunca por commit ou texto do prompt.
```
