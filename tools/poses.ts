/**
 * Folha de contato das POSES: cada inicial desenhado andando, atacando,
 * acenando, recebendo cafuné e desmaiado.
 *
 * Existe pelo mesmo motivo que tools/folha.mjs: nenhum teste pega uma animação
 * feia. Um ciclo de passada com o joelho dobrando para o lado errado passa por
 * `tsc`, passa pelo smoke e só aparece com o headset na cabeça — e pôr o
 * headset a cada ajuste de meio radiano não é vida.
 *
 * O que importa aqui é que a pose vem do CÓDIGO DE VERDADE. `Rig` e `Animador`
 * são importados de src/, não reimplementados: o esqueleto é montado num
 * Object3D do three, o animador roda por alguns quadros, e as matrizes locais
 * que sobram são entregues ao mesmo skinning que a folha de modelos usa. Se a
 * imagem sair errada, é o jogo que está errado.
 *
 *   npm run poses                 os quatro iniciais
 *   npm run poses -- 4 25         só Charmander e Pikachu
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { NodeIO, type Document, type Node as NoGltf } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { Animador, type Base, type Gesto } from '../src/anima';
import type { Corpo } from '../src/modelos';

import { primitivasEmRepouso } from './pose.mjs';
import { girarPonto } from './orientacao.mjs';
import { codificarPng } from './png.mjs';
import { caixaDe, corDoNome, desenharCelula } from './raster.mjs';

// O bundle roda de node_modules/.cache, entao a raiz vem do diretorio de
// trabalho — os scripts do npm sempre rodam da raiz do projeto.
const RAIZ = process.cwd();
const MODELOS = join(RAIZ, 'public', 'pokemon');
const manifesto = JSON.parse(readFileSync(join(MODELOS, 'manifesto.json'), 'utf8'));

const CELULA = 240;
const FUNDO = [22, 27, 38];

/** As colunas da folha: uma pose por coluna, sempre na mesma ordem. */
interface Coluna {
  rotulo: string;
  /** 0..1 da pose de colo. Ver `aplicarColo` em src/anima.ts. */
  colo?: number;
  base: Base;
  gesto?: Gesto;
  /** Em que instante do gesto (0..1) o quadro é tirado. */
  quando: number;
  velocidade: number;
}

const COLUNAS: Coluna[] = [
  { rotulo: 'parado', base: 'parado', quando: 0, velocidade: 0 },
  { rotulo: 'andando A', base: 'andando', quando: 0.25, velocidade: 0.8 },
  { rotulo: 'andando B', base: 'andando', quando: 0.75, velocidade: 0.8 },
  { rotulo: 'correndo', base: 'correndo', quando: 0.25, velocidade: 1.8 },
  // Um gesto de ataque por família. O instante é o do PICO de cada um — logo
  // depois do disparo, que é o quadro em que a pose diz o que ela é.
  { rotulo: 'mordida', base: 'parado', gesto: 'mordida', quando: 0.62, velocidade: 0 },
  { rotulo: 'garra', base: 'parado', gesto: 'garra', quando: 0.68, velocidade: 0 },
  { rotulo: 'cauda', base: 'parado', gesto: 'cauda', quando: 0.68, velocidade: 0 },
  { rotulo: 'soco', base: 'parado', gesto: 'soco', quando: 0.66, velocidade: 0 },
  { rotulo: 'salto', base: 'parado', gesto: 'salto', quando: 0.5, velocidade: 0 },
  { rotulo: 'investida', base: 'parado', gesto: 'investida', quando: 0.6, velocidade: 0 },
  { rotulo: 'sopro: inspira', base: 'parado', gesto: 'sopro', quando: 0.36, velocidade: 0 },
  { rotulo: 'sopro: cospe', base: 'parado', gesto: 'sopro', quando: 0.72, velocidade: 0 },
  { rotulo: 'acenando', base: 'parado', gesto: 'acenar', quando: 0.5, velocidade: 0 },
  { rotulo: 'cafuné', base: 'parado', gesto: 'cafune', quando: 0.5, velocidade: 0 },
  // A pose de estar sendo segurado. É uma CAMADA, não um gesto (ver
  // `aplicarColo`), então ela não tem `quando`: ela está ligada ou não.
  { rotulo: 'no colo', base: 'parado', quando: 0, velocidade: 0, colo: 1 },
  { rotulo: 'desmaiado', base: 'desmaiado', quando: 0, velocidade: 0 },
];

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

// ------------------------------------------------------------- esqueleto

/**
 * Espelha a árvore de nós do glTF numa de `THREE.Bone`.
 *
 * Bone e não Object3D porque `Rig` procura por `isBone` — é o mesmo filtro que
 * ele aplica dentro do jogo, e afrouxá-lo aqui faria a folha testar um caminho
 * que o headset não percorre.
 */
function montarEsqueleto(doc: Document) {
  const cena = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const ossos = new Map<NoGltf, THREE.Bone>();
  const raiz = new THREE.Group();

  const criar = (no: NoGltf, pai: THREE.Object3D) => {
    const osso = new THREE.Bone();
    osso.name = no.getName();
    const m = no.getMatrix();
    osso.matrix.fromArray(m);
    osso.matrix.decompose(osso.position, osso.quaternion, osso.scale);
    pai.add(osso);
    ossos.set(no, osso);
    for (const filho of no.listChildren()) criar(filho, osso);
  };
  for (const no of cena?.listChildren() ?? []) criar(no, raiz);

  return { raiz, ossos };
}

/**
 * Converte as animações do glTF em `AnimationClip` do three.
 *
 * Os clipes precisam existir aqui porque metade do que esta folha confere
 * depende deles: o Bulbasaur anda com o `walk` da Game Freak, e o Pikachu só
 * fica de pé porque `Animador` toma emprestado o primeiro quadro do único
 * clipe dele para usar de pose de descanso — o arquivo do Pikachu vem com a
 * pose de bind deitada. Uma folha sem clipe mostraria um Pikachu deitado e
 * diria que o jogo está quebrado quando não está.
 */
function clipesDe(doc: Document): THREE.AnimationClip[] {
  const clipes: THREE.AnimationClip[] = [];

  for (const anim of doc.getRoot().listAnimations()) {
    const trilhas: THREE.KeyframeTrack[] = [];

    for (const canal of anim.listChannels()) {
      const alvo = canal.getTargetNode();
      const amostrador = canal.getSampler();
      const caminho = canal.getTargetPath();
      if (!alvo || !amostrador || !caminho) continue;

      const entrada = amostrador.getInput();
      const saida = amostrador.getOutput();
      if (!entrada || !saida) continue;

      const tempos = new Float32Array(entrada.getCount());
      for (let i = 0; i < tempos.length; i++) tempos[i] = entrada.getScalar(i);
      const valores = saida.getArray();
      if (!valores) continue;

      const propriedade =
        caminho === 'rotation' ? 'quaternion' : caminho === 'translation' ? 'position' : caminho;
      if (propriedade !== 'quaternion' && propriedade !== 'position' && propriedade !== 'scale') {
        continue; // pesos de morph não interessam a esta folha
      }

      const nome = `${alvo.getName()}.${propriedade}`;
      const dados = Float32Array.from(valores as ArrayLike<number>);
      trilhas.push(
        propriedade === 'quaternion'
          ? new THREE.QuaternionKeyframeTrack(nome, tempos as unknown as number[], dados as unknown as number[])
          : new THREE.VectorKeyframeTrack(nome, tempos as unknown as number[], dados as unknown as number[]),
      );
    }

    if (trilhas.length) clipes.push(new THREE.AnimationClip(anim.getName(), -1, trilhas));
  }

  return clipes;
}

/** Um `Corpo` de mentira com o esqueleto — e os clipes — de verdade dentro. */
function corpoDe(esqueleto: THREE.Group, altura: number, clipes: THREE.AnimationClip[]): Corpo {
  const raizJogo = new THREE.Group();
  raizJogo.add(esqueleto);
  const boca = new THREE.Object3D();
  esqueleto.add(boca);

  let mixer: THREE.AnimationMixer | null = null;
  const acoes = new Map<string, THREE.AnimationAction>();
  if (clipes.length) {
    mixer = new THREE.AnimationMixer(esqueleto);
    for (const clipe of clipes) acoes.set(clipe.name, mixer.clipAction(clipe));
  }

  return {
    raiz: raizJogo,
    corpo: esqueleto,
    boca,
    // Montado aqui a partir do arquivo: nao ha pose para remedir.
    renormalizar() {},
    altura,
    raio: altura * 0.5,
    mixer,
    acoes,
    descartar() {
      raizJogo.removeFromParent();
    },
  };
}

// ------------------------------------------------------------- triângulos

interface Triangulo {
  a: number[];
  b: number[];
  c: number[];
  cor: number[];
}

function triangulosDe(doc: Document, pose: Map<string, number[]> | null): Triangulo[] {
  const tris: Triangulo[] = [];
  for (const { prim, material, pontos, contagem } of primitivasEmRepouso(doc, pose)) {
    const idx = prim.getIndices();
    const nome = material?.getName() ?? 'sem-nome';
    const fator = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
    const branco = fator[0] > 0.95 && fator[1] > 0.95 && fator[2] > 0.95;
    const cor = branco ? corDoNome(nome) : [fator[0], fator[1], fator[2]];
    if ((fator[3] ?? 1) < 0.3) continue;

    const n = idx ? idx.getCount() : contagem;
    const ler = (i: number) => {
      const k = (idx ? idx.getScalar(i) : i) * 3;
      return [pontos[k], pontos[k + 1], pontos[k + 2]];
    };
    for (let i = 0; i + 2 < n; i += 3) {
      tris.push({ a: ler(i), b: ler(i + 1), c: ler(i + 2), cor });
    }
  }
  return tris;
}

// ------------------------------------------------------------- tipografia

/**
 * Letras de 3×5 para os rótulos. É feio e é de propósito: puxar uma fonte para
 * escrever nove palavras numa folha de diagnóstico seria uma dependência a
 * mais para manter, e o rótulo só precisa ser lido, não admirado.
 */
const GLIFOS: Record<string, string> = {
  A: '11111101111101101', B: '11011010111011011110'.slice(0, 15), C: '011101100100101011',
  a: '000011101101111', b: '100110101101110', c: '000011100100011',
  d: '001011101101111', e: '011101110100011', f: '011010111010010',
  g: '011101111001110', h: '100100110101101', i: '010000010010010',
  l: '110010010010111', m: '000110111101101', n: '000110101101101',
  o: '000010101101010', p: '000110101110100', r: '000011100100100',
  s: '011100010001110', t: '010111010010011', u: '000101101101011',
  v: '000101101101010', x: '000101010010101', é: '011101110100011',
  ' ': '000000000000000', '0': '111101101101111', '1': '010110010010111',
  '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
  '8': '111101111101111', '9': '111101111001111',
};

function escrever(
  rgba: Uint8Array,
  largura: number,
  texto: string,
  x0: number,
  y0: number,
  escala: number,
  cor: number[],
) {
  let x = x0;
  for (const letra of texto) {
    const glifo = GLIFOS[letra] ?? GLIFOS[letra.toLowerCase()] ?? GLIFOS[' '];
    for (let lin = 0; lin < 5; lin++) {
      for (let col = 0; col < 3; col++) {
        if (glifo[lin * 3 + col] !== '1') continue;
        for (let py = 0; py < escala; py++) {
          for (let px = 0; px < escala; px++) {
            const i = ((y0 + lin * escala + py) * largura + (x + col * escala + px)) * 4;
            if (i < 0 || i + 2 >= rgba.length) continue;
            rgba[i] = cor[0];
            rgba[i + 1] = cor[1];
            rgba[i + 2] = cor[2];
          }
        }
      }
    }
    x += escala * 4;
  }
}

// ------------------------------------------------------------- folha

const alvos = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const numeros = alvos.length ? alvos : [1, 4, 7, 25];
const especies = Object.entries(manifesto.especies as Record<string, any>)
  .map(([id, e]) => ({ id, ...(e as any) }))
  .filter((e) => numeros.includes(e.num))
  .sort((a, b) => numeros.indexOf(a.num) - numeros.indexOf(b.num));

const L = COLUNAS.length * CELULA;
const A = especies.length * CELULA + 26;
const rgba = new Uint8Array(L * A * 4);
for (let i = 0; i < L * A; i++) {
  const y = Math.floor(i / L);
  const faixa = Math.floor(y / CELULA) % 2 ? 6 : 0;
  rgba[i * 4] = FUNDO[0] + faixa;
  rgba[i * 4 + 1] = FUNDO[1] + faixa;
  rgba[i * 4 + 2] = FUNDO[2] + faixa;
  rgba[i * 4 + 3] = 255;
}

for (let c = 0; c < COLUNAS.length; c++) {
  escrever(rgba, L, COLUNAS[c].rotulo, c * CELULA + 12, A - 20, 3, [150, 165, 190]);
}

/** Quantos quadros rodar antes de tirar o retrato de cada pose. */
const DT = 1 / 72;

let linha = 0;
for (const esp of especies) {
  const arquivo = join(MODELOS, `${esp.num}.glb`);
  if (!existsSync(arquivo)) {
    console.warn(`  ! ${esp.id}: sem arquivo`);
    continue;
  }
  const doc = await io.read(arquivo);
  const clipes = clipesDe(doc);

  for (let c = 0; c < COLUNAS.length; c++) {
    const coluna = COLUNAS[c];

    // Um esqueleto novo por célula: o animador guarda estado (fase da passada,
    // peso das bases) e reaproveitar um contaminaria a coluna seguinte.
    const { raiz: esqueleto, ossos } = montarEsqueleto(doc);
    const corpo = corpoDe(esqueleto, esp.alturaModelo ?? 1, clipes);
    const animador = new Animador(corpo);

    if (c === 0 && !animador.temRig) {
      console.warn(`  ! ${esp.id}: o Rig não reconheceu o esqueleto`);
    }

    const ctx = {
      velocidade: coluna.velocidade,
      alarme: 0,
      vida: coluna.base === 'desmaiado' ? 0 : 1,
      encarar: coluna.gesto === 'olhar' ? null : 0.25,
      desmaiado: coluna.base === 'desmaiado',
      colo: coluna.colo ?? 0,
    };

    // Deixa as bases assentarem antes do gesto: o peso da pose base sobe por
    // interpolação, e fotografar no primeiro quadro pegaria o bicho no meio da
    // transição em vez de na pose.
    for (let i = 0; i < 90; i++) animador.atualizar(DT, ctx);

    if (coluna.gesto) {
      const duracao = 1.2;
      animador.disparar(coluna.gesto, duracao);
      const quadros = Math.max(1, Math.round((duracao * coluna.quando) / DT));
      for (let i = 0; i < quadros; i++) animador.atualizar(DT, ctx);
    } else if (coluna.quando > 0) {
      // Meia passada a mais: é o que separa "andando A" de "andando B", e é
      // vendo as duas lado a lado que se enxerga se as pernas alternam.
      const quadros = Math.round((coluna.quando * 0.9) / DT);
      for (let i = 0; i < quadros; i++) animador.atualizar(DT, ctx);
    }

    // A pose pronta: a matriz local de cada osso, pelo nome do nó do glTF.
    const pose = new Map<string, number[]>();
    for (const [no, osso] of ossos) {
      osso.updateMatrix();
      pose.set(no.getName(), Array.from(osso.matrix.elements));
    }

    const brutos = triangulosDe(doc, pose);
    const gx = esp.giroX ?? 0;
    const gy = esp.giroY ?? 0;
    const tris =
      gx || gy
        ? brutos.map((t) => ({
            cor: t.cor,
            a: girarPonto(t.a, gx, gy),
            b: girarPonto(t.b, gx, gy),
            c: girarPonto(t.c, gx, gy),
          }))
        : brutos;

    const caixa = caixaDe(tris);
    if (!caixa) continue;

    const ox = c * CELULA;
    const oy = linha * CELULA;
    // A escala sai do REPOUSO, não da pose: escalar cada célula pela caixa dela
    // faria o bicho encolher quando abaixa e crescer quando estica, e aí a
    // folha não mostraria mais o movimento — mostraria zoom.
    const referencia = Math.max(esp.largura ?? 1, esp.alturaModelo ?? 1, 1e-6);
    const escala = (CELULA * 0.8) / referencia;

    // Ancorado no chão e no centro horizontal do repouso, para as poses ficarem
    // comparáveis entre as células.
    const meioX = ox + CELULA / 2 - (esp.centroX ?? 0) * escala;
    const pe = oy + CELULA - CELULA * 0.1 + (esp.baseY ?? 0) * escala;

    desenharCelula({
      rgba,
      largura: L,
      ox,
      oy,
      celula: CELULA,
      tris,
      naTela: (p: number[]) => [meioX + p[0] * escala, pe - p[1] * escala, -p[2] * escala],
    });
  }

  escrever(rgba, L, esp.id, 10, linha * CELULA + 10, 3, [210, 220, 240]);
  process.stdout.write(`\r  ${esp.id.padEnd(14)}`);
  linha++;
}

const destino = join(RAIZ, 'folha-poses.png');
writeFileSync(destino, codificarPng(L, A, rgba));
console.log(`\n\n${especies.length} bichos × ${COLUNAS.length} poses → ${destino}`);
console.log('Cada linha é um Pokémon; cada coluna, uma pose. As duas de "andando" têm de mostrar pernas trocadas.');
