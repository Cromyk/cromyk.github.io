/**
 * As condições de status — sono, paralisia, queimadura, veneno.
 *
 * ## Por que isto é o maior buraco de "cara de Pokémon" que o jogo tinha
 *
 * O combate já tinha dezoito tipos com a tabela de efetividade certa, estágios
 * de ataque e defesa, níveis, evolução e uma curva de captura calibrada. E
 * mesmo assim a briga era só *bater até a barra baixar*, porque faltava a outra
 * metade do jogo original: a condição.
 *
 * Em Pokémon, o laço de captura não é "enfraqueça e jogue a bola". É
 * **"enfraqueça, ADORMEÇA, e jogue a bola"** — e é isso que transforma o
 * arsenal numa decisão. Um golpe de status não dá dano nenhum e ainda assim é a
 * jogada certa, o que é uma ideia que nenhum outro sistema do jogo ensinava.
 *
 * ## As quatro, e por que não as outras
 *
 * - **sono** — ele para de agir e fica muito mais fácil de prender. É a
 *   condição mais valiosa, e por isso a mais curta.
 * - **paralisia** — anda e ataca devagar. Dura muito, e é a condição de
 *   controle que não tira o bicho do jogo.
 * - **queimadura** — dano por segundo e o ataque cai. Pune quem bate com o
 *   corpo.
 * - **veneno** — só dano por segundo, e o mais longo. É a condição de quem tem
 *   paciência.
 *
 * **Congelamento fica de fora**, e é uma decisão de conforto: no jogo original
 * ele tira o turno do adversário por tempo indeterminado, e num jogo em tempo
 * real isso vira um bicho parado e mudo na sua frente sem nada acontecendo. O
 * sono já ocupa esse papel, e ele tem fim à vista.
 *
 * ## O que muda na captura
 *
 * Dormindo, a chance de cada sacudida sobe muito; paralisado ou queimado, sobe
 * um pouco. É a proporção clássica, e é o que faz valer a pena gastar um golpe
 * que não machuca — ver `bonusDeCaptura`.
 */

export type Condicao = 'sono' | 'paralisia' | 'queimadura' | 'veneno';

export interface PerfilCondicao {
  id: Condicao;
  nome: string;
  /** Duas letras para a pílula do painel. */
  sigla: string;
  cor: number;
  /** Quanto tempo ela dura, em segundos. */
  duracao: number;
  /** Dano por segundo, em fração do HP máximo. Zero em quem não machuca. */
  danoPorSegundo: number;
  /** Multiplica a velocidade de andar e a de atacar. */
  fatorVelocidade: number;
  /** Multiplica o dano que ELE causa. */
  fatorAtaque: number;
  /** Ele fica parado e não reage. Só o sono. */
  imobiliza: boolean;
  /**
   * Quanto ela divide a chance de o alvo ESCAPAR da bola.
   *
   * Divide em vez de somar, como as bolas fazem (ver `chanceCaptura`): é o que
   * mantém o efeito forte num alvo já enfraquecido sem estourar o teto num alvo
   * inteiro.
   */
  ajudaNaCaptura: number;
  /** O que o aviso diz quando ela pega. */
  diz: string;
}

export const CONDICOES: Record<Condicao, PerfilCondicao> = {
  sono: {
    id: 'sono',
    nome: 'Dormindo',
    sigla: 'ZZ',
    cor: 0x9fb4f0,
    // Curta de propósito: é a condição mais forte do jogo, e uma janela de oito
    // segundos é tempo de mirar e arremessar com calma, não de ganhar a briga
    // sem lutar.
    duracao: 8,
    danoPorSegundo: 0,
    fatorVelocidade: 0,
    fatorAtaque: 0,
    imobiliza: true,
    ajudaNaCaptura: 2.5,
    diz: 'pegou no sono!',
  },
  paralisia: {
    id: 'paralisia',
    nome: 'Paralisado',
    sigla: 'PAR',
    cor: 0xffd23b,
    duracao: 18,
    danoPorSegundo: 0,
    fatorVelocidade: 0.45,
    fatorAtaque: 1,
    imobiliza: false,
    ajudaNaCaptura: 1.5,
    diz: 'está paralisado!',
  },
  queimadura: {
    id: 'queimadura',
    nome: 'Queimado',
    sigla: 'QMD',
    cor: 0xff7a3c,
    duracao: 16,
    // 1,5% do total por segundo: dezesseis segundos tiram um quarto da vida.
    // Forte, e ainda assim mais lento do que bater.
    danoPorSegundo: 0.015,
    fatorVelocidade: 1,
    fatorAtaque: 0.6,
    imobiliza: false,
    ajudaNaCaptura: 1.35,
    diz: 'está queimando!',
  },
  veneno: {
    id: 'veneno',
    nome: 'Envenenado',
    sigla: 'VEN',
    cor: 0xac5ec4,
    duracao: 24,
    danoPorSegundo: 0.012,
    fatorVelocidade: 1,
    fatorAtaque: 1,
    imobiliza: false,
    ajudaNaCaptura: 1.35,
    diz: 'foi envenenado!',
  },
};

/**
 * Quanto uma condição divide a chance de escapar da bola.
 *
 * Um só por vez — em Pokémon nunca houve dois status principais ao mesmo tempo,
 * e a regra vale aqui pelo mesmo motivo de sempre: duas coisas que se acumulam
 * viram uma coisa que se empilha, e empilhar sono com paralisia tornaria a
 * captura automática.
 */
export function bonusDeCaptura(condicao: Condicao | null): number {
  return condicao ? CONDICOES[condicao].ajudaNaCaptura : 1;
}

/**
 * Que condição um golpe deste tipo tende a causar, se causar alguma.
 *
 * Sai do TIPO e não de uma tabela por golpe, e é de propósito: o jogo tem 115
 * golpes da gen 1, e uma tabela golpe a golpe seria uma segunda fonte de
 * verdade para alguém esquecer de atualizar. O tipo já carrega a intuição certa
 * — elétrico paralisa, fogo queima, veneno envenena —, e é a mesma ideia que
 * `FAMILIA_SONORA` usa para escolher o som de cada tipo.
 *
 * O sono não sai de tipo nenhum: ele vem dos golpes de status que existem para
 * isso, e chega por outro caminho (ver `condicaoDoGolpe`).
 */
const POR_TIPO: Partial<Record<string, Condicao>> = {
  eletrico: 'paralisia',
  fogo: 'queimadura',
  veneno: 'veneno',
  inseto: 'veneno',
  gelo: 'paralisia',
};

/**
 * A condição que este golpe pode causar, e com que chance.
 *
 * Golpes de DANO têm chance pequena — é um bônus, não o plano. Golpes de
 * STATUS, que não machucam nada, aplicam sempre: gastar a vez num golpe que
 * não tira vida precisa valer alguma coisa, ou ninguém usa duas vezes.
 */
export function condicaoDoGolpe(
  tipo: string,
  categoria: 'fisico' | 'especial' | 'status',
  nome: string,
): { condicao: Condicao; chance: number } | null {
  // Os que existem para adormecer. São poucos e têm nome próprio na gen 1.
  if (/sonífero|soporífero|canto|hipnose|descanso|spore|sleep/i.test(nome)) {
    return { condicao: 'sono', chance: 0.75 };
  }

  const doTipo = POR_TIPO[tipo];
  if (!doTipo) return null;
  return { condicao: doTipo, chance: categoria === 'status' ? 0.9 : 0.16 };
}
