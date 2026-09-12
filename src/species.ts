import * as THREE from 'three';
import { CONSTRUTORES, type Partes } from './pokemon';

export type Tipo = 'fogo' | 'agua' | 'planta' | 'eletrico';

export const TIPOS: Record<Tipo, { nome: string; cor: number }> = {
  fogo: { nome: 'Fogo', cor: 0xff7a3c },
  agua: { nome: 'Água', cor: 0x4fa8f5 },
  planta: { nome: 'Planta', cor: 0x66c95a },
  eletrico: { nome: 'Elétrico', cor: 0xffd23b },
};

/** Efetividade do ataque contra o defensor. 2 = super, 0.5 = pouco eficaz. */
const EFETIVIDADE: Record<Tipo, Partial<Record<Tipo, number>>> = {
  fogo: { planta: 2, agua: 0.5, fogo: 0.5 },
  agua: { fogo: 2, planta: 0.5, agua: 0.5 },
  planta: { agua: 2, fogo: 0.5, planta: 0.5 },
  eletrico: { agua: 2, planta: 0.5, eletrico: 0.5 },
};

export function multiplicador(atacante: Tipo, defensor: Tipo): number {
  return EFETIVIDADE[atacante][defensor] ?? 1;
}

export function textoEfetividade(m: number): string | null {
  if (m >= 2) return 'é super eficaz!';
  if (m <= 0.5) return 'não é muito eficaz…';
  return null;
}

export interface Golpe {
  nome: string;
  tipo: Tipo;
  potencia: number;
  /** Como o efeito viaja até o alvo. */
  formato: 'jato' | 'projetil' | 'raio';
  /** Segundos entre um uso e outro. */
  recarga: number;
}

export interface Especie {
  id: string;
  nome: string;
  tipo: Tipo;
  /** Altura em metros, do chão ao topo da cabeça. */
  altura: number;
  hpMax: number;
  ataque: number;
  defesa: number;
  golpe: Golpe;
  /** Quanto menor, mais difícil de capturar. */
  taxaCaptura: number;
  descricao: string;
}

export const ESPECIES: readonly Especie[] = [
  {
    id: 'charmander',
    nome: 'Charmander',
    tipo: 'fogo',
    altura: 0.34,
    hpMax: 39,
    ataque: 52,
    defesa: 43,
    golpe: { nome: 'Brasa', tipo: 'fogo', potencia: 40, formato: 'jato', recarga: 1.1 },
    descricao: 'A chama da cauda mostra o humor dele. Fraca quando está cansado.',
    taxaCaptura: 0.62,
  },
  {
    id: 'squirtle',
    nome: 'Squirtle',
    tipo: 'agua',
    altura: 0.32,
    hpMax: 44,
    ataque: 48,
    defesa: 65,
    golpe: { nome: 'Jato d’Água', tipo: 'agua', potencia: 40, formato: 'jato', recarga: 1.1 },
    descricao: 'Esconde a cabeça no casco e dispara água com uma pontaria absurda.',
    taxaCaptura: 0.62,
  },
  {
    id: 'bulbasaur',
    nome: 'Bulbasaur',
    tipo: 'planta',
    altura: 0.3,
    hpMax: 45,
    ataque: 49,
    defesa: 49,
    golpe: {
      nome: 'Folha Navalha',
      tipo: 'planta',
      potencia: 45,
      formato: 'projetil',
      recarga: 1.25,
    },
    descricao: 'O bulbo nas costas cresce sugando energia do sol.',
    taxaCaptura: 0.62,
  },
  {
    id: 'pikachu',
    nome: 'Pikachu',
    tipo: 'eletrico',
    altura: 0.31,
    hpMax: 35,
    ataque: 55,
    defesa: 40,
    golpe: {
      nome: 'Choque do Trovão',
      tipo: 'eletrico',
      potencia: 50,
      formato: 'raio',
      recarga: 1.4,
    },
    descricao: 'Guarda eletricidade nas bochechas. Solta tudo quando se assusta.',
    taxaCaptura: 0.45,
  },
];

export const porId = (id: string) => ESPECIES.find((e) => e.id === id);

/** Pikachu aparece menos que os três iniciais. */
export const pesoSpawn = (e: Especie) => (e.id === 'pikachu' ? 2.2 : 6);

/**
 * Dano de um golpe, no espírito da fórmula clássica: potência, ataque de quem
 * bate, defesa de quem apanha, tipo, e uma variação para não ficar previsível.
 */
export function calcularDano(
  atacante: Especie,
  defensor: Especie,
  golpe: Golpe,
): { dano: number; efetividade: number; critico: boolean } {
  const efetividade = multiplicador(golpe.tipo, defensor.tipo);
  const critico = Math.random() < 0.08;
  const variacao = 0.85 + Math.random() * 0.15;
  // Bônus quando o tipo do golpe é o mesmo do atacante.
  const mesmoTipo = golpe.tipo === atacante.tipo ? 1.5 : 1;

  // A tabela de tipos continua clássica (2× e 0,5×) para o que é mostrado na
  // tela, mas no dano ela entra comprimida: num jogo de VR, um confronto ruim
  // que exigisse 17 arremessos de golpe cansaria antes de ensinar.
  const efetividadeDano = Math.pow(efetividade, 0.72);
  const forca = Math.pow(atacante.ataque / defensor.defesa, 0.7);

  const base = ((2 * 5) / 5 + 2) * golpe.potencia * forca;
  const dano = (base / 50 + 2) * efetividadeDano * mesmoTipo * variacao * (critico ? 1.8 : 1);

  return { dano: Math.max(1, Math.round(dano * 0.95)), efetividade, critico };
}

/**
 * Chance de escapar de cada uma das três sacudidas. Um Pokémon quase sem HP é
 * bem mais fácil de pegar — é o que faz valer a pena batalhar antes.
 */
export function chanceCaptura(especie: Especie, hpFracao: number, alarme: number): number {
  const porHp = 1 - hpFracao * 0.55; // HP cheio ≈ 0.45, desmaiando ≈ 1
  return THREE.MathUtils.clamp(especie.taxaCaptura * (0.55 + porHp) * (1 - alarme * 0.25), 0.14, 0.95);
}

// ---- ponte com o construtor de geometria ----

export type PartesCriatura = Partes;

export function construirCriatura(especie: Especie): Partes {
  const construtor = CONSTRUTORES[especie.id];
  if (!construtor) throw new Error(`sem construtor para ${especie.id}`);
  return construtor();
}
