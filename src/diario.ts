/**
 * O diário de quadro: o jogo mede a si mesmo e entrega o resultado na saída.
 *
 * ## Por que isto existe
 *
 * O item 0.1 do roteiro — "o orçamento de quadro, medido uma vez" — está parado
 * há mais tempo do que qualquer outro, e a razão não é preguiça de ninguém: ele
 * pede que uma pessoa com o headset na cabeça ligue o contador nos ajustes,
 * fique parada lendo uma plaquinha, invoque três selvagens e leia de novo, abra
 * o painel e leia de novo, abra a mochila e leia de novo, e DECORE quatro pares
 * de números para escrever depois. É trabalho manual, chato, e fácil de fazer
 * errado — e por isso ele nunca foi feito, enquanto mais de quinze sistemas
 * novos entravam em cima de um orçamento que ninguém conhece.
 *
 * Um número que depende de alguém decorar quatro medidas é um número que não
 * vai existir. O jogo já tem o `Medidor`, que sabe o tempo de cada quadro e as
 * draw calls: o que faltava era ele ANOTAR em vez de só mostrar.
 *
 * Agora ele anota sozinho, o tempo todo, separando por CENÁRIO — e na saída da
 * sessão entrega uma tabela pronta para colar no PLAYTEST.md. O trabalho da
 * pessoa passa a ser jogar.
 *
 * ## Por que histograma, e não a lista de amostras
 *
 * Uma sessão de vinte minutos a 90 Hz são 108 mil quadros. Guardar o tempo de
 * cada um custaria quase um megabyte por cenário — num aparelho onde a memória
 * é o recurso mais apertado, para calcular no fim duas estatísticas.
 *
 * O histograma custa o mesmo para um quadro e para um milhão: 240 baldes de um
 * quarto de milissegundo, cobrindo de 0 a 60 ms. A média sai da soma exata (que
 * é guardada à parte, sem perda), e os percentis saem da contagem acumulada com
 * a precisão do balde — um quarto de milissegundo, que é fino demais para
 * alguém enxergar a diferença num orçamento de 11,1.
 *
 * ## Por que o pior caso é o p95, e não o máximo
 *
 * O máximo de uma sessão inteira é sempre o mesmo número: o quadro em que um
 * modelo de Pokémon terminou de baixar, ou em que o coletor de lixo passou. Ele
 * é real e é irrelevante — não se otimiza contra um evento único.
 *
 * O p95 é o que o corpo sente: um em cada vinte quadros é um tranco a cada
 * quarto de segundo, e isso em VR é a diferença entre jogar e enjoar. O máximo
 * também aparece na tabela, porque quando ele for absurdo a pergunta certa é
 * "o que aconteceu ali" — mas quem manda é o p95.
 */

/** Orçamento de um quadro a 90 Hz, em milissegundos. */
export const ORCAMENTO_MS = 1000 / 90;

/** Resolução do histograma, em milissegundos. */
export const BALDE_MS = 0.25;
/** Quantos baldes: 240 × 0,25 ms = 60 ms. Acima disso, tudo cai no último. */
export const BALDES = 240;

/**
 * Os cenários que o item 0.1 pede, mais um.
 *
 * São exatamente os quatro do roteiro — parado, três selvagens, painel aberto,
 * mochila aberta —, com o PC junto porque ele é o painel maior do jogo e é o
 * único que desenha 151 fichas de uma vez.
 *
 * A ordem é a da PRIORIDADE: um quadro com a mochila aberta e dois selvagens em
 * campo conta como mochila. Contar nos dois faria as duas médias mentirem, e a
 * pergunta que o número responde é "quanto custa ter isto aberto", que só faz
 * sentido cobrando o quadro inteiro de quem está por cima.
 */
export const CENARIOS = ['mochila', 'pc', 'painel', 'selvagens', 'parado'] as const;
export type Cenario = (typeof CENARIOS)[number];

/** O que se lê sobre um cenário depois de medido. */
export interface Resumo {
  cenario: Cenario;
  /** Quantos quadros foram medidos neste cenário. */
  quadros: number;
  /** Segundos que o cenário durou, somados. */
  segundos: number;
  mediaMs: number;
  /** O tranco que o corpo sente: um em cada vinte quadros. */
  p95Ms: number;
  piorMs: number;
  /** Média de draw calls por quadro. */
  chamadas: number;
  /** Quantos selvagens havia, no máximo, enquanto este cenário era medido. */
  selvagens: number;
}

interface Balde {
  quadros: number;
  somaMs: number;
  somaChamadas: number;
  piorMs: number;
  selvagens: number;
  contagem: Int32Array;
}

function baldeVazio(): Balde {
  return {
    quadros: 0,
    somaMs: 0,
    somaChamadas: 0,
    piorMs: 0,
    selvagens: 0,
    contagem: new Int32Array(BALDES),
  };
}

/**
 * A anotação, separada do desenho.
 *
 * Ela não sabe o que é uma cena nem o que é uma placa: recebe milissegundos e
 * devolve tabela. É o que permite conferir o relatório inteiro sem navegador —
 * ver tools/smoke.ts.
 */
export class Diario {
  private dados = new Map<Cenario, Balde>();

  /**
   * Um quadro medido.
   *
   * `ms` é o tempo do quadro ANTERIOR, render incluído — é o que o laço já
   * calcula e o único número honesto disponível aqui.
   */
  registrar(cenario: Cenario, ms: number, chamadas: number, selvagens = 0) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    let balde = this.dados.get(cenario);
    if (!balde) {
      balde = baldeVazio();
      this.dados.set(cenario, balde);
    }
    balde.quadros++;
    balde.somaMs += ms;
    balde.somaChamadas += chamadas;
    if (ms > balde.piorMs) balde.piorMs = ms;
    if (selvagens > balde.selvagens) balde.selvagens = selvagens;
    const i = Math.min(BALDES - 1, Math.floor(ms / BALDE_MS));
    balde.contagem[i]++;
  }

  /** Quantos quadros foram anotados ao todo. */
  get quadros(): number {
    let total = 0;
    for (const balde of this.dados.values()) total += balde.quadros;
    return total;
  }

  /**
   * O percentil, em milissegundos, pelo topo do balde que o contém.
   *
   * Pelo TOPO e não pelo meio: um p95 arredondado para baixo diz que cabe,
   * quando o que se quer saber é se não cabe. Num medidor de orçamento, o erro
   * honesto é o pessimista.
   */
  private percentil(balde: Balde, fracao: number): number {
    if (balde.quadros === 0) return 0;
    const alvo = Math.ceil(balde.quadros * fracao);
    let acumulado = 0;
    for (let i = 0; i < BALDES; i++) {
      acumulado += balde.contagem[i];
      if (acumulado >= alvo) return Math.min((i + 1) * BALDE_MS, balde.piorMs);
    }
    return balde.piorMs;
  }

  /** O que foi medido, em ordem de tempo medido — o mais vivido primeiro. */
  resumo(): Resumo[] {
    const saida: Resumo[] = [];
    for (const cenario of CENARIOS) {
      const balde = this.dados.get(cenario);
      if (!balde || balde.quadros === 0) continue;
      saida.push({
        cenario,
        quadros: balde.quadros,
        segundos: balde.somaMs / 1000,
        mediaMs: balde.somaMs / balde.quadros,
        p95Ms: this.percentil(balde, 0.95),
        piorMs: balde.piorMs,
        chamadas: balde.somaChamadas / balde.quadros,
        selvagens: balde.selvagens,
      });
    }
    return saida.sort((a, b) => b.segundos - a.segundos);
  }

  limpar() {
    this.dados.clear();
  }
}

const NOMES: Record<Cenario, string> = {
  parado: 'parado',
  selvagens: 'com selvagens',
  painel: 'painel do pulso',
  mochila: 'mochila aberta',
  pc: 'PC aberto',
};

/** Um número com uma casa, sem o `0.0` de `toFixed` em inteiros grandes. */
function n1(x: number): string {
  return (Math.round(x * 10) / 10).toFixed(1);
}

/**
 * A tabela, pronta para colar no PLAYTEST.md.
 *
 * Markdown porque é o formato do arquivo que vai recebê-la, e porque é legível
 * como texto puro — quem colar num chat também entende.
 *
 * Só sai o que foi medido por tempo suficiente: um cenário de meio segundo é a
 * transição de outro, e uma linha com três quadros na tabela vale menos do que
 * nada, porque parece uma medida.
 */
export function relatorio(diario: Diario, minimoSegundos = 3): string {
  const linhas = diario.resumo().filter((r) => r.segundos >= minimoSegundos);
  if (linhas.length === 0) {
    return 'Sessão curta demais para medir — jogue um pouco mais e saia de novo.';
  }

  const fora = linhas.filter((r) => r.p95Ms > ORCAMENTO_MS);
  const texto: string[] = [
    `| cenário | quadros | média | p95 | pior | draw calls |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];
  for (const r of linhas) {
    const nome = r.cenario === 'selvagens' ? `com ${r.selvagens} selvagens` : NOMES[r.cenario];
    texto.push(
      `| ${nome} | ${r.quadros} | ${n1(r.mediaMs)} ms | ${n1(r.p95Ms)} ms | ` +
        `${n1(r.piorMs)} ms | ${Math.round(r.chamadas)} |`,
    );
  }
  texto.push('');
  texto.push(`Orçamento a 90 Hz: ${n1(ORCAMENTO_MS)} ms por quadro.`);
  texto.push(
    fora.length === 0
      ? 'Todos os cenários medidos cabem no orçamento, inclusive no p95.'
      : `Estouram o orçamento no p95: ${fora.map((r) => NOMES[r.cenario]).join(', ')}.`,
  );
  return texto.join('\n');
}
