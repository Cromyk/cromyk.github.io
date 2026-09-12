import { BOLAS, ESTOQUE_INICIAL, bolaPorId } from './balls';
import { ESPECIES, porId } from './species';

export interface RegistroDex {
  vistos: number;
  capturados: number;
  /** HP atual do exemplar que você leva em campo. */
  hp: number;
  primeiraCaptura: number | null;
}

const CHAVE = 'critter-quest/dex/v3';

/** A sua coleção e sua mochila, guardadas no próprio headset. */
export class Dex {
  private registros = new Map<string, RegistroDex>();
  private estoque = new Map<string, number>();
  /** Quem está escolhido para ir a campo. */
  ativo: string | null = null;
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
        this.estoque = new Map(Object.entries(ESTOQUE_INICIAL));
        return;
      }
      const dados = JSON.parse(bruto) as {
        registros?: Record<string, RegistroDex>;
        estoque?: Record<string, number>;
        ativo?: string;
        bolaAtiva?: string;
        escolheuInicial?: boolean;
      };
      for (const [id, reg] of Object.entries(dados.registros ?? {})) {
        // Ignora ids de uma versão anterior do catálogo.
        if (porId(id)) this.registros.set(id, reg);
      }
      this.estoque = new Map(
        Object.entries(dados.estoque ?? ESTOQUE_INICIAL).filter(([id]) => bolaPorId(id)),
      );
      this.ativo = dados.ativo && this.registros.has(dados.ativo) ? dados.ativo : null;
      this.bolaAtiva = dados.bolaAtiva && bolaPorId(dados.bolaAtiva) ? dados.bolaAtiva : BOLAS[0].id;
      this.escolheuInicial = dados.escolheuInicial ?? this.registros.size > 0;
    } catch {
      // Armazenamento bloqueado ou corrompido: começa do zero, sem quebrar o jogo.
      this.estoque = new Map(Object.entries(ESTOQUE_INICIAL));
    }
  }

  private salvar() {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({
          registros: Object.fromEntries(this.registros),
          estoque: Object.fromEntries(this.estoque),
          ativo: this.ativo,
          bolaAtiva: this.bolaAtiva,
          escolheuInicial: this.escolheuInicial,
        }),
      );
    } catch {
      /* sem persistência desta vez */
    }
  }

  private garantir(id: string): RegistroDex {
    let reg = this.registros.get(id);
    if (!reg) {
      reg = { vistos: 0, capturados: 0, hp: porId(id)?.hpMax ?? 40, primeiraCaptura: null };
      this.registros.set(id, reg);
    }
    return reg;
  }

  // ---- coleção ----

  registrarEncontro(id: string) {
    this.garantir(id).vistos++;
    this.salvar();
  }

  registrarCaptura(id: string, hp: number) {
    const reg = this.garantir(id);
    reg.capturados++;
    reg.primeiraCaptura ??= Date.now();
    // Chega machucado, do jeito que saiu da batalha — mas nunca desmaiado.
    reg.hp = Math.max(1, Math.round(hp));
    if (this.ativo === null) this.ativo = id;
    this.salvar();
  }

  /** O inicial chega com a vida cheia e já escolhido. */
  receberInicial(id: string) {
    const reg = this.garantir(id);
    reg.capturados = Math.max(1, reg.capturados);
    reg.primeiraCaptura ??= Date.now();
    reg.hp = porId(id)?.hpMax ?? reg.hp;
    this.ativo = id;
    this.escolheuInicial = true;
    this.salvar();
  }

  definirHp(id: string, hp: number) {
    const reg = this.registros.get(id);
    if (!reg) return;
    reg.hp = Math.max(0, Math.round(hp));
    this.salvar();
  }

  curarTime() {
    for (const [id, reg] of this.registros) {
      if (reg.capturados > 0) reg.hp = porId(id)?.hpMax ?? reg.hp;
    }
    this.salvar();
  }

  definirAtivo(id: string | null) {
    this.ativo = id;
    this.salvar();
  }

  de(id: string): RegistroDex | undefined {
    return this.registros.get(id);
  }

  jaCapturou(id: string): boolean {
    return (this.registros.get(id)?.capturados ?? 0) > 0;
  }

  get time(): Array<{ id: string; registro: RegistroDex }> {
    return ESPECIES.filter((e) => this.jaCapturou(e.id)).map((e) => ({
      id: e.id,
      registro: this.registros.get(e.id)!,
    }));
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

  get totalEspecies(): number {
    return ESPECIES.length;
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

  limpar() {
    this.registros.clear();
    this.estoque = new Map(Object.entries(ESTOQUE_INICIAL));
    this.ativo = null;
    this.escolheuInicial = false;
    this.salvar();
  }
}
