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
 * Quantas falas dubladas cada espécie tem em public/dublagem/.
 *
 * São gravações de verdade — a voz do desenho, não o TTS de `tocarVozDoNome`
 * nem o guincho de oito bits dos jogos. Quem tem mais de uma sorteia a cada
 * grito: é o que impede o bicho de soar como um botão apertado duas vezes.
 *
 * O arquivo é `<id>-<n>.mp3`, com n começando em 1.
 */
const DUBLAGEM: Record<string, number> = {
  charmander: 2,
};

const TRILHA_BATALHA = './trilha/batalha.mp3';
const SFX_BRILHANTE = './sfx/brilhante.mp3';
const SFX_NIVEL = './sfx/nivel.mp3';

/** O volume da trilha, já contando que ela ainda passa pelo master. */
const GANHO_TRILHA = 0.42;

/**
 * O áudio do jogo: osciladores com envelope para quase tudo, e as poucas
 * gravações que não dá para sintetizar — a trilha da briga, o carimbo do
 * brilhante, a fanfarra de nível e as falas dubladas.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ruido: AudioBuffer | null = null;
  /** Os gritos gravados, por número da Pokédex. null = não existe arquivo. */
  private gritos = new Map<number, AudioBuffer | null>();
  private baixandoGrito = new Set<number>();
  /** As falas — o bicho dizendo o próprio nome. Ver `tocarVozDoNome`. */
  private vozes = new Map<number, AudioBuffer | null>();
  private baixandoVoz = new Set<number>();
  private pesos = new Map<number, number>();
  /**
   * Se a fala vem antes do grito. Segue o interruptor "Ele fala o nome" da
   * engrenagem; o jogo escreve aqui quando o ajuste muda.
   */
  vozDoNome = true;
  /** As gravações soltas — trilha e efeitos —, pelo caminho do arquivo. */
  private amostras = new Map<string, AudioBuffer | null>();
  private baixandoAmostra = new Set<string>();
  /** As falas dubladas, por `<id>-<n>`. Ver `DUBLAGEM`. */
  private dublagens = new Map<string, AudioBuffer | null>();
  /** A trilha de batalha tocando agora, se houver. */
  private trilha: AudioBufferSourceNode | null = null;
  private trilhaGanho: GainNode | null = null;
  /**
   * Se a trilha entra quando a briga começa. Segue o interruptor "Música de
   * batalha" da engrenagem; o jogo escreve aqui quando o ajuste muda.
   */
  musicaDeBatalha = true;

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

    // As gravações vão para a memória agora, e não no primeiro uso: um som que
    // chega meio segundo depois do brilhante aparecer não é mais o som do
    // brilhante aparecendo.
    void this.carregarAmostra(TRILHA_BATALHA);
    void this.carregarAmostra(SFX_BRILHANTE);
    void this.carregarAmostra(SFX_NIVEL);
    for (const [id, quantas] of Object.entries(DUBLAGEM)) {
      for (let n = 1; n <= quantas; n++) void this.carregarDublagem(`${id}-${n}`);
    }
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
    // A dublagem vem antes de todas: onde ela existe, é a voz de verdade — o
    // TTS e o grito dos jogos são as reservas de quem ainda não tem uma.
    if (this.vozDoNome && this.tocarDublagem(id, agudo)) return;
    if (num !== undefined && this.vozDoNome && this.tocarVozDoNome(num, agudo)) return;
    if (num !== undefined && this.tocarGritoGravado(num, agudo)) return;
    this.gritoSintetizado(id, agudo);
  }

  /**
   * Ele diz o próprio nome, do jeito do desenho.
   *
   * O grito dos jogos é um guincho de oito bits com uma camada de reverb; o que
   * fala "Char! Charmander!" é o dublador, e isso não existe em fonte nenhuma
   * que se possa baixar. Então as 151 falas são gravadas em build com o mesmo
   * TTS da Pokédex (ver tools/vozes.mjs) — uma voz só, 151 arquivos.
   *
   * Uma voz só seriam 151 bichos com a mesma garganta, então o TOM vem daqui:
   * cada espécie ganha uma velocidade de reprodução própria, deduzida do número
   * da Pokédex e do tamanho do bicho. Caterpie sai fininho e apressado, Snorlax
   * sai grave e arrastado, e os dois saem do mesmo arquivo de MP3 — que é
   * exatamente o truque que os jogos antigos usavam com um sample só.
   */
  private tocarVozDoNome(num: number, agudo: boolean): boolean {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return false;

    const pronto = this.vozes.get(num);
    if (pronto === undefined) {
      void this.carregarVoz(num);
      return false;
    }
    if (pronto === null) return false;

    const fonte = ctx.createBufferSource();
    fonte.buffer = pronto;
    fonte.playbackRate.value = this.tomDe(num) * (agudo ? 1.1 : 1);
    const ganho = ctx.createGain();
    ganho.gain.value = 0.72;
    fonte.connect(ganho).connect(master);
    fonte.start();
    return true;
  }

  /**
   * O tom da fala de cada espécie, entre 0,82 (grave e lento) e 1,34 (agudo e
   * apressado).
   *
   * Sai do número da Pokédex por uma mistura embaralhada de propósito: espécies
   * vizinhas na numeração costumam ser da mesma linha evolutiva, e uma progressão
   * suave daria Charmander, Charmeleon e Charizard com quase a mesma voz. O
   * peso, quando o jogo o informa, puxa o resultado para baixo — bicho pesado
   * fala grosso.
   */
  private tomDe(num: number): number {
    const embaralhado = (Math.imul(num, 2654435761) >>> 0) / 4294967295;
    const peso = this.pesos.get(num);
    // A escala do peso é logarítmica porque a Pokédex vai de 0,1 kg (Gastly) a
    // 460 kg (Snorlax), e uma régua linear deixaria 140 dos 151 no mesmo ponto.
    const corpo = peso === undefined ? 0.5 : 1 - Math.min(1, Math.log10(peso + 1) / 2.7);
    const t = embaralhado * 0.45 + corpo * 0.55;
    return 0.82 + t * 0.52;
  }

  /** O peso de cada espécie, para a voz acompanhar o corpo. Ver `tomDe`. */
  definirPesos(pesos: Iterable<[number, number]>) {
    this.pesos = new Map(pesos);
  }

  private async carregarVoz(num: number) {
    const ctx = this.ctx;
    if (!ctx || this.baixandoVoz.has(num)) return;
    this.baixandoVoz.add(num);
    try {
      const r = await fetch(`./vozes/${num}.mp3`);
      if (!r.ok) throw new Error(String(r.status));
      this.vozes.set(num, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch {
      // Sem arquivo, esta espécie volta para o grito dos jogos — e o null
      // impede que cada encontro tente baixar de novo o que não existe.
      this.vozes.set(num, null);
    } finally {
      this.baixandoVoz.delete(num);
    }
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

  // ---- gravações: trilha, efeitos e dublagem ----

  /**
   * Toca um arquivo solto. Devolve false quando ele ainda não chegou — quem
   * chama decide se cai no sintetizado ou se deixa passar em silêncio.
   */
  private tocarAmostra(caminho: string, ganho: number): boolean {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return false;

    const pronto = this.amostras.get(caminho);
    if (pronto === undefined) {
      void this.carregarAmostra(caminho);
      return false;
    }
    if (pronto === null) return false;

    const fonte = ctx.createBufferSource();
    fonte.buffer = pronto;
    const volume = ctx.createGain();
    volume.gain.value = ganho;
    fonte.connect(volume).connect(master);
    fonte.start();
    return true;
  }

  private async carregarAmostra(caminho: string) {
    const ctx = this.ctx;
    if (!ctx || this.baixandoAmostra.has(caminho)) return;
    this.baixandoAmostra.add(caminho);
    try {
      const r = await fetch(caminho);
      if (!r.ok) throw new Error(String(r.status));
      this.amostras.set(caminho, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch {
      // Sem o arquivo, o jogo segue com o que ele sempre teve: os osciladores.
      this.amostras.set(caminho, null);
    } finally {
      this.baixandoAmostra.delete(caminho);
    }
  }

  /**
   * O brilhante apareceu.
   *
   * Vem POR CIMA do `surgiu`, e não no lugar dele: aquele é o som de alguma
   * coisa nascendo na sala, este é o carimbo de raridade. Juntos dizem
   * "apareceu" e "corre" na mesma meia dúzia de quadros — e quem está de costas
   * para o bicho só tem o som para saber.
   */
  brilhante() {
    this.tocarAmostra(SFX_BRILHANTE, 0.85);
  }

  /** Subiu de nível. Cai no arpejo sintetizado se o arquivo não chegou. */
  subiuDeNivel() {
    if (!this.tocarAmostra(SFX_NIVEL, 0.8)) this.sucesso();
  }

  /**
   * A trilha da briga, em loop, enquanto houver selvagem no alcance.
   *
   * Entra em fade porque ela começa no meio de uma cena que já está
   * acontecendo — um corte seco soaria como um erro de reprodução. Chamar duas
   * vezes não empilha: a segunda não faz nada, e é por isso que o laço do jogo
   * pode chamar isto a cada quadro sem pensar.
   */
  batalhaComecou() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.trilha || !this.musicaDeBatalha) return;

    const pronto = this.amostras.get(TRILHA_BATALHA);
    if (pronto === undefined) {
      void this.carregarAmostra(TRILHA_BATALHA);
      return;
    }
    if (pronto === null) return;

    const t0 = this.agora;
    const fonte = ctx.createBufferSource();
    fonte.buffer = pronto;
    fonte.loop = true;

    const volume = ctx.createGain();
    volume.gain.setValueAtTime(0.0001, t0);
    volume.gain.exponentialRampToValueAtTime(GANHO_TRILHA, t0 + 0.8);

    fonte.connect(volume).connect(master);
    fonte.start(t0);
    this.trilha = fonte;
    this.trilhaGanho = volume;
  }

  /** Acabou a briga: a trilha some em pouco mais de um segundo. */
  batalhaAcabou() {
    const fonte = this.trilha;
    const volume = this.trilhaGanho;
    if (!fonte || !volume || !this.ctx) return;
    this.trilha = null;
    this.trilhaGanho = null;

    const t0 = this.agora;
    volume.gain.cancelScheduledValues(t0);
    volume.gain.setValueAtTime(Math.max(0.0001, volume.gain.value), t0);
    volume.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    fonte.stop(t0 + 1.3);
  }

  /**
   * A fala dublada, sorteada entre as que a espécie tem.
   *
   * Sortear importa mais do que parece: um bicho que repete a MESMA gravação a
   * cada golpe vira um efeito sonoro, e o que se quer aqui é o contrário — que
   * ele pareça estar falando. Duas falas já bastam para o ouvido parar de
   * prever qual vem.
   *
   * Quem ainda não baixou fica de fora do sorteio em vez de segurar o som: é
   * melhor ouvir uma das duas na hora certa do que as duas tarde demais.
   */
  private tocarDublagem(id: string, agudo: boolean): boolean {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return false;

    const quantas = DUBLAGEM[id];
    if (!quantas) return false;

    const prontas: AudioBuffer[] = [];
    for (let n = 1; n <= quantas; n++) {
      const chave = `${id}-${n}`;
      const buffer = this.dublagens.get(chave);
      if (buffer === undefined) void this.carregarDublagem(chave);
      else if (buffer) prontas.push(buffer);
    }
    if (prontas.length === 0) return false;

    const fonte = ctx.createBufferSource();
    fonte.buffer = prontas[Math.floor(Math.random() * prontas.length)];
    // Quase nada de mudança de tom: isto é uma voz de verdade, e esticá-la como
    // se faz com o TTS em `tomDe` entregaria na hora que é um truque. O empurrão
    // do brilhante fica no limite do perceptível de propósito.
    fonte.playbackRate.value = agudo ? 1.08 : 1;
    const volume = ctx.createGain();
    volume.gain.value = 0.9;
    fonte.connect(volume).connect(master);
    fonte.start();
    return true;
  }

  private async carregarDublagem(chave: string) {
    const ctx = this.ctx;
    if (!ctx || this.baixandoAmostra.has(chave)) return;
    this.baixandoAmostra.add(chave);
    try {
      const r = await fetch(`./dublagem/${chave}.mp3`);
      if (!r.ok) throw new Error(String(r.status));
      this.dublagens.set(chave, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch {
      // Faltou o arquivo: esta espécie volta para o TTS, e o null impede que
      // cada grito tente baixar de novo o que não existe.
      this.dublagens.set(chave, null);
    } finally {
      this.baixandoAmostra.delete(chave);
    }
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
