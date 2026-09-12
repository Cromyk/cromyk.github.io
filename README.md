# Critter Quest

Um jogo de capturar criaturas em **realidade mista** no Meta Quest 3. As criaturas
aparecem no seu quarto de verdade — no seu chão, em cima da sua mesa — e você as
captura **arremessando uma esfera com o braço**, com a força e a direção reais do
seu movimento.

Roda em WebXR: é uma página web. Não precisa de Unity, de sideload nem de conta de
desenvolvedor para jogar.

> As criaturas, os nomes e os tipos elementais são originais. Nada aqui é da
> Nintendo — a mecânica de encontrar, capturar e colecionar é livre, os
> personagens deles não são.

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
| Materializar a esfera na mão | segurar o **gatilho** |
| Arremessar | **soltar o gatilho** no meio do movimento do braço |
| Ver as superfícies que o Quest reconheceu | **grip** da mão direita |
| Esferas restantes e coleção | olhar para o **pulso esquerdo** |

O arco pontilhado aparece enquanto você move o braço e mostra onde a esfera vai
cair com a velocidade atual. Ele some quando a mão está parada — mirar é
movimento, não apontar.

## Como funciona a captura

A esfera acerta, a criatura é sugada e a esfera sacode **três vezes**. Cada
sacudida é uma chance de escapar:

| Raridade | Chance final |
|---|---|
| Comum | ~59% |
| Incomum | ~29% |
| Raro | ~10% |

Dois fatores mexem nisso: **acertar no centro** do corpo dá bônus, e uma criatura
**assustada** escapa mais fácil. O que assusta é você chegar perto rápido demais e
esfera que passa raspando. Se o alarme estourar, ela foge e some.

## As criaturas

Oito espécies, todas geradas em código — não há um único arquivo de modelo 3D nem
de textura no projeto. O corpo, os olhos que piscam, a cauda que balança e as asas
que batem são geometria montada em tempo de execução, e o áudio inteiro é
sintetizado na WebAudio.

| Espécie | Elemento | Raridade |
|---|---|---|
| Flamito | Brasa | comum |
| Brotinho | Limo | comum |
| Pingolim | Gota | comum |
| Pedrusco | Pedra | comum |
| Zapik | Faísca | incomum |
| Ventusco | Sopro | incomum |
| Sombrino | Névoa | incomum |
| Lunaris | Névoa | **raro** |

A coleção fica salva no próprio headset (`localStorage`). Espécies que você ainda
não capturou aparecem com mais frequência.

## O código

```
src/
  main.ts       bootstrap, sessão WebXR, loop, modo sem headset
  game.ts       o jogo: spawn, colisão, desfechos, HUD
  creature.ts   uma criatura viva: pulinhos, atenção, susto, fuga
  species.ts    catálogo das 8 espécies + construção procedural do corpo
  orb.ts        a esfera: física de arremesso, quique e ciclo de captura
  room.ts       leitura dos planos reais do Quest (chão, mesa, sofá)
  hands.ts      controles, medição da velocidade do arremesso, arco de mira
  hud.ts        texto e painéis desenhados em canvas 2D
  state.ts      a coleção salva
  audio.ts      todos os sons, sintetizados
  rng.ts        aleatoriedade determinística
tools/
  smoke.ts      simula o jogo sem navegador (npm test)
  quest.mjs     adb reverse para o headset
```

### Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run quest      # encaminha a porta para o headset
npm test           # simula o jogo em Node: física, IA, captura
npm run build      # typecheck + bundle em dist/
```

O `npm test` roda o jogo sem navegador nenhum — 60 segundos de comportamento de
criatura, 200 ciclos de captura, 500 sorteios de spawn — e falha se algo virar
NaN, atravessar o chão ou nunca resolver. Foi ele que pegou dois bugs reais
durante o desenvolvimento.

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
