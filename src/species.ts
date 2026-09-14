import * as THREE from 'three';
import { EFETIVIDADE, POKEDEX, type EntradaDex, type Tipo } from './pokedex.gen';
import { temModelo, temShiny } from './modelos';

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

export interface Golpe {
  nome: string;
  tipo: Tipo;
  potencia: number;
  /** Como o efeito é desenhado. Só existem estes três em attacks.ts. */
  formato: 'jato' | 'projetil' | 'raio';
  recarga: number;
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
    fisico: { nome: 'Investida', tipo: 'normal', potencia: 40, formato: 'projetil', recarga: 1.0 },
    especial: { nome: 'Hiper-Raio', tipo: 'normal', potencia: 62, formato: 'raio', recarga: 1.6 },
  },
  fogo: {
    fisico: { nome: 'Presa de Fogo', tipo: 'fogo', potencia: 48, formato: 'projetil', recarga: 1.1 },
    especial: { nome: 'Lança-Chamas', tipo: 'fogo', potencia: 55, formato: 'jato', recarga: 1.2 },
  },
  agua: {
    fisico: { nome: 'Aqua-Impacto', tipo: 'agua', potencia: 46, formato: 'projetil', recarga: 1.05 },
    especial: { nome: 'Jato d’Água', tipo: 'agua', potencia: 52, formato: 'jato', recarga: 1.1 },
  },
  eletrico: {
    fisico: { nome: 'Trovoada', tipo: 'eletrico', potencia: 50, formato: 'raio', recarga: 1.3 },
    especial: { nome: 'Choque do Trovão', tipo: 'eletrico', potencia: 56, formato: 'raio', recarga: 1.35 },
  },
  planta: {
    fisico: { nome: 'Chicote de Cipó', tipo: 'planta', potencia: 45, formato: 'projetil', recarga: 1.1 },
    especial: { nome: 'Folha Navalha', tipo: 'planta', potencia: 52, formato: 'projetil', recarga: 1.15 },
  },
  gelo: {
    fisico: { nome: 'Presa Gélida', tipo: 'gelo', potencia: 48, formato: 'projetil', recarga: 1.15 },
    especial: { nome: 'Raio de Gelo', tipo: 'gelo', potencia: 55, formato: 'jato', recarga: 1.25 },
  },
  lutador: {
    fisico: { nome: 'Golpe Cruzado', tipo: 'lutador', potencia: 54, formato: 'projetil', recarga: 1.2 },
    especial: { nome: 'Onda de Choque', tipo: 'lutador', potencia: 48, formato: 'jato', recarga: 1.15 },
  },
  veneno: {
    fisico: { nome: 'Ferroada Tóxica', tipo: 'veneno', potencia: 44, formato: 'projetil', recarga: 1.05 },
    especial: { nome: 'Bomba de Lodo', tipo: 'veneno', potencia: 52, formato: 'projetil', recarga: 1.2 },
  },
  terra: {
    fisico: { nome: 'Terremoto', tipo: 'terra', potencia: 58, formato: 'projetil', recarga: 1.45 },
    especial: { nome: 'Jato de Areia', tipo: 'terra', potencia: 46, formato: 'jato', recarga: 1.1 },
  },
  voador: {
    fisico: { nome: 'Bico Furador', tipo: 'voador', potencia: 48, formato: 'projetil', recarga: 1.05 },
    especial: { nome: 'Vento Cortante', tipo: 'voador', potencia: 50, formato: 'jato', recarga: 1.15 },
  },
  psiquico: {
    fisico: { nome: 'Investida Zen', tipo: 'psiquico', potencia: 48, formato: 'projetil', recarga: 1.1 },
    especial: { nome: 'Psíquico', tipo: 'psiquico', potencia: 58, formato: 'raio', recarga: 1.4 },
  },
  inseto: {
    fisico: { nome: 'Mordida de Inseto', tipo: 'inseto', potencia: 44, formato: 'projetil', recarga: 1.0 },
    especial: { nome: 'Zumbido', tipo: 'inseto', potencia: 50, formato: 'jato', recarga: 1.15 },
  },
  pedra: {
    fisico: { nome: 'Avalanche de Pedras', tipo: 'pedra', potencia: 52, formato: 'projetil', recarga: 1.3 },
    especial: { nome: 'Pedra Energizada', tipo: 'pedra', potencia: 50, formato: 'projetil', recarga: 1.25 },
  },
  fantasma: {
    fisico: { nome: 'Sombra Furtiva', tipo: 'fantasma', potencia: 50, formato: 'projetil', recarga: 1.15 },
    especial: { nome: 'Bola Sombria', tipo: 'fantasma', potencia: 56, formato: 'projetil', recarga: 1.3 },
  },
  dragao: {
    fisico: { nome: 'Garra de Dragão', tipo: 'dragao', potencia: 56, formato: 'projetil', recarga: 1.3 },
    especial: { nome: 'Sopro do Dragão', tipo: 'dragao', potencia: 54, formato: 'jato', recarga: 1.25 },
  },
  sombrio: {
    fisico: { nome: 'Mordida', tipo: 'sombrio', potencia: 48, formato: 'projetil', recarga: 1.05 },
    especial: { nome: 'Pulso Sombrio', tipo: 'sombrio', potencia: 54, formato: 'jato', recarga: 1.25 },
  },
  aco: {
    fisico: { nome: 'Garra de Aço', tipo: 'aco', potencia: 50, formato: 'projetil', recarga: 1.2 },
    especial: { nome: 'Raio Espelhado', tipo: 'aco', potencia: 48, formato: 'raio', recarga: 1.3 },
  },
  fada: {
    fisico: { nome: 'Beijo Drenante', tipo: 'fada', potencia: 46, formato: 'projetil', recarga: 1.05 },
    especial: { nome: 'Brilho Mágico', tipo: 'fada', potencia: 54, formato: 'jato', recarga: 1.2 },
  },
};

// ---------------------------------------------------------------- espécies

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
  /** Um por tipo que ele tem: o segundo dá a jogada de cobertura. */
  golpes: readonly Golpe[];
  /** O principal, para a vitrine e a ficha. */
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
  genero: string;
  descricao: string;
}

/** Quem você pode escolher no começo. Os três clássicos, mais o rato. */
const INICIAIS_IDS = ['bulbasaur', 'charmander', 'squirtle', 'pikachu'];

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

function classificar(entrada: EntradaDex, estagio: number): Raridade {
  if (entrada.lendario) return 'lendario';
  if (entrada.taxaBase >= 150 && estagio === 0) return 'comum';
  if (entrada.taxaBase >= 75) return 'incomum';
  return 'raro';
}

function montarGolpes(entrada: EntradaDex): Golpe[] {
  // Quem tem ataque especial maior que o físico luta de longe. É a mesma
  // divisão do jogo original, e aqui ela decide o FORMATO do efeito — jato e
  // raio para os de longe, projétil para os que chegam junto.
  const deLonge = entrada.base.atqEsp > entrada.base.atq;
  const escolher = (t: Tipo) => (deLonge ? GOLPES[t].especial : GOLPES[t].fisico);

  const tipos = entrada.tipos as Tipo[];
  const golpes = [escolher(tipos[0])];
  if (tipos[1]) golpes.push(escolher(tipos[1]));
  return golpes;
}

const estagios = calcularEstagios();

export const ESPECIES: readonly Especie[] = POKEDEX.filter((e) => temModelo(e.id)).map((e) => {
  const estagio = estagios.get(e.id) ?? 0;
  const golpes = montarGolpes(e);
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
    golpes,
    golpe: golpes[0],
    // A escala da Pokédex é 3 (Mewtwo) a 255 (Caterpie). A raiz levanta o pé
    // da curva: sem ela, tudo abaixo de 60 viraria a mesma captura impossível.
    taxaCaptura: THREE.MathUtils.clamp(Math.pow(e.taxaBase / 255, 0.62), 0.1, 0.95),
    raridade: classificar(e, estagio),
    lendario: e.lendario,
    estagio,
    evolui: e.evolui,
    temShiny: temShiny(e.id),
    inicial: INICIAIS_IDS.includes(e.id),
    genero: e.genero,
    descricao: e.descricao,
  };
});

const PorId = new Map(ESPECIES.map((e) => [e.id, e]));

export const porId = (id: string) => PorId.get(id);
export const porNum = (num: number) => ESPECIES.find((e) => e.num === num);
export const INICIAIS = INICIAIS_IDS.map((id) => PorId.get(id)!).filter(Boolean);
export const TOTAL_ESPECIES = ESPECIES.length;

export const corDe = (especie: Especie) => TIPOS[especie.tipo].cor;
export const corHexDe = (especie: Especie) =>
  `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`;
export const textoTipos = (especie: Especie) =>
  especie.tipos.map((t) => TIPOS[t].nome).join(' · ');

// ---------------------------------------------------------------- níveis

export const NIVEL_MAXIMO = 60;

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

/** Para quem esta espécie evolui neste nível, se for a hora. */
export function evolucaoEm(especie: Especie, nivel: number): Especie | null {
  if (!especie.evolui || nivel < especie.evolui.nivel) return null;
  return PorId.get(especie.evolui.para) ?? null;
}

// ---------------------------------------------------------------- combate

export interface Combatente {
  especie: Especie;
  nivel: number;
}

/** O golpe mais eficaz que o atacante tem contra este defensor. */
export function escolherGolpe(atacante: Combatente, defensor: Combatente): Golpe {
  let melhor = atacante.especie.golpes[0];
  let melhorNota = -1;
  for (const golpe of atacante.especie.golpes) {
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

export function calcularDano(
  atacante: Combatente,
  defensor: Combatente,
  golpe: Golpe,
): { dano: number; efetividade: number; critico: boolean } {
  const efetividade = multiplicador(golpe.tipo, defensor.especie.tipos);
  if (efetividade === 0) return { dano: 0, efetividade, critico: false };

  const deLonge = golpe.formato !== 'projetil';
  const sa = statsNoNivel(atacante.especie, atacante.nivel);
  const sd = statsNoNivel(defensor.especie, defensor.nivel);
  const ataque = deLonge ? sa.ataqueEsp : sa.ataque;
  const defesa = deLonge ? sd.defesaEsp : sd.defesa;

  const critico = Math.random() < 0.08;
  const variacao = 0.85 + Math.random() * 0.15;
  const mesmoTipo = atacante.especie.tipos.includes(golpe.tipo) ? 1.5 : 1;

  // A tabela de tipos continua clássica (2× e 0,5×) no que aparece na tela, mas
  // no dano ela entra comprimida: em VR, um confronto ruim que exigisse 17
  // golpes cansaria antes de ensinar qualquer coisa.
  const efetividadeDano = Math.pow(efetividade, 0.72);
  const forca = Math.pow(ataque / Math.max(1, defesa), 0.7);

  const base = ((2 * atacante.nivel) / 5 + 2) * golpe.potencia * forca;
  const dano = (base / 50 + 2) * efetividadeDano * mesmoTipo * variacao * (critico ? 1.8 : 1);

  return { dano: Math.max(1, Math.round(dano * 0.95)), efetividade, critico };
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
  const comBola = 1 - (1 - base) / Math.max(1, multiplicadorBola);
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
export function pesoSpawn(especie: Especie, jaCapturou: boolean, nivelJogador: number): number {
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

/** Um em trezentos, e só entre os que têm modelo shiny no repositório. */
export const CHANCE_SHINY = 1 / 300;
export const sortearShiny = (especie: Especie) =>
  especie.temShiny && Math.random() < CHANCE_SHINY;
