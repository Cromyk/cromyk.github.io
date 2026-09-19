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
 * ## Da cintura para o antebraço, e de volta para a cintura
 *
 * A cintura foi a primeira ideia e foi descartada com um argumento que estava
 * certo na época: *"o Quest não rastreia o seu quadril, e uma bola na cintura
 * ficaria presa a uma altura adivinhada a partir da cabeça"*. Então as bolas
 * foram para o antebraço, que é rastreado de verdade.
 *
 * O playtest de 19/09 desfez isso em uma frase: **"tirar as pokébolas do
 * antebraço, colocar no cinto do personagem, olhando para baixo e agarrando
 * com qualquer mão"**. E ele tem razão, por dois motivos que só aparecem com
 * o headset:
 *
 * - **o antebraço some quando você precisa dele.** Para pegar uma bola do
 *   braço esquerdo você tem de levantar o braço esquerdo E levar a direita
 *   até ele: duas mãos ocupadas, os dois braços no ar, no meio de uma briga.
 *   Na cintura, é uma mão só, e o braço desce sozinho por gravidade.
 * - **é o gesto do desenho.** Você olha para baixo e pega — e é esse gesto que
 *   a realidade misturada tem de graça e um menu nunca vai ter.
 *
 * ## O quadril continua não sendo rastreado — e agora dá para viver com isso
 *
 * O que mudou não foi o hardware, foi o que o jogo sabe do seu quarto. O chão
 * é medido a cada passo por hit-test (ver src/room.ts), então a altura da
 * cintura deixou de ser um palpite solto: ela é a cabeça menos um tronco, com
 * um piso para não afundar no carpete quando você se agacha.
 *
 * E o RUMO é o problema de verdade. Um cinto preso ao yaw da cabeça gira a
 * cada olhada, e você nunca alcança a mesma bola duas vezes; um cinto que não
 * gira fica nas suas costas assim que você vira. A saída é a zona morta: ele
 * ignora os primeiros cinquenta graus e só então acompanha, devagar. Olhar
 * para o lado não mexe nele; virar o corpo, sim.
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
 * Distância entre um slot e o próximo, ao longo da cintura.
 *
 * Onze centímetros, contra os 6,6 do antebraço, e é a mudança de escala que a
 * cintura permite: um antebraço tem 27 cm úteis e tinha de caber quatro slots
 * neles; a frente de uma cintura tem quase meio metro. Com o passo maior, a
 * zona onde dois slots disputam a mesma mão encolhe, e a precisão que o gesto
 * pede cai junto.
 *
 * Quatro slots a 11 cm ocupam 33 cm — da anca esquerda à direita, que é
 * exatamente onde a mão cai quando o braço relaxa.
 */
export const PASSO_SLOT = 0.11;
/** O deslocamento lateral do primeiro slot: metade da fileira, para a esquerda. */
export const INICIO_SLOT = -0.165;

/**
 * A que distância da CABEÇA a cintura fica, e onde ela para de descer.
 *
 * Sessenta centímetros abaixo dos olhos é a cintura de quem está de pé. Como
 * o quadril não é rastreado, a conta acompanha a cabeça — quem senta leva o
 * cinto junto, que é o certo —, mas com um piso: agachado até o chão, a
 * cintura pararia dentro do carpete, e as bolas ficariam enterradas
 * justamente no gesto de olhar para baixo.
 */
export const ALTURA_DA_CINTURA = 0.6;
export const CINTURA_MINIMA_DO_CHAO = 0.38;
/** O quanto a fileira fica à frente do corpo. */
export const CINTURA_A_FRENTE = 0.17;

/**
 * Quantos graus a cabeça gira antes de o cinto acompanhar.
 *
 * É o número que decide se a cintura funciona. Preso ao yaw da cabeça, o
 * cinto gira a cada olhada e você nunca alcança a mesma bola duas vezes;
 * parado, ele fica nas suas costas assim que você vira o corpo.
 *
 * Cinquenta graus é mais do que qualquer olhada de canto de olho e menos do
 * que virar o corpo. Dentro deles o cinto não se mexe; passando, ele persegue
 * devagar — ver `posicionar`.
 */
export const ZONA_MORTA_DO_RUMO = Math.PI * 0.28;

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
export const ALCANCE_SLOT = 0.1;

/**
 * O quanto o slot já escolhido desconta da própria distância para continuar
 * sendo o escolhido.
 *
 * ## O número saiu de uma conta, e não do primeiro palpite
 *
 * A auditoria pedia "uns 15%". Com os slots a 6,6 cm um do outro, a conta
 * dessa vantagem é
 *
 *     imunidade = (passo / 2) · (1 − v) / (1 + v)
 *
 * e 15% (v = 0,85) dá **2,7 milímetros** — menos do que um braço estendido
 * treme. Ou seja: o remédio existiria no código e a bola continuaria trocando
 * sozinha, que é a pior categoria de conserto.
 *
 * Trinta por cento (v = 0,70) dá 5,8 mm de imunidade, e a troca passa a
 * acontecer a 5,8 mm da metade num passo de 66 — dezoito por cento do caminho
 * fica "grudado" no slot atual, e os outros 82% continuam trocando como antes.
 *
 * Acima disso a conta vira o defeito oposto: com v = 0,6 seriam 8,3 mm, e a
 * mão que se move devagar de um slot para o vizinho passaria por uma zona
 * grande em que nada acende.
 */
export const VANTAGEM_DO_ESCOLHIDO = 0.7;

/**
 * Qual slot a mão está escolhendo.
 *
 * ## Por que não é só "o mais perto"
 *
 * Os quatro slots dividem o mesmo X e o mesmo Y e estão a 6,6 cm um do outro ao
 * longo do antebraço, então a fronteira entre dois vizinhos fica a 3,3 cm de
 * cada um. Com a mão parada em cima dessa fronteira, um milímetro de ruído do
 * rastreamento troca o escolhido — e a bola destacada pisca entre duas.
 *
 * Isso sempre existiu e era invisível: o destaque era um booleano que ligava e
 * desligava num objeto pequeno. Depois que a rampa do toque entrou, a bola
 * CRESCE e a mão VIBRA conforme o braço chega — e a troca sozinha passou a ser
 * vista e sentida.
 *
 * ## A regra
 *
 * Quem já estava escolhido no quadro anterior compara com 85% da própria
 * distância. Para perder o posto, o vizinho precisa estar claramente mais
 * perto, e não empatado.
 *
 * O alcance é testado ANTES da vantagem, de propósito: a vantagem desempata
 * entre slots que a mão alcança, e não estica o braço de ninguém.
 */
export function escolherSlot(
  distancias: readonly number[],
  anterior: number,
  alcance: number,
  vantagem = VANTAGEM_DO_ESCOLHIDO,
): number {
  let melhor = -1;
  let menor = Infinity;
  for (let i = 0; i < distancias.length; i++) {
    const d = distancias[i];
    if (!(d <= alcance)) continue;
    const peso = i === anterior ? d * vantagem : d;
    if (peso < menor) {
      menor = peso;
      melhor = i;
    }
  }
  return melhor;
}

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

/** Reaproveitado nas medições por quadro, para não alocar por slot. */
const _centro = new THREE.Vector3();
const _alvo = new THREE.Vector3();

export class Cinto {
  readonly grupo = new THREE.Group();

  private slots: Slot[] = [];
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private tempo = 0;
  /** O slot sob a mão neste quadro, para ele crescer e o resto não. */
  private destacado = -1;
  /** Quanto a mão está encostando nele, de 0 a 1. Ver `destacar`. */
  private forca = 0;

  /** O rumo que o cinto está encarando. Ver `posicionar`. */
  private rumo = 0;
  /** Quanto você está olhando para baixo, de 0 a 1. Ver `posicionar`. */
  private olhandoParaBaixo = 0;
  private pronto = false;

  constructor() {
    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    for (let i = 0; i < BOLAS.length; i++) {
      const tipo = BOLAS[i];

      const base = new THREE.Group();
      // Lado a lado na frente da cintura, da esquerda para a direita, e um
      // palmo à frente do corpo: é onde a mão cai quando o braço relaxa, e é
      // onde ela chega sem você ter de levantar o outro braço.
      //
      // O arco é de raio grande (a fileira encurva de leve para acompanhar o
      // corpo) porque uma fileira reta na frente da barriga tem as pontas
      // longe demais: o slot da ponta ficaria a 25 cm do quadril.
      const x = INICIO_SLOT + i * PASSO_SLOT;
      base.position.set(x, 0, CINTURA_A_FRENTE - (x * x) / 0.9);

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

  /**
   * Põe o cinto na sua cintura, neste quadro.
   *
   * ## A altura
   *
   * Sai da cabeça, porque o quadril não é rastreado — mas com um piso vindo do
   * chão medido, que existe desde que a sala passou a sondar o piso a cada
   * passo. Sem ele, agachar enterraria as bolas no carpete bem no gesto de
   * olhar para baixo.
   *
   * ## O rumo, que é o problema de verdade
   *
   * Preso ao yaw da cabeça, o cinto gira a cada olhada e você nunca alcança a
   * mesma bola duas vezes. Parado, ele fica nas suas costas assim que você
   * vira o corpo. A zona morta resolve os dois: dentro de cinquenta graus ele
   * não se mexe, e passando disso persegue devagar — o suficiente para
   * acompanhar quem virou de verdade e lento o bastante para não seguir um
   * olhar.
   *
   * ## Olhar para baixo acende
   *
   * Foi o gesto pedido, e é o que dá ao cinto o mesmo contrato que o painel do
   * pulso tem: ele existe o tempo todo, discreto, e se mostra quando você o
   * procura. Sem isso, quatro bolas acesas na cintura ficariam no canto do
   * olho a sessão inteira.
   */
  posicionar(dt: number, cabeca: THREE.Vector3, rumoDaCabeca: number, inclinacao: number, pisoY: number) {
    const altura = Math.max(pisoY + CINTURA_MINIMA_DO_CHAO, cabeca.y - ALTURA_DA_CINTURA);
    const alvo = _alvo.set(cabeca.x, altura, cabeca.z);
    // No primeiro quadro ele aparece no lugar certo, sem vir voando da
    // origem do mundo.
    if (!this.pronto) {
      this.grupo.position.copy(alvo);
      this.rumo = rumoDaCabeca;
      this.pronto = true;
    } else {
      this.grupo.position.lerp(alvo, Math.min(1, dt * 6));
    }

    // A zona morta: a diferença é normalizada para meia volta, senão cruzar
    // ±π manda o cinto girar o caminho longo.
    let diferenca = rumoDaCabeca - this.rumo;
    while (diferenca > Math.PI) diferenca -= Math.PI * 2;
    while (diferenca < -Math.PI) diferenca += Math.PI * 2;
    const fora = Math.abs(diferenca) - ZONA_MORTA_DO_RUMO;
    if (fora > 0) {
      this.rumo += Math.sign(diferenca) * Math.min(fora, dt * 2.4);
    }
    this.grupo.rotation.y = this.rumo;

    // `inclinacao` é quanto a cabeça olha para baixo, de −1 (teto) a 1 (chão).
    // A partir de um terço ele começa a acender, e acende de vez perto de dois
    // terços — que é a inclinação de quem está olhando para a própria cintura.
    const quer = THREE.MathUtils.clamp((inclinacao - 0.3) / 0.35, 0, 1);
    this.olhandoParaBaixo += (quer - this.olhandoParaBaixo) * Math.min(1, dt * 7);
  }

  /** O quanto ele está aceso agora, de 0 a 1. Ver `posicionar`. */
  get aceso(): number {
    return this.olhandoParaBaixo;
  }

  /**
   * O quanto ESTA mão está chegando no cinto, sem mexer em nada.
   *
   * Existe porque agora são duas mãos disputando os mesmos quatro slots, e
   * `destacar` tem efeito colateral — ele escolhe o slot aceso e guarda a
   * escolha para a histerese do quadro seguinte. Chamá-lo uma vez por mão
   * faria a segunda apagar a decisão da primeira, e a bola acesa piscaria
   * entre as duas mãos.
   *
   * Então o jogo pergunta primeiro (aqui), escolhe a mão mais perto, e só
   * então chama `destacar` uma vez.
   */
  forcaDaMao(agarre: THREE.Vector3, dedo: THREE.Vector3): number {
    let menor = Infinity;
    const centro = _centro;
    for (const slot of this.slots) {
      slot.base.getWorldPosition(centro);
      menor = Math.min(menor, centro.distanceTo(agarre), centro.distanceTo(dedo));
    }
    return forcaDeToque(menor, ALCANCE_SLOT, AVISO.slot);
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
    // A MESMA escolha do destaque, com a mesma vantagem: o que o GRIP pega tem
    // de ser o que acendeu, sempre. Duas regras parecidas em dois lugares dão
    // exatamente o bug que a rampa do toque tornou visível — acende um, pega o
    // outro.
    const i = escolherSlot(this.distancias(ponto), this.destacado, alcance);
    return i < 0 ? null : this.slots[i].tipo;
  }

  /** A distância da mão a cada slot, reaproveitando o vetor de medição. */
  private distancias(ponto: THREE.Vector3): number[] {
    const centro = _centro;
    const saida: number[] = [];
    for (const slot of this.slots) {
      slot.base.getWorldPosition(centro);
      saida.push(centro.distanceTo(ponto));
    }
    return saida;
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
    // O anterior é lido ANTES de qualquer coisa: é ele que tem a vantagem, e
    // zerar primeiro faria a histerese não existir — o bug que este próprio
    // item veio consertar, escrito de novo uma linha acima.
    const anterior = this.destacado;
    this.destacado = -1;
    if (!agarre && !dedo) return 0;

    // A menor das duas distâncias por slot — palma e ponta do dedo —, e a
    // escolha com a vantagem de quem já estava aceso. Ver `escolherSlot`.
    const centro = _centro;
    const distancias: number[] = [];
    for (const slot of this.slots) {
      slot.base.getWorldPosition(centro);
      distancias.push(
        Math.min(
          agarre ? centro.distanceTo(agarre) : Infinity,
          dedo ? centro.distanceTo(dedo) : Infinity,
        ),
      );
    }
    // O alcance de AVISO, e não o de agarre: quem acende é a banda inteira da
    // rampa, e é dentro dela que a troca sozinha aparecia.
    this.destacado = escolherSlot(distancias, anterior, AVISO.slot);
    if (this.destacado < 0) return 0;
    const menor = distancias[this.destacado];

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
      // E tudo isso multiplicado por OLHAR PARA BAIXO.
      //
      // O cinto tem o mesmo contrato do painel do pulso: existe o tempo todo,
      // discreto, e se mostra quando você o procura. Quatro bolas acesas na
      // cintura a sessão inteira ficariam no canto do olho o jogo inteiro — e
      // o canto do olho, em MR, é onde o seu quarto está.
      //
      // Não some de vez: 35% de brilho mesmo olhando para a frente é o
      // bastante para você lembrar que elas estão ali, e pouco para competir
      // com o Pokémon à sua frente.
      const olhar = 0.35 + this.olhandoParaBaixo * 0.65;
      slot.bola.definirCheia((slot.aberto ? pulso : vazio ? 0.1 : 1) * olhar);
      // A escala acompanha, mas de leve: crescer 12% ao ser olhado é o que faz
      // o cinto parecer responder, e mais do que isso vira zoom.
      const escala = 0.88 + this.olhandoParaBaixo * 0.12;
      slot.base.scale.setScalar(escala);
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
