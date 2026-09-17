import * as THREE from 'three';

/**
 * O esqueleto de um Pokémon, traduzido para nomes que o jogo entende.
 *
 * Os 151 GLB vieram de rips dos jogos e todos trazem o mesmo rig da Game Freak,
 * com os mesmos nomes de osso — `Hips`, `Spine1`, `Head`, `LArm`, `RThigh`,
 * `Tail1`. O que muda de arquivo para arquivo é o sufixo que o exportador
 * grudou (`Head_50` no Bulbasaur, `Head_9` no Pikachu, `Head` no Charmander) e
 * quais ossos existem: o Squirtle não tem `Spine`, só `Waist`; o Charmander não
 * tem orelha; o Pikachu tem `LEar1`, `LEar2` e `LEar3`.
 *
 * Por isso este módulo existe. Ele normaliza o nome, procura o osso por uma
 * lista de candidatos em ordem de preferência e entrega um dicionário estável —
 * e a animação procedural em src/anima.ts pode então ser escrita uma vez só,
 * sem saber de que arquivo o bicho veio.
 *
 * ## Por que as rotações são em espaço da criatura
 *
 * Cada osso tem eixos locais próprios, herdados de como o modelo foi riggado:
 * dobrar o joelho pode ser girar em X num arquivo e em Z noutro. Escrever a
 * animação contra esses eixos daria uma animação por espécie.
 *
 * Então aqui se gira em espaço da CRIATURA — +Z é a frente dela, +Y é o alto,
 * +X é o lado — e a conta converte para o espaço local do osso usando a
 * orientação de repouso do pai:
 *
 *   local = (paiRepouso⁻¹ · giro · paiRepouso) · repouso
 *
 * O `paiRepouso` é o de descanso, não o do quadro: um braço que já girou no
 * ombro recebe o giro do cotovelo no referencial antigo. Para ângulos de
 * animação de bicho — dezenas de graus, não cambalhotas — a diferença não se
 * enxerga, e o custo é uma multiplicação de quaternion por osso por quadro.
 */

export type Chave =
  | 'quadril'
  | 'tronco'
  | 'peito'
  | 'pescoco'
  | 'cabeca'
  | 'mandibula'
  | 'ombroE'
  | 'ombroD'
  | 'bracoE'
  | 'bracoD'
  | 'antebracoE'
  | 'antebracoD'
  | 'maoE'
  | 'maoD'
  | 'coxaE'
  | 'coxaD'
  | 'pernaE'
  | 'pernaD'
  | 'peE'
  | 'peD'
  | 'cauda1'
  | 'cauda2'
  | 'cauda3'
  | 'orelhaE'
  | 'orelhaD';

/**
 * Candidatos por papel, do mais específico para o mais genérico.
 *
 * A ordem importa: `tronco` prefere `spine1` e só cai em `waist` porque o
 * Squirtle não tem coluna nomeada. Um osso já tomado por outro papel não é
 * reaproveitado — senão, no Squirtle, quadril e tronco virariam o mesmo `Waist`
 * e cada giro sairia dobrado.
 */
const CANDIDATOS: Record<Chave, string[]> = {
  quadril: ['hips', 'waist', 'origin'],
  tronco: ['spine1', 'waist', 'hips'],
  peito: ['spine2', 'spine1', 'chest'],
  pescoco: ['neck'],
  cabeca: ['head'],
  mandibula: ['jaw', 'mouth'],
  ombroE: ['lshoulder'],
  ombroD: ['rshoulder'],
  bracoE: ['larm', 'lupperarm'],
  bracoD: ['rarm', 'rupperarm'],
  antebracoE: ['lforearm', 'llowerarm'],
  antebracoD: ['rforearm', 'rlowerarm'],
  maoE: ['lhand'],
  maoD: ['rhand'],
  coxaE: ['lthigh', 'lupperleg'],
  coxaD: ['rthigh', 'rupperleg'],
  pernaE: ['lleg', 'llowerleg', 'lknee'],
  pernaD: ['rleg', 'rlowerleg', 'rknee'],
  peE: ['lfoot'],
  peD: ['rfoot'],
  cauda1: ['tail1', 'tail'],
  cauda2: ['tail2'],
  cauda3: ['tail3'],
  orelhaE: ['lear1', 'lear'],
  orelhaD: ['rear1', 'rear'],
};

/**
 * Tira do nome tudo o que é do exportador e não do rig: o prefixo de pilha
 * (`model_skeleton|Head`) e o índice de nó (`Head_50`).
 */
export function normalizar(nome: string): string {
  const semPilha = nome.slice(nome.lastIndexOf('|') + 1);
  return semPilha.replace(/_\d+$/, '').replace(/[\s.:-]/g, '').toLowerCase();
}

interface No {
  osso: THREE.Bone;
  /** Rotação local do osso na pose de descanso. */
  repouso: THREE.Quaternion;
  /** Orientação do PAI, em espaço da criatura, na pose de descanso. */
  paiRepouso: THREE.Quaternion;
  paiRepousoInv: THREE.Quaternion;
  /** Giro pedido neste quadro, em espaço da criatura. Some a cada `limpar`. */
  acumulado: THREE.Quaternion;
  /**
   * Para onde o osso aponta em descanso, em espaço da criatura: do começo dele
   * para o começo do filho. É o que denuncia um modelo em T-pose — ver
   * `direcaoDe`.
   */
  direcao: THREE.Vector3;
  sujo: boolean;
}

const _q = new THREE.Quaternion();
const _qRaiz = new THREE.Quaternion();
const _qOsso = new THREE.Quaternion();

export const FRENTE = new THREE.Vector3(0, 0, 1);
export const CIMA = new THREE.Vector3(0, 1, 0);
export const LADO = new THREE.Vector3(1, 0, 0);

export class Rig {
  private nos = new Map<Chave, No>();
  /** Quantos papéis o esqueleto preencheu. Zero = modelo sem osso reconhecível. */
  readonly encontrados: number;

  constructor(corpo: THREE.Object3D) {
    corpo.updateMatrixWorld(true);
    corpo.getWorldQuaternion(_qRaiz);
    const raizInv = _qRaiz.clone().invert();

    // Um passe só pela hierarquia: o mesmo osso pode servir a vários candidatos,
    // e percorrer 56 nós uma vez por papel seria 25 travessias por instância.
    const porNome = new Map<string, THREE.Bone>();
    corpo.traverse((obj) => {
      const osso = obj as THREE.Bone;
      if (!osso.isBone) return;
      const nome = normalizar(osso.name);
      // O primeiro com cada nome ganha: rigs duplicados (malha + esqueleto)
      // aparecem duas vezes, e o de cima é o que a skin usa.
      if (!porNome.has(nome)) porNome.set(nome, osso);
    });

    const tomados = new Set<THREE.Bone>();
    let encontrados = 0;

    for (const chave of Object.keys(CANDIDATOS) as Chave[]) {
      for (const candidato of CANDIDATOS[chave]) {
        const osso = porNome.get(candidato);
        if (!osso || tomados.has(osso)) continue;
        tomados.add(osso);
        this.nos.set(chave, this.montarNo(osso, raizInv));
        encontrados++;
        break;
      }
    }

    this.encontrados = encontrados;
  }

  private montarNo(osso: THREE.Bone, raizInv: THREE.Quaternion): No {
    const pai = osso.parent;
    const paiRepouso = new THREE.Quaternion();
    if (pai) {
      pai.getWorldQuaternion(_qOsso);
      paiRepouso.copy(raizInv).multiply(_qOsso);
    }

    // Para onde este osso aponta em descanso: do começo dele até o começo do
    // primeiro filho que também seja osso. Sem filho não há direção, e o vetor
    // fica zerado — quem lê trata isso como "não sei".
    const direcao = new THREE.Vector3();
    const filho = osso.children.find((f) => (f as THREE.Bone).isBone);
    if (filho) {
      const aqui = osso.getWorldPosition(new THREE.Vector3());
      const la = filho.getWorldPosition(new THREE.Vector3());
      direcao.copy(la).sub(aqui).applyQuaternion(raizInv);
      if (direcao.lengthSq() > 1e-10) direcao.normalize();
      else direcao.set(0, 0, 0);
    }

    return {
      osso,
      repouso: osso.quaternion.clone(),
      paiRepouso,
      paiRepousoInv: paiRepouso.clone().invert(),
      acumulado: new THREE.Quaternion(),
      direcao,
      sujo: false,
    };
  }

  /**
   * Para onde o osso aponta em descanso, em espaço da criatura, ou null quando
   * ele não tem filho para dar a direção.
   *
   * Serve para uma pergunta concreta: o modelo está em T-pose? Charmander,
   * Squirtle e boa parte dos rips chegam com o braço na horizontal, porque é
   * assim que se riggam — e uma animação que soma giros em cima disso deixa o
   * bicho andando pelo quarto de braços abertos como um avião. Ver `relaxar`
   * em src/anima.ts.
   */
  direcaoDe(chave: Chave): THREE.Vector3 | null {
    const no = this.nos.get(chave);
    if (!no || no.direcao.lengthSq() < 0.5) return null;
    return no.direcao;
  }

  get vazio(): boolean {
    return this.encontrados === 0;
  }

  tem(chave: Chave): boolean {
    return this.nos.has(chave);
  }

  /**
   * O osso em si, para pendurar coisas nele.
   *
   * Quem usa é a chama dos Pokémon de fogo (src/fogo.ts): pendurada no osso da
   * cauda, ela acompanha a animação sem uma linha de código por quadro. A
   * alternativa — copiar a posição do osso todo quadro — chega sempre um quadro
   * atrasada, e uma chama atrasada em relação à cauda é uma chama que persegue
   * o bicho.
   */
  ossoDe(chave: Chave): THREE.Object3D | null {
    return this.nos.get(chave)?.osso ?? null;
  }

  /** A posição no mundo de um osso — é assim que a mão encontra a cabeça. */
  pontoDe(chave: Chave, alvo = new THREE.Vector3()): THREE.Vector3 | null {
    const no = this.nos.get(chave);
    if (!no) return null;
    return no.osso.getWorldPosition(alvo);
  }

  /**
   * Adota a pose atual dos ossos como a nova pose de descanso.
   *
   * Existe por causa do Pikachu. O GLB dele traz a pose de bind DEITADA — um
   * salsichão na horizontal com as patas abertas, que se vê na folha de
   * contato. O arquivo conta com a única animação que ele tem para endireitar
   * o bicho, e a versão anterior do jogo fazia isso tocando o "Impactrueno" em
   * laço eterno, o que explicava o Pikachu permanentemente eletrocutado.
   *
   * A saída é melhor: posiciona-se o esqueleto com o primeiro quadro do clipe,
   * chama-se isto, e daí em diante a animação procedural soma em cima de uma
   * pose que presta — sem clipe rodando e sem Pikachu chocando o quarto todo.
   */
  recapturarRepouso(corpo: THREE.Object3D) {
    corpo.updateMatrixWorld(true);
    corpo.getWorldQuaternion(_qRaiz);
    const raizInv = _qRaiz.clone().invert();

    for (const no of this.nos.values()) {
      no.repouso.copy(no.osso.quaternion);
      if (no.osso.parent) {
        no.osso.parent.getWorldQuaternion(_qOsso);
        no.paiRepouso.copy(raizInv).multiply(_qOsso);
        no.paiRepousoInv.copy(no.paiRepouso).invert();
      }
      no.acumulado.identity();
    }
  }

  /** Zera os giros do quadro. Chamado uma vez, antes das poses. */
  limpar() {
    for (const no of this.nos.values()) {
      if (no.sujo) no.acumulado.identity();
    }
  }

  /**
   * Soma um giro ao osso, em espaço da criatura. Vários `girar` no mesmo osso
   * se compõem — é assim que "andar" e "olhar para o lado" convivem na cabeça.
   */
  girar(chave: Chave, eixo: THREE.Vector3, angulo: number) {
    if (angulo === 0) return;
    const no = this.nos.get(chave);
    if (!no) return;
    _q.setFromAxisAngle(eixo, angulo);
    no.acumulado.multiply(_q);
    no.sujo = true;
  }

  /**
   * Escreve tudo o que foi pedido nos ossos. Uma vez por quadro, no fim.
   *
   * O `peso` é o que deixa a animação procedural conviver com um clipe assado.
   * Como `aplicar` roda DEPOIS do `mixer.update()`, o que está no osso neste
   * instante é o que o clipe escreveu — então interpolar a partir dali, em vez
   * de sobrescrever, mistura os dois de verdade. Com peso 1 a pose procedural
   * manda sozinha; com 0 o clipe fica intacto e nem se toca no osso.
   */
  aplicar(peso = 1) {
    if (peso <= 0.001) return;
    const cheio = peso >= 0.999;
    for (const no of this.nos.values()) {
      if (!no.sujo) continue;
      // local = (paiRepouso⁻¹ · giro · paiRepouso) · repouso
      _q.copy(no.paiRepousoInv).multiply(no.acumulado).multiply(no.paiRepouso);
      _q.multiply(no.repouso);

      if (cheio) no.osso.quaternion.copy(_q);
      else no.osso.quaternion.slerp(_q, peso);
    }
  }
}
