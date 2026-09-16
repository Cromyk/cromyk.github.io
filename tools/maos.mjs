/**
 * Baixa o modelo de mão para public/maos/.
 *
 * A mão do jogo era montada à mão em src/glove.ts: cápsulas e caixas formando
 * uma luva branca. Funcionava, e era feia — dedos de vareta, palma de bloco, e
 * a coisa em que o jogo mais encosta durante uma sessão inteira.
 *
 * Isto aqui é o modelo de referência do próprio WebXR: o `generic-hand` do
 * repositório immersive-web/webxr-input-profiles, que é o mesmo arquivo que o
 * `XRHandModelFactory` do three.js usa quando alguém pede a mão de malha. Ele
 * vem com as VINTE E CINCO juntas nomeadas exatamente como a especificação
 * manda (`wrist`, `index-finger-phalanx-proximal`, e assim por diante), o que
 * faz o encaixe com o rastreamento de mão do Quest ser uma cópia de nome para
 * nome, sem tabela de tradução.
 *
 * São noventa e quatro quilobytes por lado, uma malha só, um material só e
 * nenhuma textura — do tamanho de um ícone, e a única geometria do jogo que não
 * precisa de Draco.
 *
 * Licença: MIT, do repositório webxr-input-profiles.
 *
 *   npm run maos          baixa o que faltar
 *   npm run maos -- --tudo  rebaixa tudo
 *
 * Sem rede o comando desiste em silêncio: src/glove.ts volta para a luva
 * montada em código, que continua lá justamente para isso.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SAIDA = 'public/maos';
const BASE =
  'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand';

const tudo = process.argv.includes('--tudo');

await mkdir(SAIDA, { recursive: true });

async function baixar(lado) {
  const destino = join(SAIDA, `${lado}.glb`);
  if (!tudo) {
    const ja = await stat(destino).catch(() => null);
    // Arquivo minúsculo é uma página de erro salva por engano, não uma mão.
    if (ja && ja.size > 5000) return 0;
  }
  try {
    const r = await fetch(`${BASE}/${lado}.glb`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length < 5000) throw new Error(`só ${bytes.length} bytes`);
    await writeFile(destino, bytes);
    return bytes.length;
  } catch (erro) {
    console.warn(`  ${lado}: ${erro.message}`);
    return -1;
  }
}

let baixados = 0;
let falhas = 0;
for (const lado of ['left', 'right']) {
  const n = await baixar(lado);
  if (n < 0) falhas++;
  else if (n > 0) baixados++;
}

if (baixados) console.log(`maos: ${baixados} baixada(s) em ${SAIDA}/`);
if (falhas) console.log(`maos: ${falhas} sem rede — o jogo usa a luva de código`);
