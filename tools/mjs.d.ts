// As ferramentas .mjs são JavaScript puro e ficam assim de propósito: elas
// rodam soltas, sem passo de compilação. Estas declarações existem só para os
// poucos arquivos .ts em tools/ poderem importá-las sem `any` espalhado.
declare module './pose.mjs' {
  export const IDENTIDADE: number[];
  export function multiplicarMat(a: number[], b: number[]): number[];
  export function aplicar(m: number[], p: number[]): number[];
  export function primitivasEmRepouso(
    documento: unknown,
    poseLocal?: Map<string, number[]> | null,
  ): Array<{ prim: any; material: any; pontos: Float64Array; contagem: number }>;
}

declare module './orientacao.mjs' {
  export function girarPonto(p: number[], giroX: number, giroY: number): number[];
  export function caixaGirada(min: number[], max: number[], giroX: number, giroY: number): unknown;
}

declare module './png.mjs' {
  export function codificarPng(largura: number, altura: number, rgba: Uint8Array): Buffer;
}

declare module './raster.mjs' {
  export const LUZ: number[];
  export function corDoNome(nome: string): number[];
  export function caixaDe(tris: unknown[]): {
    centro: { x: number; y: number; z: number };
    largura: number;
    alturaModelo: number;
    profundidade: number;
    min: number[];
    max: number[];
  } | null;
  export function desenharCelula(opcoes: {
    rgba: Uint8Array;
    largura: number;
    ox: number;
    oy: number;
    celula: number;
    tris: unknown[];
    naTela: (p: number[]) => number[];
  }): void;
}
