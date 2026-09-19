import * as THREE from 'three';

/**
 * O RANCHO: um pasto que substitui o seu quarto, para soltar a coleção inteira.
 *
 * ## Por que ele existe
 *
 * *"Criar um ambiente de RANCHO POKÉMON para poder soltar os meus Pokémons à
 * vontade e interagir com eles"* — playtest de 19/09.
 *
 * O jogo inteiro é sobre o seu quarto, e isso é a graça dele — mas o quarto
 * tem quatro metros e uma mesa no meio, e o jogo só deixa UM Pokémon fora da
 * bola de cada vez justamente por isso. Um Onix e um Snorlax na sua sala não
 * cabem; num pasto, cabem. O rancho é o lugar onde a coleção deixa de ser uma
 * lista no PC e vira um bando.
 *
 * ## Como ele tapa o passthrough
 *
 * Não tem API para isso, e não precisa ter. A sessão é `immersive-ar` com
 * `setClearAlpha(0)`: o "fundo" é o seu quarto porque o jogo não desenha nada
 * ali. Geometria OPACA na frente da câmera tapa o passthrough do mesmo jeito
 * que taparia qualquer outra coisa — então uma abóbada de céu em volta e um
 * chão sob os pés bastam para o quarto sumir.
 *
 * É por isso que a abóbada tem raio de 40 m e o chão tem 60: eles têm de estar
 * além de qualquer coisa que o jogo desenhe, inclusive de um Onix em tamanho
 * real, e além de qualquer passo que o boundary do headset permita.
 *
 * ## O orçamento
 *
 * Em realidade mista o headset desenha a cena DUAS vezes a 90 Hz, e este
 * arquivo acrescenta um cenário inteiro a uma cena que antes era só bicho e
 * painel. Então tudo aqui é barato de propósito:
 *
 * - **Nada de `transmission`, nada de pós-processamento** — a regra do
 *   repositório, e a água do laguinho é um material opaco com brilho, não um
 *   vidro;
 * - **Instâncias, não malhas** — as 44 estacas da cerca são uma
 *   `InstancedMesh`, as 14 árvores são duas;
 * - **Duas texturas de canvas, 128 e 256 px**, desenhadas UMA vez na
 *   construção e nunca mais tocadas. Redesenhar canvas por quadro é a coisa
 *   mais cara que um jogo em WebXR pode fazer sem perceber;
 * - **Sem sombra projetada pelo cenário.** As árvores não recebem nem lançam
 *   sombra; quem lança é o bicho, que é o que o olho procura no chão.
 *
 * O total é de 11 desenhos e cerca de 9 mil triângulos.
 */

/** O raio do pasto andável, em metros. Ver `dentro`. */
export const RAIO_DO_PASTO = 11;
/** E o da cerca, que é o que se vê como limite. */
const RAIO_DA_CERCA = 12;
/** A abóbada e o chão têm de estar além de tudo. Ver o cabeçalho. */
const RAIO_DO_CEU = 40;
const RAIO_DO_CHAO = 60;

const ESTACAS = 44;
const ARVORES = 14;

/**
 * Onde o laguinho fica, em relação ao centro do pasto.
 *
 * Longe do arco de solta de propósito. Com ele a 4,6 m, a folha de contato
 * (`npm run pasto`) mostrou duas das oito cruzes caindo dentro d'água — e um
 * Charmander nascendo no meio do lago é engraçado uma vez e errado sempre. A
 * água continua ao alcance de quem quiser ir até lá, que é o ponto dela.
 */
const LAGO = { x: -6.5, z: -5.2, raio: 2.3 };

/**
 * A textura do capim: ruído verde num canvas pequeno, repetido no chão.
 *
 * Um plano verde liso a 60 m de raio não lê como chão, lê como vazio — não há
 * nada que dê escala, e o olho perde a noção de distância exatamente onde ela
 * importa (quão longe está o Pokémon?). O ruído resolve isso com 128 px de
 * textura e um `repeat`, que é o mais barato que existe.
 */
function texturaDeCapim(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4b7a3a';
  ctx.fillRect(0, 0, 128, 128);

  // Tufos: traços curtos, claros e escuros, em posições sorteadas. Sem
  // semente fixa de propósito — é capim, e duas sessões com o capim idêntico
  // não seriam mais certas que duas diferentes.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const claro = Math.random() < 0.5;
    ctx.strokeStyle = claro ? 'rgba(126, 178, 96, 0.55)' : 'rgba(42, 82, 40, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 3);
    ctx.stroke();
  }

  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  // Um tufo a cada 40 cm: é a escala em que capim parece capim de pé.
  textura.repeat.set(RAIO_DO_CHAO * 2.5, RAIO_DO_CHAO * 2.5);
  textura.anisotropy = 4;
  return textura;
}

/** O céu: um degradê vertical num canvas de uma coluna só. */
function texturaDeCeu(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f6fb5');
  grad.addColorStop(0.45, '#8ec2e8');
  grad.addColorStop(0.72, '#dcecf6');
  // A faixa de baixo é quente: é o horizonte, e ele é o que faz uma abóbada
  // parecer um céu em vez de uma tigela azul virada.
  grad.addColorStop(1, '#f2e6c8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);

  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

export class Rancho {
  readonly grupo = new THREE.Group();
  /** Ligado ou não. Quem liga é o `Jogo`. */
  aberto = false;

  /** O centro do pasto no mundo, e a altura do chão dele. */
  private centro = new THREE.Vector3();
  private piso = 0;
  /**
   * 0 fechado, 1 aberto — e isto NÃO é um fade.
   *
   * Não dá para fazer fade aqui sem pagar caro: o chão e a abóbada são opacos
   * de propósito (é a opacidade deles que tapa o passthrough), e torná-los
   * transparentes por um segundo custaria ordenação e um passe a mais em cada
   * olho. O que este número faz é dar ao cenário uns três décimos de segundo
   * de atraso na entrada e na saída, o bastante para o som chegar antes da
   * imagem. Em VR, trocar o mundo inteiro sem nenhum aviso embrulha o
   * estômago; com o clique um instante antes, não.
   */
  private abertura = 0;

  private materiais: THREE.Material[] = [];
  private geometrias: THREE.BufferGeometry[] = [];
  private texturas: THREE.Texture[] = [];
  /** O sol do rancho: ele só existe com o rancho aberto. */
  private sol: THREE.DirectionalLight;
  private ambiente: THREE.HemisphereLight;
  /** As folhas balançam. É o único movimento por quadro daqui. */
  private copas: THREE.InstancedMesh | null = null;
  private baseDasCopas: THREE.Matrix4[] = [];
  private tempo = 0;

  constructor() {
    this.grupo.visible = false;
    // `renderOrder` negativo e `depthWrite` no céu: a abóbada é a primeira
    // coisa desenhada, e tudo o que vier depois passa por cima dela.
    const guardarMat = <T extends THREE.Material>(m: T): T => {
      this.materiais.push(m);
      return m;
    };
    const guardarGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.geometrias.push(g);
      return g;
    };

    // --- o céu ---
    const ceuTex = texturaDeCeu();
    this.texturas.push(ceuTex);
    const matCeu = guardarMat(
      // `MeshBasicMaterial`: o céu não é iluminado por nada, ele É a luz.
      new THREE.MeshBasicMaterial({ map: ceuTex, side: THREE.BackSide, fog: false }),
    );
    // A cor que a FOLHA DE CONFERÊNCIA usa no lugar da textura.
    //
    // tools/pasto.ts rasteriza com aritmética, sem WebGL e sem amostrar
    // textura: para ele um material com `map` e `color` branca é um material
    // branco, e o pasto saía com céu e chão cor de papel. Isto não muda nada
    // no jogo — é um bilhete para a ferramenta, e está aqui porque é aqui que
    // a cor de verdade é escolhida.
    matCeu.userData.corDaFolha = [0.55, 0.76, 0.9];
    const ceu = new THREE.Mesh(guardarGeo(new THREE.SphereGeometry(RAIO_DO_CEU, 20, 12)), matCeu);
    ceu.renderOrder = -10;
    this.grupo.add(ceu);

    // --- o chão ---
    const capim = texturaDeCapim();
    this.texturas.push(capim);
    const matChao = guardarMat(new THREE.MeshLambertMaterial({ map: capim }));
    matChao.userData.corDaFolha = [0.29, 0.48, 0.23];
    const chao = new THREE.Mesh(guardarGeo(new THREE.CircleGeometry(RAIO_DO_CHAO, 48)), matChao);
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    chao.renderOrder = -9;
    this.grupo.add(chao);

    // --- o laguinho ---
    //
    // Opaco, com brilho. Água de verdade em WebXR custa `transmission` ou um
    // segundo passe de render, e nenhum dos dois cabe num headset que já
    // desenha tudo duas vezes. O que faz ler como água é o REFLEXO
    // especular — `roughness` baixo com `metalness` médio —, não a
    // transparência.
    const lago = new THREE.Mesh(
      guardarGeo(new THREE.CircleGeometry(LAGO.raio, 28)),
      guardarMat(
        new THREE.MeshStandardMaterial({
          color: 0x2d6a8f,
          roughness: 0.12,
          metalness: 0.35,
        }),
      ),
    );
    lago.rotation.x = -Math.PI / 2;
    lago.position.set(LAGO.x, 0.012, LAGO.z);
    this.grupo.add(lago);

    // A margem de terra, para a água não ser um disco azul colado no capim.
    const margem = new THREE.Mesh(
      guardarGeo(new THREE.RingGeometry(LAGO.raio, LAGO.raio + 0.5, 28)),
      guardarMat(new THREE.MeshLambertMaterial({ color: 0x7a6242 })),
    );
    margem.rotation.x = -Math.PI / 2;
    margem.position.set(LAGO.x, 0.008, LAGO.z);
    this.grupo.add(margem);

    // --- a cerca ---
    const madeira = guardarMat(
      new THREE.MeshLambertMaterial({ color: 0x9c7645 }),
    );
    const estacas = new THREE.InstancedMesh(
      guardarGeo(new THREE.BoxGeometry(0.1, 1.15, 0.1)),
      madeira,
      ESTACAS,
    );
    const travessas = new THREE.InstancedMesh(
      guardarGeo(new THREE.BoxGeometry(0.06, 0.1, 1)),
      madeira,
      ESTACAS * 2,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const escala = new THREE.Vector3(1, 1, 1);
    const passo = (Math.PI * 2) / ESTACAS;
    const corda = 2 * RAIO_DA_CERCA * Math.sin(passo / 2);
    for (let i = 0; i < ESTACAS; i++) {
      const a = i * passo;
      pos.set(Math.cos(a) * RAIO_DA_CERCA, 0.575, Math.sin(a) * RAIO_DA_CERCA);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      estacas.setMatrixAt(i, m.compose(pos, q, escala));

      // Duas travessas por vão, ligando esta estaca à próxima.
      const meio = a + passo / 2;
      for (let t = 0; t < 2; t++) {
        pos.set(
          Math.cos(meio) * RAIO_DA_CERCA,
          0.42 + t * 0.44,
          Math.sin(meio) * RAIO_DA_CERCA,
        );
        escala.set(1, 1, corda / 1);
        travessas.setMatrixAt(i * 2 + t, m.compose(pos, q, escala));
        escala.set(1, 1, 1);
      }
    }
    estacas.instanceMatrix.needsUpdate = true;
    travessas.instanceMatrix.needsUpdate = true;
    estacas.castShadow = false;
    travessas.castShadow = false;
    this.grupo.add(estacas, travessas);

    // --- as árvores, atrás da cerca ---
    //
    // Fora do pasto de propósito: uma árvore dentro do cercado é um obstáculo
    // que o bicho não sabe desviar (o `Pokemon` só conhece o chão e os móveis
    // do seu quarto), e ele atravessaria o tronco na primeira volta.
    const troncos = new THREE.InstancedMesh(
      guardarGeo(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6)),
      guardarMat(new THREE.MeshLambertMaterial({ color: 0x6b4d31 })),
      ARVORES,
    );
    const copas = new THREE.InstancedMesh(
      guardarGeo(new THREE.IcosahedronGeometry(1.5, 1)),
      guardarMat(new THREE.MeshLambertMaterial({ color: 0x3f6f35, flatShading: true })),
      ARVORES,
    );
    for (let i = 0; i < ARVORES; i++) {
      // Espaçamento irregular: árvores em intervalos iguais leem como poste.
      const a = (i / ARVORES) * Math.PI * 2 + Math.sin(i * 2.7) * 0.18;
      const r = RAIO_DA_CERCA + 2.2 + (i % 3) * 1.7;
      const alto = 0.85 + ((i * 7) % 5) * 0.14;
      pos.set(Math.cos(a) * r, 1.2 * alto, Math.sin(a) * r);
      escala.set(alto, alto, alto);
      troncos.setMatrixAt(i, m.compose(pos, new THREE.Quaternion(), escala));

      pos.y = (2.4 + 1.1) * alto;
      escala.setScalar(alto * (0.85 + ((i * 3) % 4) * 0.12));
      const base = m.compose(pos, new THREE.Quaternion(), escala).clone();
      this.baseDasCopas.push(base);
      copas.setMatrixAt(i, base);
      escala.set(1, 1, 1);
    }
    troncos.instanceMatrix.needsUpdate = true;
    copas.instanceMatrix.needsUpdate = true;
    this.copas = copas;
    this.grupo.add(troncos, copas);

    // --- a luz do rancho ---
    //
    // Separada da luz do quarto: em MR a cena é iluminada de leve para o bicho
    // não destoar do seu abajur, e essa mesma luz num pasto ao ar livre deixa
    // tudo cinza. Aqui há um sol de verdade, e ele acende e apaga junto com o
    // cenário.
    this.sol = new THREE.DirectionalLight(0xfff0d0, 1.45);
    this.sol.position.set(9, 14, 5);
    this.ambiente = new THREE.HemisphereLight(0xa8d4f0, 0x53743f, 0.85);
    this.grupo.add(this.sol, this.sol.target, this.ambiente);
  }

  /**
   * Abre o pasto em volta de onde você está.
   *
   * O centro é a SUA posição, e não a origem da sessão: o rancho não é um
   * lugar para onde você vai, é um lugar que aparece onde você está. Se você
   * abrir o rancho na cozinha, o pasto nasce na cozinha — e como o chão dele é
   * o seu chão de verdade, dar um passo continua sendo dar um passo.
   */
  abrir(onde: THREE.Vector3, pisoY: number) {
    this.aberto = true;
    this.centro.set(onde.x, pisoY, onde.z);
    this.piso = pisoY;
    this.grupo.position.copy(this.centro);
    // Um empurrão inicial: a rampa começa em zero e o limiar de visibilidade é
    // 0,02, o que deixaria o pasto invisível por dois quadros depois de abrir.
    this.abertura = Math.max(this.abertura, 0.05);
    this.grupo.visible = true;
    this.sol.target.position.set(0, 0, 0);
  }

  fechar() {
    this.aberto = false;
  }

  /** A altura do chão do pasto — plano, e é o seu piso. Ver `Apoio`. */
  alturaEm(): number {
    return this.piso;
  }

  /** O centro do pasto, para quem precisa medir distância até a cerca. */
  get centroDoPasto(): THREE.Vector3 {
    return this.centro;
  }

  /** O ponto está dentro do cercado? */
  dentro(ponto: THREE.Vector3): boolean {
    return Math.hypot(ponto.x - this.centro.x, ponto.z - this.centro.z) <= RAIO_DO_PASTO;
  }

  /**
   * Onde soltar o n-ésimo morador.
   *
   * Em arco à SUA FRENTE, e não em círculo em volta: você acabou de abrir o
   * rancho e está olhando para algum lado; soltar metade do bando atrás das
   * suas costas faria parecer que só metade saiu. O arco abre 150°, o que é
   * mais largo que o campo de visão do headset e ainda assim todo "à frente".
   *
   * O raio cresce com o índice para dois bichos grandes não nascerem
   * encostados, e o `avanço` desencontra as fileiras.
   */
  pontoDeSolta(indice: number, total: number, olhar: THREE.Vector3): THREE.Vector3 {
    const rumo = Math.atan2(olhar.x, olhar.z);
    const abre = (Math.PI * 150) / 180;
    const fatia = total > 1 ? abre / (total - 1) : 0;
    const angulo = rumo - abre / 2 + fatia * indice;
    const fileira = Math.floor(indice / 4);
    const raio = 3.4 + fileira * 2.6 + (indice % 2) * 0.6;
    return new THREE.Vector3(
      this.centro.x + Math.sin(angulo) * raio,
      this.piso,
      this.centro.z + Math.cos(angulo) * raio,
    );
  }

  /**
   * Um quadro. A única coisa que se mexe aqui são as copas.
   *
   * E elas se mexem por uma razão que não é enfeite: um cenário absolutamente
   * parado, num headset, lê como papel de parede — o olho precisa de alguma
   * coisa viva na periferia para acreditar que está num lugar. Catorze
   * matrizes por quadro é o preço, e é baixo.
   */
  atualizar(dt: number) {
    this.abertura += ((this.aberto ? 1 : 0) - this.abertura) * Math.min(1, dt * 3);
    this.grupo.visible = this.abertura > 0.02;
    if (!this.grupo.visible) return;

    this.tempo += dt;
    if (!this.copas) return;
    const m = new THREE.Matrix4();
    const extra = new THREE.Matrix4();
    for (let i = 0; i < this.baseDasCopas.length; i++) {
      const balanco = Math.sin(this.tempo * 0.7 + i * 1.9) * 0.035;
      extra.makeRotationZ(balanco);
      m.multiplyMatrices(this.baseDasCopas[i], extra);
      this.copas.setMatrixAt(i, m);
    }
    this.copas.instanceMatrix.needsUpdate = true;
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const g of this.geometrias) g.dispose();
    for (const mat of this.materiais) mat.dispose();
    for (const t of this.texturas) t.dispose();
  }
}
