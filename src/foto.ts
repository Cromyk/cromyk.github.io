import * as THREE from 'three';

/**
 * A Pokédex tira foto.
 *
 * ## Por que isto é o item mais valioso da Fase 2
 *
 * Em realidade misturada, o Pokémon está na SUA sala — em cima da sua mesa, no
 * seu carpete, ao lado do seu sofá. É a única coisa que este jogo tem que não
 * cabe numa captura de tela de outro jogo, e era também a única que não saía do
 * headset: uma sessão inteira acontecia e não sobrava nada para mostrar a
 * ninguém.
 *
 * ## O que a foto tem, e o que ela não tem
 *
 * Ela tem o Pokémon, a sala mapeada e tudo o mais que o jogo desenha. Ela NÃO
 * tem o passthrough — o seu quarto de verdade —, e isso é uma limitação do
 * aparelho, não uma escolha: o vídeo das câmeras do Quest só chega ao WebXR com
 * a permissão de acesso bruto à câmera, que nem toda versão do navegador
 * oferece e que muda a foto de "o meu bicho" para "o meu bicho na minha sala".
 *
 * Sem ela, o que sai é o bicho sobre fundo TRANSPARENTE — que é exatamente o
 * formato de um adesivo, e é o que se cola em qualquer conversa. Quando o
 * acesso à câmera existir, o mesmo caminho recebe o quadro do passthrough como
 * fundo e nada aqui muda de forma.
 *
 * ## Como a foto chega até você
 *
 * Este é o problema de verdade, e ele não é de renderização. Dentro de uma
 * sessão imersiva **não há como baixar um arquivo**: não há barra de endereço,
 * não há diálogo de download, e um link com `download` não faz nada. A foto
 * tirada no meio do jogo não pode ser salva no meio do jogo.
 *
 * Então ela é guardada em memória e entregue na SAÍDA: quando a sessão acaba, a
 * página volta a ser uma página comum, e ali um link de download é um link de
 * download. É a mesma razão pela qual a galeria não tenta ser bonita — ela é um
 * corredor entre o headset e o seu rolo de fotos.
 */

/** Uma foto tirada, já pronta para virar arquivo. */
export interface Foto {
  /** O PNG inteiro, em base64. */
  dados: string;
  /** Segundos desde o começo da sessão — vira o nome do arquivo. */
  quando: number;
  /** Quem estava na foto, para o nome do arquivo dizer alguma coisa. */
  quem: string;
  largura: number;
  altura: number;
}

/**
 * Quantas fotos ficam guardadas.
 *
 * Cada uma é um PNG de 1024 × 1024 em base64 na memória do headset — uns poucos
 * megabytes. Vinte é mais do que uma sessão produz e pouco o bastante para não
 * competir com os modelos, que são a memória que importa aqui.
 */
export const MAX_FOTOS = 20;

/** O lado da foto, em pixels. Quadrada, que é o formato de quem vai compartilhar. */
export const LADO_DA_FOTO = 1024;

/**
 * O nome do arquivo de uma foto.
 *
 * Função pura e exportada para o smoke poder afirmar o que importa aqui: que
 * dois disparos no mesmo segundo não geram o mesmo nome (o segundo sobrescreve
 * o primeiro no rolo de fotos) e que nada que o jogador digite — nenhum nome de
 * espécie — vira caminho de arquivo.
 */
export function nomeDaFoto(foto: Foto): string {
  const seguro = foto.quem
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  // Centésimos, e não décimos: dois disparos seguidos têm de dar nomes
  // diferentes, senão o segundo sobrescreve o primeiro no rolo de fotos de quem
  // baixa os dois. Décimo de segundo é menos do que a distância entre dois
  // toques no mesmo botão.
  // Arredonda uma vez e reparte, em vez de separar a parte inteira primeiro:
  // 12,34 − 12 dá 0,33999…, e um `floor` depois disso transforma a foto dos
  // 12,34 s em "12s33". É o erro de ponto flutuante mais banal que existe e ele
  // aparece no NOME DO ARQUIVO, que é a única coisa que a pessoa vê.
  const total = Math.max(0, Math.round(foto.quando * 100));
  const segundos = Math.floor(total / 100);
  const centesimos = total % 100;
  return `pokeplace-${seguro || 'foto'}-${segundos}s${String(centesimos).padStart(2, '0')}.png`;
}

/**
 * O fotógrafo: uma câmera própria e um alvo de renderização.
 *
 * A câmera é separada da do jogador de propósito — a regra número um deste
 * projeto é que a câmera do jogador é sagrada, e uma foto que mexesse nela
 * faria o mundo inteiro balançar na cabeça de quem tirou.
 */
export class Fotografo {
  readonly fotos: Foto[] = [];

  private alvo: THREE.WebGLRenderTarget;
  private camera = new THREE.PerspectiveCamera(58, 1, 0.05, 60);
  private pixels: Uint8Array;
  private canvas: HTMLCanvasElement | null = null;

  constructor(readonly lado = LADO_DA_FOTO) {
    this.alvo = new THREE.WebGLRenderTarget(lado, lado, {
      // Alpha, porque o fundo é transparente: é o que faz a foto ser um adesivo
      // em vez de um retângulo preto com um bicho dentro.
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
    });
    this.pixels = new Uint8Array(lado * lado * 4);
  }

  /**
   * Bate uma foto de onde a cabeça está olhando.
   *
   * ## O desvio do `xr.enabled`
   *
   * Com a sessão XR ligada, `renderer.render` ignora a câmera que você passa e
   * usa a câmera estéreo da sessão, desenhando no framebuffer do headset. Para
   * renderizar de um ponto de vista arbitrário num alvo próprio é preciso
   * desligar o XR pelo tempo de um render — e religar em seguida, no mesmo
   * quadro, antes que o loop volte a desenhar.
   *
   * É um desvio feio e é o único caminho: a alternativa seria uma segunda
   * instância de renderizador, com uma segunda cópia de todas as texturas.
   */
  bater(
    renderer: THREE.WebGLRenderer,
    cena: THREE.Object3D,
    deOnde: THREE.Camera,
    quem: string,
    quando: number,
  ): Foto | null {
    if (typeof document === 'undefined') return null;

    deOnde.updateMatrixWorld();
    this.camera.position.setFromMatrixPosition(deOnde.matrixWorld);
    deOnde.getWorldQuaternion(this.camera.quaternion);
    this.camera.updateMatrixWorld(true);

    const xrEstava = renderer.xr.enabled;
    const alvoAnterior = renderer.getRenderTarget();
    try {
      renderer.xr.enabled = false;
      renderer.setRenderTarget(this.alvo);
      renderer.clear();
      renderer.render(cena, this.camera);
      renderer.readRenderTargetPixels(this.alvo, 0, 0, this.lado, this.lado, this.pixels);
    } finally {
      renderer.setRenderTarget(alvoAnterior);
      renderer.xr.enabled = xrEstava;
    }

    const foto: Foto = {
      dados: this.paraPng(),
      quando,
      quem,
      largura: this.lado,
      altura: this.lado,
    };
    this.fotos.push(foto);
    // O rolo é circular: a foto mais velha sai para a mais nova entrar.
    while (this.fotos.length > MAX_FOTOS) this.fotos.shift();
    return foto;
  }

  /**
   * Os pixels lidos viram PNG.
   *
   * A inversão vertical não é opcional: OpenGL lê a imagem de baixo para cima e
   * o canvas escreve de cima para baixo, então sem ela toda foto sai de cabeça
   * para baixo — e de um jeito que ninguém repara até ver a primeira.
   */
  private paraPng(): string {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.lado;
      this.canvas.height = this.lado;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return '';
    const imagem = ctx.createImageData(this.lado, this.lado);
    const linha = this.lado * 4;
    for (let y = 0; y < this.lado; y++) {
      const origem = (this.lado - 1 - y) * linha;
      imagem.data.set(this.pixels.subarray(origem, origem + linha), y * linha);
    }
    ctx.putImageData(imagem, 0, 0);
    return this.canvas.toDataURL('image/png');
  }

  descartar() {
    this.alvo.dispose();
    this.fotos.length = 0;
  }
}
