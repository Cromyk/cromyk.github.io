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
export class Aviso {
  readonly placa = new Placa(0.46, 0.22, 640);
  private restante = 0;
  private duracao = 1;
  /** Aviso fixo: fica até alguém soltar. Ver `fixar`. */
  private preso = false;
  private opacidadePresa = 0;

  constructor(private readonly cena: THREE.Object3D) {
    this.placa.malha.visible = false;
    this.cena.add(this.placa.malha);
  }

  mostrar(linhas: LinhaTexto[], duracao = 2.4, opcoes?: Parameters<Placa['escrever']>[1]) {
    this.placa.escrever(linhas, opcoes);
    this.restante = duracao;
    this.duracao = duracao;
    this.placa.malha.visible = true;
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

  private redesenhar(hp: number, hpMax: number, rotulo: string, carga: Carga | null) {
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
  ) {
    this.tempo += dt;

    // A barra de carga anda todo quadro, então ela entra na assinatura já
    // quantizada: redesenhar o canvas 72 vezes por segundo por causa de dois
    // pixels de barra é exatamente o tipo de custo que o headset não perdoa.
    const passoCarga = carga ? Math.round(carga.fracao * 24) : -1;
    const assinatura = `${Math.ceil(hp)}|${rotulo}|${carga?.golpe ?? ''}|${passoCarga}|${carga?.iminente ? 1 : 0}`;
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.redesenhar(hp, hpMax, rotulo, carga);
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

/** Painel pequeno preso ao pulso: pokébolas e progresso. */
export class PainelPulso {
  readonly grupo = new THREE.Group();
  private placa = new Placa(0.14, 0.09, 384);
  private ultimo = '';

  constructor() {
    this.placa.malha.position.set(0, 0.035, -0.02);
    this.placa.malha.rotation.x = -Math.PI * 0.32;
    this.grupo.add(this.placa.malha);
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
        { texto: `${bolas}`, tamanho: 82, cor: bolas > 0 ? '#ff7a6e' : '#7f8ba0', peso: 700 },
        { texto: 'pokébolas', tamanho: 25, cor: '#8b97ab', peso: 500, espaco: 8 },
        {
          texto: `${capturas} capturas · ${especies}/${total} espécies`,
          tamanho: 23,
          cor: '#b9c4d6',
          peso: 500,
        },
        brilhante
          ? { texto: brilhante, tamanho: 21, cor: '#ffd76a', peso: 700 }
          : {
              texto: `${mapeadas} superfícies mapeadas`,
              tamanho: 21,
              cor: '#7fd6a8',
              peso: 500,
            },
      ],
      { raio: 22 },
    );
  }

  descartar() {
    this.placa.descartar();
  }
}
