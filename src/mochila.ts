import * as THREE from 'three';
import { Placa } from './hud';
import { ITENS, type TipoItem } from './itens';
import { ItemNaMao } from './isca';
import { AVISO, forcaDeToque } from './toque';

/**
 * A mochila aberta no ar: os itens como COISAS, que você alcança e pega.
 *
 * ## O que ela substitui, e por quê
 *
 * Os itens moravam em cartas do painel do pulso — um selo com o nome e a
 * quantidade, que se escolhia apontando o dedo. Funcionava, e era um menu. A
 * mochila do jogador é justamente onde um menu menos se justifica: uma poção
 * não é uma opção de uma lista, é um frasco; e num jogo onde você já pega a
 * pokébola do antebraço fechando a mão em volta dela (ver src/cinto.ts), pegar
 * a poção apontando o dedo para um retângulo é a única coisa que ainda se faz
 * do jeito de uma tela.
 *
 * Aqui os itens são os mesmos objetos 3D que aparecem na sua mão — o frasco de
 * vidro, a fruta com a folha, a bala torcida —, flutuando numa grade à sua
 * frente. Você estende o braço e fecha a mão em volta do que quer. O gesto de
 * pegar é o mesmo gesto de pegar.
 *
 * ## Por que ela fica PARADA no mundo
 *
 * O painel nasce onde você está olhando e fica ali, ancorado, até fechar — não
 * acompanha a cabeça. É a diferença entre uma prateleira e um capacete: uma
 * coisa que persegue o seu rosto não pode ser alcançada, porque ela recua na
 * mesma medida em que a sua mão avança. Todo HUD preso à câmera tem esse
 * defeito, e ele só aparece quando se tenta TOCAR o HUD.
 *
 * ## O que está vazio continua aparecendo
 *
 * Poção, fruta e doce ficam sempre na grade, apagados quando a conta é zero:
 * ver "0 poções" é saber que você está sem poção, e isso é informação. As
 * pedras, que são `guardado`, só aparecem depois que caem — uma pedra que você
 * nunca achou não é uma falta, é uma coisa que ainda não entrou na sua
 * história. A mesma regra do painel antigo; o que mudou foi o gesto.
 */

/** Quantos itens por fileira. Quatro é o que cabe no alcance do braço. */
const COLUNAS = 4;
/** Distância entre um item e o próximo, em metros. */
const PASSO_X = 0.15;
const PASSO_Y = 0.17;
/** A que distância dos olhos a grade nasce. Perto o bastante para alcançar. */
export const DISTANCIA_DA_MOCHILA = 0.52;
/**
 * E a que distância ela nasce de quem está SENTADO.
 *
 * Oito centímetros mais perto. Parece pouco e não é: sentado, o ombro perde a
 * ajuda do tronco e o braço trabalha sozinho — cada centímetro à frente é
 * torque no ombro, mantido pelo tempo que a mochila ficar aberta.
 */
export const DISTANCIA_SENTADO = 0.44;
/**
 * Quanto abaixo dos OLHOS a grade nasce, e não a que altura do chão.
 *
 * Uma altura fixa de peito só serve para quem joga de pé. Sentado no sofá, os
 * olhos caem uns quarenta centímetros e a mesma grade sobe para a cara; num
 * cadeirante, ou numa criança, a distância é outra ainda. A cabeça é a única
 * medida que o headset conhece de verdade, então é dela que a altura sai — e
 * aí a mochila cai na altura do peito de quem quer que a tenha aberto.
 */
export const ABAIXO_DOS_OLHOS = 0.28;
/** E quanto abaixo, sentado: dez centímetros a mais, na altura do colo. */
export const ABAIXO_SENTADO = 0.38;
/**
 * O quanto a grade pode descer atrás da mão que a abriu.
 *
 * Ver `alturaDaMochila`. O limite existe para a grade não acabar no chão
 * quando alguém abre a mochila com o braço pendurado ao lado do corpo — ali a
 * mão não está pedindo nada, ela só está parada.
 */
export const QUEDA_MAXIMA = 0.45;

/**
 * Em que altura a grade nasce.
 *
 * ## Por que a mão entra na conta
 *
 * A altura saía SÓ da cabeça, e o motivo era bom: a cabeça é a única medida que
 * o headset conhece com certeza, e uma altura fixa de peito só serve para quem
 * joga de pé. Só que isso deixou de ser verdade — as mãos são rastreadas, e
 * desde 18/09 o punho é conhecido nos dois modos (ver src/pulso.ts).
 *
 * E a mão diz uma coisa que a cabeça não sabe: **onde o seu braço está
 * descansando**. Quem abre a mochila com o cotovelo apoiado no colo recebia a
 * grade na altura do peito e tinha de levantar o braço para alcançar cada item
 * — num painel que fica aberto enquanto você escolhe, e que é justamente o que
 * o item 1.5 do roteiro chama de "braço no ar cansa".
 *
 * A regra: a grade nasce na altura de sempre, e **desce até a mão** se a mão
 * estiver mais baixa. Nunca sobe — mão levantada não puxa o painel para cima,
 * porque aí quem abrisse com o braço esticado receberia a grade na cara.
 *
 * O limite de queda impede o caso do braço pendurado: ali a mão não está
 * pedindo nada, está só parada.
 */
export function alturaDaMochila(
  alturaDosOlhos: number,
  alturaDaMao: number | null,
  sentado: boolean,
): number {
  const padrao = alturaDosOlhos - (sentado ? ABAIXO_SENTADO : ABAIXO_DOS_OLHOS);
  if (alturaDaMao === null) return padrao;
  const piso = padrao - QUEDA_MAXIMA;
  // Um palmo acima da mão: a grade fica onde a mão a alcança sem subir, e não
  // em cima dela.
  return Math.max(piso, Math.min(padrao, alturaDaMao + 0.08));
}

/**
 * Onde cada item fica na grade, em coordenadas do painel.
 *
 * Função pura e exportada de propósito: a `Mochila` em si não pode ser
 * construída fora do navegador (as cartas são `Placa`, e `Placa` quer um
 * `<canvas>`), então esta é a parte do arranjo que `tools/smoke.ts` consegue
 * conferir — e o que ela confere importa: dois itens mais próximos entre si do
 * que o alcance da mão viram uma disputa pelo mesmo gesto.
 */
export function disporGrade(quantos: number): THREE.Vector3[] {
  const linhas = Math.max(1, Math.ceil(quantos / COLUNAS));
  const saida: THREE.Vector3[] = [];
  for (let i = 0; i < quantos; i++) {
    const coluna = i % COLUNAS;
    const linha = Math.floor(i / COLUNAS);
    // Quantos há NESTA linha: a última costuma ser mais curta, e centrar cada
    // fileira pela largura dela evita a grade encostada à esquerda no fim.
    const nestaLinha = Math.min(COLUNAS, quantos - linha * COLUNAS);
    saida.push(
      new THREE.Vector3(
        (coluna - (nestaLinha - 1) / 2) * PASSO_X,
        ((linhas - 1) / 2 - linha) * PASSO_Y,
        0,
      ),
    );
  }
  return saida;
}

interface Slot {
  tipo: TipoItem;
  /** O objeto que flutua e gira. */
  item: ItemNaMao;
  /** Onde ele descansa, em coordenadas do painel. */
  base: THREE.Vector3;
  carta: Placa;
  quantidade: number;
  /** 0 a 1, o quanto a mão está perto. Anima o destaque. */
  destaque: number;
}

export class Mochila {
  readonly grupo = new THREE.Group();

  private slots: Slot[] = [];
  private fundo: THREE.Mesh | null = null;
  private titulo = new Placa(0.44, 0.09, 560);
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private tempo = 0;
  /** 0 fechada, 1 aberta. A abertura é animada; `aberta` é a intenção. */
  private forca = 0;
  /**
   * Qual mão está mais perto de um item, e quanto — para o jogo vibrar aquela.
   *
   * Escrito durante `atualizar` e lido logo depois. Guardar o ÍNDICE da mão, e
   * não só a menor distância, é o que faz a vibração sair na mão que está
   * chegando em vez de nas duas.
   */
  private maisPerto: { mao: number; forca: number } | null = null;
  private aberta = false;

  /**
   * Quão perto a mão precisa chegar de um item para poder pegá-lo.
   *
   * Doze centímetros é generoso, e é o mesmo motivo do cinto: a sua própria mão
   * tapa o item na reta final, e exigir precisão num alvo que você não está
   * vendo faz alguém fechar a mão três vezes até funcionar.
   */
  static readonly ALCANCE = 0.12;

  constructor() {
    this.titulo.escrever(
      [
        { texto: 'mochila', tamanho: 46, cor: '#eef2f8', peso: 700 },
        { texto: 'estenda a mão e feche em volta', tamanho: 24, cor: '#9aa5b8', peso: 500, espaco: 6 },
      ],
      { raio: 18 },
    );
    this.grupo.add(this.titulo.malha);
    this.grupo.visible = false;
  }

  get estaAberta(): boolean {
    return this.aberta;
  }

  /**
   * Abre à frente de quem está olhando, e monta a grade com o que há.
   *
   * A grade é remontada a cada abertura em vez de ficar de pé o tempo todo: o
   * que você tem muda entre uma abertura e outra — uma pedra caiu, a última
   * poção foi usada — e uma grade viva teria de reagir a cada evento do jogo
   * para dizer a mesma coisa que esta diz sendo construída na hora.
   */
  abrir(
    camera: THREE.Camera,
    quanto: (id: string) => number,
    /** Onde está a mão que abriu — a grade desce até ela. Ver `alturaDaMochila`. */
    maoQueAbriu: THREE.Vector3 | null = null,
    sentado = false,
  ) {
    this.desmontar();

    const visiveis = ITENS.filter((t) => !t.guardado || quanto(t.id) > 0);
    const linhas = Math.max(1, Math.ceil(visiveis.length / COLUNAS));
    const lugares = disporGrade(visiveis.length);

    visiveis.forEach((tipo, i) => {
      const base = lugares[i];

      const item = new ItemNaMao(tipo, false);
      item.grupo.position.copy(base);
      this.grupo.add(item.grupo);

      const carta = new Placa(0.13, 0.05, 260);
      carta.malha.position.set(base.x, base.y - 0.062, base.z);
      this.grupo.add(carta.malha);

      this.slots.push({ tipo, item, base, carta, quantidade: quanto(tipo.id), destaque: 0 });
    });

    this.montarFundo(linhas);
    this.titulo.malha.position.set(0, ((linhas - 1) / 2) * PASSO_Y + 0.15, 0);
    for (const slot of this.slots) this.escreverCarta(slot);

    // Mesma âncora da tela de escolha: à frente do olhar, em pé, sem seguir a
    // cabeça depois de posta.
    const posicao = camera.getWorldPosition(new THREE.Vector3());
    const direcao = camera.getWorldDirection(new THREE.Vector3());
    direcao.y = 0;
    if (direcao.lengthSq() < 1e-6) direcao.set(0, 0, -1);
    direcao.normalize();

    const altura = alturaDaMochila(posicao.y, maoQueAbriu?.y ?? null, sentado);
    this.grupo.position
      .copy(posicao)
      .addScaledVector(direcao, sentado ? DISTANCIA_SENTADO : DISTANCIA_DA_MOCHILA);
    this.grupo.position.y = altura;
    // Encara a cabeça na horizontal: inclinar o painel para cima faria a
    // fileira de baixo apontar para o teto quando alguém o abrisse agachado.
    this.grupo.lookAt(posicao.x, altura, posicao.z);

    this.aberta = true;
    this.grupo.visible = true;
  }

  fechar() {
    this.aberta = false;
  }

  /**
   * O item sob a mão, ou null. É o que o GRIP pega.
   *
   * Devolve o MAIS PERTO, não o primeiro dentro do alcance: com os itens a
   * quinze centímetros um do outro e um alcance de doze, dois vizinhos se
   * sobrepõem, e nesse meio a resposta certa é sempre aquele de que a mão está
   * mais perto.
   */
  alcancado(ponto: THREE.Vector3): TipoItem | null {
    if (!this.aberta) return null;
    let melhor: Slot | null = null;
    let menor = Mochila.ALCANCE;
    for (const slot of this.slots) {
      const d = slot.item.grupo.getWorldPosition(_mundo).distanceTo(ponto);
      if (d < menor) {
        menor = d;
        melhor = slot;
      }
    }
    return melhor?.tipo ?? null;
  }

  /**
   * `maos` são os pontos das mãos que estão em cena. O destaque sai daí.
   *
   * `quanto` é relido a cada quadro, e não só na abertura: usar a última poção
   * com a mochila aberta tem de apagar aquele frasco na hora — senão o painel
   * continua mostrando um item que não existe mais, e você fecha a mão nele.
   */
  atualizar(dt: number, maos: readonly THREE.Vector3[], quanto: (id: string) => number) {
    if (!this.grupo.visible) {
      this.maisPerto = null;
      return;
    }
    this.tempo += dt;
    this.maisPerto = null;

    this.forca += ((this.aberta ? 1 : 0) - this.forca) * Math.min(1, dt * 12);
    if (!this.aberta && this.forca < 0.02) {
      this.grupo.visible = false;
      this.desmontar();
      return;
    }

    for (const slot of this.slots) {
      const quantidade = quanto(slot.tipo.id);
      if (quantidade !== slot.quantidade) {
        slot.quantidade = quantidade;
        this.escreverCarta(slot);
      }

      // Mão mais próxima deste item — e QUAL delas, que é o que faltava: sem
      // guardar quem é, não há como vibrar a mão certa.
      const centro = slot.item.grupo.getWorldPosition(_mundo);
      let perto = Infinity;
      let deQuem = -1;
      for (let m = 0; m < maos.length; m++) {
        const d = maos[m].distanceTo(centro);
        if (d < perto) {
          perto = d;
          deQuem = m;
        }
      }
      // A força é contínua (ver src/toque.ts): o item começa a reagir a oito
      // centímetros, e satura dentro do raio em que o GRIP funciona.
      const forca = quantidade > 0 ? forcaDeToque(perto, Mochila.ALCANCE, AVISO.item) : 0;
      if (forca > (this.maisPerto?.forca ?? 0) && deQuem >= 0) {
        this.maisPerto = { mao: deQuem, forca };
      }
      slot.destaque += (forca - slot.destaque) * Math.min(1, dt * 14);
      const sobAMao = quantidade > 0 && perto < Mochila.ALCANCE;

      // Item vazio fica parado e apagado: um frasco que gira e brilha convida a
      // pegar, e não há o que pegar.
      slot.item.atualizar(quantidade > 0 ? dt : 0, false);
      const flutua = quantidade > 0 ? Math.sin(this.tempo * 1.7 + slot.base.x * 9) * 0.008 : 0;
      slot.item.grupo.position.set(
        slot.base.x,
        slot.base.y + flutua + slot.destaque * 0.018,
        slot.base.z + slot.destaque * 0.03,
      );
      slot.item.grupo.scale.setScalar(this.forca * (1 + slot.destaque * 0.3));

      this.escala(slot.carta.malha, this.forca);
      // O repaint da carta segue o BOOLEANO, e não a rampa: redesenhar canvas e
      // subir textura é a coisa mais cara desta classe, e uma mão parada perto
      // do meio da rampa repintaria todo quadro.
      if (sobAMao !== slot.carta.malha.userData.aceso) {
        slot.carta.malha.userData.aceso = sobAMao;
        this.escreverCarta(slot);
      }
    }

    this.escala(this.titulo.malha, this.forca);
    if (this.fundo) this.fundo.scale.set(this.forca, this.forca, 1);
  }

  /** A mão que está encostando num item, e quanto. Ver `maisPerto`. */
  get toqueDaVez(): { mao: number; forca: number } | null {
    return this.maisPerto;
  }

  private escala(malha: THREE.Object3D, f: number) {
    malha.scale.setScalar(f);
  }

  private escreverCarta(slot: Slot) {
    const aceso = slot.carta.malha.userData.aceso === true;
    const vazio = slot.quantidade <= 0;
    const cor = `#${new THREE.Color(slot.tipo.cor).getHexString()}`;
    slot.carta.escrever(
      [
        {
          texto: slot.tipo.curto ?? slot.tipo.nome,
          tamanho: 26,
          cor: vazio ? '#6a7386' : '#f2f5fa',
          peso: 700,
        },
        {
          texto: vazio ? 'sem' : `×${Math.floor(slot.quantidade)}`,
          tamanho: 22,
          cor: vazio ? '#586074' : cor,
          peso: 700,
          espaco: 2,
        },
      ],
      {
        raio: 12,
        fundo: aceso ? 'rgba(32, 46, 68, 0.96)' : 'rgba(12, 17, 26, 0.86)',
        borda: aceso ? cor : 'rgba(255,255,255,0.12)',
      },
    );
  }

  private montarFundo(linhas: number) {
    const largura = COLUNAS * PASSO_X + 0.07;
    const altura = linhas * PASSO_Y + 0.2;
    const geo = new THREE.PlaneGeometry(largura, altura);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0a1018,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      toneMapped: false,
    });
    this.descartaveis.push(geo, mat);
    this.fundo = new THREE.Mesh(geo, mat);
    // Atrás de tudo: o painel é um vidro fumê por onde o quarto continua
    // aparecendo, não uma parede.
    this.fundo.position.set(0, -0.02, -0.03);
    this.grupo.add(this.fundo);
  }

  private desmontar() {
    for (const slot of this.slots) {
      slot.item.descartar();
      slot.carta.descartar();
    }
    this.slots.length = 0;
    this.fundo?.removeFromParent();
    this.fundo = null;
    for (const d of this.descartaveis) d.dispose();
    this.descartaveis.length = 0;
  }

  descartar() {
    this.desmontar();
    this.titulo.descartar();
    this.grupo.removeFromParent();
  }
}

const _mundo = new THREE.Vector3();
