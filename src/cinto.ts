import * as THREE from 'three';
import { Holobola } from './holo';
import { BOLAS, type TipoBola } from './balls';
import { AVISO, forcaDeToque } from './toque';

/**
 * O cinto de pokébolas, um em cada antebraço.
 *
 * Antes as bolas eram CARDS no painel do pulso: você girava o pulso para abrir
 * o painel, mirava a mão numa carta e apertava o grip. Funcionava, mas era um
 * menu — e menu é a coisa que a realidade misturada existe para não precisar.
 * Aqui elas são objetos: quatro bolas de verdade presas ao seu antebraço, que
 * você alcança com a outra mão e pega.
 *
 * ## Por que o antebraço, e não a cintura
 *
 * A cintura é onde um treinador usaria, e foi a primeira ideia. Mas o Quest não
 * rastreia o seu quadril: ele rastreia a sua cabeça e as suas mãos. Uma bola
 * "na cintura" ficaria presa a uma altura adivinhada a partir da cabeça, e
 * mudaria de lugar toda vez que você se abaixasse. O antebraço é rastreado de
 * verdade, está sempre no campo de visão quando você olha para ele, e a mão
 * outra mão já sabe chegar lá — é o mesmo alcance de quem coça o braço.
 *
 * ## Um em cada braço, desde 18/09
 *
 * A mão que CARREGA o cinto não alcança o próprio antebraço, então um cinto só,
 * no braço esquerdo, queria dizer que apenas a mão direita podia tirar uma bola
 * — e quem prefere arremessar com a esquerda não tinha de onde pegar. Com um em
 * cada braço, qualquer mão pega do braço oposto. O estoque é o mesmo nos dois:
 * é uma mochila, não duas.
 *
 * ## O que é um slot
 *
 * Um slot é um tipo de bola. Ele mostra a bola em miniatura, flutuando e
 * girando devagar, com a quantidade ao lado. Vazio, a bola fica apagada e
 * translúcida: o lugar continua lá, porque saber que a Bola Lacuna existe e
 * acabou é informação, e um buraco no cinto não conta isso.
 *
 * Quando você tira uma bola dali, o slot fica **aberto** — a bola de luz cai
 * para um fantasma que pulsa. É o que diz para onde devolver, e é o que permite
 * ao jogo distinguir "guardei de volta" de "abri a mão no ar", que são o mesmo
 * gesto em lugares diferentes.
 *
 * ## De plástico para luz, em 18/09
 *
 * As quatro bolas eram objetos sólidos, com a mesma geometria da bola de
 * verdade, encostadas no antebraço. O pedido do playtest foi *"quero pokébolas
 * flutuantes do tipo holograma para poder alcançar com a mão e pegar"*, e ele
 * aponta dois problemas reais:
 *
 * - **Coladas.** A dois centímetros do braço, a bola some sob a própria luva
 *   quando a outra mão chega — você fecha o grip sobre uma coisa que já não vê.
 *   Agora elas flutuam a quatro centímetros, fora da silhueta do antebraço.
 * - **Opacas.** Uma bola de plástico no braço tapa o seu quarto e fica com cara
 *   de adesivo. Feita de luz (ver src/holo.ts), ela brilha por cima do
 *   passthrough e deixa ver o que está atrás — que é o que uma projeção presa
 *   ao braço deveria parecer.
 *
 * A bola de verdade continua sólida: ela existe quando está na sua mão e
 * quando voa. O cinto mostra a PROJEÇÃO do que você tem guardado.
 */

/** Raio da miniatura. A bola de verdade tem 4,5 cm; esta é pouco mais da metade. */
const RAIO = 0.026;
/**
 * Distância entre um slot e o próximo, ao longo do antebraço.
 *
 * Subiu de 5,8 para 6,6 cm depois do playtest de 18/09, e o motivo é a conta
 * abaixo: com 5,8 de passo e 7 de alcance, os campos de dois slots vizinhos se
 * sobrepunham em mais de um centímetro de cada lado. `slotSob` escolhe o mais
 * perto e nunca erra feio, mas na zona de sobreposição a mão precisa de menos
 * de 3 cm de precisão para pegar a bola que você QUER — e 3 cm é menos do que
 * um braço no ar entrega, ainda mais com a outra mão tapando o alvo.
 *
 * Quatro slots a 6,6 cm, começando 7,5 cm atrás do punho, terminam a 27 cm —
 * o comprimento de um antebraço adulto. Mais do que isto e o último slot sai
 * para fora do cotovelo.
 */
export const PASSO_SLOT = 0.066;
/** Onde o primeiro slot começa, medido para trás a partir do punho. */
export const INICIO_SLOT = 0.075;

/**
 * Quão perto a mão precisa chegar para o slot contar como alcançado.
 *
 * Generoso de propósito: a mão que vem pegar tapa o slot no meio do caminho, e
 * exigir precisão de milímetro num alvo que você não está vendo é o tipo de
 * coisa que faz alguém fechar o grip três vezes até funcionar.
 *
 * Quem mede a distância é o CENTRO DA MÃO FECHADA e não a ponta do dedo — ver
 * `slotSobAMao`, em src/game.ts. Esse era o defeito principal: a ponta do
 * indicador vai uns seis centímetros à frente da palma, então a mão chegava ao
 * slot já tendo passado por ele.
 */
export const ALCANCE_SLOT = 0.075;

interface Slot {
  tipo: TipoBola;
  /** O lugar dele no antebraço. Fica onde está mesmo com a bola na sua mão. */
  base: THREE.Group;
  /** A bola de luz, que vira fantasma enquanto você a segura. */
  bola: Holobola;
  quantidade: number;
  /** Você tirou esta bola e ainda não devolveu. */
  aberto: boolean;
  fase: number;
}

export class Cinto {
  readonly grupo = new THREE.Group();

  private slots: Slot[] = [];
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private tempo = 0;
  /** O slot sob a mão neste quadro, para ele crescer e o resto não. */
  private destacado = -1;
  /** Quanto a mão está encostando nele, de 0 a 1. Ver `destacar`. */
  private forca = 0;

  constructor(lado: 'left' | 'right' = 'left') {
    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    // Pela convenção do grip space, −Z é para onde os dedos apontam, então o
    // antebraço sai por +Z. O dorso é −X na esquerda e +X na direita: é a face
    // que você vê ao levantar o braço, e é onde as bolas ficam.
    const ladoDoDorso = lado === 'left' ? -1 : 1;

    for (let i = 0; i < BOLAS.length; i++) {
      const tipo = BOLAS[i];

      const base = new THREE.Group();
      // Quatro centímetros para fora do antebraço, e não dois.
      //
      // A conta é a da mão que vem pegar: a luva tem uns quatro centímetros de
      // meia-largura, então uma bola a dois centímetros do eixo do braço nasce
      // DENTRO da silhueta da própria luva. Ela aparecia enquanto o braço
      // estava sozinho e sumia no instante em que a outra mão chegava — que é
      // justamente o instante em que você precisa vê-la.
      base.position.set(ladoDoDorso * 0.04, 0.015, INICIO_SLOT + i * PASSO_SLOT);

      // Cada uma fora de fase: quatro bolas subindo juntas viram um elevador,
      // e quatro subindo em tempos diferentes viram quatro bolas.
      const bola = new Holobola(RAIO, i * 1.7);
      bola.definirCores(tipo.corTopo, tipo.corBase);
      // Deitada, a faixa vira um disco e some do canto do olho; de pé, ela é o
      // que faz a silhueta ler como pokébola.
      bola.grupo.rotation.x = Math.PI * 0.5;
      base.add(bola.grupo);

      this.grupo.add(base);
      this.slots.push({ tipo, base, bola, quantidade: 0, aberto: false, fase: i * 1.7 });
    }

    // `guardar` continua existindo para quem vier depois precisar de geometria
    // própria; hoje a bola de luz cuida dos materiais dela.
    void guardar;
  }

  /** Quantas bolas de cada tipo o cinto mostra. */
  definirEstoque(quantidadeDe: (id: string) => number) {
    for (const slot of this.slots) slot.quantidade = quantidadeDe(slot.tipo.id);
  }

  /** Marca que esta bola saiu para a mão (ou voltou). */
  definirAberto(id: string, aberto: boolean) {
    for (const slot of this.slots) {
      if (slot.tipo.id === id) slot.aberto = aberto;
    }
  }

  /** Fecha todos os slots. Usado quando a mão perde o que estava segurando. */
  fecharTudo() {
    for (const slot of this.slots) slot.aberto = false;
  }

  /**
   * O slot mais perto deste ponto do mundo, dentro do alcance.
   *
   * Devolve o mais PRÓXIMO, e não o primeiro que serve: os slots estão a menos
   * de seis centímetros um do outro e o alcance é maior do que isso, então
   * quase sempre dois competem — e o que vale é aquele em que a mão está
   * realmente em cima.
   */
  slotSob(ponto: THREE.Vector3, alcance = ALCANCE_SLOT): TipoBola | null {
    let melhor: Slot | null = null;
    let menor = alcance * alcance;
    const centro = new THREE.Vector3();
    for (const slot of this.slots) {
      slot.base.getWorldPosition(centro);
      const d = centro.distanceToSquared(ponto);
      if (d < menor) {
        menor = d;
        melhor = slot;
      }
    }
    return melhor?.tipo ?? null;
  }

  /**
   * Qual slot a mão está alcançando, e QUANTO — de 0 a 1.
   *
   * Recebe os dois pontos da mão, e não um: é o mesmo par que `slotSobAMao`
   * usa para decidir o que o GRIP pega — o centro da palma primeiro, a ponta do
   * dedo como segunda chance. Passar só a palma abria uma casca de uns seis
   * centímetros em que o grip levava um slot que NUNCA tinha acendido; o que
   * acende passa a ser, por construção, o que o grip leva.
   *
   * A força devolvida alimenta as duas coisas ao mesmo tempo: a bola de luz
   * cresce com ela e a mão vibra com ela (ver src/toque.ts). Um destaque que só
   * liga e desliga lê como "apareceu"; este lê como "estou chegando".
   */
  destacar(agarre: THREE.Vector3 | null, dedo: THREE.Vector3 | null = null): number {
    this.destacado = -1;
    if (!agarre && !dedo) return 0;

    const centro = new THREE.Vector3();
    let menor = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].base.getWorldPosition(centro);
      const d = Math.min(
        agarre ? centro.distanceTo(agarre) : Infinity,
        dedo ? centro.distanceTo(dedo) : Infinity,
      );
      if (d < menor) {
        menor = d;
        this.destacado = i;
      }
    }
    if (this.destacado < 0) return 0;

    const slot = this.slots[this.destacado];
    // Slot vazio ou com a bola na sua mão não vibra e não acende: o lugar dela
    // continua ali, mas não há o que pegar.
    if (slot.quantidade <= 0 || slot.aberto) {
      this.destacado = -1;
      return 0;
    }
    this.forca = forcaDeToque(menor, ALCANCE_SLOT, AVISO.slot);
    if (this.forca <= 0) this.destacado = -1;
    return this.forca;
  }

  atualizar(dt: number) {
    this.tempo += dt;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const vazio = slot.quantidade <= 0;
      const temBola = !vazio && !slot.aberto;

      // Três estados, e cada um é uma coisa diferente:
      //
      // - cheia: a bola de luz inteira, brilhando;
      // - vazia: um fantasma parado — o LUGAR dela continua, a bola não;
      // - aberta: você está segurando esta bola. O fantasma pulsa, porque é
      //   para cá que ela volta se você mudar de ideia.
      const pulso = slot.aberto ? 0.1 + Math.abs(Math.sin(this.tempo * 3)) * 0.14 : 0;
      slot.bola.definirCheia(slot.aberto ? pulso : vazio ? 0.1 : 1);
      slot.bola.atualizar(dt, this.tempo, i === this.destacado && temBola ? this.forca : 0);
    }
  }

  descartar() {
    for (const slot of this.slots) slot.bola.descartar();
    this.grupo.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
    this.descartaveis = [];
  }
}
