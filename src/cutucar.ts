/**
 * A CUTUCADA: a mão como objeto, apertando botão sem apertar botão.
 *
 * ## O que faltava
 *
 * *"A mão também é um objeto e precisa interagir com os botões e menu"* —
 * playtest de 19/09. O jogo já media a proximidade da mão aos painéis (ver
 * `PainelTime.alcancado`), mas só para ACENDER a carta: usar exigia fechar o
 * GRIP em cima dela. O dedo encostava no botão e o botão não fazia nada.
 *
 * Isso é defensável para pegar uma pokébola — agarrar é fechar a mão — e é
 * francamente errado para uma engrenagem, um interruptor e um botão de PC. Um
 * painel que está a um palmo de você, com botões do tamanho de uma moeda, pede
 * o gesto que a mão já sabe fazer: encostar.
 *
 * ## Por que isto não é um `if (distancia < X)`
 *
 * Porque a distância TREME. Ela é medida da ponta de um dedo rastreado até uma
 * carta pendurada num braço que também se mexe, e nos dois modos de entrada ela
 * oscila alguns milímetros por quadro sem ninguém mexer em nada. Um limiar
 * simples, a noventa quadros por segundo, dispararia o botão dezenas de vezes
 * na mesma encostada — é o mesmo chiado que fez o toque de src/toque.ts virar
 * amplitude em vez de borda.
 *
 * Então há duas coisas aqui, e as duas importam:
 *
 * - **HISTERESE.** Entra em `ENTRADA` e só rearma depois de sair de `SAIDA`.
 *   Um dedo parado na fronteira não pisca, porque a fronteira de ida não é a
 *   mesma da volta.
 * - **DESCANSO.** Mesmo saindo e voltando, há um tempo mínimo entre duas
 *   cutucadas no mesmo alvo. É o que separa "apertei duas vezes" de "minha mão
 *   tremeu".
 *
 * E há uma terceira, que é sobre intenção e não sobre ruído: **a mão que já
 * está segurando alguma coisa não cutuca**. Quem está com a pokébola na mão
 * está indo arremessar, e passar perto do painel no caminho não é escolher um
 * item. Quem lê isso é `Jogo`, que sabe o que cada mão tem.
 */

/** Onde o dedo aciona, em metros da carta. */
export const ENTRADA = 0.035;
/** E de onde ele tem de sair para poder acionar de novo. */
export const SAIDA = 0.065;
/** Tempo mínimo entre duas cutucadas no MESMO alvo, em segundos. */
export const DESCANSO = 0.45;

/** A chave de um alvo: quem ele é, para o dedo saber se mudou de botão. */
export type ChaveDeAlvo = string;

interface Estado {
  /** O alvo em que o dedo está pousado agora, ou null. */
  dentro: ChaveDeAlvo | null;
  /** Quando o último acionamento aconteceu, em segundos do relógio do jogo. */
  ultimo: number;
  /** De quem foi esse último acionamento. */
  ultimoAlvo: ChaveDeAlvo | null;
}

/**
 * Uma cutucada por mão. Ver o cabeçalho do arquivo.
 *
 * O uso é um por quadro e por mão: diga qual alvo está sob o dedo e a que
 * distância, e ele devolve `true` no ÚNICO quadro em que o botão foi apertado.
 */
export class Cutucador {
  private estados = new Map<number, Estado>();
  private relogio = 0;

  /** Anda o relógio. Uma vez por quadro, antes das perguntas. */
  passar(dt: number) {
    this.relogio += dt;
  }

  /**
   * O dedo desta mão está em cima deste alvo, a esta distância. Devolve
   * `true` no quadro em que isso vira um acionamento.
   *
   * `alvo` nulo (ou distância grande) é "o dedo saiu": é o que rearma.
   */
  cutucou(mao: number, alvo: ChaveDeAlvo | null, distancia: number): boolean {
    let estado = this.estados.get(mao);
    if (!estado) {
      estado = { dentro: null, ultimo: -Infinity, ultimoAlvo: null };
      this.estados.set(mao, estado);
    }

    // Saiu do alvo em que estava — pela distância ou porque o dedo encontrou
    // outro. Trocar de carta sem sair rearma na hora, de propósito: passar o
    // dedo de um interruptor para o vizinho é um gesto só, e esperar o dedo
    // recuar entre os dois seria exigir precisão de quem está usando a mão
    // justamente para não precisar dela.
    if (estado.dentro !== null && (alvo !== estado.dentro || distancia > SAIDA)) {
      estado.dentro = null;
    }

    if (alvo === null || distancia > ENTRADA || estado.dentro !== null) return false;

    // Dentro, e rearmado. Só falta o descanso — e ele só vale para o MESMO
    // alvo: dois botões diferentes em sequência rápida são duas decisões.
    if (estado.ultimoAlvo === alvo && this.relogio - estado.ultimo < DESCANSO) {
      // Marca como dentro mesmo assim: sem isto o dedo parado no botão
      // dispararia assim que o descanso vencesse, sem ele ter saído.
      estado.dentro = alvo;
      return false;
    }

    estado.dentro = alvo;
    estado.ultimo = this.relogio;
    estado.ultimoAlvo = alvo;
    return true;
  }

  /** Esquece o que esta mão estava fazendo. Para quando ela some de cena. */
  soltar(mao: number) {
    this.estados.delete(mao);
  }

  /** Esquece tudo — fim de sessão. */
  limpar() {
    this.estados.clear();
  }
}
