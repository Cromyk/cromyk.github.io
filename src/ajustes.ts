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
  | 'maoRecuada';

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
    id: 'maoRecuada',
    nome: 'Mão mais atrás',
    ligadoDiz: 'dois centímetros para trás, se ela parecer adiantada',
    desligadoDiz: 'no encaixe medido',
  },
  {
    id: 'contadorDeQuadros',
    nome: 'Contador de quadros',
    ligadoDiz: 'mostra ms, fps e draw calls',
    desligadoDiz: 'sem medição na tela',
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
   * A mão desenhada dois centímetros mais para trás. Ver `recuar`, em glove.ts.
   *
   * É um ajuste de CALIBRAÇÃO, não de gosto: o encaixe medido já corrigiu 4,55
   * cm de mão adiantada (ver PLAYTEST.md), e se ainda sobrar alguma coisa, quem
   * sabe é quem está com o headset. Existir como interruptor é o que permite
   * comparar os dois na mesma sessão, com a mão na frente do rosto.
   */
  maoRecuada = false;

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
      if (typeof dados.maoRecuada === 'boolean') this.maoRecuada = dados.maoRecuada;
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
          maoRecuada: this.maoRecuada,
        }),
      );
    } catch {
      /* sem persistência desta vez */
    }
  }
}
