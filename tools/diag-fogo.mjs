/**
 * Confere o fogo dos Pokémon de fogo, contra os arquivos de verdade.
 *
 * Duas perguntas, e as duas já erraram calado uma vez:
 *
 * 1. **O osso existe?** Sem ele a chama não é criada e nada reclama.
 * 2. **Onde ela vai parar?** O rig nomeia três vértebras de cauda e os rips têm
 *    mais — a do Charmander tem nove. Pendurar no osso mapeado põe a chama no
 *    MEIO do rabo, que foi exatamente o que apareceu no playtest. O jogo desce
 *    pela cadeia até o osso mais distante (ver `pontaDaCadeia` em src/fogo.ts);
 *    esta ferramenta refaz a mesma conta aqui fora e mostra onde ela para.
 *
 * 3. **E quando não há osso?** Ponyta e Magmar não têm esqueleto nenhum, e a
 *    chama deles vai por ÂNCORA — um ponto fixo em fração da altura, medido
 *    por `tools/brasa.mjs` nos vértices que o rip declara como chama. Aqui a
 *    pergunta muda: o ponto cai DENTRO da caixa do bicho? Uma âncora fora dela
 *    é uma chama acesa no vazio ao lado do Pokémon, e isso não se vê em teste
 *    nenhum — só no headset.
 *
 *   node tools/diag-fogo.mjs            # confere a tabela
 *   node tools/diag-fogo.mjs ponyta     # lista os ossos de um modelo
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { multiplicarMat, aplicar, IDENTIDADE } from './pose.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(join(raiz, 'src', 'modelos.gen.ts'), 'utf8');
const MEDIDAS = JSON.parse(fonte.slice(fonte.indexOf('{', fonte.indexOf('MEDIDAS')), fonte.lastIndexOf('}') + 1));

// Os mesmos candidatos de src/rig.ts. Duplicados aqui porque este arquivo roda
// no Node sem passar pelo bundler; divergir deles daria um diagnóstico que
// concorda consigo mesmo e discorda do jogo.
const CANDIDATOS = {
  cauda1: ['tail1', 'tail'], cauda2: ['tail2'], cauda3: ['tail3'],
  pescoco: ['neck1', 'neck'], cabeca: ['head1', 'head'],
};
const normalizar = (n) =>
  n.slice(n.lastIndexOf('|') + 1).replace(/_\d+$/, '').replace(/[\s.:-]/g, '').toLowerCase();

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

/** Nós da cena com a matriz de mundo já resolvida. */
async function arvoreDe(id) {
  const m = MEDIDAS[id];
  if (!m) return null;
  const doc = await io.read(join(raiz, 'public', 'pokemon', `${m.num}.glb`));
  const cena = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const mundo = new Map();
  const anotar = (no, pai) => {
    const matriz = multiplicarMat(pai, no.getMatrix());
    mundo.set(no, matriz);
    for (const filho of no.listChildren()) anotar(filho, matriz);
  };
  for (const no of cena.listChildren()) anotar(no, IDENTIDADE);
  return mundo;
}

const pedidos = process.argv.slice(2);
if (pedidos.length) {
  for (const id of pedidos) {
    const mundo = await arvoreDe(id);
    const nomes = mundo ? [...mundo.keys()].map((n) => normalizar(n.getName() ?? '')) : null;
    console.log(`\n${id}: ${nomes ? [...new Set(nomes)].sort().join(' ') : 'SEM MODELO'}`);
  }
  process.exit(0);
}

// A tabela do jogo, lida do próprio fonte para não haver duas listas.
const fogo = readFileSync(join(raiz, 'src', 'fogo.ts'), 'utf8');
const bloco = fogo.slice(fogo.indexOf('FOGO_POR_ESPECIE'), fogo.indexOf('export const temFogo'));
// Cada entrada vai do próprio nome até o começo da seguinte. Casar o colchete
// de fecho seria mais direto e é justamente o que não funciona: metade das
// entradas cabe numa linha e a outra metade não.
const marcas = [...bloco.matchAll(/^ {2}(\w+):\s*\[/gm)];
const entradas = marcas.map((m, i) => [m[1], bloco.slice(m.index, marcas[i + 1]?.index ?? bloco.length)]);
if (entradas.length === 0) {
  console.error('nenhuma espécie lida de src/fogo.ts — o formato da tabela mudou');
  process.exit(1);
}

let faltou = 0;
for (const [id, corpo] of entradas) {
  const grupos = [...corpo.matchAll(/ossos:\s*\[([^\]]*)\]/g)].map((m) =>
    m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean),
  );
  const ancoras = [...corpo.matchAll(/ancora:\s*\[([^\]]*)\]/g)].map((m) =>
    m[1].split(',').map((n) => Number(n.trim())),
  );
  const naPonta = /ponta:\s*true/.test(corpo);
  const mundo = await arvoreDe(id);
  if (!mundo) {
    console.log(`FALTA ${id}: sem modelo`);
    faltou++;
    continue;
  }

  const achados = grupos.map((grupo) => {
    for (const chave of grupo) {
      const alvos = CANDIDATOS[chave] ?? [];
      for (const [no] of mundo) {
        if (!alvos.includes(normalizar(no.getName() ?? ''))) continue;
        if (!naPonta) return `${chave}=${normalizar(no.getName())}`;

        // A mesma conta de `pontaDaCadeia`: o descendente mais distante NO
        // MUNDO, e não o mais fundo na árvore — as caudas se ramificam.
        const posicao = (n) => aplicar(mundo.get(n), [0, 0, 0]);
        const origem = posicao(no);
        let melhor = no;
        let maior = 0;
        const descer = (n) => {
          const p = posicao(n);
          const d = Math.hypot(p[0] - origem[0], p[1] - origem[1], p[2] - origem[2]);
          if (d > maior) {
            maior = d;
            melhor = n;
          }
          for (const f of n.listChildren()) descer(f);
        };
        for (const f of no.listChildren()) descer(f);
        const salto = melhor === no ? ' (SEM CADEIA — fica na base)' : '';
        return `${chave}=${normalizar(no.getName())}→${normalizar(melhor.getName())}${salto}`;
      }
    }
    return null;
  });

  // As âncoras: o ponto tem de cair dentro da caixa do bicho, em fração da
  // altura. A folga de 0,05 existe porque a chama é maior do que o ponto — ela
  // pode (e deve) transbordar um pouco da silhueta.
  const m = MEDIDAS[id];
  const meiaLargura = m.largura / 2 / m.alturaModelo;
  const meiaProfundidade = m.profundidade / 2 / m.alturaModelo;
  for (const [ax, ay, az] of ancoras) {
    const dentro =
      Math.abs(ax) <= meiaLargura + 0.05 &&
      ay >= -0.05 &&
      ay <= 1.05 &&
      Math.abs(az) <= meiaProfundidade + 0.05;
    achados.push(
      dentro
        ? `âncora(${ax}, ${ay}, ${az})`
        : null,
    );
    if (!dentro) {
      console.log(
        `       a âncora (${ax}, ${ay}, ${az}) cai FORA da caixa de ${id}: ` +
          `x até ±${meiaLargura.toFixed(2)}, z até ±${meiaProfundidade.toFixed(2)}`,
      );
    }
  }

  const ok = achados.length > 0 && achados.every(Boolean);
  if (!ok) faltou++;
  console.log(`${ok ? 'ok   ' : 'FALTA'} ${id.padEnd(12)} ${achados.map((a) => a ?? '(NENHUM)').join(' · ')}`);
}
console.log(faltou ? `\n${faltou} espécie(s) sem onde pendurar a chama` : '\ntodas acendem');
