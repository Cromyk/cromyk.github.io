import * as THREE from 'three';
import { construirCriatura, type Especie, type PartesCriatura } from './species';
import { criarRng, entre, type Rng } from './rng';

export type Papel = 'selvagem' | 'companheiro';

export type Estado =
  | 'surgindo'
  | 'ocioso'
  | 'atento'
  | 'atacando'
  | 'ferido'
  | 'desmaiado'
  | 'fugindo'
  | 'preso'
  | 'saindo';

const GRAVIDADE = -9.0;

/**
 * Um Pokémon vivo no seu quarto. O mesmo corpo serve para o selvagem — que
 * passeia, repara em você e foge se levar susto — e para o companheiro, que
 * anda ao seu lado e ataca quando você manda.
 */
export class Pokemon {
  readonly especie: Especie;
  readonly partes: PartesCriatura;
  readonly raiz: THREE.Group;
  readonly papel: Papel;

  ancora: THREE.Vector3;
  pisoY: number;

  estado: Estado = 'surgindo';
  hp: number;
  /** 0 = tranquilo, 1 = surta e foge. Só vale para o selvagem. */
  alarme = 0;
  viva = true;
  /** Para quem ele está virado enquanto luta. */
  alvo: Pokemon | null = null;

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
  private recarga = 0;
  private tremor = 0;
  private brilhoAtaque = 0;
  private intensidadeBase: number[] = [];

  private static readonly RAIO_PASSEIO = 0.85;

  constructor(
    especie: Especie,
    ancora: THREE.Vector3,
    pisoY: number,
    papel: Papel = 'selvagem',
    semente = Math.random() * 1e9,
  ) {
    this.especie = especie;
    this.papel = papel;
    this.ancora = ancora.clone();
    this.pisoY = pisoY;
    this.hp = especie.hpMax;
    this.rng = criarRng(semente);
    this.tempo = this.rng() * 10;
    this.proximoPulo = entre(this.rng, 1.2, 3.0);
    this.proximaPiscada = entre(this.rng, 2, 5);

    this.partes = construirCriatura(especie);
    this.raiz = this.partes.raiz;
    this.raiz.position.copy(ancora);
    this.raiz.position.y = pisoY;
    this.raiz.rotation.y = this.rng() * Math.PI * 2;
    this.raiz.scale.setScalar(0.001);
    this.destino.copy(this.raiz.position);

    // Guarda o brilho original para poder pulsar durante o ataque.
    for (const mat of this.partes.emissivos) {
      this.intensidadeBase.push((mat as THREE.MeshStandardMaterial).emissiveIntensity ?? 1);
    }
  }

  get hpFracao(): number {
    return THREE.MathUtils.clamp(this.hp / this.especie.hpMax, 0, 1);
  }

  /** Segundos desde a última troca de estado. */
  get tempoNoEstado(): number {
    return this.cronometroEstado;
  }

  get desmaiado(): boolean {
    return this.hp <= 0;
  }

  /** Centro do corpo no mundo — alvo dos golpes e da pokébola. */
  get centro(): THREE.Vector3 {
    const p = this.raiz.position;
    return new THREE.Vector3(p.x, p.y + this.especie.altura * 0.5 * this.raiz.scale.y, p.z);
  }

  /** De onde sai o golpe. */
  get boca(): THREE.Vector3 {
    this.raiz.updateMatrixWorld();
    return this.partes.boca.getWorldPosition(new THREE.Vector3());
  }

  get raio(): number {
    return this.especie.altura * 0.55;
  }

  get podeAtacar(): boolean {
    return (
      this.recarga <= 0 &&
      !this.desmaiado &&
      this.estado !== 'preso' &&
      this.estado !== 'saindo' &&
      this.estado !== 'surgindo'
    );
  }

  /** Dispara a animação de ataque. O dano em si é resolvido pela batalha. */
  atacar(alvo: Pokemon) {
    if (!this.podeAtacar) return false;
    this.alvo = alvo;
    this.estado = 'atacando';
    this.cronometroEstado = 0;
    this.recarga = this.especie.golpe.recarga;
    this.brilhoAtaque = 1;
    // Pequeno salto para trás, como um recuo do disparo.
    if (this.noChao) {
      this.velY = 1.1;
      this.noChao = false;
    }
    return true;
  }

  receberDano(quantidade: number) {
    if (this.desmaiado) return;
    this.hp = Math.max(0, this.hp - quantidade);
    this.tremor = 1;
    if (this.hp <= 0) {
      this.estado = 'desmaiado';
      this.cronometroEstado = 0;
    } else {
      this.estado = 'ferido';
      this.cronometroEstado = 0;
      if (this.papel === 'selvagem') this.alarme = Math.min(1, this.alarme + 0.18);
    }
  }

  curar(quantidade: number) {
    this.hp = Math.min(this.especie.hpMax, this.hp + quantidade);
    if (this.hp > 0 && this.estado === 'desmaiado') this.estado = 'ocioso';
  }

  assustar(quanto: number) {
    if (this.papel !== 'selvagem') return;
    if (this.estado === 'preso' || this.estado === 'saindo') return;
    this.alarme = Math.min(1, this.alarme + quanto);
    if (this.noChao) {
      this.velY = 2.0 + quanto * 1.6;
      this.noChao = false;
    }
    if (this.alarme >= 1) this.fugir();
  }

  fugir() {
    if (this.estado === 'preso' || this.estado === 'saindo' || this.papel !== 'selvagem') return;
    this.estado = 'fugindo';
    this.cronometroEstado = 0;
    const angulo = this.rng() * Math.PI * 2;
    this.destino.set(
      this.ancora.x + Math.cos(angulo) * 4,
      this.pisoY,
      this.ancora.z + Math.sin(angulo) * 4,
    );
  }

  /** A partir daqui quem manda na escala e na posição é a pokébola. */
  serCapturado() {
    this.estado = 'preso';
    this.cronometroEstado = 0;
  }

  reaparecer(em: THREE.Vector3) {
    this.estado = 'surgindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 1;
    this.alarme = Math.min(0.85, this.alarme + 0.25);
    this.raiz.visible = true;
    this.raiz.position.set(em.x, this.pisoY, em.z);
    this.destino.copy(this.raiz.position);
    this.velY = 3.2;
    this.noChao = false;
  }

  dissolver() {
    this.estado = 'saindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 0;
  }

  /** Faz o companheiro nascer de novo ao ser solto da pokébola. */
  invocar(em: THREE.Vector3, pisoY: number) {
    this.pisoY = pisoY;
    this.ancora.copy(em);
    this.raiz.visible = true;
    this.raiz.position.set(em.x, pisoY, em.z);
    this.raiz.scale.setScalar(0.001);
    this.destino.copy(this.raiz.position);
    this.estado = 'surgindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 1;
  }

  atualizar(dt: number, jogador: THREE.Vector3) {
    if (!this.viva) return;
    this.tempo += dt;
    this.cronometroEstado += dt;
    if (this.recarga > 0) this.recarga -= dt;
    if (this.tremor > 0) this.tremor = Math.max(0, this.tremor - dt * 3.5);
    if (this.brilhoAtaque > 0) this.brilhoAtaque = Math.max(0, this.brilhoAtaque - dt * 1.8);

    // Distância no plano: a cabeça do jogador fica ~1,6 m acima do chão, então
    // medir em 3D faria o Pokémon achar que ninguém chegou perto.
    const distJogador = Math.hypot(jogador.x - this.raiz.position.x, jogador.z - this.raiz.position.z);

    switch (this.estado) {
      case 'surgindo':
        this.escalaAlvo = 1;
        if (this.cronometroEstado > 0.55) this.estado = 'ocioso';
        break;

      case 'atacando':
        this.olharPara = this.alvo ? this.alvo.centro : null;
        if (this.cronometroEstado > 0.7) this.estado = 'ocioso';
        break;

      case 'ferido':
        if (this.cronometroEstado > 0.45) this.estado = 'ocioso';
        break;

      case 'desmaiado':
        this.olharPara = null;
        // Tomba de lado e fica.
        this.raiz.rotation.z = THREE.MathUtils.lerp(this.raiz.rotation.z, 1.35, Math.min(1, dt * 5));
        return;

      case 'ocioso':
      case 'atento':
        this.comportamentoLivre(dt, jogador, distJogador);
        break;

      case 'fugindo':
        this.olharPara = null;
        if (this.noChao) {
          this.velY = 2.6;
          this.noChao = false;
        }
        if (this.cronometroEstado > 1.4) this.dissolver();
        break;

      case 'preso':
        break;

      case 'saindo':
        if (this.raiz.scale.x < 0.02) this.viva = false;
        break;
    }

    this.mover(dt);
    this.animar(dt);
  }

  /** Passeio do selvagem, ou acompanhar o treinador no caso do companheiro. */
  private comportamentoLivre(dt: number, jogador: THREE.Vector3, distJogador: number) {
    if (this.papel === 'companheiro') {
      // Fica ao lado do jogador, sem colar nele.
      const paraJogador = new THREE.Vector3(
        jogador.x - this.raiz.position.x,
        0,
        jogador.z - this.raiz.position.z,
      );
      const dist = paraJogador.length();
      if (dist > 1.1) {
        // Anda até um ponto um pouco à frente e ao lado do treinador.
        const lado = new THREE.Vector3(-paraJogador.z, 0, paraJogador.x).normalize();
        this.destino
          .copy(jogador)
          .addScaledVector(paraJogador.normalize(), -0.75)
          .addScaledVector(lado, 0.45);
        this.destino.y = this.pisoY;
        if (this.noChao) {
          this.velY = 1.9;
          this.noChao = false;
        }
      }
      this.olharPara = this.alvo && !this.alvo.desmaiado ? this.alvo.centro : jogador;
      return;
    }

    // --- selvagem ---
    this.estado = distJogador < 2.2 ? 'atento' : 'ocioso';
    this.olharPara =
      this.alvo && !this.alvo.desmaiado
        ? this.alvo.centro
        : this.estado === 'atento'
          ? jogador
          : null;

    if (distJogador < 0.85) this.alarme = Math.min(1, this.alarme + dt * 0.45);
    else this.alarme = Math.max(0, this.alarme - dt * 0.12);
    if (this.alarme >= 1) {
      this.fugir();
      return;
    }

    this.proximoPulo -= dt;
    if (this.proximoPulo <= 0 && this.noChao) {
      this.proximoPulo = entre(this.rng, 1.4, 3.4) * (this.estado === 'atento' ? 0.6 : 1);
      const angulo = this.rng() * Math.PI * 2;
      const raio = entre(this.rng, 0.15, Pokemon.RAIO_PASSEIO);
      this.destino.set(
        this.ancora.x + Math.cos(angulo) * raio,
        this.pisoY,
        this.ancora.z + Math.sin(angulo) * raio,
      );
      this.velY = entre(this.rng, 1.5, 2.4);
      this.noChao = false;
    }
  }

  private mover(dt: number) {
    if (this.estado === 'preso' || this.estado === 'saindo') return;

    if (!this.noChao) {
      this.velY += GRAVIDADE * dt;
      this.raiz.position.y += this.velY * dt;

      const plano = new THREE.Vector3(
        this.destino.x - this.raiz.position.x,
        0,
        this.destino.z - this.raiz.position.z,
      );
      const dist = plano.length();
      if (dist > 0.001) {
        const vel = this.estado === 'fugindo' ? 2.6 : this.papel === 'companheiro' ? 1.9 : 1.15;
        plano.normalize().multiplyScalar(Math.min(vel * dt, dist));
        this.raiz.position.add(plano);
      }

      if (this.raiz.position.y <= this.pisoY) {
        this.raiz.position.y = this.pisoY;
        this.velY = 0;
        this.noChao = true;
      }
    }

    const alvo = this.olharPara ?? (this.noChao ? null : this.destino);
    if (alvo) {
      const anguloAlvo = Math.atan2(alvo.x - this.raiz.position.x, alvo.z - this.raiz.position.z);
      let delta = anguloAlvo - this.raiz.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.raiz.rotation.y += delta * Math.min(1, dt * 6);
    }
  }

  private animar(dt: number) {
    const { corpo, cabeca, palpebras, cauda, orelhas, membros, emissivos } = this.partes;
    const nervoso = this.alarme;

    if (this.estado !== 'preso') {
      const escalaAtual = this.raiz.scale.x;
      this.raiz.scale.setScalar(escalaAtual + (this.escalaAlvo - escalaAtual) * Math.min(1, dt * 9));
    }

    // Respiração — mais ofegante com pouco HP ou muito alarme.
    const cansaco = 1 - this.hpFracao;
    const ritmo = 2.2 + nervoso * 3.5 + cansaco * 2.5;
    const respira = Math.sin(this.tempo * ritmo) * (0.03 + nervoso * 0.025 + cansaco * 0.02);
    corpo.scale.set(1 - respira * 0.6, 1 + respira, 1 - respira * 0.6);

    // Squash & stretch no salto.
    if (!this.noChao) {
      const estica = THREE.MathUtils.clamp(this.velY * 0.05, -0.16, 0.16);
      corpo.scale.y *= 1 + estica;
      corpo.scale.x *= 1 - estica * 0.5;
      corpo.scale.z *= 1 - estica * 0.5;
    }

    // A cabeça acompanha a respiração e recua no ataque.
    cabeca.position.y += (respira * 0.004 - cabeca.position.y * 0) * 0;
    if (this.estado === 'atacando') {
      const t = Math.min(1, this.cronometroEstado / 0.35);
      // Puxa para trás e joga para a frente.
      cabeca.rotation.x = Math.sin(t * Math.PI) * -0.42;
    } else {
      cabeca.rotation.x += (0 - cabeca.rotation.x) * Math.min(1, dt * 8);
    }

    // Tremor ao levar dano.
    if (this.tremor > 0) {
      this.raiz.position.x += Math.sin(this.tempo * 70) * 0.006 * this.tremor;
      this.raiz.position.z += Math.cos(this.tempo * 63) * 0.006 * this.tremor;
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
      const fecha = Math.sin(t * Math.PI);
      for (const p of palpebras) p.scale.y = Math.max(0.01, fecha);
    } else {
      for (const p of palpebras) p.scale.y = Math.max(0.01, p.scale.y * (1 - dt * 10));
    }

    // Cauda.
    if (cauda) {
      const balanco = Math.sin(this.tempo * (2.6 + nervoso * 4)) * (0.2 + nervoso * 0.28);
      cauda.rotation.y = balanco;
    }

    // Orelhas reagem ao susto.
    for (let i = 0; i < orelhas.length; i++) {
      const lado = i === 0 ? -1 : 1;
      const tremeliqueOrelha = Math.sin(this.tempo * 5 + i) * 0.05;
      orelhas[i].rotation.x = -nervoso * 0.3 + tremeliqueOrelha;
      orelhas[i].rotation.z += (lado * -0.28 - orelhas[i].rotation.z) * Math.min(1, dt * 4);
    }

    // Membros balançam ao andar.
    const andando = !this.noChao ? 1 : 0;
    for (let i = 0; i < membros.length; i++) {
      const fase = i % 2 === 0 ? 0 : Math.PI;
      membros[i].rotation.x = Math.sin(this.tempo * 7 + fase) * 0.35 * andando;
    }

    // O que brilha (chama, bochechas) pulsa e acende no ataque.
    for (let i = 0; i < emissivos.length; i++) {
      const mat = emissivos[i] as THREE.MeshStandardMaterial;
      const base = this.intensidadeBase[i] ?? 1;
      const pulso = 1 + Math.sin(this.tempo * 7) * 0.12;
      // A chama do Charmander diminui junto com o HP, como manda a lenda.
      const saude = 0.35 + this.hpFracao * 0.65;
      mat.emissiveIntensity = base * pulso * saude * (1 + this.brilhoAtaque * 2.2);
    }
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    for (const d of this.partes.descartaveis) d.dispose();
    this.viva = false;
  }
}
