/**
 * Os marcos da Pokédex: o arco longo do jogo.
 *
 * ## O que faltava
 *
 * O jogo tinha o ciclo curto inteiro — aparece um selvagem, você briga, captura,
 * ele sobe de nível, evolui — e não tinha NADA acima disso. Capturar a décima
 * espécie era igual a capturar a nona, e igual a capturar a centésima. A
 * Pokédex contava (`31 capturadas · 84/151 vistas`, lá no canto do painel do
 * pulso) e o número não levava a lugar nenhum.
 *
 * Num jogo de Pokémon o contador da Pokédex É o arco: ele é a única coisa que
 * atravessa a sessão inteira e dá sentido a capturar um Rattata que você já
 * tem. Sem marco, o contador é placar; com marco, é caminho.
 *
 * ## Por que o prêmio é bola, e não outra coisa
 *
 * Porque é o que o próximo trecho do caminho pede. A Bola Lacuna tem
 * `recompensa: 0.08` — uma a cada doze capturas e meia, em média — e é a única
 * que segura um lendário. Chegar às cinquenta espécies e ganhar uma é a
 * diferença entre "o Snorlax escapou de novo" e "agora eu tenho uma chance".
 *
 * Os números respeitam o `maximo` de cada tipo de bola: prometer duas Lacunas a
 * quem já tem duas seria prometer nada.
 *
 * ## Por que estes números
 *
 * 5 e 10 estão perto do começo porque é ali que se decide se o jogo continua
 * sendo jogado. Depois disso a escala abre — 25, 50, 75, 100, 125 — e termina
 * em 151, que é a única linha de chegada que este jogo pode ter.
 */

export interface Marco {
  /** Espécies distintas capturadas. */
  registros: number;
  /** A frase, escrita para caber em duas linhas do cartão. */
  fala: string;
  /** O que vem junto: id do tipo de bola e quantidade. */
  premio: { bola: string; quantidade: number };
}

export const MARCOS: readonly Marco[] = [
  {
    registros: 5,
    fala: 'cinco espécies registradas — agora há com o que comparar',
    premio: { bola: 'reforcada', quantidade: 3 },
  },
  {
    registros: 10,
    fala: 'dez registros: a Pokédex começa a parecer uma Pokédex',
    premio: { bola: 'reforcada', quantidade: 5 },
  },
  {
    registros: 25,
    fala: 'vinte e cinco — o que era fácil de achar já foi achado',
    premio: { bola: 'prisma', quantidade: 3 },
  },
  {
    registros: 50,
    fala: 'cinquenta espécies, um terço dos cento e cinquenta e um',
    premio: { bola: 'lacuna', quantidade: 1 },
  },
  {
    registros: 75,
    fala: 'setenta e cinco: metade do caminho',
    premio: { bola: 'prisma', quantidade: 5 },
  },
  {
    registros: 100,
    fala: 'cem registradas — faltam cinquenta e uma',
    premio: { bola: 'lacuna', quantidade: 2 },
  },
  {
    registros: 125,
    fala: 'cento e vinte e cinco — falta o que quase ninguém vê',
    premio: { bola: 'lacuna', quantidade: 2 },
  },
  {
    registros: 151,
    fala: 'cento e cinquenta e um. a Pokédex está completa',
    premio: { bola: 'lacuna', quantidade: 2 },
  },
];

/**
 * O marco que ESTE registro acabou de cumprir, ou `null`.
 *
 * Recebe a contagem depois da captura. Compara com igualdade e não com "maior
 * ou igual" de propósito: o marco é o instante em que o número virou aquele, e
 * quem carregou um save antigo não deve ser recebido com sete cartões
 * seguidos. Quem pulou um marco — o que não acontece capturando de um em um,
 * mas acontece se alguma coisa der mais de um registro de uma vez — perde o
 * cartão e não a próxima; é a troca certa.
 */
export function marcoDe(registros: number): Marco | null {
  return MARCOS.find((m) => m.registros === registros) ?? null;
}

/** Quantos faltam para o próximo marco, ou `null` se já passou do último. */
export function faltamPara(registros: number): { marco: Marco; faltam: number } | null {
  const proximo = MARCOS.find((m) => m.registros > registros);
  return proximo ? { marco: proximo, faltam: proximo.registros - registros } : null;
}
