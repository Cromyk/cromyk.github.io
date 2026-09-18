import * as THREE from 'three';
import { Luva } from './glove';
import { Placa } from './hud';

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
      // O punho também. Sem isto, uma mão que sumiu fechada volta mentindo que
      // está fechada: a borda de `lerPunhoFechado` nunca vem, e aquela mão
      // passa o resto da sessão sem conseguir agarrar nada.
      this.punhoFechado = false;
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
  atualizarLuva(dt: number, recuo = 0, giro?: { x: number; y: number; z: number }): boolean {
    const luva = this.luva;
    if (!luva) return false;
    luva.recuar(recuo);
    // O giro chega ESPELHADO para a mão direita: sob reflexão no plano do
    // corpo, um eixo de rotação (x, y, z) vira (x, −y, −z). Sem isso o mesmo
    // empurrão no analógico abriria uma mão e fecharia a outra, e calibrar as
    // duas viraria duas calibrações.
    if (giro) {
      const espelho = this.lado === 'right' ? -1 : 1;
      luva.ajustarGiro(giro.x, giro.y * espelho, giro.z * espelho);
    }
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
   * Ela está fechada AGORA — que é diferente de `segurando`.
   *
   * `segurando` quer dizer "pegou alguma coisa e continua com ela". Isto aqui é
   * o estado do punho neste instante, tenha ele pegado algo ou não, e é o que
   * um gesto de DUAS MÃOS precisa perguntar sobre a outra mão: para levantar um
   * bicho grande as duas têm de estar fechadas juntas, e a outra ainda não
   * pegou nada — ela está esperando esta.
   *
   * Meio curso no controle, porque o runtime só dispara `squeezestart` perto do
   * fim dele, e aqui a pergunta não é "acabou de fechar", é "está fechada".
   */
  get fechada(): boolean {
    return this.semControle ? this.punhoFechado : this.grip > 0.5;
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

  /** Inclinação vertical do analógico, de -1 (para cima) a 1 (para baixo). */
  analogicoY(): number {
    const eixos = this.fonte?.gamepad?.axes;
    if (!eixos) return 0;
    const y = eixos[3] ?? eixos[1] ?? 0;
    return Math.abs(y) < 0.15 ? 0 : y; // zona morta
  }

  /** Vibração curta no controle, quando o runtime suportar. */
  vibrar(intensidade = 0.4, duracaoMs = 40) {
    const atuador = this.fonte?.gamepad?.hapticActuators?.[0] as
      | { pulse?: (i: number, d: number) => void }
      | undefined;
    atuador?.pulse?.(intensidade, duracaoMs);
  }

  /**
   * Um dos padrões nomeados de `TATO`. É por aqui que o jogo fala com a mão.
   *
   * Prefira isto a `vibrar` com números soltos: a mão aprende padrões, não
   * valores. Ver o comentário de `TATO`.
   */
  sentir(padrao: Tato) {
    const pulsos = TATO[padrao];
    let atraso = 0;
    for (const [forca, ms] of pulsos) {
      if (atraso === 0) this.vibrar(forca, ms);
      else setTimeout(() => this.vibrar(forca, ms), atraso);
      // Um respiro entre os pulsos, senão dois pulsos colados viram um só e o
      // padrão de duas batidas deixa de ser distinguível do de uma.
      atraso += ms + 45;
    }
  }
}

export type Tato = keyof typeof TATO;

/**
 * O vocabulário de vibração do jogo.
 *
 * Antes eram 33 chamadas de `vibrar` com intensidade e duração escolhidas caso
 * a caso — `0.3, 35` aqui, `0.7, 70` ali, `0.45, 60` acolá. Isso é ruído: a mão
 * não guarda valores, guarda **padrões**, e trinta e três variações levemente
 * diferentes não formam padrão nenhum.
 *
 * São cinco, e a diferença entre eles é de FORMA, não de força — porque força é
 * o que o runtime do headset mais distorce e o que menos sobrevive a uma luva
 * ou a um controle diferente:
 *
 * - **pegou** — uma batida curta e leve. "Está na sua mão."
 * - **recusado** — DUAS batidas separadas. É o único padrão de duas, e é de
 *   propósito: "não" precisa ser inconfundível com qualquer "sim", inclusive de
 *   olhos fechados, que é o teste do item 1.1 do roteiro.
 * - **acertou** — uma batida seca e forte. O golpe pegou.
 * - **levou** — uma batida longa e média, que se arrasta. Você é que tomou.
 * - **marcou** — a mais leve de todas, para confirmações que não interrompem
 *   nada: o alvo travou, a marca caiu no chão.
 *
 * Cada entrada é uma sequência de `[força 0–1, duração em ms]`.
 */
export const TATO = {
  pegou: [[0.35, 35]],
  recusado: [[0.5, 60], [0.5, 60]],
  acertou: [[0.85, 55]],
  levou: [[0.45, 140]],
  marcou: [[0.25, 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [number, number]>>;

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
 * O feixe que diz em quem o seu Pokémon vai bater.
 *
 * Existe porque a mira de combate era invisível: o jogo escolhia um alvo a cada
 * gatilho e só avisava DEPOIS, num cartaz com o nome de quem levou. Com dois
 * selvagens perto um do outro, a única forma de descobrir para onde o braço
 * estava apontando era atacar e ver quem gritou.
 *
 * É um cilindro e não uma `THREE.Line` de propósito: a linha do WebGL tem um
 * pixel de largura em qualquer plataforma, e um pixel a dois metros de
 * distância, num passthrough colorido, some. O cilindro tem espessura de
 * verdade, some na ponta com um degradê e custa uma malha por mão.
 *
 * A cor vem de fora — é a do tipo de quem está sob a mira —, então o feixe
 * responde ao alvo antes mesmo de o nome dele aparecer.
 */
export class FeixeDeAlvo {
  readonly grupo = new THREE.Group();
  private haste: THREE.Mesh;
  private ponta: THREE.Mesh;
  private matHaste: THREE.MeshBasicMaterial;
  private matPonta: THREE.MeshBasicMaterial;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private forca = 0;
  /** A etiqueta de efetividade, na ponta. Ver definirEtiqueta. */
  private etiqueta = new Placa(0.14, 0.042, 300);
  private etiquetaAtual = '';

  constructor() {
    // Cilindro de comprimento 1 deitado sobre −Z, que é para onde a mão aponta;
    // o comprimento vira escala em `atualizar`. Sem tampas: elas nunca são
    // vistas e são dois triângulos por quadro a troco de nada.
    const geoHaste = new THREE.CylinderGeometry(0.0045, 0.0018, 1, 6, 1, true);
    geoHaste.translate(0, -0.5, 0);
    geoHaste.rotateX(-Math.PI / 2);
    this.matHaste = new THREE.MeshBasicMaterial({
      color: 0xff6b5c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // Aditivo para o feixe brilhar por cima do passthrough em vez de ficar um
      // canudo fosco boiando na sala.
      blending: THREE.AdditiveBlending,
    });
    this.haste = new THREE.Mesh(geoHaste, this.matHaste);
    this.haste.frustumCulled = false;

    const geoPonta = new THREE.SphereGeometry(0.018, 10, 8);
    this.matPonta = new THREE.MeshBasicMaterial({
      color: 0xff6b5c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ponta = new THREE.Mesh(geoPonta, this.matPonta);
    this.ponta.frustumCulled = false;

    this.descartaveis.push(geoHaste, this.matHaste, geoPonta, this.matPonta);
    this.etiqueta.malha.visible = false;
    this.grupo.add(this.haste, this.ponta, this.etiqueta.malha);
    this.grupo.visible = false;
  }

  /**
   * A etiqueta da ponta do feixe: o que o seu golpe vai fazer NESTE alvo.
   *
   * A tabela dos dezoito tipos é o coração do combate e a coisa mais difícil de
   * guardar de cabeça — e até agora o jogo só contava o resultado DEPOIS, no
   * aviso que aparece quando o golpe já saiu. Informação que chega depois da
   * decisão não é informação, é placar.
   *
   * Aqui ela chega enquanto o braço ainda está escolhendo, no lugar onde o olho
   * já está: na ponta do feixe, em cima do bicho. É o mesmo princípio da pílula
   * de condição no card do golpe — o que muda a jogada tem de estar visível
   * antes da jogada.
   */
  definirEtiqueta(texto: string, cor: string) {
    if (texto === this.etiquetaAtual) return;
    this.etiquetaAtual = texto;
    if (!texto) {
      this.etiqueta.malha.visible = false;
      return;
    }
    this.etiqueta.malha.visible = true;
    this.etiqueta.escrever([{ texto, tamanho: 34, cor, peso: 700 }], {
      raio: 12,
      fundo: 'rgba(8, 12, 19, 0.82)',
      borda: 'rgba(255,255,255,0.14)',
    });
  }

  /**
   * `comprimento` é a distância até o alvo, em metros. `cor` é a do tipo dele.
   *
   * O pulso da ponta é lento de propósito: em VR, qualquer coisa que pisque
   * rápido no centro do campo de visão cansa em minutos.
   */
  atualizar(dt: number, mostrar: boolean, comprimento: number, cor: number, agora: number) {
    this.forca += ((mostrar ? 1 : 0) - this.forca) * Math.min(1, dt * 14);
    this.grupo.visible = this.forca > 0.02;
    if (!this.grupo.visible) return;

    this.matHaste.color.setHex(cor);
    this.matPonta.color.setHex(cor);
    this.matHaste.opacity = this.forca * 0.55;
    const pulso = 0.8 + Math.sin(agora * 5) * 0.2;
    this.matPonta.opacity = this.forca * 0.85 * pulso;

    this.haste.scale.z = comprimento;
    this.ponta.position.z = -comprimento;
    this.ponta.scale.setScalar(pulso);

    // A etiqueta fica logo acima da ponta, encarando quem segura o feixe: ela é
    // filha da mão, então já nasce virada para o rosto.
    this.etiqueta.malha.position.set(0, 0.075, -comprimento);
    (this.etiqueta.malha.material as THREE.MeshBasicMaterial).opacity = this.forca;
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
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

/**
 * O anel que diz em quem o seu Pokémon está batendo.
 *
 * Escolher o alvo com o braço só vale se der para conferir quem foi escolhido:
 * três selvagens na sala, um golpe saindo, e sem marca nenhuma o jogador
 * descobre a escolha pelo bicho que apanhou — tarde demais para mudar de ideia.
 *
 * Fica no chão, aos pés do alvo, e não em volta do corpo: um bicho pode estar
 * de costas, atrás do sofá ou pairando a dois metros, e o anel no chão continua
 * visível em todos os casos. Duas voltas girando em sentidos contrários é o que
 * separa "mira" de "aura de golpe", que é o outro anel do jogo (ver Aura).
 */
export class MarcaDeAlvo {
  readonly grupo = new THREE.Group();

  private externo: THREE.Mesh;
  private interno: THREE.Mesh;
  private geoExterno: THREE.RingGeometry;
  private geoInterno: THREE.RingGeometry;
  private material: THREE.MeshBasicMaterial;
  private opacidade = 0;
  private tempo = 0;

  constructor(cor = 0xff7a6b) {
    this.material = new THREE.MeshBasicMaterial({
      color: cor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Dois arcos vazados, e não um anel inteiro: o vão é o que faz o giro ser
    // percebido como giro.
    this.geoExterno = new THREE.RingGeometry(0.15, 0.185, 24, 1, 0, Math.PI * 1.45);
    this.geoInterno = new THREE.RingGeometry(0.1, 0.12, 20, 1, 0, Math.PI * 1.2);
    this.externo = new THREE.Mesh(this.geoExterno, this.material);
    this.interno = new THREE.Mesh(this.geoInterno, this.material);
    this.externo.rotation.x = -Math.PI * 0.5;
    this.interno.rotation.x = -Math.PI * 0.5;

    this.grupo.add(this.externo, this.interno);
    this.grupo.visible = false;
  }

  /** `raio` acompanha o tamanho do bicho: um Onix não cabe num anel de palmo. */
  atualizar(dt: number, onde: THREE.Vector3 | null, pisoY: number, raio = 0.2) {
    this.tempo += dt;
    const alvo = onde ? 1 : 0;
    this.opacidade += (alvo - this.opacidade) * Math.min(1, dt * 12);
    this.grupo.visible = this.opacidade > 0.02;
    if (!this.grupo.visible || !onde) return;

    this.material.opacity = this.opacidade * (0.5 + Math.sin(this.tempo * 5) * 0.16);
    this.grupo.position.set(onde.x, pisoY + 0.008, onde.z);
    this.grupo.scale.setScalar(Math.max(0.5, raio / 0.18));
    this.externo.rotation.z = this.tempo * 1.1;
    this.interno.rotation.z = -this.tempo * 1.7;
  }

  descartar() {
    this.grupo.removeFromParent();
    this.geoExterno.dispose();
    this.geoInterno.dispose();
    this.material.dispose();
  }
}
