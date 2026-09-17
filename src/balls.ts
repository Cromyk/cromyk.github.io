/**
 * Tipos de bola. O multiplicador não soma na chance de captura: ele corta a
 * chance de FUGA. Uma bola 2× não dobra o acerto — ela reduz o escape pela
 * metade, que é o que faz diferença justamente nos alvos difíceis.
 */
export interface TipoBola {
  id: string;
  nome: string;
  /** Divide a chance de escapar de cada sacudida. */
  multiplicador: number;
  corTopo: number;
  corBase: number;
  descricao: string;
  /** Quantas você ganha a cada captura bem-sucedida. */
  recompensa: number;
  /** Teto do estoque. */
  maximo: number;
  /**
   * Segundos para uma unidade aparecer sozinha, sem você fazer nada.
   *
   * Existe por causa de um beco sem saída real: capturar era a ÚNICA fonte de
   * bolas, e capturar precisa de bola. Quem zerasse o estoque ficava num jogo
   * que não tinha mais como continuar nem como voltar — e sem nenhuma tela que
   * explicasse isso, porque do ponto de vista do código estava tudo certo.
   *
   * Só a Bola Comum recarrega. É o que a descrição dela sempre prometeu, e é o
   * bastante: as outras três são raridade, e raridade que se repõe sozinha
   * deixa de ser raridade.
   */
  recarga?: number;
  /**
   * Até onde a recarga enche. Fica bem abaixo do `maximo` de propósito: a rede
   * de segurança te tira do buraco, não te abastece. Encher a mochila continua
   * sendo coisa de quem caça.
   */
  tetoRecarga?: number;
}

export const BOLAS: readonly TipoBola[] = [
  {
    id: 'comum',
    nome: 'Bola Comum',
    multiplicador: 1,
    corTopo: 0xff3b30,
    corBase: 0xf2f2f5,
    descricao: 'A de sempre. Recarrega sozinha.',
    recompensa: 2,
    maximo: 12,
    // Uma a cada minuto e quinze, até seis. Zerado, você espera pouco mais de
    // um minuto pela próxima tentativa; deixando o jogo de lado, volta com as
    // seis — o relógio corre mesmo com o headset na estante.
    recarga: 75,
    tetoRecarga: 6,
  },
  {
    id: 'reforcada',
    nome: 'Bola Reforçada',
    multiplicador: 1.9,
    corTopo: 0x3b7dff,
    corBase: 0xf2f2f5,
    descricao: 'Corta pela metade a chance de escapar.',
    recompensa: 1,
    maximo: 8,
  },
  {
    id: 'prisma',
    nome: 'Bola Prisma',
    multiplicador: 3.2,
    corTopo: 0xffc53b,
    corBase: 0x2b2f3a,
    descricao: 'Para quem já escapou duas vezes.',
    recompensa: 0.4,
    maximo: 5,
  },
  {
    id: 'lacuna',
    nome: 'Bola Lacuna',
    multiplicador: 8,
    corTopo: 0xc06bff,
    corBase: 0x1a1626,
    descricao: 'Quase nunca falha. Quase nunca aparece.',
    recompensa: 0.08,
    maximo: 2,
  },
];

export const bolaPorId = (id: string) => BOLAS.find((b) => b.id === id);

export const BOLA_PADRAO = BOLAS[0];

/** Estoque inicial de quem está começando. */
export const ESTOQUE_INICIAL: Record<string, number> = {
  comum: 10,
  reforcada: 3,
  prisma: 1,
  lacuna: 0,
};
