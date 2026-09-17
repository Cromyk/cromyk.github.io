import * as THREE from 'three';
import { ESTAGIOS_ZERADOS, statsNoNivel, type Especie, type Estagios } from './species';
import type { GestoDeAtaque } from './anima';
import type { Corpo } from './modelos';
import { criarRng, entre, type Rng } from './rng';
import { Animador } from './anima';
import { Chama, FOGO_POR_ESPECIE, pontaDaCadeia } from './fogo';

export type Papel = 'selvagem' | 'companheiro';

/**
 * O que a criatura precisa saber do quarto para andar nele: a altura do apoio
 * sob um ponto qualquer. Quem implementa é a `Sala`; o tipo fica estreito de
 * propósito, para a criatura não passar a depender do mapeamento inteiro.
 */
export interface Terreno {
  alturaEm(ponto: THREE.Vector3): number;
}

export type Estado =
  | 'surgindo'
  | 'ocioso'
  | 'atento'
  | 'atacando'
  | 'ferido'
  | 'desmaiado'
  | 'fugindo'
  | 'preso'
  | 'saindo'
  /** Indo até o ponto que você marcou no chão com o gatilho. */
  | 'indo'
  /** No seu colo: você o pegou com a mão e ele está no ar, preso a ela. */
  | 'colo';

const GRAVIDADE = -9.0;

/** Rascunhos do quadro para a escala das chamas. Ver acenderFogo. */
const _escalaA = new THREE.Vector3();
const _escalaB = new THREE.Vector3();

/**
 * Um Pokémon vivo no seu quarto. O mesmo corpo serve para o selvagem — que
 * passeia, repara em você e foge se levar susto — e para o companheiro, que
 * anda ao seu lado e ataca quando você manda.
 *
 * O corpo é um modelo 3D de verdade (ver src/modelos.ts), não geometria
 * montada aqui. Dezenove dos 151 arquivos trazem animação assada; os outros
 * 132 chegam parados, então toda a vida deles é a animação procedural abaixo:
 * respiração, squash no salto, inclinação na corrida, tremor ao apanhar. É
 * pouca conta por quadro de propósito — o headset desenha a cena duas vezes.
 */
export class Pokemon {
  readonly especie: Especie;
  readonly corpo: Corpo;
  readonly raiz: THREE.Group;
  readonly papel: Papel;
  readonly nivel: number;
  readonly shiny: boolean;
  readonly hpMax: number;
  /** Quem faz os ossos se mexerem. Ver src/anima.ts. */
  readonly animador: Animador;
  /** O fogo de quem é de fogo. Vazio para os outros 144. Ver src/fogo.ts. */
  private chamas: Chama[] = [];
  /**
   * A que altura acima do apoio ele paira, em metros. Zero = anda no chão.
   *
   * Todo o resto deste arquivo trata locomoção como uma sucessão de pulinhos
   * com gravidade, que é o que faz um Charmander parecer um Charmander. Num
   * Gastly, num Zubat ou num Magnemite isso fica errado de um jeito que salta
   * aos olhos — eles não têm com que pular. Ver `flutua`.
   */
  readonly voo: number;

  ancora: THREE.Vector3;
  pisoY: number;

  estado: Estado = 'surgindo';
  hp: number;
  /** 0 = tranquilo, 1 = surta e foge. Só vale para o selvagem. */
  alarme = 0;
  viva = true;
  /** Para quem ele está virado enquanto luta. */
  alvo: Pokemon | null = null;
  /**
   * Ponto no ar para onde o golpe foi mandado quando não há alvo vivo — é o
   * que deixa o modo Relaxante ter ataque sem ter briga: você aponta para um
   * canto da sala e ele acerta o canto da sala.
   */
  mirando: THREE.Vector3 | null = null;
  /**
   * Se este encontro já rendeu experiência. Um selvagem derrubado e depois
   * capturado é UM encontro, e pagaria duas vezes sem esta marca.
   */
  xpConcedida = false;
  /**
   * Os estagios de ataque, defesa e velocidade acumulados NESTA briga.
   *
   * Vivem no exemplar em campo e morrem com ele, como no jogo original: voltar
   * para a bola zera tudo. Guarda-los no Exemplar salvo faria um buff de tres
   * segundos virar permanente, e ai nao seria mais uma jogada — seria um upgrade.
   */
  readonly estagios: Estagios = ESTAGIOS_ZERADOS();

  private rng: Rng;
  private tempo: number;
  private velY = 0;
  private noChao = true;
  private destino = new THREE.Vector3();
  private proximoPulo: number;
  private cronometroEstado = 0;
  private escalaAlvo = 1;
  private olharPara: THREE.Vector3 | null = null;
  /**
   * Onde está a mão que faz carinho, quando há uma.
   *
   * Existe separado do `olharPara` porque ele é reescrito a cada quadro pelo
   * estado (ocioso olha para um lado, atento olha para você), e o toque tem de
   * ganhar de tudo isso: uma mão na cabeça é a coisa mais importante que está
   * acontecendo com ele.
   */
  private maoNoCafune: THREE.Vector3 | null = null;
  private tempoSemCafune = 0;
  private recarga = 0;
  private tremor = 0;
  /** Achatada ao aterrissar, volta sozinha. */
  private impacto = 0;
  private velocidadeAndando = 0;
  /**
   * Quem sabe a altura do apoio em cada ponto do quarto — a `Sala`.
   *
   * Sem isto o bicho anda na altura em que nasceu e só: sobe num tapete sem
   * subir, desce um degrau flutuando. Com isto o apoio é consultado a cada
   * quadro sob os pés dele, que é o que faz ele reconhecer o terreno.
   */
  private terreno: Terreno | null = null;
  /** Quanto tempo falta para o selvagem escolher um novo canto do quarto. */
  private proximaAndanca = 0;
  /** Onde ele nasceu. A andança se afasta daqui, mas não sem limite. */
  private readonly berco: THREE.Vector3;
  /** Ponto marcado por você no chão. Enquanto existir, ele vai até lá. */
  private destinoComandado: THREE.Vector3 | null = null;
  /**
   * Onde ele foi mandado FICAR.
   *
   * Sem isto, a ordem "vá até ali" durava só a caminhada: assim que chegava, o
   * companheiro voltava à regra de andar ao lado do treinador e dava meia-volta
   * na frente de quem tinha acabado de mandar ele ir. O ponto fica guardado, e
   * enquanto ele existir o passeio do bicho orbita a MARCA, não você — que é o
   * que "fica aí" quer dizer em qualquer jogo de Pokémon.
   *
   * Sai daqui de três jeitos: você chama ele de volta, faz carinho nele, ou
   * manda ele para outro lugar.
   */
  private posto: THREE.Vector3 | null = null;
  /** Quanto a cabeça ainda precisa girar para encarar o alvo, em radianos. */
  private residuoOlhar = 0;
  /** Segura o carinho por alguns segundos depois da mão sair. */
  private carinho = 0;
  /** Segundos restantes de atração pela isca. Ver atrairPara. */
  private atracao = 0;
  /** Segundos de hit-stop restantes. Ver congelar. */
  private pausa = 0;
  /** O que falta gastar do empurrão do golpe. Ver empurrar. */
  private recuo = new THREE.Vector3();

  private static readonly RAIO_PASSEIO = 0.85;

  /**
   * As distâncias deste arquivo foram escritas para bichos de meio metro, que
   * era o tamanho de todo mundo quando a altura vinha comprimida. Com o tamanho
   * real ligado, um Onix de quase nove metros entra na sala — e "pare a oitenta
   * centímetros do treinador" passa a significar "pare com a cabeça dentro da
   * parede oposta".
   *
   * Então toda distância pessoal passa por aqui: ela é a maior entre a medida
   * de antes e o tamanho do corpo. Num Diglett nada muda; num Onix, tudo.
   */
  private folga(minimo: number, vezes = 1): number {
    return Math.max(minimo, this.raio * vezes);
  }

  constructor(
    especie: Especie,
    corpo: Corpo,
    ancora: THREE.Vector3,
    pisoY: number,
    papel: Papel = 'selvagem',
    nivel = 5,
    shiny = false,
    semente = Math.random() * 1e9,
  ) {
    this.especie = especie;
    this.corpo = corpo;
    this.papel = papel;
    this.nivel = nivel;
    this.shiny = shiny;
    this.ancora = ancora.clone();
    this.berco = ancora.clone();
    this.pisoY = pisoY;
    this.proximaAndanca = entre(criarRng(semente + 7), 4, 12);
    this.hpMax = statsNoNivel(especie, nivel).hpMax;
    this.hp = this.hpMax;
    this.rng = criarRng(semente);
    this.tempo = this.rng() * 10;
    this.proximoPulo = entre(this.rng, 1.2, 3.0);

    this.voo = especie.voo * corpo.altura;

    this.raiz = corpo.raiz;
    this.raiz.position.copy(ancora);
    this.raiz.position.y = pisoY + this.voo;
    this.raiz.rotation.y = this.rng() * Math.PI * 2;
    this.raiz.scale.setScalar(0.001);
    this.destino.copy(this.raiz.position);

    // Toda a animação de esqueleto mora aqui: os clipes assados que o arquivo
    // trouxe, quando trouxe, e a animação procedural por osso para o resto —
    // que é a maioria. Ver src/anima.ts.
    this.animador = new Animador(corpo);
    this.acenderFogo();
  }

  /**
   * Põe fogo de verdade em quem deveria estar pegando fogo.
   *
   * O modelo traz a chama como malha pintada e parada — ver src/fogo.ts. Aqui
   * ela ganha uma chama viva por cima, pendurada NO OSSO, que é o que a faz
   * acompanhar a cauda sem custo por quadro além do próprio desenho.
   *
   * A compensação de escala é o detalhe que não pode faltar: o osso vive dentro
   * do nó que encolhe o modelo inteiro de 2 unidades para 30 centímetros, e uma
   * chama de 6 cm pendurada ali sem compensar sairia do tamanho de uma casa.
   */
  private acenderFogo() {
    const pontos = FOGO_POR_ESPECIE[this.especie.id];
    if (!pontos) return;
    this.raiz.updateMatrixWorld(true);

    // A escala do osso medida CONTRA A RAIZ, não contra o mundo.
    //
    // Este construtor deixa a raiz em 0,001 — o bicho nasce do tamanho de um
    // grão e cresce (ver `escalaAlvo`). Medir no mundo aqui pegava esse 0,001,
    // e como o tamanho da chama é dividido por essa medida, ela nascia mil
    // vezes maior do que devia; ao vivo isso é uma fogueira do tamanho da sala
    // grudada no bicho. Dividir uma pela outra cancela a escala transitória da
    // raiz, e de quebra o squash & stretch, que também escreve ali.
    const daRaiz = this.raiz.getWorldScale(_escalaA).x;
    if (daRaiz < 1e-9) return;

    for (const ponto of pontos) {
      // O último osso que o rip nomeou: nem todo modelo tem as três vértebras
      // de cauda, e pendurar na primeira deixaria a chama no lombo.
      let osso: THREE.Object3D | null = null;
      for (const chave of ponto.ossos) {
        osso = this.animador.rig.ossoDe(chave);
        if (osso) break;
      }
      if (!osso) continue;

      // O rig só nomeia três vértebras de cauda, e os rips têm mais — nove no
      // Charmander. Pendurar no osso mapeado põe a chama no MEIO do rabo; ver
      // `ponta` em src/fogo.ts. Pendurada no osso da ponta, ela ainda ganha de
      // graça o balanço da cauda, que é onde uma chama de verdade estaria.
      if (ponto.ponta) osso = pontaDaCadeia(osso);

      const doOsso = osso.getWorldScale(_escalaB).x / daRaiz;
      if (doOsso < 1e-9) continue;

      const chama = new Chama((this.corpo.altura * ponto.fracao) / doOsso, ponto.cor);
      osso.add(chama.grupo);
      this.chamas.push(chama);
    }
  }

  get altura(): number {
    return this.corpo.altura;
  }

  /** Quem paira não pula: a locomoção dele é outra. */
  get flutua(): boolean {
    return this.voo > 0.001;
  }

  /**
   * Um empurrão para cima — o pulinho com que todo mundo aqui anda.
   *
   * Quem flutua ignora: dar impulso vertical a um Gastly o faria quicar, e
   * quicar é justamente o que ele não faz.
   */
  private impulso(quanto: number) {
    if (this.flutua || !this.noChao) return;
    this.velY = quanto;
    this.noChao = false;
  }

  get hpFracao(): number {
    return THREE.MathUtils.clamp(this.hp / this.hpMax, 0, 1);
  }

  /** Segundos desde a última troca de estado. */
  get tempoNoEstado(): number {
    return this.cronometroEstado;
  }

  get desmaiado(): boolean {
    return this.hp <= 0;
  }

  /** Centro do corpo no mundo — alvo dos golpes e da pokébola. */
  get centro(): THREE.Vector3 {
    const p = this.raiz.position;
    return new THREE.Vector3(p.x, p.y + this.altura * 0.5 * this.raiz.scale.y, p.z);
  }

  /** De onde sai o golpe. */
  get boca(): THREE.Vector3 {
    this.raiz.updateMatrixWorld();
    return this.corpo.boca.getWorldPosition(new THREE.Vector3());
  }

  get raio(): number {
    return this.corpo.raio;
  }

  get podeAtacar(): boolean {
    return (
      this.recarga <= 0 &&
      !this.desmaiado &&
      this.estado !== 'preso' &&
      this.estado !== 'saindo' &&
      this.estado !== 'surgindo'
    );
  }

  /** Dispara a animação de ataque. O dano em si é resolvido pela batalha. */
  atacar(alvo: Pokemon, recarga: number, gesto: GestoDeAtaque = 'investida') {
    if (!this.podeAtacar) return false;
    this.alvo = alvo;
    this.mirando = null;
    this.estado = 'atacando';
    this.cronometroEstado = 0;
    this.recarga = recarga;
    this.animador.disparar(gesto);
    // Pequeno salto para trás, como um recuo do disparo.
    this.impulso(1.1);
    return true;
  }

  /**
   * Marca a recarga sem disparar ataque nenhum. E o que um golpe de status
   * precisa: ele ocupa a vez, mas nao e um ataque.
   */
  marcarRecarga(segundos: number) {
    this.recarga = Math.max(this.recarga, segundos);
  }

  /** Mesmo gesto de ataque, mas contra um ponto da sala em vez de alguém. */
  atacarPonto(ponto: THREE.Vector3, recarga: number, gesto: GestoDeAtaque = 'investida') {
    if (!this.podeAtacar) return false;
    this.alvo = null;
    this.mirando = ponto.clone();
    this.estado = 'atacando';
    this.cronometroEstado = 0;
    this.recarga = recarga;
    this.animador.disparar(gesto);
    this.impulso(1.1);
    return true;
  }

  /**
   * Congela o bicho por alguns quadros. O hit-stop — item 2.1 do roteiro.
   *
   * É o truque mais barato de game feel que existe, e o mais mal-entendido: não
   * é uma animação, é a AUSÊNCIA de uma. Sessenta a noventa milissegundos em
   * que nada se move, e o cérebro lê a pausa como massa — a mesma coisa que faz
   * um soco parecer pesado num jogo de luta.
   *
   * Congela quem bate e quem leva, os dois, senão só metade da briga para e a
   * pausa lê como travamento em vez de impacto.
   */
  congelar(segundos: number) {
    this.pausa = Math.max(this.pausa, segundos);
  }

  /**
   * Empurra para longe de um ponto, no plano do chão. O recuo do golpe.
   *
   * Não é knockback: são 10 a 15 cm que voltam sozinhos, porque o passeio do
   * bicho puxa ele de volta para a âncora. O suficiente para o corpo registrar
   * que houve empurrão, sem tirar ninguém do lugar — um selvagem arremessado
   * para trás do sofá a cada golpe seria um problema novo.
   */
  empurrar(de: THREE.Vector3, distancia: number) {
    const fora = new THREE.Vector3(this.raiz.position.x - de.x, 0, this.raiz.position.z - de.z);
    if (fora.lengthSq() < 1e-6) return;
    this.recuo.copy(fora.normalize().multiplyScalar(distancia));
  }

  receberDano(quantidade: number) {
    if (this.desmaiado) return;
    this.hp = Math.max(0, this.hp - quantidade);
    this.tremor = 1;
    // Achatado pelo golpe, como quem leva o baque. O mesmo campo que a queda
    // usa ao aterrissar — ver `animar`.
    this.impacto = Math.max(this.impacto, 0.8);
    this.animador.disparar('apanhar');
    if (this.hp <= 0) {
      this.estado = 'desmaiado';
      this.cronometroEstado = 0;
    } else {
      this.estado = 'ferido';
      this.cronometroEstado = 0;
      if (this.papel === 'selvagem') this.alarme = Math.min(1, this.alarme + 0.18);
    }
  }

  curar(quantidade: number) {
    this.hp = Math.min(this.hpMax, this.hp + quantidade);
    if (this.hp > 0 && this.estado === 'desmaiado') {
      this.estado = 'ocioso';
      this.raiz.rotation.z = 0;
    }
  }

  assustar(quanto: number) {
    if (this.papel !== 'selvagem') return;
    if (this.estado === 'preso' || this.estado === 'saindo') return;
    this.alarme = Math.min(1, this.alarme + quanto);
    this.impulso(2.0 + quanto * 1.6);
    if (this.alarme >= 1) this.fugir();
  }

  /** Acalma o selvagem — é o que uma fruta bem jogada faz. */
  acalmar(quanto: number) {
    this.alarme = Math.max(0, this.alarme - quanto);
    if (this.estado === 'fugindo') {
      this.estado = 'ocioso';
      this.cronometroEstado = 0;
    }
  }

  fugir() {
    if (this.estado === 'preso' || this.estado === 'saindo' || this.papel !== 'selvagem') return;
    // Atraido pela isca, ele nao foge: e o sentido da isca.
    if (this.atracao > 0) return;
    this.estado = 'fugindo';
    this.cronometroEstado = 0;
    const angulo = this.rng() * Math.PI * 2;
    this.destino.set(
      this.ancora.x + Math.cos(angulo) * 4,
      this.pisoY,
      this.ancora.z + Math.sin(angulo) * 4,
    );
  }

  /** A partir daqui quem manda na escala e na posição é a pokébola. */
  serCapturado() {
    this.estado = 'preso';
    this.cronometroEstado = 0;
  }

  reaparecer(em: THREE.Vector3) {
    this.estado = 'surgindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 1;
    this.alarme = Math.min(0.85, this.alarme + 0.25);
    this.raiz.visible = true;
    this.raiz.position.set(em.x, this.pisoY, em.z);
    this.destino.copy(this.raiz.position);
    this.impulso(3.2);
  }

  dissolver() {
    this.estado = 'saindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 0;
  }

  /** Zera os estagios. Recolher, desmaiar e ser solto de novo limpam a briga. */
  limparEstagios() {
    this.estagios.ataque = 0;
    this.estagios.defesa = 0;
    this.estagios.velocidade = 0;
  }

  /** Faz o companheiro nascer de novo ao ser solto da pokébola. */
  invocar(em: THREE.Vector3, pisoY: number) {
    this.limparEstagios();
    this.pisoY = pisoY;
    this.ancora.copy(em);
    this.raiz.visible = true;
    this.raiz.position.set(em.x, pisoY, em.z);
    this.raiz.scale.setScalar(0.001);
    this.destino.copy(this.raiz.position);
    this.estado = 'surgindo';
    this.cronometroEstado = 0;
    this.escalaAlvo = 1;
  }

  /** Vem até um ponto — a mão estendida com uma fruta, por exemplo. */
  chamarPara(ponto: THREE.Vector3) {
    // Chamar desfaz o "fica aí": é a ordem contrária, e ela tem de ganhar.
    this.posto = null;
    this.destino.set(ponto.x, this.pisoY, ponto.z);
    this.olharPara = ponto.clone();
    this.impulso(1.8);
  }

  /**
   * Vá até ali. É o comando do gatilho segurado: você aponta para o chão, a
   * linha acompanha a mão e, ao soltar, ele caminha até a marca.
   *
   * Diferente de `chamarPara`, isto TOMA o controle: enquanto houver destino
   * comandado, o companheiro não volta a andar ao seu lado — senão ele daria
   * meia-volta no meio do caminho, que é exatamente o que não se quer de uma
   * ordem.
   */
  irPara(ponto: THREE.Vector3) {
    if (this.desmaiado || this.estado === 'preso' || this.estado === 'saindo') return;
    // O posto antigo morre aqui: quem recebe uma ordem nova não guarda a velha.
    // O novo só nasce quando ele CHEGAR (ver o estado 'indo').
    this.posto = null;
    // A altura do destino e guardada: apontar para a mesa manda ele PARA a
    // mesa, e o apoio sobe junto conforme ele chega (ver o estado 'indo').
    this.destinoComandado = ponto.clone();
    this.destino.copy(this.destinoComandado);
    this.olharPara = this.destinoComandado.clone();
    this.estado = 'indo';
    this.cronometroEstado = 0;
    this.impulso(1.6);
  }

  get indoParaAlgumLugar(): boolean {
    return this.destinoComandado !== null;
  }

  /** Ele está parado onde você mandou, em vez de te seguir. */
  get ficandoNoPosto(): boolean {
    return this.posto !== null;
  }

  /**
   * A isca funcionou: ele larga o passeio e vem até você.
   *
   * Diferente de `irPara`, isto **segura o alarme**. Um selvagem que se
   * aproxima de você por vontade própria e depois foge porque chegou perto
   * demais teria desfeito o próprio gesto — e a isca serve exatamente para
   * encurtar a distância que de outro jeito o faria sumir.
   *
   * O destino vem com um afastamento: ele para a um braço de você, não em cima.
   */
  atrairPara(ponto: THREE.Vector3, segundos = 14) {
    if (this.desmaiado || this.estado === 'preso' || this.estado === 'saindo') return;
    if (this.papel !== 'selvagem') return;

    const parada = new THREE.Vector3(ponto.x, this.pisoY, ponto.z);
    const daqui = new THREE.Vector3(
      this.raiz.position.x - ponto.x,
      0,
      this.raiz.position.z - ponto.z,
    );
    if (daqui.lengthSq() > 1e-6) parada.addScaledVector(daqui.normalize(), this.folga(0.75, 1.3));

    this.atracao = segundos;
    this.alarme = Math.max(0, this.alarme - 0.45);
    this.destinoComandado = parada;
    this.destino.copy(parada);
    this.olharPara = ponto.clone();
    this.estado = 'indo';
    this.cronometroEstado = 0;
    this.impulso(1.4);
  }

  /** Enquanto durar, ele não foge e vai perdendo o medo. */
  get atraido(): boolean {
    return this.atracao > 0;
  }

  cancelarComando() {
    this.destinoComandado = null;
    this.posto = null;
    if (this.estado === 'indo') this.estado = 'ocioso';
  }

  /**
   * A mão está encostada nele agora. Chamado todo quadro enquanto durar — o
   * contador segura a pose por um instante depois que a mão sai, para o bicho
   * não desligar o cafuné a cada tremida do braço.
   */
  receberCarinho() {
    this.carinho = 0.5;
    if (this.animador.gestoAtivo !== 'cafune') this.animador.disparar('cafune', 1.5);
    if (this.estado === 'ocioso' || this.estado === 'atento' || this.estado === 'indo') {
      this.cancelarComando();
      this.destino.copy(this.raiz.position);
    }
  }

  get recebendoCarinho(): boolean {
    return this.carinho > 0;
  }

  acenar() {
    if (this.desmaiado) return;
    this.animador.disparar('acenar');
  }

  comemorar() {
    if (this.desmaiado) return;
    this.animador.disparar('comemorar');
    this.impulso(2.1);
  }

  /**
   * A mão está na cabeça dele, NESTE ponto.
   *
   * Chamar isto a cada quadro é o que faz a cabeça ACOMPANHAR o carinho em vez
   * de só receber: você move a mão para o lado e ela vai atrás, como um bicho
   * que encosta a cabeça na mão de quem está fazendo cafuné. Parar de chamar
   * solta a cabeça sozinho, um quarto de segundo depois — sem isso, tirar a mão
   * deixaria o pescoço travado olhando para o vazio.
   */
  seguirCarinho(ponto: THREE.Vector3) {
    (this.maoNoCafune ??= new THREE.Vector3()).copy(ponto);
    this.tempoSemCafune = 0;
  }

  /**
   * Você o pegou no colo.
   *
   * O corpo sai da física: enquanto está na sua mão, quem diz onde ele está é a
   * sua mão, e a gravidade do jogo não tem nada a dizer sobre isso. Ele continua
   * animando, olhando em volta e respondendo a carinho — é um bicho no colo, não
   * um objeto carregado.
   */
  pegarNoColo() {
    if (this.desmaiado || this.estado === 'preso' || this.estado === 'saindo') return false;
    this.estado = 'colo';
    this.cronometroEstado = 0;
    this.velY = 0;
    this.noChao = false;
    this.destinoComandado = null;
    return true;
  }

  /** Você abriu a mão: ele cai de onde estava e volta a viver sozinho. */
  soltarDoColo() {
    if (this.estado !== 'colo') return;
    this.estado = 'ocioso';
    this.cronometroEstado = 0;
    this.noChao = false;
    // Sem impulso: ele CAI do ponto onde a sua mão estava. Jogar para cima
    // seria uma decisão que você não tomou.
    this.velY = 0;
  }

  /** A cabeça no mundo — é nela que a mão precisa encostar para o cafuné. */
  pontoDaCabeca(alvo = new THREE.Vector3()): THREE.Vector3 {
    this.raiz.updateMatrixWorld();
    const osso = this.animador.pontoDaCabeca(alvo);
    if (osso) return osso;
    // Sem esqueleto reconhecível, o alto do corpo serve.
    const p = this.raiz.position;
    return alvo.set(p.x, p.y + this.altura * 0.8 * this.raiz.scale.y, p.z);
  }

  atualizar(dt: number, jogador: THREE.Vector3, terreno?: Terreno) {
    if (!this.viva) return;
    if (terreno) this.terreno = terreno;

    // Hit-stop: alguns quadros em que este bicho não avança em nada — nem
    // estado, nem passo, nem respiração. Ver `congelar`. O `return` vem antes
    // de tudo de propósito: uma pausa que deixa a animação de ócio rodando por
    // baixo não é uma pausa, é um bicho parado no lugar mexendo a cabeça.
    if (this.pausa > 0) {
      this.pausa -= dt;
      return;
    }

    // O recuo do golpe, gasto nos primeiros quadros depois do impacto. Não
    // mexe na âncora nem no destino, então o passeio do bicho o traz de volta
    // sozinho — que é o que faz o empurrão parecer um empurrão e não um teleporte.
    if (this.recuo.lengthSq() > 1e-8) {
      const passo = Math.min(1, dt * 9);
      this.raiz.position.addScaledVector(this.recuo, passo);
      this.recuo.multiplyScalar(1 - passo);
    }

    this.tempo += dt;
    this.cronometroEstado += dt;
    if (this.recarga > 0) this.recarga -= dt;
    if (this.tremor > 0) this.tremor = Math.max(0, this.tremor - dt * 3.5);
    if (this.impacto > 0) this.impacto = Math.max(0, this.impacto - dt * 4.5);
    if (this.carinho > 0) this.carinho = Math.max(0, this.carinho - dt);
    if (this.atracao > 0) this.atracao = Math.max(0, this.atracao - dt);

    // Distância no plano: a cabeça do jogador fica ~1,6 m acima do chão, então
    // medir em 3D faria o Pokémon achar que ninguém chegou perto.
    const distJogador = Math.hypot(jogador.x - this.raiz.position.x, jogador.z - this.raiz.position.z);

    switch (this.estado) {
      case 'surgindo':
        this.escalaAlvo = 1;
        if (this.cronometroEstado > 0.55) this.estado = 'ocioso';
        break;

      case 'atacando':
        this.olharPara = this.alvo ? this.alvo.centro : this.mirando;
        if (this.cronometroEstado > 0.7) this.estado = 'ocioso';
        break;

      case 'ferido':
        if (this.cronometroEstado > 0.45) this.estado = 'ocioso';
        break;

      case 'desmaiado':
        this.olharPara = null;
        this.destinoComandado = null;
        // Tomba de lado e fica.
        this.raiz.rotation.z = THREE.MathUtils.lerp(this.raiz.rotation.z, 1.35, Math.min(1, dt * 5));
        this.animar(dt);
        return;

      case 'indo': {
        // Ordem sua: vai até a marca e só. Chegando, volta ao normal — e o
        // companheiro só então recomeça a andar ao seu lado.
        const alvo = this.destinoComandado;
        if (!alvo) {
          this.estado = 'ocioso';
          break;
        }
        this.olharPara = alvo;
        const falta = Math.hypot(alvo.x - this.raiz.position.x, alvo.z - this.raiz.position.z);
        // O apoio sobe (ou desce) em rampa conforme ele se aproxima: subir na
        // mesa de uma vez seria um teletransporte vertical, e subir so no fim
        // faria ele atravessar a lateral do movel.
        if (Math.abs(alvo.y - this.pisoY) > 0.005) {
          const perto = THREE.MathUtils.clamp(1 - falta / 1.2, 0, 1);
          this.pisoY += (alvo.y - this.pisoY) * Math.min(1, dt * (1.2 + perto * 5));
        }
        // 12 s de teto: um destino atrás de um sofá deixaria ele empurrando o
        // sofá para sempre.
        // Chegar é chegar no chão certo, não só na vertical certa: com a marca
        // em cima da mesa, parar assim que o X e o Z batem deixaria o bicho
        // pousado no ar a meio caminho da rampa.
        const noApoio = Math.abs(alvo.y - this.pisoY) < 0.03;
        if ((falta < this.folga(0.12, 0.45) && noApoio) || this.cronometroEstado > 12) {
          this.destinoComandado = null;
          this.estado = 'ocioso';
          this.olharPara = jogador.clone();
          this.animador.disparar('olhar', 1.4);
          // Chegou (ou desistiu de chegar): é AQUI que ele fica. O posto é o
          // ponto onde ele de fato parou, e não a marca — se um sofá barrou o
          // caminho, o lugar dele é deste lado do sofá.
          if (this.papel === 'companheiro' && this.atracao <= 0) {
            this.posto = this.raiz.position.clone();
            this.ancora.copy(this.raiz.position);
          }
          // Chegou atraído pela isca: o passeio dele passa a ser AQUI. Sem isto
          // ele daria meia-volta no quadro seguinte, porque o passeio do
          // selvagem orbita a âncora onde ele nasceu.
          if (this.atracao > 0) this.ancora.copy(this.raiz.position);
        } else {
          // Vai pulando, como todo mundo neste jogo anda — quem voa, voando.
          this.impulso(1.7);
        }
        break;
      }

      case 'ocioso':
      case 'atento':
        this.comportamentoLivre(dt, jogador, distJogador);
        break;

      case 'fugindo':
        this.olharPara = null;
        this.impulso(2.6);
        if (this.cronometroEstado > 1.4) this.dissolver();
        break;

      case 'preso':
        break;

      case 'saindo':
        if (this.raiz.scale.x < 0.02) this.viva = false;
        break;

      case 'colo':
        // No colo quem manda na posição é a MÃO, e ela escreve direto na raiz
        // (ver `porNoColo` em src/game.ts). O `mover` fica de fora por isso: ele
        // aplicaria gravidade e passada num bicho que está no ar porque alguém
        // o está segurando. O resto da vida continua — ele anima, olha em volta
        // e responde a carinho.
        this.olharPara = jogador;
        this.velocidadeAndando = 0;
        this.noChao = false;
        this.animar(dt);
        return;
    }

    this.mover(dt);
    this.animar(dt);
  }

  /** Passeio do selvagem, ou acompanhar o treinador no caso do companheiro. */
  private comportamentoLivre(dt: number, jogador: THREE.Vector3, distJogador: number) {
    if (this.papel === 'companheiro') {
      // Recebendo carinho ele não sai do lugar. Sem isto, a regra de "fica a
      // 1,1 m do treinador" faria ele fugir da própria mão que o afaga, já que
      // encostar nele significa estar perto demais.
      if (this.carinho > 0) {
        this.destino.copy(this.raiz.position);
        this.olharPara = jogador;
        return;
      }

      // Mandado ficar: ele monta guarda no posto. Passeia um palmo em volta,
      // como faria qualquer bicho esperando, e olha para você — mas não sai
      // dali. Sem este ramo, a regra de "fica a 1,1 m do treinador" logo abaixo
      // desfazia a ordem no quadro seguinte ao da chegada.
      if (this.posto) {
        const doPosto = Math.hypot(
          this.raiz.position.x - this.posto.x,
          this.raiz.position.z - this.posto.z,
        );
        // Empurrado para longe do posto (um golpe, um esbarrão): volta para ele.
        if (doPosto > 0.5) {
          this.destino.set(this.posto.x, this.pisoY, this.posto.z);
          this.impulso(1.7);
        } else {
          this.proximoPulo -= dt;
          if (this.proximoPulo <= 0 && this.noChao) {
            this.proximoPulo = entre(this.rng, 1.8, 3.6);
            const angulo = this.rng() * Math.PI * 2;
            const raio = entre(this.rng, 0.05, 0.28);
            this.destino.set(
              this.posto.x + Math.cos(angulo) * raio,
              this.pisoY,
              this.posto.z + Math.sin(angulo) * raio,
            );
            this.impulso(entre(this.rng, 1.3, 1.9));
          }
        }
        this.olharPara = this.alvo && !this.alvo.desmaiado ? this.alvo.centro : jogador;
        return;
      }

      // Fica ao lado do jogador, sem colar nele.
      const paraJogador = new THREE.Vector3(
        jogador.x - this.raiz.position.x,
        0,
        jogador.z - this.raiz.position.z,
      );
      const dist = paraJogador.length();
      if (dist > this.folga(1.1, 1.5)) {
        // Anda até um ponto um pouco à frente e ao lado do treinador.
        const lado = new THREE.Vector3(-paraJogador.z, 0, paraJogador.x).normalize();
        this.destino
          .copy(jogador)
          .addScaledVector(paraJogador.normalize(), -this.folga(0.75, 1.2))
          .addScaledVector(lado, 0.45);
        this.destino.y = this.pisoY;
        this.impulso(1.9);
      }
      this.olharPara = this.alvo && !this.alvo.desmaiado ? this.alvo.centro : jogador;
      return;
    }

    // --- selvagem ---
    this.estado = distJogador < 2.2 ? 'atento' : 'ocioso';
    this.olharPara =
      this.alvo && !this.alvo.desmaiado
        ? this.alvo.centro
        : this.estado === 'atento'
          ? jogador
          : null;

    if (this.atracao > 0) {
      // A isca desfaz o medo em vez de acumula-lo, mesmo com voce colado nele.
      this.alarme = Math.max(0, this.alarme - dt * 0.5);
    } else if (distJogador < this.folga(0.85, 1.1)) {
      this.alarme = Math.min(1, this.alarme + dt * 0.45);
    } else {
      this.alarme = Math.max(0, this.alarme - dt * 0.12);
    }
    if (this.alarme >= 1) {
      this.fugir();
      return;
    }

    // De tempos em tempos ele muda de canto. Sem isto a âncora era o berço
    // para sempre e o bicho orbitava um raio de um palmo pelo resto da vida:
    // voltar ao quarto meia hora depois encontrava todo mundo exatamente onde
    // tinha nascido. Agora a âncora anda, e ele anda com ela.
    //
    // Parado quando está atento a você: bicho que te encara não sai vagando.
    this.proximaAndanca -= dt;
    if (this.proximaAndanca <= 0 && this.noChao && this.estado === 'ocioso' && this.atracao <= 0) {
      this.proximaAndanca = entre(this.rng, 7, 16);
      this.escolherNovoCanto();
    }

    this.proximoPulo -= dt;
    if (this.proximoPulo <= 0 && this.noChao) {
      this.proximoPulo = entre(this.rng, 1.4, 3.4) * (this.estado === 'atento' ? 0.6 : 1);
      const angulo = this.rng() * Math.PI * 2;
      const raio = entre(this.rng, 0.15, this.folga(Pokemon.RAIO_PASSEIO, 1.2));
      this.destino.set(
        this.ancora.x + Math.cos(angulo) * raio,
        this.pisoY,
        this.ancora.z + Math.sin(angulo) * raio,
      );
      this.impulso(entre(this.rng, 1.5, 2.4));
    }
  }

  /**
   * Manda a âncora para outro canto do quarto, se houver chão que sirva lá.
   *
   * O candidato só vale se o terreno debaixo dele estiver no MESMO nível em
   * que o bicho está: assim ele caminha pelo chão e contorna a mesa em vez de
   * escalar o tampo de repente, e não sai andando para dentro do degrau.
   *
   * Sem leitura do quarto (Space Setup vazio, sessão sem planos) o candidato
   * passa direto: é melhor um bicho que perambula às cegas do que um bicho
   * pregado no lugar, que é de onde estamos vindo.
   */
  private escolherNovoCanto() {
    const LIMITE_DO_BERCO = 6;
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const angulo = this.rng() * Math.PI * 2;
      const passo = entre(this.rng, 0.9, 2.6);
      const x = this.ancora.x + Math.cos(angulo) * passo;
      const z = this.ancora.z + Math.sin(angulo) * passo;
      if (Math.hypot(x - this.berco.x, z - this.berco.z) > LIMITE_DO_BERCO) continue;
      if (this.terreno) {
        const sonda = new THREE.Vector3(x, this.raiz.position.y, z);
        if (Math.abs(this.terreno.alturaEm(sonda) - this.pisoY) > 0.2) continue;
      }
      this.ancora.set(x, this.pisoY, z);
      this.proximoPulo = 0; // já sai andando para lá
      return;
    }
  }

  /**
   * Põe o apoio na altura do que estiver debaixo dele AGORA.
   *
   * É o que faz o bicho reconhecer o terreno enquanto anda: o chão do quarto,
   * o degrau, o tapete, o tampo da mesa. Sem isto ele mantinha para sempre o
   * `pisoY` do ponto onde nasceu e atravessava tudo na horizontal.
   *
   * O estado `indo` fica de fora porque ele já tem a própria rampa, que sobe
   * conforme a distância que falta — subir na mesa por esta função aqui seria
   * um degrau vertical instantâneo no meio do caminho.
   *
   * Descer é mais lento que subir de propósito: um bicho que sai do tampo da
   * mesa deve cair pela borda (a gravidade cuida disso), não escorregar no ar.
   */
  private acompanharTerreno(dt: number) {
    if (!this.terreno || this.estado === 'indo') return;
    const alvo = this.terreno.alturaEm(this.raiz.position);
    const diferenca = alvo - this.pisoY;
    if (Math.abs(diferenca) < 0.002) return;
    if (diferenca > 0) {
      // Subiu: acompanha depressa, senão o pé afunda no obstáculo.
      this.pisoY += diferenca * Math.min(1, dt * 6);
    } else if (this.noChao) {
      this.pisoY += diferenca * Math.min(1, dt * 2.5);
      this.noChao = false; // deixa a gravidade terminar a descida
    }
  }

  /** A velocidade de deslocamento, em metros por segundo, no estado atual. */
  private get velocidadeDeAndar(): number {
    if (this.estado === 'fugindo') return 2.6;
    // Ordem sua — ou isca sua — tem pressa própria: mais rápido do que passear e
    // mais devagar do que fugir, para dar para ver ele vindo.
    if (this.destinoComandado) return this.flutua ? 1.4 : 1.65;
    if (this.papel === 'companheiro') return 1.9;
    return this.flutua ? 0.9 : 1.15;
  }

  /** Um passo no plano, na direção do destino. Devolve quanto andou. */
  private passoNoPlano(dt: number): number {
    const plano = new THREE.Vector3(
      this.destino.x - this.raiz.position.x,
      0,
      this.destino.z - this.raiz.position.z,
    );
    const dist = plano.length();
    if (dist <= 0.001) return 0;
    const passo = Math.min(this.velocidadeDeAndar * dt, dist);
    plano.normalize().multiplyScalar(passo);
    this.raiz.position.add(plano);
    return passo;
  }

  private mover(dt: number) {
    if (this.estado === 'preso' || this.estado === 'saindo') return;

    this.acompanharTerreno(dt);

    if (this.flutua) {
      // Quem paira anda o tempo todo, sem gravidade e sem pulinho — e sobe ou
      // desce suave até a altura de voo, que acompanha o apoio que estiver
      // embaixo. Passar por cima da mesa levanta o Zubat junto.
      const passo = this.passoNoPlano(dt);
      this.velocidadeAndando = dt > 0 ? passo / dt : 0;

      const bobo = Math.sin(this.tempo * 1.9) * this.voo * 0.09;
      const alvoY = this.pisoY + this.voo + bobo;
      this.raiz.position.y += (alvoY - this.raiz.position.y) * Math.min(1, dt * 2.4);
      this.noChao = true;
      this.velY = 0;
    } else if (!this.noChao) {
      this.velY += GRAVIDADE * dt;
      this.raiz.position.y += this.velY * dt;

      const passo = this.passoNoPlano(dt);
      this.velocidadeAndando = dt > 0 ? passo / dt : 0;

      if (this.raiz.position.y <= this.pisoY) {
        // Aterrissou: guarda a força da queda para o corpo achatar um pouco.
        this.impacto = THREE.MathUtils.clamp(-this.velY / 4, 0, 1);
        this.raiz.position.y = this.pisoY;
        this.velY = 0;
        this.noChao = true;
      }
    } else {
      this.velocidadeAndando = Math.max(0, this.velocidadeAndando - dt * 4);
    }

    // A mão no cafuné manda na cabeça, e só nela: o corpo NÃO gira atrás dela.
    // Quem está sendo afagado vira o pescoço na direção da mão; um bicho que
    // roda o tronco inteiro atrás de um carinho parece estar tentando escapar.
    if (this.maoNoCafune) {
      this.tempoSemCafune += dt;
      if (this.tempoSemCafune > 0.25) {
        this.maoNoCafune = null;
      } else {
        const p = this.maoNoCafune;
        const anguloAlvo = Math.atan2(p.x - this.raiz.position.x, p.z - this.raiz.position.z);
        let delta = anguloAlvo - this.raiz.rotation.y;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        // Depressa: resposta a toque é reflexo, não decisão.
        this.residuoOlhar += (delta - this.residuoOlhar) * Math.min(1, dt * 9);
        return;
      }
    }

    const alvo = this.olharPara ?? (this.flutua || !this.noChao ? this.destino : null);
    if (alvo) {
      const anguloAlvo = Math.atan2(alvo.x - this.raiz.position.x, alvo.z - this.raiz.position.z);
      let delta = anguloAlvo - this.raiz.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      // O corpo gira devagar de propósito, e o que sobra vai para o pescoço: a
      // cabeça chega em você antes do resto, como a de qualquer bicho que ouviu
      // alguém chegar por trás.
      this.raiz.rotation.y += delta * Math.min(1, dt * 3.4);
      this.residuoOlhar = delta;
    } else {
      this.residuoOlhar *= Math.max(0, 1 - dt * 3);
    }
  }

  /**
   * A vida do bicho, toda escrita em `corpo` — nunca em `raiz` (que é do jogo)
   * nem em `ajuste` (que é da normalização do modelo).
   */
  private animar(dt: number) {
    const g = this.corpo.corpo;
    const nervoso = this.alarme;

    // A chama vive por conta própria: ela não depende de pose nenhuma, só do
    // tempo. Fica aqui porque `animar` é o único ponto por onde TODOS os
    // estados passam — inclusive o desmaiado, e a chama de um Charmander
    // desmaiado continua queimando.
    for (const chama of this.chamas) chama.atualizar(dt);

    // Os ossos primeiro (clipe assado e pose procedural), o corpo inteiro
    // depois. A ordem importa: o squash abaixo escreve em `corpo.scale`, que
    // é o pai de tudo o que o esqueleto acabou de posicionar.
    this.animador.atualizar(this.estado === 'desmaiado' ? dt * 0.35 : dt, {
      // Quem flutua nunca "anda": o ciclo de passada num Gastly moveria pernas
      // que ele não tem, e num Zubat moveria as asas no ritmo errado. Ele fica
      // na pose parada, e quem dá a sensação de deslocamento é o corpo inteiro.
      velocidade: this.flutua ? 0 : this.velocidadeAndando,
      alarme: nervoso,
      vida: this.hpFracao,
      encarar: this.estado === 'desmaiado' ? null : this.residuoOlhar,
      desmaiado: this.estado === 'desmaiado',
    });

    if (this.estado !== 'preso') {
      const escalaAtual = this.raiz.scale.x;
      this.raiz.scale.setScalar(escalaAtual + (this.escalaAlvo - escalaAtual) * Math.min(1, dt * 9));
    }

    // Respiração — mais ofegante com pouco HP ou muito alarme.
    const cansaco = 1 - this.hpFracao;
    const ritmo = 2.2 + nervoso * 3.5 + cansaco * 2.5;
    const respira = Math.sin(this.tempo * ritmo) * (0.03 + nervoso * 0.025 + cansaco * 0.02);
    let ex = 1 - respira * 0.6;
    let ey = 1 + respira;
    let ez = 1 - respira * 0.6;

    // Squash & stretch: estica subindo, achata na aterrissagem.
    if (!this.noChao) {
      const estica = THREE.MathUtils.clamp(this.velY * 0.05, -0.16, 0.16);
      ey *= 1 + estica;
      ex *= 1 - estica * 0.5;
      ez *= 1 - estica * 0.5;
    }
    if (this.impacto > 0) {
      const achata = this.impacto * 0.22;
      ey *= 1 - achata;
      ex *= 1 + achata * 0.6;
      ez *= 1 + achata * 0.6;
    }
    g.scale.set(ex, ey, ez);

    // Balanço leve no eixo do corpo: é o que tira os modelos parados da cara de
    // estátua. Quem anda depressa se inclina para a frente.
    const balanco = Math.sin(this.tempo * (3.4 + nervoso * 2)) * 0.035 * (0.4 + nervoso);
    const inclinacao = THREE.MathUtils.clamp(this.velocidadeAndando * 0.07, 0, 0.16);

    if (this.estado === 'atacando') {
      // Recua e joga o corpo para a frente, na direção do alvo.
      const t = Math.min(1, this.cronometroEstado / 0.35);
      const arranque = Math.sin(t * Math.PI);
      g.rotation.x = -0.34 * arranque;
      g.position.z = arranque * this.altura * 0.18;
    } else {
      g.rotation.x += (inclinacao - g.rotation.x) * Math.min(1, dt * 7);
      g.position.z += (0 - g.position.z) * Math.min(1, dt * 8);
    }
    g.rotation.z = balanco;
    // O gingado da passada mora aqui, e não no osso do quadril: aqui a escala
    // já é metro de sala, e no osso seria a unidade em que o arquivo foi salvo
    // — que varia por um fator de sessenta mil entre os 151. Ver src/anima.ts.
    g.position.y = this.animador.oscilacao * this.altura;

    // Tremor ao levar dano.
    if (this.tremor > 0) {
      this.raiz.position.x += Math.sin(this.tempo * 70) * 0.006 * this.tremor;
      this.raiz.position.z += Math.cos(this.tempo * 63) * 0.006 * this.tremor;
    }
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    for (const chama of this.chamas) chama.descartar();
    this.chamas.length = 0;
    this.corpo.descartar();
    this.viva = false;
  }
}
