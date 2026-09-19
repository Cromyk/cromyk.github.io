/**
 * Onde está o fogo num modelo que não tem osso nenhum.
 *
 * ## Por que isto existe
 *
 * A chama do jogo entra como FILHA de um osso da cauda (ver src/fogo.ts), e
 * isso resolve de graça o problema de ela acompanhar a animação. Só que **nem
 * todo rip tem esqueleto**: `node tools/diag-fogo.mjs ponyta` devolve uma lista
 * vazia, e o mesmo vale para Magmar. Sem osso não há onde pendurar, e por isso
 * os dois Pokémon de fogo mais óbvios depois dos Charmanders estavam sem chama.
 *
 * A alternativa é um ponto fixo no corpo — e o comentário que deixou os dois de
 * fora dizia, com razão, que escolher esse ponto de memória é palpite: erra e a
 * chama sai do pescoço do cavalo. Então aqui ele não é escolhido, é **medido**.
 *
 * ## Como se mede fogo
 *
 * Os rips trazem a FORMA do fogo: uma malha em bico, pintada de laranja, parada
 * no lugar certo. Essa tinta é o dado. Para cada vértice, esta ferramenta
 * amostra a cor da textura no UV dele e pergunta se aquilo é brasa — claro,
 * saturado, vermelho maior que verde maior que azul. Os vértices que passam são
 * agrupados por proximidade, e cada aglomerado vira um candidato a chama, com o
 * centroide em FRAÇÃO DA ALTURA do bicho, que é a unidade em que o jogo
 * trabalha.
 *
 * É o mesmo método que já acertou a orientação de 71 dos 74 modelos pelo
 * centroide dos materiais de olho (ver tools/modelos.mjs): perguntar ao arquivo
 * em vez de adivinhar.
 *
 *   node tools/brasa.mjs ponyta magmar rapidash
 *
 * O que ela imprime vai à mão para a tabela de src/fogo.ts — com a folha de
 * contato aberta para conferir, que é o que o comentário de lá pede.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { multiplicarMat, aplicar, IDENTIDADE } from './pose.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(join(raiz, 'src', 'modelos.gen.ts'), 'utf8');
const MEDIDAS = JSON.parse(
  fonte.slice(fonte.indexOf('{', fonte.indexOf('MEDIDAS')), fonte.lastIndexOf('}') + 1),
);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS.filter((e) => e !== EXTMeshoptCompression))
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

/**
 * O material se declara fogo?
 *
 * Esta é a régua BOA, e ela só apareceu quando a ferramenta imprimiu a lista
 * de materiais: os rips NOMEIAM a chama. Magmar tem `FireCoreA_mat` e
 * `FireStenA_mat`, Rapidash tem `FireCoreA` e `FireStenA` — o núcleo e o
 * estêncil da mesma chama. Perguntar o nome é mais barato e muito mais
 * preciso do que adivinhar pela cor.
 *
 * Ponyta é a exceção que obriga a segunda régua a existir: a chama dele mora
 * num material chamado `Hair`, que em qualquer outro bicho seria pelo. Para
 * esses, `--material=Hair`.
 */
const NOME_DE_FOGO = /fire|flame|fuego|llama|chama/i;

/**
 * Isto é brasa, pela COR?
 *
 * A reserva, para quem não nomeia. Três testes, e os três precisam passar:
 * claro o bastante para ser luz e não couro escuro; vermelho acima de verde
 * acima de azul, que é a assinatura de laranja e amarelo; e uma diferença
 * grande entre o vermelho e o azul, que é o que separa fogo de qualquer bege.
 *
 * Ela sozinha não serve num bicho que É laranja: no Magmar, dois terços dos
 * vértices passam neste teste, porque o Magmar inteiro tem a cor do fogo.
 */
function ehBrasa(r, g, b) {
  const claro = (r + g + b) / 3 > 90;
  const quente = r > g && g >= b;
  const saturado = r - b > 90;
  return claro && quente && saturado;
}

/** A textura base de um material, decodificada uma vez por material. */
async function pixelsDe(material, cache) {
  if (!material) return null;
  const nome = material.getName() ?? 'sem-nome';
  if (cache.has(nome)) return cache.get(nome);

  const textura = material.getBaseColorTexture?.();
  const imagem = textura?.getImage?.();
  if (!imagem) {
    cache.set(nome, null);
    return null;
  }
  try {
    const img = await loadImage(Buffer.from(imagem));
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, img.width, img.height);
    const saida = { largura: img.width, altura: img.height, dados: dados.data };
    cache.set(nome, saida);
    return saida;
  } catch (erro) {
    console.warn(`  textura de ${nome} não decodificou: ${erro.message}`);
    cache.set(nome, null);
    return null;
  }
}

function amostrar(px, u, v) {
  // UV fora de [0,1] se repete: é o que o sampler faz por padrão.
  const x = Math.min(px.largura - 1, Math.max(0, Math.floor(((u % 1) + 1) % 1 * px.largura)));
  const y = Math.min(px.altura - 1, Math.max(0, Math.floor((1 - (((v % 1) + 1) % 1)) * px.altura)));
  const i = (y * px.largura + x) * 4;
  return [px.dados[i], px.dados[i + 1], px.dados[i + 2], px.dados[i + 3]];
}

/**
 * Junta os pontos quentes em aglomerados.
 *
 * Um passe guloso com raio fixo, e não k-means: o número de chamas não se sabe
 * de antemão (o Ponyta tem crina, cauda e quatro cascos), e k-means exigiria
 * chutar esse número — que é justamente o que esta ferramenta existe para não
 * fazer. O raio é dado em fração da altura, então ele quer dizer a mesma coisa
 * num Magmar e num Rapidash.
 */
function aglomerar(pontos, raio) {
  const grupos = [];
  for (const p of pontos) {
    let achou = null;
    for (const g of grupos) {
      const dx = p[0] - g.soma[0] / g.n;
      const dy = p[1] - g.soma[1] / g.n;
      const dz = p[2] - g.soma[2] / g.n;
      if (Math.hypot(dx, dy, dz) <= raio) {
        achou = g;
        break;
      }
    }
    if (!achou) {
      achou = { soma: [0, 0, 0], n: 0, min: [...p], max: [...p] };
      grupos.push(achou);
    }
    for (let k = 0; k < 3; k++) {
      achou.soma[k] += p[k];
      achou.min[k] = Math.min(achou.min[k], p[k]);
      achou.max[k] = Math.max(achou.max[k], p[k]);
    }
    achou.n++;
  }
  return grupos;
}

async function medir(id) {
  const m = MEDIDAS[id];
  if (!m) {
    console.log(`\n${id}: SEM MODELO`);
    return;
  }

  const doc = await io.read(join(raiz, 'public', 'pokemon', `${m.num}.glb`));
  const cena = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];

  const mundo = new Map();
  const anotar = (no, pai) => {
    const matriz = multiplicarMat(pai, no.getMatrix());
    mundo.set(no, matriz);
    for (const filho of no.listChildren()) anotar(filho, matriz);
  };
  for (const no of cena.listChildren()) anotar(no, IDENTIDADE);

  const cache = new Map();
  const quentes = [];
  /** Todos os vértices, para a silhueta da folha. */
  const silhueta = [];
  let total = 0;
  const porMaterial = new Map();

  // Primeiro: alguém neste modelo se declara fogo?
  //
  // Se sim, a cor sai de cena inteiramente — e isso não é otimização, é
  // correção. O Magmar tem `FireCoreA_mat` E é laranja da cabeça aos pés:
  // deixar as duas réguas valendo juntas afogaria as 534 posições certas em
  // 6.000 erradas. Quem nomeia manda.
  let algumDeclarado = false;
  for (const [no] of mundo) {
    const malha = no.getMesh?.();
    if (!malha) continue;
    for (const prim of malha.listPrimitives()) {
      const nome = prim.getMaterial()?.getName() ?? '';
      if (NOME_DE_FOGO.test(nome) || (pedidoDeMaterial?.test(nome) ?? false)) algumDeclarado = true;
    }
  }

  for (const [no, matriz] of mundo) {
    const malha = no.getMesh?.();
    if (!malha) continue;
    for (const prim of malha.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!pos) continue;
      const nomeMat = prim.getMaterial()?.getName() ?? 'sem-nome';
      const declarado = NOME_DE_FOGO.test(nomeMat) || (pedidoDeMaterial?.test(nomeMat) ?? false);
      // Só decodifica textura de quem vai precisar da reserva por cor.
      const px =
        declarado || (algumDeclarado && !declarado)
          ? null
          : await pixelsDe(prim.getMaterial(), cache);

      const p = [0, 0, 0];
      const t = [0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        total++;
        pos.getElement(i, p);
        const mundoP = aplicar(matriz, p);
        silhueta.push(mundoP);
        // Com alguém declarado no modelo, quem não é fogo simplesmente não é —
        // mas os vértices dele continuam entrando na silhueta, que é o corpo
        // contra o qual se confere a chama.
        if (algumDeclarado && !declarado) continue;
        if (!declarado) {
          if (!px || !uv) continue;
          uv.getElement(i, t);
          const [r, g, b, a] = amostrar(px, t[0], t[1]);
          if (a < 200 || !ehBrasa(r, g, b)) continue;
        }
        quentes.push(mundoP);
        porMaterial.set(nomeMat, (porMaterial.get(nomeMat) ?? 0) + 1);
      }
    }
  }

  const altura = m.alturaModelo || 1;
  console.log(`\n${id} (#${m.num}) — ${quentes.length} de ${total} vértices são chama`);
  if (quentes.length === 0) {
    console.log('  nada laranja na textura: ou a chama não é pintada, ou ela é escura');
    return;
  }
  for (const [nome, n] of [...porMaterial].sort((a, b) => b[1] - a[1])) {
    console.log(`  material ${nome}: ${n}`);
  }

  // Em fração da altura, com a origem no PÉ e no centro do corpo — que é como
  // src/modelos.ts normaliza o bicho antes de pôr na sala.
  const normal = quentes.map((p) => [
    (p[0] - m.centroX) / altura,
    (p[1] - m.baseY) / altura,
    (p[2] - m.centroZ) / altura,
  ]);

  const grupos = aglomerar(normal, 0.18)
    .filter((g) => g.n >= Math.max(8, quentes.length * 0.04))
    .sort((a, b) => b.n - a.n);

  console.log(
    `  ${grupos.length} aglomerado(s) — ${algumDeclarado ? 'pelo NOME do material' : 'pela COR da textura'}, ` +
      'em fração da altura (0 = pé, 1 = topo):',
  );
  for (const g of grupos) {
    const c = g.soma.map((s) => s / g.n);
    const tamanho = Math.max(...[0, 1, 2].map((k) => g.max[k] - g.min[k]));
    console.log(
      `    n=${String(g.n).padStart(4)}  centro x=${c[0].toFixed(3)} y=${c[1].toFixed(3)} z=${c[2].toFixed(3)}` +
        `  extensão ${tamanho.toFixed(3)}`,
    );
  }

  return {
    id,
    grupos,
    quentes: normal,
    silhueta: silhueta.map((p) => [
      (p[0] - m.centroX) / altura,
      (p[1] - m.baseY) / altura,
      (p[2] - m.centroZ) / altura,
    ]),
  };
}

/**
 * A folha de contato: o bicho de perfil, com as chamas marcadas.
 *
 * O comentário que deixou Ponyta e Magmar de fora pedia, textualmente, que
 * quando fossem feitos fosse "com a folha de contato aberta para conferir, não
 * de memória". Esta é a folha.
 *
 * Duas vistas por bicho — de lado (Z para a direita, Y para cima) e de frente —
 * com a silhueta em cinza, os vértices de chama em laranja e uma cruz no
 * centroide de cada aglomerado. É onde se vê, sem headset, que a crina do
 * Ponyta é a da frente e a cauda é a de trás, e não o contrário.
 */
async function desenharFolha(fichas) {
  const CELULA = 260;
  const MARGEM = 26;
  const largura = CELULA * 2;
  const altura = CELULA * fichas.length;
  const canvas = createCanvas(largura, altura + 24);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0e15';
  ctx.fillRect(0, 0, largura, altura + 24);

  const vistas = [
    { rotulo: 'de lado', eixo: (p) => [p[2], p[1]] },
    { rotulo: 'de frente', eixo: (p) => [p[0], p[1]] },
  ];

  fichas.forEach((ficha, linha) => {
    const y0 = linha * CELULA;
    ctx.fillStyle = '#7f8ba0';
    ctx.font = '13px monospace';
    ctx.fillText(ficha.id, 8, y0 + 16);

    vistas.forEach((vista, coluna) => {
      const x0 = coluna * CELULA;
      const escala = CELULA - MARGEM * 2;
      // Fração da altura → pixels, com o pé embaixo e o eixo 0 no meio.
      const px = (p) => {
        const [a, b] = vista.eixo(p);
        return [x0 + CELULA / 2 + a * escala, y0 + CELULA - MARGEM - b * escala];
      };

      ctx.fillStyle = 'rgba(180, 196, 220, 0.30)';
      for (let i = 0; i < ficha.silhueta.length; i += 3) {
        const [x, y] = px(ficha.silhueta[i]);
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.fillStyle = 'rgba(255, 150, 50, 0.65)';
      for (let i = 0; i < ficha.quentes.length; i += 2) {
        const [x, y] = px(ficha.quentes[i]);
        ctx.fillRect(x, y, 1, 1);
      }

      for (const g of ficha.grupos) {
        const c = g.soma.map((v) => v / g.n);
        const [x, y] = px(c);
        ctx.strokeStyle = '#7fe7c4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x + 7, y);
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x, y + 7);
        ctx.stroke();
        ctx.fillStyle = '#7fe7c4';
        ctx.font = '11px monospace';
        ctx.fillText(`${c[1].toFixed(2)},${c[2].toFixed(2)}`, x + 9, y - 3);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, CELULA - 1, CELULA - 1);
      ctx.fillStyle = '#4c566a';
      ctx.font = '11px monospace';
      ctx.fillText(vista.rotulo, x0 + 8, y0 + CELULA - 8);
    });
  });

  const destino = join(raiz, 'folha-fogo.png');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(destino, canvas.toBuffer('image/png'));
  console.log(`\n${fichas.length} bicho(s) → ${destino}`);
  console.log('Cinza é o corpo, laranja é chama, a cruz é onde a âncora vai.');
}

const argumentos = process.argv.slice(2);
// `--material=Hair` para o caso em que a chama não se chama fogo.
const filtro = argumentos.find((a) => a.startsWith('--material='));
const pedidoDeMaterial = filtro ? new RegExp(filtro.slice('--material='.length), 'i') : null;
const pedidos = argumentos.filter((a) => !a.startsWith('--'));
if (pedidos.length === 0) {
  console.error('uso: node tools/brasa.mjs [--material=Hair] <id> [id...]');
  process.exit(1);
}
const fichas = [];
for (const id of pedidos) {
  const ficha = await medir(id);
  if (ficha) fichas.push(ficha);
}
if (fichas.length) await desenharFolha(fichas);
