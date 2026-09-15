import type { Tipo } from './pokedex.gen';

/** Em que família sonora cada um dos dezoito tipos cai. */
const FAMILIA_SONORA: Record<Tipo, 'rugido' | 'jorro' | 'corte' | 'estalo' | 'baque' | 'sombra'> = {
  fogo: 'rugido',
  agua: 'jorro',
  gelo: 'jorro',
  planta: 'corte',
  inseto: 'corte',
  voador: 'corte',
  aco: 'corte',
  eletrico: 'estalo',
  psiquico: 'estalo',
  fada: 'estalo',
  normal: 'baque',
  lutador: 'baque',
  terra: 'baque',
  pedra: 'baque',
  veneno: 'sombra',
  fantasma: 'sombra',
  sombrio: 'sombra',
  dragao: 'sombra',
};

/**
 * Áudio 100% sintetizado na WebAudio — nenhum arquivo de som no pacote.
 * Tudo aqui é osciladores e ruído com envelope.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ruido: AudioBuffer | null = null;
  /** Os gritos gravados, por número da Pokédex. null = não existe arquivo. */
  private gritos = new Map<number, AudioBuffer | null>();
  private baixandoGrito = new Set<number>();

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

  /**
   * Cada tipo soa diferente, mas dezoito timbres distintos não se distinguem
   * numa batalha de três segundos — e cada um seria mais código de áudio para o
   * headset processar. Então os dezoito caem em seis famílias, escolhidas pelo
   * que a gente REPARA: o fogo ruge, a água jorra, o corte assobia, a energia
   * estala, o golpe de corpo dá um baque e o sombrio sopra grave.
   */
  golpe(tipo: Tipo) {
    switch (FAMILIA_SONORA[tipo]) {
      case 'rugido':
        this.sopro({ duracao: 0.5, corteInicial: 380, corteFinal: 1500, ganho: 0.26, q: 0.9 });
        this.tom({ freq: 110, freqFinal: 70, duracao: 0.45, tipo: 'sawtooth', ganho: 0.12 });
        break;
      case 'jorro':
        this.sopro({ duracao: 0.5, corteInicial: 1800, corteFinal: 700, ganho: 0.24, q: 1.6 });
        this.tom({ freq: 320, freqFinal: 180, duracao: 0.4, tipo: 'sine', ganho: 0.1 });
        break;
      case 'corte':
        this.sopro({ duracao: 0.22, corteInicial: 2600, corteFinal: 1200, ganho: 0.2, q: 4 });
        this.tom({ freq: 700, freqFinal: 420, duracao: 0.22, tipo: 'triangle', ganho: 0.12 });
        break;
      case 'estalo':
        this.sopro({ duracao: 0.32, corteInicial: 3200, corteFinal: 900, ganho: 0.28, q: 0.7 });
        this.tom({ freq: 1400, freqFinal: 300, duracao: 0.3, tipo: 'square', ganho: 0.12 });
        break;
      case 'baque':
        this.sopro({ duracao: 0.18, corteInicial: 900, corteFinal: 200, ganho: 0.3, q: 1.2 });
        this.tom({ freq: 160, freqFinal: 60, duracao: 0.24, tipo: 'triangle', ganho: 0.16 });
        break;
      case 'sombra':
        this.sopro({ duracao: 0.55, corteInicial: 700, corteFinal: 160, ganho: 0.22, q: 2.2 });
        this.tom({ freq: 90, freqFinal: 52, duracao: 0.5, tipo: 'sine', ganho: 0.14 });
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

  /** Ordem aceita: o "vá até ali" saindo da mão. */
  comando() {
    this.tom({ freq: 620, freqFinal: 940, duracao: 0.1, tipo: 'triangle', ganho: 0.14 });
    this.tom({ freq: 940, duracao: 0.14, tipo: 'sine', ganho: 0.1, atraso: 0.08 });
  }

  /** Nada feito: você pediu uma coisa que não dava. */
  recusa() {
    this.tom({ freq: 300, freqFinal: 190, duracao: 0.16, tipo: 'square', ganho: 0.1 });
  }

  /**
   * O chamado da isca: três notas subindo, como quem assobia para um bicho.
   *
   * Sobe de propósito. Frase que desce soa como despedida, e esta precisa soar
   * como convite — é o som de alguma coisa boa aparecendo, não indo embora.
   */
  chamado() {
    [523.25, 659.25, 880].forEach((freq, i) => {
      this.tom({ freq, duracao: 0.18, tipo: 'triangle', ganho: 0.16, atraso: i * 0.1 });
      this.tom({ freq: freq * 2, duracao: 0.12, tipo: 'sine', ganho: 0.05, atraso: i * 0.1 });
    });
  }

  /** Enquanto a isca está na mão procurando alguém: um tilintar curto. */
  tilintar() {
    this.tom({ freq: 1500, freqFinal: 1900, duracao: 0.06, tipo: 'sine', ganho: 0.05 });
  }

  /**
   * O inimigo começou a carregar o golpe.
   *
   * Duas notas subindo e um sopro que abre — o vocabulário universal de "vem
   * coisa". Este som é metade do aviso: quem está de costas para o bicho, ou
   * com a Pokédex aberta na frente do rosto, não vê a barra encher, e precisa
   * ouvir que o relógio virou.
   */
  carregando() {
    this.tom({ freq: 330, freqFinal: 520, duracao: 0.22, tipo: 'triangle', ganho: 0.11 });
    this.sopro({ duracao: 0.34, corteInicial: 400, corteFinal: 1500, ganho: 0.08, q: 2.2 });
  }

  /**
   * "O quê?" — o instante em que dá para evoluir, antes de você responder.
   *
   * Duas notas, a segunda mais alta e sustentada: é uma pergunta, e pergunta
   * termina subindo. O jogo inteiro depende de você olhar para a tela agora.
   */
  evoluindo() {
    this.tom({ freq: 587.33, duracao: 0.22, tipo: 'triangle', ganho: 0.16 });
    this.tom({ freq: 783.99, duracao: 0.5, tipo: 'triangle', ganho: 0.18, atraso: 0.2 });
    this.tom({ freq: 1568, duracao: 0.4, tipo: 'sine', ganho: 0.06, atraso: 0.2 });
  }

  /**
   * A transformação: um zumbido que sobe por quase três segundos e estoura.
   *
   * O som acompanha o branco de src/evolucao.ts na mesma curva — ele fica quase
   * parado no começo e dispara no fim. É o que faz o clarão parecer a
   * consequência do som, e não duas coisas acontecendo ao mesmo tempo.
   */
  evoluir() {
    this.tom({ freq: 220, freqFinal: 1760, duracao: 2.8, tipo: 'sawtooth', ganho: 0.1 });
    this.tom({ freq: 330, freqFinal: 2640, duracao: 2.8, tipo: 'sine', ganho: 0.07 });
    this.sopro({ duracao: 2.8, corteInicial: 300, corteFinal: 5200, ganho: 0.1, q: 1.4 });
    // O estouro, cravado no fim do brilho.
    this.sopro({ duracao: 0.5, corteInicial: 6000, corteFinal: 700, ganho: 0.3, q: 0.8, atraso: 2.75 });
    this.tom({ freq: 1046.5, duracao: 0.6, tipo: 'triangle', ganho: 0.2, atraso: 2.78 });
  }

  /** Buff sobe, debuff desce. A direção da frase É a informação. */
  golpeDeStatus(subiu: boolean) {
    const notas = subiu ? [392, 523.25, 659.25] : [659.25, 523.25, 392];
    notas.forEach((freq, i) =>
      this.tom({ freq, duracao: 0.2, tipo: 'sine', ganho: 0.13, atraso: i * 0.07 }),
    );
    this.sopro({
      duracao: 0.3,
      corteInicial: subiu ? 600 : 2200,
      corteFinal: subiu ? 2200 : 600,
      ganho: 0.07,
      q: 2,
    });
  }

  // ---- vozes dos bichos ----

  /**
   * O grito de cada um dos quatro iniciais.
   *
   * Nada aqui é sample: são osciladores, como todo o resto do áudio do jogo.
   * O que distingue um do outro não é o timbre — num headset, com passthrough e
   * o barulho do quarto, timbre some — e sim o CONTORNO: quantas sílabas, se a
   * entoação sobe ou desce, se é seco ou arrastado.
   *
   * - Pikachu: duas sílabas, a segunda mais aguda e mais curta. É o "pi-KA".
   * - Charmander: uma sílaba raspada com vibrato, que desce no fim.
   * - Squirtle: gorgolejo — modulação rápida e um estalo de bolha no meio.
   * - Bulbasaur: grave, longo, com um repuxo para cima no fim.
   */
  /**
   * O grito da espécie. Toca o ARQUIVO oficial quando ele existe, e cai no
   * sintetizado quando não.
   *
   * Os arquivos vêm do repositório de áudio da PokeAPI (ver tools/gritos.mjs) —
   * são os gritos dos jogos. A reserva sintetizada continua no código porque
   * ela é o que toca no primeiro encontro de cada espécie, antes de o arquivo
   * chegar, e porque sem rede nenhuma o jogo precisa continuar tendo voz.
   */
  grito(id: string, agudo = false, num?: number) {
    if (num !== undefined && this.tocarGritoGravado(num, agudo)) return;
    this.gritoSintetizado(id, agudo);
  }

  /** Devolve false quando o arquivo ainda não chegou — aí o sintetizado entra. */
  private tocarGritoGravado(num: number, agudo: boolean): boolean {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return false;

    const pronto = this.gritos.get(num);
    if (pronto === undefined) {
      void this.carregarGrito(num);
      return false;
    }
    if (pronto === null) return false;

    const fonte = ctx.createBufferSource();
    fonte.buffer = pronto;
    // Brilhante e Pikachu tocam um tom acima: é o mesmo truque do sintetizado,
    // e é o que faz um brilhante soar diferente sem um segundo arquivo.
    fonte.playbackRate.value = agudo ? 1.14 : 1;
    const ganho = ctx.createGain();
    ganho.gain.value = 0.55;
    fonte.connect(ganho).connect(master);
    fonte.start();
    return true;
  }

  private async carregarGrito(num: number) {
    const ctx = this.ctx;
    if (!ctx || this.baixandoGrito.has(num)) return;
    this.baixandoGrito.add(num);
    try {
      const r = await fetch(`./gritos/${num}.ogg`);
      if (!r.ok) throw new Error(String(r.status));
      this.gritos.set(num, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch {
      // Guardar o null impede que cada encontro tente baixar de novo o que não
      // existe — e o sintetizado assume para sempre nessa espécie.
      this.gritos.set(num, null);
    } finally {
      this.baixandoGrito.delete(num);
    }
  }

  private gritoSintetizado(id: string, agudo = false) {
    const oitava = agudo ? 1.18 : 1;
    switch (id) {
      case 'pikachu':
      case 'raichu': {
        this.tom({ freq: 780 * oitava, freqFinal: 1180 * oitava, duracao: 0.13, tipo: 'square', ganho: 0.1 });
        this.tom({ freq: 1150 * oitava, freqFinal: 1900 * oitava, duracao: 0.17, tipo: 'square', ganho: 0.13, atraso: 0.15 });
        this.tom({ freq: 2300 * oitava, freqFinal: 1500 * oitava, duracao: 0.1, tipo: 'sine', ganho: 0.05, atraso: 0.15 });
        this.sopro({ duracao: 0.07, corteInicial: 3000, corteFinal: 1400, ganho: 0.05, q: 3, atraso: 0.14 });
        break;
      }
      case 'charmander':
      case 'charmeleon':
      case 'charizard': {
        this.vibrato(560 * oitava, 430 * oitava, 0.42, 'sawtooth', 0.12, 22, 26);
        this.sopro({ duracao: 0.34, corteInicial: 1500, corteFinal: 520, ganho: 0.1, q: 1.1 });
        this.tom({ freq: 300 * oitava, freqFinal: 210 * oitava, duracao: 0.3, tipo: 'triangle', ganho: 0.07, atraso: 0.1 });
        break;
      }
      case 'squirtle':
      case 'wartortle':
      case 'blastoise': {
        this.vibrato(690 * oitava, 560 * oitava, 0.36, 'triangle', 0.13, 14, 60);
        // O estalo molhado no meio é o que faz a voz soar aquática.
        this.sopro({ duracao: 0.1, corteInicial: 2400, corteFinal: 700, ganho: 0.12, q: 5, atraso: 0.14 });
        this.tom({ freq: 900 * oitava, freqFinal: 1250 * oitava, duracao: 0.14, tipo: 'sine', ganho: 0.08, atraso: 0.24 });
        break;
      }
      case 'bulbasaur':
      case 'ivysaur':
      case 'venusaur': {
        this.vibrato(330 * oitava, 290 * oitava, 0.46, 'triangle', 0.15, 9, 22);
        this.tom({ freq: 290 * oitava, freqFinal: 470 * oitava, duracao: 0.2, tipo: 'sine', ganho: 0.1, atraso: 0.4 });
        this.sopro({ duracao: 0.5, corteInicial: 700, corteFinal: 380, ganho: 0.07, q: 1.6 });
        break;
      }
      default: {
        // Quem não tem voz própria ganha uma neutra, derivada do id para que o
        // mesmo bicho soe sempre igual: um Rattata não pode mudar de voz a cada
        // encontro só porque o grito foi sorteado na hora.
        let semente = 0;
        for (let i = 0; i < id.length; i++) semente = (semente * 31 + id.charCodeAt(i)) % 997;
        const base = (420 + (semente % 420)) * oitava;
        this.vibrato(base, base * 0.78, 0.3, semente % 2 ? 'triangle' : 'square', 0.1, 11, 30);
        break;
      }
    }
  }

  /** Ronronado curto: o bicho gostou do carinho. */
  carinho() {
    this.vibrato(280, 330, 0.5, 'triangle', 0.09, 24, 14);
    this.tom({ freq: 620, freqFinal: 820, duracao: 0.22, tipo: 'sine', ganho: 0.07, atraso: 0.18 });
  }

  /**
   * Um tom com trêmulo de altura. É o que separa um grito de bicho de um bipe:
   * voz viva nunca segura a nota parada.
   */
  private vibrato(
    freq: number,
    freqFinal: number,
    duracao: number,
    tipo: OscillatorType,
    ganho: number,
    taxa: number,
    profundidade: number,
  ) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t0 = this.agora;

    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqFinal), t0 + duracao);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = taxa;
    const profundidadeGanho = ctx.createGain();
    profundidadeGanho.gain.value = profundidade;
    lfo.connect(profundidadeGanho).connect(osc.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(ganho, t0 + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);

    osc.connect(env).connect(master);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + duracao + 0.02);
    lfo.stop(t0 + duracao + 0.02);
  }

  // ---- narração gravada ----

  /**
   * O contexto, para a narração da Pokédex (src/voz.ts) tocar sem abrir um
   * segundo AudioContext — o Quest reclama do segundo e às vezes o cala.
   *
   * A voz NÃO passa pelo `master`: ela liga direto na saída, porque quem abaixa
   * o master enquanto ela fala é justamente ela.
   */
  get contexto(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Abaixa tudo o que não é voz enquanto a Pokédex fala, e devolve ao normal
   * depois. Sem isto a narração compete com o jogo e não se entende metade.
   */
  abafar(quanto: number, segundos: number) {
    const master = this.master;
    if (!master || !this.ctx) return;
    const t = this.agora;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0.55 * quanto, t + 0.25);
    master.gain.setValueAtTime(0.55 * quanto, t + Math.max(0.3, segundos - 0.4));
    master.gain.linearRampToValueAtTime(0.55, t + Math.max(0.6, segundos));
  }
}

export const audio = new Audio();
