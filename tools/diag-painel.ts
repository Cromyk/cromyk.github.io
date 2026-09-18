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
 *   npx esbuild tools/diag-painel.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/dp.mjs && node node_modules/.cache/dp.mjs
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

const painel = new PainelTime() as unknown as {
  definirConteudo: (...a: unknown[]) => void;
  grupo: { children: Array<{ visible: boolean; position: { x: number; y: number }; scale: { x: number; y: number }; userData: Record<string, unknown> }> };
  cards: Array<{ malha: { visible: boolean; position: { x: number; y: number } } }>;
  cardsBola: Array<{ malha: { visible: boolean; position: { x: number; y: number } } }>;
  cardsItem: Array<{ malha: { visible: boolean; position: { x: number; y: number } } }>;
  cardsGolpe: Array<{ malha: { visible: boolean; position: { x: number; y: number } } }>;
  titulo: { malha: { position: { x: number; y: number } } };
};

painel.definirConteudo(time, bolas, itens, golpes, MODOS[0].id, 'normal', interruptores);

const LARGURA = { cards: 0.092, cardsBola: 0.069, cardsItem: 0.05, cardsGolpe: 0.143 };
const ALTURA = { cards: 0.114, cardsBola: 0.06, cardsItem: 0.046, cardsGolpe: 0.05 };

let baixo = Infinity;
let esquerda = 0;
let direita = 0;
let alto = -Infinity;
let problemas = 0;

console.log('grupo            x (cm)          y (cm)     cartas');
for (const grupo of ['cardsGolpe', 'cardsItem', 'cardsBola', 'cards'] as const) {
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

const tituloY = painel.titulo.malha.position.y;
alto = Math.max(alto, tituloY + 0.019);
console.log(`${'título'.padEnd(12)} ${''.padStart(16)} ${(tituloY * 100).toFixed(1).padStart(8)}`);

console.log(`\nlargura total: ${((direita - esquerda) * 100).toFixed(1)} cm  (era 66,0 na fileira de seis)`);
console.log(`altura: de ${(baixo * 100).toFixed(1)} a ${(alto * 100).toFixed(1)} cm acima do punho`);

if (baixo < -0.001) {
  console.log(`FALHOU: ${(baixo * 100).toFixed(1)} cm ABAIXO do punho`);
  problemas++;
}
if (direita - esquerda > 0.42) {
  console.log(`FALHOU: ${((direita - esquerda) * 100).toFixed(1)} cm de largura é mais do que um braço alcança`);
  problemas++;
}
console.log(problemas === 0 ? '\ntudo acima do braço e dentro do alcance' : `\n${problemas} problema(s)`);
process.exit(problemas === 0 ? 0 : 1);
