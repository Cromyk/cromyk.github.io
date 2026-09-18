import * as THREE from 'three';
import { CONDICOES, type Condicao } from './condicao';

/**
 * A condição de status vista no CORPO do bicho, e não só na pílula.
 *
 * ## Por que a pílula não bastava
 *
 * A barra de vida já mostra a sigla — PAR, ZZ, QMD, VEN — e isso resolve para
 * quem está olhando a barra. Em VR, quase nunca se está: numa briga a três
 * metros, com dois selvagens na sala, o olho fica no BICHO. A barra flutua
 * sobre ele e some do campo de visão no instante em que você se abaixa para
 * arremessar.
 *
 * Então a condição precisa estar onde o olho já está. É a mesma razão do número
 * de dano sair do corpo em vez da barra (item 2.2 do roteiro): em realidade
 * misturada, informação presa a um painel é informação que você tem de ir
 * buscar.
 *
 * ## Cada uma tem a sua forma, e a forma é a mensagem
 *
 * - **sono** — bolhas que sobem devagar e somem no alto. Lento e calmo: é o
 *   único estado em que não há pressa.
 * - **paralisia** — fagulhas que piscam rápido e irregular em volta do corpo.
 *   A irregularidade é o ponto; eletricidade não tem compasso.
 * - **queimadura** — as mesmas fagulhas, mas subindo e quentes.
 * - **veneno** — bolhas pesadas que sobem pouco e caem.
 *
 * Todas as quatro são o MESMO objeto com números diferentes, porque em VR o que
 * se distingue a três metros é cor, ritmo e direção — não silhueta. Quatro
 * geometrias diferentes custariam quatro vezes mais e leriam igual.
 *
 * ## O custo
 *
 * Seis sprites por bicho afetado, com a textura compartilhada de `src/fogo.ts`.
 * Só existem enquanto a condição existe, e só uma condição existe por vez.
 */

/** Quantas partículas. Seis é o mínimo que lê como "vários" a três metros. */
const QUANTAS = 6;

let textura: THREE.Texture | null = null;

/**
 * O mesmo borrão da chama, e de propósito.
 *
 * Uma textura por efeito seria uma textura a mais na VRAM para desenhar a mesma
 * mancha redonda. Ela é criada aqui de novo (e não importada de src/fogo.ts)
 * porque aquela é interna àquele módulo — duplicar dez linhas custa menos do
 * que abrir o miolo de um módulo para o outro.
 */
function texturaDeParticula(): THREE.Texture {
  if (textura) return textura;

  const lado = 32;
  const dados = new Uint8Array(lado * lado * 4);
  const meio = (lado - 1) / 2;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const d = Math.min(1, Math.hypot(x - meio, y - meio) / meio);
      // Miolo branco que cai depressa: com blending aditivo, é o que lê como
      // brilho em vez de mancha.
      const a = Math.max(0, 1 - d) ** 1.6;
      const p = (y * lado + x) * 4;
      dados[p] = 255;
      dados[p + 1] = 255;
      dados[p + 2] = 255;
      dados[p + 3] = Math.round(a * 255);
    }
  }

  textura = new THREE.DataTexture(dados, lado, lado, THREE.RGBAFormat);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.minFilter = THREE.LinearFilter;
  textura.magFilter = THREE.LinearFilter;
  textura.needsUpdate = true;
  return textura;
}

/** Como cada condição se move. É isto que as distingue de longe. */
const JEITO: Record<Condicao, { subida: number; pressa: number; espalha: number; piscar: boolean }> = {
  // Sobe alto e devagar, e não pisca: sono é a ausência de agitação.
  sono: { subida: 1.0, pressa: 0.5, espalha: 0.35, piscar: false },
  // Fica em volta do corpo, rápido e piscando: eletricidade não tem compasso.
  paralisia: { subida: 0.15, pressa: 3.2, espalha: 0.75, piscar: true },
  queimadura: { subida: 0.8, pressa: 1.6, espalha: 0.5, piscar: false },
  // Sobe pouco e pesado, como bolha em líquido denso.
  veneno: { subida: 0.4, pressa: 0.8, espalha: 0.6, piscar: false },
};

export class MarcaDeCondicao {
  readonly grupo = new THREE.Group();

  private particulas: THREE.Sprite[] = [];
  private materiais: THREE.SpriteMaterial[] = [];
  private tempo = 0;
  private condicao: Condicao | null = null;

  constructor(private readonly altura: number) {
    const mapa = texturaDeParticula();
    for (let i = 0; i < QUANTAS; i++) {
      const material = new THREE.SpriteMaterial({
        map: mapa,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(material);
      sprite.frustumCulled = false;
      // Cada uma no seu ponto do ciclo: seis partículas em fase são um piscar
      // só, e seis fora de fase são um enxame.
      sprite.userData.fase = i / QUANTAS;
      sprite.userData.giro = (i / QUANTAS) * Math.PI * 2;
      this.materiais.push(material);
      this.particulas.push(sprite);
      this.grupo.add(sprite);
    }
    this.grupo.visible = false;
  }

  /**
   * `null` apaga. Trocar de condição reconfigura cor e jeito na hora.
   */
  definir(condicao: Condicao | null) {
    if (condicao === this.condicao) return;
    this.condicao = condicao;
    this.grupo.visible = condicao !== null;
    if (!condicao) return;

    const cor = CONDICOES[condicao].cor;
    for (const m of this.materiais) m.color.setHex(cor);
  }

  atualizar(dt: number) {
    if (!this.condicao) return;
    this.tempo += dt;

    const jeito = JEITO[this.condicao];
    const raio = this.altura * 0.42 * jeito.espalha;
    const tamanho = this.altura * 0.12;

    for (const sprite of this.particulas) {
      const fase = sprite.userData.fase as number;
      const giro = sprite.userData.giro as number;
      const t = (this.tempo * jeito.pressa * 0.5 + fase) % 1;

      const anguloAgora = giro + this.tempo * (this.condicao === 'paralisia' ? 2.4 : 0.6);
      sprite.position.set(
        Math.cos(anguloAgora) * raio,
        this.altura * (0.35 + t * jeito.subida * 0.6),
        Math.sin(anguloAgora) * raio,
      );

      // Entra e sai suave; a paralisia pisca por cima disso, com um período que
      // não é múltiplo do ciclo — é o que faz parecer errático em vez de
      // pulsado.
      let opacidade = Math.sin(t * Math.PI) ** 0.6;
      if (jeito.piscar) opacidade *= Math.sin(this.tempo * 19 + giro * 3) > -0.2 ? 1 : 0.15;
      sprite.material.opacity = opacidade * 0.85;
      sprite.scale.setScalar(tamanho * (0.7 + (1 - t) * 0.5));
    }
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const m of this.materiais) m.dispose();
  }
}
