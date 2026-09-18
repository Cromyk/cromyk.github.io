import * as THREE from 'three';
import { Placa } from './hud';
import { TIPOS, textoEstagio, type Especie, type Estagios } from './species';
import { BOLAS, type TipoBola } from './balls';
import { ITENS, type TipoItem } from './itens';
import { MODOS, type Modo, type ModoId } from './modos';
import { DIFICULDADES, INTERRUPTORES, type Dificuldade, type PerfilDificuldade } from './ajustes';
import { olhandoORelogio } from './gesto';
import { CONDICOES, condicaoDoGolpe } from './condicao';
import {
  COR,
  RAIO,
  barra,
  cartao,
  corDaVida,
  engrenagem,
  fonte,
  hex,
  nomeComBrilho,
  pilula,
  textoAjustado,
} from './estilo';
import type { Golpe } from './species';
import { TAMANHO_TIME, type Exemplar } from './state';

export interface EntradaTime {
  exemplar: Exemplar;
  especie: Especie;
  hp: number;
  hpMax: number;
  nivel: number;
  /** 0..1 até o próximo nível. */
  progresso: number;
  shiny: boolean;
  emCampo: boolean;
  /** Os estágios de quem está em campo, para o painel mostrar os buffs. */
  estagios?: Estagios;
}

export interface EntradaBola {
  tipo: TipoBola;
  quantidade: number;
}

export interface EntradaItem {
  tipo: TipoItem;
  quantidade: number;
}

export interface EntradaGolpe {
  golpe: Golpe;
  /** É o golpe que vai sair no próximo gatilho. */
  armado: boolean;
}

/** O que os interruptores da engrenagem mostram neste quadro. */
export interface EntradaInterruptor {
  id: (typeof INTERRUPTORES)[number]['id'];
  nome: string;
  ligado: boolean;
  diz: string;
}

export type Selecao =
  | { tipo: 'criatura'; entrada: EntradaTime }
  | { tipo: 'bola'; entrada: EntradaBola }
  | { tipo: 'item'; entrada: EntradaItem }
  | { tipo: 'modo'; entrada: Modo }
  | { tipo: 'golpe'; entrada: EntradaGolpe }
  | { tipo: 'engrenagem' }
  | { tipo: 'pc' }
  | { tipo: 'dificuldade'; entrada: PerfilDificuldade }
  | { tipo: 'interruptor'; entrada: EntradaInterruptor };

/**
 * As medidas do painel, depois do playtest de 18/09.
 *
 * ## O que estava errado
 *
 * As seis cartas do time ficavam numa FILEIRA só: seis vezes dez centímetros
 * mais os vãos dão **sessenta e seis centímetros** de painel, pendurados a
 * catorze centímetros acima do punho. Da ponta esquerda à direita era mais que
 * a envergadura confortável de um braço — as cartas das pontas ficavam longe do
 * braço que as carrega, e o conjunto lia como coisa espalhada em vez de um
 * painel.
 *
 * E ele crescia para BAIXO: título em cima, time no meio, bolas, itens e golpes
 * descendo até vinte e um centímetros abaixo do centro — ou seja, abaixo do
 * próprio antebraço, no vazio à frente do corpo.
 *
 * ## O que mudou
 *
 * As cartas encolheram um pouco e o time virou uma **grade de três por duas**:
 * a mesma informação em 0,30 m de largura em vez de 0,66 m. Todas as fileiras
 * passaram a ter a mesma largura útil de ~0,30 m, o que dá ao painel uma borda
 * reta dos dois lados em vez de um contorno serrilhado.
 *
 * E ele passou a ser montado **de baixo para cima**, com a base logo acima do
 * punho — ver `reposicionar`. Nada mais fica abaixo do braço.
 *
 * As cartas não encolheram mais do que isto de propósito: a largura mínima aqui
 * não é a de ler, é a de ACERTAR com a mão no ar, e abaixo de uns oito
 * centímetros escolher a carta certa vira sorte.
 */
const LARGURA_CARD = 0.092;
const ALTURA_CARD = 0.114;
const LARGURA_BOLA = 0.069;
const ALTURA_BOLA = 0.06;
const LARGURA_ITEM = 0.05;
const ALTURA_ITEM = 0.046;
const LARGURA_GOLPE = 0.143;
const ALTURA_GOLPE = 0.05;
/** Largura útil do painel. Toda fileira se centra dentro dela. */
const LARGURA_PAINEL = 0.296;
const LARGURA_MODO = 0.122;
const ALTURA_MODO = 0.056;
const LARGURA_DIF = 0.122;
const ALTURA_DIF = 0.05;
const LARGURA_CHAVE = 0.19;
const ALTURA_CHAVE = 0.042;
const LADO_ENGRENAGEM = 0.042;
const LADO_PC = 0.042;
const ESPACO = 0.012;

/** Como cada categoria de golpe se identifica no card. */
const CATEGORIA = {
  fisico: { rotulo: 'FÍS', cor: '#ff9f7a' },
  especial: { rotulo: 'ESP', cor: '#9fb8ff' },
  status: { rotulo: 'STA', cor: '#c8b5ff' },
} as const;

/**
 * Painel preso à mão esquerda. Abre quando você gira o pulso para ler as horas
 * (ver src/gesto.ts).
 *
 * ## Duas páginas, e por quê
 *
 * A fileira de MODOS ficava sempre visível, entre o título e o time, ocupando o
 * lugar mais nobre do painel para uma coisa que se muda uma vez por sessão.
 * Agora ela virou uma **engrenagem** no canto do título: um toque abre a página
 * de ajustes — modo de jogo, dificuldade e os interruptores — e outro fecha.
 *
 * O painel continua sendo um só objeto e um só conjunto de alvos; o que muda é
 * quais deles estão visíveis. Dois painéis separados significariam dois gestos
 * para aprender, e o pulso já tem os seus dois.
 *
 * Para escolher, ou se aponta com a outra mão e se puxa o gatilho, ou se estica
 * a mão e se fecha o GRIP em cima da carta. O segundo jeito é o que faz a bola
 * do seu Pokémon vir para a mão pronta para o arremesso.
 */
export class PainelTime {
  readonly grupo = new THREE.Group();
  aberto = false;
  /** Trocou o item sob a mira neste quadro. */
  mudouDestaque = false;
  /** Falso na página principal, verdadeiro na dos ajustes. */
  nosAjustes = false;

  private cards: Placa[] = [];
  private cardsBola: Placa[] = [];
  private cardsItem: Placa[] = [];
  private cardsModo: Placa[] = [];
  private cardsGolpe: Placa[] = [];
  private cardsDificuldade: Placa[] = [];
  private cardsChave: Placa[] = [];
  private cardEngrenagem = new Placa(LADO_ENGRENAGEM, LADO_ENGRENAGEM, 128);
  /** O atalho para o PC: a caixa inteira e a equipe, ver src/pc.ts. */
  private cardPc = new Placa(LADO_PC, LADO_PC, 128);
  private alvos: THREE.Mesh[] = [];
  private titulo = new Placa(0.3, 0.038, 512);

  /** Uma por vaga do time; `null` onde a vaga está vazia. */
  private entradas: Array<EntradaTime | null> = [];
  private bolas: EntradaBola[] = [];
  private itens: EntradaItem[] = [];
  private golpes: EntradaGolpe[] = [];
  private interruptores: EntradaInterruptor[] = [];
  private modoAtivo: ModoId = MODOS[0].id;
  private dificuldadeAtiva: Dificuldade = 'normal';

  private destacado: { tipo: Selecao['tipo']; indice: number } | null = null;
  private assinatura = '';
  private abertura = 0;
  /** Onde o conteúdo da página principal termina, para cima. Ver reposicionar. */
  private topoDaPagina = 0.2;
  private raycaster = new THREE.Raycaster();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.titulo.malha.position.set(0, this.topoDaPagina, 0);
    this.grupo.add(this.titulo.malha, this.cardEngrenagem.malha, this.cardPc.malha);
    this.grupo.visible = false;

    const geoAlvo = new THREE.PlaneGeometry(1, 1);
    const matAlvo = new THREE.MeshBasicMaterial({ visible: false });
    this.descartaveis.push(geoAlvo, matAlvo);

    const novoAlvo = (tipo: string, indice: number, l: number, a: number) => {
      const alvo = new THREE.Mesh(geoAlvo, matAlvo);
      alvo.scale.set(l * 1.12, a * 1.18, 1);
      alvo.userData = { tipo, indice };
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    };

    for (let i = 0; i < TAMANHO_TIME; i++) {
      const card = new Placa(LARGURA_CARD, ALTURA_CARD, 300);
      this.cards.push(card);
      this.grupo.add(card.malha);
      novoAlvo('criatura', i, LARGURA_CARD, ALTURA_CARD);
    }

    for (let i = 0; i < BOLAS.length; i++) {
      const card = new Placa(LARGURA_BOLA, ALTURA_BOLA, 230);
      this.cardsBola.push(card);
      this.grupo.add(card.malha);
      novoAlvo('bola', i, LARGURA_BOLA, ALTURA_BOLA);
    }

    for (let i = 0; i < ITENS.length; i++) {
      const card = new Placa(LARGURA_ITEM, ALTURA_ITEM, 210);
      this.cardsItem.push(card);
      this.grupo.add(card.malha);
      novoAlvo('item', i, LARGURA_ITEM, ALTURA_ITEM);
    }

    // Quatro, que é o arsenal de uma espécie. Ver `montarGolpes` em species.ts.
    for (let i = 0; i < 4; i++) {
      const card = new Placa(LARGURA_GOLPE, ALTURA_GOLPE, 300);
      this.cardsGolpe.push(card);
      this.grupo.add(card.malha);
      novoAlvo('golpe', i, LARGURA_GOLPE, ALTURA_GOLPE);
    }

    // --- página de ajustes ---
    for (let i = 0; i < MODOS.length; i++) {
      const card = new Placa(LARGURA_MODO, ALTURA_MODO, 330);
      this.cardsModo.push(card);
      this.grupo.add(card.malha);
      novoAlvo('modo', i, LARGURA_MODO, ALTURA_MODO);
    }

    for (let i = 0; i < DIFICULDADES.length; i++) {
      const card = new Placa(LARGURA_DIF, ALTURA_DIF, 330);
      this.cardsDificuldade.push(card);
      this.grupo.add(card.malha);
      novoAlvo('dificuldade', i, LARGURA_DIF, ALTURA_DIF);
    }

    for (let i = 0; i < INTERRUPTORES.length; i++) {
      const card = new Placa(LARGURA_CHAVE, ALTURA_CHAVE, 460);
      this.cardsChave.push(card);
      this.grupo.add(card.malha);
      novoAlvo('interruptor', i, LARGURA_CHAVE, ALTURA_CHAVE);
    }

    novoAlvo('engrenagem', 0, LADO_ENGRENAGEM, LADO_ENGRENAGEM);
    novoAlvo('pc', 0, LADO_PC, LADO_PC);
  }

  get time(): Array<EntradaTime | null> {
    return this.entradas;
  }

  definirConteudo(
    entradas: Array<EntradaTime | null>,
    bolas: EntradaBola[],
    itens: EntradaItem[],
    golpes: EntradaGolpe[],
    modoAtivo: ModoId,
    dificuldadeAtiva: Dificuldade,
    interruptores: EntradaInterruptor[],
  ) {
    this.entradas = entradas.slice(0, TAMANHO_TIME);
    this.bolas = bolas;
    this.itens = itens;
    this.golpes = golpes.slice(0, this.cardsGolpe.length);
    this.modoAtivo = modoAtivo;
    this.dificuldadeAtiva = dificuldadeAtiva;
    this.interruptores = interruptores;
    this.reposicionar();
  }

  /** Alterna entre a página principal e a dos ajustes. */
  alternarAjustes(): boolean {
    this.nosAjustes = !this.nosAjustes;
    this.assinatura = '';
    this.reposicionar();
    return this.nosAjustes;
  }

  /**
   * Uma fileira só, ou quebrada em `porLinha` quando não cabe.
   *
   * É a `grade` abaixo com o número de colunas aberto — as duas eram a mesma
   * conta escrita duas vezes, e a versão de fileira única não sabia quebrar, o
   * que punha carta para fora do painel assim que uma categoria crescia.
   */
  private fileira(
    cards: Placa[],
    indiceAlvoBase: number,
    quantos: number,
    largura: number,
    y: number,
    visivelNaPagina: boolean,
    porLinha = quantos || 1,
  ) {
    this.grade(cards, indiceAlvoBase, quantos, largura, 0, y, visivelNaPagina, porLinha, 1);
  }

  /**
   * Como a `fileira`, mas quebrando em linhas quando não cabe.
   *
   * A mochila tinha três itens e três cabiam numa linha de trinta centímetros,
   * que é a largura do painel. Com as pedras de evolução ela passou a ter até
   * oito — e cinco já dão quarenta e quatro centímetros, ou seja, catorze
   * centímetros de carta pendurados fora do painel, no ar. Quebrar em linhas de
   * quatro resolve sem encolher carta nenhuma: elas continuam do tamanho em que
   * dá para acertar com o braço esticado, que é a medida que importa aqui.
   *
   * Devolve quantas linhas foram usadas, para quem vem embaixo saber onde
   * começar.
   */
  private grade(
    cards: Placa[],
    indiceAlvoBase: number,
    quantos: number,
    largura: number,
    altura: number,
    yTopo: number,
    visivelNaPagina: boolean,
    // Três por linha, e não quatro: quatro cartas dão 0,34 m e o painel tem
    // 0,30 m de largura útil — as das pontas ficariam para fora. Três dão 0,25 m
    // e, de quebra, deixam os três itens básicos exatamente onde sempre
    // estiveram: a mochila de quem ainda não achou pedra nenhuma não muda.
    porLinha = 3,
    /**
     * `1` empilha para baixo a partir de `yTopo`; `-1` empilha para cima.
     *
     * A página principal usa −1 desde 18/09, porque o painel inteiro passou a
     * crescer a partir do pulso em vez de pender dele. A página de ajustes
     * continua com 1: ela é uma lista que se lê de cima para baixo.
     */
    sentido: 1 | -1 = 1,
  ): number {
    const linhas = Math.max(1, Math.ceil(quantos / porLinha));
    for (let i = 0; i < cards.length; i++) {
      const visivel = visivelNaPagina && i < quantos;
      cards[i].malha.visible = visivel;
      const alvo = this.alvos[indiceAlvoBase + i];
      alvo.visible = visivel;
      if (!visivel) continue;

      const linha = Math.floor(i / porLinha);
      const nestaLinha = Math.min(porLinha, quantos - linha * porLinha);
      const total = nestaLinha * largura + Math.max(0, nestaLinha - 1) * ESPACO;
      const coluna = i % porLinha;
      const x = -total / 2 + largura / 2 + coluna * (largura + ESPACO);
      const y = yTopo - sentido * linha * (altura + ESPACO * 0.7);
      cards[i].malha.position.set(x, y, cards[i].malha.position.z);
      alvo.position.set(x, y, -0.001);
    }
    return linhas;
  }

  private reposicionar() {
    const baseBola = this.cards.length;
    const baseItem = baseBola + this.cardsBola.length;
    const baseGolpe = baseItem + this.cardsItem.length;
    const baseModo = baseGolpe + this.cardsGolpe.length;
    const baseDif = baseModo + this.cardsModo.length;
    const baseChave = baseDif + this.cardsDificuldade.length;
    const indiceEngrenagem = baseChave + this.cardsChave.length;

    const principal = !this.nosAjustes;

    // --- página principal, montada DE BAIXO PARA CIMA ---
    //
    // A origem do grupo é o pulso (ver `atualizar`), e o painel inteiro cresce
    // a partir dela para cima. Antes era o contrário: o time ficava no centro e
    // tudo o mais descia, indo parar abaixo do antebraço — no vazio à frente do
    // corpo, onde não há em que apoiar a mão nem o olho.
    //
    // A ordem de baixo para cima é a de quanto cada coisa é usada com a mão
    // esticada: os golpes ficam mais perto do pulso porque se trocam no meio da
    // briga; o time fica em cima porque é o que se LÊ, e o que se lê quer ficar
    // na linha dos olhos.
    let y = ALTURA_GOLPE / 2;

    this.grade(this.cardsGolpe, baseGolpe, this.golpes.length, LARGURA_GOLPE, ALTURA_GOLPE, y, principal, 2, -1);
    const linhasDeGolpe = Math.max(1, Math.ceil(this.golpes.length / 2));
    if (this.golpes.length > 0) {
      y += (linhasDeGolpe - 1) * (ALTURA_GOLPE + ESPACO * 0.7);
      y += ALTURA_GOLPE / 2 + 0.012 + ALTURA_ITEM / 2;
    } else {
      y += ALTURA_ITEM / 2;
    }

    const yItem = y;
    const linhasDeItem = this.grade(
      this.cardsItem,
      baseItem,
      this.itens.length,
      LARGURA_ITEM,
      ALTURA_ITEM,
      yItem,
      principal,
      6,
      // De baixo para cima, como o resto do painel.
      -1,
    );
    y += (linhasDeItem - 1) * (ALTURA_ITEM + ESPACO * 0.7);
    y += ALTURA_ITEM / 2 + 0.012 + ALTURA_BOLA / 2;

    this.grade(this.cardsBola, baseBola, this.bolas.length, LARGURA_BOLA, ALTURA_BOLA, y, principal, 4, -1);
    const linhasDeBola = Math.max(1, Math.ceil(this.bolas.length / 4));
    y += (linhasDeBola - 1) * (ALTURA_BOLA + ESPACO * 0.7);
    y += ALTURA_BOLA / 2 + 0.016 + ALTURA_CARD / 2;

    // O time numa GRADE de três por duas, e não numa fileira de seis: são os
    // mesmos seis bichos em 0,30 m em vez de 0,66 m.
    const linhasDeTime = this.grade(
      this.cards,
      0,
      this.entradas.length,
      LARGURA_CARD,
      ALTURA_CARD,
      y,
      principal,
      3,
      -1,
    );
    y += (linhasDeTime - 1) * (ALTURA_CARD + ESPACO * 0.7);
    this.topoDaPagina = y + ALTURA_CARD / 2 + 0.03;

    // --- página de ajustes, do topo para baixo dentro do mesmo espaço ---
    //
    // Ela é uma LISTA, e lista se lê de cima para baixo. O que mudou é só onde
    // o topo dela fica: antes era um número fixo perto do centro, agora é o
    // mesmo topo da página principal, para as duas ocuparem a mesma moldura e a
    // engrenagem não fazer o painel pular de tamanho quando alterna.
    const alturaAjustes =
      ALTURA_MODO + ALTURA_DIF + this.interruptores.length * (ALTURA_CHAVE + 0.008) + 0.06;
    const yModo = Math.max(alturaAjustes, this.topoDaPagina - 0.03) - ALTURA_MODO / 2;
    const yDif = yModo - ALTURA_MODO / 2 - ALTURA_DIF / 2 - 0.02;
    const yChaveBase = yDif - ALTURA_DIF / 2 - ALTURA_CHAVE / 2 - 0.022;

    this.fileira(this.cardsModo, baseModo, MODOS.length, LARGURA_MODO, yModo, !principal);
    this.fileira(
      this.cardsDificuldade,
      baseDif,
      DIFICULDADES.length,
      LARGURA_DIF,
      yDif,
      !principal,
    );

    // Os interruptores ficam empilhados, um por linha: eles têm texto longo e
    // lado a lado ficariam ilegíveis num painel de vinte centímetros.
    for (let i = 0; i < this.cardsChave.length; i++) {
      const visivel = !principal && i < this.interruptores.length;
      this.cardsChave[i].malha.visible = visivel;
      const alvo = this.alvos[baseChave + i];
      alvo.visible = visivel;
      if (!visivel) continue;
      const y = yChaveBase - i * (ALTURA_CHAVE + 0.008);
      this.cardsChave[i].malha.position.set(0, y, this.cardsChave[i].malha.position.z);
      alvo.position.set(0, y, -0.001);
    }

    // A engrenagem fica na linha do título, encostada na direita — o canto onde
    // ninguém procura um Pokémon e todo mundo procura opções.
    //
    // O título coroa o painel, e por isso ele segue o topo do conteúdo em vez
    // de ficar num número fixo: com a mochila cheia de pedras ou com os golpes
    // à mostra, o painel cresce, e um título parado acabaria no meio dele.
    const yTitulo = Math.max(this.topoDaPagina, yModo + ALTURA_MODO / 2 + 0.03);
    const xEngrenagem = LARGURA_PAINEL / 2 + LADO_ENGRENAGEM / 2 + 0.006;
    this.titulo.malha.position.y = yTitulo;
    this.cardEngrenagem.malha.position.set(xEngrenagem, yTitulo, 0);
    const alvoEngrenagem = this.alvos[indiceEngrenagem];
    alvoEngrenagem.visible = true;
    alvoEngrenagem.position.set(xEngrenagem, yTitulo, -0.001);

    // O PC fica do lado oposto, encostado na esquerda do título: os dois cantos
    // da linha de cima são as duas coisas que não são "um bicho do seu time".
    const xPc = -(LARGURA_PAINEL / 2 + LADO_PC / 2 + 0.006);
    this.cardPc.malha.position.set(xPc, yTitulo, 0);
    const alvoPc = this.alvos[indiceEngrenagem + 1];
    alvoPc.visible = true;
    alvoPc.position.set(xPc, yTitulo, -0.001);
  }

  // ------------------------------------------------------------ desenho

  private redesenharTitulo(vistas: number, capturadas: number, total: number) {
    const { ctx, canvas } = this.titulo;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, {}, RAIO.pequeno);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = fonte(30, 700);
    ctx.fillStyle = COR.texto;
    ctx.fillText(this.nosAjustes ? 'ajustes' : 'seu time', 20, canvas.height * 0.5);

    ctx.textAlign = 'right';
    ctx.font = fonte(21, 600);
    ctx.fillStyle = COR.textoFraco;
    ctx.fillText(
      this.nosAjustes
        ? this.dificuldadeAtiva
        : `${capturadas} capturadas · ${vistas}/${total} vistas`,
      canvas.width - 20,
      canvas.height * 0.5 + 1,
    );
    ctx.textBaseline = 'top';
    this.titulo.marcarSujo();
  }

  private redesenharEngrenagem(sobMira: boolean) {
    const { ctx, canvas } = this.cardEngrenagem;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(
      ctx,
      2,
      2,
      canvas.width - 4,
      canvas.height - 4,
      { sobMira, ativo: this.nosAjustes },
      RAIO.pequeno,
    );
    engrenagem(
      ctx,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.3,
      this.nosAjustes ? COR.bordaAtiva : sobMira ? COR.texto : COR.textoFraco,
    );
    this.cardEngrenagem.marcarSujo();
  }

  /**
   * O atalho do PC, do outro lado do título.
   *
   * O PC sempre existiu, e sempre abriu no botão Y — o que é o mesmo que não
   * existir para quem não leu o manual. Ele é a única tela onde se troca um
   * Pokémon da caixa pelo do time, então precisava estar onde a mão já vai:
   * no painel do pulso, ao lado da engrenagem.
   *
   * O ícone é um monitor com uma bolinha dentro, desenhado em caminho pelo
   * mesmo motivo da engrenagem — emoji no headset vira retângulo vazio.
   */
  private redesenharPc(sobMira: boolean) {
    const { ctx, canvas } = this.cardPc;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { sobMira }, RAIO.pequeno);

    const cor = sobMira ? COR.texto : COR.textoFraco;
    const l = canvas.width * 0.56;
    const a = l * 0.72;
    const x = (canvas.width - l) / 2;
    const y = canvas.height * 0.26;

    ctx.lineWidth = Math.max(2, canvas.width * 0.035);
    ctx.strokeStyle = cor;
    ctx.beginPath();
    ctx.roundRect(x, y, l, a, 5);
    ctx.stroke();

    // O pé do monitor.
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, y + a);
    ctx.lineTo(canvas.width / 2, y + a + canvas.height * 0.1);
    ctx.moveTo(canvas.width / 2 - l * 0.26, y + a + canvas.height * 0.1);
    ctx.lineTo(canvas.width / 2 + l * 0.26, y + a + canvas.height * 0.1);
    ctx.stroke();

    // A pokébola na tela: é ela que diz que o monitor guarda bicho.
    ctx.beginPath();
    ctx.arc(canvas.width / 2, y + a * 0.5, a * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = cor;
    ctx.fill();

    this.cardPc.marcarSujo();
  }

  private redesenharTime() {
    for (let i = 0; i < this.entradas.length; i++) {
      const e = this.entradas[i];
      const card = this.cards[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'criatura' && this.destacado.indice === i;
      // Vaga vazia: um retângulo apagado com o número dela, e nada mais. O
      // buraco é informação — é onde cabe o próximo, e é o que diz que o time
      // não está cheio.
      if (!e) {
        const { ctx: c2, canvas: cv } = card;
        c2.clearRect(0, 0, cv.width, cv.height);
        cartao(c2, 2, 2, cv.width - 4, cv.height - 4, { sobMira, apagado: true });
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        c2.font = fonte(30, 700);
        c2.fillStyle = COR.textoApagado;
        c2.fillText(String(i + 1), cv.width / 2, cv.height / 2);
        card.marcarSujo();
        continue;
      }
      const desmaiado = e.hp <= 0;
      const corTipo = TIPOS[e.especie.tipo].cor;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, {
        sobMira,
        ativo: e.emCampo,
        apagado: desmaiado,
        acento: corTipo,
      });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = fonte(27, 700);
      ctx.fillStyle = desmaiado ? COR.textoApagado : e.shiny ? '#ffe08a' : COR.texto;
      // Centralizado, então a estrela do brilhante entra na conta da largura: o
      // nome é medido primeiro e o conjunto inteiro é que fica no meio.
      ctx.textAlign = 'left';
      const largura = Math.min(
        ctx.measureText(e.especie.nome).width + (e.shiny ? 23 : 0),
        canvas.width - 28,
      );
      nomeComBrilho(ctx, e.especie.nome, e.shiny, (canvas.width - largura) / 2, 30, 27, largura);
      ctx.textAlign = 'center';

      ctx.font = fonte(20, 700);
      ctx.fillStyle = desmaiado ? COR.textoApagado : hex(corTipo);
      ctx.fillText(
        e.especie.tipos.map((t) => TIPOS[t].nome).join('/').toUpperCase(),
        canvas.width / 2,
        62,
        canvas.width - 20,
      );

      const larguraBarra = canvas.width - 40;
      const yVida = 96;
      barra(ctx, 20, yVida, larguraBarra, 13, e.hp / Math.max(1, e.hpMax), corDaVida(e.hp / Math.max(1, e.hpMax)));
      barra(ctx, 20, yVida + 18, larguraBarra, 5, e.progresso, COR.xp, {
        trilho: 'rgba(255,255,255,0.1)',
      });

      ctx.font = fonte(19, 600);
      ctx.fillStyle = COR.textoFraco;
      ctx.fillText(desmaiado ? 'desmaiado' : `${Math.ceil(e.hp)}/${e.hpMax}`, canvas.width / 2, yVida + 28);

      ctx.textAlign = 'left';
      ctx.font = fonte(20, 700);
      ctx.fillStyle = desmaiado ? COR.textoApagado : '#c8d4e6';
      ctx.fillText(`N${e.nivel}`, 16, 30);

      // Os estágios de quem está em campo: a soma dos buffs e debuffs ativos.
      // É a única forma de o jogador saber que o Escudo que ele usou há dez
      // segundos ainda está valendo.
      if (e.emCampo && e.estagios) {
        const marcas: string[] = [];
        if (e.estagios.ataque) marcas.push(`ATQ${textoEstagio(e.estagios.ataque)}`);
        if (e.estagios.defesa) marcas.push(`DEF${textoEstagio(e.estagios.defesa)}`);
        if (e.estagios.velocidade) marcas.push(`VEL${textoEstagio(e.estagios.velocidade)}`);
        ctx.textAlign = 'center';
        ctx.font = fonte(17, 700);
        ctx.fillStyle = COR.bom;
        ctx.fillText(marcas.length ? marcas.join(' ') : 'EM CAMPO', canvas.width / 2, yVida + 50);
      }

      card.marcarSujo();
    }
  }

  private redesenharBolas(bolaAtivaId: string) {
    for (let i = 0; i < this.bolas.length; i++) {
      const { tipo, quantidade } = this.bolas[i];
      const card = this.cardsBola[i];
      const { ctx, canvas } = card;
      const selecionada = tipo.id === bolaAtivaId;
      const sobMira = this.destacado?.tipo === 'bola' && this.destacado.indice === i;
      const vazia = quantidade <= 0;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(
        ctx,
        2,
        2,
        canvas.width - 4,
        canvas.height - 4,
        { sobMira, ativo: selecionada, apagado: vazia },
        RAIO.pequeno,
      );

      // A bolinha desenhada: metade de cima colorida, metade de baixo clara.
      const cx = canvas.width / 2;
      const cy = 44;
      const r = 22;
      ctx.globalAlpha = vazia ? 0.26 : 1;

      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.fillStyle = hex(tipo.corTopo);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI);
      ctx.fillStyle = hex(tipo.corBase);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx - r, cy - 3, r * 2, 6);
      ctx.fillStyle = '#12141a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#12141a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f4f8';
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = fonte(25, 700);
      ctx.fillStyle = vazia ? COR.textoApagado : COR.texto;
      ctx.fillText(`×${quantidade}`, cx, 76);

      if (tipo.multiplicador > 1) {
        ctx.font = fonte(17, 700);
        ctx.fillStyle = vazia ? COR.textoApagado : COR.destaque;
        ctx.fillText(`${tipo.multiplicador}×`, cx, 106);
      }

      card.marcarSujo();
    }
  }

  private redesenharItens() {
    for (let i = 0; i < this.itens.length; i++) {
      const { tipo, quantidade } = this.itens[i];
      const card = this.cardsItem[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'item' && this.destacado.indice === i;
      const vazio = quantidade <= 0;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(
        ctx,
        2,
        2,
        canvas.width - 4,
        canvas.height - 4,
        { sobMira, apagado: vazio, acento: tipo.cor },
        RAIO.pequeno,
      );

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = fonte(23, 700);
      ctx.fillStyle = vazio ? COR.textoApagado : COR.texto;
      ctx.fillText(
        textoAjustado(ctx, tipo.curto ?? tipo.nome, canvas.width - 74),
        18,
        canvas.height * 0.54,
      );

      ctx.textAlign = 'right';
      ctx.font = fonte(25, 700);
      ctx.fillStyle = vazio ? COR.textoApagado : hex(tipo.cor);
      ctx.fillText(`×${quantidade}`, canvas.width - 18, canvas.height * 0.54);
      ctx.textBaseline = 'top';

      card.marcarSujo();
    }
  }

  /**
   * A fileira de golpes. Quatro cards, com a CATEGORIA visível.
   *
   * A categoria precisa estar na cara do card porque ela é a regra do jogo que
   * o jogador mais usa sem saber: físico bate contra Defesa, especial contra
   * Defesa Especial, e status não bate em nada. Sem esse rótulo, escolher entre
   * dois golpes do mesmo tipo é escolher pelo nome.
   */
  private redesenharGolpes() {
    for (let i = 0; i < this.golpes.length; i++) {
      const { golpe, armado } = this.golpes[i];
      const card = this.cardsGolpe[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'golpe' && this.destacado.indice === i;
      const cat = CATEGORIA[golpe.categoria];
      const corTipo = TIPOS[golpe.tipo].cor;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(
        ctx,
        2,
        2,
        canvas.width - 4,
        canvas.height - 4,
        { sobMira, ativo: armado, acento: golpe.categoria === 'status' ? undefined : corTipo },
        RAIO.pequeno,
      );

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = fonte(23, 700);
      ctx.fillStyle = COR.texto;
      ctx.fillText(textoAjustado(ctx, golpe.nome, canvas.width - 84), 16, 20);

      pilula(ctx, cat.rotulo, canvas.width - 14, 18, 22, cat.cor, { alinhar: 'right' });

      ctx.textAlign = 'left';
      ctx.font = fonte(18, 500);
      ctx.fillStyle = COR.textoFraco;
      const detalhe =
        golpe.categoria === 'status'
          ? (golpe.resumo ?? 'muda os stats')
          : `${TIPOS[golpe.tipo].nome} · potência ${golpe.potencia}`;
      ctx.fillText(textoAjustado(ctx, detalhe, canvas.width - 90), 16, 52);

      // O que este golpe pode DEIXAR no alvo — a descoberta das condições.
      //
      // Elas entraram no combate e não estavam em lugar nenhum da interface: um
      // jogador podia jogar a sessão inteira sem descobrir que dormir existe, e
      // uma mecânica que ninguém encontra é uma mecânica que não foi feita.
      // Aqui, no card do golpe, é o único lugar em que a informação chega ANTES
      // da escolha — que é quando ela serve para alguma coisa.
      const deixa = condicaoDoGolpe(golpe.tipo, golpe.categoria, golpe.nome);
      if (deixa) {
        const perfil = CONDICOES[deixa.condicao];
        // "sempre" quando o golpe existe para isso, e a chance quando é bônus.
        const quanto = deixa.chance >= 0.7 ? '' : ` ${Math.round(deixa.chance * 100)}%`;
        pilula(
          ctx,
          `${perfil.sigla}${quanto}`,
          canvas.width - 14,
          46,
          20,
          hex(perfil.cor),
          { alinhar: 'right', maxLargura: canvas.width * 0.42 },
        );
      }

      if (armado) {
        ctx.textAlign = 'right';
        ctx.font = fonte(17, 700);
        ctx.fillStyle = COR.bom;
        ctx.fillText('ARMADO', canvas.width - 14, 54);
      }

      card.marcarSujo();
    }
  }

  private redesenharAjustes() {
    for (let i = 0; i < MODOS.length; i++) {
      const modo = MODOS[i];
      const card = this.cardsModo[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'modo' && this.destacado.indice === i;
      const ativo = modo.id === this.modoAtivo;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { sobMira, ativo }, RAIO.pequeno);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = fonte(24, 700);
      ctx.fillStyle = ativo ? modo.cor : COR.texto;
      ctx.fillText(modo.nome, 18, 18);

      ctx.font = fonte(18, 500);
      ctx.fillStyle = COR.textoFraco;
      ctx.fillText(textoAjustado(ctx, modo.resumo, canvas.width - 36), 18, 50);

      card.marcarSujo();
    }

    for (let i = 0; i < DIFICULDADES.length; i++) {
      const dif = DIFICULDADES[i];
      const card = this.cardsDificuldade[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'dificuldade' && this.destacado.indice === i;
      const ativo = dif.id === this.dificuldadeAtiva;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { sobMira, ativo }, RAIO.pequeno);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = fonte(22, 700);
      ctx.fillStyle = ativo ? dif.cor : COR.texto;
      ctx.fillText(dif.nome, 18, canvas.height * 0.36);

      ctx.font = fonte(17, 500);
      ctx.fillStyle = COR.textoFraco;
      ctx.fillText(
        textoAjustado(ctx, dif.resumo, canvas.width - 36),
        18,
        canvas.height * 0.72,
      );
      ctx.textBaseline = 'top';

      card.marcarSujo();
    }

    for (let i = 0; i < this.interruptores.length; i++) {
      const chave = this.interruptores[i];
      const card = this.cardsChave[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'interruptor' && this.destacado.indice === i;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { sobMira }, RAIO.pequeno);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = fonte(22, 700);
      ctx.fillStyle = COR.texto;
      ctx.fillText(chave.nome, 18, canvas.height * 0.36);

      ctx.font = fonte(17, 500);
      ctx.fillStyle = COR.textoFraco;
      ctx.fillText(textoAjustado(ctx, chave.diz, canvas.width - 130), 18, canvas.height * 0.72);

      // O interruptor desenhado: trilho e botão, do jeito que todo mundo já sabe
      // ler sem legenda.
      const l = 54;
      const a = 28;
      const x = canvas.width - l - 18;
      const y = (canvas.height - a) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, l, a, a / 2);
      ctx.fillStyle = chave.ligado ? COR.bom : 'rgba(255,255,255,0.14)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(chave.ligado ? x + l - a / 2 : x + a / 2, y + a / 2, a / 2 - 4, 0, Math.PI * 2);
      ctx.fillStyle = chave.ligado ? '#0b0e15' : '#c8d4e6';
      ctx.fill();
      ctx.textBaseline = 'top';

      card.marcarSujo();
    }
  }

  private redesenhar(bolaAtivaId: string) {
    this.redesenharEngrenagem(this.destacado?.tipo === 'engrenagem');
    this.redesenharPc(this.destacado?.tipo === 'pc');
    if (this.nosAjustes) {
      this.redesenharAjustes();
      return;
    }
    this.redesenharTime();
    this.redesenharBolas(bolaAtivaId);
    this.redesenharItens();
    this.redesenharGolpes();
  }

  // ------------------------------------------------------------ quadro

  atualizar(
    dt: number,
    punhoEsquerdo: THREE.Object3D | null,
    mira: { origem: THREE.Vector3; direcao: THREE.Vector3 } | null,
    bolaAtivaId: string,
    camera: THREE.Camera,
    resumo: { vistas: number; capturadas: number; total: number },
    /**
     * Onde a outra mão está. Ela tem prioridade sobre a mira: se o braço já
     * chegou perto de uma carta, é ESSA carta que está sendo escolhida, e
     * continuar destacando o que o raio da mesma mão aponta a três metros
     * dali acenderia a carta errada bem na hora de fechar a mão.
     */
    pontoDaMao: THREE.Vector3 | null = null,
    alcanceDaMao = 0.09,
  ) {
    const querAbrir = olhandoORelogio(punhoEsquerdo, 'left', camera, this.aberto);
    this.aberto = querAbrir;

    this.abertura += ((querAbrir ? 1 : 0) - this.abertura) * Math.min(1, dt * 10);
    this.grupo.visible = this.abertura > 0.03;
    if (!this.grupo.visible) {
      this.destacado = null;
      // Fechar o painel volta para a página principal: reabrir e cair nos
      // ajustes seria uma surpresa toda vez.
      if (this.nosAjustes) {
        this.nosAjustes = false;
        this.assinatura = '';
        this.reposicionar();
      }
      return;
    }

    if (punhoEsquerdo) {
      const posicao = punhoEsquerdo.getWorldPosition(new THREE.Vector3());
      // Quatro centímetros acima do punho, e não catorze.
      //
      // O painel inteiro agora cresce PARA CIMA a partir desta origem (ver
      // `reposicionar`), então ela é a BASE e não mais o centro. Com os catorze
      // de antes, a base flutuaria um palmo acima do braço e o conjunto
      // pareceria solto; com quatro, ele nasce do antebraço — que é onde o
      // jogador acabou de olhar para abri-lo.
      posicao.y += 0.04;
      this.grupo.position.lerp(posicao, Math.min(1, dt * 14));
      this.grupo.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    }
    this.grupo.scale.setScalar(0.6 + this.abertura * 0.4);

    const anterior = this.destacado;
    this.destacado = null;
    if (pontoDaMao && this.abertura > 0.6) {
      const perto = this.alvoMaisPerto(pontoDaMao, alcanceDaMao);
      if (perto) this.destacado = perto;
    }
    if (!this.destacado && mira && this.abertura > 0.6) {
      this.raycaster.set(mira.origem, mira.direcao);
      const acertos = this.raycaster.intersectObjects(
        this.alvos.filter((a) => a.visible),
        false,
      );
      if (acertos.length > 0) {
        const d = acertos[0].object.userData as { tipo: Selecao['tipo']; indice: number };
        this.destacado = { tipo: d.tipo, indice: d.indice };
      }
    }
    this.mudouDestaque =
      this.destacado !== null &&
      (anterior === null ||
        anterior.tipo !== this.destacado.tipo ||
        anterior.indice !== this.destacado.indice);

    const assinatura = [
      this.nosAjustes ? 'aj' : 'pr',
      this.destacado ? `${this.destacado.tipo}:${this.destacado.indice}` : '-',
      bolaAtivaId,
      resumo.vistas,
      resumo.capturadas,
      this.entradas
        .map((e) =>
          e === null
            ? 'vazia'
            : `${e.especie.id}:${Math.ceil(e.hp)}:${e.nivel}:${e.emCampo ? 1 : 0}:` +
              `${e.estagios ? `${e.estagios.ataque},${e.estagios.defesa},${e.estagios.velocidade}` : ''}`,
        )
        .join(','),
      this.bolas.map((b) => `${b.tipo.id}:${b.quantidade}`).join(','),
      this.itens.map((b) => `${b.tipo.id}:${b.quantidade}`).join(','),
      this.modoAtivo,
      this.dificuldadeAtiva,
      this.interruptores.map((c) => `${c.id}:${c.ligado ? 1 : 0}`).join(','),
      this.golpes.map((g) => `${g.golpe.nome}:${g.armado ? 1 : 0}`).join(','),
    ].join('|');
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.redesenharTitulo(resumo.vistas, resumo.capturadas, resumo.total);
      this.redesenhar(bolaAtivaId);
    }

    // O item sob a mira salta um pouco para a frente.
    const saltar = (cards: Placa[], tipo: string, altura: number) => {
      for (let i = 0; i < cards.length; i++) {
        const alvoZ = this.destacado?.tipo === tipo && this.destacado.indice === i ? altura : 0;
        const m = cards[i].malha;
        m.position.z += (alvoZ - m.position.z) * Math.min(1, dt * 12);
      }
    };
    saltar(this.cards, 'criatura', 0.016);
    saltar(this.cardsBola, 'bola', 0.014);
    saltar(this.cardsItem, 'item', 0.012);
    saltar(this.cardsGolpe, 'golpe', 0.014);
    saltar(this.cardsModo, 'modo', 0.014);
    saltar(this.cardsDificuldade, 'dificuldade', 0.012);
    saltar(this.cardsChave, 'interruptor', 0.01);
    saltar([this.cardEngrenagem], 'engrenagem', 0.012);
    saltar([this.cardPc], 'pc', 0.012);
  }

  /** Traduz um alvo (tipo + índice) no que ele representa. */
  private conteudoDe(tipo: Selecao['tipo'], indice: number): Selecao | null {
    switch (tipo) {
      case 'criatura': {
        const entrada = this.entradas[indice];
        return entrada ? { tipo: 'criatura', entrada } : null;
      }
      case 'item': {
        const entrada = this.itens[indice];
        return entrada ? { tipo: 'item', entrada } : null;
      }
      case 'modo': {
        const entrada = MODOS[indice];
        return entrada ? { tipo: 'modo', entrada } : null;
      }
      case 'golpe': {
        const entrada = this.golpes[indice];
        return entrada ? { tipo: 'golpe', entrada } : null;
      }
      case 'engrenagem':
        return { tipo: 'engrenagem' };
      case 'pc':
        return { tipo: 'pc' };
      case 'dificuldade': {
        const entrada = DIFICULDADES[indice];
        return entrada ? { tipo: 'dificuldade', entrada } : null;
      }
      case 'interruptor': {
        const entrada = this.interruptores[indice];
        return entrada ? { tipo: 'interruptor', entrada } : null;
      }
      default: {
        const entrada = this.bolas[indice];
        return entrada ? { tipo: 'bola', entrada } : null;
      }
    }
  }

  get selecao(): Selecao | null {
    if (!this.destacado) return null;
    return this.conteudoDe(this.destacado.tipo, this.destacado.indice);
  }

  /**
   * O que a mão está tocando no painel, por proximidade — sem mira, sem raio.
   *
   * É o que permite estender a mão direita e FECHAR O GRIP em cima da bola do
   * Pokémon que você quer soltar, em vez de mirar de longe: o painel está preso
   * ao seu próprio pulso, a 30 cm do outro braço, e apontar para uma coisa que
   * está encostada em você é mais difícil do que simplesmente pegá-la.
   */
  alcancado(ponto: THREE.Vector3, alcance = 0.09): Selecao | null {
    if (this.abertura < 0.6) return null;
    const melhor = this.alvoMaisPerto(ponto, alcance);
    return melhor ? this.conteudoDe(melhor.tipo, melhor.indice) : null;
  }

  /** A carta mais próxima de um ponto, dentro do alcance. */
  private alvoMaisPerto(
    ponto: THREE.Vector3,
    alcance: number,
  ): { tipo: Selecao['tipo']; indice: number } | null {
    let melhor: { tipo: Selecao['tipo']; indice: number } | null = null;
    let menorDistancia = alcance;
    const centro = new THREE.Vector3();

    for (const alvo of this.alvos) {
      if (!alvo.visible) continue;
      alvo.getWorldPosition(centro);
      const d = centro.distanceTo(ponto);
      if (d < menorDistancia) {
        menorDistancia = d;
        melhor = alvo.userData as { tipo: Selecao['tipo']; indice: number };
      }
    }
    return melhor;
  }

  descartar() {
    for (const card of [
      ...this.cards,
      ...this.cardsBola,
      ...this.cardsItem,
      ...this.cardsModo,
      ...this.cardsGolpe,
      ...this.cardsDificuldade,
      ...this.cardsChave,
      this.cardEngrenagem,
      this.cardPc,
    ])
      card.descartar();
    for (const d of this.descartaveis) d.dispose();
    this.titulo.descartar();
  }
}
