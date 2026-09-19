import { PEDRAS } from './pedras';
import type { Tipo } from './species';

/**
 * A mochila, fora as bolas.
 *
 * São poucos itens de propósito. Em VR você escolhe com a mira, apontando para
 * uma carta do tamanho de um selo presa ao próprio pulso: cada item a mais é
 * uma carta a mais para acertar com o braço no ar. Três resolvem o que o jogo
 * precisa — curar, acalmar e apressar — e dá para pegar qualquer um deles sem
 * olhar duas vezes.
 *
 * As cinco pedras de evolução são a exceção, e elas cabem porque **só aparecem
 * quando você tem** (ver `guardado`). Uma mochila de oito cartas seria o
 * problema que este comentário descreve; uma de três, que vira quatro no dia em
 * que uma Pedra do Fogo cai, não é.
 */
export interface TipoItem {
  id: string;
  nome: string;
  cor: number;
  descricao: string;
  /** Quantos caem a cada captura bem-sucedida. Aceita fração. */
  recompensa: number;
  maximo: number;
  /** O nome que cabe na carta, quando o completo não cabe. */
  curto?: string;
  /**
   * Some da mochila quando a conta zera, em vez de ficar como carta vazia.
   *
   * Os três básicos ficam sempre à vista: ver "0 poções" é saber que você está
   * sem poção, e isso é informação. Uma pedra que você nunca achou não é uma
   * falta — é uma coisa que ainda não entrou na sua história.
   */
  guardado?: boolean;
}

const ITENS_BASICOS: readonly TipoItem[] = [
  {
    id: 'pocao',
    nome: 'Poção',
    cor: 0x5fd47a,
    descricao: 'Devolve metade da vida de quem está em campo.',
    recompensa: 0.5,
    maximo: 9,
  },
  {
    id: 'fruta',
    nome: 'Fruta',
    cor: 0xff8a5c,
    descricao: 'Acalma o selvagem mais próximo e facilita a próxima bola.',
    recompensa: 0.7,
    maximo: 9,
  },
  {
    id: 'doce',
    nome: 'Doce Raro',
    cor: 0xd8b4ff,
    descricao: 'Um nível inteiro de uma vez. Quase nunca aparece.',
    recompensa: 0.06,
    maximo: 5,
  },
];

/**
 * As pedras, como itens de mochila.
 *
 * A tabela de quem-vira-quem mora em src/pedras.ts — aqui elas são só mais uma
 * coisa que se pega, se carrega e se encosta no bicho, exatamente como a poção.
 * O gesto é o mesmo, e é por isso que elas não precisaram de sistema nenhum.
 *
 * A recompensa é 0,03: uma pedra a cada trinta e poucas capturas, cada uma.
 * Elas são o item mais raro do jogo depois da Bola Lacuna, e têm de ser —
 * evolução por pedra é irreversível, e uma escolha que você pode refazer amanhã
 * não é uma escolha.
 */
const ITENS_PEDRA: readonly TipoItem[] = PEDRAS.map((p) => ({
  id: p.id,
  nome: p.nome,
  curto: p.curto,
  cor: p.cor,
  descricao: 'Evolui quem responde a ela. Encoste no seu Pokémon.',
  recompensa: 0.03,
  maximo: 3,
  guardado: true,
}));

export const ITENS: readonly TipoItem[] = [...ITENS_BASICOS, ...ITENS_PEDRA];

export const itemPorId = (id: string) => ITENS.find((i) => i.id === id);

export const ESTOQUE_ITENS_INICIAL: Record<string, number> = {
  pocao: 2,
  fruta: 3,
  doce: 0,
};

/** Quanto a fruta melhora a próxima bola, e por quanto tempo ela vale. */
export const BONUS_FRUTA = 1.8;
export const SEGUNDOS_FRUTA = 20;

/**
 * Que pedra a natureza devolve por um bicho de cada tipo.
 *
 * O pedido do playtest de 19/09 foi *"no PC quero poder soltar eles na
 * natureza, me desfazer, e com isso ganhar itens — não vi nenhuma pedra de
 * evolução"*, e as duas metades da frase são o mesmo problema: as pedras caem
 * a 0,03 por captura (uma a cada trinta e tantas, cada), e quem joga uma tarde
 * não vê nenhuma. Sem pedra, cinco convidadas, três pedras novas e a única
 * escolha irreversível do jogo ficam atrás de um dado.
 *
 * Soltar resolve os dois: dá utilidade ao sexto Pidgey repetido e transforma
 * "esperar cair" em "ir buscar". A pedra sai do TIPO de quem você soltou —
 * devolver um Vulpix à natureza rende a Pedra do Fogo —, o que dá a quem quer
 * um Eevee de fogo um caminho inteiro: ache um bicho de fogo, capture, solte.
 */
const PEDRA_POR_TIPO: Partial<Record<Tipo, string>> = {
  fogo: 'pedra-fogo',
  agua: 'pedra-agua',
  eletrico: 'pedra-trovao',
  planta: 'pedra-folha',
  inseto: 'pedra-folha',
  gelo: 'pedra-gelo',
  psiquico: 'pedra-lua',
  fantasma: 'pedra-lua',
  sombrio: 'pedra-lua',
  fada: 'pedra-fada',
};

/** A pedra que o tipo devolve, ou a do Sol para quem não tem par próprio. */
export function pedraDoTipo(tipos: readonly Tipo[]): string {
  for (const tipo of tipos) {
    const pedra = PEDRA_POR_TIPO[tipo];
    if (pedra) return pedra;
  }
  // Normal, lutador, terra, pedra, voador, veneno, dragão e aço não têm pedra
  // própria no jogo clássico. A do Sol é a que sobra, e ela serve ao Eevee —
  // que é onde todas as oito importam.
  return 'pedra-sol';
}

export interface Achado {
  id: string;
  quantidade: number;
}

/**
 * O que a natureza devolve por um Pokémon solto.
 *
 * Uma pedra do tipo dele, sempre — é a razão de existir do gesto —, mais
 * poções e frutas conforme o nível: um bicho que você criou até o 30 vale mais
 * do que um que acabou de ser capturado.
 *
 * Função pura porque é regra de jogo, e regra de jogo se confere em
 * `tools/smoke.ts` sem navegador nenhum.
 */
export function recompensaPorSoltar(tipos: readonly Tipo[], nivel: number): Achado[] {
  const pocoes = 1 + Math.floor(nivel / 12);
  const frutas = 1 + Math.floor(nivel / 18);
  return [
    { id: pedraDoTipo(tipos), quantidade: 1 },
    { id: 'pocao', quantidade: pocoes },
    { id: 'fruta', quantidade: frutas },
    // O Doce Raro só a partir do 25: ele vale um nível inteiro, e sair de
    // graça por um bicho de nível 5 faria o caminho mais curto do jogo ser
    // capturar e soltar em série.
    ...(nivel >= 25 ? [{ id: 'doce', quantidade: 1 }] : []),
  ];
}
