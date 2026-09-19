import * as THREE from 'three';
import { Placa } from './hud';
import { Holobola } from './holo';
import { AVISO, forcaDeToque } from './toque';
import { AFETO, TIPOS, textoEstagio, type Especie, type Estagios } from './species';
import { BOLAS, type TipoBola } from './balls';
import { ITENS, type TipoItem } from './itens';
import { MODOS, type Modo, type ModoId } from './modos';
import { DIFICULDADES, INTERRUPTORES, type Dificuldade, type PerfilDificuldade } from './ajustes';
import { olhandoORelogio } from './gesto';
import { CONDICOES, condicaoDoGolpe } from './condicao';
import { faltamPara } from './marcos';
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
  /** 0 a 1. Ver AFETO em src/species.ts. */
  afeto: number;
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
  /** Aprendido agora e ainda não usado. Ver o ponto dourado em redesenharGolpes. */
  novo?: boolean;
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
  | { tipo: 'mochila' }
  | { tipo: 'chamar' }
  | { tipo: 'dificuldade'; entrada: PerfilDificuldade }
  | { tipo: 'interruptor'; entrada: EntradaInterruptor };

/**
 * As medidas do painel, depois do segundo playtest de 18/09.
 *
 * ## O que estava errado, desta vez
 *
 * O relato foi direto: *"o painel do braço esquerdo está inclinado para frente,
 * projetando; ele precisa ser menor, completamente na vertical, com ângulo reto
 * para cima — diminuir e compactar as informações"*.
 *
 * São três defeitos, e eles têm causas diferentes:
 *
 * 1. **Inclinado.** O painel fazia `lookAt` na cabeça. Com o braço na altura do
 *    peito, encarar a cabeça quer dizer TOMBAR para trás uns trinta graus — e
 *    um painel tombado, em MR, lê como uma folha caindo. Agora ele gira só em
 *    torno do eixo vertical: fica sempre em pé, em ângulo reto com o chão,
 *    virado para você. Ver `atualizar`.
 * 2. **Grande.** Com o time em cartas de 9 × 11 cm, mais bolas, itens, golpes e
 *    título, o painel tinha meio metro de altura saindo do pulso.
 * 3. **Cheio.** Cada carta do time repetia nome, tipo, barra de vida, XP,
 *    nível, afeto e estágios.
 *
 * ## O que mudou
 *
 * O time deixou de ser seis cartas e virou **seis pokébolas de luz** (ver
 * src/holo.ts), cada uma com uma etiqueta fina embaixo. A mesma informação
 * essencial em 8 cm de altura por linha em vez de 12, e — o que importa mais —
 * uma COISA que a mão pega, em vez de um retângulo que se aponta. Era o outro
 * pedido do mesmo playtest.
 *
 * Os itens zerados saíram da página principal: eles continuam na mochila (B),
 * que foi feita para isso, e "0 poções" ocupava uma carta para dizer uma coisa
 * que a mochila já diz melhor.
 *
 * Resultado: ~0,34 m de altura por 0,25 m de largura, contra 0,50 × 0,30.
 *
 * As bolas e as cartas não encolheram mais do que isto de propósito: a medida
 * mínima aqui não é a de LER, é a de ACERTAR com a mão no ar — abaixo de uns
 * sete centímetros de passo, escolher a bola certa vira sorte.
 */
/** Raio da bola de luz do time. A bola de verdade tem 4,5 cm; esta é menor. */
const RAIO_TIME = 0.026;
/** Passo entre bolas do time. Sete centímetros e meio é o mínimo da mão. */
const PASSO_TIME_X = 0.079;
const PASSO_TIME_Y = 0.082;
/** A etiqueta fina que fica sob cada bola. */
const LARGURA_ETIQUETA = 0.074;
const ALTURA_ETIQUETA = 0.024;
const LARGURA_BOLA = 0.069;
const ALTURA_BOLA = 0.06;
const LARGURA_ITEM = 0.042;
const ALTURA_ITEM = 0.038;
const LARGURA_GOLPE = 0.118;
const ALTURA_GOLPE = 0.042;
/** Largura útil do painel. Toda fileira se centra dentro dela. */
const LARGURA_PAINEL = 0.25;
const LARGURA_MODO = 0.122;
const ALTURA_MODO = 0.056;
const LARGURA_DIF = 0.122;
const ALTURA_DIF = 0.05;
/**
 * Os interruptores, em duas colunas.
 *
 * Eram doze, em coluna única de 19 cm: a página de ajustes tinha **77
 * centímetros** de altura saindo do pulso. Passava despercebido enquanto os
 * cards eram objetos soltos no ar; com a moldura única por trás (ver
 * `moldura`), setenta e sete centímetros de chapa escura pendurados no braço
 * seriam a metade do seu quarto tapada.
 *
 * Duas colunas cortam isso pela metade. O card fica com a largura de uma carta
 * de golpe — que é uma medida já usada e já lida no headset —, e o texto de
 * baixo passa a ser uma linha só.
 */
const LARGURA_CHAVE = 0.118;
const ALTURA_CHAVE = 0.044;
const CHAVES_POR_LINHA = 2;
const LADO_ENGRENAGEM = 0.042;
const LADO_PC = 0.042;
const ESPACO = 0.012;
/** Altura da faixa de título, no topo do painel. */
const ALTURA_TITULO = 0.032;
/**
 * Quanto do ângulo até os olhos o painel acompanha, e até onde.
 *
 * Meio ângulo, com teto de trinta graus. Acompanhar por inteiro é o `lookAt`
 * que o playtest de 18/09 rejeitou (*"inclinado para frente, projetando"*);
 * acompanhar zero é o painel de perfil que o playtest de 19/09 rejeitou
 * (*"parece uma sombra que impede de ver o menu"*). A metade é a leitura em
 * ângulo confortável sem que o retângulo deite.
 */
const FRACAO_DO_TOMBO = 0.5;
const TOMBO_MAXIMO = Math.PI * 0.17;
/** O respiro entre a moldura e o conteúdo dela. */
const MARGEM_MOLDURA = 0.013;

/**
 * A cabeça do painel: o título e os quatro comandos, numa faixa só.
 *
 * ## O que estava errado
 *
 * O relato do playtest de 19/09 foi: *"a barra superior onde tem os ícones de
 * configuração não está acima dos pokémons, está MUITO lá em cima — precisa ser
 * um painel único"*.
 *
 * A causa estava numa conta: o título seguia
 * `max(topo da página principal, topo da página de AJUSTES)`. A página de
 * ajustes é uma lista alta — modo, dificuldade e um interruptor por linha —, e
 * ela crescia a cada interruptor novo. Então a barra subia junto, mesmo com a
 * página de ajustes FECHADA, e ficava pairando dez ou quinze centímetros acima
 * do time, sem nada no meio. Era um painel só no código e dois painéis no olho.
 *
 * ## O que ficou
 *
 * A cabeça segue o topo da página ABERTA, e só dela. E os quatro comandos
 * (ajustes, PC, mochila, "vem cá") saíram das colunas laterais — onde ficavam
 * FORA do corpo do painel — para uma fileira centrada logo abaixo do título e
 * logo acima do time. Com a moldura única por trás (ver `moldura`), o conjunto
 * é uma coisa só, que é o que o pedido dizia.
 */
const LADO_ICONE = 0.042;
const VAO_ICONE = 0.008;

/**
 * Um retângulo de cantos arredondados, como geometria.
 *
 * A `Placa` não serve aqui: ela é um canvas de tamanho fixo, e o fundo do
 * painel muda de altura conforme a página e o conteúdo (quatro golpes a mais
 * são dois centímetros a mais). Esticar uma placa deformaria os cantos.
 *
 * Como o fundo não tem texto nenhum — é uma chapa escura e uma borda —, ele não
 * precisa de canvas: uma `Shape` custa quatro curvas e redesenha só quando a
 * medida muda, o que acontece ao trocar de página, não a cada quadro.
 */
function moldura(largura: number, altura: number, raio: number): THREE.ShapeGeometry {
  const r = Math.min(raio, largura / 2, altura / 2);
  const x = -largura / 2;
  const y = -altura / 2;
  const forma = new THREE.Shape();
  forma.moveTo(x + r, y);
  forma.lineTo(x + largura - r, y);
  forma.quadraticCurveTo(x + largura, y, x + largura, y + r);
  forma.lineTo(x + largura, y + altura - r);
  forma.quadraticCurveTo(x + largura, y + altura, x + largura - r, y + altura);
  forma.lineTo(x + r, y + altura);
  forma.quadraticCurveTo(x, y + altura, x, y + altura - r);
  forma.lineTo(x, y + r);
  forma.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(forma, 6);
}

/** Quantas bolas do time por linha. Três é o que cabe na largura útil. */
const TIME_POR_LINHA = 3;

/**
 * Onde fica cada bola do time, em coordenadas do painel.
 *
 * Função pura e exportada pelo mesmo motivo de `disporGrade`, na mochila: a
 * `PainelTime` não pode ser construída fora do navegador (as etiquetas são
 * `Placa`, e `Placa` quer um `<canvas>`), então esta é a parte do arranjo que
 * `tools/smoke.ts` consegue conferir. E o que ela confere importa: duas bolas
 * mais perto entre si do que o alcance da mão disputam o mesmo gesto, e uma
 * etiqueta que desce demais acaba atrás do próprio antebraço.
 *
 * `yBase` é a altura da PRIMEIRA linha, medida do pulso para cima.
 */
export function disporTime(quantasVagas: number, yBase: number): THREE.Vector2[] {
  const saida: THREE.Vector2[] = [];
  for (let i = 0; i < quantasVagas; i++) {
    const linha = Math.floor(i / TIME_POR_LINHA);
    const nestaLinha = Math.min(TIME_POR_LINHA, quantasVagas - linha * TIME_POR_LINHA);
    saida.push(
      new THREE.Vector2(
        ((i % TIME_POR_LINHA) - (nestaLinha - 1) / 2) * PASSO_TIME_X,
        yBase + linha * PASSO_TIME_Y,
      ),
    );
  }
  return saida;
}

/** As medidas que o smoke usa para conferir o arranjo do time. */
export const MEDIDAS_TIME = {
  raio: RAIO_TIME,
  passoX: PASSO_TIME_X,
  passoY: PASSO_TIME_Y,
  alturaEtiqueta: ALTURA_ETIQUETA,
  larguraEtiqueta: LARGURA_ETIQUETA,
  porLinha: TIME_POR_LINHA,
  /** Quanto a etiqueta pendura abaixo do centro da bola. */
  quedaDaEtiqueta: RAIO_TIME + ALTURA_ETIQUETA / 2 + 0.005,
} as const;

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

  /** O time, uma bola de luz por vaga. Ver src/holo.ts. */
  private bolasTime: Holobola[] = [];
  /** A etiqueta fina sob cada bola: nome, nível e vida. */
  private etiquetas: Placa[] = [];
  private cardsBola: Placa[] = [];
  private cardsItem: Placa[] = [];
  private cardsModo: Placa[] = [];
  private cardsGolpe: Placa[] = [];
  private cardsDificuldade: Placa[] = [];
  private cardsChave: Placa[] = [];
  private cardEngrenagem = new Placa(LADO_ENGRENAGEM, LADO_ENGRENAGEM, 128);
  /** O atalho para o PC: a caixa inteira e a equipe, ver src/pc.ts. */
  private cardPc = new Placa(LADO_PC, LADO_PC, 128);
  /**
   * A mochila e o "vem cá", os dois últimos comandos que só existiam em
   * botão. Ver `redesenharMochila`.
   */
  private cardMochila = new Placa(LADO_PC, LADO_PC, 128);
  private cardChamar = new Placa(LADO_PC, LADO_PC, 128);
  private alvos: THREE.Mesh[] = [];
  private titulo = new Placa(LARGURA_PAINEL, ALTURA_TITULO, 448);
  /** A chapa única por trás de tudo. Ver `moldura` e `ajustarMoldura`. */
  private fundo: THREE.Mesh;
  private contorno: THREE.Mesh;
  /** A medida com que a moldura foi construída, para não refazê-la por quadro. */
  private medidaDaMoldura = '';

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
  /**
   * O que o botão de menu mandou, enquanto o gesto não concordar. Ver
   * `alternarPeloBotao`.
   */
  private mandadoPeloBotao: boolean | null = null;
  /** Relógio próprio, para as bolas flutuarem e girarem. */
  private tempo = 0;
  /** A inclinação atual, amortecida. Ver `FRACAO_DO_TOMBO`. */
  private tombo = 0;
  /** Onde o conteúdo da página principal termina, para cima. Ver reposicionar. */
  private topoDaPagina = 0.2;
  private raycaster = new THREE.Raycaster();
  /** A distância da mão à carta mais perto no último `alcancado`. */
  private distanciaDaMao = Infinity;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.titulo.malha.position.set(0, this.topoDaPagina, 0);

    // A moldura vem ANTES de tudo na hierarquia e atrás de tudo em Z: ela é o
    // fundo, e o resto do painel se desenha por cima dela.
    const matFundo = new THREE.MeshBasicMaterial({
      color: 0x080c14,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      toneMapped: false,
    });
    const matContorno = new THREE.MeshBasicMaterial({
      color: 0xa8c4ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      toneMapped: false,
    });
    this.descartaveis.push(matFundo, matContorno);
    this.fundo = new THREE.Mesh(moldura(0.1, 0.1, 0.016), matFundo);
    this.contorno = new THREE.Mesh(moldura(0.1, 0.1, 0.016), matContorno);
    this.fundo.position.z = -0.004;
    this.contorno.position.z = -0.005;
    this.fundo.renderOrder = 8;
    this.contorno.renderOrder = 7;

    this.grupo.add(
      this.contorno,
      this.fundo,
      this.titulo.malha,
      this.cardEngrenagem.malha,
      this.cardPc.malha,
    );
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
      // Fora de fase por vaga: seis bolas boiando no mesmo compasso são uma
      // engrenagem, seis fora de compasso são seis bolas.
      const bola = new Holobola(RAIO_TIME, i * 1.9);
      this.bolasTime.push(bola);
      this.grupo.add(bola.grupo);

      const etiqueta = new Placa(LARGURA_ETIQUETA, ALTURA_ETIQUETA, 240);
      this.etiquetas.push(etiqueta);
      this.grupo.add(etiqueta.malha);

      // O alvo é do tamanho da BOLA, não da etiqueta: o que a mão procura é a
      // esfera. Um alvo do tamanho do conjunto faria a mão "pegar" a bola de
      // cima ao passar pelo nome da de baixo.
      novoAlvo('criatura', i, RAIO_TIME * 2.2, RAIO_TIME * 2.2);
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

    this.grupo.add(this.cardMochila.malha);
    this.grupo.add(this.cardChamar.malha);

    novoAlvo('engrenagem', 0, LADO_ENGRENAGEM, LADO_ENGRENAGEM);
    novoAlvo('pc', 0, LADO_PC, LADO_PC);
    novoAlvo('mochila', 0, LADO_PC, LADO_PC);
    novoAlvo('chamar', 0, LADO_PC, LADO_PC);
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
    // Só o que você TEM. O painel do pulso mostrava os três básicos sempre, na
    // conta de que "0 poções" é informação — e é, mas ela já está na mochila
    // (B), que desde 17/09 é onde os itens moram de verdade. Aqui a mesma linha
    // custava trinta e oito milímetros de painel para repetir um zero.
    this.itens = itens.filter((i) => i.quantidade > 0);
    this.golpes = golpes.slice(0, this.cardsGolpe.length);
    this.modoAtivo = modoAtivo;
    this.dificuldadeAtiva = dificuldadeAtiva;
    this.interruptores = interruptores;
    this.reposicionar();
  }

  /** Alterna entre a página principal e a dos ajustes. */
  /**
   * Abre ou fecha pelo botão de menu — pedido do playtest de 19/09.
   *
   * A ordem importa: ele inverte o estado de AGORA, que pode ter vindo do
   * gesto. Se o painel está aberto porque você está olhando o pulso, o botão
   * fecha; e ele continua fechado até você baixar o braço, porque só aí o
   * gesto volta a concordar e a ordem do botão se desfaz.
   */
  alternarPeloBotao() {
    this.mandadoPeloBotao = !this.aberto;
  }

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
    const baseBola = this.bolasTime.length;
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

    // A fileira de bolas de estoque só aparece se alguém a preencher — hoje
    // ninguém preenche, porque as bolas moram no antebraço (src/cinto.ts). Sem
    // esta guarda, a lista vazia ainda empurrava quatro centímetros e meio de
    // vão para o meio do painel.
    if (this.bolas.length > 0) {
      this.grade(this.cardsBola, baseBola, this.bolas.length, LARGURA_BOLA, ALTURA_BOLA, y, principal, 4, -1);
      const linhasDeBola = Math.max(1, Math.ceil(this.bolas.length / 4));
      y += (linhasDeBola - 1) * (ALTURA_BOLA + ESPACO * 0.7);
      y += ALTURA_BOLA / 2 + 0.016;
    }

    // --- o time, em bolas de luz, três por linha ---
    //
    // A base da primeira linha tem de deixar espaço para a ETIQUETA, que
    // pendura abaixo da bola: sem isso o nome do primeiro Pokémon cairia atrás
    // do próprio antebraço.
    y += RAIO_TIME + ALTURA_ETIQUETA + 0.008;
    const linhasDeTime = Math.max(1, Math.ceil(this.entradas.length / TIME_POR_LINHA));
    const lugares = disporTime(this.entradas.length, y);
    for (let i = 0; i < this.bolasTime.length; i++) {
      const visivel = principal && i < this.entradas.length;
      this.bolasTime[i].visivel = visivel;
      this.etiquetas[i].malha.visible = visivel && this.entradas[i] !== null;
      const alvo = this.alvos[i];
      alvo.visible = visivel;
      if (!visivel) continue;

      const lugar = lugares[i];
      this.bolasTime[i].grupo.position.set(lugar.x, lugar.y, 0);
      this.etiquetas[i].malha.position.set(
        lugar.x,
        lugar.y - MEDIDAS_TIME.quedaDaEtiqueta,
        0.001,
      );
      alvo.position.set(lugar.x, lugar.y, 0);
    }
    y += (linhasDeTime - 1) * PASSO_TIME_Y;
    // Um centímetro e meio acima da bola mais alta. Era dois e meio, quando a
    // barra do título flutuava longe daqui de qualquer jeito; agora ela encosta,
    // e cada milímetro entre as duas é um vão que se vê.
    this.topoDaPagina = y + RAIO_TIME + 0.014;

    // --- página de ajustes, do topo para baixo dentro do mesmo espaço ---
    //
    // Ela é uma LISTA, e lista se lê de cima para baixo. O topo dela é o topo
    // DELA: encaixá-lo no topo da outra página (que era o que o `max` fazia)
    // amarrava as duas alturas e empurrava a barra do título para cima na
    // página principal, onde a lista de ajustes nem está desenhada. Ver
    // `LADO_ICONE`, que conta essa história inteira.
    const linhasDeChave = Math.max(1, Math.ceil(this.interruptores.length / CHAVES_POR_LINHA));
    const alturaAjustes =
      ALTURA_MODO + ALTURA_DIF + linhasDeChave * (ALTURA_CHAVE + ESPACO * 0.7) + 0.06;
    const yModo = alturaAjustes - ALTURA_MODO / 2;
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

    // Duas colunas, de cima para baixo. Ver `LARGURA_CHAVE`.
    this.grade(
      this.cardsChave,
      baseChave,
      this.interruptores.length,
      LARGURA_CHAVE,
      ALTURA_CHAVE,
      yChaveBase,
      !principal,
      CHAVES_POR_LINHA,
      1,
    );

    // --- a cabeça do painel: os comandos e, acima deles, o título ---
    //
    // Ela encosta no conteúdo da página ABERTA. Na principal isso quer dizer
    // logo acima da última linha de bolas do time — que é onde o playtest
    // mandou pôr, e onde ela estava deixando de ficar por causa da conta que
    // acabou de sair daqui.
    //
    // Os quatro comandos vêm numa fileira centrada, dentro da largura do
    // painel: antes eram duas colunas penduradas FORA dele, e duas colunas
    // soltas ao lado de um retângulo são três objetos, não um.
    const topoDoConteudo = principal ? this.topoDaPagina : alturaAjustes;
    const yIcones = topoDoConteudo + LADO_ICONE / 2 + 0.009;
    const yTitulo = yIcones + LADO_ICONE / 2 + ALTURA_TITULO / 2 + 0.007;

    const passoIcone = LADO_ICONE + VAO_ICONE;
    // Da esquerda para a direita: PC, mochila, "vem cá", ajustes. A engrenagem
    // fica na ponta direita, que é onde todo mundo procura opções.
    const xIcone = (coluna: number) => (coluna - 1.5) * passoIcone;

    this.titulo.malha.position.set(0, yTitulo, 0);

    const porIcone: Array<[Placa, number]> = [
      [this.cardPc, indiceEngrenagem + 1],
      [this.cardMochila, indiceEngrenagem + 2],
      [this.cardChamar, indiceEngrenagem + 3],
      [this.cardEngrenagem, indiceEngrenagem],
    ];
    for (let c = 0; c < porIcone.length; c++) {
      const [card, indiceAlvo] = porIcone[c];
      card.malha.position.set(xIcone(c), yIcones, 0);
      const alvo = this.alvos[indiceAlvo];
      alvo.visible = true;
      alvo.position.set(xIcone(c), yIcones, -0.001);
    }

    this.ajustarMoldura(yTitulo + ALTURA_TITULO / 2);
  }

  /**
   * Estica a chapa de fundo para caber o painel inteiro.
   *
   * A base é o pulso (y = 0) e o teto é o topo do título. A largura é a do
   * painel mais uma margem — nada mais mora fora dela desde que os comandos
   * entraram na fileira do topo.
   *
   * A geometria só é refeita quando a MEDIDA muda, e a medida muda ao trocar de
   * página ou ao ganhar uma linha de golpes. Refazer uma `Shape` por quadro
   * seria alocar lixo a 90 Hz para desenhar o mesmo retângulo.
   */
  private ajustarMoldura(topo: number) {
    const largura = LARGURA_PAINEL + MARGEM_MOLDURA * 2;
    const base = -MARGEM_MOLDURA;
    const altura = topo + MARGEM_MOLDURA - base;
    const chave = `${largura.toFixed(4)}:${altura.toFixed(4)}`;
    if (chave === this.medidaDaMoldura) return;
    this.medidaDaMoldura = chave;

    const centro = base + altura / 2;
    for (const [malha, folga] of [
      [this.fundo, 0],
      [this.contorno, 0.0025],
    ] as Array<[THREE.Mesh, number]>) {
      malha.geometry.dispose();
      malha.geometry = moldura(largura + folga * 2, altura + folga * 2, 0.018 + folga);
      malha.position.y = centro;
    }
  }

  // ------------------------------------------------------------ desenho

  private redesenharTitulo(vistas: number, capturadas: number, total: number) {
    const { ctx, canvas } = this.titulo;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, {}, RAIO.pequeno);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = fonte(26, 700);
    ctx.fillStyle = COR.texto;
    ctx.fillText(this.nosAjustes ? 'ajustes' : 'seu time', 20, canvas.height * 0.5);

    // O canto direito conta a coleção — a não ser quando o próximo marco está
    // ao alcance da mão, e aí ele conta quantas faltam.
    //
    // Cinco e não sempre: o número que interessa é o que você pode fechar hoje.
    // "Faltam quarenta e dois" não é meta, é distância, e uma distância grande
    // no lugar onde antes havia um placar torna o painel mais burocrático sem
    // deixá-lo mais útil.
    const proximo = this.nosAjustes ? null : faltamPara(capturadas);
    const perto = proximo && proximo.faltam <= 5;

    ctx.textAlign = 'right';
    ctx.font = fonte(18, 600);
    ctx.fillStyle = perto ? '#ffd98a' : COR.textoFraco;
    ctx.fillText(
      this.nosAjustes
        ? this.dificuldadeAtiva
        : perto
          ? `faltam ${proximo!.faltam} para o próximo marco`
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

  /**
   * A mochila e o "vem cá": os dois últimos comandos que só o botão tinha.
   *
   * ## Por que eles estão aqui
   *
   * É o mesmo argumento do PC, um degrau mais grave. O PC "sempre abriu no
   * botão Y, o que é o mesmo que não existir para quem não leu o manual" — e
   * para quem larga os controles não é NEM o manual: **não existe botão**. Uma
   * fonte de hand tracking não tem gamepad, `apertou()` lê um array vazio, e o
   * comando não é difícil de achar, é impossível de dar.
   *
   * Eram três nessa situação. A mochila (B na mão que aponta), o chamar (A na
   * mão do painel), e a foto — que ficou na Pokédex, onde a câmera está. As
   * outras ações de botão têm caminho: recolher é escolher no painel quem já
   * está em campo, e o PC é a carta ao lado.
   *
   * O ícone é uma bolsa com alça, desenhada em caminho pelo mesmo motivo da
   * engrenagem — emoji no headset vira retângulo vazio.
   */
  private redesenharMochila(sobMira: boolean) {
    const { ctx, canvas } = this.cardMochila;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { sobMira }, RAIO.pequeno);

    const cor = sobMira ? COR.texto : COR.textoFraco;
    const l = canvas.width * 0.5;
    const a = l * 0.82;
    const x = (canvas.width - l) / 2;
    const y = canvas.height * 0.36;

    ctx.lineWidth = Math.max(2, canvas.width * 0.035);
    ctx.strokeStyle = cor;

    // O corpo da bolsa.
    ctx.beginPath();
    ctx.roundRect(x, y, l, a, 5);
    ctx.stroke();

    // A alça, um meio-arco saindo do topo.
    ctx.beginPath();
    ctx.arc(canvas.width / 2, y, l * 0.28, Math.PI, 0);
    ctx.stroke();

    // E o fecho, que é o que separa uma bolsa de uma caixa.
    ctx.beginPath();
    ctx.moveTo(x, y + a * 0.42);
    ctx.lineTo(x + l, y + a * 0.42);
    ctx.stroke();

    this.cardMochila.marcarSujo();
  }

  /**
   * O "vem cá": ele deixa o que está fazendo e volta para perto de você.
   *
   * O ícone é uma seta apontando para dentro de um ponto — a mesma ideia do
   * comando, que não é "ande até ali" e sim "volte para mim". Ver
   * `redesenharMochila` para o porquê de isto estar no painel.
   */
  private redesenharChamar(sobMira: boolean) {
    const { ctx, canvas } = this.cardChamar;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { sobMira }, RAIO.pequeno);

    const cor = sobMira ? COR.texto : COR.textoFraco;
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.58;
    const r = canvas.width * 0.13;

    ctx.lineWidth = Math.max(2, canvas.width * 0.035);
    ctx.strokeStyle = cor;

    // O ponto que é você.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // A seta vindo de cima para dentro dele.
    const topo = canvas.height * 0.16;
    ctx.beginPath();
    ctx.moveTo(cx, topo);
    ctx.lineTo(cx, cy - r - canvas.height * 0.04);
    ctx.stroke();

    const ponta = cy - r - canvas.height * 0.04;
    const aba = canvas.width * 0.11;
    ctx.beginPath();
    ctx.moveTo(cx - aba, ponta - aba);
    ctx.lineTo(cx, ponta);
    ctx.lineTo(cx + aba, ponta - aba);
    ctx.stroke();

    this.cardChamar.marcarSujo();
  }

  /**
   * O time: a cor e o brilho de cada bola, e a etiqueta que fica sob ela.
   *
   * ## O que cabe numa etiqueta de sete centímetros
   *
   * A carta antiga tinha nome, tipo, nível, barra de vida, barra de XP, número
   * exato de HP, corações de afeto e estágios de buff — oito coisas, num painel
   * que o jogador abre no meio de uma briga. Aqui ficaram as três que mudam a
   * decisão de quem vai estender o braço: QUEM é, em que NÍVEL está e quanta
   * VIDA tem. O resto foi para onde ele já estava disponível: o tipo é a cor da
   * própria bola, o número exato de HP e o XP estão no PC, e os estágios
   * aparecem na linha de baixo só de quem está em campo — que é o único momento
   * em que um buff existe.
   */
  private redesenharTime() {
    for (let i = 0; i < this.entradas.length; i++) {
      const e = this.entradas[i];
      const bola = this.bolasTime[i];
      const etiqueta = this.etiquetas[i];
      const sobMira = this.destacado?.tipo === 'criatura' && this.destacado.indice === i;

      // Vaga vazia: a bola continua ali, quase apagada, e não há etiqueta. O
      // buraco é informação — é onde cabe o próximo, e é o que mantém a ordem
      // do time (que é escolha sua) de pé quando um Pokémon vai para o PC.
      if (!e) {
        bola.definirCores(0x37405a, 0x2a3142);
        bola.definirCheia(0.12);
        etiqueta.malha.visible = false;
        continue;
      }

      const desmaiado = e.hp <= 0;
      const corTipo = TIPOS[e.especie.tipo].cor;
      const fracao = e.hp / Math.max(1, e.hpMax);

      // A cor da bola é a do TIPO: é o que faz reconhecer o Charmander pelo
      // laranja antes de ler o nome. Desmaiado apaga para cinza, brilhante
      // troca a metade de baixo por dourado.
      bola.definirCores(desmaiado ? 0x4a4f5e : corTipo, e.shiny ? 0xffd982 : 0xdfe7f2);
      // Vida baixa faz a bola apagar junto: a barra da etiqueta diz o número, a
      // bola diz o estado pelo canto do olho.
      bola.definirCheia(desmaiado ? 0.16 : 0.55 + fracao * 0.45);
      etiqueta.malha.visible = true;

      const { ctx, canvas } = etiqueta;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cartao(
        ctx,
        1,
        1,
        canvas.width - 2,
        canvas.height - 2,
        { sobMira, ativo: e.emCampo, apagado: desmaiado, acento: corTipo },
        RAIO.pequeno,
      );

      // Linha de cima: o nome à esquerda, o nível à direita. O nível é curto e
      // fixo, então ele é que cede a largura ao nome, e não o contrário.
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.font = fonte(21, 700);
      ctx.fillStyle = desmaiado ? COR.textoApagado : '#c8d4e6';
      const textoNivel = `N${e.nivel}`;
      ctx.fillText(textoNivel, canvas.width - 10, 24);
      const larguraNivel = ctx.measureText(textoNivel).width;

      ctx.textAlign = 'left';
      ctx.font = fonte(23, 700);
      ctx.fillStyle = desmaiado ? COR.textoApagado : e.shiny ? '#ffe08a' : COR.texto;
      nomeComBrilho(
        ctx,
        e.especie.nome,
        e.shiny,
        10,
        24 - 11,
        22,
        canvas.width - 26 - larguraNivel,
      );

      // O coração aparece a partir de dois: é o limiar em que ele passa a
      // aguentar um golpe por você (ver AFETO), e antes disso não muda nada.
      if (e.afeto >= AFETO.limiarParaAguentar) {
        ctx.textAlign = 'right';
        ctx.font = fonte(14, 700);
        ctx.fillStyle = '#ff9ec4';
        ctx.fillText('♥', canvas.width - 10 - larguraNivel - 5, 24);
      }

      // Linha de baixo: a vida, em barra. Quem está em campo com buff ativo
      // CEDE metade da linha para eles — escrever por cima da barra deixa as
      // duas coisas ilegíveis, e um buff que ninguém vê é um buff que não
      // existe.
      const yBarra = canvas.height - 18;
      const marcas: string[] = [];
      if (e.emCampo && e.estagios) {
        if (e.estagios.ataque) marcas.push(`ATQ${textoEstagio(e.estagios.ataque)}`);
        if (e.estagios.defesa) marcas.push(`DEF${textoEstagio(e.estagios.defesa)}`);
        if (e.estagios.velocidade) marcas.push(`VEL${textoEstagio(e.estagios.velocidade)}`);
      }

      const larguraBarra = marcas.length ? (canvas.width - 20) * 0.52 : canvas.width - 20;
      barra(ctx, 10, yBarra, larguraBarra, 8, fracao, corDaVida(fracao));

      if (marcas.length) {
        ctx.textAlign = 'right';
        ctx.font = fonte(15, 700);
        ctx.fillStyle = COR.bom;
        ctx.fillText(
          textoAjustado(ctx, marcas.join(' '), canvas.width - larguraBarra - 26),
          canvas.width - 10,
          yBarra + 4,
        );
      }

      ctx.textBaseline = 'top';
      etiqueta.marcarSujo();
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
      const { golpe, armado, novo } = this.golpes[i];
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

      // O ponto dourado do golpe recém-aprendido.
      //
      // É um ponto e não a palavra "NOVO" porque o card já carrega nome,
      // categoria, tipo, potência e às vezes uma condição — mais uma etiqueta e
      // ninguém lê nenhuma. E é da mesma cor com que o cartão anunciou
      // "aprendeu Fúria!": a cor é o que liga o aviso que passou ao card que
      // ficou, sem precisar lembrar do nome.
      const recuo = novo ? 20 : 0;
      if (novo) {
        ctx.beginPath();
        ctx.arc(22, 31, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd98a';
        ctx.fill();
      }

      ctx.font = fonte(23, 700);
      ctx.fillStyle = COR.texto;
      ctx.fillText(textoAjustado(ctx, golpe.nome, canvas.width - 84 - recuo), 16 + recuo, 20);

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
      // Duas colunas: o card tem 11,8 cm e o canvas continua com 460 px de
      // largura, então a letra pode crescer em pixel para manter o mesmo
      // tamanho em centímetros que ela tinha na coluna larga.
      ctx.font = fonte(30, 700);
      ctx.fillStyle = COR.texto;
      ctx.fillText(textoAjustado(ctx, chave.nome, canvas.width - 110), 20, canvas.height * 0.33);

      ctx.font = fonte(22, 500);
      ctx.fillStyle = COR.textoFraco;
      ctx.fillText(textoAjustado(ctx, chave.diz, canvas.width - 36), 20, canvas.height * 0.68);

      // O interruptor desenhado: trilho e botão, do jeito que todo mundo já sabe
      // ler sem legenda.
      const l = 66;
      const a = 34;
      const x = canvas.width - l - 20;
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
    this.redesenharMochila(this.destacado?.tipo === 'mochila');
    this.redesenharChamar(this.destacado?.tipo === 'chamar');
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
    lado: 'left' | 'right',
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
    // O lado vem de fora: o painel mora no pulso NÃO dominante, e qual é esse
    // depende de quem está jogando. Ver `canhoto` em src/ajustes.ts.
    // O BOTÃO manda enquanto durar, e o gesto continua valendo.
    //
    // Dois caminhos para a mesma coisa, e é de propósito: o gesto do relógio é
    // o que torna o painel parte do mundo, e o botão é o que salva quem está
    // com o braço ocupado, com o bicho no colo, ou simplesmente não quer
    // levantar o pulso pela vigésima vez. Ver `alternarPeloBotao`.
    //
    // Quem apertou o botão manda até o gesto CONCORDAR com ele: fechar no
    // botão e o painel reabrir no quadro seguinte porque o pulso ainda estava
    // virado seria a pior combinação possível dos dois.
    const gesto = olhandoORelogio(punhoEsquerdo, lado, camera, this.aberto);
    if (this.mandadoPeloBotao !== null && gesto === this.mandadoPeloBotao) {
      this.mandadoPeloBotao = null;
    }
    const querAbrir = this.mandadoPeloBotao ?? gesto;
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

      // Em pé, sempre. Ele gira em torno do eixo VERTICAL para ficar de frente
      // para você e não inclina nunca — nem para cima, nem para baixo, nem de
      // lado.
      //
      // Era um `lookAt` na cabeça, e é isso que o playtest de 18/09 chamou de
      // "inclinado para frente": com o braço na altura do peito e a cabeça meio
      // metro acima, encarar a cabeça significa deitar o painel uns trinta
      // graus para trás. Num monitor isso é invisível; em realidade misturada,
      // onde o painel divide a cena com as paredes de verdade do seu quarto, um
      // retângulo tombado lê como um papel caindo — e, pior, a mão que vem
      // pegar uma bola tem de vir de baixo, por um ângulo que ela não vê.
      //
      // O preço era conhecido, e foi cobrado: *"em uma altura, parece uma
      // sombra que impede de ver o menu do braço"* — playtest de 19/09. Com o
      // painel rigorosamente vertical e o braço na altura do peito, quem olha
      // de cima vê o retângulo quase de perfil: uma lasca escura, que de fato
      // parece uma sombra tapando o painel.
      //
      // A correção NÃO é voltar ao `lookAt`, que foi o defeito anterior. É uma
      // inclinação PARCIAL: ele tomba uma fração do ângulo até os olhos, com
      // teto de trinta graus. Como o ângulo até os olhos cresce quando o braço
      // se aproxima do corpo (a distância horizontal encolhe e a vertical não),
      // isso dá exatamente o que foi pedido — reto com o braço estendido, e
      // "uma leve inclinação conforme aproxima do corpo".
      const olho = camera.getWorldPosition(new THREE.Vector3());
      const rumo = Math.atan2(olho.x - posicao.x, olho.z - posicao.z);
      const chao = Math.hypot(olho.x - posicao.x, olho.z - posicao.z);
      const paraOOlho = Math.atan2(olho.y - posicao.y, Math.max(0.05, chao));
      const tombo = THREE.MathUtils.clamp(paraOOlho * FRACAO_DO_TOMBO, -TOMBO_MAXIMO, TOMBO_MAXIMO);
      // Amortecido: o ângulo é medido contra um pulso que treme, e um painel
      // que corrige a inclinação a cada quadro cintila no canto do olho.
      this.tombo += (tombo - this.tombo) * Math.min(1, dt * 6);
      // YXZ: o rumo primeiro, a inclinação depois, no eixo horizontal do
      // próprio painel. Na ordem padrão (XYZ) o tombo sairia torto quando o
      // rumo não fosse zero.
      this.grupo.rotation.order = 'YXZ';
      this.grupo.rotation.set(-this.tombo, rumo, 0);
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
            : `${e.especie.id}:${Math.ceil(e.hp)}:${e.nivel}:${e.emCampo ? 1 : 0}:${Math.round(e.afeto * 10)}:` +
              `${e.estagios ? `${e.estagios.ataque},${e.estagios.defesa},${e.estagios.velocidade}` : ''}`,
        )
        .join(','),
      this.bolas.map((b) => `${b.tipo.id}:${b.quantidade}`).join(','),
      this.itens.map((b) => `${b.tipo.id}:${b.quantidade}`).join(','),
      this.modoAtivo,
      this.dificuldadeAtiva,
      this.interruptores.map((c) => `${c.id}:${c.ligado ? 1 : 0}`).join(','),
      this.golpes.map((g) => `${g.golpe.nome}:${g.armado ? 1 : 0}:${g.novo ? 1 : 0}`).join(','),
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
    // O time não "salta": a bola de luz tem o destaque dela, que cresce, gira
    // mais rápido e acende um aro. Ver Holobola.atualizar.
    this.tempo += dt;
    for (let i = 0; i < this.bolasTime.length; i++) {
      const sobAMao = this.destacado?.tipo === 'criatura' && this.destacado.indice === i;
      // Contínuo, e não liga-desliga: a bola cresce enquanto o braço chega, com
      // a mesma conta que faz a mão vibrar. Ver src/toque.ts.
      this.bolasTime[i].atualizar(dt, this.tempo, sobAMao ? this.forcaDoToque() : 0, this.abertura);
      this.etiquetas[i].opacidade = this.abertura;
    }
    saltar(this.cardsBola, 'bola', 0.014);
    saltar(this.cardsItem, 'item', 0.012);
    saltar(this.cardsGolpe, 'golpe', 0.014);
    saltar(this.cardsModo, 'modo', 0.014);
    saltar(this.cardsDificuldade, 'dificuldade', 0.012);
    saltar(this.cardsChave, 'interruptor', 0.01);
    saltar([this.cardEngrenagem], 'engrenagem', 0.012);
    saltar([this.cardPc], 'pc', 0.012);
    saltar([this.cardMochila], 'mochila', 0.012);
    saltar([this.cardChamar], 'chamar', 0.012);
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
      case 'mochila':
        return { tipo: 'mochila' };
      case 'chamar':
        return { tipo: 'chamar' };
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

  /**
   * A que distância ficou a carta que o último `alcancado` achou.
   *
   * Existe para a CUTUCADA: encostar o dedo num botão precisa de uma
   * distância, e não de um sim-ou-não, porque o limiar de entrar e o de sair
   * são diferentes de propósito. Ver src/cutucar.ts.
   *
   * `Infinity` quando não havia nada por perto — que é o valor certo para
   * "saiu", e não zero.
   */
  get distanciaDoDedo(): number {
    return this.distanciaDaMao;
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
    this.distanciaDaMao = melhor ? menorDistancia : Infinity;
    return melhor;
  }

  /**
   * Quanto a mão está encostando na carta mais perto, de 0 a 1.
   *
   * Só do caminho de PROXIMIDADE, nunca do raycast: vibrar porque o laser da
   * outra mão varreu uma carta a meio metro de distância seria mentira tátil —
   * a mão que sente é a que está chegando, não a que está apontando.
   */
  forcaDoToque(alcance = 0.09): number {
    if (this.abertura < 0.6) return 0;
    return forcaDeToque(this.distanciaDaMao, alcance, AVISO.carta);
  }

  descartar() {
    for (const bola of this.bolasTime) bola.descartar();
    for (const card of [
      ...this.etiquetas,
      ...this.cardsBola,
      ...this.cardsItem,
      ...this.cardsModo,
      ...this.cardsGolpe,
      ...this.cardsDificuldade,
      ...this.cardsChave,
      this.cardEngrenagem,
      this.cardPc,
      this.cardMochila,
      this.cardChamar,
    ])
      card.descartar();
    for (const d of this.descartaveis) d.dispose();
    // A moldura troca de geometria ao mudar de página; a que estiver de pé
    // agora não está em `descartaveis`.
    this.fundo.geometry.dispose();
    this.contorno.geometry.dispose();
    this.titulo.descartar();
  }
}
