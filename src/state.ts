import { ESPECIES } from './species';

export interface RegistroDex {
  vistos: number;
  capturados: number;
  primeiraCaptura: number | null;
}

const CHAVE = 'critter-quest/dex/v1';

/** A coleção do jogador, guardada no próprio headset. */
export class Dex {
  private registros = new Map<string, RegistroDex>();

  constructor() {
    this.carregar();
  }

  private carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return;
      const dados = JSON.parse(bruto) as Record<string, RegistroDex>;
      for (const [id, reg] of Object.entries(dados)) this.registros.set(id, reg);
    } catch {
      // Armazenamento bloqueado ou corrompido: começa do zero, sem quebrar o jogo.
    }
  }

  private salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries(this.registros)));
    } catch {
      /* sem persistência desta vez */
    }
  }

  private garantir(id: string): RegistroDex {
    let reg = this.registros.get(id);
    if (!reg) {
      reg = { vistos: 0, capturados: 0, primeiraCaptura: null };
      this.registros.set(id, reg);
    }
    return reg;
  }

  registrarEncontro(id: string) {
    this.garantir(id).vistos++;
    this.salvar();
  }

  registrarCaptura(id: string) {
    const reg = this.garantir(id);
    reg.capturados++;
    reg.primeiraCaptura ??= Date.now();
    this.salvar();
  }

  de(id: string): RegistroDex | undefined {
    return this.registros.get(id);
  }

  jaCapturou(id: string): boolean {
    return (this.registros.get(id)?.capturados ?? 0) > 0;
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
    this.salvar();
  }
}
