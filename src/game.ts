import * as THREE from 'three';
import { Pokemon } from './creature';
import {
  ESPECIES,
  TIPOS,
  calcularDano,
  pesoSpawn,
  porId,
  textoEfetividade,
  type Especie,
} from './species';
import { Pokebola } from './orb';
import { Sala } from './room';
import { Mao, Mira, RaioMira, construirLuva } from './hands';
import { Aviso, BarraVida, PainelPulso } from './hud';
import { PainelTime } from './menu';
import { EscolhaInicial } from './starter';
import { BOLAS, BOLA_PADRAO, bolaPorId } from './balls';
import { Efeito, Impacto } from './attacks';
import { Dex } from './state';
import { audio } from './audio';
import { escolherPesado } from './rng';

const MAX_SELVAGENS = 2;
/** Só a bola comum recarrega sozinha; as outras vêm de capturas. */
const RECARGA_BOLA_COMUM = 5;
const ALCANCE_BATALHA = 4.5;
const RECARGA_SELVAGEM = 2.6;
/** Fora de campo, cada Pokémon recupera 1 de HP a cada tanto de segundos. */
const SEGUNDOS_POR_HP = 2.5;

interface Selvagem {
  pokemon: Pokemon;
  barra: BarraVida;
}

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
  private selvagens: Selvagem[] = [];
  private companheiro: Pokemon | null = null;
  private barraCompanheiro: BarraVida | null = null;
  private bolas: Pokebola[] = [];
  private efeitos: Efeito[] = [];
  private impactos: Impacto[] = [];

  private maos: Mao[] = [];
  private miras = new Map<number, Mira>();
  private raios = new Map<number, RaioMira>();
  private bolaNaMao = new Map<number, Pokebola>();
  /** Quando a bola da mão carrega um Pokémon para soltar, e não é de captura. */
  private bolaDeInvocacao = new Map<number, string>();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private aviso: Aviso;
  private painelPulso = new PainelPulso();
  private painelTime = new PainelTime();
  private pulsoAnexado = false;

  /** Existe só até você escolher o parceiro inicial. */
  private escolha: EscolhaInicial | null = null;
  /** Trava o analógico para trocar de bola um passo por inclinada. */
  private analogicoNeutro = true;

  private recarga = 0;
  private proximoSpawn = 2;
  private tempoLeituraSala = 0;
  private recargaSelvagem = RECARGA_SELVAGEM;
  private acumuladoCura = 0;
  private posicaoJogador = new THREE.Vector3();

  private modoPlano = false;
  private carregando = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 60);
    this.camera.position.set(0, 1.6, 0);

    this.sala = new Sala(this.cena);
    this.aviso = new Aviso(this.cena);
    this.sala.usarFallback();

    this.cena.add(this.painelTime.grupo);

    this.montarLuzes();
    this.montarMaos();
  }

  private montarLuzes() {
    this.cena.add(new THREE.HemisphereLight(0xffffff, 0x505a6b, 1.5));

    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
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

    // Plano invisível que só recebe sombra: é o que cola os Pokémon no seu chão.
    const geo = new THREE.PlaneGeometry(14, 14);
    const mat = new THREE.ShadowMaterial({ opacity: 0.3 });
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

      const mira = new Mira(0xff6b5c);
      this.cena.add(mira.linha);
      this.miras.set(i, mira);

      const raio = new RaioMira();
      mao.alvo.add(raio.linha);
      this.raios.set(i, raio);

      // GRIP segura e arremessa a pokébola.
      mao.alvo.addEventListener('squeezestart', () => this.pegarBola(mao));
      mao.alvo.addEventListener('squeezeend', () => this.arremessarBola(mao));
      // GATILHO comanda o ataque — ou escolhe no painel, quando ele está aberto.
      mao.alvo.addEventListener('selectstart', () => this.puxarGatilho(mao));

      this.cena.add(mao.alvo, mao.punho);
      this.maos.push(mao);
    }
  }

  ativarModoPlano() {
    this.modoPlano = true;
    const { grupo, descartaveis } = construirLuva(0xff6b5c);
    grupo.position.set(0.16, -0.14, -0.28);
    this.camera.add(grupo);
    this.cena.add(this.camera);
    this.descartaveis.push(...descartaveis);
  }

  // ------------------------------------------------------------ pokébolas

  private get temCompanheiroEmCampo(): boolean {
    return this.companheiro !== null && this.companheiro.viva && !this.companheiro.desmaiado;
  }

  private pegarBola(mao: Mao) {
    if (this.bolaNaMao.has(mao.indice)) return;

    // Com um Pokémon escolhido e ainda na bola, o grip pega a bola DELE.
    const ativo = this.dex.ativo;
    const vaiInvocar = !this.temCompanheiroEmCampo && ativo !== null && (this.dex.de(ativo)?.hp ?? 0) > 0;

    const tipoBola = bolaPorId(this.dex.bolaAtiva) ?? BOLA_PADRAO;

    if (!vaiInvocar && this.dex.bolas(tipoBola.id) <= 0) {
      this.aviso.mostrar(
        [
          { texto: `sem ${tipoBola.nome}`, tamanho: 40, cor: '#ff9f9f' },
          { texto: 'vire a palma e escolha outra', tamanho: 25, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    const especieAtiva = vaiInvocar ? porId(ativo!) : null;
    const bola = new Pokebola(
      this.sala.pisoY,
      especieAtiva ? TIPOS[especieAtiva.tipo].cor : tipoBola.corTopo,
      especieAtiva ? 0xf2f2f5 : tipoBola.corBase,
    );
    this.cena.add(bola.raiz);
    this.bolas.push(bola);
    this.bolaNaMao.set(mao.indice, bola);

    if (vaiInvocar) {
      this.bolaDeInvocacao.set(mao.indice, ativo!);
    } else {
      this.dex.gastarBola(tipoBola.id);
      // A bola guarda com que força ela foi lançada — trocar de bola no meio do
      // voo não pode mudar a chance daquele arremesso.
      bola.raiz.userData.multiplicador = tipoBola.multiplicador;
      bola.raiz.userData.nomeBola = tipoBola.nome;
    }

    mao.segurando = true;
    mao.limparAmostras();
    mao.vibrar(0.25, 30);
  }

  private arremessarBola(mao: Mao) {
    const bola = this.bolaNaMao.get(mao.indice);
    if (!bola) return;
    this.bolaNaMao.delete(mao.indice);
    mao.segurando = false;

    const velocidade = mao.velocidadeArremesso(performance.now());
    if (velocidade.length() < 0.8) velocidade.set(0, -0.4, 0);
    bola.lancar(velocidade);
    mao.vibrar(0.5, 50);

    const idInvocacao = this.bolaDeInvocacao.get(mao.indice);
    if (idInvocacao) {
      this.bolaDeInvocacao.delete(mao.indice);
      bola.raiz.userData.invocar = idInvocacao;
    }
  }

  // ------------------------------------------------------------ gatilho

  private puxarGatilho(mao: Mao) {
    // Escolha do inicial na frente de tudo: nada mais funciona antes dela.
    if (this.escolha) {
      const especie = this.escolha.confirmar();
      if (especie) {
        mao.vibrar(0.8, 120);
        this.receberInicial(especie);
      }
      return;
    }

    // Painel aberto: o gatilho escolhe o que estiver sob a mira.
    const selecao = this.painelTime.aberto ? this.painelTime.selecao : null;
    if (selecao) {
      mao.vibrar(0.4, 40);
      if (selecao.tipo === 'criatura') this.escolherDoTime(selecao.entrada.especie.id);
      else this.escolherBola(selecao.entrada.tipo.id);
      return;
    }

    // Sem painel: manda o companheiro atacar.
    this.comandarAtaque(mao);
  }

  private escolherBola(id: string) {
    const tipo = bolaPorId(id);
    if (!tipo) return;

    if (this.dex.bolas(id) <= 0) {
      this.aviso.mostrar(
        [
          { texto: `sem ${tipo.nome}`, tamanho: 36, cor: '#ff9f9f' },
          { texto: 'elas vêm de capturas bem-sucedidas', tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        2,
      );
      return;
    }

    this.dex.definirBolaAtiva(id);
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: tipo.nome, tamanho: 40, cor: `#${new THREE.Color(tipo.corTopo).getHexString()}` },
        { texto: tipo.descricao, tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
      2.2,
    );
  }

  /** Fecha a escolha inicial e entrega o parceiro com a vida cheia. */
  private receberInicial(especie: Especie) {
    this.dex.receberInicial(especie.id);
    if (this.escolha) {
      this.escolha.descartar(this.cena);
      this.escolha = null;
    }
    this.proximoSpawn = 4;
    this.aviso.mostrar(
      [
        {
          texto: `${especie.nome} é seu!`,
          tamanho: 46,
          cor: `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}`,
        },
        { texto: especie.descricao, tamanho: 21, cor: '#9aa5b8', peso: 400, espaco: 6 },
        { texto: 'aperte o GRIP e arremesse para soltar ele', tamanho: 23, cor: '#ffd78a', peso: 600 },
      ],
      6,
    );
  }

  private escolherDoTime(id: string) {
    const registro = this.dex.de(id);
    if (!registro) return;

    // Escolher quem já está em campo recolhe ele de volta.
    if (this.companheiro?.especie.id === id && this.companheiro.viva) {
      this.recolherCompanheiro();
      return;
    }

    if (registro.hp <= 0) {
      const especie = porId(id)!;
      this.aviso.mostrar(
        [
          { texto: `${especie.nome} está desmaiado`, tamanho: 38, cor: '#ff9f9f' },
          { texto: 'ele se recupera com o tempo', tamanho: 24, cor: '#9aa5b8', peso: 500 },
        ],
        2.2,
      );
      return;
    }

    this.dex.definirAtivo(id);
    const especie = porId(id)!;
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: especie.nome, tamanho: 44, cor: `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}` },
        { texto: 'aperte o GRIP e arremesse a bola', tamanho: 24, cor: '#9aa5b8', peso: 500 },
      ],
      2.6,
    );
  }

  private recolherCompanheiro() {
    if (!this.companheiro) return;
    this.dex.definirHp(this.companheiro.especie.id, this.companheiro.hp);
    audio.recolher();
    this.companheiro.dissolver();
    this.aviso.mostrar(
      [{ texto: `${this.companheiro.especie.nome}, volta!`, tamanho: 40, cor: '#cfe6ff' }],
      1.8,
    );
  }

  // ------------------------------------------------------------ batalha

  /** O selvagem mais próximo do companheiro, dentro do alcance. */
  private alvoDoCompanheiro(): Pokemon | null {
    if (!this.companheiro) return null;
    let melhor: Pokemon | null = null;
    let menorDist = ALCANCE_BATALHA;
    for (const { pokemon } of this.selvagens) {
      if (!pokemon.viva || pokemon.estado === 'preso' || pokemon.estado === 'saindo') continue;
      const d = pokemon.raiz.position.distanceTo(this.companheiro.raiz.position);
      if (d < menorDist) {
        menorDist = d;
        melhor = pokemon;
      }
    }
    return melhor;
  }

  private comandarAtaque(mao: Mao) {
    if (!this.temCompanheiroEmCampo) {
      this.aviso.mostrar(
        [
          { texto: 'nenhum Pokémon em campo', tamanho: 34, cor: '#ffd78a' },
          { texto: 'vire a palma esquerda para cima e escolha um', tamanho: 22, cor: '#9aa5b8', peso: 500 },
        ],
        2.4,
      );
      return;
    }

    const alvo = this.alvoDoCompanheiro();
    if (!alvo) {
      this.aviso.mostrar([{ texto: 'nenhum alvo por perto', tamanho: 32, cor: '#9aa5b8' }], 1.4);
      return;
    }

    const companheiro = this.companheiro!;
    if (!companheiro.podeAtacar) return;

    if (companheiro.atacar(alvo)) {
      mao.vibrar(0.7, 70);
      this.dispararGolpe(companheiro, alvo);
    }
  }

  /** Cria o efeito visual e agenda o dano para o momento do impacto. */
  private dispararGolpe(atacante: Pokemon, defensor: Pokemon) {
    const golpe = atacante.especie.golpe;
    const efeito = new Efeito(golpe, atacante.boca, defensor.centro);
    efeito.adicionarA(this.cena);
    this.efeitos.push(efeito);
    audio.golpe(golpe.tipo);

    // O dano cai junto com o impacto do efeito, não no instante do comando.
    const atraso = efeito.momentoImpacto * 1000;
    window.setTimeout(() => {
      if (!atacante.viva || !defensor.viva || defensor.estado === 'preso') return;
      this.resolverDano(atacante, defensor, golpe);
    }, atraso);
  }

  private resolverDano(atacante: Pokemon, defensor: Pokemon, golpe: typeof atacante.especie.golpe) {
    const { dano, efetividade, critico } = calcularDano(atacante.especie, defensor.especie, golpe);
    defensor.receberDano(dano);

    const impacto = new Impacto(defensor.centro, TIPOS[golpe.tipo].cor);
    this.cena.add(impacto.pontos);
    this.impactos.push(impacto);

    audio.impacto(efetividade);
    if (critico) audio.critico();

    const nota = textoEfetividade(efetividade);
    const linhas = [
      {
        texto: `${atacante.especie.nome} usou ${golpe.nome}!`,
        tamanho: 32,
        cor: `#${new THREE.Color(TIPOS[golpe.tipo].cor).getHexString()}`,
      },
    ];
    if (critico) linhas.push({ texto: 'Acerto crítico!', tamanho: 26, cor: '#ffd78a' });
    if (nota) linhas.push({ texto: nota, tamanho: 26, cor: efetividade >= 2 ? '#9ff0c4' : '#9aa5b8' });
    this.aviso.mostrar(linhas, 1.8);

    if (defensor.desmaiado) {
      audio.desmaiou();
      if (defensor.papel === 'selvagem') {
        this.aviso.mostrar(
          [
            { texto: `${defensor.especie.nome} está exausto!`, tamanho: 36, cor: '#ffd78a' },
            { texto: 'jogue uma pokébola agora', tamanho: 26, cor: '#9ff0c4', peso: 600 },
          ],
          3,
        );
      } else {
        this.aviso.mostrar(
          [
            { texto: `${defensor.especie.nome} desmaiou!`, tamanho: 38, cor: '#ff9f9f' },
            { texto: 'escolha outro no painel', tamanho: 24, cor: '#9aa5b8', peso: 500 },
          ],
          3,
        );
      }
    }
  }

  /** O selvagem revida sozinho enquanto houver um companheiro em campo. */
  private atualizarAtaqueSelvagem(dt: number) {
    if (!this.temCompanheiroEmCampo) return;
    this.recargaSelvagem -= dt;
    if (this.recargaSelvagem > 0) return;

    const companheiro = this.companheiro!;
    const candidatos = this.selvagens.filter(
      ({ pokemon }) =>
        pokemon.viva &&
        !pokemon.desmaiado &&
        pokemon.estado !== 'preso' &&
        pokemon.estado !== 'saindo' &&
        pokemon.estado !== 'surgindo' &&
        pokemon.raiz.position.distanceTo(companheiro.raiz.position) < ALCANCE_BATALHA,
    );
    if (candidatos.length === 0) return;

    const atacante = candidatos[Math.floor(Math.random() * candidatos.length)].pokemon;
    this.recargaSelvagem = RECARGA_SELVAGEM;
    if (atacante.atacar(companheiro)) this.dispararGolpe(atacante, companheiro);
  }

  // ------------------------------------------------------------ selvagens

  private sortearEspecie(): Especie {
    return escolherPesado(Math.random, ESPECIES, (e) =>
      pesoSpawn(e) * (this.dex.jaCapturou(e.id) ? 1 : 2.2),
    );
  }

  private nascerSelvagem() {
    const local = this.sala.pontoDeSpawn(this.posicaoJogador);
    if (!local) return;

    const especie = this.sortearEspecie();
    const piso = this.sala.temDadosReais ? local.ponto.y : this.sala.pisoY;
    const pokemon = new Pokemon(especie, local.ponto, piso, 'selvagem');
    this.cena.add(pokemon.raiz);

    const barra = new BarraVida(especie.nome, TIPOS[especie.tipo].nome, TIPOS[especie.tipo].cor);
    this.cena.add(barra.placa.malha);

    this.selvagens.push({ pokemon, barra });
    this.dex.registrarEncontro(especie.id);
    audio.surgiu(especie.id === 'pikachu');

    this.aviso.mostrar(
      [
        { texto: `${especie.nome} selvagem apareceu!`, tamanho: 36, cor: `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}` },
        { texto: this.dex.jaCapturou(especie.id) ? '' : 'espécie nova', tamanho: 24, cor: '#ffd78a', peso: 600 },
      ].filter((l) => l.texto),
      2.8,
    );
  }

  private removerSelvagem(alvo: Pokemon) {
    const i = this.selvagens.findIndex((s) => s.pokemon === alvo);
    if (i === -1) return;
    this.selvagens[i].pokemon.descartar(this.cena);
    this.cena.remove(this.selvagens[i].barra.placa.malha);
    this.selvagens[i].barra.descartar();
    this.selvagens.splice(i, 1);
  }

  // ------------------------------------------------------------ loop

  atualizar(dt: number) {
    const agora = performance.now();
    this.camera.getWorldPosition(this.posicaoJogador);

    // Antes de qualquer coisa: sem um parceiro você não batalha, e sem batalhar
    // capturar é quase impossível. A escolha vem primeiro e segura o resto.
    if (!this.dex.escolheuInicial) {
      this.atualizarEscolhaInicial(dt, agora);
      this.aviso.atualizar(dt, this.camera);
      return;
    }

    this.tempoLeituraSala -= dt;
    if (this.tempoLeituraSala <= 0) {
      this.tempoLeituraSala = 0.5;
      this.sala.atualizar(this.renderer.xr.getFrame() ?? null, this.renderer.xr.getReferenceSpace());
    }

    const comum = BOLA_PADRAO;
    if (this.dex.bolas(comum.id) < comum.maximo) {
      this.recarga += dt;
      if (this.recarga >= RECARGA_BOLA_COMUM) {
        this.recarga = 0;
        this.dex.ganharBola(comum.id, 1);
      }
    }

    this.proximoSpawn -= dt;
    if (this.proximoSpawn <= 0 && this.selvagens.length < MAX_SELVAGENS) {
      this.proximoSpawn = 6 + Math.random() * 6;
      this.nascerSelvagem();
    }

    this.regenerarTime(dt);
    this.atualizarMaos(dt, agora);
    this.atualizarPainelTime(dt);
    this.atualizarSelvagens(dt);
    this.atualizarCompanheiro(dt);
    this.atualizarAtaqueSelvagem(dt);
    this.atualizarBolas(dt);
    this.atualizarEfeitos(dt);

    this.painelPulso.atualizar(
      this.dex.totalBolas,
      this.dex.totalCapturas,
      this.dex.especiesCapturadas,
      this.dex.totalEspecies,
    );
    this.aviso.atualizar(dt, this.camera);
  }

  /** A vitrine dos três iniciais, enquanto você não escolheu. */
  private atualizarEscolhaInicial(dt: number, agora: number) {
    if (!this.escolha) {
      this.escolha = new EscolhaInicial();
      this.cena.add(this.escolha.grupo);
      this.escolha.posicionar(this.camera);
    }

    // As mãos continuam vivas: é com elas que você aponta.
    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.amostrar(agora);
      const raio = this.raios.get(mao.indice);
      if (raio) raio.atualizar(dt, mao.lado === 'right', 0.9);
    }

    const direita = this.maos.find((m) => m.lado === 'right' && m.conectada);
    const qualquer = this.maos.find((m) => m.conectada);
    const mira = (direita ?? qualquer)?.mira() ?? null;
    this.escolha.atualizar(dt, mira, this.camera);
  }

  /** Quem está fora de campo se recupera devagar. */
  private regenerarTime(dt: number) {
    this.acumuladoCura += dt;
    if (this.acumuladoCura < SEGUNDOS_POR_HP) return;
    this.acumuladoCura = 0;
    for (const { id, registro } of this.dex.time) {
      if (this.companheiro?.especie.id === id && this.companheiro.viva) continue;
      const max = porId(id)?.hpMax ?? registro.hp;
      if (registro.hp < max) this.dex.definirHp(id, registro.hp + 1);
    }
  }

  private atualizarMaos(dt: number, agora: number) {
    if (this.modoPlano) {
      const bola = this.bolaNaMao.get(99);
      if (bola) {
        this.carregando += dt;
        const alvo = new THREE.Vector3(0.16, -0.12, -0.3).applyMatrix4(this.camera.matrixWorld);
        bola.raiz.position.lerp(alvo, Math.min(1, dt * 20));
        bola.raiz.scale.setScalar(1 + Math.min(1, this.carregando / 1.1) * 0.3);
      }
      return;
    }

    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.amostrar(agora);

      const bola = this.bolaNaMao.get(mao.indice);
      const mira = this.miras.get(mao.indice);

      if (bola) {
        const alvo = new THREE.Vector3(0, 0.01, -0.055).applyMatrix4(mao.punho.matrixWorld);
        bola.raiz.position.copy(alvo);
        if (mira) mira.atualizar(alvo, mao.velocidadeArremesso(agora), this.sala.pisoY, dt);
      } else if (mira) {
        mira.atualizar(mao.posicaoMundo(), new THREE.Vector3(), this.sala.pisoY, dt);
      }

      // O raio de mira só aparece na mão livre, com o painel aberto.
      const raio = this.raios.get(mao.indice);
      if (raio) raio.atualizar(dt, this.painelTime.aberto && mao.lado === 'right', 0.6);

      // Analógico da direita troca de bola sem abrir o painel. Um passo por
      // inclinada: só volta a valer depois que o stick passa pelo centro.
      if (mao.lado === 'right') {
        const x = mao.analogicoX();
        if (this.analogicoNeutro && Math.abs(x) > 0.7) {
          this.analogicoNeutro = false;
          const id = this.dex.cicloBola(x > 0 ? 1 : -1);
          const tipo = bolaPorId(id);
          if (tipo) {
            audio.clique();
            mao.vibrar(0.3, 25);
            this.aviso.mostrar(
              [
                {
                  texto: tipo.nome,
                  tamanho: 38,
                  cor: `#${new THREE.Color(tipo.corTopo).getHexString()}`,
                },
                { texto: `${this.dex.bolas(id)} na mochila`, tamanho: 24, cor: '#9aa5b8', peso: 500 },
              ],
              1.4,
            );
          }
        } else if (Math.abs(x) < 0.3) {
          this.analogicoNeutro = true;
        }
      }

      if (!this.pulsoAnexado && mao.lado === 'left') {
        mao.punho.add(this.painelPulso.grupo);
        this.pulsoAnexado = true;
      }
    }
  }

  private atualizarPainelTime(dt: number) {
    const esquerda = this.maos.find((m) => m.lado === 'left' && m.conectada);
    const direita = this.maos.find((m) => m.lado === 'right' && m.conectada);

    const entradas = this.dex.time.map(({ id, registro }) => ({
      especie: porId(id)!,
      // Em campo, o HP que vale é o do corpo vivo.
      hp: this.companheiro?.especie.id === id && this.companheiro.viva ? this.companheiro.hp : registro.hp,
      capturados: registro.capturados,
    }));
    const bolas = BOLAS.map((tipo) => ({ tipo, quantidade: this.dex.bolas(tipo.id) }));
    this.painelTime.definirConteudo(entradas, bolas);

    const estavaAberto = this.painelTime.aberto;
    this.painelTime.atualizar(
      dt,
      esquerda?.punho ?? null,
      direita ? direita.mira() : null,
      this.companheiro?.viva ? this.companheiro.especie.id : this.dex.ativo,
      this.dex.bolaAtiva,
      this.camera,
    );
    if (this.painelTime.aberto && !estavaAberto) audio.abrirPainel();
    if (this.painelTime.mudouDestaque) {
      this.painelTime.mudouDestaque = false;
      audio.clique();
    }
  }

  private atualizarSelvagens(dt: number) {
    for (const selvagem of [...this.selvagens]) {
      const { pokemon, barra } = selvagem;
      pokemon.atualizar(dt, this.posicaoJogador);

      const emBatalha =
        this.temCompanheiroEmCampo &&
        pokemon.raiz.position.distanceTo(this.companheiro!.raiz.position) < ALCANCE_BATALHA;
      const mostrar =
        (pokemon.estado === 'atento' || emBatalha || pokemon.hpFracao < 1) &&
        pokemon.raiz.scale.x > 0.6 &&
        pokemon.estado !== 'preso';

      barra.atualizar(
        dt,
        mostrar,
        pokemon.hp,
        pokemon.especie.hpMax,
        pokemon.raiz.position,
        pokemon.especie.altura,
        this.camera,
        pokemon.desmaiado ? 'exausto' : '',
      );

      // Exausto: fica um tempo no chão, fácil de capturar, e some se você
      // demorar. É a janela que a batalha abriu para você.
      if (pokemon.estado === 'desmaiado') {
        pokemon.alarme = 0;
        if (pokemon.tempoNoEstado > 9) pokemon.dissolver();
      }

      if (!pokemon.viva) {
        if (pokemon.estado === 'saindo') audio.fugiu();
        this.removerSelvagem(pokemon);
      }
    }
  }

  private atualizarCompanheiro(dt: number) {
    if (!this.companheiro) return;
    const c = this.companheiro;
    c.atualizar(dt, this.posicaoJogador);
    c.alvo = this.alvoDoCompanheiro();

    if (this.barraCompanheiro) {
      this.barraCompanheiro.atualizar(
        dt,
        c.raiz.scale.x > 0.5 && c.estado !== 'saindo',
        c.hp,
        c.especie.hpMax,
        c.raiz.position,
        c.especie.altura,
        this.camera,
        c.desmaiado ? 'desmaiado' : 'seu',
      );
    }

    // Desmaiou em campo: volta para a bola sozinho.
    if (c.desmaiado && c.estado === 'desmaiado' && c.viva) {
      this.dex.definirHp(c.especie.id, 0);
      c.dissolver();
    }

    if (!c.viva) {
      this.dex.definirHp(c.especie.id, c.hp);
      c.descartar(this.cena);
      if (this.barraCompanheiro) {
        this.cena.remove(this.barraCompanheiro.placa.malha);
        this.barraCompanheiro.descartar();
        this.barraCompanheiro = null;
      }
      this.companheiro = null;
    }
  }

  private atualizarBolas(dt: number) {
    for (const bola of [...this.bolas]) {
      const anterior = bola.posicao.clone();
      bola.atualizar(dt);

      // Bola de invocação: abre ao tocar o chão ou após um tempo no ar.
      const idInvocar = bola.raiz.userData.invocar as string | undefined;
      if (idInvocar && bola.estado === 'voando' && bola.velocidade.lengthSq() < 0.6) {
        bola.raiz.userData.invocar = undefined;
        this.invocarNaBola(bola, idInvocar);
      }

      if (bola.estado === 'voando' && !idInvocar) this.testarAcerto(bola, anterior);

      if (bola.resultado === 'capturou') {
        bola.resultado = null;
        const presa = bola.presa;
        if (presa) {
          this.dex.registrarCaptura(presa.especie.id, Math.max(1, presa.hp));
          for (const tipo of BOLAS) this.dex.ganharBola(tipo.id, tipo.recompensa);
          const primeiraVez = (this.dex.de(presa.especie.id)?.capturados ?? 0) === 1;
          this.aviso.mostrar(
            [
              { texto: `${presa.especie.nome} capturado!`, tamanho: 46, cor: '#9ff0c4' },
              ...(primeiraVez
                ? [
                    { texto: presa.especie.descricao, tamanho: 21, cor: '#9aa5b8', peso: 400, espaco: 6 },
                    { texto: 'já dá para escolher ele no painel', tamanho: 22, cor: '#ffd78a', peso: 600 },
                  ]
                : []),
            ],
            primeiraVez ? 5 : 2.6,
          );
          this.removerSelvagem(presa);
          bola.presa = null;
        }
      } else if (bola.resultado === 'escapou') {
        bola.resultado = null;
        const presa = bola.presa;
        if (presa) {
          presa.raiz.visible = true;
          const fuga = bola.posicao.clone();
          fuga.x += (Math.random() * 2 - 1) * 0.5;
          fuga.z += (Math.random() * 2 - 1) * 0.5;
          presa.reaparecer(fuga);
          this.aviso.mostrar(
            [
              { texto: 'escapou!', tamanho: 48, cor: '#ffb1b1' },
              { texto: 'enfraqueça ele um pouco mais', tamanho: 24, cor: '#9aa5b8', peso: 500 },
            ],
            2.2,
          );
          bola.presa = null;
        }
      } else if (bola.resultado === 'soltou') {
        bola.resultado = null;
        bola.presa = null;
      }

      if (bola.acabou) {
        bola.descartar(this.cena);
        this.bolas.splice(this.bolas.indexOf(bola), 1);
      }
    }
  }

  /** A bola pousou: abre e o Pokémon escolhido entra em campo. */
  private invocarNaBola(bola: Pokebola, id: string) {
    const especie = porId(id);
    const registro = this.dex.de(id);
    if (!especie || !registro) return;

    // Só um em campo por vez.
    if (this.companheiro?.viva) {
      this.dex.definirHp(this.companheiro.especie.id, this.companheiro.hp);
      this.companheiro.descartar(this.cena);
      if (this.barraCompanheiro) {
        this.cena.remove(this.barraCompanheiro.placa.malha);
        this.barraCompanheiro.descartar();
      }
    }

    const piso = this.sala.alturaEm(bola.posicao);
    const pokemon = new Pokemon(especie, bola.posicao, piso, 'companheiro');
    pokemon.hp = Math.max(1, registro.hp);
    pokemon.raiz.visible = false;
    this.cena.add(pokemon.raiz);
    this.companheiro = pokemon;

    this.barraCompanheiro = new BarraVida(
      especie.nome,
      TIPOS[especie.tipo].nome,
      TIPOS[especie.tipo].cor,
    );
    this.cena.add(this.barraCompanheiro.placa.malha);

    pokemon.invocar(bola.posicao, piso);
    bola.soltar(pokemon);
    audio.invocar();

    this.aviso.mostrar(
      [
        { texto: `${especie.nome}, eu escolho você!`, tamanho: 40, cor: `#${new THREE.Color(TIPOS[especie.tipo].cor).getHexString()}` },
        { texto: 'gatilho para atacar', tamanho: 24, cor: '#9aa5b8', peso: 500 },
      ],
      2.8,
    );
  }

  private testarAcerto(bola: Pokebola, anterior: THREE.Vector3) {
    for (const { pokemon } of this.selvagens) {
      if (pokemon.estado === 'preso' || pokemon.estado === 'saindo' || !pokemon.viva) continue;

      const alvo = pokemon.centro;
      const dist = distanciaAoSegmento(alvo, anterior, bola.posicao);
      const alcance = pokemon.raio + bola.raio;

      if (dist <= alcance) {
        const precisao = THREE.MathUtils.clamp(1 - dist / alcance, 0, 1);
        const multiplicador = (bola.raiz.userData.multiplicador as number) ?? 1;
        bola.capturar(pokemon, precisao, multiplicador);
        for (const mao of this.maos) mao.vibrar(0.8, 90);
        return;
      }
      if (dist <= alcance + 0.28) pokemon.assustar(0.28);
    }
  }

  private atualizarEfeitos(dt: number) {
    for (const efeito of [...this.efeitos]) {
      efeito.atualizar(dt);
      if (efeito.terminou) {
        efeito.descartar(this.cena);
        this.efeitos.splice(this.efeitos.indexOf(efeito), 1);
      }
    }
    for (const impacto of [...this.impactos]) {
      impacto.atualizar(dt);
      if (impacto.terminou) {
        impacto.descartar(this.cena);
        this.impactos.splice(this.impactos.indexOf(impacto), 1);
      }
    }
  }

  /** Versão do arremesso para o modo sem headset. */
  arremessoPlano(fase: 'inicio' | 'fim') {
    if (fase === 'inicio') {
      if (this.bolaNaMao.has(99)) return;
      const ativo = this.dex.ativo;
      const vaiInvocar = !this.temCompanheiroEmCampo && ativo !== null && (this.dex.de(ativo)?.hp ?? 0) > 0;
      const tipoBola = bolaPorId(this.dex.bolaAtiva) ?? BOLA_PADRAO;
      if (!vaiInvocar && this.dex.bolas(tipoBola.id) <= 0) return;

      const especieAtiva = vaiInvocar ? porId(ativo!) : null;
      const bola = new Pokebola(
        this.sala.pisoY,
        especieAtiva ? TIPOS[especieAtiva.tipo].cor : tipoBola.corTopo,
        especieAtiva ? 0xf2f2f5 : tipoBola.corBase,
      );
      this.cena.add(bola.raiz);
      this.bolas.push(bola);
      this.bolaNaMao.set(99, bola);
      if (vaiInvocar) {
        this.bolaDeInvocacao.set(99, ativo!);
      } else {
        this.dex.gastarBola(tipoBola.id);
        bola.raiz.userData.multiplicador = tipoBola.multiplicador;
      }
      this.carregando = 0;
      return;
    }

    const bola = this.bolaNaMao.get(99);
    if (!bola) return;
    this.bolaNaMao.delete(99);

    const forca = 3.2 + Math.min(1, this.carregando / 1.1) * 6.5;
    const direcao = new THREE.Vector3();
    this.camera.getWorldDirection(direcao);
    direcao.y += 0.18;
    bola.lancar(direcao.normalize().multiplyScalar(forca));

    const idInvocacao = this.bolaDeInvocacao.get(99);
    if (idInvocacao) {
      this.bolaDeInvocacao.delete(99);
      bola.raiz.userData.invocar = idInvocacao;
    }
    this.carregando = 0;
  }

  /** Atalhos do modo sem headset: escolher time e atacar pelo teclado. */
  comandoPlano(acao: 'atacar' | 'proximo') {
    if (acao === 'atacar') {
      const mao = this.maos[0];
      this.comandarAtaque(mao);
      return;
    }
    const time = this.dex.time;
    if (time.length === 0) return;
    const atual = time.findIndex((t) => t.id === this.dex.ativo);
    const proximo = time[(atual + 1) % time.length];
    this.escolherDoTime(proximo.id);
  }

  aoEntrarNaSessao() {
    this.proximoSpawn = 3;
    this.aviso.mostrar(
      [
        { texto: 'olhe em volta', tamanho: 42, cor: '#cfe6ff' },
        { texto: 'GRIP segura a pokébola · solte no movimento para arremessar', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'vire a palma esquerda para cima para ver seu time', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
      6,
    );
  }

  descartar() {
    for (const { pokemon, barra } of this.selvagens) {
      pokemon.descartar(this.cena);
      barra.descartar();
    }
    this.companheiro?.descartar(this.cena);
    this.barraCompanheiro?.descartar();
    for (const bola of this.bolas) bola.descartar(this.cena);
    for (const efeito of this.efeitos) efeito.descartar(this.cena);
    for (const impacto of this.impactos) impacto.descartar(this.cena);
    for (const mira of this.miras.values()) mira.descartar();
    for (const raio of this.raios.values()) raio.descartar();
    this.painelPulso.descartar();
    this.painelTime.descartar();
    this.aviso.descartar();
    this.sala.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
