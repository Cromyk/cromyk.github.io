/**
 * Os três jeitos de jogar.
 *
 * O jogo nasceu só com um: selvagens aparecendo sozinhos e batalha resolvida no
 * automático. Isso serve para caçar, mas não serve para as duas outras coisas
 * que se quer fazer num quarto de verdade — passar um tempo com o bicho que já
 * é seu, sem ninguém aparecendo para brigar; e sair procurando encontro sabendo
 * que cada um deles é uma escolha, não uma emboscada.
 *
 * Cada modo é só um punhado de chaves. Quem lê essas chaves é o game.ts, e
 * nenhuma delas liga ou desliga sistema inteiro: o que muda é quem nasce, quem
 * revida, e de quem é a decisão do golpe.
 */
export type ModoId = 'batalha' | 'relaxante' | 'safari';

export interface Modo {
  id: ModoId;
  nome: string;
  /** Uma linha, que cabe num card de 7 cm no pulso. */
  resumo: string;
  cor: string;
  /** Selvagens aparecem sozinhos com o tempo. */
  spawnAutomatico: boolean;
  /** Selvagem em campo revida sem você mandar. */
  selvagemRevida: boolean;
  /**
   * O golpe sai de um menu com os nomes, em vez de o jogo escolher o mais
   * eficaz contra o alvo.
   */
  escolheGolpe: boolean;
  /** Quem aparece fica em paz até você aceitar o encontro. */
  perguntaAntesDaBatalha: boolean;
  /** Segundos entre um nascimento e outro, quando há spawn. */
  intervaloSpawn: [number, number];
}

export const MODOS: readonly Modo[] = [
  {
    id: 'batalha',
    nome: 'Batalha',
    resumo: 'você escolhe o golpe',
    cor: '#ff8a6b',
    spawnAutomatico: true,
    selvagemRevida: true,
    escolheGolpe: true,
    perguntaAntesDaBatalha: false,
    intervaloSpawn: [6, 12],
  },
  {
    id: 'relaxante',
    nome: 'Relaxante',
    resumo: 'só você e ele',
    cor: '#7fd6a8',
    spawnAutomatico: false,
    selvagemRevida: false,
    escolheGolpe: false,
    perguntaAntesDaBatalha: false,
    intervaloSpawn: [0, 0],
  },
  {
    id: 'safari',
    nome: 'Safari',
    resumo: 'encarar é opcional',
    cor: '#8ab6ff',
    spawnAutomatico: true,
    selvagemRevida: false,
    escolheGolpe: false,
    perguntaAntesDaBatalha: true,
    intervaloSpawn: [8, 16],
  },
];

export const MODO_PADRAO = MODOS[0];

export const modoPorId = (id: string): Modo | undefined => MODOS.find((m) => m.id === id);
