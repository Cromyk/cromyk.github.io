import * as THREE from 'three';
import { montarCorpoDeBola } from './orb';
import { BOLAS, type TipoBola } from './balls';

/**
 * O cinto de pokébolas, um em cada antebraço.
 *
 * Antes as bolas eram CARDS no painel do pulso: você girava o pulso para abrir
 * o painel, mirava a mão numa carta e apertava o grip. Funcionava, mas era um
 * menu — e menu é a coisa que a realidade misturada existe para não precisar.
 * Aqui elas são objetos: quatro bolas de verdade presas ao seu antebraço, que
 * você alcança com a outra mão e pega.
 *
 * ## Por que o antebraço, e não a cintura
 *
 * A cintura é onde um treinador usaria, e foi a primeira ideia. Mas o Quest não
 * rastreia o seu quadril: ele rastreia a sua cabeça e as suas mãos. Uma bola
 * "na cintura" ficaria presa a uma altura adivinhada a partir da cabeça, e
 * mudaria de lugar toda vez que você se abaixasse. O antebraço é rastreado de
 * verdade, está sempre no campo de visão quando você olha para ele, e a mão
 * outra mão já sabe chegar lá — é o mesmo alcance de quem coça o braço.
 *
 * ## Um em cada braço, desde 18/09
 *
 * A mão que CARREGA o cinto não alcança o próprio antebraço, então um cinto só,
 * no braço esquerdo, queria dizer que apenas a mão direita podia tirar uma bola
 * — e quem prefere arremessar com a esquerda não tinha de onde pegar. Com um em
 * cada braço, qualquer mão pega do braço oposto. O estoque é o mesmo nos dois:
 * é uma mochila, não duas.
 *
 * ## O que é um slot
 *
 * Um slot é um tipo de bola. Ele mostra a bola em miniatura, flutuando e
 * girando devagar, com a quantidade ao lado. Vazio, a bola fica apagada e
 * translúcida: o lugar continua lá, porque saber que a Bola Lacuna existe e
 * acabou é informação, e um buraco no cinto não conta isso.
 *
 * Quando você tira uma bola dali, o slot fica **aberto** — a miniatura some e o
 * berço pisca de leve. É o que diz para onde devolver, e é o que permite ao
 * jogo distinguir "guardei de volta" de "abri a mão no ar", que são o mesmo
 * gesto em lugares diferentes.
 */

/** Raio da miniatura. A bola de verdade tem 4,5 cm; esta é pouco mais da metade. */
const RAIO = 0.026;
/**
 * Distância entre um slot e o próximo, ao longo do antebraço.
 *
 * Subiu de 5,8 para 6,6 cm depois do playtest de 18/09, e o motivo é a conta
 * abaixo: com 5,8 de passo e 7 de alcance, os campos de dois slots vizinhos se
 * sobrepunham em mais de um centímetro de cada lado. `slotSob` escolhe o mais
 * perto e nunca erra feio, mas na zona de sobreposição a mão precisa de menos
 * de 3 cm de precisão para pegar a bola que você QUER — e 3 cm é menos do que
 * um braço no ar entrega, ainda mais com a outra mão tapando o alvo.
 *
 * Quatro slots a 6,6 cm, começando 7,5 cm atrás do punho, terminam a 27 cm —
 * o comprimento de um antebraço adulto. Mais do que isto e o último slot sai
 * para fora do cotovelo.
 */
export const PASSO_SLOT = 0.066;
/** Onde o primeiro slot começa, medido para trás a partir do punho. */
export const INICIO_SLOT = 0.075;

/**
 * Quão perto a mão precisa chegar para o slot contar como alcançado.
 *
 * Generoso de propósito: a mão que vem pegar tapa o slot no meio do caminho, e
 * exigir precisão de milímetro num alvo que você não está vendo é o tipo de
 * coisa que faz alguém fechar o grip três vezes até funcionar.
 *
 * Quem mede a distância é o CENTRO DA MÃO FECHADA e não a ponta do dedo — ver
 * `slotSobAMao`, em src/game.ts. Esse era o defeito principal: a ponta do
 * indicador vai uns seis centímetros à frente da palma, então a mão chegava ao
 * slot já tendo passado por ele.
 */
export const ALCANCE_SLOT = 0.075;

interface Slot {
  tipo: TipoBola;
  /** O berço, que fica no lugar mesmo com a bola na sua mão. */
  base: THREE.Group;
  /** A bola em miniatura, que some enquanto você a segura. */
  bola: THREE.Group;
  materiais: THREE.Material[];
  quantidade: number;
  /** Você tirou esta bola e ainda não devolveu. */
  aberto: boolean;
  fase: number;
}

export class Cinto {
  readonly grupo = new THREE.Group();

  private slots: Slot[] = [];
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private tempo = 0;
  /** O slot sob a mão neste quadro, para ele crescer e o resto não. */
  private destacado = -1;

  constructor(lado: 'left' | 'right' = 'left') {
    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    // Pela convenção do grip space, −Z é para onde os dedos apontam, então o
    // antebraço sai por +Z. O dorso é −X na esquerda e +X na direita: é a face
    // que você vê ao levantar o braço, e é onde as bolas ficam.
    const ladoDoDorso = lado === 'left' ? -1 : 1;

    const geoBerco = guardar(new THREE.TorusGeometry(RAIO * 1.15, RAIO * 0.16, 8, 20));

    for (let i = 0; i < BOLAS.length; i++) {
      const tipo = BOLAS[i];

      const base = new THREE.Group();
      base.position.set(ladoDoDorso * 0.022, 0.012, INICIO_SLOT + i * PASSO_SLOT);

      // O berço: um anel raso, como o encaixe de um cinto de verdade. Ele é o
      // que continua ali quando a bola está na sua mão.
      //
      // Um material POR berço, e não um para os quatro: é ele que pisca quando
      // o slot está esperando a bola de volta, e material compartilhado faria
      // os quatro piscarem juntos.
      const anel = new THREE.Mesh(
        geoBerco,
        guardar(
          new THREE.MeshStandardMaterial({
            color: 0x2a3142,
            roughness: 0.6,
            metalness: 0.3,
            transparent: true,
            opacity: 0.85,
          }),
        ),
      );
      anel.rotation.x = Math.PI * 0.5;
      base.add(anel);

      const { grupo: bola } = montarCorpoDeBola(RAIO, tipo.corTopo, tipo.corBase, guardar);
      // A bola do cinto fica com a faixa de pé, como uma bola pousada no berço:
      // deitada, ela vira um disco e some do canto do olho.
      bola.rotation.x = Math.PI * 0.5;
      base.add(bola);

      this.grupo.add(base);
      this.slots.push({
        tipo,
        base,
        bola,
        materiais: [],
        quantidade: 0,
        aberto: false,
        // Cada uma flutua fora de fase: quatro bolas subindo juntas viram um
        // elevador, e quatro subindo em tempos diferentes viram quatro bolas.
        fase: i * 1.7,
      });
    }

    // Os materiais de cada bola, para o slot vazio poder apagar só a dele.
    for (const slot of this.slots) {
      const vistos = new Set<THREE.Material>();
      slot.bola.traverse((o) => {
        const malha = o as THREE.Mesh;
        if (!malha.isMesh) return;
        const mats = Array.isArray(malha.material) ? malha.material : [malha.material];
        for (const m of mats) vistos.add(m);
      });
      slot.materiais = [...vistos];
    }
  }

  /** Quantas bolas de cada tipo o cinto mostra. */
  definirEstoque(quantidadeDe: (id: string) => number) {
    for (const slot of this.slots) slot.quantidade = quantidadeDe(slot.tipo.id);
  }

  /** Marca que esta bola saiu para a mão (ou voltou). */
  definirAberto(id: string, aberto: boolean) {
    for (const slot of this.slots) {
      if (slot.tipo.id === id) slot.aberto = aberto;
    }
  }

  /** Fecha todos os slots. Usado quando a mão perde o que estava segurando. */
  fecharTudo() {
    for (const slot of this.slots) slot.aberto = false;
  }

  /**
   * O slot mais perto deste ponto do mundo, dentro do alcance.
   *
   * Devolve o mais PRÓXIMO, e não o primeiro que serve: os slots estão a menos
   * de seis centímetros um do outro e o alcance é maior do que isso, então
   * quase sempre dois competem — e o que vale é aquele em que a mão está
   * realmente em cima.
   */
  slotSob(ponto: THREE.Vector3, alcance = ALCANCE_SLOT): TipoBola | null {
    let melhor: Slot | null = null;
    let menor = alcance * alcance;
    const centro = new THREE.Vector3();
    for (const slot of this.slots) {
      slot.base.getWorldPosition(centro);
      const d = centro.distanceToSquared(ponto);
      if (d < menor) {
        menor = d;
        melhor = slot;
      }
    }
    return melhor?.tipo ?? null;
  }

  /** O mesmo alcance do `slotSob`, para o jogo desenhar o destaque certo. */
  destacar(ponto: THREE.Vector3 | null, alcance = ALCANCE_SLOT) {
    if (!ponto) {
      this.destacado = -1;
      return;
    }
    const centro = new THREE.Vector3();
    let menor = alcance * alcance;
    this.destacado = -1;
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].base.getWorldPosition(centro);
      const d = centro.distanceToSquared(ponto);
      if (d < menor) {
        menor = d;
        this.destacado = i;
      }
    }
  }

  atualizar(dt: number) {
    this.tempo += dt;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const vazio = slot.quantidade <= 0;
      const temBola = !vazio && !slot.aberto;

      // Aberto, a bola está na sua mão e não pode estar nos dois lugares.
      // Vazia, ela fica de fantasma: o lugar continua, a bola não.
      slot.bola.visible = !slot.aberto;
      for (const m of slot.materiais) {
        const mat = m as THREE.MeshStandardMaterial;
        mat.transparent = vazio;
        mat.opacity = vazio ? 0.16 : 1;
      }

      // Flutuar e girar. É o que separa uma bola guardada de uma bola colada
      // no braço — e é o convite para a outra mão vir buscar.
      const t = this.tempo * 1.6 + slot.fase;
      slot.bola.position.y = Math.sin(t) * 0.004;
      slot.bola.rotation.y = this.tempo * 0.7 + slot.fase;

      const alvo = i === this.destacado && temBola ? 1.22 : 1;
      const atual = slot.bola.scale.x;
      const k = 1 - Math.pow(0.001, dt);
      slot.bola.scale.setScalar(atual + (alvo - atual) * k);

      // O berço pisca enquanto o slot está esperando a bola de volta.
      const anel = slot.base.children[0] as THREE.Mesh;
      const mat = anel.material as THREE.MeshStandardMaterial;
      if (slot.aberto) {
        mat.emissive = new THREE.Color(0x3f7dff);
        mat.emissiveIntensity = 0.35 + Math.sin(this.tempo * 6) * 0.25;
      } else {
        mat.emissiveIntensity = 0;
      }
    }
  }

  descartar() {
    this.grupo.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
    this.descartaveis = [];
  }
}
