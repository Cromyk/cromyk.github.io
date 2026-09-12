import * as THREE from 'three';
import { Placa } from './hud';
import { ESPECIES, TIPOS, type Especie } from './species';
import { BOLAS, type TipoBola } from './balls';

export interface EntradaTime {
  especie: Especie;
  hp: number;
  capturados: number;
}

export interface EntradaBola {
  tipo: TipoBola;
  quantidade: number;
}

export type Selecao =
  | { tipo: 'criatura'; entrada: EntradaTime }
  | { tipo: 'bola'; entrada: EntradaBola };

const LARGURA_CARD = 0.1;
const ALTURA_CARD = 0.13;
const LARGURA_BOLA = 0.076;
const ALTURA_BOLA = 0.066;
const ESPACO = 0.012;

/**
 * Painel preso à mão esquerda. Abre sozinho quando você vira a palma para cima
 * — o mesmo gesto de olhar um relógio — e tem duas fileiras: em cima o time,
 * embaixo as bolas. Aponte com a outra mão e puxe o gatilho.
 */
export class PainelTime {
  readonly grupo = new THREE.Group();
  aberto = false;
  /** Trocou o item sob a mira neste quadro. */
  mudouDestaque = false;

  private cards: Placa[] = [];
  private cardsBola: Placa[] = [];
  private alvos: THREE.Mesh[] = [];
  private titulo = new Placa(0.3, 0.038, 512);
  private entradas: EntradaTime[] = [];
  private bolas: EntradaBola[] = [];
  private destacado: { tipo: 'criatura' | 'bola'; indice: number } | null = null;
  private assinatura = '';
  private abertura = 0;
  private raycaster = new THREE.Raycaster();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.titulo.malha.position.set(0, ALTURA_CARD * 0.5 + 0.032, 0);
    this.grupo.add(this.titulo.malha);
    this.titulo.escrever([{ texto: 'seu time', tamanho: 38, cor: '#cfe0f5', peso: 700 }], {
      raio: 12,
      fundo: 'rgba(10,14,22,0.82)',
    });
    this.grupo.visible = false;

    const geoAlvo = new THREE.PlaneGeometry(1, 1);
    const matAlvo = new THREE.MeshBasicMaterial({ visible: false });
    this.descartaveis.push(geoAlvo, matAlvo);

    // Uma carta por espécie possível, reaproveitadas.
    for (let i = 0; i < ESPECIES.length; i++) {
      const card = new Placa(LARGURA_CARD, ALTURA_CARD, 300);
      this.cards.push(card);
      this.grupo.add(card.malha);

      const alvo = new THREE.Mesh(geoAlvo, matAlvo);
      alvo.scale.set(LARGURA_CARD * 1.1, ALTURA_CARD * 1.1, 1);
      alvo.userData = { tipo: 'criatura', indice: i };
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    }

    // Uma carta por tipo de bola.
    for (let i = 0; i < BOLAS.length; i++) {
      const card = new Placa(LARGURA_BOLA, ALTURA_BOLA, 230);
      this.cardsBola.push(card);
      this.grupo.add(card.malha);

      const alvo = new THREE.Mesh(geoAlvo, matAlvo);
      alvo.scale.set(LARGURA_BOLA * 1.12, ALTURA_BOLA * 1.15, 1);
      alvo.userData = { tipo: 'bola', indice: i };
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    }
  }

  get time(): EntradaTime[] {
    return this.entradas;
  }

  definirConteudo(entradas: EntradaTime[], bolas: EntradaBola[]) {
    this.entradas = entradas;
    this.bolas = bolas;
    this.reposicionar();
  }

  private reposicionar() {
    const n = this.entradas.length;
    const larguraTime = n * LARGURA_CARD + Math.max(0, n - 1) * ESPACO;

    for (let i = 0; i < this.cards.length; i++) {
      const visivel = i < n;
      this.cards[i].malha.visible = visivel;
      this.alvos[i].visible = visivel;
      if (!visivel) continue;
      const x = -larguraTime / 2 + LARGURA_CARD / 2 + i * (LARGURA_CARD + ESPACO);
      this.cards[i].malha.position.set(x, 0, 0);
      this.alvos[i].position.set(x, 0, -0.001);
    }

    // Fileira das bolas, logo abaixo.
    const m = this.bolas.length;
    const larguraBolas = m * LARGURA_BOLA + Math.max(0, m - 1) * ESPACO;
    const yBola = -ALTURA_CARD / 2 - ALTURA_BOLA / 2 - 0.016;

    for (let i = 0; i < this.cardsBola.length; i++) {
      const visivel = i < m;
      this.cardsBola[i].malha.visible = visivel;
      const alvo = this.alvos[this.cards.length + i];
      alvo.visible = visivel;
      if (!visivel) continue;
      const x = -larguraBolas / 2 + LARGURA_BOLA / 2 + i * (LARGURA_BOLA + ESPACO);
      this.cardsBola[i].malha.position.set(x, yBola, 0);
      alvo.position.set(x, yBola, -0.001);
    }
  }

  private redesenhar(ativoId: string | null, bolaAtivaId: string) {
    // --- fileira do time ---
    for (let i = 0; i < this.entradas.length; i++) {
      const { especie, hp, capturados } = this.entradas[i];
      const card = this.cards[i];
      const { ctx, canvas } = card;
      const selecionado = especie.id === ativoId;
      const sobMira = this.destacado?.tipo === 'criatura' && this.destacado.indice === i;
      const desmaiado = hp <= 0;
      const corTipo = `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`;

      card.limpar(
        desmaiado
          ? 'rgba(26, 14, 18, 0.92)'
          : sobMira
            ? 'rgba(30, 44, 66, 0.95)'
            : 'rgba(14, 20, 30, 0.9)',
        selecionado ? '#7fe7c4' : sobMira ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)',
        20,
      );

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

    // --- fileira das bolas ---
    for (let i = 0; i < this.bolas.length; i++) {
      const { tipo, quantidade } = this.bolas[i];
      const card = this.cardsBola[i];
      const { ctx, canvas } = card;
      const selecionada = tipo.id === bolaAtivaId;
      const sobMira = this.destacado?.tipo === 'bola' && this.destacado.indice === i;
      const vazia = quantidade <= 0;

      card.limpar(
        vazia ? 'rgba(18, 18, 24, 0.85)' : sobMira ? 'rgba(30, 44, 66, 0.95)' : 'rgba(14, 20, 30, 0.9)',
        selecionada ? '#ffd78a' : sobMira ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)',
        16,
      );

      // Desenha a bolinha: metade de cima colorida, metade de baixo clara.
      const cx = canvas.width / 2;
      const cy = 46;
      const r = 24;
      ctx.globalAlpha = vazia ? 0.28 : 1;

      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.fillStyle = `#${new THREE.Color(tipo.corTopo).getHexString()}`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI);
      ctx.fillStyle = `#${new THREE.Color(tipo.corBase).getHexString()}`;
      ctx.fill();

      ctx.beginPath();
      ctx.rect(cx - r, cy - 3, r * 2, 6);
      ctx.fillStyle = '#1a1a1e';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a1e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f4f8';
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '700 26px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = vazia ? '#5e5a66' : '#f2f5fa';
      ctx.fillText(`×${quantidade}`, cx, 80);

      if (tipo.multiplicador > 1) {
        ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = vazia ? '#5e5a66' : '#9fe0ff';
        ctx.fillText(`${tipo.multiplicador}×`, cx, 108);
      }

      card.marcarSujo();
    }
  }

  atualizar(
    dt: number,
    punhoEsquerdo: THREE.Object3D | null,
    mira: { origem: THREE.Vector3; direcao: THREE.Vector3 } | null,
    ativoId: string | null,
    bolaAtivaId: string,
    camera: THREE.Camera,
  ) {
    // A palma virada para cima abre o painel: comparamos o "para cima" local da
    // mão com o do mundo.
    let querAbrir = false;
    if (punhoEsquerdo) {
      punhoEsquerdo.updateMatrixWorld();
      const cimaDaMao = new THREE.Vector3(0, 1, 0).applyQuaternion(
        punhoEsquerdo.getWorldQuaternion(new THREE.Quaternion()),
      );
      querAbrir = cimaDaMao.dot(new THREE.Vector3(0, 1, 0)) > 0.3;
    }
    this.aberto = querAbrir;

    this.abertura += ((querAbrir ? 1 : 0) - this.abertura) * Math.min(1, dt * 10);
    this.grupo.visible = this.abertura > 0.03;
    if (!this.grupo.visible) {
      this.destacado = null;
      return;
    }

    if (punhoEsquerdo) {
      const posicao = punhoEsquerdo.getWorldPosition(new THREE.Vector3());
      posicao.y += 0.14;
      this.grupo.position.lerp(posicao, Math.min(1, dt * 14));
      this.grupo.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    }
    this.grupo.scale.setScalar(0.6 + this.abertura * 0.4);

    const anterior = this.destacado;
    this.destacado = null;
    if (mira && this.abertura > 0.6) {
      this.raycaster.set(mira.origem, mira.direcao);
      const acertos = this.raycaster.intersectObjects(
        this.alvos.filter((a) => a.visible),
        false,
      );
      if (acertos.length > 0) {
        const d = acertos[0].object.userData as { tipo: 'criatura' | 'bola'; indice: number };
        this.destacado = { tipo: d.tipo, indice: d.indice };
      }
    }
    this.mudouDestaque =
      this.destacado !== null &&
      (anterior === null ||
        anterior.tipo !== this.destacado.tipo ||
        anterior.indice !== this.destacado.indice);

    const assinatura = [
      this.destacado ? `${this.destacado.tipo}:${this.destacado.indice}` : '-',
      ativoId,
      bolaAtivaId,
      this.entradas.map((e) => `${e.especie.id}:${Math.ceil(e.hp)}:${e.capturados}`).join(','),
      this.bolas.map((b) => `${b.tipo.id}:${b.quantidade}`).join(','),
    ].join('|');
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.redesenhar(ativoId, bolaAtivaId);
    }

    // O item sob a mira salta um pouco para a frente.
    for (let i = 0; i < this.entradas.length; i++) {
      const alvoZ = this.destacado?.tipo === 'criatura' && this.destacado.indice === i ? 0.016 : 0;
      this.cards[i].malha.position.z += (alvoZ - this.cards[i].malha.position.z) * Math.min(1, dt * 12);
    }
    for (let i = 0; i < this.bolas.length; i++) {
      const alvoZ = this.destacado?.tipo === 'bola' && this.destacado.indice === i ? 0.014 : 0;
      this.cardsBola[i].malha.position.z +=
        (alvoZ - this.cardsBola[i].malha.position.z) * Math.min(1, dt * 12);
    }
  }

  get selecao(): Selecao | null {
    if (!this.destacado) return null;
    if (this.destacado.tipo === 'criatura') {
      const entrada = this.entradas[this.destacado.indice];
      return entrada ? { tipo: 'criatura', entrada } : null;
    }
    const entrada = this.bolas[this.destacado.indice];
    return entrada ? { tipo: 'bola', entrada } : null;
  }

  descartar() {
    for (const card of [...this.cards, ...this.cardsBola]) card.descartar();
    for (const d of this.descartaveis) d.dispose();
    this.titulo.descartar();
  }
}
