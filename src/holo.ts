import * as THREE from 'three';

/**
 * A pokébola holográfica: a mesma bola, feita de luz.
 *
 * ## Por que ela existe
 *
 * O painel do pulso mostrava o seu time como CARTAS — seis retângulos de dez
 * centímetros com nome, tipo, barra de vida e nível. Elas diziam tudo e eram um
 * menu: meio metro de painel pendurado no antebraço, que se lê e não se pega.
 *
 * O pedido do playtest de 18/09 foi literal: *"quero pokébolas flutuantes do
 * tipo holograma para poder alcançar com a mão e pegar"*. Uma bola de trinta
 * gramas ocupa cinco centímetros e diz a mesma coisa que a carta pelo formato —
 * e, principalmente, ela é uma COISA: a mão já sabe o que fazer com ela.
 *
 * ## Por que de luz, e não de plástico
 *
 * Em realidade misturada um objeto opaco tapa o seu quarto. Uma bola sólida
 * flutuando a vinte centímetros do rosto lê como um adesivo colado na sua
 * visão; feita de luz aditiva, ela BRILHA sobre o quarto e deixa ver o que está
 * atrás. É a diferença entre uma coisa que está na sala e uma projeção — e a
 * bola do painel é uma projeção mesmo: a bola de verdade só existe quando você
 * fecha a mão nela.
 *
 * O `AdditiveBlending` faz o preto sumir e as cores somarem. Num passthrough
 * claro isso fica pálido de propósito: holograma sobre janela ensolarada é
 * pálido mesmo, e a alternativa (opaco) tapa a janela.
 *
 * ## O custo
 *
 * Quatro malhas por bola — duas meias esferas, a faixa e o botão. As
 * geometrias são compartilhadas por TODAS as bolas do jogo (ver `geometrias`),
 * então o que cada uma custa de memória são quatro materiais; o que ela custa
 * de quadro são quatro chamadas de desenho, e é por isso que nenhuma tela do
 * jogo mostra mais do que uma dúzia delas ao mesmo tempo.
 */

/** Uma família de geometrias por raio pedido. Compartilhada e nunca descartada. */
const cacheGeo = new Map<number, Geometrias>();

interface Geometrias {
  topo: THREE.SphereGeometry;
  base: THREE.SphereGeometry;
  faixa: THREE.TorusGeometry;
  botao: THREE.CircleGeometry;
  aro: THREE.TorusGeometry;
}

/**
 * As geometrias de um raio, criadas uma vez.
 *
 * Elas não entram no `guardar` de ninguém de propósito: são compartilhadas
 * entre o painel, o cinto e o que mais venha a mostrar uma bola de luz, e uma
 * delas ser descartada junto com o painel que fechou apagaria as outras. São
 * quatro buffers de poucos kilobytes por raio, e há três raios no jogo.
 */
function geometrias(raio: number): Geometrias {
  const chave = Math.round(raio * 10000);
  const achada = cacheGeo.get(chave);
  if (achada) return achada;

  const nova: Geometrias = {
    topo: new THREE.SphereGeometry(raio, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    base: new THREE.SphereGeometry(raio, 20, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    faixa: new THREE.TorusGeometry(raio * 0.99, raio * 0.055, 6, 24),
    botao: new THREE.CircleGeometry(raio * 0.26, 16),
    aro: new THREE.TorusGeometry(raio * 1.24, raio * 0.05, 6, 26),
  };
  cacheGeo.set(chave, nova);
  return nova;
}

const branco = new THREE.Color(0xffffff);
const _cor = new THREE.Color();

export class Holobola {
  readonly grupo = new THREE.Group();
  /** O corpo, que flutua e gira dentro do grupo. O grupo em si fica parado. */
  private corpo = new THREE.Group();

  private matTopo: THREE.MeshBasicMaterial;
  private matBase: THREE.MeshBasicMaterial;
  private matFaixa: THREE.MeshBasicMaterial;
  private matBotao: THREE.MeshBasicMaterial;
  private matAro: THREE.MeshBasicMaterial;
  private aro: THREE.Mesh;

  private corTopo = new THREE.Color(0xff4d43);
  private corBase = new THREE.Color(0xdfe7f2);
  /** 0 = fantasma (estoque zerado, vaga vazia), 1 = cheia. */
  private cheia = 1;
  private destaque = 0;
  private fase: number;

  constructor(readonly raio: number, fase = 0) {
    this.fase = fase;
    const geo = geometrias(raio);

    const luz = (cor: number, opacidade: number) =>
      new THREE.MeshBasicMaterial({
        color: cor,
        transparent: true,
        opacity: opacidade,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });

    this.matTopo = luz(0xff4d43, 0.55);
    this.matBase = luz(0xdfe7f2, 0.3);
    this.matFaixa = luz(0x9fd8ff, 0.8);
    this.matBotao = luz(0xffffff, 0.95);
    this.matAro = luz(0x9fd8ff, 0);

    const topo = new THREE.Mesh(geo.topo, this.matTopo);
    const base = new THREE.Mesh(geo.base, this.matBase);
    const faixa = new THREE.Mesh(geo.faixa, this.matFaixa);
    // A faixa nasce no plano XY do torus; deitá-la põe o equador no lugar.
    faixa.rotation.x = Math.PI * 0.5;
    const botao = new THREE.Mesh(geo.botao, this.matBotao);
    botao.position.z = raio * 0.99;

    // O aro de foco: só acende na bola que a mão está alcançando. É o que
    // responde ao braço chegando, antes de o grip fechar — sem ele, a mão vai
    // até a bola no escuro e descobre que acertou depois de apertar.
    this.aro = new THREE.Mesh(geo.aro, this.matAro);
    this.aro.rotation.x = Math.PI * 0.5;

    for (const m of [topo, base, faixa, botao, this.aro]) {
      m.frustumCulled = false;
      m.renderOrder = 9;
      this.corpo.add(m);
    }
    this.grupo.add(this.corpo);
  }

  /** A cor de cima e a de baixo. Time: a do tipo do bicho; estoque: a da bola. */
  definirCores(topo: number, base: number) {
    this.corTopo.set(topo);
    this.corBase.set(base);
  }

  /**
   * Quão presente ela está: 1 cheia, 0 um fantasma.
   *
   * Fantasma e ausente não são a mesma coisa. Uma Bola Lacuna zerada continua
   * desenhada, apagadíssima, porque saber que ela existe e acabou é informação;
   * um lugar VAZIO do time também — é onde cabe o próximo.
   */
  definirCheia(quanto: number) {
    this.cheia = THREE.MathUtils.clamp(quanto, 0, 1);
  }

  get visivel() {
    return this.grupo.visible;
  }

  set visivel(v: boolean) {
    this.grupo.visible = v;
  }

  /**
   * `destaque` é 1 quando a mão está em cima desta bola.
   *
   * `escala` deixa o painel inteiro nascer e sumir junto: o painel abre em
   * décimos de segundo e as bolas crescem com ele em vez de aparecerem prontas.
   */
  atualizar(dt: number, tempo: number, destaque: boolean | number, escala = 1) {
    if (!this.grupo.visible) return;

    // O destaque virou NÚMERO em 18/09 (ver src/toque.ts): ele já não é 'a mão
    // está dentro do alcance', é 'quanto ela está encostando', de 0 a 1 — e a
    // mesma conta alimenta a vibração. Nada aqui embaixo mudou: giro, escala,
    // lavagem de branco, opacidades e o aro já eram todos contínuos.
    //
    // O lerp continua, e com alvo contínuo ele é MAIS necessário: é o filtro do
    // tremor da mão rastreada.
    const alvo = destaque === true ? 1 : destaque === false ? 0 : destaque;
    const k = Math.min(1, dt * 14);
    this.destaque += (alvo - this.destaque) * k;

    // Flutuar e girar, cada uma fora de fase — quatro bolas subindo juntas são
    // um elevador; quatro subindo em tempos diferentes são quatro bolas.
    const t = tempo * 1.5 + this.fase;
    this.corpo.position.y = Math.sin(t) * 0.0045 * this.cheia;
    this.corpo.rotation.y = tempo * (0.5 + this.destaque * 1.4) + this.fase;
    this.corpo.scale.setScalar(escala * (1 + this.destaque * 0.26));

    // Cheia, a cor é a dela; apagada, ela some para um fio de contorno. O
    // destaque lava tudo de branco: é o "isto aqui" do relance.
    const brilho = 0.3 + this.cheia * 0.7 + this.destaque * 0.45;
    this.matTopo.color.copy(_cor.copy(this.corTopo).lerp(branco, this.destaque * 0.45));
    this.matBase.color.copy(_cor.copy(this.corBase).lerp(branco, this.destaque * 0.35));
    this.matTopo.opacity = (0.1 + this.cheia * 0.5) * brilho;
    this.matBase.opacity = (0.06 + this.cheia * 0.3) * brilho;
    this.matFaixa.opacity = 0.25 + this.cheia * 0.55 + this.destaque * 0.2;
    this.matBotao.opacity = 0.2 + this.cheia * 0.6 + this.destaque * 0.2;

    this.matAro.opacity = this.destaque * 0.85;
    this.aro.visible = this.destaque > 0.02;
    this.aro.scale.setScalar(1 + Math.sin(tempo * 5) * 0.03 * this.destaque);
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const m of [this.matTopo, this.matBase, this.matFaixa, this.matBotao, this.matAro]) {
      m.dispose();
    }
  }
}
