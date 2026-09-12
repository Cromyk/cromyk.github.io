import * as THREE from 'three';
import { Placa } from './hud';
import { ESPECIES, TIPOS, type Especie } from './species';

export interface EntradaTime {
  especie: Especie;
  hp: number;
  capturados: number;
}

const LARGURA_CARD = 0.1;
const ALTURA_CARD = 0.13;
const ESPACO = 0.012;

/**
 * Painel de time preso à mão esquerda. Abre sozinho quando você vira a palma
 * para cima — o mesmo gesto de olhar um relógio — e você escolhe apontando com
 * a mão direita e puxando o gatilho.
 */
export class PainelTime {
  readonly grupo = new THREE.Group();
  /** Índice do card sob a mira, ou -1. */
  destacado = -1;
  aberto = false;

  private cards: Placa[] = [];
  private alvosRay: THREE.Mesh[] = [];
  private titulo = new Placa(0.3, 0.04, 512);
  private entradas: EntradaTime[] = [];
  private assinatura = '';
  private abertura = 0;
  private raycaster = new THREE.Raycaster();

  constructor() {
    this.titulo.malha.position.set(0, ALTURA_CARD * 0.5 + 0.035, 0);
    this.grupo.add(this.titulo.malha);
    this.titulo.escrever(
      [{ texto: 'seu time', tamanho: 40, cor: '#cfe0f5', peso: 700 }],
      { raio: 14, fundo: 'rgba(10,14,22,0.82)' },
    );
    this.grupo.visible = false;

    // Um card por espécie possível — reaproveitados, nunca recriados.
    for (let i = 0; i < ESPECIES.length; i++) {
      const card = new Placa(LARGURA_CARD, ALTURA_CARD, 300);
      this.cards.push(card);
      this.grupo.add(card.malha);

      // Plano invisível um pouco maior, só para o raycast ficar tolerante.
      const alvo = new THREE.Mesh(
        new THREE.PlaneGeometry(LARGURA_CARD * 1.1, ALTURA_CARD * 1.1),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      alvo.userData.indice = i;
      this.grupo.add(alvo);
      this.alvosRay.push(alvo);
    }
  }

  /** Time atual, na ordem em que aparece no painel. */
  get time(): EntradaTime[] {
    return this.entradas;
  }

  definirTime(entradas: EntradaTime[]) {
    this.entradas = entradas;
    this.reposicionar();
  }

  private reposicionar() {
    const n = this.entradas.length;
    const larguraTotal = n * LARGURA_CARD + (n - 1) * ESPACO;
    for (let i = 0; i < this.cards.length; i++) {
      const visivel = i < n;
      this.cards[i].malha.visible = visivel;
      this.alvosRay[i].visible = visivel;
      if (!visivel) continue;
      const x = -larguraTotal / 2 + LARGURA_CARD / 2 + i * (LARGURA_CARD + ESPACO);
      this.cards[i].malha.position.set(x, 0, 0);
      this.alvosRay[i].position.set(x, 0, -0.001);
    }
  }

  private redesenhar(ativoId: string | null) {
    for (let i = 0; i < this.entradas.length; i++) {
      const { especie, hp, capturados } = this.entradas[i];
      const card = this.cards[i];
      const { ctx, canvas } = card;
      const selecionado = especie.id === ativoId;
      const sobMira = i === this.destacado;
      const desmaiado = hp <= 0;

      const corTipo = `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`;
      card.limpar(
        desmaiado ? 'rgba(26, 14, 18, 0.92)' : sobMira ? 'rgba(30, 44, 66, 0.95)' : 'rgba(14, 20, 30, 0.9)',
        selecionado ? '#7fe7c4' : sobMira ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)',
        20,
      );

      // Uma faixa da cor do tipo no topo identifica o Pokémon de relance.
      ctx.fillStyle = corTipo;
      ctx.globalAlpha = desmaiado ? 0.3 : 1;
      ctx.beginPath();
      ctx.roundRect(14, 14, canvas.width - 28, 8, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = desmaiado ? '#7a6a70' : '#f2f5fa';
      ctx.fillText(especie.nome, canvas.width / 2, 36, canvas.width - 24);

      ctx.font = '600 22px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = desmaiado ? '#6a5a60' : corTipo;
      ctx.fillText(TIPOS[especie.tipo].nome.toUpperCase(), canvas.width / 2, 74);

      // Barra de vida.
      const fracao = Math.max(0, hp / especie.hpMax);
      const y = 112;
      const larguraBarra = canvas.width - 40;
      ctx.beginPath();
      ctx.roundRect(20, y, larguraBarra, 14, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      if (fracao > 0) {
        ctx.beginPath();
        ctx.roundRect(20, y, Math.max(14, larguraBarra * fracao), 14, 7);
        ctx.fillStyle = fracao > 0.5 ? '#5fd47a' : fracao > 0.22 ? '#ffc94a' : '#ff5f5f';
        ctx.fill();
      }

      ctx.font = '600 20px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#93a0b4';
      ctx.fillText(
        desmaiado ? 'desmaiado' : `${Math.ceil(hp)}/${especie.hpMax}`,
        canvas.width / 2,
        y + 22,
      );

      if (capturados > 1) {
        ctx.textAlign = 'right';
        ctx.font = '700 20px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = '#7f8ba0';
        ctx.fillText(`×${capturados}`, canvas.width - 18, 36);
      }

      if (selecionado) {
        ctx.textAlign = 'center';
        ctx.font = '700 19px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = '#7fe7c4';
        ctx.fillText('EM CAMPO', canvas.width / 2, y + 46);
      }

      card.marcarSujo();
    }
  }

  /**
   * @param punhoEsquerdo  onde o painel mora
   * @param mira           raio da mão direita, para destacar um card
   */
  atualizar(
    dt: number,
    punhoEsquerdo: THREE.Object3D | null,
    mira: { origem: THREE.Vector3; direcao: THREE.Vector3 } | null,
    ativoId: string | null,
    camera: THREE.Camera,
  ) {
    // A palma virada para cima abre o painel: comparamos o "para cima" local
    // da mão com o para cima do mundo.
    let querAbrir = false;
    if (punhoEsquerdo && this.entradas.length > 0) {
      punhoEsquerdo.updateMatrixWorld();
      const cimaDaMao = new THREE.Vector3(0, 1, 0).applyQuaternion(
        punhoEsquerdo.getWorldQuaternion(new THREE.Quaternion()),
      );
      querAbrir = cimaDaMao.dot(new THREE.Vector3(0, 1, 0)) > 0.35;
    }
    this.aberto = querAbrir;

    const alvoAbertura = querAbrir ? 1 : 0;
    this.abertura += (alvoAbertura - this.abertura) * Math.min(1, dt * 10);
    this.grupo.visible = this.abertura > 0.03;
    if (!this.grupo.visible) {
      this.destacado = -1;
      return;
    }

    // Ancora acima da mão e encara o jogador.
    if (punhoEsquerdo) {
      const posicao = punhoEsquerdo.getWorldPosition(new THREE.Vector3());
      posicao.y += 0.12;
      this.grupo.position.lerp(posicao, Math.min(1, dt * 14));
      this.grupo.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    }
    this.grupo.scale.setScalar(0.6 + this.abertura * 0.4);

    // Qual card está sob a mira da outra mão?
    const anterior = this.destacado;
    this.destacado = -1;
    if (mira && this.abertura > 0.6) {
      this.raycaster.set(mira.origem, mira.direcao);
      const acertos = this.raycaster.intersectObjects(this.alvosRay.filter((a) => a.visible), false);
      if (acertos.length > 0) this.destacado = acertos[0].object.userData.indice as number;
    }

    // Redesenha só quando algo muda de fato.
    const assinatura = `${this.destacado}|${ativoId}|${this.entradas
      .map((e) => `${e.especie.id}:${Math.ceil(e.hp)}:${e.capturados}`)
      .join(',')}`;
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.redesenhar(ativoId);
    }

    // Card sob a mira salta um pouco para a frente.
    for (let i = 0; i < this.entradas.length; i++) {
      const alvoZ = i === this.destacado ? 0.016 : 0;
      this.cards[i].malha.position.z += (alvoZ - this.cards[i].malha.position.z) * Math.min(1, dt * 12);
    }

    if (anterior !== this.destacado && this.destacado !== -1) {
      // Sinal de que a mira mudou de card — o chamador toca o som.
      this.mudouDestaque = true;
    }
  }

  /** Lido e zerado pelo jogo, para tocar um clique. */
  mudouDestaque = false;

  /** O que está sob a mira agora, se houver. */
  get selecao(): EntradaTime | null {
    return this.destacado >= 0 ? (this.entradas[this.destacado] ?? null) : null;
  }

  descartar() {
    for (const card of this.cards) card.descartar();
    for (const alvo of this.alvosRay) {
      alvo.geometry.dispose();
      (alvo.material as THREE.Material).dispose();
    }
    this.titulo.descartar();
  }
}
