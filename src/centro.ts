import * as THREE from 'three';
import { Placa } from './hud';
import type { Sala } from './room';

/**
 * O Centro Pokémon: um móvel da sua casa que cura o time.
 *
 * ## Por que isto é mais Pokémon do que o botão que ele substitui
 *
 * Curar existia como um botão "curar time" dentro do PC — correto, gratuito e
 * sem lugar nenhum. Num jogo de Pokémon o Centro é uma das três coisas que
 * estruturam a geografia inteira: você sabe onde ele fica, você VOLTA para ele,
 * e a distância até ele é o que dá peso a continuar caçando com o time
 * machucado. Um botão num menu não tem distância, e por isso não tem peso.
 *
 * Aqui o Centro é uma **superfície do seu quarto** — a sua mesa, o seu
 * criado-mudo. O jogo escolhe um móvel mapeado e marca com um disco luminoso e
 * a cruz; você leva o time até lá e ele se cura. É a mesma ideia dos itens em
 * cima dos móveis (src/achados.ts), levada ao lugar onde ela muda o laço do
 * jogo em vez de só recompensá-lo.
 *
 * ## Por que ele não é gratuito, mas também não é punição
 *
 * A cura é completa e não tem espera: o custo é **ir até lá**. Num cômodo isso
 * são alguns passos, e é exatamente o tipo de custo que a realidade misturada
 * cobra de graça e que nenhum outro jogo consegue cobrar.
 *
 * O botão do PC continua existindo. Tirar o caminho de saída de quem joga
 * sentado, ou de quem está num quarto que o headset não mapeou, seria trocar
 * uma coisa boa por uma barreira.
 */

/** A que distância do disco o time se cura. */
const ALCANCE = 0.55;
/** Raio do disco no chão do móvel. */
const RAIO = 0.16;

export class Centro {
  readonly grupo = new THREE.Group();

  private disco: THREE.Mesh;
  private cruz: THREE.Group;
  private placa = new Placa(0.24, 0.07, 420);
  private luz: THREE.PointLight;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  private tempo = 0;
  private colocado = false;
  /** Segundos até poder curar de novo. */
  private recarga = 0;

  constructor() {
    const geoDisco = new THREE.CylinderGeometry(RAIO, RAIO, 0.004, 32);
    const matDisco = new THREE.MeshBasicMaterial({
      color: 0xff6b8a,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.descartaveis.push(geoDisco, matDisco);
    this.disco = new THREE.Mesh(geoDisco, matDisco);
    this.grupo.add(this.disco);

    // A cruz, que é o símbolo. Dois blocos finos cruzados, porque a essa
    // distância e nesse tamanho qualquer coisa mais detalhada vira um borrão.
    this.cruz = new THREE.Group();
    const matCruz = new THREE.MeshBasicMaterial({
      color: 0xffd7de,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const geoBraco = new THREE.BoxGeometry(RAIO * 0.9, 0.006, RAIO * 0.28);
    this.descartaveis.push(matCruz, geoBraco);
    const horizontal = new THREE.Mesh(geoBraco, matCruz);
    const vertical = new THREE.Mesh(geoBraco, matCruz);
    vertical.rotation.y = Math.PI * 0.5;
    this.cruz.add(horizontal, vertical);
    this.cruz.position.y = 0.006;
    this.grupo.add(this.cruz);

    this.placa.escrever(
      [
        { texto: 'Centro Pokémon', tamanho: 34, cor: '#ffd7de', peso: 700 },
        { texto: 'traga o time para cá', tamanho: 21, cor: '#9aa5b8', peso: 500, espaco: 4 },
      ],
      { raio: 14, fundo: 'rgba(10, 14, 22, 0.86)', borda: 'rgba(255, 180, 200, 0.3)' },
    );
    this.placa.malha.position.y = 0.2;
    this.grupo.add(this.placa.malha);

    this.luz = new THREE.PointLight(0xff8fa8, 0.5, 1.1, 2);
    this.luz.position.y = 0.12;
    this.grupo.add(this.luz);

    this.grupo.visible = false;
  }

  get pronto(): boolean {
    return this.colocado && this.recarga <= 0;
  }

  get posicao(): THREE.Vector3 {
    return this.grupo.position;
  }

  /**
   * Escolhe um móvel e planta o Centro nele. Uma vez por sessão.
   *
   * O móvel é escolhido pelo próprio sorteio de superfícies do jogo, com a
   * preferência `movel` — a mesma que os itens usam. Não há escolha do jogador
   * aqui de propósito: um passo de configuração antes de jogar é um passo que
   * quase ninguém completa, e o Centro precisa existir para quem só quer
   * brincar. Se o lugar ficar ruim, ele se muda sozinho na próxima sessão.
   */
  talvezColocar(sala: Sala, jogador: THREE.Vector3): boolean {
    if (this.colocado) return false;
    const local = sala.pontoDeSpawn(jogador, 0.8, 5, 'movel');
    if (!local || local.rotulo === 'floor') return false;

    this.grupo.position.copy(local.ponto);
    this.grupo.position.y += 0.012;
    this.colocado = true;
    this.grupo.visible = true;
    return true;
  }

  /**
   * Devolve `true` no quadro em que o time deve ser curado.
   *
   * A recarga longa não é balanço, é conforto: sem ela, passar perto do móvel
   * com o time inteiro dispararia a fanfarra e o aviso a cada poucos segundos,
   * e a coisa mais acolhedora do jogo viraria a mais irritante.
   */
  atualizar(dt: number, jogador: THREE.Vector3, precisaCurar: boolean): boolean {
    if (!this.colocado) return false;
    this.tempo += dt;
    if (this.recarga > 0) this.recarga -= dt;

    // Pulsa devagar, como a luz de um lugar seguro deve pulsar.
    const pulso = 0.5 + Math.sin(this.tempo * 1.5) * 0.5;
    (this.disco.material as THREE.MeshBasicMaterial).opacity = 0.26 + pulso * 0.22;
    this.luz.intensity = 0.35 + pulso * 0.3;
    this.cruz.position.y = 0.006 + pulso * 0.012;
    this.cruz.rotation.y += dt * 0.25;

    // A placa encara quem chega, mas só no plano: inclinar para cima faria o
    // texto apontar para o teto quando você se aproxima de perto.
    this.placa.malha.lookAt(jogador.x, this.placa.malha.getWorldPosition(_mundo).y, jogador.z);

    if (!precisaCurar || this.recarga > 0) return false;
    const perto =
      Math.hypot(jogador.x - this.grupo.position.x, jogador.z - this.grupo.position.z) < ALCANCE;
    if (!perto) return false;

    this.recarga = 20;
    return true;
  }

  descartar() {
    this.placa.descartar();
    this.grupo.removeFromParent();
    for (const d of this.descartaveis) d.dispose();
  }
}

const _mundo = new THREE.Vector3();
