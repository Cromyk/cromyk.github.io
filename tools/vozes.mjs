// Grava os 151 dizendo o próprio nome, para public/vozes/.
//
// O grito que vem da PokeAPI é o dos JOGOS: o Charmander de Red/Blue guincha.
// Quem fala "Char! Charmander!" é o desenho, e isso não existe em fonte
// estruturada nenhuma — nem poderia ser baixado de uma.
//
// Então a fala é gravada aqui, com o mesmo TTS da narração da Pokédex, e o
// jogo dá a cada espécie um tom próprio na hora de tocar (ver `vozDoNome` em
// src/audio.ts): a mesma gravação sai mais aguda num Caterpie e mais grave num
// Snorlax, o que é o que separa 151 vozes de 151 arquivos de uma voz só.
//
// O texto de cada um é "<pedaço>! <nome>!" — o jeito do desenho, em que o bicho
// diz um naco do nome e depois o nome inteiro. O pedaço sai da tabela de
// exceções, quando o nome é famoso o bastante para ter um jeito consagrado, e
// da primeira sílaba quando não é.
//
//   npm run vozes               grava o que estiver faltando
//   npm run vozes -- --tudo     regrava tudo
//   npm run vozes -- 4 25       só Charmander e Pikachu
//
// Sem rede o comando desiste em silêncio: src/audio.ts volta para o grito dos
// jogos, que continua no pacote.

import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A biblioteca de TTS é carregada só aqui dentro, e NÃO está no package.json —
 * pelo mesmo motivo de tools/narracao.mjs: o `preinstall` dela aborta quem não
 * usa pnpm, o que derrubaria o `npm ci` da publicação. Os MP3 ficam
 * versionados, então ela só faz falta para regravar.
 */
async function carregarTts() {
  try {
    return await import('msedge-tts');
  } catch {
    console.error(
      'Falta o msedge-tts. Ele não fica no package.json de propósito (o\n' +
        'preinstall dele quebra o `npm ci` da publicação). Para regravar:\n\n' +
        '  npm i --no-save --ignore-scripts msedge-tts\n' +
        '  npm run vozes -- --tudo\n',
    );
    process.exit(1);
  }
}

const SAIDA = 'public/vozes';
const VOZ = 'pt-BR-FranciscaNeural';

/**
 * Como cada um chama a si mesmo.
 *
 * A lista à mão existe para os que têm jeito consagrado — o "Pika pi" é o
 * "Pika pi", e uma regra de sílaba jamais chegaria nele. Quem não está aqui cai
 * na regra geral logo abaixo, que acerta a grande maioria: o bicho diz o começo
 * do próprio nome e depois o nome inteiro.
 */
const JEITOS = {
  pikachu: 'Pika! Pika pi!',
  charmander: 'Char! Charmander!',
  bulbasaur: 'Bulba! Bulbasaur!',
  squirtle: 'Squirt! Squirtle!',
  jigglypuff: 'Jiggly! Jigglypuff!',
  meowth: 'Meowth! Meowth!',
  psyduck: 'Psai... Psyduck!',
  togepi: 'Toge! Togepi!',
  eevee: 'Vui! Eevee!',
  mew: 'Mew! Mew!',
  mewtwo: 'Mewtwo.',
  snorlax: 'Snor... Snorlax!',
  gengar: 'Gen! Gengar!',
  onix: 'Oooo! Onix!',
  geodude: 'Geo! Geodude!',
  magikarp: 'Karp! Karp! Magikarp!',
  ditto: 'Ditto! Ditto!',
  articuno: 'Articuno!',
  zapdos: 'Zapdos!',
  moltres: 'Moltres!',
  dragonite: 'Dragonite!',
  vulpix: 'Vul! Vulpix!',
  growlithe: 'Grow! Growlithe!',
  abra: 'Abra...',
  machop: 'Machop! Chop!',
  gastly: 'Gaaas... Gastly!',
  haunter: 'Haunter!',
  lapras: 'Laaa! Lapras!',
  scyther: 'Scy! Scyther!',
  pidgey: 'Pidge! Pidgey!',
  rattata: 'Ratta! Rattata!',
  caterpie: 'Cater! Caterpie!',
  weedle: 'Wee! Weedle!',
  zubat: 'Zu! Zubat!',
  clefairy: 'Clefa! Clefairy!',
};

/**
 * O pedaço do nome que o bicho diz antes do nome inteiro.
 *
 * Corta na primeira vogal seguida de consoante, o que dá "Char" em Charmander,
 * "Bulba" em Bulbasaur e "Rhy" em Rhyhorn. Nomes de uma sílaba só não ganham
 * pedaço: "Mew! Mew!" já é a regra da tabela acima, e repetir "On! Onix!" num
 * nome curto soa como gagueira, não como fala.
 */
function pedacoDe(nome) {
  const m = /^[^aeiouáéíóúãõ]*[aeiouáéíóúãõ]+[^aeiouáéíóúãõ]?/i.exec(nome);
  if (!m) return null;
  const pedaco = m[0];
  if (pedaco.length < 3 || pedaco.length >= nome.length) return null;
  return pedaco;
}

function falaDe(id, nome) {
  if (JEITOS[id]) return JEITOS[id];
  const pedaco = pedacoDe(nome);
  return pedaco ? `${pedaco}! ${nome}!` : `${nome}!`;
}

// A lista dos 151 sai do mesmo arquivo gerado que o jogo usa: dois catálogos
// sairiam do ar um do outro no primeiro `npm run pokedex`.
const fonte = await readFile('src/pokedex.gen.ts', 'utf8');
const POKEDEX = [];
for (const m of fonte.matchAll(
  /"num":\s*(\d+),\s*"id":\s*"([a-z0-9-]+)",\s*"nome":\s*"([^"]+)"/g,
)) {
  POKEDEX.push({ num: Number(m[1]), id: m[2], nome: m[3] });
}
if (POKEDEX.length === 0) {
  console.error('não achei os 151 em src/pokedex.gen.ts — rode `npm run pokedex` antes');
  process.exit(1);
}

const tudo = process.argv.includes('--tudo');
const alvos = process.argv
  .slice(2)
  .filter((a) => /^\d+$/.test(a))
  .map(Number);

const { MsEdgeTTS, OUTPUT_FORMAT } = await carregarTts();

await mkdir(SAIDA, { recursive: true });
const jaTem = new Set(
  (await readdir(SAIDA).catch(() => [])).filter((n) => n.endsWith('.mp3')).map((n) => n.slice(0, -4)),
);

const fila = POKEDEX.filter(
  (e) => (alvos.length ? alvos.includes(e.num) : true) && (tudo || alvos.length || !jaTem.has(String(e.num))),
);

if (fila.length === 0) {
  console.log('vozes: nada a gravar');
  process.exit(0);
}

const tts = new MsEdgeTTS();
await tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

let gravados = 0;
let falhas = 0;

for (const e of fila) {
  const texto = falaDe(e.id, e.nome);
  try {
    // A lib grava num arquivo de nome próprio dentro da pasta que se der; o
    // resultado é renomeado para o número da Pokédex, que é como o jogo pede.
    const { audioFilePath } = await tts.toFile(SAIDA, texto);
    const pronto = await audioFilePath;
    const destino = join(SAIDA, `${e.num}.mp3`);
    const tamanho = (await stat(pronto)).size;
    if (tamanho < 500) throw new Error(`só ${tamanho} bytes`);
    await rm(destino, { force: true });
    await rename(pronto, destino);
    gravados++;
    process.stdout.write(`\r  ${String(e.num).padStart(3)} ${e.nome.padEnd(12)} ${texto.padEnd(28)}`);
  } catch (erro) {
    falhas++;
    console.warn(`\n  ! ${e.nome}: ${erro.message}`);
  }
}

console.log(`\n\nvozes: ${gravados} gravadas em ${SAIDA}/${falhas ? ` · ${falhas} falharam` : ''}`);
