# Playtest de 16/09/2026 — o que voltou do headset

Documento vivo, atualizado conforme cada item é fechado.

> **Nada aqui foi visto rodando por mim.** Eu não tenho o headset: o que eu
> garanto é o que o código, as medições e o `tsc` dizem. Onde eu não pude
> conferir, está escrito que não pude.

| # | O que você relatou | Estado |
|---|---|---|
| 1 | Rig da luva pela metade | ⚠️ avançou, mas NÃO terminou |
| 2 | A mão do jogo fica à frente da mão real | ✅ corrigido (medido) |
| 3 | Zerei as pokébolas e não há como conseguir mais | ✅ corrigido |
| 4 | O dedo não interage com o HUD | ✅ corrigido |
| 5 | Mandar o Pokémon ir e ficar não funciona | ✅ corrigido |
| 6 | O grito sai o tempo todo — quer 7 a 15 s de intervalo | ✅ corrigido |
| 7 | Se a sessão cair, poder recuperar ao voltar | ✅ implementado |

---

## 2 ✅ A mão do jogo ficava uma mão inteira à frente

**Seu relato:** *"é como se a minha mão real segurasse o pulso da mão do jogo"*.
Era literalmente isso, e dá para provar com régua.

`src/glove.ts` escolhia assim o ponto do modelo que coincide com a sua mão de
verdade (a origem do grip space):

```js
const encaixe = punho.clone().lerp(meioBase, 0.62)
```

O `meioBase` é `middle-finger-metacarpal`, e o nome engana: pela especificação
do WebXR essa junta **não** fica no meio da palma — fica na base do metacarpo,
colada no pulso. Medido no próprio `public/maos/right.glb`:

| junta | distância do pulso |
|---|---|
| `middle-finger-metacarpal` | **2,99 cm** |
| `middle-finger-phalanx-proximal` (os nós dos dedos) | 9,17 cm |
| `middle-finger-tip` | 17,78 cm |

Logo, aquele lerp andava **1,86 cm** — a origem do grip caía praticamente em
cima do *pulso* do modelo, e os outros 16 cm de mão ficavam pendurados à frente
da sua mão real.

**Correção:** o ponto certo é o centro do punho fechado em volta do cabo, que
fica entre o metacarpo e os nós dos dedos — não entre o pulso e o metacarpo.
A fração é medida na mão carregada, não em centímetros fixos.

```
ANTES   encaixe a 1,86 cm do pulso
DEPOIS  encaixe a 6,37 cm do pulso   (a mão recuou 4,55 cm)
ponta do dedo médio: 15,97 cm → 11,44 cm à frente da sua mão
```

O aro colorido do punho estava num número fixo (`z = 0,024`) medido contra o
encaixe errado, e viraria um aro flutuando no antebraço. Agora ele pergunta ao
modelo onde o pulso foi parar — o que o mantém certo quando a luva entrar no
lugar da mão genérica.

**Conferido:** medição + `tsc` + a folha `folha-maos.png` (`npm run mao`), que
desenha a `MaoArticulada` de verdade e mostra o aro no pulso.
**Não conferido:** a sensação no headset. O número diz 4,55 cm para trás; se
ainda parecer adiantado, o ajuste fino é a fração `0,55` em `glove.ts`.

---

## 3 ✅ Ficar sem bolas era um beco sem saída

**Seu relato:** *"tinha 0 e não tem forma de conseguir mais"*. Confirmado no
código, e é um beco sem saída de verdade, não uma dificuldade:

- a única fonte de bolas era `premiarCaptura()`, em `src/state.ts`;
- ela só é chamada **ao capturar**;
- capturar exige bola.

Zerou → não captura → não ganha bola → zerado para sempre. Nenhuma tela avisa,
porque do ponto de vista do código estava tudo certo.

E havia uma pista de que isso era um esquecimento, não uma decisão: a descrição
da Bola Comum, em `src/balls.ts`, sempre disse **"A de sempre. Recarrega
sozinha."** A promessa estava escrita e nunca tinha sido implementada.

**Correção:** implementei a recarga que a descrição prometia.

- **1 Bola Comum a cada 75 s, até 6.** Só a Comum recarrega — raridade que se
  repõe sozinha deixa de ser raridade.
- O teto da recarga (6) fica bem abaixo do máximo (12) de propósito: a rede de
  segurança te tira do buraco, não te abastece. Encher a mochila continua sendo
  coisa de quem caça.
- O relógio é de **época** (`Date.now()`), não de sessão: ele corre com o jogo
  fechado. Voltar no dia seguinte encontra o estoque cheio, e não o zero de
  ontem.
- O resto fracionário é preservado, senão quadros de 16 ms jogariam fora 74,98 s
  de espera a cada volta e a recarga nunca chegaria.
- Aviso na tela **só quando a mochila estava vazia** — é quando a bola é a
  diferença entre jogar e não jogar. De 3 para 4 não merece placa.

**Conferido:** `tsc`. **Não conferido:** a espera de 75 s sentida em jogo.

---

## 6 ✅ O grito virou voz em vez de botão

**Seu relato:** *"não pode sair o tempo todo... precisa de um intervalo entre
disparos... entre 7 a 15 segundos"*.

**Dezesseis** pontos de `src/game.ts` chamam `audio.grito()` — carinho, colo,
chamado, recolher, cada golpe de batalha. A correção certa não é mexer nos
dezesseis: é pôr o intervalo **dentro** de `grito()`, que é por onde todos
passam.

- A espera é **sorteada entre 7 e 15 s a cada grito**, não fixa. Um bicho que
  responde exatamente a cada 10 s soa tão mecânico quanto um que responde
  sempre — o sorteio é o que impede o ouvido de achar o compasso.
- A conta é **por espécie**, não global: dois bichos diferentes na sala podem se
  responder; o que não pode é o mesmo repetir.

Quatro momentos ignoram o intervalo (`forcar = true`), porque neles o grito *é*
o acontecimento e engoli-lo deixaria o quadro mudo:

| momento | por quê |
|---|---|
| evolução | a primeira voz da forma nova |
| captura | o bicho acabou de virar seu |
| sai da bola | sem voz, o clarão fica mudo |
| **brilhante** | aparece 1 em milhares e pode nascer atrás de você |

Um encontro comum respeita o intervalo; o brilhante não.

**Conferido:** `tsc`. **Não conferido:** o ritmo ouvido em jogo. Se 7–15 s ainda
parecer muito, o número está num lugar só, no topo de `grito()`.

---

## 5 ✅ O menu engolia o comando antes dele começar

**Seu relato:** *"a função de mandar o pokémon e ele ficar não funciona"*.

Primeiro achado, e ele muda onde procurar: **a lógica do "ficar" está correta e
tem teste passando.** O caso 27 da suíte (`npm test`) diz, e passou antes de eu
tocar em qualquer coisa:

```
27. mandado ficar, ele fica
   foi até a marca, ficou 0.49 m em volta dela por 30 s e voltou quando chamado
```

Então o problema nunca esteve em `irPara` nem no `posto` — está no **caminho de
entrada**, entre o seu dedo e essa função. E lá havia isto, em `gatilhoDesceu`:

```js
if (this.escolha || this.painelTime.aberto || this.painelDex.aberto || this.pc.aberto) {
  this.puxarGatilho(mao);   // resolve AGORA e desiste do resto
  return;
}
```

O comando de mandar ir exige o gatilho **segurado** — ele só nasce depois de
0,28 s de dedo embaixo. Mas com o painel do time aberto, o gatilho era resolvido
no ato como clique de menu e o comando nunca chegava a começar. E o painel do
time abre no pulso **esquerdo**: bastava ele estar aberto para o gatilho da mão
**direita**, apontando para o chão do outro lado da sala, morrer antes do
primeiro quadro — sem carta nenhuma sob a mira.

Pior: o painel fica aberto mais tempo do que parece. A histerese do gesto
(`src/gesto.ts`) mantém o painel com um limiar mais frouxo **e sem exigir a mão
erguida** depois de aberto — então baixar o braço para apontar não o fecha.

**Correção:** a pergunta certa não é *"tem painel aberto?"* e sim *"o menu tem
algo sob a mira?"*. Sem alvo, ele não tem o que resolver, e o gatilho volta a
ser do jogo. A escolha do inicial continua modal (antes dela não há jogo) e a
Pokédex continua tomando o gatilho (ela lê a ficha em voz alta e não tem "item
sob a mira" a consultar).

**Segunda correção, do silêncio.** Sem ninguém em campo, o gesto inteiro não
produzia reação nenhuma — nem marca, nem recusa, nem frase. Você repetia o
movimento sem jamais descobrir que ele estava certo e a condição é que não.
Agora o gesto é reconhecido mesmo sem companheiro, e ao soltar você ouve a
recusa e lê *"ninguém em campo para mandar — segure o grip para soltar o seu
Pokémon primeiro"*.

**Não conferido:** eu não consigo reproduzir sem o headset. Se ainda falhar com
o painel fechado e o Pokémon em campo, o próximo suspeito é o `selectstart` não
estar chegando — e aí o teste é soltar o gatilho **sem** apontar para o chão: se
ele ataca, o evento chega e o problema é a mira; se não faz nada, o evento não
chega.

---

## 4 ✅ O HUD media o punho, não o dedo

**Seu pedido:** *"quero que o dedo também interaja com o HUD"*.

O jogo tinha os dois pontos de mão e usava o errado no HUD:

| ponto | o que é | onde era usado |
|---|---|---|
| `posicaoMundo()` | o **punho** | painel do time, cinto |
| `pontoDeToque()` | a **ponta do indicador** | encostar nos bichos |

O `pontoDeToque` existe desde que fazer carinho pelo centro do punho obrigava a
enfiar meio braço dentro do Charmander — a lição já tinha sido aprendida uma
vez, só não tinha chegado ao HUD. Quem apontava o dedo para uma carta não via
nada acender: o jogo media a partir de um ponto uns dez centímetros atrás da
ponta do dedo, e diante de um painel do tamanho de um relógio o gesto natural é
apontar, não encostar o pulso.

**Correção:** painel do time e cinto passam a medir pela ponta do indicador
(`pontoDoDedo`), tanto para destacar quanto para pegar — o mesmo ponto para as
duas coisas, senão a carta que acende e a que o grip pega poderiam divergir.
Pegar bola caída no chão continua sendo pela mão: aquilo é agarrar, não apontar.

Isto e o item 2 se somavam: o ponto de referência do HUD estava atrás da ponta
do dedo **e** a mão inteira estava 4,5 cm adiantada.

---

## 7 ✅ A sessão que cai agora volta

**Seu pedido:** *"caso a sessão caia, possa ser recuperada na próxima vez que
entrar"*.

Uma sessão de VR não termina, ela **cai**: você tira o headset, a bateria acaba,
o passthrough perde o rastreamento. Duas coisas não sobreviviam a isso:

**1. Quem estava em campo.** Time, Pokédex e mochila já eram salvos; o
companheiro fora da bola, não. Ao voltar, a sala estava vazia. Agora o índice de
quem está em campo é gravado, e ao entrar ele volta — **sem clarão e sem bola**,
porque ele não está sendo invocado agora: ele já estava ali. Aparece ao seu lado
com a frase *"continuava com você — ele esperou do lado de fora da bola"*.
Desmaiado não volta: esse já tinha voltado para a bola sozinho.

**2. A vida dele.** O HP do corpo vivo só era gravado ao recolher ou ao
desmaiar, e numa sessão que cai não há nem um nem outro — a luta inteira era
esquecida e ele voltava com a vida de antes dela. Agora é gravado de dez em dez
segundos.

**Conferido:** `tsc` e a suíte (`npm test`, 29 casos). **Não conferido:** a
queda de sessão de verdade no headset.

---

## 1 ⚠️ O rig da luva: avançou, mas não ficou pronto

**Seu pedido:** *"pode terminar o rig"*. Não terminei, e é melhor você saber
exatamente onde parou do que receber uma luva torta.

O que eu fiz foi **derrubar o plano que estava escrito no arquivo**, com
medição — e achar um caminho melhor. Isso vale mais do que parece: as duas
abordagens documentadas ali não funcionam, e descobrir isso custaria o mesmo
tempo de novo à próxima pessoa que abrir o arquivo.

### Primeiro: eu finalmente olhei a luva

`node tools/ver-luva.mjs` → `folha-luva.png`, três vistas nos eixos principais.
Ferramenta nova, e ela existe porque o rig foi discutido por duas sessões sem
ninguém desenhar a malha. É uma luva acolchoada, de costura, com **cinco dedos
separados e semi-dobrados para dentro**.

### Uma medida errada que estava no cabeçalho

O arquivo afirmava que a mão tem os *"dedos −X, punho em x=+0,056"*. Errado:
aquilo saiu dos **vértices** da malha, e o que importa são as **juntas**.
Medidas as juntas, os dedos da mão apontam para **−Y** e o X quase não muda.
É o mesmo engano que pôs a origem do grip em cima do pulso (item 2) — medir a
junta errada, ou o vértice no lugar da junta. Corrigido no arquivo.

### As duas abordagens não funcionam — e agora há medição

| abordagem | resultado |
|---|---|
| fatias perpendiculares ao eixo | **nunca mais de 2 lóbulos** em 30 fatias da malha cheia |
| **setor angular** (o plano do arquivo) | distribuição **contínua de −36° a +34°, sem 5 picos** |

O setor angular era a saída proposta, com um bom argumento: dobrar o dedo mexe
no eixo perpendicular à palma, não no ângulo. A medição derruba assim mesmo —
os dedos são grossos, quase se tocam, e a malha da palma preenche o vão, então
os vales entre dedos não descem o bastante para separá-los.

As fatias falham por outro motivo, visível no desenho: os dedos são **curvos**.
A maior largura lateral fica no *meio* da luva (163 mm) e não nas pontas
(97 mm) — uma fatia perpendicular corta *ao longo* dos dedos, não através.

### O caminho que resta, e é melhor que os dois

Em vez de procurar os dedos na luva, **dobrar a mão até a pose da luva**. A
`MaoArticulada` já sabe fechar os dedos por parâmetro (`definirDedos`), e é o
mesmo código que o jogo usa:

1. achar o par (gatilho, grip) que minimiza a distância média entre as malhas —
   a curvatura da luva vira um número em vez de um problema;
2. com as duas na **mesma pose**, vizinho mais próximo volta a valer, que era a
   objeção original ao método simples;
3. levar a luva à bind pose pela inversa da transformação de cada osso;
4. exportar.

A alternativa honesta é o **Blender** — o *Armature > With Automatic Weights*
faz transferência de peso por heat map melhor do que qualquer coisa escrita à
mão aqui. Tentei: o MCP está instalado mas o Blender não está aberto, e eu não
abro janela na sua tela. Se você deixar o Blender aberto, esse caminho é o mais
curto para uma luva de verdade.

**Estado:** `public/maos/left.glb` e `right.glb` continuam sendo o `generic-hand`
— a luva não entrou no jogo. Tudo o mais deste playtest funciona sem ela.
