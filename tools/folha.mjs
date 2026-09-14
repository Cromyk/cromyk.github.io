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

/** Cor estável a partir do nome do material, para as partes se separarem. */
function corDoNome(nome) {
  let h = 2166136261;
  for (let i = 0; i < nome.length; i++) h = Math.imul(h ^ nome.charCodeAt(i), 16777619);
  const matiz = ((h >>> 0) % 360) / 360;
  // HSL -> RGB com saturação baixa: é para ler forma, não para julgar cor.
  const f = (n) => {
    const k = (n + matiz * 12) % 12;
    return 0.62 - 0.26 * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0), f(8), f(4)];
}

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

const LUZ = (() => {
  const v = [0.45, 0.8, 0.55];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

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
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tris)
    for (const p of [t.a, t.b, t.c])
      for (let e = 0; e < 3; e++) {
        if (p[e] < mn[e]) mn[e] = p[e];
        if (p[e] > mx[e]) mx[e] = p[e];
      }
  if (!isFinite(mn[0])) continue;
  const centro = { x: (mn[0] + mx[0]) / 2, y: (mn[1] + mx[1]) / 2, z: (mn[2] + mx[2]) / 2 };
  const tamanho = { largura: mx[0] - mn[0], alturaModelo: mx[1] - mn[1], profundidade: mx[2] - mn[2] };

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

  const zbuf = new Float32Array(CELULA * CELULA).fill(Infinity);

  for (const tri of tris) {
    // Normal geométrica no espaço do modelo.
    const u = [tri.b[0] - tri.a[0], tri.b[1] - tri.a[1], tri.b[2] - tri.a[2]];
    const w = [tri.c[0] - tri.a[0], tri.c[1] - tri.a[1], tri.c[2] - tri.a[2]];
    const nx = u[1] * w[2] - u[2] * w[1];
    const ny = u[2] * w[0] - u[0] * w[2];
    const nz = u[0] * w[1] - u[1] * w[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    const normal = [nx / nl, ny / nl, nz / nl];

    const p0 = naTela(tri.a);
    const p1 = naTela(tri.b);
    const p2 = naTela(tri.c);

    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (area === 0) continue;

    // Sem culling: alguns rips têm a orientação das faces trocada, e um bicho
    // com metade do corpo faltando na conferência engana mais do que ajuda.
    const difusa = Math.abs(normal[0] * LUZ[0] + normal[1] * LUZ[1] + normal[2] * LUZ[2]);
    const luz = 0.34 + difusa * 0.82;

    const minX = Math.max(ox, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(ox + CELULA - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const minY = Math.max(oy, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxY = Math.min(oy + CELULA - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((p1[0] - p0[0]) * (py - p0[1]) - (px - p0[0]) * (p1[1] - p0[1])) / area;
        const w1 = ((p2[0] - p1[0]) * (py - p1[1]) - (px - p1[0]) * (p2[1] - p1[1])) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        const z = p0[2] * w1 + p1[2] * w2 + p2[2] * w0;
        const cel = (y - oy) * CELULA + (x - ox);
        if (z >= zbuf[cel]) continue;
        zbuf[cel] = z;

        const i = (y * L + x) * 4;
        rgba[i] = Math.min(255, tri.cor[0] * 255 * luz);
        rgba[i + 1] = Math.min(255, tri.cor[1] * 255 * luz);
        rgba[i + 2] = Math.min(255, tri.cor[2] * 255 * luz);
      }
    }
  }

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
