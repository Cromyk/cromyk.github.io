/**
 * Gera os ícones do app em PNG, sem nenhuma dependência: os pixels são
 * calculados aqui e o PNG é montado à mão (IHDR + IDAT deflate + IEND).
 *
 * Mesma regra do resto do projeto — nada de asset binário no repositório.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '..', 'public', 'icons');

// ---------------------------------------------------------------- PNG

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/** rgba: Uint8Array com 4 bytes por pixel. */
function png(largura, altura, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  // 10, 11, 12 = compressão, filtro e entrelaçamento padrão (0)

  // Cada linha é precedida do byte de filtro 0 (sem filtro).
  const bruto = Buffer.alloc(altura * (largura * 4 + 1));
  for (let y = 0; y < altura; y++) {
    const destino = y * (largura * 4 + 1);
    bruto[destino] = 0;
    Buffer.from(rgba.buffer, y * largura * 4, largura * 4).copy(bruto, destino + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(bruto, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- desenho

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
const suave = (borda0, borda1, x) => {
  const t = limitar((x - borda0) / (borda1 - borda0), 0, 1);
  return t * t * (3 - 2 * t);
};
const misturar = (a, b, t) => a + (b - a) * t;

/**
 * Corpo em forma de gota: elipse que afunila para cima.
 * Devolve a distância assinada aproximada (negativa dentro).
 */
function distanciaGota(x, y, raio) {
  const afunila = 1 - Math.pow(limitar(y * 0.5 + 0.5, 0, 1), 2.2) * 0.42;
  return Math.hypot(x / afunila, y * 0.86) - raio;
}

/** Cápsula que afina da base para a ponta — a orelha. */
function distanciaOrelha(x, y, baseX, baseY, pontaX, pontaY, raioBase, raioPonta) {
  const dx = pontaX - baseX;
  const dy = pontaY - baseY;
  const comprimento = dx * dx + dy * dy;
  const t = limitar(((x - baseX) * dx + (y - baseY) * dy) / comprimento, 0, 1);
  const proj = Math.hypot(x - (baseX + dx * t), y - (baseY + dy * t));
  return proj - misturar(raioBase, raioPonta, t);
}

/** Silhueta inteira: corpo e orelhas unidos, para virar uma forma só. */
function distanciaCriatura(x, y) {
  let d = distanciaGota(x, y + 0.12, 0.62);
  for (const lado of [-1, 1]) {
    d = Math.min(
      d,
      distanciaOrelha(x, y, lado * 0.3, 0.36, lado * 0.46, 0.78, 0.13, 0.015),
    );
  }
  return d;
}

/**
 * @param tamanho  lado do ícone em pixels
 * @param recheio  quanto da arte ocupa o quadro (0.78 normal, 0.58 maskable)
 */
function desenhar(tamanho, recheio) {
  const rgba = new Uint8Array(tamanho * tamanho * 4);
  const escala = 2 / (tamanho * recheio);

  for (let py = 0; py < tamanho; py++) {
    for (let px = 0; px < tamanho; px++) {
      // Coordenadas de -1 a 1, com y para cima.
      const x = (px - tamanho / 2) * escala;
      const y = -(py - tamanho / 2) * escala;
      const distCentro = Math.hypot(x, y);

      // --- fundo: azul bem escuro clareando de cima para baixo ---
      let r = misturar(13, 26, suave(-1.2, 1.2, -y));
      let g = misturar(18, 36, suave(-1.2, 1.2, -y));
      let b = misturar(32, 64, suave(-1.2, 1.2, -y));

      // --- halo atrás da criatura ---
      const halo = Math.exp(-Math.pow(distCentro * 1.5, 2)) * 0.55;
      r += 40 * halo;
      g += 150 * halo;
      b += 190 * halo;

      // --- corpo ---
      const corpo = distanciaCriatura(x, y);
      const dentroCorpo = 1 - suave(-0.02, 0.02, corpo);
      if (dentroCorpo > 0) {
        // Luz vinda de cima à esquerda, para o corpo não ficar chapado.
        const luz = limitar(0.55 + (-x * 0.35 + y * 0.5), 0.25, 1.25);
        const cr = limitar(90 * luz, 0, 255);
        const cg = limitar(215 * luz, 0, 255);
        const cb = limitar(200 * luz, 0, 255);
        r = misturar(r, cr, dentroCorpo);
        g = misturar(g, cg, dentroCorpo);
        b = misturar(b, cb, dentroCorpo);
      }

      // --- olhos: esclera clara com pupila escura e um brilho ---
      for (const lado of [-1, 1]) {
        const ox = x - lado * 0.2;
        const oy = y - 0.12;
        const esclera = 1 - suave(0.115, 0.135, Math.hypot(ox, oy * 1.05));
        if (esclera > 0) {
          r = misturar(r, 250, esclera);
          g = misturar(g, 252, esclera);
          b = misturar(b, 255, esclera);
        }
        const pupila = 1 - suave(0.055, 0.07, Math.hypot(ox - lado * 0.015, oy - 0.01));
        if (pupila > 0) {
          r = misturar(r, 18, pupila);
          g = misturar(g, 22, pupila);
          b = misturar(b, 34, pupila);
        }
        const brilho = 1 - suave(0.018, 0.03, Math.hypot(ox - lado * 0.04, oy + 0.035));
        if (brilho > 0) {
          r = misturar(r, 255, brilho);
          g = misturar(g, 255, brilho);
          b = misturar(b, 255, brilho);
        }
      }

      const i = (py * tamanho + px) * 4;
      rgba[i] = limitar(Math.round(r), 0, 255);
      rgba[i + 1] = limitar(Math.round(g), 0, 255);
      rgba[i + 2] = limitar(Math.round(b), 0, 255);
      rgba[i + 3] = 255; // opaco: o launcher do Quest aplica a própria máscara
    }
  }
  return rgba;
}

// ---------------------------------------------------------------- saída

mkdirSync(SAIDA, { recursive: true });

const ICONES = [
  { arquivo: 'icon-192.png', tamanho: 192, recheio: 0.78 },
  { arquivo: 'icon-512.png', tamanho: 512, recheio: 0.78 },
  // Maskable: a arte fica na zona segura central, porque o sistema corta as bordas.
  { arquivo: 'icon-maskable-512.png', tamanho: 512, recheio: 0.56 },
];

for (const { arquivo, tamanho, recheio } of ICONES) {
  const dados = png(tamanho, tamanho, desenhar(tamanho, recheio));
  writeFileSync(join(SAIDA, arquivo), dados);
  console.log(`${arquivo.padEnd(24)} ${tamanho}×${tamanho}  ${(dados.length / 1024).toFixed(1)} kB`);
}

console.log(`\nícones em ${SAIDA}`);
