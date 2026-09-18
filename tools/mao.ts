/**
 * Folha de contato da MÃO: as duas, em três poses e três vistas.
 *
 * Existe pelo mesmo motivo que tools/poses.ts. A mão nova é um modelo pronto
 * posado por código — a cadeia de ossos é montada em runtime e o eixo em que
 * cada dedo dobra é medido no arquivo — e nada disso aparece num `tsc`. Uma mão
 * girada noventa graus para o lado errado, com os dedos dobrando para fora,
 * passaria por todos os testes e só apareceria com o headset na cabeça.
 *
 * O que importa: a pose vem do CÓDIGO DE VERDADE. `MaoArticulada` é importada
 * de src/glove.ts, não reimplementada aqui.
 *
 * Como ler a folha, e o que cada vista precisa mostrar:
 *
 * - **de frente** é a câmera olhando de +Z para −Z, que é o eixo para onde os
 *   dedos apontam no grip space: nesta coluna a mão vem NA SUA DIREÇÃO, então
 *   ela aparece encurtada, de ponta.
 * - **de cima** olha de +Y, com os dedos subindo na imagem: como o dorso está em
 *   +X, esta vista pega a mão de perfil, e é nela que se vê o polegar se opor
 *   aos outros quatro em vez de acompanhar.
 * - **de lado** olha de +X (o dorso da mão direita): é a vista que mostra os
 *   dedos dobrando, e eles têm de fechar em direção à palma, nunca para trás.
 *
 *   npm run mao
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MaoArticulada } from '../src/glove';

import { caixaDe, desenharCelula } from './raster.mjs';
import { codificarPng } from './png.mjs';
import { escrever } from './texto.mjs';

const RAIZ = process.cwd();
const MAOS = join(RAIZ, 'public', 'maos');
const CELULA = 300;
const FUNDO = [22, 27, 38];

interface Pose {
  rotulo: string;
  gatilho: number;
  grip: number;
  /** Calibração aplicada, em graus e centímetros. Ver MaoArticulada.ajustarGiro. */
  giro?: [number, number, number];
  recuo?: number;
}

const POSES: Pose[] = [
  { rotulo: 'aberta', gatilho: 0, grip: 0 },
  { rotulo: 'apontando', gatilho: 0, grip: 1 },
  { rotulo: 'fechada', gatilho: 1, grip: 1 },
  // A última linha mostra o que a CALIBRAÇÃO faz: a mesma mão fechada, com o
  // punho girado 20° no eixo do antebraço e recuada 2 cm. É como se confere,
  // sem headset, que o ajuste que o jogador mexe no analógico gira em torno do
  // encaixe — e não em torno do pulso do modelo, que seria o erro fácil.
  { rotulo: 'fechada · calibrada 20°', gatilho: 1, grip: 1, giro: [0, 0, 20], recuo: 0.02 },
];

interface Vista {
  rotulo: string;
  /** Ponto do espaço do grip → [x, y] da tela e profundidade. */
  projetar: (p: THREE.Vector3) => [number, number, number];
}

const VISTAS: Vista[] = [
  // De frente: a mão vem para cima de quem olha. X para a direita, Y para cima.
  { rotulo: 'frente', projetar: (p) => [p.x, p.y, -p.z] },
  // De cima: X para a direita, −Z para cima da imagem (os dedos descem).
  { rotulo: 'de cima', projetar: (p) => [p.x, -p.z, -p.y] },
  // De lado, olhando pelo dorso da direita: −Z para a direita, Y para cima.
  { rotulo: 'de lado', projetar: (p) => [-p.z, p.y, p.x] },
];

/** O GLB lido do disco e entregue como cena do three, sem passar pela rede. */
async function carregar(lado: 'left' | 'right'): Promise<THREE.Object3D | null> {
  const arquivo = join(MAOS, `${lado}.glb`);
  if (!existsSync(arquivo)) {
    console.warn(`  ! sem ${arquivo} — rode: npm run maos`);
    return null;
  }
  const buf = readFileSync(arquivo);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  // O parse do GLTFLoader devolve pelo callback e devolve DEPOIS: ele passa
  // por uma promessa interna mesmo quando não há nada para baixar. Ler o
  // resultado na linha seguinte traria null — e uma folha em branco.
  return await new Promise((resolve) => {
    new GLTFLoader().parse(
      bytes as ArrayBuffer,
      '',
      (gltf) => resolve(gltf.scene),
      () => resolve(null),
    );
  });
}

interface Triangulo {
  a: number[];
  b: number[];
  c: number[];
  cor: number[];
}

/**
 * Os triângulos da mão posada, já no espaço do grip.
 *
 * O skinning é feito aqui no processador, com `applyBoneTransform` — o mesmo
 * cálculo que a placa de vídeo faria no headset, só que devagar e uma vez. Sem
 * isto a folha mostraria a malha na pose de repouso por mais que os ossos se
 * mexessem, que é o erro clássico de conferência de esqueleto.
 */
function triangulosDe(raiz: THREE.Object3D): Triangulo[] {
  raiz.updateMatrixWorld(true);
  const tris: Triangulo[] = [];
  const v = new THREE.Vector3();

  raiz.traverse((obj) => {
    const malha = obj as THREE.SkinnedMesh;
    if (!(malha as THREE.Mesh).isMesh) return;
    const geo = malha.geometry;
    const pos = geo.getAttribute('position');
    const indice = geo.getIndex();
    const total = indice ? indice.count : pos.count;

    const pontos: number[][] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (malha.isSkinnedMesh) malha.applyBoneTransform(i, v);
      v.applyMatrix4(malha.matrixWorld);
      pontos.push([v.x, v.y, v.z]);
    }

    // Cinza claro para todo mundo: a mão tem um material só, e o que se está
    // conferindo aqui é forma, não cor.
    const cor = [0.82, 0.84, 0.9];
    for (let i = 0; i < total; i += 3) {
      const a = indice ? indice.getX(i) : i;
      const b = indice ? indice.getX(i + 1) : i + 1;
      const c = indice ? indice.getX(i + 2) : i + 2;
      tris.push({ a: pontos[a], b: pontos[b], c: pontos[c], cor });
    }
  });

  return tris;
}

// ------------------------------------------------------------------- folha

const LADOS: Array<'left' | 'right'> = ['right', 'left'];
const linhas = LADOS.length * POSES.length;
const L = VISTAS.length * CELULA;
const A = linhas * CELULA + 26;
const rgba = new Uint8Array(L * A * 4);
for (let i = 0; i < L * A; i++) {
  const y = Math.floor(i / L);
  const faixa = Math.floor(y / CELULA) % 2 ? 6 : 0;
  rgba[i * 4] = FUNDO[0] + faixa;
  rgba[i * 4 + 1] = FUNDO[1] + faixa;
  rgba[i * 4 + 2] = FUNDO[2] + faixa;
  rgba[i * 4 + 3] = 255;
}

for (let c = 0; c < VISTAS.length; c++) {
  escrever(rgba, L, VISTAS[c].rotulo, c * CELULA + 12, A - 20, 3, [150, 165, 190]);
}

let linha = 0;
for (const lado of LADOS) {
  const molde = await carregar(lado);
  if (!molde) break;

  for (const pose of POSES) {
    const mao = new MaoArticulada(molde, lado, 0x7fd4ff);
    // Um dt grande de uma vez: a suavização dos dedos é exponencial, e um passo
    // longo chega ao alvo em vez de ficar no meio do caminho.
    for (let i = 0; i < 6; i++) mao.definirDedos(pose.gatilho, pose.grip, 1);
    if (pose.giro) {
      const [gx, gy, gz] = pose.giro;
      const rad = (g: number) => (g * Math.PI) / 180;
      mao.ajustarGiro(rad(gx), rad(gy), rad(gz));
    }
    if (pose.recuo) mao.recuar(pose.recuo);

    const tris = triangulosDe(mao.raiz);
    const caixa = caixaDe(tris);
    if (!caixa) continue;

    // A escala é a MESMA em todas as células: é o que deixa comparar a mão
    // aberta com a fechada sem confundir dobra com zoom.
    const escala = (CELULA * 0.62) / 0.2;

    for (let c = 0; c < VISTAS.length; c++) {
      const vista = VISTAS[c];
      const ox = c * CELULA;
      const oy = linha * CELULA;
      const meioX = ox + CELULA / 2;
      const meioY = oy + CELULA / 2;
      const ponto = new THREE.Vector3();

      desenharCelula({
        rgba,
        largura: L,
        ox,
        oy,
        celula: CELULA,
        tris,
        naTela: (p: number[]) => {
          const [x, y, z] = vista.projetar(ponto.set(p[0], p[1], p[2]));
          return [meioX + x * escala, meioY - y * escala, -z * escala];
        },
      });
    }

    escrever(rgba, L, `${lado} ${pose.rotulo}`, 10, linha * CELULA + 10, 3, [210, 220, 240]);
    linha++;
  }
}

const destino = join(RAIZ, 'folha-maos.png');
writeFileSync(destino, codificarPng(L, A, rgba));
console.log(`\n${linhas} poses de mão → ${destino}`);
console.log('A origem de cada célula é o grip space: os dedos apontam para −Z e o dorso da direita para +X.');
