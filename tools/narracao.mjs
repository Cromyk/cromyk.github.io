// Gera a narração da Pokédex em português para public/voz/.
//
// A voz da Pokédex é gravada aqui e não sintetizada no headset: o Quest não traz
// motor de TTS, e `speechSynthesis` lá volta sem som e sem erro. Ver src/voz.ts.
//
//   npm run narracao          gera o que estiver faltando
//   npm run narracao -- --tudo  regrava tudo
//
// Sem rede, o comando desiste em silêncio: a Pokédex continua sendo lida na
// tela, só não falada.

import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A biblioteca de TTS é carregada só aqui dentro, e NÃO está no package.json.
 *
 * O `msedge-tts` traz um `preinstall: npx only-allow pnpm`, que aborta a
 * instalação de quem não usa pnpm — o que derrubaria o `npm ci` da publicação.
 * Como os MP3 já estão versionados em public/voz/, ela só faz falta quando se
 * quer mudar o texto das fichas, e aí vale instalar na hora.
 */
async function carregarTts() {
  try {
    return await import('msedge-tts');
  } catch {
    console.error(
      'Falta o msedge-tts. Ele não fica no package.json de propósito (o\n' +
        'preinstall dele quebra o `npm ci` da publicação). Para regravar:\n\n' +
        '  npm i --no-save --ignore-scripts msedge-tts\n' +
        '  npm run narracao -- --tudo\n',
    );
    process.exit(1);
  }
}

const { MsEdgeTTS, OUTPUT_FORMAT } = await carregarTts();

const SAIDA = 'public/voz';
const VOZ = 'pt-BR-FranciscaNeural';

/**
 * O texto de cada ficha.
 *
 * Escrito para ser OUVIDO, não lido: frases curtas, número por extenso onde a
 * leitura automática erraria, e nada de abreviação. A ordem é sempre a mesma —
 * quem é, de que tipo, quanto mede, o que faz, e o que acontece quando cresce —
 * porque ouvir quatro fichas seguidas com a mesma ordem é o que deixa comparar
 * uma com a outra sem prestar atenção.
 */
const FICHAS = {
  bulbasaur: `
    Bulbasaur. Número um da Pokédex. Tipo planta e veneno.
    Mede setenta centímetros e pesa quase sete quilos.
    Ele nasce com uma semente plantada nas costas, e os dois crescem juntos.
    A semente se alimenta da luz do sol, então Bulbasaur passa o dia procurando
    lugares claros para cochilar. Enquanto ela estiver ali, ele pode ficar dias
    sem comer.
    Do bulbo saem os cipós com que ele ataca, e eles alcançam bem mais longe do
    que o corpo dele sugere.
    No nível dezesseis, Bulbasaur evolui para Ivysaur.
  `,
  charmander: `
    Charmander. Número quatro da Pokédex. Tipo fogo.
    Mede sessenta centímetros e pesa oito quilos e meio.
    A chama na ponta do rabo dele é a vida dele. Ela queima desde o nascimento e
    nunca se apaga por completo.
    Dá para saber como Charmander está só de olhar para o rabo. Quando ele está
    animado, a chama cresce. Quando está doente ou triste, ela diminui e fica
    fraquinha.
    Charmander é de lugar quente e seco. Chuva forte faz o rabo chiar e solta
    fumaça branca.
    No nível dezesseis, Charmander evolui para Charmeleon.
  `,
  squirtle: `
    Squirtle. Número sete da Pokédex. Tipo água.
    Mede cinquenta centímetros e pesa nove quilos.
    O casco dele não é só proteção. O formato arredondado corta a água e deixa
    Squirtle nadar muito mais rápido do que ele anda.
    Quando se sente ameaçado, ele recolhe a cabeça e as patas para dentro do
    casco e dispara jatos de água com muita pressão pelas aberturas.
    As listras do casco escurecem com a idade, e as bordas ficam gastas de tanto
    esbarrar em pedra.
    No nível dezesseis, Squirtle evolui para Wartortle.
  `,
  pikachu: `
    Pikachu. Número vinte e cinco da Pokédex. Tipo elétrico.
    Mede quarenta centímetros e pesa seis quilos.
    Nas bochechas dele existem duas bolsas que guardam eletricidade. Elas
    carregam enquanto Pikachu dorme, e ele descarrega quando está assustado ou
    com raiva.
    Se você vir as bochechas soltando faísca, é aviso. Vem choque em seguida.
    Pikachu levanta o rabo para sentir o que está em volta, e é por isso que
    tantos deles levam raio na cabeça.
    Com uma pedra do trovão, Pikachu evolui para Raichu.
  `,
};

async function existe(caminho) {
  try {
    await stat(caminho);
    return true;
  } catch {
    return false;
  }
}

/** Uma frase por linha vira uma pausa; o TTS lê o bloco todo emendado sem isso. */
function limpar(texto) {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}

const comTempo = (promessa, ms, oque) =>
  Promise.race([
    promessa,
    new Promise((_, rejeitar) =>
      setTimeout(() => rejeitar(new Error(`${oque}: ${ms} ms sem resposta`)), ms),
    ),
  ]);

async function gravar(id, texto) {
  const tts = new MsEdgeTTS();
  await comTempo(
    tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3),
    10000,
    'conectando',
  );
  // A biblioteca nomeia o arquivo sozinha; a gente renomeia para o id, que é o
  // que src/voz.ts procura.
  const { audioFilePath } = await comTempo(tts.toFile(SAIDA, limpar(texto)), 30000, id);
  const destino = join(SAIDA, `${id}.mp3`);
  await rm(destino, { force: true });
  await rename(audioFilePath, destino);
  const { size } = await stat(destino);
  return size;
}

async function principal() {
  const tudo = process.argv.includes('--tudo');
  await mkdir(SAIDA, { recursive: true });

  let gerados = 0;
  let pulados = 0;

  for (const [id, texto] of Object.entries(FICHAS)) {
    const destino = join(SAIDA, `${id}.mp3`);
    if (!tudo && (await existe(destino))) {
      pulados++;
      continue;
    }
    try {
      const bytes = await gravar(id, texto);
      console.log(`  ${id}.mp3  ${(bytes / 1024).toFixed(0)} kB`);
      gerados++;
    } catch (erro) {
      // Sem rede não se gera voz, e isso não pode derrubar o build: o jogo roda
      // igual, só sem a Pokédex falada.
      console.warn(`  ${id}: ${erro.message}`);
    }
  }

  // Sobras de uma execução interrompida — a biblioteca escreve com nome próprio
  // antes de a gente renomear.
  for (const nome of await readdir(SAIDA)) {
    if (/^[0-9a-f-]{20,}\.mp3$/i.test(nome)) await rm(join(SAIDA, nome), { force: true });
  }

  console.log(`narração: ${gerados} gerada(s), ${pulados} já existia(m).`);
}

await principal();
