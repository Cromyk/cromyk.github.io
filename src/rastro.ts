import * as THREE from 'three';

/**
 * As pegadas no chão que apontam para o Pokémon que você ainda não viu.
 *
 * ## O problema, que o próprio código já confessava
 *
 * `Sala.pontoDeSpawn` escolhe uma superfície do seu quarto num anel de um a
 * cinco metros e não olha para onde você está olhando: um selvagem nasce tanto
 * na mesa à sua frente quanto na estante às suas costas. Para o caso das
 * costas havia uma única pista — o som posicional do nascimento, que toca uma
 * vez e acaba. Quem estava de fone baixo, quem estava lendo o painel do pulso,
 * ou quem simplesmente demorou três segundos a mais, ficava com um bicho
 * invisível no cômodo e nenhuma maneira de saber disso.
 *
 * A saída óbvia — um marcador flutuando na borda da visão — é justamente a que
 * não serve aqui. Borda de tela é conceito de jogo de tela; em VR a "borda" é a
 * periferia do olho da pessoa, e pendurar informação ali é a receita conhecida
 * de cansaço. E girar no lugar procurando é pior do que cansativo: você está de
 * pé num quarto de verdade, com móveis de verdade.
 *
 * ## O que isto faz
 *
 * Duas pegadas no CHÃO, logo à frente dos seus pés, apontando para lá. Você
 * baixa os olhos — um movimento que o pescoço faz de graça e que em VR é dos
 * mais confortáveis que existem — e o chão te diz para que lado virar.
 *
 * É um rastro e não uma seta porque um rastro é do bicho, e uma seta é do
 * sistema: a Pokédex de Sinnoh rastreava pegadas, e o jogo inteiro aqui é sobre
 * um cômodo que tem bicho passando por ele.
 *
 * ## As três regras que evitam que isto vire poluição
 *
 * 1. **Só quando não há nada à vista.** Se existe um selvagem dentro do cone do
 *    seu olhar, as pegadas somem — você já tem para onde olhar, e uma segunda
 *    indicação nesse momento só divide a atenção.
 * 2. **Só até você ver.** Quem já entrou no seu campo de visão uma vez está
 *    notado e nunca mais é apontado. As pegadas apontam para o desconhecido,
 *    não para o que você decidiu ignorar.
 * 3. **Nada pisca.** Entra e sai em meio segundo de fade, e o pulso entre as
 *    duas pegadas é lento. O que pisca no chão de quem está andando pela casa
 *    puxa o olho para baixo na hora errada.
 */

/** A direção de quem procurar — o que `rumoDoRastro` devolve. */
export interface Rumo {
  /** Horizontal e normalizada, do jogador para o bicho. */
  direcao: THREE.Vector3;
  distancia: number;
  /** Quanto ele está fora do seu olhar, em radianos. */
  desvio: number;
}

/**
 * Meio-ângulo do que conta como "à vista", em radianos.
 *
 * Trinta e cinco graus para cada lado, e não os sessenta e poucos que a lente
 * do Quest cobre, porque o que importa aqui não é o que cabe na imagem: é o que
 * a pessoa REPARA. Um Rattata a sessenta graus do centro está tecnicamente
 * visível e passa despercebido o dia inteiro.
 */
const MEIO_CONE = THREE.MathUtils.degToRad(35);

/** Até onde o rastro aponta. Além disso o bicho vai embora sozinho de qualquer jeito. */
const ALCANCE = 9;

/**
 * Para quem apontar — ou `null`, quando não há para quem.
 *
 * Fora da classe e sem nada de three além de vetores, porque esta é a única
 * parte do rastro que se pode afirmar sem um headset na cabeça, e é a parte que
 * decide tudo.
 */
export function rumoDoRastro(
  olhos: THREE.Vector3,
  olhar: THREE.Vector3,
  alvos: ReadonlyArray<THREE.Vector3>,
  meioCone = MEIO_CONE,
  alcance = ALCANCE,
): Rumo | null {
  // O olhar, achatado: um bicho no chão a um metro está trinta graus abaixo da
  // linha dos olhos, e isso não quer dizer que ele esteja fora da sua vista.
  const frente = new THREE.Vector3(olhar.x, 0, olhar.z);
  if (frente.lengthSq() < 1e-8) return null;
  frente.normalize();

  let melhor: Rumo | null = null;

  for (const alvo of alvos) {
    const para = new THREE.Vector3(alvo.x - olhos.x, 0, alvo.z - olhos.z);
    const distancia = para.length();
    if (distancia < 0.35 || distancia > alcance) continue;
    para.divideScalar(distancia);

    const desvio = Math.acos(THREE.MathUtils.clamp(para.dot(frente), -1, 1));
    // Um único bicho à vista cala o rastro inteiro. Ver a regra 1.
    if (desvio <= meioCone) return null;

    if (!melhor || distancia < melhor.distancia) {
      melhor = { direcao: para, distancia, desvio };
    }
  }

  return melhor;
}

/**
 * Ele está dentro do cone do seu olhar agora?
 *
 * É a mesma conta que cala o rastro, exposta à parte porque o jogo precisa dela
 * para outra coisa: marcar quem você já viu. As duas usam o mesmo cone de
 * propósito — se "à vista" para calar fosse diferente de "à vista" para marcar
 * como visto, existiria uma faixa de ângulo em que a pegada aponta para sempre
 * para um bicho que está bem ali.
 *
 * Grudado em você conta como visto: a 35 cm do rosto não há o que procurar.
 */
export function aVista(
  olhos: THREE.Vector3,
  olhar: THREE.Vector3,
  alvo: THREE.Vector3,
  meioCone = MEIO_CONE,
  alcance = ALCANCE,
): boolean {
  const frente = new THREE.Vector3(olhar.x, 0, olhar.z);
  if (frente.lengthSq() < 1e-8) return false;
  frente.normalize();

  const para = new THREE.Vector3(alvo.x - olhos.x, 0, alvo.z - olhos.z);
  const distancia = para.length();
  if (distancia < 0.35) return true;
  if (distancia > alcance) return false;

  return para.divideScalar(distancia).dot(frente) >= Math.cos(meioCone);
}

/**
 * A textura da pegada: um coxim e três dedos.
 *
 * `DataTexture` e não `<canvas>` pelo mesmo motivo da chama (ver src/fogo.ts):
 * este módulo é alcançado pelas verificações, que rodam no Node sem DOM.
 *
 * A pegada aponta para o TOPO da textura, que depois do `rotation.x` do plano
 * vira o −Z local do grupo — e é o grupo que gira para o bicho.
 */
let textura: THREE.Texture | null = null;

/**
 * Coxim e dedos, em coordenadas 0..1 da textura: [cx, cy, rx, ry].
 *
 * Os dedos estão em `cy` ALTO — embaixo, se você imaginar a imagem — e isso não
 * é engano: `DataTexture` nasce com `flipY = false`, ao contrário das texturas
 * que vêm de um loader. A primeira linha dos dados é v = 0, e v = 0 é a BASE do
 * `PlaneGeometry`. Com os dedos em cy baixo a pegada apontava para +Y local, ou
 * seja, para trás de onde o girador a manda apontar — um rastro que indica
 * exatamente o lado oposto do bicho, que é pior do que rastro nenhum.
 */
const ALMOFADAS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.5, 0.37, 0.23, 0.19],
  [0.5, 0.74, 0.09, 0.09],
  [0.29, 0.66, 0.085, 0.085],
  [0.71, 0.66, 0.085, 0.085],
];

function texturaDePegada(): THREE.Texture {
  if (textura) return textura;

  const lado = 64;
  const dados = new Uint8Array(lado * lado * 4);

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const u = (x + 0.5) / lado;
      const v = (y + 0.5) / lado;
      // A borda de cada almofada é macia: uma pegada de contorno duro lida como
      // adesivo colado no chão, e o que se quer é marca.
      let alfa = 0;
      for (const [cx, cy, rx, ry] of ALMOFADAS) {
        const d = Math.hypot((u - cx) / rx, (v - cy) / ry);
        alfa = Math.max(alfa, THREE.MathUtils.smoothstep(1 - d, 0, 0.45));
      }
      const p = (y * lado + x) * 4;
      dados[p] = 255;
      dados[p + 1] = 255;
      dados[p + 2] = 255;
      dados[p + 3] = Math.round(alfa * 255);
    }
  }

  textura = new THREE.DataTexture(dados, lado, lado, THREE.RGBAFormat);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.minFilter = THREE.LinearFilter;
  textura.magFilter = THREE.LinearFilter;
  textura.needsUpdate = true;
  return textura;
}

/** Tamanho de uma pegada, em metros. */
const PEGADA = 0.17;
/** A que distância dos pés as duas ficam, na direção em que você olha. */
const DISTANCIAS = [0.62, 0.98] as const;
/** Quanto elas se afastam da linha central, para um lado e para o outro. */
const DESVIO_LATERAL = 0.09;

export class Rastro {
  readonly grupo = new THREE.Group();

  /**
   * Um girador por pegada, e o plano deitado DENTRO dele.
   *
   * Dois objetos onde um bastaria porque um Euler só tem uma ordem: pôr o
   * tombamento (`rotation.x`) e o rumo (`rotation.y`) no mesmo objeto faz o
   * segundo acontecer ANTES do primeiro na ordem XYZ do three, e o resultado é
   * uma pegada girando em torno do eixo errado — de pé, de perfil, qualquer
   * coisa menos apontada. Separar em pai e filho não tem ordem para errar.
   */
  private giradores: THREE.Group[] = [];
  private materiais: THREE.MeshBasicMaterial[] = [];
  private geometria: THREE.PlaneGeometry;
  /** 0 apagado, 1 aceso. Sobe e desce em fade; nunca corta. */
  private presenca = 0;
  private tempo = 0;
  private giro = 0;

  constructor(cor = 0x8fe6ff) {
    this.geometria = new THREE.PlaneGeometry(PEGADA, PEGADA * 1.25);
    const mapa = texturaDePegada();

    for (let i = 0; i < DISTANCIAS.length; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: mapa,
        color: cor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // O chão é o seu chão de verdade, visto por passthrough: a pegada tem
        // de aparecer contra um carpete claro e contra um piso escuro, então
        // ela não some por tom — some por ninguém estar olhando.
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const pegada = new THREE.Mesh(this.geometria, material);
      pegada.rotation.x = -Math.PI / 2;
      pegada.renderOrder = 2;

      const girador = new THREE.Group();
      girador.position.set(i === 0 ? -DESVIO_LATERAL : DESVIO_LATERAL, 0, -DISTANCIAS[i]);
      girador.add(pegada);

      this.materiais.push(material);
      this.giradores.push(girador);
      this.grupo.add(girador);
    }

    this.grupo.visible = false;
  }

  /**
   * Põe as pegadas no chão à frente do jogador, apontadas para o rumo.
   *
   * O grupo inteiro fica na direção do OLHAR (é preciso enxergá-las) e cada
   * pegada gira para a direção do BICHO. São duas coisas diferentes de
   * propósito: se o conjunto todo girasse para o bicho, com ele atrás de você
   * as pegadas ficariam atrás de você também, que é o único lugar onde elas não
   * servem para nada.
   */
  atualizar(
    dt: number,
    rumo: Rumo | null,
    olhos: THREE.Vector3,
    olhar: THREE.Vector3,
    pisoY: number,
  ) {
    this.tempo += dt;
    const alvo = rumo ? 1 : 0;
    // Meio segundo para entrar, um quarto para sair: aparecer devagar é
    // discreto, sumir devagar depois de você já ter virado é insistência.
    const passo = dt / (alvo > this.presenca ? 0.5 : 0.25);
    this.presenca = THREE.MathUtils.clamp(
      this.presenca + Math.sign(alvo - this.presenca) * passo,
      0,
      1,
    );

    if (this.presenca <= 0.001 && !rumo) {
      this.grupo.visible = false;
      return;
    }
    this.grupo.visible = true;

    const frente = new THREE.Vector3(olhar.x, 0, olhar.z);
    if (frente.lengthSq() > 1e-8) {
      frente.normalize();
      this.grupo.position.set(olhos.x, pisoY + 0.012, olhos.z);
      this.grupo.rotation.y = Math.atan2(-frente.x, -frente.z);
    }

    // Enquanto some, ela continua apontando para onde apontava: virar para
    // lugar nenhum no meio do fade seria um tremor sem significado.
    if (rumo) this.giro = Math.atan2(-rumo.direcao.x, -rumo.direcao.z);

    for (let i = 0; i < this.giradores.length; i++) {
      // O giro é do MUNDO, e o grupo já está girado para o olhar: descontar um
      // do outro é o que deixa a pegada apontando para o bicho e não para a
      // soma dos dois.
      this.giradores[i].rotation.y = this.giro - this.grupo.rotation.y;
      // O pulso corre da pegada de trás para a da frente, como um passo sendo
      // dado. Lento de propósito: 0,9 s por ciclo.
      const fase = (this.tempo / 0.9 - i * 0.35) % 1;
      const onda = 0.55 + 0.45 * Math.sin(fase * Math.PI * 2);
      this.materiais[i].opacity = this.presenca * 0.62 * onda;
    }
  }

  /**
   * Para onde a pegada aponta no mundo, horizontal e normalizado.
   *
   * Existe para poder ser AFIRMADO. A orientação de uma coisa deitada no chão
   * dentro de dois grupos aninhados é o tipo de conta que parece óbvia e sai
   * errada em dois lugares ao mesmo tempo — o `flipY` da textura e a ordem do
   * Euler —, e cada um dos dois inverte o resultado. Dois erros assim se
   * cancelam e ninguém descobre; um só manda você para o lado contrário do
   * bicho. Sem headset, esta é a única forma de saber qual dos casos é o seu.
   */
  direcaoNoMundo(): THREE.Vector3 {
    this.grupo.updateMatrixWorld(true);
    const dedos = this.giradores[0].children[0] as THREE.Mesh;
    // +Y local do plano é o lado dos dedos, depois da correção do flipY.
    const ponta = new THREE.Vector3(0, 1, 0).applyMatrix4(dedos.matrixWorld);
    const base = new THREE.Vector3(0, 0, 0).applyMatrix4(dedos.matrixWorld);
    const direcao = ponta.sub(base);
    direcao.y = 0;
    return direcao.normalize();
  }

  descartar() {
    this.geometria.dispose();
    for (const m of this.materiais) m.dispose();
  }
}
