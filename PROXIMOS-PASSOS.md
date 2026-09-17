# Próximos passos — jogabilidade e interação

Escrito depois do playtest de 16–17/09 (ver `PLAYTEST.md`). Não é lista de
desejos: cada item abaixo sai de uma coisa que o playtest mostrou ou que o
código confessa quando se olha. Está em ordem de impacto, e o motivo de cada
prioridade está dito.

---

## 1. Nenhum gesto pode falhar calado

**Por que primeiro:** foi a causa do bug que você relatou como *"mandar o
Pokémon e ele ficar não funciona"*. A lógica estava certa e com teste passando
— o que faltava era o jogo **dizer** que a condição não estava satisfeita. Você
repetiu o gesto sem nunca saber que ele estava correto.

Isso não foi um caso isolado, foi um padrão. O código tem 12 pontos que recusam
com voz (`audio.recusa()`) e pelo menos 5 que **retornam em silêncio** no meio
de um gesto do jogador:

```
game.ts:1839   if (!this.companheiro) return;
game.ts:2891   if (!this.temCompanheiroEmCampo) return;
game.ts:3428   if (!this.companheiro) return;
game.ts:3475   if (!this.companheiro) return;
game.ts:3912   if (!this.temCompanheiroEmCampo) return;
```

Num jogo de tela e teclado, silêncio é ambíguo mas tolerável. Em VR ele é
cruel: você não tem cursor, não tem log, não tem como saber se o sistema te
ouviu. Silêncio e "não funciona" são indistinguíveis.

**Proposta:** uma regra de projeto — *todo caminho que interrompe um gesto do
jogador devolve alguma coisa*: voz, vibração ou frase. Em VR, vibração é a mais
barata e a mais informativa, porque chega sem ocupar a visão.

**Esforço:** baixo. É auditoria mecânica, e o padrão já existe em 12 lugares
para copiar.

---

## 2. A armadilha das pokébolas ainda está inteira nos itens

**O que eu verifiquei:** `ganharItem` só é chamado de um lugar —
`premiarCaptura()`, em `src/state.ts`. Igualzinho às bolas antes da correção:

> poção só vem de capturar · capturar com o time machucado é mais difícil ·
> difícil de capturar significa menos poção

Não é o beco sem saída que as bolas eram — dá para capturar sem poção —, mas é
uma **espiral descendente**, e ela é pior justamente para quem está perdendo.
Um jogador em dificuldade recebe menos ajuda exatamente quando precisa de mais.

**Proposta:** dar à poção uma segunda fonte. Duas opções, e eu prefiro a
segunda:

- **recarga por tempo**, como fiz com a Bola Comum. Funciona, mas é mais do
  mesmo e não acrescenta nada ao jogo.
- **itens na sala.** O jogo já mapeia a sua casa e já sabe a altura de cada
  superfície (`sala.alturaEm`). Uma poção que aparece **em cima da mesa de
  verdade** e que você pega esticando o braço usa o que o jogo tem de mais
  próprio — e dá um motivo para andar pelo cômodo, que hoje o jogo pede mas não
  recompensa.

**Esforço:** baixo para a recarga; médio para os itens na sala, e é o que rende.

---

## 3. O dedo como ponteiro de tudo

Você pediu o dedo no HUD e ele está lá. Mas a lição é maior que o HUD: o jogo
tinha os dois pontos de mão (`posicaoMundo` = punho, `pontoDeToque` = ponta do
indicador) e usava o errado em metade dos lugares.

**Proposta:** o dedo vira o ponteiro **de tudo o que é apontável**, não só das
cartas:

- apontar para um selvagem mostra nome, nível e tipo sem abrir painel — hoje
  isso exige a Pokédex, que é um gesto de duas mãos;
- apontar para o seu Pokémon mostra a vida dele;
- apontar para uma superfície mapeada mostra que ela é um lugar válido de
  destino, antes de você soltar o gatilho.

O terceiro item é o mais útil: hoje você segura o gatilho e descobre se o ponto
vale quando a marca aparece — ou não aparece.

**Esforço:** médio. A infraestrutura de mira e de placas já existe toda.

---

## 4. Vinte e um comandos, e sete segundos de tutorial

O jogo tem **21 comandos** (contando os `case` do despachante). Grip, gatilho,
gatilho *segurado*, A, B, X, Y, analógico, girar o pulso esquerdo, girar o
direito, mão às costas, encostar no bicho, encostar com item na mão…

O ensino disso hoje é uma placa de quatro linhas que fica 7 segundos na entrada
da sessão e some para sempre.

**Proposta**, do mais barato ao mais caro:

1. **A placa volta quando pedida** — um gesto só (as duas mãos abertas, ou um
   botão) traz o cartão de comandos de volta. Hoje não há como revê-lo.
2. **Ajuda contextual**: a primeira vez que você segura uma bola, uma linha
   discreta diz como arremessar. Uma vez por coisa, guardada no save.
3. **Um lugar onde treinar** sem bicho nenhum — o Relaxante já é quase isso.

**Esforço:** (1) é trivial e resolve a maior parte. Faria só ela primeiro e
mediria.

---

## 5. Conforto: o jogo assume que você está de pé e com espaço

Várias distâncias do jogo são absolutas: o painel a 9 cm da mão, o bicho que
para a 1,1 m de você, o destino limitado a 3 m, a sala que cresce enquanto você
caminha. Quem joga sentado, num canto, ou com pouco espaço vive outro jogo — e
esse é o caso mais comum de quem tem um Quest em casa.

**Proposta:** um ajuste de **modo sentado** que escale as distâncias de
aproximação e traga o alcance para perto, em vez de depender de o jogador
andar. Os ajustes já existem como sistema (`src/ajustes.ts`), então é mais
calibração do que código.

**Esforço:** baixo-médio. Alto valor para quem não tem uma sala livre.

---

## 6. A sala mapeada merece mais papel

Hoje o mapeamento serve para o bicho não atravessar o sofá e para você mandar
ele subir na mesa. É muito trabalho de engenharia para um papel pequeno.

**Ideias, em ordem de quanto rendem pelo que custam:**

- selvagens **nascem onde faz sentido**: os de terra no chão, os que voam no
  alto, os pequenos embaixo dos móveis;
- esconderijo: um bicho assustado corre para **trás de um móvel de verdade**;
- os itens do item 2 aparecem em superfícies.

**Esforço:** médio. O primeiro sozinho já muda como o cômodo parece povoado.

---

## 7. O rig da luva, quando der

Estado em `PLAYTEST.md` e no topo de `tools/rig.ts`. Os cinco dedos **já estão
segmentados** (conferido em `folha-dedos.png`), que era o problema que travou
três tentativas. Falta a ordem anatômica ficar confiável, o alinhamento, os
pesos e a bind pose.

É o item de menor impacto da lista: a mão genérica funciona, e nada aqui
depende da luva. Fica por último de propósito.

---

## O que eu faria na próxima sessão

Os itens **1** e **2** juntos, porque são baratos, saem direto do que você
sentiu jogando, e os dois atacam a mesma coisa: **o jogo não conta ao jogador
o que está acontecendo com ele.** Um em forma de silêncio nos gestos, o outro
em forma de recurso que seca sem aviso e sem saída.

Depois o **4.1** (trazer o cartão de comandos de volta), que é quase de graça.
