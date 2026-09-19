import type { Especie } from './species';
import { statsNoNivel } from './species';
import type { Exemplar } from './state';

/**
 * A AVALIAÇÃO de um exemplar: os genes dele, o poder de combate, e a frase que
 * o professor diria sobre ele.
 *
 * ## Por que isto existe
 *
 * O pedido do playtest de 19/09 foi: *"na Pokédex, quando apontar e usar ou
 * clicar em algum Pokémon, deve mostrar na tela da Pokédex a ficha completa do
 * Pokémon com status e avaliação do Pokémon, como também existe no Pokémon
 * GO"*. A avaliação do GO é aquela tela em que o líder de equipe olha o seu
 * bicho e diz o quanto ele é bom — e o que está por trás dela são três valores
 * escondidos, de 0 a 15, que o jogo chama de IVs.
 *
 * ## Por que os genes não estão salvos
 *
 * Porque não precisam estar, e gravá-los custaria uma migração do formato de
 * save de todo mundo que já joga. Um exemplar já tem três coisas que não mudam
 * nunca depois que ele é capturado — a espécie, o instante da captura em
 * milissegundos, e se ele é brilhante —, e três valores de quatro bits cabem
 * folgados no que essa combinação tem de entropia.
 *
 * Então os genes são DERIVADOS: uma mistura das três coisas, sempre a mesma
 * para o mesmo bicho, diferente entre dois bichos capturados no mesmo segundo
 * por causa da espécie. Um Pikachu capturado terça continua com os mesmos genes
 * na sexta, no ano que vem, e depois de uma evolução — porque `capturadoEm` não
 * muda ao evoluir, e o gene é do INDIVÍDUO, não da forma. É assim no original
 * também.
 *
 * A única coisa que isto não sobrevive é uma troca de fórmula. Se a mistura
 * abaixo mudar, todo mundo ganha genes novos de uma vez — e por isso ela está
 * aqui, num arquivo só, com este aviso.
 */
export interface Genes {
  /** 0 a 15, como no original. */
  hp: number;
  ataque: number;
  defesa: number;
}

/** O melhor que um bicho pode ser: 15 + 15 + 15. */
export const GENE_MAXIMO = 45;

/**
 * Mistura de inteiros de 32 bits — o mesmo miolo do mulberry32 que o resto do
 * repositório usa para prender o acaso nos testes. Aqui ela não é um gerador:
 * é uma função de espalhamento, chamada uma vez com a mesma entrada e devendo
 * dar a mesma saída para sempre.
 */
function espalhar(semente: number): number {
  let t = (semente + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/** O identificador da espécie virando número, para entrar na mistura. */
function somaDoTexto(texto: string): number {
  let n = 0;
  for (let i = 0; i < texto.length; i++) n = (Math.imul(n, 31) + texto.charCodeAt(i)) | 0;
  return n;
}

/**
 * Os genes de um exemplar. Sempre os mesmos para o mesmo bicho. Ver `Genes`.
 *
 * O brilhante entra na mistura, e não no resultado: um shiny não é melhor de
 * combate no original, e não é aqui. Ele só tem OUTROS genes.
 */
export function genesDe(exemplar: Exemplar): Genes {
  const base =
    somaDoTexto(exemplar.id) ^
    Math.imul(exemplar.capturadoEm | 0, 0x9e3779b1) ^
    (exemplar.shiny ? 0x5bf03635 : 0);
  return {
    hp: espalhar(base) % 16,
    ataque: espalhar(base ^ 0x1b873593) % 16,
    defesa: espalhar(base ^ 0xcc9e2d51) % 16,
  };
}

/** A soma dos três, de 0 a 45. */
export const totalDosGenes = (g: Genes) => g.hp + g.ataque + g.defesa;

/** Em porcentagem do máximo, que é como o jogador pensa. */
export const percentualDosGenes = (g: Genes) =>
  Math.round((totalDosGenes(g) / GENE_MAXIMO) * 100);

/**
 * O PODER DE COMBATE, no espírito do original: ataque vezes a raiz da defesa
 * vezes a raiz da vida.
 *
 * A forma da conta importa mais que a constante. Ataque entra linear e as
 * outras duas na raiz porque é isso que faz um bicho de ataque alto valer mais
 * do que um de defesa alta com a mesma soma — e é essa assimetria que dá ao
 * número a cara de "poder", em vez de "soma dos atributos".
 *
 * Os genes entram somados aos atributos do nível, exatamente como no original.
 */
export function poderDeCombate(especie: Especie, nivel: number, genes: Genes): number {
  const s = statsNoNivel(especie, nivel);
  const ataque = Math.max(1, s.ataque + genes.ataque);
  const defesa = Math.max(1, s.defesa + genes.defesa);
  const vida = Math.max(1, s.hpMax + genes.hp);
  return Math.max(10, Math.floor((ataque * Math.sqrt(defesa) * Math.sqrt(vida)) / 10));
}

export interface Avaliacao {
  genes: Genes;
  total: number;
  percentual: number;
  /** 0 a 4, como as estrelas da tela de avaliação do GO. */
  estrelas: number;
  /** O que o professor diz do bicho inteiro. */
  veredito: string;
  /** E o que ele diz do atributo mais forte. */
  destaque: string;
}

/**
 * As faixas. São as do GO, e a razão de manter os mesmos cortes é que eles já
 * estão calibrados para o que a distribuição uniforme de 0–15 produz: um bicho
 * de quatro estrelas é raro o bastante para ser notícia (1 em 4096) e um de
 * três é comum o bastante para valer a pena procurar.
 */
const FAIXAS: ReadonlyArray<{ minimo: number; estrelas: number; veredito: string }> = [
  { minimo: 45, estrelas: 4, veredito: 'É um exemplar impressionante. Não dá para ser melhor.' },
  { minimo: 37, estrelas: 3, veredito: 'É um exemplar notável. Vai longe numa batalha.' },
  { minimo: 30, estrelas: 2, veredito: 'É um bom exemplar. Dá conta do recado.' },
  { minimo: 23, estrelas: 1, veredito: 'É um exemplar decente. Nada de extraordinário.' },
  { minimo: 0, estrelas: 0, veredito: 'Não é dos melhores, mas é seu.' },
];

const NOMES_DE_GENE: ReadonlyArray<[keyof Genes, string]> = [
  ['ataque', 'o ataque'],
  ['defesa', 'a defesa'],
  ['hp', 'a vitalidade'],
];

/** O que mais chama a atenção nele — e o quanto. */
function frasesDoDestaque(g: Genes): string {
  let melhor: keyof Genes = 'ataque';
  for (const [chave] of NOMES_DE_GENE) if (g[chave] > g[melhor]) melhor = chave;
  const nome = NOMES_DE_GENE.find(([c]) => c === melhor)![1];
  const valor = g[melhor];
  if (valor >= 15) return `${nome} dele é perfeito`;
  if (valor >= 13) return `${nome} dele é excepcional`;
  if (valor >= 10) return `${nome} dele se destaca`;
  if (valor >= 6) return `${nome} é o lado mais forte dele`;
  return 'ele é equilibrado, e modesto em tudo';
}

export function avaliar(exemplar: Exemplar): Avaliacao {
  const genes = genesDe(exemplar);
  const total = totalDosGenes(genes);
  const faixa = FAIXAS.find((f) => total >= f.minimo) ?? FAIXAS[FAIXAS.length - 1];
  return {
    genes,
    total,
    percentual: percentualDosGenes(genes),
    estrelas: faixa.estrelas,
    veredito: faixa.veredito,
    destaque: frasesDoDestaque(genes),
  };
}
