import * as THREE from 'three';
import type { Golpe } from './species';
import { TIPOS } from './species';

/**
 * Efeitos dos golpes. São partículas e geometria simples de propósito: em MR o
 * headset já desenha a cena duas vezes por quadro, e um sistema de partículas
 * pesado derruba o frame rate bem rápido.
 */

const GRAVIDADE_PARTICULA = -2.2;

interface Particula {
  posicao: THREE.Vector3;
  velocidade: THREE.Vector3;
  vida: number;
  vidaMax: number;
  tamanho: number;
}

export class Efeito {
  readonly pontos: THREE.Points;
  /** Só existe no raio elétrico. */
  readonly linha?: THREE.Line;
  readonly luz: THREE.PointLight;

  private particulas: Particula[] = [];
  private geometria: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private geoLinha?: THREE.BufferGeometry;
  private matLinha?: THREE.LineBasicMaterial;
  private tempo = 0;
  private readonly duracao: number;
  private origem: THREE.Vector3;
  private destino: THREE.Vector3;
  private golpe: Golpe;
  private emitindo = true;

  private static readonly MAX = 140;

  constructor(golpe: Golpe, origem: THREE.Vector3, destino: THREE.Vector3) {
    this.golpe = golpe;
    this.origem = origem.clone();
    this.destino = destino.clone();
    this.duracao = golpe.formato === 'raio' ? 0.55 : 0.85;

    const cor = new THREE.Color(TIPOS[golpe.tipo].cor);

    this.geometria = new THREE.BufferGeometry();
    this.geometria.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(Efeito.MAX * 3), 3),
    );
    this.geometria.setAttribute('size', new THREE.BufferAttribute(new Float32Array(Efeito.MAX), 1));
    this.geometria.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      color: cor,
      size: 0.03,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.pontos = new THREE.Points(this.geometria, this.material);
    this.pontos.frustumCulled = false;

    this.luz = new THREE.PointLight(cor, 1.4, 1.6, 2);
    this.luz.position.copy(origem);

    if (golpe.formato === 'raio') {
      // O raio é uma polilinha quebrada que se redesenha a cada quadro.
      this.geoLinha = new THREE.BufferGeometry();
      this.geoLinha.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(14 * 3), 3),
      );
      this.matLinha = new THREE.LineBasicMaterial({
        color: cor,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.linha = new THREE.Line(this.geoLinha, this.matLinha);
      this.linha.frustumCulled = false;
    }
  }

  get terminou(): boolean {
    return this.tempo > this.duracao && this.particulas.length === 0;
  }

  /** Quando o golpe chega no alvo — usado para sincronizar o dano. */
  get momentoImpacto(): number {
    return this.golpe.formato === 'raio' ? 0.08 : 0.26;
  }

  private nascer(quantidade: number) {
    const direcao = this.destino.clone().sub(this.origem);
    const distancia = direcao.length();
    direcao.normalize();

    for (let i = 0; i < quantidade && this.particulas.length < Efeito.MAX; i++) {
      const espalhar = this.golpe.formato === 'jato' ? 0.16 : 0.3;
      const velocidade = direcao
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() * 2 - 1) * espalhar,
            (Math.random() * 2 - 1) * espalhar,
            (Math.random() * 2 - 1) * espalhar,
          ),
        )
        .normalize()
        .multiplyScalar(distancia / (this.golpe.formato === 'jato' ? 0.34 : 0.3));

      this.particulas.push({
        posicao: this.origem.clone(),
        velocidade,
        vida: 0.34 + Math.random() * 0.2,
        vidaMax: 0.5,
        tamanho: 0.6 + Math.random() * 0.8,
      });
    }
  }

  atualizar(dt: number) {
    this.tempo += dt;

    if (this.emitindo) {
      if (this.golpe.formato === 'raio') {
        this.atualizarRaio();
        if (this.tempo > 0.28) this.emitindo = false;
      } else if (this.tempo < 0.42) {
        this.nascer(this.golpe.formato === 'jato' ? 5 : 3);
      } else {
        this.emitindo = false;
      }
    } else if (this.linha && this.matLinha) {
      this.matLinha.opacity = Math.max(0, this.matLinha.opacity - dt * 5);
    }

    // Move e envelhece as partículas.
    const pos = this.geometria.attributes.position as THREE.BufferAttribute;
    const tam = this.geometria.attributes.size as THREE.BufferAttribute;
    let vivas = 0;

    for (let i = this.particulas.length - 1; i >= 0; i--) {
      const p = this.particulas[i];
      p.vida -= dt;
      if (p.vida <= 0) {
        this.particulas.splice(i, 1);
        continue;
      }
      // Fogo sobe, água e folhas caem.
      p.velocidade.y += (this.golpe.tipo === 'fogo' ? 1.4 : GRAVIDADE_PARTICULA) * dt;
      p.velocidade.multiplyScalar(1 - dt * 1.6);
      p.posicao.addScaledVector(p.velocidade, dt);

      if (vivas < Efeito.MAX) {
        pos.setXYZ(vivas, p.posicao.x, p.posicao.y, p.posicao.z);
        tam.setX(vivas, p.tamanho * (p.vida / p.vidaMax));
        vivas++;
      }
    }

    this.geometria.setDrawRange(0, vivas);
    pos.needsUpdate = true;
    tam.needsUpdate = true;

    const restante = Math.max(0, 1 - this.tempo / this.duracao);
    this.material.opacity = 0.95 * restante;
    this.material.size = 0.03 * (0.6 + restante * 0.4);
    this.luz.intensity = 1.4 * restante;
    this.luz.position.lerpVectors(this.origem, this.destino, Math.min(1, this.tempo * 3));
  }

  /** Redesenha o zigue-zague do raio com um deslocamento aleatório por quadro. */
  private atualizarRaio() {
    if (!this.geoLinha) return;
    const pos = this.geoLinha.attributes.position as THREE.BufferAttribute;
    const total = pos.count;
    const perpendicular = new THREE.Vector3()
      .subVectors(this.destino, this.origem)
      .cross(new THREE.Vector3(0, 1, 0))
      .normalize();
    const cima = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < total; i++) {
      const t = i / (total - 1);
      const ponto = new THREE.Vector3().lerpVectors(this.origem, this.destino, t);
      // Sem desvio nas pontas, para o raio nascer e terminar cravado.
      const forca = Math.sin(t * Math.PI) * 0.07;
      ponto.addScaledVector(perpendicular, (Math.random() * 2 - 1) * forca);
      ponto.addScaledVector(cima, (Math.random() * 2 - 1) * forca);
      pos.setXYZ(i, ponto.x, ponto.y, ponto.z);
    }
    pos.needsUpdate = true;
  }

  adicionarA(cena: THREE.Object3D) {
    cena.add(this.pontos, this.luz);
    if (this.linha) cena.add(this.linha);
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.pontos, this.luz);
    if (this.linha) cena.remove(this.linha);
    this.geometria.dispose();
    this.material.dispose();
    this.geoLinha?.dispose();
    this.matLinha?.dispose();
  }
}

/** Estrelinhas de impacto, quando o golpe acerta. */
export class Impacto {
  readonly pontos: THREE.Points;
  private geometria: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private velocidades: THREE.Vector3[] = [];
  private posicoes: THREE.Vector3[] = [];
  private tempo = 0;
  private static readonly N = 26;

  constructor(posicao: THREE.Vector3, cor: number) {
    this.geometria = new THREE.BufferGeometry();
    this.geometria.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(Impacto.N * 3), 3),
    );

    for (let i = 0; i < Impacto.N; i++) {
      this.posicoes.push(posicao.clone());
      // Direções distribuídas numa esfera.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      this.velocidades.push(
        new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi),
        ).multiplyScalar(0.6 + Math.random() * 1.3),
      );
    }

    this.material = new THREE.PointsMaterial({
      color: cor,
      size: 0.028,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pontos = new THREE.Points(this.geometria, this.material);
    this.pontos.frustumCulled = false;
  }

  get terminou() {
    return this.tempo > 0.5;
  }

  atualizar(dt: number) {
    this.tempo += dt;
    const pos = this.geometria.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < Impacto.N; i++) {
      this.velocidades[i].y += GRAVIDADE_PARTICULA * dt;
      this.velocidades[i].multiplyScalar(1 - dt * 3);
      this.posicoes[i].addScaledVector(this.velocidades[i], dt);
      pos.setXYZ(i, this.posicoes[i].x, this.posicoes[i].y, this.posicoes[i].z);
    }
    pos.needsUpdate = true;
    this.material.opacity = Math.max(0, 1 - this.tempo / 0.5);
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.pontos);
    this.geometria.dispose();
    this.material.dispose();
  }
}
