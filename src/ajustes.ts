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
export type ChaveAjuste = 'vozDaDex' | 'contornoDaSala' | 'avisoDeGolpe';

interface Interruptor {
  id: ChaveAjuste;
  nome: string;
  ligadoDiz: string;
  desligadoDiz: string;
}

export const INTERRUPTORES: readonly Interruptor[] = [
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
        }),
      );
    } catch {
      /* sem persistência desta vez */
    }
  }
}
