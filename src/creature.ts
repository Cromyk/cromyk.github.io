import * as THREE from 'three';
import { construirCriatura, type Especie, type PartesCriatura } from './species';
import { criarRng, entre, type Rng } from './rng';

export type EstadoCriatura = 'surgindo' | 'ocioso' | 'atento' | 'fugindo' | 'preso' | 'saindo';

const GRAVIDADE = -9.0;

/**
 * Uma criatura viva no ambiente: anda aos pulinhos perto de onde nasceu, repara
 * em você quando você chega perto, e foge se levar susto demais.
 */
export class Criatura {
  readonly especie: Especie;
  readonly partes: PartesCriatura;
  readonly raiz: THREE.Group;
  readonly ancora: THREE.Vector3;
  readonly pisoY: number;

  estado: EstadoCriatura = 'surgindo';
  /** 0 = tranquila, 1 = surta e foge. */
  alarme = 0;
  viva = true;

  private rng: Rng;
  private tempo: number;
  private velY = 0;
  private noChao = true;
  private destino = new THREE.Vector3();
  private proximoPulo: number;
  private proximaPiscada: number;
  private piscando = 0;
  private cronometroEstado = 0;
  private escalaAlvo = 1;
  private olharPara: THREE.Vector3 | null = null;

  private static readonly RAIO_PASSEIO = 0.9;

  constructor(especie: Especie, ancora: THREE.Vector3, pisoY: number, semente = Math.random() * 1e9) {
    this.especie = especie;
    this.ancora = ancora.clone();
    this.pisoY = pisoY;
    this.rng = criarRng(semente);
    this.tempo = this.rng() * 10;
    this.proximoPulo = entre(this.rng, 1.2, 3.0);
    this.proximaPiscada = entre(this.rng, 2, 5);

    this.partes = construirCriatura(especie, semente);
    this.raiz = this.partes.raiz;
    this.raiz.position.copy(ancora);
    this.raiz.position.y = pisoY;
    this.raiz.rotation.y = this.rng() * Math.PI * 2;
    this.raiz.scale.setScalar(0.001);
    this.destino.copy(this.raiz.position);
  }

  /** Centro do corpo no mundo — calculado direto, sem depender da matriz do frame. */
  get posicaoCorpo(): THREE.Vector3 {
    const p = this.raiz.position;
    return new THREE.Vector3(p.x, p.y + this.especie.altura * 0.5 * this.raiz.scale.y, p.z);
  }

  /** Raio de colisão para o teste de acerto da esfera. */
  get raio(): number {
    return this.especie.altura * 0.55;
  }

  /** Chamado quando uma esfera passa perto sem acertar. */
  assustar(quanto: number) {
    if (this.estado === 'preso' || this.estado === 'saindo') return;
    this.alarme = Math.min(1, this.alarme + quanto);
    // Pulinho de susto.
    if (this.noChao) {
      this.velY = 2.0 + quanto * 1.6;
      this.noChao = false;
    }
    if (this.alarme >= 1) this.fugir();
  }

  fugir() {
    if (this.estado === 'preso' || this.estado === 'saindo') return;
    this.estado = 'fugindo';
    this.cronometroEstado = 0;
    // Escolhe um rumo para longe da âncora e sai correndo.
    const angulo = this.rng() * Math.PI * 2;
    this.destino.set(
      this.ancora.x + Math.cos(angulo) * 4,
      this.pisoY,
      this.ancora.z + Math.sin(angulo) * 4,
    );
  }

  /** A esfera acertou: a criatura é sugada para dentro dela. */
  /** A partir daqui quem manda na escala e na posição é a esfera. */
  serCapturada() {
    this.estado = 'preso';
    this.cronometroEstado = 0;
  }

  /** Escapou da esfera e volta ao ambiente, mais desconfiada. */
  reaparecer(em: THREE.Vector3) {
    this.estado = 'surgindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 1;
    this.alarme = Math.min(0.85, this.alarme + 0.3);
    this.raiz.position.set(em.x, this.pisoY, em.z);
    this.destino.copy(this.raiz.position);
    this.velY = 3.2;
    this.noChao = false;
  }

  /** Remove suavemente (fim da fuga, ou captura concluída). */
  dissolver() {
    this.estado = 'saindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 0;
  }

  atualizar(dt: number, jogador: THREE.Vector3) {
    if (!this.viva) return;
    this.tempo += dt;
    this.cronometroEstado += dt;

    // Distância no plano: a cabeça do jogador está sempre ~1,6 m acima do chão,
    // então medir em 3D faria a criatura achar que ninguém chegou perto.
    const distJogador = Math.hypot(jogador.x - this.raiz.position.x, jogador.z - this.raiz.position.z);

    switch (this.estado) {
      case 'surgindo':
        this.escalaAlvo = 1;
        if (this.cronometroEstado > 0.6) this.estado = 'ocioso';
        break;

      case 'ocioso':
      case 'atento': {
        // Reparar no jogador quando ele chega perto.
        this.estado = distJogador < 2.2 ? 'atento' : 'ocioso';
        this.olharPara = this.estado === 'atento' ? jogador : null;

        // Chegar perto demais deixa a criatura nervosa; longe, ela relaxa.
        if (distJogador < 0.85) this.alarme = Math.min(1, this.alarme + dt * 0.5);
        else this.alarme = Math.max(0, this.alarme - dt * 0.12);
        if (this.alarme >= 1) this.fugir();

        // Pulinhos ocasionais para um ponto novo perto da âncora.
        this.proximoPulo -= dt;
        if (this.proximoPulo <= 0 && this.noChao) {
          this.proximoPulo = entre(this.rng, 1.4, 3.4) * (this.estado === 'atento' ? 0.6 : 1);
          const angulo = this.rng() * Math.PI * 2;
          const raio = entre(this.rng, 0.15, Criatura.RAIO_PASSEIO);
          this.destino.set(
            this.ancora.x + Math.cos(angulo) * raio,
            this.pisoY,
            this.ancora.z + Math.sin(angulo) * raio,
          );
          this.velY = entre(this.rng, 1.5, 2.4);
          this.noChao = false;
        }
        break;
      }

      case 'fugindo':
        this.olharPara = null;
        if (this.noChao) {
          this.velY = 2.6;
          this.noChao = false;
        }
        if (this.cronometroEstado > 1.4) this.dissolver();
        break;

      case 'preso':
        // A animação de sucção fica com a esfera; aqui só encolhe.
        break;

      case 'saindo':
        if (this.raiz.scale.x < 0.02) this.viva = false;
        break;
    }

    this.moverNoChao(dt);
    this.animarCorpo(dt);
  }

  private moverNoChao(dt: number) {
    if (this.estado === 'preso' || this.estado === 'saindo') return;

    // Salto balístico simples: enquanto no ar, avança em direção ao destino.
    if (!this.noChao) {
      this.velY += GRAVIDADE * dt;
      this.raiz.position.y += this.velY * dt;

      const plano = new THREE.Vector3(this.destino.x - this.raiz.position.x, 0, this.destino.z - this.raiz.position.z);
      const dist = plano.length();
      if (dist > 0.001) {
        const vel = this.estado === 'fugindo' ? 2.6 : 1.15;
        plano.normalize().multiplyScalar(Math.min(vel * dt, dist));
        this.raiz.position.add(plano);
      }

      if (this.raiz.position.y <= this.pisoY) {
        this.raiz.position.y = this.pisoY;
        this.velY = 0;
        this.noChao = true;
      }
    }

    // Vira para onde está olhando (jogador) ou para onde está indo.
    const alvo = this.olharPara ?? (this.noChao ? null : this.destino);
    if (alvo) {
      const anguloAlvo = Math.atan2(alvo.x - this.raiz.position.x, alvo.z - this.raiz.position.z);
      let delta = anguloAlvo - this.raiz.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // normaliza para [-π, π]
      this.raiz.rotation.y += delta * Math.min(1, dt * 6);
    }
  }

  private animarCorpo(dt: number) {
    const { corpo, palpebras, cauda, asas, anel } = this.partes;
    const nervosa = this.alarme;

    // Escala geral (surgir / sumir). Durante a captura a esfera é quem encolhe.
    if (this.estado !== 'preso') {
      const escalaAtual = this.raiz.scale.x;
      this.raiz.scale.setScalar(escalaAtual + (this.escalaAlvo - escalaAtual) * Math.min(1, dt * 9));
    }

    // Respiração: mais rápida e ofegante conforme o alarme sobe.
    const ritmo = 2.2 + nervosa * 4;
    const respira = Math.sin(this.tempo * ritmo) * (0.035 + nervosa * 0.03);
    corpo.scale.set(1 - respira * 0.6, 1 + respira, 1 - respira * 0.6);
    corpo.position.y = this.especie.altura * 0.5 + respira * this.especie.altura * 0.25;

    // Squash & stretch no salto: estica subindo, achata na aterrissagem.
    if (!this.noChao) {
      const estica = THREE.MathUtils.clamp(this.velY * 0.06, -0.18, 0.18);
      corpo.scale.y *= 1 + estica;
      corpo.scale.x *= 1 - estica * 0.5;
      corpo.scale.z *= 1 - estica * 0.5;
    }

    // Piscar.
    this.proximaPiscada -= dt;
    if (this.proximaPiscada <= 0 && this.piscando <= 0) {
      this.piscando = 0.16;
      this.proximaPiscada = entre(this.rng, 2.2, 6);
    }
    if (this.piscando > 0) {
      this.piscando -= dt;
      const t = Math.max(0, this.piscando) / 0.16;
      const fecha = Math.sin(t * Math.PI); // 0 → 1 → 0
      for (const p of palpebras) p.scale.y = Math.max(0.01, fecha);
    } else {
      for (const p of palpebras) p.scale.y = Math.max(0.01, p.scale.y * (1 - dt * 10));
    }

    // Cauda balançando, mais agitada quando nervosa.
    if (cauda) {
      const balanco = Math.sin(this.tempo * (3 + nervosa * 5)) * (0.22 + nervosa * 0.3);
      cauda.rotation.y = balanco;
      cauda.rotation.x = Math.cos(this.tempo * 2.4) * 0.12;
    }

    // Asas batendo.
    for (let i = 0; i < asas.length; i++) {
      const lado = i === 0 ? -1 : 1;
      const bate = Math.sin(this.tempo * (11 + nervosa * 9)) * 0.5;
      asas[i].rotation.z = lado * (0.2 + bate);
    }

    if (anel) {
      anel.rotation.z += dt * (0.8 + nervosa * 2);
      anel.rotation.y += dt * 0.4;
    }
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    for (const d of this.partes.descartaveis) d.dispose();
    this.viva = false;
  }
}
