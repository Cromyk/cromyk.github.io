import * as THREE from 'three';
import { Placa } from './hud';
import { TIPOS, type Especie } from './species';
import { BOLAS, type TipoBola } from './balls';
import { ITENS, type TipoItem } from './itens';
import { TAMANHO_TIME, type Exemplar } from './state';

export interface EntradaTime {
  exemplar: Exemplar;
  especie: Especie;
  hp: number;
  hpMax: number;
  nivel: number;
  /** 0..1 até o próximo nível. */
  progresso: number;
  shiny: boolean;
  emCampo: boolean;
}

export interface EntradaBola {
  tipo: TipoBola;
  quantidade: number;
}

export interface EntradaItem {
  tipo: TipoItem;
  quantidade: number;
}

export type Selecao =
  | { tipo: 'criatura'; entrada: EntradaTime }
  | { tipo: 'bola'; entrada: EntradaBola }
  | { tipo: 'item'; entrada: EntradaItem };

const LARGURA_CARD = 0.1;
const ALTURA_CARD = 0.13;
const LARGURA_BOLA = 0.076;
const ALTURA_BOLA = 0.066;
const LARGURA_ITEM = 0.076;
const ALTURA_ITEM = 0.058;
const ESPACO = 0.012;

/**
 * Painel preso à mão esquerda. Abre sozinho quando você vira a palma para cima
 * — o mesmo gesto de olhar um relógio — e tem três fileiras: o time em cima, as
 * bolas no meio, os itens embaixo. Aponte com a outra mão e puxe o gatilho.
 *
 * As cartas são criadas uma vez e reaproveitadas. O número delas é fixo e
 * pequeno por um motivo concreto: cada carta é um canvas com textura própria, e
 * uma por espécie da Pokédex seriam 151 texturas na memória do headset só para
 * desenhar um menu. Por isso o time vai a campo com seis; o resto da coleção
 * mora na Pokédex, que desenha uma página inteira num canvas só.
 */
export class PainelTime {
  readonly grupo = new THREE.Group();
  aberto = false;
  /** Trocou o item sob a mira neste quadro. */
  mudouDestaque = false;

  private cards: Placa[] = [];
  private cardsBola: Placa[] = [];
  private cardsItem: Placa[] = [];
  private alvos: THREE.Mesh[] = [];
  private titulo = new Placa(0.3, 0.038, 512);
  private entradas: EntradaTime[] = [];
  private bolas: EntradaBola[] = [];
  private itens: EntradaItem[] = [];
  private destacado: { tipo: 'criatura' | 'bola' | 'item'; indice: number } | null = null;
  private assinatura = '';
  private abertura = 0;
  private raycaster = new THREE.Raycaster();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.titulo.malha.position.set(0, ALTURA_CARD * 0.5 + 0.032, 0);
    this.grupo.add(this.titulo.malha);
    this.grupo.visible = false;

    const geoAlvo = new THREE.PlaneGeometry(1, 1);
    const matAlvo = new THREE.MeshBasicMaterial({ visible: false });
    this.descartaveis.push(geoAlvo, matAlvo);

    const novoAlvo = (tipo: string, indice: number, l: number, a: number) => {
      const alvo = new THREE.Mesh(geoAlvo, matAlvo);
      alvo.scale.set(l * 1.12, a * 1.15, 1);
      alvo.userData = { tipo, indice };
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    };

    for (let i = 0; i < TAMANHO_TIME; i++) {
      const card = new Placa(LARGURA_CARD, ALTURA_CARD, 300);
      this.cards.push(card);
      this.grupo.add(card.malha);
      novoAlvo('criatura', i, LARGURA_CARD, ALTURA_CARD);
    }

    for (let i = 0; i < BOLAS.length; i++) {
      const card = new Placa(LARGURA_BOLA, ALTURA_BOLA, 230);
      this.cardsBola.push(card);
      this.grupo.add(card.malha);
      novoAlvo('bola', i, LARGURA_BOLA, ALTURA_BOLA);
    }

    for (let i = 0; i < ITENS.length; i++) {
      const card = new Placa(LARGURA_ITEM, ALTURA_ITEM, 210);
      this.cardsItem.push(card);
      this.grupo.add(card.malha);
      novoAlvo('item', i, LARGURA_ITEM, ALTURA_ITEM);
    }
  }

  get time(): EntradaTime[] {
    return this.entradas;
  }

  definirConteudo(entradas: EntradaTime[], bolas: EntradaBola[], itens: EntradaItem[]) {
    this.entradas = entradas.slice(0, TAMANHO_TIME);
    this.bolas = bolas;
    this.itens = itens;
    this.reposicionar();
  }

  private fileira(
    cards: Placa[],
    indiceAlvoBase: number,
    quantos: number,
    largura: number,
    y: number,
  ) {
    const total = quantos * largura + Math.max(0, quantos - 1) * ESPACO;
    for (let i = 0; i < cards.length; i++) {
      const visivel = i < quantos;
      cards[i].malha.visible = visivel;
      const alvo = this.alvos[indiceAlvoBase + i];
      alvo.visible = visivel;
      if (!visivel) continue;
      const x = -total / 2 + largura / 2 + i * (largura + ESPACO);
      cards[i].malha.position.set(x, y, cards[i].malha.position.z);
      alvo.position.set(x, y, -0.001);
    }
  }

  private reposicionar() {
    const yBola = -ALTURA_CARD / 2 - ALTURA_BOLA / 2 - 0.016;
    const yItem = yBola - ALTURA_BOLA / 2 - ALTURA_ITEM / 2 - 0.012;

    this.fileira(this.cards, 0, this.entradas.length, LARGURA_CARD, 0);
    this.fileira(this.cardsBola, this.cards.length, this.bolas.length, LARGURA_BOLA, yBola);
    this.fileira(
      this.cardsItem,
      this.cards.length + this.cardsBola.length,
      this.itens.length,
      LARGURA_ITEM,
      yItem,
    );
  }

  private redesenharTitulo(vistas: number, capturadas: number, total: number) {
    this.titulo.escrever(
      [
        { texto: 'seu time', tamanho: 34, cor: '#cfe0f5', peso: 700 },
        {
          texto: `${capturadas} capturadas · ${vistas} vistas de ${total}`,
          tamanho: 21,
          cor: '#8d9bb0',
          peso: 500,
          espaco: 3,
        },
      ],
      { raio: 12, fundo: 'rgba(10,14,22,0.82)' },
    );
  }

  private redesenhar(bolaAtivaId: string) {
    // --- fileira do time ---
    for (let i = 0; i < this.entradas.length; i++) {
      const e = this.entradas[i];
      const card = this.cards[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'criatura' && this.destacado.indice === i;
      const desmaiado = e.hp <= 0;
      const corTipo = `#${new THREE.Color(TIPOS[e.especie.tipo].cor).getHexString()}`;

      card.limpar(
        desmaiado
          ? 'rgba(26, 14, 18, 0.92)'
          : sobMira
            ? 'rgba(30, 44, 66, 0.95)'
            : 'rgba(14, 20, 30, 0.9)',
        e.emCampo ? '#7fe7c4' : sobMira ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)',
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
      ctx.font = '700 28px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = desmaiado ? '#7a6a70' : e.shiny ? '#ffe08a' : '#f2f5fa';
      ctx.fillText(
        e.shiny ? `✦ ${e.especie.nome}` : e.especie.nome,
        canvas.width / 2,
        34,
        canvas.width - 20,
      );

      ctx.font = '600 21px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = desmaiado ? '#6a5a60' : corTipo;
      ctx.fillText(
        e.especie.tipos.map((t) => TIPOS[t].nome).join('/').toUpperCase(),
        canvas.width / 2,
        70,
        canvas.width - 20,
      );

      // Barra de vida.
      const fracao = Math.max(0, e.hp / Math.max(1, e.hpMax));
      const larguraBarra = canvas.width - 40;
      const y = 104;
      ctx.beginPath();
      ctx.roundRect(20, y, larguraBarra, 13, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      if (fracao > 0) {
        ctx.beginPath();
        ctx.roundRect(20, y, Math.max(12, larguraBarra * fracao), 13, 6);
        ctx.fillStyle = fracao > 0.5 ? '#5fd47a' : fracao > 0.22 ? '#ffc94a' : '#ff5f5f';
        ctx.fill();
      }

      // Barra fina de experiência, logo abaixo — dá para ver o nível chegando.
      const yXp = y + 17;
      ctx.beginPath();
      ctx.roundRect(20, yXp, larguraBarra, 5, 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fill();
      if (e.progresso > 0) {
        ctx.beginPath();
        ctx.roundRect(20, yXp, Math.max(4, larguraBarra * e.progresso), 5, 2.5);
        ctx.fillStyle = '#6fb6ff';
        ctx.fill();
      }

      ctx.font = '600 19px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#93a0b4';
      ctx.fillText(
        desmaiado ? 'desmaiado' : `${Math.ceil(e.hp)}/${e.hpMax}`,
        canvas.width / 2,
        yXp + 12,
      );

      ctx.textAlign = 'left';
      ctx.font = '700 20px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = '#c8d4e6';
      ctx.fillText(`N${e.nivel}`, 18, 34);

      if (e.emCampo) {
        ctx.textAlign = 'center';
        ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = '#7fe7c4';
        ctx.fillText('EM CAMPO', canvas.width / 2, yXp + 34);
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

    // --- fileira dos itens ---
    for (let i = 0; i < this.itens.length; i++) {
      const { tipo, quantidade } = this.itens[i];
      const card = this.cardsItem[i];
      const { ctx, canvas } = card;
      const sobMira = this.destacado?.tipo === 'item' && this.destacado.indice === i;
      const vazio = quantidade <= 0;
      const cor = `#${new THREE.Color(tipo.cor).getHexString()}`;

      card.limpar(
        vazio ? 'rgba(18, 18, 24, 0.85)' : sobMira ? 'rgba(30, 44, 66, 0.95)' : 'rgba(14, 20, 30, 0.9)',
        sobMira ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)',
        14,
      );

      ctx.globalAlpha = vazio ? 0.3 : 1;
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.roundRect(12, 12, 10, canvas.height - 24, 5);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '700 24px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = vazio ? '#5e5a66' : '#f2f5fa';
      ctx.fillText(tipo.nome, 32, 22, canvas.width - 44);

      ctx.font = '700 26px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = vazio ? '#5e5a66' : cor;
      ctx.fillText(`×${quantidade}`, 32, 58);

      card.marcarSujo();
    }
  }

  atualizar(
    dt: number,
    punhoEsquerdo: THREE.Object3D | null,
    mira: { origem: THREE.Vector3; direcao: THREE.Vector3 } | null,
    bolaAtivaId: string,
    camera: THREE.Camera,
    resumo: { vistas: number; capturadas: number; total: number },
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
        const d = acertos[0].object.userData as {
          tipo: 'criatura' | 'bola' | 'item';
          indice: number;
        };
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
      bolaAtivaId,
      resumo.vistas,
      resumo.capturadas,
      this.entradas
        .map((e) => `${e.especie.id}:${Math.ceil(e.hp)}:${e.nivel}:${e.emCampo ? 1 : 0}`)
        .join(','),
      this.bolas.map((b) => `${b.tipo.id}:${b.quantidade}`).join(','),
      this.itens.map((b) => `${b.tipo.id}:${b.quantidade}`).join(','),
    ].join('|');
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.redesenharTitulo(resumo.vistas, resumo.capturadas, resumo.total);
      this.redesenhar(bolaAtivaId);
    }

    // O item sob a mira salta um pouco para a frente.
    const saltar = (cards: Placa[], tipo: string, quantos: number, altura: number) => {
      for (let i = 0; i < quantos; i++) {
        const alvoZ = this.destacado?.tipo === tipo && this.destacado.indice === i ? altura : 0;
        const m = cards[i].malha;
        m.position.z += (alvoZ - m.position.z) * Math.min(1, dt * 12);
      }
    };
    saltar(this.cards, 'criatura', this.entradas.length, 0.016);
    saltar(this.cardsBola, 'bola', this.bolas.length, 0.014);
    saltar(this.cardsItem, 'item', this.itens.length, 0.012);
  }

  get selecao(): Selecao | null {
    if (!this.destacado) return null;
    if (this.destacado.tipo === 'criatura') {
      const entrada = this.entradas[this.destacado.indice];
      return entrada ? { tipo: 'criatura', entrada } : null;
    }
    if (this.destacado.tipo === 'item') {
      const entrada = this.itens[this.destacado.indice];
      return entrada ? { tipo: 'item', entrada } : null;
    }
    const entrada = this.bolas[this.destacado.indice];
    return entrada ? { tipo: 'bola', entrada } : null;
  }

  descartar() {
    for (const card of [...this.cards, ...this.cardsBola, ...this.cardsItem]) card.descartar();
    for (const d of this.descartaveis) d.dispose();
    this.titulo.descartar();
  }
}
