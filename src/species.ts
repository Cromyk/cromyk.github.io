import * as THREE from 'three';
import { EFETIVIDADE, POKEDEX, type EntradaDex, type Tipo } from './pokedex.gen';
import { temModelo, temShiny } from './modelos';
import { APRENDE, GOLPES_DEX } from './golpes.gen';
import { EVOLUI_SO_COM_PEDRA, PEDRAS, evolucaoPorPedra } from './pedras';
import type { Preferencia } from './room';

export type { Tipo } from './pokedex.gen';

/**
 * A camada de jogo por cima da Pokédex.
 *
 * src/pokedex.gen.ts é a verdade crua da PokeAPI — tipos, stats-base, alturas,
 * taxas de captura, linhas evolutivas dos 151. Aqui essa verdade vira coisas
 * que só fazem sentido dentro de um quarto com o headset na cabeça: que tamanho
 * o bicho tem na sua sala, com que frequência aparece, que golpe usa, quanto
 * custa derrubar e quanto custa prender.
 *
 * Nada aqui é inventado do zero: tudo sai de um número da Pokédex passado por
 * uma curva. É o que mantém Onix imponente ao lado de um Diglett sem que ele
 * precise de oito metros e oitenta de pé direito.
 */

export const TIPOS: Record<Tipo, { nome: string; cor: number }> = {
  normal: { nome: 'Normal', cor: 0xb6b4a6 },
  fogo: { nome: 'Fogo', cor: 0xff7a3c },
  agua: { nome: 'Água', cor: 0x4fa8f5 },
  eletrico: { nome: 'Elétrico', cor: 0xffd23b },
  planta: { nome: 'Planta', cor: 0x66c95a },
  gelo: { nome: 'Gelo', cor: 0x8fe3e0 },
  lutador: { nome: 'Lutador', cor: 0xd4553e },
  veneno: { nome: 'Veneno', cor: 0xac5ec4 },
  terra: { nome: 'Terra', cor: 0xd7b558 },
  voador: { nome: 'Voador', cor: 0x9fb4f0 },
  psiquico: { nome: 'Psíquico', cor: 0xff6a9c },
  inseto: { nome: 'Inseto', cor: 0xa4c13a },
  pedra: { nome: 'Pedra', cor: 0xb8a253 },
  fantasma: { nome: 'Fantasma', cor: 0x7a5fa8 },
  dragao: { nome: 'Dragão', cor: 0x8060e8 },
  sombrio: { nome: 'Sombrio', cor: 0x6b5647 },
  aco: { nome: 'Aço', cor: 0xafafc6 },
  fada: { nome: 'Fada', cor: 0xf4a0c0 },
};

// ---------------------------------------------------------------- efetividade

/**
 * Multiplicador de um golpe contra um defensor de um ou dois tipos.
 *
 * Com dois tipos os fatores se multiplicam, como no jogo de verdade: é por isso
 * que um golpe elétrico em Gyarados (água/voador) dá 4× e em Geodude
 * (pedra/terra) dá 0. A tabela veio inteira da PokeAPI, os 18 tipos.
 */
export function multiplicador(atacante: Tipo, defensores: readonly Tipo[]): number {
  let total = 1;
  for (const d of defensores) total *= EFETIVIDADE[atacante][d] ?? 1;
  return total;
}

export function textoEfetividade(m: number): string | null {
  if (m === 0) return 'não afeta ele…';
  if (m >= 4) return 'é devastador!';
  if (m >= 2) return 'é super eficaz!';
  if (m <= 0.25) return 'quase não arranha…';
  if (m <= 0.5) return 'não é muito eficaz…';
  return null;
}

// ---------------------------------------------------------------- golpes

/**
 * O que o golpe é, na divisão clássica.
 *
 * Isto não é só rótulo: `fisico` usa Ataque contra Defesa, `especial` usa
 * Ataque Especial contra Defesa Especial, e `status` não causa dano nenhum —
 * ele mexe nos stats de quem tomou (ou de quem usou). Antes, a divisão era
 * inferida do FORMATO do efeito (`formato !== 'projetil'` virava especial), o
 * que amarrava a regra de dano à decisão de como desenhar a animação.
 */
export type Categoria = 'fisico' | 'especial' | 'status';

/**
 * Os quatro estágios que um golpe de status consegue mexer.
 *
 * `precisao` é o que sobrou de dois stats do clássico que este jogo não tem
 * como modelar direito: pontaria e esquiva. Sem sistema de acerto, "errar mais"
 * vira "bater mais fraco" — então o estágio multiplica o DANO de quem o
 * carrega. É o que faz Jato de Areia e Cortina de Fumaça continuarem valendo a
 * vez de quem as usa.
 */
export type Stat = 'ataque' | 'defesa' | 'velocidade' | 'precisao';

export interface EfeitoStatus {
  alvo: 'proprio' | 'oponente';
  stat: Stat;
  /** Positivo sobe, negativo baixa. Um estágio por uso, como no clássico. */
  estagios: number;
}

export interface Golpe {
  nome: string;
  tipo: Tipo;
  /** Zero nos golpes de status. */
  potencia: number;
  categoria: Categoria;
  /** Como o efeito é desenhado. Ver src/attacks.ts. */
  formato: 'jato' | 'projetil' | 'raio' | 'aura';
  /**
   * O gesto que o corpo faz ao usar o golpe. Ver GestoDeAtaque em src/anima.ts
   * — os nomes são os mesmos de propósito, e src/golpes.gen.ts já vem com ele.
   */
  animacao?: 'mordida' | 'garra' | 'cauda' | 'soco' | 'salto' | 'investida' | 'sopro' | 'aura';
  recarga: number;
  /** Só nos de status. */
  efeito?: EfeitoStatus;
  /** Uma linha para o card do painel. */
  resumo?: string;
}

/**
 * Um golpe por tipo, em duas versões: a de quem bate com o corpo (física) e a
 * de quem bate à distância (especial). Qual das duas a espécie usa sai dos
 * próprios stats — Alakazam ataca de longe, Machamp chega perto.
 *
 * Ter um golpe por tipo em vez do arsenal inteiro é decisão de VR: o que se lê
 * no ar é o formato e a cor do efeito, não o nome. Dezoito efeitos distintos já
 * é mais do que se distingue numa batalha de três segundos.
 */
const GOLPES: Record<Tipo, { fisico: Golpe; especial: Golpe }> = {
  normal: {
    fisico: { categoria: 'fisico', nome: 'Investida', tipo: 'normal', potencia: 40, formato: 'projetil', recarga: 1.0 },
    especial: { categoria: 'especial', nome: 'Hiper-Raio', tipo: 'normal', potencia: 62, formato: 'raio', recarga: 1.6 },
  },
  fogo: {
    fisico: { categoria: 'fisico', nome: 'Presa de Fogo', tipo: 'fogo', potencia: 48, formato: 'projetil', recarga: 1.1 },
    especial: { categoria: 'especial', nome: 'Lança-Chamas', tipo: 'fogo', potencia: 55, formato: 'jato', recarga: 1.2 },
  },
  agua: {
    fisico: { categoria: 'fisico', nome: 'Aqua-Impacto', tipo: 'agua', potencia: 46, formato: 'projetil', recarga: 1.05 },
    especial: { categoria: 'especial', nome: 'Jato d’Água', tipo: 'agua', potencia: 52, formato: 'jato', recarga: 1.1 },
  },
  eletrico: {
    fisico: { categoria: 'fisico', nome: 'Trovoada', tipo: 'eletrico', potencia: 50, formato: 'raio', recarga: 1.3 },
    especial: { categoria: 'especial', nome: 'Choque do Trovão', tipo: 'eletrico', potencia: 56, formato: 'raio', recarga: 1.35 },
  },
  planta: {
    fisico: { categoria: 'fisico', nome: 'Chicote de Cipó', tipo: 'planta', potencia: 45, formato: 'projetil', recarga: 1.1 },
    especial: { categoria: 'especial', nome: 'Folha Navalha', tipo: 'planta', potencia: 52, formato: 'projetil', recarga: 1.15 },
  },
  gelo: {
    fisico: { categoria: 'fisico', nome: 'Presa Gélida', tipo: 'gelo', potencia: 48, formato: 'projetil', recarga: 1.15 },
    especial: { categoria: 'especial', nome: 'Raio de Gelo', tipo: 'gelo', potencia: 55, formato: 'jato', recarga: 1.25 },
  },
  lutador: {
    fisico: { categoria: 'fisico', nome: 'Golpe Cruzado', tipo: 'lutador', potencia: 54, formato: 'projetil', recarga: 1.2 },
    especial: { categoria: 'especial', nome: 'Onda de Choque', tipo: 'lutador', potencia: 48, formato: 'jato', recarga: 1.15 },
  },
  veneno: {
    fisico: { categoria: 'fisico', nome: 'Ferroada Tóxica', tipo: 'veneno', potencia: 44, formato: 'projetil', recarga: 1.05 },
    especial: { categoria: 'especial', nome: 'Bomba de Lodo', tipo: 'veneno', potencia: 52, formato: 'projetil', recarga: 1.2 },
  },
  terra: {
    fisico: { categoria: 'fisico', nome: 'Terremoto', tipo: 'terra', potencia: 58, formato: 'projetil', recarga: 1.45 },
    especial: { categoria: 'especial', nome: 'Jato de Areia', tipo: 'terra', potencia: 46, formato: 'jato', recarga: 1.1 },
  },
  voador: {
    fisico: { categoria: 'fisico', nome: 'Bico Furador', tipo: 'voador', potencia: 48, formato: 'projetil', recarga: 1.05 },
    especial: { categoria: 'especial', nome: 'Vento Cortante', tipo: 'voador', potencia: 50, formato: 'jato', recarga: 1.15 },
  },
  psiquico: {
    fisico: { categoria: 'fisico', nome: 'Investida Zen', tipo: 'psiquico', potencia: 48, formato: 'projetil', recarga: 1.1 },
    especial: { categoria: 'especial', nome: 'Psíquico', tipo: 'psiquico', potencia: 58, formato: 'raio', recarga: 1.4 },
  },
  inseto: {
    fisico: { categoria: 'fisico', nome: 'Mordida de Inseto', tipo: 'inseto', potencia: 44, formato: 'projetil', recarga: 1.0 },
    especial: { categoria: 'especial', nome: 'Zumbido', tipo: 'inseto', potencia: 50, formato: 'jato', recarga: 1.15 },
  },
  pedra: {
    fisico: { categoria: 'fisico', nome: 'Avalanche de Pedras', tipo: 'pedra', potencia: 52, formato: 'projetil', recarga: 1.3 },
    especial: { categoria: 'especial', nome: 'Pedra Energizada', tipo: 'pedra', potencia: 50, formato: 'projetil', recarga: 1.25 },
  },
  fantasma: {
    fisico: { categoria: 'fisico', nome: 'Sombra Furtiva', tipo: 'fantasma', potencia: 50, formato: 'projetil', recarga: 1.15 },
    especial: { categoria: 'especial', nome: 'Bola Sombria', tipo: 'fantasma', potencia: 56, formato: 'projetil', recarga: 1.3 },
  },
  dragao: {
    fisico: { categoria: 'fisico', nome: 'Garra de Dragão', tipo: 'dragao', potencia: 56, formato: 'projetil', recarga: 1.3 },
    especial: { categoria: 'especial', nome: 'Sopro do Dragão', tipo: 'dragao', potencia: 54, formato: 'jato', recarga: 1.25 },
  },
  sombrio: {
    fisico: { categoria: 'fisico', nome: 'Mordida', tipo: 'sombrio', potencia: 48, formato: 'projetil', recarga: 1.05 },
    especial: { categoria: 'especial', nome: 'Pulso Sombrio', tipo: 'sombrio', potencia: 54, formato: 'jato', recarga: 1.25 },
  },
  aco: {
    fisico: { categoria: 'fisico', nome: 'Garra de Aço', tipo: 'aco', potencia: 50, formato: 'projetil', recarga: 1.2 },
    especial: { categoria: 'especial', nome: 'Raio Espelhado', tipo: 'aco', potencia: 48, formato: 'raio', recarga: 1.3 },
  },
  fada: {
    fisico: { categoria: 'fisico', nome: 'Beijo Drenante', tipo: 'fada', potencia: 46, formato: 'projetil', recarga: 1.05 },
    especial: { categoria: 'especial', nome: 'Brilho Mágico', tipo: 'fada', potencia: 54, formato: 'jato', recarga: 1.2 },
  },
};

/**
 * Os golpes de status: os que não machucam ninguém e mudam a briga mesmo assim.
 *
 * São de tipo normal de propósito. Um golpe de status com tipo entraria na
 * tabela de efetividade e poderia falhar contra uma imunidade — e um jogador
 * que escolhe "subir a defesa" e recebe "não afeta ele…" não aprendeu nada
 * sobre tipos, só perdeu a vez.
 *
 * Um estágio por uso, na escala clássica de −6 a +6: `(2+n)/2` para cima,
 * `2/(2−n)` para baixo. Um estágio é +50% ou −33%; dois já é o dobro. Subir a
 * defesa duas vezes antes de trocar golpe é uma jogada de verdade, e é para
 * isso que eles existem.
 */
export const GOLPES_STATUS: Record<string, Golpe> = {
  escudo: {
    nome: 'Escudo',
    tipo: 'normal',
    potencia: 0,
    categoria: 'status',
    formato: 'aura',
    recarga: 0.9,
    efeito: { alvo: 'proprio', stat: 'defesa', estagios: 1 },
    resumo: 'sua defesa sobe',
  },
  impeto: {
    nome: 'Ímpeto',
    tipo: 'normal',
    potencia: 0,
    categoria: 'status',
    formato: 'aura',
    recarga: 0.9,
    efeito: { alvo: 'proprio', stat: 'ataque', estagios: 1 },
    resumo: 'seu ataque sobe',
  },
  arranque: {
    nome: 'Arranque',
    tipo: 'normal',
    potencia: 0,
    categoria: 'status',
    formato: 'aura',
    recarga: 0.9,
    efeito: { alvo: 'proprio', stat: 'velocidade', estagios: 1 },
    resumo: 'você ataca mais rápido',
  },
  encarar: {
    nome: 'Encarar',
    tipo: 'normal',
    potencia: 0,
    categoria: 'status',
    formato: 'aura',
    recarga: 1.0,
    efeito: { alvo: 'oponente', stat: 'ataque', estagios: -1 },
    resumo: 'o ataque dele cai',
  },
  amolecer: {
    nome: 'Amolecer',
    tipo: 'normal',
    potencia: 0,
    categoria: 'status',
    formato: 'aura',
    recarga: 1.0,
    efeito: { alvo: 'oponente', stat: 'defesa', estagios: -1 },
    resumo: 'a defesa dele cai',
  },
  entorpecer: {
    nome: 'Entorpecer',
    tipo: 'normal',
    potencia: 0,
    categoria: 'status',
    formato: 'aura',
    recarga: 1.0,
    efeito: { alvo: 'oponente', stat: 'velocidade', estagios: -1 },
    resumo: 'ele demora mais para atacar',
  },
};

// ---------------------------------------------------------------- estágios

export interface Estagios {
  ataque: number;
  defesa: number;
  velocidade: number;
  precisao: number;
}

export const ESTAGIOS_ZERADOS = (): Estagios => ({
  ataque: 0,
  defesa: 0,
  velocidade: 0,
  precisao: 0,
});

export const LIMITE_ESTAGIO = 6;

/** A escala clássica: +1 é ×1,5; −1 é ×0,67; +6 é ×4 e −6 é ×0,25. */
export function multEstagio(n: number): number {
  const e = THREE.MathUtils.clamp(Math.round(n), -LIMITE_ESTAGIO, LIMITE_ESTAGIO);
  return e >= 0 ? (2 + e) / 2 : 2 / (2 - e);
}

/** Como o painel escreve o estágio: "+2", "−1", ou nada quando está zerado. */
export function textoEstagio(n: number): string {
  if (n === 0) return '';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

// ---------------------------------------------------------------- espécies

/** O teto de nível. Fica aqui em cima porque a montagem das espécies o usa. */
export const NIVEL_MAXIMO = 60;

export type Raridade = 'comum' | 'incomum' | 'raro' | 'lendario';

export interface BaseStats {
  hp: number;
  atq: number;
  def: number;
  atqEsp: number;
  defEsp: number;
  vel: number;
}

export interface Especie {
  num: number;
  id: string;
  nome: string;
  /** Um ou dois, na ordem da Pokédex. */
  tipos: readonly Tipo[];
  /** O primeiro — é ele que dá a cor da barra e do painel. */
  tipo: Tipo;
  /** Altura dentro do seu quarto, em metros. Comprimida, não é a real. */
  altura: number;
  /** Altura de verdade da Pokédex, em metros — aparece na ficha. */
  alturaReal: number;
  peso: number;
  base: BaseStats;
  /**
   * Altura a que ele paira, em alturas do próprio corpo. Zero = anda no chão.
   * Ver FLUTUAM: não dá para inferir do tipo.
   */
  voo: number;
  /** Tudo o que ele aprende por nível, do mais cedo para o mais tarde. */
  aprende: readonly Aprendizado[];
  /** Os quatro que ele carrega no teto de nível — para a vitrine e a ficha. */
  golpes: readonly Golpe[];
  /** O mais forte que ele chega a ter. É o da ficha e o da vitrine. */
  golpe: Golpe;
  /** 0..1 — já convertido da escala 3..255 da Pokédex. */
  taxaCaptura: number;
  raridade: Raridade;
  lendario: boolean;
  /** 0 = forma básica, 1 = meio da linha, 2 = final. */
  estagio: number;
  evolui: { para: string; nivel: number } | null;
  temShiny: boolean;
  inicial: boolean;
  /**
   * De fora dos 151, presente só como ponta de uma linha evolutiva.
   *
   * São as cinco eeveelutions modernas — Espeon, Umbreon, Leafeon, Glaceon e
   * Sylveon. A Pokédex do jogo continua sendo a de Kanto: convidada não nasce
   * selvagem (`pesoSpawn` devolve 0) e não entra em `TOTAL_ESPECIES`, então
   * completar a coleção continua querendo dizer 151. Ver `CONVIDADAS` em
   * tools/pokedex.mjs.
   */
  convidada: boolean;
  genero: string;
  descricao: string;
}

/**
 * Quem você pode escolher no começo. Os três clássicos, o rato e a raposa.
 *
 * O Eevee está aqui por ser a única escolha inicial que continua sendo uma
 * escolha depois: os outros quatro têm uma linha de evolução só, e ele tem
 * oito. Quem começa com ele decide de novo, lá na frente, com a pedra na mão.
 * Ver src/pedras.ts.
 */
const INICIAIS_IDS = ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'eevee'];

/**
 * Altura dentro do quarto.
 *
 * A Pokédex vai de 0,2 m (Diglett) a 8,8 m (Onix). Passar isso direto para a
 * sala daria um Onix que não cabe em pé e um Diglett que some no carpete, então
 * a curva comprime a faixa toda para algo entre 24 cm e 1,1 m — grande o
 * bastante para impressionar, pequeno o bastante para caber entre o sofá e a
 * mesa. O expoente 0,45 é o que preserva a ordem: Charizard continua maior que
 * Charmander, e bem mais.
 */
const alturaNaSala = (alturaReal: number) =>
  THREE.MathUtils.clamp(0.4 * Math.pow(alturaReal, 0.45), 0.24, 1.1);

/** Quantos evoluem para dentro desta espécie — dá o estágio da linha. */
function calcularEstagios(): Map<string, number> {
  const paiDe = new Map<string, string>();
  for (const e of POKEDEX) if (e.evolui) paiDe.set(e.evolui.para, e.id);

  const estagio = new Map<string, number>();
  for (const e of POKEDEX) {
    let n = 0;
    let atual = e.id;
    // Sobe a linha até a forma básica. O teto evita laço em dado estranho.
    while (paiDe.has(atual) && n < 4) {
      atual = paiDe.get(atual)!;
      n++;
    }
    estagio.set(e.id, n);
  }
  return estagio;
}

/**
 * Quem não anda: flutua.
 *
 * É uma lista à mão, e tem de ser. Pelo tipo daria errado nos dois sentidos —
 * Pidgey é voador e passa o dia no chão, Gyarados é água e voador e não é nem
 * uma coisa nem outra dentro de um quarto; enquanto Magnemite é elétrico/aço e
 * levita, e Gengar é veneno e nunca encostou no chão. A ficha da Pokédex não
 * carrega esse dado, então ele mora aqui.
 *
 * O valor é a altura do voo em FRAÇÃO DA ALTURA do bicho: um Gastly paira quase
 * na altura do próprio corpo, um Butterfree pouco acima da cabeça de quem olha
 * de perto. Multiplicar pela altura, e não usar metro fixo, é o que impede um
 * Zubat de 24 cm de voar no mesmo nível de um Charizard.
 */
const FLUTUAM: Record<string, number> = {
  zubat: 1.2,
  golbat: 1.0,
  gastly: 1.4,
  haunter: 1.2,
  gengar: 0.35,
  koffing: 1.1,
  weezing: 0.95,
  magnemite: 1.0,
  magneton: 0.9,
  butterfree: 1.3,
  venomoth: 1.1,
  porygon: 0.8,
  mew: 1.2,
  mewtwo: 0.3,
  articuno: 1.0,
  zapdos: 1.0,
  moltres: 1.0,
  dragonite: 0.35,
  aerodactyl: 0.9,
  charizard: 0.3,
  gyarados: 0.5,
  lapras: 0.15,
  tentacool: 0.9,
  tentacruel: 0.8,
  hypno: 0.15,
  drowzee: 0,
  abra: 0.1,
  kadabra: 0,
  alakazam: 0.1,
  staryu: 0.5,
  starmie: 0.7,
  exeggcute: 0.4,
  voltorb: 0,
  electrode: 0,
};

/** Zero = anda no chão. Acima disso é a altura do voo, em alturas do bicho. */
export const alturaDeVoo = (id: string) => FLUTUAM[id] ?? 0;

function classificar(entrada: EntradaDex, estagio: number): Raridade {
  if (entrada.lendario) return 'lendario';
  if (entrada.taxaBase >= 150 && estagio === 0) return 'comum';
  if (entrada.taxaBase >= 75) return 'incomum';
  return 'raro';
}

/** Quantos golpes um Pokémon carrega de cada vez. Quatro, como no clássico. */
export const GOLPES_POR_POKEMON = 4;

export interface Aprendizado {
  golpe: Golpe;
  nivel: number;
}

/**
 * O que a espécie aprende, e quando — da tabela de Red/Blue/Yellow.
 *
 * Antes isto era inventado: um golpe físico e um especial do tipo dela, mais um
 * de status escolhido pelos stats. A regra funcionava e era falsa — todo
 * Pokémon de fogo tinha exatamente os mesmos golpes, e Charmander e Vulpix eram
 * indistinguíveis na mão.
 *
 * Agora vem de src/golpes.gen.ts, gerado da PokeAPI. Pikachu aprende Choque do
 * Trovão no nível 26 e antes disso briga com Choque Elétrico; Charmander só
 * ganha Lança-Chamas no 38. É o que dá peso a subir de nível.
 *
 * ## A rede de segurança
 *
 * Dois dos 151 não aprendem NADA que este jogo saiba representar: Abra só tem
 * Teleporte e Ditto só tem Transformar. Sem uma rede, eles entrariam em campo
 * sem golpe nenhum. Então quando a lista real não oferece um golpe de dano no
 * nível 1, um golpe genérico do tipo da espécie é acrescentado ali — e some
 * assim que um de verdade aparece.
 */
/**
 * De quem esta espécie vem, quando ela vem de uma pedra.
 *
 * As tabelas de pedra (src/pedras.ts) são o único lugar onde a ligação
 * Eevee → Sylveon existe: a tabela de evolução da PokeAPI dá UMA saída por
 * espécie, e o Eevee tem oito.
 */
function origemPorPedra(id: string): string | null {
  for (const pedra of PEDRAS) {
    for (const [de, para] of Object.entries(pedra.evolucoes)) if (para === id) return de;
  }
  return null;
}

function montarAprendizado(entrada: EntradaDex): Aprendizado[] {
  const tipos = entrada.tipos as Tipo[];
  const lista: Aprendizado[] = [];

  for (const [chave, nivel] of APRENDE[entrada.id] ?? []) {
    const bruto = GOLPES_DEX[chave];
    if (!bruto) continue;
    lista.push({ golpe: bruto as Golpe, nivel });
  }
  // Sem learnset próprio: herda o de quem evolui nele.
  //
  // Acontece com as convidadas (ver `convidada`). `tools/golpes.mjs` lê a
  // tabela de quem-aprende-o-quê de Red/Blue/Yellow, e Espeon, Umbreon,
  // Leafeon, Glaceon e Sylveon não existiam nesses jogos — chegavam aqui com
  // UM golpe, o genérico do próprio tipo, o que faz um bicho que só sabe
  // repetir a mesma coisa a briga inteira.
  //
  // Herdar do Eevee é a resposta certa e não só a conveniente: uma eeveelution
  // É um Eevee que mudou de elemento, então ela sabe o que ele sabia e ganha o
  // do seu tipo por cima — o físico cedo, o especial quando cresce.
  //
  // Exige a ORIGEM, e não só a lista vazia: Abra e Ditto também chegam sem
  // learnset (a tabela de RBY só lhes dá Teleporte e Transformação, que são
  // status), e tratá-los como herdeiros lhes dava o golpe genérico do tipo
  // duas vezes — uma aqui e outra no `temDanoCedo` logo abaixo. Quem não vem
  // de pedra continua no caminho de antes.
  const origem = lista.length === 0 ? origemPorPedra(entrada.id) : null;
  if (origem) {
    const herdado = APRENDE[origem] ?? [];
    for (const [chave, nivel] of herdado) {
      const bruto = GOLPES_DEX[chave];
      if (bruto) lista.push({ golpe: bruto as Golpe, nivel });
    }
    // Só o que não estiver repetido: o Eevee já aprende Mordida, que é o golpe
    // genérico do tipo sombrio, e sem esta checagem o Umbreon saía para o campo
    // com Mordida duas vezes nas quatro vagas.
    const meu = GOLPES[tipos[0]];
    const jaTem = (g: Golpe) => lista.some((a) => a.golpe.nome === g.nome);
    if (!jaTem(meu.fisico)) lista.push({ golpe: meu.fisico, nivel: 15 });
    if (!jaTem(meu.especial)) lista.push({ golpe: meu.especial, nivel: 32 });
  }

  lista.sort((a, b) => a.nivel - b.nivel);

  const temDanoCedo = lista.some((a) => a.nivel <= 1 && a.golpe.categoria !== 'status');
  if (!temDanoCedo) {
    const deLonge = entrada.base.atqEsp > entrada.base.atq;
    lista.unshift({ golpe: deLonge ? GOLPES[tipos[0]].especial : GOLPES[tipos[0]].fisico, nivel: 1 });
  }

  return lista;
}

/**
 * Os golpes que este Pokémon sabe AGORA, no nível em que está.
 *
 * A regra é a da primeira geração: você fica com os quatro últimos que
 * aprendeu. Isso significa que um golpe fraco de nível 1 dá lugar a um forte
 * mais tarde, e que o arsenal de um bicho de nível 12 não é o de um de nível 40
 * — que é exatamente o que faz a evolução e o nível importarem.
 *
 * A única correção: se os quatro últimos forem todos de status, o mais fraco
 * cede lugar ao melhor golpe de dano disponível. Sem isso um Metapod de nível
 * alto ficaria em campo sem ter como atacar.
 */
export function golpesNoNivel(especie: Especie, nivel: number): readonly Golpe[] {
  const disponiveis = especie.aprende.filter((a) => a.nivel <= Math.max(1, nivel));
  if (disponiveis.length === 0) return especie.aprende.slice(0, 1).map((a) => a.golpe);

  const escolhidos = disponiveis.slice(-GOLPES_POR_POKEMON).map((a) => a.golpe);
  const todos = disponiveis.map((a) => a.golpe);

  /**
   * Troca o golpe menos valioso do conjunto pelo que está faltando.
   *
   * O menos valioso é um de status — eles são muitos e os últimos níveis de
   * várias espécies são só eles — e, na falta, o golpe de dano mais fraco.
   */
  const trocar = (entra: Golpe) => {
    if (escolhidos.includes(entra)) return;
    let vitima = -1;
    let pior = Infinity;
    for (let i = 0; i < escolhidos.length; i++) {
      const g = escolhidos[i];
      const valor = g.categoria === 'status' ? -1 : g.potencia;
      if (valor < pior) {
        pior = valor;
        vitima = i;
      }
    }
    if (vitima >= 0) escolhidos[vitima] = entra;
  };

  const porForca = (a: Golpe, b: Golpe) => b.potencia - a.potencia;
  const dano = todos.filter((g) => g.categoria !== 'status').sort(porForca);

  // Sem nenhum golpe de dano entre os quatro, o bicho entraria em campo sem ter
  // como atacar. Isso acontece de verdade: os últimos níveis de vários são só
  // golpes de status.
  if (!escolhidos.some((g) => g.categoria !== 'status') && dano[0]) trocar(dano[0]);

  // E o golpe do PRÓPRIO TIPO tem de estar ali. A regra crua dos "quatro
  // últimos" tirava o Choque Elétrico do Pikachu de nível 20 — ele ficava
  // elétrico sem nada de elétrico na mão até o nível 26, o que é pior do que
  // impreciso: é um Pokémon que não parece o que ele é.
  const doTipo = dano.filter((g) => especie.tipos.includes(g.tipo))[0];
  if (doTipo) trocar(doTipo);

  return escolhidos;
}

/** O arsenal de um combatente — a forma curta, que o jogo usa o tempo todo. */
export const arsenal = (c: Combatente): readonly Golpe[] => golpesNoNivel(c.especie, c.nivel);

const estagios = calcularEstagios();

export const ESPECIES: readonly Especie[] = POKEDEX.filter((e) => temModelo(e.id)).map((e) => {
  const estagio = estagios.get(e.id) ?? 0;
  const aprende = montarAprendizado(e);
  return {
    num: e.num,
    id: e.id,
    nome: e.nome,
    tipos: e.tipos as Tipo[],
    tipo: e.tipos[0] as Tipo,
    altura: alturaNaSala(e.alturaReal),
    alturaReal: e.alturaReal,
    peso: e.peso,
    base: e.base,
    voo: alturaDeVoo(e.id),
    aprende,
    // Preenchidos logo abaixo, quando a espécie já existe: 
    // precisa do objeto pronto para consultar .
    golpes: [],
    golpe: aprende[0].golpe,
    // A escala da Pokédex é 3 (Mewtwo) a 255 (Caterpie). A raiz levanta o pé
    // da curva: sem ela, tudo abaixo de 60 viraria a mesma captura impossível.
    taxaCaptura: THREE.MathUtils.clamp(Math.pow(e.taxaBase / 255, 0.62), 0.1, 0.95),
    raridade: classificar(e, estagio),
    lendario: e.lendario,
    estagio,
    evolui: e.evolui,
    temShiny: temShiny(e.id),
    inicial: INICIAIS_IDS.includes(e.id),
    convidada: e.convidada,
    genero: e.genero,
    descricao: e.descricao,
  };
});

// O arsenal do teto de nível, preenchido depois: é só vitrine e ficha, mas
// calcular na hora de desenhar custaria uma varredura da lista por quadro.
for (const especie of ESPECIES) {
  const noTeto = golpesNoNivel(especie, NIVEL_MAXIMO);
  (especie as { golpes: readonly Golpe[] }).golpes = noTeto;
  const maisForte = [...noTeto]
    .filter((g) => g.categoria !== 'status')
    .sort((a, b) => b.potencia - a.potencia)[0];
  if (maisForte) (especie as { golpe: Golpe }).golpe = maisForte;
}

const PorId = new Map(ESPECIES.map((e) => [e.id, e]));

export const porId = (id: string) => PorId.get(id);
export const porNum = (num: number) => ESPECIES.find((e) => e.num === num);
export const INICIAIS = INICIAIS_IDS.map((id) => PorId.get(id)!).filter(Boolean);
/**
 * Quantas a Pokédex pede para completar: as de Kanto, e só elas.
 *
 * Não é `ESPECIES.length`. As convidadas estão em `ESPECIES` porque precisam
 * existir — têm modelo, stats, golpes e ficha —, mas contá-las aqui mudaria o
 * significado de "completei a Pokédex" para quem já estava jogando, e por um
 * motivo que não é dele: eu abri uma exceção para o Eevee.
 */
export const TOTAL_ESPECIES = ESPECIES.filter((e) => !e.convidada).length;

export const corDe = (especie: Especie) => TIPOS[especie.tipo].cor;
export const corHexDe = (especie: Especie) =>
  `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`;
export const corHexDeTipo = (tipo: Tipo) =>
  `#${new THREE.Color(TIPOS[tipo].cor).getHexString()}`;
export const textoTipos = (especie: Especie) =>
  especie.tipos.map((t) => TIPOS[t].nome).join(' · ');

// ---------------------------------------------------------------- níveis

/**
 * Stats no nível, na fórmula do jogo original simplificada (sem IV nem EV).
 *
 * Mantivemos a forma real porque é ela que dá a sensação certa: o HP sobe mais
 * rápido que o resto, então um bicho de nível alto aguenta mais golpes em vez
 * de só bater mais forte — e é isso que faz enfraquecer-para-capturar continuar
 * valendo a pena mesmo quando o seu time já está forte.
 */
export function statsNoNivel(especie: Especie, nivel: number) {
  const n = THREE.MathUtils.clamp(Math.round(nivel), 1, NIVEL_MAXIMO);
  const comum = (base: number) => Math.floor((2 * base * n) / 100) + 5;
  return {
    hpMax: Math.floor((2 * especie.base.hp * n) / 100) + n + 10,
    ataque: comum(especie.base.atq),
    defesa: comum(especie.base.def),
    ataqueEsp: comum(especie.base.atqEsp),
    defesaEsp: comum(especie.base.defEsp),
    velocidade: comum(especie.base.vel),
  };
}

/** XP acumulada necessária para chegar a um nível. Curva cúbica, como o clássico. */
export const xpParaNivel = (nivel: number) => Math.round(Math.pow(Math.max(1, nivel), 3) * 0.8);

/** Quanto rende derrubar ou capturar um selvagem. */
export function xpDeEncontro(especie: Especie, nivel: number, capturou: boolean): number {
  const soma =
    especie.base.hp + especie.base.atq + especie.base.def + especie.base.atqEsp + especie.base.defEsp;
  const bruto = (soma / 5) * nivel * 0.42;
  // Capturar rende mais que derrubar: é o comportamento que o jogo quer premiar.
  return Math.max(4, Math.round(bruto * (capturou ? 1.5 : 1)));
}

/** O nível que a XP acumulada já pagou. */
export function nivelPorXp(xp: number): number {
  let nivel = 1;
  while (nivel < NIVEL_MAXIMO && xp >= xpParaNivel(nivel + 1)) nivel++;
  return nivel;
}

/**
 * Para quem esta espécie evolui neste nível, se for a hora.
 *
 * Quem depende de PEDRA não passa por aqui, por mais alto que o nível chegue:
 * a tabela gerada dá a essas espécies um nível 28 inventado (a PokeAPI não
 * informa nível nenhum para `use-item`, e o gerador precisava de um número), e
 * deixá-lo valer faria o Pikachu virar Raichu sozinho — o que esvazia a Pedra do
 * Trovão. Ver src/pedras.ts.
 */
export function evolucaoEm(especie: Especie, nivel: number): Especie | null {
  if (EVOLUI_SO_COM_PEDRA.has(especie.id)) return null;
  if (!especie.evolui || nivel < especie.evolui.nivel) return null;
  return PorId.get(especie.evolui.para) ?? null;
}

/** A evolução que esta pedra provoca nesta espécie, se provocar alguma. */
export function evolucaoDaPedra(idPedra: string, especie: Especie): Especie | null {
  const alvo = evolucaoPorPedra(idPedra, especie.id);
  return alvo ? (PorId.get(alvo) ?? null) : null;
}

// ---------------------------------------------------------------- combate

export interface Combatente {
  especie: Especie;
  nivel: number;
  /** Os estágios acumulados na briga. Ausente = tudo zerado. */
  estagios?: Estagios;
}

/** Só os que causam dano. É a lista de onde a escolha automática sai. */
export const golpesDeDano = (golpes: readonly Golpe[]) =>
  golpes.filter((g) => g.categoria !== 'status');

export const golpesDeStatus = (golpes: readonly Golpe[]) =>
  golpes.filter((g) => g.categoria === 'status');

/** O golpe que causa mais dano que o atacante tem contra este defensor. */
export function escolherGolpe(atacante: Combatente, defensor: Combatente): Golpe {
  const candidatos = golpesDeDano(arsenal(atacante));
  let melhor = candidatos[0] ?? arsenal(atacante)[0];
  let melhorNota = -1;
  for (const golpe of candidatos) {
    const efetividade = multiplicador(golpe.tipo, defensor.especie.tipos);
    const mesmoTipo = atacante.especie.tipos.includes(golpe.tipo) ? 1.5 : 1;
    const nota = golpe.potencia * efetividade * mesmoTipo;
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = golpe;
    }
  }
  return melhor;
}

/**
 * Segundos entre um ataque e outro, para quem luta sozinho.
 *
 * Sai da VELOCIDADE, e é por isso que `Arranque` e `Entorpecer` valem alguma
 * coisa: eles mudam de quanto em quanto tempo o golpe sai. Antes havia um único
 * número fixo (2,6 s) para os 151, o que fazia um Electrode e um Snorlax
 * atacarem na mesma cadência.
 *
 * A base é o stat da Pokédex, e não o do nível: o que se quer é a diferença
 * ENTRE espécies, e o stat do nível comprime essa diferença justamente onde ela
 * é interessante.
 */
export function intervaloDeAtaque(combatente: Combatente): number {
  const vel = combatente.especie.base.vel * multEstagio(combatente.estagios?.velocidade ?? 0);
  return THREE.MathUtils.clamp(4.4 - vel * 0.016, 1.9, 4.2);
}

export function calcularDano(
  atacante: Combatente,
  defensor: Combatente,
  golpe: Golpe,
): { dano: number; efetividade: number; critico: boolean } {
  const efetividade = multiplicador(golpe.tipo, defensor.especie.tipos);
  if (efetividade === 0 || golpe.categoria === 'status') {
    return { dano: 0, efetividade, critico: false };
  }

  const especial = golpe.categoria === 'especial';
  const sa = statsNoNivel(atacante.especie, atacante.nivel);
  const sd = statsNoNivel(defensor.especie, defensor.nivel);
  // Os estágios entram aqui, e só aqui: subir o ataque e baixar a defesa do
  // outro são a mesma conta vista de dois lados.
  const ataque =
    (especial ? sa.ataqueEsp : sa.ataque) * multEstagio(atacante.estagios?.ataque ?? 0);
  const defesa =
    (especial ? sd.defesaEsp : sd.defesa) * multEstagio(defensor.estagios?.defesa ?? 0);

  const critico = Math.random() < 0.08;
  const variacao = 0.85 + Math.random() * 0.15;
  const mesmoTipo = atacante.especie.tipos.includes(golpe.tipo) ? 1.5 : 1;

  // A tabela de tipos continua clássica (2× e 0,5×) no que aparece na tela, mas
  // no dano ela entra comprimida: em VR, um confronto ruim que exigisse 17
  // golpes cansaria antes de ensinar qualquer coisa.
  const efetividadeDano = Math.pow(efetividade, 0.72);
  // A precisao do ATACANTE multiplica o que ele consegue tirar: e o estagio
  // que Jato de Areia e Cortina de Fumaca derrubam.
  const pontaria = multEstagio(atacante.estagios?.precisao ?? 0);
  const forca = Math.pow(ataque / Math.max(1, defesa), 0.7) * pontaria;

  const base = ((2 * atacante.nivel) / 5 + 2) * golpe.potencia * forca;
  const dano = (base / 50 + 2) * efetividadeDano * mesmoTipo * variacao * (critico ? 1.8 : 1);

  return { dano: Math.max(1, Math.round(dano * 0.95)), efetividade, critico };
}

/**
 * O teto do dano que o SEU Pokémon leva por golpe, em fração da vida máxima.
 *
 * Só do lado de cá. Um teto que valesse para os dois achataria a tabela de
 * tipos: com um limite por golpe, um confronto com vantagem e um sem vantagem
 * precisam do mesmo número de acertos, e escolher o Pokémon certo deixa de
 * significar alguma coisa. Foi o que aconteceu na primeira tentativa —
 * vantagem e desvantagem caíram para 4,0 e 6,4 golpes.
 *
 * Do lado de cá o problema é outro, e é o que o jogador relatou: um selvagem de
 * nível alto num confronto ruim tirava meia barra por acerto, e a briga acabava
 * antes de caber uma decisão. Aqui o teto resolve isso sem custo nenhum — o
 * ataque DELE é que precisa de um piso de reação, não o seu.
 */
export const TETO_DANO_RECEBIDO = 0.2;

/**
 * Aplica o teto e a dificuldade ao dano que chega no seu Pokémon.
 *
 * A dificuldade escala o teto JUNTO com o dano, e não só o dano. Se ela
 * multiplicasse apenas o valor bruto, o golpe pesado — que é exatamente o que
 * incomoda — bateria no mesmo teto nos três níveis, e escolher "Tranquilo"
 * não mudaria nada justamente no caso em que se escolhe "Tranquilo".
 */
export function danoRecebido(dano: number, hpMax: number, escala = 1): number {
  const limitado = Math.min(dano, hpMax * TETO_DANO_RECEBIDO);
  return Math.max(1, Math.round(limitado * escala));
}

/**
 * Aplica um golpe de status. Devolve o estágio novo, ou null quando já estava
 * no limite — e aí o jogo avisa em vez de gastar a vez em silêncio.
 */
export function aplicarStatus(estagios: Estagios, efeito: EfeitoStatus): number | null {
  const atual = estagios[efeito.stat];
  const novo = THREE.MathUtils.clamp(atual + efeito.estagios, -LIMITE_ESTAGIO, LIMITE_ESTAGIO);
  if (novo === atual) return null;
  estagios[efeito.stat] = novo;
  return novo;
}

/**
 * Chance de sobreviver a cada uma das três sacudidas — a captura é isso ao cubo.
 *
 * A bola não entra somando: ela DIVIDE a chance de escapar. Uma bola 2× não
 * dobra o acerto, ela corta o escape pela metade — que é o que se sente
 * justamente nos alvos difíceis, onde uma soma não mudaria nada.
 */
export function chanceCaptura(
  especie: Especie,
  hpFracao: number,
  alarme: number,
  multiplicadorBola = 1,
  nivel = 5,
  /**
   * Quanto a condição de status divide a chance de ESCAPE. Ver src/condicao.ts.
   *
   * Entra junto com a bola, no mesmo lugar e pelo mesmo motivo: as duas cortam
   * o escape em vez de somar acerto, o que mantém o efeito forte num alvo
   * enfraquecido sem estourar o teto num alvo inteiro. Dormindo vale 2,5 —
   * mais do que qualquer bola do jogo —, e é isso que faz "adormeça e depois
   * jogue a bola" ser a jogada certa em vez de um detalhe de sabor.
   */
  ajudaDaCondicao = 1,
): number {
  // Calibrado para a captura final (isto ao cubo) andar de ~33% com o alvo
  // inteiro até ~80% com ele quase desmaiado, usando a bola comum num alvo
  // comum. Generoso o bastante para não travar o começo, e ainda assim
  // recompensando a batalha.
  const desgaste = 1 - hpFracao;
  // Bicho de nível alto resiste mais: é o que impede de sair prendendo um
  // Dragonite de nível 40 com a primeira bola que cai na mão.
  const penalidadeNivel = 1 - THREE.MathUtils.clamp((nivel - 8) / 90, 0, 0.3);
  const base = THREE.MathUtils.clamp(
    especie.taxaCaptura * (0.885 + 0.323 * desgaste) * (1 - alarme * 0.18) * penalidadeNivel,
    0.1,
    0.94,
  );
  const comBola = 1 - (1 - base) / Math.max(1, multiplicadorBola * ajudaDaCondicao);
  return THREE.MathUtils.clamp(comBola, 0.1, 0.985);
}

// ---------------------------------------------------------------- encontros

/**
 * Peso de cada espécie no sorteio do próximo selvagem.
 *
 * Três forças se multiplicam: raridade da Pokédex, estágio da linha evolutiva
 * (você encontra Caterpie muito mais do que Butterfree) e um empurrão para
 * quem você ainda não registrou — sem esse último, completar a Pokédex viraria
 * espera, não caçada.
 */
/**
 * Que tipo de lugar do quarto esta espécie procura — item 3.1 do roteiro.
 *
 * A regra sai do que o bicho É, e nessa ordem:
 *
 * 1. **Quem voa procura o alto.** `voo` já existe e já diz quem paira: é o
 *    mesmo campo que impede um Gastly de dar pulinhos. Um Zubat no topo do
 *    armário e um Zubat no carpete são dois bichos diferentes.
 * 2. **Quem é de terra, pedra ou cava fica no chão.** Um Diglett em cima da
 *    mesa de jantar é engraçado uma vez e errado sempre.
 * 3. **Os pequenos sobem no que houver** — o sofá, a mesa. É onde um gato
 *    ficaria, e é o que faz o cômodo parecer habitado em vez de sorteado.
 * 4. O resto fica onde der.
 *
 * O `alturaNaSala` do bicho é a medida de "pequeno", e não a altura real da
 * Pokédex: com o tamanho real ligado, um Onix tem nove metros e nenhum deles
 * cabe em cima de nada.
 */
export function ondeNasce(especie: Especie): Preferencia {
  if (especie.voo > 0.001) return 'alto';
  if (especie.tipos.includes('terra') || especie.tipos.includes('pedra')) return 'chao';
  if (especie.altura <= 0.45) return 'movel';
  return 'qualquer';
}

export function pesoSpawn(especie: Especie, jaCapturou: boolean, nivelJogador: number): number {
  // Convidada não nasce no quarto de ninguém. Um Sylveon passeando pela sala
  // seria a resposta errada para o pedido que o trouxe: ele entrou para ser o
  // resultado de uma escolha sua com a pedra na mão, e um bicho que você pode
  // simplesmente encontrar não é resultado de escolha nenhuma.
  if (especie.convidada) return 0;

  const porRaridade: Record<Raridade, number> = {
    comum: 10,
    incomum: 4.5,
    raro: 1.4,
    lendario: 0.05,
  };
  const porEstagio = [1, 0.38, 0.14][especie.estagio] ?? 0.1;

  // As evoluções e os raros só começam a aparecer quando o seu time cresce.
  const soma = especie.base.hp + especie.base.atq + especie.base.def;
  const forte = soma > 200 ? THREE.MathUtils.clamp((nivelJogador - 8) / 16, 0.05, 1) : 1;

  return porRaridade[especie.raridade] * porEstagio * forte * (jaCapturou ? 1 : 2.2);
}

/** Nível de um selvagem, puxado pelo tamanho do seu time. */
export function nivelSelvagem(nivelJogador: number): number {
  const centro = THREE.MathUtils.clamp(nivelJogador, 3, NIVEL_MAXIMO - 6);
  const variacao = Math.floor(Math.random() * 5) - 2;
  return THREE.MathUtils.clamp(centro + variacao, 2, NIVEL_MAXIMO);
}

// ---------------------------------------------------------------- brilhantes

/**
 * A chance base de um brilhante: um em quatrocentos e nove, como na geração VI
 * em diante. Ela quase nunca é a chance que vale — ver `chanceShiny`.
 */
export const CHANCE_SHINY_BASE = 1 / 409;

/**
 * O piso: por mais que você encadeie encontros, a chance não passa disto.
 *
 * Um em quarenta. Sem piso, uma corrente longa transformaria brilhante em
 * rotina, e a raridade É o conteúdo — a única coisa que um brilhante tem é ser
 * raro.
 */
export const CHANCE_SHINY_MAXIMA = 1 / 40;

/** A partir de quantas espécies registradas o Amuleto Brilhante aparece. */
export const ESPECIES_PARA_AMULETO = 50;

export interface SorteBrilhante {
  /** Quantos encontros seguidos com a MESMA espécie você já teve. */
  corrente: number;
  /** Se a Pokédex já rendeu o Amuleto Brilhante. */
  amuleto: boolean;
}

/**
 * A chance de o próximo encontro vir brilhante.
 *
 * Duas coisas a melhoram, e as duas premiam insistência em vez de sorte:
 *
 * - **A corrente.** Encontrar a mesma espécie várias vezes seguidas aumenta a
 *   chance — é o "caçar em cadeia" dos jogos modernos. Cada encontro dobra o
 *   número de bilhetes até o teto, o que faz vinte encontros seguidos valerem
 *   muito mais do que vinte encontros espalhados.
 * - **O Amuleto Brilhante**, que aparece sozinho quando a Pokédex passa de
 *   cinquenta espécies: ele triplica os bilhetes, para sempre.
 *
 * A conta é em BILHETES e não em porcentagem somada: é assim que o jogo
 * original faz, e é o que mantém a curva suave perto do teto em vez de estourar.
 */
export function chanceShiny({ corrente, amuleto }: SorteBrilhante): number {
  // 0,2 bilhete por elo, até quarenta elos. A subida é longa de propósito: com
  // um ganho mais generoso a corrente encostava no teto em dez encontros, e
  // uma caçada que termina em dez encontros não é uma caçada.
  const bilhetes = 1 + Math.min(40, Math.max(0, corrente)) * 0.2 + (amuleto ? 3 : 0);
  return Math.min(CHANCE_SHINY_MAXIMA, CHANCE_SHINY_BASE * bilhetes);
}

/** "1 em 212" — o jeito de mostrar a chance que se entende sem pensar. */
export const textoChanceShiny = (chance: number) => `1 em ${Math.round(1 / chance)}`;

/**
 * Sorteia se este encontro é brilhante.
 *
 * Vale para as 151, e não só para as 61 que têm modelo alternativo no
 * repositório: quem não tem ganha um brilhante PINTADO em tempo de execução
 * (ver `tingirDeBrilhante` em src/modelos.ts). Antes, noventa espécies
 * simplesmente não podiam ser brilhantes, e o jogador não tinha como saber
 * quais — ele só nunca via.
 */
export const sortearShiny = (especie: Especie, sorte: SorteBrilhante): boolean => {
  void especie;
  return Math.random() < chanceShiny(sorte);
};
