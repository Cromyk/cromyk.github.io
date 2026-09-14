import * as THREE from 'three';
import { Placa } from './hud';
import { INICIAIS, TIPOS, corHexDe, textoTipos, type Especie } from './species';
import { Pokemon } from './creature';
import { instanciar, precarregar } from './modelos';
import { audio } from './audio';

/**
 * A escolha do inicial, logo na primeira vez. Sem isso você começa sem ninguém
 * para lutar, e capturar fica quase impossível — era o nó do começo do jogo.
 *
 * Três criaturas flutuam à sua frente, girando devagar. Aponte e puxe o gatilho.
 */
export class EscolhaInicial {
  /**
   * Põe os modelos dos iniciais em memória. Tem de terminar antes de construir
   * a tela: sem o GLB carregado não há o que mostrar no pedestal, e uma vitrine
   * de pedestais vazios é pior do que um segundo de espera.
   */
  static carregar(): Promise<void> {
    return precarregar(INICIAIS.map((e) => e.id));
  }

  readonly grupo = new THREE.Group();
  /** Vira true quando alguém foi escolhido. */
  escolhido: Especie | null = null;
  destacado = -1;

  // Alinhado com INICIAIS, com buraco se algum modelo faltar: os cartões e os
  // alvos de mira são indexados por INICIAIS, e desalinhar isso escolheria o
  // bicho errado no gatilho.
  private opcoes: Array<Pokemon | null> = [];
  private cartoes: Placa[] = [];
  private alvos: THREE.Mesh[] = [];
  private titulo = new Placa(0.5, 0.11, 640);
  private raycaster = new THREE.Raycaster();
  private tempo = 0;
  private entrada = 0;
  private ultimoDestaque = -1;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private static readonly ESPACO = 0.34;
  private static readonly DISTANCIA = 1.15;
  private static readonly ALTURA = 1.15;

  constructor() {
    this.titulo.escrever(
      [
        { texto: 'escolha seu parceiro', tamanho: 50, cor: '#eef2f8', peso: 700 },
        { texto: 'aponte e puxe o gatilho', tamanho: 26, cor: '#9aa5b8', peso: 500, espaco: 6 },
      ],
      { raio: 20 },
    );
    this.titulo.malha.position.set(0, 0.42, 0);
    this.grupo.add(this.titulo.malha);

    INICIAIS.forEach((especie, i) => {
      const x = (i - (INICIAIS.length - 1) / 2) * EscolhaInicial.ESPACO;

      // O bicho, parado e girando devagar. O modelo já está em memória: quem
      // constrói esta tela é responsável por ter chamado carregar() antes.
      const corpo = instanciar(especie.id, especie.altura);
      if (corpo) {
        const bicho = new Pokemon(especie, corpo, new THREE.Vector3(0, 0, 0), 0, 'companheiro', 5, false, i * 131 + 9);
        bicho.raiz.position.set(x, -0.06, 0);
        bicho.raiz.scale.setScalar(1);
        this.grupo.add(bicho.raiz);
        this.opcoes.push(bicho);
      } else {
        this.opcoes.push(null);
      }

      // Pedestal de luz sob ele.
      const geoDisco = new THREE.CylinderGeometry(0.13, 0.13, 0.006, 28);
      const matDisco = new THREE.MeshBasicMaterial({
        color: TIPOS[especie.tipo].cor,
        transparent: true,
        opacity: 0.35,
      });
      this.descartaveis.push(geoDisco, matDisco);
      const disco = new THREE.Mesh(geoDisco, matDisco);
      disco.position.set(x, -0.065, 0);
      this.grupo.add(disco);

      const luz = new THREE.PointLight(TIPOS[especie.tipo].cor, 0.5, 0.6, 2);
      luz.position.set(x, 0.05, 0.12);
      this.grupo.add(luz);

      // Cartão com nome, tipo e golpe.
      const cartao = new Placa(0.2, 0.13, 340);
      cartao.malha.position.set(x, -0.19, 0.02);
      this.grupo.add(cartao.malha);
      this.cartoes.push(cartao);

      // Alvo generoso para o raycast — mira em VR precisa perdoar.
      const geoAlvo = new THREE.PlaneGeometry(0.3, 0.46);
      const matAlvo = new THREE.MeshBasicMaterial({ visible: false });
      this.descartaveis.push(geoAlvo, matAlvo);
      const alvo = new THREE.Mesh(geoAlvo, matAlvo);
      alvo.position.set(x, 0.02, -0.02);
      alvo.userData.indice = i;
      this.grupo.add(alvo);
      this.alvos.push(alvo);
    });

    this.redesenharCartoes();
    this.grupo.visible = false;
  }

  private redesenharCartoes() {
    INICIAIS.forEach((especie, i) => {
      const cor = corHexDe(especie);
      const sobMira = i === this.destacado;
      this.cartoes[i].escrever(
        [
          { texto: especie.nome, tamanho: 36, cor: '#f2f5fa', peso: 700 },
          { texto: textoTipos(especie).toUpperCase(), tamanho: 22, cor, peso: 700, espaco: 4 },
          { texto: especie.golpe.nome, tamanho: 20, cor: '#9aa5b8', peso: 500 },
        ],
        {
          raio: 18,
          fundo: sobMira ? 'rgba(32, 46, 68, 0.96)' : 'rgba(12, 17, 26, 0.9)',
          borda: sobMira ? cor : 'rgba(255,255,255,0.14)',
        },
      );
    });
  }

  /** Posiciona tudo à frente de onde o jogador está olhando. */
  posicionar(camera: THREE.Camera) {
    const posicao = camera.getWorldPosition(new THREE.Vector3());
    const direcao = new THREE.Vector3();
    camera.getWorldDirection(direcao);
    direcao.y = 0;
    if (direcao.lengthSq() < 1e-6) direcao.set(0, 0, -1);
    direcao.normalize();

    this.grupo.position
      .copy(posicao)
      .addScaledVector(direcao, EscolhaInicial.DISTANCIA);
    this.grupo.position.y = EscolhaInicial.ALTURA;
    this.grupo.lookAt(posicao.x, EscolhaInicial.ALTURA, posicao.z);
    this.grupo.visible = true;
  }

  atualizar(
    dt: number,
    mira: { origem: THREE.Vector3; direcao: THREE.Vector3 } | null,
    camera: THREE.Camera,
  ) {
    if (!this.grupo.visible) return;
    this.tempo += dt;
    this.entrada = Math.min(1, this.entrada + dt * 1.6);

    const jogador = camera.getWorldPosition(new THREE.Vector3());

    this.opcoes.forEach((bicho, i) => {
      if (!bicho) return;
      bicho.atualizar(dt, jogador);
      // Aqui eles são bonecos de vitrine: não passeiam, só giram e flutuam.
      const x = (i - (this.opcoes.length - 1) / 2) * EscolhaInicial.ESPACO;
      const destacado = i === this.destacado;
      const flutua = Math.sin(this.tempo * 1.6 + i * 1.3) * 0.012;
      bicho.raiz.position.set(x, -0.06 + flutua + (destacado ? 0.03 : 0), 0);
      bicho.raiz.rotation.set(0, this.tempo * (destacado ? 0.9 : 0.45) + i, 0);
      const escala = (0.85 + this.entrada * 0.15) * (destacado ? 1.18 : 1);
      bicho.raiz.scale.setScalar(escala);
    });

    // Quem está sob a mira?
    const anterior = this.destacado;
    this.destacado = -1;
    if (mira) {
      this.raycaster.set(mira.origem, mira.direcao);
      const acertos = this.raycaster.intersectObjects(this.alvos, false);
      if (acertos.length > 0) this.destacado = acertos[0].object.userData.indice as number;
    }
    if (this.destacado !== anterior) {
      this.redesenharCartoes();
      if (this.destacado !== -1 && this.destacado !== this.ultimoDestaque) {
        audio.clique();
        this.ultimoDestaque = this.destacado;
      }
    }
  }

  /** Confirma a escolha sob a mira. Devolve null se não havia nada apontado. */
  confirmar(): Especie | null {
    if (this.destacado < 0) return null;
    this.escolhido = INICIAIS[this.destacado];
    audio.sucesso();
    return this.escolhido;
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.grupo);
    for (const bicho of this.opcoes) bicho?.descartar(this.grupo);
    for (const cartao of this.cartoes) cartao.descartar();
    this.titulo.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
