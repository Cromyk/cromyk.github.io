import * as THREE from 'three';
import { Placa } from './hud';
import { ESPECIES, TIPOS, type Especie } from './species';
import { textoDoHabito } from './hora';
import { barra, estrela, luaOuSol } from './estilo';
import { GENE_MAXIMO, type Avaliacao } from './avaliacao';

/**
 * O que a Pokédex sabe de uma espécie.
 *
 * As três primeiras são do REGISTRO — quantos você viu, quantos pegou — e
 * valem mesmo sem nenhum exemplar na mão. O resto é do MELHOR exemplar que
 * você tem dessa espécie, e é o que a ficha completa mostra: nível, poder de
 * combate e a avaliação dos genes. Ver src/avaliacao.ts.
 */
export interface EstadoDex {
  visto: boolean;
  capturado: boolean;
  viuShiny: boolean;
  /** Do melhor exemplar seu desta espécie, quando existe um. */
  melhor?: {
    nivel: number;
    hp: number;
    hpMax: number;
    shiny: boolean;
    afeto: number;
    poder: number;
    avaliacao: Avaliacao;
  };
  /** Quantos você tem agora, entre time e caixa. */
  quantos?: number;
}

const COLUNAS = 6;
const LINHAS = 6;
const POR_PAGINA = COLUNAS * LINHAS;

/**
 * O VIDRO da Pokédex, em metros, em coordenadas do grupo da tela.
 *
 * ## Por que estes números e não os de antes
 *
 * Porque antes as placas não cabiam na tela. A grade tinha 26 cm de altura
 * centrada em +5,5 cm, o que a levava até +20,5 cm — e a faixa da moldura onde
 * mora o símbolo da pokébola começa em +15,3. A grade subia cinco centímetros
 * POR CIMA da moldura, e o símbolo, que é geometria de verdade e fica à frente
 * do plano da tela, aparecia atravessado no meio da primeira linha de células.
 *
 * Foi o relato de 19/09: *"a pokébola do frame da Pokédex está atrapalhando a
 * tela, ela precisa ficar pra cima do frame"*. As duas metades foram
 * atendidas: o símbolo subiu para dentro da moldura (ver src/tablet.ts) e a
 * tela encolheu para caber embaixo dele.
 *
 * Tudo aqui é medido no espaço do GRUPO da Pokédex, que o tablet posiciona
 * rente ao vidro. O vidro vai de −11,95 cm a +15,95 cm; estas margens deixam
 * meio centímetro de folga em cima e embaixo.
 */
const VIDRO = { topo: 0.152, base: -0.114, largura: 0.3 } as const;

/** A grade ocupa a parte de cima; a ficha resumida, o rodapé. */
const ALTURA_GRADE = 0.196;
const ALTURA_RESUMO = 0.062;
/** A faixa de rodapé DA GRADE, onde ficam as setas de página. */
const RODAPE = 0.022;

/** O y do centro de cada placa, no espaço do grupo. */
const Y_GRADE = VIDRO.topo - ALTURA_GRADE / 2;
const Y_RESUMO = VIDRO.base + ALTURA_RESUMO / 2;
/** O topo da área de células, já no espaço do grupo. */
const TOPO_DA_GRADE = Y_GRADE + ALTURA_GRADE / 2;

/** E a ficha completa, que toma o vidro inteiro. */
const ALTURA_FICHA = VIDRO.topo - VIDRO.base;
const Y_FICHA = (VIDRO.topo + VIDRO.base) / 2;

/**
 * A Pokédex: as 151 espécies numa grade paginada, presa ao tablet.
 *
 * Abre sozinha quando você tira o tablet das costas. Apontar uma célula
 * destaca a espécie e mostra o resumo dela no rodapé; puxar o gatilho abre a
 * **ficha completa**, que toma a tela inteira.
 *
 * A grade inteira é desenhada num canvas só. Isso não é economia de código, é
 * economia de memória: 151 cartas com textura própria seriam mais de cem
 * texturas paradas na VRAM do headset só para mostrar uma lista. Aqui são três
 * — a grade, o resumo, e a ficha completa, que só se redesenha quando abre.
 */
export class PainelDex {
  readonly grupo = new THREE.Group();
  aberto = false;
  mudouDestaque = false;

  private grade = new Placa(VIDRO.largura, ALTURA_GRADE, 900);
  private resumo = new Placa(VIDRO.largura, ALTURA_RESUMO, 820);
  private fichaCheia = new Placa(VIDRO.largura, ALTURA_FICHA, 1060);
  private alvos: THREE.Mesh[] = [];
  /** O alvo de VOLTAR, que só existe na ficha completa. */
  private alvoVoltar: THREE.Mesh;
  private estados = new Map<string, EstadoDex>();
  /** Resumo barato do conteúdo: é o que diz se a grade precisa ser redesenhada. */
  private resumoEstados = 0;
  private pagina = 0;
  private destacado = -1;
  /** O destaque veio de `fixar` e não da mira. */
  private fixado = false;
  /**
   * A ficha completa está aberta, e de quem.
   *
   * Guarda o ID e não o índice porque a grade continua paginável por baixo
   * dela: fechar a ficha tem de devolver você à mesma página, e abrir a ficha
   * de outro bicho pela mira não pode depender de onde a grade estava.
   */
  private fichaDe: string | null = null;
  /** A seta de VOLTAR está sob a mira. */
  private voltarSobAMira = false;
  /** Qual seta está sob a mira: −1, +1, ou 0 para nenhuma. Ver `atualizar`. */
  setaSobAMira: -1 | 0 | 1 = 0;
  private abertura = 0;
  private assinatura = '';
  private raycaster = new THREE.Raycaster();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.grade.malha.position.set(0, Y_GRADE, 0);
    this.resumo.malha.position.set(0, Y_RESUMO, 0);
    this.fichaCheia.malha.position.set(0, Y_FICHA, 0.0005);
    this.grupo.add(this.grade.malha, this.resumo.malha, this.fichaCheia.malha);
    this.fichaCheia.malha.visible = false;
    this.grupo.visible = false;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this.descartaveis.push(geo, mat);

    // Um alvo invisível por célula, reposicionado a cada página.
    const largura = VIDRO.largura / COLUNAS;
    const altura = (ALTURA_GRADE - RODAPE) / LINHAS;
    for (let i = 0; i < POR_PAGINA; i++) {
      const alvo = new THREE.Mesh(geo, mat);
      alvo.scale.set(largura * 0.96, altura * 0.94, 1);
      alvo.position.set(
        -VIDRO.largura / 2 + largura * (0.5 + (i % COLUNAS)),
        TOPO_DA_GRADE - altura * (0.5 + Math.floor(i / COLUNAS)),
        0.001,
      );
      alvo.userData.indice = i;
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    }

    // As duas setas, no rodapé — uma faixa própria, abaixo das seis linhas.
    // Índices negativos para não brigarem com as 36 células: −2 volta, −3
    // avança. Ver `setaSobAMira`.
    //
    // A faixa existe porque antes não existia: o número da página era escrito
    // POR CIMA da última linha de células, e uma seta ali seria um alvo em
    // cima de outro.
    for (const [indice, x] of [
      [-2, -VIDRO.largura * 0.36],
      [-3, VIDRO.largura * 0.36],
    ] as Array<[number, number]>) {
      const seta = new THREE.Mesh(geo, mat);
      seta.scale.set(0.058, RODAPE * 0.9, 1);
      seta.position.set(x, TOPO_DA_GRADE - (ALTURA_GRADE - RODAPE) - RODAPE / 2, 0.001);
      seta.userData.indice = indice;
      this.grupo.add(seta);
      this.alvos.push(seta);
    }

    // E o VOLTAR da ficha completa: canto superior esquerdo, onde a mão já
    // procura o botão de voltar de qualquer tela. Fora de `alvos` porque ele
    // não convive com a grade — ele a substitui.
    this.alvoVoltar = new THREE.Mesh(geo, mat);
    this.alvoVoltar.scale.set(0.062, 0.03, 1);
    this.alvoVoltar.position.set(-VIDRO.largura / 2 + 0.04, VIDRO.topo - 0.019, 0.0015);
    this.alvoVoltar.visible = false;
    this.grupo.add(this.alvoVoltar);
  }

  get totalPaginas(): number {
    return Math.ceil(ESPECIES.length / POR_PAGINA);
  }

  definirEstados(estados: Map<string, EstadoDex>) {
    this.estados = estados;
    // O tamanho do mapa não basta: capturar uma espécie que você já tinha
    // visto não muda a contagem de entradas, mas muda a grade inteira. E o
    // poder do melhor exemplar entra porque a ficha completa o mostra — subir
    // de nível com a Pokédex na mão tem de aparecer.
    let resumo = 0;
    for (const e of estados.values()) {
      resumo += (e.capturado ? 2 : 1) + (e.viuShiny ? 4 : 0) + (e.melhor?.poder ?? 0);
    }
    this.resumoEstados = resumo;
  }

  virarPagina(direcao: 1 | -1) {
    this.pagina = (this.pagina + direcao + this.totalPaginas) % this.totalPaginas;
    this.assinatura = '';
  }

  /** A espécie sob a mira, se houver uma. */
  get selecionada(): Especie | null {
    if (this.destacado < 0) return null;
    return ESPECIES[this.pagina * POR_PAGINA + this.destacado] ?? null;
  }

  /** A ficha completa está aberta. */
  get naFicha(): boolean {
    return this.fichaDe !== null;
  }

  /** O VOLTAR está sob a mira — quem lê é o gatilho. */
  get voltarApontado(): boolean {
    return this.naFicha && this.voltarSobAMira;
  }

  /**
   * Abre a FICHA COMPLETA de uma espécie: a tela inteira, com atributos e
   * avaliação. Ver `desenharFichaCheia`.
   *
   * *"Quando apontar e usar ou clicar em algum Pokémon, deve mostrar na tela da
   * Pokédex a ficha completa do Pokémon com status e avaliação"* — playtest de
   * 19/09. O resumo do rodapé continua existindo e continua sendo o que se vê
   * ao passar a mira: ele é a etiqueta, e esta é a página.
   */
  abrirFicha(id: string) {
    if (!ESPECIES.some((e) => e.id === id)) return;
    this.fichaDe = id;
    // A grade por baixo vai junto: fechar a ficha tem de devolver você à
    // página de quem você estava vendo, e não àquela em que a mira parou.
    this.fixar(id);
    this.assinatura = '';
  }

  /** De quem é a ficha aberta, se houver uma. */
  get especieDaFicha(): Especie | null {
    if (this.fichaDe === null) return null;
    return ESPECIES.find((e) => e.id === this.fichaDe) ?? null;
  }

  /** Volta para a grade. */
  fecharFicha() {
    if (this.fichaDe === null) return;
    this.fichaDe = null;
    this.voltarSobAMira = false;
    this.assinatura = '';
  }

  /**
   * Abre a grade na página de uma espécie e deixa o resumo DELA aberto.
   *
   * É o que o escaneamento por mira usa (ver `Jogo.escanearComADex`): você
   * aponta a Pokédex para o bicho no tapete e a tela vai até ele, em vez de
   * você procurar o número dele numa lista de 151.
   *
   * O destaque fixado dura até a mira encostar em outra célula — quem está
   * olhando o resumo que acabou de abrir não o perde porque o braço tremeu, e
   * quem quiser trocar é só apontar.
   */
  fixar(id: string) {
    const indice = ESPECIES.findIndex((e) => e.id === id);
    if (indice < 0) return;
    this.pagina = Math.floor(indice / POR_PAGINA);
    this.destacado = indice % POR_PAGINA;
    this.fixado = true;
    this.assinatura = '';
  }

  private estadoDe(especie: Especie): EstadoDex {
    return this.estados.get(especie.id) ?? { visto: false, capturado: false, viuShiny: false };
  }

  private desenharGrade() {
    const { ctx, canvas } = this.grade;
    this.grade.limpar('rgba(10,14,22,0.92)', 'rgba(255,255,255,0.16)', 18);

    const cw = canvas.width / COLUNAS;
    // A faixa do rodapé sai da conta das linhas: ver o bloco das setas no
    // construtor. Em pixels ela é a mesma fração que em metros.
    const rodapePx = canvas.height * (RODAPE / ALTURA_GRADE);
    const ch = (canvas.height - rodapePx) / LINHAS;
    const inicio = this.pagina * POR_PAGINA;

    for (let i = 0; i < POR_PAGINA; i++) {
      const especie = ESPECIES[inicio + i];
      if (!especie) continue;
      const col = i % COLUNAS;
      const lin = Math.floor(i / COLUNAS);
      const x = col * cw;
      const y = lin * ch;
      const estado = this.estadoDe(especie);
      const sobMira = i === this.destacado;

      if (sobMira) {
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, cw - 4, ch - 4, 8);
        ctx.fillStyle = 'rgba(60, 92, 136, 0.5)';
        ctx.fill();
      }

      // Faixa do tipo — só de quem já foi visto; o resto fica em silhueta.
      ctx.fillStyle = estado.visto
        ? `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`
        : 'rgba(255,255,255,0.10)';
      ctx.globalAlpha = estado.capturado ? 1 : estado.visto ? 0.55 : 1;
      ctx.beginPath();
      ctx.roundRect(x + 8, y + 7, cw - 16, 5, 3);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '700 14px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#6f7b8e';
      ctx.fillText(`${especie.num}`.padStart(3, '0'), x + cw / 2, y + 16);

      ctx.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = estado.capturado ? '#f2f5fa' : estado.visto ? '#9aa5b8' : '#454d5c';
      ctx.fillText(estado.visto ? especie.nome : '???', x + cw / 2, y + 33, cw - 12);

      // A bolinha conta a história: cheia = capturado, vazada = só visto.
      const cy = y + ch - 15;
      ctx.beginPath();
      ctx.arc(x + cw / 2, cy, 6, 0, Math.PI * 2);
      if (estado.capturado) {
        ctx.fillStyle = estado.viuShiny ? '#ffd76a' : '#7fe7c4';
        ctx.fill();
      } else {
        ctx.strokeStyle = estado.visto ? '#6f7b8e' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const meioDoRodape = canvas.height - rodapePx / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#7f8ba0';
    ctx.fillText(`${this.pagina + 1}/${this.totalPaginas}`, canvas.width / 2, meioDoRodape);

    // As setas, uma de cada lado do número da página. Elas existem porque o
    // analógico não é caminho para quem joga de mão nua — e porque uma lista
    // que só rola com o polegar de um controle não é uma lista rolável.
    for (const lado of [-1, 1] as const) {
      const x = canvas.width / 2 + lado * 0.36 * canvas.width;
      const acesa = this.setaSobAMira === lado;
      ctx.beginPath();
      ctx.roundRect(x - 48, meioDoRodape - rodapePx * 0.42, 96, rodapePx * 0.84, 8);
      ctx.fillStyle = acesa ? 'rgba(96, 148, 214, 0.55)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = acesa ? '#f2f5fa' : '#8b97ac';
      ctx.fillText(lado < 0 ? '‹' : '›', x, meioDoRodape - 1);
    }
    ctx.textBaseline = 'top';

    this.grade.marcarSujo();
  }

  /** O rodapé: a etiqueta do que está sob a mira, e o convite para abrir. */
  private desenharResumo() {
    const especie = this.selecionada;
    const { ctx, canvas } = this.resumo;

    if (!especie) {
      this.resumo.escrever(
        [{ texto: 'aponte para uma espécie', tamanho: 26, cor: '#7f8ba0', peso: 500 }],
        { raio: 14, fundo: 'rgba(10,14,22,0.85)' },
      );
      return;
    }

    const estado = this.estadoDe(especie);
    this.resumo.limpar('rgba(10,14,22,0.92)', 'rgba(255,255,255,0.16)', 14);

    // A mesma ampliação da ficha completa, e pelo mesmo motivo: o rodapé é
    // lido a um braço de distância num painel de trinta centímetros. Ver
    // `desenharFichaCheia`.
    const AMPLIACAO = 1.5;
    ctx.save();
    ctx.scale(AMPLIACAO, AMPLIACAO);
    const L = canvas.width / AMPLIACAO;
    const A = canvas.height / AMPLIACAO;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (!estado.visto) {
      ctx.font = '600 24px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#6f7b8e';
      ctx.fillText('ainda não encontrado', 20, A / 2 - 15);
      ctx.restore();
      this.resumo.marcarSujo();
      return;
    }

    const cor = `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`;

    ctx.font = '700 28px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#f2f5fa';
    ctx.fillText(`${`${especie.num}`.padStart(3, '0')}  ${especie.nome}`, 18, 8);

    ctx.textAlign = 'right';
    ctx.font = '700 19px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = cor;
    ctx.fillText(especie.tipos.map((t) => TIPOS[t].nome).join(' / ').toUpperCase(), L - 18, 12);

    ctx.textAlign = 'left';
    ctx.font = '500 18px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#93a0b4';
    ctx.fillText(
      `${especie.alturaReal.toFixed(1).replace('.', ',')} m · ${especie.peso
        .toFixed(1)
        .replace('.', ',')} kg`,
      18,
      42,
    );

    // E o SEU melhor, quando existe — é a linha que responde "já tenho?".
    if (estado.melhor) {
      ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#7fe7c4';
      ctx.fillText(
        `Nv ${estado.melhor.nivel} · PC ${estado.melhor.poder}` +
          (estado.quantos && estado.quantos > 1 ? ` · ${estado.quantos} seus` : ''),
        150,
        42,
      );
    }

    // A chamada para a ficha, que é a novidade desta tela. Ela fica à direita
    // e apagada: é uma instrução, não uma informação.
    ctx.textAlign = 'right';
    ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#6f7b8e';
    ctx.fillText('gatilho → ficha completa', L - 18, 44);

    ctx.textAlign = 'left';
    ctx.restore();
    this.resumo.marcarSujo();
  }

  /**
   * A FICHA COMPLETA: a tela inteira, com os atributos e a avaliação.
   *
   * ## O que ela mostra, e em que ordem
   *
   * De cima para baixo, na ordem em que se olha:
   *
   * 1. **Cabeçalho** — número, nome, tipos, e o VOLTAR à esquerda.
   * 2. **A linha do seu exemplar** — nível, poder de combate, vida, afeto. Só
   *    aparece se você tem um. É a linha mais alta da tela por um motivo: é a
   *    única informação que é SUA, e não da espécie.
   * 3. **A avaliação** — as quatro estrelas, a porcentagem, e as três barras
   *    de gene. É a tela do GO, e é o que foi pedido.
   * 4. **Os atributos-base** — seis barras, a escala do maior da geração.
   * 5. **A ficha da espécie** — altura, peso, gênero, hábito, e a descrição.
   *
   * Sem exemplar seu, os blocos 2 e 3 dão lugar a uma linha só dizendo o que
   * falta: capturar um. Isso é de propósito — a avaliação é de um INDIVÍDUO, e
   * inventar uma para uma espécie que você nunca pegou seria mentir.
   */
  private desenharFichaCheia() {
    const especie = ESPECIES.find((e) => e.id === this.fichaDe);
    const { ctx, canvas } = this.fichaCheia;
    this.fichaCheia.limpar('rgba(9,12,20,0.96)', 'rgba(255,255,255,0.18)', 18);
    if (!especie) return;

    const estado = this.estadoDe(especie);
    const cor = `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`;

    // A ficha é desenhada num espaço LÓGICO menor que o canvas, e a ampliação
    // é uma transformação só.
    //
    // Sem isto, a página desenhava a 1060 px de largura e acabava aos 620 de
    // 940 de altura: um terço da tela em branco, com o texto no menor tamanho
    // possível. Num painel de vinte centímetros a um braço de distância, letra
    // pequena não é elegância, é texto que não se lê. Ampliar aqui — em vez de
    // mexer em trinta tamanhos de fonte — mantém a proporção que já foi
    // conferida e usa a tela inteira.
    const AMPLIACAO = 1.42;
    ctx.save();
    ctx.scale(AMPLIACAO, AMPLIACAO);
    const L = canvas.width / AMPLIACAO;
    const margem = 26;

    // --- 1. cabeçalho ---
    // A tarja do tipo atravessa o topo inteiro: é o que dá identidade à página
    // de relance, antes de qualquer texto ser lido.
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect(3, 3, L - 6, 78, [16, 16, 0, 0]);
    ctx.fill();
    ctx.globalAlpha = 1;

    // O VOLTAR. Acende sob a mira, como as setas de página.
    ctx.beginPath();
    ctx.roundRect(margem - 8, 16, 96, 42, 10);
    ctx.fillStyle = this.voltarSobAMira ? 'rgba(96, 148, 214, 0.6)' : 'rgba(255,255,255,0.09)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = this.voltarSobAMira ? '#f2f5fa' : '#9aa5b8';
    ctx.fillText('‹ voltar', margem + 40, 38);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '700 34px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#f2f5fa';
    const nome = estado.visto ? especie.nome : '???';
    ctx.fillText(`${`${especie.num}`.padStart(3, '0')}  ${nome}`, margem + 104, 22);

    ctx.textAlign = 'right';
    ctx.font = '700 21px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = cor;
    ctx.fillText(
      especie.tipos.map((t) => TIPOS[t].nome).join(' / ').toUpperCase(),
      L - margem,
      28,
    );
    ctx.textAlign = 'left';

    let y = 96;

    if (!estado.visto) {
      ctx.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#6f7b8e';
      ctx.fillText('ainda não encontrado', margem, y + 40);
      ctx.restore();
      this.fichaCheia.marcarSujo();
      return;
    }

    // --- 2. o SEU exemplar ---
    const meu = estado.melhor;
    if (meu) {
      ctx.beginPath();
      ctx.roundRect(margem, y, L - margem * 2, 62, 12);
      ctx.fillStyle = 'rgba(28, 38, 56, 0.9)';
      ctx.fill();

      ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffd76a';
      ctx.fillText(`PC ${meu.poder}`, margem + 16, y + 10);

      ctx.font = '600 19px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#c3ccda';
      ctx.fillText(`Nível ${meu.nivel}`, margem + 16, y + 42);

      // A vida, com a barra: é a informação que muda sozinha, e a única desta
      // tela que vale a pena conferir no meio de uma caçada.
      const xBarra = margem + 168;
      const larguraBarra = L - margem * 2 - 184 - 150;
      ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#93a0b4';
      ctx.fillText(`vida ${Math.ceil(meu.hp)}/${meu.hpMax}`, xBarra, y + 12);
      barra(ctx, xBarra, y + 36, larguraBarra, 12, meu.hp / Math.max(1, meu.hpMax), '#7fe7c4');

      // O afeto à direita, em coraçõezinhos — cinco níveis, como o original.
      ctx.textAlign = 'right';
      ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#93a0b4';
      ctx.fillText('afeto', L - margem - 16, y + 12);
      const cheios = Math.round(THREE.MathUtils.clamp(meu.afeto, 0, 1) * 5);
      for (let i = 0; i < 5; i++) {
        const cx = L - margem - 16 - 13 - i * 25;
        estrela(ctx, cx, y + 42, 9, i < cheios ? '#ff8aa8' : 'rgba(255,255,255,0.14)');
      }
      ctx.textAlign = 'left';

      if (meu.shiny) {
        estrela(ctx, margem + 130, y + 24, 11, '#ffd76a');
      }
      y += 74;

      // --- 3. a AVALIAÇÃO ---
      const av = meu.avaliacao;
      ctx.font = '700 19px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#9aa5b8';
      ctx.fillText('AVALIAÇÃO', margem, y);

      // As quatro estrelas, à direita do título.
      for (let i = 0; i < 4; i++) {
        estrela(
          ctx,
          margem + 140 + i * 30,
          y + 9,
          11,
          i < av.estrelas ? '#ffd76a' : 'rgba(255,255,255,0.14)',
        );
      }
      ctx.textAlign = 'right';
      ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = av.estrelas >= 3 ? '#ffd76a' : '#c3ccda';
      ctx.fillText(`${av.percentual}%`, L - margem, y - 2);
      ctx.textAlign = 'left';
      y += 30;

      // As três barras de gene. Quinze é o teto, e a barra cheia é o perfeito
      // — é por isso que ela é a mesma escala para os três, e não normalizada
      // pelo maior: a graça é ver qual encostou no fim.
      const genes: Array<[string, number]> = [
        ['ataque', av.genes.ataque],
        ['defesa', av.genes.defesa],
        ['vida', av.genes.hp],
      ];
      const largGene = (L - margem * 2 - 24) / 3;
      for (let i = 0; i < genes.length; i++) {
        const [rotulo, valor] = genes[i];
        const x = margem + i * (largGene + 12);
        ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = '#93a0b4';
        ctx.fillText(rotulo, x, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = valor >= 15 ? '#ffd76a' : '#c3ccda';
        ctx.fillText(`${valor}/15`, x + largGene, y);
        ctx.textAlign = 'left';
        barra(
          ctx,
          x,
          y + 20,
          largGene,
          10,
          valor / 15,
          valor >= 15 ? '#ffd76a' : valor >= 10 ? '#7fe7c4' : '#6f88b0',
        );
      }
      y += 42;

      ctx.font = '500 17px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#c3ccda';
      ctx.fillText(av.veredito, margem, y, L - margem * 2);
      ctx.fillStyle = '#93a0b4';
      ctx.fillText(
        `${av.destaque}. (${av.total} de ${GENE_MAXIMO})`,
        margem,
        y + 22,
        L - margem * 2,
      );
      y += 54;
    } else {
      ctx.beginPath();
      ctx.roundRect(margem, y, L - margem * 2, 44, 12);
      ctx.fillStyle = 'rgba(28, 38, 56, 0.7)';
      ctx.fill();
      ctx.font = '600 19px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#7f8ba0';
      ctx.fillText('capture um para ver o poder de combate e a avaliação', margem + 16, y + 12);
      y += 58;
    }

    // --- 4. os ATRIBUTOS-BASE ---
    ctx.font = '700 19px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#9aa5b8';
    ctx.fillText('ATRIBUTOS', margem, y);
    y += 26;

    // 190 é o maior atributo-base da primeira geração (a velocidade do
    // Electrode e a defesa especial nenhuma passa disso). Escala fixa, e não
    // relativa ao próprio bicho: é ela que deixa comparar duas fichas.
    const TETO = 190;
    const atributos: Array<[string, number]> = [
      ['VIDA', especie.base.hp],
      ['ATQ', especie.base.atq],
      ['DEF', especie.base.def],
      ['ATQ.ESP', especie.base.atqEsp],
      ['DEF.ESP', especie.base.defEsp],
      ['VEL', especie.base.vel],
    ];
    const colunas = 2;
    const largCol = (L - margem * 2 - 20) / colunas;
    for (let i = 0; i < atributos.length; i++) {
      const [rotulo, valor] = atributos[i];
      const col = i % colunas;
      const lin = Math.floor(i / colunas);
      const x = margem + col * (largCol + 20);
      const yy = y + lin * 26;
      ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#93a0b4';
      ctx.fillText(rotulo, x, yy);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e4eaf4';
      ctx.fillText(`${valor}`, x + largCol, yy);
      ctx.textAlign = 'left';
      barra(ctx, x + 84, yy + 4, largCol - 130, 9, valor / TETO, cor);
    }
    y += 26 * 3 + 12;

    // --- 5. a ficha da espécie ---
    ctx.font = '500 17px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#93a0b4';
    ctx.fillText(
      `${especie.genero} · ${especie.alturaReal.toFixed(1).replace('.', ',')} m · ` +
        `${especie.peso.toFixed(1).replace('.', ',')} kg`,
      margem,
      y,
    );

    // O hábito, à direita da mesma linha.
    //
    // É aqui que o ciclo de dia e noite deixa de ser um número escondido no
    // sorteio: quem procurou um Gengar a tarde inteira precisa poder descobrir
    // POR QUE ele não vem, e a ficha é onde se vai olhar.
    const habito = textoDoHabito(especie.id);
    if (habito) {
      const noturno = habito.includes('noite');
      const corHabito = noturno ? '#a9b6ff' : '#ffd98a';
      ctx.textAlign = 'right';
      ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = corHabito;
      ctx.fillText(habito, L - margem, y + 1);
      const largura = ctx.measureText(habito).width;
      luaOuSol(ctx, L - margem - 11 - largura, y + 9, 7, corHabito, noturno);
      ctx.textAlign = 'left';
    }
    y += 26;

    // A descrição só aparece depois de capturado: é o prêmio de ter pegado.
    ctx.font = '500 17px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = estado.capturado ? '#c3ccda' : '#6f7b8e';
    const texto = estado.capturado ? especie.descricao : 'capture para ler a ficha completa';
    const linhas = this.escreverEmLinhas(ctx, texto, margem, y, L - margem * 2, 22, 2);
    y += linhas * 22 + 14;

    // --- 6. os GOLPES que ele chega a ter ---
    //
    // É a informação que decide uma batalha e que hoje só aparece no painel do
    // pulso, e só de quem está em campo. Numa ficha de espécie ela responde à
    // pergunta que se faz ANTES de capturar: vale a pena?
    ctx.font = '700 19px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#9aa5b8';
    ctx.fillText('GOLPES', margem, y);
    y += 26;

    const golpes = especie.golpes.slice(0, 4);
    const largGolpe = (L - margem * 2 - 16) / 2;
    for (let i = 0; i < golpes.length; i++) {
      const golpe = golpes[i];
      const x = margem + (i % 2) * (largGolpe + 16);
      const yy = y + Math.floor(i / 2) * 30;
      const corGolpe = `#${new THREE.Color(TIPOS[golpe.tipo].cor).getHexString()}`;
      ctx.beginPath();
      ctx.roundRect(x, yy, largGolpe, 25, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
      // A pinta do tipo à esquerda: quatro nomes de golpe seguidos viram uma
      // parede de texto, e a cor é o que se lê primeiro.
      ctx.beginPath();
      ctx.roundRect(x + 6, yy + 6, 5, 13, 2.5);
      ctx.fillStyle = corGolpe;
      ctx.fill();
      ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#dbe3ef';
      ctx.fillText(golpe.nome, x + 18, yy + 4, largGolpe - 74);
      ctx.textAlign = 'right';
      ctx.fillStyle = golpe.potencia > 0 ? '#93a0b4' : '#6f7b8e';
      ctx.fillText(golpe.potencia > 0 ? `${golpe.potencia}` : 'status', x + largGolpe - 10, yy + 4);
      ctx.textAlign = 'left';
    }
    y += Math.ceil(golpes.length / 2) * 30 + 6;

    // --- 7. a EVOLUÇÃO ---
    if (especie.evolui) {
      const adiante = ESPECIES.find((e) => e.id === especie.evolui!.para);
      if (adiante) {
        ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = '#93a0b4';
        const quando =
          especie.evolui.nivel > 0
            ? `no nível ${especie.evolui.nivel}`
            : 'com uma pedra';
        ctx.fillText(`evolui para ${adiante.nome} ${quando}`, margem, y);
      }
    }

    ctx.restore();
    this.fichaCheia.marcarSujo();
  }

  /**
   * Quebra o texto em até `maximo` linhas, sem cortar palavra no meio.
   * Devolve quantas linhas escreveu, para quem continua desenhando abaixo.
   */
  private escreverEmLinhas(
    ctx: CanvasRenderingContext2D,
    texto: string,
    x: number,
    y: number,
    largura: number,
    entrelinha: number,
    maximo: number,
  ): number {
    const palavras = texto.split(' ');
    const linhas: string[] = [];
    let atual = '';
    for (const palavra of palavras) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(tentativa).width > largura && atual) {
        linhas.push(atual);
        atual = palavra;
        if (linhas.length === maximo) break;
      } else {
        atual = tentativa;
      }
    }
    if (linhas.length < maximo && atual) linhas.push(atual);
    for (let i = 0; i < linhas.length; i++) ctx.fillText(linhas[i], x, y + i * entrelinha, largura);
    return linhas.length;
  }

  /**
   * Desenha a Pokédex. Quem diz se ela está ligada é o TABLET.
   *
   * Isto aqui já decidiu sozinho: lia o gesto do relógio no pulso direito e se
   * posicionava flutuando acima dele. Agora a Pokédex é uma coisa que se pega
   * (ver src/tablet.ts), e estas placas são só a TELA dela — quem sabe onde a
   * tela está no mundo é a carcaça, que é filha da mão que a segura. Uma tela
   * que se reposiciona sozinha dentro de um objeto que também se move seria
   * duas leis de movimento para a mesma coisa.
   */
  atualizar(
    dt: number,
    naMao: boolean,
    mira: { origem: THREE.Vector3; direcao: THREE.Vector3 } | null,
  ) {
    this.aberto = naMao;

    this.abertura += ((naMao ? 1 : 0) - this.abertura) * Math.min(1, dt * 10);
    // A tela acende e apaga; a carcaça continua lá, nas suas costas.
    this.grupo.visible = this.abertura > 0.03;
    if (!this.grupo.visible) {
      this.destacado = -1;
      // Largar a Pokédex fecha a ficha: voltar a pegá-la tem de devolver a
      // grade, que é a tela de onde se navega.
      this.fecharFicha();
      return;
    }

    const naFicha = this.fichaDe !== null;
    this.grade.malha.visible = !naFicha;
    this.resumo.malha.visible = !naFicha;
    this.fichaCheia.malha.visible = naFicha;
    for (const alvo of this.alvos) alvo.visible = !naFicha;
    this.alvoVoltar.visible = naFicha;

    const anterior = this.destacado;
    let sobAMira = -1;
    let voltar = false;
    if (mira && this.abertura > 0.6) {
      this.raycaster.set(mira.origem, mira.direcao);
      if (naFicha) {
        voltar = this.raycaster.intersectObject(this.alvoVoltar, false).length > 0;
      } else {
        const acertos = this.raycaster.intersectObjects(this.alvos, false);
        if (acertos.length > 0) sobAMira = acertos[0].object.userData.indice as number;
      }
    }
    const mudouVoltar = voltar !== this.voltarSobAMira;
    this.voltarSobAMira = voltar;

    // As SETAS: apontar para elas e puxar o gatilho vira a página, para quem
    // não quer (ou não pode) usar o analógico. Pedido do playtest de 19/09:
    // *"a Pokédex precisa ser rolável para encontrar os Pokémon"*.
    this.setaSobAMira = sobAMira === -2 ? -1 : sobAMira === -3 ? 1 : 0;

    // Uma ficha fixada pelo escaneamento sobrevive até a mira achar OUTRA
    // célula. Ver `fixar`.
    if (sobAMira >= 0) {
      this.destacado = sobAMira;
      this.fixado = false;
    } else if (!this.fixado && !naFicha) {
      this.destacado = -1;
    }
    this.mudouDestaque = this.destacado !== -1 && this.destacado !== anterior;

    const assinatura =
      `${this.pagina}|${this.destacado}|${this.setaSobAMira}|${this.resumoEstados}` +
      `|${this.fichaDe ?? '-'}|${voltar ? 1 : 0}`;
    if (assinatura !== this.assinatura || mudouVoltar) {
      this.assinatura = assinatura;
      if (naFicha) {
        this.desenharFichaCheia();
      } else {
        this.desenharGrade();
        this.desenharResumo();
      }
    }
  }

  descartar() {
    this.grade.descartar();
    this.resumo.descartar();
    this.fichaCheia.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
