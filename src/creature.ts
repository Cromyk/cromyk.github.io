import * as THREE from 'three';
import { ESTAGIOS_ZERADOS, statsNoNivel, type Especie, type Estagios } from './species';
import type { GestoDeAtaque } from './anima';
import type { Corpo } from './modelos';
import { criarRng, entre, type Rng } from './rng';
import { Animador } from './anima';

export type Papel = 'selvagem' | 'companheiro';

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
  | 'indo';

const GRAVIDADE = -9.0;

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
  private recarga = 0;
  private tremor = 0;
  /** Achatada ao aterrissar, volta sozinha. */
  private impacto = 0;
  private velocidadeAndando = 0;
  /** Ponto marcado por você no chão. Enquanto existir, ele vai até lá. */
  private destinoComandado: THREE.Vector3 | null = null;
  /** Quanto a cabeça ainda precisa girar para encarar o alvo, em radianos. */
  private residuoOlhar = 0;
  /** Segura o carinho por alguns segundos depois da mão sair. */
  private carinho = 0;
  /** Segundos restantes de atração pela isca. Ver atrairPara. */
  private atracao = 0;

  private static readonly RAIO_PASSEIO = 0.85;

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
    this.pisoY = pisoY;
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

  receberDano(quantidade: number) {
    if (this.desmaiado) return;
    this.hp = Math.max(0, this.hp - quantidade);
    this.tremor = 1;
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
    if (daqui.lengthSq() > 1e-6) parada.addScaledVector(daqui.normalize(), 0.75);

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

  /** A cabeça no mundo — é nela que a mão precisa encostar para o cafuné. */
  pontoDaCabeca(alvo = new THREE.Vector3()): THREE.Vector3 {
    this.raiz.updateMatrixWorld();
    const osso = this.animador.pontoDaCabeca(alvo);
    if (osso) return osso;
    // Sem esqueleto reconhecível, o alto do corpo serve.
    const p = this.raiz.position;
    return alvo.set(p.x, p.y + this.altura * 0.8 * this.raiz.scale.y, p.z);
  }

  atualizar(dt: number, jogador: THREE.Vector3) {
    if (!this.viva) return;
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
        if ((falta < 0.12 && noApoio) || this.cronometroEstado > 12) {
          this.destinoComandado = null;
          this.estado = 'ocioso';
          this.olharPara = jogador.clone();
          this.animador.disparar('olhar', 1.4);
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

      // Fica ao lado do jogador, sem colar nele.
      const paraJogador = new THREE.Vector3(
        jogador.x - this.raiz.position.x,
        0,
        jogador.z - this.raiz.position.z,
      );
      const dist = paraJogador.length();
      if (dist > 1.1) {
        // Anda até um ponto um pouco à frente e ao lado do treinador.
        const lado = new THREE.Vector3(-paraJogador.z, 0, paraJogador.x).normalize();
        this.destino
          .copy(jogador)
          .addScaledVector(paraJogador.normalize(), -0.75)
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
    } else if (distJogador < 0.85) {
      this.alarme = Math.min(1, this.alarme + dt * 0.45);
    } else {
      this.alarme = Math.max(0, this.alarme - dt * 0.12);
    }
    if (this.alarme >= 1) {
      this.fugir();
      return;
    }

    this.proximoPulo -= dt;
    if (this.proximoPulo <= 0 && this.noChao) {
      this.proximoPulo = entre(this.rng, 1.4, 3.4) * (this.estado === 'atento' ? 0.6 : 1);
      const angulo = this.rng() * Math.PI * 2;
      const raio = entre(this.rng, 0.15, Pokemon.RAIO_PASSEIO);
      this.destino.set(
        this.ancora.x + Math.cos(angulo) * raio,
        this.pisoY,
        this.ancora.z + Math.sin(angulo) * raio,
      );
      this.impulso(entre(this.rng, 1.5, 2.4));
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
    this.corpo.descartar();
    this.viva = false;
  }
}
