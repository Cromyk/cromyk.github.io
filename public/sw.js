/**
 * Service worker: exigido para a PWA ser instalável, e útil de verdade no
 * headset — depois da primeira abertura o jogo carrega sem rede.
 *
 * Estratégia: network-first para o HTML (para o jogo atualizar sozinho quando
 * você publica uma versão nova) e cache-first para o resto, que tem hash no
 * nome e portanto nunca muda de conteúdo.
 */
const CACHE = 'critter-quest-v1';

self.addEventListener('install', (evento) => {
  // Assume o controle já na primeira carga, sem esperar um recarregamento.
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest'])).catch(() => {
      // Uma falha aqui não deve impedir a instalação do worker.
    }),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return; // não mexe em recurso de terceiros

  const ehNavegacao = pedido.mode === 'navigate';

  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (ehNavegacao) {
        try {
          const resposta = await fetch(pedido);
          cache.put(pedido, resposta.clone());
          return resposta;
        } catch {
          // Sem rede: serve a última versão que passou por aqui.
          return (await cache.match(pedido)) ?? (await cache.match('./')) ?? Response.error();
        }
      }

      const guardado = await cache.match(pedido);
      if (guardado) return guardado;

      try {
        const resposta = await fetch(pedido);
        if (resposta.ok) cache.put(pedido, resposta.clone());
        return resposta;
      } catch {
        return Response.error();
      }
    })(),
  );
});
