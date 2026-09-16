/**
 * Folha de contato dos PAINÉIS: cada superfície de interface do jogo, desenhada
 * no tamanho em que ela é lida, num PNG só.
 *
 * Existe pelo mesmo motivo que tools/folha.mjs e tools/poses.ts: há coisas que
 * nenhum teste pega. Um contraste ruim, um texto que transborda o card, duas
 * fontes que deviam ser a mesma, uma barra que some no fundo — tudo isso passa
 * por `tsc` e pelo smoke sem um pio, e só aparece com o headset na cabeça.
 *
 * Os painéis são canvas 2D, e é isso que torna esta folha possível: o `Placa`
 * de src/hud.ts pede um canvas ao `document`, e aqui o `document` é um de
 * mentira que devolve um canvas do @napi-rs/canvas. O código de desenho é o
 * MESMO que roda no headset — se a imagem sair feia, é o jogo que está feio.
 *
 *   npm run paineis
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, type Canvas } from '@napi-rs/canvas';

// O document de mentira precisa existir ANTES de qualquer painel ser construído.
(globalThis as unknown as { document: unknown }).document = {
  createElement(tag: string) {
    if (tag !== 'canvas') throw new Error(`o document de mentira só faz canvas, pediram ${tag}`);
    return createCanvas(1, 1);
  },
};

const [
  { BarraVida, Aviso },
  { PainelTime },
  { PainelPc },
  { PainelDex },
  especies,
  { BOLAS },
  { ITENS },
  { DIFICULDADES, INTERRUPTORES },
  { Dex },
  { COR },
] = await Promise.all([
  import('../src/hud'),
  import('../src/menu'),
  import('../src/pc'),
  import('../src/dexpanel'),
  import('../src/species'),
  import('../src/balls'),
  import('../src/itens'),
  import('../src/ajustes'),
  import('../src/state'),
  import('../src/estilo'),
]);

const { ESPECIES, porId, statsNoNivel } = especies;

/**
 * Os painéis não expõem o desenho: quem redesenha é `atualizar`, e ele depende
 * de gesto de pulso, raycast e câmera. Reproduzir esse estado aqui seria
 * reimplementar meio jogo para tirar uma foto — então a folha chama os métodos
 * privados direto. É uma ferramenta de diagnóstico; o acordo é esse.
 */
type Espiado = Record<string, (...args: never[]) => unknown> & Record<string, unknown>;
const espiar = (x: unknown) => x as unknown as Espiado;

// --------------------------------------------------------------- dados falsos

const agora = Date.now();
const exemplar = (id: string, xp: number, hpFrac = 1, shiny = false) => {
  const e = porId(id)!;
  return {
    exemplar: { id, xp, hp: 1, shiny, capturadoEm: agora },
    especie: e,
    hp: Math.round(statsNoNivel(e, 18).hpMax * hpFrac),
    hpMax: statsNoNivel(e, 18).hpMax,
    nivel: 18,
    progresso: 0.42,
    shiny,
    emCampo: false,
  };
};

const time = [
  { ...exemplar('charmander', 4000, 0.62), emCampo: true, estagios: { ataque: 1, defesa: 0, velocidade: 2 } },
  exemplar('squirtle', 3800, 1),
  exemplar('bulbasaur', 3600, 0.18),
  exemplar('pikachu', 5200, 0.85, true),
  exemplar('eevee', 2400, 0),
  exemplar('gengar', 8000, 0.95),
];

const bolas = BOLAS.map((tipo, i) => ({ tipo, quantidade: [12, 4, 1, 0][i] ?? 0 }));
const itens = ITENS.map((tipo, i) => ({ tipo, quantidade: [3, 5, 0][i] ?? 0 }));
const golpes = porId('charmander')!.golpes.map((golpe, i) => ({ golpe, armado: i === 1 }));
const interruptores = INTERRUPTORES.map((c, i) => ({
  id: c.id,
  nome: c.nome,
  ligado: i !== 2,
  diz: i !== 2 ? c.ligadoDiz : c.desligadoDiz,
}));

// --------------------------------------------------------------- composição

interface Peca {
  canvas: Canvas;
  rotulo: string;
}

const secoes: Array<{ titulo: string; pecas: Peca[] }> = [];

// --- painel do pulso, página principal ---
{
  const painel = espiar(new PainelTime());
  painel.definirConteudo(
    time as never,
    bolas as never,
    itens as never,
    golpes as never,
    'batalha' as never,
    'normal' as never,
    interruptores as never,
  );
  painel.redesenharTitulo(84 as never, 31 as never, 151 as never);
  painel.redesenhar('comum' as never);

  const pecas: Peca[] = [
    { canvas: (painel.titulo as { canvas: Canvas }).canvas, rotulo: 'título' },
    { canvas: (painel.cardEngrenagem as { canvas: Canvas }).canvas, rotulo: 'engrenagem' },
    { canvas: (painel.cardPc as { canvas: Canvas }).canvas, rotulo: 'PC' },
  ];
  for (const [nome, lista] of [
    ['time', painel.cards],
    ['bolas', painel.cardsBola],
    ['itens', painel.cardsItem],
    ['golpes', painel.cardsGolpe],
  ] as Array<[string, Array<{ canvas: Canvas }>]>) {
    lista.forEach((c, i) => pecas.push({ canvas: c.canvas, rotulo: `${nome} ${i + 1}` }));
  }
  secoes.push({ titulo: 'painel do pulso', pecas });
}

// --- painel do pulso, página de ajustes ---
{
  const painel = espiar(new PainelTime());
  painel.definirConteudo(
    time as never,
    bolas as never,
    itens as never,
    golpes as never,
    'safari' as never,
    'tranquilo' as never,
    interruptores as never,
  );
  painel.alternarAjustes();
  painel.redesenharTitulo(84 as never, 31 as never, 151 as never);
  painel.redesenhar('comum' as never);

  const pecas: Peca[] = [
    { canvas: (painel.titulo as { canvas: Canvas }).canvas, rotulo: 'título' },
    { canvas: (painel.cardEngrenagem as { canvas: Canvas }).canvas, rotulo: 'engrenagem' },
  ];
  for (const [nome, lista] of [
    ['modo', painel.cardsModo],
    ['dificuldade', painel.cardsDificuldade],
    ['chave', painel.cardsChave],
  ] as Array<[string, Array<{ canvas: Canvas }>]>) {
    lista.forEach((c, i) => pecas.push({ canvas: c.canvas, rotulo: `${nome} ${i + 1}` }));
  }
  secoes.push({ titulo: 'ajustes (a engrenagem)', pecas });
}

// --- barras de vida, com e sem carga ---
{
  const camera = new (await import('three')).PerspectiveCamera();
  const posicao = new (await import('three')).Vector3();
  const pecas: Peca[] = [];

  const barraDe = (
    id: string,
    hpFrac: number,
    rotulo: string,
    carga: { fracao: number; golpe: string; cor: number; iminente: boolean } | null,
    legenda: string,
  ) => {
    const e = porId(id)!;
    const barra = new BarraVida(e.nome, e.tipos.map((t) => especies.TIPOS[t].nome).join(' · '), especies.TIPOS[e.tipo].cor);
    const hpMax = statsNoNivel(e, 20).hpMax;
    barra.atualizar(0.016, true, Math.round(hpMax * hpFrac), hpMax, posicao, e.altura, camera, rotulo, carga);
    pecas.push({ canvas: espiar(barra.placa).canvas as Canvas, rotulo: legenda });
  };

  barraDe('pidgey', 1, 'N14', null, 'sem briga');
  barraDe('rattata', 0.58, 'N16', {
    fracao: 0.35,
    golpe: 'Mordida',
    cor: especies.TIPOS.sombrio.cor,
    iminente: false,
  }, 'carregando');
  barraDe('arcanine', 0.34, 'N22', {
    fracao: 0.93,
    golpe: 'Lança-Chamas',
    cor: especies.TIPOS.fogo.cor,
    iminente: true,
  }, 'iminente');
  barraDe('caterpie', 0, 'N9 · exausto', null, 'exausto');
  barraDe('charmander', 0.76, 'N18 · seu', null, 'o seu');
  secoes.push({ titulo: 'barra de vida e a carga do inimigo', pecas });
}

// --- PC ---
{
  const dex = new Dex();
  dex.limpar();
  dex.receberInicial('charmander', 18);
  for (const id of ['squirtle', 'bulbasaur', 'pikachu', 'eevee', 'gengar', 'onix', 'lapras', 'snorlax', 'magikarp']) {
    dex.registrarCaptura(id, 12, 16, id === 'pikachu');
  }
  const pc = espiar(new PainelPc());
  pc.definirDex(dex as never);
  (pc as unknown as { pegou: number }).pegou = 2;
  pc.desenhar();
  secoes.push({
    titulo: 'PC do treinador',
    pecas: [{ canvas: (pc.placa as { canvas: Canvas }).canvas, rotulo: 'equipe e caixa' }],
  });
}

// --- Pokédex ---
{
  const painel = espiar(new PainelDex());
  const estados = new Map<string, { visto: boolean; capturado: boolean; viuShiny: boolean }>();
  ESPECIES.forEach((e, i) => {
    estados.set(e.id, { visto: i % 3 !== 0, capturado: i % 5 === 0, viuShiny: i % 17 === 0 });
  });
  painel.definirEstados(estados as never);
  painel.desenharGrade();
  const pecas: Peca[] = [{ canvas: (painel.grade as { canvas: Canvas }).canvas, rotulo: 'grade' }];
  if (typeof painel.desenharFicha === 'function') {
    (painel as unknown as { destacado: number }).destacado = 3;
    painel.desenharFicha();
    pecas.push({ canvas: (painel.ficha as { canvas: Canvas }).canvas, rotulo: 'ficha' });
  }
  secoes.push({ titulo: 'Pokédex', pecas });
}

// --- o mapeamento de boas-vindas ---
//
// As três telas da abertura, lado a lado. É a conferência que importa aqui:
// o aviso é a placa mais estreita do jogo, e frase comprida nele não estoura —
// o canvas ESPREME a linha para caber, que é pior, porque passa despercebido
// no código e só aparece como texto achatado no headset.
{
  const cenaFalsa = { add() {}, remove() {} } as never;
  const telas: Array<[string, unknown[]]> = [
    [
      'sem nada ainda',
      [
        { texto: 'Procurando o seu quarto', tamanho: 38, cor: '#cfe6ff' },
        { texto: 'olhe em volta e dê alguns passos', tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
    ],
    [
      'mapeando',
      [
        { texto: 'Mapeando o seu quarto', tamanho: 38, cor: '#cfe6ff' },
        {
          texto: 'ande pelo cômodo — o contorno é o que já entrou',
          tamanho: 22,
          cor: '#9aa5b8',
          peso: 500,
        },
        { texto: '4 superfícies', tamanho: 30, cor: '#7fd6a8', peso: 700 },
      ],
    ],
    [
      'pronta',
      [
        { texto: 'Sala pronta', tamanho: 40, cor: '#7fe7c4' },
        { texto: '11 superfícies mapeadas', tamanho: 26, cor: '#7fd6a8', peso: 700 },
        { texto: 'e o mapa cresce enquanto você anda', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
    ],
  ];

  const pecas: Peca[] = telas.map(([rotulo, linhas]) => {
    const aviso = espiar(new Aviso(cenaFalsa));
    aviso.fixar(linhas as never);
    return { canvas: (aviso.placa as { canvas: Canvas }).canvas, rotulo };
  });
  secoes.push({ titulo: 'mapeamento da sala', pecas });
}

// --------------------------------------------------------------- desenho

const MARGEM = 26;
const VAO = 18;
const TITULO = 44;
const LEGENDA = 24;
const LARGURA = 1700;

/** Uma linha de peças, quebrando quando não cabe. */
function medir(pecas: Peca[], largura: number) {
  const linhas: Peca[][] = [];
  let atual: Peca[] = [];
  let x = 0;
  for (const p of pecas) {
    const l = Math.min(p.canvas.width, largura - MARGEM * 2);
    if (atual.length && x + l > largura - MARGEM * 2) {
      linhas.push(atual);
      atual = [];
      x = 0;
    }
    atual.push(p);
    x += l + VAO;
  }
  if (atual.length) linhas.push(atual);
  return linhas;
}

let altura = MARGEM;
const plano: Array<{ titulo: string; linhas: Peca[][]; y: number }> = [];
for (const secao of secoes) {
  const linhas = medir(secao.pecas, LARGURA);
  plano.push({ titulo: secao.titulo, linhas, y: altura });
  altura += TITULO;
  for (const linha of linhas) {
    altura += Math.max(...linha.map((p) => p.canvas.height)) + LEGENDA + VAO;
  }
  altura += VAO;
}
altura += MARGEM;

const folha = createCanvas(LARGURA, altura);
const ctx = folha.getContext('2d');

// Um fundo cinza-médio de propósito: os painéis são translúcidos em cima do
// SEU quarto, e conferi-los sobre preto esconde exatamente o problema de
// contraste que esta folha existe para encontrar.
ctx.fillStyle = '#4a4f58';
ctx.fillRect(0, 0, LARGURA, altura);
for (let y = 0; y < altura; y += 44) {
  for (let x = 0; x < LARGURA; x += 44) {
    if (((x / 44 + y / 44) | 0) % 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, 44, 44);
  }
}

for (const secao of plano) {
  let y = secao.y;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '700 28px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(secao.titulo, MARGEM, y + 6);
  y += TITULO;

  for (const linha of secao.linhas) {
    const alturaLinha = Math.max(...linha.map((p) => p.canvas.height));
    let x = MARGEM;
    for (const peca of linha) {
      ctx.drawImage(peca.canvas, x, y + (alturaLinha - peca.canvas.height) / 2);
      ctx.font = '600 15px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(peca.rotulo, x, y + alturaLinha + 4);
      x += peca.canvas.width + VAO;
    }
    y += alturaLinha + LEGENDA + VAO;
  }
}

const destino = join(process.cwd(), 'folha-paineis.png');
writeFileSync(destino, folha.toBuffer('image/png'));
console.log(`\n${secoes.length} seções → ${destino}`);
console.log('Fundo xadrez de propósito: é onde se vê se o painel fica legível sobre o seu quarto.');
void COR;
