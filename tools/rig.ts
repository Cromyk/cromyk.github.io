/**
 * Veste a luva de costura no esqueleto da mão do jogo.
 *
 * ## O que já não funcionou, para ninguém repetir
 *
 * Três abordagens caíram antes desta, e as três estão medidas (ver PLAYTEST.md
 * e o cabeçalho de tools/luva.mjs):
 *
 * - **fatiar** perpendicular ao eixo: os dedos são CURVOS, e a fatia corta ao
 *   longo deles. Em trinta fatias nunca aparecem mais de dois lóbulos.
 * - **setor angular** no plano da palma: a distribuição é contínua de -36° a
 *   +34°, sem cinco picos. Os dedos são grossos, quase se tocam, e a malha da
 *   palma preenche o vão entre eles.
 * - **ICP** entre as duas malhas: minimizado por SOBREPOSIÇÃO DE VOLUME e não
 *   por anatomia. Duas mãos de tamanho parecido encaixam em quase qualquer
 *   orientação com erro parecido — nenhuma quantidade de orientações iniciais
 *   conserta um critério que não distingue o certo do errado.
 *
 * ## O que funciona: distância geodésica
 *
 * A medida certa não é no espaço, é NA SUPERFÍCIE. A geodésica corre ao longo
 * do tecido, então ela não liga para o dedo estar dobrado: a ponta do indicador
 * continua a uns 400 mm de caminhada do punho, dobrada ou reta. É exatamente a
 * invariância que faltava às três tentativas acima.
 *
 *   1. soldar a malha (o CLO3D parte por padrão de costura) até ficar CONEXA —
 *      sem isso a geodésica não atravessa as costuras;
 *   2. Dijkstra a partir da ponta da manga;
 *   3. as cinco pontas de dedo são os máximos locais dessa distância;
 *   4. a ordem anatômica sai do ÂNGULO das pontas no plano da palma: em leque,
 *      polegar→mindinho é uma sequência, e ela se preserva;
 *   5. com cinco correspondências anatômicas mais o punho, o alinhamento vira
 *      um Procrustes ancorado — não um ICP procurando volume;
 *   6. a segmentação por dedo sai do mesmo Dijkstra, agora multi-origem;
 *   7. os pesos saem da segmentação, e a luva é levada à BIND POSE pela inversa
 *      da transformação de cada osso — sem isso ela entra no jogo já dobrada e
 *      o esqueleto a dobra de novo.
 *
 * A exportação não monta um GLB do zero: abre o right.glb e troca só a
 * geometria da primitiva. As 25 juntas e as inverseBindMatrices continuam
 * sendo as do arquivo oficial, que é o que garante que o jogo, o rastreamento
 * de mão e tools/mao.ts continuem enxergando a mesma mão.
 *
 *   npm run rig              lê, segmenta e desenha folha-dedos.png
 *
 * ## Onde isto parou
 *
 * **Os cinco dedos estão segmentados, e isso está conferido na folha.** Era o
 * problema que travou este arquivo por três tentativas, e ele está resolvido:
 * cada dedo sai com o seu pedaço de malha, com a palma e a manga de fora.
 *
 * Duas lições que custaram caro e estão nas constantes acima:
 *
 * - a solda tem de ser MÍNIMA (0,02 mm). A malha só fica 100% conexa a 0,45,
 *   mas soldar assim funde dedos que se encostam, e a geodésica ganha atalhos
 *   de um dedo para o outro. Melhor trabalhar no maior pedaço (94,2%).
 * - o dedo se define pela distância À PONTA, não pela distância desde o punho.
 *   Sem esse corte a palma inteira vai para o polegar.
 *
 * O que falta, em ordem:
 *
 * 1. **A ordem anatômica não está confiável.** O critério atual (ângulo no
 *    plano da palma, com o polegar sendo o extremo de menor geodésica) devolve
 *    uma ordem que as geodésicas desmentem — o "polegar" sai com 385 mm contra
 *    425 do "anelar", e o polegar deveria ser o mais curto dos cinco. Provável
 *    saída: medir onde cada dedo BIFURCA do tronco. O polegar se separa muito
 *    antes dos outros, e isso é topologia, não geometria — não depende da pose.
 * 2. alinhar por Procrustes ancorado nas cinco pontas mais o punho;
 * 3. pesos a partir da segmentação, com transição suave entre ossos vizinhos;
 * 4. levar a luva à BIND POSE pela inversa da transformação de cada osso;
 * 5. gravar trocando só a geometria dentro do right.glb.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MaoArticulada } from '../src/glove';

const RAIZ = process.cwd();
const MAOS = join(RAIZ, 'public', 'maos');
const args = process.argv.slice(2);
const DIAG = args.includes('--diag');
const padraoObj = 'C:/Users/marco.souza/Downloads/Gloves_Qa/Gloves_Qa.obj';
const argObj = args.find((a) => a.startsWith('--obj='));
const OBJ = argObj ? argObj.slice('--obj='.length) : padraoObj;
/**
 * Tolerância de solda — e ela tem de ser PEQUENA, ao contrário do que parece.
 *
 * A malha só fica 100% conexa a partir de 0,45 mm, e a tentação é usar isso. É
 * uma armadilha: os dedos desta luva se encostam, e soldar por proximidade a
 * 0,45 ou 0,6 mm FUNDE dedos vizinhos. A geodésica então ganha atalhos que
 * atravessam de um dedo para o outro, e a segmentação sai com um dedo comendo
 * o vizinho — foi exatamente o que aconteceu, e a folha denunciou.
 *
 * A 0,02 mm só as costuras de verdade soldam (o CLO3D duplica o vértice no
 * mesmo lugar), a malha fica em 7 pedaços e o maior tem 94,2% dela. Trabalhar
 * só nesse pedaço é melhor do que ter a malha inteira com os dedos grudados.
 */
const TOL = 0.02;
/**
 * Até onde, caminhando pela superfície a partir da ponta, ainda é dedo.
 *
 * Um dedo tem uns 90 mm. Sem este limite a segmentação particiona a malha
 * TODA, e a palma inteira vai para a ponta mais próxima — na prática, para o
 * polegar, que ficava com 20.792 vértices contra 2.078 do vizinho.
 */
const COMPRIMENTO_DEDO = 95;
/** Raio geodésico que separa uma ponta de outra. Dedos adjacentes distam mais. */
const RAIO_PONTA = 70;

// ------------------------------------------------------------------ a malha

interface Malha {
  P: Float64Array;
  TRI: Int32Array;
  viz: Set<number>[];
  /** 1 nos vértices do maior pedaço conexo — os únicos onde a geodésica vale. */
  noMaior: Uint8Array;
}

/**
 * Lê o OBJ e SOLDA até a malha ficar conexa.
 *
 * O CLO3D exporta por padrão de costura: cada pedaço de tecido é um grupo com
 * os próprios vértices, e dois pedaços costurados têm vértices duplicados no
 * mesmo lugar. A 1e-4 mm (a tolerância que havia antes) quase nada solda —
 * 90.043 viram 89.964 — e aí a geodésica não atravessa costura nenhuma: 5.227
 * vértices ficam inalcançáveis. A 0,6 mm a malha fecha e o Dijkstra alcança
 * 100% dela.
 */
function lerESoldar(caminho: string): Malha {
  const posB: number[] = [];
  const triB: number[] = [];
  for (const l of readFileSync(caminho, 'utf8').split('\n')) {
    if (l[0] === 'v' && l[1] === ' ') {
      const p = l.split(/\s+/);
      posB.push(+p[1], +p[2], +p[3]);
    } else if (l[0] === 'f' && l[1] === ' ') {
      const idx = l.trim().split(/\s+/).slice(1).map((cc) => {
        const q = Number(cc.split('/')[0]);
        return q > 0 ? q - 1 : posB.length / 3 + q;
      });
      for (let i = 1; i + 1 < idx.length; i++) triB.push(idx[0], idx[i], idx[i + 1]);
    }
  }
  const nB = posB.length / 3;
  const cel = new Map<string, number[]>();
  for (let i = 0; i < nB; i++) {
    const k = `${Math.floor(posB[i * 3] / TOL)}:${Math.floor(posB[i * 3 + 1] / TOL)}:${Math.floor(posB[i * 3 + 2] / TOL)}`;
    const v = cel.get(k);
    if (v) v.push(i); else cel.set(k, [i]);
  }
  const pai = new Int32Array(nB);
  for (let i = 0; i < nB; i++) pai[i] = i;
  const achar = (a: number): number => {
    while (pai[a] !== a) { pai[a] = pai[pai[a]]; a = pai[a]; }
    return a;
  };
  for (let i = 0; i < nB; i++) {
    const cx = Math.floor(posB[i * 3] / TOL);
    const cy = Math.floor(posB[i * 3 + 1] / TOL);
    const cz = Math.floor(posB[i * 3 + 2] / TOL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const v = cel.get(`${cx + dx}:${cy + dy}:${cz + dz}`);
      if (!v) continue;
      for (const j of v) {
        if (j <= i) continue;
        const d = Math.hypot(
          posB[i * 3] - posB[j * 3], posB[i * 3 + 1] - posB[j * 3 + 1], posB[i * 3 + 2] - posB[j * 3 + 2],
        );
        if (d < TOL) { const A = achar(i), B = achar(j); if (A !== B) pai[A] = B; }
      }
    }
  }
  const idNovo = new Map<number, number>();
  const novaPos: number[] = [];
  const remapa = new Int32Array(nB);
  for (let i = 0; i < nB; i++) {
    const r = achar(i);
    let a = idNovo.get(r);
    if (a === undefined) {
      a = novaPos.length / 3;
      idNovo.set(r, a);
      novaPos.push(posB[r * 3], posB[r * 3 + 1], posB[r * 3 + 2]);
    }
    remapa[i] = a;
  }
  const P = new Float64Array(novaPos);
  const TRI = new Int32Array(triB.length);
  for (let i = 0; i < triB.length; i++) TRI[i] = remapa[triB[i]];
  const n = P.length / 3;
  const viz: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < TRI.length; i += 3) {
    const a = TRI[i], b = TRI[i + 1], c = TRI[i + 2];
    viz[a].add(b); viz[b].add(a); viz[b].add(c); viz[c].add(b); viz[a].add(c); viz[c].add(a);
  }
  // O maior componente. Com a solda mínima a malha vem em pedaços, e o resto
  // são forros e detalhes que não entram na conta da geodésica.
  const paiC = new Int32Array(n);
  for (let i = 0; i < n; i++) paiC[i] = i;
  const acharC = (a: number): number => { while (paiC[a] !== a) { paiC[a] = paiC[paiC[a]]; a = paiC[a]; } return a; };
  for (let i = 0; i < n; i++) for (const v of viz[i]) { const A = acharC(i), B = acharC(v); if (A !== B) paiC[A] = B; }
  const tam = new Map<number, number>();
  for (let i = 0; i < n; i++) { const r = acharC(i); tam.set(r, (tam.get(r) ?? 0) + 1); }
  let raiz = -1, maiorT = 0;
  for (const [r, t] of tam) if (t > maiorT) { maiorT = t; raiz = r; }
  const noMaior = new Uint8Array(n);
  for (let i = 0; i < n; i++) noMaior[i] = acharC(i) === raiz ? 1 : 0;
  console.log(
    `  soldado a ${TOL} mm: ${nB} -> ${n} vértices, ${TRI.length / 3} triângulos;` +
    ` maior pedaço ${maiorT} (${((maiorT / n) * 100).toFixed(1)}%)`,
  );
  return { P, TRI, viz, noMaior };
}

const dist = (M: Malha, a: number, b: number) => Math.hypot(
  M.P[a * 3] - M.P[b * 3], M.P[a * 3 + 1] - M.P[b * 3 + 1], M.P[a * 3 + 2] - M.P[b * 3 + 2],
);

const ponto = (M: Malha, i: number) => new THREE.Vector3(M.P[i * 3], M.P[i * 3 + 1], M.P[i * 3 + 2]);

/** Dijkstra multi-origem: a distância e de qual origem cada vértice veio. */
function dijkstra(M: Malha, origens: number[]) {
  const n = M.P.length / 3;
  const d = new Float64Array(n).fill(Infinity);
  const dono = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];
  const push = (v: [number, number]) => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const topo = heap[0];
    const ult = heap.pop()!;
    if (heap.length) {
      heap[0] = ult;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return topo;
  };
  origens.forEach((o, k) => { d[o] = 0; dono[o] = k; push([0, o]); });
  while (heap.length) {
    const [dd, u] = pop();
    if (dd > d[u]) continue;
    for (const v of M.viz[u]) {
      const nd = dd + dist(M, u, v);
      if (nd < d[v]) { d[v] = nd; dono[v] = dono[u]; push([nd, v]); }
    }
  }
  return { d, dono };
}

/** Os três eixos principais, do de maior para o de menor variância. */
function eixosPrincipais(pts: THREE.Vector3[], c: THREE.Vector3): THREE.Vector3[] {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] += d[a] * d[b];
  }
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] /= pts.length;
  const potencia = (evitar: THREE.Vector3[]): THREE.Vector3 => {
    let x = new THREE.Vector3(0.31, 0.57, 0.76).normalize();
    for (let it = 0; it < 300; it++) {
      const y = new THREE.Vector3(
        M[0][0] * x.x + M[0][1] * x.y + M[0][2] * x.z,
        M[1][0] * x.x + M[1][1] * x.y + M[1][2] * x.z,
        M[2][0] * x.x + M[2][1] * x.y + M[2][2] * x.z,
      );
      for (const e of evitar) y.addScaledVector(e, -y.dot(e));
      if (y.length() < 1e-12) break;
      x = y.normalize();
    }
    return x;
  };
  const e1 = potencia([]);
  const e2 = potencia([e1]);
  return [e1, e2, new THREE.Vector3().crossVectors(e1, e2).normalize()];
}

// ------------------------------------------------------------- as cinco pontas

/**
 * As pontas de dedo, como máximos locais da geodésica.
 *
 * "Os N vértices de maior geodésica" não serve: eles se amontoam todos na ponta
 * do dedo mais comprido. O que define uma ponta é ser o MAIOR NUM RAIO — e o
 * raio tem de ser geodésico também, senão dois dedos encostados um no outro
 * (que é o caso, a luva é acolchoada) contam como um.
 */
function acharPontas(M: Malha, D: Float64Array, quantas: number, raio: number): number[] {
  const n = M.P.length / 3;
  let maxD = 0;
  for (let i = 0; i < n; i++) if (D[i] > maxD && D[i] < Infinity) maxD = D[i];
  // `D[i] < Infinity` não é detalhe: sem ele os vértices INALCANÇÁVEIS passam
  // no teste (Infinity é maior que tudo) e viram as cinco "pontas".
  const cand = [...Array(n).keys()]
    .filter((i) => D[i] < Infinity && D[i] > maxD * 0.4)
    .sort((a, b) => D[b] - D[a]);
  const pontas: number[] = [];
  const bloqueado = new Uint8Array(n);
  for (const i of cand) {
    if (bloqueado[i]) continue;
    pontas.push(i);
    const vis = new Map<number, number>([[i, 0]]);
    const fila = [i];
    while (fila.length) {
      const u = fila.shift()!;
      const du = vis.get(u)!;
      if (du > raio) continue;
      bloqueado[u] = 1;
      for (const v of M.viz[u]) {
        const nd = du + dist(M, u, v);
        if (!vis.has(v) || vis.get(v)! > nd) { vis.set(v, nd); fila.push(v); }
      }
    }
    if (pontas.length >= quantas) break;
  }
  return pontas;
}

/**
 * Põe as cinco pontas em ordem anatômica: polegar, indicador, médio, anelar,
 * mindinho.
 *
 * O critério é o ÂNGULO no plano da palma. Os dedos estão em leque, e num leque
 * a ordem é uma sequência — ela não depende de quanto cada dedo está dobrado,
 * que é a propriedade de que precisamos aqui. Isso ordena a fileira; falta
 * saber por qual ponta começar, e aí entra o polegar: dos dois extremos da
 * sequência, ele é o de menor geodésica, porque é o dedo mais curto.
 */
function ordemAnatomica(
  M: Malha, pontas: number[], D: Float64Array, centro: THREE.Vector3, eixo: THREE.Vector3, lat: THREE.Vector3,
): number[] {
  const ang = pontas.map((p) => {
    const q = ponto(M, p).sub(centro);
    return Math.atan2(q.dot(lat), q.dot(eixo));
  });
  const ordem = pontas.map((p, i) => ({ p, a: ang[i] })).sort((x, y) => x.a - y.a).map((o) => o.p);
  const primeiro = ordem[0], ultimo = ordem[ordem.length - 1];
  // O polegar é o extremo mais curto. Se ele caiu no fim, a fileira está de
  // trás para a frente.
  return D[ultimo] < D[primeiro] ? ordem.reverse() : ordem;
}

// --------------------------------------------------------------- a mão do jogo

async function carregarMao(lado: 'left' | 'right'): Promise<THREE.Object3D | null> {
  const arquivo = join(MAOS, `${lado}.glb`);
  if (!existsSync(arquivo)) return null;
  const buf = readFileSync(arquivo);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return await new Promise((resolve) => {
    new GLTFLoader().parse(bytes as ArrayBuffer, '', (g) => resolve(g.scene), () => resolve(null));
  });
}

const DEDOS_MAO = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
];

function juntasDe(mao: MaoArticulada): Map<string, THREE.Object3D> {
  mao.raiz.updateMatrixWorld(true);
  const m = new Map<string, THREE.Object3D>();
  mao.raiz.traverse((o) => { if (o.name) m.set(o.name, o); });
  return m;
}

console.log('rig: lendo a luva');
const luva = lerESoldar(OBJ);
const nL = luva.P.length / 3;

// A origem da geodésica é a ponta da manga: o extremo do eixo principal do lado
// oposto aos dedos.
const ptsL: THREE.Vector3[] = [];
for (let i = 0; i < nL; i++) ptsL.push(ponto(luva, i));
const centroL = new THREE.Vector3();
for (const p of ptsL) centroL.add(p);
centroL.multiplyScalar(1 / nL);
const eixosL = eixosPrincipais(ptsL, centroL);
let tMin = Infinity, iManga = -1;
for (let i = 0; i < nL; i++) {
  if (!luva.noMaior[i]) continue;
  const t = ptsL[i].clone().sub(centroL).dot(eixosL[0]);
  if (t < tMin) { tMin = t; iManga = i; }
}

console.log('rig: geodésica a partir da manga');
const { d: DL } = dijkstra(luva, [iManga]);
let alcancados = 0, maiorL = 0;
for (let i = 0; i < nL; i++) if (DL[i] < Infinity) { alcancados++; if (DL[i] > maiorL) maiorL = DL[i]; }
console.log(`  alcançados ${alcancados}/${nL} (${((alcancados / nL) * 100).toFixed(1)}%), maior ${maiorL.toFixed(1)} mm`);
let doMaior = 0;
for (let i = 0; i < nL; i++) if (luva.noMaior[i]) doMaior++;
if (alcancados < doMaior * 0.99) {
  console.error('  ! a geodésica não cobriu o maior pedaço. Algo está errado na solda.');
  process.exit(1);
}

const pontasL = acharPontas(luva, DL, 5, RAIO_PONTA);
const ordemL = ordemAnatomica(luva, pontasL, DL, centroL, eixosL[0], eixosL[1]);
const NOMES = ['polegar', 'indicador', 'médio', 'anelar', 'mindinho'];
console.log('rig: cinco pontas, em ordem anatômica');
ordemL.forEach((p, k) => {
  console.log(`  ${NOMES[k].padEnd(10)} geodésica ${DL[p].toFixed(1).padStart(6)} mm`);
});

// ------------------------------------------------- segmentação por dedo

/**
 * Cada vértice para o seu dedo.
 *
 * O critério é a distância geodésica ATÉ A PONTA, e não a distância desde o
 * punho. A diferença importa: um Dijkstra multi-origem particiona a malha
 * inteira, e a palma vai para a ponta que estiver mais perto — na prática o
 * polegar, que ficava com 20.792 vértices contra 2.078 do vizinho. Cortando em
 * `COMPRIMENTO_DEDO`, cada dedo fica com o seu pedaço e a palma fica de fora,
 * como deve: ela pertence ao punho.
 */
const { d: DP, dono } = dijkstra(luva, ordemL);
const dedoDe = new Int32Array(nL).fill(-1);
for (let i = 0; i < nL; i++) if (DP[i] < COMPRIMENTO_DEDO && dono[i] >= 0) dedoDe[i] = dono[i];
const contaDedo = new Array(5).fill(0);
for (let i = 0; i < nL; i++) if (dedoDe[i] >= 0) contaDedo[dedoDe[i]]++;
console.log('rig: vértices por dedo');
NOMES.forEach((nm, k) => console.log(`  ${nm.padEnd(10)} ${String(contaDedo[k]).padStart(5)}`));

// ----------------------------------------------------------- a conferência

/** Desenha a luva com um dedo de cada cor. É a prova de que a segmentação vale. */
async function desenharDedos() {
  const { desenharCelula } = await import('./raster.mjs');
  const { codificarPng } = await import('./png.mjs');
  const CORES = [
    [0.95, 0.30, 0.28], [0.97, 0.68, 0.20], [0.40, 0.85, 0.42],
    [0.32, 0.62, 0.96], [0.78, 0.45, 0.94],
  ];
  const pts: number[][] = [];
  for (let i = 0; i < nL; i++) {
    const q = ponto(luva, i).sub(centroL);
    pts.push([q.dot(eixosL[1]), q.dot(eixosL[0]), q.dot(eixosL[2])]);
  }
  const tris: Array<{ a: number[]; b: number[]; c: number[]; cor: number[] }> = [];
  for (let i = 0; i < luva.TRI.length; i += 3) {
    const a = luva.TRI[i];
    tris.push({
      a: pts[luva.TRI[i]], b: pts[luva.TRI[i + 1]], c: pts[luva.TRI[i + 2]],
      cor: dedoDe[a] >= 0 ? CORES[dedoDe[a]] : [0.55, 0.57, 0.62],
    });
  }
  const CEL = 430, larg = CEL * 3, alt = CEL;
  const rgba = new Uint8Array(larg * alt * 4);
  for (let i = 0; i < larg * alt; i++) { rgba[i*4]=20; rgba[i*4+1]=24; rgba[i*4+2]=34; rgba[i*4+3]=255; }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  const span = Math.max(...mx.map((v, i) => v - mn[i]));
  const VIS = [
    (p: number[]) => [p[0], p[1], -p[2]],
    (p: number[]) => [p[2], p[1], p[0]],
    (p: number[]) => [p[0], p[2], -p[1]],
  ];
  VIS.forEach((f, k) => {
    const esc = (CEL * 0.82) / span;
    desenharCelula({
      rgba, largura: larg, ox: k * CEL, oy: 0, celula: CEL, tris,
      naTela: (p: number[]) => { const [x, y, z] = f(p); return [k * CEL + CEL / 2 + x * esc, CEL / 2 - y * esc, z]; },
    });
  });
  writeFileSync('folha-dedos.png', codificarPng(larg, alt, rgba));
  console.log('  -> folha-dedos.png (um dedo de cada cor; cinza é palma e manga)');
}
await desenharDedos();

console.log('');
console.log('rig: PAROU AQUI. Os dedos estão segmentados; falta vesti-los.');
console.log('     Ver "Onde isto parou" no topo do arquivo.');

export { luva, DL, DP, dono, dedoDe, ordemL, iManga, centroL, eixosL, carregarMao, dijkstra, juntasDe, DEDOS_MAO, ponto, dist, DIAG };
