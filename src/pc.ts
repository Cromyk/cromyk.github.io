import * as THREE from 'three';
import { Placa } from './hud';
import { TIPOS, porId } from './species';
import {
  COR,
  RAIO,
  barra,
  cartao,
  corDaVida,
  fonte,
  hex,
  nomeComBrilho,
  pilula,
} from './estilo';
import { TAMANHO_TIME, type Dex, type Exemplar } from './state';
import { recompensaPorSoltar, pedraDoTipo, type Achado } from './itens';
import { pedraPorId } from './pedras';

/**
 * O PC do treinador: a caixa inteira e a sua equipe, lado a lado, para você
 * arrastar um bicho de uma para a outra.
 *
 * ## Por que ele não é mais um painel de pulso
 *
 * O time e a Pokédex ficam presos ao pulso porque são consulta rápida: abrem
 * com um giro, você olha e fecha. Reorganizar a coleção não é isso. É uma tarefa
 * de dois toques por bicho, com os dois lados à vista, e fazer isso num painel
 * de vinte centímetros pendurado no braço — que se mexe junto com o braço que
 * aponta — seria brigar com o próprio painel.
 *
 * Então o PC é um MÓVEL: aparece à sua frente, fica onde apareceu e não segue
 * ninguém. Você pode dar um passo para trás para ver tudo, ou chegar perto para
 * ler. É a única coisa no jogo que se comporta assim, e é por isso que ela
 * parece um computador e não um menu.
 *
 * ## Como se mexe
 *
 * Aponte um Pokémon e SEGURE o gatilho: ele fica na sua mão enquanto o dedo
 * estiver puxando. Leve a mira até a vaga e solte. Vaga ocupada troca os dois;
 * vaga vazia recebe; e tirar alguém do time deixa a vaga **vazia** — que era a
 * operação que o modelo de dois toques não sabia fazer, porque trocar sempre
 * põe alguém no lugar de alguém.
 *
 * Tudo é desenhado num canvas só. São até vinte e quatro cartas visíveis, e uma
 * textura por carta encheria a memória do headset para desenhar um menu.
 */

const LARGURA = 0.92;
const ALTURA = 0.58;
const PX = 1560;

const COLUNAS_CAIXA = 6;
const LINHAS_CAIXA = 3;
const POR_PAGINA = COLUNAS_CAIXA * LINHAS_CAIXA;

export type AlvoPc =
  | { tipo: 'time'; indice: number }
  | { tipo: 'caixa'; indice: number }
  | { tipo: 'pagina'; direcao: 1 | -1 }
  | { tipo: 'curar' }
  | { tipo: 'soltar' }
  | { tipo: 'fechar' };

/** O que a natureza devolveu pelo bicho que você soltou. Ver `soltarArrasto`. */
export interface Despedida {
  nome: string;
  itens: Achado[];
}

export class PainelPc {
  readonly grupo = new THREE.Group();
  aberto = false;
  mudouDestaque = false;
  /** Quem está na mão: índice em `dex.todos`, ou −1. */
  pegou = -1;
  /**
   * O último bicho solto na natureza e o que ele rendeu.
   *
   * Fica aqui para quem tem VOZ e TELA — o `Jogo` — dizer o que aconteceu: o
   * painel sabe soltar e sabe pagar, mas não sabe falar. Quem lê, limpa.
   */
  despedida: Despedida | null = null;

  private placa = new Placa(LARGURA, ALTURA, PX);
  private alvos: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private destacado: AlvoPc | null = null;
  private pagina = 0;
  private abertura = 0;
  private assinatura = '';
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private dex: Dex | null = null;

  // Geometria da tela, em pixels do canvas. Uma medida só, usada para desenhar
  // e para posicionar os alvos — foi o que evitou o menu onde o clique cai a
  // meia carta do que se vê.
  private static readonly MARGEM = 34;
  /** Onde a área de soltar fica no rodapé, em pixels do canvas. */
  private static readonly SOLTAR_X = 348;
  private static readonly SOLTAR_L = 360;
  private static readonly TOPO = 96;
  private static readonly CARD_L = 224;
  private static readonly CARD_A = 150;
  private static readonly VAO = 14;

  constructor() {
    this.grupo.add(this.placa.malha);
    this.grupo.visible = false;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this.descartaveis.push(geo, mat);

    const novoAlvo = (dados: AlvoPc, x: number, y: number, l: number, a: number) => {
      const alvo = new THREE.Mesh(geo, mat);
      alvo.scale.set(this.emMetrosX(l), this.emMetrosY(a), 1);
      alvo.position.set(this.paraX(x + l / 2), this.paraY(y + a / 2), 0.002);
      alvo.userData.pc = dados;
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    };

    for (let i = 0; i < TAMANHO_TIME; i++) {
      const { x, y } = this.vagaDoTime(i);
      novoAlvo({ tipo: 'time', indice: i }, x, y, PainelPc.CARD_L, PainelPc.CARD_A);
    }
    for (let i = 0; i < POR_PAGINA; i++) {
      const { x, y } = this.vagaDaCaixa(i);
      novoAlvo({ tipo: 'caixa', indice: i }, x, y, PainelPc.CARD_L, PainelPc.CARD_A * 0.72);
    }

    const alturaCanvas = this.placa.canvas.height;
    const rodape = alturaCanvas - 66;
    novoAlvo({ tipo: 'pagina', direcao: -1 }, PainelPc.MARGEM, rodape, 120, 54);
    novoAlvo({ tipo: 'pagina', direcao: 1 }, PainelPc.MARGEM + 132, rodape, 120, 54);
    // A área de soltar fica no meio do rodapé, longe das duas pontas: ela é a
    // única coisa irreversível desta tela, e não pode ficar encostada no botão
    // de fechar. Ver `soltarArrasto`.
    novoAlvo({ tipo: 'soltar' }, PainelPc.SOLTAR_X, rodape, PainelPc.SOLTAR_L, 54);
    novoAlvo({ tipo: 'curar' }, PX - PainelPc.MARGEM - 400, rodape, 190, 54);
    novoAlvo({ tipo: 'fechar' }, PX - PainelPc.MARGEM - 190, rodape, 190, 54);
  }

  // Canvas → metros. O canvas tem a proporção do painel, então as duas contas
  // são a mesma escala.
  private emMetrosX(px: number) {
    return (px / PX) * LARGURA;
  }
  private emMetrosY(px: number) {
    return (px / this.placa.canvas.height) * ALTURA;
  }
  private paraX(px: number) {
    return this.emMetrosX(px) - LARGURA / 2;
  }
  private paraY(px: number) {
    return ALTURA / 2 - this.emMetrosY(px);
  }

  private vagaDoTime(i: number) {
    return {
      x: PainelPc.MARGEM + i * (PainelPc.CARD_L + PainelPc.VAO),
      y: PainelPc.TOPO,
    };
  }

  private vagaDaCaixa(i: number) {
    const col = i % COLUNAS_CAIXA;
    const lin = Math.floor(i / COLUNAS_CAIXA);
    const altura = PainelPc.CARD_A * 0.72;
    return {
      x: PainelPc.MARGEM + col * (PainelPc.CARD_L + PainelPc.VAO),
      y: PainelPc.TOPO + PainelPc.CARD_A + 78 + lin * (altura + PainelPc.VAO),
    };
  }

  get totalPaginas(): number {
    if (!this.dex) return 1;
    return Math.max(1, Math.ceil(this.dex.guardados.length / POR_PAGINA));
  }

  definirDex(dex: Dex) {
    this.dex = dex;
  }

  /**
   * Abre o PC à frente do jogador e o ancora ali. Reabrir reposiciona: se você
   * andou até a cozinha, o PC vem para a cozinha.
   */
  abrir(camera: THREE.Camera) {
    this.aberto = true;
    this.pegou = -1;
    this.assinatura = '';

    const cabeca = camera.getWorldPosition(new THREE.Vector3());
    const frente = new THREE.Vector3();
    camera.getWorldDirection(frente);
    frente.y = 0;
    if (frente.lengthSq() < 1e-4) frente.set(0, 0, -1);
    frente.normalize();

    this.grupo.position.copy(cabeca).addScaledVector(frente, 1.05);
    // Um pouco abaixo dos olhos: ler para baixo cansa menos do que para cima, e
    // as mãos apontam mais confortavelmente na altura do peito.
    this.grupo.position.y = cabeca.y - 0.12;
    this.grupo.lookAt(cabeca);
  }

  fechar() {
    this.aberto = false;
    this.pegou = -1;
  }

  virarPagina(direcao: 1 | -1) {
    this.pagina = (this.pagina + direcao + this.totalPaginas) % this.totalPaginas;
    this.assinatura = '';
  }

  /** O índice em `dex.todos` que uma vaga representa, ou −1 se ela está vazia. */
  private indiceReal(alvo: AlvoPc): number {
    if (!this.dex) return -1;
    if (alvo.tipo === 'time') {
      // Pela OCUPAÇÃO, não pelo tamanho da lista: desde que o time tem vagas
      // vazias, `time.length` é sempre seis, e comparar com ele faria toda vaga
      // vazia se passar por ocupada — o arrasto largaria o bicho em cima do
      // nada e o `trocar` cuidaria de sumir com ele.
      return this.dex.time[alvo.indice] ? alvo.indice : -1;
    }
    if (alvo.tipo === 'caixa') {
      const i = this.pagina * POR_PAGINA + alvo.indice;
      return i < this.dex.guardados.length ? TAMANHO_TIME + i : -1;
    }
    return -1;
  }

  /**
   * O gatilho DESCEU sobre a mira. Começa o arrasto, ou aciona um botão.
   *
   * Desde 18/09 o PC é arrastar, e não mais dois toques. A diferença não é de
   * conforto: com dois toques, "pegar" e "largar" são o mesmo gesto e o estado
   * fica invisível entre eles — você aponta, puxa, e a única forma de saber que
   * está com um bicho na mão é reparar na carta acesa. Segurando, a mão sabe: o
   * gatilho está puxado, e enquanto estiver, o bicho está com você.
   *
   * Botões — página, curar, fechar — continuam resolvendo aqui, na descida: um
   * botão não se arrasta.
   */
  comecarArrasto(): 'pegou' | 'curou' | 'fechou' | 'pagina' | null {
    const alvo = this.destacado;
    if (!alvo || !this.dex) return null;

    if (alvo.tipo === 'fechar') {
      this.fechar();
      return 'fechou';
    }
    if (alvo.tipo === 'pagina') {
      this.virarPagina(alvo.direcao);
      return 'pagina';
    }
    if (alvo.tipo === 'curar') {
      this.dex.curarTime();
      this.assinatura = '';
      return 'curou';
    }

    const indice = this.indiceReal(alvo);
    if (indice < 0) return null;
    this.pegou = indice;
    this.assinatura = '';
    return 'pegou';
  }

  /**
   * O gatilho SUBIU. Solta o que estava na mão onde a mira estiver.
   *
   * Soltar no mesmo lugar de onde saiu não é erro nem desistência: é o gesto de
   * quem pegou para olhar e devolveu. Por isso devolve `largou`, e não `null`.
   */
  soltarArrasto(): 'largou' | 'trocou' | 'moveu' | 'soltou' | 'recusou' | null {
    if (this.pegou < 0 || !this.dex) return null;

    const de = this.pegou;
    this.pegou = -1;
    this.assinatura = '';

    const alvo = this.destacado;

    // SOLTAR NA NATUREZA — pedido do playtest de 19/09.
    //
    // É a única coisa irreversível desta tela, e por isso ela pede um gesto
    // inteiro: pegar o bicho, atravessar o painel com ele na mão e largar numa
    // área que está escrita em vermelho. Não há confirmação depois, pelo mesmo
    // motivo que a pedra não tem — a confirmação é o caminho até aqui.
    //
    // O que não se faz é ficar sem ninguém: `Dex.soltar` recusa o último, e a
    // recusa volta como `'recusou'` para o jogo poder dizer por quê em vez de
    // engolir o gesto calado.
    if (alvo?.tipo === 'soltar') {
      const quem = this.dex.todosComVagas[de] ?? null;
      const especie = quem ? porId(quem.id) : null;
      if (!quem || !especie) return 'largou';
      const nivel = this.dex.nivelDe(quem);
      const saiu = this.dex.soltar(de);
      if (!saiu) return 'recusou';

      const itens = recompensaPorSoltar(especie.tipos, nivel);
      for (const item of itens) this.dex.ganharItem(item.id, item.quantidade);
      this.despedida = { nome: especie.nome, itens };
      return 'soltou';
    }
    // Soltou fora de qualquer vaga — no cabeçalho, no vão entre cartas, ou com
    // a mira já fora do painel. O bicho volta para onde estava, que é o que
    // qualquer coisa arrastada faz quando se solta no lugar errado.
    if (!alvo || (alvo.tipo !== 'time' && alvo.tipo !== 'caixa')) return 'largou';

    const indice = this.indiceReal(alvo);
    if (indice === de) return 'largou';

    // Vaga vazia: o índice real não existe, então o destino é a POSIÇÃO em que
    // a mão soltou — a vaga de time em que você mirou, ou o fim da caixa.
    const destino =
      indice >= 0
        ? indice
        : alvo.tipo === 'time'
          ? alvo.indice
          : TAMANHO_TIME + this.dex.guardados.length;

    return this.dex.arrastar(de, destino) ?? 'largou';
  }

  /** O bicho que está sendo arrastado agora, se houver. */
  get arrastando(): Exemplar | null {
    if (this.pegou < 0 || !this.dex) return null;
    return this.dex.todosComVagas[this.pegou] ?? null;
  }

  // ------------------------------------------------------------ desenho

  private cartaDe(exemplar: Exemplar | null | undefined) {
    if (!exemplar || !this.dex) return null;
    const especie = porId(exemplar.id);
    if (!especie) return null;
    return {
      exemplar,
      especie,
      nivel: this.dex.nivelDe(exemplar),
      hp: exemplar.hp,
      hpMax: this.dex.hpMaxDe(exemplar),
    };
  }

  private desenhar() {
    if (!this.dex) return;
    const { ctx, canvas } = this.placa;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, {}, 26);

    // --- cabeçalho ---
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = fonte(44, 700);
    ctx.fillStyle = COR.texto;
    ctx.fillText('PC do treinador', PainelPc.MARGEM, 26);

    ctx.font = fonte(26, 500);
    ctx.fillStyle = COR.textoFraco;
    ctx.fillText(
      this.pegou >= 0
        ? 'ainda segurando — solte o gatilho na vaga onde ele deve ficar'
        : 'aponte, SEGURE o gatilho e leve até a vaga',
      PainelPc.MARGEM + 380,
      42,
    );

    ctx.textAlign = 'right';
    ctx.font = fonte(26, 700);
    ctx.fillStyle = COR.bom;
    ctx.fillText(`${this.dex.todos.length} na coleção`, canvas.width - PainelPc.MARGEM, 40);

    // --- equipe ---
    const time = this.dex.time;
    for (let i = 0; i < TAMANHO_TIME; i++) {
      const { x, y } = this.vagaDoTime(i);
      this.desenharCarta(
        x,
        y,
        PainelPc.CARD_L,
        PainelPc.CARD_A,
        this.cartaDe(time[i]),
        this.destacado?.tipo === 'time' && this.destacado.indice === i,
        this.pegou === i,
        true,
      );
    }

    const yCaixa = PainelPc.TOPO + PainelPc.CARD_A + 32;
    ctx.textAlign = 'left';
    ctx.font = fonte(28, 700);
    ctx.fillStyle = COR.textoFraco;
    ctx.fillText('CAIXA', PainelPc.MARGEM, yCaixa);

    // --- caixa ---
    const guardados = this.dex.guardados;
    const inicio = this.pagina * POR_PAGINA;
    for (let i = 0; i < POR_PAGINA; i++) {
      const { x, y } = this.vagaDaCaixa(i);
      const real = TAMANHO_TIME + inicio + i;
      this.desenharCarta(
        x,
        y,
        PainelPc.CARD_L,
        PainelPc.CARD_A * 0.72,
        this.cartaDe(guardados[inicio + i]),
        this.destacado?.tipo === 'caixa' && this.destacado.indice === i,
        this.pegou === real,
        false,
      );
    }

    // --- rodapé ---
    const rodape = canvas.height - 66;
    this.botao(PainelPc.MARGEM, rodape, 120, 54, '‹', this.destacado?.tipo === 'pagina' && this.destacado.direcao === -1);
    this.botao(PainelPc.MARGEM + 132, rodape, 120, 54, '›', this.destacado?.tipo === 'pagina' && this.destacado.direcao === 1);

    ctx.textAlign = 'left';
    ctx.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = COR.textoFraco;
    ctx.fillText(`${this.pagina + 1}/${this.totalPaginas}`, PainelPc.MARGEM + 266, rodape + 14);

    // A área de soltar. Ela só fica ACESA com um bicho na mão: parada, é um
    // lembrete apagado de que existe; com alguém na mão, é uma porta aberta.
    this.areaDeSoltar(PainelPc.SOLTAR_X, rodape, PainelPc.SOLTAR_L, 54);

    this.botao(canvas.width - PainelPc.MARGEM - 400, rodape, 190, 54, 'curar time', this.destacado?.tipo === 'curar', COR.bom);
    this.botao(canvas.width - PainelPc.MARGEM - 190, rodape, 190, 54, 'fechar', this.destacado?.tipo === 'fechar', COR.ruim);

    this.placa.marcarSujo();
  }

  /**
   * "Soltar na natureza": a porta de saída, e o que ela paga.
   *
   * Ela muda de cara conforme o que está acontecendo, porque as três situações
   * pedem três coisas diferentes:
   *
   * - **Mão vazia.** Tracejado apagado: existe, não convida.
   * - **Com um bicho na mão.** Acende e passa a DIZER O PREÇO — qual pedra
   *   aquele bicho vale. É a informação que faz o gesto ser uma escolha e não
   *   uma aposta.
   * - **Com a mira em cima.** Vermelho cheio, e o aviso de que não volta.
   */
  private areaDeSoltar(x: number, y: number, l: number, a: number) {
    const { ctx } = this.placa;
    const arrastando = this.arrastando;
    const sobMira = this.destacado?.tipo === 'soltar';
    const especie = arrastando ? porId(arrastando.id) : null;

    if (!arrastando) {
      ctx.save();
      ctx.setLineDash([9, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(x, y, l, a, RAIO.pequeno);
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fonte(22, 600);
      ctx.fillStyle = 'rgba(154,165,184,0.65)';
      ctx.fillText('arraste aqui para soltar na natureza', x + l / 2, y + a / 2 + 1);
      ctx.textBaseline = 'top';
      return;
    }

    cartao(ctx, x, y, l, a, { sobMira, ativo: sobMira }, RAIO.pequeno);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fonte(25, 700);
    ctx.fillStyle = sobMira ? COR.ruim : COR.texto;
    ctx.fillText(
      sobMira ? 'soltar — e não volta' : 'soltar na natureza',
      x + l / 2,
      y + a / 2 - 8,
    );

    const pedra = especie ? pedraPorId(pedraDoTipo(especie.tipos)) : null;
    ctx.font = fonte(20, 600);
    ctx.fillStyle = pedra ? hex(pedra.cor) : COR.textoFraco;
    ctx.fillText(pedra ? `rende ${pedra.nome} + itens` : 'rende itens', x + l / 2, y + a / 2 + 16);
    ctx.textBaseline = 'top';
  }

  private botao(
    x: number,
    y: number,
    l: number,
    a: number,
    texto: string,
    sobMira: boolean,
    cor: string = COR.texto,
  ) {
    const { ctx } = this.placa;
    cartao(ctx, x, y, l, a, { sobMira }, RAIO.pequeno);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fonte(26, 700);
    ctx.fillStyle = cor;
    ctx.fillText(texto, x + l / 2, y + a / 2 + 1);
    ctx.textBaseline = 'top';
  }

  private desenharCarta(
    x: number,
    y: number,
    l: number,
    a: number,
    carta: ReturnType<PainelPc['cartaDe']>,
    sobMira: boolean,
    naMao: boolean,
    doTime: boolean,
  ) {
    const { ctx } = this.placa;

    if (!carta) {
      // Vaga vazia: tracejado. Ela continua clicável — é onde se larga um bicho
      // sem trocar com ninguém.
      ctx.beginPath();
      ctx.roundRect(x, y, l, a, 14);
      ctx.fillStyle = sobMira ? 'rgba(28,40,60,0.8)' : 'rgba(14,20,30,0.45)';
      ctx.fill();
      ctx.setLineDash([9, 7]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = sobMira ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)';
      ctx.stroke();
      ctx.setLineDash([]);
      if (doTime) {
        ctx.textAlign = 'center';
        ctx.font = fonte(24, 600);
        ctx.fillStyle = 'rgba(160,176,200,0.5)';
        ctx.fillText('vaga livre', x + l / 2, y + a / 2 - 12);
      }
      return;
    }

    const corTipo = hex(TIPOS[carta.especie.tipo].cor);
    const desmaiado = carta.hp <= 0;

    cartao(
      ctx,
      x,
      y,
      l,
      a,
      { sobMira, ativo: naMao, apagado: desmaiado, acento: TIPOS[carta.especie.tipo].cor },
      RAIO.pequeno,
    );

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = fonte(28, 700);
    ctx.fillStyle = desmaiado ? COR.textoApagado : carta.exemplar.shiny ? '#ffe08a' : COR.texto;
    // Cortado com reticências em vez de comprimido: `maxWidth` do canvas espreme
    // a letra, e um "Charmeleon" achatado a 60% fica pior do que "Charmele…".
    nomeComBrilho(ctx, carta.especie.nome, carta.exemplar.shiny, x + 14, y + 26, 28, l - 78);

    ctx.textAlign = 'right';
    ctx.font = fonte(24, 700);
    ctx.fillStyle = COR.texto;
    ctx.fillText(`N${carta.nivel}`, x + l - 14, y + 27);

    // Barra de vida.
    const barraY = y + a - 30;
    const larguraBarra = l - 28;
    const fracao = Math.max(0, carta.hp / Math.max(1, carta.hpMax));
    barra(ctx, x + 14, barraY, larguraBarra, 11, fracao, corDaVida(fracao), { minimo: 10 });

    ctx.textAlign = 'left';
    ctx.font = fonte(21, 600);
    ctx.fillStyle = desmaiado ? COR.ruim : COR.textoFraco;
    ctx.fillText(
      desmaiado ? 'desmaiado' : `${Math.ceil(carta.hp)}/${carta.hpMax}`,
      x + 14,
      barraY - 26,
    );

    if (a > 120) {
      // O tipo tem de caber no que sobra depois do número de vida, senão a
      // pílula passa por cima dele — foi o que FANTASMA/VENENO fazia.
      pilula(
        ctx,
        carta.especie.tipos.map((t) => TIPOS[t].nome).join('/').toUpperCase(),
        x + l - 14,
        barraY - 30,
        24,
        corTipo,
        { alinhar: 'right', maxLargura: l * 0.56 },
      );
    }
  }

  // ------------------------------------------------------------ quadro

  atualizar(
    dt: number,
    miras: Array<{ origem: THREE.Vector3; direcao: THREE.Vector3 }>,
    camera: THREE.Camera,
  ) {
    this.abertura += ((this.aberto ? 1 : 0) - this.abertura) * Math.min(1, dt * 11);
    this.grupo.visible = this.abertura > 0.02;
    if (!this.grupo.visible) {
      this.destacado = null;
      return;
    }
    this.grupo.scale.setScalar(0.8 + this.abertura * 0.2);
    void camera;

    const anterior = this.destacado;
    this.destacado = null;
    if (this.abertura > 0.6) {
      const visiveis = this.alvos.filter((a) => a.visible);
      for (const mira of miras) {
        this.raycaster.set(mira.origem, mira.direcao);
        const acertos = this.raycaster.intersectObjects(visiveis, false);
        if (acertos.length > 0) {
          this.destacado = acertos[0].object.userData.pc as AlvoPc;
          break;
        }
      }
    }

    const chaveDestaque = this.destacado
      ? `${this.destacado.tipo}:${'indice' in this.destacado ? this.destacado.indice : 'direcao' in this.destacado ? this.destacado.direcao : 0}`
      : '-';
    const chaveAnterior = anterior
      ? `${anterior.tipo}:${'indice' in anterior ? anterior.indice : 'direcao' in anterior ? anterior.direcao : 0}`
      : '-';
    this.mudouDestaque = this.destacado !== null && chaveDestaque !== chaveAnterior;

    const assinatura = [
      chaveDestaque,
      this.pegou,
      this.pagina,
      this.dex?.todos
        .map((e) => `${e.id}:${Math.ceil(e.hp)}:${this.dex!.nivelDe(e)}`)
        .join(',') ?? '',
    ].join('|');
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.desenhar();
    }
  }

  /** Onde a mira está pousada, para o jogo saber se o gatilho tem o que fazer. */
  get temAlvo(): boolean {
    return this.destacado !== null;
  }

  descartar() {
    this.placa.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
