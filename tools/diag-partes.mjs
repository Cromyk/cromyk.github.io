/**
 * O CENSO POR PARTE: de que serve o esqueleto de cada um dos 156.
 *
 * `tools/diag-rig.mjs` responde "tem osso?" — 110 sim, 46 não. Esta pergunta é
 * a seguinte, e é a que decide animação: **de que PARTES** cada esqueleto é
 * feito. Um bicho pode ter rig e não ter perna (Magikarp, Ekans, Onix), ter
 * perna e não ter braço (Rapidash, Tauros), ter braço e não ter mão, ter cauda
 * e não ter orelha.
 *
 * Isso importa porque `src/anima.ts` escreve UMA animação para todos, e cada
 * `rig.girar` num osso que não existe é um no-op silencioso. Um bicho sem perna
 * recebe um ciclo de passada inteiro que não move nada — e atravessa o quarto
 * deslizando, exatamente como os 46 sem osso faziam.
 *
 *   node tools/diag-partes.mjs          # o resumo por grupo
 *   node tools/diag-partes.mjs --todos  # uma linha por espécie
 *
 * A régua é lida de src/rig.ts, como em diag-rig.mjs: uma cópia dela aqui
 * envelheceria no dia em que alguém somasse um papel.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizar } from './nomes.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, 'public', 'pokemon');

const fonteRig = readFileSync(join(raiz, 'src', 'rig.ts'), 'utf8');
const bloco = fonteRig.slice(
  fonteRig.indexOf('const CANDIDATOS'),
  fonteRig.indexOf('\n};', fonteRig.indexOf('const CANDIDATOS')),
);
const PAPEIS = [...bloco.matchAll(/^\s+(\w+):\s*\[([^\]]+)\]/gm)].map((m) => ({
  chave: m[1],
  candidatos: [...m[2].matchAll(/'([a-z0-9]+)'/g)].map((c) => c[1]),
}));

const manifesto = JSON.parse(readFileSync(join(pasta, 'manifesto.json'), 'utf8'));
const nomePorNum = new Map();
for (const [id, m] of Object.entries(manifesto.especies ?? {})) nomePorNum.set(m.num, id);

// A régua de nome é uma só, e mora em tools/nomes.mjs: três cópias dela
// aqui foi como o censo continuou dando "Mewtwo sem perna" depois de o
// `Rig` já ter aprendido a segunda convenção. Ver o cabeçalho de lá.

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

/**
 * Os GRUPOS que a animação usa como bloco. É por eles que a pergunta se faz:
 * `aplicarBase` não gira "coxaE", gira A PERNA — e se a perna inteira falta, o
 * bloco todo é no-op.
 */
const GRUPOS = {
  tronco: ['quadril', 'tronco', 'peito'],
  cabeca: ['cabeca', 'pescoco'],
  mandibula: ['mandibula'],
  bracos: ['bracoE', 'bracoD'],
  antebracos: ['antebracoE', 'antebracoD'],
  maos: ['maoE', 'maoD'],
  pernas: ['coxaE', 'coxaD', 'pernaE', 'pernaD'],
  pes: ['peE', 'peD'],
  cauda: ['cauda1', 'cauda2', 'cauda3'],
  orelhas: ['orelhaE', 'orelhaD'],
};

const todos = process.argv.includes('--todos');
const arquivos = readdirSync(pasta)
  .filter((f) => /^\d+\.glb$/.test(f))
  .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));

const linhas = [];
const conta = Object.fromEntries(Object.keys(GRUPOS).map((g) => [g, 0]));
let comRig = 0;

for (const arquivo of arquivos) {
  const num = Number(arquivo.split('.')[0]);
  let doc;
  try {
    doc = await io.read(join(pasta, arquivo));
  } catch {
    continue;
  }

  const nomes = new Set();
  for (const no of doc.getRoot().listNodes()) nomes.add(normalizar(no.getName()));

  const tomados = new Set();
  const tem = {};
  let papeis = 0;
  for (const { chave, candidatos } of PAPEIS) {
    for (const c of candidatos) {
      if (!nomes.has(c) || tomados.has(c)) continue;
      tomados.add(c);
      tem[chave] = true;
      papeis++;
      break;
    }
  }
  const anima = papeis >= 4 && (tem.quadril || tem.tronco);
  if (!anima) continue;
  comRig++;

  const grupos = {};
  for (const [g, chaves] of Object.entries(GRUPOS)) {
    grupos[g] = chaves.some((c) => tem[c]);
    if (grupos[g]) conta[g]++;
  }

  const dedos = [...nomes].filter((n) => /^(l|r)?finger/.test(n)).length;
  linhas.push({ num, nome: nomePorNum.get(num) ?? `#${num}`, grupos, dedos });
}

const largura = Math.max(...linhas.map((l) => l.nome.length));
if (todos) {
  for (const l of linhas) {
    const faltam = Object.entries(l.grupos)
      .filter(([, v]) => !v)
      .map(([g]) => g);
    console.log(
      `${String(l.num).padStart(3, '0')} ${l.nome.padEnd(largura)}  ` +
        (faltam.length === 0 ? 'completo' : `sem ${faltam.join(', ')}`),
    );
  }
  console.log('');
}

console.log(`${comRig} com esqueleto, dos ${arquivos.length} arquivos.\n`);
for (const g of Object.keys(GRUPOS)) {
  const n = conta[g];
  console.log(`  ${g.padEnd(12)} ${String(n).padStart(3)}/${comRig}   faltam em ${comRig - n}`);
}

// Os dois grupos que mudam a ANIMAÇÃO inteira, e não um detalhe dela.
const semPerna = linhas.filter((l) => !l.grupos.pernas);
const semBraco = linhas.filter((l) => !l.grupos.bracos);
console.log(
  `\nSEM PERNA (${semPerna.length}) — o ciclo de passada não move nada neles:\n  ` +
    semPerna.map((l) => l.nome).join(', '),
);
console.log(
  `\nSEM BRAÇO (${semBraco.length}) — nada de balanço, corrida fofa nem punho:\n  ` +
    semBraco.map((l) => l.nome).join(', '),
);
