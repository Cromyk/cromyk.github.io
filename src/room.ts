import * as THREE from 'three';

export interface Superficie {
  /** Centro da superfície, em coordenadas do mundo. */
  centro: THREE.Vector3;
  /** Meia-extensão no plano local (metros). */
  meiaLargura: number;
  meiaProfundidade: number;
  rotacaoY: number;
  /** O que o Quest acha que isso é: 'floor', 'table', 'couch', 'other'… */
  rotulo: string;
  altura: number;
  area: number;
  /**
   * Verdadeiro quando a superfície foi medida pelo chão sob os seus pés, e não
   * veio do Space Setup. Ver `sondarChao`.
   */
  sondada?: boolean;
  /** De onde ela veio. Ver `Sala`. */
  fonte?: 'plano' | 'malha' | 'sonda' | 'sintetica';
  /**
   * O que a ALTURA diz que isso é, quando o rótulo não diz.
   *
   * O Quest rotula o que o Space Setup pediu para você marcar, e a lista dele
   * não tem "cadeira": uma cadeira vem como `other`, `couch` ou nada. Mas a
   * altura não mente — um assento fica entre 35 e 55 cm do chão, uma mesa entre
   * 60 e 85, uma bancada entre 85 e 120. Ver `classificarPelaAltura`.
   */
  movel?: TipoDeMovel;
}

export type TipoDeMovel = 'assento' | 'mesa' | 'bancada' | 'alto';

/**
 * Que tipo de lugar uma criatura procura para nascer. Ver `pontoDeSpawn`.
 */
export type Preferencia = 'alto' | 'chao' | 'movel' | 'qualquer';

/**
 * Os rótulos que o Quest entrega, normalizados.
 *
 * A lista da Meta mudou de forma entre versões e entre as duas APIs: o mesmo
 * móvel pode chegar como `desk` ou `table`, e as superfícies verticais vêm como
 * `wall face`, com espaço. Normalizar num lugar só evita que meia dúzia de
 * comparações espalhadas pelo arquivo tenham de saber disso.
 */
function normalizarRotulo(bruto: string | undefined): string {
  const r = (bruto ?? 'other').toLowerCase().trim();
  if (r.startsWith('wall')) return r === 'wall art' ? 'wall art' : 'wall';
  if (r.startsWith('door')) return 'door';
  if (r.startsWith('window')) return 'window';
  if (r === 'desk') return 'table';
  if (r === 'global mesh') return 'malha';
  return r;
}

/**
 * Onde cabe um Pokémon. Cresceu junto com a leitura da malha: `storage`,
 * `screen` e `cabinet` são superfícies de verdade em cima das quais um bicho
 * pequeno pode aparecer, e ignorá-las era jogar fora metade do quarto.
 */
const ROTULOS_UTEIS = new Set([
  'floor',
  'table',
  'couch',
  'shelf',
  'bed',
  'other',
  'seat',
  'storage',
  'cabinet',
  'counter',
  'screen',
  'malha',
]);

/**
 * O que a altura acima do piso diz que um móvel é.
 *
 * As faixas são as de móvel de casa, e a folga entre elas é de propósito: um
 * puff de 42 cm e uma cadeira de 47 são a mesma coisa para o jogo — algo em que
 * um Pikachu senta. O que interessa é distinguir "sento", "apoio o cotovelo" e
 * "não alcanço", porque é isso que muda onde cada bicho nasce.
 */
export function classificarPelaAltura(acimaDoPiso: number): TipoDeMovel | undefined {
  if (acimaDoPiso < 0.22) return undefined;
  if (acimaDoPiso < 0.58) return 'assento';
  if (acimaDoPiso < 0.88) return 'mesa';
  if (acimaDoPiso < 1.25) return 'bancada';
  return 'alto';
}

/** Lado da célula do mapa de chão, em metros. */
const CELULA = 0.8;
/** Quantas células o mapa guarda. 260 × 0,64 m² ≈ 166 m² — uma casa. */
const MAX_CELULAS = 260;

const chaveDaCelula = (x: number, z: number) =>
  `${Math.round(x / CELULA)}:${Math.round(z / CELULA)}`;

/**
 * O seu quarto, mapeado enquanto você anda por ele.
 *
 * Há três fontes, e elas se somam em vez de se substituírem:
 *
 * 1. **Os planos do Space Setup** (`plane-detection`) — chão, mesa, sofá, cama,
 *    com rótulo semântico. É a melhor informação que existe, e é o que põe um
 *    Pokémon em cima da sua mesa em vez de no chão na frente dela. As
 *    superfícies VERTICAIS entram por uma porta própria: parede, porta e janela
 *    não são lugar de pousar, mas são lugar de não NASCER. Ver `pertoDeParede`.
 * 2. **A malha do quarto** (`mesh-detection`) — o scan que o Quest 3 faz do
 *    cômodo, uma malha por objeto. Cada uma vira a caixa que a envolve, e o
 *    topo da caixa vira superfície. É o que enxerga o móvel que ninguém marcou
 *    no Space Setup. Ver `lerMalhas`.
 * 3. **O chão sob os seus pés** (`hit-test`) — um raio para baixo a partir da
 *    cabeça, a cada meio segundo. É isto que faz o mapa CRESCER enquanto você
 *    caminha: cada passo carimba a célula onde você está.
 * 4. **Um piso sintético que te acompanha**, quando o aparelho não dá nenhuma
 *    das três.
 *
 * E o que o rótulo não diz, a ALTURA diz: ver `classificarPelaAltura`, que é
 * como uma cadeira vira uma cadeira num aparelho cuja lista de rótulos não tem
 * a palavra "cadeira".
 *
 * ## Por que somar, e não substituir
 *
 * `detectedPlanes` é o conjunto dos planos que o runtime está rastreando AGORA.
 * Ele encolhe quando você sai de perto — vira as costas para a mesa e a mesa
 * some da lista. A versão anterior deste arquivo trocava a lista inteira a cada
 * leitura, então o mapa era sempre só o que estava à vista, e o fallback era um
 * quadrado de 4,4 m fixo na ORIGEM da sessão. O resultado é o que se via no
 * headset: tudo acontecia em volta do ponto onde você entrou, e andar pela casa
 * não levava a lugar nenhum.
 *
 * Plano é estático no mundo. Então o que se viu uma vez, se guarda — indexado
 * pelo próprio `XRPlane`, que o runtime mantém estável entre quadros.
 */
export class Sala {
  /** A lista achatada que o resto do jogo consulta. */
  superficies: Superficie[] = [];
  /** Altura do chão POR PERTO — não a menor da casa inteira. */
  pisoY = 0;
  /** true assim que o dispositivo entregou pelo menos uma superfície real. */
  temDadosReais = false;

  /** Planos do Space Setup, guardados pela identidade que o runtime mantém. */
  private planos = new Map<XRPlane, Superficie>();
  /** As superfícies VERTICAIS: parede, porta, janela. Ver `pertoDeParede`. */
  private paredes = new Map<XRPlane, Superficie>();
  /** A malha do quarto, uma caixa por objeto reconhecido. Ver `lerMalhas`. */
  private malhas = new Map<XRMesh, { carimbo: number | undefined; superficie: Superficie }>();
  /** Chão medido a passos, uma célula por quadrado de 80 cm. */
  private celulas = new Map<string, Superficie>();
  /** O piso que acompanha o jogador quando não há nada real. */
  private sintetica: Superficie | null = null;

  private fonteSonda: XRHitTestSource | null = null;
  private sessaoDaSonda: XRSession | null = null;
  private pedindoSonda = false;
  private listaSuja = true;

  private grupoDebug = new THREE.Group();
  private mostrarDebug = false;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(private readonly cena: THREE.Object3D) {
    this.cena.add(this.grupoDebug);
    this.grupoDebug.visible = false;
  }

  /**
   * Esquece TUDO o que foi medido, porque as coordenadas deixaram de valer.
   *
   * ## O bug
   *
   * Sair da realidade mista e entrar de novo abre uma sessão NOVA, e com ela
   * um espaço de referência novo: no `local-floor`, a origem nasce onde você
   * está no momento em que entra — outra posição e outra direção. Tudo o que
   * a sala mediu na sessão anterior está carimbado em coordenadas que não
   * existem mais.
   *
   * O jogo não recarrega a página nessa volta (o `Jogo` é o mesmo objeto), e
   * o resultado é um quarto inteiro fora do lugar: o chão medido a passos
   * aponta para onde você NÃO está, os bichos nascem dentro do sofá de
   * verdade, e o Centro fica plantado no ar.
   *
   * Os planos e a malha se consertariam sozinhos — eles são relidos do quadro
   * —, mas as chaves são os objetos `XRPlane`/`XRMesh` da sessão MORTA, que
   * nunca mais aparecem: ficam ali para sempre, ocupando o mapa com fantasmas
   * que o runtime já esqueceu.
   *
   * As células do hit-test são o caso sem salvação: elas SÓ existem aqui, e
   * nada as reescreve. Esquecer é a única correção possível.
   */
  esquecerMedidas() {
    this.planos.clear();
    this.paredes.clear();
    this.malhas.clear();
    this.celulas.clear();
    this.sintetica = null;
    this.temDadosReais = false;
    // O piso volta a zero e não ao último valor: no espaço novo, y = 0 é o
    // seu chão por definição, e é o melhor palpite que existe até o primeiro
    // raio descer.
    this.pisoY = 0;
    this.listaSuja = true;
    this.recompor();
  }

  /**
   * Um piso à volta do jogador, usado enquanto o aparelho não disser nada.
   *
   * Ele ACOMPANHA você: sem isso, quem joga numa aba do navegador — ou num
   * Quest sem sala configurada — fica preso ao ponto onde entrou, porque não
   * há chão nenhum mapeado dois passos adiante.
   */
  usarFallback(jogador?: THREE.Vector3) {
    const centro = jogador
      ? new THREE.Vector3(jogador.x, this.pisoY, jogador.z)
      : new THREE.Vector3(0, 0, 0);
    if (!this.sintetica) {
      this.sintetica = {
        centro,
        meiaLargura: 2.6,
        meiaProfundidade: 2.6,
        rotacaoY: 0,
        rotulo: 'floor',
        altura: centro.y,
        area: 5.2 * 5.2,
      };
    } else {
      this.sintetica.centro.copy(centro);
      this.sintetica.altura = centro.y;
    }
    // Recompõe na hora: `usarFallback` é chamado de fora (o construtor do jogo,
    // os testes) e tem de deixar a sala utilizável sozinho, sem depender de um
    // `atualizar` que talvez só venha no próximo quadro.
    this.listaSuja = true;
    this.recompor();
  }

  // ------------------------------------------------------------- sondagem

  /**
   * Liga o raio que mede o chão sob a sua cabeça.
   *
   * O raio aponta para baixo a partir do `viewer space`, e não para a frente:
   * o que interessa não é onde você está olhando, é em que altura está o piso
   * em que você está PISANDO. É essa medida que carimba o mapa a cada passo e
   * que acerta o degrau, o tapete e o andar de cima.
   *
   * Falha em silêncio quando `hit-test` não foi concedido — o jogo continua com
   * os planos e com o piso sintético.
   */
  async prepararSondagem(sessao: XRSession | null) {
    if (!sessao || this.pedindoSonda) return;
    // Sair e voltar para a realidade mista abre uma sessão NOVA, e a fonte da
    // anterior morreu com ela. Comparar a sessão é o que faz a segunda entrada
    // mapear tanto quanto a primeira.
    if (this.fonteSonda && this.sessaoDaSonda === sessao) return;
    if (this.sessaoDaSonda !== sessao) {
      this.fonteSonda?.cancel?.();
      this.fonteSonda = null;
    }
    if (typeof sessao.requestHitTestSource !== 'function') return;
    this.sessaoDaSonda = sessao;
    this.pedindoSonda = true;
    try {
      const viewer = await sessao.requestReferenceSpace('viewer');
      const paraBaixo = new XRRay(
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 0, y: -1, z: 0, w: 0 },
      );
      const fonte = await sessao.requestHitTestSource?.({ space: viewer, offsetRay: paraBaixo });
      this.fonteSonda = fonte ?? null;
    } catch {
      // Sem permissão, sem sondagem. Não é erro: é uma fonte a menos.
      this.fonteSonda = null;
    } finally {
      this.pedindoSonda = false;
    }
  }

  /**
   * Carimba a célula onde o jogador está com a altura medida do chão.
   *
   * O mapa cresce por célula de 80 cm para não virar um carimbo por quadro: a
   * granularidade é o que separa "mapear a casa" de "guardar um rastro de
   * pegadas".
   */
  private sondarChao(frame: XRFrame, espacoRef: XRReferenceSpace, jogador: THREE.Vector3) {
    if (!this.fonteSonda) return;
    const acertos = frame.getHitTestResults(this.fonteSonda);
    if (acertos.length === 0) return;
    const pose = acertos[0].getPose(espacoRef);
    if (!pose) return;

    const y = pose.transform.position.y;
    // Um metro acima da cabeça ou três abaixo dos pés não é o chão desta sala.
    if (!Number.isFinite(y) || y > jogador.y || y < jogador.y - 3) return;

    this.temDadosReais = true;
    const chave = chaveDaCelula(jogador.x, jogador.z);
    const existente = this.celulas.get(chave);
    if (existente) {
      // Média móvel: a sondagem treme alguns milímetros por quadro, e deixar a
      // altura pular faz o Pokémon vibrar em pé no lugar.
      existente.centro.y += (y - existente.centro.y) * 0.25;
      existente.altura = existente.centro.y;
      return;
    }

    this.celulas.set(chave, {
      centro: new THREE.Vector3(
        Math.round(jogador.x / CELULA) * CELULA,
        y,
        Math.round(jogador.z / CELULA) * CELULA,
      ),
      meiaLargura: CELULA * 0.5,
      meiaProfundidade: CELULA * 0.5,
      rotacaoY: 0,
      rotulo: 'floor',
      altura: y,
      area: CELULA * CELULA,
      sondada: true,
    });
    this.listaSuja = true;
    this.despejarCelulasDistantes(jogador);
  }

  /** O mapa não cresce para sempre: o que ficou longe demais sai. */
  private despejarCelulasDistantes(jogador: THREE.Vector3) {
    if (this.celulas.size <= MAX_CELULAS) return;
    const porDistancia = [...this.celulas.entries()].sort(
      (a, b) =>
        b[1].centro.distanceToSquared(jogador) - a[1].centro.distanceToSquared(jogador),
    );
    for (let i = 0; i < porDistancia.length && this.celulas.size > MAX_CELULAS; i++) {
      this.celulas.delete(porDistancia[i][0]);
    }
  }

  // ------------------------------------------------------------- planos

  /**
   * Relê os planos e soma ao que já se sabia. Barato o suficiente para rodar a
   * cada meio segundo.
   */
  atualizar(frame: XRFrame | null, espacoRef: XRReferenceSpace | null, jogador: THREE.Vector3) {
    if (frame && espacoRef) {
      this.lerPlanos(frame, espacoRef);
      this.lerMalhas(frame, espacoRef);
      this.sondarChao(frame, espacoRef, jogador);
    }

    // O piso sintético existe enquanto não houver nada real por perto; com o
    // mapa crescendo ele some sozinho, e é isso que se quer.
    if (!this.temPisoPerto(jogador)) this.usarFallback(jogador);
    else this.sintetica = null;

    if (this.listaSuja) this.recompor();
    this.pisoY = this.alturaDoPisoPerto(jogador);
    if (this.mostrarDebug) this.redesenharDebug();
  }

  private lerPlanos(frame: XRFrame, espacoRef: XRReferenceSpace) {
    const detectados = (frame as XRFrame & { detectedPlanes?: XRPlaneSet }).detectedPlanes;
    if (!detectados || detectados.size === 0) return;

    for (const plano of detectados) {
      const rotulo = normalizarRotulo((plano as XRPlane & { semanticLabel?: string }).semanticLabel);

      // As superfícies VERTICAIS vão para outra lista: parede, porta e janela
      // não são lugar de nascer nem de pisar, mas são lugar de NÃO nascer, e
      // até 18/09 o jogo simplesmente as jogava fora. Ver `paredes`.
      if (plano.orientation === 'vertical') {
        this.guardarParede(frame, espacoRef, plano, rotulo);
        continue;
      }
      if (plano.orientation !== 'horizontal') continue;
      if (!ROTULOS_UTEIS.has(rotulo)) continue;

      const pose = frame.getPose(plano.planeSpace, espacoRef);
      if (!pose) continue;

      // Extensão do polígono no espaço local do plano.
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of plano.polygon) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      const meiaLargura = (maxX - minX) * 0.5;
      const meiaProfundidade = (maxZ - minZ) * 0.5;
      // Superfície pequena demais não cabe criatura nenhuma.
      if (meiaLargura < 0.16 || meiaProfundidade < 0.16) continue;

      const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const centro = new THREE.Vector3((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5).applyMatrix4(m);
      const rotacaoY = new THREE.Euler().setFromRotationMatrix(m, 'YXZ').y;

      const guardada = this.planos.get(plano);
      if (
        guardada &&
        guardada.centro.distanceToSquared(centro) < 1e-6 &&
        Math.abs(guardada.meiaLargura - meiaLargura) < 1e-4
      ) {
        continue; // não mudou nada
      }

      this.planos.set(plano, {
        centro,
        meiaLargura,
        meiaProfundidade,
        rotacaoY,
        rotulo,
        altura: centro.y,
        area: meiaLargura * meiaProfundidade * 4,
        fonte: 'plano',
        movel: classificarPelaAltura(centro.y - this.pisoY),
      });
      this.temDadosReais = true;
      this.listaSuja = true;
    }
  }

  /** Guarda uma superfície vertical: parede, porta, janela, quadro. */
  private guardarParede(
    frame: XRFrame,
    espacoRef: XRReferenceSpace,
    plano: XRPlane,
    rotulo: string,
  ) {
    if (this.paredes.has(plano)) return;
    const pose = frame.getPose(plano.planeSpace, espacoRef);
    if (!pose) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of plano.polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const centro = new THREE.Vector3((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5).applyMatrix4(m);

    this.paredes.set(plano, {
      centro,
      // Num plano vertical, o "z" local sobe: a altura da parede é a
      // profundidade do polígono, e a largura continua sendo a largura.
      meiaLargura: (maxX - minX) * 0.5,
      meiaProfundidade: (maxZ - minZ) * 0.5,
      rotacaoY: new THREE.Euler().setFromRotationMatrix(m, 'YXZ').y,
      rotulo,
      altura: centro.y,
      area: (maxX - minX) * (maxZ - minZ),
      fonte: 'plano',
    });
    this.temDadosReais = true;
  }

  /**
   * A MALHA do quarto — `mesh-detection`, a terceira fonte, ligada em 18/09.
   *
   * O Quest 3 varre o cômodo com os sensores de profundidade e devolve uma
   * malha por objeto reconhecido, mais uma malha grande do cômodo inteiro (a
   * `global mesh`). Isso é mapeamento de verdade, e é o que responde ao pedido
   * do playtest: *"quero mapeamento dinâmico do ambiente, reconhecendo chão,
   * mesa, cadeira, pessoas"*. Estava na lista de features pedidas ao
   * `requestSession` desde sempre e nunca tinha sido lido.
   *
   * ## O que se tira de uma malha, e o que não
   *
   * Um Pokémon anda sobre uma superfície plana com um centro, um tamanho e uma
   * altura — não sobre um triângulo. Então cada malha vira a CAIXA que a
   * envolve, e o topo dessa caixa vira a superfície: é o tampo da mesa, o
   * assento da cadeira, o braço do sofá. Dá para fazer melhor (segmentar a
   * malha em patamares), mas isso custaria varrer milhares de triângulos por
   * quadro no headset, e o que se ganharia é precisão em cima de um móvel que o
   * bicho já usa inteiro.
   *
   * A `global mesh` é pulada: ela é o cômodo todo numa caixa só, e a caixa que
   * envolve o cômodo é o teto.
   */
  private lerMalhas(frame: XRFrame, espacoRef: XRReferenceSpace) {
    const detectadas = (frame as XRFrame & { detectedMeshes?: XRMeshSet }).detectedMeshes;
    if (!detectadas || detectadas.size === 0) return;

    for (const malha of detectadas) {
      const rotulo = normalizarRotulo((malha as XRMesh & { semanticLabel?: string }).semanticLabel);
      // O cômodo inteiro numa caixa só não é um móvel: é o teto.
      if (rotulo === 'malha' || rotulo === 'ceiling' || rotulo === 'wall') continue;

      const guardada = this.malhas.get(malha);
      // `lastChangedTime` é o carimbo que o runtime atualiza quando a malha
      // muda. Sem ele, remedir dezenas de malhas por leitura seria o item mais
      // caro deste arquivo — e elas quase nunca mudam depois do primeiro scan.
      const mudou = (malha as XRMesh & { lastChangedTime?: number }).lastChangedTime;
      if (guardada && mudou !== undefined && guardada.carimbo === mudou) continue;

      const pose = frame.getPose(malha.meshSpace, espacoRef);
      if (!pose) continue;

      const vertices = malha.vertices;
      if (!vertices || vertices.length < 9) continue;

      // A caixa envolvente, no espaço do mundo. Os vértices vêm em coordenadas
      // da própria malha, então cada um passa pela pose antes de entrar na
      // conta — é isto que põe a mesa no lugar da mesa.
      const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const caixa = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i + 2 < vertices.length; i += 3) {
        v.set(vertices[i], vertices[i + 1], vertices[i + 2]).applyMatrix4(m);
        caixa.expandByPoint(v);
      }

      const tamanho = caixa.getSize(new THREE.Vector3());
      const centro = caixa.getCenter(new THREE.Vector3());
      if (tamanho.x < 0.2 || tamanho.z < 0.2) continue;

      this.malhas.set(malha, {
        carimbo: mudou,
        superficie: {
          // O TOPO da caixa: é onde se pousa.
          centro: new THREE.Vector3(centro.x, caixa.max.y, centro.z),
          meiaLargura: tamanho.x * 0.5,
          meiaProfundidade: tamanho.z * 0.5,
          rotacaoY: 0,
          rotulo,
          altura: caixa.max.y,
          area: tamanho.x * tamanho.z,
          fonte: 'malha',
          movel: classificarPelaAltura(caixa.max.y - this.pisoY),
        },
      });
      this.temDadosReais = true;
      this.listaSuja = true;
    }
  }

  /** Reconstrói a lista achatada a partir das quatro fontes. */
  private recompor() {
    this.superficies = [
      ...this.planos.values(),
      ...[...this.malhas.values()].map((m) => m.superficie),
      ...this.celulas.values(),
    ];
    if (this.sintetica) this.superficies.push(this.sintetica);
    this.listaSuja = false;
  }

  /**
   * Há parede a menos de `folga` deste ponto?
   *
   * Serve para o selvagem não nascer dentro do armário nem meio metro para fora
   * da janela. É uma pergunta barata — as paredes de uma sala são umas quatro —
   * e a resposta é conservadora: mede a distância do ponto ao SEGMENTO da
   * parede vista de cima, ignorando a altura, porque um bicho a meio metro de
   * uma parede está perto dela em qualquer altura.
   */
  pertoDeParede(ponto: THREE.Vector3, folga = 0.35): boolean {
    for (const p of this.paredes.values()) {
      // A parede é um segmento no plano do chão, de comprimento 2·meiaLargura,
      // girado por rotacaoY em torno do centro.
      const dx = ponto.x - p.centro.x;
      const dz = ponto.z - p.centro.z;
      const cos = Math.cos(-p.rotacaoY);
      const sen = Math.sin(-p.rotacaoY);
      const ao = dx * cos - dz * sen;
      const perpendicular = dx * sen + dz * cos;
      if (Math.abs(ao) > p.meiaLargura + folga) continue;
      if (Math.abs(perpendicular) <= folga) return true;
    }
    return false;
  }

  /** Quantas paredes, portas e janelas o mapa conhece. */
  get paredesConhecidas(): number {
    return this.paredes.size;
  }

  // ------------------------------------------------------------- consultas

  /** Há chão conhecido debaixo (ou ao lado) do jogador? */
  private temPisoPerto(jogador: THREE.Vector3, raio = 1.6): boolean {
    for (const s of this.planos.values()) {
      if (this.cobre(s, jogador, raio)) return true;
    }
    for (const s of this.celulas.values()) {
      if (this.cobre(s, jogador, raio)) return true;
    }
    return false;
  }

  private cobre(s: Superficie, ponto: THREE.Vector3, folga: number): boolean {
    const dx = Math.abs(ponto.x - s.centro.x) - s.meiaLargura;
    const dz = Math.abs(ponto.z - s.centro.z) - s.meiaProfundidade;
    return Math.hypot(Math.max(0, dx), Math.max(0, dz)) <= folga;
  }

  /**
   * Altura do chão perto do jogador.
   *
   * A versão anterior usava o MENOR y de toda a sala, o que é a coisa certa
   * numa sala só e a coisa errada assim que você sobe um degrau ou anda até
   * outro cômodo — o Pokémon ficava desenhado no nível do lugar mais baixo que
   * o headset já tinha visto.
   */
  private alturaDoPisoPerto(jogador: THREE.Vector3): number {
    let melhor = this.pisoY;
    let menorDist = Infinity;
    const considerar = (s: Superficie) => {
      if (s.rotulo !== 'floor') return;
      // Chão acima da cabeça é o teto de outro andar, não o seu piso.
      if (s.altura > jogador.y - 0.3) return;
      const d = Math.hypot(jogador.x - s.centro.x, jogador.z - s.centro.z);
      if (d < menorDist) {
        menorDist = d;
        melhor = s.altura;
      }
    };
    for (const s of this.planos.values()) considerar(s);
    for (const s of this.celulas.values()) considerar(s);
    if (this.sintetica) considerar(this.sintetica);
    return Number.isFinite(melhor) ? melhor : 0;
  }

  /** Quantas superfícies o mapa já conhece — o HUD mostra isso crescendo. */
  get mapeadas(): number {
    return this.planos.size + this.malhas.size + this.celulas.size;
  }

  /**
   * O que o mapa reconheceu, em palavras — para o jogo poder DIZER.
   *
   * O número de superfícies subindo prova que o mapeamento está vivo e não diz
   * o que ele viu. "duas mesas, um sofá e uma cadeira" diz, e é a diferença
   * entre confiar no mapeamento e torcer por ele.
   */
  inventario(): Array<{ o_que: string; quantos: number }> {
    const conta = new Map<string, number>();
    const nomear = (s: Superficie): string | null => {
      if (s.rotulo === 'floor' || s.sondada) return null;
      if (s.rotulo === 'couch') return 'sofá';
      if (s.rotulo === 'bed') return 'cama';
      if (s.rotulo === 'table') return 'mesa';
      if (s.rotulo === 'shelf') return 'prateleira';
      if (s.rotulo === 'screen') return 'tela';
      // Sem rótulo que sirva, vale a altura: é assim que a cadeira aparece,
      // porque "cadeira" não existe na lista de rótulos do Quest.
      switch (s.movel) {
        case 'assento':
          return 'assento';
        case 'mesa':
          return 'mesa';
        case 'bancada':
          return 'bancada';
        case 'alto':
          return 'lugar alto';
        default:
          return null;
      }
    };

    for (const s of this.superficies) {
      const nome = nomear(s);
      if (!nome) continue;
      conta.set(nome, (conta.get(nome) ?? 0) + 1);
    }
    if (this.paredes.size > 0) conta.set('parede', this.paredes.size);
    return [...conta.entries()]
      .map(([o_que, quantos]) => ({ o_que, quantos }))
      .sort((a, b) => b.quantos - a.quantos);
  }

  /**
   * Sorteia um ponto de nascimento PERTO DE VOCÊ.
   *
   * Filtrar por proximidade antes de sortear é o que faz caminhar valer: o mapa
   * inteiro pode ter cento e poucas superfícies espalhadas pela casa, e sortear
   * entre todas colocaria o bicho na cozinha enquanto você está na sala. Só
   * entram as que têm alguma parte dentro do alcance.
   *
   * Superfície grande tem mais chance, mas mesas e sofás ganham um empurrão —
   * criatura em cima do móvel é mais divertida do que mais uma no chão.
   */
  pontoDeSpawn(
    jogador: THREE.Vector3,
    distMin = 1.0,
    distMax = 3.2,
    /**
     * Que tipo de lugar este bicho procura — item 3.1 do roteiro.
     *
     * O mapeamento da sala é a engenharia mais cara do jogo e era a que menos
     * rendia: servia para o bicho não atravessar o sofá e para você mandá-lo
     * subir na mesa. O cômodo vinha povoado por sorteio, e um Zubat nascia no
     * carpete ao lado de um Diglett com a mesma probabilidade.
     *
     * O jogo já sabe o rótulo semântico de cada superfície — `floor`, `table`,
     * `couch`, `bed`, `shelf` — e a altura de cada uma. Faltava perguntar.
     */
    procura: Preferencia = 'qualquer',
  ): { ponto: THREE.Vector3; rotulo: string } | null {
    const perto = this.superficies.filter((s) => this.cobre(s, jogador, distMax));
    if (perto.length === 0) return null;

    const peso = (s: Superficie) => {
      const bonus = s.rotulo === 'floor' ? 1 : 2.4;
      // Célula sondada é chão genérico e existe aos montes; um plano de verdade
      // vale mais, porque veio com rótulo e com a forma certa.
      const confianca = s.sondada ? 0.5 : 1;
      return Math.min(6, s.area) * bonus * confianca * this.afinidade(s, procura);
    };
    const total = perto.reduce((soma, s) => soma + peso(s), 0);
    if (total <= 0) return null;

    for (let tentativa = 0; tentativa < 24; tentativa++) {
      let alvo = Math.random() * total;
      let escolhida = perto[0];
      for (const s of perto) {
        alvo -= peso(s);
        if (alvo <= 0) {
          escolhida = s;
          break;
        }
      }

      // Uma margem para a criatura não nascer pendurada na quina.
      const margem = 0.18;
      const lx = Math.max(0.02, escolhida.meiaLargura - margem);
      const lz = Math.max(0.02, escolhida.meiaProfundidade - margem);
      const local = new THREE.Vector3((Math.random() * 2 - 1) * lx, 0, (Math.random() * 2 - 1) * lz);
      local.applyAxisAngle(new THREE.Vector3(0, 1, 0), escolhida.rotacaoY);
      const ponto = escolhida.centro.clone().add(local);

      const dist = Math.hypot(ponto.x - jogador.x, ponto.z - jogador.z);
      if (dist < distMin || dist > distMax) continue;
      // Desde que as paredes passaram a ser lidas (18/09), nascer encostado
      // numa delas deixou de ser sorte: meio metro de um Charizard contra a
      // parede é meio Charizard dentro do gesso.
      if (this.pertoDeParede(ponto, 0.3)) continue;
      return { ponto, rotulo: escolhida.rotulo };
    }
    return null;
  }

  /**
   * Um lugar EM CIMA de um móvel, para o companheiro ir por conta própria.
   *
   * O mapa do quarto sempre serviu para duas coisas: fazer os selvagens
   * nascerem em lugares que fazem sentido e impedir que alguém atravesse o
   * sofá. Nenhuma delas é o bicho USANDO o quarto — e um companheiro que sobe
   * na sua mesa para ficar na sua altura, ou que se enrosca no sofá quando está
   * acabado, é a diferença entre um pet e um cursor que te segue.
   *
   * Devolve a MAIOR superfície do tipo pedido dentro do alcance, e não uma
   * sorteada: é onde ele cabe com folga, e escolher a maior faz o
   * comportamento parecer decisão em vez de acaso. A margem tira as bordas —
   * um bicho pousado na quina de uma mesa lê como bug, não como escolha.
   */
  pousoPerto(
    perto: THREE.Vector3,
    tipos: readonly TipoDeMovel[],
    distMax = 3.5,
    margem = 0.22,
  ): { ponto: THREE.Vector3; rotulo: string; tipo: TipoDeMovel } | null {
    let melhor: Superficie | null = null;
    for (const s of this.superficies) {
      if (!s.movel || !tipos.includes(s.movel)) continue;
      if (!this.cobre(s, perto, distMax)) continue;
      // Precisa sobrar superfície depois da margem, senão não há onde pousar.
      if (s.meiaLargura <= margem || s.meiaProfundidade <= margem) continue;
      if (!melhor || s.area > melhor.area) melhor = s;
    }
    if (!melhor) return null;
    return {
      ponto: new THREE.Vector3(melhor.centro.x, melhor.altura, melhor.centro.z),
      rotulo: melhor.rotulo,
      tipo: melhor.movel!,
    };
  }

  /**
   * Um ponto atrás de um móvel, visto de onde o jogador está — item 3.3.
   *
   * O bicho assustado fugia em linha reta numa direção sorteada, quatro metros
   * adiante, o que num quarto quer dizer "para dentro da parede". Agora ele
   * corre para trás do sofá, e procurar um Pokémon vira uma coisa que acontece.
   *
   * "Atrás" é geometria simples e é o que basta: o ponto além do centro do
   * móvel, na direção que sai dos olhos do jogador e passa por ele. Não é
   * oclusão de verdade — para isso precisaria de visibilidade, que o jogo não
   * calcula —, mas num cômodo com móveis de altura de sofá acerta quase sempre,
   * e quando erra o bicho só correu para um canto qualquer, que é o que ele
   * fazia antes o tempo todo.
   */
  esconderijo(quem: THREE.Vector3, jogador: THREE.Vector3, alcance = 5): THREE.Vector3 | null {
    let melhor: THREE.Vector3 | null = null;
    let menorDistancia = Infinity;

    for (const s of this.superficies) {
      if (s.rotulo === 'floor' || s.sondada) continue;
      const acima = s.altura - this.pisoY;
      // Precisa ser alto o bastante para esconder alguma coisa, e baixo o
      // bastante para ser um móvel e não o teto.
      if (acima < 0.28 || acima > 1.3) continue;

      const daCabeca = new THREE.Vector3(s.centro.x - jogador.x, 0, s.centro.z - jogador.z);
      const distancia = daCabeca.length();
      if (distancia < 0.6 || distancia > alcance) continue;
      daCabeca.divideScalar(distancia);

      // Além do móvel, pela profundidade dele mais um palmo.
      const fundo = Math.max(s.meiaLargura, s.meiaProfundidade) + 0.25;
      const ponto = new THREE.Vector3(
        s.centro.x + daCabeca.x * fundo,
        this.alturaEm(new THREE.Vector3(s.centro.x + daCabeca.x * fundo, 0, s.centro.z + daCabeca.z * fundo)),
        s.centro.z + daCabeca.z * fundo,
      );

      // O mais perto de QUEM está fugindo, não do jogador: um bicho que corre
      // para o outro lado da sala passando na frente de você não está se
      // escondendo, está desfilando.
      const perto = ponto.distanceTo(quem);
      if (perto < menorDistancia) {
        menorDistancia = perto;
        melhor = ponto;
      }
    }

    return melhor;
  }

  /**
   * O quanto uma superfície serve a quem está procurando — 0 a ~4.
   *
   * É multiplicador, e não filtro, de propósito: num quarto onde o headset só
   * achou o chão, um Zubat que EXIGISSE altura não nasceria nunca. Aqui ele
   * prefere o armário com folga e aceita o carpete quando não há armário.
   *
   * A altura é medida contra o piso, e não em absoluto: `alturaEm` já sabe onde
   * é o chão de cada ponto, e uma casa com dois níveis não deve fazer a sala de
   * cima inteira contar como "em cima de um móvel".
   */
  private afinidade(s: Superficie, procura: Preferencia): number {
    if (procura === 'qualquer') return 1;

    const ehChao = s.rotulo === 'floor' || s.sondada;
    const acimaDoChao = s.altura - this.pisoY;
    const ehMovel = !ehChao && acimaDoChao > 0.22;

    switch (procura) {
      // Quem voa procura o alto: o armário, a estante, o topo da geladeira. É o
      // que faz um Zubat parecer um Zubat em vez de um rato com asas. A
      // classificação por altura (18/09) afina isto: uma bancada ou uma
      // prateleira valem mais do que um assento de 40 cm, que tecnicamente é
      // "móvel" e está na altura do joelho.
      case 'alto':
        if (!ehMovel) return 0.35;
        return s.movel === 'alto' ? 4 : s.movel === 'bancada' ? 3.2 : 1.4;
      // Quem cava, rasteja ou é feito de pedra fica no chão. Um Diglett em cima
      // da mesa de jantar é engraçado uma vez e errado sempre.
      case 'chao':
        return ehChao ? 2.4 : 0.25;
      // Os pequenos e curiosos sobem no que houver, mas não no alto de tudo: a
      // cadeira, o sofá e a mesa, não a estante.
      case 'movel':
        if (!ehMovel) return 0.6;
        return s.movel === 'assento' || s.movel === 'mesa' ? 3 : acimaDoChao < 1.0 ? 2 : 0.6;
      default:
        return 1;
    }
  }

  /**
   * Onde um raio encontra a primeira superfície mapeada.
   *
   * É o que faz apontar para a mesa significar a mesa. A conta ingênua — cruzar
   * o raio com um plano infinito na altura do chão e depois perguntar o que há
   * ali — dá a resposta errada exatamente no caso interessante: o ponto em que
   * o raio corta o nível do chão fica ATRÁS da mesa, e a mesa some da resposta.
   * Testar superfície por superfície e ficar com a mais próxima resolve.
   */
  apontar(
    origem: THREE.Vector3,
    direcao: THREE.Vector3,
    alcance = 8,
  ): { ponto: THREE.Vector3; rotulo: string; altura: number } | null {
    if (Math.abs(direcao.y) < 1e-4) return null;

    const eixoY = new THREE.Vector3(0, 1, 0);
    const local = new THREE.Vector3();
    let melhor: { ponto: THREE.Vector3; rotulo: string; altura: number } | null = null;
    let menorT = Infinity;

    for (const s of this.superficies) {
      const t = (s.altura - origem.y) / direcao.y;
      if (t <= 0.05 || t > alcance || t >= menorT) continue;

      const ponto = origem.clone().addScaledVector(direcao, t);
      local.copy(ponto).sub(s.centro).applyAxisAngle(eixoY, -s.rotacaoY);
      if (Math.abs(local.x) > s.meiaLargura || Math.abs(local.z) > s.meiaProfundidade) continue;

      menorT = t;
      melhor = { ponto: ponto.setY(s.altura), rotulo: s.rotulo, altura: s.altura };
    }
    return melhor;
  }

  /** Altura do apoio sob um ponto — para a criatura andar em cima da mesa. */
  alturaEm(ponto: THREE.Vector3): number {
    let melhor = this.pisoY;
    const eixoY = new THREE.Vector3(0, 1, 0);
    const local = new THREE.Vector3();
    for (const s of this.superficies) {
      local.copy(ponto).sub(s.centro).applyAxisAngle(eixoY, -s.rotacaoY);
      if (Math.abs(local.x) <= s.meiaLargura && Math.abs(local.z) <= s.meiaProfundidade) {
        if (s.altura > melhor && s.altura <= ponto.y + 0.05) melhor = s.altura;
      }
    }
    return melhor;
  }

  /** Se o contorno das superfícies está sendo desenhado. */
  get debugLigado(): boolean {
    return this.mostrarDebug;
  }

  alternarDebug(): boolean {
    this.mostrarContorno(!this.mostrarDebug);
    return this.mostrarDebug;
  }

  /**
   * Acende ou apaga o contorno sem passar pelo interruptor da engrenagem.
   *
   * É o que o mapeamento de boas-vindas usa: ele precisa mostrar a sala
   * aparecendo, e no fim devolver o desenho ao que o ajuste do jogador manda —
   * sem nunca ter mexido no ajuste.
   */
  mostrarContorno(ligado: boolean) {
    if (this.mostrarDebug === ligado) return;
    this.mostrarDebug = ligado;
    this.grupoDebug.visible = ligado;
    if (ligado) this.redesenharDebug();
  }

  /**
   * Contorno fino sobre cada superfície reconhecida — só para conferir a
   * leitura.
   *
   * A cor diz o que o mapa ACHA que aquilo é, e não só que achou alguma coisa:
   * verde o chão medido, azul o chão sondado a passos, amarelo o que veio da
   * malha do quarto, laranja os assentos e as mesas, vermelho as paredes.
   * Ligado o contorno, dá para andar pelo cômodo e ver, sem tirar o headset, se
   * a cadeira virou cadeira ou virou parte do chão.
   */
  private redesenharDebug() {
    this.limparDebug();

    const cores: Record<string, number> = {
      chao: 0x55e2c2,
      sondado: 0x8ab6ff,
      malha: 0xffd76a,
      movel: 0xff9f6b,
      parede: 0xff6b6b,
    };
    const materiais = new Map<string, THREE.LineBasicMaterial>();
    const material = (chave: string) => {
      const pronto = materiais.get(chave);
      if (pronto) return pronto;
      const novo = new THREE.LineBasicMaterial({
        color: cores[chave],
        transparent: true,
        opacity: chave === 'sondado' ? 0.35 : 0.7,
      });
      materiais.set(chave, novo);
      this.descartaveis.push(novo);
      return novo;
    };

    const contorno = (s: Superficie, chave: string, vertical: boolean) => {
      const a = s.meiaLargura;
      const b = s.meiaProfundidade;
      // Na parede o retângulo fica EM PÉ: o segundo eixo é a altura.
      const canto = (x: number, y: number) =>
        vertical ? new THREE.Vector3(x, y, 0) : new THREE.Vector3(x, 0, y);
      const geo = new THREE.BufferGeometry().setFromPoints([
        canto(-a, -b),
        canto(a, -b),
        canto(a, b),
        canto(-a, b),
        canto(-a, -b),
      ]);
      this.descartaveis.push(geo);
      const linha = new THREE.Line(geo, material(chave));
      linha.position.copy(s.centro);
      if (!vertical) linha.position.y += 0.005;
      linha.rotation.y = s.rotacaoY;
      this.grupoDebug.add(linha);
    };

    for (const s of this.superficies) {
      const chave = s.sondada
        ? 'sondado'
        : s.movel
          ? 'movel'
          : s.fonte === 'malha'
            ? 'malha'
            : 'chao';
      contorno(s, chave, false);
    }
    for (const p of this.paredes.values()) contorno(p, 'parede', true);
  }

  private limparDebug() {
    this.grupoDebug.clear();
    for (const d of this.descartaveis) d.dispose();
    this.descartaveis = [];
  }

  descartar() {
    this.fonteSonda?.cancel?.();
    this.fonteSonda = null;
    this.limparDebug();
    this.cena.remove(this.grupoDebug);
  }
}
