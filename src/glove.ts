import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * A sua mão dentro do jogo.
 *
 * Durante um bom tempo ela foi montada aqui em código: cápsulas de dedo, uma
 * caixa de palma e um cilindro de punho, tudo branco. Era uma luva de papelão,
 * e é o objeto que mais aparece em campo de visão o jogo inteiro — está sempre
 * lá, a trinta centímetros dos olhos, entre você e o Pokémon.
 *
 * Agora ela é um MODELO PRONTO: o `generic-hand` do webxr-input-profiles, que é
 * a mão de referência do próprio WebXR e o mesmo arquivo que o
 * `XRHandModelFactory` do three.js carrega. Vem com as vinte e cinco juntas
 * nomeadas como a especificação manda, uma malha só e nenhuma textura — noventa
 * e quatro quilobytes por lado. Ver tools/maos.mjs.
 *
 * Há duas maneiras de a mão existir, e as duas moram aqui:
 *
 * - **com hand tracking** — o Quest devolve as 25 juntas por mão e o modelo é
 *   posado junta por junta, pelo nome. É o caminho para o qual o arquivo foi
 *   feito, e o encaixe é uma cópia direta.
 * - **com controle** — não há junta nenhuma para copiar, então a mesma malha
 *   ganha uma HIERARQUIA (metacarpo → proximal → média → distal) montada a
 *   partir da pose de repouso, e os dedos fecham conforme o gatilho e o grip.
 *
 * As duas são cópias separadas do mesmo molde — `SkeletonUtils.clone` divide
 * geometria e material entre elas, então a segunda custa alguns ossos e nada
 * mais. Uma hierarquia só não serviria para as duas: o rastreamento entrega as
 * juntas já em coordenadas do mundo, e reparenteá-las aplicaria a
 * transformação do punho duas vezes.
 *
 * Se o arquivo não estiver lá (sem rede no build, por exemplo), nada quebra: a
 * luva montada em código continua neste arquivo e assume o lugar.
 *
 * ## Os eixos do grip space
 *
 * Pela convenção do WebXR, com a mão fechada em volta de um cano: +Y sobe ao
 * longo do cano, −Z sai pela frente do punho (para onde os dedos apontam) e X é
 * perpendicular à palma — saindo pelo DORSO, que é +X na direita e −X na
 * esquerda. É para esse referencial que a mão de malha é girada ao nascer, e é
 * nele que a luva de código está escrita.
 */

const BRANCO = 0xf5f6fa;
const SOMBRA_LUVA = 0xc9cfdd;

/** Os dedos, da base para a ponta, com os nomes exatos da especificação. */
const DEDOS: readonly (readonly string[])[] = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  [
    'index-finger-metacarpal',
    'index-finger-phalanx-proximal',
    'index-finger-phalanx-intermediate',
    'index-finger-phalanx-distal',
    'index-finger-tip',
  ],
  [
    'middle-finger-metacarpal',
    'middle-finger-phalanx-proximal',
    'middle-finger-phalanx-intermediate',
    'middle-finger-phalanx-distal',
    'middle-finger-tip',
  ],
  [
    'ring-finger-metacarpal',
    'ring-finger-phalanx-proximal',
    'ring-finger-phalanx-intermediate',
    'ring-finger-phalanx-distal',
    'ring-finger-tip',
  ],
  [
    'pinky-finger-metacarpal',
    'pinky-finger-phalanx-proximal',
    'pinky-finger-phalanx-intermediate',
    'pinky-finger-phalanx-distal',
    'pinky-finger-tip',
  ],
];

/**
 * Quanto cada osso dobra com a mão inteiramente fechada, em radianos.
 *
 * O metacarpo quase não se mexe (é o osso de dentro da palma), a falange do
 * meio é a que mais dobra, e a ponta acompanha de leve. O polegar é o único que
 * dobra a partir do metacarpo, porque é assim que ele se opõe aos outros.
 */
const DOBRA: Record<string, number> = {
  metacarpal: 0,
  'thumb-metacarpal': 0.42,
  proximal: 1.02,
  'thumb-phalanx-proximal': 0.62,
  intermediate: 1.24,
  distal: 0.72,
  'thumb-phalanx-distal': 0.66,
};

function dobraDe(nome: string): number {
  if (nome in DOBRA) return DOBRA[nome];
  if (nome.endsWith('-tip')) return 0;
  if (nome.endsWith('metacarpal')) return DOBRA.metacarpal;
  if (nome.endsWith('proximal')) return DOBRA.proximal;
  if (nome.endsWith('intermediate')) return DOBRA.intermediate;
  if (nome.endsWith('distal')) return DOBRA.distal;
  return 0;
}

// ------------------------------------------------------------------ molde

const carregador = new GLTFLoader();
const moldes = new Map<string, Promise<THREE.Object3D | null>>();

/**
 * O arquivo da mão, baixado uma vez por lado e reaproveitado.
 *
 * Falhar aqui é um caminho previsto, não um acidente: quem não tiver o arquivo
 * joga com a luva de código. Por isso o erro vira `null` e não exceção.
 */
export function moldeDaMao(lado: 'left' | 'right'): Promise<THREE.Object3D | null> {
  const pronto = moldes.get(lado);
  if (pronto) return pronto;

  const promessa = carregador
    .loadAsync(`./maos/${lado}.glb`)
    .then((gltf) => gltf.scene as THREE.Object3D)
    .catch((erro) => {
      console.warn(`mão ${lado} não carregou; usando a luva de código`, erro);
      return null;
    });

  moldes.set(lado, promessa);
  return promessa;
}

/** Deixa as duas mãos prontas antes de a sessão começar. */
export function prepararMaos() {
  void moldeDaMao('left');
  void moldeDaMao('right');
}

/** Pinta a malha da mão com o material do jogo, no lugar do cinza do arquivo. */
function vestir(raiz: THREE.Object3D, descartaveis: THREE.Material[]) {
  const material = new THREE.MeshStandardMaterial({
    color: BRANCO,
    roughness: 0.58,
    metalness: 0.04,
    // Em passthrough a luz da cena é inventada e a do seu quarto não chega:
    // sem um pouco de emissivo a mão fica cinza no escuro.
    emissive: new THREE.Color(SOMBRA_LUVA).multiplyScalar(0.14),
  });
  descartaveis.push(material);

  raiz.traverse((obj) => {
    const malha = obj as THREE.SkinnedMesh;
    if (!(malha as THREE.Mesh).isMesh) return;
    malha.material = material;
    malha.castShadow = false;
    // Malha com pele tem a caixa calculada na pose de bind; sem isto ela some
    // do quadro quando os dedos saem da caixa original.
    malha.frustumCulled = false;
  });
}

// ------------------------------------------------------------- mão posada

/**
 * A mão de malha com os ossos em cadeia, para o modo de CONTROLE.
 *
 * O arquivo traz as juntas soltas, todas filhas do mesmo nó — que é o formato
 * de que o rastreamento precisa, porque ele posiciona cada uma por conta
 * própria. Sem juntas para copiar não há o que posar: dobrar um dedo exige que
 * a falange seguinte ande junto, e isso é hierarquia.
 *
 * Então a cadeia é montada aqui, a partir da pose de repouso e preservando a
 * posição de mundo de cada osso (`attach`). O eixo em que cada junta dobra
 * também sai da pose: é o perpendicular comum entre a direção do osso e a
 * direção da palma, medido no arquivo em vez de adivinhado — o que faz esta
 * classe continuar valendo se o modelo for trocado por outro.
 *
 * Ela é exportada por causa de tools/mao.ts: a folha de conferência das poses
 * da mão desenha o resultado DESTA classe, e não uma reimplementação dela.
 */
export class MaoArticulada {
  readonly raiz = new THREE.Group();
  readonly pontaDoIndicador = new THREE.Object3D();

  private juntas = new Map<string, THREE.Object3D>();
  private repouso = new Map<string, THREE.Quaternion>();
  private eixos = new Map<string, THREE.Vector3>();
  private fechado = new Map<string, number>();
  private descartaveis: THREE.Material[] = [];
  private giro = new THREE.Quaternion();

  constructor(molde: THREE.Object3D, lado: 'left' | 'right', corDaFaixa: number) {
    const cena = clonarComEsqueleto(molde) as THREE.Object3D;
    vestir(cena, this.descartaveis);

    cena.updateMatrixWorld(true);
    cena.traverse((obj) => {
      if (obj.name) this.juntas.set(obj.name, obj);
    });

    // --- os três eixos da mão, medidos na pose de repouso ---
    const onde = (nome: string) =>
      this.juntas.get(nome)?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();

    const punho = onde('wrist');
    const meioBase = onde('middle-finger-metacarpal');
    const meioPonta = onde('middle-finger-tip');
    const indicadorBase = onde('index-finger-metacarpal');
    const minimoBase = onde('pinky-finger-metacarpal');
    const polegarPonta = onde('thumb-tip');

    const dedos = meioPonta.clone().sub(meioBase).normalize();
    const largura = minimoBase.clone().sub(indicadorBase);
    largura.addScaledVector(dedos, -largura.dot(dedos));
    const palma = new THREE.Vector3().crossVectors(dedos, largura.normalize()).normalize();
    // De que lado fica a palma: do lado em que o polegar repousa. Medir isso
    // evita depender de o exportador ter usado esta ou aquela convenção.
    const centro = indicadorBase.clone().add(minimoBase).multiplyScalar(0.5);
    if (polegarPonta.clone().sub(centro).dot(palma) < 0) palma.negate();

    // --- girar a mão para o grip space ---
    // Só dois eixos precisam ser ditos; o terceiro é consequência da mão ser
    // uma mão (o indicador não tem para onde ir depois que a frente e a palma
    // estão definidas).
    const frenteAlvo = new THREE.Vector3(0, 0, -1);
    const palmaAlvo = new THREE.Vector3(lado === 'right' ? -1 : 1, 0, 0);
    const terceiroAlvo = new THREE.Vector3().crossVectors(frenteAlvo, palmaAlvo);
    const terceiro = new THREE.Vector3().crossVectors(dedos, palma);

    const doModelo = new THREE.Matrix4().makeBasis(dedos, terceiro, palma);
    const doGrip = new THREE.Matrix4().makeBasis(frenteAlvo, terceiroAlvo, palmaAlvo);
    const rotacao = doGrip.multiply(doModelo.transpose());
    this.giro.setFromRotationMatrix(rotacao);

    // O punho do jogador não fica no punho do modelo: o grip space nasce dentro
    // da mão fechada, onde estaria o cabo do controle.
    //
    // Este ponto já esteve errado, e errado por uma mão inteira. A conta era
    // `punho.lerp(meioBase, 0.62)`, e o problema estava no `meioBase`: pela
    // especificação do WebXR, `middle-finger-metacarpal` NÃO fica no meio da
    // palma — fica na base do metacarpo, colada no pulso. Medido no arquivo:
    //
    //   middle-finger-metacarpal          2,99 cm do pulso
    //   middle-finger-phalanx-proximal    9,17 cm  (os nós dos dedos)
    //   middle-finger-tip                17,78 cm
    //
    // Então aquele lerp andava 1,86 cm e punha a origem do grip em cima do
    // PULSO do modelo, com os outros dezesseis centímetros de mão pendurados à
    // frente da mão de verdade. Em campo isso se sente como segurar a mão do
    // jogo pelo pulso, que foi o relato que trouxe esta correção.
    //
    // O ponto certo é o centro do punho fechado, e ele fica entre o metacarpo e
    // os nós dos dedos — não entre o pulso e o metacarpo. A fração é medida na
    // mão que estiver carregada, e não em centímetros fixos: proporção
    // atravessa tamanhos de mão, centímetro não.
    const nosDosDedos = onde('middle-finger-phalanx-proximal');
    // 0,55 do metacarpo para os nós: onde o cabo de um Touch cruza a palma.
    const eixoDoCabo = meioBase.clone().lerp(nosDosDedos, 0.55);
    // E meio cabo para o lado da palma: o eixo do controle não encosta na pele,
    // passa a um raio de distância dela.
    const encaixe = eixoDoCabo.addScaledVector(palma, 0.018);

    const alinhado = new THREE.Group();
    alinhado.quaternion.copy(this.giro);
    const deslocado = new THREE.Group();
    deslocado.position.copy(encaixe).negate();
    deslocado.add(cena);
    alinhado.add(deslocado);
    this.raiz.add(alinhado);

    // --- a cadeia de ossos, e em que eixo cada um dobra ---
    for (const dedo of DEDOS) {
      for (let i = 0; i < dedo.length; i++) {
        const osso = this.juntas.get(dedo[i]);
        if (!osso) continue;

        const proximo = i + 1 < dedo.length ? this.juntas.get(dedo[i + 1]) : null;
        if (proximo) {
          const aqui = osso.getWorldPosition(new THREE.Vector3());
          const adiante = proximo.getWorldPosition(new THREE.Vector3()).sub(aqui);
          if (adiante.lengthSq() > 1e-9) {
            // Girar em torno disto leva a ponta do osso na direção da palma, que
            // é o que fechar a mão quer dizer.
            const eixo = new THREE.Vector3().crossVectors(adiante.normalize(), palma);
            if (eixo.lengthSq() > 1e-9) {
              const noOsso = osso.getWorldQuaternion(new THREE.Quaternion()).invert();
              this.eixos.set(dedo[i], eixo.normalize().applyQuaternion(noOsso));
            }
          }
        }

        // `attach` reparenta preservando a posição de mundo: a mão continua
        // exatamente na pose em que o arquivo veio, agora em cadeia.
        const pai = i === 0 ? this.juntas.get('wrist') : this.juntas.get(dedo[i - 1]);
        if (pai) pai.attach(osso);
        this.repouso.set(dedo[i], osso.quaternion.clone());
        this.fechado.set(dedo[i], 0);
      }
    }

    // O aro colorido do punho: é o que distingue a mão esquerda da direita de
    // relance, sem precisar olhar para os dedos.
    const geoAro = new THREE.TorusGeometry(0.034, 0.006, 8, 20);
    const matAro = new THREE.MeshStandardMaterial({
      color: corDaFaixa,
      roughness: 0.4,
      metalness: 0.15,
      emissive: new THREE.Color(corDaFaixa).multiplyScalar(0.3),
    });
    this.descartaveis.push(matAro);
    const aro = new THREE.Mesh(geoAro, matAro);
    aro.frustumCulled = false;
    this.raiz.add(aro);
    // Na altura do pulso do modelo. Isto já foi o número fixo 0,024 — medido, na
    // época, contra um encaixe que ficava quase em cima do pulso. Corrigido o
    // encaixe, o pulso passou a cair bem mais atrás, e um número fixo viraria
    // um aro flutuando no meio do antebraço. Então em vez de remedir à mão,
    // pergunta-se ao modelo onde o pulso foi parar depois do alinhamento —
    // assim ele continua certo se a mão for trocada por outra (a luva, por
    // exemplo).
    const pulsoNoGrip = punho.clone().sub(encaixe).applyQuaternion(this.giro);
    aro.position.copy(pulsoNoGrip);

    const ponta = this.juntas.get('index-finger-tip');
    if (ponta) ponta.add(this.pontaDoIndicador);
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
    const eixo = new THREE.Vector3();
    const extra = new THREE.Quaternion();

    for (let d = 0; d < DEDOS.length; d++) {
      const alvo = THREE.MathUtils.clamp(d === 1 ? gatilho : grip, 0, 1);
      for (const nome of DEDOS[d]) {
        const osso = this.juntas.get(nome);
        const base = this.repouso.get(nome);
        const local = this.eixos.get(nome);
        if (!osso || !base || !local) continue;

        const atual = (this.fechado.get(nome) ?? 0) + (alvo - (this.fechado.get(nome) ?? 0)) * k;
        this.fechado.set(nome, atual);

        const angulo = dobraDe(nome) * atual;
        if (angulo === 0) {
          osso.quaternion.copy(base);
          continue;
        }
        eixo.copy(local);
        extra.setFromAxisAngle(eixo, angulo);
        osso.quaternion.copy(base).multiply(extra);
      }
    }
  }

  descartar() {
    this.raiz.removeFromParent();
    for (const m of this.descartaveis) m.dispose();
  }
}

/**
 * A mesma mão, com as juntas soltas, para o modo de RASTREAMENTO.
 *
 * Aqui não há pose a calcular: o runtime entrega as vinte e cinco juntas já
 * posicionadas, e o trabalho é copiar nome por nome — que é possível porque o
 * arquivo usa exatamente os nomes da especificação.
 */
class MaoRastreada {
  readonly raiz = new THREE.Group();
  readonly pontaDoIndicador = new THREE.Object3D();

  private juntas = new Map<string, THREE.Object3D>();
  private descartaveis: THREE.Material[] = [];

  constructor(molde: THREE.Object3D) {
    const cena = clonarComEsqueleto(molde) as THREE.Object3D;
    vestir(cena, this.descartaveis);
    cena.traverse((obj) => {
      if (obj.name) this.juntas.set(obj.name, obj);
    });
    this.raiz.add(cena);

    const ponta = this.juntas.get('index-finger-tip');
    if (ponta) ponta.add(this.pontaDoIndicador);
  }

  /** Devolve false quando o runtime ainda não preencheu as juntas. */
  usarJuntas(juntas: Record<string, THREE.Object3D>): boolean {
    let posadas = 0;
    for (const nome of Object.keys(juntas)) {
      const osso = this.juntas.get(nome);
      const junta = juntas[nome] as THREE.Object3D & { jointRadius?: number };
      if (!osso) continue;
      const raio = junta.jointRadius;
      // Junta sem raio é junta que o runtime ainda não rastreou neste quadro.
      if (raio === undefined || raio === null || !Number.isFinite(raio)) continue;
      osso.position.copy(junta.position);
      osso.quaternion.copy(junta.quaternion);
      posadas++;
    }
    return posadas > 8;
  }

  descartar() {
    this.raiz.removeFromParent();
    for (const m of this.descartaveis) m.dispose();
  }
}

// ------------------------------------------------------------ luva de código

/**
 * A luva montada em código: cápsulas de dedo e uma palma de caixa.
 *
 * Era a mão do jogo inteiro até o modelo chegar, e continua aqui como reserva.
 * O jogo depende da mão para tudo — pegar a bola, fazer carinho, apontar — e
 * ficar sem nenhuma porque um arquivo de noventa quilobytes não baixou seria
 * uma troca ruim.
 */
const FALANGES = [0.022, 0.017, 0.013];

interface Dedo {
  base: THREE.Object3D;
  juntas: THREE.Object3D[];
  fechado: number;
}

class LuvaDeCodigo {
  readonly grupo = new THREE.Group();
  readonly pontaDoIndicador = new THREE.Object3D();

  private dedos: Dedo[] = [];
  private polegar: Dedo | null = null;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(
    readonly lado: 'left' | 'right',
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
      dedo.base.rotation.x = (alturas[d] / 0.03) * 0.06;
      this.grupo.add(dedo.base);
      this.dedos.push(dedo);
    }

    this.dedos[0].juntas[2].add(this.pontaDoIndicador);
    this.pontaDoIndicador.position.z = -FALANGES[2] * comprimentos[0];

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

  descartar() {
    this.grupo.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
  }
}

// -------------------------------------------------------------------- luva

/**
 * A mão, do jeito que o resto do jogo a enxerga.
 *
 * Quem usa não sabe — e não precisa saber — se o que está desenhado é o modelo
 * ou a luva de reserva: pergunta-se onde está a ponta do indicador e manda-se
 * fechar a mão, e é isso.
 */
export class Luva {
  /** A mão com controle. Vai pendurada no grip space. */
  readonly grupo = new THREE.Group();
  /**
   * A mão rastreada. Vai pendurada no `XRHandSpace`, e não no grip: as juntas
   * chegam já em coordenadas do espaço de referência, então pendurá-las no
   * punho aplicaria a transformação da mão duas vezes.
   */
  readonly grupoRastreado = new THREE.Group();
  /** Onde a ponta do indicador está — é ela que faz carinho e aperta botão. */
  readonly pontaDoIndicador = new THREE.Object3D();

  private reserva: LuvaDeCodigo;
  private articulada: MaoArticulada | null = null;
  private rastreada: MaoRastreada | null = null;
  private descartada = false;
  private ultimoGatilho = 0;
  private ultimoGrip = 0;

  constructor(
    readonly lado: 'left' | 'right',
    /** Faixa colorida no punho: é o que distingue a mão esquerda da direita. */
    corDaFaixa: number,
  ) {
    this.reserva = new LuvaDeCodigo(lado, corDaFaixa);
    this.grupo.add(this.reserva.grupo);
    this.reserva.pontaDoIndicador.add(this.pontaDoIndicador);

    void moldeDaMao(lado).then((molde) => {
      if (!molde || this.descartada) return;
      this.adotar(molde, corDaFaixa);
    });
  }

  /** Troca a luva de reserva pelo modelo, assim que ele chega. */
  private adotar(molde: THREE.Object3D, corDaFaixa: number) {
    this.articulada = new MaoArticulada(molde, this.lado, corDaFaixa);
    this.rastreada = new MaoRastreada(molde);
    this.grupo.add(this.articulada.raiz);
    this.grupoRastreado.add(this.rastreada.raiz);

    this.reserva.grupo.visible = false;
    // A ponta do indicador muda de dono: o jogo guarda a referência a este
    // Object3D e pergunta a posição dele todo quadro.
    this.pontaDoIndicador.removeFromParent();
    this.articulada.pontaDoIndicador.add(this.pontaDoIndicador);
    this.articulada.definirDedos(this.ultimoGatilho, this.ultimoGrip, 1);
  }

  definirDedos(gatilho: number, grip: number, dt: number) {
    this.ultimoGatilho = gatilho;
    this.ultimoGrip = grip;
    if (this.articulada) this.articulada.definirDedos(gatilho, grip, dt);
    else this.reserva.definirDedos(gatilho, grip, dt);
  }

  /**
   * Desenha a mão de verdade. `mao` é o que `renderer.xr.getHand()` entrega.
   * Devolve false quando não há juntas — aí a mão de controle continua valendo.
   */
  usarJuntas(mao: THREE.Object3D & { joints?: Record<string, THREE.Object3D> }): boolean {
    const juntas = mao.joints;
    if (!juntas || !this.rastreada) return false;
    return this.rastreada.usarJuntas(juntas);
  }

  /** Alterna entre a mão de controle e a mão rastreada. */
  definirModo(rastreada: boolean) {
    this.grupo.visible = !rastreada;
    this.grupoRastreado.visible = rastreada;
    // Com a mão nua, a ponta do indicador que vale é a rastreada.
    const dono = rastreada && this.rastreada ? this.rastreada : this.articulada;
    const alvo = dono?.pontaDoIndicador ?? this.reserva.pontaDoIndicador;
    if (this.pontaDoIndicador.parent !== alvo) {
      this.pontaDoIndicador.removeFromParent();
      alvo.add(this.pontaDoIndicador);
    }
  }

  descartar() {
    this.descartada = true;
    this.grupo.removeFromParent();
    this.grupoRastreado.removeFromParent();
    this.articulada?.descartar();
    this.rastreada?.descartar();
    this.reserva.descartar();
  }
}
