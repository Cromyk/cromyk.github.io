import * as THREE from 'three';
import {
  COR,
  RAIO,
  TEXTO,
  barra,
  cartao,
  corDaVida,
  fonte,
  hex,
  pilula,
  textoAjustado,
} from './estilo';

export interface LinhaTexto {
  texto: string;
  tamanho?: number;
  cor?: string;
  peso?: number;
  espaco?: number;
}

/**
 * Placa de texto desenhada num canvas 2D e usada como textura. É assim que o
 * jogo tem tipografia sem carregar nenhuma fonte.
 */
export class Placa {
  readonly malha: THREE.Mesh;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private textura: THREE.CanvasTexture;
  private material: THREE.MeshBasicMaterial;
  private geometria: THREE.PlaneGeometry;

  constructor(larguraM: number, alturaM: number, px = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = Math.round(px * (alturaM / larguraM));
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.textura = new THREE.CanvasTexture(canvas);
    this.textura.colorSpace = THREE.SRGBColorSpace;
    this.textura.anisotropy = 4;

    this.material = new THREE.MeshBasicMaterial({
      map: this.textura,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.geometria = new THREE.PlaneGeometry(larguraM, alturaM);
    this.malha = new THREE.Mesh(this.geometria, this.material);
    this.malha.renderOrder = 10;
  }

  set opacidade(v: number) {
    this.material.opacity = v;
  }

  marcarSujo() {
    this.textura.needsUpdate = true;
  }

  limpar(fundo = 'rgba(14, 18, 28, 0.88)', borda = 'rgba(255,255,255,0.14)', raio = 28) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, raio);
    ctx.fillStyle = fundo;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = borda;
    ctx.stroke();
  }

  escrever(linhas: LinhaTexto[], opcoes: { fundo?: string; borda?: string; raio?: number } = {}) {
    const { ctx, canvas } = this;
    this.limpar(opcoes.fundo, opcoes.borda, opcoes.raio);

    const alturaTotal = linhas.reduce(
      (soma, l) => soma + (l.tamanho ?? 44) * 1.28 + (l.espaco ?? 0),
      0,
    );
    let y = (canvas.height - alturaTotal) / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const linha of linhas) {
      const tamanho = linha.tamanho ?? 44;
      ctx.font = `${linha.peso ?? 600} ${tamanho}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.fillStyle = linha.cor ?? '#eef2f8';
      ctx.fillText(linha.texto, canvas.width / 2, y, canvas.width - 40);
      y += tamanho * 1.28 + (linha.espaco ?? 0);
    }

    this.marcarSujo();
  }

  descartar() {
    this.geometria.dispose();
    this.material.dispose();
    this.textura.dispose();
  }
}

/** Aviso grande que aparece à frente do jogador e some sozinho. */
/**
 * O tamanho do HUD, e a distância a que ele fica dos seus olhos.
 *
 * ## Por que existe um número só para isso
 *
 * O cartaz de aviso é a coisa mais vista do jogo depois da sua própria mão:
 * ele aparece na captura, no golpe, no achado, no carinho, no erro. Ele
 * nasceu com 46 × 22 cm a noventa centímetros do rosto — o que, na conta do
 * ângulo, ocupa uns 29 graus de campo de visão na horizontal.
 *
 * Vinte e nove graus é MUITO. O campo útil de um Quest 3 tem uns 110, e um
 * cartaz de trinta cobre a área onde o Pokémon costuma estar: na prática, o
 * aviso tapava justamente aquilo sobre o que ele estava avisando.
 *
 * O playtest de 19/09 pediu "redesenhar o tamanho do HUD", e o conserto é
 * este número: 0,78 põe o cartaz em 23 graus, que é o que um letreiro de
 * cinema ocupa visto da última fileira — dá para ler de relance sem tirar o
 * mundo de trás dele.
 *
 * Fica como AJUSTE e não como decisão minha porque tamanho de interface é
 * pessoal: quem usa óculos por baixo do headset, quem tem o headset mais
 * afastado do rosto e quem simplesmente enxerga menos precisam de números
 * diferentes. Ver `HUD` em src/ajustes.ts.
 */
export const ESCALA_DO_HUD = { valor: 0.78 };

export class Aviso {
  readonly placa = new Placa(0.46, 0.22, 640);
  private restante = 0;
  private duracao = 1;
  /** Aviso fixo: fica até alguém soltar. Ver `fixar`. */
  private preso = false;
  private opacidadePresa = 0;
  /** Cartões esperando a vez. Ver `emSeguida`. */
  private fila: Array<{
    linhas: LinhaTexto[];
    duracao: number;
    opcoes?: Parameters<Placa['escrever']>[1];
  }> = [];

  constructor(private readonly cena: THREE.Object3D) {
    this.placa.malha.visible = false;
    this.cena.add(this.placa.malha);
  }

  mostrar(linhas: LinhaTexto[], duracao = 2.4, opcoes?: Parameters<Placa['escrever']>[1]) {
    // Um cartão novo cancela o que estava esperando: quem chamou `mostrar`
    // quis dizer "esqueça o resto, é isto agora".
    this.fila.length = 0;
    this.exibir(linhas, duracao, opcoes);
  }

  /** Põe o cartão na placa sem opinar sobre a fila. */
  private exibir(
    linhas: LinhaTexto[],
    duracao: number,
    opcoes?: Parameters<Placa['escrever']>[1],
  ) {
    this.placa.escrever(linhas, opcoes);
    this.restante = duracao;
    this.duracao = duracao;
    this.placa.malha.visible = true;
  }

  /**
   * O cartão que espera a vez.
   *
   * `mostrar` TROCA o texto da placa; dois cartões seguidos são um cartão só, o
   * segundo, e o primeiro some antes de ser lido. Isso já mordeu três vezes —
   * o nível competindo com a evolução, o golpe novo competindo com o nível, e
   * agora o marco da Pokédex competindo com a captura que o produziu. Onde as
   * duas coisas cabem numa frase, a saída certa continua sendo caber; onde são
   * dois assuntos, é esperar a vez.
   *
   * A fila é curta de propósito. Quem chega com ela cheia é descartado: três
   * cartões em sequência já é uma palestra, e em VR ler é parar.
   */
  emSeguida(linhas: LinhaTexto[], duracao = 2.4, opcoes?: Parameters<Placa['escrever']>[1]) {
    if (this.restante <= 0 && !this.preso) {
      this.mostrar(linhas, duracao, opcoes);
      return;
    }
    if (this.fila.length >= 2) return;
    this.fila.push({ linhas, duracao, opcoes });
  }

  /** Há alguma coisa na tela ou esperando para entrar. */
  get ocupado(): boolean {
    return this.preso || this.restante > 0 || this.fila.length > 0;
  }

  /**
   * Um aviso que FICA, sem contagem regressiva.
   *
   * O `mostrar` serve para o que tem hora de acabar; isto é para o que dura o
   * tempo que durar — o mapeamento da sala, que termina quando o quarto for
   * conhecido, não quando o relógio bater. Quem fixou é quem solta.
   *
   * Reescrever enquanto está fixo troca o texto sem reiniciar a entrada: é o
   * que deixa a contagem de superfícies subir sem a placa piscar a cada número.
   */
  fixar(linhas: LinhaTexto[], opcoes?: Parameters<Placa['escrever']>[1]) {
    this.placa.escrever(linhas, opcoes);
    if (!this.preso) this.opacidadePresa = 0;
    this.preso = true;
    this.placa.malha.visible = true;
  }

  soltar() {
    if (!this.preso) return;
    this.preso = false;
    this.restante = 0;
    this.opacidadePresa = 0;
    this.placa.malha.visible = false;

    // O que chegou enquanto o aviso estava fixo esperou justamente por isto.
    const proximo = this.fila.shift();
    if (proximo) this.exibir(proximo.linhas, proximo.duracao, proximo.opcoes);
  }

  atualizar(dt: number, camera: THREE.Camera) {
    if (this.preso) {
      this.acompanhar(dt, camera);
      this.opacidadePresa = Math.min(1, this.opacidadePresa + dt * 4);
      this.placa.opacidade = this.opacidadePresa;
      return;
    }

    if (this.restante <= 0) return;
    this.restante -= dt;
    if (this.restante <= 0) {
      const proximo = this.fila.shift();
      if (proximo) {
        this.exibir(proximo.linhas, proximo.duracao, proximo.opcoes);
        return;
      }
      this.placa.malha.visible = false;
      return;
    }

    this.acompanhar(dt, camera);

    const t = this.restante / this.duracao;
    this.placa.opacidade = Math.min(Math.min(1, (1 - t) * 6), Math.min(1, t * 4));
  }

  /** A placa persegue um ponto à frente do rosto, sem grudar nele. */
  private acompanhar(dt: number, camera: THREE.Camera) {
    const alvo = new THREE.Vector3(0, -0.1, -0.9).applyMatrix4(camera.matrixWorld);
    this.placa.malha.position.lerp(alvo, Math.min(1, dt * 7));
    this.placa.malha.quaternion.copy(camera.quaternion);
    // O tamanho é regulável e vale por quadro: mudar o ajuste no headset tem
    // de mudar o cartaz que está na tela AGORA, senão ninguém consegue
    // escolher o número olhando para ele. Ver `ESCALA_DO_HUD`.
    this.placa.malha.scale.setScalar(ESCALA_DO_HUD.valor);
  }

  descartar() {
    this.cena.remove(this.placa.malha);
    this.placa.descartar();
  }
}

/** O que o inimigo está preparando, para a barra de carga. */
export interface Carga {
  /** 0..1 — quanto já carregou. */
  fracao: number;
  /** Nome do golpe que vai sair. */
  golpe: string;
  cor: number;
  /** Verdadeiro na reta final: a barra vira vermelha e pulsa. */
  iminente: boolean;
}

/**
 * A plaquinha que flutua sobre a cabeça: nome, tipo, vida — e, no inimigo, a
 * CONTAGEM ATÉ O PRÓXIMO GOLPE.
 *
 * A barra de carga é a peça nova e é a razão de esta classe ter sido
 * redesenhada. A queixa era concreta: o golpe do selvagem chegava sem aviso
 * nenhum e às vezes tirava metade da vida, o que não deixa espaço para decisão.
 * Uma barra que enche diz duas coisas de uma vez — QUANDO vem e O QUE vem —, e
 * as duas juntas transformam apanhar em uma coisa que dá para prever.
 *
 * Ela só aparece quando há carga; sem briga, a plaquinha é a de sempre e não
 * ocupa espaço nenhum a mais.
 */
export class BarraVida {
  readonly placa = new Placa(0.28, 0.105, 480);
  private visivel = 0;
  private assinatura = '';
  private tempo = 0;

  constructor(
    private nome: string,
    private tipoNome: string,
    private corTipo: number,
  ) {}

  private redesenhar(
    hp: number,
    hpMax: number,
    rotulo: string,
    carga: Carga | null,
    condicao: { sigla: string; cor: number } | null,
  ) {
    const { ctx, canvas } = this.placa;
    const fracao = Math.max(0, hp / hpMax);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { acento: this.corTipo }, RAIO.cartao);

    const margem = 22;
    const util = canvas.width - margem * 2;

    // --- nome e tipo ---
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = fonte(TEXTO.titulo, 700);
    ctx.fillStyle = COR.texto;
    const larguraNome = util * 0.62;
    ctx.fillText(textoAjustado(ctx, this.nome, larguraNome), margem, 18);

    pilula(ctx, this.tipoNome.toUpperCase(), canvas.width - margem, 20, 26, hex(this.corTipo), {
      alinhar: 'right',
      maxLargura: util * 0.44,
    });

    // A condição de status ganha a própria pílula, embaixo da do tipo: é o
    // lugar onde os jogos de Pokémon sempre a puseram, e é a informação que
    // decide se vale jogar a bola agora. Ver src/condicao.ts.
    if (condicao) {
      pilula(ctx, condicao.sigla, canvas.width - margem, 52, 22, hex(condicao.cor), {
        alinhar: 'right',
        maxLargura: util * 0.3,
      });
    }

    // --- vida ---
    const yVida = 66;
    const alturaVida = 18;
    barra(ctx, margem, yVida, util, alturaVida, fracao, corDaVida(fracao));

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = fonte(TEXTO.legenda, 700);
    ctx.fillStyle = COR.textoFraco;
    if (rotulo) ctx.fillText(rotulo, margem, yVida + alturaVida + 7);

    ctx.textAlign = 'right';
    ctx.font = fonte(TEXTO.legenda, 600);
    ctx.fillStyle = fracao <= 0.22 ? COR.ruim : COR.textoFraco;
    ctx.fillText(`${Math.ceil(hp)}/${hpMax}`, canvas.width - margem, yVida + alturaVida + 7);

    // --- carga do próximo golpe ---
    if (!carga) {
      this.placa.marcarSujo();
      return;
    }

    const yCarga = canvas.height - 30;
    const corCarga = carga.iminente ? COR.cargaIminente : COR.carga;
    barra(ctx, margem, yCarga, util, 12, carga.fracao, corCarga, {
      trilho: 'rgba(255,255,255,0.09)',
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = fonte(TEXTO.micro, 700);
    ctx.fillStyle = corCarga;
    ctx.fillText(
      textoAjustado(ctx, carga.golpe.toUpperCase(), util * 0.75),
      margem,
      yCarga - 4,
    );

    ctx.textAlign = 'right';
    ctx.font = fonte(TEXTO.micro, 700);
    ctx.fillStyle = corCarga;
    ctx.fillText(carga.iminente ? 'AGORA!' : 'carregando', canvas.width - margem, yCarga - 4);
    ctx.textBaseline = 'top';

    this.placa.marcarSujo();
  }

  atualizar(
    dt: number,
    mostrar: boolean,
    hp: number,
    hpMax: number,
    posicao: THREE.Vector3,
    alturaPokemon: number,
    camera: THREE.Camera,
    rotulo = '',
    carga: Carga | null = null,
    condicao: { sigla: string; cor: number } | null = null,
  ) {
    this.tempo += dt;

    // A barra de carga anda todo quadro, então ela entra na assinatura já
    // quantizada: redesenhar o canvas 72 vezes por segundo por causa de dois
    // pixels de barra é exatamente o tipo de custo que o headset não perdoa.
    const passoCarga = carga ? Math.round(carga.fracao * 24) : -1;
    const assinatura =
      `${Math.ceil(hp)}|${rotulo}|${carga?.golpe ?? ''}|${passoCarga}|` +
      `${carga?.iminente ? 1 : 0}|${condicao?.sigla ?? ''}`;
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.redesenhar(hp, hpMax, rotulo, carga, condicao);
    }

    const alvo = mostrar ? 1 : 0;
    this.visivel += (alvo - this.visivel) * Math.min(1, dt * 7);
    this.placa.malha.visible = this.visivel > 0.02;
    if (!this.placa.malha.visible) return;

    this.placa.opacidade = this.visivel;
    this.placa.malha.position.copy(posicao);
    // Acima da cabeça, mas nunca acima do teto: com o tamanho real ligado, um
    // Onix de 8,8 m levaria a plaquinha para um lugar onde ela só apareceria
    // se você deitasse no chão. Passando de dois metros e meio ela para de
    // subir e encosta no corpo, que é onde ainda dá para ler.
    this.placa.malha.position.y += Math.min(alturaPokemon, 2.5) + 0.1 + this.visivel * 0.03;
    // Na reta final a plaquinha inteira pulsa: é o aviso que se vê pelo canto do
    // olho, sem precisar estar lendo a barra.
    const pulso = carga?.iminente ? 1 + Math.sin(this.tempo * 18) * 0.045 : 1;
    // Bicho grande é bicho que se olha de longe — e de longe a placa some. Ela
    // cresce junto, até o dobro.
    const porTamanho = 1 + Math.min(1, Math.max(0, (alturaPokemon - 1) / 6));
    this.placa.malha.scale.setScalar((0.75 + this.visivel * 0.25) * pulso * porTamanho);
    this.placa.malha.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  }

  descartar() {
    this.placa.descartar();
  }
}

/**
 * O mostrador do pulso: quantas bolas, quantas capturas, quanto da sala.
 *
 * ## Em pé, e não tombado
 *
 * Ele era uma placa de 14 × 9 cm presa ao punho, inclinada 57° para trás. Preso
 * ao punho, ele herdava TODO giro do antebraço: bastava virar a mão para o
 * painel ficar de lado, de cabeça para baixo, ou de esguelha. Somada à
 * inclinação fixa, essa era a coisa que o playtest de 18/09 chamou de "painel
 * inclinado para frente, projetando".
 *
 * Agora ele vive no mundo, não no punho: acompanha o pulso esquerdo em POSIÇÃO
 * e gira só em torno do eixo vertical, para ficar em pé e virado para você
 * qualquer que seja a torção do braço. É a mesma regra do painel do time (ver
 * src/menu.ts) — os dois são a mesma superfície, e duas regras diferentes para
 * dois painéis no mesmo braço era o que fazia o conjunto parecer torto.
 *
 * ## E menor
 *
 * 10,5 × 5 cm no lugar de 14 × 9, e duas linhas no lugar de quatro. O número
 * gigante de pokébolas saiu: desde que o cinto do antebraço existe, as bolas
 * estão ALI, em objeto, contadas pelo próprio olho — repetir a conta em
 * oitenta pixels era gastar metade do painel com o que já se vê.
 */
export class PainelPulso {
  readonly grupo = new THREE.Group();
  private placa = new Placa(0.105, 0.05, 340);
  private ultimo = '';
  private alvo = new THREE.Vector3();
  private olho = new THREE.Vector3();

  constructor() {
    this.grupo.add(this.placa.malha);
  }

  /**
   * Segue o pulso esquerdo, em pé.
   *
   * Seis centímetros acima do punho: acima da luva e abaixo de onde o painel do
   * time começa a crescer, para os dois nunca se cobrirem.
   */
  posicionar(dt: number, punho: THREE.Object3D | null, camera: THREE.Camera, visivel: boolean) {
    this.grupo.visible = visivel && punho !== null;
    if (!punho || !visivel) return;

    punho.getWorldPosition(this.alvo);
    this.alvo.y += 0.06;
    // Suave: o pulso treme, e um painel que copia o tremor é ilegível.
    this.grupo.position.lerp(this.alvo, Math.min(1, dt * 12));

    camera.getWorldPosition(this.olho);
    this.grupo.rotation.set(
      0,
      Math.atan2(this.olho.x - this.grupo.position.x, this.olho.z - this.grupo.position.z),
      0,
    );
  }

  atualizar(
    bolas: number,
    capturas: number,
    especies: number,
    total: number,
    /**
     * Quantas superfícies a sala já conhece. Está aqui por um motivo prático:
     * o mapeamento cresce enquanto você caminha, e sem um número subindo não
     * há como saber, de dentro do headset, se ele está funcionando.
     */
    mapeadas: number,
    /**
     * A caçada em cadeia, quando ela ja vale alguma coisa. Ela TOMA a linha do
     * mapeamento em vez de somar uma quinta: o painel tem catorze centimetros,
     * e a corrente so aparece enquanto esta acontecendo.
     */
    brilhante: string | null,
  ) {
    const assinatura = `${bolas}|${capturas}|${especies}|${mapeadas}|${brilhante ?? ''}`;
    if (assinatura === this.ultimo) return;
    this.ultimo = assinatura;

    this.placa.escrever(
      [
        {
          texto: `${bolas} bolas · ${capturas} capturas`,
          tamanho: 27,
          cor: bolas > 0 ? '#eef2f8' : '#ff9f9f',
          peso: 700,
        },
        brilhante
          ? { texto: brilhante, tamanho: 20, cor: '#ffd76a', peso: 700, espaco: 4 }
          : {
              texto: `${especies}/${total} espécies · ${mapeadas} sup.`,
              tamanho: 20,
              cor: '#8b97ab',
              peso: 500,
              espaco: 4,
            },
      ],
      { raio: 16 },
    );
  }

  descartar() {
    this.placa.descartar();
  }
}
