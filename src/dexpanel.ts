import * as THREE from 'three';
import { Placa } from './hud';
import { ESPECIES, TIPOS, type Especie } from './species';

export interface EstadoDex {
  visto: boolean;
  capturado: boolean;
  viuShiny: boolean;
}

const COLUNAS = 6;
const LINHAS = 6;
const POR_PAGINA = COLUNAS * LINHAS;

/**
 * A Pokédex: as 151 espécies numa grade paginada, presa à mão direita.
 *
 * Abre com o mesmo gesto do painel do time, mas na outra mão — gire o pulso
 * direita para cima. Com o painel aberto, o analógico vira o de virar página em
 * vez de trocar de bola.
 *
 * A grade inteira é desenhada num canvas só. Isso não é economia de código, é
 * economia de memória: 151 cartas com textura própria seriam mais de cem
 * texturas paradas na VRAM do headset só para mostrar uma lista. Aqui são duas
 * — a grade e a ficha de quem está sob a mira.
 */
export class PainelDex {
  readonly grupo = new THREE.Group();
  aberto = false;
  mudouDestaque = false;

  private grade = new Placa(0.3, 0.26, 900);
  private ficha = new Placa(0.3, 0.085, 760);
  private alvos: THREE.Mesh[] = [];
  private estados = new Map<string, EstadoDex>();
  /** Resumo barato do conteúdo: é o que diz se a grade precisa ser redesenhada. */
  private resumoEstados = 0;
  private pagina = 0;
  private destacado = -1;
  private abertura = 0;
  private assinatura = '';
  private raycaster = new THREE.Raycaster();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.grade.malha.position.set(0, 0.055, 0);
    this.ficha.malha.position.set(0, -0.135, 0);
    this.grupo.add(this.grade.malha, this.ficha.malha);
    this.grupo.visible = false;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this.descartaveis.push(geo, mat);

    // Um alvo invisível por célula, reposicionado a cada página.
    const largura = 0.3 / COLUNAS;
    const altura = 0.26 / LINHAS;
    for (let i = 0; i < POR_PAGINA; i++) {
      const alvo = new THREE.Mesh(geo, mat);
      alvo.scale.set(largura * 0.96, altura * 0.94, 1);
      alvo.position.set(
        -0.15 + largura * (0.5 + (i % COLUNAS)),
        0.055 + 0.13 - altura * (0.5 + Math.floor(i / COLUNAS)),
        0.001,
      );
      alvo.userData.indice = i;
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    }
  }

  get totalPaginas(): number {
    return Math.ceil(ESPECIES.length / POR_PAGINA);
  }

  definirEstados(estados: Map<string, EstadoDex>) {
    this.estados = estados;
    // O tamanho do mapa não basta: capturar uma espécie que você já tinha
    // visto não muda a contagem de entradas, mas muda a grade inteira.
    let resumo = 0;
    for (const e of estados.values()) resumo += (e.capturado ? 2 : 1) + (e.viuShiny ? 4 : 0);
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

  private estadoDe(especie: Especie): EstadoDex {
    return this.estados.get(especie.id) ?? { visto: false, capturado: false, viuShiny: false };
  }

  private desenharGrade() {
    const { ctx, canvas } = this.grade;
    this.grade.limpar('rgba(10,14,22,0.92)', 'rgba(255,255,255,0.16)', 22);

    const cw = canvas.width / COLUNAS;
    const ch = canvas.height / LINHAS;
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
        ctx.roundRect(x + 3, y + 3, cw - 6, ch - 6, 10);
        ctx.fillStyle = 'rgba(60, 92, 136, 0.5)';
        ctx.fill();
      }

      // Faixa do tipo — só de quem já foi visto; o resto fica em silhueta.
      ctx.fillStyle = estado.visto
        ? `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`
        : 'rgba(255,255,255,0.10)';
      ctx.globalAlpha = estado.capturado ? 1 : estado.visto ? 0.55 : 1;
      ctx.beginPath();
      ctx.roundRect(x + 10, y + 10, cw - 20, 6, 3);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#6f7b8e';
      ctx.fillText(`${especie.num}`.padStart(3, '0'), x + cw / 2, y + 22);

      ctx.font = '700 19px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = estado.capturado ? '#f2f5fa' : estado.visto ? '#9aa5b8' : '#454d5c';
      ctx.fillText(estado.visto ? especie.nome : '???', x + cw / 2, y + 44, cw - 14);

      // A bolinha conta a história: cheia = capturado, vazada = só visto.
      const cy = y + ch - 22;
      ctx.beginPath();
      ctx.arc(x + cw / 2, cy, 7, 0, Math.PI * 2);
      if (estado.capturado) {
        ctx.fillStyle = estado.viuShiny ? '#ffd76a' : '#7fe7c4';
        ctx.fill();
      } else {
        ctx.strokeStyle = estado.visto ? '#6f7b8e' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.textAlign = 'center';
    ctx.font = '600 18px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#7f8ba0';
    ctx.fillText(
      `página ${this.pagina + 1}/${this.totalPaginas} · analógico vira`,
      canvas.width / 2,
      canvas.height - 24,
    );

    this.grade.marcarSujo();
  }

  private desenharFicha() {
    const especie = this.selecionada;
    const { ctx, canvas } = this.ficha;

    if (!especie) {
      this.ficha.escrever(
        [{ texto: 'aponte para uma espécie', tamanho: 30, cor: '#7f8ba0', peso: 500 }],
        { raio: 16, fundo: 'rgba(10,14,22,0.85)' },
      );
      return;
    }

    const estado = this.estadoDe(especie);
    this.ficha.limpar('rgba(10,14,22,0.92)', 'rgba(255,255,255,0.16)', 16);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (!estado.visto) {
      ctx.font = '600 28px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#6f7b8e';
      ctx.fillText('ainda não encontrado', 24, canvas.height / 2 - 18);
      this.ficha.marcarSujo();
      return;
    }

    const cor = `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`;

    ctx.font = '700 32px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#f2f5fa';
    ctx.fillText(`${`${especie.num}`.padStart(3, '0')}  ${especie.nome}`, 22, 14);

    ctx.textAlign = 'right';
    ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = cor;
    ctx.fillText(
      especie.tipos.map((t) => TIPOS[t].nome).join(' / ').toUpperCase(),
      canvas.width - 22,
      18,
    );

    ctx.textAlign = 'left';
    ctx.font = '500 21px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#93a0b4';
    ctx.fillText(
      `${especie.genero} · ${especie.alturaReal.toFixed(1).replace('.', ',')} m · ${especie.peso
        .toFixed(1)
        .replace('.', ',')} kg`,
      22,
      54,
    );

    // A descrição só aparece depois de capturado: é o prêmio de ter pegado.
    ctx.font = '500 20px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = estado.capturado ? '#c3ccda' : '#6f7b8e';
    const texto = estado.capturado ? especie.descricao : 'capture para ler a ficha completa';
    this.escreverEmDuasLinhas(ctx, texto, 22, 84, canvas.width - 44);

    this.ficha.marcarSujo();
  }

  /** Quebra o texto em no máximo duas linhas, sem cortar palavra no meio. */
  private escreverEmDuasLinhas(
    ctx: CanvasRenderingContext2D,
    texto: string,
    x: number,
    y: number,
    largura: number,
  ) {
    const palavras = texto.split(' ');
    let linha = '';
    let restante = '';
    for (const palavra of palavras) {
      const tentativa = linha ? `${linha} ${palavra}` : palavra;
      if (ctx.measureText(tentativa).width > largura && linha) {
        restante = restante ? `${restante} ${palavra}` : palavra;
      } else if (restante) {
        restante = `${restante} ${palavra}`;
      } else {
        linha = tentativa;
      }
    }
    ctx.fillText(linha, x, y, largura);
    if (restante) ctx.fillText(restante, x, y + 26, largura);
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
      return;
    }

    const anterior = this.destacado;
    this.destacado = -1;
    if (mira && this.abertura > 0.6) {
      this.raycaster.set(mira.origem, mira.direcao);
      const acertos = this.raycaster.intersectObjects(this.alvos, false);
      if (acertos.length > 0) this.destacado = acertos[0].object.userData.indice as number;
    }
    this.mudouDestaque = this.destacado !== -1 && this.destacado !== anterior;

    const assinatura = `${this.pagina}|${this.destacado}|${this.resumoEstados}`;
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.desenharGrade();
      this.desenharFicha();
    }
  }

  descartar() {
    this.grade.descartar();
    this.ficha.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
