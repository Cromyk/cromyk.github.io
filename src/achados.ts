import * as THREE from 'three';
import { ItemNaMao } from './isca';
import { ITENS, type TipoItem } from './itens';
import type { Sala } from './room';

/**
 * Itens que aparecem em cima dos móveis do seu quarto — item 3.2 do roteiro.
 *
 * ## A espiral que isto quebra
 *
 * `ganharItem` só era chamado de um lugar: `premiarCaptura()`. Escrito assim
 * parece razoável, e como jogo é uma espiral descendente:
 *
 *     poção só vem de capturar · capturar com o time machucado é mais difícil ·
 *     difícil de capturar significa menos poção
 *
 * Não é o beco sem saída que as pokébolas eram — dá para capturar sem poção —,
 * mas é pior justamente para quem está perdendo. Quem mais precisa de ajuda é
 * quem menos recebe.
 *
 * ## Por que na SALA, e não numa recarga por tempo
 *
 * Uma recarga por relógio resolveria o balanço e não acrescentaria nada. Isto
 * usa o que o jogo tem de mais próprio: ele já mapeou a sua mesa, já sabe a
 * altura dela, e já pede que você ande pelo cômodo — mas até agora não
 * recompensava andar. Uma poção em cima da mesa DE VERDADE, que você pega
 * esticando o braço, é a única coisa desta lista que nenhum outro jogo pode
 * fazer.
 *
 * ## As regras que mantêm isto discreto
 *
 * Um item por vez no cômodo, nunca a menos de um metro e meio de você quando
 * nasce (senão ele aparece dentro do seu campo de visão, do nada), e só em
 * superfície ELEVADA — mesa, sofá, estante. No chão ele viraria lixo no
 * carpete; em cima de um móvel ele parece uma coisa que alguém deixou ali.
 */

/** Quanto tempo entre um achado e o próximo, em segundos. */
const INTERVALO_MIN = 75;
const INTERVALO_MAX = 150;
/** Quão perto a mão precisa chegar para pegar. Generoso: é um alvo pequeno. */
export const ALCANCE_ACHADO = 0.17;
/** Quanto tempo ele espera por você antes de sumir. */
const PACIENCIA = 180;

/**
 * O que pode aparecer, e com que frequência relativa.
 *
 * A poção é a razão de isto existir, então ela domina. A fruta ajuda a capturar
 * e é o segundo motivo para andar. O doce é raro em todo lugar e continua raro
 * aqui — achar um no chão da cozinha tem de ser um acontecimento.
 *
 * Pedras não entram: elas são a recompensa de capturar, e achar uma em cima da
 * geladeira esvaziaria o sentido delas.
 */
const SORTEIO: ReadonlyArray<{ id: string; peso: number }> = [
  { id: 'pocao', peso: 6 },
  { id: 'fruta', peso: 3 },
  { id: 'doce', peso: 0.35 },
];

export class Achados {
  private atual: { objeto: ItemNaMao; tipo: TipoItem; idade: number } | null = null;
  private espera = 25;
  private brilho: THREE.PointLight | null = null;

  constructor(private readonly cena: THREE.Object3D) {}

  /** O item que está na sala agora, para o jogo desenhar a dica. */
  get tipoNaSala(): TipoItem | null {
    return this.atual?.tipo ?? null;
  }

  get posicao(): THREE.Vector3 | null {
    return this.atual?.objeto.grupo.position ?? null;
  }

  atualizar(dt: number, sala: Sala, jogador: THREE.Vector3) {
    if (this.atual) {
      this.atual.idade += dt;
      this.atual.objeto.atualizar(dt, false);
      // Sobe e desce devagar, para o olho pegar de canto. Um objeto de dez
      // centímetros parado em cima de um móvel, num quarto de verdade, é
      // invisível — ele se confunde com as suas próprias coisas.
      const t = this.atual.idade;
      this.atual.objeto.grupo.position.y += Math.sin(t * 1.6) * dt * 0.012;
      if (this.brilho) this.brilho.intensity = 0.35 + Math.sin(t * 2.2) * 0.18;

      if (this.atual.idade > PACIENCIA) this.recolher();
      return;
    }

    this.espera -= dt;
    if (this.espera > 0) return;
    this.tentarNascer(sala, jogador);
  }

  /**
   * A mão chegou perto? Devolve o item e limpa a sala.
   *
   * Quem chama decide o que fazer com ele — creditar na mochila, avisar, tocar
   * o som. Esta classe só sabe pôr e tirar coisas de cima dos móveis.
   */
  colher(ponto: THREE.Vector3): TipoItem | null {
    if (!this.atual) return null;
    const onde = this.atual.objeto.grupo.getWorldPosition(_mundo);
    if (onde.distanceTo(ponto) > ALCANCE_ACHADO) return null;
    const tipo = this.atual.tipo;
    this.recolher();
    return tipo;
  }

  private tentarNascer(sala: Sala, jogador: THREE.Vector3) {
    // Só em cima de móvel: `movel` é a mesma preferência que os bichos pequenos
    // usam, e ela já evita o chão e o alto demais.
    const local = sala.pontoDeSpawn(jogador, 1.5, 6, 'movel');
    if (!local) {
      // Sem móvel mapeado ainda. Tenta de novo daqui a pouco, sem gastar o
      // intervalo cheio — num quarto que ainda está sendo mapeado, o móvel pode
      // aparecer a qualquer passo.
      this.espera = 12;
      return;
    }
    if (local.rotulo === 'floor') {
      this.espera = 12;
      return;
    }

    const tipo = this.sortear();
    if (!tipo) {
      this.espera = INTERVALO_MIN;
      return;
    }

    const objeto = new ItemNaMao(tipo, false);
    objeto.grupo.position.copy(local.ponto);
    // Um dedo acima da superfície: pousado, não afundado nela.
    objeto.grupo.position.y += 0.03;
    objeto.grupo.scale.setScalar(1.35);
    this.cena.add(objeto.grupo);

    // Uma luz fraca e curta, que é o que faz o objeto ser NOTADO num quarto
    // iluminado por acaso. É a única luz dinâmica do jogo, e ela existe uma por
    // vez — ver o comentário da classe.
    this.brilho = new THREE.PointLight(tipo.cor, 0.4, 0.8, 2);
    objeto.grupo.add(this.brilho);

    this.atual = { objeto, tipo, idade: 0 };
  }

  private sortear(): TipoItem | null {
    const total = SORTEIO.reduce((soma, s) => soma + s.peso, 0);
    let alvo = Math.random() * total;
    for (const s of SORTEIO) {
      alvo -= s.peso;
      if (alvo <= 0) return ITENS.find((i) => i.id === s.id) ?? null;
    }
    return null;
  }

  private recolher() {
    if (!this.atual) return;
    this.brilho?.removeFromParent();
    this.brilho = null;
    this.atual.objeto.descartar();
    this.atual = null;
    this.espera = INTERVALO_MIN + Math.random() * (INTERVALO_MAX - INTERVALO_MIN);
  }

  descartar() {
    this.recolher();
    this.espera = Infinity;
  }
}

const _mundo = new THREE.Vector3();
