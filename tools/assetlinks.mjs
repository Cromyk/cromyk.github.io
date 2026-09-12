/**
 * Gera o /.well-known/assetlinks.json — o arquivo que prova ao Android que este
 * domínio e aquele APK são a mesma pessoa.
 *
 * Sem ele, uma PWA imersiva no Quest não abre (uma 2D abriria, mas com barra de
 * URL por cima). O SHA-256 sai da chave que assina o APK:
 *
 *   keytool -list -v -keystore android.keystore -alias android
 *
 * Uso:
 *   node tools/assetlinks.mjs <SHA256> [pacote]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACOTE_PADRAO = 'com.marcosouza.critterquest';
const AQUI = dirname(fileURLToPath(import.meta.url));

const [, , bruto, pacote = PACOTE_PADRAO] = process.argv;

if (!bruto) {
  console.error('falta o SHA-256 do certificado.\n');
  console.error('  1. keytool -list -v -keystore android.keystore -alias android');
  console.error('  2. copie a linha "SHA256:" (os pares separados por dois-pontos)');
  console.error('  3. node tools/assetlinks.mjs <SHA256>\n');
  process.exit(1);
}

// Aceita com ou sem dois-pontos, em qualquer caixa.
const impressao = bruto.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
if (impressao.length !== 64) {
  console.error(`SHA-256 inválido: ${impressao.length / 2} bytes, esperado 32.`);
  console.error('Confira se copiou a linha SHA256 inteira (e não a SHA1).');
  process.exit(1);
}
const formatada = impressao.match(/.{2}/g).join(':');

const conteudo = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: pacote,
      sha256_cert_fingerprints: [formatada],
    },
  },
];

const destino = join(AQUI, '..', 'public', '.well-known');
mkdirSync(destino, { recursive: true });
const arquivo = join(destino, 'assetlinks.json');
writeFileSync(arquivo, JSON.stringify(conteudo, null, 2) + '\n');

console.log(`pacote:     ${pacote}`);
console.log(`impressão:  ${formatada.slice(0, 29)}…`);
console.log(`\nescrito em ${arquivo}`);
console.log('\nRode `npm run build` e publique. Depois confirme que isto responde:');
console.log('  https://<seu-domínio>/.well-known/assetlinks.json');
