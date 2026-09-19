import * as THREE from 'three';

/**
 * O punho, nos dois modos de jogar.
 *
 * ## O bug que isto conserta
 *
 * Três coisas do jogo são penduradas no punho: o **cinto de pokébolas**, o
 * **item na mão** (a fruta, o doce) e a **Pokédex**. Todas as três eram filhas
 * de `mao.punho` — o `XRGripSpace` do three.
 *
 * E o grip space **só existe quando há controle na mão**. Com hand tracking, o
 * `WebXRController` do three tem um if/else: havendo `inputSource.hand`, ele
 * posa as vinte e cinco juntas e **não toca no grip**, que fica invisível e com
 * a matriz na identidade. O resultado, para quem larga os controles, é que o
 * cinto, os itens e a Pokédex somem — sem mensagem nenhuma. O jogo continua
 * rodando e simplesmente não tem mais como pegar uma bola.
 *
 * Isso é um bug de acessibilidade, não uma escolha: jogar de mão nua é um modo
 * inteiro do Quest, e quem tirasse os controles não tinha como saber que o
 * problema não era ele.
 *
 * ## Por que derivar os eixos, e não convertê-los
 *
 * A junta `wrist` do hand tracking existe e tem orientação — mas numa convenção
 * DIFERENTE da do grip space (nas juntas, +Y corre ao longo do osso; no grip,
 * −Z aponta para onde os dedos apontam). Converter uma na outra é uma
 * permutação de eixos que muda de sinal entre as mãos, e errar o sinal põe o
 * cinto do lado de dentro do braço — um erro que só aparece no headset.
 *
 * Então em vez de converter, MEDE-SE, com a mesma régua que `MaoArticulada` já
 * usa para alinhar o modelo da mão ao grip (ver src/glove.ts), e que já está
 * conferida contra os dois lados:
 *
 * - **para onde os dedos apontam** — do metacarpo médio à ponta do dedo médio;
 * - **a largura da mão** — do metacarpo do mínimo ao do indicador.
 *
 * O produto vetorial dos dois dá o terceiro eixo, e a beleza dele é que **o
 * sinal se resolve sozinho**: na mão direita ele sai pelo dorso, na esquerda
 * pela palma — que é exatamente a assimetria que o grip space tem, com +X no
 * dorso da direita e na palma da esquerda. A mesma fórmula serve às duas.
 */

const _f = new THREE.Vector3();
const _lateral = new THREE.Vector3();
const _eX = new THREE.Vector3();
const _eY = new THREE.Vector3();
const _eZ = new THREE.Vector3();
const _base = new THREE.Matrix4();

/** As quatro juntas de que a derivação precisa. */
export interface JuntasDoPulso {
  punho: THREE.Vector3;
  meioBase: THREE.Vector3;
  meioPonta: THREE.Vector3;
  indicadorBase: THREE.Vector3;
  minimoBase: THREE.Vector3;
}

/**
 * Converte cinco pontos de junta na pose do grip space.
 *
 * Devolve `false` quando a mão está degenerada — dedos e largura paralelos, o
 * que acontece num quadro em que o rastreamento entregou lixo. Nesse caso quem
 * chama deve manter a pose anterior: um cinto que pisca para a origem do quarto
 * é pior do que um cinto um quadro atrasado.
 *
 * A posição é a do PUNHO, e não a do centro da mão fechada: é onde o cinto
 * começa a ser medido (`INICIO_SLOT` conta a partir dali) e onde a Pokédex
 * encosta. O deslocamento para dentro da mão fechada, que o desenho da luva
 * precisa, é problema da luva.
 */
export function poseDoPulso(
  juntas: JuntasDoPulso,
  destinoPos: THREE.Vector3,
  destinoGiro: THREE.Quaternion,
): boolean {
  _f.copy(juntas.meioPonta).sub(juntas.meioBase);
  if (_f.lengthSq() < 1e-8) return false;
  _f.normalize();

  _lateral.copy(juntas.indicadorBase).sub(juntas.minimoBase);
  // Ortogonaliza contra os dedos: sem isto, uma mão com os dedos muito abertos
  // inclina a base inteira.
  _lateral.addScaledVector(_f, -_lateral.dot(_f));
  if (_lateral.lengthSq() < 1e-8) return false;
  _lateral.normalize();

  // O eixo que sai pelo dorso na direita e pela palma na esquerda — que é o +X
  // do grip space nos dois casos. Ver o cabeçalho.
  _eX.crossVectors(_f, _lateral);
  if (_eX.lengthSq() < 1e-8) return false;
  _eX.normalize();

  // −Z é para onde os dedos apontam, então +Z corre para o antebraço.
  _eZ.copy(_f).negate();
  _eY.crossVectors(_eZ, _eX).normalize();

  _base.makeBasis(_eX, _eY, _eZ);
  destinoGiro.setFromRotationMatrix(_base);
  destinoPos.copy(juntas.punho);
  return true;
}

/**
 * Os nomes das juntas que `poseDoPulso` consome, na ordem em que ela os quer.
 *
 * Exportado porque quem lê as juntas é `src/hands.ts` e quem as confere é
 * `tools/smoke.ts`, e uma lista escrita duas vezes é uma lista que diverge.
 */
export const JUNTAS_DO_PULSO = [
  'wrist',
  'middle-finger-metacarpal',
  'middle-finger-tip',
  'index-finger-metacarpal',
  'pinky-finger-metacarpal',
] as const;

// ----------------------------------------------------------- o punho fechado

/**
 * As juntas do dedo médio, do punho à ponta.
 *
 * É a cadeia inteira, e não só duas pontas: ver `razaoDoPunho`.
 */
export const CADEIA_DO_MEDIO = [
  'wrist',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
] as const;

/**
 * Quão esticado o dedo médio está, de 0 a 1.
 *
 * ## A régua que estava errada
 *
 * A medida antiga comparava a distância da ponta ao punho com a distância do
 * punho ao METACARPO do dedo médio, vezes 1,9. E o metacarpo tinha um plano B:
 * se o runtime não o entregasse, valia a falange proximal.
 *
 * Só que essas duas juntas estão a distâncias MUITO diferentes do punho — uns
 * três centímetros contra uns nove. Trocar uma pela outra multiplica a régua
 * por três, e o mesmo gesto passa a significar coisas opostas: com o plano B
 * ligado, qualquer mão conta como fechada. O mesmo jogo, em dois headsets, com
 * sensibilidades incomparáveis — e sem nada que denunciasse isso.
 *
 * ## A régua nova
 *
 * A distância em LINHA RETA da ponta ao punho, dividida pelo comprimento da
 * cadeia esticada (a soma dos ossos). Um dedo esticado dá quase 1; um dedo
 * enrolado na palma dá perto de 0,45, porque a linha reta encurta enquanto a
 * soma dos ossos não muda.
 *
 * Isso é adimensional e não depende de qual junta existe: some uma e a soma
 * cai junto com a linha reta, o que muda o número muito menos do que trocar a
 * régua inteira. E continua valendo para a mão de uma criança e para a de um
 * adulto sem calibração, que era a boa intenção da medida antiga.
 */
export function razaoDoPunho(pontos: readonly THREE.Vector3[]): number | null {
  if (pontos.length < 3) return null;
  let cadeia = 0;
  for (let i = 1; i < pontos.length; i++) cadeia += pontos[i].distanceTo(pontos[i - 1]);
  if (cadeia < 1e-6) return null;
  const reta = pontos[pontos.length - 1].distanceTo(pontos[0]);
  return reta / cadeia;
}

/**
 * Onde a mão passa a contar como fechada, e onde ela volta a contar como
 * aberta.
 *
 * DOIS números, e não um: com um limiar só, uma mão parada na fronteira
 * alterna entre pegar e soltar a cada quadro de ruído do rastreamento. A faixa
 * entre eles é a zona em que nada muda — o estado anterior continua valendo.
 */
export const PUNHO_FECHA = 0.62;
export const PUNHO_ABRE = 0.72;

/**
 * Quanto tempo o estado novo precisa se manter para valer, em milissegundos.
 *
 * ## Por que confirmar, e por que ASSIMÉTRICO
 *
 * Cada borda dispara a cascata inteira do GRIP — pegar a bola, abraçar,
 * recolher do chão. Um tremor de dois quadros no rastreamento vira pegar e
 * soltar, e o que se vê é a bola pulando da mão.
 *
 * Fechar pode esperar quase um décimo de segundo: você está levando a mão até a
 * coisa, e o atraso some dentro do movimento.
 *
 * ABRIR não pode. Soltar a mão é o gesto do ARREMESSO, e a velocidade da bola é
 * medida na janela dos últimos 90 ms do braço — atrasar o "abriu" em 120 ms faz
 * a bola sair depois do movimento ter acabado, com a força de quem já estava
 * parando. É a diferença entre arremessar e deixar cair.
 */
export const LATCH_FECHAR_MS = 90;
export const LATCH_ABRIR_MS = 45;
