# Critter Quest

Um jogo de **Pokémon em realidade mista** no Meta Quest 3. Os Pokémon aparecem
no seu quarto de verdade — no seu chão, em cima da sua mesa. Você **solta o seu
numa batalha**, enfraquece o selvagem e então **arremessa a pokébola com o
braço**, com a força e a direção reais do movimento.

Roda em WebXR: é uma página web. Não precisa de Unity, de sideload nem de conta
de desenvolvedor para jogar.

> **Fan game.** Charmander, Squirtle, Bulbasaur e Pikachu são da Nintendo /
> Game Freak / The Pokémon Company. Isto é um projeto pessoal, para jogar em
> casa — não é para publicar em loja nem distribuir. Os corpos são geometria
> original escrita aqui, mas os personagens não são meus nem seus.

## Rodando no Quest

Precisa de duas coisas ligadas ao mesmo tempo: o servidor nesta máquina e o
encaminhamento da porta para o headset.

**Terminal 1** — sobe o servidor:

```bash
npm install
npm run dev
```

**Terminal 2** — liga o headset (cabo USB, com a depuração já autorizada):

```bash
npm run quest
```

Aí, no Quest: abra o navegador, vá em **http://localhost:5173** e toque em
*entrar em realidade mista*.

O `adb reverse` é o que faz `localhost` no headset apontar para esta máquina.
Isso importa porque o WebXR só funciona em contexto seguro, e `localhost` já
conta como seguro — sem certificado, sem aviso.

### Sem cabo

Se o Quest estiver no mesmo Wi-Fi, dá para ir pelo IP — mas aí precisa de HTTPS:

```bash
npm run dev:https
```

e abra `https://<ip-desta-máquina>:5173` no headset. O certificado é
autoassinado, então o navegador vai pedir confirmação na primeira vez.

### Sem headset nenhum

O botão *jogar na tela* abre uma versão de mouse e teclado, para mexer no jogo
sem pôr o headset a cada mudança:

- **mouse** — olhar (clique uma vez para travar o cursor)
- **WASD** — andar
- **segurar e soltar o botão esquerdo** — carregar e arremessar

## Controles no headset

| Ação | Controle |
|---|---|
| Pegar a pokébola | segurar o **GRIP** |
| Arremessar | **soltar o GRIP** no meio do movimento do braço |
| Mandar seu Pokémon atacar | **GATILHO** |
| Abrir o painel do time | virar a **palma esquerda** para cima |
| Escolher / recolher um Pokémon | apontar com a direita e puxar o **GATILHO** |
| Ver as superfícies que o Quest reconheceu | **GRIP** direito segurando (debug) |

O arco pontilhado aparece enquanto você move o braço e mostra onde a bola vai
cair. Ele some quando a mão está parada — mirar é movimento, não apontar.

## O laço do jogo

1. Um Pokémon selvagem aparece no seu chão ou em cima de um móvel.
2. Vire a palma esquerda para cima, escolha quem vai lutar e feche a mão.
3. **GRIP** pega a pokébola dele (ela vem na cor do tipo), arremesse: ele entra em campo.
4. **GATILHO** manda atacar. O selvagem revida sozinho.
5. Quando o selvagem estiver quase sem HP, **GRIP** de novo pega uma bola vazia — arremesse e capture.

Enfraquecer muda tudo: com HP cheio a captura fica em torno de **24%**, quase
desmaiado passa de **80%**. Mas se o HP chegar a zero ele fica exausto e some em
nove segundos — você tem essa janela para acertar a bola.

## Os quatro iniciais

![Os quatro Pokémon](pokemon.png)

Gerados em código: não há um único modelo 3D nem textura no repositório. Corpo,
olhos que piscam, chama que diminui junto com o HP do Charmander, bochechas do
Pikachu que acendem no ataque — tudo é geometria montada em tempo de execução, e
o áudio inteiro é sintetizado na WebAudio.

| Pokémon | Tipo | Golpe | HP |
|---|---|---|---|
| Charmander | Fogo | Brasa | 39 |
| Squirtle | Água | Jato d'Água | 44 |
| Bulbasaur | Planta | Folha Navalha | 45 |
| Pikachu | Elétrico | Choque do Trovão | 35 |

A tabela de tipos é a clássica — fogo queima planta, água apaga fogo, planta
bebe água, elétrico frita água. Com vantagem de tipo a batalha dura ~4 golpes;
sem ela, ~9. Escolher quem mandar para o campo importa.

Sua coleção fica salva no headset, com o HP de cada um. Quem está fora de campo
se recupera sozinho com o tempo.

## O código

```
src/
  main.ts       bootstrap, sessão WebXR, loop, modo sem headset
  game.ts       o jogo: batalha, captura, spawn, controles
  pokemon.ts    os quatro corpos, montados em geometria
  species.ts    tipos, golpes, dano, tabela de efetividade
  creature.ts   um Pokémon vivo — selvagem que foge ou parceiro que luta
  attacks.ts    efeitos dos golpes (partículas e o raio do Pikachu)
  orb.ts        a pokébola: arremesso, quique, captura e invocação
  menu.ts       o painel do time, que abre virando a palma
  room.ts       leitura dos planos reais do Quest (chão, mesa, sofá)
  hands.ts      controles, velocidade do arremesso, arco de mira
  hud.ts        texto, barras de vida e painéis em canvas 2D
  state.ts      a coleção salva, com o HP de cada um
  audio.ts      todos os sons, sintetizados
  rng.ts        aleatoriedade determinística
tools/
  smoke.ts      simula o jogo sem navegador (npm test)
  render.ts     rasteriza os Pokémon num PNG, sem WebGL (npm run render)
  quest.mjs     adb reverse para o headset
```

### Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run quest      # encaminha a porta para o headset
npm test           # simula o jogo em Node: batalha, captura, IA
npm run render     # redesenha pokemon.png para conferir a silhueta
npm run build      # typecheck + bundle em dist/
```

O `npm test` roda o jogo sem navegador nenhum — combates até o nocaute em todos
os confrontos possíveis, 200 ciclos de captura, 60 segundos de companheiro
seguindo o treinador — e falha se algo virar NaN, atravessar o chão, nunca
resolver, ou se o ritmo da batalha sair da faixa jogável. Ele já pegou três
problemas reais: geometria com NaN, distância medida em 3D quando devia ser no
plano, e batalhas de 17 golpes.

O `npm run render` desenha os quatro num PNG usando um rasterizador próprio em
Node, com z-buffer e luz difusa — dá para conferir a silhueta depois de mexer na
geometria sem abrir navegador nem pôr o headset.

### Depurando ao vivo

Com o jogo aberto, o console tem `cq`:

```js
cq.info      // quadros, draw calls, triângulos, capturas
cq.jogo      // a instância do jogo
```

## Notas de performance

O Quest 3 desenha a cena **duas vezes por quadro**, a 90 Hz. Por isso o projeto
evita de propósito: refração (`transmission`), pós-processamento, sombras
grandes e redesenho de canvas a cada quadro. Se começar a engasgar, o primeiro
botão a girar é o `setFramebufferScaleFactor` em `main.ts` — baixe para `0.8`.

## Instalar como app no headset

Dá para empacotar num APK e ter o jogo na biblioteca do Quest, com ícone próprio,
abrindo direto em passthrough. O passo a passo completo está em
**[GUIA-QUEST.md](GUIA-QUEST.md)**.

O resumo: o Quest empacota PWAs via [Bubblewrap](https://developers.meta.com/horizon/documentation/web/pwa-packaging/),
e o APK é uma casca que aponta para o jogo hospedado. Por isso **é preciso
publicar o jogo num domínio HTTPS antes de empacotar** — uma PWA imersiva só
abre com os Digital Asset Links verificados, e não há como embutir os arquivos
dentro do APK.

O projeto já traz o que o empacotamento exige:

```bash
npm run icons          # gera os ícones PNG (também em código, sem asset binário)
npm run pwa:check      # confere manifest, ícones, service worker e assetlinks
npm run pwa:check URL  # o mesmo, mas contra o site já publicado
npm run assetlinks -- <SHA256>   # gera o .well-known/assetlinks.json
```
