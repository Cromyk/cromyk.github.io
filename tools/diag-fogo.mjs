/**
 * Confere que os Pokémon de fogo têm, no arquivo, o osso onde a chama é
 * pendurada. Sem isso a chama simplesmente não aparece e nada reclama — o tipo
 * de falha silenciosa que só se descobre pondo o headset. Ver src/fogo.ts.
 *
 *   node tools/diag-fogo.mjs            # confere a tabela
 *   node tools/diag-fogo.mjs ponyta     # lista os ossos de um modelo
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
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
const normalizar = (n) => n.slice(n.lastIndexOf('|') + 1).replace(/_\d+$/, '').replace(/[\s.:-]/g, '').toLowerCase();

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

async function ossosDe(id) {
  const m = MEDIDAS[id];
  if (!m) return null;
  const doc = await io.read(join(raiz, 'public', 'pokemon', `${m.num}.glb`));
  const nomes = new Set();
  for (const skin of doc.getRoot().listSkins())
    for (const junta of skin.listJoints()) nomes.add(normalizar(junta.getName() ?? ''));
  return nomes;
}

const pedidos = process.argv.slice(2);
if (pedidos.length) {
  for (const id of pedidos) {
    const nomes = await ossosDe(id);
    console.log(`\n${id}: ${nomes ? [...nomes].sort().join(' ') : 'SEM MODELO'}`);
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
const entradas = marcas.map((m, i) => [
  null,
  m[1],
  bloco.slice(m.index, marcas[i + 1]?.index ?? bloco.length),
]);
if (entradas.length === 0) {
  console.error('nenhuma espécie lida de src/fogo.ts — o formato da tabela mudou');
  process.exit(1);
}

let faltou = 0;
for (const [, id, corpo] of entradas) {
  const grupos = [...corpo.matchAll(/ossos:\s*\[([^\]]*)\]/g)].map((m) =>
    m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean),
  );
  const nomes = await ossosDe(id);
  if (!nomes) { console.log(`FALTA ${id}: sem modelo`); faltou++; continue; }
  const achados = grupos.map((grupo) => {
    for (const chave of grupo) {
      const alvo = (CANDIDATOS[chave] ?? []).find((c) => nomes.has(c));
      if (alvo) return `${chave}→${alvo}`;
    }
    return null;
  });
  const ok = achados.length > 0 && achados.every(Boolean);
  if (!ok) faltou++;
  console.log(`${ok ? 'ok   ' : 'FALTA'} ${id.padEnd(12)} ${achados.map((a) => a ?? '(NENHUM)').join(' · ')}`);
}
console.log(faltou ? `\n${faltou} espécie(s) sem onde pendurar a chama` : '\ntodas acendem');
