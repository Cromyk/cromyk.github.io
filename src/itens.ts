/**
 * A mochila, fora as bolas.
 *
 * São poucos itens de propósito. Em VR você escolhe com a mira, apontando para
 * uma carta do tamanho de um selo presa ao próprio pulso: cada item a mais é
 * uma carta a mais para acertar com o braço no ar. Três resolvem o que o jogo
 * precisa — curar, acalmar e apressar — e dá para pegar qualquer um deles sem
 * olhar duas vezes.
 */
export interface TipoItem {
  id: string;
  nome: string;
  cor: number;
  descricao: string;
  /** Quantos caem a cada captura bem-sucedida. Aceita fração. */
  recompensa: number;
  maximo: number;
}

export const ITENS: readonly TipoItem[] = [
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

export const itemPorId = (id: string) => ITENS.find((i) => i.id === id);

export const ESTOQUE_ITENS_INICIAL: Record<string, number> = {
  pocao: 2,
  fruta: 3,
  doce: 0,
};

/** Quanto a fruta melhora a próxima bola, e por quanto tempo ela vale. */
export const BONUS_FRUTA = 1.8;
export const SEGUNDOS_FRUTA = 20;
