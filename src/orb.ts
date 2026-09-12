import * as THREE from 'three';
import type { Criatura } from './creature';
import { facilidadeCaptura } from './species';
import { audio } from './audio';

export type EstadoOrbe =
  | 'mao'
  | 'voando'
  | 'sugando'
  | 'sacudindo'
  | 'sucesso'
  | 'falha'
  | 'inerte';

const GRAVIDADE = -9.81;
const RESTITUICAO = 0.42;
const RAIO = 0.045;
const SACUDIDAS = 3;

/**
 * A esfera de captura. Casca translúcida, núcleo de energia e aro equatorial —
 * desenho próprio, montado em geometria.
 */
export class Orbe {
  readonly raiz = new THREE.Group();
  estado: EstadoOrbe = 'mao';
  readonly velocidade = new THREE.Vector3();

  presa: Criatura | null = null;
  /** Preenchido quando a captura termina — o loop principal lê e reage. */
  resultado: 'capturou' | 'escapou' | null = null;

  private casca: THREE.Mesh;
  private nucleo: THREE.Mesh;
  private aro: THREE.Mesh;
  private luz: THREE.PointLight;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private cronometro = 0;
  private sacudidaAtual = 0;
  private sacudidasRestantes = SACUDIDAS;
  private chancePorSacudida = 0.6;
  /** Garante que o desfecho seja anunciado uma única vez. */
  private resolvido = false;
  private tempoInerte = 0;
  private anguloSacudida = 0;
  private pisoY: number;

  constructor(corAcento: number, pisoY: number) {
    this.pisoY = pisoY;

    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    const geoCasca = guardar(new THREE.IcosahedronGeometry(RAIO, 2));
    // Transparência simples em vez de `transmission`: refração de verdade custa
    // um passe de render inteiro, e o Quest já desenha a cena duas vezes por frame.
    const matCasca = guardar(
      new THREE.MeshStandardMaterial({
        color: 0xdfe8f5,
        transparent: true,
        opacity: 0.34,
        roughness: 0.12,
        metalness: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.casca = new THREE.Mesh(geoCasca, matCasca);
    this.raiz.add(this.casca);

    const geoNucleo = guardar(new THREE.IcosahedronGeometry(RAIO * 0.46, 2));
    const matNucleo = guardar(
      new THREE.MeshStandardMaterial({
        color: corAcento,
        emissive: new THREE.Color(corAcento),
        emissiveIntensity: 1.4,
        roughness: 0.25,
      }),
    );
    this.nucleo = new THREE.Mesh(geoNucleo, matNucleo);
    this.raiz.add(this.nucleo);

    const geoAro = guardar(new THREE.TorusGeometry(RAIO * 1.02, RAIO * 0.08, 10, 36));
    const matAro = guardar(
      new THREE.MeshStandardMaterial({ color: 0x8ea2bd, roughness: 0.24, metalness: 0.9 }),
    );
    this.aro = new THREE.Mesh(geoAro, matAro);
    this.aro.rotation.x = Math.PI * 0.5;
    this.raiz.add(this.aro);

    this.luz = new THREE.PointLight(corAcento, 0.7, 0.9, 2);
    this.raiz.add(this.luz);
  }

  get posicao() {
    return this.raiz.position;
  }

  get raio() {
    return RAIO;
  }

  /** Arremessada: a partir daqui a física toma conta. */
  lancar(velocidade: THREE.Vector3) {
    this.estado = 'voando';
    this.velocidade.copy(velocidade);
    this.cronometro = 0;
    audio.arremesso(velocidade.length() * 0.2);
  }

  /**
   * Acertou uma criatura: ela é sugada para dentro.
   * `precisao` vai de 0 (raspou na borda) a 1 (bem no meio) e vira bônus —
   * é o que faz valer a pena mirar em vez de só jogar na direção geral.
   */
  capturar(criatura: Criatura, precisao = 0.5) {
    this.presa = criatura;
    this.estado = 'sugando';
    this.cronometro = 0;
    this.velocidade.multiplyScalar(0.1);
    criatura.serCapturada();
    audio.acerto();
    audio.succao();

    // Criaturas nervosas escapam mais; acerto no centro compensa.
    const base = facilidadeCaptura(criatura.especie);
    const bonus = 1 + precisao * 0.16;
    this.sacudidasRestantes = SACUDIDAS;
    this.chancePorSacudida = THREE.MathUtils.clamp(
      base * bonus * (1 - criatura.alarme * 0.28),
      0.12,
      0.95,
    );
  }

  atualizar(dt: number) {
    this.cronometro += dt;
    this.nucleo.rotation.y += dt * 2.2;
    this.nucleo.rotation.x += dt * 1.1;

    switch (this.estado) {
      case 'mao':
        // Posição controlada pela mão; só pulsa de leve.
        this.nucleo.scale.setScalar(1 + Math.sin(this.cronometro * 6) * 0.07);
        break;

      case 'voando':
        this.integrar(dt);
        this.raiz.rotation.x += this.velocidade.z * dt * 2.5;
        this.raiz.rotation.z -= this.velocidade.x * dt * 2.5;
        // Uma esfera que errou tudo vira sucata no chão.
        if (this.cronometro > 6) this.estado = 'inerte';
        break;

      case 'sugando': {
        this.integrar(dt);
        const t = Math.min(1, this.cronometro / 0.55);
        if (this.presa) {
          // Puxa a criatura para dentro da esfera enquanto ela encolhe.
          this.presa.raiz.position.lerp(this.raiz.position, Math.min(1, dt * 9));
          this.presa.raiz.scale.setScalar(Math.max(0.001, (1 - t) * 0.9));
          this.presa.raiz.rotation.y += dt * 10 * t;
        }
        this.luz.intensity = 0.7 + t * 2.2;
        if (t >= 1) {
          if (this.presa) this.presa.raiz.visible = false;
          this.estado = 'sacudindo';
          this.cronometro = 0;
          this.sacudidaAtual = 0;
        }
        break;
      }

      case 'sacudindo': {
        this.integrar(dt);
        this.luz.intensity = 1.2 + Math.sin(this.cronometro * 10) * 0.4;

        // Uma sacudida a cada 0.85s; entre elas, suspense.
        const indice = Math.floor(this.cronometro / 0.85);
        if (indice > this.sacudidaAtual && indice <= SACUDIDAS) {
          this.sacudidaAtual = indice;
          this.sacudidasRestantes--;
          audio.sacudida(indice - 1);
          this.anguloSacudida = 1;

          if (Math.random() > this.chancePorSacudida) {
            this.estado = 'falha';
            this.cronometro = 0;
            audio.escapou();
            break;
          }
          if (this.sacudidasRestantes <= 0) {
            this.estado = 'sucesso';
            this.cronometro = 0;
            this.resultado = 'capturou';
            this.resolvido = true;
            audio.sucesso();
            break;
          }
        }

        // O corpo da esfera treme logo depois de cada clique.
        if (this.anguloSacudida > 0) {
          this.anguloSacudida = Math.max(0, this.anguloSacudida - dt * 3.2);
          const t = this.anguloSacudida;
          this.raiz.rotation.z = Math.sin(this.cronometro * 34) * 0.5 * t;
          this.raiz.rotation.x = Math.cos(this.cronometro * 27) * 0.3 * t;
        }
        break;
      }

      case 'falha': {
        // Abre, devolve a criatura e apaga.
        const t = Math.min(1, this.cronometro / 0.4);
        this.luz.intensity = (1 - t) * 2.5;
        this.casca.scale.setScalar(1 + t * 0.6);
        (this.casca.material as THREE.MeshStandardMaterial).opacity = 0.34 * (1 - t);
        this.nucleo.scale.setScalar(Math.max(0.001, 1 - t));
        if (t >= 1 && !this.resolvido) {
          this.resolvido = true;
          this.resultado = 'escapou';
        }
        break;
      }

      case 'sucesso': {
        const t = Math.min(1, this.cronometro / 0.9);
        this.raiz.position.y += dt * 0.25 * (1 - t); // flutua um pouco
        this.luz.intensity = 1.4 + Math.sin(this.cronometro * 14) * 0.8 * (1 - t);
        this.raiz.rotation.y += dt * 3 * (1 - t);
        break;
      }

      case 'inerte':
        this.integrar(dt);
        this.tempoInerte += dt;
        this.luz.intensity = Math.max(0, 0.7 - this.tempoInerte * 0.2);
        break;
    }
  }

  /** Integração + quique no piso. Simples, mas o suficiente para a sensação. */
  private integrar(dt: number) {
    this.velocidade.y += GRAVIDADE * dt;
    this.raiz.position.addScaledVector(this.velocidade, dt);

    if (this.raiz.position.y - RAIO <= this.pisoY) {
      this.raiz.position.y = this.pisoY + RAIO;
      if (Math.abs(this.velocidade.y) > 0.35) {
        this.velocidade.y *= -RESTITUICAO;
        this.velocidade.x *= 0.78;
        this.velocidade.z *= 0.78;
        audio.quique();
      } else {
        this.velocidade.set(0, 0, 0);
        // Assim que pousa, para de rodar.
        this.raiz.rotation.x *= 0.9;
        this.raiz.rotation.z *= 0.9;
      }
    }
  }

  /** Pronta para ser removida da cena. */
  get acabou(): boolean {
    if (this.estado === 'falha') return this.cronometro > 0.6;
    if (this.estado === 'sucesso') return this.cronometro > 1.6;
    if (this.estado === 'inerte') return this.tempoInerte > 4;
    return false;
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    for (const d of this.descartaveis) d.dispose();
  }
}
