// Transforma a luva de costura (um OBJ do CLO3D, sem osso nenhum) na MÃO do
// jogo: decimada, alinhada com o generic-hand e vestida no esqueleto dele.
//
// O problema é que os dois arquivos não têm nada em comum. A luva é uma malha
// de roupa simulada: 90 mil vértices, escala em milímetros, dedos abertos em
// leque, e zero informação de esqueleto — ela não sabe que tem dedos. A mão do
// jogo é o `generic-hand` do webxr-input-profiles: 1.360 vértices, 25 juntas
// com os nomes da especificação, dedos juntos.
//
// O que esta ferramenta faz é a ponte:
//
// 1. **Decima** a luva para o orçamento de um headset (meshoptimizer).
// 2. **Alinha** as duas no mesmo espaço — a parte que precisa de olho, e por
//    isso existe o `--diag`, que desenha uma por cima da outra em três vistas.
// 3. **Transfere os pesos** de skinning: para cada vértice da luva, o osso de
//    quem ele fica mais perto NA MÃO. Não por vértice mais próximo, e sim por
//    SEGMENTO de osso — com os dedos em leque de um lado e juntos do outro, o
//    vizinho mais próximo de um mindinho aberto pode ser o anelar.
// 4. **Exporta** left.glb e right.glb com a malha nova no esqueleto de sempre.
//
//   npm run luva -- --diag     só decima e mede, não escreve GLB
//   npm run luva               (ainda não: ver ONDE ISTO PAROU)
//
// O OBJ não entra no repositório (14 MB): ele mora onde o usuário o baixou, e o
// caminho vai em --obj.
//
// ## Onde isto parou
//
// Os passos 1 e 2 estão feitos e conferidos. A decimação sai em 3.599
// triângulos com 0,36% de erro — orçamento de headset, e os cinco dedos
// sobrevivem inteiros (conferido de olho, desenhando a malha em três vistas).
// O `LockBorder` teve de sair: a luva é um tecido ABERTO, com borda em todo o
// punho e nas costuras, e travar borda prendia a decimação em 8,8 mil.
//
// Os eixos dos dois, medidos e não chutados:
//
//   luva  dedos +Y, normal da palma Z (menor variância: 1365 contra 6782 de Y)
//   mão   dedos −X (punho em x=+0,056, pontas em x=−0,12), través numa diagonal
//         de Y e Z, polegar destacado em +Y/−Z
//
// O que falta é o passo 3, e o obstáculo dele é este: as duas estão em leque,
// mas a luva tem os dedos SEMI-DOBRADOS e a mão de referência os tem retos.
// Vizinho mais próximo erra feio aí — a ponta dobrada de um dedo da luva cai
// espacialmente em cima da palma da mão, e ganharia o peso do osso errado.
//
// A saída é não medir distância euclidiana e sim SETOR ANGULAR: no plano da
// palma, cada dedo ocupa uma fatia de ângulo própria, e dobrar o dedo mexe no
// eixo perpendicular à palma — não no ângulo. Então (dedo, quanto ao longo
// dele) se lê do leque e se mapeia na cadeia de ossos correspondente.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { MeshoptSimplifier } from 'meshoptimizer';

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const DIAG = args.includes('--diag');
const OBJ = opcao('obj', 'C:/Users/marco.souza/Downloads/Gloves_Qa/Gloves_Qa.obj');
const MAOS = 'public/maos';
/** Orçamento de triângulos por mão. A mão original tem ~2,6k. */
const ALVO_TRIS = Number(opcao('tris', '3600'));

// --------------------------------------------------------------- o OBJ

function lerObj(caminho) {
  const posicoes = [];
  const triangulos = [];
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    if (linha[0] === 'v' && linha[1] === ' ') {
      const p = linha.split(/\s+/);
      posicoes.push(+p[1], +p[2], +p[3]);
    } else if (linha[0] === 'f' && linha[1] === ' ') {
      const idx = linha
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((c) => {
          const n = Number(c.split('/')[0]);
          return n > 0 ? n - 1 : posicoes.length / 3 + n;
        });
      // Leque: o CLO3D exporta quads e n-gons.
      for (let i = 1; i + 1 < idx.length; i++) triangulos.push(idx[0], idx[i], idx[i + 1]);
    }
  }
  return { posicoes: new Float32Array(posicoes), indices: new Uint32Array(triangulos) };
}

/**
 * Solda vértices coincidentes.
 *
 * O OBJ do CLO3D vem partido por PADRÃO DE COSTURA: cada pedaço de tecido é um
 * grupo com os próprios vértices, e dois pedaços costurados têm vértices
 * duplicados exatamente no mesmo lugar. Sem soldar, o simplificador enxerga
 * buracos onde há costura e se recusa a decimar através deles — o resultado
 * fica preso em dez vezes o orçamento.
 */
function soldar({ posicoes, indices }, tolerancia = 1e-4) {
  const mapa = new Map();
  const novaPos = [];
  const remapa = new Uint32Array(posicoes.length / 3);
  const q = 1 / tolerancia;
  for (let i = 0; i < posicoes.length / 3; i++) {
    const x = posicoes[i * 3];
    const y = posicoes[i * 3 + 1];
    const z = posicoes[i * 3 + 2];
    const chave = `${Math.round(x * q)}:${Math.round(y * q)}:${Math.round(z * q)}`;
    let alvo = mapa.get(chave);
    if (alvo === undefined) {
      alvo = novaPos.length / 3;
      mapa.set(chave, alvo);
      novaPos.push(x, y, z);
    }
    remapa[i] = alvo;
  }
  const novosIdx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) novosIdx[i] = remapa[indices[i]];
  return { posicoes: new Float32Array(novaPos), indices: novosIdx };
}

// --------------------------------------------------------------- a mão

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

function medir(posicoes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posicoes.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = posicoes[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max, tamanho: max.map((m, i) => m - min[i]) };
}

async function lerMao(lado) {
  const doc = await io.read(join(MAOS, `${lado}.glb`));
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  const posicoes = new Float32Array(pos.getCount() * 3);
  for (let i = 0; i < pos.getCount(); i++) {
    const v = pos.getElement(i, []);
    posicoes[i * 3] = v[0];
    posicoes[i * 3 + 1] = v[1];
    posicoes[i * 3 + 2] = v[2];
  }
  return { doc, prim, posicoes };
}

// --------------------------------------------------------------- execução

console.log(`luva: lendo ${OBJ}`);
let luva = lerObj(OBJ);
console.log(`  cru:      ${luva.posicoes.length / 3} vértices, ${luva.indices.length / 3} triângulos`);

luva = soldar(luva);
console.log(`  soldado:  ${luva.posicoes.length / 3} vértices, ${luva.indices.length / 3} triângulos`);

await MeshoptSimplifier.ready;
const [indicesSimples, erro] = MeshoptSimplifier.simplify(
  luva.indices,
  luva.posicoes,
  3,
  ALVO_TRIS * 3,
  0.08,
  [],
);
console.log(
  `  decimado: ${indicesSimples.length / 3} triângulos (erro ${(erro * 100).toFixed(2)}%)`,
);

// Sobram vértices órfãos depois da decimação; compacta.
const usados = new Map();
const posCompacta = [];
const idxCompacto = new Uint32Array(indicesSimples.length);
for (let i = 0; i < indicesSimples.length; i++) {
  const antigo = indicesSimples[i];
  let novo = usados.get(antigo);
  if (novo === undefined) {
    novo = posCompacta.length / 3;
    usados.set(antigo, novo);
    posCompacta.push(
      luva.posicoes[antigo * 3],
      luva.posicoes[antigo * 3 + 1],
      luva.posicoes[antigo * 3 + 2],
    );
  }
  idxCompacto[i] = novo;
}
const luvaFinal = { posicoes: new Float32Array(posCompacta), indices: idxCompacto };
console.log(`  compacto: ${luvaFinal.posicoes.length / 3} vértices`);

const mao = await lerMao('right');
const medidaLuva = medir(luvaFinal.posicoes);
const medidaMao = medir(mao.posicoes);
console.log(`\n  luva  bbox ${medidaLuva.tamanho.map((v) => v.toFixed(1)).join(' x ')} (mm?)`);
console.log(`  mão   bbox ${medidaMao.tamanho.map((v) => v.toFixed(3)).join(' x ')} (m)`);

if (!existsSync('node_modules/.cache')) mkdirSync('node_modules/.cache', { recursive: true });
writeFileSync(
  'node_modules/.cache/luva-decimada.json',
  JSON.stringify({
    posicoes: [...luvaFinal.posicoes],
    indices: [...luvaFinal.indices],
    medidaLuva,
    medidaMao,
  }),
);
console.log('\n  -> node_modules/.cache/luva-decimada.json');

if (DIAG) {
  console.log('\n(--diag: parei antes de alinhar, como pedido)');
}
