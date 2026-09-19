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
 *
 * ## Pegar é um GESTO, não uma colisão
 *
 * Por um tempo `colher` foi chamado do laço de quadro: bastava a mão PASSAR
 * perto e a poção sumia — creditada, com som e cartaz, sem você ter feito
 * nada. Um item que se pega sozinho não é um item que você achou; é um item
 * que aconteceu com você, e ele ensina o gesto errado.
 *
 * Agora `colher` só é chamado pela cascata do GRIP, como tudo o mais que se
 * pega no jogo, e a aproximação tem resposta ANTES (`aproximar`): o objeto
 * cresce e acende conforme a mão chega, e a mão sente a textura do toque.
 * Nessa ordem, e não na inversa — senão a troca é "pega sozinho" por "não
 * pega e você não sabe por quê", que é pior.
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

/** O tamanho do achado em cima do móvel: maior que na mão, para ser visto. */
const ESCALA_DO_ACHADO = 1.35;

export class Achados {
  private atual: { objeto: ItemNaMao; tipo: TipoItem; idade: number } | null = null;
  private espera = 25;
  private brilho: THREE.PointLight | null = null;
  /** Quanto a mão está perto, neste quadro. Ver `aproximar`. */
  private chamando = 0;

  constructor(private readonly cena: THREE.Object3D) {}

  /** O item que está na sala agora, para o jogo desenhar a dica. */
  get tipoNaSala(): TipoItem | null {
    return this.atual?.tipo ?? null;
  }

  /**
   * Onde o achado está, em coordenadas de MUNDO.
   *
   * De mundo, e não a `position` local que estava aqui antes: quem mede a
   * distância da mão mede em mundo, e devolver a local faria a conta certa
   * só enquanto a cena estivesse na origem sem rotação — o que é verdade
   * hoje e é exatamente o tipo de coisa que deixa de ser sem avisar.
   */
  get posicao(): THREE.Vector3 | null {
    return this.atual ? this.atual.objeto.grupo.getWorldPosition(_onde) : null;
  }

  /**
   * A mão está chegando nele, com esta força (0 a 1).
   *
   * Escrito pelo jogo a cada quadro e consumido no próprio quadro — como o
   * `rocar` da mão e o `aproximar` da pokébola caída, e pelo mesmo motivo: é
   * amplitude, não evento. Vários sistemas podem escrever no mesmo quadro, e
   * o que vale é o maior.
   */
  aproximar(forca: number) {
    this.chamando = Math.max(this.chamando, Math.min(1, Math.max(0, forca)));
  }

  atualizar(dt: number, sala: Sala, jogador: THREE.Vector3) {
    if (this.atual) {
      this.atual.idade += dt;
      const t = this.atual.idade;

      // A mão chegando: ele cresce e acende. É o aviso de que o gesto vai
      // funcionar, e ele precisa existir ANTES de o gesto funcionar — um alvo
      // de dez centímetros em cima de um móvel de verdade, sem resposta à
      // aproximação, é indistinguível de um alvo que não responde a nada.
      //
      // Antes do `objeto.atualizar`, e não depois: é ele quem escreve a escala
      // no grupo. Escrever a base depois custaria um quadro de atraso, que é
      // pouco no papel e é a diferença entre o objeto responder à mão e o
      // objeto responder a onde a mão estava.
      this.atual.objeto.escalaBase = ESCALA_DO_ACHADO * (1 + this.chamando * 0.18);
      if (this.brilho) {
        this.brilho.intensity = 0.35 + Math.sin(t * 2.2) * 0.18 + this.chamando * 0.6;
      }
      this.chamando = 0;

      this.atual.objeto.atualizar(dt, false);
      // Sobe e desce devagar, para o olho pegar de canto. Um objeto de dez
      // centímetros parado em cima de um móvel, num quarto de verdade, é
      // invisível — ele se confunde com as suas próprias coisas.
      this.atual.objeto.grupo.position.y += Math.sin(t * 1.6) * dt * 0.012;

      if (this.atual.idade > PACIENCIA) this.recolher();
      return;
    }

    this.espera -= dt;
    if (this.espera > 0) return;
    this.tentarNascer(sala, jogador);
  }

  /**
   * A mão fechou perto? Devolve o item e limpa a sala.
   *
   * Chamado pela cascata do GRIP, e só por ela: ver o cabeçalho. Quem chama
   * decide o que fazer com o item — creditar na mochila, avisar, tocar o som.
   * Esta classe só sabe pôr e tirar coisas de cima dos móveis.
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
    // Pela `escalaBase`, e não pela escala do grupo: `ItemNaMao.atualizar`
    // escreve a escala todo quadro, e escrever aqui durava um quadro só.
    objeto.escalaBase = ESCALA_DO_ACHADO;
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
    this.chamando = 0;
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
const _onde = new THREE.Vector3();
