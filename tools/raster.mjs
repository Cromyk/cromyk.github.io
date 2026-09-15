/**
 * O rasterizador das folhas de conferência: triângulo, z-buffer e uma luz.
 *
 * Existe separado porque há duas folhas e elas desenham igual. `folha.mjs`
 * pergunta se o modelo está de pé e de frente; `poses.ts` pergunta se ele se
 * MEXE — e as duas precisam da mesma imagem, senão uma conferência contradiz a
 * outra, que já aconteceu neste projeto com o skinning.
 *
 * Nada de WebGL e nada de navegador: é aritmética e um Uint8Array.
 */

/** Direção da luz, normalizada. Vem de cima e um pouco da direita. */
export const LUZ = (() => {
  const v = [0.45, 0.8, 0.55];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

/** Cor estável a partir de um nome, para as partes do modelo se separarem. */
export function corDoNome(nome) {
  let h = 2166136261;
  for (let i = 0; i < nome.length; i++) h = Math.imul(h ^ nome.charCodeAt(i), 16777619);
  const matiz = ((h >>> 0) % 360) / 360;
  // HSL → RGB com saturação baixa: é para ler forma, não para julgar cor.
  const f = (n) => {
    const k = (n + matiz * 12) % 12;
    return 0.62 - 0.26 * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Desenha os triângulos numa célula quadrada da folha.
 *
 * `naTela` recebe um ponto do modelo e devolve [x, y, profundidade] já em
 * pixels da folha inteira — a projeção fica com quem chama, porque é ela que
 * muda entre uma vista de frente e uma de cima.
 *
 * Sem culling de face: alguns rips têm a orientação das faces trocada, e um
 * bicho com metade do corpo faltando na conferência engana mais do que ajuda.
 */
export function desenharCelula({ rgba, largura, ox, oy, celula, tris, naTela }) {
  const zbuf = new Float32Array(celula * celula).fill(Infinity);

  for (const tri of tris) {
    // Normal geométrica, no espaço do modelo.
    const u = [tri.b[0] - tri.a[0], tri.b[1] - tri.a[1], tri.b[2] - tri.a[2]];
    const w = [tri.c[0] - tri.a[0], tri.c[1] - tri.a[1], tri.c[2] - tri.a[2]];
    const nx = u[1] * w[2] - u[2] * w[1];
    const ny = u[2] * w[0] - u[0] * w[2];
    const nz = u[0] * w[1] - u[1] * w[0];
    const nl = Math.hypot(nx, ny, nz) || 1;

    const p0 = naTela(tri.a);
    const p1 = naTela(tri.b);
    const p2 = naTela(tri.c);

    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (area === 0) continue;

    const difusa = Math.abs((nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]) / nl);
    const luz = 0.34 + difusa * 0.82;

    const minX = Math.max(ox, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const maxX = Math.min(ox + celula - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const minY = Math.max(oy, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const maxY = Math.min(oy + celula - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((p1[0] - p0[0]) * (py - p0[1]) - (px - p0[0]) * (p1[1] - p0[1])) / area;
        const w1 = ((p2[0] - p1[0]) * (py - p1[1]) - (px - p1[0]) * (p2[1] - p1[1])) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        const z = p0[2] * w1 + p1[2] * w2 + p2[2] * w0;
        const cel = (y - oy) * celula + (x - ox);
        if (z >= zbuf[cel]) continue;
        zbuf[cel] = z;

        const i = (y * largura + x) * 4;
        rgba[i] = Math.min(255, tri.cor[0] * 255 * luz);
        rgba[i + 1] = Math.min(255, tri.cor[1] * 255 * luz);
        rgba[i + 2] = Math.min(255, tri.cor[2] * 255 * luz);
      }
    }
  }
}

/** A caixa que envolve os triângulos. Devolve null se não houver nenhum. */
export function caixaDe(tris) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      for (let e = 0; e < 3; e++) {
        if (p[e] < mn[e]) mn[e] = p[e];
        if (p[e] > mx[e]) mx[e] = p[e];
      }
    }
  }
  if (!Number.isFinite(mn[0])) return null;
  return {
    centro: { x: (mn[0] + mx[0]) / 2, y: (mn[1] + mx[1]) / 2, z: (mn[2] + mx[2]) / 2 },
    largura: mx[0] - mn[0],
    alturaModelo: mx[1] - mn[1],
    profundidade: mx[2] - mn[2],
    min: mn,
    max: mx,
  };
}
