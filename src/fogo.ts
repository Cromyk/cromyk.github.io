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
  /**
   * Em que osso pendurar. Vazio quando o modelo não tem esqueleto — aí vale a
   * `ancora`, e as duas nunca são usadas juntas.
   */
  ossos?: Chave[];
  /**
   * Onde a chama fica quando NÃO HÁ OSSO, em fração da altura do bicho: x para
   * o lado, y do pé para cima, z da traseira para a frente.
   *
   * ## Por que isto existe
   *
   * Nem todo rip tem esqueleto. `node tools/diag-fogo.mjs ponyta` devolve lista
   * vazia, e o mesmo vale para Magmar — os dois Pokémon de fogo mais óbvios
   * depois dos Charmanders ficaram sem chama nenhuma por isso, com a tabela
   * dizendo, com razão, que escolher um ponto fixo de memória é palpite.
   *
   * ## De onde vêm estes números
   *
   * De `node tools/brasa.mjs`, que pergunta ao arquivo. Os rips NOMEIAM a
   * chama: Magmar tem `FireCoreA_mat` e `FireStenA_mat`, Rapidash tem
   * `FireCoreA` e `FireStenA`, e no Ponyta ela mora num material chamado
   * `Hair`. A ferramenta junta os vértices desses materiais em aglomerados e
   * imprime o centroide de cada um em fração da altura — que é exatamente a
   * unidade desta tabela, e a mesma em que a `boca` do corpo é posicionada.
   *
   * O custo de não ter osso continua sendo real e está aceito: a chama fica
   * PARADA em relação ao corpo. Ela respira e pisca, mas não balança junto com
   * o rabo, porque não há rabo que balance — estes modelos não animam nada.
   */
  ancora?: readonly [number, number, number];
  /** Fração da altura do bicho. A chama do Charmander é ~1/5 dele. */
  fracao: number;
  cor?: number;
  /**
   * Descer pela cadeia de ossos até o mais distante antes de pendurar.
   *
   * Existe porque o rig conhece três vértebras de cauda e os rips têm mais: a
   * do Charmander tem NOVE ossos (`tail1`…`tail6`, depois `taila01`…`taila03`),
   * e `cauda3` — o mais fundo que o rig nomeia — é o terceiro de nove, ou seja,
   * ainda perto do corpo. Pendurar ali põe a chama no meio do rabo, que é onde
   * ela estava aparecendo.
   *
   * Falso na crina do Rapidash: lá o osso mapeado é o pescoço, e o mais
   * distante dele é a ponta do focinho.
   */
  ponta?: boolean;
}

export const FOGO_POR_ESPECIE: Readonly<Record<string, readonly PontoDeFogo[]>> = {
  charmander: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.16, ponta: true }],
  charmeleon: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.15, ponta: true }],
  charizard: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.13, ponta: true }],
  // A crina vai no OSSO do pescoço, que o rig conhece. A cauda não tem osso que
  // sirva — o rip nomeia as mechas dela `taila01`…`tailh03`, e nenhuma bate com
  // os candidatos do rig —, então ela vai por âncora, no ponto que a
  // `tools/brasa.mjs` mediu nos vértices de `FireCoreA`: y=0,647 e z=−0,412,
  // que é o alto da garupa, atrás.
  rapidash: [
    { ossos: ['pescoco', 'cabeca'], fracao: 0.45, cor: 0xffa02a },
    { ancora: [0, 0.65, -0.41], fracao: 0.22, cor: 0xffa02a },
  ],
  // Moltres é uma ave DE fogo: a cauda dele é chama do começo ao fim.
  // Fração menor que a das outras aves de fogo porque a chama dele fica na
  // BASE da cauda, não na ponta: o rip não liga o osso `tail` ao resto do rabo
  // (`tools/diag-fogo.mjs` diz SEM CADEIA). Uma chama de meia altura ali vira
  // uma bola de fogo no meio do corpo.
  moltres: [{ ossos: ['cauda3', 'cauda2', 'cauda1'], fracao: 0.3, cor: 0xffb03a, ponta: true }],

  // Ponyta e Magmar NÃO TÊM ESQUELETO nenhum nestes arquivos — por isso ficaram
  // de fora até 18/09, com a observação de que um ponto fixo escolhido a olho
  // seria palpite. O que mudou não foi a disposição de chutar: foi passar a
  // MEDIR, com `tools/brasa.mjs`, os vértices que o próprio rip declara como
  // chama. Os números abaixo são centroides de aglomerados, não impressões.
  //
  // Ponyta tem duas: a crina, à frente e no alto (1.748 vértices em y=0,772 e
  // z=+0,318), e a cauda, atrás (3.103 vértices entre y=0,40 e y=0,62, em
  // z≈−0,20, com o centro visual no alto da garupa). As quatro patas também são fogo e ficam de fora: são mais quatro
  // chamas de três sprites cada num bicho que já tem duas, e o que elas
  // acrescentam à silhueta a meio metro do rosto não paga o quadro.
  ponyta: [
    { ancora: [0, 0.77, 0.32], fracao: 0.26, cor: 0xffa83a },
    { ancora: [0, 0.52, -0.2], fracao: 0.28, cor: 0xffa83a },
  ],
  // Magmar é uma chama só, e é o rabo: os 534 vértices de `FireCoreA_mat` e
  // `FireStenA_mat` estão todos em z≈−0,30, subindo de y=0,09 a y=0,31. A
  // âncora é o centroide ponderado dos dois aglomerados.
  magmar: [{ ancora: [0, 0.15, -0.3], fracao: 0.28, cor: 0xff7a2a }],
};

export const temFogo = (id: string) => id in FOGO_POR_ESPECIE;

/**
 * O osso mais distante deste, seguindo só ossos. A ponta da cauda.
 *
 * Distância no MUNDO, e não profundidade na árvore, porque as caudas se
 * ramificam: a do Charizard abre em `endtail7` e `taila01`, e a mais funda em
 * número de nós nem sempre é a que vai mais longe. O que se quer é o ponto do
 * esqueleto mais afastado de onde se começou, que é o que uma ponta é.
 *
 * Exige `updateMatrixWorld` feito por quem chama — o resultado depende das
 * matrizes de mundo dos ossos.
 */
export function pontaDaCadeia(osso: THREE.Object3D): THREE.Object3D {
  const origem = osso.getWorldPosition(new THREE.Vector3());
  let melhor = osso;
  let maior = 0;
  const ponto = new THREE.Vector3();

  osso.traverse((no) => {
    if (no === osso || !(no as THREE.Bone).isBone) return;
    const d = no.getWorldPosition(ponto).distanceTo(origem);
    if (d > maior) {
      maior = d;
      melhor = no;
    }
  });

  return melhor;
}
