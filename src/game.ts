import * as THREE from 'three';
import { Pokemon } from './creature';
import {
  ESPECIES,
  NIVEL_MAXIMO,
  TIPOS,
  calcularDano,
  corHexDe,
  escolherGolpe,
  evolucaoEm,
  nivelSelvagem,
  pesoSpawn,
  porId,
  sortearShiny,
  textoEfetividade,
  textoTipos,
  xpDeEncontro,
  xpParaNivel,
  type Especie,
  type Golpe,
} from './species';
import { garantir, instanciar, type Corpo } from './modelos';
import { Pokebola } from './orb';
import { Sala } from './room';
import { Mao, Mira, RaioMira, construirLuva } from './hands';
import { Aviso, BarraVida, PainelPulso } from './hud';
import { PainelTime, type EntradaGolpe } from './menu';
import { MODO_PADRAO, type Modo } from './modos';
import { PainelDex, type EstadoDex } from './dexpanel';
import { EscolhaInicial } from './starter';
import { BOLAS, BOLA_PADRAO, bolaPorId } from './balls';
import { BONUS_FRUTA, ITENS, SEGUNDOS_FRUTA } from './itens';
import { Efeito, Impacto } from './attacks';
import { Dex, type Exemplar } from './state';
import { audio } from './audio';
import { escolherPesado } from './rng';

const MAX_SELVAGENS = 2;
/** Só a bola comum recarrega sozinha; as outras vêm de capturas. */
const RECARGA_BOLA_COMUM = 5;
const ALCANCE_BATALHA = 4.5;
const RECARGA_SELVAGEM = 2.6;
/** Fora de campo, cada Pokémon recupera 1 de HP a cada tanto de segundos. */
const SEGUNDOS_POR_HP = 2.5;
/** Perto o bastante para a mão encostar no companheiro e fazer carinho. */
const DISTANCIA_CARINHO = 0.3;

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
  /** O exemplar da coleção que está em campo — é nele que a XP entra. */
  private exemplarEmCampo: Exemplar | null = null;
  private barraCompanheiro: BarraVida | null = null;
  private bolas: Pokebola[] = [];
  private efeitos: Efeito[] = [];
  private impactos: Impacto[] = [];

  private maos: Mao[] = [];
  private miras = new Map<number, Mira>();
  private raios = new Map<number, RaioMira>();
  private bolaNaMao = new Map<number, Pokebola>();
  /** Quando a bola da mão carrega um Pokémon para soltar, e não é de captura. */
  private bolaDeInvocacao = new Map<number, Exemplar>();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private aviso: Aviso;
  private painelPulso = new PainelPulso();
  private painelTime = new PainelTime();
  private painelDex = new PainelDex();
  private pulsoAnexado = false;

  /** Existe só até você escolher o parceiro inicial. */
  private escolha: EscolhaInicial | null = null;
  private carregandoEscolha = false;
  /** Trava o analógico para um passo por inclinada. */
  private analogicoNeutro = true;

  private recarga = 0;
  private modo: Modo = MODO_PADRAO;
  /** Golpe escolhido à mão no painel. Só o modo Batalha usa. */
  private golpeArmado: string | null = null;
  /** Selvagens que você aceitou encarar, no Safari. */
  private encarados = new Set<Pokemon>();
  private proximoSpawn = 2;
  private tempoLeituraSala = 0;
  private recargaSelvagem = RECARGA_SELVAGEM;
  private acumuladoCura = 0;
  private posicaoJogador = new THREE.Vector3();

  /** Um nascimento por vez: o modelo é baixado antes de o bicho aparecer. */
  private nascendo = false;
  /** Enquanto durar, a próxima bola vale mais — é a fruta fazendo efeito. */
  private bonusFruta = 0;
  /** Impede que um carinho vire vinte no mesmo segundo. */
  private recargaCarinho = 0;

  private modoPlano = false;
  private carregando = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 60);
    this.camera.position.set(0, 1.6, 0);

    this.sala = new Sala(this.cena);
    this.aviso = new Aviso(this.cena);
    this.sala.usarFallback();

    this.cena.add(this.painelTime.grupo, this.painelDex.grupo);

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

    // Painel aberto e a mão em cima de uma carta: o GRIP pega o que está ali.
    // É o gesto que o painel pedia desde sempre — ele fica preso ao seu pulso,
    // a um palmo do outro braço, e alcançar com a mão é mais natural do que
    // mirar de longe numa coisa encostada em você.
    if (this.painelTime.aberto) {
      const alcancado = this.painelTime.alcancado(mao.posicaoMundo());
      if (alcancado) {
        mao.vibrar(0.45, 45);
        if (alcancado.tipo === 'item') {
          this.usarItem(alcancado.entrada.tipo.id);
          return;
        }
        if (alcancado.tipo === 'modo') {
          this.escolherModo(alcancado.entrada);
          return;
        }
        if (alcancado.tipo === 'golpe') {
          this.armarGolpe(alcancado.entrada);
          return;
        }
        if (alcancado.tipo === 'bola') {
          this.escolherBola(alcancado.entrada.tipo.id);
          // Escolheu a bola com a mão: ela já sai na mão, sem um segundo grip.
          if (this.dex.bolas(alcancado.entrada.tipo.id) > 0) this.tirarBolaDaCinta(mao);
          return;
        }
        // Pegou a bola de um Pokémon do time: ele vira o ativo e a bola DELE
        // já nasce na mão, pronta para o arremesso.
        if (!this.escolherDoTime(alcancado.entrada.exemplar)) return;
        this.tirarBolaDaCinta(mao);
        return;
      }
    }

    this.tirarBolaDaCinta(mao);
  }

  /**
   * Materializa uma pokébola na mão: a do Pokémon ativo, se houver um esperando
   * para entrar, ou uma bola de captura do tipo escolhido.
   */
  private tirarBolaDaCinta(mao: Mao) {
    if (this.bolaNaMao.has(mao.indice)) return;

    // Com um Pokémon escolhido e ainda na bola, o grip pega a bola DELE.
    const ativo = this.dex.exemplarAtivo;
    const vaiInvocar = !this.temCompanheiroEmCampo && ativo !== null && ativo.hp > 0;

    const tipoBola = bolaPorId(this.dex.bolaAtiva) ?? BOLA_PADRAO;

    if (!vaiInvocar && this.dex.bolas(tipoBola.id) <= 0) {
      this.aviso.mostrar(
        [
          { texto: `sem ${tipoBola.nome}`, tamanho: 40, cor: '#ff9f9f' },
          { texto: 'gire o pulso esquerdo e escolha outra', tamanho: 25, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    const especieAtiva = vaiInvocar ? porId(ativo!.id) : null;
    // Começa a baixar o modelo agora: até a bola voar e pousar ele já chegou.
    if (especieAtiva) void garantir(especieAtiva.id, ativo!.shiny);

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
      // voo não pode mudar a chance daquele arremesso. A fruta entra aqui pelo
      // mesmo motivo: vale para a bola que já está na mão.
      const comFruta = this.bonusFruta > 0 ? BONUS_FRUTA : 1;
      bola.raiz.userData.multiplicador = tipoBola.multiplicador * comFruta;
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

    const exemplar = this.bolaDeInvocacao.get(mao.indice);
    if (exemplar) {
      this.bolaDeInvocacao.delete(mao.indice);
      bola.raiz.userData.invocar = exemplar;
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
      if (selecao.tipo === 'criatura') this.escolherDoTime(selecao.entrada.exemplar);
      else if (selecao.tipo === 'bola') this.escolherBola(selecao.entrada.tipo.id);
      else if (selecao.tipo === 'modo') this.escolherModo(selecao.entrada);
      else if (selecao.tipo === 'golpe') this.armarGolpe(selecao.entrada);
      else this.usarItem(selecao.entrada.tipo.id);
      return;
    }

    // Pokédex aberta: o gatilho não faz nada além de ler. É de leitura mesmo.
    if (this.painelDex.aberto) return;

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

  // ------------------------------------------------------------ modos

  /**
   * Os golpes que o bicho em campo tem, para a fileira do painel.
   *
   * Fora do modo Batalha a lista sai vazia de propósito: no Relaxante e no
   * Safari quem escolhe o golpe é o jogo, e mostrar um menu de comando que não
   * comanda nada só ocuparia espaço no pulso.
   */
  private golpesDoCampo(): EntradaGolpe[] {
    if (!this.modo.escolheGolpe || !this.temCompanheiroEmCampo) return [];
    const golpes = this.companheiro!.especie.golpes;
    // Sem nada armado, o primeiro golpe é o que vai sair — então ele aparece
    // armado, e o painel nunca mostra uma escolha que não corresponde ao que o
    // gatilho faria.
    const armado = this.golpeArmado ?? golpes[0]?.nome ?? null;
    return golpes.map((golpe) => ({ golpe, armado: golpe.nome === armado }));
  }

  private escolherModo(modo: Modo) {
    if (modo.id === this.modo.id) return;
    this.modo = modo;
    this.golpeArmado = null;
    this.encarados.clear();
    audio.clique();

    // Trocar para o Relaxante limpa a sala: o sentido do modo é não ter
    // ninguém aparecendo para brigar, e esperar os que já estão irem embora
    // sozinhos desmentiria isso no primeiro minuto.
    if (!modo.spawnAutomatico) this.dispensarSelvagens();
    else this.proximoSpawn = modo.intervaloSpawn[0] * 0.5;

    this.aviso.mostrar(
      [
        { texto: `modo ${modo.nome}`, tamanho: 44, cor: modo.cor },
        { texto: this.explicacaoDoModo(modo), tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
      2.8,
    );
  }

  private explicacaoDoModo(modo: Modo): string {
    if (modo.id === 'relaxante') return 'ninguém vem brigar — só você e o seu Pokémon';
    if (modo.id === 'safari') return 'quem aparecer só briga se você mandar atacar';
    return 'escolha o golpe na fileira de baixo do painel';
  }

  private armarGolpe(entrada: EntradaGolpe) {
    this.golpeArmado = entrada.golpe.nome;
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: entrada.golpe.nome, tamanho: 42, cor: `#${new THREE.Color(TIPOS[entrada.golpe.tipo].cor).getHexString()}` },
        { texto: 'é este que sai no próximo gatilho', tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
      2,
    );
  }

  /** Manda embora quem está em campo, sem dar XP nem pena. */
  private dispensarSelvagens() {
    for (const selvagem of [...this.selvagens]) this.removerSelvagem(selvagem.pokemon);
    this.encarados.clear();
  }

  // ------------------------------------------------------------ itens

  private usarItem(id: string) {
    if (this.dex.item(id) <= 0) {
      const tipo = ITENS.find((i) => i.id === id);
      this.aviso.mostrar(
        [
          { texto: `sem ${tipo?.nome ?? 'item'}`, tamanho: 36, cor: '#ff9f9f' },
          { texto: 'itens caem quando você captura', tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        2,
      );
      return;
    }

    if (id === 'pocao') this.usarPocao();
    else if (id === 'fruta') this.usarFruta();
    else if (id === 'doce') this.usarDoce();
  }

  private usarPocao() {
    const exemplar = this.exemplarEmCampo ?? this.dex.exemplarAtivo;
    if (!exemplar) return;
    const especie = porId(exemplar.id);
    if (!especie) return;

    const maximo = this.dex.hpMaxDe(exemplar);
    const atual = this.companheiro?.viva ? this.companheiro.hp : exemplar.hp;
    if (atual >= maximo) {
      this.aviso.mostrar(
        [{ texto: `${especie.nome} já está inteiro`, tamanho: 34, cor: '#9aa5b8' }],
        1.6,
      );
      return;
    }

    this.dex.gastarItem('pocao');
    const cura = Math.ceil(maximo * 0.5);
    if (this.companheiro?.viva) this.companheiro.curar(cura);
    this.dex.definirHp(exemplar, Math.min(maximo, atual + cura));
    audio.sucesso();
    this.aviso.mostrar(
      [
        { texto: `${especie.nome} recuperou ${cura}`, tamanho: 38, cor: '#7fe7c4' },
        { texto: 'Poção usada', tamanho: 23, cor: '#9aa5b8', peso: 500 },
      ],
      2,
    );
  }

  /**
   * A fruta faz duas coisas ao mesmo tempo, e é por isso que ela é o item mais
   * útil da mochila: acalma o selvagem mais próximo — desfazendo o alarme que
   * você acumulou chegando perto — e deixa a próxima bola valer quase o dobro.
   */
  private usarFruta() {
    let alvo: Pokemon | null = null;
    let menor = Infinity;
    for (const { pokemon } of this.selvagens) {
      if (!pokemon.viva || pokemon.estado === 'preso') continue;
      const d = pokemon.raiz.position.distanceTo(this.posicaoJogador);
      if (d < menor) {
        menor = d;
        alvo = pokemon;
      }
    }

    this.dex.gastarItem('fruta');
    this.bonusFruta = SEGUNDOS_FRUTA;
    audio.clique();

    if (alvo) {
      alvo.acalmar(0.7);
      this.aviso.mostrar(
        [
          { texto: `${alvo.especie.nome} se acalmou`, tamanho: 38, cor: '#ffc98a' },
          { texto: 'a próxima bola pega mais fácil', tamanho: 24, cor: '#9ff0c4', peso: 600 },
        ],
        2.4,
      );
      return;
    }

    // Sem selvagem por perto, a fruta vira petisco: o companheiro vem buscar.
    if (this.companheiro?.viva) {
      this.companheiro.chamarPara(this.posicaoJogador);
      this.companheiro.curar(Math.ceil(this.companheiro.hpMax * 0.12));
    }
    this.aviso.mostrar(
      [
        { texto: 'você guardou a fruta na mão', tamanho: 34, cor: '#ffc98a' },
        { texto: 'a próxima bola pega mais fácil', tamanho: 24, cor: '#9ff0c4', peso: 600 },
      ],
      2.2,
    );
  }

  private usarDoce() {
    const exemplar = this.exemplarEmCampo ?? this.dex.exemplarAtivo;
    if (!exemplar) return;
    const especie = porId(exemplar.id);
    if (!especie) return;
    this.dex.gastarItem('doce');
    // Sobe exatamente um nível, custe o que custar em XP.
    const alvo = Math.min(this.dex.nivelDe(exemplar) + 1, NIVEL_MAXIMO);
    this.dex.ganharXp(exemplar, Math.max(1, xpParaNivel(alvo) - exemplar.xp));
    audio.sucesso();
    this.aviso.mostrar(
      [
        { texto: `${especie.nome} chegou ao nível ${this.dex.nivelDe(exemplar)}!`, tamanho: 38, cor: '#d8b4ff' },
      ],
      2.4,
    );
    void this.conferirEvolucao(exemplar);
  }

  // ------------------------------------------------------------ time

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
        { texto: `${especie.nome} é seu!`, tamanho: 46, cor: corHexDe(especie) },
        { texto: especie.descricao, tamanho: 21, cor: '#9aa5b8', peso: 400, espaco: 6 },
        { texto: 'aperte o GRIP e arremesse para soltar ele', tamanho: 23, cor: '#ffd78a', peso: 600 },
      ],
      6,
    );
  }

  /** Devolve true quando o bicho ficou ativo e pronto para ir a campo. */
  private escolherDoTime(exemplar: Exemplar): boolean {
    const especie = porId(exemplar.id);
    if (!especie) return false;

    // Escolher quem já está em campo recolhe ele de volta.
    if (this.exemplarEmCampo === exemplar && this.companheiro?.viva) {
      this.recolherCompanheiro();
      return false;
    }

    if (exemplar.hp <= 0) {
      this.aviso.mostrar(
        [
          { texto: `${especie.nome} está desmaiado`, tamanho: 38, cor: '#ff9f9f' },
          { texto: 'ele se recupera com o tempo', tamanho: 24, cor: '#9aa5b8', peso: 500 },
        ],
        2.2,
      );
      return false;
    }

    this.dex.definirAtivo(this.dex.indiceDe(exemplar));
    void garantir(especie.id, exemplar.shiny);
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: especie.nome, tamanho: 44, cor: corHexDe(especie) },
        { texto: 'aperte o GRIP e arremesse a bola', tamanho: 24, cor: '#9aa5b8', peso: 500 },
      ],
      2.6,
    );
    return true;
  }

  private recolherCompanheiro() {
    if (!this.companheiro) return;
    if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, this.companheiro.hp);
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
          { texto: 'gire o pulso esquerdo e pegue a bola de um deles', tamanho: 22, cor: '#9aa5b8', peso: 500 },
        ],
        2.4,
      );
      return;
    }

    const alvo = this.alvoDoCompanheiro();
    if (!alvo) {
      // Sem ninguém para brigar, o gatilho ainda serve: ele acerta o ponto da
      // sala para onde você está apontando. É o que dá o que fazer no modo
      // Relaxante, onde não nasce selvagem nenhum — e continua valendo nos
      // outros, porque mandar o bicho estourar um canto da parede é divertido
      // independente do modo.
      this.atacarOAmbiente(mao);
      return;
    }

    const companheiro = this.companheiro!;
    if (!companheiro.podeAtacar) return;

    // Fora do modo Batalha o golpe não é fixo: entre os que ele tem, sai o mais
    // eficaz contra ESTE alvo, e é o que faz a tabela de tipos aparecer sem
    // menu de comando. No Batalha a escolha é sua, e ela vale mesmo quando é a
    // pior — é o preço de poder decidir.
    const golpe =
      (this.modo.escolheGolpe
        ? companheiro.especie.golpes.find((g) => g.nome === this.golpeArmado)
        : null) ?? escolherGolpe(companheiro, alvo);

    if (companheiro.atacar(alvo, golpe.recarga)) {
      mao.vibrar(0.7, 70);
      // No Safari, mandar atacar é o que transforma um encontro em briga: daí
      // em diante aquele selvagem revida.
      this.encarados.add(alvo);
      this.dispararGolpe(companheiro, alvo, golpe);
    }
  }

  /**
   * Golpe no vazio: o companheiro acerta onde a sua mão está apontando.
   *
   * Sem dano e sem alvo — o que ele produz é o efeito, o som e o estalo de
   * partículas no ponto. O destino sai da mira mesmo, limitado a três metros,
   * que é mais do que qualquer quarto e menos do que o infinito.
   */
  private atacarOAmbiente(mao: Mao) {
    const companheiro = this.companheiro!;
    if (!companheiro.podeAtacar) return;

    const { origem, direcao } = mao.mira();
    const ponto = origem.clone().addScaledVector(direcao, 3);
    // Não deixa o golpe ir parar embaixo do carpete.
    ponto.y = Math.max(ponto.y, this.sala.pisoY + 0.05);

    const golpe =
      companheiro.especie.golpes.find((g) => g.nome === this.golpeArmado) ??
      companheiro.especie.golpes[0];

    if (!companheiro.atacarPonto(ponto, golpe.recarga)) return;
    mao.vibrar(0.55, 60);

    const efeito = new Efeito(golpe, companheiro.boca, ponto);
    efeito.adicionarA(this.cena);
    this.efeitos.push(efeito);
    audio.golpe(golpe.tipo);

    window.setTimeout(() => {
      const impacto = new Impacto(ponto, TIPOS[golpe.tipo].cor);
      this.cena.add(impacto.pontos);
      this.impactos.push(impacto);
    }, efeito.momentoImpacto * 1000);
  }

  /** Cria o efeito visual e agenda o dano para o momento do impacto. */
  private dispararGolpe(atacante: Pokemon, defensor: Pokemon, golpe: Golpe) {
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

  private resolverDano(atacante: Pokemon, defensor: Pokemon, golpe: Golpe) {
    const { dano, efetividade, critico } = calcularDano(atacante, defensor, golpe);
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
        // Derrubar rende experiência, mas menos do que capturar.
        this.premiarXp(defensor, false);
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
        // Quem revida: no Batalha, todo mundo; no Safari, só quem você já
        // mandou atacar. É o que torna encarar uma escolha em vez de uma
        // emboscada.
        (this.modo.selvagemRevida || this.encarados.has(pokemon)) &&
        pokemon.raiz.position.distanceTo(companheiro.raiz.position) < ALCANCE_BATALHA,
    );
    if (candidatos.length === 0) return;

    const atacante = candidatos[Math.floor(Math.random() * candidatos.length)].pokemon;
    this.recargaSelvagem = RECARGA_SELVAGEM;
    const golpe = escolherGolpe(atacante, companheiro);
    if (atacante.atacar(companheiro, golpe.recarga)) {
      this.dispararGolpe(atacante, companheiro, golpe);
    }
  }

  // ------------------------------------------------------------ progressão

  /** Dá XP ao que está em campo e cuida do nível e da evolução. */
  private premiarXp(derrotado: Pokemon, capturou: boolean) {
    const exemplar = this.exemplarEmCampo;
    if (!exemplar || derrotado.xpConcedida) return;
    derrotado.xpConcedida = true;

    const ganho = xpDeEncontro(derrotado.especie, derrotado.nivel, capturou);
    const novoNivel = this.dex.ganharXp(exemplar, ganho);
    if (novoNivel !== null) {
      const especie = porId(exemplar.id);
      audio.sucesso();
      this.aviso.mostrar(
        [
          { texto: `${especie?.nome ?? ''} subiu para o nível ${novoNivel}!`, tamanho: 40, cor: '#9fe0ff' },
          { texto: `+${ganho} de experiência`, tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        2.6,
      );
      void this.conferirEvolucao(exemplar);
    }
  }

  /**
   * Evolução. Acontece no lugar, com o bicho em campo: o corpo antigo some numa
   * clarada e o novo nasce na mesma posição. É o momento mais bonito que o jogo
   * tem, e recolher para a bola antes estragaria ele.
   */
  private async conferirEvolucao(exemplar: Exemplar) {
    const atual = porId(exemplar.id);
    if (!atual) return;
    const nivel = this.dex.nivelDe(exemplar);
    const evoluida = evolucaoEm(atual, nivel);
    if (!evoluida) return;

    const gltf = await garantir(evoluida.id, exemplar.shiny);
    if (!gltf) return;

    const emCampo = this.exemplarEmCampo === exemplar && this.companheiro?.viva === true;
    const posicao = emCampo ? this.companheiro!.raiz.position.clone() : null;
    const piso = emCampo ? this.companheiro!.pisoY : this.sala.pisoY;

    this.dex.evoluir(exemplar, evoluida.id);
    audio.invocar();

    this.aviso.mostrar(
      [
        { texto: `${atual.nome} evoluiu!`, tamanho: 34, cor: '#cfe6ff' },
        { texto: `agora é ${evoluida.nome}`, tamanho: 46, cor: corHexDe(evoluida) },
        { texto: evoluida.descricao, tamanho: 20, cor: '#9aa5b8', peso: 400, espaco: 6 },
      ],
      5,
    );

    if (!emCampo || !posicao) return;

    // Troca o corpo sem perder o lugar na sala.
    this.removerCompanheiro();
    const corpo = instanciar(evoluida.id, evoluida.altura, exemplar.shiny);
    if (!corpo) return;
    this.porEmCampo(evoluida, corpo, exemplar, posicao, piso);
  }

  // ------------------------------------------------------------ selvagens

  private sortearEspecie(): Especie {
    const nivel = this.dex.nivelDoTreinador;
    return escolherPesado(Math.random, ESPECIES, (e) =>
      pesoSpawn(e, this.dex.jaCapturou(e.id), nivel),
    );
  }

  /**
   * Faz nascer um selvagem. É assíncrono porque o modelo pode não estar em
   * memória ainda: são 151 arquivos e só uma dúzia fica carregada. O bicho
   * aparece quando o GLB dele chega — nunca uma silhueta de espera.
   */
  private async nascerSelvagem() {
    if (this.nascendo) return;
    this.nascendo = true;
    try {
      const especie = this.sortearEspecie();
      const shiny = sortearShiny(especie);
      const nivel = nivelSelvagem(this.dex.nivelDoTreinador);

      const gltf = await garantir(especie.id, shiny);
      if (!gltf) return;
      if (this.selvagens.length >= MAX_SELVAGENS) return;

      // A sala pode ter sido remedida enquanto o arquivo baixava, então o ponto
      // de spawn é escolhido agora, não antes.
      const local = this.sala.pontoDeSpawn(this.posicaoJogador);
      if (!local) return;

      const corpo = instanciar(especie.id, especie.altura, shiny);
      if (!corpo) return;

      const piso = this.sala.temDadosReais ? local.ponto.y : this.sala.pisoY;
      const pokemon = new Pokemon(especie, corpo, local.ponto, piso, 'selvagem', nivel, shiny);
      this.cena.add(pokemon.raiz);

      const barra = new BarraVida(
        shiny ? `✦ ${especie.nome}` : especie.nome,
        textoTipos(especie),
        TIPOS[especie.tipo].cor,
      );
      this.cena.add(barra.placa.malha);

      this.selvagens.push({ pokemon, barra });
      this.dex.registrarEncontro(especie.id, shiny);
      audio.surgiu(especie.id === 'pikachu' || shiny);

      const novidade = !this.dex.jaCapturou(especie.id);
      this.aviso.mostrar(
        [
          shiny
            ? { texto: `${especie.nome} BRILHANTE!`, tamanho: 42, cor: '#ffd76a' }
            : {
                texto: `${especie.nome} selvagem apareceu!`,
                tamanho: 36,
                cor: corHexDe(especie),
              },
          { texto: `nível ${nivel} · ${textoTipos(especie)}`, tamanho: 23, cor: '#9aa5b8', peso: 500 },
          ...(novidade
            ? [{ texto: 'espécie nova', tamanho: 24, cor: '#ffd78a', peso: 600 }]
            : []),
          // No Safari o encontro não vira briga sozinho, e o aviso precisa
          // dizer isso: quem chega fica em paz até você puxar o gatilho.
          ...(this.modo.perguntaAntesDaBatalha
            ? [
                {
                  texto: 'ele está em paz — o gatilho é que começa a briga',
                  tamanho: 21,
                  cor: '#8ab6ff',
                  peso: 500,
                },
              ]
            : []),
        ],
        shiny ? 4.5 : 2.8,
      );
    } finally {
      this.nascendo = false;
    }
  }

  private removerSelvagem(alvo: Pokemon) {
    const i = this.selvagens.findIndex((s) => s.pokemon === alvo);
    if (i === -1) return;
    this.selvagens[i].pokemon.descartar(this.cena);
    this.cena.remove(this.selvagens[i].barra.placa.malha);
    this.selvagens[i].barra.descartar();
    this.selvagens.splice(i, 1);
    // Quem saiu de cena não precisa mais constar na lista de encarados do
    // Safari — o Set guarda referências e cresceria a sessão inteira.
    this.encarados.delete(alvo);
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

    if (this.bonusFruta > 0) this.bonusFruta -= dt;
    if (this.recargaCarinho > 0) this.recargaCarinho -= dt;

    const comum = BOLA_PADRAO;
    if (this.dex.bolas(comum.id) < comum.maximo) {
      this.recarga += dt;
      if (this.recarga >= RECARGA_BOLA_COMUM) {
        this.recarga = 0;
        this.dex.ganharBola(comum.id, 1);
      }
    }

    // No Relaxante ninguém nasce: o modo existe justamente para a sala ficar
    // sua e do seu Pokémon.
    if (this.modo.spawnAutomatico) {
      this.proximoSpawn -= dt;
      if (this.proximoSpawn <= 0 && this.selvagens.length < MAX_SELVAGENS) {
        const [minimo, maximo] = this.modo.intervaloSpawn;
        this.proximoSpawn = minimo + Math.random() * (maximo - minimo);
        void this.nascerSelvagem();
      }
    }

    this.regenerarTime(dt);
    this.atualizarMaos(dt, agora);
    this.atualizarPaineis(dt);
    this.atualizarSelvagens(dt);
    this.atualizarCompanheiro(dt);
    this.atualizarCarinho(dt);
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

  /** A vitrine dos iniciais, enquanto você não escolheu. */
  private atualizarEscolhaInicial(dt: number, agora: number) {
    if (!this.escolha) {
      if (!this.carregandoEscolha) {
        this.carregandoEscolha = true;
        this.aviso.mostrar(
          [
            { texto: 'carregando os parceiros…', tamanho: 38, cor: '#cfe6ff' },
            { texto: 'são modelos de verdade, leva um instante', tamanho: 22, cor: '#9aa5b8', peso: 500 },
          ],
          4,
        );
        void EscolhaInicial.carregar().then(() => {
          this.escolha = new EscolhaInicial();
          this.cena.add(this.escolha.grupo);
          this.escolha.posicionar(this.camera);
        });
      }
      // Mesmo esperando, as mãos precisam continuar vivas.
      for (const mao of this.maos) if (mao.conectada) mao.amostrar(agora);
      return;
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
    for (const exemplar of this.dex.time) {
      if (this.exemplarEmCampo === exemplar && this.companheiro?.viva) continue;
      const max = this.dex.hpMaxDe(exemplar);
      if (exemplar.hp < max) this.dex.definirHp(exemplar, exemplar.hp + 1);
    }
  }

  /**
   * Carinho: encostar a mão no companheiro. Ele se vira para você, ganha um
   * pouco de vida e um pouco de experiência.
   *
   * É a interação mais barata do jogo e a que mais faz ele parecer vivo — o
   * bicho está ali, ao alcance do braço, e a primeira coisa que se quer fazer
   * com um Pokémon dentro do quarto é justamente encostar nele.
   */
  private atualizarCarinho(dt: number) {
    void dt;
    if (!this.temCompanheiroEmCampo || this.recargaCarinho > 0) return;
    const c = this.companheiro!;
    if (c.estado === 'atacando' || c.estado === 'saindo') return;

    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      const posicao = mao.posicaoMundo();
      if (posicao.distanceTo(c.centro) > DISTANCIA_CARINHO) continue;

      this.recargaCarinho = 6;
      mao.vibrar(0.35, 60);
      audio.clique();
      c.curar(Math.max(1, Math.ceil(c.hpMax * 0.04)));
      c.chamarPara(this.posicaoJogador);
      if (this.exemplarEmCampo) {
        this.dex.definirHp(this.exemplarEmCampo, c.hp);
        this.dex.ganharXp(this.exemplarEmCampo, 3);
      }

      const impacto = new Impacto(c.centro, 0xff9ec4);
      this.cena.add(impacto.pontos);
      this.impactos.push(impacto);

      this.aviso.mostrar(
        [{ texto: `${c.especie.nome} gostou disso`, tamanho: 34, cor: '#ff9ec4' }],
        1.6,
      );
      return;
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

      // O raio de mira aparece na mão livre quando há um painel aberto.
      const raio = this.raios.get(mao.indice);
      if (raio) {
        const apontandoTime = this.painelTime.aberto && mao.lado === 'right';
        const apontandoDex = this.painelDex.aberto && mao.lado === 'left';
        raio.atualizar(dt, apontandoTime || apontandoDex, 0.6);
      }

      // Analógico da direita: vira página da Pokédex quando ela está aberta, e
      // troca de bola quando não está. Um passo por inclinada — só volta a valer
      // depois que o stick passa pelo centro.
      if (mao.lado === 'right') {
        const x = mao.analogicoX();
        if (this.analogicoNeutro && Math.abs(x) > 0.7) {
          this.analogicoNeutro = false;
          if (this.painelDex.aberto) {
            this.painelDex.virarPagina(x > 0 ? 1 : -1);
            audio.clique();
            mao.vibrar(0.2, 20);
          } else {
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

  private atualizarPaineis(dt: number) {
    const esquerda = this.maos.find((m) => m.lado === 'left' && m.conectada);
    const direita = this.maos.find((m) => m.lado === 'right' && m.conectada);

    // --- painel do time, na mão esquerda ---
    const entradas = this.dex.time.map((exemplar) => {
      const especie = porId(exemplar.id)!;
      const emCampo = this.exemplarEmCampo === exemplar && this.companheiro?.viva === true;
      return {
        exemplar,
        especie,
        // Em campo, o HP que vale é o do corpo vivo.
        hp: emCampo ? this.companheiro!.hp : exemplar.hp,
        hpMax: this.dex.hpMaxDe(exemplar),
        nivel: this.dex.nivelDe(exemplar),
        progresso: this.dex.progressoNivel(exemplar),
        shiny: exemplar.shiny,
        emCampo,
      };
    });
    const bolas = BOLAS.map((tipo) => ({ tipo, quantidade: this.dex.bolas(tipo.id) }));
    const itens = ITENS.map((tipo) => ({ tipo, quantidade: this.dex.item(tipo.id) }));
    this.painelTime.definirConteudo(entradas, bolas, itens, this.golpesDoCampo(), this.modo.id);

    const estavaAberto = this.painelTime.aberto;
    this.painelTime.atualizar(
      dt,
      esquerda?.punho ?? null,
      direita ? direita.mira() : null,
      this.dex.bolaAtiva,
      this.camera,
      {
        vistas: this.dex.especiesVistas,
        capturadas: this.dex.especiesCapturadas,
        total: this.dex.totalEspecies,
      },
    );
    if (this.painelTime.aberto && !estavaAberto) audio.abrirPainel();
    if (this.painelTime.mudouDestaque) {
      this.painelTime.mudouDestaque = false;
      audio.clique();
    }

    // --- Pokédex, na mão direita ---
    // Montar o mapa das 151 custa pouco, mas custa todo quadro, e na maior
    // parte do tempo a Pokédex está fechada. `aberto` é o estado do quadro
    // anterior; um quadro de atraso ao abrir ninguém enxerga.
    if (this.painelDex.aberto) {
      const estados = new Map<string, EstadoDex>();
      for (const especie of ESPECIES) {
        const reg = this.dex.de(especie.id);
        if (!reg) continue;
        estados.set(especie.id, {
          visto: reg.vistos > 0,
          capturado: reg.capturados > 0,
          viuShiny: reg.viuShiny,
        });
      }
      this.painelDex.definirEstados(estados);
    }

    const dexEstavaAberta = this.painelDex.aberto;
    this.painelDex.atualizar(
      dt,
      direita?.punho ?? null,
      esquerda ? esquerda.mira() : null,
      this.camera,
    );
    if (this.painelDex.aberto && !dexEstavaAberta) audio.abrirPainel();
    if (this.painelDex.mudouDestaque) {
      this.painelDex.mudouDestaque = false;
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
        pokemon.hpMax,
        pokemon.raiz.position,
        pokemon.altura,
        this.camera,
        pokemon.desmaiado ? `N${pokemon.nivel} · exausto` : `N${pokemon.nivel}`,
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
      const nivel = this.exemplarEmCampo ? this.dex.nivelDe(this.exemplarEmCampo) : c.nivel;
      this.barraCompanheiro.atualizar(
        dt,
        c.raiz.scale.x > 0.5 && c.estado !== 'saindo',
        c.hp,
        c.hpMax,
        c.raiz.position,
        c.altura,
        this.camera,
        c.desmaiado ? `N${nivel} · desmaiado` : `N${nivel} · seu`,
      );
    }

    // Desmaiou em campo: volta para a bola sozinho.
    if (c.desmaiado && c.estado === 'desmaiado' && c.viva) {
      if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, 0);
      c.dissolver();
    }

    if (!c.viva) {
      if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, c.hp);
      this.removerCompanheiro();
    }
  }

  private removerCompanheiro() {
    if (!this.companheiro) return;
    this.companheiro.descartar(this.cena);
    // Sem isto, a XP do próximo selvagem iria para quem já voltou à bola.
    this.exemplarEmCampo = null;
    if (this.barraCompanheiro) {
      this.cena.remove(this.barraCompanheiro.placa.malha);
      this.barraCompanheiro.descartar();
      this.barraCompanheiro = null;
    }
    this.companheiro = null;
  }

  private atualizarBolas(dt: number) {
    for (const bola of [...this.bolas]) {
      const anterior = bola.posicao.clone();
      bola.atualizar(dt);

      // Bola de invocação: abre ao tocar o chão ou após um tempo no ar.
      const exemplar = bola.raiz.userData.invocar as Exemplar | undefined;
      if (exemplar && bola.estado === 'voando' && bola.velocidade.lengthSq() < 0.6) {
        bola.raiz.userData.invocar = undefined;
        void this.invocarNaBola(bola, exemplar);
      }

      if (bola.estado === 'voando' && !exemplar) this.testarAcerto(bola, anterior);

      if (bola.resultado === 'capturou') {
        bola.resultado = null;
        const presa = bola.presa;
        if (presa) {
          this.concluirCaptura(presa);
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

  private concluirCaptura(presa: Pokemon) {
    // A experiência entra antes do registro: quem capturou foi quem estava em
    // campo, e é ele que sobe de nível.
    this.premiarXp(presa, true);

    const novo = this.dex.registrarCaptura(
      presa.especie.id,
      Math.max(1, presa.hp),
      presa.nivel,
      presa.shiny,
    );
    this.dex.premiarCaptura();

    const primeiraVez = (this.dex.de(presa.especie.id)?.capturados ?? 0) === 1;
    const cheio = novo === null;

    this.aviso.mostrar(
      [
        {
          texto: presa.shiny
            ? `${presa.especie.nome} BRILHANTE capturado!`
            : `${presa.especie.nome} capturado!`,
          tamanho: presa.shiny ? 40 : 46,
          cor: presa.shiny ? '#ffd76a' : '#9ff0c4',
        },
        ...(cheio
          ? [{ texto: 'sua caixa está cheia', tamanho: 23, cor: '#ff9f9f', peso: 600 }]
          : primeiraVez
            ? [
                { texto: presa.especie.descricao, tamanho: 21, cor: '#9aa5b8', peso: 400, espaco: 6 },
                { texto: 'já dá para escolher ele no painel', tamanho: 22, cor: '#ffd78a', peso: 600 },
              ]
            : []),
      ],
      primeiraVez || presa.shiny ? 5 : 2.6,
    );
    this.removerSelvagem(presa);
  }

  /** A bola pousou: abre e o Pokémon escolhido entra em campo. */
  private async invocarNaBola(bola: Pokebola, exemplar: Exemplar) {
    const especie = porId(exemplar.id);
    if (!especie) return;

    const gltf = await garantir(especie.id, exemplar.shiny);
    if (!gltf) return;

    // Só um em campo por vez.
    if (this.companheiro?.viva) {
      if (this.exemplarEmCampo) this.dex.definirHp(this.exemplarEmCampo, this.companheiro.hp);
      this.removerCompanheiro();
    }

    const corpo = instanciar(especie.id, especie.altura, exemplar.shiny);
    if (!corpo) return;

    const piso = this.sala.alturaEm(bola.posicao);
    const pokemon = this.porEmCampo(especie, corpo, exemplar, bola.posicao, piso);
    bola.soltar(pokemon);
    audio.invocar();

    this.aviso.mostrar(
      [
        { texto: `${especie.nome}, eu escolho você!`, tamanho: 40, cor: corHexDe(especie) },
        { texto: 'gatilho ataca (ou acerta onde você aponta) · encoste a mão para fazer carinho', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
      3.2,
    );
  }

  /** Monta o companheiro e a barra dele. Usado ao invocar e ao evoluir. */
  private porEmCampo(
    especie: Especie,
    corpo: Corpo,
    exemplar: Exemplar,
    posicao: THREE.Vector3,
    piso: number,
  ): Pokemon {
    const nivel = this.dex.nivelDe(exemplar);
    const pokemon = new Pokemon(
      especie,
      corpo,
      posicao,
      piso,
      'companheiro',
      nivel,
      exemplar.shiny,
    );
    pokemon.hp = Math.max(1, Math.min(exemplar.hp, pokemon.hpMax));
    pokemon.raiz.visible = false;
    this.cena.add(pokemon.raiz);
    this.companheiro = pokemon;
    this.exemplarEmCampo = exemplar;

    this.barraCompanheiro = new BarraVida(
      exemplar.shiny ? `✦ ${especie.nome}` : especie.nome,
      textoTipos(especie),
      TIPOS[especie.tipo].cor,
    );
    this.cena.add(this.barraCompanheiro.placa.malha);

    pokemon.invocar(posicao, piso);
    return pokemon;
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
        // A fruta valia para uma bola só, e essa bola já foi.
        this.bonusFruta = 0;
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
      const ativo = this.dex.exemplarAtivo;
      const vaiInvocar = !this.temCompanheiroEmCampo && ativo !== null && ativo.hp > 0;
      const tipoBola = bolaPorId(this.dex.bolaAtiva) ?? BOLA_PADRAO;
      if (!vaiInvocar && this.dex.bolas(tipoBola.id) <= 0) return;

      const especieAtiva = vaiInvocar ? porId(ativo!.id) : null;
      if (especieAtiva) void garantir(especieAtiva.id, ativo!.shiny);

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
        bola.raiz.userData.multiplicador =
          tipoBola.multiplicador * (this.bonusFruta > 0 ? BONUS_FRUTA : 1);
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

    const exemplar = this.bolaDeInvocacao.get(99);
    if (exemplar) {
      this.bolaDeInvocacao.delete(99);
      bola.raiz.userData.invocar = exemplar;
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
    const atual = time.findIndex((e) => e === this.dex.exemplarAtivo);
    this.escolherDoTime(time[(atual + 1) % time.length]);
  }

  aoEntrarNaSessao() {
    this.proximoSpawn = 3;
    this.aviso.mostrar(
      [
        { texto: 'olhe em volta', tamanho: 42, cor: '#cfe6ff' },
        { texto: 'GRIP segura a pokébola · solte no movimento para arremessar', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'gire o pulso esquerdo: time e modos · o direito: a Pokédex', tamanho: 21, cor: '#9aa5b8', peso: 500 },
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
    this.painelDex.descartar();
    this.aviso.descartar();
    this.sala.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
