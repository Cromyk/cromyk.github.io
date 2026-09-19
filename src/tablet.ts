import * as THREE from 'three';
import { audio } from './audio';

/**
 * A carcaça da Pokédex: um tablet de plástico que você carrega nas costas.
 *
 * Antes a Pokédex era uma projeção — você girava o pulso direito e ela
 * aparecia flutuando, como um menu. Funcionava e era invisível de tão comum:
 * todo jogo de RA tem um painel que brota do pulso. O que ela não era é um
 * OBJETO, e num jogo em que a graça é que as coisas estão na sua sala, a
 * Pokédex ser a única coisa que não se pega era a peça fora do lugar.
 *
 * Agora ela é um tablet: mora nas suas costas, você leva a mão lá atrás e
 * agarra — com a mão que estiver livre, direita ou esquerda —, lê, e devolve
 * levando de volta. Quando está nas costas, ela está atrás de você de verdade:
 * se você virar o corpo, ela vira junto; se olhar para trás, ela está lá.
 *
 * ## A moldura
 *
 * Vermelha e branca, com o símbolo da pokébola no topo. Nada disso é enfeite:
 * a mão que vai às costas pega ÀS CEGAS, e o que diz "peguei a Pokédex e não
 * outra coisa" é a silhueta batendo na palma. O vermelho é para achá-la no
 * chão quando ela cair, que é uma coisa que vai acontecer.
 */

/** Medidas em metros. A tela é o que sobra da moldura. */
const LARGURA = 0.34;
const ALTURA = 0.45;
const ESPESSURA = 0.016;
/** A faixa de cima, onde mora o símbolo. */
const TOPO = 0.072;

const VERMELHO = 0xd8232a;
const BRANCO = 0xeef1f6;
const PRETO = 0x1a1a1e;

/**
 * Onde ela fica guardada, em coordenadas da cabeça: atrás e um pouco abaixo,
 * na altura das costas de quem está de pé.
 *
 * O Z positivo é atrás pela convenção da câmera. Vinte e dois centímetros é o
 * suficiente para ela não encostar nas suas costelas e perto o bastante para o
 * braço alcançar sem contorcer — foi medido pelo alcance do gesto de coçar as
 * costas, que é o movimento que a pessoa já sabe fazer.
 */
const GUARDADA = new THREE.Vector3(0, -0.16, 0.22);

/**
 * E onde ela fica para quem está SENTADO: um coldre no quadril.
 *
 * Levar a mão às costas é um gesto de quem está de pé. Numa poltrona, numa
 * cadeira de escritório ou numa cadeira de rodas, as suas costas estão
 * encostadas em alguma coisa — e o gesto deixa de ser desconfortável para ser
 * impossível. A Pokédex é a única coisa do jogo guardada num lugar do corpo que
 * o encosto tapa.
 *
 * Sentado, então, ela desce para o lado do quadril, do lado da mão que aponta:
 * 24 cm para fora, 42 abaixo dos olhos, e um pouco à frente do plano do corpo.
 * É a mesma distância de braço — o que muda é que ela deixa de estar atrás de
 * você.
 *
 * O X é preenchido na hora, porque depende de qual mão é a dominante.
 */
const GUARDADA_SENTADO = new THREE.Vector3(0.24, -0.42, 0.06);

/** Quão perto a mão precisa chegar das costas para agarrar. */
export const ALCANCE_TABLET = 0.22;

/**
 * A queda, desde 18/09.
 *
 * O relato foi: *"quando agarro a pokedex, ele buga na mão e não consigo tirar
 * da mão, quero soltar o grip e o item cair"*. Ela tinha entrada e não tinha
 * saída — abrir a mão era literalmente um no-op —, e agora ela cai.
 *
 * Os números saem da Pokébola (src/orb.ts) para o peso ser o mesmo do resto do
 * jogo, e os que MUDAM mudam por um motivo físico: uma placa de plástico não
 * quica como uma esfera nem escorrega como uma. Daí a restituição de 0,15
 * contra os 0,42 dela, e o atrito que mata a corrida lateral em três quiques.
 */
const GRAVIDADE = -9.81;
const RESTITUICAO = 0.15;
const ATRITO = 0.6;
/** Abaixo desta velocidade vertical ela para em vez de quicar de novo. */
const PARADA = 0.35;
/**
 * Quanto tempo ela fica no carpete antes de voltar sozinha para as costas.
 *
 * Ela NÃO PODE sumir: sem Pokédex não há Pokédex, e uma que rolou para debaixo
 * do sofá levaria junto metade do jogo. Vinte e cinco segundos é tempo de você
 * decidir se vai buscá-la, e os cinco últimos piscam a luzinha do símbolo para
 * dizer que ela está voltando.
 */
const SEGUNDOS_CAIDA = 25;
const AVISO_DE_VOLTA = 5;
/** A escala em que ela vive na mão e no chão. */
const ESCALA = 0.62;
/** Meia espessura já escalada: é o que separa a tela do carpete. */
const MEIA_ESPESSURA = ESPESSURA * ESCALA * 0.5;
/** Caída, ela tomba até ficar deitada, tela para cima. */
const DEITADA = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/**
 * O que a queda precisa saber do quarto: a altura do apoio sob um ponto.
 *
 * Interface estrutural, e não `import { Sala }`, para este arquivo continuar
 * construível em `tools/smoke.ts` sem arrastar o mapeamento inteiro. `Sala` já
 * a satisfaz.
 */
export interface Apoio {
  alturaEm(ponto: THREE.Vector3): number;
}

export class Tablet {
  readonly grupo = new THREE.Group();
  /** Onde as placas da Pokédex entram: o grupo da tela. */
  readonly tela = new THREE.Group();

  /** Quem está segurando, pelo índice da mão. null = está nas costas. */
  naMaoDe: number | null = null;
  /** Ela foi largada e está caindo, ou parada no carpete. Ver `largar`. */
  private caida = false;
  private velocidade = new THREE.Vector3();
  private tempoNoChao = 0;
  private luzinha: THREE.Mesh | null = null;

  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private posicaoGuardada = new THREE.Vector3();
  private giroGuardado = new THREE.Quaternion();
  private aux = new THREE.Vector3();
  /** Onde ela fica guardada neste quadro: costas ou quadril. */
  private ondeFica = new THREE.Vector3();
  private auxGiro = new THREE.Euler();

  constructor() {
    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    const matVermelho = guardar(
      new THREE.MeshStandardMaterial({ color: VERMELHO, roughness: 0.42, metalness: 0.05 }),
    );
    const matBranco = guardar(
      new THREE.MeshStandardMaterial({ color: BRANCO, roughness: 0.5, metalness: 0.02 }),
    );
    const matPreto = guardar(
      new THREE.MeshStandardMaterial({ color: PRETO, roughness: 0.55, metalness: 0.1 }),
    );

    // O corpo: a metade de cima vermelha, a de baixo branca. A divisão fica
    // logo abaixo da tela, que é onde a mão segura — e é por isso que a parte
    // branca é a que encosta na palma: plástico claro suja menos à vista.
    const corpoCima = new THREE.Mesh(
      guardar(new THREE.BoxGeometry(LARGURA, ALTURA * 0.74, ESPESSURA)),
      matVermelho,
    );
    corpoCima.position.y = ALTURA * 0.13;
    const corpoBaixo = new THREE.Mesh(
      guardar(new THREE.BoxGeometry(LARGURA, ALTURA * 0.26, ESPESSURA * 0.98)),
      matBranco,
    );
    corpoBaixo.position.y = -ALTURA * 0.37;
    corpoCima.castShadow = true;
    corpoBaixo.castShadow = true;
    this.grupo.add(corpoCima, corpoBaixo);

    // A tela afundada, para a moldura ter relevo de verdade.
    const vidro = new THREE.Mesh(
      guardar(new THREE.BoxGeometry(LARGURA - 0.03, ALTURA * 0.62, ESPESSURA * 0.3)),
      guardar(new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.3, metalness: 0.4 })),
    );
    vidro.position.set(0, 0.02, ESPESSURA * 0.42);
    this.grupo.add(vidro);

    // O símbolo da pokébola, na faixa de cima: uma bolacha branca com a faixa
    // preta no meio e o botão. É meia bola vista de frente, e é o que se
    // reconhece de relance mesmo de cabeça para baixo.
    const simbolo = new THREE.Group();
    simbolo.position.set(0, ALTURA * 0.5 - TOPO * 0.55, ESPESSURA * 0.52);

    const bolacha = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(TOPO * 0.34, TOPO * 0.34, 0.004, 24)),
      matBranco,
    );
    bolacha.rotation.x = Math.PI * 0.5;
    const meiaVermelha = new THREE.Mesh(
      guardar(
        new THREE.CylinderGeometry(TOPO * 0.345, TOPO * 0.345, 0.005, 24, 1, false, 0, Math.PI),
      ),
      matVermelho,
    );
    meiaVermelha.rotation.x = Math.PI * 0.5;
    meiaVermelha.position.z = 0.0008;
    const faixa = new THREE.Mesh(
      guardar(new THREE.BoxGeometry(TOPO * 0.7, TOPO * 0.075, 0.006)),
      matPreto,
    );
    const miolo = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(TOPO * 0.1, TOPO * 0.1, 0.007, 16)),
      matPreto,
    );
    miolo.rotation.x = Math.PI * 0.5;
    const luzinha = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(TOPO * 0.055, TOPO * 0.055, 0.009, 14)),
      guardar(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x9fd8ff,
          emissiveIntensity: 0.8,
          roughness: 0.2,
        }),
      ),
    );
    luzinha.rotation.x = Math.PI * 0.5;
    this.luzinha = luzinha;
    simbolo.add(bolacha, meiaVermelha, faixa, miolo, luzinha);
    this.grupo.add(simbolo);

    // As placas da Pokédex entram aqui, rentes ao vidro.
    this.tela.position.set(0, 0.02, ESPESSURA * 0.6);
    this.grupo.add(this.tela);

    this.grupo.visible = true;
  }

  /**
   * Segue a cabeça enquanto está guardada, e a mão enquanto está na mão.
   *
   * Guardada, ela acompanha só o GIRO HORIZONTAL da cabeça: se ela copiasse a
   * inclinação também, olhar para o chão faria a Pokédex subir pelas suas
   * costas. Costas não fazem isso.
   */
  /** Você abriu a mão: ela sai dali com a velocidade que o braço tinha. */
  largar(velocidade: THREE.Vector3) {
    this.naMaoDe = null;
    this.caida = true;
    this.tempoNoChao = 0;
    this.velocidade.copy(velocidade);
  }

  /** Catada do carpete. É o mesmo par `lancar`/`recolher` da pokébola. */
  recolher(maoIndice: number) {
    this.caida = false;
    this.tempoNoChao = 0;
    this.velocidade.set(0, 0, 0);
    this.naMaoDe = maoIndice;
  }

  /** Ela está caída no chão — e portanto não está nas suas costas. */
  get noChao(): boolean {
    return this.caida;
  }

  /**
   * De volta às costas, de onde quer que estivesse.
   *
   * Existe para a saída da sessão: a Pokédex pode ter ficado no carpete, e o
   * carpete é um ponto em coordenadas que morrem com a sessão. Ver
   * `Jogo.aoSairDaSessao`.
   */
  guardar() {
    this.caida = false;
    this.tempoNoChao = 0;
    this.velocidade.set(0, 0, 0);
    this.naMaoDe = null;
  }

  atualizar(
    dt: number,
    camera: THREE.Camera,
    punho: THREE.Object3D | null,
    apoio?: Apoio,
    /**
     * Onde ela fica guardada: nas costas (de pé) ou no quadril (sentado). Ver
     * `GUARDADA_SENTADO`, e o item 1.5 do roteiro.
     */
    sentado: { ligado: boolean; lado: 'left' | 'right' } | null = null,
  ) {
    // O ponto das costas é recalculado SEMPRE, inclusive com ela na mão.
    //
    // Este bloco ficava depois do `return` de quem está segurando, e isso
    // quebrava a promessa escrita em `pontoGuardado`: "o ponto nas costas onde
    // ela vai voltar, MESMO com ela na sua mão". Na prática, o alvo de guardar
    // congelava no ponto do quarto onde as suas costas estavam no instante em
    // que você a pegou — ande três passos ou gire meia volta e a Pokédex não
    // tinha mais como ser guardada. Era metade do "não consigo tirar da mão".
    camera.getWorldPosition(this.aux);
    this.auxGiro.setFromQuaternion(camera.quaternion, 'YXZ');
    this.giroGuardado.setFromEuler(new THREE.Euler(0, this.auxGiro.y, 0, 'YXZ'));
    if (sentado?.ligado) {
      this.ondeFica.copy(GUARDADA_SENTADO);
      this.ondeFica.x = Math.abs(this.ondeFica.x) * (sentado.lado === 'left' ? -1 : 1);
    } else {
      this.ondeFica.copy(GUARDADA);
    }
    this.posicaoGuardada.copy(this.ondeFica).applyQuaternion(this.giroGuardado).add(this.aux);

    if (this.naMaoDe !== null) {
      // Na mão quem manda é a mão: o grupo é filho do punho e não se move aqui.
      if (punho && this.grupo.parent !== punho) {
        punho.add(this.grupo);
        // Deitada na palma, tela para cima e topo para a frente — a pose de
        // quem está lendo o próprio celular.
        this.grupo.position.set(0, 0.03, -0.12);
        this.grupo.rotation.set(-1.15, 0, 0);
        this.grupo.scale.setScalar(ESCALA);
      }
      return;
    }

    // CAINDO, ou parada no carpete.
    //
    // Este ramo tem de vir antes do laço de volta às costas, e não é detalhe: o
    // `lerp` de baixo reescreve posição e rotação todo quadro, então sem um
    // terceiro estado a Pokédex "cairia" voando para as suas costas em três
    // décimos de segundo.
    if (this.caida) {
      this.velocidade.y += GRAVIDADE * dt;
      this.grupo.position.addScaledVector(this.velocidade, dt);
      // Tomba até ficar deitada, tela para cima: é como uma placa cai.
      this.grupo.quaternion.slerp(DEITADA, Math.min(1, dt * 5));
      // `attach` reprojeta a transformação de mundo para local, então a escala
      // local vira a de mundo — reescrever por quadro impede que ela derive.
      this.grupo.scale.setScalar(ESCALA);

      // O apoio sob ela, e não um piso fixo: ela pousa EM CIMA da mesa e do
      // sofá. Uma Pokédex que afunda dentro do sofá é uma Pokédex perdida.
      const piso = apoio ? apoio.alturaEm(this.grupo.position) : 0;
      if (this.grupo.position.y - MEIA_ESPESSURA <= piso) {
        this.grupo.position.y = piso + MEIA_ESPESSURA;
        if (Math.abs(this.velocidade.y) > PARADA) {
          this.velocidade.y *= -RESTITUICAO;
          this.velocidade.x *= ATRITO;
          this.velocidade.z *= ATRITO;
          audio.quique();
        } else {
          this.velocidade.set(0, 0, 0);
        }
      }

      if (this.velocidade.lengthSq() === 0) {
        this.tempoNoChao += dt;
        const faltam = SEGUNDOS_CAIDA - this.tempoNoChao;
        if (this.luzinha) {
          const mat = this.luzinha.material as THREE.MeshStandardMaterial;
          // Nos últimos cinco segundos a luzinha do símbolo pisca: é o aviso de
          // que ela está voltando sozinha para as suas costas.
          mat.emissiveIntensity =
            faltam < AVISO_DE_VOLTA ? 0.8 + Math.abs(Math.sin(this.tempoNoChao * 7)) * 1.6 : 0.8;
        }
        if (faltam <= 0) {
          this.caida = false;
          if (this.luzinha) {
            (this.luzinha.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
          }
        }
      }
      return;
    }

    const k = Math.min(1, dt * 9);
    this.grupo.position.lerp(this.posicaoGuardada, k);
    this.grupo.quaternion.slerp(this.giroGuardado, k);
    this.grupo.scale.setScalar(ESCALA);
  }

  /** Onde ela está agora, para medir a mão contra isso. */
  posicao(destino: THREE.Vector3) {
    return this.grupo.getWorldPosition(destino);
  }

  /** O ponto nas costas onde ela vai voltar, mesmo com ela na sua mão. */
  pontoGuardado(destino: THREE.Vector3) {
    return destino.copy(this.posicaoGuardada);
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
    this.descartaveis = [];
  }
}
