/**
 * A pose de repouso de um GLB, do jeito que o three.js a desenha.
 *
 * Existe porque medir a malha pela matriz dos nós, ignorando os ossos, dá a
 * caixa errada em quem tem esqueleto — e "errada" aqui chegou a 110× no
 * Bulbasaur, que aparecia no quarto do tamanho de um grão de feijão. A regra do
 * glTF é que a matriz do nó de uma malha com pele é IGNORADA: quem manda é
 *
 *     pele(junta) = mundo(junta) · inversaDeBind(junta)
 *
 * somada pelos pesos de cada vértice. É essa conta que o headset faz no frame
 * zero, então é essa que a medição e a folha de contato precisam fazer também —
 * senão uma confere uma coisa e a outra mostra outra, que foi exatamente como
 * Charmander, Charmeleon e Pikachu ganharam "correções" de giro que os
 * quebravam.
 */

/** a · b, em column-major, a mesma convenção das matrizes do glTF. */
export function multiplicarMat(a, b) {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k];
  return r;
}

/** Ponto transformado pela matriz, descartando a componente homogênea. */
export function aplicar(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

export const IDENTIDADE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * As primitivas da cena com as posições já no espaço do mundo, na pose de
 * repouso. Cada entrada traz o material junto porque quem chama sempre quer os
 * dois — a folha para colorir, a medição para achar os olhos.
 *
 * `pontos` é um Float64Array de 3 em 3, na mesma ordem do POSITION original,
 * então os índices da primitiva continuam valendo.
 */
/**
 * O parâmetro `poseLocal` troca a matriz LOCAL de um nó pelo que o mapa disser,
 * indexado pelo nome do nó. É assim que tools/poses.ts desenha o bicho andando:
 * quem calcula a pose é src/rig.ts — o mesmo código que roda no headset — e
 * aqui só se aplica o resultado. Sem o mapa, nada muda e sai o repouso.
 */
export function primitivasEmRepouso(documento, poseLocal = null) {
  const raiz = documento.getRoot();
  const cena = raiz.getDefaultScene() ?? raiz.listScenes()[0];
  if (!cena) return [];

  // Primeiro a árvore inteira: a matriz de mundo de uma junta é preciso saber
  // antes de tocar em qualquer malha, porque o esqueleto costuma ficar num
  // ramo diferente do da malha que ele deforma.
  const mundoDoNo = new Map();
  const anotar = (no, pai) => {
    const local = poseLocal?.get(no.getName()) ?? no.getMatrix();
    const mundo = multiplicarMat(pai, local);
    mundoDoNo.set(no, mundo);
    for (const filho of no.listChildren()) anotar(filho, mundo);
  };
  for (const no of cena.listChildren()) anotar(no, IDENTIDADE);

  const saida = [];
  const varrer = (no) => {
    const malha = no.getMesh();
    if (malha) {
      const pele = no.getSkin();
      let matrizesDePele = null;
      if (pele) {
        const inversas = pele.getInverseBindMatrices();
        matrizesDePele = pele.listJoints().map((junta, i) => {
          const inv = inversas ? inversas.getElement(i, new Array(16)) : IDENTIDADE;
          return multiplicarMat(mundoDoNo.get(junta) ?? IDENTIDADE, inv);
        });
      }
      const mundo = mundoDoNo.get(no) ?? IDENTIDADE;

      for (const prim of malha.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const juntas = prim.getAttribute('JOINTS_0');
        const pesos = prim.getAttribute('WEIGHTS_0');
        const n = pos.getCount();
        const pontos = new Float64Array(n * 3);
        const v = [0, 0, 0];
        const j4 = [0, 0, 0, 0];
        const w4 = [0, 0, 0, 0];

        for (let i = 0; i < n; i++) {
          pos.getElement(i, v);
          let p;
          if (matrizesDePele && juntas && pesos) {
            juntas.getElement(i, j4);
            pesos.getElement(i, w4);
            let x = 0, y = 0, z = 0, soma = 0;
            for (let k = 0; k < 4; k++) {
              const w = w4[k];
              if (!w) continue;
              const m = matrizesDePele[j4[k]];
              if (!m) continue;
              const q = aplicar(m, v);
              x += q[0] * w; y += q[1] * w; z += q[2] * w;
              soma += w;
            }
            // Vértice sem peso nenhum (acontece em rip mal exportado) cai de
            // volta na matriz do nó, que é melhor do que ir parar na origem.
            p = soma > 1e-6 ? [x / soma, y / soma, z / soma] : aplicar(mundo, v);
          } else {
            p = aplicar(mundo, v);
          }
          pontos[i * 3] = p[0];
          pontos[i * 3 + 1] = p[1];
          pontos[i * 3 + 2] = p[2];
        }

        saida.push({ prim, material: prim.getMaterial(), pontos, contagem: n });
      }
    }
    for (const filho of no.listChildren()) varrer(filho);
  };
  for (const no of cena.listChildren()) varrer(no);
  return saida;
}
