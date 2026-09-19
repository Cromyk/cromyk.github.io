import * as THREE from 'three';
import { ORCAMENTO_MS } from './diario';
import { Placa } from './hud';

/**
 * O contador de quadros — item 0.1 do roteiro, e o motivo de ele ser zero.
 *
 * Até agora o jogo não media nada. `grep -i fps src/` não devolvia uma linha, e
 * três coisas que custam quadro entraram no mesmo dia: o fogo (sprites aditivos
 * por bicho), o feixe de mira (um cilindro por mão) e a mochila (onze objetos
 * 3D com onze texturas de canvas). Ninguém sabia quanto. Toda decisão de
 * performance era chute.
 *
 * ## O que ele mostra, e por que estas três coisas
 *
 * - **Média** do último segundo — o número que se compara entre duas versões.
 * - **Pior caso** do último segundo — o que a média esconde e o corpo sente. Um
 *   jogo a 90 de média com um quadro de 40 ms a cada segundo não é um jogo a
 *   90: é um jogo que tranca, e trancar em VR é o que embrulha o estômago.
 * - **Draw calls** — porque quando o número piorar, a primeira pergunta vai ser
 *   "o que entrou em cena", e essa é a medida que responde.
 *
 * ## Por que a média é do tempo, e não a contagem de quadros
 *
 * Contar quadros por segundo tem um teto: o runtime do headset segura em 90 e a
 * conta nunca passa disso, mesmo com folga de sobra. O tempo de quadro não tem
 * teto para baixo — 6 ms num orçamento de 11,1 diz "cabe outra coisa", e 90 fps
 * não diz nada. Os dois aparecem, mas quem manda é o milissegundo.
 *
 * ## Onde ele fica
 *
 * Preso à câmera, no canto inferior, pequeno e translúcido. É a única coisa do
 * jogo que fica presa à cabeça, e é de propósito: um medidor que só se lê
 * virando o pulso não é lido enquanto se joga, que é justamente quando o número
 * interessa. A regra de não mexer na câmera continua valendo — isto não mexe
 * nela, só pendura uma plaquinha.
 */

// O orçamento vive em src/diario.ts, junto de quem o usa para julgar a
// sessão inteira. Reexportado aqui porque este arquivo era a casa dele e há
// quem o importe daqui — mas a definição é uma só.
export { ORCAMENTO_MS } from './diario';

export class Medidor {
  readonly grupo = new THREE.Group();

  private placa = new Placa(0.19, 0.075, 380);
  private amostras: number[] = [];
  private desdeODesenho = 0;
  /** Só redesenha a textura dez vezes por segundo: ela é um canvas. */
  private static readonly INTERVALO = 0.1;

  private ultimaMedia = -1;
  private ultimoPior = -1;
  private ultimasChamadas = -1;

  constructor() {
    this.grupo.add(this.placa.malha);
    // Canto inferior esquerdo do campo de visão, a meio metro. Longe do centro,
    // onde o jogo acontece, e longe do painel do pulso.
    this.placa.malha.position.set(-0.17, -0.15, -0.5);
    this.grupo.visible = false;
    this.escrever(0, 0, 0);
  }

  /**
   * Um quadro. `dt` em segundos, `info` é o `renderer.info` do three.
   *
   * Chamado mesmo com o medidor desligado? Não: quem chama pula quando está
   * desligado, e a janela de amostras é limpa ao ligar. Um medidor que acumula
   * escondido mostraria, no primeiro segundo depois de ligado, a média de
   * quando ninguém estava olhando.
   */
  atualizar(dt: number, chamadas: number) {
    this.amostras.push(dt * 1000);
    // Um segundo de janela a 90 Hz. O corte é por contagem e não por soma de
    // tempo porque a soma cresce justamente quando o jogo trava, e aí a janela
    // encolheria na hora em que ela mais precisa ser estável.
    if (this.amostras.length > 90) this.amostras.shift();

    this.desdeODesenho += dt;
    if (this.desdeODesenho < Medidor.INTERVALO) return;
    this.desdeODesenho = 0;

    let soma = 0;
    let pior = 0;
    for (const ms of this.amostras) {
      soma += ms;
      if (ms > pior) pior = ms;
    }
    const media = soma / Math.max(this.amostras.length, 1);

    // Redesenhar um canvas é caro o bastante para o medidor mentir sobre si
    // mesmo: só reescreve quando algum número mudou o que se vê.
    const m = Math.round(media * 10) / 10;
    const p = Math.round(pior * 10) / 10;
    if (m === this.ultimaMedia && p === this.ultimoPior && chamadas === this.ultimasChamadas) return;
    this.ultimaMedia = m;
    this.ultimoPior = p;
    this.ultimasChamadas = chamadas;
    this.escrever(m, p, chamadas);
  }

  private escrever(media: number, pior: number, chamadas: number) {
    const fps = media > 0 ? Math.round(1000 / media) : 0;
    // Verde enquanto cabe no orçamento, amarelo no limite, vermelho quando
    // estourou. O pior caso é quem decide a cor, não a média — ver o cabeçalho.
    const cor = pior <= ORCAMENTO_MS ? '#7fe0a4' : pior <= ORCAMENTO_MS * 1.5 ? '#ffd23b' : '#ff7a5c';
    const num = (v: number) => v.toFixed(1).replace('.', ',');

    this.placa.escrever(
      [
        { texto: `${num(media)} ms · ${fps} fps`, tamanho: 34, cor, peso: 700 },
        { texto: `pior ${num(pior)} ms · orçamento ${num(ORCAMENTO_MS)}`, tamanho: 19, cor: '#9aa5b8', peso: 500, espaco: 4 },
        { texto: `${chamadas} draw calls`, tamanho: 19, cor: '#9aa5b8', peso: 500 },
      ],
      { raio: 10, fundo: 'rgba(8, 12, 19, 0.82)', borda: 'rgba(255,255,255,0.12)' },
    );
  }

  definirVisivel(visivel: boolean) {
    if (visivel === this.grupo.visible) return;
    this.grupo.visible = visivel;
    // Liga limpo: a janela de amostras de antes descreveria um jogo que ninguém
    // estava vendo.
    this.amostras.length = 0;
    this.desdeODesenho = Medidor.INTERVALO;
    this.ultimaMedia = -1;
  }

  descartar() {
    this.placa.descartar();
    this.grupo.removeFromParent();
  }
}
