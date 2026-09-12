import { ESPECIES, porId } from './species';

export interface RegistroDex {
  vistos: number;
  capturados: number;
  /** HP atual do exemplar que você leva em campo. */
  hp: number;
  primeiraCaptura: number | null;
}

const CHAVE = 'critter-quest/dex/v2';

/** A sua coleção, guardada no próprio headset. */
export class Dex {
  private registros = new Map<string, RegistroDex>();
  /** Quem está escolhido para ir a campo. */
  ativo: string | null = null;

  constructor() {
    this.carregar();
  }

  private carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return;
      const dados = JSON.parse(bruto) as { registros?: Record<string, RegistroDex>; ativo?: string };
      for (const [id, reg] of Object.entries(dados.registros ?? {})) {
        // Ignora ids de uma versão anterior do catálogo.
        if (porId(id)) this.registros.set(id, reg);
      }
      this.ativo = dados.ativo && this.registros.has(dados.ativo) ? dados.ativo : null;
    } catch {
      // Armazenamento bloqueado ou corrompido: começa do zero, sem quebrar o jogo.
    }
  }

  private salvar() {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({ registros: Object.fromEntries(this.registros), ativo: this.ativo }),
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

  definirHp(id: string, hp: number) {
    const reg = this.registros.get(id);
    if (!reg) return;
    reg.hp = Math.max(0, Math.round(hp));
    this.salvar();
  }

  /** Descanso: todo mundo volta com a vida cheia. */
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

  /** Só quem você já capturou, na ordem do catálogo. */
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

  limpar() {
    this.registros.clear();
    this.ativo = null;
    this.salvar();
  }
}
