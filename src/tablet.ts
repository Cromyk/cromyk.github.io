import * as THREE from 'three';

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

/** Quão perto a mão precisa chegar das costas para agarrar. */
export const ALCANCE_TABLET = 0.22;

export class Tablet {
  readonly grupo = new THREE.Group();
  /** Onde as placas da Pokédex entram: o grupo da tela. */
  readonly tela = new THREE.Group();

  /** Quem está segurando, pelo índice da mão. null = está nas costas. */
  naMaoDe: number | null = null;

  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private posicaoGuardada = new THREE.Vector3();
  private giroGuardado = new THREE.Quaternion();
  private aux = new THREE.Vector3();
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
  atualizar(dt: number, camera: THREE.Camera, punho: THREE.Object3D | null) {
    if (this.naMaoDe !== null) {
      // Na mão quem manda é a mão: o grupo é filho do punho e não se move aqui.
      if (punho && this.grupo.parent !== punho) {
        punho.add(this.grupo);
        // Deitada na palma, tela para cima e topo para a frente — a pose de
        // quem está lendo o próprio celular.
        this.grupo.position.set(0, 0.03, -0.12);
        this.grupo.rotation.set(-1.15, 0, 0);
        this.grupo.scale.setScalar(0.62);
      }
      return;
    }

    camera.getWorldPosition(this.aux);
    this.auxGiro.setFromQuaternion(camera.quaternion, 'YXZ');
    this.giroGuardado.setFromEuler(new THREE.Euler(0, this.auxGiro.y, 0, 'YXZ'));

    this.posicaoGuardada.copy(GUARDADA).applyQuaternion(this.giroGuardado).add(this.aux);

    const k = Math.min(1, dt * 9);
    this.grupo.position.lerp(this.posicaoGuardada, k);
    this.grupo.quaternion.slerp(this.giroGuardado, k);
    this.grupo.scale.setScalar(0.62);
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
