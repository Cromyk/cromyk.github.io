/**
 * O CENSO DO RIG: quem, dos 151, tem osso para se mexer — e de que tipo.
 *
 * O pedido do playtest de 19/09 foi *"verifique que todos têm bones para fazer
 * os movimentos procedurais, mãos se fecham, braços mexem"*. Isso é uma
 * pergunta factual sobre 151 arquivos, e a resposta não cabe em adivinhação:
 * este censo abre todos, aplica a MESMA régua do `Rig` (ver src/rig.ts) e
 * imprime a conta.
 *
 *   node tools/diag-rig.mjs           # o resumo, e quem está sem
 *   node tools/diag-rig.mjs --todos   # uma linha por espécie
 *
 * Por que "a mesma régua" importa: uma cópia da lista de candidatos aqui
 * envelheceria no dia em que alguém somasse um papel ao rig. A lista é LIDA de
 * src/rig.ts, como `tools/diag-ossos.mjs` já faz.
 *
 * O que cada coluna quer dizer:
 *
 * - **papéis** — quantos dos vinte e cinco papéis o esqueleto preencheu.
 *   Menos de quatro, ou sem quadril nem tronco, e `Animador.temRig` é falso: o
 *   bicho fica só com o squash & stretch do corpo. É o que faz um modelo
 *   atravessar o quarto na pose de bind.
 * - **braço** — tem `LArm`/`RArm`. Sem isso não há balanço, não há corrida
 *   fofa e não há soco.
 * - **dedo** — tem `LFinger*`/`RFinger*`. Sem isso a mão não fecha, e isso é
 *   esperado na maioria: um Magikarp não tem dedo, e não devia ter.
 * - **apêndice** — asa, barbatana, bigode, antena (`*Feeler*`).
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
/** Os candidatos por papel, na ordem em que o `Rig` os tenta. */
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

const todos = process.argv.includes('--todos');
const arquivos = readdirSync(pasta)
  .filter((f) => /^\d+\.glb$/.test(f))
  .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));

const linhas = [];
let semRig = 0;
let comBraco = 0;
let comDedo = 0;
let comApendice = 0;
let comMandibula = 0;

for (const arquivo of arquivos) {
  const num = Number(arquivo.split('.')[0]);
  let doc;
  try {
    doc = await io.read(join(pasta, arquivo));
  } catch {
    linhas.push({ num, nome: nomePorNum.get(num) ?? `#${num}`, erro: true });
    continue;
  }

  const nomes = new Set();
  for (const no of doc.getRoot().listNodes()) nomes.add(normalizar(no.getName()));

  // A MESMA regra do Rig: um osso já tomado por um papel não serve a outro.
  const tomados = new Set();
  let papeis = 0;
  const tem = {};
  for (const { chave, candidatos } of PAPEIS) {
    for (const c of candidatos) {
      if (!nomes.has(c) || tomados.has(c)) continue;
      tomados.add(c);
      tem[chave] = true;
      papeis++;
      break;
    }
  }

  const dedos = [...nomes].filter((n) => /^(l|r)?finger/.test(n)).length;
  const apendices = [...nomes].filter((n) => /^(l|r)?feeler/.test(n) || /^(l|r)tail/.test(n)).length;
  const braco = Boolean(tem.bracoE || tem.bracoD);
  // A mesma condição de `Animador.temRig`.
  const anima = papeis >= 4 && (tem.quadril || tem.tronco);

  if (!anima) semRig++;
  if (braco) comBraco++;
  if (dedos > 0) comDedo++;
  if (apendices > 0) comApendice++;
  if (tem.mandibula) comMandibula++;

  linhas.push({
    num,
    nome: nomePorNum.get(num) ?? `#${num}`,
    papeis,
    anima,
    braco,
    dedos,
    apendices,
    ossos: nomes.size,
  });
}

const total = linhas.length;
const largura = Math.max(...linhas.map((l) => l.nome.length));

const imprimir = (l) => {
  if (l.erro) {
    console.log(`${String(l.num).padStart(3, '0')} ${l.nome.padEnd(largura)}  NÃO ABRIU`);
    return;
  }
  console.log(
    `${String(l.num).padStart(3, '0')} ${l.nome.padEnd(largura)}  ` +
      `${String(l.papeis).padStart(2)} papéis  ` +
      `${l.anima ? 'anima ' : 'PARADO'}  ` +
      `${l.braco ? 'braço' : '     '}  ` +
      `${l.dedos ? `${String(l.dedos).padStart(2)} dedos` : '        '}  ` +
      `${l.apendices ? `${String(l.apendices).padStart(2)} apêndices` : ''}`,
  );
};

if (todos) {
  for (const l of linhas) imprimir(l);
  console.log('');
}

console.log(`${total} modelos lidos.\n`);
console.log(`  animam pelo rig .... ${total - semRig}/${total}`);
console.log(`  com braço .......... ${comBraco}/${total}`);
console.log(`  com dedo ........... ${comDedo}/${total}`);
console.log(`  com mandíbula ...... ${comMandibula}/${total}`);
console.log(`  com apêndice ....... ${comApendice}/${total}`);

const parados = linhas.filter((l) => !l.erro && !l.anima);
if (parados.length > 0) {
  console.log(`\nSEM RIG — estes andam na pose de bind, com só o squash do corpo:`);
  for (const l of parados) imprimir(l);
} else {
  console.log('\nNenhum modelo ficou sem rig: todos os 151 animam pelos ossos.');
}

const semBraco = linhas.filter((l) => !l.erro && l.anima && !l.braco);
if (semBraco.length > 0 && todos) {
  console.log(`\n${semBraco.length} animam mas não têm braço (esperado: cobra, peixe, planta):`);
  console.log(`  ${semBraco.map((l) => l.nome).join(', ')}`);
}
