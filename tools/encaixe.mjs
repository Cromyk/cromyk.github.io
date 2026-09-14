/**
 * Confere o encaixe dos 151 no chão do quarto.
 *
 * src/modelos.ts monta cada bicho numa pilha de três nós — giro, deslocamento,
 * escala — e a ordem dessa pilha é fácil de errar de um jeito que nenhum teste
 * de lógica pega: o Pokémon simplesmente nasce enterrado no carpete, ou
 * flutuando, ou dois metros ao lado de onde a bola caiu.
 *
 * Então aqui a conta é refeita por fora: decodifica a malha de verdade, aplica
 * exatamente a mesma sequência de transformações e mede onde o bicho foi parar.
 * O que se espera de todos, sem exceção:
 *
 *   pé no zero, centro em x=0 e z=0, e a altura que a espécie pediu.
 *
 *   node tools/encaixe.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { girarPonto } from './orientacao.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELOS = join(RAIZ, 'public', 'pokemon');
const manifesto = JSON.parse(readFileSync(join(MODELOS, 'manifesto.json'), 'utf8'));

/** A mesma curva de src/species.ts. Duplicada de propósito: se ela mudar lá e
 *  não aqui, a divergência aparece como erro, que é o que se quer de um teste. */
const alturaNaSala = (alturaReal) => Math.min(1.1, Math.max(0.24, 0.4 * Math.pow(alturaReal, 0.45)));

const fonte = readFileSync(join(RAIZ, 'src', 'pokedex.gen.ts'), 'utf8');
const i = fonte.indexOf('export const POKEDEX');
const dex = JSON.parse(fonte.slice(fonte.indexOf('= [', i) + 2, fonte.lastIndexOf(']') + 1));
const alturaDe = new Map(dex.map((e) => [e.id, alturaNaSala(e.alturaReal)]));

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

const mult = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

const multMat = (a, b) => {
  const r = new Array(16).fill(0);
  for (let k4 = 0; k4 < 4; k4++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) r[k4 * 4 + j] += a[k * 4 + j] * b[k4 * 4 + k];
  return r;
};

/** Caixa da malha bruta, com as transformações dos nós do próprio arquivo. */
function caixaBruta(doc) {
  const raiz = doc.getRoot();
  const cena = raiz.getDefaultScene() ?? raiz.listScenes()[0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const identidade = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const andar = (no, pai) => {
    const mundo = multMat(pai, no.getMatrix());
    const malha = no.getMesh();
    if (malha) {
      for (const prim of malha.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const v = [0, 0, 0];
        for (let k = 0; k < pos.getCount(); k++) {
          pos.getElement(k, v);
          const p = mult(mundo, v);
          for (let e = 0; e < 3; e++) {
            if (p[e] < min[e]) min[e] = p[e];
            if (p[e] > max[e]) max[e] = p[e];
          }
        }
      }
    }
    for (const filho of no.listChildren()) andar(filho, mundo);
  };

  for (const no of cena.listChildren()) andar(no, identidade);
  return { min, max };
}

let falhas = 0;
const reclamar = (msg) => {
  console.error('  FALHOU:', msg);
  falhas++;
};

const especies = Object.entries(manifesto.especies).sort((a, b) => a[1].num - b[1].num);
let piorAltura = 0;
let piorCentro = 0;
let piorPe = 0;
let nomePiorAltura = '';

console.log(`conferindo o encaixe de ${especies.length} modelos…\n`);

for (const [id, m] of especies) {
  const arquivo = join(MODELOS, `${m.num}.glb`);
  if (!existsSync(arquivo)) {
    reclamar(`${id}: arquivo ausente`);
    continue;
  }
  const alturaAlvo = alturaDe.get(id);
  if (!alturaAlvo) {
    reclamar(`${id}: sem altura na Pokédex`);
    continue;
  }

  let bruta;
  try {
    bruta = caixaBruta(await io.read(arquivo));
  } catch (erro) {
    reclamar(`${id}: não decodificou (${erro.message})`);
    continue;
  }

  // A mesma pilha de src/modelos.ts: giro, depois −centro, depois escala.
  const maiorHorizontal = Math.max(m.largura, m.profundidade);
  const referencia = Math.max(m.alturaModelo, maiorHorizontal / 2, 1e-6);
  const escala = alturaAlvo / referencia;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let c = 0; c < 8; c++) {
    const canto = girarPonto(
      [c & 1 ? bruta.max[0] : bruta.min[0], c & 2 ? bruta.max[1] : bruta.min[1], c & 4 ? bruta.max[2] : bruta.min[2]],
      m.giroX,
      m.giroY,
    );
    const final = [
      (canto[0] - m.centroX) * escala,
      (canto[1] - m.baseY) * escala,
      (canto[2] - m.centroZ) * escala,
    ];
    for (let e = 0; e < 3; e++) {
      if (final[e] < min[e]) min[e] = final[e];
      if (final[e] > max[e]) max[e] = final[e];
    }
  }

  const altura = max[1] - min[1];
  const pe = Math.abs(min[1]);
  const centro = Math.max(Math.abs((min[0] + max[0]) / 2), Math.abs((min[2] + max[2]) / 2));

  // Um milímetro de folga: a caixa é medida por amostragem de vértices e a
  // conta passa por um cosseno de 90°, que não dá zero exato em ponto flutuante.
  if (pe > 0.002) reclamar(`${id}: pé a ${(pe * 100).toFixed(1)}cm do chão`);
  if (centro > 0.002) reclamar(`${id}: desalinhado ${(centro * 100).toFixed(1)}cm do centro`);
  // A altura final pode ser MENOR que a pedida (bicho comprido encolhe para
  // caber), mas nunca maior.
  if (altura > alturaAlvo + 0.002) {
    reclamar(`${id}: ${altura.toFixed(3)}m, mais alto que os ${alturaAlvo.toFixed(3)}m pedidos`);
  }

  if (alturaAlvo - altura > piorAltura) {
    piorAltura = alturaAlvo - altura;
    nomePiorAltura = id;
  }
  piorCentro = Math.max(piorCentro, centro);
  piorPe = Math.max(piorPe, pe);
}

console.log(`pé fora do chão, no pior caso:  ${(piorPe * 1000).toFixed(2)} mm`);
console.log(`desvio do centro, no pior caso: ${(piorCentro * 1000).toFixed(2)} mm`);
console.log(
  `quem mais encolheu para caber:  ${nomePiorAltura} (${(piorAltura * 100).toFixed(0)} cm abaixo do pedido)`,
);
console.log(falhas === 0 ? '\nTODOS ENCAIXAM' : `\n${falhas} PROBLEMAS DE ENCAIXE`);
process.exit(falhas === 0 ? 0 : 1);
