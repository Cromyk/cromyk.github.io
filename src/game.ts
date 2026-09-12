import * as THREE from 'three';
import { Criatura } from './creature';
import { ELEMENTOS, ESPECIES, pesoSpawn, type Especie } from './species';
import { Orbe } from './orb';
import { Sala } from './room';
import { Mao, Mira, construirLuva } from './hands';
import { Aviso, Etiqueta, PainelPulso } from './hud';
import { Dex } from './state';
import { audio } from './audio';
import { escolherPesado } from './rng';

const MAX_CRIATURAS = 3;
const MAX_ESFERAS = 8;
const RECARGA_SEGUNDOS = 7;
const COR_ESFERA = 0x7fd4ff;

interface CriaturaAtiva {
  criatura: Criatura;
  etiqueta: Etiqueta;
}

/** Distância de um ponto ao segmento a→b. Evita a esfera atravessar a criatura num frame. */
function distanciaAoSegmento(ponto: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const comprimento = ab.lengthSq();
  if (comprimento < 1e-8) return ponto.distanceTo(a);
  const t = THREE.MathUtils.clamp(ponto.clone().sub(a).dot(ab) / comprimento, 0, 1);
  return ponto.distanceTo(a.clone().addScaledVector(ab, t));
}

export class Jogo {
  readonly cena = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sala: Sala;
  readonly dex = new Dex();

  private renderer: THREE.WebGLRenderer;
  private ativas: CriaturaAtiva[] = [];
  private orbes: Orbe[] = [];
  private maos: Mao[] = [];
  private miras = new Map<number, Mira>();
  private orbeNaMao = new Map<number, Orbe>();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private aviso: Aviso;
  private painel = new PainelPulso();
  private painelAnexado = false;

  private esferas = MAX_ESFERAS;
  private recarga = 0;
  private proximoSpawn = 1.2;
  private tempoLeituraSala = 0;
  private posicaoJogador = new THREE.Vector3();
  /** Modo sem headset: mão virtual presa à câmera. */
  private modoPlano = false;
  private maoPlana = new THREE.Group();
  private carregando = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 60);
    this.camera.position.set(0, 1.6, 0);

    this.sala = new Sala(this.cena);
    this.aviso = new Aviso(this.cena);
    this.sala.usarFallback();

    this.montarLuzes();
    this.montarMaos();

    this.cena.add(this.maoPlana);
    this.maoPlana.visible = false;
  }

  /**
   * Luz para MR: nada de céu nem fundo — o "ambiente" é o seu quarto de
   * verdade, então só precisamos iluminar as criaturas de forma crível.
   */
  private montarLuzes() {
    this.cena.add(new THREE.HemisphereLight(0xffffff, 0x505a6b, 1.5));

    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(1.4, 3.2, 1.1);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.camera.near = 0.4;
    sol.shadow.camera.far = 12;
    const c = sol.shadow.camera;
    c.left = -4;
    c.right = 4;
    c.top = 4;
    c.bottom = -4;
    this.cena.add(sol);

    // Sombra de contato: um plano invisível que só recebe sombra. É o truque que
    // cola a criatura no chão real em vez de deixá-la flutuando sobre ele.
    const geo = new THREE.PlaneGeometry(14, 14);
    const mat = new THREE.ShadowMaterial({ opacity: 0.28 });
    this.descartaveis.push(geo, mat);
    const chao = new THREE.Mesh(geo, mat);
    chao.rotation.x = -Math.PI * 0.5;
    chao.position.y = 0.002;
    chao.receiveShadow = true;
    this.cena.add(chao);
  }

  private montarMaos() {
    for (let i = 0; i < 2; i++) {
      const mao = new Mao(this.renderer, i);
      const cor = i === 0 ? 0x7fd4ff : 0xffb27f;

      const { grupo, descartaveis } = construirLuva(cor);
      mao.punho.add(grupo);
      this.descartaveis.push(...descartaveis);

      const mira = new Mira(COR_ESFERA);
      this.cena.add(mira.linha);
      this.miras.set(i, mira);

      mao.alvo.addEventListener('selectstart', () => this.pegarEsfera(mao));
      mao.alvo.addEventListener('selectend', () => this.soltarEsfera(mao));
      // O grip da mão esquerda mostra o painel; o direito alterna o debug da sala.
      mao.alvo.addEventListener('squeezestart', () => {
        if (mao.lado === 'right') {
          const ligado = this.sala.alternarDebug();
          this.aviso.mostrar(
            [{ texto: ligado ? 'superfícies visíveis' : 'superfícies ocultas', tamanho: 40 }],
            1.2,
          );
        }
      });

      this.cena.add(mao.alvo);
      this.cena.add(mao.punho);
      this.maos.push(mao);
    }
  }

  /** Liga o modo sem headset: a "mão" passa a ser a própria câmera. */
  ativarModoPlano() {
    this.modoPlano = true;
    this.maoPlana.visible = true;
    const { grupo, descartaveis } = construirLuva(COR_ESFERA);
    grupo.position.set(0.16, -0.14, -0.28);
    this.camera.add(grupo);
    this.cena.add(this.camera);
    this.descartaveis.push(...descartaveis);
  }

  // ----- esferas -----

  private pegarEsfera(mao: Mao) {
    if (this.orbeNaMao.has(mao.indice)) return;
    if (this.esferas <= 0) {
      this.aviso.mostrar(
        [
          { texto: 'sem esferas', tamanho: 44, cor: '#ff9f9f' },
          { texto: 'espere recarregar', tamanho: 28, cor: '#9aa5b8', peso: 500 },
        ],
        1.6,
      );
      return;
    }

    this.esferas--;
    const orbe = new Orbe(COR_ESFERA, this.sala.pisoY);
    this.cena.add(orbe.raiz);
    this.orbes.push(orbe);
    this.orbeNaMao.set(mao.indice, orbe);
    mao.segurando = true;
    mao.limparAmostras();
    mao.vibrar(0.25, 30);
  }

  private soltarEsfera(mao: Mao) {
    const orbe = this.orbeNaMao.get(mao.indice);
    if (!orbe) return;
    this.orbeNaMao.delete(mao.indice);
    mao.segurando = false;

    const velocidade = mao.velocidadeArremesso(performance.now());
    // Arremesso muito fraco: trata como se tivesse escorregado da mão.
    if (velocidade.length() < 0.8) velocidade.set(0, -0.4, 0);
    orbe.lancar(velocidade);
    mao.vibrar(0.5, 50);
  }

  /** Versão do arremesso para o modo sem headset: carrega segurando, solta e vai. */
  arremessoPlano(fase: 'inicio' | 'fim') {
    if (fase === 'inicio') {
      if (this.orbeNaMao.has(99)) return;
      if (this.esferas <= 0) return;
      this.esferas--;
      const orbe = new Orbe(COR_ESFERA, this.sala.pisoY);
      this.cena.add(orbe.raiz);
      this.orbes.push(orbe);
      this.orbeNaMao.set(99, orbe);
      this.carregando = 0;
      return;
    }

    const orbe = this.orbeNaMao.get(99);
    if (!orbe) return;
    this.orbeNaMao.delete(99);

    const forca = 3.2 + Math.min(1, this.carregando / 1.1) * 6.5;
    const direcao = new THREE.Vector3();
    this.camera.getWorldDirection(direcao);
    direcao.y += 0.18; // um pouco para cima, como se joga de verdade
    orbe.lancar(direcao.normalize().multiplyScalar(forca));
    this.carregando = 0;
  }

  // ----- criaturas -----

  private sortearEspecie(): Especie {
    // Dá um empurrão em espécies que o jogador ainda não tem — a coleção puxa
    // o jogo para frente sem virar grind.
    return escolherPesado(Math.random, ESPECIES, (e) =>
      pesoSpawn(e) * (this.dex.jaCapturou(e.id) ? 1 : 1.9),
    );
  }

  private nascerCriatura() {
    const local = this.sala.pontoDeSpawn(this.posicaoJogador);
    if (!local) return;

    const especie = this.sortearEspecie();
    const piso = this.sala.temDadosReais ? local.ponto.y : this.sala.pisoY;
    const criatura = new Criatura(especie, local.ponto, piso);
    this.cena.add(criatura.raiz);

    const etiqueta = new Etiqueta(
      especie.nome,
      ELEMENTOS[especie.elemento].nome,
      ELEMENTOS[especie.elemento].cor,
      !this.dex.jaCapturou(especie.id),
    );
    this.cena.add(etiqueta.placa.malha);

    this.ativas.push({ criatura, etiqueta });
    this.dex.registrarEncontro(especie.id);
    audio.surgiu(especie.raridade === 3);

    if (especie.raridade === 3) {
      this.aviso.mostrar(
        [
          { texto: 'algo raro apareceu', tamanho: 38, cor: '#ffd78a' },
          { texto: 'devagar — ele assusta fácil', tamanho: 26, cor: '#9aa5b8', peso: 500 },
        ],
        3,
      );
    }
  }

  private removerCriatura(alvo: Criatura) {
    const i = this.ativas.findIndex((a) => a.criatura === alvo);
    if (i === -1) return;
    this.ativas[i].criatura.descartar(this.cena);
    this.cena.remove(this.ativas[i].etiqueta.placa.malha);
    this.ativas[i].etiqueta.descartar();
    this.ativas.splice(i, 1);
  }

  // ----- loop -----

  atualizar(dt: number) {

    const agora = performance.now();

    this.camera.getWorldPosition(this.posicaoJogador);

    // Relê a sala de vez em quando: o Quest pode reconhecer móveis novos no meio do jogo.
    this.tempoLeituraSala -= dt;
    if (this.tempoLeituraSala <= 0) {
      this.tempoLeituraSala = 0.5;
      this.sala.atualizar(this.renderer.xr.getFrame() ?? null, this.renderer.xr.getReferenceSpace());
    }

    // Recarga de esferas.
    if (this.esferas < MAX_ESFERAS) {
      this.recarga += dt;
      if (this.recarga >= RECARGA_SEGUNDOS) {
        this.recarga = 0;
        this.esferas++;
      }
    }

    // Spawn.
    this.proximoSpawn -= dt;
    if (this.proximoSpawn <= 0 && this.ativas.length < MAX_CRIATURAS) {
      this.proximoSpawn = 4 + Math.random() * 5;
      this.nascerCriatura();
    }

    this.atualizarMaos(dt, agora);
    this.atualizarCriaturas(dt);
    this.atualizarOrbes(dt);
    this.atualizarPainel();
    this.aviso.atualizar(dt, this.camera);
  }

  private atualizarMaos(dt: number, agora: number) {
    if (this.modoPlano) {
      if (this.orbeNaMao.has(99)) this.carregando += dt;
      const orbe = this.orbeNaMao.get(99);
      if (orbe) {
        const alvo = new THREE.Vector3(0.16, -0.12, -0.3).applyMatrix4(this.camera.matrixWorld);
        orbe.raiz.position.lerp(alvo, Math.min(1, dt * 20));
        const carga = Math.min(1, this.carregando / 1.1);
        orbe.raiz.scale.setScalar(1 + carga * 0.35);
      }
      return;
    }

    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.amostrar(agora);

      const orbe = this.orbeNaMao.get(mao.indice);
      const mira = this.miras.get(mao.indice);

      if (orbe) {
        // A esfera acompanha o punho, um pouco à frente da palma.
        const alvo = new THREE.Vector3(0, 0.01, -0.055).applyMatrix4(mao.punho.matrixWorld);
        orbe.raiz.position.copy(alvo);
        if (mira) mira.atualizar(alvo, mao.velocidadeArremesso(agora), this.sala.pisoY, dt);
      } else if (mira) {
        mira.atualizar(mao.posicaoMundo(), new THREE.Vector3(), this.sala.pisoY, dt);
      }

      // O painel mora no pulso esquerdo.
      if (!this.painelAnexado && mao.lado === 'left') {
        mao.punho.add(this.painel.grupo);
        this.painelAnexado = true;
      }
    }
  }

  private atualizarCriaturas(dt: number) {
    for (const ativa of [...this.ativas]) {
      const { criatura, etiqueta } = ativa;
      criatura.atualizar(dt, this.posicaoJogador);

      const mostrarNome = criatura.estado === 'atento' && criatura.raiz.scale.x > 0.6;
      etiqueta.atualizar(dt, mostrarNome, criatura.raiz.position, this.camera);

      if (!criatura.viva) {
        if (criatura.estado === 'saindo') audio.fugiu();
        this.removerCriatura(criatura);
      }
    }
  }

  private atualizarOrbes(dt: number) {
    for (const orbe of [...this.orbes]) {
      const anterior = orbe.posicao.clone();
      orbe.atualizar(dt);

      if (orbe.estado === 'voando') {
        this.testarAcerto(orbe, anterior);
      }

      if (orbe.resultado === 'capturou') {
        orbe.resultado = null;
        const presa = orbe.presa;
        if (presa) {
          this.dex.registrarCaptura(presa.especie.id);
          this.esferas = Math.min(MAX_ESFERAS, this.esferas + 2);
          const primeiraVez = (this.dex.de(presa.especie.id)?.capturados ?? 0) === 1;
          this.aviso.mostrar(
            [
              { texto: presa.especie.nome, tamanho: 54, cor: '#9ff0c4' },
              { texto: primeiraVez ? 'espécie nova na coleção' : 'capturado', tamanho: 28, cor: '#9aa5b8', peso: 500, espaco: 6 },
              ...(primeiraVez
                ? [{ texto: presa.especie.descricao, tamanho: 20, cor: '#7f8ba0', peso: 400 }]
                : []),
            ],
            primeiraVez ? 4.5 : 2.4,
          );
          this.removerCriatura(presa);
          orbe.presa = null;
        }
      } else if (orbe.resultado === 'escapou') {
        orbe.resultado = null;
        const presa = orbe.presa;
        if (presa) {
          presa.raiz.visible = true;
          const fuga = orbe.posicao.clone();
          fuga.x += (Math.random() * 2 - 1) * 0.5;
          fuga.z += (Math.random() * 2 - 1) * 0.5;
          presa.reaparecer(fuga);
          this.aviso.mostrar(
            [
              { texto: 'escapou!', tamanho: 50, cor: '#ffb1b1' },
              { texto: `${presa.especie.nome} está desconfiado agora`, tamanho: 24, cor: '#9aa5b8', peso: 500 },
            ],
            2,
          );
          orbe.presa = null;
        }
      }

      if (orbe.acabou) {
        orbe.descartar(this.cena);
        this.orbes.splice(this.orbes.indexOf(orbe), 1);
      }
    }
  }

  /** Colisão varrida: testa o segmento percorrido no frame, não só a posição final. */
  private testarAcerto(orbe: Orbe, anterior: THREE.Vector3) {
    for (const { criatura } of this.ativas) {
      if (criatura.estado === 'preso' || criatura.estado === 'saindo' || !criatura.viva) continue;

      const alvo = criatura.posicaoCorpo;
      const dist = distanciaAoSegmento(alvo, anterior, orbe.posicao);

      const alcance = criatura.raio + orbe.raio;
      if (dist <= alcance) {
        // 1 = bem no centro, 0 = raspou na borda.
        const precisao = THREE.MathUtils.clamp(1 - dist / alcance, 0, 1);
        orbe.capturar(criatura, precisao);
        for (const mao of this.maos) mao.vibrar(0.8, 90);
        return;
      }
      // Passou raspando: leva susto, mas não é pego.
      if (dist <= criatura.raio + orbe.raio + 0.28) {
        criatura.assustar(0.3);
      }
    }
  }

  private atualizarPainel() {
    this.painel.atualizar(
      this.esferas,
      this.dex.totalCapturas,
      this.dex.especiesCapturadas,
      this.dex.totalEspecies,
    );
  }

  /** Chamado quando a sessão XR começa: reposiciona tudo com base na sala real. */
  aoEntrarNaSessao() {

    this.esferas = MAX_ESFERAS;
    this.proximoSpawn = 2.5;
    this.aviso.mostrar(
      [
        { texto: 'olhe em volta', tamanho: 44, cor: '#cfe6ff' },
        { texto: 'gatilho pega a esfera · solte no movimento para arremessar', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
      5,
    );
  }

  descartar() {
    for (const { criatura, etiqueta } of this.ativas) {
      criatura.descartar(this.cena);
      etiqueta.descartar();
    }
    for (const orbe of this.orbes) orbe.descartar(this.cena);
    for (const mira of this.miras.values()) mira.descartar();
    this.painel.descartar();
    this.aviso.descartar();
    this.sala.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
