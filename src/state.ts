import { BOLAS, ESTOQUE_INICIAL, bolaPorId } from './balls';
import { ESTOQUE_ITENS_INICIAL, ITENS, itemPorId } from './itens';
import {
  ESPECIES_PARA_AMULETO,
  NIVEL_MAXIMO,
  TOTAL_ESPECIES,
  nivelPorXp,
  porId,
  statsNoNivel,
  xpParaNivel,
  type SorteBrilhante,
} from './species';

/** Um exemplar que é seu: o bicho, não a espécie. */
/**
 * Quanto tempo um Pokémon caído leva para se levantar sozinho, em segundos.
 *
 * ## O que estava errado
 *
 * A regeneração fora de campo é de 1 de HP a cada 2,5 s, e ela não olhava se
 * o bicho estava MACHUCADO ou CAÍDO. Um Pokémon que acabava de desmaiar
 * voltava a ter 1 de vida dois segundos e meio depois — e um de vida já basta
 * para ele voltar a campo.
 *
 * Três coisas morriam nisso, todas de uma vez:
 *
 * - **desmaiar não custava nada.** A briga que você perdeu se desfazia
 *   sozinha antes de você terminar de ler o cartaz.
 * - **o Centro Pokémon virava enfeite.** Ele existe para dar geografia ao
 *   cômodo — "você sabe onde ele fica, você VOLTA para ele, e a distância até
 *   ele é o que dá peso a continuar caçando com o time machucado". Nenhuma
 *   dessas frases sobrevive a um time que se cura sozinho em dois segundos.
 * - **o aviso de time caído piscava e sumia** antes de alguém entender o que
 *   fazer com ele.
 *
 * ## Por que um minuto, e não "nunca"
 *
 * Porque o jogo não tem beco sem saída, e esta é uma regra do projeto inteira
 * — foi por isso que as pokébolas deixaram de acabar e que os itens passaram
 * a aparecer pela casa. Quem está sem ninguém de pé tem TRÊS saídas: o Centro
 * (instantâneo), o PC (instantâneo, e é o caminho de quem joga sentado) e
 * esperar. A espera existe para nunca prender ninguém, e não para ser o plano.
 *
 * Um minuto é o tempo de atravessar o cômodo e voltar. É o bastante para a
 * decisão de ir até o Centro valer a pena, e pouco o bastante para quem não
 * quiser ir não ficar refém.
 */
export const LEVANTAR_SEGUNDOS = 60;

/**
 * Este Pokémon caído já pode se levantar sozinho?
 *
 * `caiuEm` ausente quer dizer SIM — e isso é de propósito. Uma gravação
 * anterior a este campo tem bichos com zero de vida e sem data nenhuma, e
 * tratá-los como recém-caídos prenderia o time de quem já jogava por um
 * minuto sem explicação. Na dúvida, o jogo solta.
 */
export function podeLevantar(caiuEm: number | undefined, agora: number): boolean {
  if (caiuEm === undefined) return true;
  return agora - caiuEm >= LEVANTAR_SEGUNDOS * 1000;
}

/** Quantos segundos faltam para ele se levantar. Zero quando já pode. */
export function segundosParaLevantar(caiuEm: number | undefined, agora: number): number {
  if (caiuEm === undefined) return 0;
  const falta = LEVANTAR_SEGUNDOS - (agora - caiuEm) / 1000;
  return falta > 0 ? Math.ceil(falta) : 0;
}

export interface Exemplar {
  id: string;
  xp: number;
  hp: number;
  shiny: boolean;
  capturadoEm: number;
  /**
   * Quando ele caiu, em milissegundos do relógio. Ausente = está de pé.
   *
   * Ver `LEVANTAR_SEGUNDOS`. É relógio de parede e não tempo de jogo de
   * propósito: um time que se recupera enquanto o headset está na mesa é o
   * comportamento certo — você largou o jogo, e voltar e achar todo mundo de
   * pé é acolhedor. O que não pode é levantar sozinho no meio da briga.
   */
  caiuEm?: number;
  /**
   * O nível em que você disse "agora não" para a evolução.
   *
   * Evoluir é uma escolha, e uma escolha recusada não pode virar uma pergunta a
   * cada trinta segundos. Guardando o NÍVEL da recusa, o jogo volta a perguntar
   * quando ele sobe — que é exatamente o comportamento do jogo original.
   */
  recusouEvoluirEm?: number;
  /**
   * O quanto ele gosta de você, de 0 a 1.
   *
   * Sobe com carinho — a mão encostada na cabeça — e um pouco a cada briga
   * vencida ao seu lado. É a única coisa neste jogo que só cresce porque você
   * quis: nada do laço de captura exige fazer carinho em ninguém.
   *
   * Em Pokémon a amizade é central desde a segunda geração, e aqui ela vale
   * ainda mais, porque a interação que a alimenta é a que só a realidade
   * misturada tem: você estica o braço e encosta no bicho. Ver `AFETO`, em
   * src/species.ts, para o que ele faz.
   */
  afeto?: number;
}

/** O que a Pokédex sabe de uma espécie, tenha você capturado ou não. */
export interface RegistroDex {
  vistos: number;
  capturados: number;
  primeiraCaptura: number | null;
  /** Já viu a forma brilhante desta espécie alguma vez. */
  viuShiny: boolean;
}

const CHAVE = 'critter-quest/dex/v4';

/** Quantos cabem no time que vai a campo. O resto fica guardado. */
export const TAMANHO_TIME = 6;

/**
 * A sua coleção e sua mochila, guardadas no próprio headset.
 *
 * Há duas coisas distintas aqui, e misturá-las foi o erro da versão anterior:
 * o REGISTRO (o que a Pokédex viu de cada uma das 151 espécies) e os
 * EXEMPLARES (os bichos que são seus, cada um com o seu nível e a sua vida).
 * Capturar o mesmo Caterpie três vezes dá um registro e três exemplares.
 */
export class Dex {
  private registros = new Map<string, RegistroDex>();
  /**
   * Todos os seus bichos, numa lista só: as seis primeiras posições são o TIME
   * e o resto é a caixa.
   *
   * As seis do time podem estar **vazias**, e o resto nunca. Isso é de 18/09,
   * quando o PC ganhou arrasto: tirar o terceiro do time e largá-lo na caixa
   * tem de deixar a terceira vaga vazia, não puxar o quarto para cima. Uma
   * lista que se fecha sozinha não deixa você montar um time na ordem que
   * quiser, e ordem de time é meio jogo.
   *
   * A caixa continua densa porque ela não tem ordem que importe: é um depósito,
   * e um buraco no meio dele é só uma página com um quadrado cinza.
   */
  private exemplares: Array<Exemplar | null> = [];
  private estoque = new Map<string, number>();
  private itens = new Map<string, number>();

  /** Índice em `exemplares` de quem está escolhido para ir a campo. */
  ativo = -1;
  /** Qual bola o grip vai pegar. */
  bolaAtiva = BOLAS[0].id;
  /** Falso até você escolher o inicial. */
  escolheuInicial = false;
  /**
   * A partir de quando contar a recarga das bolas, em ms de época.
   *
   * É de época (`Date.now()`) e não de `performance.now()` porque o relógio
   * precisa correr com o jogo FECHADO: voltar no dia seguinte tem de encontrar
   * o estoque cheio, e não o mesmo zero de ontem.
   */
  private recarregadoEm = Date.now();
  /**
   * Índice de quem estava EM CAMPO quando o jogo parou, ou -1.
   *
   * Existe porque uma sessão de VR não termina, ela CAI: você tira o headset, a
   * bateria acaba, o passthrough perde o rastreamento. Tudo o mais já
   * sobrevivia a isso — time, Pokédex, mochila —, mas o companheiro que estava
   * fora da bola não: ao voltar, a sala estava vazia e era preciso invocar de
   * novo, como se a sessão anterior não tivesse acontecido.
   */
  private emCampo = -1;
  /**
   * As dicas de primeira vez que já foram dadas — item 1.4 do roteiro.
   *
   * Cada coisa do jogo explica a si mesma uma vez, na primeira vez em que você
   * a encontra, e nunca mais. Fica no save, e não na memória da sessão, porque
   * "primeira vez" tem de valer para a sua vida e não para este boot: uma dica
   * que reaparece toda vez que o headset reinicia não é uma dica, é um aviso.
   *
   * O conjunto é de chaves curtas (`bola`, `pocao`, `pedra`) em vez de um campo
   * por dica, para uma dica nova não precisar mexer no formato do save.
   */
  private jaExplicado = new Set<string>();

  constructor() {
    this.carregar();
  }

  /**
   * Devolve `true` UMA vez por chave, e grava que já devolveu.
   *
   * Quem chama não precisa saber se é a primeira vez — pergunta e, se for, dá a
   * dica. A gravação acontece aqui dentro de propósito: separar "perguntar" de
   * "marcar como visto" é como uma dica acaba aparecendo duas vezes.
   */
  primeiraVez(chave: string): boolean {
    if (this.jaExplicado.has(chave)) return false;
    this.jaExplicado.add(chave);
    this.salvar();
    return true;
  }

  private carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) {
        this.comecarDoZero();
        return;
      }
      const dados = JSON.parse(bruto) as {
        registros?: Record<string, RegistroDex>;
        exemplares?: Exemplar[];
        estoque?: Record<string, number>;
        itens?: Record<string, number>;
        ativo?: number;
        jaExplicado?: string[];
        bolaAtiva?: string;
        escolheuInicial?: boolean;
        recarregadoEm?: number;
        emCampo?: number;
      };

      for (const [id, reg] of Object.entries(dados.registros ?? {})) {
        // Ignora ids de uma versão anterior do catálogo, e preenche na mão o
        // que uma gravação antiga não tinha: espalhar um
        // padrão antes do objeto salvo não serve, porque um campo gravado como
        // undefined sobrescreveria o padrão com undefined.
        if (porId(id)) {
          this.registros.set(id, {
            vistos: reg.vistos ?? 0,
            capturados: reg.capturados ?? 0,
            primeiraCaptura: reg.primeiraCaptura ?? null,
            viuShiny: reg.viuShiny ?? false,
          });
        }
      }
      this.exemplares = (dados.exemplares ?? [])
        .filter((e) => porId(e.id))
        .map((e) => ({
          id: e.id,
          xp: e.xp ?? 0,
          hp: e.hp ?? 1,
          shiny: e.shiny ?? false,
          capturadoEm: e.capturadoEm ?? Date.now(),
          caiuEm: e.caiuEm,
          recusouEvoluirEm: e.recusouEvoluirEm,
          afeto: e.afeto ?? 0,
        }));

      this.estoque = new Map(
        Object.entries(dados.estoque ?? ESTOQUE_INICIAL).filter(([id]) => bolaPorId(id)),
      );
      this.itens = new Map(
        Object.entries(dados.itens ?? ESTOQUE_ITENS_INICIAL).filter(([id]) => itemPorId(id)),
      );
      this.ativo =
        dados.ativo !== undefined && dados.ativo >= 0 && dados.ativo < this.exemplares.length
          ? dados.ativo
          : this.exemplares.length > 0
            ? 0
            : -1;
      this.bolaAtiva = dados.bolaAtiva && bolaPorId(dados.bolaAtiva) ? dados.bolaAtiva : BOLAS[0].id;
      this.escolheuInicial = dados.escolheuInicial ?? this.exemplares.length > 0;
      // Uma gravação antiga não tem este campo, e tratá-la como "nunca
      // recarregou" daria o teto inteiro de presente na primeira abertura.
      // Começar de agora é o que preserva a espera para quem já jogava.
      this.recarregadoEm = dados.recarregadoEm ?? Date.now();
      const campo = dados.emCampo ?? -1;
      this.emCampo = campo >= 0 && campo < this.exemplares.length ? campo : -1;
      // Quem já jogava não volta a receber as dicas de primeira vez, mas quem
      // tem uma gravação ANTERIOR a elas recebe — e é o certo: aquele save é de
      // antes de as dicas existirem, então ninguém as viu.
      this.jaExplicado = new Set(dados.jaExplicado ?? []);
    } catch {
      // Armazenamento bloqueado ou corrompido: começa do zero, sem quebrar o jogo.
      this.comecarDoZero();
    }
  }

  private comecarDoZero() {
    this.estoque = new Map(Object.entries(ESTOQUE_INICIAL));
    this.itens = new Map(Object.entries(ESTOQUE_ITENS_INICIAL));
  }

  /**
   * A gravação está pedida, mas ainda não aconteceu.
   *
   * ## Por que não gravar na hora
   *
   * `salvar()` é chamado de vinte e quatro lugares, e gravar é caro: são um
   * `JSON.stringify` do estado inteiro — 151 registros da Pokédex, os
   * exemplares, o estoque — e um `localStorage.setItem`, que é **síncrono** e
   * bloqueia o quadro.
   *
   * O problema não é uma chamada, são as RAJADAS. A regeneração do time roda
   * a cada 2,5 s e escreve a vida de até seis Pokémon de uma vez: seis
   * `stringify` e seis escritas no MESMO quadro, a cada dois segundos e meio.
   * É exatamente a forma de um tranco periódico — o que o p95 do diário
   * enxerga e o que, em VR, embrulha o estômago.
   *
   * Agrupar as seis numa só não perde nada: elas descrevem o mesmo estado, e
   * a última já contém tudo o que as outras diriam.
   *
   * ## Por que a espera é curta, e por que existe um teto
   *
   * O atraso é o risco: o que não foi gravado se perde se o aparelho morrer.
   * Um quarto de segundo é menos do que qualquer jogada e mais do que
   * qualquer rajada. E o teto de dois segundos existe para o caso em que algo
   * peça gravação a cada quadro: sem ele, a espera se renovaria para sempre e
   * o jogo NUNCA gravaria — que é o modo clássico de um debounce virar perda
   * de dados silenciosa.
   */
  private pedido: ReturnType<typeof setTimeout> | null = null;
  /** Desde quando há coisa não gravada. Ver `salvar`. */
  private sujoDesde = 0;
  private static readonly ESPERA_MS = 250;
  private static readonly TETO_MS = 2000;

  private salvar() {
    const agora = Date.now();
    if (this.pedido === null) this.sujoDesde = agora;
    // Passou do teto: grava já, sem renovar a espera de novo.
    if (agora - this.sujoDesde >= Dex.TETO_MS) {
      this.gravarAgora();
      return;
    }
    if (this.pedido !== null) clearTimeout(this.pedido);
    this.pedido = setTimeout(() => this.gravarAgora(), Dex.ESPERA_MS);
  }

  /**
   * Grava de verdade, agora.
   *
   * Público porque há três momentos em que esperar não é opção: sair da
   * sessão, a página ir para segundo plano, e a página ser fechada. Ver
   * src/main.ts — um debounce sem essas três portas é uma perda de dados
   * esperando o dia certo.
   */
  gravarAgora() {
    if (this.pedido !== null) {
      clearTimeout(this.pedido);
      this.pedido = null;
    }
    this.sujoDesde = 0;
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({
          registros: Object.fromEntries(this.registros),
          exemplares: this.exemplares,
          estoque: Object.fromEntries(this.estoque),
          itens: Object.fromEntries(this.itens),
          ativo: this.ativo,
          bolaAtiva: this.bolaAtiva,
          escolheuInicial: this.escolheuInicial,
          recarregadoEm: this.recarregadoEm,
          emCampo: this.emCampo,
          jaExplicado: [...this.jaExplicado],
        }),
      );
    } catch {
      /* sem persistência desta vez */
    }
  }

  private garantirRegistro(id: string): RegistroDex {
    let reg = this.registros.get(id);
    if (!reg) {
      reg = { vistos: 0, capturados: 0, primeiraCaptura: null, viuShiny: false };
      this.registros.set(id, reg);
    }
    return reg;
  }

  // ---- exemplares ----

  /**
   * As seis vagas do time, na ordem, com `null` onde está vazio.
   *
   * Sempre seis, mesmo com o time pela metade: quem desenha o painel precisa
   * das vagas, não só dos bichos — uma vaga vazia é informação, e some se a
   * lista for filtrada aqui.
   */
  get time(): Array<Exemplar | null> {
    const vagas: Array<Exemplar | null> = [];
    for (let i = 0; i < TAMANHO_TIME; i++) vagas.push(this.exemplares[i] ?? null);
    return vagas;
  }

  /** Só quem está de fato no time. Para quem quer contar, não posicionar. */
  get timeVivo(): Exemplar[] {
    return this.time.filter((e): e is Exemplar => e !== null);
  }

  get guardados(): Exemplar[] {
    return this.exemplares.slice(TAMANHO_TIME).filter((e): e is Exemplar => e !== null);
  }

  /** A lista crua, COM as vagas vazias. Índices batem com os do PC. */
  get todosComVagas(): Array<Exemplar | null> {
    return this.exemplares;
  }

  /** Todos, sem as vagas vazias. */
  get todos(): Exemplar[] {
    return this.exemplares.filter((e): e is Exemplar => e !== null);
  }

  get exemplarAtivo(): Exemplar | null {
    return this.exemplares[this.ativo] ?? null;
  }

  nivelDe(exemplar: Exemplar): number {
    return nivelPorXp(exemplar.xp);
  }

  hpMaxDe(exemplar: Exemplar): number {
    const especie = porId(exemplar.id);
    if (!especie) return 1;
    return statsNoNivel(especie, this.nivelDe(exemplar)).hpMax;
  }

  /** Quanto falta, em fração, para o próximo nível. */
  progressoNivel(exemplar: Exemplar): number {
    const nivel = this.nivelDe(exemplar);
    if (nivel >= NIVEL_MAXIMO) return 1;
    const base = xpParaNivel(nivel);
    const proximo = xpParaNivel(nivel + 1);
    return Math.max(0, Math.min(1, (exemplar.xp - base) / Math.max(1, proximo - base)));
  }

  /** O nível que o jogo usa para calibrar os encontros: o do seu melhor. */
  get nivelDoTreinador(): number {
    let melhor = 3;
    for (const e of this.timeVivo) melhor = Math.max(melhor, this.nivelDe(e));
    return melhor;
  }

  definirAtivo(indice: number) {
    this.ativo = indice >= 0 && indice < this.exemplares.length ? indice : -1;
    this.salvar();
  }

  indiceDe(exemplar: Exemplar): number {
    return this.exemplares.indexOf(exemplar);
  }

  /**
   * Troca dois exemplares de lugar. É a operação do PC, e ela basta para tudo
   * o que o PC faz: "time" e "caixa" não são duas listas, são as seis primeiras
   * posições desta e o resto. Trocar a posição 2 com a 9 é, ao mesmo tempo,
   * tirar um do time e pôr outro — uma escrita só, e nenhum estado para manter
   * em sincronia.
   */
  /**
   * Mexe na lista sem perder de vista QUEM é quem.
   *
   * ## O bug
   *
   * Duas coisas são guardadas por ÍNDICE nesta classe: o **ativo** (o próximo
   * a sair da bola) e o **em campo** (quem estava fora da bola quando o jogo
   * parou, para a sessão seguinte devolvê-lo ao seu lado).
   *
   * Qualquer arrasto no PC muda os índices embaixo dos dois. O ativo tinha
   * conserto — três das quatro operações já o reencontravam pela referência, e
   * uma delas diz isso por escrito: *"o ativo é guardado por índice, e mover a
   * lista embaixo dele o faria apontar para outro bicho"*.
   *
   * **O em campo não tinha.** Nenhuma das quatro o corrigia, e ele existe
   * justamente para sobreviver ao fim da sessão. O resultado:
   *
   * 1. você está com o Charmander em campo;
   * 2. abre o PC e arrasta ele da primeira vaga para a quarta;
   * 3. sai e volta — e o jogo invoca **quem estiver na primeira vaga**, que é
   *    outro bicho, ou ninguém.
   *
   * Não dá erro, não some com nada, e é impossível de adivinhar: o sintoma
   * aparece uma sessão inteira depois da causa.
   *
   * ## Por que um invólucro, e não mais uma linha em cada operação
   *
   * Porque já eram quatro operações com três consertos diferentes — um por
   * índice (`corrigirAtivo`), dois por referência e um com regra própria — e
   * foi essa dispersão que deixou o segundo índice de fora. A quinta operação
   * que alguém escrever herda o conserto sem precisar saber que ele existe.
   */
  private mexendoNaLista<T>(operacao: () => T): T {
    const ativo = this.exemplarAtivo;
    const campo = this.exemplares[this.emCampo] ?? null;
    const saida = operacao();
    this.ativo = ativo ? this.exemplares.indexOf(ativo) : -1;
    this.emCampo = campo ? this.exemplares.indexOf(campo) : -1;
    return saida;
  }

  trocar(a: number, b: number) {
    if (a === b) return;
    if (a < 0 || b < 0 || a >= this.exemplares.length || b >= this.exemplares.length) return;
    this.mexendoNaLista(() => {
      const guardado = this.exemplares[a];
      this.exemplares[a] = this.exemplares[b];
      this.exemplares[b] = guardado;
    });
    this.salvar();
  }

  /** Tira de uma posição e insere noutra, empurrando o resto. */
  mover(de: number, para: number) {
    if (de === para) return;
    if (de < 0 || de >= this.exemplares.length) return;
    const destino = Math.max(0, Math.min(this.exemplares.length - 1, para));
    this.mexendoNaLista(() => {
      const [exemplar] = this.exemplares.splice(de, 1);
      this.exemplares.splice(destino, 0, exemplar);
    });
    this.salvar();
  }

  /** Solta um exemplar de volta à natureza. O inicial não sai. */
  soltar(indice: number): Exemplar | null {
    if (indice < 0 || indice >= this.exemplares.length) return null;
    if (this.exemplares.length <= 1) return null;
    const saiu = this.mexendoNaLista(() => this.exemplares.splice(indice, 1)[0]);
    // Quem some não pode continuar sendo o ativo: o lugar dele passa a ser o
    // primeiro da lista. Já o EM CAMPO vira "ninguém" e fica assim — inventar
    // um substituto ali faria a sessão seguinte invocar um bicho que você
    // nunca mandou sair da bola.
    if (this.ativo < 0 && this.exemplares.length > 0) this.ativo = 0;
    this.salvar();
    return saiu;
  }

  // ---- coleção ----

  // ---- corrente de brilhantes ----

  /**
   * A caçada em cadeia: quantos encontros seguidos você teve com a MESMA
   * espécie, e com qual.
   *
   * É o que dá ao jogador alguma influência sobre a sorte. A chance base de um
   * brilhante é de um em quatrocentos e nove — na prática, nunca. Com a
   * corrente, insistir num lugar onde o mesmo bicho continua aparecendo vale
   * alguma coisa concreta, e a raridade deixa de ser só espera.
   *
   * Não é salva: a corrente é da SESSÃO. Guardá-la deixaria o jogador abrir o
   * jogo já com trinta de corrente, o que é o contrário da ideia.
   */
  private correnteEspecie: string | null = null;
  private correnteTamanho = 0;

  get corrente(): number {
    return this.correnteTamanho;
  }

  get especieDaCorrente(): string | null {
    return this.correnteEspecie;
  }

  /** O Amuleto Brilhante chega sozinho, com o tamanho da Pokédex. */
  get amuletoBrilhante(): boolean {
    return this.especiesCapturadas >= ESPECIES_PARA_AMULETO;
  }

  get sorteBrilhante(): SorteBrilhante {
    return { corrente: this.correnteTamanho, amuleto: this.amuletoBrilhante };
  }

  /** Conta o encontro na corrente. Espécie diferente zera e recomeça. */
  encadear(id: string): number {
    if (this.correnteEspecie === id) this.correnteTamanho++;
    else {
      this.correnteEspecie = id;
      this.correnteTamanho = 1;
    }
    return this.correnteTamanho;
  }

  registrarEncontro(id: string, shiny: boolean) {
    const reg = this.garantirRegistro(id);
    reg.vistos++;
    if (shiny) reg.viuShiny = true;
    this.salvar();
  }

  /** Devolve o exemplar novo, ou null se ele nem cabia mais na caixa. */
  registrarCaptura(id: string, hp: number, nivel: number, shiny: boolean): Exemplar | null {
    const especie = porId(id);
    if (!especie) return null;

    const reg = this.garantirRegistro(id);
    reg.capturados++;
    reg.primeiraCaptura ??= Date.now();
    if (shiny) reg.viuShiny = true;

    // Teto generoso: cabe a Pokédex inteira mais um pouco. Existe só para o
    // localStorage do headset não crescer para sempre numa sessão longa.
    if (this.exemplares.length >= TOTAL_ESPECIES + 30) {
      this.salvar();
      return null;
    }

    const exemplar: Exemplar = {
      id,
      // Nasce já no nível em que foi encontrado — não faria sentido capturar um
      // Dragonite selvagem forte e receber um filhote.
      xp: xpParaNivel(Math.max(1, nivel)),
      // Chega machucado, do jeito que saiu da batalha — mas nunca desmaiado.
      hp: Math.max(1, Math.round(hp)),
      shiny,
      capturadoEm: Date.now(),
    };
    this.acolher(exemplar);
    if (this.ativo === -1) this.ativo = this.exemplares.indexOf(exemplar);
    this.salvar();
    return exemplar;
  }

  /**
   * Põe um bicho novo na primeira vaga LIVRE do time, ou na caixa.
   *
   * Desde que o time pode ter buracos, "empurrar no fim da lista" deixou de ser
   * o certo: com a terceira vaga vazia e um Pokémon novo capturado, ele ia
   * parar na caixa enquanto havia lugar no time à vista. A primeira vaga livre
   * é o que qualquer um espera.
   */
  private acolher(exemplar: Exemplar) {
    for (let i = 0; i < TAMANHO_TIME; i++) {
      if (!this.exemplares[i]) {
        // A lista pode ser mais curta que o time — preenche o caminho com
        // vagas vazias em vez de deixar buracos `undefined`.
        while (this.exemplares.length < i) this.exemplares.push(null);
        this.exemplares[i] = exemplar;
        return;
      }
    }
    this.exemplares.push(exemplar);
  }

  /**
   * Arrastar no PC: tira daqui e larga ali — item pedido em 18/09.
   *
   * O modelo antigo era de dois toques e uma operação só (`trocar`), e por isso
   * não sabia fazer a coisa que o jogador mais quer: **esvaziar uma vaga**.
   * Trocar sempre põe alguém no lugar de alguém.
   *
   * As regras saem das duas invariantes da lista (ver `exemplares`): o time
   * pode ter buracos, a caixa não.
   *
   * - **para uma vaga de time vazia** — o bicho vai para lá; de onde ele saiu
   *   fica vazio se era o time, e se fecha se era a caixa.
   * - **para uma vaga ocupada** — os dois trocam de lugar, dos dois lados.
   * - **do time para a caixa** — ele entra na caixa na posição em que você
   *   soltou, e a vaga do time **fica vazia**. É o pedido, na letra.
   *
   * Devolve o que aconteceu, para o jogo dar a resposta certa.
   */
  arrastar(de: number, para: number): 'trocou' | 'moveu' | null {
    if (de === para) return null;
    const bicho = this.exemplares[de] ?? null;
    if (!bicho) return null;

    const paraTime = para < TAMANHO_TIME;
    const deTime = de < TAMANHO_TIME;
    const destino = this.exemplares[para] ?? null;

    const oQueFoi = this.mexendoNaLista<'trocou' | 'moveu'>(() => {
      if (destino) {
        this.exemplares[de] = destino;
        this.exemplares[para] = bicho;
        return 'trocou';
      }

      // Vaga vazia. Tirar de onde estava é o que muda conforme o lado.
      if (deTime) this.exemplares[de] = null;
      else this.exemplares.splice(de, 1);

      if (paraTime) {
        const alvo = para;
        while (this.exemplares.length <= alvo) this.exemplares.push(null);
        this.exemplares[alvo] = bicho;
      } else {
        // Na caixa não há vaga vazia: soltar num quadrado em branco quer dizer
        // "põe no fim", que é onde aquele quadrado está.
        this.exemplares.push(bicho);
      }
      return 'moveu';
    });

    this.salvar();
    return oQueFoi;
  }


  /** O inicial chega com a vida cheia e já escolhido. */
  receberInicial(id: string, nivel = 5) {
    const especie = porId(id);
    if (!especie) return;
    const reg = this.garantirRegistro(id);
    reg.capturados = Math.max(1, reg.capturados);
    reg.vistos = Math.max(1, reg.vistos);
    reg.primeiraCaptura ??= Date.now();

    const exemplar: Exemplar = {
      id,
      xp: xpParaNivel(nivel),
      hp: statsNoNivel(especie, nivel).hpMax,
      shiny: false,
      capturadoEm: Date.now(),
    };
    this.exemplares.push(exemplar);
    this.ativo = this.exemplares.length - 1;
    this.escolheuInicial = true;
    this.salvar();
  }

  /**
   * Acrescenta afeto e grava. Ver  em src/species.ts.
   *
   * Satura em 1 e nunca desce: o jogo não tem — e não vai ter — um mecanismo de
   * PERDER a amizade de um bicho. Afeto que cai puniria quem passou uma semana
   * sem jogar, e o carinho existe para ser o lado gentil deste jogo.
   */
  ganharAfeto(exemplar: Exemplar, quanto: number) {
    const antes = exemplar.afeto ?? 0;
    const depois = Math.min(1, antes + quanto);
    if (depois === antes) return;
    exemplar.afeto = depois;
    this.salvar();
  }

  /**
   * O invariante da queda: **vida acima de zero ⟺ sem relógio de queda**.
   *
   * Fica numa função só porque TRÊS caminhos escrevem vida — levar dano,
   * subir de nível (que cura a diferença de HP máximo) e evoluir (que nunca
   * deixa o bicho abaixo de 1) — e dois deles são fáceis de esquecer, porque
   * ninguém pensa em "evoluir" como uma forma de curar. Um relógio de queda
   * esquecido num bicho de pé faria o próximo tombo herdar a contagem do
   * anterior, e ele levantaria na hora.
   */
  private acertarQueda(exemplar: Exemplar) {
    if (exemplar.hp <= 0) exemplar.caiuEm ??= Date.now();
    else exemplar.caiuEm = undefined;
  }

  definirHp(exemplar: Exemplar, hp: number) {
    exemplar.hp = Math.max(0, Math.min(this.hpMaxDe(exemplar), Math.round(hp)));
    this.acertarQueda(exemplar);
    this.salvar();
  }

  /** Devolve o nível novo quando a XP fez ele subir, senão null. */
  ganharXp(exemplar: Exemplar, quanto: number): number | null {
    const antes = this.nivelDe(exemplar);
    exemplar.xp += Math.max(0, Math.round(quanto));
    const depois = this.nivelDe(exemplar);
    // Subir de nível cura a diferença de HP máximo, como no jogo original.
    if (depois > antes) {
      const ganho = this.hpMaxDe(exemplar) - statsNoNivel(porId(exemplar.id)!, antes).hpMax;
      exemplar.hp = Math.min(this.hpMaxDe(exemplar), exemplar.hp + Math.max(0, ganho));
      this.acertarQueda(exemplar);
    }
    this.salvar();
    return depois > antes ? depois : null;
  }

  /** "Agora não": não se pergunta de novo até ele subir de nível. */
  adiarEvolucao(exemplar: Exemplar) {
    exemplar.recusouEvoluirEm = this.nivelDe(exemplar);
    this.salvar();
  }

  /** Troca a espécie do exemplar mantendo nível, XP e a marca de brilhante. */
  evoluir(exemplar: Exemplar, paraId: string) {
    if (!porId(paraId)) return;
    const fracao = exemplar.hp / Math.max(1, this.hpMaxDe(exemplar));
    exemplar.id = paraId;
    // A recusa era da espécie antiga; a próxima evolução é outra pergunta.
    exemplar.recusouEvoluirEm = undefined;
    const reg = this.garantirRegistro(paraId);
    reg.capturados = Math.max(1, reg.capturados);
    reg.vistos = Math.max(1, reg.vistos);
    reg.primeiraCaptura ??= Date.now();
    if (exemplar.shiny) reg.viuShiny = true;
    // A vida acompanha em proporção: evoluir não cura, mas também não machuca.
    exemplar.hp = Math.max(1, Math.round(this.hpMaxDe(exemplar) * fracao));
    this.acertarQueda(exemplar);
    this.salvar();
  }

  curarTime() {
    for (const e of this.exemplares) {
      if (!e) continue;
      e.hp = this.hpMaxDe(e);
      this.acertarQueda(e);
    }
    this.salvar();
  }

  de(id: string): RegistroDex | undefined {
    return this.registros.get(id);
  }

  jaCapturou(id: string): boolean {
    return (this.registros.get(id)?.capturados ?? 0) > 0;
  }

  jaViu(id: string): boolean {
    return (this.registros.get(id)?.vistos ?? 0) > 0;
  }

  get totalCapturas(): number {
    let total = 0;
    for (const reg of this.registros.values()) total += reg.capturados;
    return total;
  }

  get especiesCapturadas(): number {
    let n = 0;
    for (const reg of this.registros.values()) if (reg.capturados > 0) n++;
    return n;
  }

  get especiesVistas(): number {
    let n = 0;
    for (const reg of this.registros.values()) if (reg.vistos > 0) n++;
    return n;
  }

  get totalEspecies(): number {
    return TOTAL_ESPECIES;
  }

  // ---- mochila ----

  bolas(id: string): number {
    return Math.floor(this.estoque.get(id) ?? 0);
  }

  get totalBolas(): number {
    let total = 0;
    for (const n of this.estoque.values()) total += Math.floor(n);
    return total;
  }

  gastarBola(id: string): boolean {
    const atual = this.estoque.get(id) ?? 0;
    if (atual < 1) return false;
    this.estoque.set(id, atual - 1);
    this.salvar();
    return true;
  }

  /** Aceita fração: bolas raras chegam aos pouquinhos. */
  ganharBola(id: string, quantidade: number) {
    const tipo = bolaPorId(id);
    if (!tipo) return;
    const atual = this.estoque.get(id) ?? 0;
    this.estoque.set(id, Math.min(tipo.maximo, atual + quantidade));
    this.salvar();
  }

  definirBolaAtiva(id: string) {
    if (!bolaPorId(id)) return;
    this.bolaAtiva = id;
    this.salvar();
  }

  /** Próxima bola do estoque, para o atalho do analógico. */
  cicloBola(direcao: 1 | -1): string {
    const disponiveis = BOLAS.filter((b) => this.bolas(b.id) > 0 || b.id === this.bolaAtiva);
    if (disponiveis.length === 0) return this.bolaAtiva;
    const i = disponiveis.findIndex((b) => b.id === this.bolaAtiva);
    const proximo = disponiveis[(i + direcao + disponiveis.length) % disponiveis.length];
    this.definirBolaAtiva(proximo.id);
    return proximo.id;
  }

  // ---- itens ----

  item(id: string): number {
    return Math.floor(this.itens.get(id) ?? 0);
  }

  gastarItem(id: string): boolean {
    const atual = this.itens.get(id) ?? 0;
    if (atual < 1) return false;
    this.itens.set(id, atual - 1);
    this.salvar();
    return true;
  }

  ganharItem(id: string, quantidade: number) {
    const tipo = itemPorId(id);
    if (!tipo) return;
    const atual = this.itens.get(id) ?? 0;
    this.itens.set(id, Math.min(tipo.maximo, atual + quantidade));
    this.salvar();
  }

  // ---- quem ficou em campo ----

  /** Quem estava fora da bola quando o jogo parou, ou null. */
  get exemplarEmCampoSalvo(): Exemplar | null {
    return this.exemplares[this.emCampo] ?? null;
  }

  /** Anota (ou apaga, com null) quem está em campo agora. */
  marcarEmCampo(exemplar: Exemplar | null) {
    const indice = exemplar ? this.exemplares.indexOf(exemplar) : -1;
    if (indice === this.emCampo) return;
    this.emCampo = indice;
    this.salvar();
  }

  /**
   * O tempo passando vira bola.
   *
   * Chamado a cada quadro, mas ele mesmo não faz nada quase sempre: só há o que
   * fazer quando o relógio cruza um múltiplo da recarga. Devolve quantas
   * nasceram, para quem chamou poder avisar na tela — uma bola que aparece na
   * mochila sem ninguém dizer nada é uma bola que você não sabe que tem.
   *
   * O resto do tempo é PRESERVADO: o relógio anda para a frente pelo tanto que
   * foi convertido, e não até agora. Sem isso, quadros de 16 ms jogariam fora
   * 74,98 s de espera a cada volta e a recarga nunca chegaria.
   */
  recarregar(): number {
    const agora = Date.now();
    let nasceram = 0;

    for (const tipo of BOLAS) {
      if (!tipo.recarga) continue;
      const teto = tipo.tetoRecarga ?? tipo.maximo;
      const atual = Math.floor(this.estoque.get(tipo.id) ?? 0);

      // Já no teto: o relógio reinicia junto. Guardar tempo acumulado enquanto
      // a mochila está cheia faria a próxima bola gasta ser reposta na hora.
      if (atual >= teto) {
        this.recarregadoEm = agora;
        continue;
      }

      const passou = (agora - this.recarregadoEm) / 1000;
      const quantas = Math.floor(passou / tipo.recarga);
      if (quantas < 1) continue;

      const cabem = Math.min(quantas, teto - atual);
      this.recarregadoEm += quantas * tipo.recarga * 1000;
      if (cabem > 0) {
        this.ganharBola(tipo.id, cabem);
        nasceram += cabem;
      }
    }
    return nasceram;
  }

  /** Chamado a cada captura: é de onde vêm bolas e itens novos. */
  premiarCaptura() {
    for (const tipo of BOLAS) this.ganharBola(tipo.id, tipo.recompensa);
    for (const tipo of ITENS) this.ganharItem(tipo.id, tipo.recompensa);
  }

  limpar() {
    this.registros.clear();
    this.exemplares = [];
    this.comecarDoZero();
    this.ativo = -1;
    // O mesmo esquecimento de `arrastar`, no lugar mais óbvio de todos: sem
    // isto, uma lista vazia continuava com um índice de quem estava em campo.
    this.emCampo = -1;
    this.escolheuInicial = false;
    this.salvar();
  }
}
