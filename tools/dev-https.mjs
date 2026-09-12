// `HTTPS=1 vite` não funciona no cmd.exe, então a variável é setada aqui.
import { spawn } from 'node:child_process';

spawn('npx', ['vite', '--host'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, HTTPS: '1' },
}).on('exit', (codigo) => process.exit(codigo ?? 0));
