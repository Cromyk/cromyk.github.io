import * as THREE from 'three';
import type { Corpo } from './modelos';
import { CIMA, FRENTE, LADO, Rig, normalizar } from './rig';

/**
 * A animação dos Pokémon: o que faz o bicho andar, atacar, olhar em volta,
 * acenar e derreter de cafuné.
 *
 * ## Por que é procedural
 *
 * Dos 151 arquivos, dezenove trazem clipe assado e só UM traz um conjunto
 * utilizável: o Bulbasaur, com `walk`, `run`, `aidle`, `fight` e `ko`. O
 * Charmander e o Squirtle chegam com o esqueleto inteiro e zero clipes; o
 * Pikachu tem um só, o "Impactrueno". Esperar por clipes que não existem
 * deixaria os quatro iniciais parados como estátua.
 *
 * Então a animação é escrita em osso, aqui, uma vez para todos — e quem tem
 * clipe assado usa o clipe, porque um `walk` feito pela Game Freak é melhor do
 * que qualquer ciclo que a gente monte com seno. Os dois convivem: o clipe roda
 * no mixer e a pose procedural entra por cima com peso, o que deixa o Bulbasaur
 * acenar (gesto que nenhum arquivo tem) sem perder o andar dele.
 *
 * ## As poses
 *
 * Uma POSE BASE de cada vez — parado, andando, correndo, desmaiado — com
 * transição suave entre elas, e por cima um GESTO momentâneo com envelope
 * próprio: atacar, cafuné, acenar, olhar em volta, comemorar, apanhar.
 *
 * O jogo pede o gesto; as variações de ócio (olhar e acenar sozinho, de vez em
 * quando) nascem aqui dentro, porque são da vida do bicho e não do comando de
 * ninguém.
 *
 * ## O sentido do eixo LADO (+X), que é onde quase toda pose escreve
 *
 * Girar em +X positivo leva +Y para +Z. As consequências mudam de osso para
 * osso, e confundi-las foi o erro que fez todo ataque RECUAR no golpe em vez de
 * avançar:
 *
 * - **tronco, peito, pescoço** apontam para CIMA (+Y): positivo inclina para a
 *   FRENTE.
 * - **a cabeça** aponta para a FRENTE (+Z): positivo baixa o focinho.
 * - **braços, coxas e cauda** apontam para BAIXO (−Y): positivo joga para TRÁS.
 *
 * Ou seja: num mesmo golpe, o tronco avança com sinal positivo e o braço avança
 * com sinal negativo. Não há como unificar isso sem inventar um eixo por osso;
 * o que dá para fazer é deixar escrito.
 */

export type Base = 'parado' | 'andando' | 'correndo' | 'desmaiado';

/**
 * Como o corpo ataca. Um gesto por família de golpe.
 *
 * Antes havia um só — recolhe e joga o corpo para a frente — e ele servia para
 * tudo. Funcionava como "ele atacou" e não dizia mais nada: uma Lambida, um
 * Arranhão e um Lança-Chamas eram o mesmo movimento com uma partícula diferente
 * na frente, e o jogador não tinha como saber o que estava vendo sem ler o
 * texto. Qual gesto cada golpe usa vem de src/golpes.gen.ts.
 */
export type GestoDeAtaque =
  /** Cabeça para a frente, boca escancarada. Lambida, Mordida, Presa Hiper. */
  | 'mordida'
  /** O braço varre na diagonal. Arranhão, Talho, Golpes Furiosos. */
  | 'garra'
  /** A cauda chicoteia de um lado ao outro. Chicote de Cauda, Enrolar, Surra. */
  | 'cauda'
  /** Jab do braço. Megassoco, Soco de Fogo, Golpe de Caratê. */
  | 'soco'
  /** Salta e desce com o pé. Chute Voador, Pisão, Joelhada. */
  | 'salto'
  /** O corpo inteiro se joga. Investida, Cabeçada, Derrubada. */
  | 'investida'
  /** Inspira, arqueia e cospe. Todo golpe elemental de longe. */
  | 'sopro'
  /** Sem gesto de corpo: só a aura. Rosnar, Encarar, Endurecer. */
  | 'aura';

export type Gesto = GestoDeAtaque | 'cafune' | 'acenar' | 'olhar' | 'comemorar' | 'apanhar';

/** Todos os gestos que são um ataque — o resto é vida social. */
export const ATAQUES: ReadonlySet<Gesto> = new Set<Gesto>([
  'mordida',
  'garra',
  'cauda',
  'soco',
  'salto',
  'investida',
  'sopro',
  'aura',
]);

export const ehAtaque = (g: Gesto): g is GestoDeAtaque => ATAQUES.has(g);

/** Papéis que um clipe assado pode preencher, e como reconhecê-lo pelo nome. */
const PAPEIS: Array<{ papel: Base | Gesto; padrao: RegExp; laco: boolean }> = [
  { papel: 'andando', padrao: /(^|[^a-z])walk/, laco: true },
  { papel: 'correndo', padrao: /(^|[^a-z])run/, laco: true },
  { papel: 'desmaiado', padrao: /(ko|faint|down)$/, laco: false },
  { papel: 'investida', padrao: /fight|attack|impactrueno|trueno|thunderbolt|appeal/, laco: false },
  { papel: 'comemorar', padrao: /jump_s|jump_e|happy|joy/, laco: false },
  // O ócio vem por último de propósito: `aidle` e `wait` são os nomes mais
  // genéricos do lote e pegariam clipes melhores se testados antes.
  { papel: 'parado', padrao: /idle|wait/, laco: true },
];

/** Quanto tempo cada gesto dura, em segundos, quando o jogo não diz outra coisa. */
const DURACAO: Record<Gesto, number> = {
  // Os ataques duram quase o mesmo: o ritmo da briga é do jogo, não do gesto.
  // O sopro é o mais longo porque ele tem uma inspiração antes do golpe.
  investida: 0.7,
  mordida: 0.66,
  garra: 0.6,
  cauda: 0.66,
  soco: 0.55,
  salto: 0.85,
  sopro: 0.95,
  aura: 0.7,
  cafune: 1.5,
  acenar: 1.9,
  olhar: 2.4,
  comemorar: 1.2,
  apanhar: 0.45,
};

export interface Contexto {
  /** Metros por segundo no plano. É o que escolhe entre parado, andar e correr. */
  velocidade: number;
  /** 0..1 — quanto mais nervoso, mais rápido e mais miúdo o movimento. */
  alarme: number;
  /** 0..1 — pouca vida deixa a pose mais caída. */
  vida: number;
  /** Para onde a cabeça deve olhar, em espaço da criatura. Null solta o pescoço. */
  encarar: number | null;
  desmaiado: boolean;
}

/** Acima desta velocidade, em m/s, a base vira corrida. */
const FASE_CORRIDA = 1.15;

export class Animador {
  readonly rig: Rig;
  /** Falso quando o modelo não tem esqueleto reconhecível — um Ditto, um Voltorb. */
  readonly temRig: boolean;

  private mixer: THREE.AnimationMixer | null;
  private clipes = new Map<Base | Gesto, THREE.AnimationAction>();
  private acaoAtual: THREE.AnimationAction | null = null;
  /** Clipe cujo primeiro quadro vai virar a pose de descanso. Ver emprestarPose. */
  private emprestada: THREE.AnimationAction | null = null;
  /** A acao congelada que serve de pose de descanso. Ver congelarPoseBase. */
  private poseBase: THREE.AnimationAction | null = null;

  private base: Base = 'parado';
  private pesos: Record<Base, number> = { parado: 1, andando: 0, correndo: 0, desmaiado: 0 };

  private gesto: Gesto | null = null;
  private gestoT = 0;
  private gestoDuracao = 1;
  private gestoPeso = 0;

  private tempo = Math.random() * 30;
  private fase = 0;
  private proximaVariacao = 5 + Math.random() * 8;
  private guinadaCabeca = 0;

  /**
   * Gingado do corpo, em fração da altura do bicho.
   *
   * Isto NÃO vai no osso do quadril. Deslocar um osso significa deslocar na
   * unidade em que o arquivo foi salvo, e os 151 GLB vão de 0,01 a 629 unidades
   * de altura: os mesmos "1,4 cm" de gingado somem num modelo e arrancam meio
   * Bulbasaur no outro — que foi exatamente o que aconteceu. Giro é adimensional
   * e translação não é, então a translação sobe para `corpo`, que src/modelos.ts
   * já normalizou para metros.
   */
  oscilacao = 0;

  /** Quanto abaixar cada braço para desfazer a T-pose do arquivo. */
  private relaxoE = 0;
  private relaxoD = 0;

  constructor(corpo: Corpo) {
    this.rig = new Rig(corpo.corpo);
    // Sem quadril e sem cabeça não há pose que se sustente: nesses modelos a
    // animação continua sendo só o squash & stretch de src/creature.ts.
    this.temRig = this.rig.encontrados >= 4 && (this.rig.tem('quadril') || this.rig.tem('tronco'));
    this.mixer = corpo.mixer;
    this.mapearClipes(corpo);
    // A pose emprestada primeiro: medir a T-pose antes dela mediria a pose de
    // bind, que e justamente a que se esta trocando.
    this.emprestarPose(corpo);
    this.medirTPose();
  }

  /**
   * Descobre se o modelo veio em T-pose e, se veio, quanto baixar cada braço.
   *
   * Charmander é o caso: o arquivo dele não tem clipe nenhum e a pose de bind
   * tem os braços abertos na horizontal, como um avião. Sem isto ele passeia
   * pelo quarto assim — e não é defeito da animação, é a pose em que o modelo
   * foi salvo, que a animação estava somando sem desfazer.
   *
   * A medida é a direção do braço em repouso: horizontal demais quer dizer
   * T-pose. Quem já chega com o braço caído — Squirtle, Pikachu — mede vertical
   * e não ganha correção nenhuma.
   */
  private medirTPose() {
    const medir = (chave: 'bracoE' | 'bracoD') => {
      const direcao = this.rig.direcaoDe(chave);
      if (!direcao) return 0;
      // Só o plano horizontal importa: um braço apontando para a frente não é
      // T-pose, é um braço apontando para a frente.
      const horizontal = Math.abs(direcao.x);
      if (horizontal < 0.55 || direcao.y < -0.5) return 0;
      // Abaixa até quase colar no corpo — quase, porque braço colado no tronco
      // é pose de soldado, não de bicho. O sinal segue o lado para onde ele
      // aponta: girar em +Z leva +X para cima e −X para baixo.
      const quanto = Math.asin(THREE.MathUtils.clamp(horizontal, 0, 1)) * 0.82;
      return -Math.sign(direcao.x) * quanto;
    };
    this.relaxoE = medir('bracoE');
    this.relaxoD = medir('bracoD');
  }

  private mapearClipes(corpo: Corpo) {
    if (!this.mixer) return;
    for (const [nome, acao] of corpo.acoes) {
      const limpo = normalizar(nome);
      for (const { papel, padrao, laco } of PAPEIS) {
        if (this.clipes.has(papel)) continue;
        if (!padrao.test(limpo)) continue;
        acao.setLoop(laco ? THREE.LoopRepeat : THREE.LoopOnce, laco ? Infinity : 1);
        acao.clampWhenFinished = !laco;
        this.clipes.set(papel, acao);
        break;
      }
    }
    // Sem clipe de base, mas com ALGUM clipe: o primeiro quadro dele vira a
    // pose de descanso. Ver `emprestarPose` — é o conserto do Pikachu.
    if (!this.clipes.has('parado') && !this.clipes.has('andando') && corpo.acoes.size > 0) {
      this.emprestada = corpo.acoes.values().next().value ?? null;
    }
  }

  /**
   * Toma emprestado o primeiro quadro de um clipe como pose de descanso.
   *
   * Alguns arquivos vêm com a pose de bind inutilizável — o Pikachu chega
   * deitado — porque o rip conta com a animação que ele traz para endireitar o
   * bicho. Antes, o jogo tocava esse clipe em laço para sempre; agora o clipe
   * volta a ser o que ele é (o golpe), e só o primeiro quadro dele fica, como
   * pose parada.
   *
   * Acontece uma vez, no primeiro quadro de vida do bicho.
   */
  private emprestarPose(corpo: Corpo) {
    const acao = this.emprestada;
    this.emprestada = null;
    if (!acao || !this.mixer) return;

    this.poseBase = acao;
    this.congelarPoseBase();
    // Um passo mínimo só para o mixer escrever nos ossos: sem `update` nada é
    // aplicado, e a pose emprestada continuaria sendo a de bind.
    this.mixer.update(1e-4);
    this.rig.recapturarRepouso(corpo.corpo);
    // E agora que o bicho está em pé, remede: as medidas do manifesto descrevem
    // a pose que acabou de ser jogada fora. Sem isto o Pikachu fica centrado
    // pelo salsichão deitado que ele era, e girar no lugar vira orbitar um
    // eixo que não é o dele.
    corpo.renormalizar();
  }

  /**
   * Deixa o clipe emprestado parado no primeiro quadro, tocando.
   *
   * Tocando, e não parado de vez: o three devolve o osso à pose de bind quando
   * a última ação que o usava é desativada, e a pose de bind é justamente a
   * ruim. Além disso o clipe do Pikachu endireita o bicho mexendo em nós
   * ACIMA do esqueleto — `Origin`, a raiz criada pelo exportador —, que o rig
   * não controla; deixar a ação viva é o que segura esses nós no lugar.
   */
  private congelarPoseBase() {
    const acao = this.poseBase;
    if (!acao) return;
    acao.reset().play();
    acao.time = 0;
    acao.paused = true;
  }

  get temClipeDeBase(): boolean {
    return this.clipes.has('andando') || this.clipes.has('parado');
  }

  /** O jogo diz o que o bicho está fazendo; o resto é conta daqui. */
  definirBase(base: Base) {
    if (this.base === base) return;
    this.base = base;
    this.trocarClipe(base);
  }

  /**
   * Dispara um gesto. Um gesto novo interrompe o anterior — quem leva um golpe
   * no meio do aceno para de acenar, que é o que qualquer um faria.
   */
  disparar(gesto: Gesto, duracao = DURACAO[gesto]) {
    this.gesto = gesto;
    this.gestoT = 0;
    this.gestoDuracao = Math.max(0.1, duracao);
    // Qualquer família de ataque aproveita o clipe de luta que o arquivo
    // trouxe, quando ele existe: um "fight" assado pela Game Freak vale mais do
    // que a pose procedural, mesmo que o golpe do momento seja uma mordida.
    const clipe = this.clipes.get(gesto) ?? (ehAtaque(gesto) ? this.clipes.get('investida') : undefined);
    if (clipe) this.trocarClipe(this.clipes.has(gesto) ? gesto : 'investida', 0.12);
  }

  get gestoAtivo(): Gesto | null {
    return this.gesto;
  }

  private trocarClipe(papel: Base | Gesto, transicao = 0.25) {
    const proxima = this.clipes.get(papel);
    if (!proxima || proxima === this.acaoAtual) return;
    proxima.reset().play();
    if (this.acaoAtual) this.acaoAtual.crossFadeTo(proxima, transicao, false);
    else proxima.fadeIn(transicao);
    this.acaoAtual = proxima;
  }

  atualizar(dt: number, ctx: Contexto) {
    this.tempo += dt;

    // --- base, escolhida pela velocidade ---
    const base: Base = ctx.desmaiado
      ? 'desmaiado'
      : ctx.velocidade > FASE_CORRIDA
        ? 'correndo'
        : ctx.velocidade > 0.12
          ? 'andando'
          : 'parado';
    this.definirBase(base);

    const alvo: Record<Base, number> = { parado: 0, andando: 0, correndo: 0, desmaiado: 0 };
    alvo[base] = 1;
    const k = Math.min(1, dt * 8);
    for (const p of ['parado', 'andando', 'correndo', 'desmaiado'] as Base[]) {
      this.pesos[p] += (alvo[p] - this.pesos[p]) * k;
    }

    // A fase do ciclo de passada acompanha a velocidade real: o pé encosta no
    // chão na mesma cadência em que o bicho se desloca, e não há deslize.
    const cadencia = 2.6 + ctx.velocidade * 3.4;
    this.fase += dt * cadencia;

    // --- gesto ---
    if (this.gesto) {
      this.gestoT += dt / this.gestoDuracao;
      if (this.gestoT >= 1) {
        this.gesto = null;
        this.gestoT = 0;
        // Um gesto com clipe próprio precisa devolver o corpo à base ao acabar.
        if (this.acaoAtual && this.clipes.get(this.base) !== this.acaoAtual) {
          if (this.clipes.has(this.base)) {
            this.trocarClipe(this.base, 0.2);
          } else if (this.poseBase) {
            // Base sem clipe, mas com pose emprestada: volta a congelar o
            // primeiro quadro. Sem isto o Pikachu ficaria parado na pose final
            // do Impactrueno até o fim da sessao.
            this.congelarPoseBase();
            this.acaoAtual = null;
          } else {
            this.acaoAtual.fadeOut(0.25);
            this.acaoAtual = null;
          }
        }
      }
    }
    // Envelope de meio seno: nasce do nada, enche e volta — sem estalo nas pontas.
    this.gestoPeso = this.gesto ? Math.sin(Math.min(1, this.gestoT) * Math.PI) : 0;

    this.variacoesDeOcio(dt, ctx);

    this.mixer?.update(dt);

    if (!this.temRig) return;

    this.oscilacao = 0;
    this.rig.limpar();
    this.aplicarBase(ctx);
    this.aplicarGesto(ctx);
    this.encararComACabeca(dt, ctx);
    this.relaxarBracos();

    // Onde há clipe assado para o que está acontecendo, ele manda e a pose
    // procedural só tempera. Onde não há, ela é a animação inteira.
    const temClipe = this.gesto
      ? this.clipes.has(this.gesto) || (ehAtaque(this.gesto) && this.clipes.has('investida'))
      : this.clipes.has(this.base) || (this.base === 'parado' && this.clipes.size > 0);
    const peso = temClipe ? (this.gesto ? 0.35 : 0.22) : 1;
    this.rig.aplicar(peso);
  }

  /**
   * O bicho parado não fica parado: de vez em quando ele olha em volta, e mais
   * raramente acena para você. São as "variações" que tiram a cara de boneco de
   * um modelo em pé no meio do quarto.
   */
  private variacoesDeOcio(dt: number, ctx: Contexto) {
    if (ctx.desmaiado || this.gesto || ctx.velocidade > 0.12) return;
    this.proximaVariacao -= dt;
    if (this.proximaVariacao > 0) return;
    // Nervoso olha em volta com mais frequência e não acena para ninguém.
    this.proximaVariacao = (5 + Math.random() * 9) * (ctx.alarme > 0.4 ? 0.45 : 1);
    this.disparar(Math.random() < (ctx.alarme > 0.4 ? 1 : 0.62) ? 'olhar' : 'acenar');
  }

  // ------------------------------------------------------------ poses base

  private aplicarBase(ctx: Contexto) {
    const t = this.tempo;
    const nervoso = ctx.alarme;
    const cansaco = 1 - ctx.vida;

    // --- parado: respiração no tronco, cauda e orelha vivas ---
    const pParado = this.pesos.parado;
    if (pParado > 0.01) {
      const ritmo = 1.5 + nervoso * 2.2 + cansaco * 1.4;
      const respira = Math.sin(t * ritmo);
      this.rig.girar('peito', LADO, respira * 0.035 * pParado);
      this.rig.girar('cabeca', LADO, -respira * 0.03 * pParado);
      // Cauda com dois nós desfasados: é o atraso entre eles que faz ela
      // parecer ter peso em vez de girar inteira como um ponteiro.
      this.rig.girar('cauda1', CIMA, Math.sin(t * 1.25) * 0.16 * pParado);
      this.rig.girar('cauda2', CIMA, Math.sin(t * 1.25 - 0.7) * 0.2 * pParado);
      this.rig.girar('cauda3', CIMA, Math.sin(t * 1.25 - 1.4) * 0.22 * pParado);
      // Orelha mexe em espasmo, não em onda: fica parada e dá um tranco.
      const espasmo = Math.max(0, Math.sin(t * 0.6) - 0.93) * 14;
      this.rig.girar('orelhaE', FRENTE, espasmo * 0.28 * pParado);
      this.rig.girar('orelhaD', FRENTE, -espasmo * 0.28 * pParado);
      // Com pouca vida o corpo cai para a frente e a cabeça pende.
      if (cansaco > 0.4) {
        this.rig.girar('tronco', LADO, cansaco * 0.16 * pParado);
        this.rig.girar('cabeca', LADO, cansaco * 0.2 * pParado);
      }
    }

    // --- passada: andar e correr são o mesmo ciclo em amplitudes diferentes ---
    const pAndar = this.pesos.andando;
    const pCorrer = this.pesos.correndo;
    const pPassada = pAndar + pCorrer;
    if (pPassada > 0.01) {
      const amplitude = pAndar * 0.42 + pCorrer * 0.78;
      const bracos = pAndar * 0.3 + pCorrer * 0.55;
      const f = this.fase;
      const senoE = Math.sin(f);
      const senoD = Math.sin(f + Math.PI);

      // Pernas: a coxa oscila e o joelho só dobra para trás — dobrar joelho
      // para a frente é o que denuncia uma passada feita no olho.
      this.rig.girar('coxaE', LADO, senoE * amplitude);
      this.rig.girar('coxaD', LADO, senoD * amplitude);
      this.rig.girar('pernaE', LADO, -Math.max(0, Math.sin(f - 0.9)) * amplitude * 1.15);
      this.rig.girar('pernaD', LADO, -Math.max(0, Math.sin(f + Math.PI - 0.9)) * amplitude * 1.15);
      // O pé: aponta para baixo no ar e ACHATA no contato. A fase de apoio é
      // meio ciclo, e é nela que o pé precisa ficar paralelo ao chão — um pé que
      // continua girando enquanto sustenta o corpo denuncia a passada na hora.
      const apoioE = Math.max(0, -Math.sin(f));
      const apoioD = Math.max(0, -Math.sin(f + Math.PI));
      this.rig.girar('peE', LADO, (-senoE * 0.35 + apoioE * 0.3) * amplitude);
      this.rig.girar('peD', LADO, (-senoD * 0.35 + apoioD * 0.3) * amplitude);

      // Braços contra as pernas — é o contrapeso que todo bípede faz.
      this.rig.girar('bracoE', LADO, senoD * bracos);
      this.rig.girar('bracoD', LADO, senoE * bracos);
      this.rig.girar('antebracoE', LADO, -Math.abs(senoD) * bracos * 0.5);
      this.rig.girar('antebracoD', LADO, -Math.abs(senoE) * bracos * 0.5);

      // Quadril: sobe duas vezes por ciclo (um por pé) e torce uma vez só.
      this.rig.girar('quadril', CIMA, senoE * amplitude * 0.28);
      this.rig.girar('peito', CIMA, -senoE * amplitude * 0.22);
      // Gingado: o corpo sobe duas vezes por ciclo, uma por pé que encosta.
      this.oscilacao += Math.abs(Math.sin(f)) * 0.022 * pPassada;

      // Transferência de peso: o corpo tomba para o lado da perna que está
      // sustentando. É o que separa "andar" de "mover as pernas enquanto
      // desliza" — sem esse tombo o bicho parece estar num carrinho.
      this.rig.girar('quadril', FRENTE, -senoE * amplitude * 0.22);
      this.rig.girar('peito', FRENTE, senoE * amplitude * 0.12);
      this.rig.girar('cabeca', FRENTE, -senoE * amplitude * 0.1);

      // Correndo o bicho se joga para a frente, e a cabeça fica no nível.
      this.rig.girar('tronco', LADO, pCorrer * 0.26);
      this.rig.girar('cabeca', LADO, -pCorrer * 0.22);

      // A cauda é CONTRAPESO: ela vai para o lado oposto ao do quadril, com
      // atraso crescente nó a nó. Antes ela acompanhava o quadril no mesmo
      // sinal, o que a fazia parecer amarrada nas costas em vez de pesada — o
      // Charmander andava com o rabo balançando junto com a bunda.
      // Os três nós SOMAM ao longo da cauda, então cada um leva pouco: com um
      // terço de radiano em cada, a ponta girava quase setenta graus e o rabo do
      // Charmander vinha parar na frente do corpo.
      this.rig.girar('cauda1', CIMA, -senoE * 0.14 * pPassada);
      this.rig.girar('cauda2', CIMA, -Math.sin(f - 0.55) * 0.13 * pPassada);
      this.rig.girar('cauda3', CIMA, -Math.sin(f - 1.1) * 0.12 * pPassada);
      // E ela sobe um pouco, como todo bípede de cauda pesada faz para andar.
      this.rig.girar('cauda1', LADO, -(0.07 + pCorrer * 0.1));

      // Orelhas para trás na corrida: é o vento.
      this.rig.girar('orelhaE', LADO, pCorrer * 0.4);
      this.rig.girar('orelhaD', LADO, pCorrer * 0.4);
    }

    // --- desmaiado: tudo pende. O tombo em si é de src/creature.ts. ---
    const pKo = this.pesos.desmaiado;
    if (pKo > 0.01) {
      this.rig.girar('cabeca', LADO, 0.5 * pKo);
      this.rig.girar('tronco', LADO, 0.28 * pKo);
      this.rig.girar('bracoE', LADO, 0.7 * pKo);
      this.rig.girar('bracoD', LADO, 0.7 * pKo);
      this.rig.girar('coxaE', LADO, -0.5 * pKo);
      this.rig.girar('coxaD', LADO, -0.42 * pKo);
      this.rig.girar('orelhaE', LADO, 0.6 * pKo);
      this.rig.girar('orelhaD', LADO, 0.6 * pKo);
      this.rig.girar('cauda1', LADO, 0.4 * pKo);
    }
  }

  // ------------------------------------------------------------ gestos

  /**
   * A espinha de todo ataque: RECOLHE e DISPARA.
   *
   * `recolher` vai de 1 a 0 na preparação; `disparo` é um meio-seno que sobe e
   * desce no golpe. As duas famílias mudam só onde aplicam esses dois números —
   * e é isso que faz oito gestos diferentes terem o mesmo peso e o mesmo tempo.
   */
  private envelope(t: number, fimDoRecuo = 0.35, comecoDoDisparo = 0.3) {
    return {
      recolher: Math.max(0, 1 - t / fimDoRecuo),
      disparo: Math.max(0, Math.sin(Math.max(0, (t - comecoDoDisparo) / (1 - comecoDoDisparo)) * Math.PI)),
    };
  }

  /**
   * O mesmo disparo, algumas frações de segundo atrás. É com isto que os nós da
   * cauda chicoteiam em vez de girarem juntos como um ponteiro.
   */
  private atrasado(t: number, atraso: number) {
    const u = t - atraso;
    if (u <= 0) return 0;
    return Math.max(0, Math.sin(Math.max(0, (u - 0.36) / 0.64) * Math.PI)) - Math.max(0, 1 - u / 0.36) * 0.6;
  }

  private aplicarGesto(ctx: Contexto) {
    if (!this.gesto || this.gestoPeso < 0.01) return;
    const p = this.gestoPeso;
    const t = this.gestoT;
    const tempoReal = this.gestoT * this.gestoDuracao;

    switch (this.gesto) {
      // Todo ataque tem a mesma espinha — RECOLHE e DISPARA — e o que muda é
      // que parte do corpo faz o quê. Os dois números saem daqui e cada família
      // os usa do seu jeito.
      case 'investida': {
        // O corpo inteiro se joga. É o gesto mais simples, e é o que sobra
        // quando o nome do golpe não diz nada de específico.
        const { recolher, disparo } = this.envelope(t);
        this.rig.girar('tronco', LADO, (-recolher * 0.3 + disparo * 0.45) * p);
        this.rig.girar('peito', LADO, (-recolher * 0.18 + disparo * 0.28) * p);
        this.rig.girar('cabeca', LADO, (-recolher * 0.25 + disparo * 0.2) * p);
        this.rig.girar('mandibula', LADO, disparo * 0.5 * p);
        this.rig.girar('bracoE', LADO, (recolher * 0.5 - disparo * 0.8) * p);
        this.rig.girar('bracoD', LADO, (recolher * 0.5 - disparo * 0.8) * p);
        this.rig.girar('cauda1', LADO, (recolher * 0.45 - disparo * 0.55) * p);
        this.rig.girar('cauda2', LADO, (recolher * 0.35 - disparo * 0.65) * p);
        break;
      }

      case 'mordida': {
        // O pescoço estica para a frente e a boca abre MUITO. A mandíbula é a
        // peça inteira aqui: sem ela, morder e dar cabeçada são o mesmo gesto.
        const { recolher, disparo } = this.envelope(t, 0.3, 0.32);
        // A boca abre ANTES do bote e fecha em cima dele.
        // A boca abre no avanço e fecha no fim — a mordida é o FECHAR. Ela
        // abria e fechava cedo demais, e no quadro do bote já estava trancada:
        // o gesto virava uma cabeçada de boca fechada.
        const boca = Math.max(0, Math.sin(Math.min(1, t / 0.8) * Math.PI));
        // Pescoço e cabeça SOMAM: com meio radiano em cada, o bicho acabava
        // olhando para o chão e o bote sumia atrás da própria cabeça.
        this.rig.girar('pescoco', LADO, (-recolher * 0.2 + disparo * 0.3) * p);
        this.rig.girar('cabeca', LADO, (-recolher * 0.2 + disparo * 0.25) * p);
        this.rig.girar('mandibula', LADO, boca * 0.95 * p);
        this.rig.girar('tronco', LADO, (-recolher * 0.22 + disparo * 0.35) * p);
        this.rig.girar('cauda1', CIMA, Math.sin(tempoReal * 12) * 0.25 * p);
        this.rig.girar('orelhaE', LADO, recolher * 0.4 * p);
        this.rig.girar('orelhaD', LADO, recolher * 0.4 * p);
        break;
      }

      case 'garra': {
        // O braço sobe para fora e varre na diagonal, o corpo torce junto. A
        // torção é o que dá peso: uma garra só de braço parece um espanador.
        const { recolher, disparo } = this.envelope(t, 0.34, 0.3);
        // O braço sobe para fora (FRENTE) e desce varrendo, enquanto vem para
        // a frente (LADO negativo). São os dois eixos juntos que fazem a
        // diagonal — só um deles daria um aceno ou um empurrão.
        this.rig.girar('bracoD', FRENTE, (-recolher * 1.1 + disparo * 0.9) * p);
        this.rig.girar('bracoD', LADO, (recolher * 0.3 - disparo * 0.75) * p);
        this.rig.girar('antebracoD', FRENTE, (-recolher * 0.7 + disparo * 0.5) * p);
        this.rig.girar('maoD', FRENTE, -disparo * 0.5 * p);
        this.rig.girar('peito', CIMA, (recolher * 0.4 - disparo * 0.55) * p);
        this.rig.girar('cabeca', CIMA, (recolher * 0.25 - disparo * 0.35) * p);
        this.rig.girar('tronco', LADO, disparo * 0.2 * p);
        this.rig.girar('mandibula', LADO, disparo * 0.4 * p);
        this.rig.girar('cauda1', CIMA, (-recolher * 0.3 + disparo * 0.4) * p);
        break;
      }

      case 'cauda': {
        // O tronco gira para um lado e a cauda vem no outro, com atraso entre os
        // nós. O atraso é o chicote: sem ele a cauda gira inteira como um
        // ponteiro de relógio.
        const { recolher, disparo } = this.envelope(t, 0.36, 0.3);
        const varrida = disparo - recolher * 0.6;
        this.rig.girar('quadril', CIMA, varrida * 0.4 * p);
        this.rig.girar('peito', CIMA, -varrida * 0.3 * p);
        this.rig.girar('cabeca', CIMA, -varrida * 0.4 * p);
        // Somam ao longo da cauda: meio radiano em cada já leva a ponta a
        // quase noventa graus, que é o que uma chicotada precisa.
        this.rig.girar('cauda1', CIMA, -varrida * 0.5 * p);
        this.rig.girar('cauda2', CIMA, -this.atrasado(t, 0.06) * 0.55 * p);
        this.rig.girar('cauda3', CIMA, -this.atrasado(t, 0.12) * 0.6 * p);
        this.rig.girar('cauda1', LADO, -disparo * 0.3 * p);
        break;
      }

      case 'soco': {
        // Um jab reto: o braço recua até o peito e sai. O ombro vai junto, que é
        // de onde a força de um soco de verdade sai.
        const { recolher, disparo } = this.envelope(t, 0.3, 0.26);
        // O braço recua dobrado (cotovelo fechado) e ESTICA para a frente. É o
        // cotovelo abrindo que faz um soco parecer um soco.
        this.rig.girar('ombroD', LADO, -disparo * 0.3 * p);
        this.rig.girar('bracoD', LADO, (recolher * 0.5 - disparo * 0.85) * p);
        this.rig.girar('antebracoD', LADO, (-recolher * 1.2 + disparo * 1.0) * p);
        this.rig.girar('bracoE', LADO, (-recolher * 0.2 + disparo * 0.4) * p);
        this.rig.girar('peito', CIMA, (recolher * 0.3 - disparo * 0.45) * p);
        this.rig.girar('quadril', CIMA, -disparo * 0.25 * p);
        this.rig.girar('tronco', LADO, disparo * 0.25 * p);
        break;
      }

      case 'salto': {
        // Agacha, salta e desce com a perna estendida. A subida vem do jogo (o
        // impulso de src/creature.ts); aqui é só a pose de quem saltou.
        const agachar = Math.max(0, 1 - t / 0.25);
        const noAr = Math.max(0, Math.sin(Math.max(0, (t - 0.2) / 0.6) * Math.PI));
        this.rig.girar('coxaE', LADO, (agachar * 0.6 - noAr * 1.2) * p);
        this.rig.girar('coxaD', LADO, (agachar * 0.6 - noAr * 0.5) * p);
        this.rig.girar('pernaE', LADO, (-agachar * 1.1 + noAr * 0.9) * p);
        this.rig.girar('pernaD', LADO, -agachar * 1.1 * p);
        this.rig.girar('peE', LADO, -noAr * 0.5 * p);
        this.rig.girar('tronco', LADO, (agachar * 0.35 - noAr * 0.25) * p);
        this.rig.girar('bracoE', LADO, (agachar * 0.5 - noAr * 0.9) * p);
        this.rig.girar('bracoD', LADO, (agachar * 0.5 - noAr * 0.9) * p);
        this.rig.girar('cauda1', LADO, (agachar * 0.4 - noAr * 0.7) * p);
        break;
      }

      case 'sopro': {
        // O elemental: inspira arqueando para TRÁS e para CIMA, segura, e então
        // despeja para a frente com a boca aberta. O arco para trás é o que
        // separa cuspir fogo de dar uma cabeçada — é a inspiração que se vê.
        const inspira = Math.max(0, Math.sin(Math.min(1, t / 0.42) * Math.PI));
        const despeja = Math.max(0, Math.sin(Math.max(0, (t - 0.38) / 0.62) * Math.PI));
        // Inspira arqueando para TRÁS e para cima; despeja indo para a frente.
        this.rig.girar('tronco', LADO, (-inspira * 0.3 + despeja * 0.4) * p);
        this.rig.girar('peito', LADO, (-inspira * 0.3 + despeja * 0.26) * p);
        this.rig.girar('pescoco', LADO, (-inspira * 0.35 + despeja * 0.3) * p);
        this.rig.girar('cabeca', LADO, (-inspira * 0.4 + despeja * 0.25) * p);
        // A boca só abre no despejo, e abre bastante.
        this.rig.girar('mandibula', LADO, despeja * 0.85 * p);
        // Os braços abrem e o corpo fica firme: é a pose de quem está botando
        // tudo para fora.
        this.rig.girar('bracoE', FRENTE, inspira * 0.55 * p);
        this.rig.girar('bracoD', FRENTE, -inspira * 0.55 * p);
        this.rig.girar('coxaE', LADO, despeja * 0.22 * p);
        this.rig.girar('coxaD', LADO, -despeja * 0.22 * p);
        this.rig.girar('cauda1', LADO, (inspira * 0.5 - despeja * 0.35) * p);
        this.rig.girar('cauda2', LADO, (inspira * 0.6 - despeja * 0.3) * p);
        // O tremor do esforço, no fim: o corpo vibra enquanto despeja.
        const tremor = despeja * Math.sin(tempoReal * 34) * 0.05;
        this.rig.girar('cabeca', FRENTE, tremor * p);
        break;
      }

      case 'aura': {
        // Sem gesto de corpo: o bicho se firma e o anel de src/attacks.ts conta
        // o resto. Firmar-se é pouco de propósito — a informação está no anel.
        const { recolher, disparo } = this.envelope(t, 0.4, 0.4);
        this.rig.girar('tronco', LADO, (recolher * 0.2 - disparo * 0.12) * p);
        this.rig.girar('cabeca', LADO, (-recolher * 0.25 - disparo * 0.1) * p);
        this.rig.girar('bracoE', FRENTE, disparo * 0.5 * p);
        this.rig.girar('bracoD', FRENTE, -disparo * 0.5 * p);
        this.rig.girar('cauda1', CIMA, Math.sin(tempoReal * 8) * 0.2 * p);
        break;
      }

      case 'cafune': {
        // A cabeça sobe contra a mão, as orelhas caem para trás e a cauda bate
        // depressa. É a pose de bicho satisfeito, e ela é quase toda orelha.
        const balanco = Math.sin(tempoReal * 5.5);
        this.rig.girar('cabeca', LADO, -0.36 * p);
        this.rig.girar('cabeca', FRENTE, balanco * 0.18 * p);
        this.rig.girar('pescoco', LADO, -0.2 * p);
        this.rig.girar('mandibula', LADO, (0.12 + balanco * 0.08) * p);
        this.rig.girar('orelhaE', LADO, 0.62 * p);
        this.rig.girar('orelhaD', LADO, 0.62 * p);
        this.rig.girar('tronco', LADO, -0.12 * p);
        const rabo = Math.sin(tempoReal * 13);
        this.rig.girar('cauda1', CIMA, rabo * 0.5 * p);
        this.rig.girar('cauda2', CIMA, Math.sin(tempoReal * 13 - 0.6) * 0.55 * p);
        this.rig.girar('cauda3', CIMA, Math.sin(tempoReal * 13 - 1.2) * 0.5 * p);
        this.oscilacao += Math.abs(rabo) * 0.012 * p;
        break;
      }

      case 'acenar': {
        // Braço direito sobe pelo lado e o antebraço vai e volta. Os bichos sem
        // braço nenhum — e há vários — ficam com a cabeça e a cauda, que é o
        // que dá para acenar sem braço.
        const subida = Math.min(1, t / 0.22);
        const tchau = Math.sin(tempoReal * 11);
        this.rig.girar('bracoD', FRENTE, -1.15 * subida * p);
        this.rig.girar('bracoD', LADO, -0.35 * subida * p);
        this.rig.girar('antebracoD', FRENTE, (-0.45 + tchau * 0.55) * subida * p);
        this.rig.girar('maoD', FRENTE, tchau * 0.4 * subida * p);
        this.rig.girar('ombroD', FRENTE, -0.25 * subida * p);
        this.rig.girar('cabeca', FRENTE, tchau * 0.1 * p);
        this.rig.girar('cabeca', LADO, -0.14 * p);
        this.rig.girar('cauda1', CIMA, tchau * 0.28 * p);
        this.rig.girar('orelhaE', FRENTE, tchau * 0.22 * p);
        this.rig.girar('orelhaD', FRENTE, -tchau * 0.22 * p);
        break;
      }

      case 'olhar': {
        // Varredura: olha para um lado, segura, olha para o outro. A pausa é o
        // que faz parecer que ele está reparando em alguma coisa.
        const varre = Math.sin(tempoReal * 1.9);
        const segura = Math.sign(varre) * Math.pow(Math.abs(varre), 0.45);
        this.rig.girar('cabeca', CIMA, segura * 0.72 * p);
        this.rig.girar('pescoco', CIMA, segura * 0.22 * p);
        this.rig.girar('peito', CIMA, segura * 0.16 * p);
        this.rig.girar('cabeca', LADO, -0.12 * p);
        this.rig.girar('orelhaE', CIMA, segura * 0.3 * p);
        this.rig.girar('orelhaD', CIMA, segura * 0.3 * p);
        break;
      }

      case 'comemorar': {
        const pulo = Math.abs(Math.sin(tempoReal * 6));
        this.rig.girar('bracoE', FRENTE, 1.3 * p);
        this.rig.girar('bracoD', FRENTE, -1.3 * p);
        this.rig.girar('cabeca', LADO, -0.4 * p);
        this.rig.girar('mandibula', LADO, 0.4 * p);
        this.rig.girar('tronco', LADO, -0.2 * pulo * p);
        this.rig.girar('cauda1', CIMA, Math.sin(tempoReal * 15) * 0.5 * p);
        this.rig.girar('orelhaE', LADO, -0.35 * p);
        this.rig.girar('orelhaD', LADO, -0.35 * p);
        break;
      }

      case 'apanhar': {
        const recuo = Math.sin(t * Math.PI);
        // Recua: o tronco vai para TRÁS e a cabeça joga para cima.
        this.rig.girar('tronco', LADO, -recuo * 0.4 * p);
        this.rig.girar('cabeca', LADO, -recuo * 0.45 * p);
        this.rig.girar('bracoE', LADO, -recuo * 0.5 * p);
        this.rig.girar('bracoD', LADO, -recuo * 0.5 * p);
        this.rig.girar('orelhaE', LADO, recuo * 0.5 * p);
        this.rig.girar('orelhaD', LADO, recuo * 0.5 * p);
        break;
      }
    }
    void ctx;
  }

  /**
   * A cabeça segue você, por cima de qualquer pose. É a coisa mais barata que
   * existe e a que mais faz o bicho parecer que reparou em quem chegou.
   */
  private encararComACabeca(dt: number, ctx: Contexto) {
    // Enquanto uma varredura acontece, quem manda no pescoço é ela.
    const alvo = ctx.desmaiado || this.gesto === 'olhar' ? 0 : (ctx.encarar ?? 0);
    const limitado = THREE.MathUtils.clamp(alvo, -1.0, 1.0);
    this.guinadaCabeca += (limitado - this.guinadaCabeca) * Math.min(1, dt * 5);
    if (Math.abs(this.guinadaCabeca) < 0.004) return;
    this.rig.girar('cabeca', CIMA, this.guinadaCabeca * 0.68);
    this.rig.girar('pescoco', CIMA, this.guinadaCabeca * 0.3);
  }

  /**
   * Desfaz a T-pose do arquivo, por último.
   *
   * Por último importa. Os giros se acumulam por multiplicação à direita, e o
   * ÚLTIMO a entrar é o primeiro a ser aplicado ao vetor — ou seja, o que vira
   * o referencial de todos os outros. Pondo o relaxamento aqui, o braço primeiro
   * desce para junto do corpo e só então balança e acena, cada gesto acontecendo
   * num braço que já está onde deveria. Pondo antes, o balanço do andar giraria
   * em torno do próprio eixo do braço aberto e não moveria nada.
   */
  private relaxarBracos() {
    if (this.relaxoE) this.rig.girar('bracoE', FRENTE, this.relaxoE);
    if (this.relaxoD) this.rig.girar('bracoD', FRENTE, this.relaxoD);
  }

  /** Onde a mão precisa chegar para o carinho valer: a cabeça, não o centro. */
  pontoDaCabeca(alvo = new THREE.Vector3()): THREE.Vector3 | null {
    return this.rig.pontoDe('cabeca', alvo) ?? this.rig.pontoDe('peito', alvo);
  }
}
