import * as THREE from 'three';
import { Pokemon } from './creature';
import {
  ESPECIES,
  NIVEL_MAXIMO,
  TIPOS,
  calcularDano,
  corHexDe,
  corHexDeTipo,
  LIMITE_ESTAGIO,
  aplicarStatus,
  danoRecebido,
  escolherGolpe,
  arsenal,
  golpesDeDano,
  golpesDeStatus,
  intervaloDeAtaque,
  multEstagio,
  textoEstagio,
  evolucaoEm,
  nivelSelvagem,
  pesoSpawn,
  porId,
  chanceShiny,
  sortearShiny,
  textoChanceShiny,
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
import { BOTAO_A, BOTAO_B, MarcaDeDestino, Mao, Mira, RaioMira } from './hands';
import { Luva } from './glove';
import { Aviso, BarraVida, PainelPulso, type Carga } from './hud';
import { Evolucao, PromptEvolucao } from './evolucao';
import type { GestoDeAtaque } from './anima';
import { PainelTime, type EntradaGolpe } from './menu';
import { type Modo } from './modos';
import {
  Ajustes,
  DIFICULDADES,
  INTERRUPTORES,
  type ChaveAjuste,
  type PerfilDificuldade,
} from './ajustes';
import { PainelDex, type EstadoDex } from './dexpanel';
import { EscolhaInicial } from './starter';
import { BOLAS, BOLA_PADRAO, bolaPorId } from './balls';
import { BONUS_FRUTA, ITENS, SEGUNDOS_FRUTA, itemPorId } from './itens';
import { Isca, RastroDeIsca } from './isca';
import { Aura, Efeito, Impacto } from './attacks';
import { Assinatura, assinaturaDe } from './signature';
import { PainelPc } from './pc';
import { calar, falar, preparar, temNarracao } from './voz';
import { Dex, type Exemplar } from './state';
import { audio } from './audio';
import { escolherPesado } from './rng';

/**
 * Quantos selvagens coexistem. Tres, e nao dois, porque agora se ANDA pela
 * casa: com dois, sair da sala deixava o quarto vazio ate o proximo nascer.
 */
/** O gesto de um golpe. Os gerados trazem; os sintéticos caem no padrão. */
const golpeDe = (s: { golpe: Golpe | null }): GestoDeAtaque =>
  s.golpe ? gestoDoGolpe(s.golpe) : 'investida';

const gestoDoGolpe = (golpe: Golpe): GestoDeAtaque =>
  (golpe.animacao as GestoDeAtaque | undefined) ??
  (golpe.categoria === 'status' ? 'aura' : golpe.categoria === 'especial' ? 'sopro' : 'investida');

const MAX_SELVAGENS = 3;
/**
 * Alem disto, o selvagem que ficou para tras vai embora sozinho — e abre vaga
 * para nascer alguem a frente. E o que mantem o numero de modelos na memoria
 * constante por mais que voce caminhe.
 */
const DISTANCIA_DE_SUMICO = 9;
/** Só a bola comum recarrega sozinha; as outras vêm de capturas. */
const RECARGA_BOLA_COMUM = 5;
const ALCANCE_BATALHA = 4.5;
/** Fora de campo, cada Pokémon recupera 1 de HP a cada tanto de segundos. */
const SEGUNDOS_POR_HP = 2.5;
/** Perto o bastante para a mão encostar no companheiro e fazer carinho. */
const DISTANCIA_CARINHO = 0.3;

/**
 * Um selvagem em campo e o relógio do próximo golpe dele.
 *
 * O relógio é POR BICHO, e não um só para todos. Antes havia um único contador
 * no jogo: a cada 2,6 s, um dos selvagens presentes era sorteado e atacava. Isso
 * impedia qualquer aviso — não dava para dizer de quem viria o golpe antes de
 * sortear — e fazia dois selvagens atacarem na metade da frequência de um.
 */
interface Selvagem {
  pokemon: Pokemon;
  barra: BarraVida;
  /** Segundos até o golpe sair. Conta para baixo desde `ciclo`. */
  restante: number;
  /** Duração do ciclo inteiro deste golpe, para a barra saber a fração. */
  ciclo: number;
  /** Os últimos segundos do ciclo: a barra fica vermelha e o corpo recua. */
  aviso: number;
  /** O golpe já escolhido. O nome dele aparece na barra o ciclo todo. */
  golpe: Golpe | null;
  /** Se a animação de recolher já foi disparada neste ciclo. */
  avisou: boolean;
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
  /** Os efeitos exclusivos dos iniciais. Ver src/signature.ts. */
  private assinaturas: Assinatura[] = [];

  private maos: Mao[] = [];
  private miras = new Map<number, Mira>();
  private raios = new Map<number, RaioMira>();
  private bolaNaMao = new Map<number, Pokebola>();
  /** Linha e anel do comando "vá até ali". */
  private marca = new MarcaDeDestino();
  /** A pergunta na tela: deixa evoluir? Fica até ser respondida. */
  private promptEvolucao = new PromptEvolucao();
  private evolucaoPendente: { exemplar: Exemplar; de: Especie; para: Especie } | null = null;
  private evolucaoEmCurso: {
    efeito: Evolucao;
    exemplar: Exemplar;
    de: Especie;
    para: Especie;
    trocou: boolean;
  } | null = null;
  /** A fruta ou o doce na mão, por índice de mão. Ver src/isca.ts. */
  private iscaNaMao = new Map<number, Isca>();
  /** Há quanto tempo a isca está apontada para o mesmo bicho. */
  private miraDaIsca = new Map<number, { alvo: Pokemon; tempo: number }>();
  private rastros = new Map<number, RastroDeIsca>();
  /** Mão do modo sem headset — só para o jogador ver que tem mão. */
  private luvaPlana: Luva | null = null;
  /**
   * A mão que está com o gatilho preso, e desde quando. É a diferença entre
   * tocar o gatilho (atacar) e segurá-lo (marcar para onde ir).
   */
  private gatilhoPreso: { mao: Mao; desde: number; comandou: boolean } | null = null;
  private pontoMarcado: THREE.Vector3 | null = null;
  /** Quando a bola da mão carrega um Pokémon para soltar, e não é de captura. */
  private bolaDeInvocacao = new Map<number, Exemplar>();
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  private aviso: Aviso;
  private painelPulso = new PainelPulso();
  private painelTime = new PainelTime();
  private painelDex = new PainelDex();
  /** O PC: a caixa e a edição da equipe. Abre com o botão Y. */
  private pc = new PainelPc();
  private pulsoAnexado = false;

  /** Existe só até você escolher o parceiro inicial. */
  private escolha: EscolhaInicial | null = null;
  private carregandoEscolha = false;
  /** Trava o analógico para um passo por inclinada. */
  private analogicoNeutro = true;

  private recarga = 0;
  readonly ajustes = new Ajustes();
  private auras: Aura[] = [];
  /** Golpe escolhido à mão no painel. Só o modo Batalha usa. */
  private golpeArmado: string | null = null;
  /** Selvagens que você aceitou encarar, no Safari. */
  private encarados = new Set<Pokemon>();
  private proximoSpawn = 2;
  private tempoLeituraSala = 0;
  private acumuladoCura = 0;
  private posicaoJogador = new THREE.Vector3();

  /** Um nascimento por vez: o modelo é baixado antes de o bicho aparecer. */
  private nascendo = false;
  /** Enquanto durar, a próxima bola vale mais — é a fruta fazendo efeito. */
  private bonusFruta = 0;
  /** Impede que um carinho vire vinte no mesmo segundo. */
  private recargaCarinho = 0;
  /** Quanto tempo seguido a mão está encostada nele. */
  private tempoDeCarinho = 0;

  private modoPlano = false;
  private carregando = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 60);
    this.camera.position.set(0, 1.6, 0);

    this.sala = new Sala(this.cena);
    this.aviso = new Aviso(this.cena);
    this.sala.usarFallback();

    this.cena.add(this.painelTime.grupo, this.painelDex.grupo, this.pc.grupo);
    this.cena.add(this.promptEvolucao.grupo);
    this.pc.definirDex(this.dex);

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
      // A luva é branca nas duas mãos; a faixa do punho é o que distingue uma
      // da outra de relance, sem precisar olhar para os dedos.
      const cor = i === 0 ? 0x7fd4ff : 0xffb27f;

      const mira = new Mira(0xff6b5c);
      this.cena.add(mira.linha);
      this.miras.set(i, mira);

      const raio = new RaioMira();
      mao.alvo.add(raio.linha);
      this.raios.set(i, raio);

      const rastro = new RastroDeIsca();
      this.cena.add(rastro.pontos);
      this.rastros.set(i, rastro);

      // A luva só pode ser montada quando o lado da mão for conhecido — ela é
      // espelhada, e o evento `connected` é quem diz qual é qual.
      mao.alvo.addEventListener('connected', () => mao.vestirLuva(cor));

      // GRIP segura e arremessa a pokébola.
      mao.alvo.addEventListener('squeezestart', () => this.pegarBola(mao));
      mao.alvo.addEventListener('squeezeend', () => this.arremessarBola(mao));
      // GATILHO: um toque comanda o ataque; segurar traça o caminho no chão.
      mao.alvo.addEventListener('selectstart', () => this.gatilhoDesceu(mao));
      mao.alvo.addEventListener('selectend', () => this.gatilhoSubiu(mao));

      this.cena.add(mao.alvo, mao.punho, mao.rastreada);
      this.maos.push(mao);
    }

    this.cena.add(this.marca.grupo);
  }

  ativarModoPlano() {
    this.modoPlano = true;
    const luva = new Luva('right', 0xff6b5c);
    luva.grupo.position.set(0.16, -0.14, -0.28);
    luva.grupo.rotation.set(-0.3, 0.2, 0);
    this.camera.add(luva.grupo);
    this.cena.add(this.camera);
    this.luvaPlana = luva;
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
          // GRIP pega o item PARA A MÃO; o gatilho é que usa na hora. A fruta e
          // o doce servem de isca, e isca é uma coisa que se segura — pegar com
          // a mão e usar de longe não podiam ser o mesmo gesto.
          const id = alcancado.entrada.tipo.id;
          if (id === 'fruta' || id === 'doce') this.pegarIsca(mao, id);
          else this.usarItem(id);
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
        if (alcancado.tipo === 'engrenagem') {
          this.abrirAjustes();
          return;
        }
        if (alcancado.tipo === 'dificuldade') {
          this.escolherDificuldade(alcancado.entrada);
          return;
        }
        if (alcancado.tipo === 'interruptor') {
          this.alternarInterruptor(alcancado.entrada.id);
          return;
        }
        if (alcancado.tipo !== 'criatura') return;
        // Pegou a bola de um Pokémon do time: ele vira o ativo e a bola DELE
        // já nasce na mão, pronta para o arremesso.
        if (!this.escolherDoTime(alcancado.entrada.exemplar)) return;
        this.tirarBolaDaCinta(mao);
        return;
      }
    }

    this.tirarBolaDaCinta(mao);
  }

  // ------------------------------------------------------------ isca

  /**
   * Põe a fruta (ou o doce) na mão. Enquanto estiver ali, apontar para um
   * selvagem chama ele.
   *
   * O item só é GASTO quando alguém vem — apontar para o vazio não custa nada.
   * Isso importa porque o gesto é de mira, e mira erra: cobrar por uma fruta
   * que não atraiu ninguém faria o jogador parar de tentar.
   */
  private pegarIsca(mao: Mao, id: string) {
    const tipo = itemPorId(id);
    if (!tipo) return;

    if (this.dex.item(id) <= 0) {
      audio.recusa();
      this.aviso.mostrar(
        [
          { texto: `sem ${tipo.nome}`, tamanho: 36, cor: '#ff9f9f' },
          { texto: 'itens caem quando você captura', tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        2,
      );
      return;
    }

    this.guardarIsca(mao);
    // Uma bola e uma isca não cabem na mesma mão.
    const bola = this.bolaNaMao.get(mao.indice);
    if (bola) {
      this.bolaNaMao.delete(mao.indice);
      this.bolaDeInvocacao.delete(mao.indice);
      mao.segurando = false;
      bola.descartar(this.cena);
      const i = this.bolas.indexOf(bola);
      if (i !== -1) this.bolas.splice(i, 1);
    }

    const isca = new Isca(tipo);
    // Sem headset a luva mora na camera, e e nela que a isca precisa ficar.
    (this.modoPlano && this.luvaPlana ? this.luvaPlana.grupo : mao.punho).add(isca.grupo);
    this.iscaNaMao.set(mao.indice, isca);
    mao.vibrar(0.3, 35);
    audio.tilintar();

    this.aviso.mostrar(
      [
        { texto: `${tipo.nome} na mão`, tamanho: 38, cor: `#${new THREE.Color(tipo.cor).getHexString()}` },
        { texto: 'aponte para um selvagem e segure — ele vem até você', tamanho: 22, cor: '#9aa5b8', peso: 500 },
      ],
      3,
    );
  }

  private guardarIsca(mao: Mao) {
    const isca = this.iscaNaMao.get(mao.indice);
    if (!isca) return;
    isca.descartar();
    this.iscaNaMao.delete(mao.indice);
    this.miraDaIsca.delete(mao.indice);
  }

  /**
   * O selvagem para quem a isca está apontada.
   *
   * O alcance é um CONE, não um cilindro: a tolerância cresce com a distância,
   * porque mirar com o braço estendido num bicho a seis metros não tem a mesma
   * precisão que mirar num a um metro, e exigir a mesma faria a isca só
   * funcionar de perto — justamente onde ela não é necessária.
   */
  private alvoDaIsca(mao: Mao, alcance: number): Pokemon | null {
    const { origem, direcao } = this.modoPlano ? this.miraDaCamera() : mao.mira();
    let melhor: Pokemon | null = null;
    let menorDesvio = Infinity;

    for (const { pokemon } of this.selvagens) {
      if (!pokemon.viva || pokemon.desmaiado) continue;
      if (pokemon.estado === 'preso' || pokemon.estado === 'saindo') continue;

      const paraEle = pokemon.centro.clone().sub(origem);
      const aoLongo = paraEle.dot(direcao);
      if (aoLongo <= 0.15 || aoLongo > alcance) continue;

      const desvio = paraEle.addScaledVector(direcao, -aoLongo).length();
      const tolerancia = pokemon.raio + 0.2 + aoLongo * 0.16;
      if (desvio > tolerancia) continue;

      // Entre dois na mira, o mais centrado ganha — não o mais perto.
      const relativo = desvio / tolerancia;
      if (relativo < menorDesvio) {
        menorDesvio = relativo;
        melhor = pokemon;
      }
    }
    return melhor;
  }

  /**
   * A isca funcionando: mirar por um instante e o bicho vem.
   *
   * O instante existe para separar mira de passagem: o braço varre a sala o
   * tempo todo, e chamar no primeiro quadro em que o raio cruza um Pokémon
   * chamaria todos eles sem você ter pedido nada.
   */
  private atualizarIscas(dt: number) {
    for (const mao of this.maos) {
      const isca = this.iscaNaMao.get(mao.indice);
      const rastro = this.rastros.get(mao.indice);

      if (!isca || (!mao.conectada && !this.modoPlano)) {
        this.miraDaIsca.delete(mao.indice);
        rastro?.atualizar(dt, null, null, 0);
        continue;
      }

      // O doce é raro e chama de bem mais longe; a fruta é o pão de cada dia.
      const doce = isca.tipo.id === 'doce';
      const alvo = this.alvoDaIsca(mao, doce ? 9 : 5.5);

      const anterior = this.miraDaIsca.get(mao.indice);
      const acumulado = anterior && anterior.alvo === alvo ? anterior.tempo + dt : 0;
      if (alvo) this.miraDaIsca.set(mao.indice, { alvo, tempo: acumulado });
      else this.miraDaIsca.delete(mao.indice);

      const espera = 0.6;
      isca.atualizar(dt, alvo !== null);

      const deIsca = alvo ? isca.grupo.getWorldPosition(new THREE.Vector3()) : null;
      rastro?.atualizar(dt, deIsca, alvo ? alvo.centro : null, acumulado / espera);

      if (!alvo || acumulado < espera) continue;

      this.chamarComIsca(mao, isca, alvo);
    }
  }

  private chamarComIsca(mao: Mao, isca: Isca, alvo: Pokemon) {
    const tipo = isca.tipo;
    if (!this.dex.gastarItem(tipo.id)) {
      this.guardarIsca(mao);
      audio.recusa();
      return;
    }

    alvo.atrairPara(this.posicaoJogador, tipo.id === 'doce' ? 22 : 14);
    if (tipo.id === 'doce') {
      // Doce Raro não se recusa: ele chega manso.
      alvo.acalmar(1);
    } else {
      alvo.acalmar(0.6);
      // A fruta continua valendo o que sempre valeu para a próxima bola. É o
      // que faz atrair e capturar serem um movimento só.
      this.bonusFruta = SEGUNDOS_FRUTA;
    }

    audio.chamado();
    audio.grito(alvo.especie.id, alvo.shiny, alvo.especie.num);
    mao.vibrar(0.7, 90);

    const brilho = new Impacto(alvo.centro, tipo.cor);
    this.cena.add(brilho.pontos);
    this.impactos.push(brilho);

    this.aviso.mostrar(
      [
        { texto: `${alvo.especie.nome} está vindo!`, tamanho: 40, cor: corHexDe(alvo.especie) },
        {
          texto: alvo.flutua ? 'ele vem flutuando até você' : 'ele vem andando até você',
          tamanho: 23,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2.8,
    );

    this.guardarIsca(mao);
  }

  /**
   * Materializa uma pokébola na mão: a do Pokémon ativo, se houver um esperando
   * para entrar, ou uma bola de captura do tipo escolhido.
   */
  private tirarBolaDaCinta(mao: Mao) {
    if (this.bolaNaMao.has(mao.indice)) return;
    // Pegar a bola guarda a isca: você não arremessa com a fruta na mão.
    this.guardarIsca(mao);

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

  /**
   * O gatilho desceu.
   *
   * Um comando que precisa ser SEGURADO não pode resolver nada agora: o que
   * acontece depende de quanto tempo o dedo ficar embaixo. Então aqui só se
   * anota; quem decide é `gatilhoSubiu`.
   *
   * A exceção são os painéis e a escolha do inicial, que são menus: num menu,
   * esperar o dedo subir para confirmar parece atraso, não intenção.
   */
  private gatilhoDesceu(mao: Mao) {
    if (this.escolha || this.painelTime.aberto || this.painelDex.aberto || this.pc.aberto) {
      this.puxarGatilho(mao);
      return;
    }
    this.gatilhoPreso = { mao, desde: performance.now(), comandou: false };
  }

  private gatilhoSubiu(mao: Mao) {
    const preso = this.gatilhoPreso;
    this.gatilhoPreso = null;
    if (!preso || preso.mao !== mao) return;

    // Soltar depois de ter marcado um ponto: ele vai até lá. O caminho já
    // estava desenhado no chão desde que o dedo ficou embaixo.
    if (preso.comandou && this.pontoMarcado && this.temCompanheiroEmCampo) {
      const destino = this.pontoMarcado.clone();
      this.pontoMarcado = null;
      this.companheiro!.irPara(destino);
      mao.vibrar(0.6, 70);
      audio.comando();
      this.aviso.mostrar(
        [
          { texto: `${this.companheiro!.especie.nome} está indo`, tamanho: 34, cor: '#7fe7c4' },
        ],
        1.4,
      );
      return;
    }

    this.pontoMarcado = null;
    this.puxarGatilho(mao);
  }

  /**
   * Enquanto o gatilho estiver preso, a marca acompanha a mão pelo chão.
   *
   * Ela só nasce depois de um tempinho de dedo embaixo — sem essa carência todo
   * ataque piscaria uma linha verde no chão antes de sair.
   */
  private atualizarMarca(dt: number) {
    const preso = this.gatilhoPreso;
    let mostrar = false;

    if (preso && this.temCompanheiroEmCampo) {
      const segurando = (performance.now() - preso.desde) / 1000;
      if (segurando > 0.28) {
        const { origem, direcao } = this.modoPlano ? this.miraDaCamera() : preso.mao.mira();
        const ponto = this.pontoNoChao(origem, direcao);
        if (ponto) {
          if (!preso.comandou) {
            preso.comandou = true;
            preso.mao.vibrar(0.25, 25);
          }
          this.pontoMarcado = ponto;
          mostrar = true;
        }
      }
    }

    const de = mostrar && this.companheiro ? this.companheiro.raiz.position : null;
    this.marca.atualizar(dt, mostrar, de, this.pontoMarcado, this.sala.pisoY);
  }

  /**
   * Onde o raio da mão encontra o chão. Sem plano detectado o chão é o plano
   * y = pisoY, que é o que a sala usa de qualquer jeito quando não há leitura.
   */
  private pontoNoChao(origem: THREE.Vector3, direcao: THREE.Vector3): THREE.Vector3 | null {
    // Apontando para cima ou na horizontal não há chão que se encontre.
    if (direcao.y > -0.05) return null;

    // Primeiro contra as superfícies que o mapa conhece: é assim que apontar
    // para a mesa manda ele PARA A MESA, e não para o chão atrás dela.
    const alvo = this.sala.apontar(origem, direcao);
    if (alvo) return alvo.ponto;

    // Nada mapeado naquela direção: o plano do chão serve de último recurso.
    const piso = this.sala.pisoY;
    const t = (piso - origem.y) / direcao.y;
    if (t <= 0 || t > 8) return null;
    return origem.clone().addScaledVector(direcao, t).setY(piso);
  }

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

    // PC aberto: ele toma o gatilho para si, porque pegar e soltar bicho na
    // caixa é a única coisa que se está fazendo com ele aberto.
    if (this.pc.aberto && this.pc.temAlvo) {
      this.acionarPc(mao);
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
      else if (selecao.tipo === 'engrenagem') this.abrirAjustes();
      else if (selecao.tipo === 'dificuldade') this.escolherDificuldade(selecao.entrada);
      else if (selecao.tipo === 'interruptor') this.alternarInterruptor(selecao.entrada.id);
      else this.usarItem(selecao.entrada.tipo.id);
      return;
    }

    // Pokédex aberta: o gatilho manda a ficha ser LIDA EM VOZ ALTA.
    if (this.painelDex.aberto) {
      this.narrarDaDex(mao);
      return;
    }

    // Sem painel: manda o companheiro atacar.
    this.comandarAtaque(mao);
  }

  /**
   * A Pokédex falando, em português.
   *
   * Só os quatro iniciais têm ficha gravada — são cerca de meio minuto de voz
   * cada uma, e gravar as 151 seriam trinta megabytes de MP3 num pacote que
   * hoje tem cinquenta e quatro de modelo. Quem não tem ganha a voz do próprio
   * bicho, que é uma resposta e não um silêncio.
   */
  private narrarDaDex(mao: Mao) {
    const especie = this.painelDex.selecionada;
    if (!especie) return;

    mao.vibrar(0.3, 30);

    if (!this.ajustes.vozDaDex) {
      this.aviso.mostrar(
        [
          { texto: especie.nome, tamanho: 40, cor: corHexDe(especie) },
          { texto: 'a voz está desligada nos ajustes', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    if (!temNarracao(especie.id)) {
      audio.grito(especie.id, false, especie.num);
      this.aviso.mostrar(
        [
          { texto: especie.nome, tamanho: 40, cor: corHexDe(especie) },
          { texto: 'ainda sem ficha falada', tamanho: 22, cor: '#9aa5b8', peso: 500 },
        ],
        1.6,
      );
      return;
    }

    void falar(especie.id).then((tocou) => {
      if (!tocou) return;
      this.aviso.mostrar(
        [
          { texto: especie.nome, tamanho: 40, cor: corHexDe(especie) },
          { texto: 'gatilho de novo para calar', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        ],
        2.4,
      );
    });
  }

  /** O gatilho dentro do PC: pega, larga, troca, cura ou fecha. */
  private acionarPc(mao: Mao) {
    const feito = this.pc.acionar();
    if (!feito) return;
    mao.vibrar(feito === 'trocou' || feito === 'moveu' ? 0.55 : 0.3, 45);

    switch (feito) {
      case 'pegou':
      case 'largou':
      case 'pagina':
        audio.clique();
        break;
      case 'curou':
        audio.sucesso();
        this.aviso.mostrar(
          [{ texto: 'equipe recuperada', tamanho: 38, cor: '#7fe7c4' }],
          1.8,
        );
        break;
      case 'fechou':
        audio.recolher();
        break;
      default: {
        audio.abrirPainel();
        // Mexer na equipe com alguém em campo é ambíguo: o bicho lá fora pode
        // já nem estar mais no time. Recolher resolve sem perguntar nada.
        if (this.temCompanheiroEmCampo) this.recolherCompanheiro();
        break;
      }
    }
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
    if (!this.temCompanheiroEmCampo) return [];
    const golpes = arsenal(this.companheiro!);
    // Sem nada armado, o primeiro golpe é o que vai sair — então ele aparece
    // armado, e o painel nunca mostra uma escolha que não corresponde ao que o
    // gatilho faria.
    const armado = this.golpeArmado ?? golpes[0]?.nome ?? null;
    return golpes.map((golpe) => ({ golpe, armado: golpe.nome === armado }));
  }

  // ------------------------------------------------------------ ajustes

  /** A engrenagem: um toque abre a página de ajustes, outro fecha. */
  private abrirAjustes() {
    const aberto = this.painelTime.alternarAjustes();
    audio.abrirPainel();
    if (!aberto) return;
    this.aviso.mostrar(
      [
        { texto: 'ajustes', tamanho: 40, cor: '#9fe0ff' },
        {
          texto: 'modo de jogo, dificuldade e o que aparece na tela',
          tamanho: 22,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2.4,
    );
  }

  private escolherDificuldade(perfil: PerfilDificuldade) {
    if (perfil.id === this.ajustes.dificuldade) return;
    this.ajustes.definirDificuldade(perfil.id);
    audio.clique();
    this.aviso.mostrar(
      [
        { texto: perfil.nome, tamanho: 42, cor: perfil.cor },
        { texto: perfil.resumo, tamanho: 23, cor: '#9aa5b8', peso: 500 },
        {
          texto: `aviso de ${perfil.avisoSegundos.toFixed(1).replace('.', ',')} s antes do golpe`,
          tamanho: 21,
          cor: '#ffd78a',
          peso: 600,
        },
      ],
      3,
    );
  }

  private alternarInterruptor(id: ChaveAjuste) {
    const ligado = this.ajustes.alternar(id);
    audio.clique();

    // Dois deles mexem no mundo na hora, e não só no que aparece escrito.
    if (id === 'contornoDaSala' && this.sala.debugLigado !== ligado) this.sala.alternarDebug();
    if (id === 'vozDaDex' && !ligado) calar();

    const tipo = INTERRUPTORES.find((c) => c.id === id);
    this.aviso.mostrar(
      [
        { texto: tipo?.nome ?? 'ajuste', tamanho: 36, cor: ligado ? '#7fe7c4' : '#9aa5b8' },
        {
          texto: ligado ? (tipo?.ligadoDiz ?? 'ligado') : (tipo?.desligadoDiz ?? 'desligado'),
          tamanho: 22,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      2,
    );
  }

  private escolherModo(modo: Modo) {
    if (modo.id === this.ajustes.modo) return;
    this.ajustes.definirModo(modo.id);
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
    const golpe = entrada.golpe;
    this.golpeArmado = golpe.nome;
    audio.clique();

    const categoria =
      golpe.categoria === 'status'
        ? (golpe.resumo ?? 'muda os stats')
        : golpe.categoria === 'fisico'
          ? `físico · potência ${golpe.potencia}`
          : `especial · potência ${golpe.potencia}`;

    this.aviso.mostrar(
      [
        {
          texto: golpe.nome,
          tamanho: 42,
          cor: golpe.categoria === 'status' ? '#c8b5ff' : corHexDeTipo(golpe.tipo),
        },
        { texto: categoria, tamanho: 23, cor: '#9aa5b8', peso: 500 },
        { texto: 'é este que sai no próximo gatilho', tamanho: 21, cor: '#ffd78a', peso: 600 },
      ],
      2.2,
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
    // Buff e debuff sao da BRIGA, nao do bicho: voltar para a bola limpa tudo.
    this.companheiro.limparEstagios();
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

    // O golpe armado no painel é o que sai, em qualquer modo. Antes isso era
    // privilégio do modo Batalha e nos outros o jogo escolhia sozinho — o que
    // tirava do jogador exatamente a decisão que torna a briga uma briga.
    const golpe = this.golpeDoCampo() ?? escolherGolpe(companheiro, alvo);

    // No Safari, mandar atacar é o que transforma um encontro em briga: daí em
    // diante aquele selvagem revida.
    this.encarados.add(alvo);

    if (golpe.categoria === 'status') {
      mao.vibrar(0.45, 60);
      companheiro.marcarRecarga(this.recargaComVelocidade(companheiro, golpe));
      this.usarStatus(companheiro, alvo, golpe);
      return;
    }

    if (companheiro.atacar(alvo, this.recargaComVelocidade(companheiro, golpe), gestoDoGolpe(golpe))) {
      mao.vibrar(0.7, 70);
      this.dispararGolpe(companheiro, alvo, golpe);
    }
  }

  /** O golpe que está armado no painel, se ele ainda pertence a quem está em campo. */
  private golpeDoCampo(): Golpe | null {
    if (!this.temCompanheiroEmCampo) return null;
    return arsenal(this.companheiro!).find((g) => g.nome === this.golpeArmado) ?? null;
  }

  /**
   * A recarga do golpe, encurtada pela velocidade.
   *
   * É o que faz `Arranque` e `Entorpecer` valerem alguma coisa do seu lado: um
   * buff de velocidade não muda o dano, muda de quanto em quanto tempo você
   * pode mandar o próximo.
   */
  private recargaComVelocidade(quem: Pokemon, golpe: Golpe): number {
    return golpe.recarga / multEstagio(quem.estagios.velocidade);
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

    // Contra o nada, um golpe de status nao teria o que mostrar: entao aqui
    // vale o armado so quando ele causa dano.
    const armado = this.golpeDoCampo();
    const golpe =
      armado && armado.categoria !== 'status'
        ? armado
        : (golpesDeDano(arsenal(companheiro))[0] ?? arsenal(companheiro)[0]);

    if (!companheiro.atacarPonto(ponto, golpe.recarga, gestoDoGolpe(golpe))) return;
    mao.vibrar(0.55, 60);

    const efeito = new Efeito(golpe, companheiro.boca, ponto);
    efeito.adicionarA(this.cena);
    this.efeitos.push(efeito);
    this.talvezAssinatura(companheiro, golpe, ponto);
    audio.golpe(golpe.tipo);
    audio.grito(companheiro.especie.id, companheiro.shiny, companheiro.especie.num);

    window.setTimeout(() => {
      const impacto = new Impacto(ponto, TIPOS[golpe.tipo].cor);
      this.cena.add(impacto.pontos);
      this.impactos.push(impacto);
    }, efeito.momentoImpacto * 1000);
  }

  /**
   * O efeito de assinatura, quando o atacante é um dos iniciais e o golpe é o
   * principal dele. Fora isso não faz nada — o efeito comum já saiu.
   */
  private talvezAssinatura(atacante: Pokemon, golpe: Golpe, destino: THREE.Vector3) {
    const id = assinaturaDe(atacante.especie.id, golpe.tipo);
    if (!id) return;
    const assinatura = new Assinatura(id, atacante.boca, destino);
    assinatura.adicionarA(this.cena);
    this.assinaturas.push(assinatura);
  }

  /** Cria o efeito visual e agenda o dano para o momento do impacto. */
  private dispararGolpe(atacante: Pokemon, defensor: Pokemon, golpe: Golpe) {
    const efeito = new Efeito(golpe, atacante.boca, defensor.centro);
    efeito.adicionarA(this.cena);
    this.efeitos.push(efeito);
    this.talvezAssinatura(atacante, golpe, defensor.centro);
    audio.golpe(golpe.tipo);
    audio.grito(atacante.especie.id, atacante.shiny, atacante.especie.num);

    // O dano cai junto com o impacto do efeito, não no instante do comando.
    const atraso = efeito.momentoImpacto * 1000;
    window.setTimeout(() => {
      if (!atacante.viva || !defensor.viva || defensor.estado === 'preso') return;
      this.resolverDano(atacante, defensor, golpe);
    }, atraso);
  }

  private resolverDano(atacante: Pokemon, defensor: Pokemon, golpe: Golpe) {
    const rolagem = calcularDano(atacante, defensor, golpe);
    const { efetividade, critico } = rolagem;
    let dano = rolagem.dano;

    // O teto e a dificuldade valem só do lado de cá. Ver TETO_DANO_RECEBIDO em
    // src/species.ts: um teto para os dois achataria a tabela de tipos, e o que
    // precisava de piso de reação era o golpe que CHEGA em você.
    if (defensor.papel === 'companheiro') {
      dano = danoRecebido(dano, defensor.hpMax, this.ajustes.perfil.danoRecebido);
    }
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
      audio.grito(defensor.especie.id, defensor.shiny, defensor.especie.num);
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
  /** Este selvagem está em condição de brigar com quem está em campo agora? */
  private podeRevidar(pokemon: Pokemon): boolean {
    if (!this.temCompanheiroEmCampo) return false;
    return (
      pokemon.viva &&
      !pokemon.desmaiado &&
      pokemon.estado !== 'preso' &&
      pokemon.estado !== 'saindo' &&
      pokemon.estado !== 'surgindo' &&
      // Quem revida: no Batalha, todo mundo; no Safari, só quem você já
      // mandou atacar. É o que torna encarar uma escolha em vez de uma
      // emboscada.
      (this.ajustes.modoAtual.selvagemRevida || this.encarados.has(pokemon)) &&
      pokemon.raiz.position.distanceTo(this.companheiro!.raiz.position) < ALCANCE_BATALHA
    );
  }

  /**
   * Marca o próximo golpe deste selvagem e começa a contagem.
   *
   * O golpe é escolhido AGORA, no início do ciclo, e não na hora de disparar.
   * É o que permite a barra dizer o nome dele durante a espera inteira — e
   * saber que vem um Lança-Chamas daqui a três segundos é uma informação
   * completamente diferente de descobrir que veio um.
   */
  private agendarGolpe(selvagem: Selvagem) {
    const alvo = this.companheiro;
    const pokemon = selvagem.pokemon;
    if (!alvo) return;

    // De vez em quando ele usa status em vez de bater. Pouco: o selvagem que
    // passa a briga se buffando não é divertido, mas um que nunca faz isso não
    // ensina que a jogada existe.
    const status = golpesDeStatus(arsenal(pokemon));
    const usaStatus =
      status.length > 0 && Math.random() < 0.18 && this.temEspacoDeEstagio(pokemon, alvo, status[0]);

    selvagem.golpe = usaStatus ? status[0] : escolherGolpe(pokemon, alvo);
    selvagem.aviso = this.ajustes.perfil.avisoSegundos;
    selvagem.ciclo = intervaloDeAtaque(pokemon) + selvagem.aviso;
    selvagem.restante = selvagem.ciclo;
    selvagem.avisou = false;
  }

  /** Um debuff que já está no fundo do poço não vale a vez de ninguém. */
  private temEspacoDeEstagio(usuario: Pokemon, alvo: Pokemon, golpe: Golpe): boolean {
    const efeito = golpe.efeito;
    if (!efeito) return false;
    const destino = efeito.alvo === 'proprio' ? usuario : alvo;
    const atual = destino.estagios[efeito.stat];
    return Math.abs(atual + efeito.estagios) <= LIMITE_ESTAGIO;
  }

  /**
   * A cadência do inimigo, com aviso.
   *
   * Esta função é a resposta direta ao "não dá nem tempo para reação": o golpe
   * não sai mais de surpresa. Ele é escolhido, anunciado na barra sobre a
   * cabeça do bicho, e só então disparado — com um recuo visível no corpo nos
   * últimos instantes. Quanto dura esse aviso é o que a dificuldade controla.
   */
  private atualizarAtaqueSelvagem(dt: number) {
    for (const selvagem of this.selvagens) {
      if (!this.podeRevidar(selvagem.pokemon)) {
        // Fora de combate o relógio para e some da barra: uma contagem correndo
        // num bicho que não vai atacar é um susto de graça.
        selvagem.golpe = null;
        selvagem.restante = 0;
        continue;
      }

      if (!selvagem.golpe) {
        this.agendarGolpe(selvagem);
        continue;
      }

      selvagem.restante -= dt;

      // Entrou na reta final: o corpo recua, e o recuo dura exatamente o aviso.
      if (!selvagem.avisou && selvagem.restante <= selvagem.aviso) {
        selvagem.avisou = true;
        // O aviso JÁ É o recolhimento do golpe que vem: o gesto é o do golpe
        // agendado, esticado para durar exatamente o tempo do aviso.
        selvagem.pokemon.animador.disparar(golpeDe(selvagem), selvagem.aviso + 0.35);
        audio.carregando();
      }

      if (selvagem.restante > 0) continue;

      const golpe = selvagem.golpe;
      const companheiro = this.companheiro!;
      if (golpe.categoria === 'status') {
        this.usarStatus(selvagem.pokemon, companheiro, golpe);
      } else if (selvagem.pokemon.atacar(companheiro, golpe.recarga, gestoDoGolpe(golpe))) {
        this.dispararGolpe(selvagem.pokemon, companheiro, golpe);
      }
      this.agendarGolpe(selvagem);
    }
  }

  /**
   * Um golpe de status: nada de dano, um estágio a mais ou a menos.
   *
   * Vale para os dois lados — é o mesmo código quando você escolhe "Escudo" e
   * quando o selvagem resolve baixar o seu ataque.
   */
  private usarStatus(usuario: Pokemon, oponente: Pokemon, golpe: Golpe) {
    const efeito = golpe.efeito;
    if (!efeito) return;

    const destino = efeito.alvo === 'proprio' ? usuario : oponente;
    usuario.animador.disparar(gestoDoGolpe(golpe), 0.7);
    audio.golpeDeStatus(efeito.estagios >= 0);

    const novo = aplicarStatus(destino.estagios, efeito);
    const aura = new Aura(
      destino.raiz.position.clone(),
      destino.raio * 1.3,
      efeito.estagios,
    );
    aura.adicionarA(this.cena);
    this.auras.push(aura);

    const nomeStat =
      efeito.stat === 'ataque' ? 'ataque' : efeito.stat === 'defesa' ? 'defesa' : 'velocidade';

    if (novo === null) {
      this.aviso.mostrar(
        [
          { texto: `${usuario.especie.nome} usou ${golpe.nome}`, tamanho: 32, cor: '#cfe6ff' },
          { texto: `a ${nomeStat} não muda mais`, tamanho: 24, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    const subiu = efeito.estagios > 0;
    this.aviso.mostrar(
      [
        { texto: `${usuario.especie.nome} usou ${golpe.nome}!`, tamanho: 34, cor: '#cfe6ff' },
        {
          texto: `${nomeStat} de ${destino.especie.nome} ${subiu ? 'subiu' : 'caiu'} (${textoEstagio(novo)})`,
          tamanho: 26,
          cor: subiu ? '#9ff0c4' : '#ffb1b1',
          peso: 600,
        },
      ],
      2.2,
    );
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
  /**
   * Descobre se dá para evoluir e PERGUNTA.
   *
   * Evoluir deixou de ser automático. No jogo original é uma decisão — a única
   * irreversível que existe —, e quem quer manter o Pikachu Pikachu tem o
   * direito de manter. Então aqui só se marca a pendência; quem responde é o
   * botão A (ou B, para adiar até o próximo nível).
   *
   * Também roda ao entrar em campo, e não só ao subir de nível: um Pokémon
   * capturado já acima do nível de evolução nunca subia de nível na sua mão, e
   * por isso nunca evoluía. Esse era o buraco.
   */
  private conferirEvolucao(exemplar: Exemplar) {
    if (this.evolucaoPendente || this.evolucaoEmCurso) return;
    const atual = porId(exemplar.id);
    if (!atual) return;

    const nivel = this.dex.nivelDe(exemplar);
    const evoluida = evolucaoEm(atual, nivel);
    if (!evoluida) return;
    // Disse "agora não" neste nível: não se pergunta de novo até ele subir.
    if ((exemplar.recusouEvoluirEm ?? -1) >= nivel) return;

    // Só evolui quem está em campo: a transformação é a cena, e ela não pode
    // acontecer dentro da bola onde ninguém vê.
    if (this.exemplarEmCampo !== exemplar || !this.companheiro?.viva) return;

    this.evolucaoPendente = { exemplar, de: atual, para: evoluida };
    // O modelo novo começa a baixar agora: quando você apertar A, ele já chegou.
    void garantir(evoluida.id, exemplar.shiny);
    audio.evoluindo();
    this.companheiro.comemorar();
  }

  /** Botão A no pedido: a transformação começa. */
  private permitirEvolucao() {
    const pendente = this.evolucaoPendente;
    if (!pendente || this.evolucaoEmCurso) return;
    if (this.exemplarEmCampo !== pendente.exemplar || !this.companheiro?.viva) {
      this.evolucaoPendente = null;
      return;
    }

    this.evolucaoPendente = null;
    this.evolucaoEmCurso = {
      efeito: new Evolucao(this.companheiro, this.cena),
      exemplar: pendente.exemplar,
      de: pendente.de,
      para: pendente.para,
      trocou: false,
    };
    audio.evoluir();
    for (const mao of this.maos) mao.vibrar(0.5, 120);
  }

  /** Botão B: fica como está, e não se pergunta de novo até o próximo nível. */
  private recusarEvolucao() {
    const pendente = this.evolucaoPendente;
    if (!pendente) return;
    this.evolucaoPendente = null;
    this.dex.adiarEvolucao(pendente.exemplar);
    audio.recusa();
    this.aviso.mostrar(
      [
        { texto: `${pendente.de.nome} continua ${pendente.de.nome}`, tamanho: 34, cor: '#cfe6ff' },
        { texto: 'dá para deixar evoluir no próximo nível', tamanho: 22, cor: '#9aa5b8', peso: 500 },
      ],
      2.6,
    );
  }

  /**
   * O efeito rodando, quadro a quadro.
   *
   * O corpo é trocado no ESTOURO do branco, e não antes nem depois: é o único
   * instante em que a silhueta não se vê, e é por isso que a troca não parece
   * um corte.
   */
  private atualizarEvolucao(dt: number) {
    const curso = this.evolucaoEmCurso;
    if (!curso) return;

    const fase = curso.efeito.atualizar(dt);

    if (fase === 'trocar' && !curso.trocou) {
      curso.trocou = true;
      this.trocarCorpoDaEvolucao(curso);
      return;
    }

    if (fase !== 'terminou') return;

    curso.efeito.descartar(this.cena);
    this.evolucaoEmCurso = null;
    this.companheiro?.comemorar();
    audio.sucesso();
    audio.grito(curso.para.id, curso.exemplar.shiny, curso.para.num);

    this.aviso.mostrar(
      [
        { texto: `${curso.de.nome} evoluiu!`, tamanho: 34, cor: '#cfe6ff' },
        { texto: `agora é ${curso.para.nome}`, tamanho: 46, cor: corHexDe(curso.para) },
        { texto: curso.para.descricao, tamanho: 20, cor: '#9aa5b8', peso: 400, espaco: 6 },
      ],
      5,
    );
  }

  private trocarCorpoDaEvolucao(curso: NonNullable<Jogo['evolucaoEmCurso']>) {
    const antigo = this.companheiro;
    if (!antigo) {
      curso.efeito.descartar(this.cena);
      this.evolucaoEmCurso = null;
      return;
    }

    const posicao = antigo.raiz.position.clone();
    const piso = antigo.pisoY;
    const hp = antigo.hp;

    this.dex.evoluir(curso.exemplar, curso.para.id);

    const corpo = instanciar(curso.para.id, curso.para.altura, curso.exemplar.shiny);
    if (!corpo) {
      // O modelo não chegou: a espécie já trocou nos dados, e o corpo entra no
      // próximo quadro pelo caminho normal. Melhor do que travar no branco.
      curso.efeito.descartar(this.cena);
      this.evolucaoEmCurso = null;
      this.removerCompanheiro();
      return;
    }

    this.removerCompanheiro();
    const novo = this.porEmCampo(curso.para, corpo, curso.exemplar, posicao, piso);
    // A vida atravessa a evolução em proporção — `Dex.evoluir` já fez a conta.
    novo.hp = Math.max(1, Math.min(this.dex.hpMaxDe(curso.exemplar), hp));
    // Ele nasce já no tamanho: o "surgindo" normal faria o bicho brotar do chão
    // logo depois do clarão, e a evolução não é uma invocação.
    novo.raiz.visible = true;
    novo.raiz.scale.setScalar(1);
    novo.estado = 'ocioso';

    curso.efeito.assumir(novo);
  }

  // ------------------------------------------------------------ selvagens

  /**
   * Quem aparece agora.
   *
   * A espécie da corrente puxa para si: com uma cadeia em andamento ela tem
   * três vezes mais peso. Sem isso a corrente nunca passaria de dois ou três
   * por acaso, e a caçada em cadeia — que é o que torna o brilhante alcançável
   * — não existiria na prática. Com o empurrão, um canto da casa onde o mesmo
   * bicho continua aparecendo vira um lugar em que vale a pena insistir.
   */
  private sortearEspecie(): Especie {
    const nivel = this.dex.nivelDoTreinador;
    const corrente = this.dex.especieDaCorrente;
    return escolherPesado(Math.random, ESPECIES, (e) => {
      const base = pesoSpawn(e, this.dex.jaCapturou(e.id), nivel);
      return e.id === corrente ? base * 3 : base;
    });
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
      // A corrente conta ESTE encontro, e é com ela que o dado é rolado.
      const corrente = this.dex.encadear(especie.id);
      const sorte = this.dex.sorteBrilhante;
      const shiny = sortearShiny(especie, sorte);
      const nivel = nivelSelvagem(this.dex.nivelDoTreinador);

      const gltf = await garantir(especie.id, shiny);
      if (!gltf) return;
      if (this.selvagens.length >= MAX_SELVAGENS) return;

      // A sala pode ter sido remedida enquanto o arquivo baixava, então o ponto
      // de spawn é escolhido agora, não antes.
      // A faixa e mais larga do que era: com o mapa acompanhando quem anda,
      // um bicho a cinco metros e um convite para caminhar ate ele em vez de um
      // que nunca sera alcancado.
      const local = this.sala.pontoDeSpawn(this.posicaoJogador, 1.2, 5.5);
      if (!local) return;

      const corpo = instanciar(especie.id, especie.altura, shiny);
      if (!corpo) return;

      const piso = local.ponto.y;
      const pokemon = new Pokemon(especie, corpo, local.ponto, piso, 'selvagem', nivel, shiny);
      this.cena.add(pokemon.raiz);

      const barra = new BarraVida(
        shiny ? `✦ ${especie.nome}` : especie.nome,
        textoTipos(especie),
        TIPOS[especie.tipo].cor,
      );
      this.cena.add(barra.placa.malha);

      this.selvagens.push({
        pokemon,
        barra,
        restante: 0,
        ciclo: 1,
        aviso: this.ajustes.perfil.avisoSegundos,
        golpe: null,
        avisou: false,
      });
      this.dex.registrarEncontro(especie.id, shiny);
      audio.surgiu(especie.id === 'pikachu' || shiny);
      window.setTimeout(() => audio.grito(especie.id, shiny, especie.num), 300);

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
          // A corrente só aparece quando já significa alguma coisa: anunciar
          // "corrente de 1" a cada encontro seria ruído.
          ...(corrente >= 3 && !shiny
            ? [
                {
                  texto: `corrente de ${corrente} · brilhante ${textoChanceShiny(chanceShiny(sorte))}`,
                  tamanho: 21,
                  cor: '#ffd76a',
                  peso: 600,
                },
              ]
            : []),
          // No Safari o encontro não vira briga sozinho, e o aviso precisa
          // dizer isso: quem chega fica em paz até você puxar o gatilho.
          ...(this.ajustes.modoAtual.perguntaAntesDaBatalha
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

    // A sala é remedida enquanto você anda: cada leitura carimba o chão sob os
    // seus pés e soma os planos novos que entraram no campo de visão. A cada um
    // terço de segundo é mais do que suficiente — andando depressa, isso dá uma
    // amostra a cada meio metro, e a célula do mapa tem oitenta centímetros.
    this.tempoLeituraSala -= dt;
    if (this.tempoLeituraSala <= 0) {
      this.tempoLeituraSala = 0.34;
      this.sala.atualizar(
        this.renderer.xr.getFrame() ?? null,
        this.renderer.xr.getReferenceSpace(),
        this.posicaoJogador,
      );
    }

    if (this.bonusFruta > 0) this.bonusFruta -= dt;

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
    if (this.ajustes.modoAtual.spawnAutomatico) {
      this.proximoSpawn -= dt;
      if (this.proximoSpawn <= 0 && this.selvagens.length < MAX_SELVAGENS) {
        const [minimo, maximo] = this.ajustes.modoAtual.intervaloSpawn;
        this.proximoSpawn = minimo + Math.random() * (maximo - minimo);
        void this.nascerSelvagem();
      }
    }

    this.regenerarTime(dt);
    this.atualizarMaos(dt, agora);
    this.atualizarPaineis(dt);
    this.atualizarMarca(dt);
    this.atualizarIscas(dt);
    this.atualizarSelvagens(dt);
    this.atualizarCompanheiro(dt);
    this.atualizarEvolucao(dt);
    this.atualizarCarinho(dt);
    this.atualizarAtaqueSelvagem(dt);
    this.atualizarBolas(dt);
    this.atualizarEfeitos(dt);

    this.painelPulso.atualizar(
      this.dex.totalBolas,
      this.dex.totalCapturas,
      this.dex.especiesCapturadas,
      this.dex.totalEspecies,
      this.sala.mapeadas,
      // A corrente só toma a linha do mapeamento quando já mudou a chance de
      // um jeito que se sente. Abaixo de três ela é ruído.
      this.dex.corrente >= 3
        ? `corrente ${this.dex.corrente} · brilhante ${textoChanceShiny(chanceShiny(this.dex.sorteBrilhante))}`
        : null,
    );
    this.aviso.atualizar(dt, this.camera);
    if (this.evolucaoPendente) {
      this.promptEvolucao.mostrar(this.evolucaoPendente.de, this.evolucaoPendente.para);
    }
    this.promptEvolucao.atualizar(dt, this.evolucaoPendente !== null, this.camera);
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
      for (const mao of this.maos) {
        if (!mao.conectada) continue;
        mao.amostrar(agora);
        mao.atualizarLuva(dt);
      }
      return;
    }

    // As mãos continuam vivas: é com elas que você aponta. A luva também —
    // esta é a primeira coisa que o jogador vê ao entrar, e uma mão de luva
    // parada aqui seria a primeira impressão do jogo.
    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.amostrar(agora);
      mao.amostrarBotoes();
      mao.atualizarLuva(dt);
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
    if (!this.temCompanheiroEmCampo) return;
    const c = this.companheiro!;
    if (c.estado === 'atacando' || c.estado === 'saindo' || c.estado === 'preso') return;

    // A mão precisa alcançar a CABEÇA, não o centro do corpo. Num Charmander
    // de trinta centímetros a diferença é o braço inteiro: mirar o centro
    // obriga a enfiar a mão dentro do bicho para ele reagir.
    const cabeca = c.pontoDaCabeca();
    // O alcance acompanha o tamanho: um Onix se afaga de longe, um Diglett não.
    const alcance = Math.max(DISTANCIA_CARINHO, c.raio * 0.9 + 0.1);

    let tocando: Mao | null = null;
    const toque = new THREE.Vector3();
    for (const mao of this.maos) {
      if (!mao.conectada) continue;
      mao.pontoDeToque(toque);
      if (toque.distanceTo(cabeca) <= alcance) {
        tocando = mao;
        break;
      }
    }

    if (!tocando) {
      if (this.recargaCarinho > 0) this.recargaCarinho -= dt;
      // A conta do afago seguido só vale enquanto for seguido — mas ela cai
      // devagar, para tirar a mão um instante não zerar dez segundos de mimo.
      this.tempoDeCarinho = Math.max(0, this.tempoDeCarinho - dt * 0.6);
      return;
    }

    // A pose de cafuné é contínua: ela existe enquanto a mão estiver ali. O que
    // tem carência é a RECOMPENSA — senão um encosto de dois segundos curaria o
    // bicho inteiro e o afago viraria poção.
    c.receberCarinho();
    this.tempoDeCarinho += dt;

    if (this.recargaCarinho > 0) {
      this.recargaCarinho -= dt;
      // Vibração fraca e constante enquanto a mão estiver lá: é o ronronar
      // chegando pelo controle.
      if (Math.random() < dt * 6) tocando.vibrar(0.12, 18);
      return;
    }

    this.recargaCarinho = 4;
    tocando.vibrar(0.35, 60);
    audio.carinho();
    audio.grito(c.especie.id, c.shiny, c.especie.num);
    c.curar(Math.max(1, Math.ceil(c.hpMax * 0.04)));
    if (this.exemplarEmCampo) {
      this.dex.definirHp(this.exemplarEmCampo, c.hp);
      this.dex.ganharXp(this.exemplarEmCampo, 3);
    }

    const coracoes = new Impacto(cabeca, 0xff9ec4);
    this.cena.add(coracoes.pontos);
    this.impactos.push(coracoes);

    // Depois de um bom tempo de afago ele comemora — e isso é o único jeito de
    // ver a pose de comemoração fora da evolução.
    if (this.tempoDeCarinho > 10) {
      this.tempoDeCarinho = 0;
      c.comemorar();
      this.aviso.mostrar(
        [
          { texto: `${c.especie.nome} adora você`, tamanho: 36, cor: '#ff9ec4' },
          { texto: 'ele está muito feliz', tamanho: 22, cor: '#9aa5b8', peso: 500 },
        ],
        2,
      );
      return;
    }

    this.aviso.mostrar(
      [{ texto: `${c.especie.nome} gostou disso`, tamanho: 34, cor: '#ff9ec4' }],
      1.4,
    );
  }

  /**
   * O que os botões fazem.
   *
   * O gatilho e o grip já chegam como evento; A, B, X e Y não chegam de jeito
   * nenhum e precisam ser lidos do gamepad todo quadro (ver src/hands.ts). A
   * divisão segue a mão: a direita é a mão do Pokémon — mandar voltar —, e a
   * esquerda é a mão da mochila, que é onde o painel de pulso e o PC já moram.
   *
   *   A (direita)  recolhe o Pokémon para quem você estiver apontando
   *   B (direita)  fecha o PC
   *   X (esquerda) chama o Pokémon para perto de você
   *   Y (esquerda) abre e fecha o PC
   */
  private botoesDaMao(mao: Mao) {
    // A pergunta da evolução toma A e B enquanto estiver na tela: ela é modal
    // de propósito, e é curta.
    if (this.evolucaoPendente && mao.lado === 'right') {
      if (mao.apertou(BOTAO_A)) {
        this.permitirEvolucao();
        return;
      }
      if (mao.apertou(BOTAO_B)) {
        this.recusarEvolucao();
        return;
      }
    }

    if (mao.lado === 'right') {
      if (mao.apertou(BOTAO_A)) this.recolherApontando(mao);
      if (mao.apertou(BOTAO_B) && this.pc.aberto) {
        this.pc.fechar();
        audio.clique();
      }
      return;
    }

    if (mao.lado === 'left') {
      if (mao.apertou(BOTAO_B)) this.alternarPc();
      if (mao.apertou(BOTAO_A)) this.chamarParaPerto(mao);
    }
  }

  /**
   * Botão A apontando para o seu Pokémon: ele volta para a bola.
   *
   * Exigir mira é o que dá o gesto — você levanta a bola na direção dele, como
   * no desenho — mas a tolerância é generosa de propósito: quem está com a
   * bola na mão e aperta A quer recolher, e ser recusado porque o raio passou
   * a dez centímetros do ombro dele seria só teimosia.
   */
  private recolherApontando(mao: Mao) {
    if (!this.temCompanheiroEmCampo) {
      if (this.dex.exemplarAtivo) audio.recusa();
      return;
    }

    const c = this.companheiro!;
    const { origem, direcao } = mao.mira();
    const paraEle = c.centro.clone().sub(origem);
    const aoLongo = paraEle.dot(direcao);
    // Atrás da mão não conta: apontar para trás não é apontar para ele.
    const desvio =
      aoLongo <= 0 ? Infinity : paraEle.clone().addScaledVector(direcao, -aoLongo).length();

    if (desvio > c.raio + 0.35) {
      audio.recusa();
      mao.vibrar(0.15, 20);
      this.aviso.mostrar(
        [
          { texto: 'aponte para ele', tamanho: 34, cor: '#ffd78a' },
          { texto: 'e aperte A de novo para recolher', tamanho: 23, cor: '#9aa5b8', peso: 500 },
        ],
        1.8,
      );
      return;
    }

    // Com a bola dele na mão, é ela que faz o feixe — e some junto. Sem ela, o
    // recolhimento acontece igual: o gesto é a mira, não o objeto.
    const bola = this.bolaNaMao.get(mao.indice);
    if (bola) {
      this.bolaNaMao.delete(mao.indice);
      this.bolaDeInvocacao.delete(mao.indice);
      mao.segurando = false;
      bola.descartar(this.cena);
      const i = this.bolas.indexOf(bola);
      if (i !== -1) this.bolas.splice(i, 1);
    }

    const brilho = new Impacto(c.centro, TIPOS[c.especie.tipo].cor);
    this.cena.add(brilho.pontos);
    this.impactos.push(brilho);

    mao.vibrar(0.6, 80);
    audio.grito(c.especie.id, c.shiny, c.especie.num);
    this.recolherCompanheiro();
  }

  /** Botão X: ele larga o que está fazendo e vem até você. */
  private chamarParaPerto(mao: Mao) {
    if (!this.temCompanheiroEmCampo) {
      audio.recusa();
      return;
    }
    const c = this.companheiro!;
    c.cancelarComando();
    c.chamarPara(this.posicaoJogador);
    c.acenar();
    audio.comando();
    audio.grito(c.especie.id, c.shiny, c.especie.num);
    mao.vibrar(0.4, 45);
    this.aviso.mostrar(
      [{ texto: `${c.especie.nome} está vindo`, tamanho: 34, cor: '#cfe6ff' }],
      1.4,
    );
  }

  private alternarPc() {
    if (this.pc.aberto) {
      this.pc.fechar();
      audio.clique();
      return;
    }
    this.pc.abrir(this.camera);
    audio.abrirPainel();
    this.aviso.mostrar(
      [
        { texto: 'PC ligado', tamanho: 40, cor: '#9fe0ff' },
        {
          texto: 'aponte e puxe o gatilho para pegar, aponte a vaga e puxe de novo',
          tamanho: 21,
          cor: '#9aa5b8',
          peso: 500,
        },
      ],
      3,
    );
  }

  /**
   * Com hand tracking não há grip nenhum, e o jogo inteiro depende dele para
   * pegar e arremessar a bola. Fechar o punho faz as vezes: a borda vira o
   * mesmo par de chamadas que o botão faria.
   */
  private sinaisDaMaoNua(mao: Mao) {
    if (!mao.semControle) return;
    const mudou = mao.lerPunhoFechado();
    if (mudou === 'fechou') this.pegarBola(mao);
    else if (mudou === 'abriu') this.arremessarBola(mao);
  }

  private atualizarMaos(dt: number, agora: number) {
    if (this.modoPlano) {
      const bola = this.bolaNaMao.get(99);
      // A mão da tela fecha em volta da bola enquanto o botão está apertado.
      this.luvaPlana?.definirDedos(bola ? 1 : 0.05, bola ? 1 : 0, dt);
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
      mao.amostrarBotoes();
      mao.atualizarLuva(dt);
      this.sinaisDaMaoNua(mao);
      this.botoesDaMao(mao);

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
        estagios: emCampo ? this.companheiro!.estagios : undefined,
      };
    });
    const bolas = BOLAS.map((tipo) => ({ tipo, quantidade: this.dex.bolas(tipo.id) }));
    const itens = ITENS.map((tipo) => ({ tipo, quantidade: this.dex.item(tipo.id) }));
    this.painelTime.definirConteudo(
      entradas,
      bolas,
      itens,
      this.golpesDoCampo(),
      this.ajustes.modo,
      this.ajustes.dificuldade,
      INTERRUPTORES.map((c) => ({
        id: c.id,
        nome: c.nome,
        ligado: this.ajustes.ligado(c.id),
        diz: this.ajustes.ligado(c.id) ? c.ligadoDiz : c.desligadoDiz,
      })),
    );

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
    // Fechou a Pokédex no meio de uma ficha falada: a voz para junto. Ouvir uma
    // descrição de Pikachu com a Pokédex já guardada é o tipo de coisa que faz
    // parecer que o jogo travou.
    if (!this.painelDex.aberto && dexEstavaAberta) calar();

    // --- PC, ancorado no quarto ---
    // Ele aceita as duas mãos: é um painel grande, à frente do corpo, e obrigar
    // a apontar com uma mão específica num móvel desses não teria por quê.
    // As miras só são montadas com o PC aberto: fechado ele é a maior parte do
    // tempo, e `mira()` aloca dois vetores por mão por quadro.
    const mirasDoPc = !this.pc.aberto
      ? []
      : this.modoPlano
        ? [this.miraDaCamera()]
        : this.maos.filter((m) => m.conectada).map((m) => m.mira());
    this.pc.atualizar(dt, mirasDoPc, this.camera);
    if (this.pc.mudouDestaque) {
      this.pc.mudouDestaque = false;
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

      // A contagem até o próximo golpe dele. É o que transforma apanhar numa
      // coisa prevista: dá para ver o nome do golpe e a barra enchendo, e
      // decidir se troca de Pokémon, se usa poção ou se ataca antes.
      const carga: Carga | null =
        this.ajustes.avisoDeGolpe && selvagem.golpe && selvagem.restante > 0
          ? {
              fracao: 1 - selvagem.restante / Math.max(0.001, selvagem.ciclo),
              golpe: selvagem.golpe.nome,
              cor: TIPOS[selvagem.golpe.tipo].cor,
              iminente: selvagem.restante <= selvagem.aviso,
            }
          : null;

      barra.atualizar(
        dt,
        mostrar,
        pokemon.hp,
        pokemon.hpMax,
        pokemon.raiz.position,
        pokemon.altura,
        this.camera,
        pokemon.desmaiado ? `N${pokemon.nivel} · exausto` : `N${pokemon.nivel}`,
        carga,
      );

      // Exausto: fica um tempo no chão, fácil de capturar, e some se você
      // demorar. É a janela que a batalha abriu para você.
      if (pokemon.estado === 'desmaiado') {
        pokemon.alarme = 0;
        if (pokemon.tempoNoEstado > 9) pokemon.dissolver();
      }

      // Ficou para trás enquanto você caminhava: vai embora e abre vaga para
      // alguém nascer à frente. Sem isto, andar pela casa encheria a memória do
      // headset de bichos parados em cômodos que você já deixou — e o teto de
      // três impediria qualquer encontro novo. Quem está vindo pela isca ou
      // brigando fica, custe o que custar.
      const longe =
        pokemon.raiz.position.distanceTo(this.posicaoJogador) > DISTANCIA_DE_SUMICO;
      if (longe && !pokemon.atraido && !emBatalha && pokemon.estado !== 'preso') {
        pokemon.dissolver();
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
    // Enquanto a evolução roda, quem escreve na escala do corpo é o efeito:
    // deixar a animação normal rodar junto desfaria o estica-e-encolhe a cada
    // quadro, porque ela reescreve `corpo.scale` inteiro.
    if (!this.evolucaoEmCurso) c.atualizar(dt, this.posicaoJogador);
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
    // A pergunta era sobre este corpo. Sem ele em campo, ela não faz sentido.
    this.evolucaoPendente = null;
    this.promptEvolucao.esconder();
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
    audio.grito(presa.especie.id, presa.shiny, presa.especie.num);

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
    // A voz dele logo depois do clarao: e o quadro em que o bicho vira seu.
    window.setTimeout(() => audio.grito(especie.id, exemplar.shiny, especie.num), 260);

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

    // A outra hora de conferir a evolução. Sem isto, um Pokémon capturado já
    // acima do nível dela nunca evoluía: ele não sobe de nível na sua mão, e
    // subir de nível era o único gatilho que existia.
    this.conferirEvolucao(exemplar);

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
    for (const aura of [...this.auras]) {
      aura.atualizar(dt, 0.9);
      if (aura.terminou) {
        aura.descartar(this.cena);
        this.auras.splice(this.auras.indexOf(aura), 1);
      }
    }
    for (const assinatura of [...this.assinaturas]) {
      assinatura.atualizar(dt);
      if (assinatura.terminou) {
        assinatura.descartar(this.cena);
        this.assinaturas.splice(this.assinaturas.indexOf(assinatura), 1);
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

  /** A mira do modo sem headset é o centro da tela: o olhar faz o papel da mão. */
  private miraDaCamera(): { origem: THREE.Vector3; direcao: THREE.Vector3 } {
    const origem = this.camera.getWorldPosition(new THREE.Vector3());
    const direcao = new THREE.Vector3();
    this.camera.getWorldDirection(direcao);
    return { origem, direcao };
  }

  /**
   * Atalhos do modo sem headset.
   *
   * Tudo o que existe no headset precisa existir aqui, senão a única forma de
   * ver uma animação nova é pôr o Quest na cabeça a cada alteração — e aí ela
   * não é vista.
   */
  comandoPlano(
    acao:
      | 'atacar'
      | 'proximo'
      | 'pc'
      | 'recolher'
      | 'chamar'
      | 'carinho'
      | 'gatilho'
      | 'acenar'
      | 'isca'
      | 'doce'
      | 'golpe1'
      | 'golpe2'
      | 'golpe3'
      | 'golpe4'
      | 'dificuldade'
      | 'evoluir'
      | 'naoEvoluir',
  ) {
    const mao = this.maos[0];

    switch (acao) {
      case 'golpe1':
      case 'golpe2':
      case 'golpe3':
      case 'golpe4': {
        // Sem painel de pulso na tela, os números fazem o papel dos quatro
        // cards de golpe — que é o mesmo lugar que eles ocupam num jogo de
        // Pokémon de verdade.
        if (!this.temCompanheiroEmCampo) {
          audio.recusa();
          return;
        }
        const golpe = arsenal(this.companheiro!)[Number(acao.slice(-1)) - 1];
        if (golpe) this.armarGolpe({ golpe, armado: true });
        return;
      }

      case 'dificuldade': {
        const i = DIFICULDADES.findIndex((d) => d.id === this.ajustes.dificuldade);
        this.escolherDificuldade(DIFICULDADES[(i + 1) % DIFICULDADES.length]);
        return;
      }

      case 'evoluir':
        this.permitirEvolucao();
        return;

      case 'naoEvoluir':
        this.recusarEvolucao();
        return;

      case 'isca':
      case 'doce':
        // A isca já na mão sai; senão entra. Sem painel de pulso na tela, a
        // mesma tecla precisa fazer os dois.
        if (this.iscaNaMao.has(mao.indice)) this.guardarIsca(mao);
        else this.pegarIsca(mao, acao === 'doce' ? 'doce' : 'fruta');
        return;
      case 'atacar':
        this.comandarAtaque(mao);
        return;

      case 'gatilho':
        if (this.pc.aberto && this.pc.temAlvo) this.acionarPc(mao);
        else this.comandarAtaque(mao);
        return;

      case 'pc':
        this.alternarPc();
        return;

      case 'recolher': {
        if (!this.temCompanheiroEmCampo) {
          audio.recusa();
          return;
        }
        const c = this.companheiro!;
        const brilho = new Impacto(c.centro, TIPOS[c.especie.tipo].cor);
        this.cena.add(brilho.pontos);
        this.impactos.push(brilho);
        audio.grito(c.especie.id, c.shiny, c.especie.num);
        this.recolherCompanheiro();
        return;
      }

      case 'chamar':
        this.chamarParaPerto(mao);
        return;

      case 'acenar':
        if (this.temCompanheiroEmCampo) {
          this.companheiro!.acenar();
          audio.grito(
            this.companheiro!.especie.id,
            this.companheiro!.shiny,
            this.companheiro!.especie.num,
          );
        }
        return;

      case 'carinho': {
        if (!this.temCompanheiroEmCampo) return;
        const c = this.companheiro!;
        c.receberCarinho();
        if (this.recargaCarinho <= 0) {
          this.recargaCarinho = 4;
          audio.carinho();
          audio.grito(c.especie.id, c.shiny, c.especie.num);
          c.curar(Math.max(1, Math.ceil(c.hpMax * 0.04)));
          const coracoes = new Impacto(c.pontoDaCabeca(), 0xff9ec4);
          this.cena.add(coracoes.pontos);
          this.impactos.push(coracoes);
        }
        return;
      }

      default: {
        const time = this.dex.time;
        if (time.length === 0) return;
        const atual = time.findIndex((e) => e === this.dex.exemplarAtivo);
        this.escolherDoTime(time[(atual + 1) % time.length]);
      }
    }
  }

  /** Versão do comando "vá até ali" para o modo sem headset. */
  marcarPlano(fase: 'inicio' | 'fim') {
    if (fase === 'inicio') {
      this.gatilhoPreso = { mao: this.maos[0], desde: performance.now() - 400, comandou: false };
      return;
    }
    const preso = this.gatilhoPreso;
    this.gatilhoPreso = null;
    if (preso?.comandou && this.pontoMarcado && this.temCompanheiroEmCampo) {
      this.companheiro!.irPara(this.pontoMarcado.clone());
      audio.comando();
    }
    this.pontoMarcado = null;
  }

  aoEntrarNaSessao() {
    this.proximoSpawn = 3;

    // O raio que mede o chão sob os seus pés só pode ser pedido com a sessão
    // aberta. É ele que faz o mapa crescer enquanto você caminha pela casa.
    void this.sala.prepararSondagem(this.renderer.xr.getSession());

    // Os ajustes salvos valem desde o primeiro quadro: o contorno da sala é o
    // único que mexe na cena e precisa ser aplicado à mão.
    if (this.ajustes.contornoDaSala !== this.sala.debugLigado) this.sala.alternarDebug();

    // As narrações dos iniciais são quatro MP3 de ~190 kB. Só dá para baixá-las
    // agora, e não no construtor: elas são decodificadas no AudioContext, e ele
    // só existe depois do gesto do usuário que abriu a sessão. Adiantar aqui
    // evita o silêncio entre puxar o gatilho na Pokédex e a voz começar — tempo
    // suficiente para achar que não funcionou e puxar de novo.
    preparar(['bulbasaur', 'charmander', 'squirtle', 'pikachu']);

    this.aviso.mostrar(
      [
        { texto: 'olhe em volta', tamanho: 42, cor: '#cfe6ff' },
        { texto: 'GRIP segura a pokébola · solte no movimento para arremessar', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'GATILHO toca para atacar · segure para marcar no chão até onde ele vai', tamanho: 21, cor: '#9aa5b8', peso: 500 },
        { texto: 'A recolhe · X chama · Y liga o PC · gire os pulsos: time e Pokédex', tamanho: 21, cor: '#9aa5b8', peso: 500 },
      ],
      7,
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
    for (const assinatura of this.assinaturas) assinatura.descartar(this.cena);
    for (const aura of this.auras) aura.descartar(this.cena);
    for (const mira of this.miras.values()) mira.descartar();
    for (const raio of this.raios.values()) raio.descartar();
    for (const rastro of this.rastros.values()) rastro.descartar();
    for (const isca of this.iscaNaMao.values()) isca.descartar();
    for (const mao of this.maos) mao.luva?.descartar();
    this.luvaPlana?.descartar();
    this.marca.descartar();
    this.painelPulso.descartar();
    this.painelTime.descartar();
    this.painelDex.descartar();
    this.pc.descartar();
    this.promptEvolucao.descartar();
    this.evolucaoEmCurso?.efeito.descartar(this.cena);
    calar();
    this.aviso.descartar();
    this.sala.descartar();
    for (const d of this.descartaveis) d.dispose();
  }
}
