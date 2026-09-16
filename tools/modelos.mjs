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
import { primitivasEmRepouso } from './pose.mjs';

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
 * Caixa envolvente do modelo na pose de repouso, com o skinning aplicado.
 *
 * Aplicar o skinning não é preciosismo: a pose que o arquivo guarda nos nós e a
 * pose que o esqueleto impõe são coisas diferentes, e é a segunda que o headset
 * desenha. Medir pela primeira dava 85 unidades de altura para um Bulbasaur que
 * tem 0,78 — daí ele nascer no quarto do tamanho de um grão de feijão.
 */
function medir(documento) {
  const primitivas = primitivasEmRepouso(documento);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  // Os olhos são a bússola do modelo: num arquivo que segue a convenção do
  // three.js (de pé em Y, olhando para +Z) o centroide deles cai à frente do
  // centro do corpo. É assim que se descobre um rip que veio de costas sem pôr
  // o headset 151 vezes.
  let rostoSoma = [0, 0, 0];
  let rostoN = 0;
  let massaSoma = [0, 0, 0];
  let totalVertices = 0;

  for (const { material, pontos, contagem } of primitivas) {
    const nome = (material?.getName() ?? '').toLowerCase();
    const ehRosto = /eye|iris|olho|pupil/.test(nome);
    totalVertices += contagem;
    for (let i = 0; i < contagem; i++) {
      const x = pontos[i * 3];
      const y = pontos[i * 3 + 1];
      const z = pontos[i * 3 + 2];
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
      massaSoma[0] += x;
      massaSoma[1] += y;
      massaSoma[2] += z;
      if (ehRosto) {
        rostoSoma[0] += x;
        rostoSoma[1] += y;
        rostoSoma[2] += z;
        rostoN++;
      }
    }
  }

  if (!isFinite(min[0])) return null;

  const tamanho = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const centro = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

  // Posições relativas, em fração do tamanho de cada eixo, para a heurística de
  // orientação comparar modelos de escalas completamente diferentes.
  let rosto = null;
  if (rostoN > 0) {
    rosto = [0, 1, 2].map((e) =>
      +((rostoSoma[e] / rostoN - centro[e]) / Math.max(tamanho[e], 1e-6)).toFixed(4),
    );
  }

  const massa = [0, 1, 2].map((e) =>
    +((massaSoma[e] / Math.max(totalVertices, 1) - centro[e]) / Math.max(tamanho[e], 1e-6)).toFixed(4),
  );

  const raizDoc = documento.getRoot();
  return {
    min,
    max,
    tamanho,
    centro,
    rosto,
    massa,
    vertices: totalVertices,
    animacoes: raizDoc.listAnimations().map((a) => a.getName()),
    temEsqueleto: raizDoc.listSkins().length > 0,
  };
}

// --------------------------------------------------------------- orientação

/**
 * Endireita o arquivo. A convenção do jogo é a do three.js: de pé no eixo Y,
 * olhando para +Z. A maioria dos rips já vem assim.
 *
 * A pista é o centroide dos olhos em relação ao centro do corpo, medido DEPOIS
 * do skinning — antes dele a conta mentia, e foi mentindo que Charmander,
 * Charmeleon e Pikachu ganharam giros na mão que os deixavam deitados e de
 * cabeça para baixo dentro do jogo. Hoje a tabela AJUSTES está vazia, e é um
 * bom sinal: o que sobrar aqui é exceção de verdade, conferida em
 * folha-vistas.png.
 */
/**
 * Correções na mão, para o que a heurística não resolve. Cada entrada precisa
 * ter sido conferida de olho em `npm run render --vistas` (ou `--candidatos`),
 * e a folha desenha com o mesmo skinning que o headset — se ela e o jogo
 * discordarem, é bug de pipeline, não caso para ajuste manual.
 */
const AJUSTES = {
  // Gastly veio de costas e a heurística não tinha como ver: os materiais do
  // rip se chamam "PaletteMaterial001".."006", então o teste por nome não acha
  // olho nenhum e a função desiste com `rosto: null`. Medindo a cor de cada
  // primitiva na textura, o rosto aparece: a primitiva branca (os olhos) tem
  // centroide em z = −0,19 e a rosa (a língua) em z = −0,52, as duas atrás do
  // centro. É exatamente o caso que a regra dos olhos chamaria de "costas".
  gastly: { giroY: Math.PI },
};

function orientar(id, rosto) {
  if (AJUSTES[id]) return { giroX: 0, giroY: 0, ...AJUSTES[id], fonte: 'mão' };
  if (!rosto) return { giroX: 0, giroY: 0, fonte: 'padrão' };

  // O olho fica na frente da cabeça e a cabeça na frente do corpo: num modelo
  // que segue a convenção, o centroide dos olhos cai em Z positivo.
  //
  // (A altura dos olhos não serve de pista: num bicho baixo e comprido, tipo
  // Bulbasaur, eles ficam na altura do meio do corpo mesmo estando de pé.)
  if (rosto[2] > 0.05) return { giroX: 0, giroY: 0, fonte: 'olhos' };

  // Olhos claramente atrás do centro: o bicho veio de costas. Meia volta em Y
  // resolve, e não mexe no eixo vertical — que é o que separa este caso de um
  // modelo deitado.
  if (rosto[2] < -0.05) return { giroX: 0, giroY: Math.PI, fonte: 'costas' };

  // Olhos em cima da linha do centro: não dá para decidir pela conta. Fica sem
  // giro e marcado, para aparecer no resumo e ser conferido na folha.
  return { giroX: 0, giroY: 0, fonte: 'suspeito' };
}

// --------------------------------------------------------------- execução

const entradas = {};
const antigo = existsSync(MANIFESTO) ? JSON.parse(readFileSync(MANIFESTO, 'utf8')) : { especies: {} };
// Sobe quando o formato do manifesto ou a regra de orientação muda: aí tudo é
// medido de novo, sem precisar rebaixar os 54 MB de modelo.
const VERSAO = 7;
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
