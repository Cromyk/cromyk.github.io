import * as THREE from 'three';
import type { Chave } from './rig';

/**
 * O fogo dos Pokémon de fogo.
 *
 * Os rips não trazem fogo: trazem a FORMA do fogo, uma malha em bico pintada de
 * laranja, parada, presa na ponta da cauda. De longe passa; a meio metro do
 * rosto, em passthrough, é uma escultura de plástico — e a chama do Charmander
 * é o traço que mais define o bicho.
 *
 * ## Por que sprite, e não partículas nem shader
 *
 * O orçamento é um Quest 3S desenhando a cena duas vezes por quadro, com até
 * quatro bichos em campo. Um sistema de partículas custa um buffer que se
 * reescreve todo quadro na CPU; um shader de ruído custa ALU por pixel numa
 * GPU móvel que já está no limite. Três sprites custam três quads e nenhuma
 * conta por pixel além do blend — e sprite é billboard de graça, então a chama
 * nunca é vista de lado, que é o jeito de uma chama chapada se denunciar.
 *
 * A textura é UMA, gerada no primeiro uso e compartilhada por todas as chamas
 * do jogo. O que difere um quadro do outro é escala, giro e opacidade, que são
 * três números por sprite.
 *
 * ## Como ela gruda no bicho
 *
 * A chama entra como FILHA do osso da cauda. Isso resolve de graça o problema
 * que apareceria de outro jeito: a cauda balança na animação procedural, e
 * qualquer coisa que copiasse a posição dela quadro a quadro chegaria um quadro
 * atrasada — uma chama que persegue a cauda em vez de estar nela.
 */

/**
 * A textura da chama: um borrão quente, mais claro no miolo.
 *
 * Escrita pixel a pixel numa `DataTexture` em vez de desenhada num `<canvas>`
 * de propósito. O canvas exigiria `document`, e este módulo é alcançado pelo
 * conjunto de verificações (`tools/smoke.ts`), que roda no Node e não tem DOM —
 * um Charmander que só pode nascer dentro de um navegador é um Charmander que
 * nenhum teste consegue criar.
 *
 * As paradas são as de um gradiente radial comum, interpoladas à mão. O miolo
 * branco é o que faz a cor aditiva ler como FOGO e não como um vidro colorido:
 * fogo de verdade satura para o branco no centro, não para o tom mais forte da
 * própria cor.
 */
let textura: THREE.Texture | null = null;

const PARADAS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.0, 255, 255, 255, 255],
  [0.25, 255, 238, 170, 242],
  [0.55, 255, 140, 40, 140],
  [1.0, 255, 60, 0, 0],
];

function texturaDeChama(): THREE.Texture {
  if (textura) return textura;

  const lado = 64;
  const dados = new Uint8Array(lado * lado * 4);
  const meio = (lado - 1) / 2;

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const d = Math.min(1, Math.hypot(x - meio, y - meio) / meio);
      let i = 1;
      while (i < PARADAS.length - 1 && d > PARADAS[i][0]) i++;
      const a = PARADAS[i - 1];
      const b = PARADAS[i];
      const t = (d - a[0]) / Math.max(b[0] - a[0], 1e-6);
      const p = (y * lado + x) * 4;
      for (let c = 0; c < 4; c++) dados[p + c] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * t);
    }
  }

  textura = new THREE.DataTexture(dados, lado, lado, THREE.RGBAFormat);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.minFilter = THREE.LinearFilter;
  textura.magFilter = THREE.LinearFilter;
  textura.needsUpdate = true;
  return textura;
}

/** Quantas línguas de fogo. Três é o mínimo que lê como chama viva. */
const LINGUAS = 3;

export class Chama {
  readonly grupo = new THREE.Group();
  private linguas: THREE.Sprite[] = [];
  private materiais: THREE.SpriteMaterial[] = [];
  private tempo = Math.random() * 10;

  constructor(
    /** Altura da chama em metros, já na escala do bicho dentro do quarto. */
    private readonly tamanho: number,
    cor = 0xff7a2a,
  ) {
    const mapa = texturaDeChama();

    for (let i = 0; i < LINGUAS; i++) {
      const material = new THREE.SpriteMaterial({
        map: mapa,
        color: cor,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // Sem tom mapping: a chama é uma fonte de luz, e passá-la pelo ACES do
        // resto da cena a deixaria com o mesmo cinza-laranja de um objeto
        // iluminado — que é exatamente a aparência que se está corrigindo.
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.frustumCulled = false;
      // As línguas se desencontram no tempo para não pulsarem juntas: três
      // coisas pulsando em fase leem como uma coisa só piscando.
      sprite.userData.fase = (i / LINGUAS) * Math.PI * 2;
      sprite.userData.escala = 1 - i * 0.22;
      this.materiais.push(material);
      this.linguas.push(sprite);
      this.grupo.add(sprite);
    }
  }

  /**
   * `dt` em segundos. A chama sobe, afina e some, e recomeça de baixo — três
   * vezes fora de fase, o que dá o movimento contínuo sem guardar estado por
   * partícula.
   */
  atualizar(dt: number) {
    this.tempo += dt;
    for (const sprite of this.linguas) {
      const fase = sprite.userData.fase as number;
      const base = sprite.userData.escala as number;
      // Ciclo de 0 a 1, cada língua no seu ponto dele.
      const t = ((this.tempo * 1.9 + fase) % (Math.PI * 2)) / (Math.PI * 2);

      const largura = this.tamanho * base * (1 - t * 0.55);
      sprite.scale.set(largura * 0.8, largura * (1 + t * 0.5), 1);
      // Sobe pouco: uma chama presa a uma cauda lambe, não solta fagulha.
      sprite.position.set(
        Math.sin((this.tempo + fase) * 3.1) * this.tamanho * 0.09,
        t * this.tamanho * 0.55,
        Math.cos((this.tempo + fase) * 2.3) * this.tamanho * 0.09,
      );
      // Entra forte e sai apagando: `sin` dá os dois lados com uma conta só.
      (sprite.material as THREE.SpriteMaterial).opacity = 0.9 * Math.sin(t * Math.PI) ** 0.7;
    }
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const m of this.materiais) m.dispose();
  }
}

/**
 * Onde cada espécie queima.
 *
 * Só entram os que têm fogo VISÍVEL no corpo — a chama da cauda, a crina, as
 * asas. Um Flareon é de fogo e não está aqui: a juba dele é pelo, e pôr fogo
 * nela seria inventar um bicho que não existe. A regra é o desenho, não o tipo.
 *
 * `osso` cai para o primeiro que o modelo tiver: nem todo rip nomeia as três
 * vértebras da cauda, e a ponta é a última que existir.
 */
export interface PontoDeFogo {
  ossos: Chave[];
  /** Fração da altura do bicho. A chama do Charmander é ~1/5 dele. */
  fracao: number;
  cor?: number;
}

export const FOGO_POR_ESPECIE: Readonly<Record<string, readonly PontoDeFogo[]>> = {
  charmander: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.2 }],
  charmeleon: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.19 }],
  charizard: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.16 }],
  // Só a crina: a cauda do Rapidash é fogo também, mas o rip nomeia as mechas
  // dela `taila01`…`tailh03`, e nenhuma bate com os candidatos de cauda do
  // rig. Ensinar o rig a ler esses nomes mexeria na animação de cauda de todo
  // mundo para ganhar uma chama — a troca não compensa.
  rapidash: [{ ossos: ['pescoco', 'cabeca'], fracao: 0.45, cor: 0xffa02a }],
  // Moltres é uma ave DE fogo: a cauda dele é chama do começo ao fim.
  moltres: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.5, cor: 0xffb03a }],

  // Ficam de fora, e é bom estar escrito por quê: **Ponyta e Magmar não têm
  // esqueleto nenhum** nestes arquivos (`tools/diag-fogo.mjs ponyta` devolve
  // lista vazia). Sem osso não há onde pendurar, e a alternativa — um ponto
  // fixo no corpo, medido a olho — é palpite: erra o lugar e a chama sai do
  // pescoço do cavalo. Quando forem feitos, que seja com a folha de contato
  // aberta para conferir, não de memória.
};

export const temFogo = (id: string) => id in FOGO_POR_ESPECIE;
