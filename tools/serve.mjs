// Servidor estático mínimo, sem TLS — só para testes locais headless.
// Para jogar no Quest use `npm run dev` (HTTPS), não este.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  const pedido = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const arquivo = join(raiz, normalize(pedido === '/' ? '/index.html' : pedido));

  // Não serve nada fora de dist/.
  if (!arquivo.startsWith(raiz)) {
    res.writeHead(403).end('fora do diretorio');
    return;
  }

  try {
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(dados);
  } catch {
    res.writeHead(404).end('nao encontrado');
  }
}).listen(5200, () => console.log('servindo dist/ em http://localhost:5200'));
