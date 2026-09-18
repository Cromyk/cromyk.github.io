import * as THREE from 'three';

/**
 * A hora do dia, e quem aparece por causa dela.
 *
 * ## Por que isto existe
 *
 * O sorteio de quem nasce olhava para raridade, estágio, nível do time e se
 * você já capturou aquela espécie. Tudo interno ao save. O resultado é que o
 * quarto tinha sempre a mesma população: abrir o jogo às sete da manhã e às
 * onze da noite dava exatamente a mesma lista.
 *
 * E o jogo tem um relógio de graça na mão — o do aparelho, que sabe se é dia
 * lá fora. Um Gengar que só ronda de madrugada e um Pidgey que só voa de manhã
 * transformam "quando eu jogo" numa decisão, e é a coisa mais barata que existe
 * para dar a um cômodo fechado a sensação de estar num mundo que continua
 * girando sem você.
 *
 * ## Nunca zero
 *
 * Um noturno de dia fica raro, não impossível. Quem só consegue jogar depois do
 * trabalho, ou só no almoço, ainda tem de poder fechar os cento e cinquenta e
 * um — uma Pokédex com uma parte trancada pelo relógio do escritório não é
 * conteúdo, é castigo.
 */

/**
 * O quanto está de noite: 0 em pleno dia, 1 em plena madrugada.
 *
 * Uma cossenoide com pico à meia-noite, achatada por um `smoothstep`. A
 * cossenoide sozinha passaria metade do dia em meio-termo; o achatamento dá
 * dia cheio das nove às quinze, noite cheia das vinte e uma às cinco, e deixa
 * a transição onde ela de fato acontece, no amanhecer e no entardecer.
 *
 * Contínua de propósito. Um degrau às dezoito horas faria a população do quarto
 * trocar de uma vez, e quem estivesse jogando veria o sorteio virar no meio da
 * sessão sem nada ter acontecido.
 */
export function noturnidade(data = new Date()): number {
  const hora = data.getHours() + data.getMinutes() / 60;
  const cru = (1 + Math.cos((2 * Math.PI * hora) / 24)) / 2;
  return THREE.MathUtils.smoothstep(cru, 0.25, 0.75);
}

/** O nome do momento, para o cartão que avisa. */
export function nomeDoPeriodo(n: number): 'dia' | 'entardecer' | 'noite' {
  if (n >= 0.7) return 'noite';
  if (n >= 0.3) return 'entardecer';
  return 'dia';
}

export type Habito = 'noturno' | 'diurno' | 'indiferente';

/**
 * Quem ronda de noite e quem voa de manhã.
 *
 * Lista explícita, e curta, em vez de uma regra derivada do tipo. Foi a
 * tentação óbvia — "fantasma e veneno são noturnos" — e ela erra feio logo no
 * primeiro caso que importa: Bulbasaur é planta/veneno e é o bicho mais diurno
 * que existe. O hábito de um Pokémon não sai do tipo dele; sai do que a série
 * conta sobre ele, e isso não tem fórmula.
 *
 * Quem não está aqui é indiferente, que é a maioria — e é o certo: a maior
 * parte dos cento e cinquenta e um aparece a qualquer hora nos jogos, e uma
 * tabela que opinasse sobre os 151 estaria inventando 120 opiniões.
 */
const NOTURNOS = new Set([
  // Morcegos: a caverna é escura o dia inteiro, mas eles saem à noite.
  'zubat',
  'golbat',
  // Os fantasmas da Torre de Lavender.
  'gastly',
  'haunter',
  'gengar',
  // Oddish enterra-se de dia e anda à noite — está na própria ficha dele.
  'oddish',
  'gloom',
  'vileplume',
  // Venonat é atraído pela luz no escuro.
  'venonat',
  'venomoth',
  // Os do sono alheio.
  'drowzee',
  'hypno',
  // Clefairy só desce sob o luar.
  'clefairy',
  'clefable',
  'jigglypuff',
  'wigglytuff',
  // Gatos e ratos: noturnos clássicos.
  'meowth',
  'persian',
  'rattata',
  'raticate',
  'ekans',
  'arbok',
  'koffing',
  'weezing',
]);

const DIURNOS = new Set([
  // Pássaros de campo aberto.
  'pidgey',
  'pidgeotto',
  'pidgeot',
  'spearow',
  'fearow',
  // Insetos de lagarta a borboleta: a folha de manhã.
  'caterpie',
  'metapod',
  'butterfree',
  'weedle',
  'kakuna',
  'beedrill',
  // Os do sol.
  'bulbasaur',
  'ivysaur',
  'venusaur',
  'bellsprout',
  'weepinbell',
  'victreebel',
  'exeggcute',
  'exeggutor',
  'growlithe',
  'arcanine',
  'ponyta',
  'rapidash',
]);

export function habitoDe(id: string): Habito {
  if (NOTURNOS.has(id)) return 'noturno';
  if (DIURNOS.has(id)) return 'diurno';
  return 'indiferente';
}

/**
 * O quanto a hora mexe na chance de um bicho aparecer.
 *
 * Duas vezes e meia na hora dele, pouco mais de um terço fora dela. É uma
 * diferença de sete vezes entre o melhor e o pior momento, o que basta para a
 * população do quarto ser visivelmente outra — e o piso de 0,35 é o que impede
 * que "outra" vire "sem ele".
 */
const NA_HORA = 2.5;
const FORA_DE_HORA = 0.35;

export function fatorDoHorario(id: string, n = noturnidade()): number {
  const habito = habitoDe(id);
  if (habito === 'indiferente') return 1;
  const noturno = habito === 'noturno';
  return THREE.MathUtils.lerp(noturno ? FORA_DE_HORA : NA_HORA, noturno ? NA_HORA : FORA_DE_HORA, n);
}

/** O que a ficha da Pokédex diz sobre o hábito, ou nada. */
export function textoDoHabito(id: string): string | null {
  const habito = habitoDe(id);
  if (habito === 'noturno') return 'aparece mais à noite';
  if (habito === 'diurno') return 'aparece mais de dia';
  return null;
}
