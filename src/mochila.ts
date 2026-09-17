import * as THREE from 'three';
import { Placa } from './hud';
import { ITENS, type TipoItem } from './itens';
import { ItemNaMao } from './isca';

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
const DISTANCIA = 0.52;
/**
 * Quanto abaixo dos OLHOS a grade nasce, e não a que altura do chão.
 *
 * Uma altura fixa de peito só serve para quem joga de pé. Sentado no sofá, os
 * olhos caem uns quarenta centímetros e a mesma grade sobe para a cara; num
 * cadeirante, ou numa criança, a distância é outra ainda. A cabeça é a única
 * medida que o headset conhece de verdade, então é dela que a altura sai — e
 * aí a mochila cai na altura do peito de quem quer que a tenha aberto.
 */
const ABAIXO_DOS_OLHOS = 0.28;

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
  abrir(camera: THREE.Camera, quanto: (id: string) => number) {
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

    const altura = posicao.y - ABAIXO_DOS_OLHOS;
    this.grupo.position.copy(posicao).addScaledVector(direcao, DISTANCIA);
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
    if (!this.grupo.visible) return;
    this.tempo += dt;

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

      // Mão mais próxima deste item.
      const centro = slot.item.grupo.getWorldPosition(_mundo);
      let perto = Infinity;
      for (const mao of maos) perto = Math.min(perto, mao.distanceTo(centro));
      const sobAMao = quantidade > 0 && perto < Mochila.ALCANCE;
      slot.destaque += ((sobAMao ? 1 : 0) - slot.destaque) * Math.min(1, dt * 14);

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
      if (slot.destaque > 0.5 !== slot.carta.malha.userData.aceso) {
        slot.carta.malha.userData.aceso = slot.destaque > 0.5;
        this.escreverCarta(slot);
      }
    }

    this.escala(this.titulo.malha, this.forca);
    if (this.fundo) this.fundo.scale.set(this.forca, this.forca, 1);
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
