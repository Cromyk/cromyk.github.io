/**
 * Renderiza os Pokémon num PNG sem navegador e sem WebGL: percorre as malhas
 * do three.js, projeta os triângulos e rasteriza com z-buffer e luz difusa.
 *
 * Existe para conferir a silhueta depois de mexer na geometria — dá para olhar
 * o resultado sem pôr o headset nem abrir o Chrome.
 *
 *   npm run render
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Pokemon } from '../src/creature';
import { ESPECIES } from '../src/species';

const require = createRequire(import.meta.url);
const { codificarPng } = require('./png.mjs');

const LARGURA = 1000;
const ALTURA = 420;
const FUNDO: [number, number, number] = [26, 33, 48];

interface Triangulo {
  /** Vértices em espaço de tela: x, y em pixels, z para o z-buffer. */
  tela: THREE.Vector3[];
  normal: THREE.Vector3;
  cor: THREE.Color;
  emissivo: number;
}

const LUZ = new THREE.Vector3(0.5, 0.85, 0.6).normalize();
const LUZ2 = new THREE.Vector3(-0.6, 0.25, 0.5).normalize();

function coletarTriangulos(raiz: THREE.Object3D, camera: THREE.Camera): Triangulo[] {
  const triangulos: Triangulo[] = [];
  const matVP = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );

  raiz.updateMatrixWorld(true);

  raiz.traverse((obj) => {
    const malha = obj as THREE.Mesh;
    if (!malha.isMesh || !malha.visible) return;

    const geo = malha.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    if (!pos) return;
    const indice = geo.index;

    const material = malha.material as THREE.MeshStandardMaterial;
    const cor = material.color ?? new THREE.Color(0xffffff);
    const emissivo = material.emissive
      ? material.emissive.getHSL({ h: 0, s: 0, l: 0 }).l * (material.emissiveIntensity ?? 1)
      : 0;
    // Material transparente quase some aqui — não vale o esforço de blending.
    if (material.transparent && (material.opacity ?? 1) < 0.35) return;

    const contagem = indice ? indice.count : pos.count;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let i = 0; i < contagem; i += 3) {
      const i0 = indice ? indice.getX(i) : i;
      const i1 = indice ? indice.getX(i + 1) : i + 1;
      const i2 = indice ? indice.getX(i + 2) : i + 2;

      a.fromBufferAttribute(pos, i0).applyMatrix4(malha.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(malha.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(malha.matrixWorld);

      // Normal geométrica, calculada no mundo.
      const normal = new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a))
        .normalize();

      const tela = [a, b, c].map((v) => {
        const p = v.clone().applyMatrix4(matVP);
        return new THREE.Vector3(
          (p.x * 0.5 + 0.5) * LARGURA,
          (1 - (p.y * 0.5 + 0.5)) * ALTURA,
          p.z,
        );
      });

      // Descarta o que saiu atrás da câmera.
      if (tela.some((t) => !Number.isFinite(t.x) || t.z < -1 || t.z > 1)) continue;

      triangulos.push({ tela, normal, cor, emissivo: Math.min(1, emissivo) });
    }
  });

  return triangulos;
}

function rasterizar(triangulos: Triangulo[]): Uint8Array {
  const rgba = new Uint8Array(LARGURA * ALTURA * 4);
  const zbuffer = new Float32Array(LARGURA * ALTURA).fill(Infinity);

  // Fundo com um leve degradê vertical.
  for (let y = 0; y < ALTURA; y++) {
    const t = y / ALTURA;
    for (let x = 0; x < LARGURA; x++) {
      const i = (y * LARGURA + x) * 4;
      rgba[i] = FUNDO[0] + t * 10;
      rgba[i + 1] = FUNDO[1] + t * 12;
      rgba[i + 2] = FUNDO[2] + t * 16;
      rgba[i + 3] = 255;
    }
  }

  for (const tri of triangulos) {
    const [p0, p1, p2] = tri.tela;

    // Backface culling no espaço de tela.
    const area = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    if (area >= 0) continue;

    const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
    const maxX = Math.min(LARGURA - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
    const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
    const maxY = Math.min(ALTURA - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));
    if (minX > maxX || minY > maxY) continue;

    // Luz difusa de duas fontes + um ambiente, no estilo do jogo.
    const difusa = Math.max(0, tri.normal.dot(LUZ)) * 0.85;
    const preenchimento = Math.max(0, tri.normal.dot(LUZ2)) * 0.3;
    const luz = Math.min(1.6, 0.32 + difusa + preenchimento + tri.emissivo * 1.4);

    const r = Math.min(255, tri.cor.r * 255 * luz);
    const g = Math.min(255, tri.cor.g * 255 * luz);
    const b = Math.min(255, tri.cor.b * 255 * luz);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;

        // Coordenadas baricêntricas.
        const w0 = ((p1.x - p0.x) * (py - p0.y) - (px - p0.x) * (p1.y - p0.y)) / area;
        const w1 = ((p2.x - p1.x) * (py - p1.y) - (px - p1.x) * (p2.y - p1.y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        const z = p0.z * w1 + p1.z * w2 + p2.z * w0;
        const idx = y * LARGURA + x;
        if (z >= zbuffer[idx]) continue;
        zbuffer[idx] = z;

        const i = idx * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
      }
    }
  }

  return rgba;
}

// ---------------------------------------------------------------- cena

const cena = new THREE.Group();
const jogador = new THREE.Vector3(0, 1.6, 3);
const espacamento = 0.44;

ESPECIES.forEach((especie, i) => {
  const x = (i - (ESPECIES.length - 1) / 2) * espacamento;
  const p = new Pokemon(especie, new THREE.Vector3(x, 0, 0), 0, 'companheiro', i * 77 + 5);
  // Passa do "surgindo" e encara a câmera.
  for (let k = 0; k < 90; k++) p.atualizar(1 / 60, jogador);
  p.raiz.position.set(x, 0, 0);
  p.raiz.rotation.set(0, 0, 0);
  p.raiz.scale.setScalar(1);
  cena.add(p.raiz);
  console.log(`   ${especie.nome.padEnd(11)} tipo ${especie.tipo}`);
});

const camera = new THREE.PerspectiveCamera(34, LARGURA / ALTURA, 0.05, 20);
camera.position.set(0, 0.3, 1.72);
camera.lookAt(0, 0.19, 0);
camera.updateMatrixWorld(true);
camera.updateProjectionMatrix();
camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

console.log('\nrasterizando…');
const triangulos = coletarTriangulos(cena, camera);
const rgba = rasterizar(triangulos);
const png = codificarPng(LARGURA, ALTURA, rgba);

// A partir do cwd, não de import.meta.url: o script roda empacotado dentro de
// node_modules/.cache e o caminho relativo cairia lá.
const destino = `${process.cwd()}/pokemon.png`;
writeFileSync(destino, png);
console.log(`${triangulos.length} triângulos → ${destino} (${(png.length / 1024).toFixed(0)} kB)`);
