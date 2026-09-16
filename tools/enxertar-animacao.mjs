/**
 * Enxerta os clipes de um GLB exportado pelo Blender dentro do GLB ORIGINAL,
 * sem reexportar malha, material nem textura.
 *
 * Por que não deixar o Blender regravar o arquivo inteiro: ele reescreve a
 * malha e a textura, e o Charmander saiu 3× maior e em T-pose. Aqui só a
 * animação entra; o resto do arquivo é byte a byte o que veio da fonte.
 *
 * Canais CONSTANTES são descartados quando repetem o que o nó do arquivo já
 * diz — é o caso da escala 2,54 que os rips trazem nas raízes, que virava
 * curva e estourava o tamanho do bicho em cima da normalização do jogo.
 *
 *   node tools/enxertar-animacao.mjs <com-animacao.glb> <original.glb> <saida.glb>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';

const [origemPath, alvoPath, saidaPath] = process.argv.slice(2);
if (!saidaPath) {
  console.error('uso: node tools/enxertar-animacao.mjs <com-animacao.glb> <original.glb> <saida.glb>');
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const origem = await io.read(origemPath);
const alvo = await io.read(alvoPath);
const nosAlvo = new Map(alvo.getRoot().listNodes().map((n) => [n.getName(), n]));

/** Um quatérnio e o seu oposto descrevem a mesma rotação: q e −q não divergem. */
const mesmaRotacao = (a, b) =>
  a.every((v, i) => Math.abs(v - b[i]) < 1e-3) || a.every((v, i) => Math.abs(v + b[i]) < 1e-3);

let divergentes = 0;
for (const no of origem.getRoot().listNodes()) {
  const par = nosAlvo.get(no.getName());
  if (!par || !par.getSkin?.() === undefined) { /* nada */ }
  if (!par) continue;
  const t = no.getTranslation(), tp = par.getTranslation();
  if (!t.every((v, i) => Math.abs(v - tp[i]) < 1e-4) || !mesmaRotacao(no.getRotation(), par.getRotation())) {
    divergentes++;
  }
}
if (divergentes > 2) {
  console.warn(`aviso: ${divergentes} nós têm repouso diferente entre os dois arquivos — as curvas podem não servir`);
}

for (const velha of alvo.getRoot().listAnimations()) velha.dispose();

const buffer = alvo.getRoot().listBuffers()[0];
const resumo = [];
const discordantes = [];

for (const anim of origem.getRoot().listAnimations()) {
  const nova = alvo.createAnimation(anim.getName());
  const cacheEntrada = new Map();
  let feitos = 0, constantes = 0, semNo = 0;

  for (const ch of anim.listChannels()) {
    const caminho = ch.getTargetPath();
    const alvoNo = nosAlvo.get(ch.getTargetNode().getName());
    if (!alvoNo) { semNo++; continue; }

    const amostrador = ch.getSampler();
    const entrada = amostrador.getInput().getArray();
    const saida = amostrador.getOutput().getArray();
    const largura = caminho === 'rotation' ? 4 : 3;

    // Constante? Então ela só repete o repouso — e regravá-la é o que fazia
    // a escala 2,54 do rip virar curva.
    let constante = true;
    for (let i = largura; i < saida.length && constante; i++) {
      if (Math.abs(saida[i] - saida[i % largura]) > 1e-5) constante = false;
    }
    // Escala de osso nunca entra: quem manda é a do arquivo. Os rips trazem
    // 2,54 nas raízes (polegada→cm) e o Blender devolve 1,0 na curva — gravar
    // isso encolhe o bicho inteiro assim que o clipe começa a tocar.
    if (caminho === 'scale') {
      const atual = alvoNo.getScale();
      const primeiro = Array.from(saida.slice(0, largura));
      if (!primeiro.every((v, i) => Math.abs(v - atual[i]) < 1e-4)) {
        discordantes.push(`${alvoNo.getName()}.scale`);
      }
      constantes++;
      continue;
    }

    // Constante e igual ao repouso: não anima nada e não muda nada. Fora.
    // Constante e DIFERENTE fica: é pose fixa de propósito, como o antebraço
    // dobrado que desfaz a T-pose do arquivo.
    if (constante) {
      const atual = caminho === 'rotation' ? alvoNo.getRotation() : alvoNo.getTranslation();
      const primeiro = Array.from(saida.slice(0, largura));
      const igual = caminho === 'rotation'
        ? mesmaRotacao(primeiro, atual)
        : primeiro.every((v, i) => Math.abs(v - atual[i]) < 1e-4);
      if (igual) { constantes++; continue; }
    }

    const chave = entrada.join(',');
    let accEntrada = cacheEntrada.get(chave);
    if (!accEntrada) {
      accEntrada = alvo.createAccessor().setArray(new Float32Array(entrada)).setType('SCALAR').setBuffer(buffer);
      cacheEntrada.set(chave, accEntrada);
    }
    const accSaida = alvo.createAccessor()
      .setArray(new Float32Array(saida))
      .setType(caminho === 'rotation' ? 'VEC4' : 'VEC3')
      .setBuffer(buffer);
    const novoAmostrador = alvo.createAnimationSampler()
      .setInput(accEntrada).setOutput(accSaida)
      .setInterpolation(amostrador.getInterpolation());
    nova.addSampler(novoAmostrador);
    nova.addChannel(alvo.createAnimationChannel().setTargetNode(alvoNo).setTargetPath(caminho).setSampler(novoAmostrador));
    feitos++;
  }
  resumo.push(`  ${anim.getName()}: ${feitos} canais (${constantes} constantes descartados${semNo ? `, ${semNo} sem nó` : ''})`);
}

await io.write(saidaPath, alvo);
console.log(`nós divergentes: ${divergentes}`);
console.log(resumo.join('\n'));
if (discordantes.length) {
  console.log('constantes que discordavam do original (ficaram com o valor do original):');
  console.log('  ' + discordantes.join(', '));
}
console.log('gravado em', saidaPath);
