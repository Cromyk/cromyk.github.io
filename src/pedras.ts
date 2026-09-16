/**
 * As pedras de evolução da primeira geração.
 *
 * Elas existem por uma razão de jogo, não de fidelidade: sem pedra, catorze das
 * 151 espécies evoluíam sozinhas ao chegar num nível qualquer, e isso é o
 * contrário do que elas são. Um Eevee que vira Flareon por ter feito aniversário
 * não é uma decisão; um Eevee que vira Flareon porque VOCÊ encostou a Pedra do
 * Fogo nele é a decisão mais interessante que a Pokédex tem — ela é irreversível
 * e as outras duas pedras ficam para sempre por usar naquele bicho.
 *
 * ## De onde veio o nível 28
 *
 * O `tools/pokedex.mjs` monta a tabela de evolução a partir da PokeAPI, e lá as
 * evoluções por pedra não têm nível nenhum: o gatilho é `use-item`. Como o jogo
 * só sabia evoluir por nível, o gerador inventava um 28 "plausível" para não
 * deixar a linha truncada no meio (o comentário está lá até hoje). Com as pedras
 * no jogo, esse 28 passa a atrapalhar: um Pikachu que vira Raichu sozinho torna
 * a Pedra do Trovão um item sem uso. Daí o `EVOLUI_SO_COM_PEDRA` — quem está
 * nesta tabela para de evoluir por nível, e passa a esperar a sua mão.
 *
 * Isso mora aqui e não no arquivo gerado de propósito: `pokedex.gen.ts` é
 * cuspido pela PokeAPI e não se edita à mão; ajuste de JOGO fica em código
 * escrito por gente.
 */

export interface Pedra {
  /** O mesmo id que a mochila usa. Ver src/itens.ts. */
  id: string;
  nome: string;
  /**
   * O nome na CARTA da mochila, que tem a largura de um selo.
   *
   * "Pedra do Fogo" sai como "Pedra do F…" ali — conferido desenhando a folha
   * de painéis, que é para isso que ela existe. E o que a carta precisa dizer
   * não é que aquilo é uma pedra (a cor e o formato já dizem): é QUAL delas.
   */
  curto: string;
  cor: number;
  /** Quem vira quem ao encostar nela: id da espécie -> id da evolução. */
  evolucoes: Readonly<Record<string, string>>;
}

export const PEDRAS: readonly Pedra[] = [
  {
    id: 'pedra-fogo',
    nome: 'Pedra do Fogo',
    curto: 'Fogo',
    cor: 0xff5a3c,
    evolucoes: {
      vulpix: 'ninetales',
      growlithe: 'arcanine',
      eevee: 'flareon',
    },
  },
  {
    id: 'pedra-agua',
    nome: 'Pedra da Água',
    curto: 'Água',
    cor: 0x3b9dff,
    evolucoes: {
      poliwhirl: 'poliwrath',
      shellder: 'cloyster',
      staryu: 'starmie',
      eevee: 'vaporeon',
    },
  },
  {
    id: 'pedra-trovao',
    nome: 'Pedra do Trovão',
    curto: 'Trovão',
    cor: 0xffd23b,
    evolucoes: {
      pikachu: 'raichu',
      eevee: 'jolteon',
    },
  },
  {
    id: 'pedra-folha',
    nome: 'Pedra da Folha',
    curto: 'Folha',
    cor: 0x5fd47a,
    evolucoes: {
      gloom: 'vileplume',
      weepinbell: 'victreebel',
      exeggcute: 'exeggutor',
    },
  },
  {
    id: 'pedra-lua',
    nome: 'Pedra da Lua',
    curto: 'Lua',
    cor: 0xbfa8ff,
    evolucoes: {
      nidorina: 'nidoqueen',
      nidorino: 'nidoking',
      clefairy: 'clefable',
      jigglypuff: 'wigglytuff',
    },
  },
];

export const pedraPorId = (id: string) => PEDRAS.find((p) => p.id === id);

/** É uma pedra, e não poção nem fruta? */
export const ehPedra = (id: string) => id.startsWith('pedra-');

/** Para quem esta espécie vira ao encostar nesta pedra — ou null. */
export function evolucaoPorPedra(idPedra: string, idEspecie: string): string | null {
  return pedraPorId(idPedra)?.evolucoes[idEspecie] ?? null;
}

/**
 * Quem NÃO evolui mais por nível, porque agora depende de pedra.
 *
 * Montado a partir das tabelas acima em vez de escrito à mão: acrescentar uma
 * espécie a uma pedra já a tira do caminho do nível, sem uma segunda lista para
 * alguém esquecer de atualizar.
 */
export const EVOLUI_SO_COM_PEDRA: ReadonlySet<string> = new Set(
  PEDRAS.flatMap((p) => Object.keys(p.evolucoes)),
);

/**
 * Os nomes de quem cada pedra serve, para a descrição na mochila.
 *
 * A carta do item é do tamanho de um selo, então isto entra na FICHA, não no
 * card — e é a informação que decide se vale gastar: uma Pedra da Água na mão de
 * quem tem um Eevee é uma escolha, na mão de quem não tem é um enfeite.
 */
export function aQuemServe(pedra: Pedra, nomeDe: (id: string) => string | undefined): string {
  const nomes = Object.keys(pedra.evolucoes)
    .map((id) => nomeDe(id) ?? id)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return nomes.join(', ');
}
