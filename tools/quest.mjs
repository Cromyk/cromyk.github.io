/**
 * Liga o Quest ao dev server por cabo (ou Wi-Fi ADB).
 *
 * `adb reverse` faz a porta 5173 do headset apontar para a 5173 desta máquina,
 * então o navegador do Quest abre http://localhost:5173 — que conta como
 * contexto seguro e libera o WebXR sem nenhum certificado.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CANDIDATOS = [
  join(homedir(), 'Apps', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  join(homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe') : '',
  'adb',
].filter(Boolean);

const adb = CANDIDATOS.find((c) => c === 'adb' || existsSync(c)) ?? 'adb';
const rodar = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();

try {
  const dispositivos = rodar('devices')
    .split('\n')
    .slice(1)
    .filter((l) => l.trim() && !l.includes('offline'));

  if (dispositivos.length === 0) {
    console.error('Nenhum headset conectado.\n');
    console.error('  1. ligue o Quest e conecte o cabo USB');
    console.error('  2. ponha o headset e aceite "Permitir depuração USB"');
    console.error('  3. rode de novo\n');
    console.error(`(adb usado: ${adb})`);
    process.exit(1);
  }

  console.log(`headset: ${dispositivos[0].split(/\s+/)[0]}`);
  rodar('reverse', 'tcp:5173', 'tcp:5173');
  console.log('porta 5173 encaminhada\n');
  console.log('Agora, no Quest:');
  console.log('  abra o navegador e vá em  http://localhost:5173');
  console.log('  toque em "entrar em realidade mista"\n');
  console.log('Deixe o `npm run dev` rodando em outro terminal.');
} catch (erro) {
  console.error(`Falhou ao falar com o adb (${adb}):`, erro.message);
  process.exit(1);
}
