# Roteiro de desenvolvimento

Escrito em 19/09/2026, depois do dia de playtest mais denso que este projeto
teve: seis pedidos soltos com o headset na cabeça, mais três rodadas de
correção em cima deles. O roteiro anterior — o de 17/09 — saiu inteiro, menos o
item de medição, que continua aqui porque continua sendo dele.

Não é lista de desejos. Cada item sai de uma coisa que o playtest mostrou, que o
código confessa quando se olha, ou que uma auditoria achou e um cético
confirmou. E cada um traz **como saber que funcionou** — porque num jogo de VR
feito por quem não tem o headset na mão, um item sem critério observável é um
item que vai ser dado como pronto sem ser.

---

## As três regras, que continuam valendo

**1. Em VR, a câmera é sagrada.** Screen shake, tilt, pulo de câmera, vinheta
que fecha — tudo o que um jogo de tela usa para dar impacto — aqui **enjoa**.
Nada neste roteiro mexe na câmera. O impacto vai para o objeto, para a mão e
para o som.

**2. Silêncio é ambiguidade.** Você não tem cursor, não tem log, e não tem como
distinguir *"o sistema não me ouviu"* de *"o sistema me ouviu e recusou"*. As
duas coisas precisam de respostas diferentes e audíveis.

**3. O que não é medido não melhora.** Vale para a performance (Fase 0) e valeu
para o fogo: a chama do Ponyta ficou meses de fora porque "medir a olho é
palpite" — e a resposta não foi chutar melhor, foi perguntar ao arquivo.

E uma quarta, que este dia acrescentou:

**4. Toda resposta ao toque é AMPLITUDE, não borda.** Ver `src/toque.ts`. Um
alvo novo não ganha um padrão de vibração próprio: ele chama `rocar` com a
rampa, e a mão aprende um padrão só.

---

## Fase 0 — O que continua sendo seu

### 0.1 O orçamento de quadro, medido uma vez

O contador está pronto desde 17/09 (engrenagem → **Contador de quadros**), e
nunca foi lido. Desde então entraram: as bolas de luz do painel e do cinto, a
oclusão por profundidade, a leitura da malha do quarto, o sistema de toque e
duas chamas novas. **Nada disso foi medido.**

Preciso de quatro números seus, anotados em `PLAYTEST.md`: quadro parado, com
três selvagens em campo, com o painel do pulso aberto, e com a mochila aberta.

- **Esforço:** cinco minutos com o headset.
- **Como saber que funcionou:** existe uma tabela, e ela tem números seus.
  Enquanto ela não existir, toda decisão de performance daqui para a frente
  continua sendo chute — inclusive a minha de que tudo isso cabe.

---

## Fase 1 — Ergonomia: o que impede de jogar

Esta fase é nova e é a que mais rende. Ela não adiciona nada ao jogo: ela tira
coisas do caminho.

### 1.1 Mão nua não joga — e isso é um bug, não uma escolha

Com hand tracking, o `XRGripSpace` do three fica **invisível e com a matriz na
identidade** (é o ramo `else` do `WebXRController.update`: com `inputSource.hand`
só as juntas são posadas). Três coisas do jogo são filhas dele:

```
src/game.ts:4776   mao.punho.add(cinto.grupo)     → o cinto de pokébolas
src/game.ts:1502   mao.punho.add(isca.grupo)      → a fruta e o doce na mão
src/tablet.ts      punho.add(this.grupo)          → a Pokédex
```

Ou seja: **quem tirar os controles perde o cinto, os itens e a Pokédex**, sem
nenhuma mensagem. O jogo continua rodando e simplesmente não tem mais como
pegar uma bola.

A correção é um nó por mão que seja o punho de verdade nos dois modos — com
controle, o grip space; de mão nua, a junta `wrist` — e pendurar as três coisas
nele. `Mao.posicaoMundo()` já faz exatamente essa escolha para medir; o que
falta é um OBJETO que siga a mesma regra.

- **Esforço:** médio-baixo. Um `THREE.Group` por mão, atualizado no laço que já
  existe, e três trocas de pai.
- **Como saber que funcionou:** largue os controles no meio de uma sessão. O
  cinto continua no braço, a Pokédex continua nas costas, e dá para pegar uma
  bola fechando o punho.

### 1.2 O gesto do relógio dispara quando não deveria

`olhandoORelogio` abre o painel do pulso quando o dorso do punho esquerdo encara
o rosto. Segurar um Pokémon contra o peito com as duas mãos é, geometricamente,
essa mesma pose — então o painel abre sozinho no meio do abraço. Já há uma
guarda para o cartão de comandos; falta a do painel.

E o caso geral: com QUALQUER coisa na mão esquerda (bola, item, Pokédex), girar
o pulso para olhar o que você está segurando abre um painel por cima.

- **Esforço:** baixo. É uma condição a mais em `atualizarPaineis`.
- **Como saber que funcionou:** você levanta o companheiro com as duas mãos,
  olha para ele, e nada abre.

### 1.3 A cascata do GRIP tem duas inversões de prioridade

A ordem em `pegarBola` foi crescendo por acréscimo, e duas coisas ficaram acima
da guarda do colo:

- **a mochila** — aberta na frente do peito, que é exatamente onde o bicho está
  sendo abraçado: fechar a mão que abraça tira uma poção de lá;
- **a Pokédex** — a bolha das costas tem 22 cm, e num abraço a mão passa perto.

A guarda do colo precisa subir para a primeira linha da cascata. É uma mudança
de prioridade em gestos que já funcionam, então ela merece ser feita sozinha,
com atenção, e não junto de outra coisa.

- **Esforço:** baixo, mas é cirurgia em código que funciona.
- **Como saber que funcionou:** com o bicho no colo e a mochila aberta, fechar a
  mão não troca o bicho por uma poção.

### 1.4 Canhoto

O jogo assume destro em lugares fixos: o painel do time abre no pulso ESQUERDO,
a Pokédex fica no direito, o analógico direito troca a bola. Nada disso tem
interruptor.

- **Esforço:** médio. O correto é um `ladoDominante` nos ajustes e trocar os
  lados fixos por consultas a ele.
- **Como saber que funcionou:** alguém canhoto joga uma sessão sem reclamar da
  mão errada.

### 1.5 Braço no ar cansa (e o jogo não sabe disso)

Tudo acontece com o braço estendido. O **Modo sentado** encolhe distâncias do
mundo, mas os painéis, o cinto e a mochila continuam exigindo o braço levantado
na mesma altura.

Duas medidas baratas: a mochila e o painel nascerem um pouco mais BAIXOS quando
o modo sentado está ligado, e o cinto poder ficar na altura do antebraço
apoiado no colo.

- **Esforço:** baixo. São offsets que já saem da cabeça.
- **Como saber que funcionou:** dá para jogar meia hora com o cotovelo apoiado.

---

## Fase 2 — O companheiro vira companhia

O jogo tem 151 bichos e um laço de captura. O que ele ainda não tem é o motivo
para você continuar com o MESMO bicho depois de capturá-lo.

### 2.1 A pose de estar sendo segurado

Dívida registrada no commit do colo: não existe pose de "no colo" no animador.
Com uma mão a palma tapa metade do corpo e ninguém repara; pendurado à frente do
rosto pelas duas mãos, um bicho na pose de ócio, com as pernas paradas, **vai**
aparecer.

O lugar certo é uma camada `colo` entre a base e o gesto — não um `Gesto` novo,
porque disparar um gesto por quadro o prenderia em peso zero.

- **Esforço:** médio. Mexe em `src/anima.ts`, que é o arquivo mais delicado.
- **Como saber que funcionou:** levantado com as duas mãos, ele parece estar
  sendo segurado — pernas recolhidas, corpo relaxado — e não de pé no ar.

### 2.2 Ele repara no seu quarto

O mapa do quarto hoje serve para nascer e para não atravessar o sofá. Um
companheiro que **usa** o quarto é outra coisa: dorme no sofá quando está com
pouca vida, sobe na mesa para ficar na sua altura, se enfia embaixo da cadeira
quando leva um susto.

`Sala.inventario()` já sabe dizer o que existe, e `classificarPelaAltura`
distingue assento de mesa de bancada.

- **Esforço:** médio-alto.
- **Como saber que funcionou:** você olha para o lado e ele está deitado no seu
  sofá, sem você ter mandado.

### 2.3 Fotografia

A Pokédex tira foto. Em realidade misturada isso é a coisa mais natural que
existe — o bicho está na sua sala — e é o único jeito de o jogo sair do headset
e virar uma coisa que você mostra para alguém.

Tecnicamente é onde mora a dúvida: capturar o passthrough exige permissão de
câmera (`camera-access`), que o Quest dá com aviso. Sem ela, dá para gravar só o
Pokémon com fundo transparente — que já serve para um adesivo.

- **Esforço:** médio, com um risco de plataforma a confirmar primeiro.
- **Como saber que funcionou:** existe um PNG no seu Quest com o seu Charmander
  em cima da sua mesa.

---

## Fase 3 — O que o playtest ainda não viu

### 3.1 As quatro patas de fogo do Ponyta

Medidas e deliberadamente fora (`tools/brasa.mjs` dá os números: y≈0,31 nos
dois lados). São mais quatro chamas de três sprites cada num bicho que já tem
duas — **depende da Fase 0**: com o orçamento medido, isso vira uma conta em vez
de uma opinião.

### 3.2 A oclusão ligada por padrão

"Sumir atrás das coisas" nasce desligada porque o modo de falhar dela é bruto.
Se você ligar e me disser que funciona, ela passa a ser o padrão — é a coisa que
mais aproxima o jogo de "o bicho está mesmo na sala".

### 3.3 O número da calibração da mão

Mesma coisa: o valor que você achar vira o padrão do código, e o interruptor
continua para quem tiver outra mão.

---

## Se fosse para escolher três

**1.1** (mão nua não joga), **1.2** (o painel que abre sozinho) e **0.1** (a
medição).

O primeiro porque é um bug de acessibilidade que exclui um modo inteiro de jogar
— e porque a pessoa que tira os controles não tem como saber que o problema não
é ela. O segundo porque atrapalha o gesto que acabou de ser feito. E o terceiro
porque tudo depois dele passa a ser decidido com número em vez de opinião.
