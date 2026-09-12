/** Gerador determinístico (mulberry32) — mesma semente, mesma criatura. */
export function criarRng(semente: number) {
  let a = semente >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const entre = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

export function escolher<T>(rng: Rng, itens: readonly T[]): T {
  return itens[Math.floor(rng() * itens.length)];
}

/** Sorteia um item respeitando pesos relativos. */
export function escolherPesado<T>(rng: Rng, itens: readonly T[], peso: (item: T) => number): T {
  const total = itens.reduce((soma, item) => soma + peso(item), 0);
  let alvo = rng() * total;
  for (const item of itens) {
    alvo -= peso(item);
    if (alvo <= 0) return item;
  }
  return itens[itens.length - 1];
}
