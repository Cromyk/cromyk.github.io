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
}

const ROTULOS_UTEIS = new Set(['floor', 'table', 'desk', 'couch', 'shelf', 'bed', 'other', 'seat']);

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
 *    Pokémon em cima da sua mesa em vez de no chão na frente dela.
 * 2. **O chão sob os seus pés** (`hit-test`) — um raio para baixo a partir da
 *    cabeça, a cada meio segundo. É isto que faz o mapa CRESCER enquanto você
 *    caminha: cada passo carimba a célula onde você está.
 * 3. **Um piso sintético que te acompanha**, quando o aparelho não dá nenhuma
 *    das duas.
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
      if (plano.orientation !== 'horizontal') continue;

      const rotulo = (plano as XRPlane & { semanticLabel?: string }).semanticLabel ?? 'other';
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
      });
      this.temDadosReais = true;
      this.listaSuja = true;
    }
  }

  /** Reconstrói a lista achatada a partir das três fontes. */
  private recompor() {
    this.superficies = [...this.planos.values(), ...this.celulas.values()];
    if (this.sintetica) this.superficies.push(this.sintetica);
    this.listaSuja = false;
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
    return this.planos.size + this.celulas.size;
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
  ): { ponto: THREE.Vector3; rotulo: string } | null {
    const perto = this.superficies.filter((s) => this.cobre(s, jogador, distMax));
    if (perto.length === 0) return null;

    const peso = (s: Superficie) => {
      const bonus = s.rotulo === 'floor' ? 1 : 2.4;
      // Célula sondada é chão genérico e existe aos montes; um plano de verdade
      // vale mais, porque veio com rótulo e com a forma certa.
      const confianca = s.sondada ? 0.5 : 1;
      return Math.min(6, s.area) * bonus * confianca;
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
      if (dist >= distMin && dist <= distMax) return { ponto, rotulo: escolhida.rotulo };
    }
    return null;
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

  /** Contorno fino sobre cada superfície reconhecida — só para conferir a leitura. */
  private redesenharDebug() {
    this.limparDebug();
    const material = new THREE.LineBasicMaterial({ color: 0x55e2c2, transparent: true, opacity: 0.7 });
    const materialSondado = new THREE.LineBasicMaterial({
      color: 0x8ab6ff,
      transparent: true,
      opacity: 0.35,
    });
    this.descartaveis.push(material, materialSondado);

    for (const s of this.superficies) {
      const pontos = [
        new THREE.Vector3(-s.meiaLargura, 0, -s.meiaProfundidade),
        new THREE.Vector3(s.meiaLargura, 0, -s.meiaProfundidade),
        new THREE.Vector3(s.meiaLargura, 0, s.meiaProfundidade),
        new THREE.Vector3(-s.meiaLargura, 0, s.meiaProfundidade),
        new THREE.Vector3(-s.meiaLargura, 0, -s.meiaProfundidade),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pontos);
      this.descartaveis.push(geo);
      const linha = new THREE.Line(geo, s.sondada ? materialSondado : material);
      linha.position.copy(s.centro);
      linha.position.y += 0.005;
      linha.rotation.y = s.rotacaoY;
      this.grupoDebug.add(linha);
    }
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
