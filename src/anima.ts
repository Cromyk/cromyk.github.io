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
  /**
   * Radianos por segundo em torno do eixo vertical: para que lado ele está
   * VIRANDO, e com que pressa.
   *
   * Opcional porque as ferramentas de folha montam o contexto à mão, e um
   * bicho desenhado num PNG não está virando para lado nenhum.
   */
  giro?: number;
  /** 0..1 — quanto mais nervoso, mais rápido e mais miúdo o movimento. */
  alarme: number;
  /** 0..1 — pouca vida deixa a pose mais caída. */
  vida: number;
  /** Para onde a cabeça deve olhar, em espaço da criatura. Null solta o pescoço. */
  encarar: number | null;
  desmaiado: boolean;
  /**
   * 0..1 — quanto ele está sendo SEGURADO por você. Ver `aplicarColo`.
   *
   * Opcional porque nem todo chamador sabe disso: as ferramentas de folha de
   * contato montam o contexto à mão, e um bicho que elas desenham não está no
   * colo de ninguém.
   */
  colo?: number;
  /**
   * Ele PAIRA em vez de pisar (Zubat, Gastly, Koffing).
   *
   * Muda o que os apêndices fazem: quem voa bate as asas, quem anda apenas as
   * deixa acompanhar o corpo. Ver `ondularApendices`.
   */
  flutua?: boolean;
}

/** Acima desta velocidade, em m/s, a base vira corrida. */
const FASE_CORRIDA = 1.15;

/**
 * Uma mola amortecida de um eixo só: o que faz um apêndice ter PESO.
 *
 * ## Por que o jogo precisava disto
 *
 * Toda a animação era função de `fase` e seno. Isso desenha um ciclo de
 * passada muito bom — e é, por construção, incapaz de reagir: o bicho
 * arranca, freia e vira com a cauda fazendo exatamente a mesma onda, porque
 * um seno não sabe o que aconteceu no quadro anterior.
 *
 * É essa ausência que o olho lê como mecânico, e nenhuma quantidade de senos
 * novos conserta — o que falta não é detalhe, é CAUSA. Uma mola tem estado:
 * ela guarda onde estava e com que velocidade, então o rabo continua indo
 * quando o corpo já parou, que é o que rabo de bicho faz.
 *
 * ## Ela PERSEGUE um alvo, e não recebe uma força
 *
 * A diferença não é de estilo. Com `a = forca − x·k`, o lugar onde a mola
 * para é `forca / k`, então quem escreve o número tem de dividir de cabeça
 * pela rigidez para saber quanto vai sair — e a primeira versão disto errou
 * exatamente nisso: a cauda inteira chegava a **um grau** numa curva fechada,
 * porque a rigidez 26 comia a força antes de ela virar ângulo.
 *
 * Perseguindo (`a = (alvo − x)·k`), o alvo É o ângulo em radianos, e
 * `rigidez` e `atrito` deixam de mexer no tamanho para mexer só no
 * COMPORTAMENTO: quão rápido ela chega lá e quanto passa do ponto.
 *
 * `rigidez` é ω² — o quadrado da velocidade angular natural. `atrito` abaixo
 * de 2·√rigidez deixa a mola oscilar antes de assentar, que é o que faz um
 * rabo parecer rabo; igual ou acima disso ela chega e para, que é o que serve
 * para um tronco.
 */
class Mola {
  valor = 0;
  private velocidade = 0;

  constructor(
    private readonly rigidez: number,
    private readonly atrito: number,
  ) {}

  /**
   * Persegue este alvo, em radianos, por `dt`.
   *
   * O passo é SUBDIVIDIDO quando o quadro é longo: uma mola rígida integrada
   * com dt de 50 ms diverge em vez de oscilar, e 50 ms é exatamente o teto do
   * laço do jogo. Fatias de 8 ms resolvem sem custo perceptível — a mais
   * dura daqui tem ω de 11 rad/s, e isso pede uns cem passos por segundo para
   * integrar sem ganhar energia.
   */
  passo(alvo: number, dt: number) {
    const fatias = dt > 0.008 ? Math.ceil(dt / 0.008) : 1;
    const h = dt / fatias;
    for (let i = 0; i < fatias; i++) {
      const a = (alvo - this.valor) * this.rigidez - this.velocidade * this.atrito;
      this.velocidade += a * h;
      this.valor += this.velocidade * h;
    }
  }
}

/**
 * Ruído orgânico barato: três senos de períodos que não se fecham.
 *
 * Um seno só repete a cada volta, e o olho aprende o compasso em poucos
 * segundos — é o que faz uma respiração parecer um metrônomo. Somando três
 * frequências incomensuráveis (√2 e √5 entre elas), o padrão só se repetiria
 * depois de horas, e de graça: são três senos, não um gerador de ruído.
 *
 * Devolve algo entre −1 e 1, com média zero.
 */
function ruido(t: number, semente = 0): number {
  return (
    (Math.sin(t + semente) +
      Math.sin(t * 1.41421 + semente * 2.3) * 0.6 +
      Math.sin(t * 2.23607 + semente * 5.1) * 0.35) /
    1.95
  );
}

export class Animador {
  readonly rig: Rig;
  /** Falso quando o modelo não tem esqueleto reconhecível — um Ditto, um Voltorb. */
  readonly temRig: boolean;

  /**
   * As molas do corpo. Ver `Mola` e `aplicarInercia`.
   *
   * Uma por apêndice e por eixo, com constantes escolhidas pelo PESO da
   * coisa: a cauda é o pêndulo lento que continua indo depois de o corpo
   * parar, as orelhas são leves e rápidas, o tronco é o mais duro porque é
   * ele que sustenta o resto.
   */
  private molas = {
    /**
     * Cauda no plano horizontal: arrasta na curva.
     *
     * ω = 6,3 rad/s, que é um vaivém por segundo — o balanço de um rabo
     * pesado. O atrito é 40% do crítico: ela passa do ponto e volta duas ou
     * três vezes antes de assentar, que é a parte que se nota.
     */
    caudaLado: new Mola(40, 5),
    /** Cauda na vertical: sobe quando arranca, cai quando freia. */
    caudaCima: new Mola(46, 7),
    /** Leves e rápidas: ω de 11, quase duas vezes por segundo. */
    orelhas: new Mola(120, 12),
    /** A cabeça fica para trás quando o corpo sai. */
    cabeca: new Mola(60, 11),
    /**
     * O tronco se inclina CONTRA a aceleração — é o peso resistindo. Quase
     * criticamente amortecido: ele chega e fica, porque é o que sustenta o
     * resto e um tronco que oscila é um bicho de gelatina.
     */
    tronco: new Mola(70, 15),
  };
  /** A velocidade do quadro anterior, para derivar a aceleração. */
  private velocidadeAnterior = 0;
  /** Semente de ruído, uma por bicho: dois Rattata não respiram em uníssono. */
  private readonly semente = Math.random() * 100;

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
  /**
   * O quanto o corpo está COMPRIMIDO neste quadro, de 0 a 1.
   *
   * O gingado já existia: o corpo sobe duas vezes por ciclo, uma por pé que
   * encosta. Faltava a outra metade, que é a que tem peso — quando o pé bate
   * no chão, o corpo AFUNDA um instante antes de subir de novo. Sem isso o
   * bicho parece leve demais, como se estivesse sendo carregado por cima em
   * vez de se sustentar.
   *
   * Quem lê é src/creature.ts, junto do squash & stretch do salto — é a mesma
   * escala, pelo mesmo motivo, e elas se somam.
   */
  compressao = 0;

  /** Quanto abaixar cada braço para desfazer a T-pose do arquivo. */
  private relaxoE = 0;
  private relaxoD = 0;
  /**
   * O ângulo mínimo que cada braço tem de ficar ABERTO para não entrar no
   * corpo. Ver `medirBracos`.
   */
  private aberturaE = 0;
  private aberturaD = 0;
  /**
   * O quanto este bicho é FOFO, de 0 a 1 — e o que isso quer dizer aqui é uma
   * coisa medida: **braço curto em relação ao tronco**.
   *
   * O pedido do playtest de 19/09 foi *"pokémons fofos andam com os braços
   * esticados para fora fazendo uma corrida fofa"*, e a pergunta séria é como
   * o código sabe quem é fofo sem uma tabela de 151 linhas. A resposta é a
   * proporção: Pikachu, Bulbasaur, Jigglypuff e Squirtle têm bracinhos que não
   * chegam à metade do tronco, e é exatamente por isso que eles não conseguem
   * balançar os braços ao correr — a criança que corre de braços abertos corre
   * assim pelo mesmo motivo. Machamp, Hitmonlee e Kadabra têm braço comprido e
   * correm como gente.
   *
   * Zero para quem tem braço de gente, um para quem tem cotoco.
   */
  private fofura = 0;
  /**
   * Quanto a mão está fechada, de 0 a 1 — e a mola que a leva até lá.
   *
   * Uma mão que abre e fecha de um quadro para o outro é um estalo; fechar é
   * um movimento com duração, e a duração é o que faz o punho parecer que tem
   * músculo atrás.
   */
  private fechoDaMao = 0;
  /**
   * Este bicho tem PERNA no esqueleto?
   *
   * `npm run rig-partes` conta: 19 dos 110 rigados não têm — Ekans, Arbok,
   * Magikarp, Gyarados, a linha do Dratini, Diglett, Grimer, Muk, Seel,
   * Dewgong, Caterpie, Weedle, Metapod, Geodude, Porygon, Omanyte, Venomoth,
   * Weepinbell. Neles o ciclo de passada inteiro — coxa, joelho, pé, o
   * contrapeso dos braços — é um no-op silencioso: cada `girar` procura um
   * osso que não existe e não faz nada.
   *
   * O resultado em campo é o deslize: a posição muda e o corpo fica idêntico.
   * É o mesmo defeito dos 46 sem osso, numa fatia diferente do elenco. Ver
   * `rastejar`.
   */
  private temPernas = false;

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
    this.medirBracos(corpo);
    this.temPernas =
      this.rig.tem('coxaE') ||
      this.rig.tem('coxaD') ||
      this.rig.tem('pernaE') ||
      this.rig.tem('pernaD');
  }

  /**
   * Mede os braços: a T-pose do arquivo, o quanto eles têm de ficar ABERTOS
   * para não entrar no corpo, e o quanto este bicho é fofo.
   *
   * ## O que já estava aqui
   *
   * A T-pose. Charmander é o caso: o arquivo dele não tem clipe nenhum e a
   * pose de bind tem os braços abertos na horizontal, como um avião. Sem
   * desfazer isso ele passeia pelo quarto assim, e não é defeito da animação —
   * é a pose em que o modelo foi salvo, que a animação estava somando sem
   * desfazer. A medida é a direção do braço em repouso: horizontal demais quer
   * dizer T-pose.
   *
   * ## O que estava errado
   *
   * O fator era 0,82 — abaixa 82% do caminho até a vertical, deixando 18% de
   * abertura. Dezoito por cento de noventa graus são dezesseis graus, e
   * dezesseis graus de abertura num Snorlax põem o braço DENTRO da barriga.
   * Foi o relato de 19/09: *"o braço não entra dentro do corpo nem fica colado
   * no corpo o tempo todo"*. As duas metades da queixa são a mesma medida
   * errada: uma fração fixa não sabe a largura de ninguém.
   *
   * ## O que passa a valer
   *
   * Uma conta de trigonometria com três medidas que o modelo já tem: onde
   * nasce o ombro, que comprimento tem o braço, e que largura tem o corpo
   * (`Corpo.meiaCaixa`, a caixa da pose desenhada). O braço pendurado reto sai
   * do ombro e cai; para a mão passar RENTE à silhueta, ele precisa abrir
   *
   *   sen α = (meia largura + folga − distância do ombro ao eixo) / comprimento
   *
   * e é esse α que vira o piso da abertura. Num bicho magro a conta dá
   * negativo, o piso é zero e o braço desce reto como antes. Num Snorlax ela
   * dá quarenta graus, e o braço fica de fora — que é onde ele estaria.
   */
  private medirBracos(corpo: Corpo) {
    const meiaLargura = corpo.meiaCaixa?.x ?? 0;
    // A folga é a espessura do próprio braço, estimada: um vigésimo da altura.
    // Sem ela a mão raspa na silhueta em vez de ficar do lado de fora dela.
    const folga = Math.max(0.01, corpo.altura * 0.05);

    const medir = (
      chaveBraco: 'bracoE' | 'bracoD',
      chaveMao: 'maoE' | 'maoD',
      chaveOmbro: 'ombroE' | 'ombroD',
    ) => {
      const direcao = this.rig.direcaoDe(chaveBraco);

      // --- a T-pose, como antes ---
      let relaxo = 0;
      let sinal = 0;
      if (direcao) {
        // Só o plano horizontal importa: um braço apontando para a frente não
        // é T-pose, é um braço apontando para a frente.
        const horizontal = Math.abs(direcao.x);
        if (horizontal >= 0.55 && direcao.y >= -0.5) {
          sinal = -Math.sign(direcao.x);
          relaxo = sinal * Math.asin(THREE.MathUtils.clamp(horizontal, 0, 1));
        }
      }

      // --- a abertura mínima, pela largura do corpo ---
      const ombro = this.rig.pontoDe(chaveOmbro) ?? this.rig.pontoDe(chaveBraco);
      const mao = this.rig.pontoDe(chaveMao);
      const quadril = this.rig.pontoDe('quadril') ?? this.rig.pontoDe('tronco');
      let abertura = 0;
      if (ombro && mao && quadril && meiaLargura > 1e-4) {
        const comprimento = ombro.distanceTo(mao);
        // A distância do ombro ao eixo do corpo, no horizontal. `quadril` dá o
        // eixo: ele é o único osso que está no meio em todos os 151.
        const doEixo = Math.hypot(ombro.x - quadril.x, ombro.z - quadril.z);
        if (comprimento > 1e-4) {
          const precisa = meiaLargura + folga - doEixo;
          // O TETO de 0,6 rad (34°) não é conforto de número: é anatomia. Num
          // bicho cujo corpo é muito mais largo do que o braço é comprido —
          // Snorlax, Golem, Cloyster —, a conta pede noventa graus, e noventa
          // graus é a T-pose que este mesmo método existe para desfazer.
          // Braço que não alcança o lado de fora fica o mais aberto que dá, e
          // o resto da silhueta o esconde de qualquer jeito.
          abertura = Math.min(0.6, Math.asin(THREE.MathUtils.clamp(precisa / comprimento, 0, 1)));
        }
      }

      // Se o arquivo não disse de que lado o braço aponta (braço já caído), o
      // lado vem da chave: o esquerdo abre para −X, o direito para +X. Girar
      // em +Z (FRENTE) leva +X para cima, então abrir o braço esquerdo é um
      // giro positivo e o direito, negativo.
      if (sinal === 0) sinal = chaveBraco === 'bracoE' ? 1 : -1;

      // O relaxo desce o braço até o PISO da abertura, nunca abaixo dele.
      // `relaxo` e `abertura*sinal` têm o mesmo sinal por construção, então
      // subtrair encurta a descida na medida exata.
      const descida = Math.max(0, Math.abs(relaxo) - abertura);
      return {
        relaxo: sinal * descida,
        // Quem já chega com o braço caído e tem corpo largo GANHA abertura: o
        // relaxo dele é zero e o braço está dentro da barriga desde o arquivo.
        abertura: relaxo === 0 ? sinal * abertura : 0,
      };
    };

    const e = medir('bracoE', 'maoE', 'ombroE');
    const d = medir('bracoD', 'maoD', 'ombroD');
    this.relaxoE = e.relaxo;
    this.relaxoD = d.relaxo;
    this.aberturaE = e.abertura;
    this.aberturaD = d.abertura;

    this.fofura = this.medirFofura();
  }

  /** Braço curto em relação ao tronco. Ver `fofura`. */
  private medirFofura(): number {
    const ombro = this.rig.pontoDe('ombroE') ?? this.rig.pontoDe('bracoE');
    const mao = this.rig.pontoDe('maoE');
    const cabeca = this.rig.pontoDe('cabeca') ?? this.rig.pontoDe('peito');
    const quadril = this.rig.pontoDe('quadril') ?? this.rig.pontoDe('tronco');
    if (!ombro || !mao || !cabeca || !quadril) return 0;
    const tronco = cabeca.distanceTo(quadril);
    if (tronco < 1e-5) return 0;
    const braco = ombro.distanceTo(mao) / tronco;
    // 0,45 do tronco para baixo é cotoco; 0,95 para cima é braço de gente.
    return THREE.MathUtils.clamp((0.95 - braco) / 0.5, 0, 1);
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
    //
    // E ela RESPIRA: ±6% de variação lenta, que é a diferença entre um bicho
    // andando e um metrônomo. Um ciclo de passada perfeitamente periódico é
    // reconhecível em três segundos — o olho aprende o compasso e o corpo
    // inteiro passa a parecer um mecanismo, por mais bem feita que seja a
    // pose. Seis por cento não desloca o pé o bastante para deslizar no chão
    // e é o bastante para o compasso nunca fechar. Ver `ruido`.
    const cadencia = (2.6 + ctx.velocidade * 3.4) * (1 + ruido(this.tempo * 0.7, this.semente) * 0.06);
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

    if (!this.temRig) {
      this.animarSemOsso(ctx);
      return;
    }

    this.oscilacao = 0;
    this.compressao = 0;
    this.rig.limpar();
    this.aplicarBase(ctx);
    this.aplicarInercia(dt, ctx);
    this.aplicarColo(ctx);
    this.aplicarGesto(ctx);
    this.encararComACabeca(dt, ctx);
    this.relaxarBracos();
    this.animarMaos(dt, ctx);

    // Onde há clipe assado para o que está acontecendo, ele manda e a pose
    // procedural só tempera. Onde não há, ela é a animação inteira.
    const temClipe = this.gesto
      ? this.clipes.has(this.gesto) || (ehAtaque(this.gesto) && this.clipes.has('investida'))
      : this.clipes.has(this.base) || (this.base === 'parado' && this.clipes.size > 0);
    const peso = temClipe ? (this.gesto ? 0.35 : 0.22) : 1;
    this.rig.aplicar(peso);
  }

  /**
   * OS QUARENTA E SEIS SEM ESQUELETO.
   *
   * ## O que o censo achou
   *
   * `node tools/diag-rig.mjs` abre os 151 (mais as cinco convidadas) e aplica
   * a régua do `Rig`. O resultado: **110 animam pelos ossos e 46 não têm osso
   * nenhum** — Snorlax, Lapras, Hitmonlee, Chansey, Magmar, Electabuzz,
   * Kabutops, Tauros e mais três dezenas chegam do Pokemon-3D-api como malha
   * ESTÁTICA, sem `skin` e sem nó de junta. Não é o `Rig` que não reconhece: o
   * arquivo não tem o que reconhecer, e nenhuma linha de código conserta isso.
   *
   * ## O que dava para fazer, e não estava sendo feito
   *
   * Até agora esses 46 saíam daqui por um `return` seco, e com ele iam embora
   * `oscilacao` e `compressao` — o pulo do passo e o afundar no contato. Sobrava
   * só a respiração do corpo (que é de src/creature.ts e vale para todos), o
   * que quer dizer que um Snorlax atravessava o quarto DESLIZANDO: a posição
   * mudava e o corpo não se mexia nem um milímetro.
   *
   * O corpo inteiro não substitui um esqueleto, mas responde pelas duas coisas
   * que mais denunciam o deslize: subir a cada passo e afundar quando o pé
   * chega. É a animação de boneco de mola, e ela é muito melhor que nenhuma —
   * quem não tem perna para dobrar tem corpo para saltitar.
   *
   * A amplitude é MAIOR que a dos que têm osso, de propósito: num rigado o
   * pulo é um detalhe somado às pernas, e aqui ele é a passada inteira.
   */
  private animarSemOsso(ctx: Contexto) {
    this.oscilacao = 0;
    this.compressao = 0;

    const pAndar = this.pesos.andando;
    const pCorrer = this.pesos.correndo;
    const pPassada = pAndar + pCorrer;
    if (pPassada > 0.01) {
      const f = this.fase;
      // Sobe duas vezes por ciclo — uma por pé, mesmo sem pé.
      this.oscilacao += Math.abs(Math.sin(f)) * (0.035 + pCorrer * 0.03) * pPassada;
      // E afunda no contato, que é onde `Math.abs(sin)` é zero.
      const contato = 1 - Math.abs(Math.sin(f));
      this.compressao += contato * contato * (pAndar * 0.55 + pCorrer * 1);
    }

    // Parado, um sobe-e-desce lento: é o mesmo ritmo da respiração de
    // src/creature.ts, e somado a ela dá um corpo que infla E se levanta um
    // pouco, em vez de só engordar no lugar.
    const pParado = this.pesos.parado;
    if (pParado > 0.01) {
      const ritmo = 1.5 + ctx.alarme * 2.2 + (1 - ctx.vida) * 1.4;
      this.oscilacao += (Math.sin(this.tempo * ritmo) * 0.5 + 0.5) * 0.008 * pParado;
    }

    // Desmaiado, o corpo assenta no chão. Sem osso não há cabeça para pender,
    // então o que sobra é afundar — e é o bastante para se ler como caído.
    if (this.pesos.desmaiado > 0.01) {
      this.compressao += this.pesos.desmaiado * 1.6;
    }
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

  /**
   * O corpo REAGE: o que acontece por causa do movimento, e não por causa da
   * fase do ciclo.
   *
   * ## O que estava faltando
   *
   * Todas as poses deste arquivo são função de `fase` e seno, e por isso são
   * incapazes de reagir: o bicho arrancava, freava e virava com a cauda
   * fazendo exatamente a mesma onda. O ciclo de passada é bom — tem
   * contrapeso de braço, transferência de peso e cauda com atraso nó a nó —,
   * mas ele descreve um bicho em velocidade constante para sempre, e o jogo
   * quase nunca está nisso: o bicho te segue, para, vira, corre atrás de uma
   * fruta, recua assustado.
   *
   * O olho lê essa ausência como MECÂNICO, e mais senos não consertam — o que
   * falta não é detalhe, é causa. Aqui as forças do movimento entram em molas
   * (ver `Mola`), e mola tem memória: o rabo continua indo depois de o corpo
   * parar, que é o que rabo de bicho faz.
   *
   * ## As quatro forças
   *
   * - **acelerar** joga a cauda para trás e para baixo, e deixa a cabeça um
   *   instante atrás do corpo;
   * - **frear** faz o contrário, e é o que dá o "assentar" de quem para;
   * - **virar** manda a cauda para FORA da curva, como um contrapeso — é o
   *   movimento mais característico de um quadrúpede mudando de direção, e o
   *   que mais falta fazia;
   * - **o tombo** do tronco contra a aceleração, que é o peso resistindo.
   *
   * Tudo escala por `pisa`: um bicho que flutua não tem inércia de passada, e
   * um parado não deve ter cauda chicoteando do nada.
   */
  private aplicarInercia(dt: number, ctx: Contexto) {
    if (dt <= 0) return;

    // A aceleração sai da diferença de velocidade, limitada: um quadro perdido
    // (o headset engasgou, você tirou e pôs) daria uma aceleração absurda e o
    // bicho daria um tranco sem motivo nenhum.
    const aceleracao = THREE.MathUtils.clamp((ctx.velocidade - this.velocidadeAnterior) / dt, -12, 12);
    this.velocidadeAnterior = ctx.velocidade;
    const giro = THREE.MathUtils.clamp(ctx.giro ?? 0, -6, 6);

    // Sem colo e sem desmaio: quem está na sua mão não tem inércia de corrida,
    // e quem está caído não tem inércia nenhuma.
    const vivo = (1 - (ctx.colo ?? 0)) * (ctx.desmaiado ? 0 : 1);

    // Os alvos são ÂNGULOS, em radianos — ver `Mola`. Uma curva fechada (2,5
    // rad/s) manda o primeiro nó da cauda a uns 17°, e como os nós somam ao
    // longo dela a ponta chega perto de 40°. Uma arrancada de 5 m/s² inclina o
    // tronco 7°: o bastante para se ver, pouco para descaracterizar a pose.
    this.molas.caudaLado.passo(-giro * 0.12 * vivo, dt);
    this.molas.caudaCima.passo(-aceleracao * 0.022 * vivo, dt);
    this.molas.orelhas.passo((-aceleracao * 0.03 - Math.abs(giro) * 0.045) * vivo, dt);
    this.molas.cabeca.passo(-aceleracao * 0.02 * vivo, dt);
    this.molas.tronco.passo(aceleracao * 0.025 * vivo, dt);

    // A cauda no plano: o atraso nó a nó é o que a faz parecer um chicote e
    // não uma vara. Cada nó leva uma fração do anterior, somando ao longo dela.
    const lado = this.molas.caudaLado.valor;
    this.rig.girar('cauda1', CIMA, lado * 0.5);
    this.rig.girar('cauda2', CIMA, lado * 0.72);
    this.rig.girar('cauda3', CIMA, lado * 0.9);

    const cima = this.molas.caudaCima.valor;
    this.rig.girar('cauda1', LADO, cima * 0.6);
    this.rig.girar('cauda2', LADO, cima * 0.8);
    this.rig.girar('cauda3', LADO, cima);

    const orelha = this.molas.orelhas.valor;
    this.rig.girar('orelhaE', LADO, orelha);
    this.rig.girar('orelhaD', LADO, orelha);

    this.rig.girar('cabeca', LADO, this.molas.cabeca.valor);
    this.rig.girar('pescoco', LADO, this.molas.cabeca.valor * 0.5);
    this.rig.girar('tronco', LADO, this.molas.tronco.valor);
    this.rig.girar('peito', LADO, this.molas.tronco.valor * 0.4);
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
      // A respiração é a coisa mais vista do jogo — um bicho parado no meio do
      // quarto respira o tempo todo, a trinta centímetros dos seus olhos. Um
      // seno puro ali é um metrônomo, e é o que mais entrega que o bicho é
      // feito de fórmula. O ruído mistura 25% de irregularidade na amplitude:
      // fica o mesmo ritmo, com respirações que não são todas iguais.
      const respira = Math.sin(t * ritmo) * (1 + ruido(t * 0.45, this.semente) * 0.25);
      this.rig.girar('peito', LADO, respira * 0.035 * pParado);
      this.rig.girar('cabeca', LADO, -respira * 0.03 * pParado);
      // Cauda com nós desfasados: é o atraso entre eles que faz ela parecer
      // ter peso em vez de girar inteira como um ponteiro. Em `girarLateral`
      // porque nem toda cauda sai para trás — a do Ekans sai para BAIXO, e um
      // giro em CIMA ali é uma torção invisível. Ver `Rig.eixoLateral`.
      this.rig.girarLateral('cauda1', Math.sin(t * 1.25) * 0.16 * pParado);
      this.rig.girarLateral('cauda2', Math.sin(t * 1.25 - 0.7) * 0.2 * pParado);
      this.rig.girarLateral('cauda3', Math.sin(t * 1.25 - 1.4) * 0.22 * pParado);
      for (let i = 0; i < this.rig.rabo; i++) {
        const decai = Math.max(0.3, 1 - i * 0.1);
        this.rig.girarRaboLateral(i, Math.sin(t * 1.25 - 2.1 - i * 0.7) * 0.22 * decai * pParado);
      }

      // E QUEM NÃO TEM PERNA balança o corpo inteiro, devagar.
      //
      // Para um bípede, ficar parado é ficar de pé — o peso está nas pernas e o
      // tronco só respira. Para uma serpente, ficar parado é ficar apoiado no
      // próprio corpo, e esse corpo nunca está imóvel: ele se ajeita. Sem isto
      // o Ekans parado é uma vareta, que foi como a folha de poses o mostrou.
      if (!this.temPernas) {
        const manso = pParado * (1 - cansaco * 0.5);
        this.rig.girarLateral('tronco', Math.sin(t * 0.85) * 0.05 * manso);
        this.rig.girarLateral('peito', Math.sin(t * 0.85 - 0.5) * 0.045 * manso);
        this.rig.girarLateral('pescoco', Math.sin(t * 0.85 - 1) * 0.06 * manso);
        this.rig.girarLateral('cabeca', Math.sin(t * 0.85 - 1.5) * 0.05 * manso);
      }
      // Orelha mexe em espasmo, não em onda: fica parada e dá um tranco.
      const espasmo = Math.max(0, Math.sin(t * 0.6) - 0.93) * 14;
      this.rig.girar('orelhaE', FRENTE, espasmo * 0.28 * pParado);
      this.rig.girar('orelhaD', FRENTE, -espasmo * 0.28 * pParado);
      // Com pouca vida o corpo cai para a frente e a cabeça pende.
      if (cansaco > 0.4) {
        this.rig.girar('tronco', LADO, cansaco * 0.16 * pParado);
        this.rig.girar('cabeca', LADO, cansaco * 0.2 * pParado);
      }

      // --- os braços PARADOS não ficam parados ---
      //
      // Metade da queixa de 19/09 era *"nem fica colado no corpo o tempo
      // todo"*, e a outra metade não é a pose: é o tempo. Um braço que fica
      // exatamente no mesmo ângulo por trinta segundos é um braço de manequim,
      // por melhor que seja o ângulo.
      //
      // Três ondas lentas, uma por eixo, com períodos que não são múltiplos
      // (0,9 · 1,17 · 0,63) — assim o conjunto nunca fecha e o olho não acha
      // o compasso. E os dois lados andam DESENCONTRADOS, com π/3 entre eles:
      // dois braços sincronizados são uma marionete de um fio só.
      //
      // O eixo FRENTE é o que abre e fecha em relação ao corpo, e ele é o que
      // mais importa aqui: é o que impede a mão de encostar no tronco.
      const solto = pParado * (1 - cansaco * 0.6);
      const balanco = (fase: number) => Math.sin(t * 0.9 + fase) * 0.055 + Math.sin(t * 1.17 + fase * 1.7) * 0.03;
      const abre = (fase: number) => 0.04 + Math.sin(t * 0.63 + fase) * 0.045;
      this.rig.girar('bracoE', LADO, balanco(0) * solto);
      this.rig.girar('bracoD', LADO, balanco(Math.PI / 3) * solto);
      this.rig.girar('bracoE', FRENTE, abre(0.4) * solto);
      this.rig.girar('bracoD', FRENTE, -abre(1.9) * solto);
      this.rig.girar('antebracoE', LADO, -(0.05 + balanco(0.8) * 0.9) * solto);
      this.rig.girar('antebracoD', LADO, -(0.05 + balanco(2.1) * 0.9) * solto);
      this.rig.girar('maoE', LADO, balanco(1.3) * 1.4 * solto);
      this.rig.girar('maoD', LADO, balanco(2.6) * 1.4 * solto);
    }

    // --- passada: andar e correr são o mesmo ciclo em amplitudes diferentes ---
    const pAndar = this.pesos.andando;
    const pCorrer = this.pesos.correndo;
    const pPassada = pAndar + pCorrer;
    if (pPassada > 0.01 && !this.temPernas) {
      this.rastejar(t, pAndar, pCorrer);
    } else if (pPassada > 0.01) {
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
      //
      // O balanço puro em LADO (o que existia) é o braço de um boneco de pau:
      // um eixo só, o mesmo ângulo para ida e volta, e nada acontecendo no
      // ombro nem no cotovelo além de dobrar proporcionalmente. O pedido do
      // playtest de 19/09 foi "melhorar a movimentação dos braços", e o que
      // faltava são três coisas que todo braço de verdade faz:
      //
      // 1. **O OMBRO entra**, com um terço do ângulo e um quarto de ciclo de
      //    atraso. O braço não sai do ombro parado: a escápula vai junto,
      //    depois dele.
      // 2. **O braço ABRE ao ir para trás.** O giro em FRENTE afasta o
      //    cotovelo do corpo no fim do recuo e o traz de volta na frente —
      //    sem isso o braço varre um plano perfeito, que é o que faz parecer
      //    articulado num pino.
      // 3. **O COTOVELO dobra mais de um lado.** `abs(seno)` dobra igual na
      //    ida e na volta; um braço dobra bem mais quando vem à frente do que
      //    quando vai atrás. O `max(0, ·)` separado é essa assimetria.
      this.rig.girar('ombroE', LADO, Math.sin(f + Math.PI - 0.5) * bracos * 0.3);
      this.rig.girar('ombroD', LADO, Math.sin(f - 0.5) * bracos * 0.3);
      this.rig.girar('bracoE', LADO, senoD * bracos);
      this.rig.girar('bracoD', LADO, senoE * bracos);
      this.rig.girar('bracoE', FRENTE, -Math.max(0, -senoD) * bracos * 0.42);
      this.rig.girar('bracoD', FRENTE, Math.max(0, -senoE) * bracos * 0.42);
      this.rig.girar(
        'antebracoE',
        LADO,
        -(Math.max(0, senoD) * 0.85 + Math.max(0, -senoD) * 0.3) * bracos,
      );
      this.rig.girar(
        'antebracoD',
        LADO,
        -(Math.max(0, senoE) * 0.85 + Math.max(0, -senoE) * 0.3) * bracos,
      );
      // E a mão acompanha com atraso, como uma coisa pendurada na ponta.
      this.rig.girar('maoE', LADO, Math.sin(f + Math.PI - 0.8) * bracos * 0.45);
      this.rig.girar('maoD', LADO, Math.sin(f - 0.8) * bracos * 0.45);

      // --- A CORRIDA FOFA ---
      //
      // *"Pokémons fofos andam com os braços esticados para fora fazendo uma
      // corrida fofa"* — playtest de 19/09. Quem é fofo sai de uma medida e
      // não de uma tabela: braço curto em relação ao tronco. Ver `fofura`.
      //
      // São três coisas ao mesmo tempo, e as três importam:
      //
      // 1. **Os braços ABREM para fora** e ficam lá — até 50° de abertura no
      //    pico da corrida. É a pose inteira: um bicho de bracinho curto não
      //    balança o braço ao correr porque não tem alavanca para isso, então
      //    ele estica.
      // 2. **Eles TREMEM,** rápido e pouco, no dobro da cadência da passada.
      //    Braço aberto e parado é um avião de papel; o tremor é o que faz
      //    virar corridinha.
      // 3. **O cotovelo ESTICA.** O `antebraco` acima dobra proporcional ao
      //    balanço; aqui ele é desfeito na medida da fofura, porque "esticado"
      //    é literal.
      //
      // O peso é `pCorrer` mais um terço de `pAndar`: andando a pose aparece
      // insinuada, correndo ela é a corrida inteira.
      const fofo = this.fofura * (pCorrer + pAndar * 0.35);
      if (fofo > 0.01) {
        const tremor = Math.sin(f * 2) * 0.16;
        const aberto = 0.88 * fofo;
        this.rig.girar('bracoE', FRENTE, aberto + tremor * fofo);
        this.rig.girar('bracoD', FRENTE, -aberto + tremor * fofo);
        // Um pouco para TRÁS também, que é o que separa "braço aberto" de
        // "braço esticado para fora correndo".
        this.rig.girar('bracoE', LADO, -0.3 * fofo);
        this.rig.girar('bracoD', LADO, -0.3 * fofo);
        this.rig.girar('antebracoE', LADO, (0.75 * bracos + 0.1) * fofo);
        this.rig.girar('antebracoD', LADO, (0.75 * bracos + 0.1) * fofo);
        // E o corpo dá uma saltitada a mais: o passo de quem corre com o
        // braço aberto é curto e alto.
        this.oscilacao += Math.abs(Math.sin(f)) * 0.018 * fofo;
      }

      // Quadril: sobe duas vezes por ciclo (um por pé) e torce uma vez só.
      this.rig.girar('quadril', CIMA, senoE * amplitude * 0.28);
      this.rig.girar('peito', CIMA, -senoE * amplitude * 0.22);
      // Gingado: o corpo sobe duas vezes por ciclo, uma por pé que encosta.
      this.oscilacao += Math.abs(Math.sin(f)) * 0.022 * pPassada;
      // E AFUNDA no contato, que é a metade que faltava. O pico de compressão
      // cai onde `Math.abs(sin)` é zero — o instante em que o pé está embaixo
      // do corpo sustentando tudo. Correndo ela é quase o dobro: é o peso
      // chegando mais rápido no chão.
      const contato = 1 - Math.abs(Math.sin(f));
      this.compressao += contato * contato * (pAndar * 0.35 + pCorrer * 0.75);

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
      // E o resto da cauda, que até aqui ia atrás como um cabo de vassoura: o
      // Charmander tem nove nós de rabo e só três se mexiam. Ver `Rig.rabo`.
      for (let i = 0; i < this.rig.rabo; i++) {
        this.rig.girarRabo(
          i,
          CIMA,
          -Math.sin(f - 1.65 - i * 0.55) * (0.11 - i * 0.008) * pPassada,
        );
      }
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

    this.ondularApendices(t, ctx, pPassada);
  }

  /**
   * QUEM NÃO TEM PERNA NÃO ANDA: rasteja, nada ou serpenteia. Ver `temPernas`.
   *
   * ## O que estava acontecendo
   *
   * Nada. O ciclo de passada gira coxa, joelho e pé, e nos 19 sem perna cada um
   * desses `girar` procurava um osso que não existe — um no-op atrás do outro.
   * Um Ekans atravessava o quarto absolutamente rígido, como uma peça de
   * plástico puxada por um barbante. E o pior: ele recebia o GINGADO vertical,
   * o pulinho de quem tem pé batendo no chão, que numa cobra é o movimento mais
   * errado possível.
   *
   * ## A onda
   *
   * O corpo inteiro vira uma corda. A mesma onda percorre quadril → tronco →
   * peito → cauda1..3 → e a cauda estendida (ver `Rig.rabo`, que é o que faz a
   * onda chegar ao décimo terceiro nó do Ekans em vez de morrer no terceiro),
   * com ATRASO crescente por elo e AMPLITUDE crescente para trás.
   *
   * O atraso é o que faz a onda viajar em vez de o bicho inteiro balançar
   * junto; a amplitude crescente é o que faz a ponta chicotear e a cabeça
   * ficar quase parada, que é como um animal sem perna se move — a cabeça
   * aponta para onde vai e o corpo empurra atrás dela.
   *
   * ## O que NÃO acontece aqui
   *
   * O gingado vertical. `oscilacao` fica quase zero: uma serpente não pula a
   * cada passo, e o pouco que sobra é o corpo passando por cima das próprias
   * curvas. A `compressao` também fica de fora — ela existe para o peso caindo
   * no pé.
   */
  private rastejar(t: number, pAndar: number, pCorrer: number) {
    const pPassada = pAndar + pCorrer;
    // Mais devagar que a passada e com mais amplitude: onda de corpo é longa.
    const fase = t * (3.4 + pCorrer * 2.6);
    const forca = (pAndar * 0.16 + pCorrer * 0.3) * pPassada;

    // `girarLateral` e não `girar(…, CIMA, …)`: o eixo sai da direção do
    // osso. Ver `Rig.eixoLateral` — foi o que fez o Ekans, que vem empinado na
    // vertical, deixar de girar em torno do próprio eixo sem sair do lugar.
    //
    // A cabeça quase não entra: ela é a proa.
    this.rig.girarLateral('cabeca', Math.sin(fase) * forca * 0.25);
    this.rig.girarLateral('pescoco', Math.sin(fase - 0.3) * forca * 0.45);
    this.rig.girarLateral('peito', Math.sin(fase - 0.6) * forca * 0.8);
    this.rig.girarLateral('tronco', Math.sin(fase - 0.9) * forca);
    this.rig.girarLateral('quadril', Math.sin(fase - 1.2) * forca * 1.15);
    this.rig.girarLateral('cauda1', Math.sin(fase - 1.5) * forca * 1.25);
    this.rig.girarLateral('cauda2', Math.sin(fase - 1.8) * forca * 1.3);
    this.rig.girarLateral('cauda3', Math.sin(fase - 2.1) * forca * 1.35);
    for (let i = 0; i < this.rig.rabo; i++) {
      // A onda continua e MORRE: sem o decaimento, a ponta de um Ekans de treze
      // nós somaria treze vezes o mesmo ângulo e o rabo daria a volta no corpo.
      const decai = Math.max(0.25, 1 - i * 0.08);
      this.rig.girarRaboLateral(i, Math.sin(fase - 2.4 - i * 0.3) * forca * 1.35 * decai);
    }

    // Um rolinho no eixo do corpo, defasado da onda: é o que dá volume ao
    // movimento e o separa de um zigue-zague desenhado no chão.
    this.rig.girar('tronco', FRENTE, Math.sin(fase - 0.9 + Math.PI / 2) * forca * 0.35);
    this.rig.girar('quadril', FRENTE, Math.sin(fase - 1.2 + Math.PI / 2) * forca * 0.4);

    // E quase nenhum pulo. Ver o cabeçalho.
    this.oscilacao += Math.abs(Math.sin(fase)) * 0.006 * pPassada;
  }

  /**
   * Asas, barbatanas, bigodes e antenas: a onda que percorre cada cadeia.
   *
   * ## O que estava parado
   *
   * Tudo isso. O `Rig` mapeia vinte e cinco papéis — tronco, membros, três nós
   * de cauda, duas orelhas — e o resto do esqueleto ficava exatamente na pose
   * de bind, para sempre. Um Butterfree atravessava o quarto com as quatro
   * asas rígidas; o bigode do Magikarp era um arame; a crista do Gyarados,
   * uma serra de plástico. Foi o pedido do playtest de 19/09.
   *
   * ## Uma regra para todos
   *
   * Não há tabela por espécie, e não precisa haver: `Rig.apendices` entrega
   * cadeias com LADO e COMPRIMENTO RELATIVO ao tronco (ver src/rig.ts), e essas
   * duas medidas bastam para decidir como cada uma se mexe.
   *
   * - **Quem é grande é asa** (a do Charizard é mais comprida que o tronco
   *   dele): bate forte, e muito mais forte em quem PAIRA — é o que segura o
   *   bicho no ar.
   * - **Quem é pequeno é bigode ou antena**: treme de leve, o tempo todo,
   *   inclusive parado. Bigode parado é o que mais entrega modelo estático.
   * - **A onda anda do corpo para a PONTA**, com atraso por elo e amplitude
   *   crescente. É o mesmo princípio da cauda em três nós que já existia aqui,
   *   e é o que faz a coisa parecer flexível em vez de girar inteira.
   * - **Os dois lados sobem juntos.** Girando em torno do eixo FRENTE, a asa
   *   esquerda sobe com ângulo positivo e a direita com negativo — daí o sinal
   *   por lado. Sem ele, o bicho rema.
   */
  private ondularApendices(t: number, ctx: Contexto, pPassada: number) {
    const apendices = this.rig.apendices;
    if (apendices.length === 0) return;

    const voa = ctx.flutua === true;
    // Nervoso mexe mais depressa; desmaiado não mexe nada.
    const ritmo = voa ? 5.4 : 1.6 + ctx.alarme * 1.4 + pPassada * 1.1;
    const vivo = ctx.desmaiado ? 0.12 : 1;

    for (let i = 0; i < apendices.length; i++) {
      const ap = apendices[i];
      const asa = ap.relativo > 0.55;
      // A asa de quem paira bate de verdade (20°); a de quem anda só acompanha.
      // O bigode fica nos 4° o tempo todo, que é o que o olho lê como "vivo".
      const base = asa
        ? (voa ? 0.36 : 0.06 + pPassada * 0.12)
        : 0.05 + pPassada * 0.04 + ctx.alarme * 0.03;
      const amplitude = base * vivo;
      if (amplitude < 0.004) continue;

      // Cada cadeia fora de fase da vizinha: as quatro asas do Butterfree
      // batendo em uníssono seriam uma só asa dupla.
      const fase = t * ritmo + i * 0.7;
      const sinal = ap.lado === 1 ? -1 : 1;
      const eixo = ap.lado === 0 ? LADO : FRENTE;

      for (let e = 0; e < ap.tamanho; e++) {
        // A ponta chega depois e vai mais longe.
        const fracao = ap.tamanho > 1 ? e / (ap.tamanho - 1) : 0;
        const onda = Math.sin(fase - e * 0.45);
        this.rig.girarElo(i, e, eixo, onda * amplitude * (0.45 + fracao * 0.9) * sinal);
      }
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
  /**
   * O envelope de um gesto: recolher, disparar — e ASSENTAR.
   *
   * O disparo era meio seno puro, que volta exatamente ao repouso e para. Isso
   * é o que um mecanismo faz; um corpo passa um pouco do ponto e volta,
   * porque tem massa e a massa não para onde o músculo mandou.
   *
   * O acréscimo é pequeno de propósito — 18% do disparo, no último terço — e é
   * dos detalhes que mais se notam sem se conseguir nomear: com ele o golpe
   * tem fim, sem ele o golpe só acaba.
   */
  private envelope(t: number, fimDoRecuo = 0.35, comecoDoDisparo = 0.3) {
    const u = Math.max(0, (t - comecoDoDisparo) / (1 - comecoDoDisparo));
    const disparo = Math.max(0, Math.sin(u * Math.PI));
    // O contragolpe: começa quando o disparo já passou do pico e morre no fim.
    const assenta = u > 0.62 ? Math.sin((u - 0.62) / 0.38 * Math.PI) * 0.18 : 0;
    return {
      recolher: Math.max(0, 1 - t / fimDoRecuo),
      disparo: disparo - assenta,
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

  /**
   * A pose de estar sendo segurado.
   *
   * ## Por que ela é uma CAMADA e não um gesto
   *
   * Um `Gesto` tem começo, meio e fim: `disparar` zera o cronômetro e o peso é
   * um seno que sobe e desce. Estar no colo não tem duração — dura o tempo que
   * a sua mão durar —, e rearmar um gesto por quadro o prenderia em peso zero
   * para sempre. Daí uma camada própria, entre a base e o gesto: ela SOMA por
   * cima do ócio, e o gesto continua podendo acontecer em cima dela (ele ainda
   * acena e olha em volta no seu colo).
   *
   * ## Por que ela precisava existir
   *
   * Com uma mão a palma tapa metade do corpo e ninguém repara. Levantado à
   * frente do rosto pelas DUAS mãos — que é o gesto de 19/09 —, um bicho na
   * pose de ócio, de pé no ar com as pernas retas, é a coisa mais boneco que o
   * jogo tem. Era a dívida registrada quando o colo de duas mãos entrou.
   *
   * ## A pose
   *
   * Um animal levantado recolhe as pernas e relaxa o tronco para trás. Nada
   * aqui é grande: o corpo inteiro se move menos de 40°, porque o que denuncia
   * uma pose inventada é o exagero, e porque isto soma em cima da base.
   *
   * Os sinais seguem a convenção do topo deste arquivo, que muda de osso para
   * osso: tronco e peito apontam para cima (positivo inclina à FRENTE), a
   * cabeça aponta para a frente (positivo BAIXA o focinho), e braços, coxas e
   * cauda apontam para baixo (positivo joga para TRÁS).
   */
  private aplicarColo(ctx: Contexto) {
    const p = ctx.colo ?? 0;
    if (p < 0.01 || ctx.desmaiado) return;

    // As pernas recolhem: a coxa sobe à frente e o joelho dobra atrás dela. É o
    // que mais distingue "sendo segurado" de "de pé no ar".
    this.rig.girar('coxaE', LADO, -0.58 * p);
    this.rig.girar('coxaD', LADO, -0.58 * p);
    this.rig.girar('pernaE', LADO, -0.72 * p);
    this.rig.girar('pernaD', LADO, -0.72 * p);
    // O pé solta e pende.
    this.rig.girar('peE', LADO, -0.3 * p);
    this.rig.girar('peD', LADO, -0.3 * p);

    // O tronco reclina para trás, como quem está apoiado em alguma coisa — e
    // não para a frente, que é a pose de quem está caindo.
    this.rig.girar('tronco', LADO, -0.14 * p);
    this.rig.girar('peito', LADO, -0.06 * p);
    // E a cabeça levanta um pouco, para ele olhar para você em vez de para o
    // chão. O resto do olhar é de `encararComACabeca`.
    this.rig.girar('cabeca', LADO, -0.16 * p);

    // Os braços caem à frente, dobrados. Um bicho no colo não fica de braços
    // estendidos: ele se apoia ou se encolhe.
    this.rig.girar('bracoE', LADO, -0.34 * p);
    this.rig.girar('bracoD', LADO, -0.34 * p);
    this.rig.girar('antebracoE', LADO, -0.42 * p);
    this.rig.girar('antebracoD', LADO, -0.42 * p);

    // A cauda pende e enrola de leve. Ela já aponta para baixo em repouso, e a
    // base continua balançando-a por cima disto — é o que a mantém viva.
    this.rig.girar('cauda1', LADO, 0.1 * p);
    this.rig.girar('cauda2', LADO, 0.16 * p);
    this.rig.girar('cauda3', LADO, 0.2 * p);
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
  /**
   * A pose de repouso dos braços: desfaz a T-pose e garante que eles fiquem
   * do lado de FORA do corpo. Ver `medirBracos`.
   *
   * O `+ 0.06` é o que responde à outra metade da queixa — *"nem fica colado
   * no corpo o tempo todo"*. Mesmo num bicho magro, em que a conta da largura
   * dá zero, o braço não encosta no tronco: fica três graus e meio afastado,
   * que é onde um braço vivo fica.
   */
  private relaxarBracos() {
    if (this.relaxoE) this.rig.girar('bracoE', FRENTE, this.relaxoE);
    if (this.relaxoD) this.rig.girar('bracoD', FRENTE, this.relaxoD);
    // O braço esquerdo abre com giro positivo em FRENTE e o direito com
    // negativo — `aberturaE` é sempre ≥ 0 e `aberturaD` sempre ≤ 0, por
    // construção em `medirBracos`. O piso de 0,06 rad segue o mesmo sinal.
    this.rig.girar('bracoE', FRENTE, this.aberturaE + 0.06);
    this.rig.girar('bracoD', FRENTE, this.aberturaD - 0.06);
  }

  /**
   * As MÃOS: elas fecham.
   *
   * ## O que estava parado
   *
   * Tudo. O `Rig` mapeava `maoE` e `maoD` — o osso do punho — e mais nada
   * abaixo dele, e as falanges ficavam na pose de bind para sempre. Um
   * Charmander dava um Megassoco com a mão ABERTA; um Machop fazia Golpe de
   * Caratê de palma espalmada. Os ossos sempre estiveram no arquivo: vinte e
   * duas espécies têm `LFingerA`/`LFingerB`/`LFingerC` com duas falanges cada,
   * e quinze têm um `LFinger` só. Ver `Dedo` em src/rig.ts.
   *
   * ## Quando uma mão fecha
   *
   * - **Socando, arranhando ou se jogando**: punho, e ele fecha ANTES do
   *   impacto — a mão já chega fechada, como a de quem vai bater. O envelope
   *   do gesto dá o recuo e o disparo; o punho acompanha o recuo, que é a
   *   parte em que o braço está indo para trás.
   * - **Correndo**: meio fechada. Ninguém corre de mão espalmada.
   * - **Parada**: quase aberta, abrindo e fechando de leve com a respiração —
   *   é a mesma razão do braço que não fica no mesmo ângulo.
   * - **Desmaiada**: mão mole, aberta.
   * - **No colo e no carinho**: aberta, que é o que "não estou fazendo nada"
   *   quer dizer com a mão.
   *
   * A mola de 12/s é o que separa "fechou" de "piscou fechado".
   */
  private animarMaos(dt: number, ctx: Contexto) {
    if (!this.rig.temDedos) return;

    let alvo = 0.12 + Math.sin(this.tempo * 1.1 + this.semente) * 0.06;

    if (ctx.desmaiado) {
      alvo = 0;
    } else if (this.gesto && ehAtaque(this.gesto) && this.gesto !== 'sopro') {
      // `aura` é só olhar feio: cerra o punho e segura. Os outros batem, e aí
      // o punho está fechado no recuo e ainda fechado no impacto.
      const { recolher, disparo } = this.envelope(this.gestoT);
      alvo = Math.min(1, 0.35 + Math.max(recolher, Math.abs(disparo)) * 0.75);
    } else if (this.gesto === 'cafune' || this.gesto === 'acenar') {
      alvo = 0.05;
    } else {
      alvo = Math.max(alvo, this.pesos.correndo * 0.55 + this.pesos.andando * 0.28);
    }

    this.fechoDaMao += (alvo - this.fechoDaMao) * Math.min(1, dt * 12);
    this.rig.fecharDedos(this.fechoDaMao);
  }

  /** Onde a mão precisa chegar para o carinho valer: a cabeça, não o centro. */
  pontoDaCabeca(alvo = new THREE.Vector3()): THREE.Vector3 | null {
    return this.rig.pontoDe('cabeca', alvo) ?? this.rig.pontoDe('peito', alvo);
  }
}
