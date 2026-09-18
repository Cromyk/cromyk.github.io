import { MODOS, MODO_PADRAO, modoPorId, type ModoId } from './modos';

/**
 * Os ajustes do jogo, guardados no headset.
 *
 * Eles moram fora do `Dex` de propósito: aquilo é a sua COLEÇÃO — os bichos, a
 * mochila, o que a Pokédex já viu — e misturar "qual a dificuldade" com "quais
 * Pokémon são meus" tornaria impossível, por exemplo, zerar o progresso sem
 * zerar as preferências.
 *
 * Tudo aqui é acessível por um lugar só: a engrenagem no painel do pulso.
 */

export type Dificuldade = 'tranquilo' | 'normal' | 'duro';

export interface PerfilDificuldade {
  id: Dificuldade;
  nome: string;
  resumo: string;
  cor: string;
  /** Multiplica o dano que o SEU Pokémon leva. */
  danoRecebido: number;
  /**
   * Quanto tempo o inimigo passa carregando antes de o golpe sair, em segundos.
   *
   * É o número mais importante deste arquivo. A queixa que originou tudo isto
   * foi "não dá nem tempo para reação": o golpe do selvagem saía com 0,26 s de
   * aviso, que é menos do que o tempo de perceber, decidir e mexer o braço.
   */
  avisoSegundos: number;
}

export const DIFICULDADES: readonly PerfilDificuldade[] = [
  {
    id: 'tranquilo',
    nome: 'Tranquilo',
    resumo: 'ele bate leve e avisa muito',
    cor: '#7fd6a8',
    danoRecebido: 0.6,
    avisoSegundos: 2.0,
  },
  {
    id: 'normal',
    nome: 'Normal',
    resumo: 'dá tempo de reagir',
    cor: '#8ab6ff',
    danoRecebido: 1,
    avisoSegundos: 1.4,
  },
  {
    id: 'duro',
    nome: 'Duro',
    resumo: 'o aviso é curto',
    cor: '#ff8a6b',
    danoRecebido: 1.35,
    avisoSegundos: 0.85,
  },
];

export const dificuldadePorId = (id: string) =>
  DIFICULDADES.find((d) => d.id === id) ?? DIFICULDADES[1];

/** Os interruptores simples da engrenagem: ligado ou desligado. */
export type ChaveAjuste =
  | 'vozDaDex'
  | 'contornoDaSala'
  | 'avisoDeGolpe'
  | 'tamanhoReal'
  | 'vozDoNome'
  | 'musicaDeBatalha'
  | 'contadorDeQuadros'
  | 'calibrarMao'
  | 'oclusaoDoQuarto'
  | 'modoSentado';

interface Interruptor {
  id: ChaveAjuste;
  nome: string;
  ligadoDiz: string;
  desligadoDiz: string;
}

export const INTERRUPTORES: readonly Interruptor[] = [
  {
    id: 'tamanhoReal',
    nome: 'Tamanho real',
    ligadoDiz: 'do tamanho da Pokédex — Onix tem 8,8 m',
    desligadoDiz: 'encolhidos para caber na sala',
  },
  {
    id: 'vozDoNome',
    nome: 'Ele fala o nome',
    ligadoDiz: 'Char! Charmander!',
    desligadoDiz: 'o grito dos jogos',
  },
  {
    id: 'musicaDeBatalha',
    nome: 'Música de batalha',
    ligadoDiz: 'a trilha entra quando a briga começa',
    desligadoDiz: 'só os sons da sala',
  },
  {
    id: 'vozDaDex',
    nome: 'Voz da Pokédex',
    ligadoDiz: 'lê a ficha em voz alta',
    desligadoDiz: 'só texto na tela',
  },
  {
    id: 'avisoDeGolpe',
    nome: 'Barra de carga',
    ligadoDiz: 'mostra quando ele vai atacar',
    desligadoDiz: 'sem contagem no inimigo',
  },
  {
    id: 'modoSentado',
    nome: 'Modo sentado',
    ligadoDiz: 'tudo acontece mais perto, sem precisar andar',
    desligadoDiz: 'distâncias de quem joga de pé',
  },
  {
    id: 'calibrarMao',
    nome: 'Calibrar a mão',
    ligadoDiz: 'analógicos giram e recuam a mão · A zera',
    desligadoDiz: 'usa a calibração guardada',
  },
  {
    id: 'contadorDeQuadros',
    nome: 'Contador de quadros',
    ligadoDiz: 'mostra ms, fps e draw calls',
    desligadoDiz: 'sem medição na tela',
  },
  {
    id: 'oclusaoDoQuarto',
    nome: 'Sumir atrás das coisas',
    ligadoDiz: 'o quarto tapa quem está atrás — pessoas inclusive',
    desligadoDiz: 'os Pokémon aparecem por cima de tudo',
  },
  {
    id: 'contornoDaSala',
    nome: 'Contorno da sala',
    ligadoDiz: 'desenha as superfícies mapeadas',
    desligadoDiz: 'sala invisível',
  },
];

const CHAVE = 'critter-quest/ajustes/v1';

export class Ajustes {
  modo: ModoId = MODO_PADRAO.id;
  dificuldade: Dificuldade = 'normal';
  vozDaDex = true;
  avisoDeGolpe = true;
  contornoDaSala = false;
  /**
   * Os Pokémon do tamanho que a Pokédex diz, em metros de verdade.
   *
   * Ligado por padrão, e é a coisa mais cara deste arquivo: um Onix de 8,8 m
   * não cabe em quarto nenhum, e é exatamente esse o ponto — ver um bicho que
   * atravessa a parede da sala é uma coisa que só a realidade misturada faz.
   * Desligado, vale a curva de compressão antiga (ver `alturaNaSala`, em
   * src/species.ts).
   */
  tamanhoReal = true;
  /** A voz dizendo o nome, no lugar do grito dos jogos. Ver src/audio.ts. */
  vozDoNome = true;
  /**
   * A trilha enquanto você briga.
   *
   * Tem interruptor porque isto é realidade misturada: música em loop por cima
   * da sala de casa é uma coisa que algumas pessoas querem e outras não
   * aguentam dez minutos — e quem joga de madrugada não pode nem escolher.
   */
  musicaDeBatalha = true;
  /**
   * O medidor de quadros, preso ao canto da visão. Ver src/medidor.ts.
   *
   * Desligado por padrão porque é ferramenta, não jogo — mas mora aqui, e não
   * atrás de uma flag de código, justamente para poder ser ligado NO headset,
   * no meio de uma sessão, que é a única hora em que o número vale alguma
   * coisa.
   */
  contadorDeQuadros = false;
  /**
   * O modo de calibração da mão, ligado na engrenagem.
   *
   * ## Por que um modo, e não um número que eu escolho
   *
   * O relato do playtest de 18/09 foi: *"posição de mão — não é o problema de
   * posição e sim de rotação e encaixe"*. Isto substitui o interruptor "Mão
   * mais atrás", que oferecia dois centímetros para trás e nada mais, e que
   * existia pela mesma razão: o encaixe é ao mesmo tempo uma questão de MEDIDA
   * e de SENSAÇÃO, e as duas podem discordar.
   *
   * A medida está feita e conferida (ver o comentário do `encaixe` em
   * src/glove.ts, e a tabela de juntas em PLAYTEST.md, que já corrigiu 4,55 cm
   * de mão adiantada). O que sobra é a rotação, e ela não se resolve no papel:
   * quando você fecha a mão em volta do cabo de um Touch, o cabo atravessa a
   * palma na DIAGONAL — não paralelo aos dedos —, e o quanto dessa diagonal é
   * a sua mão em particular é coisa que só quem está com o controle sabe.
   *
   * Então em vez de eu escolher três ângulos no escuro, ligados eles ficam nos
   * analógicos, com a mão na frente do rosto, e o número que ficar é o que o
   * playtest disser. Ver `ajustarMao`.
   */
  calibrarMao = false;
  /** Giro extra da mão no espaço do grip, em RADIANOS. Ver `ajustarMao`. */
  maoGiroX = 0;
  maoGiroY = 0;
  maoGiroZ = 0;
  /** Recuo da mão na direção do antebraço, em metros. */
  maoRecuo = 0;
  /**
   * A oclusão pelo sensor de profundidade do headset.
   *
   * ## O que ela é
   *
   * O Quest 3 mede a distância de cada pedaço do que você está vendo, quadro a
   * quadro. Com isso, um Pokémon que esteja ATRÁS do sofá é tapado pelo sofá; e
   * como a medida é refeita a cada quadro, ela enxerga o que se mexe — a porta
   * que abriu, a cadeira que você arrastou, e uma pessoa que entrou na sala.
   *
   * É a resposta possível ao "reconhecendo… pessoas" do playtest de 18/09: não
   * existe, em WebXR, API que diga *ali está uma pessoa*. O que existe é a
   * profundidade — e ela não precisa saber o que a coisa É para tapar o que
   * está atrás dela.
   *
   * ## Por que nasce desligada
   *
   * Porque o modo de falhar dela é bruto: se a profundidade vier zerada ou
   * perto demais, TUDO fica escondido — os Pokémon, os painéis, e a própria
   * engrenagem em que se desliga isto. Um ajuste cuja falha esconde o botão de
   * desligar não pode vir ligado antes de alguém o ter visto funcionando com o
   * headset na cabeça.
   *
   * Há também um efeito conhecido e sem conserto barato: com CONTROLE na mão, a
   * sua mão de verdade está exatamente onde a mão desenhada está, e a
   * profundidade discorda do desenho por milímetros — a luva pode piscar. Com
   * hand tracking não: aí a mão de verdade tapar a desenhada é o certo.
   */
  oclusaoDoQuarto = false;
  /**
   * As distâncias do jogo encolhem para quem não vai levantar do sofá.
   *
   * Ver `Pokemon.escalaPessoal`: o bicho para mais perto, passeia num raio
   * menor e nasce mais perto. É calibração e não mecânica nova — todas essas
   * distâncias já passavam por um lugar só.
   */
  modoSentado = false;

  constructor() {
    this.carregar();
  }

  get perfil(): PerfilDificuldade {
    return dificuldadePorId(this.dificuldade);
  }

  get modoAtual() {
    return modoPorId(this.modo) ?? MODO_PADRAO;
  }

  ligado(chave: ChaveAjuste): boolean {
    return this[chave];
  }

  alternar(chave: ChaveAjuste): boolean {
    this[chave] = !this[chave];
    this.salvar();
    return this[chave];
  }

  /**
   * Soma à calibração da mão e guarda. Os giros vêm em radianos.
   *
   * Os limites não são decoração: passar de 45° em qualquer eixo põe a mão num
   * lugar onde ela não é mais "a sua mão levemente torta", e sim uma mão
   * desencaixada — e quem estivesse mexendo no analógico sem olhar acabaria
   * perdido sem saber que passou do ponto. O recuo vai de -2 a +8 cm: negativo
   * é a mão mais à frente, que alguém pode querer, e oito centímetros para trás
   * já é o punho no meio do antebraço.
   */
  ajustarMao(dx: number, dy: number, dz: number, dRecuo: number) {
    const limite = Math.PI * 0.25;
    const preso = (v: number) => Math.max(-limite, Math.min(limite, v));
    this.maoGiroX = preso(this.maoGiroX + dx);
    this.maoGiroY = preso(this.maoGiroY + dy);
    this.maoGiroZ = preso(this.maoGiroZ + dz);
    this.maoRecuo = Math.max(-0.02, Math.min(0.08, this.maoRecuo + dRecuo));
    this.salvar();
  }

  /** Volta a mão para o encaixe medido. É a saída de quem se perdeu mexendo. */
  zerarMao() {
    this.maoGiroX = 0;
    this.maoGiroY = 0;
    this.maoGiroZ = 0;
    this.maoRecuo = 0;
    this.salvar();
  }

  definirModo(id: ModoId) {
    if (!MODOS.some((m) => m.id === id)) return;
    this.modo = id;
    this.salvar();
  }

  definirDificuldade(id: Dificuldade) {
    if (!DIFICULDADES.some((d) => d.id === id)) return;
    this.dificuldade = id;
    this.salvar();
  }

  private carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return;
      const dados = JSON.parse(bruto) as Partial<Ajustes>;
      if (dados.modo && modoPorId(dados.modo)) this.modo = dados.modo;
      if (dados.dificuldade && DIFICULDADES.some((d) => d.id === dados.dificuldade)) {
        this.dificuldade = dados.dificuldade;
      }
      if (typeof dados.vozDaDex === 'boolean') this.vozDaDex = dados.vozDaDex;
      if (typeof dados.avisoDeGolpe === 'boolean') this.avisoDeGolpe = dados.avisoDeGolpe;
      if (typeof dados.contornoDaSala === 'boolean') this.contornoDaSala = dados.contornoDaSala;
      if (typeof dados.tamanhoReal === 'boolean') this.tamanhoReal = dados.tamanhoReal;
      if (typeof dados.vozDoNome === 'boolean') this.vozDoNome = dados.vozDoNome;
      if (typeof dados.musicaDeBatalha === 'boolean') this.musicaDeBatalha = dados.musicaDeBatalha;
      // Estes dois faltavam na gravação, e o contador voltava desligado a cada
      // sessão mesmo depois de ligado — um ajuste que não persiste é um ajuste
      // que ninguém usa duas vezes.
      if (typeof dados.contadorDeQuadros === 'boolean') this.contadorDeQuadros = dados.contadorDeQuadros;
      // O interruptor "Mão mais atrás" virou calibração contínua. Quem tinha os
      // dois centímetros ligados continua com eles — em metros, agora.
      const antigo = dados as unknown as { maoRecuada?: boolean };
      if (antigo.maoRecuada === true && typeof dados.maoRecuo !== 'number') this.maoRecuo = 0.02;
      if (typeof dados.maoGiroX === 'number') this.maoGiroX = dados.maoGiroX;
      if (typeof dados.maoGiroY === 'number') this.maoGiroY = dados.maoGiroY;
      if (typeof dados.maoGiroZ === 'number') this.maoGiroZ = dados.maoGiroZ;
      if (typeof dados.maoRecuo === 'number') this.maoRecuo = dados.maoRecuo;
      // `calibrarMao` NÃO é lido de volta: é um modo de trabalho, e voltar de
      // uma sessão com os analógicos sequestrados seria uma surpresa.
      if (typeof dados.oclusaoDoQuarto === 'boolean') this.oclusaoDoQuarto = dados.oclusaoDoQuarto;
      if (typeof dados.modoSentado === 'boolean') this.modoSentado = dados.modoSentado;
    } catch {
      // Armazenamento bloqueado: joga com os padrões, que são os bons.
    }
  }

  private salvar() {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({
          modo: this.modo,
          dificuldade: this.dificuldade,
          vozDaDex: this.vozDaDex,
          avisoDeGolpe: this.avisoDeGolpe,
          contornoDaSala: this.contornoDaSala,
          tamanhoReal: this.tamanhoReal,
          vozDoNome: this.vozDoNome,
          musicaDeBatalha: this.musicaDeBatalha,
          contadorDeQuadros: this.contadorDeQuadros,
          maoGiroX: this.maoGiroX,
          maoGiroY: this.maoGiroY,
          maoGiroZ: this.maoGiroZ,
          maoRecuo: this.maoRecuo,
          oclusaoDoQuarto: this.oclusaoDoQuarto,
          modoSentado: this.modoSentado,
        }),
      );
    } catch {
      /* sem persistência desta vez */
    }
  }
}
