// Grava os 151 dizendo o próprio nome COM VOZ DE PERSONAGEM, para public/vozes/.
//
// O irmão mais velho deste arquivo, tools/vozes.mjs, usa o TTS do Edge: uma
// locutora brasileira, uma voz só para os 151, e o jogo muda o TOM de cada
// espécie na hora de tocar (ver `tomDe` em src/audio.ts). Funciona, mas o que
// sai é uma pessoa lendo "Char! Charmander!" — dá para ouvir a leitura.
//
// Aqui a fala é gerada pelo TTS do Gemini, que aceita uma INSTRUÇÃO DE ATUAÇÃO
// junto do texto. É isso que muda tudo: dá para pedir que a fala saia como uma
// criatura de desenho animado, e não como quem lê uma legenda. E como o Gemini
// tem trinta vozes prontas, cada espécie ganha uma DE VERDADE — escolhida pelo
// peso do bicho, que é o que separa o fiapo de voz do Gastly do ronco do
// Snorlax sem depender de esticar o mesmo arquivo.
//
//   npm run vozes:anime                grava o que estiver faltando
//   npm run vozes:anime -- --tudo      regrava os 151
//   npm run vozes:anime -- 4 25 143    só estes números da Pokédex
//   npm run vozes:anime -- --amostra   só uma dúzia bem variada, para ouvir antes
//
// Precisa de GEMINI_API_KEY no ambiente e de ffmpeg no PATH (a API devolve PCM
// cru). Sem uma das duas, o comando explica o que falta e sai sem apagar nada.

import { mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { falaDe, lerPokedex } from './falas.mjs';

const executar = promisify(execFile);

const SAIDA = 'public/vozes';
const MODELO = 'gemini-2.5-flash-preview-tts';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

/**
 * As vozes prontas do Gemini, agrupadas por peso de timbre.
 *
 * A divisão é a olho e é o ponto todo: um Caterpie não pode sair com a mesma
 * garganta de um Onix. O peso do bicho escolhe o grupo e o número da Pokédex
 * escolhe dentro dele, o que dá variedade sem sorteio — regravar o mesmo
 * Pokémon amanhã devolve a mesma voz.
 */
const VOZES = {
  fina: ['Zephyr', 'Leda', 'Aoede', 'Autonoe', 'Despina', 'Erinome', 'Sulafat', 'Achernar'],
  media: ['Puck', 'Kore', 'Callirrhoe', 'Umbriel', 'Algieba', 'Schedar', 'Achird', 'Laomedeia'],
  grossa: ['Charon', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus', 'Algenib', 'Rasalgethi', 'Gacrux'],
};

/**
 * Como cada tipo ATUA.
 *
 * Mesmo espírito do `FAMILIA_SONORA` de src/audio.ts: dezoito instruções
 * distintas seriam dezoito variações que ninguém distingue, então os tipos caem
 * em poucas atuações, escolhidas pelo que se REPARA num grito de três palavras.
 */
const ATUACAO = {
  fogo: 'feroz e quente, com a garganta raspando, como quem solta fogo ao falar',
  dragao: 'feroz e quente, com a garganta raspando, como quem solta fogo ao falar',
  agua: 'borbulhante e molhada, arrastando as vogais como quem fala dentro d’água',
  gelo: 'cristalina e fria, com as vogais longas e um tremor no fim',
  eletrico: 'rápida, aguda e elétrica, estalando as sílabas com euforia',
  planta: 'macia e viçosa, com um sussurro de folha nas consoantes',
  inseto: 'miudinha e apressada, quase um chiado, com as sílabas picadas',
  voador: 'leve e cantada, subindo no fim como um pio',
  psiquico: 'sonhadora e distante, como se a voz chegasse de outro cômodo',
  fada: 'doce, brincalhona e cantada, com um risinho no fim',
  fantasma: 'esvaziada e arrepiante, mais ar do que voz, como um sopro que fala',
  sombrio: 'esvaziada e arrepiante, mais ar do que voz, como um sopro que fala',
  veneno: 'viscosa e maliciosa, sibilando nas consoantes',
  normal: 'alegre e redonda, do jeito mais simpático que um bicho de desenho fala',
  lutador: 'firme e explosiva, como um grito curto de esforço',
  terra: 'grossa e terrosa, pesada e sem pressa',
  pedra: 'grossa e terrosa, pesada e sem pressa',
  aco: 'metálica e dura, cortando as sílabas com precisão',
};

/**
 * A instrução de atuação que acompanha o texto.
 *
 * Ela precisa dizer, nesta ordem, três coisas que o modelo erra sozinho: que
 * isto NÃO é narração (senão sai um locutor), que a fala é o som inteiro
 * (senão ele acrescenta "o Pokémon diz:" antes), e que nome próprio de Pokémon
 * se fala do jeito do desenho, e não traduzido para o português.
 */
function instrucaoDe(especie) {
  const tipo = especie.tipos[0];
  const atuacao = ATUACAO[tipo] ?? ATUACAO.normal;
  const porte =
    especie.peso >= 120
      ? 'É um bicho ENORME e pesado: a voz sai do fundo do peito, lenta e cavernosa.'
      : especie.peso <= 5
        ? 'É um bicho MINÚSCULO: a voz é fininha, leve e rápida.'
        : 'É um bicho de porte médio.';

  return (
    'Você é a voz de uma criatura de desenho animado japonês fazendo a dublagem de um episódio. ' +
    'NÃO narre, NÃO leia, NÃO explique, NÃO diga mais nada além da fala: o áudio inteiro é só o ' +
    'grito da criatura. É a criatura dizendo o próprio nome, do jeito que os Pokémon falam no anime. ' +
    `${porte} A atuação é ${atuacao}. ` +
    'Pronuncie o nome como no desenho em inglês/japonês, jamais aportuguesado. ' +
    'Com muita emoção e energia de personagem, nunca com tom de locutor. A fala é: '
  );
}

function vozDe(especie) {
  // Mesma régua logarítmica de `tomDe` em src/audio.ts, e pelo mesmo motivo: a
  // Pokédex vai de 0,1 kg a 460 kg, e uma escala linear jogaria 140 dos 151 no
  // mesmo grupo.
  const corpo = Math.min(1, Math.log10((especie.peso ?? 10) + 1) / 2.7);
  const grupo = corpo < 0.33 ? VOZES.fina : corpo < 0.66 ? VOZES.media : VOZES.grossa;
  // Embaralhado de propósito: espécies vizinhas na numeração costumam ser da
  // mesma linha evolutiva, e uma progressão suave daria Charmander, Charmeleon
  // e Charizard com quase a mesma voz.
  const i = (Math.imul(especie.num, 2654435761) >>> 0) % grupo.length;
  return grupo[i];
}

// --------------------------------------------------------------- execução

const chave = process.env.GEMINI_API_KEY;
if (!chave) {
  console.error(
    'Falta a GEMINI_API_KEY no ambiente.\n' +
      'Ela é a mesma chave do TTS do Claude Code; num terminal novo ela já vem.\n',
  );
  process.exit(1);
}

try {
  await executar('ffmpeg', ['-version']);
} catch {
  console.error('Falta o ffmpeg no PATH: a API devolve PCM cru e é ele que fecha o MP3.\n');
  process.exit(1);
}

const POKEDEX = await lerPokedex();

const tudo = process.argv.includes('--tudo');
const amostra = process.argv.includes('--amostra');
const alvos = process.argv
  .slice(2)
  .filter((a) => /^\d+$/.test(a))
  .map(Number);

/** Uma dúzia que cobre os extremos: para ouvir antes de gastar 151 chamadas. */
const AMOSTRA = [4, 25, 92, 143, 1, 7, 95, 130, 39, 65, 150, 10];

await mkdir(SAIDA, { recursive: true });
const jaTem = new Set(
  (await readdir(SAIDA).catch(() => []))
    .filter((n) => n.endsWith('.mp3'))
    .map((n) => n.slice(0, -4)),
);

const fila = POKEDEX.filter((e) => {
  if (amostra) return AMOSTRA.includes(e.num);
  if (alvos.length) return alvos.includes(e.num);
  return tudo || !jaTem.has(String(e.num));
});

if (fila.length === 0) {
  console.log('vozes-anime: nada a gravar');
  process.exit(0);
}

console.log(`vozes-anime: ${fila.length} a gravar com ${MODELO}\n`);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma fala. Devolve o PCM cru e a taxa de amostragem que a resposta declarou.
 *
 * O 429 é esperado e não é erro: a cota deste modelo é apertada e 151 chamadas
 * seguidas batem nela. Então ele espera e tenta de novo, dobrando a espera —
 * o que transforma "falhou" em "demorou", que é o que se quer num gerador que
 * roda sozinho.
 */
async function gerar(especie, texto, tentativa = 1) {
  const resposta = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instrucaoDe(especie) + texto }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: vozDe(especie) } },
        },
      },
    }),
  });

  if (resposta.status === 429 || resposta.status >= 500) {
    if (tentativa > 6) throw new Error(`${resposta.status} depois de 6 tentativas`);
    const espera = Math.min(60000, 4000 * 2 ** (tentativa - 1));
    process.stdout.write(`\r  ${especie.nome}: ${resposta.status}, esperando ${espera / 1000}s…   `);
    await esperar(espera);
    return gerar(especie, texto, tentativa + 1);
  }

  if (!resposta.ok) throw new Error(`${resposta.status} ${(await resposta.text()).slice(0, 160)}`);

  const dados = await resposta.json();
  const parte = dados?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!parte?.data) {
    // 200 sem áudio acontece: o modelo às vezes responde com TEXTO ("claro, aqui
    // está…") em vez de som, e é sorte de tentativa, não erro de pedido. Vale
    // insistir algumas vezes antes de desistir desta espécie.
    if (tentativa > 3) {
      const motivo = dados?.candidates?.[0]?.finishReason ?? 'sem inlineData';
      throw new Error(`resposta sem áudio (${motivo})`);
    }
    await esperar(1500 * tentativa);
    return gerar(especie, texto, tentativa + 1);
  }
  const taxa = Number(/rate=(\d+)/.exec(parte.mimeType ?? '')?.[1] ?? 24000);
  return { pcm: Buffer.from(parte.data, 'base64'), taxa };
}

let gravados = 0;
let falhas = 0;

for (const especie of fila) {
  const texto = falaDe(especie.id, especie.nome);
  const bruto = join(tmpdir(), `voz-${especie.num}.pcm`);
  try {
    const { pcm, taxa } = await gerar(especie, texto);
    await writeFile(bruto, pcm);

    // PCM cru para MP3, aparando o silêncio das pontas: a fala precisa começar
    // no mesmo instante em que o bicho aparece, e meio segundo de nada na
    // frente é meio segundo de bicho mudo.
    await executar('ffmpeg', [
      '-hide_banner', '-v', 'error', '-y',
      '-f', 's16le', '-ar', String(taxa), '-ac', '1', '-i', bruto,
      '-af',
      'silenceremove=start_periods=1:start_silence=0:start_threshold=-50dB,areverse,' +
        'silenceremove=start_periods=1:start_silence=0:start_threshold=-50dB,areverse',
      '-ac', '1', '-b:a', '96k',
      join(SAIDA, `${especie.num}.mp3`),
    ]);

    const tamanho = (await stat(join(SAIDA, `${especie.num}.mp3`))).size;
    if (tamanho < 500) throw new Error(`só ${tamanho} bytes`);
    gravados++;
    console.log(
      `  ${String(especie.num).padStart(3)} ${especie.nome.padEnd(12)} ` +
        `${vozDe(especie).padEnd(12)} ${texto}`,
    );
  } catch (erro) {
    falhas++;
    console.warn(`  ! ${especie.nome}: ${erro.message}`);
  } finally {
    await rm(bruto, { force: true });
  }
}

console.log(`\nvozes-anime: ${gravados} gravadas em ${SAIDA}/${falhas ? ` · ${falhas} falharam` : ''}`);
