import { PEDRAS } from './pedras';

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
