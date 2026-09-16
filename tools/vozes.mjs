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

import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { falaDe, lerPokedex } from './falas.mjs';

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

const POKEDEX = await lerPokedex();

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
