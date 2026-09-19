import * as THREE from 'three';

/**
 * Os golpes de assinatura dos quatro iniciais.
 *
 * O resto do jogo desenha golpe por FORMATO — jato, projétil, raio — e isso é
 * deliberado (ver src/attacks.ts): dezoito efeitos distintos não se distinguem
 * numa briga de três segundos, e cada um seria mais geometria para o headset
 * desenhar duas vezes por quadro.
 *
 * Mas os quatro iniciais são o Pokémon que você mais vai ver, e a chama do
 * Charmander não pode ser o mesmo borrifo laranja de qualquer bicho de fogo.
 * Então eles — e só eles, mais as evoluções deles — ganham efeito próprio.
 *
 * A assinatura entra POR CIMA do efeito comum, não no lugar dele: quem resolve
 * o dano, o impacto e o som continua sendo src/game.ts, com o mesmo código de
 * sempre. Aqui é imagem, e nada mais.
 */

export type AssinaturaId = 'lanca-chamas' | 'jato-dagua' | 'chicote-cipo' | 'choque-trovao';

const GRAVIDADE = -2.2;
const MAX = 190;

interface Particula {
  posicao: THREE.Vector3;
  velocidade: THREE.Vector3;
  vida: number;
  vidaMax: number;
  tamanho: number;
}

export class Assinatura {
  readonly objetos: THREE.Object3D[] = [];

  private tempo = 0;
  private readonly duracao: number;
  private particulas: Particula[] = [];
  private geometria = new THREE.BufferGeometry();
  private material: THREE.PointsMaterial;
  private cores: THREE.BufferAttribute;
  private luz: THREE.PointLight;
  private origem: THREE.Vector3;
  private destino: THREE.Vector3;
  private direcao: THREE.Vector3;
  private perpendicular: THREE.Vector3;
  private distancia: number;

  private tubo: THREE.Mesh | null = null;
  private cipos: THREE.Mesh[] = [];
  private raios: THREE.Line[] = [];
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(
    readonly id: AssinaturaId,
    origem: THREE.Vector3,
    destino: THREE.Vector3,
  ) {
    this.origem = origem.clone();
    this.destino = destino.clone();
    this.direcao = this.destino.clone().sub(this.origem);
    this.distancia = Math.max(0.25, this.direcao.length());
    this.direcao.normalize();
    this.perpendicular = new THREE.Vector3(-this.direcao.z, 0, this.direcao.x).normalize();
    if (this.perpendicular.lengthSq() < 0.1) this.perpendicular.set(1, 0, 0);

    this.duracao = id === 'choque-trovao' ? 0.6 : id === 'chicote-cipo' ? 0.85 : 0.95;

    this.geometria.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX * 3), 3),
    );
    this.cores = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3);
    this.geometria.setAttribute('color', this.cores);
    this.geometria.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.descartaveis.push(this.geometria, this.material);

    const pontos = new THREE.Points(this.geometria, this.material);
    pontos.frustumCulled = false;
    this.objetos.push(pontos);

    this.luz = new THREE.PointLight(0xffffff, 0, 2.4, 2);
    this.luz.position.copy(this.origem);
    this.objetos.push(this.luz);

    if (id === 'jato-dagua') this.montarTubo();
    if (id === 'chicote-cipo') this.montarCipos();
    if (id === 'choque-trovao') this.montarRaios();
  }

  get terminou(): boolean {
    return this.tempo > this.duracao;
  }

  private guardar<T extends THREE.BufferGeometry | THREE.Material>(x: T): T {
    this.descartaveis.push(x);
    return x;
  }

  // --------------------------------------------------------------- água

  /**
   * O jato é uma coluna sólida, e não só partículas: água sob pressão tem
   * volume e se lê como um cano contínuo. As partículas em volta são a espuma
   * que escapa dele.
   */
  private montarTubo() {
    const geo = this.guardar(
      new THREE.CylinderGeometry(0.014, 0.055, this.distancia, 12, 1, true),
    );
    // O cilindro nasce em pé e centrado; deitá-lo com a base na origem é o que
    // deixa `lookAt` mirar o alvo e `scale.z` valer "comprimento".
    geo.translate(0, -this.distancia / 2, 0);
    geo.rotateX(Math.PI * 0.5);

    const mat = this.guardar(
      new THREE.MeshBasicMaterial({
        color: 0x6fc6ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const tubo = new THREE.Mesh(geo, mat);
    tubo.position.copy(this.origem);
    tubo.lookAt(this.destino);
    tubo.frustumCulled = false;
    tubo.scale.z = 0.01;
    this.tubo = tubo;
    this.objetos.push(tubo);
  }

  // --------------------------------------------------------------- cipó

  /**
   * Dois cipós saem do bulbo, chicoteiam até o alvo e voltam.
   *
   * O tubo é construído UMA vez, com a curva já no lugar, e o que anima é o
   * `drawRange`: ele cresce, segura e encolhe. Reconstruir a `TubeGeometry` a
   * cada quadro daria a mesma imagem e alocaria um buffer por quadro — o que no
   * Quest aparece como engasgo do coletor de lixo bem no meio da briga.
   */
  private montarCipos() {
    const mat = this.guardar(
      new THREE.MeshStandardMaterial({
        color: 0x62c256,
        roughness: 0.55,
        emissive: new THREE.Color(0x2f7a2a),
      }),
    );

    for (const lado of [1, -1]) {
      const pontos: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const p = new THREE.Vector3().lerpVectors(this.origem, this.destino, t);
        // Onda em S: o chicote não vai reto, ele serpenteia — e é o serpenteio
        // que faz o olho ler "cipó" e não "cano verde".
        p.addScaledVector(this.perpendicular, Math.sin(t * Math.PI * 1.6) * 0.18 * lado);
        p.y += Math.sin(t * Math.PI) * 0.1;
        pontos.push(p);
      }

      const curva = new THREE.CatmullRomCurve3(pontos);
      const geo = this.guardar(new THREE.TubeGeometry(curva, 18, 0.014, 6, false));
      geo.setDrawRange(0, 0);
      const cipo = new THREE.Mesh(geo, mat);
      cipo.frustumCulled = false;
      this.cipos.push(cipo);
      this.objetos.push(cipo);
    }
  }

  // --------------------------------------------------------------- raio

  /** Um tronco e duas ramificações, redesenhados a cada quadro. */
  private montarRaios() {
    for (let r = 0; r < 3; r++) {
      const geo = this.guardar(new THREE.BufferGeometry());
      const n = r === 0 ? 16 : 9;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = this.guardar(
        new THREE.LineBasicMaterial({
          color: r === 0 ? 0xfff3a8 : 0xffd23b,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const linha = new THREE.Line(geo, mat);
      linha.frustumCulled = false;
      this.raios.push(linha);
      this.objetos.push(linha);
    }
  }

  // --------------------------------------------------------------- quadro

  atualizar(dt: number) {
    this.tempo += dt;
    const t = this.tempo / this.duracao;

    switch (this.id) {
      case 'lanca-chamas':
        this.chamas(dt, t);
        break;
      case 'jato-dagua':
        this.agua(dt, t);
        break;
      case 'chicote-cipo':
        this.cipo(t);
        break;
      case 'choque-trovao':
        this.trovao(t);
        break;
    }

    this.moverParticulas(dt);
  }

  private chamas(dt: number, t: number) {
    if (t < 0.5) {
      const quantos = Math.min(7, Math.ceil(dt * 260));
      for (let i = 0; i < quantos && this.particulas.length < MAX; i++) {
        // Cone: a abertura sorteada por partícula é o que dá a boca de
        // lança-chamas, estreita na saída e larga no fim.
        const abertura = 0.055 + Math.random() * 0.2;
        const v = this.direcao
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() * 2 - 1) * abertura,
              (Math.random() * 2 - 1) * abertura,
              (Math.random() * 2 - 1) * abertura,
            ),
          )
          .normalize()
          .multiplyScalar(this.distancia * (2.4 + Math.random() * 1.4));
        this.particulas.push({
          posicao: this.origem.clone(),
          velocidade: v,
          vida: 0.3 + Math.random() * 0.26,
          vidaMax: 0.56,
          tamanho: 0.7 + Math.random() * 0.9,
        });
      }
    }
    // A luz treme: chama com brilho constante vira lâmpada laranja.
    this.luz.color.setHex(0xff8a3c);
    this.luz.intensity = Math.max(0, 3.2 * (1 - t)) * (0.75 + Math.random() * 0.5);
    this.luz.position.lerpVectors(this.origem, this.destino, Math.min(1, t * 2.4));
  }

  private agua(dt: number, t: number) {
    if (this.tubo) {
      const alcance = t < 0.18 ? t / 0.18 : 1;
      this.tubo.scale.z = Math.max(0.01, alcance);
      const mat = this.tubo.material as THREE.MeshBasicMaterial;
      mat.opacity = t < 0.55 ? 0.5 : Math.max(0, 0.5 * (1 - (t - 0.55) / 0.45));
      // Pulso de grossura: pressão irregular na mangueira. Sem ele o jato lê
      // como um laser azul.
      const grossura = 0.85 + Math.sin(this.tempo * 34) * 0.15;
      this.tubo.scale.x = grossura;
      this.tubo.scale.y = grossura;
    }

    if (t < 0.55) {
      const quantos = Math.min(6, Math.ceil(dt * 220));
      for (let i = 0; i < quantos && this.particulas.length < MAX; i++) {
        // A espuma nasce ao longo do jato, e não na boca: é água escapando do
        // tubo no percurso inteiro.
        const p = new THREE.Vector3().lerpVectors(this.origem, this.destino, Math.random());
        const v = this.direcao
          .clone()
          .multiplyScalar(this.distancia * (0.8 + Math.random()))
          .add(
            new THREE.Vector3(
              (Math.random() * 2 - 1) * 0.6,
              Math.random() * 0.7,
              (Math.random() * 2 - 1) * 0.6,
            ),
          );
        this.particulas.push({
          posicao: p,
          velocidade: v,
          vida: 0.25 + Math.random() * 0.3,
          vidaMax: 0.55,
          tamanho: 0.4 + Math.random() * 0.7,
        });
      }
    }

    this.luz.color.setHex(0x5fb8ff);
    this.luz.intensity = Math.max(0, 2.2 * (1 - t));
    this.luz.position.lerpVectors(this.origem, this.destino, Math.min(1, t * 3));
  }

  private cipo(t: number) {
    for (let i = 0; i < this.cipos.length; i++) {
      const geo = this.cipos[i].geometry as THREE.TubeGeometry;
      const total = geo.index ? geo.index.count : geo.attributes.position.count;
      // O segundo cipó sai um pouco depois do primeiro: chicotadas simultâneas
      // parecem uma máquina; desencontradas, parecem duas mãos.
      const atraso = i * 0.12;
      const local = THREE.MathUtils.clamp((t - atraso) / (1 - atraso), 0, 1);
      const extensao =
        local < 0.35 ? local / 0.35 : local < 0.62 ? 1 : Math.max(0, 1 - (local - 0.62) / 0.38);
      // Múltiplo de 3: o drawRange conta índices, e cortar no meio de um
      // triângulo apaga uma face inteira em vez de encurtar o cipó.
      const quantos = Math.floor((total * extensao) / 3) * 3;
      geo.setDrawRange(0, quantos);
      this.cipos[i].visible = quantos > 0;
    }
    this.luz.color.setHex(0x7ee06a);
    this.luz.intensity = Math.max(0, 1.2 * (1 - t));
    this.luz.position.lerpVectors(this.origem, this.destino, Math.min(1, t * 2));
  }

  private trovao(t: number) {
    // Pisca em estalos no primeiro terço e apaga. Raio aceso o tempo todo vira
    // laser amarelo.
    const aceso = t < 0.45 && Math.sin(t * 90) > -0.35;
    const cima = new THREE.Vector3(0, 1, 0);
    const meio = new THREE.Vector3().lerpVectors(this.origem, this.destino, 0.35);

    for (let r = 0; r < this.raios.length; r++) {
      const linha = this.raios[r];
      linha.visible = aceso;
      const mat = linha.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, 1 - t / 0.5);
      if (!aceso) continue;

      const pos = linha.geometry.attributes.position as THREE.BufferAttribute;
      const n = pos.count;
      // O tronco vai da boca ao alvo; as ramificações saem do meio dele e
      // morrem no ar, como raio de verdade.
      const de = r === 0 ? this.origem : meio;
      const para =
        r === 0
          ? this.destino
          : new THREE.Vector3()
              .lerpVectors(this.origem, this.destino, 0.75)
              .addScaledVector(this.perpendicular, (r === 1 ? 1 : -1) * (0.3 + Math.random() * 0.25))
              .addScaledVector(cima, (Math.random() - 0.3) * 0.4);

      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const ponto = new THREE.Vector3().lerpVectors(de, para, u);
        // Sem desvio nas pontas: o raio nasce e termina cravado.
        const forca = Math.sin(u * Math.PI) * (r === 0 ? 0.075 : 0.05);
        ponto.addScaledVector(this.perpendicular, (Math.random() * 2 - 1) * forca);
        ponto.addScaledVector(cima, (Math.random() * 2 - 1) * forca);
        pos.setXYZ(i, ponto.x, ponto.y, ponto.z);
      }
      pos.needsUpdate = true;
    }

    if (aceso) {
      for (let i = 0; i < 4 && this.particulas.length < MAX; i++) {
        this.particulas.push({
          posicao: new THREE.Vector3().lerpVectors(this.origem, this.destino, Math.random()),
          velocidade: new THREE.Vector3(
            (Math.random() * 2 - 1) * 2,
            (Math.random() * 2 - 1) * 2,
            (Math.random() * 2 - 1) * 2,
          ),
          vida: 0.12 + Math.random() * 0.12,
          vidaMax: 0.24,
          tamanho: 0.5 + Math.random() * 0.5,
        });
      }
    }

    this.luz.color.setHex(0xffe26a);
    this.luz.intensity = aceso ? 4.5 * (1 - t) : 0;
    this.luz.position.copy(meio);
  }

  /**
   * Cor por partícula, em função da idade.
   *
   * É o que faz a chama parecer chama: no núcleo ela é quase branca, esfria
   * para laranja e morre vermelha. Uma cor só no material daria um borrifo
   * laranja uniforme — exatamente o efeito genérico que estas assinaturas
   * existem para não ser.
   */
  private corDaParticula(fracao: number, alvo: THREE.Color) {
    switch (this.id) {
      case 'lanca-chamas':
        // fração 1 = recém-nascida, no núcleo.
        if (fracao > 0.72) alvo.setRGB(1, 0.95, 0.72);
        else if (fracao > 0.38) alvo.setRGB(1, 0.55, 0.13);
        else alvo.setRGB(0.75, 0.13, 0.05);
        break;
      case 'jato-dagua':
        if (fracao > 0.6) alvo.setRGB(0.85, 0.96, 1);
        else alvo.setRGB(0.32, 0.66, 1);
        break;
      case 'choque-trovao':
        alvo.setRGB(1, 0.92 + fracao * 0.08, 0.35 + fracao * 0.5);
        break;
      default:
        alvo.setRGB(0.42, 0.82, 0.36);
        break;
    }
  }

  private moverParticulas(dt: number) {
    const pos = this.geometria.attributes.position as THREE.BufferAttribute;
    const cor = new THREE.Color();
    let vivas = 0;

    for (let i = this.particulas.length - 1; i >= 0; i--) {
      const p = this.particulas[i];
      p.vida -= dt;
      if (p.vida <= 0) {
        this.particulas.splice(i, 1);
        continue;
      }
      // Fogo sobe; água e faísca caem.
      p.velocidade.y += (this.id === 'lanca-chamas' ? 1.9 : GRAVIDADE) * dt;
      p.velocidade.multiplyScalar(1 - dt * (this.id === 'jato-dagua' ? 2.4 : 3.2));
      p.posicao.addScaledVector(p.velocidade, dt);

      if (vivas < MAX) {
        const fracao = p.vida / p.vidaMax;
        pos.setXYZ(vivas, p.posicao.x, p.posicao.y, p.posicao.z);
        this.corDaParticula(fracao, cor);
        // O brilho cai junto com a vida: a partícula apaga em vez de sumir.
        this.cores.setXYZ(vivas, cor.r * fracao, cor.g * fracao, cor.b * fracao);
        vivas++;
      }
    }

    this.geometria.setDrawRange(0, vivas);
    pos.needsUpdate = true;
    this.cores.needsUpdate = true;
    this.material.size = this.id === 'choque-trovao' ? 0.026 : 0.05;
  }

  adicionarA(cena: THREE.Object3D) {
    for (const o of this.objetos) cena.add(o);
  }

  descartar(cena: THREE.Object3D) {
    for (const o of this.objetos) cena.remove(o);
    for (const d of this.descartaveis) d.dispose();
  }
}

/**
 * Quem tem golpe de assinatura, e em que tipo.
 *
 * A linha evolutiva inteira herda: quem viu o Charmander soltar lança-chamas
 * espera o mesmo do Charizard, e receber um borrifo genérico ao evoluir seria
 * uma perda, não um ganho.
 */
const POR_ESPECIE: Record<string, AssinaturaId> = {
  bulbasaur: 'chicote-cipo',
  ivysaur: 'chicote-cipo',
  venusaur: 'chicote-cipo',
  charmander: 'lanca-chamas',
  charmeleon: 'lanca-chamas',
  charizard: 'lanca-chamas',
  squirtle: 'jato-dagua',
  wartortle: 'jato-dagua',
  blastoise: 'jato-dagua',
  pikachu: 'choque-trovao',
  raichu: 'choque-trovao',
};

/** O tipo do golpe que aciona a assinatura de cada um. */
const TIPO_DA_ASSINATURA: Record<AssinaturaId, string> = {
  'chicote-cipo': 'planta',
  'lanca-chamas': 'fogo',
  'jato-dagua': 'agua',
  'choque-trovao': 'eletrico',
};

/**
 * O efeito que cada TIPO elemental ganha, para quem não tem assinatura de
 * espécie.
 *
 * ## Por que isto deixou de ser privilégio dos iniciais
 *
 * Os quatro efeitos foram escritos para o Charmander, o Squirtle, o Bulbasaur
 * e o Pikachu porque são os bichos que você mais vê. O resto do jogo desenhava
 * golpe por FORMATO — jato, projétil, raio —, e o argumento era que dezoito
 * efeitos distintos não se distinguem numa briga de três segundos.
 *
 * Só que não são dezoito: são QUATRO, e eles já existem, prontos e medidos. O
 * argumento valia contra escrever dezoito; não vale para deixar um Vulpix
 * cuspindo o borrifo laranja genérico enquanto o Charmander ao lado dele tem
 * uma chama de verdade. A partir de hoje o efeito é do TIPO do golpe:
 * qualquer bicho de fogo faz a rajada, qualquer um de elétrico solta o raio,
 * qualquer um de água manda o jato.
 *
 * A assinatura de ESPÉCIE continua vindo antes, e é o que mantém a porta
 * aberta para um efeito que seja só do Charizard um dia.
 */
const POR_TIPO: Record<string, AssinaturaId> = {
  fogo: 'lanca-chamas',
  agua: 'jato-dagua',
  eletrico: 'choque-trovao',
  planta: 'chicote-cipo',
};

/**
 * A assinatura deste bicho com este golpe, se houver.
 *
 * O tipo do golpe precisa bater: um Bulbasaur usando a jogada de cobertura de
 * veneno não solta cipó, ele solta o efeito comum de veneno — a assinatura é do
 * golpe principal, não do bicho.
 */
export function assinaturaDe(especieId: string, tipoDoGolpe: string): AssinaturaId | null {
  const daEspecie = POR_ESPECIE[especieId];
  // A da espécie ganha quando o tipo do golpe bate com ela: o Charmander
  // usando Lança-Chamas faz a chama DELE.
  if (daEspecie && TIPO_DA_ASSINATURA[daEspecie] === tipoDoGolpe) return daEspecie;
  // Fora isso, vale o tipo do golpe — para qualquer bicho. Ver `POR_TIPO`.
  return POR_TIPO[tipoDoGolpe] ?? null;
}
