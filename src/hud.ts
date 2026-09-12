import * as THREE from 'three';

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

  atualizar(dt: number, camera: THREE.Camera) {
    if (this.restante <= 0) return;
    this.restante -= dt;
    if (this.restante <= 0) {
      this.placa.malha.visible = false;
      return;
    }

    const alvo = new THREE.Vector3(0, -0.1, -0.9).applyMatrix4(camera.matrixWorld);
    this.placa.malha.position.lerp(alvo, Math.min(1, dt * 7));
    this.placa.malha.quaternion.copy(camera.quaternion);

    const t = this.restante / this.duracao;
    this.placa.opacidade = Math.min(Math.min(1, (1 - t) * 6), Math.min(1, t * 4));
  }

  descartar() {
    this.cena.remove(this.placa.malha);
    this.placa.descartar();
  }
}

/**
 * Nome + barra de vida flutuando sobre o Pokémon. Redesenha só quando o HP
 * muda de fato — canvas por quadro custa caro no headset.
 */
export class BarraVida {
  readonly placa = new Placa(0.26, 0.085, 420);
  private visivel = 0;
  private ultimoHp = -1;
  private ultimoRotulo = '';

  constructor(
    private nome: string,
    private tipoNome: string,
    private corTipo: number,
  ) {}

  private redesenhar(hp: number, hpMax: number, rotulo: string) {
    const { ctx, canvas } = this.placa;
    this.placa.limpar('rgba(10, 14, 22, 0.9)', 'rgba(255,255,255,0.16)', 18);

    const fracao = Math.max(0, hp / hpMax);
    const margem = 22;
    const larguraBarra = canvas.width - margem * 2;

    // Nome à esquerda, tipo à direita.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '700 40px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#f2f5fa';
    ctx.fillText(this.nome, margem, 16, larguraBarra * 0.66);

    ctx.textAlign = 'right';
    ctx.font = '700 26px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = `#${new THREE.Color(this.corTipo).getHexString()}`;
    ctx.fillText(this.tipoNome.toUpperCase(), canvas.width - margem, 26);

    // Trilho da barra.
    const y = 74;
    const altura = 20;
    ctx.beginPath();
    ctx.roundRect(margem, y, larguraBarra, altura, altura / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();

    // Preenchimento: verde → amarelo → vermelho conforme cai.
    if (fracao > 0) {
      const cor = fracao > 0.5 ? '#5fd47a' : fracao > 0.22 ? '#ffc94a' : '#ff5f5f';
      ctx.beginPath();
      ctx.roundRect(margem, y, Math.max(altura, larguraBarra * fracao), altura, altura / 2);
      ctx.fillStyle = cor;
      ctx.fill();
    }

    ctx.textAlign = 'right';
    ctx.font = '600 24px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#aab4c6';
    ctx.fillText(`${Math.ceil(hp)}/${hpMax}`, canvas.width - margem, y + altura + 8);

    if (rotulo) {
      ctx.textAlign = 'left';
      ctx.font = '700 24px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#9fe0ff';
      ctx.fillText(rotulo, margem, y + altura + 8);
    }

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
  ) {
    if (hp !== this.ultimoHp || rotulo !== this.ultimoRotulo) {
      this.ultimoHp = hp;
      this.ultimoRotulo = rotulo;
      this.redesenhar(hp, hpMax, rotulo);
    }

    const alvo = mostrar ? 1 : 0;
    this.visivel += (alvo - this.visivel) * Math.min(1, dt * 7);
    this.placa.malha.visible = this.visivel > 0.02;
    if (!this.placa.malha.visible) return;

    this.placa.opacidade = this.visivel;
    this.placa.malha.position.copy(posicao);
    this.placa.malha.position.y += alturaPokemon + 0.1 + this.visivel * 0.03;
    this.placa.malha.scale.setScalar(0.75 + this.visivel * 0.25);
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

  atualizar(bolas: number, capturas: number, especies: number, total: number) {
    const assinatura = `${bolas}|${capturas}|${especies}`;
    if (assinatura === this.ultimo) return;
    this.ultimo = assinatura;

    this.placa.escrever(
      [
        { texto: `${bolas}`, tamanho: 86, cor: bolas > 0 ? '#ff7a6e' : '#7f8ba0', peso: 700 },
        { texto: 'pokébolas', tamanho: 26, cor: '#8b97ab', peso: 500, espaco: 10 },
        {
          texto: `${capturas} capturas · ${especies}/${total} espécies`,
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
