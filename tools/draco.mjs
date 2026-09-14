/**
 * Copia o decodificador Draco do three.js para public/draco/.
 *
 * Os modelos vêm comprimidos com Draco, e o DRACOLoader precisa do wasm em
 * tempo de execução. Podia vir de CDN, mas aí o jogo dependeria de rede para
 * desenhar um Pokémon — e dentro do headset, instalado como APK, isso é
 * inaceitável. Então o decodificador viaja junto, servido pela própria origem.
 *
 * Roda sozinho no predev e no prebuild; assim ele acompanha a versão do three
 * que estiver instalada, em vez de ficar um arquivo velho comitado no repo.
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = join(RAIZ, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
const DESTINO = join(RAIZ, 'public', 'draco');

// Só o decodificador: o encoder é o dobro do tamanho e o jogo nunca comprime.
const ARQUIVOS = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'];

mkdirSync(DESTINO, { recursive: true });

let copiados = 0;
for (const nome of ARQUIVOS) {
  const de = join(ORIGEM, nome);
  const para = join(DESTINO, nome);
  if (!existsSync(de)) {
    console.warn(`draco: ${nome} não está no three instalado — pulei`);
    continue;
  }
  if (existsSync(para) && statSync(para).size === statSync(de).size) continue;
  copyFileSync(de, para);
  copiados++;
}

if (copiados) console.log(`draco: ${copiados} arquivo(s) atualizados em public/draco/`);
