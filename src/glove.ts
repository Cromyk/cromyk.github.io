import * as THREE from 'three';

/**
 * A sua mão dentro do jogo: uma luva branca de treinador.
 *
 * O que havia antes era uma cápsula com um aro — um cilindro flutuando no lugar
 * do controle. Funcionava como marcador de posição e não como mão, e é uma
 * diferença que importa num jogo cuja interação principal é encostar a mão num
 * bicho.
 *
 * Há duas maneiras de a mão existir, e as duas moram aqui:
 *
 * - **com controle** — a luva é montada aqui, articulada, e os dedos fecham
 *   conforme o gatilho e o grip. Quem está com o Touch na mão vê a luva fechar
 *   quando fecha a mão de verdade.
 * - **com hand tracking** — o Quest devolve 25 juntas por mão, e aí a luva é
 *   uma esfera branca por junta, desenhada numa `InstancedMesh` só. Uma chamada
 *   de desenho por mão: em passthrough o headset já renderiza tudo duas vezes,
 *   e 25 malhas soltas por mão custariam mais do que a mão inteira vale.
 *
 * ## Os eixos do grip space
 *
 * Pela convenção do WebXR, com a mão fechada em volta de um cano: +Y sobe ao
 * longo do cano, −Z sai pela frente do punho (para onde os dedos apontam) e X é
 * perpendicular à palma — saindo pelo DORSO, que é +X na direita e −X na
 * esquerda. Os quatro dedos ficam empilhados ao longo de Y, o indicador em cima.
 *
 * Toda a geometria abaixo está escrita nesse referencial, e `espelho` (+1 na
 * direita, −1 na esquerda) é o que constrói a mão esquerda sem uma segunda
 * função.
 */

const BRANCO = 0xf5f6fa;
const SOMBRA_LUVA = 0xc9cfdd;

/** Comprimento de cada falange, da base para a ponta. */
const FALANGES = [0.022, 0.017, 0.013];

interface Dedo {
  /** A primeira falange: girar ela dobra o dedo inteiro. */
  base: THREE.Object3D;
  juntas: THREE.Object3D[];
  /** Quanto este dedo está fechado agora, 0..1. */
  fechado: number;
}

export class Luva {
  /** A luva montada. Vai pendurada no grip space do controle. */
  readonly grupo = new THREE.Group();
  /**
   * As juntas rastreadas. Vai pendurada no `XRHandSpace`, e não no grip: as
   * juntas chegam já em coordenadas do espaço de referência, então pendurá-las
   * no punho aplicaria a transformação da mão duas vezes.
   */
  readonly grupoRastreado = new THREE.Group();
  /** Onde a ponta do indicador está — é ela que faz carinho e aperta botão. */
  readonly pontaDoIndicador = new THREE.Object3D();

  private dedos: Dedo[] = [];
  private polegar: Dedo | null = null;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private juntasRastreadas: THREE.InstancedMesh | null = null;
  private matriz = new THREE.Matrix4();
  private escala = new THREE.Vector3();

  constructor(
    readonly lado: 'left' | 'right',
    /** Faixa colorida no punho: é o que distingue a mão esquerda da direita. */
    corDaFaixa: number,
  ) {
    const espelho = lado === 'left' ? -1 : 1;

    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    const luva = guardar(
      new THREE.MeshStandardMaterial({
        color: BRANCO,
        roughness: 0.62,
        metalness: 0.04,
        // Um pouco de emissivo porque em passthrough a luz da cena é inventada e
        // a do seu quarto não chega: sem isto a luva fica cinza no escuro.
        emissive: new THREE.Color(SOMBRA_LUVA).multiplyScalar(0.12),
      }),
    );
    const faixa = guardar(
      new THREE.MeshStandardMaterial({
        color: corDaFaixa,
        roughness: 0.4,
        metalness: 0.15,
        emissive: new THREE.Color(corDaFaixa).multiplyScalar(0.25),
      }),
    );

    // --- punho e palma ---
    const punho = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(0.031, 0.034, 0.03, 16)),
      luva,
    );
    punho.rotation.x = Math.PI * 0.5;
    punho.position.z = 0.035;
    this.grupo.add(punho);

    const anel = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(0.0345, 0.0345, 0.008, 16)),
      faixa,
    );
    anel.rotation.x = Math.PI * 0.5;
    anel.position.z = 0.048;
    this.grupo.add(anel);

    const palma = new THREE.Mesh(guardar(new THREE.BoxGeometry(0.026, 0.072, 0.062, 1, 1, 1)), luva);
    palma.position.set(0, 0.002, -0.004);
    this.grupo.add(palma);

    // Nós dos dedos: a saliência que faz a mão fechada parecer um punho e não
    // um bloco.
    const nos = new THREE.Mesh(guardar(new THREE.CylinderGeometry(0.013, 0.013, 0.07, 12)), luva);
    nos.rotation.z = Math.PI * 0.5;
    nos.position.set(0, 0, -0.034);
    this.grupo.add(nos);

    // --- quatro dedos, empilhados ao longo de Y ---
    const geoFalange = FALANGES.map((c) =>
      guardar(new THREE.CapsuleGeometry(0.0085, Math.max(0.001, c - 0.017), 3, 8)),
    );
    const alturas = [0.029, 0.0098, -0.0104, -0.0292];
    const comprimentos = [0.98, 1.06, 1.0, 0.85]; // indicador, médio, anelar, mínimo

    for (let d = 0; d < 4; d++) {
      const dedo = this.montarDedo(geoFalange, luva, comprimentos[d]);
      dedo.base.position.set(0, alturas[d], -0.034);
      // Leque de leve: dedos rigorosamente paralelos denunciam a mão de polígono.
      dedo.base.rotation.x = (alturas[d] / 0.03) * 0.06;
      this.grupo.add(dedo.base);
      this.dedos.push(dedo);
    }

    // Ponta do indicador, para o jogo perguntar onde ela está.
    this.dedos[0].juntas[2].add(this.pontaDoIndicador);
    this.pontaDoIndicador.position.z = -FALANGES[2] * comprimentos[0];

    // --- polegar, do lado da palma ---
    const polegar = this.montarDedo(geoFalange, luva, 0.9);
    polegar.base.position.set(-0.014 * espelho, 0.026, -0.006);
    polegar.base.rotation.set(0, espelho * 0.85, espelho * 0.5);
    this.grupo.add(polegar.base);
    this.polegar = polegar;
  }

  private montarDedo(
    geos: THREE.CapsuleGeometry[],
    material: THREE.Material,
    escala: number,
  ): Dedo {
    const juntas: THREE.Object3D[] = [];
    let pai: THREE.Object3D | null = null;

    for (let i = 0; i < FALANGES.length; i++) {
      const junta = new THREE.Object3D();
      const malha = new THREE.Mesh(geos[i], material);
      // A cápsula nasce em pé no eixo Y; deitá-la em −Z é o que faz o dedo
      // apontar para a frente do punho.
      malha.rotation.x = -Math.PI * 0.5;
      malha.position.z = (-FALANGES[i] * escala) / 2;
      malha.scale.setScalar(i === 0 ? 1 : 1 - i * 0.12);
      junta.add(malha);

      if (pai) junta.position.z = -FALANGES[i - 1] * escala;
      else junta.position.z = 0;

      pai?.add(junta);
      juntas.push(junta);
      pai = junta;
    }

    return { base: juntas[0], juntas, fechado: 0 };
  }

  /**
   * Fecha a mão.
   *
   * `gatilho` fecha só o indicador e `grip` fecha os outros três mais o polegar
   * — que é exatamente como os dois botões do Touch caem sob os dedos de quem
   * está segurando o controle. Apertar o gatilho sozinho, portanto, aponta.
   */
  definirDedos(gatilho: number, grip: number, dt: number) {
    const k = Math.min(1, dt * 16);
    const alvos = [gatilho, grip, grip, grip];
    for (let d = 0; d < this.dedos.length; d++) {
      const dedo = this.dedos[d];
      dedo.fechado += (alvos[d] - dedo.fechado) * k;
      this.curvar(dedo, dedo.fechado);
    }
    if (this.polegar) {
      this.polegar.fechado += (grip - this.polegar.fechado) * k;
      this.curvarPolegar(this.polegar, this.polegar.fechado);
    }
  }

  /**
   * O dedo dobra no plano XZ, em torno de Y — que é a direção do "cano" que a
   * mão está segurando. As falanges de cima dobram mais do que a de baixo, que
   * é o que separa um dedo de uma vareta articulada.
   */
  private curvar(dedo: Dedo, quanto: number) {
    const sentido = this.lado === 'right' ? 1 : -1;
    const q = THREE.MathUtils.clamp(quanto, 0, 1);
    dedo.juntas[0].rotation.y = sentido * q * 1.45;
    dedo.juntas[1].rotation.y = sentido * q * 1.7;
    dedo.juntas[2].rotation.y = sentido * q * 1.25;
  }

  private curvarPolegar(dedo: Dedo, quanto: number) {
    const sentido = this.lado === 'right' ? 1 : -1;
    const q = THREE.MathUtils.clamp(quanto, 0, 1);
    dedo.juntas[0].rotation.y = sentido * q * 0.75;
    dedo.juntas[1].rotation.y = sentido * q * 0.95;
    dedo.juntas[2].rotation.y = sentido * q * 0.7;
  }

  // ------------------------------------------------------- hand tracking

  /**
   * Passa a desenhar a luva sobre as juntas rastreadas em vez da luva montada.
   *
   * São 25 juntas numa `InstancedMesh`: uma chamada de desenho. As esferas saem
   * um pouco maiores do que o raio informado porque aí elas se tocam e a mão lê
   * como uma luva contínua, e não como um colar de contas.
   */
  private prepararRastreio() {
    if (this.juntasRastreadas) return;
    const geo = new THREE.SphereGeometry(1, 10, 7);
    const mat = new THREE.MeshStandardMaterial({
      color: BRANCO,
      roughness: 0.62,
      metalness: 0.04,
      emissive: new THREE.Color(SOMBRA_LUVA).multiplyScalar(0.12),
    });
    this.descartaveis.push(geo, mat);
    const malha = new THREE.InstancedMesh(geo, mat, 25);
    malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    malha.frustumCulled = false;
    malha.count = 0;
    this.juntasRastreadas = malha;
    this.grupoRastreado.add(malha);
  }

  /**
   * Desenha a mão de verdade. `juntas` é o que `renderer.xr.getHand()` entrega.
   * Devolve false quando o runtime ainda não preencheu as juntas — aí a luva
   * de controle continua valendo.
   */
  usarJuntas(mao: THREE.Object3D & { joints?: Record<string, THREE.Object3D> }): boolean {
    const juntas = mao.joints;
    if (!juntas) return false;

    this.prepararRastreio();
    const malha = this.juntasRastreadas!;

    let n = 0;
    for (const nome of Object.keys(juntas)) {
      if (n >= 25) break;
      const junta = juntas[nome] as THREE.Object3D & { jointRadius?: number };
      const raio = junta.jointRadius;
      // Junta sem raio é junta que o runtime ainda não rastreou neste quadro.
      if (raio === undefined || raio === null || !Number.isFinite(raio)) continue;
      this.escala.setScalar(raio * 1.45);
      this.matriz.compose(junta.position, junta.quaternion, this.escala);
      malha.setMatrixAt(n++, this.matriz);
    }

    malha.count = n;
    if (n === 0) return false;
    malha.instanceMatrix.needsUpdate = true;
    return true;
  }

  /** Alterna entre a luva montada e a mão rastreada. */
  definirModo(rastreada: boolean) {
    this.grupo.visible = !rastreada;
    this.grupoRastreado.visible = rastreada;
  }

  descartar() {
    this.grupo.removeFromParent();
    this.grupoRastreado.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
  }
}
