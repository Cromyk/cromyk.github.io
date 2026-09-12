/**
 * Confere se o build tem tudo que o Bubblewrap e o Quest exigem, antes de você
 * publicar e descobrir no headset que faltava um arquivo.
 *
 * Com uma URL, checa o site publicado em vez da pasta dist/:
 *   node tools/pwa-check.mjs https://meu-dominio.com
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST = join(AQUI, '..', 'dist');
const base = process.argv[2];

let falhas = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const erro = (msg) => {
  console.log(`  FALTA ${msg}`);
  falhas++;
};
const aviso = (msg) => console.log(`  aviso ${msg}`);

async function pegar(caminho) {
  if (base) {
    const url = new URL(caminho, base.endsWith('/') ? base : base + '/').href;
    try {
      const resposta = await fetch(url);
      if (!resposta.ok) return null;
      return { texto: await resposta.text(), tipo: resposta.headers.get('content-type') ?? '' };
    } catch {
      return null;
    }
  }
  const arquivo = join(DIST, caminho);
  if (!existsSync(arquivo)) return null;
  return { texto: readFileSync(arquivo, 'utf8'), tipo: '' };
}

console.log(base ? `Checando ${base}\n` : 'Checando dist/\n');

if (!base && !existsSync(DIST)) {
  console.error('dist/ não existe. Rode `npm run build` primeiro.');
  process.exit(1);
}

// --- HTML ---
const html = await pegar('index.html');
if (!html) {
  erro('index.html');
} else {
  ok('index.html');
  if (html.texto.includes('rel="manifest"')) ok('index.html aponta para o manifest');
  else erro('<link rel="manifest"> no index.html');
}

// --- manifest ---
const man = await pegar('manifest.webmanifest');
if (!man) {
  erro('manifest.webmanifest');
} else {
  ok('manifest.webmanifest');
  let dados;
  try {
    dados = JSON.parse(man.texto);
  } catch {
    erro('manifest.webmanifest não é JSON válido');
  }

  if (dados) {
    for (const campo of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) {
      if (dados[campo] !== undefined) ok(`manifest.${campo}`);
      else erro(`manifest.${campo}`);
    }

    const tamanhos = (dados.icons ?? []).map((i) => i.sizes);
    if (tamanhos.includes('512x512')) ok('ícone 512x512');
    else erro('ícone 512x512 (o Bubblewrap exige)');

    if ((dados.icons ?? []).some((i) => (i.purpose ?? '').includes('maskable'))) ok('ícone maskable');
    else aviso('nenhum ícone maskable — o launcher vai cortar as bordas');

    // Os ícones existem mesmo?
    for (const icone of dados.icons ?? []) {
      const achou = await pegar(icone.src);
      if (achou) ok(`ícone ${icone.src}`);
      else erro(`ícone ${icone.src} referenciado mas ausente`);
    }
  }
}

// --- service worker ---
if (await pegar('sw.js')) ok('sw.js');
else erro('sw.js (exigido para a PWA ser instalável)');

// --- digital asset links ---
const links = await pegar('.well-known/assetlinks.json');
let temAssetlinks = false;
if (!links) {
  aviso('.well-known/assetlinks.json ausente');
  aviso('  gere com: node tools/assetlinks.mjs <SHA256>');
  aviso('  sem ele a PWA imersiva NÃO abre no Quest');
} else {
  temAssetlinks = true;
  ok('.well-known/assetlinks.json');
  try {
    const dados = JSON.parse(links.texto);
    const alvo = dados[0]?.target;
    if (alvo?.package_name) ok(`  pacote: ${alvo.package_name}`);
    const impressao = alvo?.sha256_cert_fingerprints?.[0] ?? '';
    if (impressao.replace(/[^0-9A-F]/gi, '').length === 64) ok('  SHA-256 com 32 bytes');
    else erro('  SHA-256 malformado no assetlinks.json');
  } catch {
    erro('assetlinks.json não é JSON válido');
  }
}

// --- HTTPS ---
if (base) {
  if (base.startsWith('https://')) ok('servido por HTTPS');
  else erro('o site precisa ser HTTPS — WebXR e Bubblewrap exigem');
}

if (falhas > 0) {
  console.log(`\n${falhas} problema(s) a resolver antes de empacotar.`);
} else if (!temAssetlinks) {
  // Não é erro ainda: o assetlinks só existe depois que a chave de assinatura
  // é criada, no passo 4 do GUIA-QUEST.md.
  console.log('\nO site está válido. Falta só o assetlinks.json, que vem depois');
  console.log('do `bubblewrap init` — veja o passo 4 do GUIA-QUEST.md.');
} else {
  console.log('\nPronto para empacotar.');
}
process.exit(falhas === 0 ? 0 : 1);
