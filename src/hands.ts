import * as THREE from 'three';
import { Luva } from './glove';

interface Amostra {
  posicao: THREE.Vector3;
  tempo: number;
}

/** Janela usada para medir a velocidade do arremesso. */
const JANELA_MS = 90;
const MAX_AMOSTRAS = 12;

/**
 * Índices do perfil `xr-standard` dos controles Touch. Os dois primeiros já
 * chegam como eventos (`select` e `squeeze`); A/B e X/Y não chegam de jeito
 * nenhum, e é por isso que eles precisam ser lidos do gamepad a cada quadro.
 */
export const GATILHO = 0;
export const GRIP = 1;
/** A na direita, X na esquerda. */
export const BOTAO_A = 4;
/** B na direita, Y na esquerda. */
export const BOTAO_B = 5;

/**
 * Uma mão rastreada. Guarda um histórico curto de posições para descobrir com
 * que velocidade o braço estava se movendo no instante em que você soltou o
 * gatilho — é isso que faz o arremesso parecer um arremesso.
 */
export class Mao {
  readonly indice: number;
  readonly alvo: THREE.XRTargetRaySpace; // direção de mira
  readonly punho: THREE.XRGripSpace; // onde a esfera fica
  /** As 25 juntas, quando o jogador está de mão nua. */
  readonly rastreada: THREE.XRHandSpace;
  lado: 'left' | 'right' | 'none' = 'none';
  conectada = false;
  /** Grip apertado: é ele que segura a pokébola. */
  segurando = false;
  /** A luva branca. Só existe depois que o lado da mão é conhecido. */
  luva: Luva | null = null;
  /** Verdadeiro quando quem está rastreando é a mão nua, e não o controle. */
  semControle = false;

  private fonte: XRInputSource | null = null;
  private amostras: Amostra[] = [];
  private ultimaVelocidade = new THREE.Vector3();
  private botoes: boolean[] = [];
  private bordas: boolean[] = [];
  /** Punho fechado na mão rastreada, para fazer as vezes do GRIP. */
  private punhoFechado = false;

  constructor(renderer: THREE.WebGLRenderer, indice: number) {
    this.indice = indice;
    this.alvo = renderer.xr.getController(indice);
    this.punho = renderer.xr.getControllerGrip(indice);
    this.rastreada = renderer.xr.getHand(indice);

    this.alvo.addEventListener('connected', (evento) => {
      this.fonte = evento.data;
      this.lado = (evento.data.handedness as 'left' | 'right') ?? 'none';
      this.conectada = true;
      this.semControle = evento.data.hand != null;
    });
    this.alvo.addEventListener('disconnected', () => {
      this.fonte = null;
      this.conectada = false;
      this.segurando = false;
      this.botoes.length = 0;
      this.bordas.length = 0;
    });
  }

  /**
   * Monta a luva e a pendura no espaço certo.
   *
   * Com controle ela vai no grip space, que é onde a mão de verdade está. Com
   * hand tracking as juntas já chegam em coordenadas do espaço de referência,
   * então o grupo da luva fica na raiz da cena e as juntas se posicionam
   * sozinhas — pendurar no punho ali aplicaria a transformação duas vezes.
   */
  vestirLuva(corDaFaixa: number): Luva {
    if (this.luva) return this.luva;
    const lado = this.lado === 'none' ? 'right' : this.lado;
    const luva = new Luva(lado, corDaFaixa);
    this.luva = luva;
    this.punho.add(luva.grupo);
    this.rastreada.add(luva.grupoRastreado);
    return luva;
  }

  /**
   * Põe a luva no estado do quadro: dedos fechando conforme os botões, ou as
   * juntas de verdade quando a mão está nua. Devolve se a mão está rastreada.
   */
  atualizarLuva(dt: number): boolean {
    const luva = this.luva;
    if (!luva) return false;
    const comJuntas =
      this.semControle &&
      luva.usarJuntas(this.rastreada as unknown as THREE.Object3D & { joints?: Record<string, THREE.Object3D> });
    luva.definirModo(comJuntas);
    if (!comJuntas) luva.definirDedos(this.gatilho, Math.max(this.grip, this.segurando ? 1 : 0), dt);
    return comJuntas;
  }

  /**
   * Lê os botões do quadro e guarda quais acabaram de ser apertados.
   *
   * O WebXR só manda evento para o gatilho e para o grip. A, B, X e Y ficam no
   * gamepad e só existem se alguém perguntar — daí a leitura por quadro com
   * detecção de borda, para "apertou" valer um quadro só e não a pressão toda.
   */
  amostrarBotoes() {
    const gamepad = this.fonte?.gamepad;
    if (!gamepad) {
      if (this.bordas.length) this.bordas.length = 0;
      return;
    }
    for (let i = 0; i < gamepad.buttons.length; i++) {
      const agora = gamepad.buttons[i].pressed;
      this.bordas[i] = agora && !this.botoes[i];
      this.botoes[i] = agora;
    }
  }

  /** Verdadeiro só no quadro em que o botão desceu. */
  apertou(indice: number): boolean {
    return this.bordas[indice] === true;
  }

  segurandoBotao(indice: number): boolean {
    return this.botoes[indice] === true;
  }

  /** Quanto o gatilho está puxado, 0..1. Analógico nos Touch. */
  get gatilho(): number {
    return this.fonte?.gamepad?.buttons[GATILHO]?.value ?? 0;
  }

  get grip(): number {
    return this.fonte?.gamepad?.buttons[GRIP]?.value ?? 0;
  }

  /**
   * A mão rastreada não tem grip, e o jogo inteiro depende dele para pegar a
   * pokébola. Então fechar o punho — as quatro pontas de dedo perto da palma —
   * faz as vezes, e a borda disso vira o `squeezestart`/`squeezeend`.
   *
   * Devolve 'fechou' ou 'abriu' no quadro da mudança, senão null.
   */
  lerPunhoFechado(): 'fechou' | 'abriu' | null {
    const juntas = (this.rastreada as unknown as { joints?: Record<string, THREE.Object3D> }).joints;
    if (!juntas) return null;
    const palma = juntas['wrist'];
    const ponta = juntas['middle-finger-tip'];
    const base = juntas['middle-finger-metacarpal'] ?? juntas['middle-finger-phalanx-proximal'];
    if (!palma || !ponta || !base) return null;

    // Comparar com o tamanho da própria mão, e não com uma distância fixa em
    // centímetros, é o que faz isto valer para a mão de uma criança e para a de
    // um adulto sem calibração nenhuma.
    const alcance = palma.position.distanceTo(base.position) + 0.001;
    const fechado = ponta.position.distanceTo(palma.position) < alcance * 1.9;
    if (fechado === this.punhoFechado) return null;
    this.punhoFechado = fechado;
    return fechado ? 'fechou' : 'abriu';
  }

  /** Posição do punho no mundo. */
  posicaoMundo(alvo = new THREE.Vector3()): THREE.Vector3 {
    if (this.semControle) {
      const juntas = (this.rastreada as unknown as { joints?: Record<string, THREE.Object3D> })
        .joints;
      const palma = juntas?.['middle-finger-metacarpal'] ?? juntas?.['wrist'];
      if (palma) return palma.getWorldPosition(alvo);
    }
    return this.punho.getWorldPosition(alvo);
  }

  /**
   * Onde a mão ENCOSTA. É diferente do punho: fazer carinho num Charmander de
   * 30 cm com o centro do punho como ponto de contato obriga a enfiar meio
   * braço dentro do bicho. A ponta do indicador é onde a mão de verdade toca.
   */
  pontoDeToque(alvo = new THREE.Vector3()): THREE.Vector3 {
    if (this.semControle) {
      const juntas = (this.rastreada as unknown as { joints?: Record<string, THREE.Object3D> })
        .joints;
      const ponta = juntas?.['index-finger-tip'];
      if (ponta) return ponta.getWorldPosition(alvo);
    }
    if (this.luva) return this.luva.pontaDoIndicador.getWorldPosition(alvo);
    return this.posicaoMundo(alvo);
  }

  /** Raio de mira do controle, para apontar no painel do time. */
  mira(): { origem: THREE.Vector3; direcao: THREE.Vector3 } {
    this.alvo.updateMatrixWorld();
    const origem = this.alvo.getWorldPosition(new THREE.Vector3());
    const direcao = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.alvo.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    return { origem, direcao };
  }

  amostrar(tempoMs: number) {
    const pos = this.posicaoMundo();
    this.amostras.push({ posicao: pos, tempo: tempoMs });
    if (this.amostras.length > MAX_AMOSTRAS) this.amostras.shift();
  }

  /**
   * Velocidade média na janela recente, em m/s. Um pouco de ganho extra porque
   * o pulso trava antes do que o cérebro espera — sem isso o arremesso sai
   * sempre curto.
   */
  velocidadeArremesso(tempoMs: number, ganho = 1.15): THREE.Vector3 {
    const recentes = this.amostras.filter((a) => tempoMs - a.tempo <= JANELA_MS);
    if (recentes.length < 2) return this.ultimaVelocidade.set(0, 0, 0);

    const primeira = recentes[0];
    const ultima = recentes[recentes.length - 1];
    const dt = (ultima.tempo - primeira.tempo) / 1000;
    if (dt <= 0.001) return this.ultimaVelocidade.set(0, 0, 0);

    this.ultimaVelocidade
      .copy(ultima.posicao)
      .sub(primeira.posicao)
      .divideScalar(dt)
      .multiplyScalar(ganho);

    // Teto de segurança: ninguém precisa arremessar a 20 m/s dentro de casa.
    const limite = 9;
    if (this.ultimaVelocidade.length() > limite) this.ultimaVelocidade.setLength(limite);
    return this.ultimaVelocidade;
  }

  limparAmostras() {
    this.amostras.length = 0;
  }

  /**
   * Inclinação horizontal do analógico, de -1 a 1.
   * Nos controles do Quest o stick fica nos eixos 2 e 3; 0 e 1 são o touchpad,
   * que não existe ali — por isso tentamos os dois pares.
   */
  analogicoX(): number {
    const eixos = this.fonte?.gamepad?.axes;
    if (!eixos) return 0;
    const x = eixos[2] ?? eixos[0] ?? 0;
    return Math.abs(x) < 0.15 ? 0 : x; // zona morta
  }

  /** Vibração curta no controle, quando o runtime suportar. */
  vibrar(intensidade = 0.4, duracaoMs = 40) {
    const atuador = this.fonte?.gamepad?.hapticActuators?.[0] as
      | { pulse?: (i: number, d: number) => void }
      | undefined;
    atuador?.pulse?.(intensidade, duracaoMs);
  }
}

/** Raio fino que sai da mão, usado para apontar no painel do time. */
export class RaioMira {
  readonly linha: THREE.Line;
  private geometria: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;

  constructor(cor = 0x8fd2ff) {
    this.geometria = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    this.material = new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0 });
    this.linha = new THREE.Line(this.geometria, this.material);
    this.linha.frustumCulled = false;
  }

  atualizar(dt: number, mostrar: boolean, comprimento: number) {
    const alvo = mostrar ? 0.75 : 0;
    this.material.opacity += (alvo - this.material.opacity) * Math.min(1, dt * 12);
    this.linha.visible = this.material.opacity > 0.02;
    this.linha.scale.z = comprimento;
  }

  descartar() {
    this.geometria.dispose();
    this.material.dispose();
  }
}

/**
 * Arco pontilhado que mostra para onde a pokébola vai cair com a velocidade
 * atual do braço. Só aparece quando a mão está de fato em movimento.
 */
export class Mira {
  readonly linha: THREE.Points;
  private geometria: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private static readonly PASSOS = 26;

  constructor(cor: number) {
    this.geometria = new THREE.BufferGeometry();
    this.geometria.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(Mira.PASSOS * 3), 3),
    );
    this.material = new THREE.PointsMaterial({
      color: cor,
      size: 0.012,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.linha = new THREE.Points(this.geometria, this.material);
    this.linha.frustumCulled = false;
  }

  atualizar(origem: THREE.Vector3, velocidade: THREE.Vector3, pisoY: number, dt: number) {
    const rapidez = velocidade.length();
    // Abaixo disso o braço está parado e um arco só atrapalharia.
    const alvoOpacidade = rapidez > 1.4 ? Math.min(0.75, (rapidez - 1.4) * 0.4) : 0;
    this.material.opacity += (alvoOpacidade - this.material.opacity) * Math.min(1, dt * 10);
    if (this.material.opacity < 0.02) return;

    const pos = this.geometria.attributes.position as THREE.BufferAttribute;
    const p = origem.clone();
    const v = velocidade.clone();
    const passo = 0.055;
    for (let i = 0; i < Mira.PASSOS; i++) {
      pos.setXYZ(i, p.x, p.y, p.z);
      v.y += -9.81 * passo;
      p.addScaledVector(v, passo);
      if (p.y < pisoY) p.y = pisoY; // achata o arco depois do impacto
    }
    pos.needsUpdate = true;
  }

  descartar() {
    this.geometria.dispose();
    this.material.dispose();
  }
}

/**
 * A linha e o alvo do comando de mover.
 *
 * Você aponta para o seu Pokémon, segura o gatilho e arrasta: uma linha de
 * pontos sai dele e acompanha a sua mão pelo chão, com um anel pulsando na
 * ponta. Ao soltar, ele caminha até ali.
 *
 * A linha nasce NO POKÉMON, e não na sua mão, de propósito: é ele quem vai
 * andar, e ver o caminho sair dos pés dele responde "quem" e "para onde" na
 * mesma imagem. Uma linha saindo da mão pareceria uma mira de arma.
 */
export class MarcaDeDestino {
  readonly grupo = new THREE.Group();

  private pontos: THREE.Points;
  private geoPontos: THREE.BufferGeometry;
  private matPontos: THREE.PointsMaterial;
  private anel: THREE.Mesh;
  private geoAnel: THREE.RingGeometry;
  private matAnel: THREE.MeshBasicMaterial;
  private opacidade = 0;
  private tempo = 0;

  private static readonly PASSOS = 24;

  constructor(cor = 0x7fe7c4) {
    this.geoPontos = new THREE.BufferGeometry();
    this.geoPontos.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MarcaDeDestino.PASSOS * 3), 3),
    );
    this.matPontos = new THREE.PointsMaterial({
      color: cor,
      size: 0.018,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.pontos = new THREE.Points(this.geoPontos, this.matPontos);
    this.pontos.frustumCulled = false;

    this.geoAnel = new THREE.RingGeometry(0.07, 0.1, 28);
    this.matAnel = new THREE.MeshBasicMaterial({
      color: cor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.anel = new THREE.Mesh(this.geoAnel, this.matAnel);
    this.anel.rotation.x = -Math.PI * 0.5;

    this.grupo.add(this.pontos, this.anel);
    this.grupo.visible = false;
  }

  atualizar(
    dt: number,
    mostrar: boolean,
    de: THREE.Vector3 | null,
    para: THREE.Vector3 | null,
    pisoY: number,
  ) {
    this.tempo += dt;
    const alvo = mostrar && de && para ? 1 : 0;
    this.opacidade += (alvo - this.opacidade) * Math.min(1, dt * 14);
    this.grupo.visible = this.opacidade > 0.02;
    if (!this.grupo.visible || !de || !para) return;

    this.matPontos.opacity = this.opacidade * 0.9;
    // O anel respira, para não se confundir com uma sombra no chão.
    const pulso = 1 + Math.sin(this.tempo * 6) * 0.12;
    this.matAnel.opacity = this.opacidade * 0.55;
    this.anel.scale.setScalar(pulso);
    this.anel.position.set(para.x, pisoY + 0.006, para.z);

    const pos = this.geoPontos.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < MarcaDeDestino.PASSOS; i++) {
      const t = i / (MarcaDeDestino.PASSOS - 1);
      // Arco baixo: o caminho passa por cima do carpete em vez de rastejar
      // dentro dele, e fica legível mesmo contra um chão claro.
      const altura = Math.sin(t * Math.PI) * 0.12;
      pos.setXYZ(
        i,
        de.x + (para.x - de.x) * t,
        pisoY + 0.02 + altura,
        de.z + (para.z - de.z) * t,
      );
    }
    pos.needsUpdate = true;
  }

  descartar() {
    this.geoPontos.dispose();
    this.matPontos.dispose();
    this.geoAnel.dispose();
    this.matAnel.dispose();
  }
}
