import * as THREE from 'three';
import { Pokemon } from './creature';
import {
  ESPECIES,
  INICIAIS,
  NIVEL_MAXIMO,
  TIPOS,
  calcularDano,
  corDe,
  corHexDe,
  corHexDeTipo,
  LIMITE_ESTAGIO,
  aplicarStatus,
  danoRecebido,
  escolherGolpe,
  arsenal,
  golpesDeDano,
  golpesDeStatus,
  intervaloDeAtaque,
  multEstagio,
  textoEstagio,
  evolucaoEm,
  evolucaoDaPedra,
  nivelSelvagem,
  ondeNasce,
  pesoSpawn,
  porId,
  chanceShiny,
  sortearShiny,
  textoChanceShiny,
  textoEfetividade,
  textoTipos,
  xpDeEncontro,
  xpParaNivel,
  type Especie,
  type Golpe,
} from './species';
import { garantir, instanciar, type Corpo } from './modelos';
import { Pokebola } from './orb';
import { Sala } from './room';
import { BOTAO_A, BOTAO_B, FeixeDeAlvo, MarcaDeAlvo, MarcaDeDestino, Mao, Mira, RaioMira } from './hands';
import { Luva } from './glove';
import { Cinto } from './cinto';
import { Tablet, ALCANCE_TABLET } from './tablet';
import { Aviso, BarraVida, PainelPulso, type Carga, type LinhaTexto } from './hud';
import { Evolucao, PromptEvolucao } from './evolucao';
import type { GestoDeAtaque } from './anima';
import { PainelTime, type EntradaGolpe } from './menu';
import { type Modo } from './modos';
import {
  Ajustes,
  DIFICULDADES,
  INTERRUPTORES,
  type ChaveAjuste,
  type PerfilDificuldade,
} from './ajustes';
import { PainelDex, type EstadoDex } from './dexpanel';
import { EscolhaInicial } from './starter';
import { BOLA_PADRAO, bolaPorId, type TipoBola } from './balls';
import { BONUS_FRUTA, ITENS, SEGUNDOS_FRUTA, itemPorId } from './itens';
import { ehPedra, pedraPorId, aQuemServe } from './pedras';
import { ItemNaMao, RastroDeIsca } from './isca';
import { Mochila } from './mochila';
import { Medidor } from './medidor';
import { Achados } from './achados';
import { CONDICOES, condicaoDoGolpe } from './condicao';
import { pedindoAjuda } from './gesto';
import { Aura, Efeito, Impacto, NumeroDeDano } from './attacks';
import { Assinatura, assinaturaDe } from './signature';
import { PainelPc } from './pc';
import { calar, falar, preparar, temNarracao } from './voz';
import { Dex, type Exemplar } from './state';
import { audio } from './audio';
import { escolherPesado } from './rng';

/**
 * Quantos selvagens coexistem. Tres, e nao dois, porque agora se ANDA pela
 * casa: com dois, sair da sala deixava o quarto vazio ate o proximo nascer.
 */
/** O gesto de um golpe. Os gerados trazem; os sintéticos caem no padrão. */
const golpeDe = (s: { golpe: Golpe | null }): GestoDeAtaque =>
  s.golpe ? gestoDoGolpe(s.golpe) : 'investida';

const gestoDoGolpe = (golpe: Golpe): GestoDeAtaque =>
  (golpe.animacao as GestoDeAtaque | undefined) ??
  (golpe.categoria === 'status' ? 'aura' : golpe.categoria === 'especial' ? 'sopro' : 'investida');

/** Rascunho do quadro para a origem do feixe — ver atualizarFeixe. */
const _feixeOrigem = new THREE.Vector3();

/** Rascunhos do quadro para o ouvinte do áudio. Ver atualizarOuvinte. */
const _ouvintePos = new THREE.Vector3();
const _ouvinteFrente = new THREE.Vector3();
const _ouvinteCima = new THREE.Vector3();
const _ouvinteGiro = new THREE.Quaternion();

const MAX_SELVAGENS = 3;
/**
 * Alem disto, o selvagem que ficou para tras vai embora sozinho — e abre vaga
 * para nascer alguem a frente. E o que mantem o numero de modelos na memoria
 * constante por mais que voce caminhe.
 */
const DISTANCIA_DE_SUMICO = 9;
/** Só a bola comum recarrega sozinha; as outras vêm de capturas. */
const RECARGA_BOLA_COMUM = 5;
const ALCANCE_BATALHA = 4.5;

/**
 * Quão perto a mão precisa chegar de uma bola caída para pegá-la.
 *
 * Dezesseis centímetros é muito, e é de propósito: a bola está no CHÃO, você
 * está agachado, o controle não tem dedos e você não vê a própria mão por trás
 * dela. Exigir precisão aqui transformaria "pegar do chão" em "tentar três
 * vezes", que é o oposto do gesto.
 */
const ALCANCE_DO_CHAO = 0.16;

/**
 * Até que altura um Pokémon cabe no colo.
 *
 * Meio metro: dá Pikachu, Charmander, Eevee, Squirtle — os que uma pessoa
 * pegaria no colo sem pensar. Onix não entra, e não entrar é a resposta certa;
 * um Onix de oito metros na palma da mão não é uma coisa fofa, é um erro de
 * escala andando pela sala.
 */
const ALTURA_DE_COLO = 0.5;
/** Quão perto a mão precisa chegar do corpo dele para pegar. */
const ALCANCE_DE_COLO = 0.3;

/**
 * O mapeamento de boas-vindas, em superfícies e em segundos.
 *
 * Seis superfícies é pouco de propósito: quem tem o Space Setup feito entrega
 * isso no primeiro quadro e passa direto, sem nem ler o aviso — e quem não tem
 * anda meia dúzia de passos, que é exatamente o que o mapa precisa para deixar
 * de ser um quadrado em volta de você. O teto de quarenta e cinco segundos
 * existe para quem está num lugar que o headset não entende: o jogo começa
 * assim mesmo, com o piso que acompanha o jogador.
 */
const SUPERFICIES_PARA_COMECAR = 6;
const ESCANEAMENTO_MAXIMO = 45;
/** Piso de tempo, só para o aviso dar tempo de ser lido. */
const ESCANEAMENTO_MINIMO = 2.5;
/** Fora de campo, cada Pokémon recupera 1 de HP a cada tanto de segundos. */
const SEGUNDOS_POR_HP = 2.5;
/** Perto o bastante para a mão encostar no companheiro e fazer carinho. */
const DISTANCIA_CARINHO = 0.3;

/**
 * Um selvagem em campo e o relógio do próximo golpe dele.
 *
 * O relógio é POR BICHO, e não um só para todos. Antes havia um único contador
 * no jogo: a cada 2,6 s, um dos selvagens presentes era sorteado e atacava. Isso
 * impedia qualquer aviso — não dava para dizer de quem viria o golpe antes de
 * sortear — e fazia dois selvagens atacarem na metade da frequência de um.
 */
interface Selvagem {
  pokemon: Pokemon;
  barra: BarraVida;
  /** Segundos até o golpe sair. Conta para baixo desde `ciclo`. */
  restante: number;
  /** Duração do ciclo inteiro deste golpe, para a barra saber a fração. */
  ciclo: number;
  /** Os últimos segundos do ciclo: a barra fica vermelha e o corpo recua. */
  aviso: number;
  /** O golpe já escolhido. O nome dele aparece na barra o ciclo todo. */
  golpe: Golpe | null;
  /** Se a animação de recolher já foi disparada neste ciclo. */
  avisou: boolean;
}

function distanciaAoSegmento(ponto: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const comprimento = ab.lengthSq();
  if (comprimento < 1e-8) return ponto.distanceTo(a);
  const t = THREE.MathUtils.clamp(ponto.clone().sub(a).dot(ab) / comprimento, 0, 1);
  return ponto.distanceTo(a.clone().addScaledVector(ab, t));
}

export class Jogo {
  readonly cena = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sala: Sala;
  readonly dex = new Dex();

  private renderer: THREE.WebGLRenderer;
  private selvagens: Selvagem[] = [];
  private companheiro: Pokemon | null = null;
  /** O exemplar da coleção que está em campo — é nele que a XP entra. */
  private exemplarEmCampo: Exemplar | null = null;
  /** Conta regressiva para a próxima gravação do HP de quem está em campo. */
  private salvarHpEmCampo = 10;
  private barraCompanheiro: BarraVida | null = null;
  private bolas: Pokebola[] = [];
  private efeitos: Efeito[] = [];
  private impactos: Impacto[] = [];
  /** Os números de dano subindo dos bichos. Ver src/attacks.ts. */
  private numeros: NumeroDeDano[] = [];
  /** Os efeitos exclusivos dos iniciais. Ver src/signature.ts. */
  private assinaturas: Assinatura[] = [];

  private maos: Mao[] = [];
  private miras = new Map<number, Mira>();
  private raios = new Map<number, RaioMira>();
  /** O laser de combate, um por mão. Ver FeixeDeAlvo. */
  private feixes = new Map<number, FeixeDeAlvo>();
  private bolaNaMao = new Map<number, Pokebola>();
  /** Linha e anel do comando "vá até ali". */
  private marca = new MarcaDeDestino();
  /** A pergunta na tela: deixa evoluir? Fica até ser respondida. */
  private promptEvolucao = new PromptEvolucao();
  private evolucaoPendente: { exemplar: Exemplar; de: Especie; para: Especie } | null = null;
  private evolucaoEmCurso: {
    efeito: Evolucao;
    exemplar: Exemplar;
    de: Especie;
    para: Especie;
    trocou: boolean;
  } | null = null;
  /** A fruta ou o doce na mão, por índice de mão. Ver src/isca.ts. */
  private itemNaMao = new Map<number, ItemNaMao>();
  /** Há quanto tempo a isca está apontada para o mesmo bicho. */
  private miraDoItem = new Map<number, { alvo: Pokemon; tempo: number }>();
  private rastros = new Map<number, RastroDeIsca>();
  /** Mão do modo sem headset — só para o jogador ver que tem mão. */
  private luvaPlana: Luva | null = null;
  /**
   * A mão que está com o gatilho preso, e desde quando. É a diferença entre
   * tocar o gatilho (atacar) e segurá-lo (marcar para onde ir).
   */
  private gatilhoPreso: { mao: Mao; desde: number; comandou: boolean } | null = null;
  private pontoMarcado: THREE.Vector3 | null = null;
  /** Quando a bola da mão carrega um Pokémon para soltar, e não é de captura. */
  private bolaDeInvocacao = new Map<number, Exemplar>();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private aviso: Aviso;
  private painelPulso = new PainelPulso();
  /** A mochila aberta no ar, onde os itens são pegos com a mão. Ver src/mochila.ts. */
  private mochila = new Mochila();
  /** Os itens que aparecem em cima dos seus móveis. Ver src/achados.ts. */
  private achados = new Achados(this.cena);
  /** Há quanto tempo as duas palmas estão para cima. Ver atualizarPedidoDeAjuda. */
  /** Há quanto tempo a cabeça está na altura de quem está sentado. Ver 4.2. */
  private tempoSentado = 0;
  private pedindoAjudaHa = 0;
  /** Segundos até o gesto de ajuda poder valer de novo. */
  private travaDaAjuda = 0;
  /** O contador de quadros, preso à câmera. Ver src/medidor.ts. */
  private medidor = new Medidor();
  private painelTime = new PainelTime();
  private painelDex = new PainelDex();
  /** O PC: a caixa e a edição da equipe. Abre com o botão Y. */
  private pc = new PainelPc();
  private pulsoAnexado = false;

  /** Existe só até você escolher o parceiro inicial. */
  private escolha: EscolhaInicial | null = null;
  private carregandoEscolha = false;
  /** Trava o analógico para um passo por inclinada. */
  private analogicoNeutro = true;

  private recarga = 0;
  readonly ajustes = new Ajustes();
  private auras: Aura[] = [];
  /** Golpe escolhido à mão no painel. Só o modo Batalha usa. */
  private golpeArmado: string | null = null;
  /** Selvagens que você aceitou encarar, no Safari. */
  private encarados = new Set<Pokemon>();
  /** Quem você apontou para o companheiro bater. Ver `alvoEscolhido`. */
  private alvoTravado: Pokemon | null = null;
  /** O anel que marca esse alvo no chão, para não haver dúvida de quem é. */
  private marcaDeAlvo = new MarcaDeAlvo();
  private proximoSpawn = 2;
  private tempoLeituraSala = 0;
  /** O mapeamento de boas-vindas, que roda uma vez no começo da sessão. */
  private escaneando = true;
  private tempoEscaneando = 0;
  /** A última contagem já escrita no aviso, para não reescrever à toa. */
  private mapeadasNoAviso = -1;
  private acumuladoCura = 0;
  private posicaoJogador = new THREE.Vector3();

  /** Um nascimento por vez: o modelo é baixado antes de o bicho aparecer. */
  private nascendo = false;
  /** Enquanto durar, a próxima bola vale mais — é a fruta fazendo efeito. */
  private bonusFruta = 0;
  /** Impede que um carinho vire vinte no mesmo segundo. */
  private recargaCarinho = 0;
  /** Quanto tempo seguido a mão está encostada nele. */
  private tempoDeCarinho = 0;

  private modoPlano = false;
  private carregando = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 60);
    this.camera.position.set(0, 1.6, 0);
    // A única coisa do jogo presa à cabeça, e de propósito: um medidor que só
    // se lê virando o pulso não é lido enquanto se joga. Ver src/medidor.ts.
    this.camera.add(this.medidor.grupo);

    this.sala = new Sala(this.cena);
    this.aviso = new Aviso(this.cena);
    this.sala.usarFallback();

    this.cena.add(this.painelTime.grupo, this.pc.grupo, this.mochila.grupo);
    // A Pokédex não entra solta na cena: as placas dela são a TELA do tablet,
    // e é a carcaça que anda pelo mundo.
    this.tablet.tela.add(this.painelDex.grupo);
    this.cena.add(this.tablet.grupo);
    this.cena.add(this.promptEvolucao.grupo);
    this.pc.definirDex(this.dex);

    this.montarLuzes();
    this.montarMaos();

    // A voz de cada bicho acompanha o peso dele: a mesma gravação sai grave num
    // Snorlax e fina num Caterpie. Ver `tomDe` em src/audio.ts.
    audio.definirPesos(ESPECIES.map((e) => [e.num, e.peso] as [number, number]));
    audio.vozDoNome = this.ajustes.vozDoNome;
    audio.musicaDeBatalha = this.ajustes.musicaDeBatalha;
  }

  private montarLuzes() {
    this.cena.add(new THREE.HemisphereLight(0xffffff, 0x505a6b, 1.5));

    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    sol.position.set(1.4, 3.2, 1.1);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.camera.near = 0.4;
    sol.shadow.camera.far = 12;
    const c = sol.shadow.camera;
    c.left = -4;
    c.right = 4;
    c.top = 4;
    c.bottom = -4;
    this.cena.add(sol);

    // Plano invisível que só recebe sombra: é o que cola os Pokémon no seu chão.
    const geo = new THREE.PlaneGeometry(14, 14);
    const mat = new THREE.ShadowMaterial({ opacity: 0.3 });
    this.descartaveis.push(geo, mat);
    const chao = new THREE.Mesh(geo, mat);
    chao.rotation.x = -Math.PI * 0.5;
    chao.position.y = 0.002;
    chao.receiveShadow = true;
    this.cena.add(chao);
  }

  private montarMaos() {
    for (let i = 0; i < 2; i++) {
      const mao = new Mao(this.renderer, i);
      // A luva é branca nas duas mãos; a faixa do punho é o que distingue uma
      // da outra de relance, sem precisar olhar para os dedos.
      const cor = i === 0 ? 0x7fd4ff : 0xffb27f;

      const mira = new Mira(0xff6b5c);
      this.cena.add(mira.linha);
      this.miras.set(i, mira);

      const raio = new RaioMira();
      mao.alvo.add(raio.linha);
      this.raios.set(i, raio);

      // O feixe mora no espaço da mão: assim ele aponta para onde `mao.mira()`
      // aponta por construção, sem uma segunda conta de direção para divergir
      // da primeira.
      const feixe = new FeixeDeAlvo();
      mao.alvo.add(feixe.grupo);
      this.feixes.set(i, feixe);

      const rastro = new RastroDeIsca();
      this.cena.add(rastro.pontos);
      this.rastros.set(i, rastro);

      // A luva só pode ser montada quando o lado da mão for conhecido — ela é
      // espelhada, e o evento `connected` é quem diz qual é qual.
      mao.alvo.addEventListener('connected', () => mao.vestirLuva(cor));

      // GRIP segura e arremessa a pokébola.
      mao.alvo.addEventListener('squeezestart', () => this.pegarBola(mao));
      mao.alvo.addEventListener('squeezeend', () => this.arremessarBola(mao));
      // GATILHO: um toque comanda o ataque; segurar traça o caminho no chão.
      mao.alvo.addEventListener('selectstart', () => this.gatilhoDesceu(mao));
      mao.alvo.addEventListener('selectend', () => this.gatilhoSubiu(mao));

      this.cena.add(mao.alvo, mao.punho, mao.rastreada);
      this.maos.push(mao);
    }

    this.cena.add(this.marca.grupo, this.marcaDeAlvo.grupo);
  }

  ativarModoPlano() {
    this.modoPlano = true;
    const luva = new Luva('right', 0xff6b5c);
    luva.grupo.position.set(0.16, -0.14, -0.28);
    luva.grupo.rotation.set(-0.3, 0.2, 0);
    this.camera.add(luva.grupo);
    this.cena.add(this.camera);
    this.luvaPlana = luva;
  }

  // ------------------------------------------------------------ tamanho

  /**
   * De que tamanho o bicho entra na sala, em metros.
   *
   * Com `tamanhoReal` ligado — que é o padrão — vale a medida da Pokédex, sem
   * teto nenhum: Diglett tem vinte centímetros, Charizard tem um metro e setenta
   * e olha na sua cara, e Onix tem oito metros e oitenta e não cabe no quarto.
   * Não caber é o ponto. Esse é o único lugar do jogo onde a realidade
   * misturada mostra o que só ela mostra, e espremer tudo para dentro do sofá
   * jogava fora justamente isso.
   *
   * Desligado, vale a curva de compressão de antes (24 cm a 1,1 m), que é a
   * versão que cabe entre a mesa e a estante.
   */
  private alturaDe(especie: Especie): number {
    return this.ajustes.tamanhoReal ? especie.alturaReal : especie.altura;
  }

  // ------------------------------------------------------------ pokébolas

  /**
   * O tempo vira bola, e a tela conta.
   *
   * Aviso só quando a mochila estava VAZIA: nesse caso a bola que nasce é a
   * diferença entre poder jogar e não poder, e isso merece uma frase. Uma bola
   * que cai de três para quatro não merece — seria uma placa piscando a cada
   * setenta e cinco segundos pelo resto da partida.
   */
  private atualizarRecargaDeBolas() {
    const estavaVazio = this.dex.totalBolas === 0;
    const nasceram = this.dex.recarregar();
    if (nasceram <= 0 || !estavaVazio) return;

    audio.tilintar();
    this.aviso.mostrar(
      [
        { texto: 'Chegou uma Bola Comum', tamanho: 32, cor: '#f2f2f5' },
        {
          texto: 'elas voltam sozinhas quando você fica sem',
          tamanho: 20,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2.6,
    );
  }

  private get temCompanheiroEmCampo(): boolean {
    return this.companheiro !== null && this.companheiro.viva && !this.companheiro.desmaiado;
  }

  /**
   * O alcance da mão dentro do painel do pulso.
   *
   * Generoso de propósito: o painel está preso ao seu próprio braço, as cartas
   * têm dez centímetros e a mão que vai pegá-las não tem onde se apoiar. Uma
   * tolerância apertada transformaria "pegue a bola do Charmander" numa prova
   * de pontaria com o braço no ar.
   */
  private static readonly ALCANCE_PAINEL = 0.09;

  /**
   * O ponto da mão que MEXE no HUD.
   *
   * É a ponta do indicador, e por um bom tempo não era: o painel e o cinto
   * mediam a distância a partir do PUNHO. Quem apontava o dedo para uma carta
   * não via nada acender, porque o jogo estava olhando para um ponto uns dez
   * centímetros atrás da ponta do dedo — e o gesto natural diante de um painel
   * do tamanho de um relógio é justamente apontar, não encostar o pulso.
   *
   * `pontoDeToque` já era o ponto usado para encostar nos bichos (fazer carinho
   * com o centro do punho obrigava a enfiar meio braço dentro do Charmander).
   * O HUD passa a usar o mesmo ponto, e pela mesma razão: é onde a mão de
   * verdade toca. Com rastreamento de mão ele é o `index-finger-tip`; com
   * controle, a ponta do indicador da luva.
   */
  private pontoDoDedo(mao: Mao): THREE.Vector3 {
    return mao.pontoDeToque(new THREE.Vector3());
  }

  /** O que a mão está tocando no painel agora, se o painel estiver aberto. */
  private cartaSobAMao(mao: Mao) {
    if (!this.painelTime.aberto) return null;
    return this.painelTime.alcancado(this.pontoDoDedo(mao), Jogo.ALCANCE_PAINEL);
  }

  /**
   * Quem já tirou a mão do painel desde que pegou o que está segurando.
   *
   * Sem esta memória, devolver e pegar seriam o mesmo gesto: você fecha o grip
   * na carta para tirar a bola, abre a mão ainda em cima do painel — que é onde
   * ela está — e a bola voltaria para a mochila no mesmo instante. Guardar só
   * vale depois que a mão saiu e VOLTOU, que é o que 'pôr de volta no lugar'
   * quer dizer.
   */
  private saiuDoPainel = new Set<number>();

  /**
   * O cinto de bolas do antebraço esquerdo. Ver src/cinto.ts.
   *
   * Ele é filho do punho esquerdo, então nasce só quando esse punho aparece —
   * e some junto quando o controle se desconecta, sem ninguém precisar cuidar
   * disso.
   */
  private cintos = new Map<'left' | 'right', Cinto>();
  /** A carcaça da Pokédex, nas suas costas. Ver src/tablet.ts. */
  private tablet = new Tablet();
  /**
   * De qual slot saiu a bola que cada mão está segurando.
   *
   * É o que faz "devolver no mesmo lugar" ser uma frase com sentido: sem isso,
   * soltar a bola em cima do cinto devolveria para o primeiro slot que
   * estivesse por perto, e tirar a Lacuna para guardar uma Comum no lugar dela
   * é o tipo de bug que só aparece depois de você ter perdido a Lacuna.
   */
  private bolaVeioDoSlot = new Map<number, string>();
  /** Quem já tirou a mão do cinto desde que pegou. Mesmo papel do `saiuDoPainel`. */
  private saiuDoCinto = new Set<number>();

  /**
   * O slot do cinto sob esta mão, se houver.
   *
   * A mão que CARREGA o cinto nunca alcança o próprio cinto: ele está preso ao
   * antebraço dela, então a distância é sempre zero e todo grip da esquerda
   * viraria "peguei uma bola". Quem pega é a outra — que é como funciona num
   * braço de verdade.
   */
  /**
   * A mão está nas costas, onde a Pokédex fica guardada?
   *
   * Mede contra o PONTO de guarda, e não contra a carcaça: com o tablet na sua
   * mão, a carcaça está na sua frente, e devolver precisa continuar sendo
   * "leve a mão às costas" — que é o mesmo lugar de onde ela saiu.
   */
  private maoNasCostas(mao: Mao): boolean {
    if (!mao.conectada) return false;
    this.tablet.pontoGuardado(this.pontoDoTablet);
    return mao.posicaoMundo().distanceToSquared(this.pontoDoTablet) < ALCANCE_TABLET ** 2;
  }

  /**
   * Pega a Pokédex das costas, ou devolve se já estiver com ela.
   *
   * Qualquer uma das mãos serve, e é de propósito: a mão que estiver livre é
   * que vai lá atrás. Trocar de mão também vale — pegar com a direita estando
   * com ela na esquerda passa o tablet de uma para a outra, como um objeto de
   * verdade.
   */
  private pegarTablet(mao: Mao): boolean {
    if (!this.maoNasCostas(mao)) return false;

    if (this.tablet.naMaoDe === mao.indice) {
      this.guardarTablet(mao);
      return true;
    }

    this.tablet.naMaoDe = mao.indice;
    mao.sentir('acertou');
    audio.abrirPainel();
    this.aviso.mostrar(
      [
        { texto: 'Pokédex na mão', tamanho: 36, cor: '#ff8a8a' },
        {
          texto: 'aponte com a outra mão · leve às costas para guardar',
          tamanho: 21,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      1.8,
    );
    return true;
  }

  private guardarTablet(mao: Mao) {
    if (this.tablet.naMaoDe === null) return;
    this.tablet.naMaoDe = null;
    this.tablet.grupo.removeFromParent();
    this.cena.add(this.tablet.grupo);
    mao.sentir('pegou');
    audio.clique();
    // Guardou no meio de uma ficha falada: a voz para junto.
    calar();
  }

  /** Reaproveitado a cada quadro para não alocar um vetor por medição. */
  private pontoDoTablet = new THREE.Vector3();

  /**
   * O Pokémon que cada mão está segurando no colo.
   *
   * É um mapa e não um campo só porque as duas mãos podem estar ocupadas: uma
   * com o bicho e outra com a Pokédex, ou — e isto é a melhor parte — uma com o
   * bicho e a outra fazendo carinho nele.
   */
  private pokemonNoColo = new Map<number, Pokemon>();
  private pontoDaMao = new THREE.Vector3();

  /**
   * Pega no colo o Pokémon que estiver sob esta mão.
   *
   * Só os SEUS, e só os que cabem: pegar um selvagem no colo seria pegar no
   * colo um bicho que não te conhece, e a resposta dele a isso não é ronronar.
   */
  private pegarNoColo(mao: Mao): boolean {
    const c = this.companheiro;
    if (!c || !c.viva || c.desmaiado) return false;
    if (c.altura * c.raiz.scale.y > ALTURA_DE_COLO) return false;

    const alcance = Math.max(ALCANCE_DE_COLO, c.raio * 1.1);
    if (mao.pontoDeToque(this.pontoDaMao).distanceToSquared(c.centro) > alcance * alcance) {
      return false;
    }

    if (!c.pegarNoColo()) return false;
    this.pokemonNoColo.set(mao.indice, c);
    mao.segurando = true;
    mao.sentir('acertou');
    audio.carinho();
    audio.grito(c.especie.id, c.shiny, c.especie.num);
    this.aviso.mostrar(
      [
        { texto: `${c.especie.nome} no colo`, tamanho: 36, cor: corHexDe(c.especie) },
        {
          texto: 'a outra mão faz carinho · abra a mão para pôr no chão',
          tamanho: 21,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2,
    );
    return true;
  }

  /** Abriu a mão: ele desce de onde estava. */
  private soltarDoColo(mao: Mao) {
    const bicho = this.pokemonNoColo.get(mao.indice);
    if (!bicho) return;
    this.pokemonNoColo.delete(mao.indice);
    mao.segurando = false;
    bicho.soltarDoColo();
    mao.sentir('marcou');
  }

  /**
   * O bicho no colo vai onde a mão vai.
   *
   * Um palmo à frente da palma e um pouco acima, que é onde um bicho pequeno
   * fica quando você o segura contra o peito — e não centrado na mão, que o
   * deixaria atravessando os seus dedos.
   */
  private atualizarColo() {
    for (const [indice, bicho] of this.pokemonNoColo) {
      const mao = this.maos.find((m) => m.indice === indice);
      if (!mao?.conectada || !bicho.viva) {
        this.pokemonNoColo.delete(indice);
        bicho.soltarDoColo();
        continue;
      }
      mao.pontoDeToque(this.pontoDaMao);
      bicho.raiz.position.set(
        this.pontoDaMao.x,
        this.pontoDaMao.y + 0.02,
        this.pontoDaMao.z,
      );
    }
  }

  /** A bola caída mais perto desta mão, dentro do alcance. */
  private bolaCaidaPerto(mao: Mao): Pokebola | null {
    const ponto = mao.posicaoMundo();
    let melhor: Pokebola | null = null;
    let menor = ALCANCE_DO_CHAO * ALCANCE_DO_CHAO;
    for (const bola of this.bolas) {
      if (!bola.noChao) continue;
      const d = bola.posicao.distanceToSquared(ponto);
      if (d < menor) {
        menor = d;
        melhor = bola;
      }
    }
    return melhor;
  }

  /**
   * O cinto que ESTA mão alcança: o do outro braço.
   *
   * A mão que carrega um cinto nunca alcança o próprio — ele está preso ao
   * antebraço dela, a distância seria sempre zero, e todo grip daquela mão
   * viraria "peguei uma bola".
   */
  private cintoPara(mao: Mao): Cinto | null {
    if (mao.lado !== 'left' && mao.lado !== 'right') return null;
    return this.cintos.get(mao.lado === 'left' ? 'right' : 'left') ?? null;
  }

  /**
   * O centro da mão fechada — onde um objeto segurado de verdade estaria.
   *
   * É a origem do grip space do WebXR, que é exatamente isso: o ponto em volta
   * do qual a mão se fecha. Ver `pontoDoDedo` para o outro ponto, o de apontar.
   */
  private pontoDeAgarre(mao: Mao): THREE.Vector3 {
    return mao.posicaoMundo();
  }

  private slotSobAMao(mao: Mao) {
    const cinto = this.cintoPara(mao);
    if (!cinto) return null;

    // Pelo ponto de AGARRE, não pela ponta do dedo.
    //
    // Era pelo dedo, "como o painel" — e essa era a confusão: o painel se
    // APONTA, o cinto se AGARRA. A ponta do indicador fica uns seis
    // centímetros à frente do centro da mão fechada, então para o dedo chegar
    // ao slot a mão inteira já tinha passado dele, e o gesto de fechar a mão em
    // volta da bola acontecia com a bola atrás da palma. Era esse o "complicado
    // de pegar" do playtest.
    //
    // O dedo continua valendo como segunda chance: quem já se acostumou a
    // apontar não é punido por isso.
    return (
      cinto.slotSob(this.pontoDeAgarre(mao)) ?? cinto.slotSob(this.pontoDoDedo(mao))
    );
  }

  private pegarBola(mao: Mao) {
    // A mão foi às costas: isso é a Pokédex, e ela vem antes de tudo — é o
    // único lugar do corpo onde não há mais nada para agarrar.
    if (this.pegarTablet(mao)) return;

    // A mochila aberta na frente: fechar a mão em volta de um item o tira de
    // lá. Vem antes do cinto e do chão porque o braço já está estendido DENTRO
    // do painel — se outra coisa respondesse primeiro, o gesto de pegar a poção
    // pegaria uma pokébola.
    if (this.pegarDaMochila(mao)) return;

    // Mão com bicho no colo já está cheia — de bicho. Ela não cata bola do chão
    // nem tira nada do cinto: para pegar outra coisa, primeiro ponha ele no
    // chão. Sem isto, fechar a mão de novo com o Charmander nela começava a
    // recolher pokébolas por cima dele.
    if (this.pokemonNoColo.has(mao.indice)) return;

    // Mão cheia em cima do painel: o GRIP GUARDA o que ela está segurando, em
    // vez de pegar mais uma coisa. É o "desisti" — você leva a bola de volta
    // para o lugar de onde tirou e ela volta para a cinta, sem ser gasta.
    if (this.painelTime.aberto && this.maoCheia(mao) && this.cartaSobAMao(mao)) {
      this.guardarNaMochila(mao);
      return;
    }

    // O mesmo gesto, no cinto do antebraço: fechar a mão em cima do slot de
    // onde a bola saiu guarda ela de volta.
    const slotDaVez = this.slotSobAMao(mao);
    if (slotDaVez && this.maoCheia(mao) && this.bolaVeioDoSlot.get(mao.indice) === slotDaVez.id) {
      this.guardarNaMochila(mao);
      return;
    }

    if (this.bolaNaMao.has(mao.indice)) return;

    // Uma bola caída no carpete: agarrar recolhe ELA, a mesma. Nada é criado e
    // nada é gasto — a bola já saiu da mochila quando voou, e voltar para a sua
    // mão é ela deixando de estar perdida. É o que faz uma captura que falhou
    // custar a tentativa, e não a bola.
    if (!this.maoCheia(mao)) {
      const caida = this.bolaCaidaPerto(mao);
      if (caida) {
        caida.recolher();
        this.bolaNaMao.set(mao.indice, caida);
        mao.segurando = true;
        mao.sentir('acertou');
        audio.clique();
        return;
      }
    }

    // O seu Pokémon debaixo da mão: pega ele no colo. Vem antes do cinto
    // porque um bicho é maior do que um slot e você está claramente mirando
    // nele — e depois da bola caída, que é a coisa pequena e precisa.
    if (!this.maoCheia(mao) && !this.pokemonNoColo.has(mao.indice) && this.pegarNoColo(mao)) {
      return;
    }

    // Mão vazia no cinto: tira AQUELA bola, a que os seus dedos estão em cima.
    // Não é escolher num menu e receber — é pegar a que está ali.
    if (slotDaVez && !this.maoCheia(mao)) {
      if (this.dex.bolas(slotDaVez.id) <= 0) {
        audio.recusa();
        mao.sentir('marcou');
        this.aviso.mostrar(
          [
            { texto: `acabou a ${slotDaVez.nome}`, tamanho: 36, cor: '#ff9f9f' },
            { texto: 'o lugar dela continua no braço', tamanho: 22, cor: '#9aa5b8', peso: 500 },
          ],
          1.4,
        );
        return;
      }
      this.escolherBola(slotDaVez.id);
      mao.sentir('pegou');
      this.tirarBolaDaCinta(mao, slotDaVez.id);
      return;
    }

    // Painel aberto e a mão em cima de uma carta: o GRIP pega o que está ali.
    // É o gesto que o painel pedia desde sempre — ele fica preso ao seu pulso,
    // a um palmo do outro braço, e alcançar com a mão é mais natural do que
    // mirar de longe numa coisa encostada em você.
    if (this.painelTime.aberto) {
      const alcancado = this.cartaSobAMao(mao);
      if (alcancado) {
        mao.sentir('pegou');
        if (alcancado.tipo === 'item') {
          // Todo item vai PARA A MÃO, inclusive a poção: segurar o frasco e
          // encostar no bicho é o que um treinador faz, e era estranho que a
          // fruta fosse uma coisa que se pega e a poção um botão que se aperta.
          this.pegarIsca(mao, alcancado.entrada.tipo.id);
          return;
        }
        if (alcancado.tipo === 'modo') {
          this.escolherModo(alcancado.entrada);
          return;
        }
        if (alcancado.tipo === 'golpe') {
          this.armarGolpe(alcancado.entrada);
          return;
        }
        if (alcancado.tipo === 'bola') {
          this.escolherBola(alcancado.entrada.tipo.id);
          // Escolheu a bola com a mão: ela já sai na mão, sem um segundo grip.
          if (this.dex.bolas(alcancado.entrada.tipo.id) > 0) this.tirarBolaDaCinta(mao);
          return;
        }
        if (alcancado.tipo === 'engrenagem') {
          this.abrirAjustes();
          return;
        }
        if (alcancado.tipo === 'pc') {
          this.alternarPc();
          return;
        }
        if (alcancado.tipo === 'dificuldade') {
          this.escolherDificuldade(alcancado.entrada);
          return;
        }
        if (alcancado.tipo === 'interruptor') {
          this.alternarInterruptor(alcancado.entrada.id);
          return;
        }
        if (alcancado.tipo !== 'criatura') return;
        // Pegou a bola de um Pokémon do time: ele vira o ativo e a bola DELE
        // já nasce na mão, pronta para o arremesso.
        if (!this.escolherDoTime(alcancado.entrada.exemplar)) return;
        this.tirarBolaDaCinta(mao);
        return;
      }
    }

    // E fora disso, nada. Fechar a mão no ar costumava FABRICAR uma pokébola:
    // o grip em qualquer lugar da sala materializava uma bola do nada, o que
    // tornava impossível fechar a mão sem consequência — e num jogo em que a
    // mão é a única ferramenta, não poder fechá-la é caro. Agora agarrar só
    // vale sobre alguma coisa: um slot do cinto, uma carta do painel, uma bola
    // no chão ou um Pokémon.
  }

  // --------------------------------------------------- o que está na mão

  /** Ela está segurando alguma coisa — uma bola ou um item. */
  private maoCheia(mao: Mao): boolean {
    return this.bolaNaMao.has(mao.indice) || this.itemNaMao.has(mao.indice);
  }

  /**
   * Devolve à mochila o que estiver na mão.
   *
   * É a metade que faltava do gesto de pegar: se você tirou a bola e mudou de
   * ideia, leva a mão de volta ao painel e solta ali. A bola de captura volta
   * ao estoque — ela só é gasta de verdade quando voa —, a bola de um Pokémon
   * seu simplesmente some, e o item volta inteiro porque ele nunca chegou a ser
   * gasto (ver `pegarIsca`).
   */
  private guardarNaMochila(mao: Mao) {
    const item = this.itemNaMao.get(mao.indice);
    if (item) {
      const nome = item.tipo.nome;
      this.guardarIsca(mao);
      mao.sentir('pegou');
      audio.clique();
      this.aviso.mostrar([{ texto: `${nome} de volta na mochila`, tamanho: 32, cor: '#9aa5b8' }], 1.4);
      return;
    }

    const bola = this.bolaNaMao.get(mao.indice);
    if (!bola) return;

    const invocacao = this.bolaDeInvocacao.get(mao.indice);
    const idBola = bola.raiz.userData.idBola as string | undefined;
    this.largarBolaDaMao(mao);

    if (!invocacao && idBola) this.dex.ganharBola(idBola, 1);
    mao.sentir('pegou');
    audio.clique();
    this.aviso.mostrar(
      [
        {
          texto: invocacao ? 'bola de volta na cinta' : 'bola de volta na mochila',
          tamanho: 32,
          cor: '#9aa5b8',
        },
      ],
      1.4,
    );
  }

  /**
   * A bola saiu da mão: o slot de onde ela veio volta a ser um slot comum.
   *
   * Vale para os três destinos — devolvida, arremessada ou descartada —, porque
   * um berço que fica piscando por uma bola que já voou pede de volta uma coisa
   * que não existe mais.
   */
  private fecharSlotDaMao(mao: Mao) {
    const origem = this.bolaVeioDoSlot.get(mao.indice);
    if (!origem) return;
    this.bolaVeioDoSlot.delete(mao.indice);
    this.saiuDoCinto.delete(mao.indice);
    // Fecha nos DOIS cintos: o mesmo slot existe nos dois braços, e deixar o
    // outro aberto mostraria um berço piscando sem bola nenhuma para voltar.
    for (const cinto of this.cintos.values()) cinto.definirAberto(origem, false);
  }

  /** Tira a bola da mão e da cena, sem julgar o motivo. */
  private largarBolaDaMao(mao: Mao) {
    const bola = this.bolaNaMao.get(mao.indice);
    if (!bola) return;
    this.bolaNaMao.delete(mao.indice);
    this.bolaDeInvocacao.delete(mao.indice);
    this.fecharSlotDaMao(mao);
    mao.segurando = false;
    bola.descartar(this.cena);
    const i = this.bolas.indexOf(bola);
    if (i !== -1) this.bolas.splice(i, 1);
  }

  // ------------------------------------------------------------ mochila

  /**
   * Abre e fecha a mochila holográfica. Ver src/mochila.ts.
   *
   * Ela nasce onde você está olhando e fica ancorada ali: é uma prateleira, não
   * um capacete. Uma coisa que persegue o seu rosto não pode ser alcançada,
   * porque recua na mesma medida em que a sua mão avança.
   */
  private alternarMochila() {
    if (this.mochila.estaAberta) {
      this.mochila.fechar();
      audio.clique();
      return;
    }
    this.mochila.abrir(this.camera, (id) => this.dex.item(id));
    audio.abrirPainel();
    this.aviso.mostrar(
      [
        { texto: 'mochila', tamanho: 40, cor: '#cfe6ff' },
        {
          texto: 'estenda a mão e feche o GRIP em volta do que quiser · B fecha',
          tamanho: 22,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2.6,
    );
  }

  /**
   * O GRIP dentro da mochila: tira de lá o item sob a mão.
   *
   * Devolve `true` quando tratou o gesto, para `pegarBola` parar aí — ver a
   * ordem das perguntas lá.
   *
   * A mochila FECHA ao pegar. É o gesto completo: você abriu para buscar uma
   * coisa, achou, e agora quer as duas mãos livres e a sala à vista. Deixá-la
   * aberta poria um painel entre você e o Pokémon que a poção vai curar.
   */
  private pegarDaMochila(mao: Mao): boolean {
    if (!this.mochila.estaAberta) return false;
    const tipo = this.mochila.alcancado(this.pontoDoDedo(mao));
    if (!tipo) return false;

    this.pegarIsca(mao, tipo.id);
    this.mochila.fechar();
    return true;
  }

  // ------------------------------------------------------------ isca

  /**
   * Põe a fruta (ou o doce) na mão. Enquanto estiver ali, apontar para um
   * selvagem chama ele.
   *
   * O item só é GASTO quando alguém vem — apontar para o vazio não custa nada.
   * Isso importa porque o gesto é de mira, e mira erra: cobrar por uma fruta
   * que não atraiu ninguém faria o jogador parar de tentar.
   */
  private pegarIsca(mao: Mao, id: string) {
    const tipo = itemPorId(id);
    if (!tipo) return;

    if (this.dex.item(id) <= 0) {
      audio.recusa();
      this.aviso.mostrar(
        [
          { texto: `sem ${tipo.nome}`, tamanho: 36, cor: '#ff9f9f' },
          { texto: 'itens caem quando você captura', tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        2,
      );
      return;
    }

    this.guardarIsca(mao);
    // Uma bola e um item não cabem na mesma mão. A bola sai para a mochila em
    // vez de sumir: ela ainda não foi arremessada, e portanto ainda é sua.
    if (this.bolaNaMao.has(mao.indice)) {
      const idBola = this.bolaNaMao.get(mao.indice)!.raiz.userData.idBola as string | undefined;
      const invocacao = this.bolaDeInvocacao.has(mao.indice);
      this.largarBolaDaMao(mao);
      if (!invocacao && idBola) this.dex.ganharBola(idBola, 1);
    }

    const isca = new ItemNaMao(tipo);
    // Sem headset a luva mora na camera, e e nela que a isca precisa ficar.
    (this.modoPlano && this.luvaPlana ? this.luvaPlana.grupo : mao.punho).add(isca.grupo);
    this.itemNaMao.set(mao.indice, isca);
    mao.sentir('pegou');
    audio.tilintar();

    // A explicação só na primeira vez que este item cai na sua mão — item 1.4
    // do roteiro. Da segunda em diante, o nome basta: quem já usou uma poção
    // sabe o que fazer com ela, e ler de novo é ruído em cima do jogo.
    const linhas: LinhaTexto[] = [
      { texto: `${tipo.nome} na mão`, tamanho: 38, cor: `#${new THREE.Color(tipo.cor).getHexString()}` },
    ];
    if (this.dex.primeiraVez(`item:${id}`)) {
      linhas.push({
        texto: ehPedra(id)
          ? 'encoste no seu Pokémon — e é para sempre: pedra não se desfaz'
          : id === 'pocao'
            ? 'encoste no seu Pokémon para usar · grip no painel devolve'
            : 'aponte para um selvagem e segure — ou encoste no seu Pokémon',
        tamanho: 22,
        cor: '#9aa5b8',
        peso: 500,
      });
    }
    this.aviso.mostrar(linhas, linhas.length > 1 ? 3 : 1.6);
  }

  private guardarIsca(mao: Mao) {
    const isca = this.itemNaMao.get(mao.indice);
    if (!isca) return;
    isca.descartar();
    this.itemNaMao.delete(mao.indice);
    this.miraDoItem.delete(mao.indice);
  }

  /**
   * O selvagem para quem a isca está apontada.
   *
   * O alcance é um CONE, não um cilindro: a tolerância cresce com a distância,
   * porque mirar com o braço estendido num bicho a seis metros não tem a mesma
   * precisão que mirar num a um metro, e exigir a mesma faria a isca só
   * funcionar de perto — justamente onde ela não é necessária.
   */
  private alvoDaIsca(mao: Mao, alcance: number): Pokemon | null {
    return this.selvagemNaMira(mao, alcance);
  }

  /**
   * O selvagem que está sob a mira desta mão, no mesmo cone da isca.
   *
   * Serve à isca e ao ataque: os dois gestos são o mesmo — estender o braço na
   * direção de um bicho — e só mudam no que fazem depois de acertar quem é.
   */
  /**
   * Quem está sob a mira — com o corpo valendo mais do que o perdão.
   *
   * A versão anterior media todo mundo pela MESMA régua relativa: `desvio /
   * tolerância`, com a tolerância crescendo 16 cm por metro de distância. Isso
   * tem uma consequência que só aparece com dois bichos em cena: a três metros
   * um selvagem carregava 68 cm de perdão em volta do corpo, e um perdão largo
   * dá uma fração pequena. Um bicho grande e longe vencia um pequeno e perto
   * **que o raio estava atravessando** — que é exatamente a queixa de mandar
   * bater num e o golpe sair no outro.
   *
   * Agora são duas perguntas em ordem, não uma conta só:
   *
   * 1. **O raio atravessa alguém?** Se atravessa, é esse, e entre dois na linha
   *    vale o da FRENTE — o que o seu braço está tapando. Aqui não há régua
   *    relativa nenhuma: apontar para o corpo de um bicho é uma resposta
   *    exata, e nenhuma tolerância deveria ter o direito de contradizê-la.
   * 2. **Ninguém?** Só então o perdão entra, e medindo o quanto se passou POR
   *    FORA do corpo, não uma fração de si mesmo.
   *
   * O cone também encolheu — de 20 cm + 16 cm/m para 12 cm + 7 cm/m —, o que
   * antes seria cruel e agora não é: com o feixe visível (`FeixeDeAlvo`), o
   * jogador vê onde está apontando enquanto aponta, e a mira generosa deixou de
   * ser a única forma de acertar.
   */
  private selvagemNaMira(mao: Mao, alcance: number): Pokemon | null {
    const { origem, direcao } = this.modoPlano ? this.miraDaCamera() : mao.mira();
    let atravessado: Pokemon | null = null;
    let distanciaDele = Infinity;
    let perdoado: Pokemon | null = null;
    let menorSobra = Infinity;

    for (const { pokemon } of this.selvagens) {
      if (!pokemon.viva || pokemon.desmaiado) continue;
      if (pokemon.estado === 'preso' || pokemon.estado === 'saindo') continue;

      const paraEle = pokemon.centro.clone().sub(origem);
      const aoLongo = paraEle.dot(direcao);
      if (aoLongo <= 0.15 || aoLongo > alcance) continue;

      const desvio = paraEle.addScaledVector(direcao, -aoLongo).length();

      if (desvio <= pokemon.raio) {
        if (aoLongo < distanciaDele) {
          distanciaDele = aoLongo;
          atravessado = pokemon;
        }
        continue;
      }

      const sobra = desvio - pokemon.raio;
      if (sobra > 0.12 + aoLongo * 0.07) continue;
      if (sobra < menorSobra) {
        menorSobra = sobra;
        perdoado = pokemon;
      }
    }

    return atravessado ?? perdoado;
  }

  /**
   * A isca funcionando: mirar por um instante e o bicho vem.
   *
   * O instante existe para separar mira de passagem: o braço varre a sala o
   * tempo todo, e chamar no primeiro quadro em que o raio cruza um Pokémon
   * chamaria todos eles sem você ter pedido nada.
   */
  private atualizarIscas(dt: number) {
    for (const mao of this.maos) {
      const isca = this.itemNaMao.get(mao.indice);
      const rastro = this.rastros.get(mao.indice);

      if (!isca || (!mao.conectada && !this.modoPlano)) {
        this.miraDoItem.delete(mao.indice);
        rastro?.atualizar(dt, null, null, 0);
        continue;
      }

      // Encostar no seu Pokémon usa o que estiver na mão nele. É o caminho de
      // TODO item, e o único caminho da poção: ela não chama ninguém de longe.
      if (this.usarItemNoCompanheiro(mao, isca)) {
        rastro?.atualizar(dt, null, null, 0);
        continue;
      }

      if (isca.tipo.id === 'pocao') {
        this.miraDoItem.delete(mao.indice);
        isca.atualizar(dt, false);
        rastro?.atualizar(dt, null, null, 0);
        continue;
      }

      // O doce é raro e chama de bem mais longe; a fruta é o pão de cada dia.
      const doce = isca.tipo.id === 'doce';
      const alvo = this.alvoDaIsca(mao, doce ? 9 : 5.5);

      const anterior = this.miraDoItem.get(mao.indice);
      const acumulado = anterior && anterior.alvo === alvo ? anterior.tempo + dt : 0;
      if (alvo) this.miraDoItem.set(mao.indice, { alvo, tempo: acumulado });
      else this.miraDoItem.delete(mao.indice);

      const espera = 0.6;
      isca.atualizar(dt, alvo !== null);

      const deIsca = alvo ? isca.grupo.getWorldPosition(new THREE.Vector3()) : null;
      rastro?.atualizar(dt, deIsca, alvo ? alvo.centro : null, acumulado / espera);

      if (!alvo || acumulado < espera) continue;

      this.chamarComIsca(mao, isca, alvo);
    }
  }

  /**
   * O item na mão encostado no seu Pokémon.
   *
   * É o gesto que faltava para a mochila fazer sentido em VR: você pega o
   * frasco, estende o braço e encosta nele — em vez de mirar de longe numa
   * carta e ver a vida subir sozinha. Devolve true quando o item foi usado, e
   * aí o quadro acaba ali.
   *
   * O alcance acompanha o tamanho do bicho pela mesma razão do carinho: a mão
   * precisa alcançar o CORPO, e num Onix o corpo começa a dois metros do centro.
   */
  private usarItemNoCompanheiro(mao: Mao, item: ItemNaMao): boolean {
    if (!this.temCompanheiroEmCampo) return false;
    const c = this.companheiro!;
    if (c.estado === 'saindo' || c.estado === 'preso') return false;

    const toque = mao.pontoDeToque(new THREE.Vector3());
    const alcance = Math.max(0.22, c.raio * 0.9 + 0.12);
    if (toque.distanceTo(c.centro) > alcance && toque.distanceTo(c.pontoDaCabeca()) > alcance) {
      return false;
    }

    const id = item.tipo.id;

    // A pedra é conferida ANTES de ser gasta, e é a única da mochila que tem
    // esse cuidado: o efeito dela é irreversível e ela aparece uma vez a cada
    // trinta capturas. Encostar a Pedra da Água num Charmander não pode custar
    // a Pedra da Água.
    const alvoDaPedra = ehPedra(id) ? evolucaoDaPedra(id, c.especie) : null;
    if (ehPedra(id) && !alvoDaPedra) {
      const pedra = pedraPorId(id);
      audio.recusa();
      mao.sentir('marcou');
      this.aviso.mostrar(
        [
          { texto: `${c.especie.nome} não responde a ela`, tamanho: 34, cor: '#ffb1b1' },
          {
            texto: pedra ? `serve em: ${aQuemServe(pedra, (x) => porId(x)?.nome)}` : '',
            tamanho: 21,
            cor: '#9aa5b8',
            peso: 500,
          },
        ],
        2.6,
      );
      // Continua na mão: você ainda está segurando a pedra, e provavelmente
      // quer levá-la a outro bicho.
      return true;
    }

    if (!this.dex.gastarItem(id)) {
      this.guardarIsca(mao);
      audio.recusa();
      return true;
    }

    mao.sentir('acertou');
    const brilho = new Impacto(c.centro, item.tipo.cor);
    this.cena.add(brilho.pontos);
    this.impactos.push(brilho);

    if (alvoDaPedra) {
      this.evoluirComPedra(alvoDaPedra, item.tipo.nome);
    } else if (id === 'doce') {
      this.subirUmNivel();
    } else if (id === 'pocao') {
      this.curarCompanheiro(0.5, 'Poção');
    } else {
      // A fruta na boca do seu Pokémon é petisco, não isca: cura pouco, anima
      // muito, e o bônus da próxima bola vem junto porque a fruta é a fruta.
      this.curarCompanheiro(0.15, 'Fruta');
      this.bonusFruta = SEGUNDOS_FRUTA;
      c.comemorar();
    }

    this.guardarIsca(mao);
    return true;
  }

  /** Cura quem está em campo por uma fração da vida máxima. */
  private curarCompanheiro(fracao: number, porQuem: string) {
    const c = this.companheiro;
    if (!c) return;
    const cura = Math.max(1, Math.ceil(c.hpMax * fracao));
    c.curar(cura);
    if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, c.hp);
    audio.sucesso();
    this.aviso.mostrar(
      [
        { texto: `${c.especie.nome} recuperou ${cura}`, tamanho: 38, cor: '#7fe7c4' },
        { texto: `${porQuem} usada`, tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
      2,
    );
  }

  /** O Doce Raro: um nível inteiro, custe o que custar em experiência. */
  private subirUmNivel() {
    const exemplar = this.exemplarEmCampo ?? this.dex.exemplarAtivo;
    if (!exemplar) return;
    const especie = porId(exemplar.id);
    if (!especie) return;
    const alvo = Math.min(this.dex.nivelDe(exemplar) + 1, NIVEL_MAXIMO);
    this.dex.ganharXp(exemplar, Math.max(1, xpParaNivel(alvo) - exemplar.xp));
    audio.subiuDeNivel();
    this.aviso.mostrar(
      [
        {
          texto: `${especie.nome} chegou ao nível ${this.dex.nivelDe(exemplar)}!`,
          tamanho: 38,
          cor: '#d8b4ff',
        },
      ],
      2.4,
    );
    void this.conferirEvolucao(exemplar);
  }

  private chamarComIsca(mao: Mao, isca: ItemNaMao, alvo: Pokemon) {
    const tipo = isca.tipo;
    if (!this.dex.gastarItem(tipo.id)) {
      this.guardarIsca(mao);
      audio.recusa();
      return;
    }

    alvo.atrairPara(this.posicaoJogador, tipo.id === 'doce' ? 22 : 14);
    if (tipo.id === 'doce') {
      // Doce Raro não se recusa: ele chega manso.
      alvo.acalmar(1);
    } else {
      alvo.acalmar(0.6);
      // A fruta continua valendo o que sempre valeu para a próxima bola. É o
      // que faz atrair e capturar serem um movimento só.
      this.bonusFruta = SEGUNDOS_FRUTA;
    }

    audio.chamado();
    audio.grito(alvo.especie.id, alvo.shiny, alvo.especie.num);
    mao.sentir('acertou');

    const brilho = new Impacto(alvo.centro, tipo.cor);
    this.cena.add(brilho.pontos);
    this.impactos.push(brilho);

    this.aviso.mostrar(
      [
        { texto: `${alvo.especie.nome} está vindo!`, tamanho: 40, cor: corHexDe(alvo.especie) },
        {
          texto: alvo.flutua ? 'ele vem flutuando até você' : 'ele vem andando até você',
          tamanho: 23,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2.8,
    );

    this.guardarIsca(mao);
  }

  /**
   * Materializa uma pokébola na mão: a do Pokémon ativo, se houver um esperando
   * para entrar, ou uma bola de captura do tipo escolhido.
   */
  private tirarBolaDaCinta(mao: Mao, slotDeOrigem?: string) {
    if (this.bolaNaMao.has(mao.indice)) return;
    // Pegar a bola guarda a isca: você não arremessa com a fruta na mão.
    this.guardarIsca(mao);

    // Com um Pokémon escolhido e ainda na bola, o grip pega a bola DELE.
    const ativo = this.dex.exemplarAtivo;
    const vaiInvocar = !this.temCompanheiroEmCampo && ativo !== null && ativo.hp > 0;

    const tipoBola = bolaPorId(this.dex.bolaAtiva) ?? BOLA_PADRAO;

    if (!vaiInvocar && this.dex.bolas(tipoBola.id) <= 0) {
      this.aviso.mostrar(
        [
          { texto: `sem ${tipoBola.nome}`, tamanho: 40, cor: '#ff9f9f' },
          { texto: 'gire o pulso esquerdo e escolha outra', tamanho: 25, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    const especieAtiva = vaiInvocar ? porId(ativo!.id) : null;
    // Começa a baixar o modelo agora: até a bola voar e pousar ele já chegou.
    if (especieAtiva) void garantir(especieAtiva.id, ativo!.shiny);

    const bola = new Pokebola(
      this.sala.pisoY,
      especieAtiva ? TIPOS[especieAtiva.tipo].cor : tipoBola.corTopo,
      especieAtiva ? 0xf2f2f5 : tipoBola.corBase,
    );
    this.cena.add(bola.raiz);
    this.bolas.push(bola);
    this.bolaNaMao.set(mao.indice, bola);

    // O slot fica ABERTO: a miniatura some do braço enquanto a bola está na sua
    // mão, e o berço pisca dizendo para onde ela volta.
    if (slotDeOrigem) {
      this.bolaVeioDoSlot.set(mao.indice, slotDeOrigem);
      this.saiuDoCinto.delete(mao.indice);
      for (const cinto of this.cintos.values()) cinto.definirAberto(slotDeOrigem, true);
    }

    if (vaiInvocar) {
      this.bolaDeInvocacao.set(mao.indice, ativo!);
    } else {
      this.dex.gastarBola(tipoBola.id);
      // A bola guarda com que força ela foi lançada — trocar de bola no meio do
      // voo não pode mudar a chance daquele arremesso. A fruta entra aqui pelo
      // mesmo motivo: vale para a bola que já está na mão.
      const comFruta = this.bonusFruta > 0 ? BONUS_FRUTA : 1;
      bola.raiz.userData.multiplicador = tipoBola.multiplicador * comFruta;
      bola.raiz.userData.nomeBola = tipoBola.nome;
      // De que tipo ela é, para poder ser devolvida ao estoque certo se você
      // mudar de ideia antes de arremessar. Ver guardarNaMochila.
      bola.raiz.userData.idBola = tipoBola.id;
    }

    mao.segurando = true;
    mao.limparAmostras();
    mao.sentir('marcou');
    // Pegou agora: a mão ainda não saiu do painel, então soltar aqui mesmo não
    // devolve nada.
    this.saiuDoPainel.delete(mao.indice);
  }

  private arremessarBola(mao: Mao) {
    // Abrir a mão com um bicho nela é pôr o bicho no chão, não arremessar nada.
    if (this.pokemonNoColo.has(mao.indice)) {
      this.soltarDoColo(mao);
      return;
    }

    const bola = this.bolaNaMao.get(mao.indice);
    if (!bola) return;

    // Soltar com a mão de volta em cima do painel é DEVOLVER, não arremessar: é
    // o gesto de quem tirou a bola, olhou, e decidiu que não era essa. Sem isto
    // a desistência custava uma bola jogada no carpete.
    if (this.saiuDoPainel.has(mao.indice) && this.cartaSobAMao(mao)) {
      this.guardarNaMochila(mao);
      return;
    }

    // O mesmo, no cinto: abrir a mão de volta EM CIMA DO SLOT DE ONDE ELA SAIU
    // guarda a bola. Em cima de outro slot, não — aquela bola tem um lugar, e
    // é nele que ela volta.
    const origem = this.bolaVeioDoSlot.get(mao.indice);
    if (this.saiuDoCinto.has(mao.indice)) {
      const slot = this.slotSobAMao(mao);
      // Ou o slot de onde ela saiu, ou — para uma bola catada do chão, que não
      // saiu de slot nenhum — o slot do TIPO dela. Uma Comum recolhida do
      // carpete guarda no berço das Comuns, que é o lugar dela.
      const alvo = origem ?? (bola.raiz.userData.idBola as string | undefined);
      if (slot && alvo && slot.id === alvo) {
        this.guardarNaMochila(mao);
        return;
      }
    }
    this.bolaNaMao.delete(mao.indice);
    this.fecharSlotDaMao(mao);
    mao.segurando = false;

    const velocidade = mao.velocidadeArremesso(performance.now());
    if (velocidade.length() < 0.8) velocidade.set(0, -0.4, 0);
    bola.lancar(velocidade);
    mao.sentir('acertou');

    const exemplar = this.bolaDeInvocacao.get(mao.indice);
    if (exemplar) {
      this.bolaDeInvocacao.delete(mao.indice);
      bola.raiz.userData.invocar = exemplar;
    }
  }

  // ------------------------------------------------------------ gatilho

  /**
   * O gatilho desceu.
   *
   * Um comando que precisa ser SEGURADO não pode resolver nada agora: o que
   * acontece depende de quanto tempo o dedo ficar embaixo. Então aqui só se
   * anota; quem decide é `gatilhoSubiu`.
   *
   * A exceção são os painéis e a escolha do inicial, que são menus: num menu,
   * esperar o dedo subir para confirmar parece atraso, não intenção.
   */
  private gatilhoDesceu(mao: Mao) {
    if (this.menuTomaOGatilho()) {
      this.puxarGatilho(mao);
      return;
    }
    this.gatilhoPreso = { mao, desde: performance.now(), comandou: false };
  }

  /**
   * Se um menu deve resolver o gatilho agora, em vez de deixá-lo virar comando.
   *
   * A pergunta parece a mesma que "tem painel aberto?", e não é — foi por isso
   * que o comando de mandar o companheiro ir e ficar não funcionava.
   *
   * O painel do time abre no pulso ESQUERDO. Com ele aberto, um gatilho puxado
   * pela mão DIREITA apontando para o chão era engolido pelo menu, mesmo sem
   * carta nenhuma sob a mira: `gatilhoDesceu` desviava no ato, e o comando —
   * que precisa do gatilho SEGURADO para existir — nunca chegava a começar.
   * Nada acontecia e nada explicava, porque o gesto morria antes do primeiro
   * quadro.
   *
   * E o painel fica aberto mais tempo do que se imagina: por causa da histerese
   * do gesto (ver src/gesto.ts), uma vez aberto ele se mantém com o limiar mais
   * frouxo e sem exigir a mão erguida. Baixar o braço para apontar não fecha.
   *
   * Então a pergunta certa é se o menu tem de fato ALGO sob a mira. Sem alvo,
   * ele não tem o que resolver, e o gatilho volta a ser do jogo.
   */
  private menuTomaOGatilho(): boolean {
    // A escolha do inicial é modal de verdade: antes dela não há jogo.
    if (this.escolha) return true;
    if (this.pc.aberto && this.pc.temAlvo) return true;
    if (this.painelTime.aberto && this.painelTime.selecao) return true;
    // A Pokédex responde ao gatilho lendo a ficha em voz alta, e ela não tem
    // "item sob a mira" para consultar: aberta, o gatilho é dela.
    if (this.painelDex.aberto) return true;
    return false;
  }

  private gatilhoSubiu(mao: Mao) {
    // O PC vem antes de tudo: com ele aberto, soltar o gatilho quer dizer
    // "põe aqui", e não tem nada a ver com marcar ponto no chão.
    if (this.pc.aberto) {
      this.gatilhoPreso = null;
      this.soltarNoPc(mao);
      return;
    }

    const preso = this.gatilhoPreso;
    this.gatilhoPreso = null;
    if (!preso || preso.mao !== mao) return;

    // Soltar depois de ter marcado um ponto: ele vai até lá. O caminho já
    // estava desenhado no chão desde que o dedo ficou embaixo.
    if (preso.comandou && this.pontoMarcado && this.temCompanheiroEmCampo) {
      const destino = this.pontoMarcado.clone();
      this.pontoMarcado = null;
      this.companheiro!.irPara(destino);
      mao.sentir('acertou');
      audio.comando();
      this.aviso.mostrar(
        [
          { texto: `${this.companheiro!.especie.nome} está indo`, tamanho: 34, cor: '#7fe7c4' },
          {
            texto: 'e fica lá — aperte X para chamar de volta',
            tamanho: 21,
            cor: '#9aa5b8',
            peso: 500,
          },
        ],
        1.8,
      );
      return;
    }

    // Segurou o gatilho, mirou o chão, e ainda assim não virou ordem: o que
    // falta é o companheiro. Isto era um silêncio completo — o jogador repetia
    // o gesto sem nunca descobrir que o gesto estava certo e a condição não.
    if (preso.comandou && this.pontoMarcado && !this.temCompanheiroEmCampo) {
      this.pontoMarcado = null;
      audio.recusa();
      this.aviso.mostrar(
        [
          { texto: 'ninguém em campo para mandar', tamanho: 34, cor: '#ff9f9f' },
          {
            texto: 'segure o grip para soltar o seu Pokémon primeiro',
            tamanho: 21,
            cor: '#9aa5b8',
            peso: 500,
          },
        ],
        2.2,
      );
      return;
    }

    this.pontoMarcado = null;
    this.puxarGatilho(mao);
  }

  /**
   * Enquanto o gatilho estiver preso, a marca acompanha a mão pelo chão.
   *
   * Ela só nasce depois de um tempinho de dedo embaixo — sem essa carência todo
   * ataque piscaria uma linha verde no chão antes de sair.
   */
  private atualizarMarca(dt: number) {
    const preso = this.gatilhoPreso;
    let mostrar = false;

    // Sem companheiro a marca não é desenhada, mas o gesto continua sendo
    // RECONHECIDO: é isso que permite a `gatilhoSubiu` dizer o que faltou em
    // vez de engolir o comando calado.
    if (preso) {
      const segurando = (performance.now() - preso.desde) / 1000;
      if (segurando > 0.28) {
        const { origem, direcao } = this.modoPlano ? this.miraDaCamera() : preso.mao.mira();
        const ponto = this.pontoNoChao(origem, direcao);
        if (ponto) {
          if (!preso.comandou) {
            preso.comandou = true;
            preso.mao.sentir('marcou');
          }
          this.pontoMarcado = ponto;
          mostrar = true;
        }
      }
    }

    // A linha sai DELE, então ela só existe se ele existir.
    const temAlguem = this.temCompanheiroEmCampo;
    const de = mostrar && temAlguem && this.companheiro ? this.companheiro.raiz.position : null;
    this.marca.atualizar(dt, mostrar && temAlguem, de, this.pontoMarcado, this.sala.pisoY);
  }

  /**
   * Onde o raio da mão encontra o chão. Sem plano detectado o chão é o plano
   * y = pisoY, que é o que a sala usa de qualquer jeito quando não há leitura.
   */
  private pontoNoChao(origem: THREE.Vector3, direcao: THREE.Vector3): THREE.Vector3 | null {
    // Apontando para cima ou na horizontal não há chão que se encontre.
    if (direcao.y > -0.05) return null;

    // Primeiro contra as superfícies que o mapa conhece: é assim que apontar
    // para a mesa manda ele PARA A MESA, e não para o chão atrás dela.
    const alvo = this.sala.apontar(origem, direcao);
    if (alvo) return alvo.ponto;

    // Nada mapeado naquela direção: o plano do chão serve de último recurso.
    const piso = this.sala.pisoY;
    const t = (piso - origem.y) / direcao.y;
    if (t <= 0 || t > 8) return null;
    return origem.clone().addScaledVector(direcao, t).setY(piso);
  }

  private puxarGatilho(mao: Mao) {
    // Escolha do inicial na frente de tudo: nada mais funciona antes dela.
    if (this.escolha) {
      const especie = this.escolha.confirmar();
      if (especie) {
        mao.sentir('levou');
        this.receberInicial(especie);
      }
      return;
    }

    // PC aberto: ele toma o gatilho para si, porque pegar e soltar bicho na
    // caixa é a única coisa que se está fazendo com ele aberto.
    if (this.pc.aberto && this.pc.temAlvo) {
      this.acionarPc(mao);
      return;
    }

    // Painel aberto: o gatilho escolhe o que estiver sob a mira.
    const selecao = this.painelTime.aberto ? this.painelTime.selecao : null;
    if (selecao) {
      mao.sentir('pegou');
      if (selecao.tipo === 'criatura') this.escolherDoTime(selecao.entrada.exemplar);
      else if (selecao.tipo === 'bola') this.escolherBola(selecao.entrada.tipo.id);
      else if (selecao.tipo === 'modo') this.escolherModo(selecao.entrada);
      else if (selecao.tipo === 'golpe') this.armarGolpe(selecao.entrada);
      else if (selecao.tipo === 'engrenagem') this.abrirAjustes();
      else if (selecao.tipo === 'pc') this.alternarPc();
      else if (selecao.tipo === 'dificuldade') this.escolherDificuldade(selecao.entrada);
      else if (selecao.tipo === 'interruptor') this.alternarInterruptor(selecao.entrada.id);
      // O item vai para a MÃO, aqui também: mirar e apertar o gatilho é o
      // mesmo pedido que encostar a mão na carta, e um pedido só não pode ter
      // dois resultados diferentes. Quem usa de verdade é o toque no bicho.
      else this.pegarIsca(mao, selecao.entrada.tipo.id);
      return;
    }

    // Pokédex aberta: o gatilho manda a ficha ser LIDA EM VOZ ALTA.
    if (this.painelDex.aberto) {
      this.narrarDaDex(mao);
      return;
    }

    // Sem painel: manda o companheiro atacar.
    this.comandarAtaque(mao);
  }

  /**
   * A Pokédex falando, em português.
   *
   * Só os quatro iniciais têm ficha gravada — são cerca de meio minuto de voz
   * cada uma, e gravar as 151 seriam trinta megabytes de MP3 num pacote que
   * hoje tem cinquenta e quatro de modelo. Quem não tem ganha a voz do próprio
   * bicho, que é uma resposta e não um silêncio.
   */
  private narrarDaDex(mao: Mao) {
    const especie = this.painelDex.selecionada;
    if (!especie) return;

    mao.sentir('pegou');

    if (!this.ajustes.vozDaDex) {
      this.aviso.mostrar(
        [
          { texto: especie.nome, tamanho: 40, cor: corHexDe(especie) },
          { texto: 'a voz está desligada nos ajustes', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    if (!temNarracao(especie.id)) {
      audio.grito(especie.id, false, especie.num);
      this.aviso.mostrar(
        [
          { texto: especie.nome, tamanho: 40, cor: corHexDe(especie) },
          { texto: 'ainda sem ficha falada', tamanho: 22, cor: '#9aa5b8', peso: 500 },
        ],
        1.6,
      );
      return;
    }

    void falar(especie.id).then((tocou) => {
      if (!tocou) return;
      this.aviso.mostrar(
        [
          { texto: especie.nome, tamanho: 40, cor: corHexDe(especie) },
          { texto: 'gatilho de novo para calar', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        ],
        2.4,
      );
    });
  }

  /**
   * O gatilho DESCEU dentro do PC: começa a arrastar, ou aperta um botão.
   *
   * Ver `PainelPc.comecarArrasto`. O que solta é `soltarNoPc`, no gatilho
   * subindo — o bicho fica na mão enquanto o dedo estiver puxando.
   */
  private acionarPc(mao: Mao) {
    const feito = this.pc.comecarArrasto();
    if (!feito) {
      this.recusar(mao);
      return;
    }
    mao.sentir('pegou');

    switch (feito) {
      case 'pegou':
        audio.clique();
        if (this.dex.primeiraVez('arrastar-no-pc')) {
          this.aviso.mostrar(
            [
              { texto: 'segure e leve', tamanho: 34, cor: '#cfe6ff' },
              {
                texto: 'solte o gatilho na vaga onde ele deve ficar · vaga do time pode ficar vazia',
                tamanho: 21,
                cor: '#9aa5b8',
                peso: 500,
              },
            ],
            3.2,
          );
        }
        break;
      case 'pagina':
        audio.clique();
        break;
      case 'curou':
        audio.sucesso();
        this.aviso.mostrar(
          [{ texto: 'equipe recuperada', tamanho: 38, cor: '#7fe7c4' }],
          1.8,
        );
        break;
      case 'fechou':
        audio.recolher();
        break;
    }
  }

  /**
   * O gatilho SUBIU dentro do PC: solta onde a mira estiver.
   *
   * Chamado de `gatilhoSubiu` mesmo que o PC não esteja com nada na mão — a
   * pergunta é barata e sair daqui por engano deixaria um bicho preso à mira
   * até o próximo clique.
   */
  private soltarNoPc(mao: Mao) {
    const feito = this.pc.soltarArrasto();
    if (!feito) return;

    mao.sentir(feito === 'largou' ? 'marcou' : 'acertou');
    if (feito === 'largou') {
      audio.clique();
      return;
    }

    audio.abrirPainel();
    // Mexer na equipe com alguém em campo é ambíguo: o bicho lá fora pode já
    // nem estar mais no time. Recolher resolve sem perguntar nada.
    if (this.temCompanheiroEmCampo) this.recolherCompanheiro();
  }

  private escolherBola(id: string) {
    const tipo = bolaPorId(id);
    if (!tipo) return;

    if (this.dex.bolas(id) <= 0) {
      this.aviso.mostrar(
        [
          { texto: `sem ${tipo.nome}`, tamanho: 36, cor: '#ff9f9f' },
          { texto: 'elas vêm de capturas bem-sucedidas', tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        2,
      );
      return;
    }

    this.dex.definirBolaAtiva(id);
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: tipo.nome, tamanho: 40, cor: `#${new THREE.Color(tipo.corTopo).getHexString()}` },
        { texto: tipo.descricao, tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
      2.2,
    );
  }

  // ------------------------------------------------------------ modos

  /**
   * Os golpes que o bicho em campo tem, para a fileira do painel.
   *
   * Fora do modo Batalha a lista sai vazia de propósito: no Relaxante e no
   * Safari quem escolhe o golpe é o jogo, e mostrar um menu de comando que não
   * comanda nada só ocuparia espaço no pulso.
   */
  private golpesDoCampo(): EntradaGolpe[] {
    if (!this.temCompanheiroEmCampo) return [];
    const golpes = arsenal(this.companheiro!);
    // Sem nada armado, o primeiro golpe é o que vai sair — então ele aparece
    // armado, e o painel nunca mostra uma escolha que não corresponde ao que o
    // gatilho faria.
    const armado = this.golpeArmado ?? golpes[0]?.nome ?? null;
    return golpes.map((golpe) => ({ golpe, armado: golpe.nome === armado }));
  }

  // ------------------------------------------------------------ ajustes

  /** A engrenagem: um toque abre a página de ajustes, outro fecha. */
  private abrirAjustes() {
    const aberto = this.painelTime.alternarAjustes();
    audio.abrirPainel();
    if (!aberto) return;
    this.aviso.mostrar(
      [
        { texto: 'ajustes', tamanho: 40, cor: '#9fe0ff' },
        {
          texto: 'modo de jogo, dificuldade e o que aparece na tela',
          tamanho: 22,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2.4,
    );
  }

  private escolherDificuldade(perfil: PerfilDificuldade) {
    if (perfil.id === this.ajustes.dificuldade) return;
    this.ajustes.definirDificuldade(perfil.id);
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: perfil.nome, tamanho: 42, cor: perfil.cor },
        { texto: perfil.resumo, tamanho: 23, cor: '#9aa5b8', peso: 500 },
        {
          texto: `aviso de ${perfil.avisoSegundos.toFixed(1).replace('.', ',')} s antes do golpe`,
          tamanho: 21,
          cor: '#ffd78a',
          peso: 600,
        },
      ],
      3,
    );
  }

  private alternarInterruptor(id: ChaveAjuste) {
    const ligado = this.ajustes.alternar(id);
    audio.clique();

    // Alguns mexem no mundo na hora, e não só no que aparece escrito.
    if (id === 'contornoDaSala' && this.sala.debugLigado !== ligado) this.sala.alternarDebug();
    if (id === 'vozDaDex' && !ligado) calar();
    if (id === 'vozDoNome') audio.vozDoNome = ligado;
    if (id === 'musicaDeBatalha') {
      audio.musicaDeBatalha = ligado;
      // Desligar no meio de uma briga precisa calar AGORA: o laço só chamaria
      // `batalhaAcabou` quando o último selvagem saísse do alcance.
      if (!ligado) audio.batalhaAcabou();
    }
    // Trocar de escala é trocar de corpo: quem está em campo é remontado no
    // tamanho novo, e os selvagens em volta não — eles nascem certos, e
    // recarregar três modelos no meio de uma briga custaria mais do que a
    // incoerência de meio minuto até eles serem trocados.
    if (id === 'tamanhoReal') void this.remontarCompanheiro();

    const tipo = INTERRUPTORES.find((c) => c.id === id);
    this.aviso.mostrar(
      [
        { texto: tipo?.nome ?? 'ajuste', tamanho: 36, cor: ligado ? '#7fe7c4' : '#9aa5b8' },
        {
          texto: ligado ? (tipo?.ligadoDiz ?? 'ligado') : (tipo?.desligadoDiz ?? 'desligado'),
          tamanho: 22,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2,
    );
  }

  private escolherModo(modo: Modo) {
    if (modo.id === this.ajustes.modo) return;
    this.ajustes.definirModo(modo.id);
    this.golpeArmado = null;
    this.encarados.clear();
    audio.clique();

    // Trocar para o Relaxante limpa a sala: o sentido do modo é não ter
    // ninguém aparecendo para brigar, e esperar os que já estão irem embora
    // sozinhos desmentiria isso no primeiro minuto.
    if (!modo.spawnAutomatico) this.dispensarSelvagens();
    else this.proximoSpawn = modo.intervaloSpawn[0] * 0.5;

    this.aviso.mostrar(
      [
        { texto: `modo ${modo.nome}`, tamanho: 44, cor: modo.cor },
        { texto: this.explicacaoDoModo(modo), tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
      2.8,
    );
  }

  private explicacaoDoModo(modo: Modo): string {
    if (modo.id === 'relaxante') return 'ninguém vem brigar — só você e o seu Pokémon';
    if (modo.id === 'safari') return 'quem aparecer só briga se você mandar atacar';
    return 'escolha o golpe na fileira de baixo do painel';
  }

  private armarGolpe(entrada: EntradaGolpe) {
    const golpe = entrada.golpe;
    this.golpeArmado = golpe.nome;
    audio.clique();

    const categoria =
      golpe.categoria === 'status'
        ? (golpe.resumo ?? 'muda os stats')
        : golpe.categoria === 'fisico'
          ? `físico · potência ${golpe.potencia}`
          : `especial · potência ${golpe.potencia}`;

    this.aviso.mostrar(
      [
        {
          texto: golpe.nome,
          tamanho: 42,
          cor: golpe.categoria === 'status' ? '#c8b5ff' : corHexDeTipo(golpe.tipo),
        },
        { texto: categoria, tamanho: 23, cor: '#9aa5b8', peso: 500 },
        { texto: 'é este que sai no próximo gatilho', tamanho: 21, cor: '#ffd78a', peso: 600 },
      ],
      2.2,
    );
  }

  /** Manda embora quem está em campo, sem dar XP nem pena. */
  private dispensarSelvagens() {
    for (const selvagem of [...this.selvagens]) this.removerSelvagem(selvagem.pokemon);
    this.encarados.clear();
  }

  // ------------------------------------------------------------ time

  /** Fecha a escolha inicial e entrega o parceiro com a vida cheia. */
  private receberInicial(especie: Especie) {
    this.dex.receberInicial(especie.id);
    if (this.escolha) {
      this.escolha.descartar(this.cena);
      this.escolha = null;
    }
    this.proximoSpawn = 4;
    this.aviso.mostrar(
      [
        { texto: `${especie.nome} é seu!`, tamanho: 46, cor: corHexDe(especie) },
        { texto: especie.descricao, tamanho: 21, cor: '#9aa5b8', peso: 400, espaco: 6 },
        { texto: 'aperte o GRIP e arremesse para soltar ele', tamanho: 23, cor: '#ffd78a', peso: 600 },
      ],
      6,
    );
  }

  /** Devolve true quando o bicho ficou ativo e pronto para ir a campo. */
  private escolherDoTime(exemplar: Exemplar): boolean {
    const especie = porId(exemplar.id);
    if (!especie) return false;

    // Escolher quem já está em campo recolhe ele de volta.
    if (this.exemplarEmCampo === exemplar && this.companheiro?.viva) {
      this.recolherCompanheiro();
      return false;
    }

    if (exemplar.hp <= 0) {
      this.aviso.mostrar(
        [
          { texto: `${especie.nome} está desmaiado`, tamanho: 38, cor: '#ff9f9f' },
          { texto: 'ele se recupera com o tempo', tamanho: 24, cor: '#9aa5b8', peso: 500 },
        ],
        2.2,
      );
      return false;
    }

    this.dex.definirAtivo(this.dex.indiceDe(exemplar));
    void garantir(especie.id, exemplar.shiny);
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: especie.nome, tamanho: 44, cor: corHexDe(especie) },
        { texto: 'aperte o GRIP e arremesse a bola', tamanho: 24, cor: '#9aa5b8', peso: 500 },
      ],
      2.6,
    );
    return true;
  }

  private recolherCompanheiro() {
    if (!this.companheiro) return;
    // Buff e debuff sao da BRIGA, nao do bicho: voltar para a bola limpa tudo.
    this.companheiro.limparEstagios();
    // Voltar para a bola limpa a condição, como no jogo original: o Centro
    // Pokémon cabe dentro dela.
    this.companheiro.limparCondicao();
    if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, this.companheiro.hp);
    audio.recolher();
    this.companheiro.dissolver();
    this.aviso.mostrar(
      [{ texto: `${this.companheiro.especie.nome}, volta!`, tamanho: 40, cor: '#cfe6ff' }],
      1.8,
    );
  }

  // ------------------------------------------------------------ batalha

  /**
   * Em quem o companheiro vai bater: **quem você está apontando**, e só depois
   * disso quem está mais perto.
   *
   * O jogo escolhia sozinho o selvagem mais próximo do companheiro, o que
   * tornava impossível a jogada mais básica de uma briga — escolher o alvo. Com
   * três bichos na sala, mandar bater no Geodude enquanto o Rattata passeia ao
   * lado não era uma coisa que se pudesse pedir.
   *
   * Agora o braço decide. O alvo apontado TRAVA: os golpes seguintes continuam
   * nele mesmo que a mão saia da linha, porque ninguém consegue manter o braço
   * parado a três metros de um bicho que anda. A trava cai sozinha quando ele
   * desmaia, foge ou some da sala.
   */
  private alvoEscolhido(mao: Mao): Pokemon | null {
    const apontado = this.selvagemNaMira(mao, ALCANCE_BATALHA + 2);
    if (apontado) {
      if (apontado !== this.alvoTravado) this.travarAlvo(apontado, mao);
      return apontado;
    }

    const travado = this.alvoTravado;
    if (travado && travado.viva && !travado.desmaiado && travado.estado !== 'preso') {
      const perto =
        this.companheiro !== null &&
        travado.raiz.position.distanceTo(this.companheiro.raiz.position) < ALCANCE_BATALHA + 2;
      if (perto) return travado;
    }
    this.alvoTravado = null;

    return this.alvoDoCompanheiro();
  }

  /**
   * O laser, um por mão, mostrando em quem o gatilho vai bater AGORA.
   *
   * Ele responde à mira e não ao alvo travado, de propósito. A trava existe
   * porque ninguém segura o braço parado a três metros de um bicho que anda
   * (ver `alvoEscolhido`), mas o que o jogador precisa ver enquanto move o
   * braço é a pergunta que o gatilho vai fazer, não a resposta da vez passada —
   * senão o feixe apontaria para um lado e a mão para outro.
   *
   * Só aparece com alguém em campo: sem companheiro não há golpe para sair, e
   * um laser que não faz nada é pior do que nenhum.
   */
  private atualizarFeixe(mao: Mao, dt: number, agora: number) {
    const feixe = this.feixes.get(mao.indice);
    if (!feixe) return;

    const podeAtacar = this.temCompanheiroEmCampo && !this.escaneando && !this.escolha;
    const alvo = podeAtacar && mao.conectada ? this.selvagemNaMira(mao, ALCANCE_BATALHA + 2) : null;
    if (!alvo) {
      feixe.atualizar(dt, false, 1, 0xff6b5c, agora / 1000);
      return;
    }

    const origem = mao.alvo.getWorldPosition(_feixeOrigem);
    feixe.atualizar(dt, true, origem.distanceTo(alvo.centro), corDe(alvo.especie), agora / 1000);
  }

  private travarAlvo(alvo: Pokemon, mao: Mao) {
    this.alvoTravado = alvo;
    mao.sentir('pegou');
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: `alvo: ${alvo.especie.nome}`, tamanho: 34, cor: corHexDe(alvo.especie) },
        { texto: 'o gatilho bate nele até ele cair', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
      1.6,
    );
  }

  /** O selvagem mais próximo do companheiro, dentro do alcance. */
  private alvoDoCompanheiro(): Pokemon | null {
    if (!this.companheiro) return null;
    let melhor: Pokemon | null = null;
    let menorDist = ALCANCE_BATALHA;
    for (const { pokemon } of this.selvagens) {
      if (!pokemon.viva || pokemon.estado === 'preso' || pokemon.estado === 'saindo') continue;
      const d = pokemon.raiz.position.distanceTo(this.companheiro.raiz.position);
      if (d < menorDist) {
        menorDist = d;
        melhor = pokemon;
      }
    }
    return melhor;
  }

  private comandarAtaque(mao: Mao) {
    if (!this.temCompanheiroEmCampo) {
      this.aviso.mostrar(
        [
          { texto: 'nenhum Pokémon em campo', tamanho: 34, cor: '#ffd78a' },
          { texto: 'gire o pulso esquerdo e pegue a bola de um deles', tamanho: 22, cor: '#9aa5b8', peso: 500 },
        ],
        2.4,
      );
      return;
    }

    const alvo = this.alvoEscolhido(mao);
    if (!alvo) {
      // Sem ninguém para brigar, o gatilho ainda serve: ele acerta o ponto da
      // sala para onde você está apontando. É o que dá o que fazer no modo
      // Relaxante, onde não nasce selvagem nenhum — e continua valendo nos
      // outros, porque mandar o bicho estourar um canto da parede é divertido
      // independente do modo.
      this.atacarOAmbiente(mao);
      return;
    }

    const companheiro = this.companheiro!;
    // Recarregando. Só a mão é avisada: isto acontece dezenas de vezes por
    // briga, e um cartaz a cada gatilho seria pior do que o silêncio.
    if (!companheiro.podeAtacar) {
      this.recusar(mao);
      return;
    }

    // O golpe armado no painel é o que sai, em qualquer modo. Antes isso era
    // privilégio do modo Batalha e nos outros o jogo escolhia sozinho — o que
    // tirava do jogador exatamente a decisão que torna a briga uma briga.
    const golpe = this.golpeDoCampo() ?? escolherGolpe(companheiro, alvo);

    // No Safari, mandar atacar é o que transforma um encontro em briga: daí em
    // diante aquele selvagem revida.
    this.encarados.add(alvo);

    if (golpe.categoria === 'status') {
      mao.sentir('pegou');
      companheiro.marcarRecarga(this.recargaComVelocidade(companheiro, golpe));
      this.usarStatus(companheiro, alvo, golpe);
      return;
    }

    if (companheiro.atacar(alvo, this.recargaComVelocidade(companheiro, golpe), gestoDoGolpe(golpe))) {
      mao.sentir('acertou');
      this.dispararGolpe(companheiro, alvo, golpe);
    }
  }

  /** O golpe que está armado no painel, se ele ainda pertence a quem está em campo. */
  private golpeDoCampo(): Golpe | null {
    if (!this.temCompanheiroEmCampo) return null;
    return arsenal(this.companheiro!).find((g) => g.nome === this.golpeArmado) ?? null;
  }

  /**
   * A recarga do golpe, encurtada pela velocidade.
   *
   * É o que faz `Arranque` e `Entorpecer` valerem alguma coisa do seu lado: um
   * buff de velocidade não muda o dano, muda de quanto em quanto tempo você
   * pode mandar o próximo.
   */
  private recargaComVelocidade(quem: Pokemon, golpe: Golpe): number {
    return golpe.recarga / multEstagio(quem.estagios.velocidade);
  }

  /**
   * Golpe no vazio: o companheiro acerta onde a sua mão está apontando.
   *
   * Sem dano e sem alvo — o que ele produz é o efeito, o som e o estalo de
   * partículas no ponto. O destino sai da mira mesmo, limitado a três metros,
   * que é mais do que qualquer quarto e menos do que o infinito.
   */
  private atacarOAmbiente(mao: Mao) {
    const companheiro = this.companheiro!;
    if (!companheiro.podeAtacar) {
      this.recusar(mao);
      return;
    }

    const { origem, direcao } = mao.mira();
    const ponto = origem.clone().addScaledVector(direcao, 3);
    // Não deixa o golpe ir parar embaixo do carpete.
    ponto.y = Math.max(ponto.y, this.sala.pisoY + 0.05);

    // Contra o nada, um golpe de status nao teria o que mostrar: entao aqui
    // vale o armado so quando ele causa dano.
    const armado = this.golpeDoCampo();
    const golpe =
      armado && armado.categoria !== 'status'
        ? armado
        : (golpesDeDano(arsenal(companheiro))[0] ?? arsenal(companheiro)[0]);

    if (!companheiro.atacarPonto(ponto, golpe.recarga, gestoDoGolpe(golpe))) return;
    mao.sentir('acertou');

    const efeito = new Efeito(golpe, companheiro.boca, ponto);
    efeito.adicionarA(this.cena);
    this.efeitos.push(efeito);
    this.talvezAssinatura(companheiro, golpe, ponto);
    audio.golpe(golpe.tipo);
    audio.grito(companheiro.especie.id, companheiro.shiny, companheiro.especie.num);

    window.setTimeout(() => {
      const impacto = new Impacto(ponto, TIPOS[golpe.tipo].cor);
      this.cena.add(impacto.pontos);
      this.impactos.push(impacto);
    }, efeito.momentoImpacto * 1000);
  }

  /**
   * O efeito de assinatura, quando o atacante é um dos iniciais e o golpe é o
   * principal dele. Fora isso não faz nada — o efeito comum já saiu.
   */
  private talvezAssinatura(atacante: Pokemon, golpe: Golpe, destino: THREE.Vector3) {
    const id = assinaturaDe(atacante.especie.id, golpe.tipo);
    if (!id) return;
    const assinatura = new Assinatura(id, atacante.boca, destino);
    assinatura.adicionarA(this.cena);
    this.assinaturas.push(assinatura);
  }

  /** Cria o efeito visual e agenda o dano para o momento do impacto. */
  private dispararGolpe(atacante: Pokemon, defensor: Pokemon, golpe: Golpe) {
    const efeito = new Efeito(golpe, atacante.boca, defensor.centro);
    efeito.adicionarA(this.cena);
    this.efeitos.push(efeito);
    this.talvezAssinatura(atacante, golpe, defensor.centro);
    // O golpe soa de onde ele SAI: a boca de quem atacou. Ver audio.de.
    const boca = atacante.boca;
    audio.de(boca.x, boca.y, boca.z, () => {
      audio.golpe(golpe.tipo);
      audio.grito(atacante.especie.id, atacante.shiny, atacante.especie.num);
    });

    // O dano cai junto com o impacto do efeito, não no instante do comando.
    const atraso = efeito.momentoImpacto * 1000;
    window.setTimeout(() => {
      if (!atacante.viva || !defensor.viva || defensor.estado === 'preso') return;
      this.resolverDano(atacante, defensor, golpe);
    }, atraso);
  }

  private resolverDano(atacante: Pokemon, defensor: Pokemon, golpe: Golpe) {
    const rolagem = calcularDano(atacante, defensor, golpe);
    const { efetividade, critico } = rolagem;
    let dano = rolagem.dano;

    // Queimado bate mais fraco — é o preço da condição, e o que a diferencia do
    // veneno, que só corrói. Ver src/condicao.ts.
    dano *= atacante.perfilDaCondicao?.fatorAtaque ?? 1;

    // O teto e a dificuldade valem só do lado de cá. Ver TETO_DANO_RECEBIDO em
    // src/species.ts: um teto para os dois achataria a tabela de tipos, e o que
    // precisava de piso de reação era o golpe que CHEGA em você.
    if (defensor.papel === 'companheiro') {
      dano = danoRecebido(dano, defensor.hpMax, this.ajustes.perfil.danoRecebido);
    }
    defensor.receberDano(dano);

    // O golpe acerta alguém — item 2.1 do roteiro.
    //
    // Antes daqui o combate funcionava e não sentia: o golpe saía, o dano era
    // calculado, a barra descia. Três coisas, na ordem em que o corpo as lê:
    //
    // 1. A PAUSA. Hit-stop nos dois, mais longa quando o golpe foi forte — o
    //    cérebro lê tempo parado como massa. É a que mais rende das três, e a
    //    única que não custa nada para desenhar.
    // 2. O EMPURRÃO, na direção em que o golpe viajou. Centímetros, que voltam
    //    sozinhos.
    // 3. A MÃO. Ver `TATO`, em src/hands.ts.
    //
    // O que NÃO entra: screen shake. Em VR isso enjoa — ver a primeira regra
    // de PROXIMOS-PASSOS.md. O impacto vai para o objeto, para a mão e para o
    // som, nunca para a câmera.
    const forca = THREE.MathUtils.clamp(dano / Math.max(defensor.hpMax, 1), 0.08, 0.5);
    const congelamento = 0.05 + forca * 0.09 + (critico ? 0.04 : 0);
    atacante.congelar(congelamento);
    defensor.congelar(congelamento);
    defensor.empurrar(atacante.raiz.position, 0.08 + forca * 0.22);

    const impacto = new Impacto(defensor.centro, TIPOS[golpe.tipo].cor);
    this.cena.add(impacto.pontos);
    this.impactos.push(impacto);

    // O número, no corpo de quem levou — item 2.2 do roteiro.
    //
    // A cor é a da EFETIVIDADE, não a do tipo do golpe: o que o jogador precisa
    // aprender olhando é se a escolha dele foi boa, e a tabela dos 18 tipos é
    // grande demais para se decorar de cabeça. Verde quando foi super eficaz,
    // cinza quando quase não arranhou, branco no normal — três cores, que é o
    // que se distingue de relance num quarto iluminado por acaso.
    const corDoDano =
      efetividade >= 2 ? '#8ef0a8' : efetividade === 0 ? '#6a7386' : efetividade <= 0.5 ? '#b9c0cc' : '#ffffff';
    const numero = new NumeroDeDano(defensor.centro, dano, corDoDano, critico, defensor.altura);
    this.cena.add(numero.sprite);
    this.numeros.push(numero);

    // Quem levou é o seu: a mão sente o baque, não o acerto.
    if (defensor.papel === 'companheiro') {
      for (const mao of this.maos) mao.sentir('levou');
      // A primeira vez que o SEU bicho fica perto de cair é a hora em que a
      // poção deixa de ser um item da mochila e vira uma decisão. Dizer onde
      // ela está agora vale mais do que ter dito na entrada da sessão, quando
      // ninguém precisava dela.
      const baixa = defensor.hp > 0 && defensor.hp <= defensor.hpMax * 0.35;
      if (baixa && this.dex.item('pocao') > 0 && this.dex.primeiraVez('vida-baixa')) {
        this.aviso.mostrar(
          [
            { texto: `${defensor.especie.nome} está mal`, tamanho: 34, cor: '#ff9f9f' },
            { texto: 'B abre a mochila · pegue a poção e encoste nele', tamanho: 22, cor: '#9ff0c4', peso: 600 },
          ],
          3.4,
        );
      }
    } else {
      for (const mao of this.maos) mao.sentir(critico ? 'levou' : 'acertou');
    }

    // E o impacto soa de onde ele CHEGA — que é outro ponto da sala, e é o
    // que faz uma briga entre dois bichos a três metros parecer acontecer lá.
    const onde = defensor.centro;
    audio.de(onde.x, onde.y, onde.z, () => {
      audio.impacto(efetividade);
      if (critico) audio.critico();
    });

    // Um golpe de dano também pode deixar condição — chance pequena, porque é
    // bônus e não o plano. Ver condicaoDoGolpe.
    this.talvezCondicao(defensor, golpe);

    const nota = textoEfetividade(efetividade);
    const linhas = [
      {
        texto: `${atacante.especie.nome} usou ${golpe.nome}!`,
        tamanho: 32,
        cor: `#${new THREE.Color(TIPOS[golpe.tipo].cor).getHexString()}`,
      },
    ];
    if (critico) linhas.push({ texto: 'Acerto crítico!', tamanho: 26, cor: '#ffd78a' });
    if (nota) linhas.push({ texto: nota, tamanho: 26, cor: efetividade >= 2 ? '#9ff0c4' : '#9aa5b8' });
    this.aviso.mostrar(linhas, 1.8);

    if (defensor.desmaiado) {
      audio.desmaiou();
      audio.grito(defensor.especie.id, defensor.shiny, defensor.especie.num);
      if (defensor.papel === 'selvagem') {
        // Derrubar rende experiência, mas menos do que capturar.
        this.premiarXp(defensor, false);
        this.aviso.mostrar(
          [
            { texto: `${defensor.especie.nome} está exausto!`, tamanho: 36, cor: '#ffd78a' },
            { texto: 'jogue uma pokébola agora', tamanho: 26, cor: '#9ff0c4', peso: 600 },
          ],
          3,
        );
      } else {
        this.aviso.mostrar(
          [
            { texto: `${defensor.especie.nome} desmaiou!`, tamanho: 38, cor: '#ff9f9f' },
            { texto: 'escolha outro no painel', tamanho: 24, cor: '#9aa5b8', peso: 500 },
          ],
          3,
        );
      }
    }
  }

  /** O selvagem revida sozinho enquanto houver um companheiro em campo. */
  /** Este selvagem está em condição de brigar com quem está em campo agora? */
  private podeRevidar(pokemon: Pokemon): boolean {
    if (!this.temCompanheiroEmCampo) return false;
    return (
      pokemon.viva &&
      !pokemon.desmaiado &&
      pokemon.estado !== 'preso' &&
      pokemon.estado !== 'saindo' &&
      pokemon.estado !== 'surgindo' &&
      // Quem revida: no Batalha, todo mundo; no Safari, só quem você já
      // mandou atacar. É o que torna encarar uma escolha em vez de uma
      // emboscada.
      (this.ajustes.modoAtual.selvagemRevida || this.encarados.has(pokemon)) &&
      pokemon.raiz.position.distanceTo(this.companheiro!.raiz.position) < ALCANCE_BATALHA
    );
  }

  /**
   * Marca o próximo golpe deste selvagem e começa a contagem.
   *
   * O golpe é escolhido AGORA, no início do ciclo, e não na hora de disparar.
   * É o que permite a barra dizer o nome dele durante a espera inteira — e
   * saber que vem um Lança-Chamas daqui a três segundos é uma informação
   * completamente diferente de descobrir que veio um.
   */
  private agendarGolpe(selvagem: Selvagem) {
    const alvo = this.companheiro;
    const pokemon = selvagem.pokemon;
    if (!alvo) return;

    // De vez em quando ele usa status em vez de bater. Pouco: o selvagem que
    // passa a briga se buffando não é divertido, mas um que nunca faz isso não
    // ensina que a jogada existe.
    const status = golpesDeStatus(arsenal(pokemon));
    const usaStatus =
      status.length > 0 && Math.random() < 0.18 && this.temEspacoDeEstagio(pokemon, alvo, status[0]);

    selvagem.golpe = usaStatus ? status[0] : escolherGolpe(pokemon, alvo);
    selvagem.aviso = this.ajustes.perfil.avisoSegundos;
    selvagem.ciclo = intervaloDeAtaque(pokemon) + selvagem.aviso;
    selvagem.restante = selvagem.ciclo;
    selvagem.avisou = false;
  }

  /** Um debuff que já está no fundo do poço não vale a vez de ninguém. */
  private temEspacoDeEstagio(usuario: Pokemon, alvo: Pokemon, golpe: Golpe): boolean {
    const efeito = golpe.efeito;
    if (!efeito) return false;
    const destino = efeito.alvo === 'proprio' ? usuario : alvo;
    const atual = destino.estagios[efeito.stat];
    return Math.abs(atual + efeito.estagios) <= LIMITE_ESTAGIO;
  }

  /**
   * A cadência do inimigo, com aviso.
   *
   * Esta função é a resposta direta ao "não dá nem tempo para reação": o golpe
   * não sai mais de surpresa. Ele é escolhido, anunciado na barra sobre a
   * cabeça do bicho, e só então disparado — com um recuo visível no corpo nos
   * últimos instantes. Quanto dura esse aviso é o que a dificuldade controla.
   */
  private atualizarAtaqueSelvagem(dt: number) {
    for (const selvagem of this.selvagens) {
      if (!this.podeRevidar(selvagem.pokemon)) {
        // Fora de combate o relógio para e some da barra: uma contagem correndo
        // num bicho que não vai atacar é um susto de graça.
        selvagem.golpe = null;
        selvagem.restante = 0;
        continue;
      }

      if (!selvagem.golpe) {
        this.agendarGolpe(selvagem);
        continue;
      }

      selvagem.restante -= dt;

      // Entrou na reta final: o corpo recua, e o recuo dura exatamente o aviso.
      if (!selvagem.avisou && selvagem.restante <= selvagem.aviso) {
        selvagem.avisou = true;
        // O aviso JÁ É o recolhimento do golpe que vem: o gesto é o do golpe
        // agendado, esticado para durar exatamente o tempo do aviso.
        selvagem.pokemon.animador.disparar(golpeDe(selvagem), selvagem.aviso + 0.35);
        audio.carregando();
      }

      if (selvagem.restante > 0) continue;

      const golpe = selvagem.golpe;
      const companheiro = this.companheiro!;
      if (golpe.categoria === 'status') {
        this.usarStatus(selvagem.pokemon, companheiro, golpe);
      } else if (selvagem.pokemon.atacar(companheiro, golpe.recarga, gestoDoGolpe(golpe))) {
        this.dispararGolpe(selvagem.pokemon, companheiro, golpe);
      }
      this.agendarGolpe(selvagem);
    }
  }

  /**
   * Um golpe de status: nada de dano, um estágio a mais ou a menos.
   *
   * Vale para os dois lados — é o mesmo código quando você escolhe "Escudo" e
   * quando o selvagem resolve baixar o seu ataque.
   */
  /**
   * A condição de status que um golpe pode deixar no alvo — ver src/condicao.ts.
   *
   * Chamada dos dois lados do combate: o que o seu Pokémon faz com o selvagem
   * é o mesmo que ele faz com você. Uma mecânica que só funciona numa direção é
   * uma mecânica que o jogador aprende a explorar em vez de respeitar.
   */
  private talvezCondicao(alvo: Pokemon, golpe: Golpe) {
    const possivel = condicaoDoGolpe(golpe.tipo, golpe.categoria, golpe.nome);
    if (!possivel || Math.random() > possivel.chance) return;
    if (!alvo.aplicarCondicao(possivel.condicao)) return;

    const perfil = CONDICOES[possivel.condicao];
    const onde = alvo.centro;
    audio.de(onde.x, onde.y, onde.z, () => audio.golpeDeStatus(false));

    const brilho = new Impacto(alvo.centro, perfil.cor);
    this.cena.add(brilho.pontos);
    this.impactos.push(brilho);

    this.aviso.mostrar(
      [
        {
          texto: `${alvo.especie.nome} ${perfil.diz}`,
          tamanho: 34,
          cor: `#${new THREE.Color(perfil.cor).getHexString()}`,
        },
        ...(possivel.condicao === 'sono' && alvo.papel === 'selvagem' && this.dex.primeiraVez('sono')
          ? [
              {
                texto: 'dormindo, a bola pega MUITO mais fácil — aproveite',
                tamanho: 21,
                cor: '#9ff0c4',
                peso: 600,
              },
            ]
          : []),
      ],
      2.2,
    );
  }

  private usarStatus(usuario: Pokemon, oponente: Pokemon, golpe: Golpe) {
    const efeito = golpe.efeito;
    // Um golpe de status pode não mexer em estágio nenhum e ainda assim valer a
    // vez: os que adormecem e paralisam passam por aqui.
    this.talvezCondicao(oponente, golpe);
    if (!efeito) return;

    const destino = efeito.alvo === 'proprio' ? usuario : oponente;
    usuario.animador.disparar(gestoDoGolpe(golpe), 0.7);
    audio.golpeDeStatus(efeito.estagios >= 0);

    const novo = aplicarStatus(destino.estagios, efeito);
    const aura = new Aura(
      destino.raiz.position.clone(),
      destino.raio * 1.3,
      efeito.estagios,
    );
    aura.adicionarA(this.cena);
    this.auras.push(aura);

    const nomeStat =
      efeito.stat === 'ataque' ? 'ataque' : efeito.stat === 'defesa' ? 'defesa' : 'velocidade';

    if (novo === null) {
      this.aviso.mostrar(
        [
          { texto: `${usuario.especie.nome} usou ${golpe.nome}`, tamanho: 32, cor: '#cfe6ff' },
          { texto: `a ${nomeStat} não muda mais`, tamanho: 24, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    const subiu = efeito.estagios > 0;
    this.aviso.mostrar(
      [
        { texto: `${usuario.especie.nome} usou ${golpe.nome}!`, tamanho: 34, cor: '#cfe6ff' },
        {
          texto: `${nomeStat} de ${destino.especie.nome} ${subiu ? 'subiu' : 'caiu'} (${textoEstagio(novo)})`,
          tamanho: 26,
          cor: subiu ? '#9ff0c4' : '#ffb1b1',
          peso: 600,
        },
      ],
      2.2,
    );
  }

  // ------------------------------------------------------------ progressão

  /** Dá XP ao que está em campo e cuida do nível e da evolução. */
  private premiarXp(derrotado: Pokemon, capturou: boolean) {
    const exemplar = this.exemplarEmCampo;
    if (!exemplar || derrotado.xpConcedida) return;
    derrotado.xpConcedida = true;

    const ganho = xpDeEncontro(derrotado.especie, derrotado.nivel, capturou);
    const novoNivel = this.dex.ganharXp(exemplar, ganho);
    if (novoNivel !== null) {
      const especie = porId(exemplar.id);
      audio.subiuDeNivel();
      this.aviso.mostrar(
        [
          { texto: `${especie?.nome ?? ''} subiu para o nível ${novoNivel}!`, tamanho: 40, cor: '#9fe0ff' },
          { texto: `+${ganho} de experiência`, tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        2.6,
      );
      void this.conferirEvolucao(exemplar);
    }
  }

  /**
   * Evolução. Acontece no lugar, com o bicho em campo: o corpo antigo some numa
   * clarada e o novo nasce na mesma posição. É o momento mais bonito que o jogo
   * tem, e recolher para a bola antes estragaria ele.
   */
  /**
   * Descobre se dá para evoluir e PERGUNTA.
   *
   * Evoluir deixou de ser automático. No jogo original é uma decisão — a única
   * irreversível que existe —, e quem quer manter o Pikachu Pikachu tem o
   * direito de manter. Então aqui só se marca a pendência; quem responde é o
   * botão A (ou B, para adiar até o próximo nível).
   *
   * Também roda ao entrar em campo, e não só ao subir de nível: um Pokémon
   * capturado já acima do nível de evolução nunca subia de nível na sua mão, e
   * por isso nunca evoluía. Esse era o buraco.
   */
  private conferirEvolucao(exemplar: Exemplar) {
    if (this.evolucaoPendente || this.evolucaoEmCurso) return;
    const atual = porId(exemplar.id);
    if (!atual) return;

    const nivel = this.dex.nivelDe(exemplar);
    const evoluida = evolucaoEm(atual, nivel);
    if (!evoluida) return;
    // Disse "agora não" neste nível: não se pergunta de novo até ele subir.
    if ((exemplar.recusouEvoluirEm ?? -1) >= nivel) return;

    // Só evolui quem está em campo: a transformação é a cena, e ela não pode
    // acontecer dentro da bola onde ninguém vê.
    if (this.exemplarEmCampo !== exemplar || !this.companheiro?.viva) return;

    this.evolucaoPendente = { exemplar, de: atual, para: evoluida };
    // O modelo novo começa a baixar agora: quando você apertar A, ele já chegou.
    void garantir(evoluida.id, exemplar.shiny);
    audio.evoluindo();
    this.companheiro.comemorar();
  }

  /**
   * A pedra evolui NA HORA, sem perguntar.
   *
   * A pergunta existe porque evoluir por nível acontece COM você, não por você:
   * o bicho chega no 16 sozinho e o jogo precisa saber se era isso que você
   * queria. A pedra é o contrário — você foi à mochila, pegou a pedra certa,
   * atravessou a sala e encostou nele. Perguntar "tem certeza?" depois disso é
   * duvidar de uma decisão que já foi tomada três vezes.
   *
   * E há a razão prática: a pedra é gasta no toque. Perguntar abriria a porta
   * para dizer "agora não" com a pedra já consumida, e ela aparece uma vez a
   * cada trinta capturas.
   */
  private evoluirComPedra(para: Especie, nomeDaPedra: string) {
    const exemplar = this.exemplarEmCampo;
    const atual = exemplar ? porId(exemplar.id) : null;
    if (!exemplar || !atual || this.evolucaoPendente || this.evolucaoEmCurso) return;

    this.aviso.mostrar(
      [
        { texto: `${nomeDaPedra}!`, tamanho: 38, cor: '#ffd76a' },
        { texto: `${atual.nome} está evoluindo`, tamanho: 24, cor: '#9aa5b8', peso: 500 },
      ],
      2.2,
    );

    this.evolucaoPendente = { exemplar, de: atual, para };
    void garantir(para.id, exemplar.shiny);
    // Direto para o sim: o efeito, o som e a troca de corpo são os mesmos da
    // evolução por nível, e reescrevê-los aqui seria manter duas evoluções.
    this.permitirEvolucao();
  }

  /** Botão A no pedido: a transformação começa. */
  private permitirEvolucao() {
    const pendente = this.evolucaoPendente;
    if (!pendente || this.evolucaoEmCurso) return;
    if (this.exemplarEmCampo !== pendente.exemplar || !this.companheiro?.viva) {
      this.evolucaoPendente = null;
      return;
    }

    this.evolucaoPendente = null;
    this.evolucaoEmCurso = {
      efeito: new Evolucao(this.companheiro, this.cena),
      exemplar: pendente.exemplar,
      de: pendente.de,
      para: pendente.para,
      trocou: false,
    };
    audio.evoluir();
    for (const mao of this.maos) mao.sentir('levou');
  }

  /** Botão B: fica como está, e não se pergunta de novo até o próximo nível. */
  private recusarEvolucao() {
    const pendente = this.evolucaoPendente;
    if (!pendente) return;
    this.evolucaoPendente = null;
    this.dex.adiarEvolucao(pendente.exemplar);
    audio.recusa();
    this.aviso.mostrar(
      [
        { texto: `${pendente.de.nome} continua ${pendente.de.nome}`, tamanho: 34, cor: '#cfe6ff' },
        { texto: 'dá para deixar evoluir no próximo nível', tamanho: 22, cor: '#9aa5b8', peso: 500 },
      ],
      2.6,
    );
  }

  /**
   * O efeito rodando, quadro a quadro.
   *
   * O corpo é trocado no ESTOURO do branco, e não antes nem depois: é o único
   * instante em que a silhueta não se vê, e é por isso que a troca não parece
   * um corte.
   */
  private atualizarEvolucao(dt: number) {
    const curso = this.evolucaoEmCurso;
    if (!curso) return;

    const fase = curso.efeito.atualizar(dt);

    if (fase === 'trocar' && !curso.trocou) {
      curso.trocou = true;
      this.trocarCorpoDaEvolucao(curso);
      return;
    }

    if (fase !== 'terminou') return;

    curso.efeito.descartar(this.cena);
    this.evolucaoEmCurso = null;
    this.companheiro?.comemorar();
    audio.sucesso();
    // `forcar`: a primeira voz da forma nova. Este grito É a evolução — engoli-lo
    // por causa do intervalo tiraria o som do único quadro que o justifica.
    audio.grito(curso.para.id, curso.exemplar.shiny, curso.para.num, true);

    this.aviso.mostrar(
      [
        { texto: `${curso.de.nome} evoluiu!`, tamanho: 34, cor: '#cfe6ff' },
        { texto: `agora é ${curso.para.nome}`, tamanho: 46, cor: corHexDe(curso.para) },
        { texto: curso.para.descricao, tamanho: 20, cor: '#9aa5b8', peso: 400, espaco: 6 },
      ],
      5,
    );
  }

  private trocarCorpoDaEvolucao(curso: NonNullable<Jogo['evolucaoEmCurso']>) {
    const antigo = this.companheiro;
    if (!antigo) {
      curso.efeito.descartar(this.cena);
      this.evolucaoEmCurso = null;
      return;
    }

    const posicao = antigo.raiz.position.clone();
    const piso = antigo.pisoY;
    const hp = antigo.hp;

    this.dex.evoluir(curso.exemplar, curso.para.id);

    const corpo = instanciar(curso.para.id, this.alturaDe(curso.para), curso.exemplar.shiny, this.ajustes.tamanhoReal);
    if (!corpo) {
      // O modelo não chegou: a espécie já trocou nos dados, e o corpo entra no
      // próximo quadro pelo caminho normal. Melhor do que travar no branco.
      curso.efeito.descartar(this.cena);
      this.evolucaoEmCurso = null;
      this.removerCompanheiro();
      return;
    }

    this.removerCompanheiro();
    const novo = this.porEmCampo(curso.para, corpo, curso.exemplar, posicao, piso);
    // A vida atravessa a evolução em proporção — `Dex.evoluir` já fez a conta.
    novo.hp = Math.max(1, Math.min(this.dex.hpMaxDe(curso.exemplar), hp));
    // Ele nasce já no tamanho: o "surgindo" normal faria o bicho brotar do chão
    // logo depois do clarão, e a evolução não é uma invocação.
    novo.raiz.visible = true;
    novo.raiz.scale.setScalar(1);
    novo.estado = 'ocioso';

    curso.efeito.assumir(novo);
  }

  // ------------------------------------------------------------ selvagens

  /**
   * Quem aparece agora.
   *
   * A espécie da corrente puxa para si: com uma cadeia em andamento ela tem
   * três vezes mais peso. Sem isso a corrente nunca passaria de dois ou três
   * por acaso, e a caçada em cadeia — que é o que torna o brilhante alcançável
   * — não existiria na prática. Com o empurrão, um canto da casa onde o mesmo
   * bicho continua aparecendo vira um lugar em que vale a pena insistir.
   */
  private sortearEspecie(): Especie {
    const nivel = this.dex.nivelDoTreinador;
    const corrente = this.dex.especieDaCorrente;
    return escolherPesado(Math.random, ESPECIES, (e) => {
      const base = pesoSpawn(e, this.dex.jaCapturou(e.id), nivel);
      return e.id === corrente ? base * 3 : base;
    });
  }

  /**
   * Faz nascer um selvagem. É assíncrono porque o modelo pode não estar em
   * memória ainda: são 151 arquivos e só uma dúzia fica carregada. O bicho
   * aparece quando o GLB dele chega — nunca uma silhueta de espera.
   */
  private async nascerSelvagem() {
    if (this.nascendo) return;
    this.nascendo = true;
    try {
      const especie = this.sortearEspecie();
      // A corrente conta ESTE encontro, e é com ela que o dado é rolado.
      const corrente = this.dex.encadear(especie.id);
      const sorte = this.dex.sorteBrilhante;
      const shiny = sortearShiny(especie, sorte);
      const nivel = nivelSelvagem(this.dex.nivelDoTreinador);

      const gltf = await garantir(especie.id, shiny);
      if (!gltf) return;
      if (this.selvagens.length >= MAX_SELVAGENS) return;

      // A sala pode ter sido remedida enquanto o arquivo baixava, então o ponto
      // de spawn é escolhido agora, não antes.
      // A faixa e mais larga do que era: com o mapa acompanhando quem anda,
      // um bicho a cinco metros e um convite para caminhar ate ele em vez de um
      // que nunca sera alcancado.
      // Sentado, o cômodo inteiro encolhe: não adianta pôr um bicho a cinco
      // metros de quem não vai levantar para ir até ele. Ver o item 4.1.
      const perto = Pokemon.escalaPessoal;
      const local = this.sala.pontoDeSpawn(
        this.posicaoJogador,
        1.2 * perto,
        5.5 * perto,
        ondeNasce(especie),
      );
      if (!local) return;

      const corpo = instanciar(especie.id, this.alturaDe(especie), shiny, this.ajustes.tamanhoReal);
      if (!corpo) return;

      const piso = local.ponto.y;
      const pokemon = new Pokemon(especie, corpo, local.ponto, piso, 'selvagem', nivel, shiny);
      this.cena.add(pokemon.raiz);

      const barra = new BarraVida(
        shiny ? `✦ ${especie.nome}` : especie.nome,
        textoTipos(especie),
        TIPOS[especie.tipo].cor,
      );
      this.cena.add(barra.placa.malha);

      this.selvagens.push({
        pokemon,
        barra,
        restante: 0,
        ciclo: 1,
        aviso: this.ajustes.perfil.avisoSegundos,
        golpe: null,
        avisou: false,
      });
      this.dex.registrarEncontro(especie.id, shiny);
      audio.surgiu(especie.id === 'pikachu' || shiny);
      // O brilhante tem carimbo sonoro próprio. Ele aparece uma vez a cada
      // milhares de encontros e pode nascer atrás de você: o som é, muitas
      // vezes, a única chance de saber que ele está ali.
      if (shiny) audio.brilhante();
      // Um encontro comum respeita o intervalo; um BRILHANTE não. Ele aparece
      // uma vez a cada milhares e pode nascer atrás de você — perder essa voz
      // por causa de um cronômetro custaria caro demais.
      // De ONDE ele nasceu. Para um brilhante que apareceu atrás de você, a
      // direção do grito é a única chance de saber que ele está ali.
      const ondeNasceu = pokemon.centro.clone();
      window.setTimeout(
        () =>
          audio.de(ondeNasceu.x, ondeNasceu.y, ondeNasceu.z, () =>
            audio.grito(especie.id, shiny, especie.num, shiny),
          ),
        300,
      );

      const novidade = !this.dex.jaCapturou(especie.id);
      this.aviso.mostrar(
        [
          shiny
            ? { texto: `${especie.nome} BRILHANTE!`, tamanho: 42, cor: '#ffd76a' }
            : {
                texto: `${especie.nome} selvagem apareceu!`,
                tamanho: 36,
                cor: corHexDe(especie),
              },
          { texto: `nível ${nivel} · ${textoTipos(especie)}`, tamanho: 23, cor: '#9aa5b8', peso: 500 },
          ...(novidade
            ? [{ texto: 'espécie nova', tamanho: 24, cor: '#ffd78a', peso: 600 }]
            : []),
          // A primeira vez que um selvagem aparece é o único momento em que o
          // laço inteiro do jogo cabe numa linha — e é o momento em que quem
          // acabou de entrar mais precisa dela. Uma vez só, guardada no save.
          ...(this.dex.primeiraVez('selvagem')
            ? [
                {
                  texto: 'enfraqueça com o gatilho, depois arremesse uma bola nele',
                  tamanho: 22,
                  cor: '#9ff0c4',
                  peso: 600,
                },
              ]
            : []),
          // A corrente só aparece quando já significa alguma coisa: anunciar
          // "corrente de 1" a cada encontro seria ruído.
          ...(corrente >= 3 && !shiny
            ? [
                {
                  texto: `corrente de ${corrente} · brilhante ${textoChanceShiny(chanceShiny(sorte))}`,
                  tamanho: 21,
                  cor: '#ffd76a',
                  peso: 600,
                },
              ]
            : []),
          // No Safari o encontro não vira briga sozinho, e o aviso precisa
          // dizer isso: quem chega fica em paz até você puxar o gatilho.
          ...(this.ajustes.modoAtual.perguntaAntesDaBatalha
            ? [
                {
                  texto: 'ele está em paz — o gatilho é que começa a briga',
                  tamanho: 21,
                  cor: '#8ab6ff',
                  peso: 500,
                },
              ]
            : []),
        ],
        shiny ? 4.5 : 2.8,
      );
    } finally {
      this.nascendo = false;
    }
  }

  /**
   * O anel aos pés de quem está sendo atacado, e a limpeza da trava.
   *
   * A trava é uma referência a um Pokémon que pode sumir a qualquer momento —
   * derrubado, capturado, fugido ou longe demais. Conferir isso aqui, num lugar
   * só, é o que impede o anel de ficar piscando no chão vazio.
   */
  private atualizarMarcaDeAlvo(dt: number) {
    const alvo = this.alvoTravado;
    const vale =
      alvo !== null &&
      alvo.viva &&
      !alvo.desmaiado &&
      alvo.estado !== 'preso' &&
      alvo.estado !== 'saindo' &&
      this.temCompanheiroEmCampo;

    if (!vale && alvo) this.alvoTravado = null;
    this.marcaDeAlvo.atualizar(
      dt,
      vale ? alvo!.raiz.position : null,
      vale ? alvo!.pisoY : this.sala.pisoY,
      vale ? Math.max(0.18, alvo!.raio * 1.15) : 0.2,
    );
  }

  private removerSelvagem(alvo: Pokemon) {
    const i = this.selvagens.findIndex((s) => s.pokemon === alvo);
    if (i === -1) return;
    this.selvagens[i].pokemon.descartar(this.cena);
    this.cena.remove(this.selvagens[i].barra.placa.malha);
    this.selvagens[i].barra.descartar();
    this.selvagens.splice(i, 1);
    // Quem saiu de cena não precisa mais constar na lista de encarados do
    // Safari — o Set guarda referências e cresceria a sessão inteira.
    this.encarados.delete(alvo);
  }

  // ------------------------------------------------------------ loop

  atualizar(dt: number) {
    const agora = performance.now();
    this.camera.getWorldPosition(this.posicaoJogador);

    // A sala é remedida enquanto você anda: cada leitura carimba o chão sob os
    // seus pés e soma os planos novos que entraram no campo de visão. A cada um
    // terço de segundo é mais do que suficiente — andando depressa, isso dá uma
    // amostra a cada meio metro, e a célula do mapa tem oitenta centímetros.
    //
    // Isto vem antes de tudo, inclusive da escolha do parceiro: o quarto é o
    // tabuleiro, e medir enquanto você lê a tela é tempo de mapeamento de
    // graça.
    this.tempoLeituraSala -= dt;
    if (this.tempoLeituraSala <= 0) {
      this.tempoLeituraSala = 0.34;
      this.sala.atualizar(
        this.renderer.xr.getFrame() ?? null,
        this.renderer.xr.getReferenceSpace(),
        this.posicaoJogador,
      );
    }

    // O quarto vem antes do jogo. Enquanto o mapa não tem o bastante, a única
    // coisa que acontece é você andar e ver a sala se desenhar.
    if (this.escaneando) {
      this.atualizarEscaneamento(dt, agora);
      this.aviso.atualizar(dt, this.camera);
      return;
    }

    // Antes de qualquer coisa: sem um parceiro você não batalha, e sem batalhar
    // capturar é quase impossível. A escolha vem primeiro e segura o resto.
    if (!this.dex.escolheuInicial) {
      this.atualizarEscolhaInicial(dt, agora);
      this.aviso.atualizar(dt, this.camera);
      return;
    }

    if (this.bonusFruta > 0) this.bonusFruta -= dt;

    const comum = BOLA_PADRAO;
    if (this.dex.bolas(comum.id) < comum.maximo) {
      this.recarga += dt;
      if (this.recarga >= RECARGA_BOLA_COMUM) {
        this.recarga = 0;
        this.dex.ganharBola(comum.id, 1);
      }
    }

    // No Relaxante ninguém nasce: o modo existe justamente para a sala ficar
    // sua e do seu Pokémon.
    if (this.ajustes.modoAtual.spawnAutomatico) {
      this.proximoSpawn -= dt;
      if (this.proximoSpawn <= 0 && this.selvagens.length < MAX_SELVAGENS) {
        const [minimo, maximo] = this.ajustes.modoAtual.intervaloSpawn;
        this.proximoSpawn = minimo + Math.random() * (maximo - minimo);
        void this.nascerSelvagem();
      }
    }

    this.regenerarTime(dt);
    this.atualizarRecargaDeBolas();
    this.atualizarMaos(dt, agora);
    this.atualizarMochila(dt);
    this.atualizarOuvinte();
    this.atualizarAchados(dt);
    this.atualizarPostura(dt);
    this.atualizarPedidoDeAjuda(dt);
    this.atualizarPaineis(dt);
    this.atualizarMarca(dt);
    this.atualizarIscas(dt);
    this.atualizarSelvagens(dt);
    this.atualizarMarcaDeAlvo(dt);
    this.atualizarCompanheiro(dt);
    // Depois do companheiro: quem está no colo tem a posição escrita pela mão,
    // e ela precisa ser a última palavra sobre onde ele está neste quadro.
    this.atualizarColo();
    this.atualizarEvolucao(dt);
    this.atualizarCarinho(dt);
    this.atualizarAtaqueSelvagem(dt);
    this.atualizarBolas(dt);
    this.atualizarEfeitos(dt);

    this.painelPulso.atualizar(
      this.dex.totalBolas,
      this.dex.totalCapturas,
      this.dex.especiesCapturadas,
      this.dex.totalEspecies,
      this.sala.mapeadas,
      // A corrente só toma a linha do mapeamento quando já mudou a chance de
      // um jeito que se sente. Abaixo de três ela é ruído.
      this.dex.corrente >= 3
        ? `corrente ${this.dex.corrente} · brilhante ${textoChanceShiny(chanceShiny(this.dex.sorteBrilhante))}`
        : null,
    );
    this.aviso.atualizar(dt, this.camera);
    if (this.evolucaoPendente) {
      this.promptEvolucao.mostrar(this.evolucaoPendente.de, this.evolucaoPendente.para);
    }
    this.promptEvolucao.atualizar(dt, this.evolucaoPendente !== null, this.camera);
  }

  /** A vitrine dos iniciais, enquanto você não escolheu. */
  /**
   * O mapeamento de boas-vindas: a sala acesa, a contagem subindo e um pedido
   * para você andar.
   *
   * O mapeamento sempre existiu e sempre foi automático — e era invisível, que
   * é o mesmo que não existir para quem está de headset. Aqui ele só ganha
   * corpo: o contorno acende sozinho, cada superfície nova dá um clique, e o
   * número na sua frente é a prova de que andar está servindo para alguma
   * coisa. Passada a abertura, o contorno volta a obedecer a engrenagem e o
   * mapa continua crescendo calado, como sempre.
   */
  private atualizarEscaneamento(dt: number, agora: number) {
    if (this.tempoEscaneando === 0) this.sala.mostrarContorno(true);
    this.tempoEscaneando += dt;

    // Sem isto a mão congela no ar durante a abertura.
    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.amostrar(agora);
      mao.atualizarLuva(dt, this.ajustes.maoRecuada ? 0.02 : 0);
    }

    const mapeadas = this.sala.mapeadas;
    if (mapeadas !== this.mapeadasNoAviso) {
      if (this.mapeadasNoAviso >= 0) audio.clique();
      this.mapeadasNoAviso = mapeadas;
      this.aviso.fixar(
        mapeadas === 0
          ? [
              { texto: 'Procurando o seu quarto', tamanho: 38, cor: '#cfe6ff' },
              {
                texto: 'olhe em volta e dê alguns passos',
                tamanho: 23,
                cor: '#9aa5b8',
                peso: 500,
              },
            ]
          : [
              { texto: 'Mapeando o seu quarto', tamanho: 38, cor: '#cfe6ff' },
              {
                texto: 'ande pelo cômodo — o contorno é o que já entrou',
                tamanho: 22,
                cor: '#9aa5b8',
                peso: 500,
              },
              {
                texto: `${mapeadas} ${mapeadas === 1 ? 'superfície' : 'superfícies'}`,
                tamanho: 30,
                cor: '#7fd6a8',
                peso: 700,
              },
            ],
      );
    }

    const bastante =
      mapeadas >= SUPERFICIES_PARA_COMECAR && this.tempoEscaneando >= ESCANEAMENTO_MINIMO;
    // Nada em oito segundos é resposta: o aparelho não está entregando plano
    // nem chão, e insistir só deixa a pessoa parada olhando um número zerado.
    const semSensores = mapeadas === 0 && this.tempoEscaneando >= 8;
    if (!bastante && !semSensores && this.tempoEscaneando < ESCANEAMENTO_MAXIMO) return;

    this.escaneando = false;
    // O contorno volta a ser o que a engrenagem manda: a abertura tomou ele
    // emprestado, não mudou a preferência de ninguém.
    this.sala.mostrarContorno(this.ajustes.contornoDaSala);
    this.aviso.soltar();
    audio.sucesso();
    this.aviso.mostrar(
      [
        { texto: 'Sala pronta', tamanho: 40, cor: '#7fe7c4' },
        { texto: `${mapeadas} superfícies mapeadas`, tamanho: 26, cor: '#7fd6a8', peso: 700 },
        {
          texto: 'e o mapa cresce enquanto você anda',
          tamanho: 21,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2.6,
    );
  }

  private atualizarEscolhaInicial(dt: number, agora: number) {
    if (!this.escolha) {
      if (!this.carregandoEscolha) {
        this.carregandoEscolha = true;
        this.aviso.mostrar(
          [
            { texto: 'carregando os parceiros…', tamanho: 38, cor: '#cfe6ff' },
            { texto: 'são modelos de verdade, leva um instante', tamanho: 22, cor: '#9aa5b8', peso: 500 },
          ],
          4,
        );
        void EscolhaInicial.carregar().then(() => {
          this.escolha = new EscolhaInicial();
          this.cena.add(this.escolha.grupo);
          this.escolha.posicionar(this.camera);
        });
      }
      // Mesmo esperando, as mãos precisam continuar vivas.
      for (const mao of this.maos) {
        if (!mao.conectada) continue;
        mao.amostrar(agora);
        mao.atualizarLuva(dt, this.ajustes.maoRecuada ? 0.02 : 0);
      }
      return;
    }

    // As mãos continuam vivas: é com elas que você aponta. A luva também —
    // esta é a primeira coisa que o jogador vê ao entrar, e uma mão de luva
    // parada aqui seria a primeira impressão do jogo.
    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.amostrar(agora);
      mao.amostrarBotoes();
      mao.atualizarLuva(dt, this.ajustes.maoRecuada ? 0.02 : 0);
      // A memória de ter saído do painel, para guardar e pegar não serem o
      // mesmo gesto. Ver saiuDoPainel.
      if (!this.cartaSobAMao(mao)) this.saiuDoPainel.add(mao.indice);
      // O mesmo para o cinto: você fecha a mão NO slot para tirar a bola, e a
      // mão continua ali. Devolver só passa a valer depois que ela saiu e
      // voltou — senão tirar e guardar seriam o mesmo gesto, e a bola nunca
      // sairia do braço.
      if (!this.slotSobAMao(mao)) this.saiuDoCinto.add(mao.indice);
      const raio = this.raios.get(mao.indice);
      if (raio) raio.atualizar(dt, mao.lado === 'right', 0.9);
    }

    const direita = this.maos.find((m) => m.lado === 'right' && m.conectada);
    const qualquer = this.maos.find((m) => m.conectada);
    const mira = (direita ?? qualquer)?.mira() ?? null;
    this.escolha.atualizar(dt, mira, this.camera);
  }

  /** Quem está fora de campo se recupera devagar. */
  private regenerarTime(dt: number) {
    this.acumuladoCura += dt;
    if (this.acumuladoCura < SEGUNDOS_POR_HP) return;
    this.acumuladoCura = 0;
    for (const exemplar of this.dex.timeVivo) {
      if (this.exemplarEmCampo === exemplar && this.companheiro?.viva) continue;
      const max = this.dex.hpMaxDe(exemplar);
      if (exemplar.hp < max) this.dex.definirHp(exemplar, exemplar.hp + 1);
    }
  }

  /**
   * Carinho: encostar a mão no companheiro. Ele se vira para você, ganha um
   * pouco de vida e um pouco de experiência.
   *
   * É a interação mais barata do jogo e a que mais faz ele parecer vivo — o
   * bicho está ali, ao alcance do braço, e a primeira coisa que se quer fazer
   * com um Pokémon dentro do quarto é justamente encostar nele.
   */
  private atualizarCarinho(dt: number) {
    if (!this.temCompanheiroEmCampo) return;
    const c = this.companheiro!;
    if (c.estado === 'atacando' || c.estado === 'saindo' || c.estado === 'preso') return;

    // A mão precisa alcançar a CABEÇA, não o centro do corpo. Num Charmander
    // de trinta centímetros a diferença é o braço inteiro: mirar o centro
    // obriga a enfiar a mão dentro do bicho para ele reagir.
    const cabeca = c.pontoDaCabeca();
    // O alcance acompanha o tamanho: um Onix se afaga de longe, um Diglett não.
    const alcance = Math.max(DISTANCIA_CARINHO, c.raio * 0.9 + 0.1);

    let tocando: Mao | null = null;
    const toque = new THREE.Vector3();
    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.pontoDeToque(toque);
      if (toque.distanceTo(cabeca) <= alcance) {
        tocando = mao;
        break;
      }
    }

    if (!tocando) {
      if (this.recargaCarinho > 0) this.recargaCarinho -= dt;
      // A conta do afago seguido só vale enquanto for seguido — mas ela cai
      // devagar, para tirar a mão um instante não zerar dez segundos de mimo.
      this.tempoDeCarinho = Math.max(0, this.tempoDeCarinho - dt * 0.6);
      return;
    }

    // A pose de cafuné é contínua: ela existe enquanto a mão estiver ali. O que
    // tem carência é a RECOMPENSA — senão um encosto de dois segundos curaria o
    // bicho inteiro e o afago viraria poção.
    c.receberCarinho();
    // E a cabeça vai atrás da mão. É a diferença entre um bicho que RECEBE
    // carinho e um que responde a ele: você move a mão para o lado e o pescoço
    // acompanha, encostando na palma.
    c.seguirCarinho(toque);
    this.tempoDeCarinho += dt;

    if (this.recargaCarinho > 0) {
      this.recargaCarinho -= dt;
      // Vibração fraca e constante enquanto a mão estiver lá: é o ronronar
      // chegando pelo controle. É a única que fica fora do vocabulário de
      // `TATO` de propósito — os padrões de lá nomeiam EVENTOS, e isto é
      // textura contínua, que precisa ser fraca o bastante para não virar um
      // deles por acidente.
      if (Math.random() < dt * 6) tocando.vibrar(0.12, 18);
      return;
    }

    this.recargaCarinho = 4;
    tocando.sentir('pegou');
    audio.carinho();
    audio.grito(c.especie.id, c.shiny, c.especie.num);
    c.curar(Math.max(1, Math.ceil(c.hpMax * 0.04)));
    if (this.exemplarEmCampo) {
      this.dex.definirHp(this.exemplarEmCampo, c.hp);
      this.dex.ganharXp(this.exemplarEmCampo, 3);
    }

    const coracoes = new Impacto(cabeca, 0xff9ec4);
    this.cena.add(coracoes.pontos);
    this.impactos.push(coracoes);

    // Depois de um bom tempo de afago ele comemora — e isso é o único jeito de
    // ver a pose de comemoração fora da evolução.
    if (this.tempoDeCarinho > 10) {
      this.tempoDeCarinho = 0;
      c.comemorar();
      this.aviso.mostrar(
        [
          { texto: `${c.especie.nome} adora você`, tamanho: 36, cor: '#ff9ec4' },
          { texto: 'ele está muito feliz', tamanho: 22, cor: '#9aa5b8', peso: 500 },
        ],
        2,
      );
      return;
    }

    this.aviso.mostrar(
      [{ texto: `${c.especie.nome} gostou disso`, tamanho: 34, cor: '#ff9ec4' }],
      1.4,
    );
  }

  /**
   * O que os botões fazem.
   *
   * O gatilho e o grip já chegam como evento; A, B, X e Y não chegam de jeito
   * nenhum e precisam ser lidos do gamepad todo quadro (ver src/hands.ts). A
   * divisão segue a mão: a direita é a mão do Pokémon — mandar voltar —, e a
   * esquerda é a mão da mochila, que é onde o painel de pulso e o PC já moram.
   *
   *   A (direita)  recolhe o Pokémon para quem você estiver apontando
   *   B (direita)  fecha o PC
   *   X (esquerda) chama o Pokémon para perto de você
   *   Y (esquerda) abre e fecha o PC
   */
  private botoesDaMao(mao: Mao) {
    // A pergunta da evolução toma A e B enquanto estiver na tela: ela é modal
    // de propósito, e é curta.
    if (this.evolucaoPendente && mao.lado === 'right') {
      if (mao.apertou(BOTAO_A)) {
        this.permitirEvolucao();
        return;
      }
      if (mao.apertou(BOTAO_B)) {
        this.recusarEvolucao();
        return;
      }
    }

    if (mao.lado === 'right') {
      if (mao.apertou(BOTAO_A)) this.recolherApontando(mao);
      // B fecha o PC quando ele está aberto, e abre a mochila quando não está.
      // O botão já era o "fechar isto" da mão direita; a mochila entra no mesmo
      // lugar em vez de gastar o único botão que ainda estava livre em outro
      // jogo — são 21 comandos, e o playtest já mostrou que é mais do que se
      // guarda de cabeça.
      if (mao.apertou(BOTAO_B)) {
        if (this.pc.aberto) {
          this.pc.fechar();
          audio.clique();
        } else {
          this.alternarMochila();
        }
      }
      return;
    }

    if (mao.lado === 'left') {
      if (mao.apertou(BOTAO_B)) this.alternarPc();
      if (mao.apertou(BOTAO_A)) this.chamarParaPerto(mao);
    }
  }

  /**
   * Botão A apontando para o seu Pokémon: ele volta para a bola.
   *
   * Exigir mira é o que dá o gesto — você levanta a bola na direção dele, como
   * no desenho — mas a tolerância é generosa de propósito: quem está com a
   * bola na mão e aperta A quer recolher, e ser recusado porque o raio passou
   * a dez centímetros do ombro dele seria só teimosia.
   */
  private recolherApontando(mao: Mao) {
    if (!this.temCompanheiroEmCampo) {
      this.recusar(mao, 'nenhum Pokémon em campo', 'não há quem recolher');
      return;
    }

    const c = this.companheiro!;
    const { origem, direcao } = mao.mira();
    const paraEle = c.centro.clone().sub(origem);
    const aoLongo = paraEle.dot(direcao);
    // Atrás da mão não conta: apontar para trás não é apontar para ele.
    const desvio =
      aoLongo <= 0 ? Infinity : paraEle.clone().addScaledVector(direcao, -aoLongo).length();

    if (desvio > c.raio + 0.35) {
      audio.recusa();
      mao.sentir('marcou');
      this.aviso.mostrar(
        [
          { texto: 'aponte para ele', tamanho: 34, cor: '#ffd78a' },
          { texto: 'e aperte A de novo para recolher', tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    // Com a bola dele na mão, é ela que faz o feixe — e some junto. Sem ela, o
    // recolhimento acontece igual: o gesto é a mira, não o objeto.
    const bola = this.bolaNaMao.get(mao.indice);
    if (bola) {
      this.bolaNaMao.delete(mao.indice);
      this.bolaDeInvocacao.delete(mao.indice);
      mao.segurando = false;
      bola.descartar(this.cena);
      const i = this.bolas.indexOf(bola);
      if (i !== -1) this.bolas.splice(i, 1);
    }

    const brilho = new Impacto(c.centro, TIPOS[c.especie.tipo].cor);
    this.cena.add(brilho.pontos);
    this.impactos.push(brilho);

    mao.sentir('acertou');
    audio.grito(c.especie.id, c.shiny, c.especie.num);
    this.recolherCompanheiro();
  }

  /** Botão X: ele larga o que está fazendo e vem até você. */
  /**
   * A resposta a um gesto que não pôde acontecer — item 1.1 do roteiro.
   *
   * A vibração é sempre, e é o essencial: ela chega sem ocupar a visão, e é o
   * que separa *"o sistema não me ouviu"* de *"o sistema me ouviu e recusou"* —
   * que em VR, sem cursor e sem log, eram indistinguíveis. O padrão `recusado`
   * é o único de duas batidas justamente para não ser confundido com nenhum
   * "sim" de olhos fechados (ver `TATO`, em src/hands.ts).
   *
   * Som e cartaz são opcionais porque nem toda recusa merece os três. O gatilho
   * durante a recarga acontece dezenas de vezes por briga: um cartaz ali vira
   * poluição e um som vira irritação, mas a mão precisa saber. Já "não há
   * ninguém em campo" acontece uma vez e vale explicar.
   */
  private recusar(mao: Mao, titulo?: string, dica?: string) {
    mao.sentir('recusado');
    if (!titulo) return;

    audio.recusa();
    const linhas: LinhaTexto[] = [{ texto: titulo, tamanho: 34, cor: '#ffd78a' }];
    if (dica) linhas.push({ texto: dica, tamanho: 22, cor: '#9aa5b8', peso: 500 });
    this.aviso.mostrar(linhas, 2);
  }

  private chamarParaPerto(mao: Mao) {
    if (!this.temCompanheiroEmCampo) {
      this.recusar(mao, 'nenhum Pokémon em campo', 'gire o pulso esquerdo e pegue a bola de um deles');
      return;
    }
    const c = this.companheiro!;
    c.cancelarComando();
    c.chamarPara(this.posicaoJogador);
    c.acenar();
    audio.comando();
    audio.grito(c.especie.id, c.shiny, c.especie.num);
    mao.sentir('pegou');
    this.aviso.mostrar(
      [{ texto: `${c.especie.nome} está vindo`, tamanho: 34, cor: '#cfe6ff' }],
      1.4,
    );
  }

  private alternarPc() {
    if (this.pc.aberto) {
      this.pc.fechar();
      audio.clique();
      return;
    }
    this.pc.abrir(this.camera);
    audio.abrirPainel();
    this.aviso.mostrar(
      [
        { texto: 'PC ligado', tamanho: 40, cor: '#9fe0ff' },
        {
          texto: 'aponte e puxe o gatilho para pegar, aponte a vaga e puxe de novo',
          tamanho: 21,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      3,
    );
  }

  /**
   * Com hand tracking não há grip nenhum, e o jogo inteiro depende dele para
   * pegar e arremessar a bola. Fechar o punho faz as vezes: a borda vira o
   * mesmo par de chamadas que o botão faria.
   */
  private sinaisDaMaoNua(mao: Mao) {
    if (!mao.semControle) return;
    const mudou = mao.lerPunhoFechado();
    if (mudou === 'fechou') this.pegarBola(mao);
    else if (mudou === 'abriu') this.arremessarBola(mao);
  }

  /**
   * Um quadro para o medidor. Chamado por main.ts DEPOIS do render.
   *
   * Fica fora de `atualizar` por causa da ordem: o que interessa é o custo do
   * quadro inteiro, desenho incluído, e `renderer.info.render.calls` só vale
   * depois que o desenho aconteceu. Medido de dentro de `atualizar`, o medidor
   * mediria tudo menos a parte cara.
   */
  medir(dt: number, chamadas: number) {
    this.medidor.definirVisivel(this.ajustes.contadorDeQuadros);
    if (!this.ajustes.contadorDeQuadros) return;
    this.medidor.atualizar(dt, chamadas);
  }

  /**
   * A mochila, e os pontos de mão que ela usa para saber o que está sob a mão.
   *
   * Separada de `atualizarMaos` porque aquele método volta cedo no modo plano,
   * e a mochila ainda precisa animar o fechamento mesmo sem mão nenhuma em
   * cena — senão ela fica congelada meio aberta na tela para sempre.
   */
  /**
   * O ouvinte do áudio segue a cabeça — item 2.4 do roteiro.
   *
   * Sem isto o som posicional não vale nada: o panner calcula a direção em
   * relação ao ouvinte, e um ouvinte parado na origem faria tudo soar como se
   * você nunca tivesse saído de onde a sessão começou.
   */
  /**
   * Os itens em cima dos móveis, e a mão que os pega — item 3.2 do roteiro.
   *
   * Pegar é com a MÃO, não com a mira: o item está em cima da sua mesa de
   * verdade, ao alcance do braço, e apontar para uma coisa que está a um palmo
   * de você seria o gesto errado — o mesmo motivo pelo qual a mochila e o cinto
   * também se agarram.
   */
  private atualizarAchados(dt: number) {
    this.achados.atualizar(dt, this.sala, this.posicaoJogador);
    if (!this.achados.tipoNaSala) return;

    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      const tipo = this.achados.colher(this.pontoDeAgarre(mao));
      if (!tipo) continue;

      this.dex.ganharItem(tipo.id, 1);
      mao.sentir('pegou');
      audio.tilintar();
      const onde = this.posicaoJogador;
      audio.de(onde.x, onde.y, onde.z, () => audio.sucesso());
      this.aviso.mostrar(
        [
          {
            texto: `achou ${tipo.nome}`,
            tamanho: 36,
            cor: `#${new THREE.Color(tipo.cor).getHexString()}`,
          },
          ...(this.dex.primeiraVez('achado')
            ? [
                {
                  texto: 'coisas aparecem pela casa — vale andar por aí',
                  tamanho: 21,
                  cor: '#9aa5b8',
                  peso: 500,
                },
              ]
            : []),
        ],
        2.4,
      );
      return;
    }
  }

  /**
   * O modo sentado, e a pergunta que ele faz sozinho — itens 4.1 e 4.2.
   *
   * O 4.1 é o interruptor: um fator que encolhe todas as distâncias pessoais
   * (ver `Pokemon.escalaPessoal`) e o alcance de spawn.
   *
   * O 4.2 é isto aqui: o jogo REPARA. A altura dos olhos de quem está sentado
   * fica uns quarenta centímetros abaixo da de quem está de pé, e o headset
   * sabe essa altura a cada quadro. Depois de meio minuto consistentemente
   * baixo, o jogo pergunta — uma vez, e nunca mais.
   *
   * Pergunta, e não liga sozinho. Um jogo que muda as próprias distâncias sem
   * avisar é um jogo que parece quebrado: o bicho começa a parar mais perto e
   * ninguém sabe por quê. E quem está deitado no chão brincando de propósito
   * não quer que nada mude.
   */
  private atualizarPostura(dt: number) {
    Pokemon.escalaPessoal = this.ajustes.modoSentado ? 0.62 : 1;

    if (this.ajustes.modoSentado || this.modoPlano) return;

    // A altura sai do CHÃO mapeado, não do zero da sessão: uma casa com
    // degrau, ou uma origem de sessão calibrada em pé, faria a conta mentir.
    const olhos = this.posicaoJogador.y - this.sala.pisoY;
    const baixo = olhos > 0.4 && olhos < 1.25;
    this.tempoSentado = baixo ? this.tempoSentado + dt : 0;

    if (this.tempoSentado < 30) return;
    this.tempoSentado = -Infinity;
    if (!this.dex.primeiraVez('sugerir-sentado')) return;

    this.aviso.mostrar(
      [
        { texto: 'jogando sentado?', tamanho: 36, cor: '#cfe6ff' },
        {
          texto: 'na engrenagem, "Modo sentado" traz tudo para perto do seu alcance',
          tamanho: 21,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      4.5,
    );
    for (const mao of this.maos) mao.sentir('marcou');
  }

  private atualizarOuvinte() {
    this.camera.getWorldPosition(_ouvintePos);
    this.camera.getWorldDirection(_ouvinteFrente);
    _ouvinteCima.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(_ouvinteGiro));
    audio.ouvirDe(_ouvintePos, _ouvinteFrente, _ouvinteCima);
  }

  private atualizarMochila(dt: number) {
    const pontos: THREE.Vector3[] = [];
    if (!this.modoPlano) {
      for (const mao of this.maos) if (mao.conectada) pontos.push(this.pontoDoDedo(mao));
    }
    this.mochila.atualizar(dt, pontos, (id) => this.dex.item(id));
  }

  private atualizarMaos(dt: number, agora: number) {
    if (this.modoPlano) {
      const bola = this.bolaNaMao.get(99);
      // A mão da tela fecha em volta da bola enquanto o botão está apertado.
      this.luvaPlana?.definirDedos(bola ? 1 : 0.05, bola ? 1 : 0, dt);
      if (bola) {
        this.carregando += dt;
        const alvo = new THREE.Vector3(0.16, -0.12, -0.3).applyMatrix4(this.camera.matrixWorld);
        bola.raiz.position.lerp(alvo, Math.min(1, dt * 20));
        bola.raiz.scale.setScalar(1 + Math.min(1, this.carregando / 1.1) * 0.3);
      }
      return;
    }

    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.amostrar(agora);
      mao.amostrarBotoes();
      mao.atualizarLuva(dt, this.ajustes.maoRecuada ? 0.02 : 0);
      this.sinaisDaMaoNua(mao);
      this.botoesDaMao(mao);

      const bola = this.bolaNaMao.get(mao.indice);
      const mira = this.miras.get(mao.indice);

      if (bola) {
        const alvo = new THREE.Vector3(0, 0.01, -0.055).applyMatrix4(mao.punho.matrixWorld);
        bola.raiz.position.copy(alvo);
        if (mira) mira.atualizar(alvo, mao.velocidadeArremesso(agora), this.sala.pisoY, dt);
      } else if (mira) {
        mira.atualizar(mao.posicaoMundo(), new THREE.Vector3(), this.sala.pisoY, dt);
      }

      // O raio de mira aparece na mão livre quando há um painel aberto.
      const raio = this.raios.get(mao.indice);
      if (raio) {
        const apontandoTime = this.painelTime.aberto && mao.lado === 'right';
        // Na Pokédex quem aponta é a mão LIVRE: a outra está segurando o tablet,
        // e qual delas é isso muda conforme com qual você o pegou.
        const apontandoDex = this.painelDex.aberto && this.tablet.naMaoDe !== mao.indice;
        raio.atualizar(dt, apontandoTime || apontandoDex, 0.6);
      }

      this.atualizarFeixe(mao, dt, agora);

      // Analógico da direita: vira página da Pokédex quando ela está aberta, e
      // troca de bola quando não está. Um passo por inclinada — só volta a valer
      // depois que o stick passa pelo centro.
      if (mao.lado === 'right') {
        const x = mao.analogicoX();
        if (this.analogicoNeutro && Math.abs(x) > 0.7) {
          this.analogicoNeutro = false;
          if (this.painelDex.aberto) {
            this.painelDex.virarPagina(x > 0 ? 1 : -1);
            audio.clique();
            mao.sentir('marcou');
          } else {
            const id = this.dex.cicloBola(x > 0 ? 1 : -1);
            const tipo = bolaPorId(id);
            if (tipo) {
              audio.clique();
              mao.sentir('pegou');
              this.aviso.mostrar(
                [
                  {
                    texto: tipo.nome,
                    tamanho: 38,
                    cor: `#${new THREE.Color(tipo.corTopo).getHexString()}`,
                  },
                  { texto: `${this.dex.bolas(id)} na mochila`, tamanho: 24, cor: '#9aa5b8', peso: 500 },
                ],
                1.4,
              );
            }
          }
        } else if (Math.abs(x) < 0.3) {
          this.analogicoNeutro = true;
        }
      }

      if (!this.pulsoAnexado && mao.lado === 'left') {
        mao.punho.add(this.painelPulso.grupo);
        this.pulsoAnexado = true;
      }

      // Um cinto por antebraço, criado quando aquele punho aparece. Um controle
      // sem lado declarado (`none`) não ganha cinto: sem saber o lado, o cinto
      // sairia espelhado e as bolas ficariam do lado de dentro do braço.
      const lado = mao.lado;
      if ((lado === 'left' || lado === 'right') && !this.cintos.has(lado)) {
        const cinto = new Cinto(lado);
        mao.punho.add(cinto.grupo);
        this.cintos.set(lado, cinto);
      }
    }
  }

  private atualizarPaineis(dt: number) {
    const esquerda = this.maos.find((m) => m.lado === 'left' && m.conectada);
    const direita = this.maos.find((m) => m.lado === 'right' && m.conectada);

    // --- os cintos, um em cada antebraço ---
    //
    // Dois, desde 18/09. O cinto morava só no antebraço esquerdo, e como a mão
    // que CARREGA o cinto não alcança o próprio braço, só a direita podia tirar
    // uma bola: quem prefere arremessar com a esquerda não tinha de onde pegar.
    // Agora cada braço tem o seu, e quem pega é sempre a mão oposta — como num
    // braço de verdade.
    //
    // O estoque é O MESMO nos dois: é uma mochila, não duas. Tirar a última
    // Bola Comum pelo braço direito esvazia o slot do esquerdo no mesmo quadro,
    // porque os dois perguntam a mesma coisa à Dex.
    for (const [lado, cinto] of this.cintos) {
      cinto.definirEstoque((id: string) => this.dex.bolas(id));
      // Quem destaca é a mão que VEM PEGAR, e ela é sempre a do outro braço.
      const quemPega = lado === 'left' ? direita : esquerda;
      cinto.destacar(quemPega && !this.maoCheia(quemPega) ? this.pontoDeAgarre(quemPega) : null);
      cinto.atualizar(dt);
    }

    // --- painel do time, na mão esquerda ---
    // Uma vaga vazia vira uma ENTRADA vazia, e não some da lista: o painel
    // precisa desenhar o buraco, senão as cartas de baixo sobem e a ordem do
    // time — que agora é sua escolha — se desfaz sozinha na tela.
    const entradas = this.dex.time.map((exemplar) => {
      if (!exemplar) return null;
      const especie = porId(exemplar.id)!;
      const emCampo = this.exemplarEmCampo === exemplar && this.companheiro?.viva === true;
      return {
        exemplar,
        especie,
        // Em campo, o HP que vale é o do corpo vivo.
        hp: emCampo ? this.companheiro!.hp : exemplar.hp,
        hpMax: this.dex.hpMaxDe(exemplar),
        nivel: this.dex.nivelDe(exemplar),
        progresso: this.dex.progressoNivel(exemplar),
        shiny: exemplar.shiny,
        emCampo,
        estagios: emCampo ? this.companheiro!.estagios : undefined,
      };
    });
    // As bolas NÃO vão mais para o painel: elas são objetos no antebraço
    // esquerdo (src/cinto.ts), e a mesma bola em dois lugares seria duas
    // verdades sobre quantas você tem. A lista vazia apaga a fileira sem mexer
    // no painel, que continua sabendo desenhá-la se um dia ela voltar.
    const bolas: { tipo: TipoBola; quantidade: number }[] = [];
    // As pedras só ocupam carta depois de você achar uma: ver `guardado` em
    // src/itens.ts. Os três básicos ficam sempre à vista, zerados inclusive,
    // porque "0 poções" é informação e uma pedra que nunca caiu não é falta.
    const itens = ITENS.map((tipo) => ({ tipo, quantidade: this.dex.item(tipo.id) })).filter(
      (i) => !i.tipo.guardado || i.quantidade > 0,
    );
    this.painelTime.definirConteudo(
      entradas,
      bolas,
      itens,
      this.golpesDoCampo(),
      this.ajustes.modo,
      this.ajustes.dificuldade,
      INTERRUPTORES.map((c) => ({
        id: c.id,
        nome: c.nome,
        ligado: this.ajustes.ligado(c.id),
        diz: this.ajustes.ligado(c.id) ? c.ligadoDiz : c.desligadoDiz,
      })),
    );

    const estavaAberto = this.painelTime.aberto;
    this.painelTime.atualizar(
      dt,
      esquerda?.punho ?? null,
      direita ? direita.mira() : null,
      this.dex.bolaAtiva,
      this.camera,
      {
        vistas: this.dex.especiesVistas,
        capturadas: this.dex.especiesCapturadas,
        total: this.dex.totalEspecies,
      },
      // A mão direita acende a carta que ela está tocando, antes da mira. É o
      // que torna "vá lá e pegue" um gesto de verdade: a carta certa acende
      // enquanto o braço chega, e o GRIP pega aquela mesma.
      direita ? this.pontoDoDedo(direita) : null,
      Jogo.ALCANCE_PAINEL,
    );
    if (this.painelTime.aberto && !estavaAberto) audio.abrirPainel();
    if (this.painelTime.mudouDestaque) {
      this.painelTime.mudouDestaque = false;
      audio.clique();
    }

    // --- Pokédex, na mão direita ---
    // Montar o mapa das 151 custa pouco, mas custa todo quadro, e na maior
    // parte do tempo a Pokédex está fechada. `aberto` é o estado do quadro
    // anterior; um quadro de atraso ao abrir ninguém enxerga.
    if (this.painelDex.aberto) {
      const estados = new Map<string, EstadoDex>();
      for (const especie of ESPECIES) {
        const reg = this.dex.de(especie.id);
        if (!reg) continue;
        estados.set(especie.id, {
          visto: reg.vistos > 0,
          capturado: reg.capturados > 0,
          viuShiny: reg.viuShiny,
        });
      }
      this.painelDex.definirEstados(estados);
    }

    // A carcaça primeiro: é ela que diz onde a tela está e se ela está ligada.
    const quemSegura =
      this.tablet.naMaoDe === null
        ? null
        : (this.maos.find((m) => m.indice === this.tablet.naMaoDe) ?? null);
    this.tablet.atualizar(dt, this.camera, quemSegura?.punho ?? null);

    // Quem aponta na Pokédex é a mão LIVRE — a outra está segurando o tablet.
    const livre = this.maos.find(
      (m) => m.conectada && m.indice !== this.tablet.naMaoDe,
    );
    const dexEstavaAberta = this.painelDex.aberto;
    this.painelDex.atualizar(
      dt,
      this.tablet.naMaoDe !== null,
      this.tablet.naMaoDe !== null && livre ? livre.mira() : null,
    );
    if (this.painelDex.aberto && !dexEstavaAberta) audio.abrirPainel();
    if (this.painelDex.mudouDestaque) {
      this.painelDex.mudouDestaque = false;
      audio.clique();
    }
    // Fechou a Pokédex no meio de uma ficha falada: a voz para junto. Ouvir uma
    // descrição de Pikachu com a Pokédex já guardada é o tipo de coisa que faz
    // parecer que o jogo travou.
    if (!this.painelDex.aberto && dexEstavaAberta) calar();

    // --- PC, ancorado no quarto ---
    // Ele aceita as duas mãos: é um painel grande, à frente do corpo, e obrigar
    // a apontar com uma mão específica num móvel desses não teria por quê.
    // As miras só são montadas com o PC aberto: fechado ele é a maior parte do
    // tempo, e `mira()` aloca dois vetores por mão por quadro.
    const mirasDoPc = !this.pc.aberto
      ? []
      : this.modoPlano
        ? [this.miraDaCamera()]
        : this.maos.filter((m) => m.conectada).map((m) => m.mira());
    this.pc.atualizar(dt, mirasDoPc, this.camera);
    if (this.pc.mudouDestaque) {
      this.pc.mudouDestaque = false;
      audio.clique();
    }
  }

  private atualizarSelvagens(dt: number) {
    let algumEmBatalha = false;
    for (const selvagem of [...this.selvagens]) {
      const { pokemon, barra } = selvagem;
      pokemon.atualizar(dt, this.posicaoJogador, this.sala);

      const emBatalha =
        this.temCompanheiroEmCampo &&
        pokemon.raiz.position.distanceTo(this.companheiro!.raiz.position) < ALCANCE_BATALHA;
      if (emBatalha) algumEmBatalha = true;
      const mostrar =
        (pokemon.estado === 'atento' || emBatalha || pokemon.hpFracao < 1) &&
        pokemon.raiz.scale.x > 0.6 &&
        pokemon.estado !== 'preso';

      // A contagem até o próximo golpe dele. É o que transforma apanhar numa
      // coisa prevista: dá para ver o nome do golpe e a barra enchendo, e
      // decidir se troca de Pokémon, se usa poção ou se ataca antes.
      const carga: Carga | null =
        this.ajustes.avisoDeGolpe && selvagem.golpe && selvagem.restante > 0
          ? {
              fracao: 1 - selvagem.restante / Math.max(0.001, selvagem.ciclo),
              golpe: selvagem.golpe.nome,
              cor: TIPOS[selvagem.golpe.tipo].cor,
              iminente: selvagem.restante <= selvagem.aviso,
            }
          : null;

      barra.atualizar(
        dt,
        mostrar,
        pokemon.hp,
        pokemon.hpMax,
        pokemon.raiz.position,
        pokemon.altura,
        this.camera,
        pokemon.desmaiado ? `N${pokemon.nivel} · exausto` : `N${pokemon.nivel}`,
        carga,
        pokemon.perfilDaCondicao,
      );

      // Exausto: fica um tempo no chão, fácil de capturar, e some se você
      // demorar. É a janela que a batalha abriu para você.
      if (pokemon.estado === 'desmaiado') {
        pokemon.alarme = 0;
        if (pokemon.tempoNoEstado > 9) pokemon.dissolver();
      }

      // Ficou para trás enquanto você caminhava: vai embora e abre vaga para
      // alguém nascer à frente. Sem isto, andar pela casa encheria a memória do
      // headset de bichos parados em cômodos que você já deixou — e o teto de
      // três impediria qualquer encontro novo. Quem está vindo pela isca ou
      // brigando fica, custe o que custar.
      const longe =
        pokemon.raiz.position.distanceTo(this.posicaoJogador) > DISTANCIA_DE_SUMICO;
      if (longe && !pokemon.atraido && !emBatalha && pokemon.estado !== 'preso') {
        pokemon.dissolver();
      }

      if (!pokemon.viva) {
        if (pokemon.estado === 'saindo') audio.fugiu();
        this.removerSelvagem(pokemon);
      }
    }

    // A trilha entra quando o primeiro selvagem chega no alcance do seu Pokémon
    // e sai quando o último some. É a fronteira certa: ter bicho na sala não é
    // briga — briga é quando os dois estão perto o bastante para se baterem.
    if (algumEmBatalha) audio.batalhaComecou();
    else audio.batalhaAcabou();
  }

  private atualizarCompanheiro(dt: number) {
    if (!this.companheiro) return;
    const c = this.companheiro;
    // Enquanto a evolução roda, quem escreve na escala do corpo é o efeito:
    // deixar a animação normal rodar junto desfaria o estica-e-encolhe a cada
    // quadro, porque ela reescreve `corpo.scale` inteiro.
    if (!this.evolucaoEmCurso) c.atualizar(dt, this.posicaoJogador, this.sala);
    c.alvo = this.alvoDoCompanheiro();

    // O HP do corpo vivo só era gravado ao recolher ou ao desmaiar. Numa sessão
    // que CAI não há nem um nem outro: a luta inteira era esquecida, e ele
    // voltava com a vida de antes dela. Gravar de dez em dez segundos custa uma
    // escrita e fecha essa janela.
    this.salvarHpEmCampo -= dt;
    if (this.salvarHpEmCampo <= 0) {
      this.salvarHpEmCampo = 10;
      if (this.exemplarEmCampo && c.viva && !c.desmaiado) {
        this.dex.definirHp(this.exemplarEmCampo, c.hp);
      }
    }

    if (this.barraCompanheiro) {
      const nivel = this.exemplarEmCampo ? this.dex.nivelDe(this.exemplarEmCampo) : c.nivel;
      this.barraCompanheiro.atualizar(
        dt,
        c.raiz.scale.x > 0.5 && c.estado !== 'saindo',
        c.hp,
        c.hpMax,
        c.raiz.position,
        c.altura,
        this.camera,
        c.desmaiado ? `N${nivel} · desmaiado` : `N${nivel} · seu`,
      );
    }

    // Desmaiou em campo: volta para a bola sozinho.
    if (c.desmaiado && c.estado === 'desmaiado' && c.viva) {
      if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, 0);
      c.dissolver();
    }

    if (!c.viva) {
      if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, c.hp);
      this.removerCompanheiro();
    }
  }

  private removerCompanheiro() {
    if (!this.companheiro) return;
    // A pergunta era sobre este corpo. Sem ele em campo, ela não faz sentido.
    this.evolucaoPendente = null;
    this.promptEvolucao.esconder();
    this.companheiro.descartar(this.cena);
    // Sem isto, a XP do próximo selvagem iria para quem já voltou à bola.
    this.exemplarEmCampo = null;
    this.dex.marcarEmCampo(null);
    if (this.barraCompanheiro) {
      this.cena.remove(this.barraCompanheiro.placa.malha);
      this.barraCompanheiro.descartar();
      this.barraCompanheiro = null;
    }
    this.companheiro = null;
  }

  private atualizarBolas(dt: number) {
    for (const bola of [...this.bolas]) {
      const anterior = bola.posicao.clone();
      bola.atualizar(dt);

      // Bola de invocação: abre ao tocar o chão ou após um tempo no ar.
      const exemplar = bola.raiz.userData.invocar as Exemplar | undefined;
      if (exemplar && bola.estado === 'voando' && bola.velocidade.lengthSq() < 0.6) {
        bola.raiz.userData.invocar = undefined;
        void this.invocarNaBola(bola, exemplar);
      }

      if (bola.estado === 'voando' && !exemplar) this.testarAcerto(bola, anterior);

      if (bola.resultado === 'capturou') {
        bola.resultado = null;
        const presa = bola.presa;
        if (presa) {
          this.concluirCaptura(presa);
          bola.presa = null;
        }
      } else if (bola.resultado === 'escapou') {
        bola.resultado = null;
        const presa = bola.presa;
        if (presa) {
          presa.raiz.visible = true;
          const fuga = bola.posicao.clone();
          fuga.x += (Math.random() * 2 - 1) * 0.5;
          fuga.z += (Math.random() * 2 - 1) * 0.5;
          presa.reaparecer(fuga);
          this.aviso.mostrar(
            [
              { texto: 'escapou!', tamanho: 48, cor: '#ffb1b1' },
              { texto: 'enfraqueça ele um pouco mais', tamanho: 24, cor: '#9aa5b8', peso: 500 },
            ],
            2.2,
          );
          bola.presa = null;
        }
      } else if (bola.resultado === 'soltou') {
        bola.resultado = null;
        bola.presa = null;
      }

      if (bola.acabou) {
        bola.descartar(this.cena);
        this.bolas.splice(this.bolas.indexOf(bola), 1);
      }
    }
  }

  private concluirCaptura(presa: Pokemon) {
    // A experiência entra antes do registro: quem capturou foi quem estava em
    // campo, e é ele que sobe de nível.
    this.premiarXp(presa, true);

    const novo = this.dex.registrarCaptura(
      presa.especie.id,
      Math.max(1, presa.hp),
      presa.nivel,
      presa.shiny,
    );
    this.dex.premiarCaptura();
    // `forcar`: o bicho acabou de virar seu, e é ele quem assina o momento.
    audio.grito(presa.especie.id, presa.shiny, presa.especie.num, true);

    const primeiraVez = (this.dex.de(presa.especie.id)?.capturados ?? 0) === 1;
    const cheio = novo === null;

    this.aviso.mostrar(
      [
        {
          texto: presa.shiny
            ? `${presa.especie.nome} BRILHANTE capturado!`
            : `${presa.especie.nome} capturado!`,
          tamanho: presa.shiny ? 40 : 46,
          cor: presa.shiny ? '#ffd76a' : '#9ff0c4',
        },
        ...(cheio
          ? [{ texto: 'sua caixa está cheia', tamanho: 23, cor: '#ff9f9f', peso: 600 }]
          : primeiraVez
            ? [
                { texto: presa.especie.descricao, tamanho: 21, cor: '#9aa5b8', peso: 400, espaco: 6 },
                { texto: 'já dá para escolher ele no painel', tamanho: 22, cor: '#ffd78a', peso: 600 },
              ]
            : []),
      ],
      primeiraVez || presa.shiny ? 5 : 2.6,
    );
    this.removerSelvagem(presa);
  }

  /** A bola pousou: abre e o Pokémon escolhido entra em campo. */
  private async invocarNaBola(bola: Pokebola, exemplar: Exemplar) {
    const especie = porId(exemplar.id);
    if (!especie) return;

    const gltf = await garantir(especie.id, exemplar.shiny);
    if (!gltf) return;

    // Só um em campo por vez.
    if (this.companheiro?.viva) {
      if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, this.companheiro.hp);
      this.removerCompanheiro();
    }

    const corpo = instanciar(especie.id, this.alturaDe(especie), exemplar.shiny, this.ajustes.tamanhoReal);
    if (!corpo) return;

    const piso = this.sala.alturaEm(bola.posicao);
    const pokemon = this.porEmCampo(especie, corpo, exemplar, bola.posicao, piso);
    bola.soltar(pokemon);
    audio.invocar();
    // A voz dele logo depois do clarao: e o quadro em que o bicho vira seu.
    // `forcar`: a entrada em campo. Sem voz, o clarão fica mudo.
    window.setTimeout(() => audio.grito(especie.id, exemplar.shiny, especie.num, true), 260);

    this.aviso.mostrar(
      [
        { texto: `${especie.nome}, eu escolho você!`, tamanho: 40, cor: corHexDe(especie) },
        { texto: 'gatilho ataca (ou acerta onde você aponta) · encoste a mão para fazer carinho', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
      3.2,
    );
  }

  /** Monta o companheiro e a barra dele. Usado ao invocar e ao evoluir. */
  /**
   * Troca o corpo de quem está em campo, mantendo quem ele é.
   *
   * Serve à troca de escala: ligar o tamanho real com um Charizard no meio da
   * sala tem de mostrar o Charizard crescer, e não um aviso pedindo para
   * recolher e soltar de novo. A vida, o nível e a posição continuam; o que
   * muda é o modelo, remontado na altura nova.
   */
  private async remontarCompanheiro() {
    if (!this.temCompanheiroEmCampo || !this.exemplarEmCampo) return;
    const antigo = this.companheiro!;
    const exemplar = this.exemplarEmCampo;
    const especie = antigo.especie;

    const posicao = antigo.raiz.position.clone();
    const piso = antigo.pisoY;
    const hp = antigo.hp;
    const giro = antigo.raiz.rotation.y;

    if (!(await garantir(especie.id, exemplar.shiny))) return;
    // A escala pode ter mudado de novo enquanto o modelo chegava.
    if (this.companheiro !== antigo) return;
    const corpo = instanciar(especie.id, this.alturaDe(especie), exemplar.shiny, this.ajustes.tamanhoReal);
    if (!corpo) return;

    this.dex.definirHp(exemplar, hp);
    this.removerCompanheiro();
    const novo = this.porEmCampo(especie, corpo, exemplar, posicao, piso);
    novo.raiz.rotation.y = giro;
    novo.hp = Math.max(1, Math.min(hp, novo.hpMax));
  }

  private porEmCampo(
    especie: Especie,
    corpo: Corpo,
    exemplar: Exemplar,
    posicao: THREE.Vector3,
    piso: number,
  ): Pokemon {
    const nivel = this.dex.nivelDe(exemplar);
    const pokemon = new Pokemon(
      especie,
      corpo,
      posicao,
      piso,
      'companheiro',
      nivel,
      exemplar.shiny,
    );
    pokemon.hp = Math.max(1, Math.min(exemplar.hp, pokemon.hpMax));
    pokemon.raiz.visible = false;
    this.cena.add(pokemon.raiz);
    this.companheiro = pokemon;
    this.exemplarEmCampo = exemplar;
    // Para a sessão seguinte saber que ele estava fora da bola.
    this.dex.marcarEmCampo(exemplar);

    this.barraCompanheiro = new BarraVida(
      exemplar.shiny ? `✦ ${especie.nome}` : especie.nome,
      textoTipos(especie),
      TIPOS[especie.tipo].cor,
    );
    this.cena.add(this.barraCompanheiro.placa.malha);

    pokemon.invocar(posicao, piso);

    // A outra hora de conferir a evolução. Sem isto, um Pokémon capturado já
    // acima do nível dela nunca evoluía: ele não sobe de nível na sua mão, e
    // subir de nível era o único gatilho que existia.
    this.conferirEvolucao(exemplar);

    return pokemon;
  }

  private testarAcerto(bola: Pokebola, anterior: THREE.Vector3) {
    for (const { pokemon } of this.selvagens) {
      if (pokemon.estado === 'preso' || pokemon.estado === 'saindo' || !pokemon.viva) continue;

      const alvo = pokemon.centro;
      const dist = distanciaAoSegmento(alvo, anterior, bola.posicao);
      const alcance = pokemon.raio + bola.raio;

      if (dist <= alcance) {
        const precisao = THREE.MathUtils.clamp(1 - dist / alcance, 0, 1);
        const multiplicador = (bola.raiz.userData.multiplicador as number) ?? 1;
        bola.capturar(pokemon, precisao, multiplicador);
        // A fruta valia para uma bola só, e essa bola já foi.
        this.bonusFruta = 0;
        for (const mao of this.maos) mao.sentir('acertou');
        return;
      }
      if (dist <= alcance + 0.28) pokemon.assustar(0.28);
    }
  }

  private atualizarEfeitos(dt: number) {
    for (const efeito of [...this.efeitos]) {
      efeito.atualizar(dt);
      if (efeito.terminou) {
        efeito.descartar(this.cena);
        this.efeitos.splice(this.efeitos.indexOf(efeito), 1);
      }
    }
    for (const impacto of [...this.impactos]) {
      impacto.atualizar(dt);
      if (impacto.terminou) {
        impacto.descartar(this.cena);
        this.impactos.splice(this.impactos.indexOf(impacto), 1);
      }
    }
    for (const numero of [...this.numeros]) {
      numero.atualizar(dt);
      if (numero.terminou) {
        numero.descartar(this.cena);
        this.numeros.splice(this.numeros.indexOf(numero), 1);
      }
    }
    for (const aura of [...this.auras]) {
      aura.atualizar(dt, 0.9);
      if (aura.terminou) {
        aura.descartar(this.cena);
        this.auras.splice(this.auras.indexOf(aura), 1);
      }
    }
    for (const assinatura of [...this.assinaturas]) {
      assinatura.atualizar(dt);
      if (assinatura.terminou) {
        assinatura.descartar(this.cena);
        this.assinaturas.splice(this.assinaturas.indexOf(assinatura), 1);
      }
    }
  }

  /** Versão do arremesso para o modo sem headset. */
  arremessoPlano(fase: 'inicio' | 'fim') {
    if (fase === 'inicio') {
      if (this.bolaNaMao.has(99)) return;
      const ativo = this.dex.exemplarAtivo;
      const vaiInvocar = !this.temCompanheiroEmCampo && ativo !== null && ativo.hp > 0;
      const tipoBola = bolaPorId(this.dex.bolaAtiva) ?? BOLA_PADRAO;
      if (!vaiInvocar && this.dex.bolas(tipoBola.id) <= 0) return;

      const especieAtiva = vaiInvocar ? porId(ativo!.id) : null;
      if (especieAtiva) void garantir(especieAtiva.id, ativo!.shiny);

      const bola = new Pokebola(
        this.sala.pisoY,
        especieAtiva ? TIPOS[especieAtiva.tipo].cor : tipoBola.corTopo,
        especieAtiva ? 0xf2f2f5 : tipoBola.corBase,
      );
      this.cena.add(bola.raiz);
      this.bolas.push(bola);
      this.bolaNaMao.set(99, bola);
      if (vaiInvocar) {
        this.bolaDeInvocacao.set(99, ativo!);
      } else {
        this.dex.gastarBola(tipoBola.id);
        bola.raiz.userData.multiplicador =
          tipoBola.multiplicador * (this.bonusFruta > 0 ? BONUS_FRUTA : 1);
        bola.raiz.userData.idBola = tipoBola.id;
      }
      this.carregando = 0;
      return;
    }

    const bola = this.bolaNaMao.get(99);
    if (!bola) return;
    this.bolaNaMao.delete(99);

    const forca = 3.2 + Math.min(1, this.carregando / 1.1) * 6.5;
    const direcao = new THREE.Vector3();
    this.camera.getWorldDirection(direcao);
    direcao.y += 0.18;
    bola.lancar(direcao.normalize().multiplyScalar(forca));

    const exemplar = this.bolaDeInvocacao.get(99);
    if (exemplar) {
      this.bolaDeInvocacao.delete(99);
      bola.raiz.userData.invocar = exemplar;
    }
    this.carregando = 0;
  }

  /** A mira do modo sem headset é o centro da tela: o olhar faz o papel da mão. */
  private miraDaCamera(): { origem: THREE.Vector3; direcao: THREE.Vector3 } {
    const origem = this.camera.getWorldPosition(new THREE.Vector3());
    const direcao = new THREE.Vector3();
    this.camera.getWorldDirection(direcao);
    return { origem, direcao };
  }

  /**
   * Atalhos do modo sem headset.
   *
   * Tudo o que existe no headset precisa existir aqui, senão a única forma de
   * ver uma animação nova é pôr o Quest na cabeça a cada alteração — e aí ela
   * não é vista.
   */
  comandoPlano(
    acao:
      | 'atacar'
      | 'proximo'
      | 'pc'
      | 'recolher'
      | 'chamar'
      | 'carinho'
      | 'gatilho'
      | 'acenar'
      | 'isca'
      | 'doce'
      | 'golpe1'
      | 'golpe2'
      | 'golpe3'
      | 'golpe4'
      | 'dificuldade'
      | 'evoluir'
      | 'naoEvoluir',
  ) {
    const mao = this.maos[0];

    switch (acao) {
      case 'golpe1':
      case 'golpe2':
      case 'golpe3':
      case 'golpe4': {
        // Sem painel de pulso na tela, os números fazem o papel dos quatro
        // cards de golpe — que é o mesmo lugar que eles ocupam num jogo de
        // Pokémon de verdade.
        if (!this.temCompanheiroEmCampo) {
          audio.recusa();
          return;
        }
        const golpe = arsenal(this.companheiro!)[Number(acao.slice(-1)) - 1];
        if (golpe) this.armarGolpe({ golpe, armado: true });
        return;
      }

      case 'dificuldade': {
        const i = DIFICULDADES.findIndex((d) => d.id === this.ajustes.dificuldade);
        this.escolherDificuldade(DIFICULDADES[(i + 1) % DIFICULDADES.length]);
        return;
      }

      case 'evoluir':
        this.permitirEvolucao();
        return;

      case 'naoEvoluir':
        this.recusarEvolucao();
        return;

      case 'isca':
      case 'doce':
        // A isca já na mão sai; senão entra. Sem painel de pulso na tela, a
        // mesma tecla precisa fazer os dois.
        if (this.itemNaMao.has(mao.indice)) this.guardarIsca(mao);
        else this.pegarIsca(mao, acao === 'doce' ? 'doce' : 'fruta');
        return;
      case 'atacar':
        this.comandarAtaque(mao);
        return;

      case 'gatilho':
        if (this.pc.aberto && this.pc.temAlvo) this.acionarPc(mao);
        else this.comandarAtaque(mao);
        return;

      case 'pc':
        this.alternarPc();
        return;

      case 'recolher': {
        if (!this.temCompanheiroEmCampo) {
          audio.recusa();
          return;
        }
        const c = this.companheiro!;
        const brilho = new Impacto(c.centro, TIPOS[c.especie.tipo].cor);
        this.cena.add(brilho.pontos);
        this.impactos.push(brilho);
        audio.grito(c.especie.id, c.shiny, c.especie.num);
        this.recolherCompanheiro();
        return;
      }

      case 'chamar':
        this.chamarParaPerto(mao);
        return;

      case 'acenar':
        if (this.temCompanheiroEmCampo) {
          this.companheiro!.acenar();
          audio.grito(
            this.companheiro!.especie.id,
            this.companheiro!.shiny,
            this.companheiro!.especie.num,
          );
        }
        return;

      case 'carinho': {
        if (!this.temCompanheiroEmCampo) return;
        const c = this.companheiro!;
        c.receberCarinho();
        if (this.recargaCarinho <= 0) {
          this.recargaCarinho = 4;
          audio.carinho();
          audio.grito(c.especie.id, c.shiny, c.especie.num);
          c.curar(Math.max(1, Math.ceil(c.hpMax * 0.04)));
          const coracoes = new Impacto(c.pontoDaCabeca(), 0xff9ec4);
          this.cena.add(coracoes.pontos);
          this.impactos.push(coracoes);
        }
        return;
      }

      default: {
        const time = this.dex.timeVivo;
        if (time.length === 0) return;
        const atual = time.findIndex((e) => e === this.dex.exemplarAtivo);
        this.escolherDoTime(time[(atual + 1) % time.length]);
      }
    }
  }

  /** Versão do comando "vá até ali" para o modo sem headset. */
  marcarPlano(fase: 'inicio' | 'fim') {
    if (fase === 'inicio') {
      this.gatilhoPreso = { mao: this.maos[0], desde: performance.now() - 400, comandou: false };
      return;
    }
    const preso = this.gatilhoPreso;
    this.gatilhoPreso = null;
    if (preso?.comandou && this.pontoMarcado && this.temCompanheiroEmCampo) {
      this.companheiro!.irPara(this.pontoMarcado.clone());
      audio.comando();
    }
    this.pontoMarcado = null;
  }

  /**
   * Devolve a campo quem estava lá quando a sessão caiu.
   *
   * Sem clarão e sem bola: ele não está sendo invocado agora, ele JÁ ESTAVA
   * aqui — a cerimônia de invocação contaria uma mentira sobre o que
   * aconteceu. Aparece ao seu lado, como quem esteve esperando.
   *
   * Um bicho desmaiado não volta: ele já tinha voltado para a bola sozinho, e
   * trazê-lo de volta caído seria ressuscitar um estado que o jogo encerrou.
   */
  private async restaurarCampo() {
    if (this.temCompanheiroEmCampo) return;
    const exemplar = this.dex.exemplarEmCampoSalvo;
    if (!exemplar || exemplar.hp <= 0) return;
    const especie = porId(exemplar.id);
    if (!especie) return;

    if (!(await garantir(especie.id, exemplar.shiny))) return;
    // A sessão pode ter avançado enquanto o modelo chegava: se alguém já entrou
    // em campo nesse meio-tempo, a restauração perdeu o sentido.
    if (this.temCompanheiroEmCampo) return;
    const corpo = instanciar(
      especie.id,
      this.alturaDe(especie),
      exemplar.shiny,
      this.ajustes.tamanhoReal,
    );
    if (!corpo) return;

    // Um passo à frente e ao lado, na altura do chão daquele ponto.
    const onde = this.posicaoJogador.clone();
    onde.x += 0.55;
    onde.z -= 0.75;
    const piso = this.sala.alturaEm(onde);
    onde.y = piso;

    const pokemon = this.porEmCampo(especie, corpo, exemplar, onde, piso);
    pokemon.raiz.visible = true;
    this.aviso.mostrar(
      [
        { texto: `${especie.nome} continuava com você`, tamanho: 34, cor: '#9ff0c4' },
        { texto: 'ele esperou do lado de fora da bola', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
      2.6,
    );
  }

  aoEntrarNaSessao() {
    this.proximoSpawn = 3;
    void this.restaurarCampo();

    // O raio que mede o chão sob os seus pés só pode ser pedido com a sessão
    // aberta. É ele que faz o mapa crescer enquanto você caminha pela casa.
    void this.sala.prepararSondagem(this.renderer.xr.getSession());

    // Os ajustes salvos valem desde o primeiro quadro: o contorno da sala é o
    // único que mexe na cena e precisa ser aplicado à mão.
    if (this.ajustes.contornoDaSala !== this.sala.debugLigado) this.sala.alternarDebug();

    // As narrações dos iniciais são um MP3 de ~190 kB cada. Só dá para baixá-las
    // agora, e não no construtor: elas são decodificadas no AudioContext, e ele
    // só existe depois do gesto do usuário que abriu a sessão. Adiantar aqui
    // evita o silêncio entre puxar o gatilho na Pokédex e a voz começar — tempo
    // suficiente para achar que não funcionou e puxar de novo.
    preparar(INICIAIS.map((e) => e.id));

    this.mostrarComandos('olhe em volta');
  }

  /**
   * O cartão de comandos — item 1.3 do roteiro.
   *
   * Era uma placa de sete segundos na entrada da sessão, e só. Depois disso,
   * quem esquecesse qual botão faz o quê — e são 21 comandos — não tinha a quem
   * perguntar. Agora ela volta com as duas palmas viradas para cima; ver
   * `pedindoAjuda`, em src/gesto.ts.
   *
   * A última linha é a que faz o resto valer: ela ensina a trazer o cartão de
   * volta. Uma ajuda que não diz como ser reencontrada é uma ajuda de uma vez
   * só, que é exatamente o que havia antes.
   */
  private mostrarComandos(titulo = 'os comandos', segundos = 7) {
    this.aviso.mostrar(
      [
        { texto: titulo, tamanho: 42, cor: '#cfe6ff' },
        { texto: 'GRIP segura a pokébola · solte no movimento para arremessar', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'GATILHO toca para atacar · segure para marcar no chão até onde ele vai', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'A recolhe · B abre a mochila · X chama · Y liga o PC', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'gire os pulsos: time e Pokédex · mão às costas: a Pokédex de mão', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'as duas palmas para cima trazem este cartão de volta', tamanho: 21, cor: '#ffd78a', peso: 600, espaco: 4 },
      ],
      segundos,
    );
  }

  /**
   * O gesto de pedir ajuda, conferido por quadro.
   *
   * O tempo de espera não é enfeite: a pose acontece de passagem quando você
   * gira as duas mãos por outro motivo, e o cartão pulando na frente do jogo a
   * cada meio giro seria pior do que não existir. Meio segundo mantido é curto
   * para quem quer e longo demais para o acaso.
   *
   * A trava depois de mostrar existe pelo mesmo motivo ao contrário: o gesto
   * continua valendo enquanto você lê o cartão, e sem ela ele se remostraria
   * para sempre.
   */
  private atualizarPedidoDeAjuda(dt: number) {
    if (this.travaDaAjuda > 0) {
      this.travaDaAjuda -= dt;
      return;
    }
    // Com painel, mochila ou escolha na frente, as mãos estão fazendo outra
    // coisa — e o cartão por cima deles só atrapalharia.
    if (this.escolha || this.mochila.estaAberta || this.painelTime.aberto || this.painelDex.aberto) {
      this.pedindoAjudaHa = 0;
      return;
    }

    const esquerda = this.maos.find((m) => m.lado === 'left' && m.conectada);
    const direita = this.maos.find((m) => m.lado === 'right' && m.conectada);
    const pedindo = pedindoAjuda(esquerda?.punho ?? null, direita?.punho ?? null, this.camera);

    if (!pedindo) {
      this.pedindoAjudaHa = 0;
      return;
    }

    this.pedindoAjudaHa += dt;
    if (this.pedindoAjudaHa < 0.5) return;

    this.pedindoAjudaHa = 0;
    this.travaDaAjuda = 8;
    this.mostrarComandos('os comandos', 8);
    audio.abrirPainel();
    for (const mao of this.maos) mao.sentir('marcou');
  }

  descartar() {
    for (const { pokemon, barra } of this.selvagens) {
      pokemon.descartar(this.cena);
      barra.descartar();
    }
    this.companheiro?.descartar(this.cena);
    this.barraCompanheiro?.descartar();
    for (const bola of this.bolas) bola.descartar(this.cena);
    for (const efeito of this.efeitos) efeito.descartar(this.cena);
    for (const impacto of this.impactos) impacto.descartar(this.cena);
    for (const numero of this.numeros) numero.descartar(this.cena);
    for (const assinatura of this.assinaturas) assinatura.descartar(this.cena);
    for (const aura of this.auras) aura.descartar(this.cena);
    for (const mira of this.miras.values()) mira.descartar();
    for (const raio of this.raios.values()) raio.descartar();
    for (const feixe of this.feixes.values()) feixe.descartar();
    this.mochila.descartar();
    this.medidor.descartar();
    this.achados.descartar();
    for (const rastro of this.rastros.values()) rastro.descartar();
    for (const isca of this.itemNaMao.values()) isca.descartar();
    for (const mao of this.maos) mao.luva?.descartar();
    this.luvaPlana?.descartar();
    this.marca.descartar();
    this.marcaDeAlvo.descartar();
    this.painelPulso.descartar();
    this.painelTime.descartar();
    this.painelDex.descartar();
    for (const cinto of this.cintos.values()) cinto.descartar();
    this.tablet.descartar();
    this.pc.descartar();
    this.promptEvolucao.descartar();
    this.evolucaoEmCurso?.efeito.descartar(this.cena);
    calar();
    this.aviso.descartar();
    this.sala.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
