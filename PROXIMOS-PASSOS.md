# Roteiro de desenvolvimento

Escrito em 17/09/2026, depois do playtest do dia (ver `PLAYTEST.md`) e da
rodada de correções que saiu dele. Substitui a lista anterior, de 16–17/09:
o que ela pedia continua valendo e está aqui dentro, reorganizado por **ordem
de dependência** em vez de ordem de impacto — porque descobriu-se que metade
dos itens não pode ser avaliada antes do primeiro.

Não é lista de desejos. Cada item sai de uma coisa que o playtest mostrou ou
que o código confessa quando se olha, e cada um traz **como saber que
funcionou** — porque num jogo de VR feito por quem não tem o headset na mão, um
item sem critério observável é um item que vai ser dado como pronto sem ser.

---

## Três regras que valem para o roteiro inteiro

**1. Em VR, a câmera é sagrada.** Screen shake, tilt, pulo de câmera, vinheta
que fecha — tudo o que um jogo de tela usa para dar impacto — aqui **enjoa**.
Nada neste roteiro mexe na câmera. O impacto vai para o objeto, para a mão
(vibração) e para o som. Quem escrever "só um trancinho de câmera" está
propondo uma regressão.

**2. Silêncio é ambiguidade.** Num jogo de teclado, uma ação que não acontece
deixa a tela igual e você tenta de novo. Em VR você não tem cursor, não tem
log, e não tem como distinguir *"o sistema não me ouviu"* de *"o sistema me
ouviu e recusou"*. As duas coisas precisam de respostas diferentes e audíveis.

**3. O que não é medido não melhora.** Ver a seção 0.

---

## O roteiro saiu inteiro, menos o 0.2

Em 17 e 18/09 saíram **todos os itens deste roteiro**, com uma exceção que não
é minha de fazer. Eles ficam listados aqui em vez de sumirem porque o **como
saber que funcionou** de cada um continua sendo uma pergunta para você, no
headset: nenhum foi visto rodando por mim.

| Item | O que entrou | Falta você conferir |
|---|---|---|
| **0.1** | `src/medidor.ts` — ms, fps, pior caso e draw calls num canto da visão | se o número aparece, e se muda quando um Charizard entra |
| **1.1** | `recusar()` — o gatilho na recarga e os gestos sem alvo agora respondem | se dá para sentir a recusa sem tirar os olhos do bicho |
| **1.2** | `TATO` — as 33 vibrações soltas viraram 5 padrões nomeados | se, de olhos fechados, "peguei" e "fui recusado" são diferentes |
| **1.3** | `pedindoAjuda` — as duas palmas para cima trazem o cartão de comandos | se dispara quando você quer, e só quando você quer |
| **1.4** | `Dex.primeiraVez` — cada coisa se explica uma vez, e fica no save | se a dica da poção chega na hora em que ela importa |
| **2.1** | Hit-stop, empurrão e vibração de acerto | se dá para dizer, de costas para a barra, que o golpe pegou |
| **2.2** | `NumeroDeDano` — o dano sobe do corpo, na cor da efetividade | se o número sai legível num Diglett e num Onix |
| **2.3** | Squash no quique, chacoalho com ritmo desigual, estalo do fecho | se errar a captura ficou frustrante do jeito bom |
| **2.4** | `audio.de(…)` — golpe, impacto e grito saem do lugar certo da sala | se você vira a cabeça na direção certa antes de ver o bicho |
| **3.1** | `ondeNasce` — quem voa no alto, quem cava no chão, os pequenos nos móveis | se o cômodo parece povoado em vez de sorteado |
| **3.2** | `src/achados.ts` — itens aparecem em cima dos seus móveis de verdade | se você anda pela casa sem eu ter pedido |
| **3.3** | `Sala.esconderijo` — o assustado corre para trás de um móvel | se procurar um Pokémon virou uma coisa que acontece |
| **4.1** | `Pokemon.escalaPessoal` e o interruptor "Modo sentado" | se dá para jogar uma sessão inteira do sofá |
| **4.2** | O jogo repara na altura dos olhos e sugere o modo sentado, uma vez | se a sugestão chega na hora certa e não atrapalha |
| — | `tsconfig.tools.json` — o smoke passa a ser checado por tipos | nada; é encanamento, e já cobrou dois erros reais |

### O 0.2 é seu, e continua sendo o mais importante

Com o contador de pé, falta a medida: quadro parado, com três selvagens, com a
mochila aberta, com o fogo aceso. **Eu não posso fazer essa parte** — ela exige
o headset na cabeça.

E ela ficou mais urgente do que era quando este roteiro foi escrito: entraram
depois dele o número de dano, os sprites de fogo, o laser, a mochila, os itens
na sala e o som posicional. Cada um custa alguma coisa, e a soma nunca foi
medida. Enquanto essa tabela não existir, qualquer decisão de performance aqui
— inclusive a de que tudo isso cabe — continua sendo chute.

### O que ficou de fora, e por quê

**O flash branco no alvo**, do 2.1. Os materiais vêm do molde em cache e são
compartilhados por todos os exemplares da espécie: piscar um piscaria todo
Rattata da sala, e clonar material por golpe vaza memória no headset. Com o
número de dano de pé, a falta dele diminuiu — o corpo do bicho já tem o que
dizer no instante do acerto.

**As outras ferramentas de `tools/`** continuam fora da checagem de tipos. Só o
smoke entrou, que é o que segura o projeto; o resto são scripts de linha de
comando que falham na hora e em voz alta.

**Nada disto foi visto rodando.** Quinze itens sem headset é muita coisa: se
algum estiver errado, os candidatos mais prováveis são o limiar do gesto das
duas palmas (1.3), o fator 0,62 do modo sentado (4.1) — escolhido no papel — e
a frequência com que os itens aparecem na sala (3.2), que só se calibra jogando.

---

## Fase 0 — Saber o que está acontecendo

**Por que primeiro:** hoje o jogo não mede nada. Em 17/09 entraram três coisas
que custam quadro — o fogo (sprites aditivos por bicho), o feixe de mira (um
cilindro por mão) e a mochila (onze objetos 3D com onze texturas de canvas) —
e **ninguém sabe quanto**. `grep -i fps src/` não devolve uma linha. O headset
desenha a cena duas vezes a 90 Hz; um item da Fase 2 que custe 4 ms passa
despercebido na tela do PC e derruba a sessão no Quest.

Enquanto isso não existir, toda decisão de performance neste roteiro é chute —
inclusive as minhas.

### 0.1 Um contador de quadros dentro do jogo

Não no console: **na sala**, num canto do painel de ajustes, ligável. Média,
pior caso do último segundo, e contagem de draw calls
(`renderer.info.render.calls`). É o que transforma "achei que ficou pesado" num
número que se compara entre duas versões.

- **Esforço:** baixo. O `renderer.info` já dá quase tudo.
- **Como saber que funcionou:** você consegue me dizer um número em vez de uma
  impressão, e esse número muda quando um Charizard entra em campo.

### 0.2 Um orçamento por sistema

Com o contador de pé, medir uma vez: quadro parado, quadro com 3 selvagens,
quadro com a mochila aberta, quadro com o fogo. Anotar em `PLAYTEST.md`. É a
linha de base contra a qual tudo que vier depois se compara.

- **Esforço:** baixo, mas depende de 0.1 e de você com o headset.
- **Como saber que funcionou:** existe uma tabela, e ela tem números seus.

---

## Fase 1 — O jogo responde

A Fase 1 é sobre o jogo **dizer** o que está acontecendo. É a queixa original
do playtest (*"mandar o Pokémon e ele ficar não funciona"* — a lógica estava
certa e com teste passando; o que faltava era o jogo dizer que a condição não
tinha sido satisfeita).

### 1.1 Nenhum gesto falha calado

O código tem 12 pontos que recusam com voz (`audio.recusa()`) e 33 que vibram,
contra **151 `return;`** em `src/game.ts`. Nem todos são gestos do jogador —
mas os que são, hoje, somem sem deixar rastro:

```
game.ts   if (!this.companheiro) return;
game.ts   if (!this.temCompanheiroEmCampo) return;
```

**Proposta:** uma regra de projeto — *todo caminho que interrompe um gesto do
jogador devolve alguma coisa*. Vibração é a mais barata e a mais informativa,
porque chega sem ocupar a visão. E uma auditoria mecânica: percorrer os
`return` dos despachantes de gesto e classificar cada um em "não é gesto",
"já responde" ou "cala".

- **Esforço:** baixo. É auditoria, e o padrão já existe em 12 lugares para
  copiar.
- **Como saber que funcionou:** você faz um gesto impossível de propósito — o
  gatilho sem Pokémon em campo, o grip na mochila fechada — e sente a recusa
  sem tirar os olhos do que estava olhando.

### 1.2 Um vocabulário de vibração, não 33 vibrações soltas

As 33 chamadas de `mao.vibrar` usam intensidades e durações escolhidas caso a
caso (`0.3, 35`, `0.7, 70`, `0.45, 60`). Isso é ruído: a mão aprende padrões,
não valores. Três ou quatro padrões nomeados — *pegou*, *recusado*, *acertou*,
*levou* — e todo mundo usa esses.

- **Esforço:** baixo. É uma tabela e um replace.
- **Como saber que funcionou:** de olhos fechados, você distingue "peguei" de
  "fui recusado".

### 1.3 O cartão de comandos volta quando chamado

São 21 comandos. O ensino disso é uma placa de quatro linhas que fica **7
segundos** na entrada da sessão e some para sempre. Um gesto só — as duas mãos
abertas, ou um botão — traz o cartão de volta.

- **Esforço:** trivial, e resolve a maior parte do problema de descoberta.
- **Como saber que funcionou:** você para de precisar perguntar qual botão faz
  o quê.

### 1.4 Ajuda contextual, uma vez por coisa

A primeira vez que você segura uma bola, uma linha discreta diz como
arremessar. Uma vez por coisa, guardada no save.

- **Esforço:** médio-baixo. Depende de 1.3 estar de pé.
- **Como saber que funcionou:** alguém que nunca jogou consegue capturar sem
  você explicar nada.

---

## Fase 2 — A pancada tem peso

Aqui é o *feeling*. Hoje o combate **funciona e não sente**: o golpe sai, o
dano é calculado, a barra desce. Não há hit-stop, não há recuo, não há flash no
alvo, não há número de dano — `grep` por qualquer um deles em `src/` não
devolve nada. É a diferença entre um sistema de combate correto e uma briga.

Depende da Fase 0: cada item aqui custa quadro, e sem medição não dá para saber
qual deles não cabe.

### 2.1 O golpe acerta alguém

Quatro coisas que, juntas, custam pouco e mudam tudo:

- **Hit-stop** — 60 a 90 ms de congelamento das duas criaturas no instante do
  acerto. É o truque mais barato de game feel que existe e o mais eficaz: o
  cérebro lê a pausa como massa.
- **Flash no alvo** — o material pisca branco por dois quadros. `emissive` já
  está em todo mundo.
- **Recuo** — o alvo anda 10–15 cm para trás e volta. Não é knockback de
  verdade, é o suficiente para o corpo registrar que foi empurrado.
- **Vibração de acerto** na mão que comandou (ver 1.2).

**Não** entra: screen shake. Ver a regra 1.

- **Esforço:** médio. O hit-stop precisa de um caminho de pausa em
  `src/creature.ts` que ainda não existe; o resto é pequeno.
- **Como saber que funcionou:** você consegue dizer, de costas para a barra de
  vida, se o golpe pegou ou não.

### 2.2 O dano é visível onde ele acontece

Um número que sobe e some, na cor da efetividade, **no corpo do bicho** — não
na barra. Em VR, informação presa a um painel é informação que você tem de ir
buscar; presa ao bicho, ela chega.

- **Esforço:** baixo. `Placa` e `Impacto` já existem, e o billboard é o mesmo
  do fogo.
- **Como saber que funcionou:** dá para jogar uma briga inteira sem olhar a
  barra de vida.

### 2.3 A bola tem peso

O arremesso hoje é uma parábola correta. Falta o que faz uma bola parecer uma
bola: squash no impacto, um quique, o chacoalho da captura com ritmo
(três balanços com intervalos desiguais, não três iguais), e o estalo quando
ela abre.

- **Esforço:** médio.
- **Como saber que funcionou:** errar a captura passa a ser frustrante do jeito
  bom — você quer tentar de novo na hora.

### 2.4 O som tem lugar no espaço

O áudio hoje sai sem posição. Num jogo onde o bicho está atrás do sofá à sua
esquerda, o grito dele devia vir de lá. `PositionalAudio` do three resolve, e é
o único item deste roteiro que melhora **e** ajuda a orientar o jogador.

- **Esforço:** médio. Mexe em `src/audio.ts` inteiro.
- **Como saber que funcionou:** você vira a cabeça na direção certa antes de
  ver o bicho.

---

## Fase 3 — O quarto vira cenário

O mapeamento da sala é a coisa mais cara que o jogo tem de engenharia e a que
menos rende hoje: serve para o bicho não atravessar o sofá e para você mandar
ele subir na mesa. É muito trabalho para um papel pequeno.

### 3.1 Selvagens nascem onde faz sentido

Os de terra no chão, os que voam no alto, os pequenos embaixo dos móveis. O
jogo já conhece o rótulo semântico de cada superfície (`floor`, `table`,
`couch`, `bed`) e a altura de cada uma.

- **Esforço:** médio. `pontoDeSpawn` já existe e recebe a sala inteira.
- **Como saber que funcionou:** o cômodo parece povoado em vez de sorteado — um
  Zubat no alto do armário e um Diglett no carpete, não os dois no mesmo ponto.

### 3.2 Itens na sala, em cima dos móveis de verdade

Hoje `ganharItem` só é chamado de um lugar: `premiarCaptura()`. Isso é uma
espiral descendente, e ela é pior para quem está perdendo — poção só vem de
capturar, capturar com o time machucado é mais difícil, difícil de capturar
significa menos poção.

Uma poção que aparece **em cima da sua mesa** e que você pega esticando o braço
usa o que o jogo tem de mais próprio, e dá um motivo para andar pelo cômodo —
que hoje o jogo pede e não recompensa.

- **Esforço:** médio, e é o que mais rende da fase.
- **Como saber que funcionou:** você anda pela casa sem eu ter pedido.

### 3.3 Esconderijo

Um bicho assustado corre para **trás de um móvel de verdade** em vez de fugir
em linha reta.

- **Esforço:** médio-alto (precisa de visibilidade, não só de colisão).
- **Como saber que funcionou:** procurar um Pokémon vira uma coisa que
  acontece.

---

## Fase 4 — Cabe em mais gente

Várias distâncias do jogo são absolutas: o painel a 9 cm da mão, o bicho que
para a 1,1 m de você, o destino limitado a 3 m. Quem joga sentado, num canto,
ou com pouco espaço vive outro jogo — e esse é o caso mais comum de quem tem um
Quest em casa.

A mochila de 17/09 já nasce certa neste ponto (a altura dela sai da cabeça, não
do chão). O resto do jogo, não.

### 4.1 Modo sentado

Um ajuste que escala as distâncias de aproximação e traz o alcance para perto,
em vez de depender de o jogador andar. Os ajustes já existem como sistema
(`src/ajustes.ts`), então é mais calibração do que código.

- **Esforço:** baixo-médio. Alto valor para quem não tem uma sala livre.
- **Como saber que funcionou:** dá para jogar uma sessão inteira do sofá.

### 4.2 Alcance que se adapta

O caso geral do 4.1: em vez de um interruptor, o jogo aprende a sua altura e o
seu alcance nos primeiros minutos e ajusta sozinho.

- **Esforço:** médio. Só depois que 4.1 provar que a escala é o eixo certo.

---

## O que fica por último, e por quê

**O `tools/` fora da checagem de tipos.** O `tsconfig.json` inclui só `src`,
então `tools/smoke.ts` — as 29 verificações que seguram este projeto — passa
pelo `esbuild` sem que ninguém confira os tipos dela. Já cobrou: quando `Corpo`
ganhou `renormalizar`, o corpo falso do smoke ficou sem o método e nada
reclamou. Incluir `tools` hoje acende **58 erros**, quase todos por falta de
`@types/node` nas ferramentas de linha de comando. É uma limpeza de uma sentada
e não depende de nada — só não é jogo, e por isso não passou na frente.

**O rig da luva.** Estado em `PLAYTEST.md` e no topo de `tools/rig.ts`. Os
cinco dedos já estão segmentados — o nó que travou três tentativas. Falta a
ordem anatômica ficar confiável, o alinhamento, os pesos e a bind pose. É o
item de menor impacto do roteiro: a mão genérica funciona, e **nada aqui
depende dele**.

**O fogo do Ponyta e do Magmar.** Os rips deles não têm esqueleto nenhum
(`node tools/diag-fogo.mjs ponyta` devolve lista vazia), então não há osso onde
pendurar. A saída é um ponto fixo no corpo, medido com a folha de contato
aberta — não de memória. Pequeno, mas só vale a pena junto de outra visita ao
`src/fogo.ts`.

**A cauda do Rapidash.** O rip nomeia as mechas `taila01`…`tailh03` e nenhuma
bate com os candidatos de cauda do rig. Ensinar o rig a ler esses nomes mexeria
na animação de cauda de todo mundo para ganhar uma chama — a troca não
compensa hoje.

---

## Se fosse para escolher três

**0.1** (o contador), **1.1** (nenhum gesto calado) e **2.1** (o golpe acerta
alguém).

O primeiro porque tudo depois dele passa a ser decidido com número em vez de
opinião — inclusive se o fogo e a mochila que acabaram de entrar cabem no
orçamento. O segundo porque é a queixa original do playtest e é barato. O
terceiro porque é o item deste roteiro que mais muda a sensação por unidade de
trabalho, e porque combate sem impacto é o que separa este jogo de um que se
volta a abrir no dia seguinte.
