/**
 * Temporário: mede o quanto a pose emprestada desloca o bicho da caixa que o
 * manifesto gravou. É a distância que o corpo percorre em órbita quando a raiz
 * gira — o bug do Pikachu na tela de escolha.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { primitivasEmRepouso, multiplicarMat, IDENTIDADE } from './pose.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(join(raiz, 'src', 'modelos.gen.ts'), 'utf8');
const MEDIDAS = JSON.parse(fonte.slice(fonte.indexOf('{', fonte.indexOf('MEDIDAS')), fonte.lastIndexOf('}') + 1));

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

/** Matriz local column-major a partir de translação, quaternion e escala. */
function compor(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

/** A pose local de cada nó no instante 0 do clipe. */
function poseNoQuadroZero(animacao) {
  const trs = new Map();
  for (const canal of animacao.listChannels()) {
    const no = canal.getTargetNode();
    const amostrador = canal.getSampler();
    if (!no || !amostrador) continue;
    const saida = amostrador.getOutput();
    if (!saida) continue;
    const alvo = trs.get(no) ?? { t: no.getTranslation(), r: no.getRotation(), s: no.getScale() };
    const tam = canal.getTargetPath() === 'rotation' ? 4 : 3;
    const v = saida.getElement(0, new Array(tam));
    if (canal.getTargetPath() === 'translation') alvo.t = v;
    else if (canal.getTargetPath() === 'rotation') alvo.r = v;
    else if (canal.getTargetPath() === 'scale') alvo.s = v;
    trs.set(no, alvo);
  }
  const pose = new Map();
  for (const [no, v] of trs) pose.set(no.getName(), compor(v.t, v.r, v.s));
  return pose;
}

function caixa(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { pontos, contagem } of prims)
    for (let i = 0; i < contagem; i++)
      for (let e = 0; e < 3; e++) {
        const v = pontos[i * 3 + e];
        if (v < min[e]) min[e] = v;
        if (v > max[e]) max[e] = v;
      }
  return { min, max, centro: [0,1,2].map(e => (min[e]+max[e])/2), tam: [0,1,2].map(e => max[e]-min[e]) };
}

const alvos = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.entries(MEDIDAS).filter(([,m]) => m.animacoes.length > 0).map(([k]) => k);

console.log('espécie        órbita(XZ)  desvio de altura   pés fora do chão');
for (const id of alvos) {
  const m = MEDIDAS[id];
  const doc = await io.read(join(raiz, 'public', 'pokemon', `${m.num}.glb`));
  const anims = doc.getRoot().listAnimations();
  if (!anims.length) continue;
  const bind = caixa(primitivasEmRepouso(doc));
  const posada = caixa(primitivasEmRepouso(doc, poseNoQuadroZero(anims[0])));
  // A órbita é a distância entre os dois centros horizontais, em fração da
  // altura final do bicho no jogo — é o que o olho vê.
  const orbita = Math.hypot(posada.centro[0] - bind.centro[0], posada.centro[2] - bind.centro[2]);
  const pct = (v) => (100 * v / Math.max(bind.tam[1], 1e-9)).toFixed(0).padStart(4) + '%';
  console.log(
    id.padEnd(14),
    pct(orbita),
    '      ', ((posada.tam[1] / bind.tam[1] - 1) * 100).toFixed(0).padStart(5) + '%',
    '          ', pct(posada.min[1] - bind.min[1]),
  );
}
