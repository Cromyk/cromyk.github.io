import * as THREE from 'three';
import type { Pokemon } from './creature';
import { chanceCaptura } from './species';
import { bonusDeCaptura } from './condicao';
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
/**
 * Quanto tempo uma bola largada fica no chão antes de sumir.
 *
 * Ela precisa DURAR: uma bola que falhou é uma bola que você ainda tem, e o
 * jogo pedia que você a visse cair no carpete e sumir em quatro segundos, o que
 * é tempo de ver e não de buscar. Um minuto e meio é o bastante para terminar a
 * briga, respirar e ir catar — e curto o bastante para a sala não virar um
 * depósito de pokébolas esquecidas.
 */
const SEGUNDOS_NO_CHAO = 90;
const RESTITUICAO = 0.42;
const RAIO = 0.045;
const SACUDIDAS = 3;

/**
 * Quando cada sacudida acontece, em segundos desde que a bola caiu.
 *
 * Eram três intervalos IGUAIS de 0,85 s, e três batidas no mesmo compasso não
 * são suspense — são um metrônomo. O ouvido acerta a terceira antes de ela
 * acontecer, e uma coisa que se pode prever não dá aflição nenhuma.
 *
 * Aqui os vãos crescem: 0,62 · 0,88 · 1,30. A primeira vem rápido, quase junto
 * com a queda; a segunda faz esperar; e a terceira demora o bastante para você
 * achar que deu certo antes de ela vir. É o ritmo do jogo original, e o motivo
 * de ele ser assim é exatamente esse — item 2.3 do roteiro.
 */
const RITMO_DA_SACUDIDA = [0.62, 1.5, 2.8] as const;

/**
 * O corpo da pokébola — duas meias-esferas, faixa equatorial e o botão dos dois
 * lados —, montado em geometria como todo o resto do jogo.
 *
 * Fica fora da classe porque o cinto do antebraço (src/cinto.ts) desenha as
 * MESMAS bolas em miniatura: duas montagens diferentes para o mesmo objeto
 * seriam duas coisas para manter parecidas, e elas ficam lado a lado o jogo
 * inteiro — a do cinto e a da mão, a um palmo uma da outra.
 *
 * O `guardar` é de quem chama: quem monta é quem descarta.
 */
export function montarCorpoDeBola(
  raio: number,
  corAcento: number,
  corBase: number,
  guardar: <T extends THREE.BufferGeometry | THREE.Material>(x: T) => T,
): { grupo: THREE.Group; botao: THREE.Mesh; matBotao: THREE.MeshStandardMaterial } {
  const grupo = new THREE.Group();

  const matTopo = guardar(
    new THREE.MeshStandardMaterial({ color: corAcento, roughness: 0.25, metalness: 0.15 }),
  );
  const matBase = guardar(
    new THREE.MeshStandardMaterial({ color: corBase, roughness: 0.28, metalness: 0.1 }),
  );
  const matFaixa = guardar(
    new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.2 }),
  );
  const matBotao = guardar(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    }),
  );

  const topo = new THREE.Mesh(
    guardar(new THREE.SphereGeometry(raio, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    matTopo,
  );
  const base = new THREE.Mesh(
    guardar(new THREE.SphereGeometry(raio, 28, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)),
    matBase,
  );
  topo.castShadow = true;
  base.castShadow = true;
  grupo.add(topo, base);

  const faixa = new THREE.Mesh(
    guardar(new THREE.CylinderGeometry(raio * 1.008, raio * 1.008, raio * 0.17, 28)),
    matFaixa,
  );
  grupo.add(faixa);

  // Botão: um anel escuro com o miolo claro, nos dois lados.
  for (const frente of [1, -1]) {
    const anel = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(raio * 0.3, raio * 0.3, raio * 0.1, 20)),
      matFaixa,
    );
    anel.rotation.x = Math.PI * 0.5;
    anel.position.z = frente * raio * 0.94;
    grupo.add(anel);
  }
  const botao = new THREE.Mesh(
    guardar(new THREE.CylinderGeometry(raio * 0.19, raio * 0.19, raio * 0.14, 18)),
    matBotao,
  );
  botao.rotation.x = Math.PI * 0.5;
  botao.position.z = raio * 0.97;
  grupo.add(botao);

  return { grupo, botao, matBotao };
}

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

  private corpo: THREE.Group;
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
  /** Quanto ela está achatada agora, 0 a 1. Ver aplicarElastico. */
  private achatamento = 0;
  private pisoY: number;

  constructor(pisoY: number, corAcento = 0xff3b30, corBase = 0xf2f2f5) {
    this.pisoY = pisoY;

    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    const montado = montarCorpoDeBola(RAIO, corAcento, corBase, guardar);
    this.corpo = montado.grupo;
    this.matBotao = montado.matBotao;

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
  capturar(pokemon: Pokemon, precisao = 0.5, multiplicadorBola = 1) {
    this.presa = pokemon;
    this.estado = 'sugando';
    this.cronometro = 0;
    this.velocidade.multiplyScalar(0.1);
    pokemon.serCapturado();
    audio.acerto();
    audio.succao();

    const base = chanceCaptura(
      pokemon.especie,
      pokemon.hpFracao,
      pokemon.alarme,
      multiplicadorBola,
      pokemon.nivel,
      bonusDeCaptura(pokemon.condicao),
    );
    this.chancePorSacudida = THREE.MathUtils.clamp(base * (1 + precisao * 0.1), 0.1, 0.985);
    this.sacudidasRestantes = SACUDIDAS;
  }

  /** Arremessada para soltar um Pokémon da coleção, não para capturar. */
  soltar(pokemon: Pokemon) {
    this.presa = pokemon;
    this.estado = 'soltando';
    this.cronometro = 0;
    // O estalo do fecho vem antes do clarão: é a causa, não o efeito.
    audio.estalo();
    audio.succao();
  }

  atualizar(dt: number) {
    this.cronometro += dt;
    this.aplicarElastico(dt);

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

        const indice = this.sacudidaNoTempo(this.cronometro);
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
        // Escapou, mas a bola não evaporou: ela encolhe de volta e cai no chão,
        // de onde dá para pegar e tentar de novo. Era aqui que a bola sumia.
        if (this.cronometro > 0.75) {
          this.corpo.scale.setScalar(1);
          this.estado = 'inerte';
          this.tempoInerte = 0;
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

      case 'inerte': {
        this.integrar(dt);
        this.tempoInerte += dt;
        // Um respiro de luz enquanto ela pode ser recolhida, e o apagar nos
        // últimos dez segundos — o aviso de que ela está indo embora.
        const indoEmbora = Math.max(0, 1 - (SEGUNDOS_NO_CHAO - this.tempoInerte) / 10);
        this.luz.intensity = (0.2 + Math.sin(this.tempoInerte * 2.4) * 0.12) * (1 - indoEmbora);
        this.matBotao.emissiveIntensity = (0.5 + Math.sin(this.tempoInerte * 2.4) * 0.35) * (1 - indoEmbora);
        break;
      }
    }
  }

  private integrar(dt: number) {
    this.velocidade.y += GRAVIDADE * dt;
    this.raiz.position.addScaledVector(this.velocidade, dt);

    if (this.raiz.position.y - RAIO <= this.pisoY) {
      this.raiz.position.y = this.pisoY + RAIO;
      if (Math.abs(this.velocidade.y) > 0.35) {
        // O achatamento sai da velocidade com que ela chegou: uma bola que cai
        // de trinta centímetros amassa de leve, e uma arremessada com força
        // amassa muito. Achatar sempre igual é o que faz um quique parecer um
        // gif em laço — item 2.3 do roteiro.
        this.achatamento = Math.min(0.55, Math.abs(this.velocidade.y) * 0.09);
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

  /**
   * Squash & stretch: achata ao bater, estica ao subir, volta sozinha.
   *
   * O volume é conservado — o que encolhe em Y cresce em X e Z pela raiz, que
   * é a conta que faz a coisa parecer elástica em vez de desenhada. Sem ela a
   * bola vira uma esfera rígida que muda de tamanho, que o olho lê como
   * defeito.
   *
   * Vive no `corpo` e não na `raiz`: a raiz gira, e escala em nó girado deforma
   * no eixo errado.
   */
  /** Quantas sacudidas já deviam ter acontecido neste instante. */
  private sacudidaNoTempo(segundos: number): number {
    let quantas = 0;
    for (const marca of RITMO_DA_SACUDIDA) {
      if (segundos >= marca) quantas++;
    }
    return quantas;
  }

  private aplicarElastico(dt: number) {
    if (this.achatamento > 0) this.achatamento = Math.max(0, this.achatamento - dt * 5.5);

    // Subindo depressa, ela se alonga um pouco: é o outro lado do mesmo efeito,
    // e é o que dá a sensação de que o quique DEVOLVEU energia.
    const subindo =
      this.estado === 'voando' && this.velocidade.y > 0.6
        ? Math.min(0.18, this.velocidade.y * 0.03)
        : 0;

    const emY = 1 - this.achatamento + subindo;
    const emXZ = 1 / Math.sqrt(Math.max(emY, 0.2));
    this.corpo.scale.set(emXZ, emY, emXZ);
  }

  get acabou(): boolean {
    if (this.estado === 'sucesso') return this.cronometro > 1.6;
    if (this.estado === 'soltando') return this.cronometro > 0.9;
    // 'falha' não acaba: ela vira 'inerte' e a bola fica no carpete.
    if (this.estado === 'inerte') return this.tempoInerte > SEGUNDOS_NO_CHAO;
    return false;
  }

  /** Está parada no chão, esperando alguém pegar. */
  get noChao(): boolean {
    return this.estado === 'inerte';
  }

  /**
   * Volta para a mão depois de um tempo no carpete.
   *
   * O estado vira 'mao' e o cronômetro de chão zera: se você pegar, arremessar
   * e errar de novo, ela ganha outros noventa segundos, como qualquer bola que
   * acabou de cair.
   */
  recolher() {
    this.estado = 'mao';
    this.velocidade.set(0, 0, 0);
    this.tempoInerte = 0;
    this.cronometro = 0;
    this.resolvido = false;
    this.luz.intensity = 0.25;
    this.matBotao.emissiveIntensity = 0.35;
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    for (const d of this.descartaveis) d.dispose();
  }
}
