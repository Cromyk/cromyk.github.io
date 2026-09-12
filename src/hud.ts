import * as THREE from 'three';

interface LinhaTexto {
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
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private textura: THREE.CanvasTexture;
  private material: THREE.MeshBasicMaterial;
  private geometria: THREE.PlaneGeometry;

  constructor(larguraM: number, alturaM: number, px = 512) {
    const canvas = document.createElement('canvas');
    const proporcao = alturaM / larguraM;
    canvas.width = px;
    canvas.height = Math.round(px * proporcao);
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

  /** Redesenha a placa: fundo arredondado + linhas de texto centralizadas. */
  escrever(linhas: LinhaTexto[], opcoes: { fundo?: string; borda?: string; raio?: number } = {}) {
    const { ctx, canvas } = this;
    const { fundo = 'rgba(14, 18, 28, 0.86)', borda = 'rgba(255,255,255,0.14)', raio = 28 } = opcoes;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, raio);
    ctx.fillStyle = fundo;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = borda;
    ctx.stroke();

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

    this.textura.needsUpdate = true;
  }

  descartar() {
    this.geometria.dispose();
    this.material.dispose();
    this.textura.dispose();
  }
}

/**
 * Aviso grande que aparece flutuando à frente do jogador e some sozinho.
 * Usado para "Capturado!", "Escapou!", nome da criatura nova, etc.
 */
export class Aviso {
  readonly placa = new Placa(0.46, 0.22, 640);
  private restante = 0;
  private duracao = 1;

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

  /** Fica à frente da cabeça, sempre de frente para ela. */
  atualizar(dt: number, camera: THREE.Camera) {
    if (this.restante <= 0) return;
    this.restante -= dt;
    if (this.restante <= 0) {
      this.placa.malha.visible = false;
      return;
    }

    const alvo = new THREE.Vector3(0, -0.06, -0.9).applyMatrix4(camera.matrixWorld);
    this.placa.malha.position.lerp(alvo, Math.min(1, dt * 7));
    this.placa.malha.quaternion.copy(camera.quaternion);

    const t = this.restante / this.duracao;
    const entrada = Math.min(1, (1 - t) * 6);
    const saida = Math.min(1, t * 4);
    this.placa.opacidade = Math.min(entrada, saida);
  }

  descartar() {
    this.cena.remove(this.placa.malha);
    this.placa.descartar();
  }
}

/** Painel pequeno preso ao pulso: esferas restantes e progresso. */
export class PainelPulso {
  readonly grupo = new THREE.Group();
  private placa = new Placa(0.14, 0.09, 384);
  private ultimoTexto = '';

  constructor() {
    this.placa.malha.position.set(0, 0.035, -0.02);
    this.placa.malha.rotation.x = -Math.PI * 0.32;
    this.grupo.add(this.placa.malha);
  }

  atualizar(esferas: number, capturas: number, especies: number, totalEspecies: number) {
    const assinatura = `${esferas}|${capturas}|${especies}`;
    if (assinatura === this.ultimoTexto) return; // redesenhar canvas é caro
    this.ultimoTexto = assinatura;

    this.placa.escrever(
      [
        { texto: `${esferas}`, tamanho: 86, cor: esferas > 0 ? '#8fd2ff' : '#ff8e8e', peso: 700 },
        { texto: 'esferas', tamanho: 26, cor: '#8b97ab', peso: 500, espaco: 10 },
        {
          texto: `${capturas} capturas · ${especies}/${totalEspecies} espécies`,
          tamanho: 24,
          cor: '#b9c4d6',
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

/** Etiqueta com o nome, que aparece sobre a criatura quando ela repara em você. */
export class Etiqueta {
  readonly placa = new Placa(0.24, 0.09, 384);
  private visivel = 0;

  constructor(nome: string, elemento: string, corElemento: number, novaEspecie: boolean) {
    const cor = `#${new THREE.Color(corElemento).getHexString()}`;
    this.placa.escrever(
      [
        { texto: nome, tamanho: 46, cor: '#f2f5fa', peso: 700 },
        { texto: elemento.toUpperCase(), tamanho: 24, cor, peso: 700, espaco: 4 },
        ...(novaEspecie
          ? [{ texto: 'espécie nova', tamanho: 22, cor: '#ffd78a', peso: 600 } as LinhaTexto]
          : []),
      ],
      { raio: 20 },
    );
    this.placa.malha.visible = false;
  }

  atualizar(dt: number, mostrar: boolean, posicao: THREE.Vector3, camera: THREE.Camera) {
    const alvo = mostrar ? 1 : 0;
    this.visivel += (alvo - this.visivel) * Math.min(1, dt * 6);
    this.placa.malha.visible = this.visivel > 0.02;
    if (!this.placa.malha.visible) return;

    this.placa.opacidade = this.visivel;
    this.placa.malha.position.copy(posicao);
    this.placa.malha.position.y += 0.16 + this.visivel * 0.04;
    this.placa.malha.scale.setScalar(0.7 + this.visivel * 0.3);
    this.placa.malha.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  }

  descartar() {
    this.placa.descartar();
  }
}
