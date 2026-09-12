import * as THREE from 'three';

interface Amostra {
  posicao: THREE.Vector3;
  tempo: number;
}

/** Janela usada para medir a velocidade do arremesso. */
const JANELA_MS = 90;
const MAX_AMOSTRAS = 12;

/**
 * Uma mão rastreada. Guarda um histórico curto de posições para descobrir com
 * que velocidade o braço estava se movendo no instante em que você soltou o
 * gatilho — é isso que faz o arremesso parecer um arremesso.
 */
export class Mao {
  readonly indice: number;
  readonly alvo: THREE.XRTargetRaySpace; // direção de mira
  readonly punho: THREE.XRGripSpace; // onde a esfera fica
  lado: 'left' | 'right' | 'none' = 'none';
  conectada = false;
  segurando = false;

  private fonte: XRInputSource | null = null;
  private amostras: Amostra[] = [];
  private ultimaVelocidade = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, indice: number) {
    this.indice = indice;
    this.alvo = renderer.xr.getController(indice);
    this.punho = renderer.xr.getControllerGrip(indice);

    this.alvo.addEventListener('connected', (evento) => {
      this.fonte = evento.data;
      this.lado = (evento.data.handedness as 'left' | 'right') ?? 'none';
      this.conectada = true;
    });
    this.alvo.addEventListener('disconnected', () => {
      this.fonte = null;
      this.conectada = false;
      this.segurando = false;
    });
  }

  /** Posição do punho no mundo. */
  posicaoMundo(alvo = new THREE.Vector3()): THREE.Vector3 {
    return this.punho.getWorldPosition(alvo);
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

  /** Vibração curta no controle, quando o runtime suportar. */
  vibrar(intensidade = 0.4, duracaoMs = 40) {
    const atuador = this.fonte?.gamepad?.hapticActuators?.[0] as
      | { pulse?: (i: number, d: number) => void }
      | undefined;
    atuador?.pulse?.(intensidade, duracaoMs);
  }
}

/** Um par de luvas simples, para você enxergar as próprias mãos no passthrough. */
export function construirLuva(cor: number): { grupo: THREE.Group; descartaveis: Array<THREE.BufferGeometry | THREE.Material> } {
  const grupo = new THREE.Group();
  const descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  const geo = new THREE.CapsuleGeometry(0.022, 0.05, 4, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: cor,
    roughness: 0.35,
    metalness: 0.3,
    emissive: new THREE.Color(cor).multiplyScalar(0.18),
  });
  descartaveis.push(geo, mat);

  const palma = new THREE.Mesh(geo, mat);
  palma.rotation.x = Math.PI * 0.5;
  grupo.add(palma);

  const geoAro = new THREE.TorusGeometry(0.03, 0.005, 8, 24);
  const matAro = new THREE.MeshStandardMaterial({
    color: cor,
    emissive: new THREE.Color(cor).multiplyScalar(0.9),
    roughness: 0.2,
  });
  descartaveis.push(geoAro, matAro);
  const aro = new THREE.Mesh(geoAro, matAro);
  aro.position.z = -0.03;
  grupo.add(aro);

  return { grupo, descartaveis };
}

/**
 * Arco pontilhado que mostra para onde a esfera vai cair com a velocidade
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
