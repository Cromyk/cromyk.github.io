/**
 * Giro de endireitamento dos modelos, num lugar só.
 *
 * O manifesto guarda giroX/giroY por espécie; quem desenha (o jogo, a folha de
 * contato) precisa aplicar exatamente o mesmo giro, ou a conferência visual
 * estaria checando uma coisa e o headset mostrando outra.
 */

/** Gira um ponto por giroX e depois por giroY — a ordem que o three.js usa. */
export function girarPonto(p, giroX, giroY) {
  const cx = Math.cos(giroX);
  const sx = Math.sin(giroX);
  const y1 = p[1] * cx - p[2] * sx;
  const z1 = p[1] * sx + p[2] * cx;
  const cy = Math.cos(giroY);
  const sy = Math.sin(giroY);
  return [p[0] * cy + z1 * sy, y1, -p[0] * sy + z1 * cy];
}

/** A caixa envolvente depois do giro: gira os oito cantos e mede de novo. */
export function caixaGirada(min, max, giroX, giroY) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const canto = girarPonto(
      [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]],
      giroX,
      giroY,
    );
    for (let e = 0; e < 3; e++) {
      if (canto[e] < mn[e]) mn[e] = canto[e];
      if (canto[e] > mx[e]) mx[e] = canto[e];
    }
  }
  return {
    min: mn,
    max: mx,
    tamanho: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]],
    centro: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2],
  };
}
