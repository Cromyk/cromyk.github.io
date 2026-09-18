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

/**
 * O anel dos golpes de status.
 *
 * Buff e debuff não têm projétil nem impacto: o que muda é um número. Sem uma
 * imagem, usar "Escudo" é indistinguível de não fazer nada — o bicho pisca a
 * animação de ataque e a briga segue igual. O anel resolve isso com a
 * informação mínima: SOBE quando é a favor, DESCE quando é contra, e a cor diz
 * de quem é o efeito.
 */
export class Aura {
  readonly grupo = new THREE.Group();

  private aneis: THREE.Mesh[] = [];
  private tempo = 0;
  private readonly duracao = 0.8;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(
    centro: THREE.Vector3,
    raio: number,
    /** Positivo sobe (a favor), negativo desce (contra). */
    readonly sentido: number,
  ) {
    const cor = sentido >= 0 ? 0x7fe7c4 : 0xc88aff;
    const geo = new THREE.RingGeometry(raio * 0.9, raio * 1.05, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: cor,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.descartaveis.push(geo, mat);

    // Três anéis desencontrados: um só lê como um disco piscando, três leem
    // como movimento contínuo numa direção.
    for (let i = 0; i < 3; i++) {
      const anel = new THREE.Mesh(geo, mat.clone());
      this.descartaveis.push(anel.material as THREE.Material);
      anel.rotation.x = -Math.PI * 0.5;
      anel.userData.atraso = i * 0.18;
      this.aneis.push(anel);
      this.grupo.add(anel);
    }

    this.grupo.position.copy(centro);
  }

  get terminou(): boolean {
    return this.tempo > this.duracao + 0.4;
  }

  atualizar(dt: number, alturaTotal: number) {
    this.tempo += dt;
    for (const anel of this.aneis) {
      const t = (this.tempo - (anel.userData.atraso as number)) / this.duracao;
      const mat = anel.material as THREE.MeshBasicMaterial;
      if (t < 0 || t > 1) {
        anel.visible = false;
        continue;
      }
      anel.visible = true;
      // Sobe do pé à cabeça, ou desce da cabeça ao pé.
      anel.position.y = this.sentido >= 0 ? t * alturaTotal : (1 - t) * alturaTotal;
      anel.scale.setScalar(0.7 + t * 0.5);
      mat.opacity = 0.85 * Math.sin(t * Math.PI);
    }
  }

  adicionarA(cena: THREE.Object3D) {
    cena.add(this.grupo);
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.grupo);
    for (const d of this.descartaveis) d.dispose();
  }
}

/**
 * O número do dano, subindo do corpo de quem levou — item 2.2 do roteiro.
 *
 * Em VR, informação presa a um painel é informação que você tem de ir BUSCAR.
 * A barra de vida do selvagem flutua sobre ele, o que já ajuda, mas ela conta
 * um estado, não um acontecimento: ela desce, e você descobre depois que desceu.
 * O número aparece onde o golpe bateu, no instante em que bateu, e some.
 *
 * ## Por que sprite
 *
 * Billboard de graça — o número nunca é visto de lado, e num jogo onde o
 * jogador anda em volta do bicho isso não é detalhe. É a mesma escolha da chama
 * (src/fogo.ts) e pelo mesmo motivo.
 *
 * ## O canvas é por número, e isso é aceitável
 *
 * Cada acerto desenha uma textura pequena e a joga fora em menos de um segundo.
 * Seria caro se fosse por quadro; é barato porque é por GOLPE, e um golpe leva
 * pelo menos um segundo de recarga. A textura tem 128×64: o suficiente para
 * três dígitos legíveis a um metro, e pequeno o bastante para o upload não
 * aparecer no medidor.
 */
export class NumeroDeDano {
  readonly sprite: THREE.Sprite;

  private material: THREE.SpriteMaterial;
  private textura: THREE.CanvasTexture;
  private tempo = 0;
  private readonly inicio: THREE.Vector3;
  private readonly subida: number;
  private readonly duracao: number;

  constructor(posicao: THREE.Vector3, dano: number, cor: string, critico: boolean, altura: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const texto = String(Math.max(1, Math.round(dano)));
    const corpo = critico ? 'bold 46px system-ui, sans-serif' : 'bold 40px system-ui, sans-serif';
    ctx.font = corpo;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Contorno escuro antes do preenchimento: em passthrough o fundo é o seu
    // quarto, e um número sem contorno some em cima de qualquer parede clara.
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(6, 9, 14, 0.9)';
    ctx.strokeText(texto, 64, 34);
    ctx.fillStyle = cor;
    ctx.fillText(texto, 64, 34);

    if (critico) {
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeText('CRÍTICO', 64, 9);
      ctx.fillStyle = '#ffd76a';
      ctx.fillText('CRÍTICO', 64, 9);
    }

    this.textura = new THREE.CanvasTexture(canvas);
    this.textura.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: this.textura,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.frustumCulled = false;

    // O tamanho acompanha o bicho: um número de 12 cm em cima de um Diglett o
    // esconde, e o mesmo número num Onix de oito metros não se vê.
    const escala = THREE.MathUtils.clamp(altura * 0.55, 0.11, 0.5);
    this.sprite.scale.set(escala * 2, escala, 1);

    // Sai de um lado aleatório do centro: dois golpes seguidos no mesmo bicho
    // empilhariam dois números no mesmo pixel.
    this.inicio = posicao.clone();
    this.inicio.x += (Math.random() - 0.5) * altura * 0.4;
    this.inicio.z += (Math.random() - 0.5) * altura * 0.4;
    this.sprite.position.copy(this.inicio);

    this.subida = altura * (critico ? 0.75 : 0.55);
    this.duracao = critico ? 1.15 : 0.9;
  }

  get terminou(): boolean {
    return this.tempo >= this.duracao;
  }

  atualizar(dt: number) {
    this.tempo += dt;
    const t = Math.min(1, this.tempo / this.duracao);
    // Sobe rápido e desacelera: é a curva de uma coisa jogada para cima, e o
    // olho a reconhece sem saber por quê.
    this.sprite.position.y = this.inicio.y + this.subida * (1 - (1 - t) ** 2);
    // Fica inteiro a maior parte do tempo e some no fim. Apagar desde o começo
    // deixaria o número ilegível justo quando ele é novidade.
    this.material.opacity = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.sprite);
    this.textura.dispose();
    this.material.dispose();
  }
}
