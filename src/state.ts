import { BOLAS, ESTOQUE_INICIAL, bolaPorId } from './balls';
import { ESTOQUE_ITENS_INICIAL, ITENS, itemPorId } from './itens';
import {
  NIVEL_MAXIMO,
  TOTAL_ESPECIES,
  nivelPorXp,
  porId,
  statsNoNivel,
  xpParaNivel,
} from './species';

/** Um exemplar que é seu: o bicho, não a espécie. */
export interface Exemplar {
  id: string;
  xp: number;
  hp: number;
  shiny: boolean;
  capturadoEm: number;
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
  private exemplares: Exemplar[] = [];
  private estoque = new Map<string, number>();
  private itens = new Map<string, number>();

  /** Índice em `exemplares` de quem está escolhido para ir a campo. */
  ativo = -1;
  /** Qual bola o grip vai pegar. */
  bolaAtiva = BOLAS[0].id;
  /** Falso até você escolher o inicial. */
  escolheuInicial = false;

  constructor() {
    this.carregar();
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
        bolaAtiva?: string;
        escolheuInicial?: boolean;
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
    } catch {
      // Armazenamento bloqueado ou corrompido: começa do zero, sem quebrar o jogo.
      this.comecarDoZero();
    }
  }

  private comecarDoZero() {
    this.estoque = new Map(Object.entries(ESTOQUE_INICIAL));
    this.itens = new Map(Object.entries(ESTOQUE_ITENS_INICIAL));
  }

  private salvar() {
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

  get time(): Exemplar[] {
    return this.exemplares.slice(0, TAMANHO_TIME);
  }

  get guardados(): Exemplar[] {
    return this.exemplares.slice(TAMANHO_TIME);
  }

  get todos(): Exemplar[] {
    return this.exemplares;
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
    for (const e of this.time) melhor = Math.max(melhor, this.nivelDe(e));
    return melhor;
  }

  definirAtivo(indice: number) {
    this.ativo = indice >= 0 && indice < this.exemplares.length ? indice : -1;
    this.salvar();
  }

  indiceDe(exemplar: Exemplar): number {
    return this.exemplares.indexOf(exemplar);
  }

  // ---- coleção ----

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
    this.exemplares.push(exemplar);
    if (this.ativo === -1) this.ativo = this.exemplares.length - 1;
    this.salvar();
    return exemplar;
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

  definirHp(exemplar: Exemplar, hp: number) {
    exemplar.hp = Math.max(0, Math.min(this.hpMaxDe(exemplar), Math.round(hp)));
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
    }
    this.salvar();
    return depois > antes ? depois : null;
  }

  /** Troca a espécie do exemplar mantendo nível, XP e a marca de brilhante. */
  evoluir(exemplar: Exemplar, paraId: string) {
    if (!porId(paraId)) return;
    const fracao = exemplar.hp / Math.max(1, this.hpMaxDe(exemplar));
    exemplar.id = paraId;
    const reg = this.garantirRegistro(paraId);
    reg.capturados = Math.max(1, reg.capturados);
    reg.vistos = Math.max(1, reg.vistos);
    reg.primeiraCaptura ??= Date.now();
    if (exemplar.shiny) reg.viuShiny = true;
    // A vida acompanha em proporção: evoluir não cura, mas também não machuca.
    exemplar.hp = Math.max(1, Math.round(this.hpMaxDe(exemplar) * fracao));
    this.salvar();
  }

  curarTime() {
    for (const e of this.exemplares) e.hp = this.hpMaxDe(e);
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
    this.escolheuInicial = false;
    this.salvar();
  }
}
