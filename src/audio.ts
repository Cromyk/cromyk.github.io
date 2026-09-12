/**
 * Áudio 100% sintetizado na WebAudio — nenhum arquivo de som no pacote.
 * Tudo aqui é osciladores e ruído com envelope.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ruido: AudioBuffer | null = null;

  iniciar() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;

    // Um segundo de ruído branco, reaproveitado por todos os efeitos.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    this.ruido = buffer;
  }

  private get agora() {
    return this.ctx?.currentTime ?? 0;
  }

  /** Uma nota com envelope ADSR simplificado. */
  private tom(opcoes: {
    freq: number;
    freqFinal?: number;
    duracao: number;
    tipo?: OscillatorType;
    ganho?: number;
    atraso?: number;
  }) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const { freq, freqFinal, duracao, tipo = 'sine', ganho = 0.3, atraso = 0 } = opcoes;
    const t0 = this.agora + atraso;

    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqFinal !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqFinal), t0 + duracao);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(ganho, t0 + Math.min(0.02, duracao * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);

    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + duracao + 0.02);
  }

  /** Rajada de ruído filtrado — usada para impacto, whoosh e sucção. */
  private sopro(opcoes: {
    duracao: number;
    corteInicial: number;
    corteFinal: number;
    ganho?: number;
    q?: number;
    atraso?: number;
  }) {
    const { ctx, master, ruido } = this;
    if (!ctx || !master || !ruido) return;
    const { duracao, corteInicial, corteFinal, ganho = 0.3, q = 1, atraso = 0 } = opcoes;
    const t0 = this.agora + atraso;

    const fonte = ctx.createBufferSource();
    fonte.buffer = ruido;
    fonte.loop = true;

    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = q;
    filtro.frequency.setValueAtTime(corteInicial, t0);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(20, corteFinal), t0 + duracao);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(ganho, t0 + duracao * 0.18);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);

    fonte.connect(filtro).connect(env).connect(master);
    fonte.start(t0);
    fonte.stop(t0 + duracao + 0.02);
  }

  arremesso(forca: number) {
    const f = Math.min(1.6, Math.max(0.4, forca));
    this.sopro({ duracao: 0.26, corteInicial: 500 * f, corteFinal: 1600 * f, ganho: 0.16 * f, q: 1.6 });
  }

  quique() {
    this.sopro({ duracao: 0.09, corteInicial: 900, corteFinal: 200, ganho: 0.16, q: 2.5 });
    this.tom({ freq: 150, freqFinal: 80, duracao: 0.1, tipo: 'triangle', ganho: 0.14 });
  }

  acerto() {
    this.tom({ freq: 420, freqFinal: 180, duracao: 0.14, tipo: 'square', ganho: 0.18 });
    this.sopro({ duracao: 0.16, corteInicial: 2200, corteFinal: 400, ganho: 0.22, q: 1.2 });
  }

  succao() {
    this.sopro({ duracao: 0.55, corteInicial: 320, corteFinal: 2600, ganho: 0.2, q: 3 });
    this.tom({ freq: 180, freqFinal: 900, duracao: 0.55, tipo: 'sine', ganho: 0.12 });
  }

  sacudida(indice: number) {
    const base = 520 + indice * 80;
    this.tom({ freq: base, freqFinal: base * 0.72, duracao: 0.1, tipo: 'triangle', ganho: 0.2 });
    this.sopro({ duracao: 0.07, corteInicial: 1800, corteFinal: 900, ganho: 0.1, q: 3 });
  }

  sucesso() {
    // Arpejo maior subindo — a recompensa.
    const notas = [523.25, 659.25, 783.99, 1046.5];
    notas.forEach((freq, i) => {
      this.tom({ freq, duracao: 0.32, tipo: 'triangle', ganho: 0.22, atraso: i * 0.09 });
      this.tom({ freq: freq * 2, duracao: 0.2, tipo: 'sine', ganho: 0.08, atraso: i * 0.09 });
    });
  }

  escapou() {
    this.tom({ freq: 400, freqFinal: 140, duracao: 0.42, tipo: 'sawtooth', ganho: 0.16 });
    this.sopro({ duracao: 0.4, corteInicial: 1400, corteFinal: 260, ganho: 0.14, q: 1.4 });
  }

  surgiu(raro: boolean) {
    if (raro) {
      [784, 988, 1319].forEach((freq, i) =>
        this.tom({ freq, duracao: 0.5, tipo: 'sine', ganho: 0.16, atraso: i * 0.12 }),
      );
    } else {
      this.tom({ freq: 660, freqFinal: 990, duracao: 0.2, tipo: 'sine', ganho: 0.12 });
    }
  }

  fugiu() {
    this.tom({ freq: 300, freqFinal: 900, duracao: 0.3, tipo: 'sine', ganho: 0.1 });
    this.sopro({ duracao: 0.3, corteInicial: 600, corteFinal: 2400, ganho: 0.1, q: 2 });
  }

  // ---- batalha ----

  /** Cada tipo soa diferente: o fogo ruge, a água jorra, o raio estala. */
  golpe(tipo: 'fogo' | 'agua' | 'planta' | 'eletrico') {
    switch (tipo) {
      case 'fogo':
        this.sopro({ duracao: 0.5, corteInicial: 380, corteFinal: 1500, ganho: 0.26, q: 0.9 });
        this.tom({ freq: 110, freqFinal: 70, duracao: 0.45, tipo: 'sawtooth', ganho: 0.12 });
        break;
      case 'agua':
        this.sopro({ duracao: 0.5, corteInicial: 1800, corteFinal: 700, ganho: 0.24, q: 1.6 });
        this.tom({ freq: 320, freqFinal: 180, duracao: 0.4, tipo: 'sine', ganho: 0.1 });
        break;
      case 'planta':
        this.sopro({ duracao: 0.22, corteInicial: 2600, corteFinal: 1200, ganho: 0.2, q: 4 });
        this.tom({ freq: 700, freqFinal: 420, duracao: 0.22, tipo: 'triangle', ganho: 0.12 });
        break;
      case 'eletrico':
        this.sopro({ duracao: 0.32, corteInicial: 3200, corteFinal: 900, ganho: 0.28, q: 0.7 });
        this.tom({ freq: 1400, freqFinal: 300, duracao: 0.3, tipo: 'square', ganho: 0.12 });
        break;
    }
  }

  /** Impacto do golpe. Super eficaz soa mais grave e mais forte. */
  impacto(efetividade: number) {
    const forte = efetividade >= 2;
    const fraco = efetividade <= 0.5;
    this.tom({
      freq: forte ? 200 : fraco ? 420 : 300,
      freqFinal: forte ? 70 : fraco ? 300 : 130,
      duracao: forte ? 0.3 : 0.16,
      tipo: 'square',
      ganho: forte ? 0.3 : fraco ? 0.12 : 0.2,
    });
    this.sopro({
      duracao: forte ? 0.3 : 0.14,
      corteInicial: 2400,
      corteFinal: 300,
      ganho: forte ? 0.3 : 0.16,
      q: 1,
    });
  }

  critico() {
    this.tom({ freq: 1200, freqFinal: 2400, duracao: 0.1, tipo: 'square', ganho: 0.16 });
  }

  desmaiou() {
    [440, 370, 294, 220].forEach((freq, i) =>
      this.tom({ freq, duracao: 0.3, tipo: 'triangle', ganho: 0.18, atraso: i * 0.11 }),
    );
  }

  /** Clarão da pokébola abrindo para soltar o Pokémon. */
  invocar() {
    this.tom({ freq: 300, freqFinal: 1200, duracao: 0.35, tipo: 'sine', ganho: 0.18 });
    this.sopro({ duracao: 0.4, corteInicial: 600, corteFinal: 3000, ganho: 0.16, q: 1.2 });
  }

  recolher() {
    this.tom({ freq: 1200, freqFinal: 300, duracao: 0.3, tipo: 'sine', ganho: 0.16 });
    this.sopro({ duracao: 0.3, corteInicial: 3000, corteFinal: 500, ganho: 0.14, q: 1.2 });
  }

  /** Clique seco ao passar a mira por um card do painel. */
  clique() {
    this.tom({ freq: 900, freqFinal: 1300, duracao: 0.05, tipo: 'triangle', ganho: 0.1 });
  }

  abrirPainel() {
    this.tom({ freq: 500, freqFinal: 900, duracao: 0.14, tipo: 'sine', ganho: 0.1 });
  }
}

export const audio = new Audio();
