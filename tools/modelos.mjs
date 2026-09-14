/**
 * Baixa os modelos 3D de verdade e mede cada um.
 *
 * Fonte: Pokemon-3D-api/assets — GLB com Draco e texturas WebP, um arquivo por
 * número da Pokédex. São modelos rippados dos jogos, então vêm em escalas e
 * orientações completamente diferentes entre si: um Onix vem com 300 unidades
 * de altura e um Diglett com 0,4, e nem todos olham para o mesmo lado.
 *
 * Por isso este script não só baixa: ele decodifica a malha aqui no Node
 * (draco3d + gltf-transform), mede a caixa envolvente e grava um manifesto com
 * o que o jogo precisa para plantar o bicho no chão do seu quarto no tamanho
 * certo. Medir aqui é de graça; medir no headset custaria quadro.
 *
 *   node tools/modelos.mjs            # só o que falta
 *   node tools/modelos.mjs --forcar   # baixa tudo de novo
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { caixaGirada } from './orientacao.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'public', 'pokemon');
const MANIFESTO = join(DESTINO, 'manifesto.json');
const BASE =
  'https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt';

const forcar = process.argv.includes('--forcar');

mkdirSync(DESTINO, { recursive: true });

// --------------------------------------------------------------- quem baixar

const { POKEDEX } = await import('../src/pokedex.gen.ts').catch(() => ({ POKEDEX: null }));
const dex =
  POKEDEX ??
  JSON.parse(
    // O .ts não é importável direto por todo runtime; caímos no parse do literal.
    (() => {
      const fonte = readFileSync(join(RAIZ, 'src', 'pokedex.gen.ts'), 'utf8');
      const i = fonte.indexOf('export const POKEDEX');
      return fonte.slice(fonte.indexOf('= [', i) + 2, fonte.lastIndexOf(']') + 1);
    })(),
  );

/**
 * Quais números têm modelo shiny, descoberto pela árvore do git do repositório
 * de modelos.
 *
 * Em CI essa chamada pode bater no limite da API do GitHub sem token, e não é
 * motivo para a publicação falhar: o manifesto já gravado sabe a resposta da
 * última vez, e ela só muda quando o repositório de modelos ganha shiny novo.
 */
async function idsComShiny() {
  const cache = join(RAIZ, '.cache', 'arvore-modelos.json');
  mkdirSync(dirname(cache), { recursive: true });
  let arvore;
  if (existsSync(cache)) {
    arvore = JSON.parse(readFileSync(cache, 'utf8'));
  } else {
    try {
      const r = await fetch(
        'https://api.github.com/repos/Pokemon-3D-api/assets/git/trees/main?recursive=1',
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      arvore = await r.json();
      writeFileSync(cache, JSON.stringify(arvore));
    } catch (erro) {
      console.warn(`shiny: árvore indisponível (${erro.message}); usando o manifesto`);
      const anterior = existsSync(MANIFESTO)
        ? JSON.parse(readFileSync(MANIFESTO, 'utf8')).especies ?? {}
        : {};
      return new Set(
        Object.values(anterior)
          .filter((e) => e.temShiny)
          .map((e) => e.num),
      );
    }
  }
  const set = new Set();
  for (const e of arvore.tree ?? []) {
    const m = e.path.match(/^models\/opt\/shiny\/(\d+)\.glb$/);
    if (m) set.add(+m[1]);
  }
  return set;
}

const comShiny = await idsComShiny();

// --------------------------------------------------------------- download

async function baixar(url, destino) {
  if (!forcar && existsSync(destino) && statSync(destino).size > 1024) return false;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  return true;
}

// --------------------------------------------------------------- medição

// Os arquivos vêm de rips diferentes e cada um usa um punhado de extensões
// (Draco, WebP, texture_transform, unlit, specular). Registramos todas menos a
// do Meshopt, que exigiria mais uma dependência nativa e ninguém usa aqui.
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

/**
 * Caixa envolvente do modelo na pose de repouso, já com as transformações dos
 * nós aplicadas. Ignoramos o skinning: a pose de bind é o bastante para saber
 * que tamanho o bicho tem.
 */
function medir(documento) {
  const raiz = documento.getRoot();
  const cena = raiz.getDefaultScene() ?? raiz.listScenes()[0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  // Os olhos são a bússola do modelo. O centroide deles diz onde está a cabeça
  // (logo, para que lado é "cima"); a normal média deles diz para onde o bicho
  // olha (logo, onde é "frente"). Com os dois dá para endireitar um rip que
  // veio deitado sem precisar pôr o headset para descobrir.
  let rostoSoma = [0, 0, 0];
  let rostoN = 0;
  let massaSoma = [0, 0, 0];
  let totalVertices = 0;

  const multiplicar = (m, p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];

  const multiplicarMat = (a, b) => {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++) r[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k];
    return r;
  };

  const andar = (no, pai) => {
    const local = no.getMatrix();
    const mundo = multiplicarMat(pai, local);
    const malha = no.getMesh();
    if (malha) {
      for (const prim of malha.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const material = prim.getMaterial();
        const nome = (material?.getName() ?? '').toLowerCase();
        const ehRosto = /eye|iris|olho|face|pupil|rosto/.test(nome);
        const n = pos.getCount();
        totalVertices += n;
        const v = [0, 0, 0];
        const mundoDe = (i) => {
          pos.getElement(i, v);
          return multiplicar(mundo, v);
        };

        for (let i = 0; i < n; i++) {
          const p = mundoDe(i);
          for (let e = 0; e < 3; e++) {
            if (p[e] < min[e]) min[e] = p[e];
            if (p[e] > max[e]) max[e] = p[e];
          }
          massaSoma[0] += p[0];
          massaSoma[1] += p[1];
          massaSoma[2] += p[2];
          if (ehRosto) {
            rostoSoma[0] += p[0];
            rostoSoma[1] += p[1];
            rostoSoma[2] += p[2];
            rostoN++;
          }
        }

      }
    }
    for (const filho of no.listChildren()) andar(filho, mundo);
  };

  const identidade = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const no of cena.listChildren()) andar(no, identidade);

  if (!isFinite(min[0])) return null;

  const tamanho = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const centro = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

  // Onde ficam os olhos em relação ao centro do corpo, em fração do tamanho de
  // cada eixo. Num modelo em pé (Y para cima) isso dá Y bem positivo; num que
  // veio deitado, dá Z dominante — e é assim que descobrimos qual é o "cima"
  // de cada arquivo sem abrir nenhum deles à mão.
  let rosto = null;
  if (rostoN > 0) {
    rosto = [0, 1, 2].map((e) =>
      +((rostoSoma[e] / rostoN - centro[e]) / Math.max(tamanho[e], 1e-6)).toFixed(4),
    );
  }

  const massa = [0, 1, 2].map((e) =>
    +((massaSoma[e] / Math.max(totalVertices, 1) - centro[e]) / Math.max(tamanho[e], 1e-6)).toFixed(4),
  );

  return {
    min,
    max,
    tamanho,
    centro,
    rosto,
    massa,
    vertices: totalVertices,
    animacoes: raiz.listAnimations().map((a) => a.getName()),
    temEsqueleto: raiz.listSkins().length > 0,
  };
}

// --------------------------------------------------------------- orientação

/**
 * Endireita o arquivo. A convenção do jogo é a do three.js: de pé no eixo Y,
 * olhando para +Z. A maioria dos rips já vem assim, mas uma parte foi exportada
 * com Z para cima (o padrão do Blender e do 3ds Max) e chega deitada.
 *
 * A pista automática é onde estão os olhos em relação ao centro do corpo: se
 * eles estão bem acima, o modelo está em pé; se estão lá na frente no eixo Z e
 * na mesma altura do centro, o bicho está deitado de bruços.
 *
 * O que o palpite erra fica em AJUSTES, conferido de olho em folha-vistas.png.
 */
const QUARTO = Math.PI / 2;

/**
 * Correções na mão, descobertas olhando folha-vistas.png dos 151.
 *
 * Só estes três destoam: vieram exportados com Z para cima (o padrão do Blender
 * e do 3ds Max), de bruços e com a cabeça apontando para -Z. Girar um quarto de
 * volta em X põe o de-pé no lugar e joga o rosto para +Z de uma vez.
 *
 * Curiosidade útil: Charizard, que é da mesma linha, veio certo — não dá para
 * inferir pela família, tem de olhar.
 */
const AJUSTES = {
  charmander: { giroX: Math.PI / 2 },
  charmeleon: { giroX: Math.PI / 2 },
  // Pikachu é o mais teimoso: veio de cabeça para baixo E de costas, o que
  // meia volta em X resolve de uma vez só. Achado com `--candidatos`.
  pikachu: { giroX: Math.PI },
};

function orientar(id, rosto) {
  if (AJUSTES[id]) return { giroX: 0, giroY: 0, ...AJUSTES[id], fonte: 'mão' };
  if (!rosto) return { giroX: 0, giroY: 0, fonte: 'padrão' };

  // O olho fica na frente da cabeça, e a cabeça na frente do corpo: num modelo
  // que segue a convenção, o centroide dos olhos cai em Z positivo. Só isso.
  //
  // (A altura dos olhos não serve de pista: num bicho baixo e comprido, tipo
  // Bulbasaur, eles ficam na altura do meio do corpo mesmo estando de pé.)
  if (rosto[2] > 0.05) return { giroX: 0, giroY: 0, fonte: 'olhos' };

  // Olhos atrás do centro. Ou o bicho veio de costas, ou veio deitado com a
  // cabeça para trás — a conta não distingue os dois, então marcamos para
  // olhar em folha-vistas.png e resolver na mão, em AJUSTES.
  return { giroX: 0, giroY: 0, fonte: 'suspeito' };
}

// --------------------------------------------------------------- execução

const entradas = {};
const antigo = existsSync(MANIFESTO) ? JSON.parse(readFileSync(MANIFESTO, 'utf8')) : { especies: {} };
// Sobe quando o formato do manifesto ou a regra de orientação muda: aí tudo é
// medido de novo, sem precisar rebaixar os 54 MB de modelo.
const VERSAO = 6;
const reaproveitar = antigo.versao === VERSAO;

let baixados = 0;
let i = 0;

for (const especie of dex) {
  i++;
  const num = especie.num;
  const arquivoNormal = join(DESTINO, `${num}.glb`);
  const arquivoShiny = join(DESTINO, `${num}s.glb`);

  try {
    if (await baixar(`${BASE}/regular/${num}.glb`, arquivoNormal)) baixados++;
  } catch (erro) {
    console.warn(`\n  ! ${especie.nome}: ${erro.message}`);
    continue;
  }

  const temShiny = comShiny.has(num);
  if (temShiny) {
    try {
      if (await baixar(`${BASE}/shiny/${num}.glb`, arquivoShiny)) baixados++;
    } catch {
      /* shiny é bônus: se falhar, o normal basta */
    }
  }

  // Só remede o que mudou — decodificar Draco de 151 modelos não é instantâneo.
  const anterior = antigo.especies?.[especie.id];
  const bytes = statSync(arquivoNormal).size;
  if (!forcar && reaproveitar && anterior && anterior.bytes === bytes) {
    entradas[especie.id] = { ...anterior, temShiny };
    process.stdout.write(`\r  ${i}/${dex.length} ${especie.nome.padEnd(14)}`);
    continue;
  }

  let m = null;
  try {
    m = medir(await io.read(arquivoNormal));
  } catch (erro) {
    console.warn(`\n  ! ${especie.nome}: não deu para medir (${erro.message})`);
  }
  if (!m) {
    console.warn(`\n  ! ${especie.nome}: sem geometria — fica de fora do jogo`);
    continue;
  }

  const giro = orientar(especie.id, m.rosto);
  const caixa = caixaGirada(m.min, m.max, giro.giroX, giro.giroY);

  entradas[especie.id] = {
    num,
    bytes,
    temShiny,
    /** Radianos a aplicar no modelo para ele ficar de pé olhando para +Z. */
    giroX: +giro.giroX.toFixed(6),
    giroY: +giro.giroY.toFixed(6),
    // As medidas abaixo já valem para o modelo DEPOIS de girado — é assim que
    // o jogo as usa, e guardar as duas versões só daria chance de confundir.
    alturaModelo: +caixa.tamanho[1].toFixed(5),
    largura: +caixa.tamanho[0].toFixed(5),
    profundidade: +caixa.tamanho[2].toFixed(5),
    /** Quanto descer para o pé encostar no chão, depois de escalar. */
    baseY: +caixa.min[1].toFixed(5),
    centroX: +caixa.centro[0].toFixed(5),
    centroZ: +caixa.centro[2].toFixed(5),
    /** Onde estão os olhos, em fração do corpo. Só o palpite de orientação usa. */
    rosto: m.rosto,
    orientadoPor: giro.fonte,
    vertices: m.vertices,
    animacoes: m.animacoes,
    temEsqueleto: m.temEsqueleto,
  };

  process.stdout.write(`\r  ${i}/${dex.length} ${especie.nome.padEnd(14)}`);
}

writeFileSync(
  MANIFESTO,
  JSON.stringify(
    { versao: VERSAO, fonte: 'Pokemon-3D-api/assets', gerado: Date.now(), especies: entradas },
    null,
    1,
  ),
);

// O jogo não lê o JSON de public/: aquilo é a pasta de assets servidos, e um
// import de lá não passa pelo bundler. O mesmo conteúdo sai como módulo TS,
// que entra no bundle tipado e sem uma requisição extra no headset.
// Só o que o jogo usa em tempo de execução. bytes, rosto e orientadoPor são
// diagnóstico do pipeline e ficam no JSON — não há por que mandá-los para o
// bundle que o headset baixa.
const paraOJogo = Object.fromEntries(
  Object.entries(entradas).map(([id, e]) => [
    id,
    {
      num: e.num,
      giroX: e.giroX,
      giroY: e.giroY,
      alturaModelo: e.alturaModelo,
      largura: e.largura,
      profundidade: e.profundidade,
      baseY: e.baseY,
      centroX: e.centroX,
      centroZ: e.centroZ,
      temShiny: e.temShiny,
      animacoes: e.animacoes,
      temEsqueleto: e.temEsqueleto,
      vertices: e.vertices,
    },
  ]),
);

writeFileSync(
  join(RAIZ, 'src', 'modelos.gen.ts'),
  `// GERADO por tools/modelos.mjs — não edite à mão.
// Medidas dos GLB em public/pokemon/, já com o giro de endireitamento aplicado.
import type { MedidaModelo } from './modelos';

export const MEDIDAS: Record<string, MedidaModelo> = ${JSON.stringify(paraOJogo, null, 1)};
`,
);

const lista = Object.values(entradas);
console.log(`\n\n${lista.length} modelos. ${baixados} arquivos baixados agora.`);
console.log(`  com esqueleto: ${lista.filter((e) => e.temEsqueleto).length}`);
console.log(`  com animação:  ${lista.filter((e) => e.animacoes.length > 0).length}`);
console.log(`  com shiny:     ${lista.filter((e) => e.temShiny).length}`);
console.log(`  rosto achado:  ${lista.filter((e) => e.rosto).length}`);
const porFonte = {};
for (const e of lista) porFonte[e.orientadoPor] = (porFonte[e.orientadoPor] ?? 0) + 1;
console.log(
  `  orientação:    ${Object.entries(porFonte)
    .map(([k, v]) => `${v} por ${k}`)
    .join(', ')} — ${lista.filter((e) => e.giroX || e.giroY).length} precisaram de giro`,
);
const alturas = lista.map((e) => e.alturaModelo).sort((a, b) => a - b);
console.log(
  `  altura no arquivo: ${alturas[0].toFixed(2)} a ${alturas[alturas.length - 1].toFixed(2)} — por isso normalizamos.`,
);
