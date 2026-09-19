/**
 * Folha de contato do RANCHO: o pasto visto de quatro ângulos, num PNG só.
 *
 *   npm run pasto
 *
 * Existe pelo mesmo motivo que tools/poses.ts e tools/paineis.ts, e neste caso
 * o motivo é ainda mais forte: o rancho é a única coisa do jogo que TAPA o
 * passthrough, e a pergunta "tapou mesmo?" não tem teste que responda. Ou se
 * põe o headset, ou se rasteriza aqui.
 *
 * O que esta folha responde:
 *
 * 1. **A abóbada fecha?** Um buraco no céu, em MR, é um pedaço do seu quarto
 *    aparecendo no meio do pasto.
 * 2. **O horizonte está na altura dos olhos?** Um chão que termina antes do
 *    céu deixa uma faixa vazia — e vazio, em passthrough, é a sua parede.
 * 3. **A cerca está inteira e no lugar?** Ela é o limite que o jogo usa para
 *    segurar os moradores (`RAIO_DO_PASTO`), e se o que se vê não bate com o
 *    que o código calcula, o bicho para no ar.
 * 4. **Os pontos de solta cabem no cercado?** Eles são desenhados como cruzes
 *    no chão, na vista de cima.
 *
 * O rasterizador é o mesmo de todas as folhas (tools/raster.mjs): aritmética e
 * um Uint8Array, sem WebGL e sem navegador.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { codificarPng } from './png.mjs';
import { escrever } from './texto.mjs';
import { LUZ, desenharCelula } from './raster.mjs';

// O `document` de mentira antes de qualquer coisa: o rancho desenha as
// texturas de capim e de céu num canvas na construção.
{
  const contexto: Record<string, unknown> = {
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
  };
  const proxy: unknown = new Proxy(contexto, {
    get: (alvo, chave) => (chave in alvo ? alvo[chave as string] : () => proxy),
    set: (alvo, chave, valor) => {
      alvo[chave as string] = valor;
      return true;
    },
  });
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 1, height: 1, getContext: () => proxy }),
  };
}

const { Rancho, RAIO_DO_PASTO } = await import('../src/rancho');

interface Triangulo {
  a: number[];
  b: number[];
  c: number[];
  cor: number[];
}

/**
 * Achata a cena do rancho em triângulos no espaço do mundo.
 *
 * Trata `InstancedMesh` — a cerca e as árvores são instâncias, e ignorá-las
 * deixaria a folha com um pasto vazio, que é justamente o contrário do que ela
 * existe para mostrar.
 */
function triangulosDe(raiz: THREE.Object3D): Triangulo[] {
  const tris: Triangulo[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();

  raiz.updateMatrixWorld(true);
  raiz.traverse((obj) => {
    const malha = obj as THREE.Mesh;
    if (!malha.isMesh) return;
    const pos = malha.geometry.getAttribute('position');
    if (!pos) return;
    const idx = malha.geometry.getIndex();

    // A cor: a do material, ou a que ele indicou para a folha.
    //
    // Este rasterizador não amostra textura — é aritmética e um Uint8Array —,
    // então um material com `map` e `color` branca sai branco. O chão e o céu
    // do rancho são exatamente isso, e a folha saía com o pasto cor de papel.
    // Ver `corDaFolha` em src/rancho.ts.
    const material = malha.material as THREE.MeshStandardMaterial;
    const daFolha = material?.userData?.corDaFolha as number[] | undefined;
    const c = material?.color ?? new THREE.Color(0xffffff);
    const cor = daFolha ?? [c.r, c.g, c.b];

    const instancia = malha as THREE.InstancedMesh;
    const quantas = instancia.isInstancedMesh ? instancia.count : 1;

    for (let k = 0; k < quantas; k++) {
      if (instancia.isInstancedMesh) {
        instancia.getMatrixAt(k, m);
        m.premultiply(malha.matrixWorld);
      } else {
        m.copy(malha.matrixWorld);
      }
      const ler = (i: number) => {
        const j = idx ? idx.getX(i) : i;
        v.fromBufferAttribute(pos, j).applyMatrix4(m);
        return [v.x, v.y, v.z];
      };
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        tris.push({ a: ler(i), b: ler(i + 1), c: ler(i + 2), cor });
      }
    }
  });
  return tris;
}

/**
 * Parte os triângulos grandes em pedaços pequenos, antes de rasterizar.
 *
 * ## Por que isto é obrigatório aqui, e não era nas outras folhas
 *
 * O rasterizador de tools/raster.mjs interpola a PROFUNDIDADE linearmente na
 * tela, e projeta vértice a vértice. Isso serve perfeitamente para um Pokémon
 * — trinta centímetros de bicho, triângulos de milímetros — e desmonta num
 * cenário: o chão do rancho é um `CircleGeometry` de 60 m com 48 triângulos,
 * todos partindo do CENTRO, e o centro do chão é exatamente onde a câmera
 * está. O vértice cai no plano da câmera, a projeção o manda para o infinito,
 * e o triângulo inteiro — os 60 metros de capim à sua frente — some ou vai
 * parar atrás do céu.
 *
 * Foi exatamente o que aconteceu: a primeira folha saiu com o pasto azul, e
 * não porque o rancho estivesse errado.
 *
 * Partir pela aresta MAIS LONGA, uma de cada vez, é o que dá pedaços de forma
 * razoável sem explodir a contagem: 60 m viram 3 m em cinco divisões, e cada
 * divisão dobra o número de triângulos em vez de quadruplicá-lo.
 */
function subdividir(tris: Triangulo[], maxAresta: number): Triangulo[] {
  const saida: Triangulo[] = [];
  const meio = (a: number[], b: number[]) => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];
  const dist2 = (a: number[], b: number[]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  const limite = maxAresta * maxAresta;
  const partir = (t: Triangulo, nivel: number) => {
    if (nivel >= 9) {
      saida.push(t);
      return;
    }
    const ab = dist2(t.a, t.b);
    const bc = dist2(t.b, t.c);
    const ca = dist2(t.c, t.a);
    const maior = Math.max(ab, bc, ca);
    if (maior <= limite) {
      saida.push(t);
      return;
    }
    // Parte a maior aresta ao meio e recursa nos dois pedaços.
    if (maior === ab) {
      const m = meio(t.a, t.b);
      partir({ a: t.a, b: m, c: t.c, cor: t.cor }, nivel + 1);
      partir({ a: m, b: t.b, c: t.c, cor: t.cor }, nivel + 1);
    } else if (maior === bc) {
      const m = meio(t.b, t.c);
      partir({ a: t.a, b: t.b, c: m, cor: t.cor }, nivel + 1);
      partir({ a: t.a, b: m, c: t.c, cor: t.cor }, nivel + 1);
    } else {
      const m = meio(t.c, t.a);
      partir({ a: t.a, b: t.b, c: m, cor: t.cor }, nivel + 1);
      partir({ a: m, b: t.b, c: t.c, cor: t.cor }, nivel + 1);
    }
  };

  for (const t of tris) partir(t, 0);
  return saida;
}

// --------------------------------------------------------------- a folha

const CELULA = 460;
const MARGEM = 16;
const RODAPE = 26;

const rancho = new Rancho();
// Aberto no chão, com o jogador no centro — é onde ele nasce em jogo.
rancho.abrir(new THREE.Vector3(0, 1.6, 0), 0);
rancho.atualizar(1);
const tris = subdividir(triangulosDe(rancho.grupo), 2.5);

const olhar = new THREE.Vector3(0, 0, -1);
const soltas: THREE.Vector3[] = [];
for (let i = 0; i < 8; i++) soltas.push(rancho.pontoDeSolta(i, 8, olhar));

/**
 * As quatro vistas.
 *
 * Cada uma leva o mundo para o ESPAÇO DA CÂMERA e, dali, para o pixel. As duas
 * etapas são separadas por causa do recorte — ver `recortarPerto`.
 */
interface Vista {
  rotulo: string;
  /** Mundo → espaço da câmera. Em perspectiva, +z é para a frente dela. */
  paraCamera: (p: number[]) => number[];
  /** Espaço da câmera → [pixel x, pixel y, profundidade]. */
  projetar: (p: number[], ox: number, oy: number) => number[];
  /** Ortográfica não precisa de recorte: nada fica "atrás" dela. */
  recorta: boolean;
}

/** A que distância da câmera o recorte acontece. */
const PERTO = 0.08;

/**
 * Corta o pedaço do triângulo que está ATRÁS da câmera, e recompõe o resto.
 *
 * ## Por que sem isto a folha mente
 *
 * O chão do rancho é um `CircleGeometry` de 60 m com todos os triângulos
 * partindo do CENTRO — e o centro fica exatamente sob a câmera, a z = 0. Uma
 * projeção em perspectiva não tem o que fazer com um vértice em z = 0: ele vai
 * para o infinito. Empurrá-lo para fora da célula com uma profundidade enorme
 * — que foi a primeira tentativa — não resolve, porque o rasterizador
 * interpola a profundidade ENTRE os vértices: o triângulo inteiro herda um
 * pedaço desse infinito e perde para o céu, que está a quarenta metros.
 *
 * Na folha isso apareceu como dentes de serra azuis subindo do capim, e
 * subdividir não adiantou: por mais que se parta, sempre sobra um triângulo
 * encostado no vértice ruim.
 *
 * O recorte resolve na raiz: o que está atrás do plano `z = PERTO` deixa de
 * existir, e o que sobra é um polígono de três ou quatro lados, todo à frente
 * da câmera, que vira um ou dois triângulos. É o mesmo recorte que uma GPU faz
 * antes de rasterizar — aqui ele é explícito porque não há GPU nenhuma.
 */
function recortarPerto(tris: Triangulo[], paraCamera: (p: number[]) => number[]): Triangulo[] {
  const saida: Triangulo[] = [];
  const entre = (a: number[], b: number[]) => {
    // Onde o segmento cruza o plano z = PERTO.
    const t = (PERTO - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, PERTO];
  };

  for (const tri of tris) {
    const v = [paraCamera(tri.a), paraCamera(tri.b), paraCamera(tri.c)];
    const dentro = v.filter((p) => p[2] > PERTO);
    if (dentro.length === 0) continue;
    if (dentro.length === 3) {
      saida.push({ a: v[0], b: v[1], c: v[2], cor: tri.cor });
      continue;
    }

    // Reordena para o caso ficar canônico: `d` são os que sobram.
    const d = v.filter((p) => p[2] > PERTO);
    const f = v.filter((p) => p[2] <= PERTO);

    if (dentro.length === 1) {
      // Um vértice à frente: sobra um triângulo, com dois vértices no plano.
      saida.push({ a: d[0], b: entre(d[0], f[0]), c: entre(d[0], f[1]), cor: tri.cor });
    } else {
      // Dois à frente: sobra um quadrilátero, que vira dois triângulos.
      const m0 = entre(d[0], f[0]);
      const m1 = entre(d[1], f[0]);
      saida.push({ a: d[0], b: d[1], c: m1, cor: tri.cor });
      saida.push({ a: d[0], b: m1, c: m0, cor: tri.cor });
    }
  }
  return saida;
}

/** Vista em perspectiva, olhando para −Z do mundo. */
const emPerspectiva = (alturaDaCamera: number, recuo: number, rotulo: string): Vista => ({
  rotulo,
  recorta: true,
  paraCamera: (p) => [p[0], p[1] - alturaDaCamera, recuo - p[2]],
  projetar: (p, ox, oy) => {
    const f = CELULA * 0.52;
    // A profundidade vai como −1/z, e não como z.
    //
    // O z-buffer de tools/raster.mjs interpola o terceiro número LINEARMENTE
    // na tela. Sob projeção em perspectiva, `z` não é linear na tela — `1/z`
    // é. Com `z`, a profundidade no meio de um triângulo de chão estoura para
    // muito mais do que ela é.
    //
    // O sinal mantém a convenção do rasterizador, que guarda o MENOR: perto
    // (z = 1) dá −1, longe (z = 40) dá −0,025, e −1 < −0,025.
    const z = Math.max(PERTO, p[2]);
    return [ox + CELULA / 2 + (p[0] / z) * f, oy + CELULA / 2 - (p[1] / z) * f, -1 / z];
  },
});

/**
 * Vista de cima, ortográfica, cobrindo o cercado inteiro.
 *
 * Ela também RECORTA, e por um motivo que não é o da perspectiva: a abóbada do
 * céu tem quarenta metros de raio e passa por cima de tudo. Vista de cima sem
 * recorte, a folha mostrava um disco azul — o céu — e nenhum pasto.
 *
 * O truque é tratá-la como uma câmera a oito metros de altura olhando para
 * baixo: o `paraCamera` troca os eixos para que +z seja "para baixo a partir
 * de oito metros", e aí o mesmo `recortarPerto` da perspectiva corta o céu
 * fora de graça.
 */
const ALTURA_DE_CIMA = 8;
const deCima: Vista = {
  rotulo: 'de cima · o cercado e os 8 pontos de solta',
  recorta: true,
  paraCamera: (p) => [p[0], p[2], ALTURA_DE_CIMA - p[1]],
  projetar: (p, ox, oy) => {
    const escala = (CELULA * 0.45) / (RAIO_DO_PASTO + 3);
    return [ox + CELULA / 2 + p[0] * escala, oy + CELULA / 2 + p[1] * escala, p[2]];
  },
};

const vistas: Vista[] = [
  emPerspectiva(1.6, 0, 'olhos · 1,60 m, no centro do pasto'),
  emPerspectiva(1.6, 9, 'olhos · recuado 9 m, a cerca inteira'),
  emPerspectiva(0.35, 0, 'agachado · 35 cm, na altura de um Pikachu'),
  deCima,
];

const colunas = 2;
const linhas = Math.ceil(vistas.length / colunas);
const largura = MARGEM + colunas * (CELULA + MARGEM);
const altura = MARGEM + linhas * (CELULA + MARGEM + RODAPE);
const rgba = new Uint8Array(largura * altura * 4);
// Fundo escuro: qualquer pixel que ficar assim dentro de uma célula é buraco,
// e buraco no rancho é o quarto aparecendo.
for (let i = 0; i < rgba.length; i += 4) {
  rgba[i] = 18;
  rgba[i + 1] = 20;
  rgba[i + 2] = 26;
  rgba[i + 3] = 255;
}

let buracos = 0;
for (let v = 0; v < vistas.length; v++) {
  const vista = vistas[v];
  const col = v % colunas;
  const lin = Math.floor(v / colunas);
  const ox = MARGEM + col * (CELULA + MARGEM);
  const oy = MARGEM + lin * (CELULA + MARGEM + RODAPE);

  // Recorta uma vez por vista: o recorte depende de onde a câmera está.
  const visiveis = vista.recorta
    ? recortarPerto(tris, vista.paraCamera)
    : tris.map((t) => ({
        a: vista.paraCamera(t.a),
        b: vista.paraCamera(t.b),
        c: vista.paraCamera(t.c),
        cor: t.cor,
      }));

  desenharCelula({
    rgba,
    largura,
    ox,
    oy,
    celula: CELULA,
    tris: visiveis,
    naTela: (p: number[]) => vista.projetar(p, ox, oy),
  });

  // Na vista de cima, as cruzes dos pontos de solta por cima do capim.
  if (vista === deCima) {
    for (const ponto of soltas) {
      const [x, y] = vista.projetar(vista.paraCamera([ponto.x, ponto.y, ponto.z]), ox, oy);
      for (let d = -6; d <= 6; d++) {
        for (const [px, py] of [
          [Math.round(x + d), Math.round(y)],
          [Math.round(x), Math.round(y + d)],
        ]) {
          if (px < ox || px >= ox + CELULA || py < oy || py >= oy + CELULA) continue;
          const k = (py * largura + px) * 4;
          rgba[k] = 255;
          rgba[k + 1] = 90;
          rgba[k + 2] = 90;
        }
      }
    }
  }

  // Conta os pixels que ficaram com a cor do fundo: é a medida de "tapou".
  let vazios = 0;
  for (let y = oy; y < oy + CELULA; y++) {
    for (let x = ox; x < ox + CELULA; x++) {
      const k = (y * largura + x) * 4;
      if (rgba[k] === 18 && rgba[k + 1] === 20 && rgba[k + 2] === 26) vazios++;
    }
  }
  const fracao = vazios / (CELULA * CELULA);
  // A vista de cima é ortográfica e mostra o cercado dentro de uma moldura —
  // sobra fundo nos cantos por construção, e isso não é buraco.
  if (vista !== deCima && fracao > 0.01) buracos++;

  escrever(
    rgba,
    largura,
    `${vista.rotulo}${vista === deCima ? '' : ` · vazio ${(fracao * 100).toFixed(1)}%`}`,
    ox,
    oy + CELULA + 6,
    2,
    [150, 165, 190],
  );
}

const saida = join(process.cwd(), 'folha-pasto.png');
writeFileSync(saida, codificarPng(largura, altura, rgba));
rancho.descartar();

console.log(`\n${vistas.length} vistas do pasto → ${saida}`);
console.log(
  `${tris.length} triângulos depois de partir os grandes · cercado de ${RAIO_DO_PASTO} m de raio`,
);
if (buracos > 0) {
  console.log(
    `\nATENÇÃO: ${buracos} vista(s) com mais de 1% de fundo à mostra. Em realidade` +
      ` mista, fundo é o SEU QUARTO aparecendo no meio do rancho.`,
  );
  process.exit(1);
}
console.log('As vistas em perspectiva estão fechadas: o passthrough fica tapado.');
