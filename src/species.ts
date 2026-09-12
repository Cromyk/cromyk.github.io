import * as THREE from 'three';
import { CONSTRUTORES, type Partes } from './criaturas';

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
  formato: 'jato' | 'projetil' | 'raio';
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
  /** Pode ser escolhido como inicial. */
  inicial: boolean;
  descricao: string;
}

export const ESPECIES: readonly Especie[] = [
  {
    id: 'fagulho',
    nome: 'Fagulho',
    tipo: 'fogo',
    altura: 0.36,
    hpMax: 40,
    ataque: 54,
    defesa: 42,
    golpe: { nome: 'Lufada de Brasa', tipo: 'fogo', potencia: 42, formato: 'jato', recarga: 1.1 },
    taxaCaptura: 0.78,
    inicial: true,
    descricao: 'A crista acende quando ele respira fundo. Dorme em cima de pedra morna.',
  },
  {
    id: 'marolo',
    nome: 'Marolo',
    tipo: 'agua',
    altura: 0.3,
    hpMax: 46,
    ataque: 47,
    defesa: 66,
    golpe: { nome: 'Esguicho', tipo: 'agua', potencia: 40, formato: 'jato', recarga: 1.05 },
    taxaCaptura: 0.78,
    inicial: true,
    descricao: 'O casco é liso feito seixo de rio. Ele se enrola e desce ladeira rolando.',
  },
  {
    id: 'sementil',
    nome: 'Sementil',
    tipo: 'planta',
    altura: 0.33,
    hpMax: 47,
    ataque: 50,
    defesa: 50,
    golpe: { nome: 'Folha Afiada', tipo: 'planta', potencia: 45, formato: 'projetil', recarga: 1.2 },
    taxaCaptura: 0.78,
    inicial: true,
    descricao: 'A flor da cabeça fecha à noite. Se você chegar devagar, ela não fecha.',
  },
  {
    id: 'trovisco',
    nome: 'Trovisco',
    tipo: 'eletrico',
    altura: 0.29,
    hpMax: 36,
    ataque: 57,
    defesa: 40,
    golpe: { nome: 'Estalo', tipo: 'eletrico', potencia: 50, formato: 'raio', recarga: 1.35 },
    taxaCaptura: 0.6,
    inicial: false,
    descricao: 'Abre a cauda em leque quando se assusta, e aí o pelo todo arrepia.',
  },
];

export const INICIAIS = ESPECIES.filter((e) => e.inicial);

export const porId = (id: string) => ESPECIES.find((e) => e.id === id);

/** Trovisco aparece menos: ele é o que você caça, não o que ganha. */
export const pesoSpawn = (e: Especie) => (e.inicial ? 6 : 2.6);

export function calcularDano(
  atacante: Especie,
  defensor: Especie,
  golpe: Golpe,
): { dano: number; efetividade: number; critico: boolean } {
  const efetividade = multiplicador(golpe.tipo, defensor.tipo);
  const critico = Math.random() < 0.08;
  const variacao = 0.85 + Math.random() * 0.15;
  const mesmoTipo = golpe.tipo === atacante.tipo ? 1.5 : 1;

  // A tabela de tipos continua clássica (2× e 0,5×) no que aparece na tela, mas
  // no dano ela entra comprimida: em VR, um confronto ruim que exigisse 17
  // golpes cansaria antes de ensinar qualquer coisa.
  const efetividadeDano = Math.pow(efetividade, 0.72);
  const forca = Math.pow(atacante.ataque / defensor.defesa, 0.7);

  const base = ((2 * 5) / 5 + 2) * golpe.potencia * forca;
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
): number {
  // Calibrado para a captura final (isto ao cubo) andar de ~33% com o alvo
  // inteiro até ~80% com ele quase desmaiado, usando a bola comum. Generoso o
  // bastante para não travar o começo, e ainda assim recompensando a batalha.
  const desgaste = 1 - hpFracao;
  const base = THREE.MathUtils.clamp(
    especie.taxaCaptura * (0.885 + 0.323 * desgaste) * (1 - alarme * 0.18),
    0.16,
    0.94,
  );
  const comBola = 1 - (1 - base) / Math.max(1, multiplicadorBola);
  return THREE.MathUtils.clamp(comBola, 0.16, 0.985);
}

export type PartesCriatura = Partes;

export function construirCriatura(especie: Especie): Partes {
  const construtor = CONSTRUTORES[especie.id];
  if (!construtor) throw new Error(`sem construtor para ${especie.id}`);
  return construtor();
}
