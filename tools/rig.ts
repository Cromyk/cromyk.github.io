/**
 * Veste a luva de costura no esqueleto da mão do jogo.
 *
 * O caminho até aqui está contado em tools/luva.mjs, e o resumo é que as duas
 * ideias óbvias não funcionam: nem fatiar a luva perpendicular ao eixo (os
 * dedos são curvos, e a fatia corta ao longo deles), nem separá-los por setor
 * angular (a distribuição é contínua, sem cinco picos). As duas tentavam achar
 * os dedos NA LUVA.
 *
 * Este arquivo faz o contrário: **dobra a mão até a pose da luva.** A
 * `MaoArticulada` já sabe fechar os dedos por parâmetro, e é o mesmo código que
 * o jogo usa — então a curvatura da luva deixa de ser um problema de geometria
 * e vira dois números, (gatilho, grip), que se procuram por busca.
 *
 * Com as duas malhas na MESMA pose, o vizinho mais próximo volta a valer, que
 * era exatamente a objeção ao método simples.
 *
 * O passo seguinte é o que faz a luva servir: cada vértice é lido no espaço
 * LOCAL do osso que o domina, na pose dobrada, e reescrito na BIND POSE. Sem
 * isso a luva entraria no jogo já dobrada e o esqueleto a dobraria de novo.
 *
 * A exportação não monta um GLB do zero: ela ABRE o right.glb e troca só a
 * geometria da primitiva. O esqueleto, as 25 juntas e as inverseBindMatrices
 * continuam sendo os do arquivo oficial — que é o que garante que o jogo, o
 * rastreamento de mão e tools/mao.ts continuem enxergando a mesma mão.
 *
 *   npm run rig -- --diag     alinha, mede e desenha; não escreve GLB
 *   npm run rig               escreve public/maos/{left,right}.glb
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MaoArticulada } from '../src/glove';

const RAIZ = process.cwd();
const MAOS = join(RAIZ, 'public', 'maos');
const CACHE = join(RAIZ, 'node_modules', '.cache', 'luva-decimada.json');
const args = process.argv.slice(2);
const DIAG = args.includes('--diag');

// ------------------------------------------------------------------ leitura

async function carregarMao(lado: 'left' | 'right'): Promise<THREE.Object3D | null> {
  const arquivo = join(MAOS, `${lado}.glb`);
  if (!existsSync(arquivo)) return null;
  const buf = readFileSync(arquivo);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return await new Promise((resolve) => {
    new GLTFLoader().parse(bytes as ArrayBuffer, '', (g) => resolve(g.scene), () => resolve(null));
  });
}

interface Nuvem {
  pos: Float32Array;
  idx: Uint32Array;
}

function lerLuva(): Nuvem {
  if (!existsSync(CACHE)) {
    throw new Error('sem node_modules/.cache/luva-decimada.json — rode antes: npm run luva -- --diag');
  }
  const d = JSON.parse(readFileSync(CACHE, 'utf8'));
  return { pos: new Float32Array(d.posicoes), idx: new Uint32Array(d.indices) };
}

// ------------------------------------------------------------------ álgebra

function centroide(p: Float32Array): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) c.x += p[i], c.y += p[i + 1], c.z += p[i + 2];
  return c.multiplyScalar(3 / p.length);
}

/** Os três eixos principais, do de maior para o de menor variância. */
function eixosPrincipais(p: Float32Array, c: THREE.Vector3): THREE.Vector3[] {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const n = p.length / 3;
  for (let i = 0; i < n; i++) {
    const d = [p[i * 3] - c.x, p[i * 3 + 1] - c.y, p[i * 3 + 2] - c.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] += d[a] * d[b];
  }
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] /= n;

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
  const e3 = new THREE.Vector3().crossVectors(e1, e2).normalize();
  return [e1, e2, e3];
}

/** Grade regular para vizinho mais próximo sem percorrer tudo. */
class Grade {
  private celulas = new Map<string, number[]>();
  constructor(private pontos: THREE.Vector3[], private lado: number) {
    pontos.forEach((p, i) => {
      const k = this.chave(p);
      const v = this.celulas.get(k);
      if (v) v.push(i); else this.celulas.set(k, [i]);
    });
  }
  private chave(p: THREE.Vector3) {
    return `${Math.floor(p.x / this.lado)}:${Math.floor(p.y / this.lado)}:${Math.floor(p.z / this.lado)}`;
  }
  maisProximo(p: THREE.Vector3): { indice: number; dist2: number } {
    let melhor = -1, menor = Infinity;
    for (let r = 1; r <= 3 && melhor < 0; r++) {
      const cx = Math.floor(p.x / this.lado), cy = Math.floor(p.y / this.lado), cz = Math.floor(p.z / this.lado);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const v = this.celulas.get(`${cx + dx}:${cy + dy}:${cz + dz}`);
        if (!v) continue;
        for (const i of v) {
          const d = this.pontos[i].distanceToSquared(p);
          if (d < menor) { menor = d; melhor = i; }
        }
      }
    }
    return { indice: melhor, dist2: menor };
  }
}

console.log('rig: carregando a mão e a luva');
const molde = await carregarMao('right');
if (!molde) { console.error('sem public/maos/right.glb'); process.exit(1); }
const luva = lerLuva();
console.log(`  luva  ${luva.pos.length / 3} vértices`);

// ---------------------------------------------------------- a mão, posada

/**
 * Os vértices da mão na pose pedida, já com o skinning aplicado.
 *
 * `applyBoneTransform` é o mesmo cálculo que a placa de vídeo faria no headset.
 * Sem ele a mão ficaria na pose de repouso por mais que os ossos se mexessem —
 * o erro clássico de conferência de esqueleto, e aqui ele silenciosamente
 * arruinaria o casamento das duas malhas.
 */
function vertices(mao: MaoArticulada): THREE.Vector3[] {
  mao.raiz.updateMatrixWorld(true);
  const saida: THREE.Vector3[] = [];
  mao.raiz.traverse((obj) => {
    const malha = obj as THREE.SkinnedMesh;
    if (!malha.isSkinnedMesh) return;
    const pos = malha.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      malha.applyBoneTransform(i, v);
      saida.push(malha.localToWorld(v.clone()));
    }
  });
  return saida;
}

/** Cada osso da cadeia, na pose atual, como um segmento no espaço do grip. */
function ossos(mao: MaoArticulada): { nome: string; a: THREE.Vector3; b: THREE.Vector3 }[] {
  mao.raiz.updateMatrixWorld(true);
  const porNome = new Map<string, THREE.Object3D>();
  mao.raiz.traverse((o) => { if (o.name) porNome.set(o.name, o); });
  const saida: { nome: string; a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  for (const [nome, obj] of porNome) {
    if (nome.endsWith('-tip')) continue;
    const a = obj.getWorldPosition(new THREE.Vector3());
    // A ponta do osso é o filho da cadeia; sem filho, um palmo na direção dele.
    const filho = obj.children.find((c) => porNome.has(c.name) && c.name !== nome);
    const b = filho
      ? filho.getWorldPosition(new THREE.Vector3())
      : a.clone().add(new THREE.Vector3(0, 0, -0.02).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion())));
    saida.push({ nome, a, b });
  }
  return saida;
}

// -------------------------------------------------------------- alinhamento

/**
 * Leva a luva ao espaço da mão.
 *
 * O ponto de partida são os eixos principais das duas nuvens, e ele sozinho não
 * basta: o PCA dá as DIREÇÕES mas não os sentidos, e trocar um sinal põe a luva
 * de cabeça para baixo ou com a palma para fora. As quatro combinações de sinal
 * são testadas e vence a de menor erro — o que também resolve, de graça, a
 * dúvida sobre qual lado da luva é a palma.
 *
 * Depois disso, ICP: casar cada ponto com o mais próximo do outro lado e
 * recalcular escala, rotação e translação, algumas vezes.
 */
function alinhar(luvaPts: THREE.Vector3[], maoPts: THREE.Vector3[]) {
  const cL = new THREE.Vector3(), cM = new THREE.Vector3();
  for (const p of luvaPts) cL.add(p); cL.multiplyScalar(1 / luvaPts.length);
  for (const p of maoPts) cM.add(p); cM.multiplyScalar(1 / maoPts.length);

  const arr = (pts: THREE.Vector3[]) => {
    const f = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { f[i * 3] = p.x; f[i * 3 + 1] = p.y; f[i * 3 + 2] = p.z; });
    return f;
  };
  const eL = eixosPrincipais(arr(luvaPts), cL);
  const eM = eixosPrincipais(arr(maoPts), cM);

  const extensao = (pts: THREE.Vector3[], c: THREE.Vector3, e: THREE.Vector3) => {
    let mn = Infinity, mx = -Infinity;
    for (const p of pts) { const t = p.clone().sub(c).dot(e); if (t < mn) mn = t; if (t > mx) mx = t; }
    return mx - mn;
  };

  const grade = new Grade(maoPts, 0.012);
  let melhor: { erro: number; m: THREE.Matrix4 } | null = null;

  // As 24 orientações que levam eixo em eixo, e não só as 4 trocas de sinal.
  //
  // Com quatro hipóteses o ICP não tinha como consertar um erro de 90°: ele
  // refina, não gira. A luva saía envolvendo a mão com a escala certa e a manga
  // apontando para o lado errado — perto o bastante para o número parecer
  // razoável, longe o bastante para não servir para nada.
  const ORIENTACOES: [number, number, number][] = [];
  for (const eixo of [0, 1, 2]) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    ORIENTACOES.push([eixo, s1, s2]);
  }

  for (const [troca, s1, s2] of ORIENTACOES) {
    // `troca` escolhe qual eixo da luva faz o papel do comprimento da mão.
    const ordem = troca === 0 ? [0, 1, 2] : troca === 1 ? [1, 0, 2] : [2, 0, 1];
    const a1 = eL[ordem[0]].clone().multiplyScalar(s1);
    const a2 = eL[ordem[1]].clone().multiplyScalar(s2);
    const a3 = new THREE.Vector3().crossVectors(a1, a2);
    const daLuva = new THREE.Matrix4().makeBasis(a1, a2, a3);
    const daMao = new THREE.Matrix4().makeBasis(eM[0], eM[1], new THREE.Vector3().crossVectors(eM[0], eM[1]));
    // A escala sai do eixo principal, que nas duas é o comprimento.
    const k = extensao(maoPts, cM, eM[0]) / extensao(luvaPts, cL, a1);

    let M = new THREE.Matrix4()
      .makeTranslation(cM.x, cM.y, cM.z)
      .multiply(daMao)
      .multiply(new THREE.Matrix4().makeScale(k, k, k))
      .multiply(daLuva.clone().transpose())
      .multiply(new THREE.Matrix4().makeTranslation(-cL.x, -cL.y, -cL.z));

    // ICP
    for (let it = 0; it < 12; it++) {
      const P: THREE.Vector3[] = [], Q: THREE.Vector3[] = [];
      for (const p of luvaPts) {
        const t = p.clone().applyMatrix4(M);
        const { indice, dist2 } = grade.maisProximo(t);
        if (indice < 0 || dist2 > 0.0025) continue;
        P.push(t); Q.push(maoPts[indice]);
      }
      if (P.length < 50) break;
      // Procrustes com escala.
      const cp = new THREE.Vector3(), cq = new THREE.Vector3();
      for (const p of P) cp.add(p); cp.multiplyScalar(1 / P.length);
      for (const q of Q) cq.add(q); cq.multiplyScalar(1 / Q.length);
      const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      let varP = 0;
      for (let i = 0; i < P.length; i++) {
        const a = P[i].clone().sub(cp), b = Q[i].clone().sub(cq);
        H[0][0] += a.x * b.x; H[0][1] += a.x * b.y; H[0][2] += a.x * b.z;
        H[1][0] += a.y * b.x; H[1][1] += a.y * b.y; H[1][2] += a.y * b.z;
        H[2][0] += a.z * b.x; H[2][1] += a.z * b.y; H[2][2] += a.z * b.z;
        varP += a.lengthSq();
      }
      // Rotação por iteração de Newton sobre a polar de H (evita SVD à mão).
      let R = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(H[0][0], H[1][0], H[2][0]),
        new THREE.Vector3(H[0][1], H[1][1], H[2][1]),
        new THREE.Vector3(H[0][2], H[1][2], H[2][2]),
      );
      for (let k2 = 0; k2 < 24; k2++) {
        const inv = R.clone().invert().transpose();
        const e = R.elements, f = inv.elements;
        for (let i = 0; i < 16; i++) e[i] = 0.5 * (e[i] + f[i]);
        e[3] = e[7] = e[11] = e[12] = e[13] = e[14] = 0; e[15] = 1;
      }
      let traco = 0;
      for (let i = 0; i < P.length; i++) {
        const a = P[i].clone().sub(cp).applyMatrix4(R), b = Q[i].clone().sub(cq);
        traco += a.dot(b);
      }
      const esc = varP > 1e-12 ? traco / varP : 1;
      const passo = new THREE.Matrix4()
        .makeTranslation(cq.x, cq.y, cq.z)
        .multiply(new THREE.Matrix4().makeScale(esc, esc, esc))
        .multiply(R)
        .multiply(new THREE.Matrix4().makeTranslation(-cp.x, -cp.y, -cp.z));
      M = passo.multiply(M);
    }

    // Erro SIMÉTRICO, e isto não é preciosismo.
    //
    // Medindo só luva→mão, encolher a luva até um caroço dentro da palma dá um
    // erro ótimo: todo ponto da luva tem mão pertinho. Foi o que aconteceu — o
    // ICP colapsou a escala e reportou 5,8 mm com a luva sumida dentro do
    // punho. O sentido contrário, mão→luva, é o que cobra a COBERTURA: uma luva
    // encolhida deixa a mão inteira longe dela, e o número explode.
    const luvaNoLugar = luvaPts.map((p) => p.clone().applyMatrix4(M));
    const gradeLuva = new Grade(luvaNoLugar, 0.012);
    let e1s = 0, n1 = 0;
    for (const p of luvaNoLugar) {
      const { dist2 } = grade.maisProximo(p);
      if (dist2 < Infinity) { e1s += Math.sqrt(dist2); n1++; }
    }
    let e2s = 0, n2 = 0;
    for (const p of maoPts) {
      const { dist2 } = gradeLuva.maisProximo(p);
      if (dist2 < Infinity) { e2s += Math.sqrt(dist2); n2++; }
    }
    // Quem não achou vizinho nenhum conta como falha, não como ausência.
    const falhas = (luvaPts.length - n1) + (maoPts.length - n2);
    const erro = n1 && n2
      ? (e1s / n1 + e2s / n2) / 2 + (falhas / (luvaPts.length + maoPts.length)) * 0.05
      : Infinity;
    if (!melhor || erro < melhor.erro) melhor = { erro, m: M };
  }
  return melhor!;
}

// ------------------------------------------------------- busca da pose certa

const luvaToda: THREE.Vector3[] = [];
for (let i = 0; i < luva.pos.length; i += 3) {
  luvaToda.push(new THREE.Vector3(luva.pos[i], luva.pos[i + 1], luva.pos[i + 2]));
}

/**
 * A manga fora do alinhamento.
 *
 * A luva tem 313 mm de ponta a ponta e a mão tem 178: a diferença é punho, e
 * ele sobe pelo antebraço. Deixar essa manga na conta estraga tudo duas vezes —
 * ela domina o eixo principal do PCA (é o trecho mais longo e mais reto) e puxa
 * a escala para baixo, porque o ICP tenta fazer 313 caber em 178.
 *
 * O resultado foi uma luva atravessada na palma com um erro que PARECIA bom:
 * 6,1 mm. Um mínimo local com número bonito — a razão de esta ferramenta
 * desenhar antes de exportar.
 */
function semManga(pts: THREE.Vector3[], corte: number): THREE.Vector3[] {
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.multiplyScalar(1 / pts.length);
  const f = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { f[i * 3] = p.x; f[i * 3 + 1] = p.y; f[i * 3 + 2] = p.z; });
  const e = eixosPrincipais(f, c)[0];
  const t = pts.map((p) => p.clone().sub(c).dot(e));
  let mn = Infinity, mx = -Infinity;
  for (const x of t) { if (x < mn) mn = x; if (x > mx) mx = x; }
  // Os dedos ficam no extremo +e — conferido em folha-luva.png.
  const limite = mn + (mx - mn) * corte;
  return pts.filter((_, i) => t[i] >= limite);
}

const CORTE = Number((args.find((a) => a.startsWith('--corte=')) ?? '--corte=0.34').split('=')[1]);
const luvaBruta = semManga(luvaToda, CORTE);
console.log(`  manga cortada em ${(CORTE * 100).toFixed(0)}%: ${luvaToda.length} -> ${luvaBruta.length} vértices`);

/**
 * Procura a pose da mão que melhor casa com a luva, e a quiralidade da luva.
 *
 * A quiralidade entra na busca porque ela NÃO se resolve por rotação: uma luva
 * esquerda nunca vira direita por mais que se gire, e um alinhamento que
 * ignorasse isso encaixaria a luva do avesso sem nunca acusar o erro. Espelhar
 * em X e deixar as duas hipóteses competirem pelo mesmo critério é mais barato
 * do que tentar adivinhar do arquivo.
 */
function procurarPose() {
  let melhor: {
    erro: number; g: number; gr: number; espelhar: boolean; m: THREE.Matrix4;
  } | null = null;

  // Em DUAS etapas, porque orientação e curvatura são perguntas independentes e
  // multiplicá-las daria centenas de ICPs. Primeiro a orientação, com a mão
  // numa pose média — ela é grosseira o bastante para não depender da
  // curvatura exata. Depois, fixada a orientação, a pose fina.
  const POSES: [number, number][] = [];
  for (const g of [0, 0.25, 0.5, 0.75, 1]) for (const gr of [0, 0.25, 0.5, 0.75, 1]) POSES.push([g, gr]);
  const ETAPA1: [number, number][] = [[0.5, 0.5]];

  for (const etapa of [1, 2]) {
    const lista = etapa === 1 ? ETAPA1 : POSES;
    const quiralidades = etapa === 1 ? [false, true] : [melhor!.espelhar];
    for (const espelhar of quiralidades) {
      const pts = espelhar
        ? luvaBruta.map((p) => new THREE.Vector3(-p.x, p.y, p.z))
        : luvaBruta;
      for (const [g, gr] of lista) {
        const mao = new MaoArticulada(molde!, 'right', 0xffffff);
        mao.definirDedos(g, gr, 10);
        const r = alinhar(pts, vertices(mao));
        if (!melhor || r.erro < melhor.erro) {
          melhor = { erro: r.erro, g, gr, espelhar, m: r.m };
        }
      }
    }
    if (etapa === 1) {
      console.log(
        `  etapa 1 (orientação): ${melhor!.espelhar ? 'ESPELHADA' : 'como veio'}` +
        ` · erro ${(melhor!.erro * 1000).toFixed(1)} mm`,
      );
      // A etapa 2 refina a pose; o erro da etapa 1 não deve vencê-la por ter
      // sido medido com outra pose.
      melhor = { ...melhor!, erro: Infinity };
    }
  }
  return melhor!;
}

console.log('rig: procurando orientação e pose (12 orientações x 2 etapas)');
const pose = procurarPose();
console.log(
  `  melhor: gatilho ${pose.g} · grip ${pose.gr} · ${pose.espelhar ? 'ESPELHADA' : 'como veio'}` +
  ` · erro médio ${(pose.erro * 1000).toFixed(1)} mm`,
);

// ------------------------------------------------------------- conferência

/** Desenha a luva alinhada POR CIMA da mão posada, em três vistas. */
async function desenharSobreposicao(mao: MaoArticulada, M: THREE.Matrix4, espelhar: boolean) {
  const { desenharCelula } = await import('./raster.mjs');
  const { codificarPng } = await import('./png.mjs');

  const tris: { a: number[]; b: number[]; c: number[]; cor: number[] }[] = [];
  // A mão, em cinza-azulado.
  mao.raiz.updateMatrixWorld(true);
  mao.raiz.traverse((obj) => {
    const malha = obj as THREE.SkinnedMesh;
    if (!malha.isSkinnedMesh) return;
    const pos = malha.geometry.attributes.position;
    const idx = malha.geometry.index!;
    const v = new THREE.Vector3();
    const p: number[][] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      malha.applyBoneTransform(i, v);
      const w = malha.localToWorld(v.clone());
      p.push([w.x, w.y, w.z]);
    }
    for (let i = 0; i < idx.count; i += 3) {
      tris.push({ a: p[idx.getX(i)], b: p[idx.getX(i + 1)], c: p[idx.getX(i + 2)], cor: [0.30, 0.45, 0.70] });
    }
  });
  // A luva alinhada, em areia.
  const pl: number[][] = [];
  for (let i = 0; i < luva.pos.length; i += 3) {
    const v = new THREE.Vector3(luva.pos[i], luva.pos[i + 1], luva.pos[i + 2]);
    if (espelhar) v.x = -v.x;
    v.applyMatrix4(M);
    pl.push([v.x, v.y, v.z]);
  }
  for (let i = 0; i < luva.idx.length; i += 3) {
    tris.push({ a: pl[luva.idx[i]], b: pl[luva.idx[i + 1]], c: pl[luva.idx[i + 2]], cor: [0.85, 0.72, 0.45] });
  }

  const CEL = 420, FUNDO = [20, 24, 34];
  const VISTAS: ((p: number[]) => [number, number, number])[] = [
    (p) => [p[0], p[1], -p[2]],
    (p) => [p[0], -p[2], -p[1]],
    (p) => [-p[2], p[1], p[0]],
  ];
  const larg = CEL * 3, alt = CEL;
  const rgba = new Uint8Array(larg * alt * 4);
  for (let i = 0; i < larg * alt; i++) {
    rgba[i * 4] = FUNDO[0]; rgba[i * 4 + 1] = FUNDO[1]; rgba[i * 4 + 2] = FUNDO[2]; rgba[i * 4 + 3] = 255;
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const q of [t.a, t.b, t.c]) for (let k = 0; k < 3; k++) {
    if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k];
  }
  const centro = mn.map((v, i) => (v + mx[i]) / 2);
  const span = Math.max(...mx.map((v, i) => v - mn[i]));
  VISTAS.forEach((f, k) => {
    const esc = (CEL * 0.8) / span;
    desenharCelula({
      rgba, largura: larg, ox: k * CEL, oy: 0, celula: CEL, tris,
      naTela: (p: number[]) => {
        const [x, y, z] = f([p[0] - centro[0], p[1] - centro[1], p[2] - centro[2]]);
        return [k * CEL + CEL / 2 + x * esc, CEL / 2 - y * esc, z];
      },
    });
  });
  writeFileSync('folha-rig.png', codificarPng(larg, alt, rgba));
  console.log('  -> folha-rig.png (mão em azul, luva em areia)');
}

const maoFinal = new MaoArticulada(molde!, 'right', 0xffffff);
maoFinal.definirDedos(pose.g, pose.gr, 10);
await desenharSobreposicao(maoFinal, pose.m, pose.espelhar);
