import { audio } from './audio';

/**
 * A voz da Pokédex, em português.
 *
 * ## Por que arquivo e não `speechSynthesis`
 *
 * A API de fala do navegador seria de graça e sem nenhum megabyte no pacote —
 * mas ela não sintetiza nada sozinha: ela pede a voz ao sistema. No Android, e
 * portanto no Quest, isso significa um motor de TTS instalado, e o headset não
 * traz nenhum. Numa aba do Chrome no PC funciona; no headset, que é onde o jogo
 * roda, a chamada volta sem som e sem erro — o pior dos dois mundos.
 *
 * Então a narração é gravada em build (`npm run narracao`, ver
 * tools/narracao.mjs) e vem como MP3 em public/voz/. Isso também deixa a
 * Pokédex falar com a PWA offline, que é como o jogo costuma ser aberto.
 *
 * Se os arquivos não tiverem sido gerados, nada quebra: `falar` não acha o
 * arquivo, desiste em silêncio e a ficha continua sendo lida na tela.
 */

const PASTA = './voz/';

/** Uma narração já baixada e decodificada, pronta para tocar de novo. */
const prontos = new Map<string, AudioBuffer | null>();
const baixando = new Map<string, Promise<AudioBuffer | null>>();

let tocando: AudioBufferSourceNode | null = null;
let idTocando: string | null = null;

/**
 * Quantas vezes alguém já mandou calar.
 *
 * ## O bug que isto conserta
 *
 * `falar` espera o MP3 baixar (`await carregar`) e só então manda tocar — e
 * entre uma coisa e outra o mundo anda. A sequência é banal:
 *
 * 1. você aponta para o Charmander na Pokédex e puxa o gatilho;
 * 2. os 190 kB da narração começam a baixar;
 * 3. você fecha a Pokédex, e o jogo chama `calar()`;
 * 4. o download termina, e `falar` continua de onde parou e **toca**.
 *
 * A voz sai com a Pokédex já guardada, e o jogo já sabia que isso é ruim: a
 * linha que chama `calar()` ao fechar o painel diz, por escrito, que *"ouvir
 * uma descrição de Pikachu com a Pokédex já guardada é o tipo de coisa que faz
 * parecer que o jogo travou"*. A proteção existia e não cobria o caso — e o
 * caso é justamente a PRIMEIRA vez que se aponta para uma espécie, que é
 * quando o arquivo ainda não está em memória.
 *
 * ## Por que um contador, e não um booleano
 *
 * Porque pode haver mais de um pedido em voo: apontar para três fichas
 * seguidas enquanto a primeira baixa. Um booleano de "cancelado" seria
 * limpo pelo segundo pedido e deixaria o primeiro tocar. O contador dá a cada
 * pedido um SELO, e só o mais recente vale.
 */
let geracao = 0;

/**
 * O selo do pedido atual. Quem vai esperar alguma coisa guarda o seu antes de
 * esperar, e confere depois com `aindaVale`.
 */
export function selo(): number {
  return geracao;
}

/** Este pedido ainda é o mais recente, ou alguém mandou calar no meio? */
export function aindaVale(meu: number): boolean {
  return meu === geracao;
}

function arquivoDe(chave: string): string {
  return `${PASTA}${chave}.mp3`;
}

async function carregar(chave: string): Promise<AudioBuffer | null> {
  if (prontos.has(chave)) return prontos.get(chave) ?? null;

  const emCurso = baixando.get(chave);
  if (emCurso) return emCurso;

  const ctx = audio.contexto;
  if (!ctx) return null;

  const promessa = fetch(arquivoDe(chave))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((dados) => ctx.decodeAudioData(dados))
    .then((buffer) => {
      prontos.set(chave, buffer);
      return buffer;
    })
    .catch(() => {
      // Narração que não existe é só uma ficha sem voz. Guardar o null impede
      // que cada passagem da mira tente baixar o mesmo arquivo de novo.
      prontos.set(chave, null);
      return null;
    })
    .finally(() => {
      baixando.delete(chave);
    });

  baixando.set(chave, promessa);
  return promessa;
}

/**
 * Interrompe o que estiver sendo narrado — e o que estiver a caminho.
 *
 * O contador sobe ANTES de qualquer saída antecipada, e é isso que faz a
 * função valer para o caso em que nada está tocando ainda: um pedido em voo
 * não tem nó de áudio para parar, só um `await` para invalidar.
 */
export function calar() {
  geracao++;
  if (!tocando) return;
  try {
    tocando.stop();
  } catch {
    /* já tinha terminado sozinho */
  }
  tocando = null;
  idTocando = null;
}

export function narrando(): string | null {
  return idTocando;
}

/**
 * Narra uma entrada. Pedir a mesma que já está tocando CALA — é o segundo
 * toque no gatilho servindo de "chega", que é o que a mão faz naturalmente
 * quando a fala se estende mais do que a paciência.
 */
export async function falar(chave: string): Promise<boolean> {
  const ctx = audio.contexto;
  if (!ctx) return false;

  if (idTocando === chave) {
    calar();
    return false;
  }

  // O selo antes da espera: ver `geracao`.
  const meu = selo();
  const buffer = await carregar(chave);
  if (!buffer) return false;
  // Alguém calou enquanto o arquivo baixava — fechou a Pokédex, guardou o
  // tablet, saiu da sessão. O pedido morreu com o gesto que o fez.
  if (!aindaVale(meu)) return false;

  calar();
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  // Direto na saída: a voz é o que abaixa o resto, e passar pelo master a faria
  // abaixar a si mesma.
  fonte.connect(ctx.destination);
  fonte.onended = () => {
    if (tocando === fonte) {
      tocando = null;
      idTocando = null;
    }
  };
  fonte.start();
  tocando = fonte;
  idTocando = chave;

  audio.abafar(0.3, buffer.duration);
  return true;
}

/** Deixa a narração pronta antes de ela ser pedida. */
export function preparar(chaves: string[]) {
  for (const chave of chaves) void carregar(chave);
}

/** Quem tem narração gravada. Ver tools/narracao.mjs. */
export const COM_NARRACAO = new Set(['bulbasaur', 'charmander', 'squirtle', 'pikachu']);

export const temNarracao = (id: string) => COM_NARRACAO.has(id);
