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
}

const ROTULOS_UTEIS = new Set(['floor', 'table', 'desk', 'couch', 'shelf', 'bed', 'other', 'seat']);

/**
 * Lê a malha da sala que o Quest 3 já conhece (Space Setup) e transforma em
 * superfícies onde dá para pôr criaturas. Se o dispositivo não expuser nada
 * — navegador comum, Quest sem sala configurada — cai num piso sintético.
 */
export class Sala {
  superficies: Superficie[] = [];
  pisoY = 0;
  /** true assim que o dispositivo entregou pelo menos uma superfície real. */
  temDadosReais = false;

  private grupoDebug = new THREE.Group();
  private mostrarDebug = false;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(private readonly cena: THREE.Object3D) {
    this.cena.add(this.grupoDebug);
    this.grupoDebug.visible = false;
  }

  /** Preenche com um piso circular à frente do jogador. Usado sem dados reais. */
  usarFallback(alturaOlho = 1.6) {
    this.pisoY = 0;
    this.temDadosReais = false;
    this.superficies = [
      {
        centro: new THREE.Vector3(0, 0, 0),
        meiaLargura: 2.2,
        meiaProfundidade: 2.2,
        rotacaoY: 0,
        rotulo: 'floor',
        altura: 0,
        area: 4.4 * 4.4,
      },
    ];
    void alturaOlho;
  }

  /**
   * Relê os planos detectados. Barato o suficiente para rodar a cada meio
   * segundo; o Quest só muda isso quando a sala muda.
   */
  atualizar(frame: XRFrame | null, espacoRef: XRReferenceSpace | null) {
    if (!frame || !espacoRef) return;

    // detectedPlanes só existe quando a feature 'plane-detection' foi concedida.
    const planos = (frame as XRFrame & { detectedPlanes?: XRPlaneSet }).detectedPlanes;
    if (!planos || planos.size === 0) return;

    const encontradas: Superficie[] = [];
    let menorY = Infinity;

    for (const plano of planos) {
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

      encontradas.push({
        centro,
        meiaLargura,
        meiaProfundidade,
        rotacaoY,
        rotulo,
        altura: centro.y,
        area: meiaLargura * meiaProfundidade * 4,
      });
      menorY = Math.min(menorY, centro.y);
    }

    if (encontradas.length === 0) return;

    this.superficies = encontradas;
    this.pisoY = Number.isFinite(menorY) ? menorY : 0;
    this.temDadosReais = true;
    if (this.mostrarDebug) this.redesenharDebug();
  }

  /**
   * Sorteia um ponto de nascimento: superfície grande tem mais chance, mas
   * mesas e sofás ganham um empurrão — criatura em cima do móvel é mais
   * divertida do que mais uma no chão.
   */
  pontoDeSpawn(jogador: THREE.Vector3, distMin = 1.0, distMax = 3.2): { ponto: THREE.Vector3; rotulo: string } | null {
    if (this.superficies.length === 0) return null;

    const peso = (s: Superficie) => {
      const bonus = s.rotulo === 'floor' ? 1 : 2.4;
      return Math.min(6, s.area) * bonus;
    };

    for (let tentativa = 0; tentativa < 24; tentativa++) {
      const total = this.superficies.reduce((soma, s) => soma + peso(s), 0);
      let alvo = Math.random() * total;
      let escolhida = this.superficies[0];
      for (const s of this.superficies) {
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

  /** Altura do apoio sob um ponto — para a criatura andar em cima da mesa. */
  alturaEm(ponto: THREE.Vector3): number {
    let melhor = this.pisoY;
    for (const s of this.superficies) {
      const local = ponto.clone().sub(s.centro).applyAxisAngle(new THREE.Vector3(0, 1, 0), -s.rotacaoY);
      if (Math.abs(local.x) <= s.meiaLargura && Math.abs(local.z) <= s.meiaProfundidade) {
        if (s.altura > melhor && s.altura <= ponto.y + 0.05) melhor = s.altura;
      }
    }
    return melhor;
  }

  alternarDebug(): boolean {
    this.mostrarDebug = !this.mostrarDebug;
    this.grupoDebug.visible = this.mostrarDebug;
    if (this.mostrarDebug) this.redesenharDebug();
    return this.mostrarDebug;
  }

  /** Contorno fino sobre cada superfície reconhecida — só para conferir a leitura. */
  private redesenharDebug() {
    this.limparDebug();
    const material = new THREE.LineBasicMaterial({ color: 0x55e2c2, transparent: true, opacity: 0.7 });
    this.descartaveis.push(material);

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
      const linha = new THREE.Line(geo, material);
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
    this.limparDebug();
    this.cena.remove(this.grupoDebug);
  }
}
