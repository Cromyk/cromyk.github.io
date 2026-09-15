import * as THREE from 'three';
import type { Pokemon } from './creature';
import { Placa } from './hud';
import { COR, RAIO, cartao, fonte, hex, textoAjustado } from './estilo';
import type { Especie } from './species';

/**
 * A evolução: o pedido de permissão e o efeito.
 *
 * Antes isto acontecia sozinho e em silêncio — subia de nível, a espécie trocava
 * no mesmo quadro e um texto aparecia para avisar que já era. Duas coisas
 * erradas nisso. A primeira é que evoluir é uma DECISÃO no jogo original, e
 * tirá-la do jogador tira junto a única escolha irreversível que ele tem. A
 * segunda é que o momento mais bonito do jogo passava sem imagem nenhuma.
 *
 * ## Por que os materiais são clonados
 *
 * O branco da evolução é feito escrevendo em `color` e `emissive` do material do
 * bicho. Mas os materiais vêm do molde em cache de src/modelos.ts e são
 * COMPARTILHADOS por todos os exemplares da espécie: escrever neles pintaria de
 * branco todo Charmander da sala, e o branco ficaria lá depois — o cache não é
 * recarregado. Então o efeito clona os materiais do exemplar que está evoluindo,
 * mexe nos clones e os descarta no fim.
 */

/** A altura do pulso da evolução, em segundos desde o começo. */
const DURACAO_BRILHO = 2.8;
const DURACAO_SAIDA = 1.6;

export type FaseEvolucao = 'brilhando' | 'trocar' | 'nascendo' | 'terminou';

export class Evolucao {
  private tempo = 0;
  private fase: FaseEvolucao = 'brilhando';
  private luz: THREE.PointLight;
  private halo: THREE.Mesh;
  private materiais: THREE.MeshStandardMaterial[] = [];
  private originais: Array<{ cor: THREE.Color; emissivo: THREE.Color; intensidade: number }> = [];
  private alvo: Pokemon;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(pokemon: Pokemon, cena: THREE.Object3D) {
    this.alvo = pokemon;
    this.adotarMateriais(pokemon);

    this.luz = new THREE.PointLight(0xffffff, 0, 3.2, 2);
    this.luz.position.copy(pokemon.centro);
    cena.add(this.luz);

    // Uma esfera aditiva por dentro do bicho: é o que faz o brilho sangrar para
    // fora da silhueta em vez de ficar preso na superfície dele.
    const geo = new THREE.SphereGeometry(pokemon.raio * 1.25, 18, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.descartaveis.push(geo, mat);
    this.halo = new THREE.Mesh(geo, mat);
    this.halo.frustumCulled = false;
    cena.add(this.halo);
  }

  /** Troca os materiais do exemplar por clones que podem ser pintados. */
  private adotarMateriais(pokemon: Pokemon) {
    pokemon.corpo.raiz.traverse((obj) => {
      const malha = obj as THREE.Mesh;
      if (!malha.isMesh) return;
      const lista = Array.isArray(malha.material) ? malha.material : [malha.material];
      const clones = lista.map((m) => {
        const clone = (m as THREE.MeshStandardMaterial).clone();
        this.materiais.push(clone);
        this.originais.push({
          cor: clone.color.clone(),
          emissivo: clone.emissive?.clone() ?? new THREE.Color(0, 0, 0),
          intensidade: clone.emissiveIntensity ?? 1,
        });
        return clone;
      });
      malha.material = Array.isArray(malha.material) ? clones : clones[0];
    });
  }

  /**
   * Quanto o corpo está branco, 0..1. A curva não é reta: ele fica quase normal
   * a maior parte do tempo e estoura no fim, que é como a cena se lembra.
   */
  private get brancura(): number {
    const t = Math.min(1, this.tempo / DURACAO_BRILHO);
    return Math.pow(t, 2.4);
  }

  atualizar(dt: number): FaseEvolucao {
    this.tempo += dt;

    if (this.fase === 'brilhando') {
      const b = this.brancura;
      this.pintar(b);

      // O estica-e-encolhe clássico, acelerando. É o que diz "está
      // acontecendo" antes de qualquer texto aparecer.
      const ritmo = 4 + b * 22;
      const pulso = Math.sin(this.tempo * ritmo);
      const forca = 0.1 + b * 0.32;
      const corpo = this.alvo.corpo.corpo;
      corpo.scale.set(1 - pulso * forca * 0.6, 1 + pulso * forca, 1 - pulso * forca * 0.6);

      this.luz.position.copy(this.alvo.centro);
      this.luz.intensity = b * 14;
      this.halo.position.copy(this.alvo.centro);
      (this.halo.material as THREE.MeshBasicMaterial).opacity = b * 0.85;
      this.halo.scale.setScalar(0.8 + b * 0.9);

      if (this.tempo >= DURACAO_BRILHO) {
        this.fase = 'trocar';
        return 'trocar';
      }
      return 'brilhando';
    }

    if (this.fase === 'nascendo') {
      const t = Math.min(1, (this.tempo - DURACAO_BRILHO) / DURACAO_SAIDA);
      // O novo nasce branco e a cor volta: é a mesma curva de antes, ao contrário.
      this.pintar(Math.pow(1 - t, 1.6));
      this.luz.position.copy(this.alvo.centro);
      this.luz.intensity = (1 - t) * 14;
      this.halo.position.copy(this.alvo.centro);
      (this.halo.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      this.halo.scale.setScalar(1.7 - t * 0.9);
      if (t >= 1) this.fase = 'terminou';
    }

    return this.fase;
  }

  /** Mistura a cor original com branco, nos clones. */
  private pintar(quanto: number) {
    const b = THREE.MathUtils.clamp(quanto, 0, 1);
    for (let i = 0; i < this.materiais.length; i++) {
      const m = this.materiais[i];
      const o = this.originais[i];
      m.color.copy(o.cor).lerp(BRANCO, b);
      if (m.emissive) {
        m.emissive.copy(o.emissivo).lerp(BRANCO, b);
        m.emissiveIntensity = o.intensidade + b * 2.5;
      }
    }
  }

  /**
   * O corpo novo entrou em cena: o efeito passa a pintar ele, do branco de volta
   * para a cor. Os materiais do corpo velho vão embora junto com ele.
   */
  assumir(novo: Pokemon) {
    this.soltarMateriais();
    this.alvo = novo;
    this.adotarMateriais(novo);
    this.pintar(1);
    this.fase = 'nascendo';
    this.tempo = DURACAO_BRILHO;
  }

  /** Devolve os materiais compartilhados e descarta os clones. */
  private soltarMateriais() {
    for (const m of this.materiais) m.dispose();
    this.materiais = [];
    this.originais = [];
  }

  descartar(cena: THREE.Object3D) {
    this.pintar(0);
    // A escala volta ao normal: o estica-e-encolhe escreveu direto no grupo do
    // corpo, e src/creature.ts só o reescreve no quadro seguinte.
    this.alvo.corpo.corpo.scale.set(1, 1, 1);
    this.soltarMateriais();
    cena.remove(this.luz, this.halo);
    for (const d of this.descartaveis) d.dispose();
  }
}

const BRANCO = new THREE.Color(1, 1, 1);

/**
 * O pedido de permissão, flutuando à frente de quem joga.
 *
 * Não é o `Aviso` comum: aquele some sozinho em alguns segundos, e uma pergunta
 * que some sozinha não é uma pergunta. Este fica até ser respondido.
 */
export class PromptEvolucao {
  readonly grupo = new THREE.Group();
  private placa = new Placa(0.42, 0.19, 660);
  private visivel = 0;
  private tempo = 0;
  private assinatura = '';

  constructor() {
    this.grupo.add(this.placa.malha);
    this.grupo.visible = false;
  }

  private redesenhar(de: Especie, para: Especie) {
    const { ctx, canvas } = this.placa;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cartao(ctx, 2, 2, canvas.width - 4, canvas.height - 4, { acento: 0xfff2b0 }, RAIO.cartao);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.font = fonte(26, 700);
    ctx.fillStyle = COR.atencao;
    ctx.fillText('O QUÊ?', canvas.width / 2, 26);

    ctx.font = fonte(40, 700);
    ctx.fillStyle = COR.texto;
    ctx.fillText(
      textoAjustado(ctx, `${de.nome} está evoluindo!`, canvas.width - 50),
      canvas.width / 2,
      62,
    );

    ctx.font = fonte(25, 600);
    ctx.fillStyle = hex(0xfff2b0);
    ctx.fillText(`vai virar ${para.nome}`, canvas.width / 2, 112);

    ctx.font = fonte(23, 700);
    ctx.fillStyle = COR.bom;
    ctx.fillText('A — deixar evoluir', canvas.width * 0.29, 158);
    ctx.fillStyle = COR.ruim;
    ctx.fillText('B — agora não', canvas.width * 0.72, 158);

    this.placa.marcarSujo();
  }

  mostrar(de: Especie, para: Especie) {
    const assinatura = `${de.id}>${para.id}`;
    if (assinatura !== this.assinatura) {
      this.assinatura = assinatura;
      this.redesenhar(de, para);
    }
  }

  esconder() {
    this.assinatura = '';
  }

  atualizar(dt: number, mostrando: boolean, camera: THREE.Camera) {
    this.tempo += dt;
    this.visivel += ((mostrando ? 1 : 0) - this.visivel) * Math.min(1, dt * 9);
    this.grupo.visible = this.visivel > 0.02;
    if (!this.grupo.visible) return;

    this.placa.opacidade = this.visivel;
    // Um pouco acima do centro da vista: a pergunta precisa estar no caminho do
    // olhar sem cobrir o Pokémon que está prestes a mudar.
    const alvo = new THREE.Vector3(0, 0.1, -0.95).applyMatrix4(camera.matrixWorld);
    this.grupo.position.lerp(alvo, Math.min(1, dt * 8));
    this.grupo.quaternion.copy(camera.quaternion);
    this.grupo.scale.setScalar(0.85 + this.visivel * 0.15 + Math.sin(this.tempo * 3) * 0.012);
  }

  descartar() {
    this.placa.descartar();
  }
}
