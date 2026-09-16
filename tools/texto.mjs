/**
 * Letras de 3×5 para os rótulos das folhas de conferência.
 *
 * É feio e é de propósito: puxar uma fonte para escrever nove palavras numa
 * folha de diagnóstico seria uma dependência a mais para manter, e o rótulo só
 * precisa ser lido, não admirado.
 *
 * Mora num arquivo próprio porque há mais de uma folha — a das poses e a das
 * mãos — e duas cópias do mesmo alfabeto seria a segunda ficar sem as letras
 * que a primeira ganhasse.
 */

const GLIFOS = {
  A: '11111101111101101', B: '11011010111011011110'.slice(0, 15), C: '011101100100101011',
  a: '000011101101111', b: '100110101101110', c: '000011100100011',
  d: '001011101101111', e: '011101110100011', f: '011010111010010',
  g: '011101111001110', h: '100100110101101', i: '010000010010010',
  j: '001000001101010', k: '100101110101101', l: '110010010010111',
  m: '000110111101101', n: '000110101101101', o: '000010101101010',
  p: '000110101110100', q: '000011101011001', r: '000011100100100',
  s: '011100010001110', t: '010111010010011', u: '000101101101011',
  v: '000101101101010', w: '000101101111101', x: '000101010010101',
  y: '000101101011110', z: '000111001010111', é: '011101110100011',
  ' ': '000000000000000', '·': '000000010000000', '-': '000000111000000',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001001010010', '8': '111101111101111',
  '9': '111101111001111',
};

/** Escreve `texto` no bitmap RGBA, em pixels, com a cor dada. */
export function escrever(rgba, largura, texto, x0, y0, escala, cor) {
  let x = x0;
  for (const letra of texto) {
    const glifo = GLIFOS[letra] ?? GLIFOS[letra.toLowerCase()] ?? GLIFOS[' '];
    for (let lin = 0; lin < 5; lin++) {
      for (let col = 0; col < 3; col++) {
        if (glifo[lin * 3 + col] !== '1') continue;
        for (let py = 0; py < escala; py++) {
          for (let px = 0; px < escala; px++) {
            const i = ((y0 + lin * escala + py) * largura + (x + col * escala + px)) * 4;
            if (i < 0 || i + 2 >= rgba.length) continue;
            rgba[i] = cor[0];
            rgba[i + 1] = cor[1];
            rgba[i + 2] = cor[2];
          }
        }
      }
    }
    x += escala * 4;
  }
}
