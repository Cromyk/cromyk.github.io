/**
 * Baixa os gritos oficiais dos 151 para public/gritos/.
 *
 * Vêm do repositório de áudio da PokeAPI — a mesma fonte de onde saem os dados
 * da Pokédex e os golpes. São os gritos DOS JOGOS: o "latest" é o das versões
 * modernas e o "legacy" é o bipe de oito bits de Red/Blue.
 *
 * Uma coisa que vale dizer sem rodeio: o grito do jogo NÃO é a voz do desenho.
 * O Charmander dos jogos guincha; o que fala "Charmander" é o dublador do anime,
 * e isso não existe em fonte estruturada nenhuma. O que dá para ter de oficial
 * e de reprodutível é isto aqui.
 *
 *   npm run gritos              # os 151, no som moderno
 *   npm run gritos -- --legacy  # os bipes de oito bits de Red/Blue
 *   npm run gritos -- 4 25      # só Charmander e Pikachu
 *
 * Os arquivos não são versionados, como os modelos: o `predev` e o `prebuild`
 * baixam o que faltar. Ver .gitignore.
 */
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SAIDA = 'public/gritos';
const ULTIMO = 151;
const legado = process.argv.includes('--legacy');
const BASE = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/${
  legado ? 'legacy' : 'latest'
}`;

const alvos = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const numeros = alvos.length
  ? alvos
  : Array.from({ length: ULTIMO }, (_, i) => i + 1);

await mkdir(SAIDA, { recursive: true });

const jaTem = new Set(
  (await readdir(SAIDA).catch(() => [])).filter((n) => n.endsWith('.ogg')).map((n) => n.slice(0, -4)),
);

async function baixar(num) {
  const destino = join(SAIDA, `${num}.ogg`);
  if (jaTem.has(String(num)) && !alvos.length) return 0;
  try {
    const r = await fetch(`${BASE}/${num}.ogg`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    // Um arquivo minúsculo é uma página de erro, não um grito.
    if (bytes.length < 500) throw new Error(`só ${bytes.length} bytes`);
    await writeFile(destino, bytes);
    return bytes.length;
  } catch (erro) {
    // Sem rede não se baixa grito, e isso não derruba o build: src/audio.ts cai
    // no som sintetizado quando o arquivo não existe.
    console.warn(`  ${num}: ${erro.message}`);
    return -1;
  }
}

let baixados = 0;
let bytes = 0;
let falhas = 0;

for (let i = 0; i < numeros.length; i += 8) {
  const lote = numeros.slice(i, i + 8);
  const tamanhos = await Promise.all(lote.map(baixar));
  for (const t of tamanhos) {
    if (t < 0) falhas++;
    else if (t > 0) {
      baixados++;
      bytes += t;
    }
  }
  process.stdout.write(`\r  ${Math.min(i + 8, numeros.length)}/${numeros.length}`);
}
process.stdout.write('\r');

const total = (await readdir(SAIDA)).filter((n) => n.endsWith('.ogg'));
let ocupado = 0;
for (const n of total) ocupado += (await stat(join(SAIDA, n))).size;

console.log(
  `gritos (${legado ? 'legacy' : 'latest'}): ${baixados} baixados agora` +
    `${bytes ? ` (${(bytes / 1024).toFixed(0)} kB)` : ''}, ` +
    `${total.length} no total ocupando ${(ocupado / 1024 / 1024).toFixed(1)} MB.` +
    (falhas ? ` ${falhas} falharam.` : ''),
);
