/**
 * Folha de contato dos 151 modelos: rasteriza cada GLB de frente, numa grade,
 * e grava folha-pokemon.png.
 *
 * Serve para uma coisa só, mas uma coisa que nenhum teste pega: conferir que o
 * bicho está virado para a frente e de pé. Os modelos vêm de rips diferentes;
 * se um vier de costas, só o olho percebe — e pôr o headset para descobrir
 * isso 151 vezes não é vida.
 *
 * Sem WebGL e sem navegador: decodifica o Draco, projeta ortográfico e
 * rasteriza com z-buffer, do mesmo jeito que tools/render.ts faz com a
 * geometria procedural.
 *
 *   node tools/folha.mjs            # todos
 *   node tools/folha.mjs 1 9 25     # só esses números
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { girarPonto } from './orientacao.mjs';
import { primitivasEmRepouso } from './pose.mjs';
import { caixaDe, corDoNome, desenharCelula } from './raster.mjs';

const require = createRequire(import.meta.url);
const { codificarPng } = require('./png.mjs');

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELOS = join(RAIZ, 'public', 'pokemon');
const manifesto = JSON.parse(readFileSync(join(MODELOS, 'manifesto.json'), 'utf8'));

const CELULA = +(process.env.CELULA ?? 132);
const FUNDO = [22, 27, 38];

/**
 * Com --vistas cada bicho ocupa três células: de frente, de lado e de cima.
 * É o modo de diagnóstico — descobre se um modelo veio deitado ou de perfil,
 * o que a vista de frente sozinha não distingue de um bicho naturalmente fino.
 */
const VISTAS = process.argv.includes('--vistas');

/**
 * Com --candidatos o bicho aparece de frente sob oito giros diferentes. É como
 * se acha o AJUSTE de um modelo teimoso: em vez de adivinhar o eixo, olha-se a
 * cartela e escolhe-se a célula em que ele está de pé encarando a gente.
 */
const CANDIDATOS = process.argv.includes('--candidatos');
const Q = Math.PI / 2;
const GIROS = [
  [0, 0], [0, Math.PI], [0, Q], [0, -Q],
  [Q, 0], [-Q, 0], [Math.PI, Math.PI], [Math.PI, 0],
];
const COLUNAS = +(process.env.COLUNAS ?? (CANDIDATOS ? 4 : VISTAS ? 3 : 12));

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

// ------------------------------------------------------------- geometria

/**
 * Os triângulos da cena, na mesma pose de repouso que o headset desenha.
 *
 * O skinning vem de tools/pose.mjs de propósito: esta folha existe para dizer
 * se um modelo está de pé e de frente, e uma folha que desenhasse a pose crua
 * dos nós responderia sobre um bicho que o jogo não mostra. Foi assim que três
 * ajustes de giro entraram errados.
 */
function triangulosDe(doc) {
  const tris = [];
  for (const { prim, material, pontos, contagem } of primitivasEmRepouso(doc)) {
    const idx = prim.getIndices();
    const nome = material?.getName() ?? 'sem-nome';
    const fator = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
    // Quando o material é branco puro é porque a cor mora na textura (que não
    // decodificamos): aí inventamos um tom só para separar as peças.
    const branco = fator[0] > 0.95 && fator[1] > 0.95 && fator[2] > 0.95;
    const cor = branco ? corDoNome(nome) : [fator[0], fator[1], fator[2]];
    if ((fator[3] ?? 1) < 0.3) continue;

    const n = idx ? idx.getCount() : contagem;
    const ler = (i) => {
      const k = (idx ? idx.getScalar(i) : i) * 3;
      return [pontos[k], pontos[k + 1], pontos[k + 2]];
    };
    for (let i = 0; i + 2 < n; i += 3) tris.push({ a: ler(i), b: ler(i + 1), c: ler(i + 2), cor });
  }
  return tris;
}

// ------------------------------------------------------------- desenho

const alvos = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const especies = Object.entries(manifesto.especies)
  .map(([id, e]) => ({ id, ...e }))
  .filter((e) => (alvos.length ? alvos.includes(e.num) : true))
  .sort((a, b) => a.num - b.num);

/**
 * Como cada vista projeta o ponto do modelo: (u, v) na tela e d para o
 * z-buffer, tudo ainda em unidades do modelo. A escala vem depois.
 */
const PROJECOES = {
  frente: {
    u: (p, c) => p[0] - c.x,
    v: (p, c) => p[1] - c.y,
    d: (p, c) => -(p[2] - c.z),
    extU: (e) => e.largura,
    extV: (e) => e.alturaModelo,
    baixoPositivo: false,
  },
  lado: {
    u: (p, c) => -(p[2] - c.z),
    v: (p, c) => p[1] - c.y,
    d: (p, c) => -(p[0] - c.x),
    extU: (e) => e.profundidade,
    extV: (e) => e.alturaModelo,
    baixoPositivo: false,
  },
  // De cima, com a frente do modelo (+Z) apontando para baixo na imagem.
  cima: {
    u: (p, c) => p[0] - c.x,
    v: (p, c) => p[2] - c.z,
    d: (p, c) => -(p[1] - c.y),
    extU: (e) => e.largura,
    extV: (e) => e.profundidade,
    baixoPositivo: true,
  },
};

const celulas = [];
for (const esp of especies) {
  if (CANDIDATOS) for (const g of GIROS) celulas.push({ esp, vista: 'frente', giro: g });
  else if (VISTAS) for (const v of ['frente', 'lado', 'cima']) celulas.push({ esp, vista: v });
  else celulas.push({ esp, vista: 'frente' });
}

const linhas = Math.ceil(celulas.length / COLUNAS);
const L = COLUNAS * CELULA;
const A = linhas * CELULA;
const rgba = new Uint8Array(L * A * 4);
for (let i = 0; i < L * A; i++) {
  const y = Math.floor(i / L);
  // Faixas alternadas por linha da grade: ajudam a contar de dez em dez.
  const faixa = Math.floor(y / CELULA) % 2 ? 6 : 0;
  rgba[i * 4] = FUNDO[0] + faixa;
  rgba[i * 4 + 1] = FUNDO[1] + faixa;
  rgba[i * 4 + 2] = FUNDO[2] + faixa;
  rgba[i * 4 + 3] = 255;
}

// Decodificar é o caro: um modelo serve para as três vistas.
const cacheTris = new Map();

for (let k = 0; k < celulas.length; k++) {
  const { esp, vista, giro } = celulas[k];
  const arquivo = join(MODELOS, `${esp.num}.glb`);
  if (!existsSync(arquivo)) continue;

  if (!cacheTris.has(esp.num)) {
    try {
      cacheTris.set(esp.num, triangulosDe(await io.read(arquivo)));
    } catch (erro) {
      console.warn(`  ! ${esp.id}: ${erro.message}`);
      cacheTris.set(esp.num, []);
    }
  }
  // Os triângulos vêm como estão no arquivo; o giro do manifesto é o que põe o
  // bicho de pé olhando para +Z. A conferência tem de ver o mesmo que o jogo.
  // No modo candidatos o giro vem da cartela; senão, do manifesto.
  const [gx, gy] = giro ?? [esp.giroX, esp.giroY];
  const tris = cacheTris
    .get(esp.num)
    .map((t) =>
      gx || gy
        ? {
            cor: t.cor,
            a: girarPonto(t.a, gx, gy),
            b: girarPonto(t.b, gx, gy),
            c: girarPonto(t.c, gx, gy),
          }
        : t,
    );

  const proj = PROJECOES[vista];

  // Mede a caixa a partir dos triângulos já girados, em vez de reaproveitar a
  // do manifesto: no modo candidatos o giro é outro, e mesmo fora dele isto
  // garante que a conferência não depende de a medida estar certa.
  const caixa = caixaDe(tris);
  if (!caixa) continue;
  const centro = caixa.centro;
  const tamanho = caixa;

  const col = k % COLUNAS;
  const lin = Math.floor(k / COLUNAS);
  const ox = col * CELULA;
  const oy = lin * CELULA;
  const meioX = ox + CELULA / 2;
  const meioY = oy + CELULA / 2;

  const escala =
    (CELULA * 0.86) / Math.max(proj.extU(tamanho), proj.extV(tamanho), 1e-6);
  const sinalV = proj.baixoPositivo ? 1 : -1;
  const naTela = (p) => [
    meioX + proj.u(p, centro) * escala,
    meioY + sinalV * proj.v(p, centro) * escala,
    proj.d(p, centro) * escala,
  ];

  desenharCelula({ rgba, largura: L, ox, oy, celula: CELULA, tris, naTela });

  process.stdout.write(`\r  ${k + 1}/${celulas.length} ${esp.id.padEnd(14)}`);
}

const destino = join(RAIZ, VISTAS ? 'folha-vistas.png' : 'folha-pokemon.png');
writeFileSync(destino, codificarPng(L, A, rgba));
console.log(`\n\n${celulas.length} células em ${COLUNAS} colunas → ${destino}`);
console.log(
  VISTAS
    ? 'Cada linha é um bicho: frente, lado (frente dele apontando para a ESQUERDA) e cima (frente para BAIXO).'
    : 'Ordem: número da Pokédex, da esquerda para a direita, de cima para baixo.',
);
