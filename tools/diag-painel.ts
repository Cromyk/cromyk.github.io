/**
 * Confere o ARRANJO do painel do pulso — onde cada carta fica, em metros.
 *
 * A folha de `tools/paineis.ts` desenha as cartas uma a uma e mostra se cada
 * uma é legível; ela não mostra onde elas param no ar, que foi justamente a
 * queixa do playtest de 18/09: seis cartas de time numa fileira de 66 cm, e
 * metade do painel pendurada abaixo do antebraço.
 *
 * Aqui o painel é montado de verdade — com o mesmo `document` de mentira do
 * rasterizador — e as posições são medidas. As duas afirmações que importam:
 *
 *   1. nada fica ABAIXO da origem, que é o punho;
 *   2. nada passa da largura útil do painel.
 *
 *   npm run painel
 *
 * A terceira afirmação entrou em 19/09, com a queixa de que *"a barra superior
 * está MUITO lá em cima"*: a barra de comandos tem de encostar no time.
 */
import { createCanvas } from '@napi-rs/canvas';

const falso = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error(`elemento inesperado: ${tag}`);
    return createCanvas(8, 8);
  },
};
(globalThis as { document?: unknown }).document = falso;

const { PainelTime } = await import('../src/menu');
const { MODOS } = await import('../src/modos');
const { BOLAS } = await import('../src/balls');
const { ITENS } = await import('../src/itens');
const { INTERRUPTORES } = await import('../src/ajustes');
const { porId } = await import('../src/species');

const time = ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'eevee', 'gengar'].map((id, i) => ({
  exemplar: { id, xp: 0, hp: 20, shiny: false, capturadoEm: 0 },
  especie: porId(id)!,
  hp: 20,
  hpMax: 24,
  nivel: 12 + i,
  progresso: 0.4,
  shiny: false,
  emCampo: i === 0,
}));
const bolas = BOLAS.map((tipo) => ({ tipo, quantidade: 3 }));
const itens = ITENS.map((tipo) => ({ tipo, quantidade: 2 }));
const golpes = porId('charmander')!.golpes.slice(0, 4).map((golpe, i) => ({ golpe, armado: i === 0 }));
const interruptores = INTERRUPTORES.map((i) => ({ id: i.id, nome: i.nome, ligado: true, diz: i.ligadoDiz }));

type Desenhado = { malha: { visible: boolean; position: { x: number; y: number } } };
const painel = new PainelTime() as unknown as {
  definirConteudo: (...a: unknown[]) => void;
  grupo: { children: Array<{ visible: boolean; position: { x: number; y: number }; scale: { x: number; y: number }; userData: Record<string, unknown> }> };
  /** O time é bola de luz desde 18/09; a `Holobola` expõe `grupo`, não `malha`. */
  bolasTime: Array<{ grupo: { visible: boolean; position: { x: number; y: number } } }>;
  etiquetas: Desenhado[];
  cardsBola: Desenhado[];
  cardsItem: Desenhado[];
  cardsGolpe: Desenhado[];
  cardsChave: Desenhado[];
  cardEngrenagem: Desenhado;
  cardPc: Desenhado;
  cardMochila: Desenhado;
  cardChamar: Desenhado;
  titulo: { malha: { position: { x: number; y: number } } };
  fundo: { position: { y: number }; geometry: { boundingBox: unknown } };
};

painel.definirConteudo(time, bolas, itens, golpes, MODOS[0].id, 'normal', interruptores);

const LARGURA = { etiquetas: 0.074, cardsBola: 0.069, cardsItem: 0.042, cardsGolpe: 0.118 };
const ALTURA = { etiquetas: 0.024, cardsBola: 0.06, cardsItem: 0.038, cardsGolpe: 0.042 };

let baixo = Infinity;
let esquerda = 0;
let direita = 0;
let alto = -Infinity;
let problemas = 0;

console.log('grupo            x (cm)          y (cm)     cartas');
for (const grupo of ['cardsGolpe', 'cardsItem', 'cardsBola', 'etiquetas'] as const) {
  const visiveis = painel[grupo].filter((c) => c.malha.visible);
  if (visiveis.length === 0) continue;
  const xs = visiveis.map((c) => c.malha.position.x);
  const ys = visiveis.map((c) => c.malha.position.y);
  const meiaL = LARGURA[grupo] / 2;
  const meiaA = ALTURA[grupo] / 2;
  const xMin = Math.min(...xs) - meiaL;
  const xMax = Math.max(...xs) + meiaL;
  const yMin = Math.min(...ys) - meiaA;
  const yMax = Math.max(...ys) + meiaA;
  baixo = Math.min(baixo, yMin);
  alto = Math.max(alto, yMax);
  esquerda = Math.min(esquerda, xMin);
  direita = Math.max(direita, xMax);
  console.log(
    `${grupo.padEnd(12)} ${(xMin * 100).toFixed(1).padStart(7)} a ${(xMax * 100).toFixed(1).padStart(6)} ` +
      `${(yMin * 100).toFixed(1).padStart(8)} a ${(yMax * 100).toFixed(1).padStart(6)}   ${visiveis.length}`,
  );
}

// O topo do conteúdo é a bola de luz mais alta do time — é DELA que a barra de
// comandos tem de ficar perto. Ver a queixa do playtest de 19/09.
const topoDoTime = Math.max(
  ...painel.bolasTime.filter((b) => b.grupo.visible).map((b) => b.grupo.position.y),
);

const tituloY = painel.titulo.malha.position.y;
const iconeY = painel.cardEngrenagem.malha.position.y;
alto = Math.max(alto, tituloY + 0.016);
console.log(`${'ícones'.padEnd(12)} ${''.padStart(16)} ${(iconeY * 100).toFixed(1).padStart(8)}`);
console.log(`${'título'.padEnd(12)} ${''.padStart(16)} ${(tituloY * 100).toFixed(1).padStart(8)}`);

console.log(`\nlargura total: ${((direita - esquerda) * 100).toFixed(1)} cm  (era 66,0 na fileira de seis)`);
console.log(`altura: de ${(baixo * 100).toFixed(1)} a ${(alto * 100).toFixed(1)} cm acima do punho`);
// Medido do TOPO da bola (o raio dela é 2,6 cm), que é a borda que o olho vê.
const vaoDaBarra = iconeY - (topoDoTime + 0.026);
console.log(`barra de comandos: ${(vaoDaBarra * 100).toFixed(1)} cm acima do topo do time`);

if (baixo < -0.001) {
  console.log(`FALHOU: ${(baixo * 100).toFixed(1)} cm ABAIXO do punho`);
  problemas++;
}

// A queixa era esta: *"a barra superior está MUITO lá em cima"*. Ela vinha de o
// título seguir o topo da página de AJUSTES, que cresce com cada interruptor.
// Oito centímetros é o passo de uma linha do painel; acima disso já há um vão
// vazio no meio do painel.
if (vaoDaBarra > 0.06) {
  console.log(`FALHOU: a barra de comandos está ${(vaoDaBarra * 100).toFixed(1)} cm acima do time`);
  problemas++;
}
if (tituloY < iconeY) {
  console.log('FALHOU: o título não está acima dos comandos');
  problemas++;
}
if (direita - esquerda > 0.42) {
  console.log(`FALHOU: ${((direita - esquerda) * 100).toFixed(1)} cm de largura é mais do que um braço alcança`);
  problemas++;
}
console.log(problemas === 0 ? '\ntudo acima do braço e dentro do alcance' : `\n${problemas} problema(s)`);
process.exit(problemas === 0 ? 0 : 1);
