import * as THREE from 'three';
import type { Pokemon } from './creature';
import { chanceCaptura } from './species';
import { audio } from './audio';

export type EstadoBola =
  | 'mao'
  | 'voando'
  | 'sugando'
  | 'sacudindo'
  | 'sucesso'
  | 'falha'
  | 'soltando'
  | 'inerte';

const GRAVIDADE = -9.81;
const RESTITUICAO = 0.42;
const RAIO = 0.045;
const SACUDIDAS = 3;

/**
 * A pokébola: duas meias-esferas, faixa preta e botão. Montada em geometria,
 * como todo o resto do jogo.
 *
 * Serve para duas coisas: capturar um selvagem (arremessada) e soltar um
 * Pokémon da sua coleção (modo `soltando`).
 */
export class Pokebola {
  readonly raiz = new THREE.Group();
  estado: EstadoBola = 'mao';
  readonly velocidade = new THREE.Vector3();

  presa: Pokemon | null = null;
  resultado: 'capturou' | 'escapou' | 'soltou' | null = null;

  private corpo = new THREE.Group();
  private botao: THREE.Mesh;
  private matBotao: THREE.MeshStandardMaterial;
  private luz: THREE.PointLight;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private cronometro = 0;
  private sacudidaAtual = 0;
  private sacudidasRestantes = SACUDIDAS;
  private chancePorSacudida = 0.6;
  private resolvido = false;
  private tempoInerte = 0;
  private forcaSacudida = 0;
  private pisoY: number;

  constructor(pisoY: number, corAcento = 0xff3b30) {
    this.pisoY = pisoY;

    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    const matTopo = guardar(
      new THREE.MeshStandardMaterial({ color: corAcento, roughness: 0.25, metalness: 0.15 }),
    );
    const matBase = guardar(
      new THREE.MeshStandardMaterial({ color: 0xf2f2f5, roughness: 0.28, metalness: 0.1 }),
    );
    const matFaixa = guardar(
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.2 }),
    );
    this.matBotao = guardar(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.35,
        roughness: 0.2,
      }),
    ) as THREE.MeshStandardMaterial;

    // Hemisfério de cima e de baixo.
    const topo = new THREE.Mesh(
      guardar(new THREE.SphereGeometry(RAIO, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      matTopo,
    );
    const base = new THREE.Mesh(
      guardar(new THREE.SphereGeometry(RAIO, 28, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)),
      matBase,
    );
    topo.castShadow = true;
    base.castShadow = true;
    this.corpo.add(topo, base);

    // Faixa equatorial.
    const faixa = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(RAIO * 1.008, RAIO * 1.008, RAIO * 0.17, 28)),
      matFaixa,
    );
    this.corpo.add(faixa);

    // Botão: um anel escuro com o miolo claro, nos dois lados.
    for (const frente of [1, -1]) {
      const anel = new THREE.Mesh(
        guardar(new THREE.CylinderGeometry(RAIO * 0.3, RAIO * 0.3, RAIO * 0.1, 20)),
        matFaixa,
      );
      anel.rotation.x = Math.PI * 0.5;
      anel.position.z = frente * RAIO * 0.94;
      this.corpo.add(anel);
    }
    this.botao = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(RAIO * 0.19, RAIO * 0.19, RAIO * 0.14, 18)),
      this.matBotao,
    );
    this.botao.rotation.x = Math.PI * 0.5;
    this.botao.position.z = RAIO * 0.97;
    this.corpo.add(this.botao);

    this.raiz.add(this.corpo);

    this.luz = new THREE.PointLight(0xffffff, 0.25, 0.7, 2);
    this.raiz.add(this.luz);
  }

  get posicao() {
    return this.raiz.position;
  }

  get raio() {
    return RAIO;
  }

  lancar(velocidade: THREE.Vector3) {
    this.estado = 'voando';
    this.velocidade.copy(velocidade);
    this.cronometro = 0;
    audio.arremesso(velocidade.length() * 0.2);
  }

  /** Acertou um selvagem: ele é sugado para dentro. */
  capturar(pokemon: Pokemon, precisao = 0.5) {
    this.presa = pokemon;
    this.estado = 'sugando';
    this.cronometro = 0;
    this.velocidade.multiplyScalar(0.1);
    pokemon.serCapturado();
    audio.acerto();
    audio.succao();

    const base = chanceCaptura(pokemon.especie, pokemon.hpFracao, pokemon.alarme);
    this.chancePorSacudida = THREE.MathUtils.clamp(base * (1 + precisao * 0.14), 0.14, 0.95);
    this.sacudidasRestantes = SACUDIDAS;
  }

  /** Arremessada para soltar um Pokémon da coleção, não para capturar. */
  soltar(pokemon: Pokemon) {
    this.presa = pokemon;
    this.estado = 'soltando';
    this.cronometro = 0;
    audio.succao();
  }

  atualizar(dt: number) {
    this.cronometro += dt;

    switch (this.estado) {
      case 'mao':
        this.matBotao.emissiveIntensity = 0.35 + Math.sin(this.cronometro * 6) * 0.15;
        break;

      case 'voando':
        this.integrar(dt);
        // Gira no eixo do movimento — o arremesso fica muito mais legível.
        this.raiz.rotation.x += this.velocidade.z * dt * 3;
        this.raiz.rotation.z -= this.velocidade.x * dt * 3;
        if (this.cronometro > 6) this.estado = 'inerte';
        break;

      case 'soltando': {
        this.integrar(dt);
        // Abre, solta um clarão e o Pokémon cresce de dentro dela.
        const t = Math.min(1, this.cronometro / 0.5);
        this.luz.intensity = Math.sin(t * Math.PI) * 3.2;
        this.matBotao.emissiveIntensity = 0.35 + Math.sin(t * Math.PI) * 3;
        if (this.presa) {
          this.presa.raiz.visible = true;
          const escala = THREE.MathUtils.smoothstep(t, 0.15, 1);
          this.presa.raiz.scale.setScalar(Math.max(0.001, escala));
        }
        if (t >= 1 && !this.resolvido) {
          this.resolvido = true;
          this.resultado = 'soltou';
        }
        break;
      }

      case 'sugando': {
        this.integrar(dt);
        const t = Math.min(1, this.cronometro / 0.55);
        if (this.presa) {
          this.presa.raiz.position.lerp(this.raiz.position, Math.min(1, dt * 9));
          this.presa.raiz.scale.setScalar(Math.max(0.001, (1 - t) * 0.9));
          this.presa.raiz.rotation.y += dt * 10 * t;
        }
        this.luz.intensity = 0.25 + t * 2.4;
        this.matBotao.emissiveIntensity = 0.35 + t * 3;
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
        // O botão pisca em vermelho enquanto decide.
        this.matBotao.emissiveIntensity = 1 + Math.sin(this.cronometro * 9) * 0.7;
        this.matBotao.emissive.setHex(0xff4433);

        const indice = Math.floor(this.cronometro / 0.85);
        if (indice > this.sacudidaAtual && indice <= SACUDIDAS) {
          this.sacudidaAtual = indice;
          this.sacudidasRestantes--;
          audio.sacudida(indice - 1);
          this.forcaSacudida = 1;

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

        if (this.forcaSacudida > 0) {
          this.forcaSacudida = Math.max(0, this.forcaSacudida - dt * 3.2);
          const t = this.forcaSacudida;
          this.raiz.rotation.z = Math.sin(this.cronometro * 34) * 0.5 * t;
          this.raiz.rotation.x = Math.cos(this.cronometro * 27) * 0.3 * t;
        }
        break;
      }

      case 'falha': {
        const t = Math.min(1, this.cronometro / 0.4);
        this.luz.intensity = (1 - t) * 2.5;
        this.corpo.scale.setScalar(1 + t * 0.5);
        if (t >= 1 && !this.resolvido) {
          this.resolvido = true;
          this.resultado = 'escapou';
        }
        break;
      }

      case 'sucesso': {
        const t = Math.min(1, this.cronometro / 0.9);
        this.raiz.position.y += dt * 0.2 * (1 - t);
        this.matBotao.emissive.setHex(0x7fffa0);
        this.matBotao.emissiveIntensity = 1.6 + Math.sin(this.cronometro * 14) * 0.9 * (1 - t);
        this.raiz.rotation.y += dt * 3 * (1 - t);
        break;
      }

      case 'inerte':
        this.integrar(dt);
        this.tempoInerte += dt;
        this.luz.intensity = Math.max(0, 0.25 - this.tempoInerte * 0.1);
        break;
    }
  }

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
        this.raiz.rotation.x *= 0.9;
        this.raiz.rotation.z *= 0.9;
      }
    }
  }

  get acabou(): boolean {
    if (this.estado === 'falha') return this.cronometro > 0.6;
    if (this.estado === 'sucesso') return this.cronometro > 1.6;
    if (this.estado === 'soltando') return this.cronometro > 0.9;
    if (this.estado === 'inerte') return this.tempoInerte > 4;
    return false;
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    for (const d of this.descartaveis) d.dispose();
  }
}
