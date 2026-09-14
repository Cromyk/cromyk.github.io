# Critter Quest

Os **151 Pokémon da primeira geração**, em modelo 3D de verdade, soltos no seu
quarto — no seu chão, em cima da sua mesa — pelo passthrough do Meta Quest 3.
Você **solta o seu numa batalha**, enfraquece o selvagem e então **arremessa a
pokébola com o braço**, com a força e a direção reais do movimento.

Roda em WebXR: é uma página web. Não precisa de Unity, de sideload nem de conta
de desenvolvedor para jogar.

> **Sobre direitos.** Pokémon é da Nintendo / Creatures / Game Freak. Isto é um
> fan game pessoal, sem fins lucrativos e fora de qualquer loja. Os modelos não
> estão neste repositório: são baixados na hora do build de
> [Pokemon-3D-api/assets](https://github.com/Pokemon-3D-api/assets), e os dados
> da Pokédex vêm da [PokeAPI](https://pokeapi.co/).

## Rodando no Quest

Precisa de duas coisas ligadas ao mesmo tempo: o servidor nesta máquina e o
encaminhamento da porta para o headset.

**Terminal 1** — sobe o servidor. Na primeira vez ele baixa os 54 MB de
modelos, o que leva alguns minutos; depois é instantâneo.

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
- **F** — atacar · **Q** — trocar de Pokémon

## Controles no headset

| Ação | Controle |
|---|---|
| Pegar a pokébola | segurar o **GRIP** |
| Arremessar | **soltar o GRIP** no meio do movimento do braço |
| Mandar seu Pokémon atacar | **GATILHO** |
| Time, bolas e itens | virar a **palma esquerda** para cima |
| Pokédex das 151 | virar a **palma direita** para cima |
| Escolher / recolher / usar item | apontar com a outra mão e puxar o **GATILHO** |
| Trocar de bola | **analógico direito** para os lados |
| Virar página da Pokédex | **analógico direito**, com a Pokédex aberta |
| Fazer carinho | **encostar a mão** no seu Pokémon |

O arco pontilhado aparece enquanto você move o braço e mostra onde a bola vai
cair. Ele some quando a mão está parada — mirar é movimento, não apontar.

## O laço do jogo

Na primeira vez, **quatro Pokémon flutuam à sua frente** — Bulbasaur,
Charmander, Squirtle e Pikachu. Aponte e puxe o gatilho para escolher o seu. Sem
alguém para lutar, capturar seria quase impossível; por isso a escolha vem antes
de tudo.

1. Um selvagem aparece no seu chão ou em cima de um móvel, com nível próprio.
2. **GRIP** pega a bola do seu parceiro (ela vem na cor do tipo dele);
   arremesse e ele entra em campo.
3. **GATILHO** manda atacar — ele escolhe sozinho o golpe mais eficaz contra
   aquele alvo. O selvagem revida.
4. Com ele quase sem vida, **GRIP** pega uma bola vazia: arremesse e capture.

Enfraquecer muda muito. Se a vida chegar a zero o selvagem fica exausto e some
em nove segundos — essa é a sua janela.

**Ganhar experiência, subir de nível e evoluir.** Quem estiver em campo ganha XP
por cada selvagem derrubado ou capturado, e capturar rende mais do que derrubar.
No nível certo a evolução acontece ali mesmo, no seu quarto: o corpo antigo some
e o novo nasce no mesmo lugar. As 65 linhas evolutivas da primeira geração estão
todas lá, tiradas da PokeAPI.

**Brilhantes.** Um em trezentos encontros vem na cor alternativa, para as 61
espécies que têm o modelo shiny. A Pokédex marca com um ponto dourado.

## A mochila

Quatro bolas. O multiplicador não soma na chance: ele **divide a chance de
fuga**, que é o que se sente justamente nos alvos difíceis.

| Bola | Efeito | Contra Mewtwo inteiro |
|---|---|---|
| Comum | — | 0,1% |
| Reforçada | 1,9× | 15% |
| Prisma | 3,2× | 37% |
| Lacuna | 8× | 70% |

A comum recarrega sozinha; as outras vêm de capturas bem-sucedidas, e as boas
aparecem aos pouquinhos.

E três itens, na fileira de baixo do painel:

- **Poção** — devolve metade da vida de quem está em campo.
- **Fruta** — acalma o selvagem mais próximo (desfaz o alarme que você acumulou
  chegando perto) e faz a próxima bola valer quase o dobro.
- **Doce Raro** — um nível inteiro de uma vez. Quase nunca aparece.

## Os modelos

![Os 151 da primeira geração](folha-pokemon.png)

Essa folha de contato é gerada por `npm run render`, sem navegador e sem WebGL:
decodifica os GLB, projeta e rasteriza com z-buffer. As cores não são as de
verdade — são um tom por material, só para separar as peças — porque o que essa
imagem serve para conferir é **silhueta e orientação**, e foi assim que os três
modelos tortos apareceram.

Os arquivos vêm de rips dos jogos e chegam cada um de um jeito: **de 0,01 a
629 unidades de altura**, alguns com o corpo deslocado da origem, três deles
deitados ou de costas. Nada disso é corrigido à mão no jogo. O
`tools/modelos.mjs` decodifica cada malha aqui no Node, mede a caixa envolvente
e grava um manifesto com o giro, o deslocamento e a escala de cada um — medir no
build é de graça, medir no headset custaria quadro.

A orientação é adivinhada pelos **olhos**: o centroide dos materiais de olho cai
em Z positivo em quem segue a convenção. Isso resolveu 71 modelos sozinho e
apontou os suspeitos; os três que sobraram (Charmander, Charmeleon e Pikachu)
foram achados com `node tools/folha.mjs --candidatos 25`, que desenha o bicho
sob oito giros diferentes para você escolher o certo no olho.

Altura dentro da sala: a Pokédex vai de 0,2 m (Diglett) a 8,8 m (Onix), o que
não cabe num quarto. A curva `0,4 · altura^0,45` comprime tudo para entre 24 cm
e 1,1 m, preservando a ordem — Charizard continua bem maior que Charmander.

## O código

```
src/
  main.ts        bootstrap, sessão WebXR, loop, modo sem headset
  game.ts        o jogo: batalha, captura, XP, evolução, itens, spawn
  modelos.ts     carrega, normaliza e instancia os GLB (Draco + WebP)
  modelos.gen.ts GERADO: as medidas dos 151 modelos
  pokedex.gen.ts GERADO: tipos, stats, alturas e evoluções, da PokeAPI
  species.ts     a camada de jogo por cima dos dados: golpes, dano, níveis
  creature.ts    um Pokémon vivo — selvagem que foge ou parceiro que luta
  state.ts       a coleção salva: exemplares com nível, e o registro da Pokédex
  menu.ts        painel do time, bolas e itens, que abre virando a palma
  dexpanel.ts    a Pokédex das 151, paginada
  attacks.ts     efeitos dos golpes (partículas e raio)
  orb.ts         a pokébola: arremesso, quique, captura e invocação
  balls.ts       os quatro tipos de bola
  itens.ts       poção, fruta e doce raro
  room.ts        leitura dos planos reais do Quest (chão, mesa, sofá)
  hands.ts       controles, velocidade do arremesso, arco de mira
  hud.ts         texto, barras de vida e painéis em canvas 2D
  starter.ts     a vitrine dos quatro iniciais
  audio.ts       todos os sons, sintetizados
  rng.ts         aleatoriedade determinística
tools/
  pokedex.mjs    baixa a PokeAPI e gera src/pokedex.gen.ts
  modelos.mjs    baixa os GLB, mede e orienta cada um
  orientacao.mjs o giro de endireitamento, compartilhado pelas ferramentas
  folha.mjs      folha de contato dos 151, sem WebGL (npm run render)
  encaixe.mjs    confere que todo mundo encaixa no chão (npm run encaixe)
  smoke.ts       simula o jogo sem navegador (npm test)
  draco.mjs      copia o decodificador Draco do three para public/
  quest.mjs      adb reverse para o headset
```

### Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run quest      # encaminha a porta para o headset
npm test           # simula o jogo em Node: dados, batalha, captura, IA
npm run render     # folha de contato dos 151, para conferir silhueta
npm run encaixe    # confere o encaixe de todos no chão
npm run build      # typecheck + bundle em dist/
npm run pokedex    # regenera os dados a partir da PokeAPI
npm run modelos    # baixa e remede os modelos
```

### O que os testes pegam

`npm test` roda o jogo sem navegador nenhum. Ele confere que a Pokédex fecha
consigo mesma (toda evolução aponta para alguém que existe, todo mundo tem
modelo medido), que ninguém fica maior que o quarto, que a tabela dos 18 tipos
dá 4× em Gyarados com elétrico e **zero** em Charizard com terra, que o golpe
escolhido é sempre o melhor disponível, que o ritmo da batalha fica na faixa
jogável, que enfraquecer sempre ajuda na captura e que esforço sempre resolve —
e falha se algo virar NaN, atravessar o chão ou nunca resolver.

Ele já pegou cinco problemas reais: geometria com NaN, distância medida em 3D
quando devia ser no plano, batalhas de 17 golpes, um Onix que ocupava 2,55 m do
chão e uma captura que ficava garantida cedo demais.

`npm run encaixe` é o complemento: decodifica os 151 GLB de verdade, refaz por
fora exatamente a sequência de transformações de `src/modelos.ts` e mede onde o
bicho foi parar. Hoje o pior caso tem o **pé a 0,06 mm do chão** e **0,03 mm de
desvio do centro**. É o teste que pegaria um Pokémon nascendo enterrado no
carpete — coisa que nenhum teste de lógica vê.

### Depurando ao vivo

Com o jogo aberto, o console tem `cq`:

```js
cq.info      // quadros, draw calls, triângulos, texturas, capturas
cq.jogo      // a instância do jogo
```

## Notas de performance

O Quest 3 desenha a cena **duas vezes por quadro**, a 90 Hz. Por isso o projeto
evita de propósito: refração (`transmission`), pós-processamento, sombras
grandes e redesenho de canvas a cada quadro.

Com 151 espécies, a memória virou uma preocupação nova. Duas defesas:

- **Carregamento sob demanda.** Nenhum modelo é baixado antes de ser preciso; o
  selvagem só aparece quando o GLB dele chegou. O service worker guarda o que já
  passou, então a segunda vez que você encontra um Rattata é offline.
- **Despejo por uso.** `src/modelos.ts` segura no máximo 14 modelos em memória e
  descarta o menos usado — cada espécie traz textura própria, e numa sessão longa
  dá para encontrar dezenas delas.

Se começar a engasgar, o primeiro botão a girar é o `setFramebufferScaleFactor`
em `main.ts` — baixe para `0.8`.

## Instalar como app no headset

Dá para empacotar num APK e ter o jogo na biblioteca do Quest, com ícone próprio,
abrindo direto em passthrough. O passo a passo completo está em
**[GUIA-QUEST.md](GUIA-QUEST.md)**.

O resumo: o Quest empacota PWAs via [Bubblewrap](https://developers.meta.com/horizon/documentation/web/pwa-packaging/),
e o APK é uma casca que aponta para o jogo hospedado. Por isso **é preciso
publicar o jogo num domínio HTTPS antes de empacotar** — uma PWA imersiva só
abre com os Digital Asset Links verificados, e não há como embutir os arquivos
dentro do APK.

Como o APK é só a casca, **mudar o jogo não exige reinstalar nada**: um
`npm run build` e um push bastam.

```bash
npm run icons          # gera os ícones PNG (em código, sem asset binário)
npm run pwa:check      # confere manifest, ícones, service worker e assetlinks
npm run pwa:check URL  # o mesmo, mas contra o site já publicado
npm run assetlinks -- <SHA256>   # gera o .well-known/assetlinks.json
```
