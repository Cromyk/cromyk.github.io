import * as THREE from 'three';
import { statsNoNivel, type Especie } from './species';
import type { Corpo } from './modelos';
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
 *
 * O corpo é um modelo 3D de verdade (ver src/modelos.ts), não geometria
 * montada aqui. Dezenove dos 151 arquivos trazem animação assada; os outros
 * 132 chegam parados, então toda a vida deles é a animação procedural abaixo:
 * respiração, squash no salto, inclinação na corrida, tremor ao apanhar. É
 * pouca conta por quadro de propósito — o headset desenha a cena duas vezes.
 */
export class Pokemon {
  readonly especie: Especie;
  readonly corpo: Corpo;
  readonly raiz: THREE.Group;
  readonly papel: Papel;
  readonly nivel: number;
  readonly shiny: boolean;
  readonly hpMax: number;

  ancora: THREE.Vector3;
  pisoY: number;

  estado: Estado = 'surgindo';
  hp: number;
  /** 0 = tranquilo, 1 = surta e foge. Só vale para o selvagem. */
  alarme = 0;
  viva = true;
  /** Para quem ele está virado enquanto luta. */
  alvo: Pokemon | null = null;
  /**
   * Se este encontro já rendeu experiência. Um selvagem derrubado e depois
   * capturado é UM encontro, e pagaria duas vezes sem esta marca.
   */
  xpConcedida = false;

  private rng: Rng;
  private tempo: number;
  private velY = 0;
  private noChao = true;
  private destino = new THREE.Vector3();
  private proximoPulo: number;
  private cronometroEstado = 0;
  private escalaAlvo = 1;
  private olharPara: THREE.Vector3 | null = null;
  private recarga = 0;
  private tremor = 0;
  /** Achatada ao aterrissar, volta sozinha. */
  private impacto = 0;
  private velocidadeAndando = 0;

  private static readonly RAIO_PASSEIO = 0.85;

  constructor(
    especie: Especie,
    corpo: Corpo,
    ancora: THREE.Vector3,
    pisoY: number,
    papel: Papel = 'selvagem',
    nivel = 5,
    shiny = false,
    semente = Math.random() * 1e9,
  ) {
    this.especie = especie;
    this.corpo = corpo;
    this.papel = papel;
    this.nivel = nivel;
    this.shiny = shiny;
    this.ancora = ancora.clone();
    this.pisoY = pisoY;
    this.hpMax = statsNoNivel(especie, nivel).hpMax;
    this.hp = this.hpMax;
    this.rng = criarRng(semente);
    this.tempo = this.rng() * 10;
    this.proximoPulo = entre(this.rng, 1.2, 3.0);

    this.raiz = corpo.raiz;
    this.raiz.position.copy(ancora);
    this.raiz.position.y = pisoY;
    this.raiz.rotation.y = this.rng() * Math.PI * 2;
    this.raiz.scale.setScalar(0.001);
    this.destino.copy(this.raiz.position);

    // Um clipe assado, quando o arquivo trouxe algum, roda por baixo da
    // animação procedural. Vale a pena: quem tem, tem "Impactrueno" e afins,
    // que são muito melhores do que qualquer coisa que a gente inventasse.
    const primeira = corpo.acoes.values().next();
    if (!primeira.done) {
      primeira.value.reset().play();
      primeira.value.setEffectiveTimeScale(0.85);
    }
  }

  get altura(): number {
    return this.corpo.altura;
  }

  get hpFracao(): number {
    return THREE.MathUtils.clamp(this.hp / this.hpMax, 0, 1);
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
    return new THREE.Vector3(p.x, p.y + this.altura * 0.5 * this.raiz.scale.y, p.z);
  }

  /** De onde sai o golpe. */
  get boca(): THREE.Vector3 {
    this.raiz.updateMatrixWorld();
    return this.corpo.boca.getWorldPosition(new THREE.Vector3());
  }

  get raio(): number {
    return this.corpo.raio;
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
  atacar(alvo: Pokemon, recarga: number) {
    if (!this.podeAtacar) return false;
    this.alvo = alvo;
    this.estado = 'atacando';
    this.cronometroEstado = 0;
    this.recarga = recarga;
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
    this.hp = Math.min(this.hpMax, this.hp + quantidade);
    if (this.hp > 0 && this.estado === 'desmaiado') {
      this.estado = 'ocioso';
      this.raiz.rotation.z = 0;
    }
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

  /** Acalma o selvagem — é o que uma fruta bem jogada faz. */
  acalmar(quanto: number) {
    this.alarme = Math.max(0, this.alarme - quanto);
    if (this.estado === 'fugindo') {
      this.estado = 'ocioso';
      this.cronometroEstado = 0;
    }
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

  /** Vem até um ponto — a mão estendida com uma fruta, por exemplo. */
  chamarPara(ponto: THREE.Vector3) {
    this.destino.set(ponto.x, this.pisoY, ponto.z);
    this.olharPara = ponto.clone();
    if (this.noChao) {
      this.velY = 1.8;
      this.noChao = false;
    }
  }

  atualizar(dt: number, jogador: THREE.Vector3) {
    if (!this.viva) return;
    this.tempo += dt;
    this.cronometroEstado += dt;
    if (this.recarga > 0) this.recarga -= dt;
    if (this.tremor > 0) this.tremor = Math.max(0, this.tremor - dt * 3.5);
    if (this.impacto > 0) this.impacto = Math.max(0, this.impacto - dt * 4.5);

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
        this.corpo.mixer?.update(dt * 0.2);
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
        const passo = Math.min(vel * dt, dist);
        plano.normalize().multiplyScalar(passo);
        this.raiz.position.add(plano);
        this.velocidadeAndando = dt > 0 ? passo / dt : 0;
      } else {
        this.velocidadeAndando = 0;
      }

      if (this.raiz.position.y <= this.pisoY) {
        // Aterrissou: guarda a força da queda para o corpo achatar um pouco.
        this.impacto = THREE.MathUtils.clamp(-this.velY / 4, 0, 1);
        this.raiz.position.y = this.pisoY;
        this.velY = 0;
        this.noChao = true;
      }
    } else {
      this.velocidadeAndando = Math.max(0, this.velocidadeAndando - dt * 4);
    }

    const alvo = this.olharPara ?? (this.noChao ? null : this.destino);
    if (alvo) {
      const anguloAlvo = Math.atan2(alvo.x - this.raiz.position.x, alvo.z - this.raiz.position.z);
      let delta = anguloAlvo - this.raiz.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.raiz.rotation.y += delta * Math.min(1, dt * 6);
    }
  }

  /**
   * A vida do bicho, toda escrita em `corpo` — nunca em `raiz` (que é do jogo)
   * nem em `ajuste` (que é da normalização do modelo).
   */
  private animar(dt: number) {
    const g = this.corpo.corpo;
    const nervoso = this.alarme;

    this.corpo.mixer?.update(dt);

    if (this.estado !== 'preso') {
      const escalaAtual = this.raiz.scale.x;
      this.raiz.scale.setScalar(escalaAtual + (this.escalaAlvo - escalaAtual) * Math.min(1, dt * 9));
    }

    // Respiração — mais ofegante com pouco HP ou muito alarme.
    const cansaco = 1 - this.hpFracao;
    const ritmo = 2.2 + nervoso * 3.5 + cansaco * 2.5;
    const respira = Math.sin(this.tempo * ritmo) * (0.03 + nervoso * 0.025 + cansaco * 0.02);
    let ex = 1 - respira * 0.6;
    let ey = 1 + respira;
    let ez = 1 - respira * 0.6;

    // Squash & stretch: estica subindo, achata na aterrissagem.
    if (!this.noChao) {
      const estica = THREE.MathUtils.clamp(this.velY * 0.05, -0.16, 0.16);
      ey *= 1 + estica;
      ex *= 1 - estica * 0.5;
      ez *= 1 - estica * 0.5;
    }
    if (this.impacto > 0) {
      const achata = this.impacto * 0.22;
      ey *= 1 - achata;
      ex *= 1 + achata * 0.6;
      ez *= 1 + achata * 0.6;
    }
    g.scale.set(ex, ey, ez);

    // Balanço leve no eixo do corpo: é o que tira os modelos parados da cara de
    // estátua. Quem anda depressa se inclina para a frente.
    const balanco = Math.sin(this.tempo * (3.4 + nervoso * 2)) * 0.035 * (0.4 + nervoso);
    const inclinacao = THREE.MathUtils.clamp(this.velocidadeAndando * 0.07, 0, 0.16);

    if (this.estado === 'atacando') {
      // Recua e joga o corpo para a frente, na direção do alvo.
      const t = Math.min(1, this.cronometroEstado / 0.35);
      const arranque = Math.sin(t * Math.PI);
      g.rotation.x = -0.34 * arranque;
      g.position.z = arranque * this.altura * 0.18;
    } else {
      g.rotation.x += (inclinacao - g.rotation.x) * Math.min(1, dt * 7);
      g.position.z += (0 - g.position.z) * Math.min(1, dt * 8);
    }
    g.rotation.z = balanco;

    // Tremor ao levar dano.
    if (this.tremor > 0) {
      this.raiz.position.x += Math.sin(this.tempo * 70) * 0.006 * this.tremor;
      this.raiz.position.z += Math.cos(this.tempo * 63) * 0.006 * this.tremor;
    }
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    this.corpo.descartar();
    this.viva = false;
  }
}
