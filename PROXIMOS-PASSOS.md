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

### 1.1 ✅ Mão nua não joga — e isso é um bug, não uma escolha (feito em 19/09)

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

**Feito.** `src/pulso.ts` e `Mao.pulso`: um grupo por mão que segue o grip
space quando há controle e é DERIVADO das juntas quando não há. A derivação não
converte a orientação da junta `wrist` (que usa outra convenção) — ela mede,
com a mesma régua de `src/glove.ts`: a direção dos dedos e a largura da mão. O
produto vetorial dos dois resolve o sinal sozinho, porque ele sai pelo dorso na
direita e pela palma na esquerda, que é exatamente a assimetria do grip space.

- **Como saber que funcionou:** largue os controles no meio de uma sessão. O
  cinto continua no braço, a Pokédex continua nas costas, e dá para pegar uma
  bola fechando o punho.
- **O que o teste já garante** (seção 33 do smoke): dedos em −Z, +X no dorso da
  direita e na palma da esquerda, base destra, e mão degenerada não escreve por
  cima da pose boa.
- **O que sobra para o headset:** se a pose derivada cai alguns centímetros
  fora do punho de verdade, o cinto fica adiantado ou atrasado no antebraço. É
  o mesmo tipo de ajuste que a calibração da mão resolve para o desenho.

### 1.2 ✅ O gesto do relógio dispara quando não deveria (feito em 19/09)

`olhandoORelogio` abre o painel do pulso quando o dorso do punho esquerdo encara
o rosto. Segurar um Pokémon contra o peito com as duas mãos é, geometricamente,
essa mesma pose — então o painel abre sozinho no meio do abraço. Já há uma
guarda para o cartão de comandos; falta a do painel.

E o caso geral: com QUALQUER coisa na mão esquerda (bola, item, Pokédex), girar
o pulso para olhar o que você está segurando abre um painel por cima.

**Feito.** O painel só abre numa mão VAZIA — `atualizarPaineis` só entrega o
punho quando `maoCheia` diz que não há nada nela. A guarda ficou em quem CONSOME
o gesto, e não no gesto: a seção 34 do smoke monta a pose do abraço e mostra que
ela dispara `olhandoORelogio` de verdade, então apertar o limiar quebraria o
gesto legítimo sem resolver este caso. E a mão cheia não teria o que fazer com o
painel de qualquer forma — quem alcança as cartas é a mão oposta.

O mostrador pequeno some junto quando a esquerda está com um Pokémon: ele
flutua seis centímetros acima do punho, que é dentro do bicho.

**De quebra, o 1.1 ficou completo.** Quatro leitores ainda usavam o grip space
cru e portanto também morriam de mão nua: a posição da bola segurada, o painel
do time, o mostrador do pulso e o gesto de pedir ajuda (que estava morto de mão
nua desde que nasceu). Todos passaram a usar `Mao.pulso`.

- **Como saber que funcionou:** você levanta o companheiro com as duas mãos,
  olha para ele, e nada abre. E, de mão nua, o painel do time abre girando o
  pulso — antes ele aparecia na origem do quarto.

### 1.3 ✅ A cascata do GRIP tem duas inversões de prioridade (feito em 19/09)

A ordem em `pegarBola` foi crescendo por acréscimo, e duas coisas ficaram acima
da guarda do colo:

- **a mochila** — aberta na frente do peito, que é exatamente onde o bicho está
  sendo abraçado: fechar a mão que abraça tira uma poção de lá;
- **a Pokédex** — a bolha das costas tem 22 cm, e num abraço a mão passa perto.

A guarda do colo precisa subir para a primeira linha da cascata. É uma mudança
de prioridade em gestos que já funcionam, então ela merece ser feita sozinha,
com atenção, e não junto de outra coisa.

**Feito.** Duas coisas subiram para o topo da cascata: a guarda do colo (a mão
que segura um Pokémon não faz mais nada com o GRIP até soltá-lo) e um teste
novo e estreito, `completandoAbraco` — a SEGUNDA mão chegando num bicho que já
está em alguma mão. O segundo existe separado porque só ele precisa vir antes
da mochila; os outros dois casos do abraço continuam onde estavam.

A seção 35 do smoke afirma a PREMISSA, que é o que dá sentido à ordem: na pose
típica, o item mais próximo da grade fica a **20 cm** do centro do bicho
abraçado, com **27 cm** de alcance somado entre os dois gestos. Eles disputam
mesmo. Se a mochila um dia mudar de lugar e parar de disputar, o teste avisa — e
aí a ordem passa a ser preferência em vez de necessidade.

- **Como saber que funcionou:** com o bicho no colo e a mochila aberta, fechar a
  mão não troca o bicho por uma poção.

### 1.4 ✅ Canhoto (feito em 19/09)

O jogo assume destro em lugares fixos: o painel do time abre no pulso ESQUERDO,
a Pokédex fica no direito, o analógico direito troca a bola. Nada disso tem
interruptor.

**Feito.** Interruptor **Canhoto** na engrenagem, e dois getters no jogo —
`ladoQueAponta` e `ladoDoPainel` — no lugar de catorze lados cravados.

O que NÃO troca são os botões físicos, e não podia ser diferente: o controle
direito continua na mão direita de um canhoto. O que troca é o PAPEL. A mão que
aponta ganha o arremesso, o recolher (A), a mochila (B), o raio de mira, o
analógico que troca a bola e a escolha no painel; a outra ganha o painel do
pulso, o mostrador, o chamar e o PC.

O cinto não precisou saber de nada: ele já era simétrico desde 18/09 — um em
cada antebraço, e quem pega é sempre a mão oposta.

A seção 36 do smoke afirma a simetria do gesto que abre o painel, que é onde o
espelhamento podia quebrar em silêncio: o dorso do punho é −X na esquerda e +X
na direita, e a mesma pose espelhada tem de abrir o painel do outro pulso — e
não abrir o do lado errado.

- **Como saber que funcionou:** ligue Canhoto na engrenagem. O painel passa a
  abrir girando o pulso DIREITO, e o raio de mira sai da esquerda.

### 1.5 ✅ Braço no ar cansa (e o jogo não sabia disso) — feito em 19/09

Tudo acontece com o braço estendido. O **Modo sentado** encolhe distâncias do
mundo, mas os painéis, o cinto e a mochila continuam exigindo o braço levantado
na mesma altura.

Duas medidas baratas: a mochila e o painel nascerem um pouco mais BAIXOS quando
o modo sentado está ligado, e o cinto poder ficar na altura do antebraço
apoiado no colo.

**Feito, e com uma correção maior do que a prevista.**

A grade da mochila **desce até a mão que a abriu**. A altura saía só da cabeça,
e o motivo era bom na época — a cabeça era a única medida confiável. Deixou de
ser: as mãos são rastreadas, e desde hoje o punho é conhecido nos dois modos. E
a mão diz uma coisa que a cabeça não sabe: onde o seu braço está DESCANSANDO.
Ela nunca sobe (quem abre com o braço esticado receberia a grade na cara) e tem
um limite de queda (braço pendurado ao lado do corpo não está pedindo nada).
Sentado, ela nasce 10 cm mais baixa e 8 cm mais perto — cada centímetro à frente
é torque no ombro, mantido pelo tempo que a mochila ficar aberta.

**E a Pokédex saiu das costas no modo sentado.** Isto não estava no item e é o
pior caso de todos: levar a mão atrás do corpo é um gesto de quem está de pé.
Numa poltrona, numa cadeira de escritório ou numa cadeira de rodas, o encosto
está exatamente ali — o gesto deixa de ser desconfortável para ser impossível, e
a Pokédex era a única coisa do jogo guardada num lugar que o encosto tapa.
Sentado, ela vira um coldre no quadril, do lado da mão que aponta (e espelhado
para o canhoto). `maoNasCostas` mede contra o ponto guardado, então o gesto se
adaptou sozinho.

O cinto não precisou de nada: ele já mora no antebraço, então já acompanha o
braço apoiado no colo. O painel do pulso idem — ele nasce do punho.

- **Como saber que funcionou:** ligue o Modo sentado numa poltrona. Abra a
  mochila com a mão no colo: a grade nasce ali, e não na altura do peito. E a
  Pokédex passa a ser pega ao lado do quadril.

---

## Fase 2 — O companheiro vira companhia

O jogo tem 151 bichos e um laço de captura. O que ele ainda não tem é o motivo
para você continuar com o MESMO bicho depois de capturá-lo.

### 2.1 ✅ A pose de estar sendo segurado (feito em 19/09)

Dívida registrada no commit do colo: não existe pose de "no colo" no animador.
Com uma mão a palma tapa metade do corpo e ninguém repara; pendurado à frente do
rosto pelas duas mãos, um bicho na pose de ócio, com as pernas paradas, **vai**
aparecer.

O lugar certo é uma camada `colo` entre a base e o gesto — não um `Gesto` novo,
porque disparar um gesto por quadro o prenderia em peso zero.

**Feito.** `aplicarColo`, uma camada entre a base e o gesto, com `ctx.colo`
de 0 a 1 — exatamente onde a dívida dizia que era o lugar certo, e pelo motivo
que ela dizia: um `Gesto` tem começo, meio e fim, e rearmá-lo por quadro o
prenderia em peso zero para sempre.

A pose: as coxas sobem à frente (−33°), os joelhos dobram atrás delas (−41°), os
pés pendem, o tronco reclina para TRÁS (para a frente é a pose de quem está
caindo), os braços vêm à frente dobrados (−19°) e a cabeça levanta um pouco. A
cauda pende e a base continua balançando-a por cima — é o que a mantém viva.

Entra e sai por interpolação: um corte seco entre "de pé" e "no colo" lê como
troca de boneco.

`npm run poses` ganhou a coluna **"no colo"** — é ali que se vê, sem headset,
que o Bulbasaur recolhe as patas e o Charmander dobra os braços. A seção 38 do
smoke mede a diferença COM SINAL (recolher e esticar dariam o mesmo ângulo em
módulo) e guarda o teto: a pose inteira cabe em 45° por osso, porque o que
denuncia uma pose inventada é o exagero.

- **Como saber que funcionou:** levantado com as duas mãos, ele parece estar
  sendo segurado — pernas recolhidas, corpo relaxado — e não de pé no ar.

### 2.2 ✅ Ele repara no seu quarto (feito em 19/09)

O mapa do quarto hoje serve para nascer e para não atravessar o sofá. Um
companheiro que **usa** o quarto é outra coisa: dorme no sofá quando está com
pouca vida, sobe na mesa para ficar na sua altura, se enfia embaixo da cadeira
quando leva um susto.

`Sala.inventario()` já sabe dizer o que existe, e `classificarPelaAltura`
distingue assento de mesa de bancada.

**Feito.** `Sala.pousoPerto` devolve a MAIOR superfície do tipo pedido dentro
do alcance (a maior, e não uma sorteada: é onde ele cabe com folga, e escolher a
maior faz o comportamento parecer decisão em vez de acaso), e `usandoOQuarto`
no companheiro decide quando ir.

Duas razões para ele sair do seu lado, e elas não têm o mesmo peso:

- **acabado** — abaixo de um terço da vida ele procura um assento ou uma mesa e
  fica lá até se recuperar. É o único caso em que ele desobedece a distância de
  "fica ao meu lado": um bicho machucado que continua trotando ao seu lado não
  está machucado.
- **curioso** — com a vida cheia, de vez em quando (e só às vezes, de propósito)
  ele sobe na mesa ou na cadeira mais perto e fica de 8 a 16 segundos.

Toda ordem SUA ganha da iniciativa dele: chamar, mandar ir, pegar no colo e
atacar largam o móvel. Sem isso você o chamaria, ele viria, e voltaria para a
mesa no quadro seguinte.

A decisão não roda por quadro — varrer as superfícies do quarto 72 vezes por
segundo para decidir uma coisa que muda a cada meio minuto seria a conta mais
cara do arquivo pelo motivo mais bobo.

A seção 39 do smoke mede pela ALTURA e não pela proximidade (passar perto da
mesa não é estar em cima dela — foi o próprio teste que pegou isso), e cobre os
cinco casos: a sala escolhe o móvel certo, ele sobe sozinho, acabado ele vai
descansar, chamado ele não volta, e sem móvel nenhum o jogo é o de antes.

- **Como saber que funcionou:** você olha para o lado e ele está em cima da sua
  mesa, sem você ter mandado.

### 2.3 ✅ Fotografia (feito em 19/09)

A Pokédex tira foto. Em realidade misturada isso é a coisa mais natural que
existe — o bicho está na sua sala — e é o único jeito de o jogo sair do headset
e virar uma coisa que você mostra para alguém.

Tecnicamente é onde mora a dúvida: capturar o passthrough exige permissão de
câmera (`camera-access`), que o Quest dá com aviso. Sem ela, dá para gravar só o
Pokémon com fundo transparente — que já serve para um adesivo.

**Feito**, e o risco de plataforma era outro do que eu esperava.

O que eu achava que seria o problema — capturar o passthrough — é uma limitação
conhecida e contornável: sem acesso bruto à câmera, a foto sai com o bicho sobre
fundo TRANSPARENTE, que é o formato de um adesivo. Quando a permissão existir, o
mesmo caminho recebe o quadro da câmera como fundo e nada muda de forma.

O problema de verdade é que **dentro de uma sessão imersiva não há como baixar
um arquivo**: não há barra de endereço, não há diálogo de download, e um link
com `download` é inerte. Então a foto é guardada em memória e entregue na
SAÍDA — quando a sessão acaba, a página volta a ser uma página, e ali um link é
um link. A galeria na tela inicial é esse corredor.

- **O gesto:** **A/X da mão que segura a Pokédex**. É a câmera no punho e o dedo
  no disparador, e vem antes dos outros usos daquele botão porque, com uma placa
  de 34 × 45 cm na mão, recolher um Pokémon apontando não é o que se está
  tentando fazer.
- **O enquadramento é o do seu OLHAR**, não o da Pokédex: em MR você enquadra
  com a cabeça, e uma foto tirada do ponto de vista de uma placa que você segura
  de lado sairia do chão ou do teto.
- **O retorno:** obturador (duas camadas curtas — câmera não faz nota musical),
  vibração, e um clarão branco de 0,16 s. O clarão é uma folha de luz na frente
  da câmera e NÃO mexe nela: a regra um continua valendo.

- **Como saber que funcionou:** tire uma foto, saia da realidade misturada, e
  ela estará na tela inicial para baixar.
- **O que ainda depende de você:** confirmar se o download funciona no navegador
  do Quest como funciona no de mesa. Se não funcionar, o caminho é a Web Share
  API, que o Quest tem.

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

---

## Fase 4 — O que a auditoria do toque deixou marcado

As Fases 1 e 2 saíram inteiras. Os três itens da Fase 3 dependem do headset e
estão parados esperando você. Esta fase existe para o trabalho não parar junto,
e ela não é lista de desejos: **cada item aqui saiu da auditoria de 18/09** — as
seis dimensões, os quarenta e oito achados e o cético que foi ao código conferir
cada um. Vêm com arquivo e linha porque foram lidos, não imaginados.

### 4.1 ✅ O gesto de devolver a bola estava morto (feito em 19/09)

`saiuDoPainel` e `saiuDoCinto` são a memória de a mão ter SAÍDO do lugar de
onde tirou a bola — sem ela, tirar e devolver seriam o mesmo gesto e a bola
nunca sairia do braço. Só que os dois só eram alimentados dentro de
`atualizarEscolhaInicial`, **que para de rodar assim que você escolhe o
parceiro**. Passado o primeiro minuto de jogo, nenhuma mão voltava a ser marcada
como tendo saído: quem tentasse devolver a bola abrindo a mão em cima do painel
ou do slot **arremessava**.

**Feito.** `marcarSaidaDosLugares` roda no laço principal das mãos, com 1,6× de
margem — "saiu" não é "não está exatamente em cima", porque a mão treme e um
quadro de ruído marcaria saída sem a mão ter saído de lugar nenhum. A seção 41
do smoke guarda esse número pelos dois lados: pequeno demais não é margem,
grande demais exige meio braço de afastamento e o gesto continua morto, só que
agora com código que parece funcionar.

### 4.2 ✅ A bola na mão não gira com o punho (feito em 19/09)

`src/game.ts` copia só a POSIÇÃO da bola presa à mão; o quaternion nunca segue
o punho. Você gira o pulso e ela mantém a orientação do mundo — uma esfera
girada é difícil de notar parada, e é impossível de não notar quando a faixa
passa de pé para deitada sozinha.

Junto vem a outra metade: o deslocamento `(0, 0.01, −0.055)` contra um raio de
4,5 cm põe a superfície da bola a um centímetro da origem do grip, e os dedos da
luva fecham por DENTRO dela.

**Feito**, e a segunda metade não se resolveu como parecia.

O giro era uma linha: a bola passou a copiar a POSE do punho, e não só a
posição.

O lugar dela virou `NA_MAO` em src/orb.ts, ao lado do raio que o justifica — e
ganhou o deslocamento para o lado da PALMA, que é espelhado entre as mãos.
Sem ele a bola nascia alinhada com o osso do antebraço, que é onde nada fica.

Mas a correção dos dedos NÃO foi empurrar a bola para longe: isso a faria
flutuar à frente da mão. Foi parar de FECHAR a mão inteira em volta de uma
esfera. `Mao.fechamento` diz o quanto os dedos fecham conforme o que está na
mão — 64% com a pokébola, 74% com um frasco, 50% com um Pokémon no colo e 46%
com a Pokédex, que é uma placa de 34 por 45 cm. Antes era punho cerrado para
todos os quatro, e os dedos atravessavam as quatro coisas.

`npm run mao` ganhou a pose **"com a pokébola"**, com o contorno da bola
desenhado por cima: é ali que se vê quem está por dentro de quem. A seção 42 do
smoke guarda a geometria (o centro da mão não pode ficar dentro da bola, nem
tão longe que ela flutue) e a ORDEM dos fechamentos — quanto maior a coisa,
menos a mão fecha.

- **Como saber que funcionou:** gire o pulso com a bola na mão. A faixa
  acompanha, e os dedos tocam a superfície em vez de atravessá-la.

### 4.3 ✅ O punho fechado da mão nua decide rápido demais (feito em 19/09)

`lerPunhoFechado` decide com um limiar único e cada borda dispara a cascata
inteira do GRIP. Falta um **latch**: guardar o estado candidato e confirmar uns
120 ms depois. Descartar a borda não serve — descartar faz a bola colar na mão.

E a régua tem um caminho alternativo que muda o significado do limiar conforme o
runtime entregue o metacarpo ou a falange, o que quer dizer que o mesmo gesto
tem sensibilidades diferentes em dois headsets.

**Feito** — e eram TRÊS defeitos, não um. O pior deles era o que a nota
chamava de detalhe.

**A régua trocava de escala.** A medida comparava a distância da ponta ao punho
com a distância do punho ao metacarpo do dedo médio, e caía na falange proximal
quando o metacarpo faltava. As duas estão a uns 3 e uns 9 cm do punho: trocar
uma pela outra multiplica a régua por três, e **com o plano B ligado qualquer
mão contava como fechada**. O mesmo jogo, em dois headsets, com sensibilidades
incomparáveis e nada que denunciasse.

Agora é `razaoDoPunho`: a distância em linha reta da ponta ao punho dividida
pelo comprimento da cadeia esticada. Adimensional, e faltando uma junta o
número quase não se move — o teste afirma isso nas três poses.

**Histerese**, dois limiares (0,62 e 0,72) em vez de um: com um só, a mão parada
na fronteira alterna entre pegar e soltar a cada quadro de ruído.

**Latch assimétrico**, e a assimetria é o ponto: fechar confirma em 90 ms (você
está levando a mão até a coisa, e o atraso some no movimento), abrir em 45. Soltar
a mão é o gesto do ARREMESSO e a velocidade da bola sai da janela dos últimos 90
ms do braço — atrasar o "abriu" faria a bola sair depois do movimento, com a
força de quem já estava parando.

- **Como saber que funcionou:** de mão nua, fechar o punho devagar pega a bola
  uma vez, e não três. E o arremesso continua saindo com a força do braço.

### 4.4 ✅ Histerese na escolha do slot do cinto (feito em 19/09)

Os quatro slots compartilham X e Y e estão a 6,6 cm um do outro, então a
fronteira entre dois vizinhos fica a 3,3 cm — e a bola destacada troca sozinha
com o braço parado. O slot destacado no quadro anterior precisa de uns 15% de
vantagem para continuar sendo o escolhido.

Só valia depois que a rampa do toque existisse, porque antes dela a troca era
invisível. Agora ela existe: a bola cresce e a mão vibra, então a troca sozinha
passou a ser **visível e sentida**.

**Feito**, e o número da auditoria não sobreviveu à conta.

A vantagem virou `escolherSlot`, uma função pura que o DESTAQUE e o GRIP usam —
os dois, e essa é metade do conserto: duas regras parecidas em dois lugares dão
exatamente o bug de acender um slot e pegar o outro.

Os "uns 15%" que a auditoria sugeria dão **2,7 mm** de imunidade, pela conta
`(passo/2)·(1−v)/(1+v)` com o passo de 6,6 cm. É menos do que um braço
estendido treme — o remédio estaria escrito no código e a bola continuaria
trocando sozinha, que é a pior categoria de conserto. Trinta por cento dá 5,8
mm, e deixa 18% do caminho entre dois slots "grudado" no atual.

O smoke afirma a conta, e não só o efeito: se alguém mexer na vantagem ou no
passo, o teste diz quantos milímetros de imunidade sobraram.

- **Como saber que funcionou:** aproxime a mão do cinto e pare. A bola acesa
  não pisca entre duas.

### 4.5 ✅ A luva pisca no lugar da vibração, de mão nua (feito em 19/09)

Não existia vibração com hand tracking: o atuador vive no gamepad do controle,
e uma fonte de mão nua não tem um. Todo `sentir()` era descartado em silêncio —
metade do vocabulário tátil do jogo não existia para quem larga os controles.

Agora a luva PISCA herdando a FORMA do padrão (`Luva.piscar`): `recusado`, o
único de duas batidas, vira dois flashes com o mesmo respiro de 45 ms da
vibração — a constante passou a ser uma só, `RESPIRO_DE_PULSO_MS`, usada pelos
dois lados.

Três coisas que o item não previa e a implementação achou:

- **`definirDedos` só roda com controle na mão.** Pendurar o flash ali o
  deixaria parado exatamente no modo em que ele é o único sinal. Quem o
  atualiza é o quadro (`atualizarLuva`), antes do `if`.
- **35 ms de flash não viram imagem.** `pegou` vibra por 35 ms e isso se sente
  bem, mas são dois quadros e meio a 72 Hz. Todo flash tem piso de 70 ms
  (`PISO_DO_FLASH_MS`), cortado a 55% do intervalo até a batida seguinte para
  que as duas de `recusado` não se encostem — sobram 47 ms de escuro.
- **O decaimento é proporcional à força.** Com taxa fixa, `marcou` seria o mais
  fraco E o mais curto, e as duas diferenças se somariam até ele sumir.

O flash vale nas três luvas — articulada, rastreada e a de reserva de código —,
a 100% sem controle e a 35% com ele, onde é só reforço de canto de olho. O
emissivo saiu da cor para a intensidade, que é o mesmo pixel no repouso com uma
alavanca de um número só.

- **Esforço:** médio-baixo.
- **Como saber que funcionou:** de mão nua, de olhos no bicho, você percebe que
  o jogo recusou o gesto.
- **Conferido em:** `npm test`, seção 45 — a forma dos cinco padrões, o piso, o
  escuro entre as duas batidas, a volta ao repouso e o flash de mão nua.

### 4.6 ✅ O achado em cima do móvel se pegava sozinho (feito em 19/09)

`Achados.colher` rodava no laço de quadro: bastava a mão PASSAR perto da poção
e ela sumia — creditada, com som e cartaz, sem nenhum gesto seu. Um item que se
pega sozinho não é um item que você achou; é um item que aconteceu com você. E
o getter `Achados.posicao` não tinha consumidor nenhum: a dica de aproximação
que o comentário prometia nunca foi escrita.

As duas metades eram a mesma coisa, e por isso foram juntas:

- **Pegar é pelo GRIP**, como tudo o mais que se pega no jogo. Entra na cascata
  depois de tudo que se agarra no CORPO (Pokédex nas costas, mochila no peito,
  cinto no antebraço, carta no painel), que nunca compete com um móvel a um
  braço de distância, e antes da guarda de mão cheia — catar uma poção não
  precisa da mão livre, ela vai direto para a mochila.
- **A aproximação responde antes.** O objeto cresce 18% e a luz sobe conforme a
  mão chega, e a mão sente a textura (`forcaDeToque` + `rocar`). Sem isso, pegar
  por GRIP seria adivinhação: um alvo de dez centímetros em cima de um móvel de
  verdade, sem resposta nenhuma, é indistinguível de um alvo que não responde.

Duas coisas que apareceram implementando:

- **O achado nascia a 1,35 e encolhia sozinho no quadro seguinte.**
  `ItemNaMao.atualizar` escrevia a escala com `setScalar` todo quadro, então
  quem a definisse de fora a via durar um quadro. Ninguém ia notar olhando —
  ninguém viu o tamanho certo nunca. Agora existe `escalaBase`, multiplicada.
- **A banda de aviso do achado é própria** (`AVISO.achado`, 30 cm sobre um
  agarre de 17), e não a da mochila que tem o mesmo nome de "item" e 8 cm: a
  mochila abre a um palmo do seu peito, o achado está em cima de um móvel de
  verdade e você chega nele de braço esticado, sem o próprio corpo para
  calibrar a distância.

- **Esforço:** médio.
- **Como saber que funcionou:** você fecha a mão em volta da poção que apareceu
  na sua mesa, e ela vem. Passar a mão por cima não tira mais nada de lá.
- **Conferido em:** `npm test`, seção 46 — a mão varrendo por cima não colhe, a
  escala responde à aproximação e volta, e o GRIP de longe é recusado sem gastar
  o item.

## O que sobrou

Com o 4.6, **todo item deste arquivo que dá para fazer sem o headset está
feito** — fases 1, 2 e 4 inteiras, treze itens.

O que resta depende de você:

- **0.1** — os quatro números de quadro (parado, três selvagens, painel aberto,
  mochila aberta). É o único item que eu não posso fazer, e **treze sistemas
  novos** entraram desde a última medida. Tudo depois dele passa a ser decidido
  com número em vez de opinião.
- **3.1** — as quatro patas de fogo do Ponyta, que dependem do orçamento de
  quadro que o 0.1 mede.
- **3.2** — a oclusão ligada por padrão, que precisa de você vendo se o recorte
  da mão aguenta.
- **3.3** — o número da calibração da mão, que é uma medida no seu braço.

Fora isso: confirmar se o download da foto funciona no navegador do Quest (o
plano B é a Web Share API).
