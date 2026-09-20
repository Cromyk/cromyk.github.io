/**
 * A régua de nome de osso, para as FERRAMENTAS.
 *
 * É um espelho de `normalizar` em src/rig.ts, e existe porque os diagnósticos
 * (`diag-rig.mjs`, `diag-partes.mjs`, `diag-ossos.mjs`) são `.mjs` e o jogo é
 * TypeScript: eles não importam o módulo do jogo. Cada um tinha a própria
 * cópia, e as cópias envelheceram — foi exatamente isso que fez o censo
 * continuar dando "Mewtwo sem perna" depois de o `Rig` já ter aprendido a
 * segunda convenção de nomes.
 *
 * Uma cópia só, e o teste 71 do smoke afirma que ela e a do jogo concordam em
 * cima de nomes reais dos arquivos. Duplicação que um teste vigia é
 * duplicação que não mente.
 */
export function normalizar(nome) {
  const semPilha = nome.slice(nome.lastIndexOf('|') + 1);
  return semPilha
    .replace(/_\d+$/, '')
    .replace(/^left_/i, 'l')
    .replace(/^right_/i, 'r')
    .replace(/_0*(\d+)/g, '$1')
    .replace(/_/g, '')
    .replace(/^\d+/, '')
    .replace(/[\s.:-]/g, '')
    .toLowerCase();
}
