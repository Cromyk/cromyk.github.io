/**
 * Lista os ossos que o `Rig` NÃO conhece, por frequência.
 *
 * O rig da Game Freak tem nomes semânticos — foi isso que permitiu escrever a
 * animação procedural uma vez só (ver src/rig.ts). Mas src/rig.ts só mapeia
 * vinte e cinco papéis: tronco, cabeça, braços, pernas, três nós de cauda e
 * duas orelhas. Tudo o que um Pokémon tem além disso — ASA, BARBATANA, BIGODE,
 * antena, tentáculo, pétala — existe no arquivo e nunca se mexe.
 *
 * O pedido do playtest de 19/09 foi *"melhorar movimentação dos braços e
 * elementos adicionais dos Pokémon, como ASAS, barbatanas, bigodes"*, e a
 * primeira pergunta é factual: como esses ossos se chamam? Adivinhar nome de
 * osso é o mesmo erro que adivinhar posição dentro de um modelo — a lição de
 * `tools/brasa.mjs`, que descobriu que a chama tem nome de material.
 *
 *   node tools/diag-ossos.mjs [padrão]
 *
 * Sem argumento, lista os cem nomes desconhecidos mais comuns. Com um padrão
 * (`node tools/diag-ossos.mjs wing`), lista quem tem ossos que casam com ele.
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

// Os candidatos que o Rig já cobre, lidos do próprio src/rig.ts: uma cópia
// desta lista aqui envelheceria no dia em que alguém somasse um papel.
const fonteRig = readFileSync(join(raiz, 'src', 'rig.ts'), 'utf8');
const bloco = fonteRig.slice(fonteRig.indexOf('const CANDIDATOS'), fonteRig.indexOf('\n};', fonteRig.indexOf('const CANDIDATOS')));
const CONHECIDOS = new Set([...bloco.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]));

// A régua de nome é uma só, e mora em tools/nomes.mjs: três cópias dela
// aqui foi como o censo continuou dando "Mewtwo sem perna" depois de o
// `Rig` já ter aprendido a segunda convenção. Ver o cabeçalho de lá.

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

const padrao = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const contagem = new Map();
const donos = new Map();

const arquivos = readdirSync(pasta)
  .filter((f) => /^\d+\.glb$/.test(f))
  .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));

for (const arquivo of arquivos) {
  const num = arquivo.split('.')[0];
  let doc;
  try {
    doc = await io.read(join(pasta, arquivo));
  } catch {
    continue;
  }
  // Osso = nó usado por alguma pele. É a mesma definição do three.
  const ossos = new Set();
  for (const pele of doc.getRoot().listSkins()) {
    for (const no of pele.listJoints()) ossos.add(no.getName());
  }
  for (const cru of ossos) {
    const nome = normalizar(cru);
    if (CONHECIDOS.has(nome)) continue;
    if (padrao && !padrao.test(nome)) continue;
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    const lista = donos.get(nome) ?? [];
    if (lista.length < 6) lista.push(num);
    donos.set(nome, lista);
  }
}

const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
console.log(`${ordenado.length} nomes de osso que o Rig não conhece\n`);
console.log('osso'.padEnd(22), 'em'.padStart(4), '  exemplos');
for (const [nome, quantos] of ordenado.slice(0, padrao ? 400 : 100)) {
  console.log(nome.padEnd(22), `${quantos}`.padStart(4), '  ' + (donos.get(nome) ?? []).join(' '));
}
