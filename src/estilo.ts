import * as THREE from 'three';

/**
 * A linguagem visual dos painéis, num lugar só.
 *
 * Tudo o que o jogo mostra é canvas 2D virado para a câmera — não há CSS, não há
 * componente, não há folha de estilo. Sem um arquivo como este, cada painel
 * acaba com o seu próprio cinza, o seu próprio raio de canto e o seu próprio
 * tamanho de fonte, e é exatamente o que tinha acontecido: quatro tons de fundo
 * diferentes entre a barra de vida, o painel do pulso, a Pokédex e o PC.
 *
 * ## O que a leitura em VR exige
 *
 * Um painel de dez centímetros a um palmo do rosto, em passthrough, com o seu
 * quarto aparecendo por trás das partes translúcidas. Três consequências que
 * mandam em quase toda escolha aqui:
 *
 * - **Contraste alto e fundo opaco.** Translucidez bonita vira ilegível quando o
 *   que está atrás é uma estante bagunçada.
 * - **Pouca hierarquia, bem separada.** Três tamanhos de texto, não sete: a
 *   resolução angular do headset come as diferenças pequenas.
 * - **Cor como código, não como enfeite.** A cor do tipo, a cor da vida e a cor
 *   do aviso precisam querer dizer sempre a mesma coisa em todos os painéis.
 */

export const COR = {
  /** Fundo dos cartões, do mais fundo para o mais claro. */
  fundo: 'rgba(9, 12, 20, 0.94)',
  fundoElevado: 'rgba(20, 27, 41, 0.95)',
  fundoSobMira: 'rgba(36, 54, 82, 0.96)',
  fundoApagado: 'rgba(14, 16, 24, 0.86)',

  borda: 'rgba(255, 255, 255, 0.11)',
  bordaSobMira: 'rgba(168, 208, 255, 0.72)',
  bordaAtiva: '#7fe7c4',

  texto: '#eef3fa',
  textoFraco: '#93a2b8',
  textoApagado: '#5f6a7d',

  vidaAlta: '#5fd47a',
  vidaMedia: '#ffc94a',
  vidaBaixa: '#ff5f5f',
  xp: '#6fb6ff',
  /** A barra de carga do inimigo: é um aviso, e aviso é âmbar. */
  carga: '#ffb347',
  cargaIminente: '#ff6b5c',

  bom: '#7fe7c4',
  atencao: '#ffd78a',
  ruim: '#ff9f9f',
  destaque: '#9fe0ff',
} as const;

export const RAIO = { cartao: 18, pequeno: 12, pilula: 999 } as const;

const FAMILIA = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * A escala tipográfica, em pixels de canvas. Os canvas têm densidades
 * diferentes (um card do pulso tem 300 px de largura para 10 cm; o PC tem 1560
 * para 92 cm), então estes números são multiplicados pela densidade de cada
 * placa — ver `escalaDe`.
 */
export const TEXTO = {
  titulo: 34,
  corpo: 25,
  legenda: 21,
  micro: 18,
  numero: 44,
} as const;

export const fonte = (tamanho: number, peso = 600) => `${peso} ${Math.round(tamanho)}px ${FAMILIA}`;

/** Quantos pixels de canvas valem um centímetro de painel. */
export const escalaDe = (larguraPx: number, larguraMetros: number) =>
  larguraPx / (larguraMetros * 100);

export const hex = (cor: number) => `#${new THREE.Color(cor).getHexString()}`;

/** Mistura uma cor de tipo com preto, para servir de fundo sem ofuscar. */
export function corDeFundo(cor: number, forca = 0.22): string {
  const c = new THREE.Color(cor).multiplyScalar(forca);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.95)`;
}

export interface EstadoCartao {
  sobMira?: boolean;
  ativo?: boolean;
  apagado?: boolean;
  /** Um fio da cor do tipo no topo. É o que identifica a carta de relance. */
  acento?: number;
}

/**
 * O cartão padrão: fundo, borda e — quando há — o fio de acento no topo.
 *
 * Todo painel do jogo desenha os seus itens com esta função. É o que faz uma
 * carta de Pokémon, uma carta de bola e um botão do PC parecerem do mesmo jogo.
 */
export function cartao(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  a: number,
  estado: EstadoCartao = {},
  raio: number = RAIO.cartao,
) {
  const { sobMira, ativo, apagado, acento } = estado;

  ctx.beginPath();
  ctx.roundRect(x, y, l, a, raio);
  ctx.fillStyle = apagado
    ? COR.fundoApagado
    : sobMira
      ? COR.fundoSobMira
      : acento !== undefined
        ? corDeFundo(acento, 0.16)
        : COR.fundoElevado;
  ctx.fill();

  ctx.lineWidth = ativo ? 3.5 : 2;
  ctx.strokeStyle = ativo ? COR.bordaAtiva : sobMira ? COR.bordaSobMira : COR.borda;
  ctx.stroke();

  if (acento !== undefined) {
    // O fio segue a curvatura do canto, senão ele fica pendurado para fora da
    // carta nos raios grandes.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, l, a, raio);
    ctx.clip();
    ctx.globalAlpha = apagado ? 0.3 : 1;
    ctx.fillStyle = hex(acento);
    ctx.fillRect(x, y, l, Math.max(4, a * 0.05));
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/** Barra com trilho, para vida, experiência e carga de ataque. */
export function barra(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  a: number,
  fracao: number,
  cor: string,
  opcoes: { trilho?: string; minimo?: number } = {},
) {
  const f = Math.max(0, Math.min(1, fracao));
  ctx.beginPath();
  ctx.roundRect(x, y, l, a, a / 2);
  ctx.fillStyle = opcoes.trilho ?? 'rgba(255,255,255,0.13)';
  ctx.fill();
  if (f <= 0) return;
  // Um mínimo visível: uma barra de 2 px de vida restante lê como vazia, e a
  // diferença entre "quase morto" e "morto" é a informação mais cara da tela.
  const largura = Math.max(opcoes.minimo ?? a, l * f);
  ctx.beginPath();
  ctx.roundRect(x, y, largura, a, a / 2);
  ctx.fillStyle = cor;
  ctx.fill();
}

export const corDaVida = (fracao: number) =>
  fracao > 0.5 ? COR.vidaAlta : fracao > 0.22 ? COR.vidaMedia : COR.vidaBaixa;

/**
 * A estrela do brilhante, desenhada.
 *
 * Desenhada porque o `✦` não existe em toda fonte de sistema: no headset ele
 * saía como um retângulo vazio grudado no nome do Pokémon, o que é pior do que
 * não ter marca nenhuma — parece defeito, não raridade.
 */
export function estrela(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  raio: number,
  cor: string,
) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? raio : raio * 0.38;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = cor;
  ctx.fill();
}

/**
 * Nome do Pokémon com a marca de brilhante na frente, cortado se não couber.
 * Devolve onde o texto começa, já descontada a estrela.
 */
export function nomeComBrilho(
  ctx: CanvasRenderingContext2D,
  nome: string,
  shiny: boolean,
  x: number,
  y: number,
  alturaTexto: number,
  maxLargura: number,
) {
  const recuo = shiny ? alturaTexto * 0.85 : 0;
  if (shiny) estrela(ctx, x + alturaTexto * 0.3, y + alturaTexto * 0.42, alturaTexto * 0.34, '#ffe08a');
  ctx.fillText(textoAjustado(ctx, nome, maxLargura - recuo), x + recuo, y);
}

/**
 * Etiqueta arredondada — o tipo do Pokémon, a categoria do golpe.
 *
 * `maxLargura` importa mais do que parece: "FANTASMA/VENENO" numa carta de
 * 224 px estourava a borda e passava por cima do número de vida. Com o teto, o
 * texto é cortado antes de a pílula ser desenhada, e a carta continua inteira.
 */
export function pilula(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  altura: number,
  cor: string,
  opcoes: { alinhar?: 'left' | 'right'; preenchida?: boolean; maxLargura?: number } = {},
) {
  const tamanhoTexto = altura * 0.62;
  ctx.font = fonte(tamanhoTexto, 700);
  const conteudo = opcoes.maxLargura
    ? textoAjustado(ctx, texto, opcoes.maxLargura - altura * 0.9)
    : texto;
  const largura = ctx.measureText(conteudo).width + altura * 0.9;
  const esquerda = opcoes.alinhar === 'right' ? x - largura : x;
  texto = conteudo;

  ctx.beginPath();
  ctx.roundRect(esquerda, y, largura, altura, altura / 2);
  if (opcoes.preenchida) {
    ctx.fillStyle = cor;
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = cor;
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opcoes.preenchida ? '#0b0e15' : cor;
  ctx.fillText(texto, esquerda + largura / 2, y + altura / 2 + 1);
  ctx.textBaseline = 'top';
  return largura;
}

/**
 * A engrenagem dos ajustes, desenhada em caminho.
 *
 * Desenhada e não escrita: o emoji de engrenagem não existe em toda fonte de
 * sistema, e no headset ele saía como um retângulo vazio — que é o pior ícone
 * possível para o botão que abre as opções.
 */
export function engrenagem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  raio: number,
  cor: string,
  dentes = 8,
) {
  const rExterno = raio;
  const rInterno = raio * 0.74;
  ctx.beginPath();
  for (let i = 0; i < dentes * 2; i++) {
    const r = i % 2 === 0 ? rExterno : rInterno;
    const a0 = (i / (dentes * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (dentes * 2)) * Math.PI * 2;
    ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
  }
  ctx.closePath();
  ctx.fillStyle = cor;
  ctx.fill();

  // O furo do meio, aberto pelo fundo do cartão.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, raio * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Texto cortado com reticências quando não cabe. Evita transbordo no card. */
export function textoAjustado(
  ctx: CanvasRenderingContext2D,
  texto: string,
  maxLargura: number,
): string {
  if (ctx.measureText(texto).width <= maxLargura) return texto;
  let corte = texto;
  while (corte.length > 1 && ctx.measureText(`${corte}…`).width > maxLargura) {
    corte = corte.slice(0, -1);
  }
  return `${corte}…`;
}
