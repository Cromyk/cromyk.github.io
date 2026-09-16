/** Diagnóstico: centroide de cada primitiva NA POSE DE REPOUSO (o espaço que
 *  o jogo desenha), com a cor amostrada na textura nas duas convenções de V. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { primitivasEmRepouso } from './pose.mjs';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

const doc = await io.read(process.argv[2]);
const cache = new Map();
async function bitmapDe(tex) {
  const bytes = tex.getImage();
  if (cache.has(tex)) return cache.get(tex);
  const img = await loadImage(Buffer.from(bytes));
  const cv = createCanvas(img.width, img.height);
  cv.getContext('2d').drawImage(img, 0, 0);
  const d = { ctx: cv.getContext('2d'), w: img.width, h: img.height };
  cache.set(tex, d);
  return d;
}

for (const { material, pontos, contagem, primitiva } of primitivasEmRepouso(doc)) {
  const c = [0, 0, 0];
  for (let i = 0; i < contagem; i++) for (let e = 0; e < 3; e++) c[e] += pontos[i * 3 + e] / contagem;
  let cor = '-', corFlip = '-';
  const tex = material?.getBaseColorTexture?.();
  const uv = primitiva?.getAttribute?.('TEXCOORD_0');
  if (tex && uv) {
    const { ctx, w, h } = await bitmapDe(tex);
    const soma = [0, 0, 0], somaF = [0, 0, 0];
    const t = [0, 0];
    const passo = Math.max(1, Math.floor(uv.getCount() / 150));
    let n = 0;
    for (let k = 0; k < uv.getCount(); k += passo) {
      uv.getElement(k, t);
      const x = Math.min(w - 1, Math.max(0, Math.round(((t[0] % 1) + 1) % 1 * (w - 1))));
      const y = Math.min(h - 1, Math.max(0, Math.round(((t[1] % 1) + 1) % 1 * (h - 1))));
      const p = ctx.getImageData(x, y, 1, 1).data;
      const pf = ctx.getImageData(x, h - 1 - y, 1, 1).data;
      for (let e = 0; e < 3; e++) { soma[e] += p[e]; somaF[e] += pf[e]; }
      n++;
    }
    cor = soma.map((v) => Math.round(v / n)).join(',');
    corFlip = somaF.map((v) => Math.round(v / n)).join(',');
  }
  console.log(`${(material?.getName() ?? '?').padEnd(20)} verts=${String(contagem).padStart(5)} ` +
              `centroide=[${c.map((v) => v.toFixed(3)).join(', ')}]  cor=(${cor})  corV-invertido=(${corFlip})`);
}
