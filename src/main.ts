import * as THREE from 'three';
import { Jogo } from './game';
import { audio } from './audio';
import { nomeDaFoto } from './foto';

const botaoEntrar = document.getElementById('enter') as HTMLButtonElement;
const botaoPlano = document.getElementById('flat') as HTMLButtonElement;
const botaoWidget = document.getElementById('widget') as HTMLButtonElement;
const nota = document.getElementById('note') as HTMLParagraphElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const rolo = document.getElementById('rolo') as HTMLDivElement;
const fotos = document.getElementById('fotos') as HTMLDivElement;
const quadro = document.getElementById('quadro') as HTMLDivElement;
const tabelaQuadro = document.getElementById('tabela-quadro') as HTMLPreElement;
const copiarQuadro = document.getElementById('copiar-quadro') as HTMLButtonElement;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
// 'local-floor' põe a origem no chão real: y = 0 é o seu piso.
renderer.xr.setReferenceSpaceType('local-floor');
// Resolução nativa do headset. Baixe para 0.8 se o Quest começar a perder quadros.
renderer.xr.setFramebufferScaleFactor(1.0);
document.body.appendChild(renderer.domElement);

const jogo = new Jogo(renderer);

// Em passthrough a cena precisa ser transparente: o "fundo" é o seu quarto.
jogo.cena.background = null;
renderer.setClearAlpha(0);

function redimensionar() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  jogo.camera.aspect = w / h;
  jogo.camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', redimensionar);
redimensionar();

// ---------------------------------------------------------------- WebXR

/**
 * O que o jogo pede ao runtime. Só `local-floor` é obrigatório — tudo o mais é
 * opcional de propósito: um headset que não entregue planos continua jogando
 * com o chão sondado a passos, e um que não entregue profundidade continua
 * jogando sem oclusão.
 *
 * - **unbounded** — espaço de referência SEM limite de área, pedido em 18/09 a
 *   partir de *"quero poder andar sem definir uma escala de cômodo, em tempo
 *   real"*. É o que diz ao runtime que este app quer a casa inteira e não um
 *   quadrado. Onde não existir, `local-floor` continua valendo e nada muda; o
 *   que continua sendo do SISTEMA, e não do jogo, é o limite do Guardião — ver
 *   GUIA-QUEST.md.
 * - **depth-sensing** — o mapa de profundidade do quarto, quadro a quadro. É a
 *   única coisa em WebXR que enxerga o que se MEXE: móvel que você arrastou,
 *   porta que abriu, e uma pessoa entrando na sala. Ver `oclusaoDoQuarto` em
 *   src/ajustes.ts.
 */
const FEATURES: XRSessionInit = {
  requiredFeatures: ['local-floor'],
  optionalFeatures: [
    'unbounded',
    'plane-detection',
    'mesh-detection',
    'anchors',
    'hit-test',
    'hand-tracking',
    'depth-sensing',
  ],
  // O three só monta a textura de profundidade no caminho de GPU; no de CPU
  // ele ignora, e a oclusão simplesmente não acontece.
  depthSensing: {
    usagePreference: ['gpu-optimized'],
    dataFormatPreference: ['luminance-alpha', 'float32'],
  },
} as XRSessionInit;

async function prepararBotaoXR() {
  if (!('xr' in navigator) || !navigator.xr) {
    botaoEntrar.textContent = 'este navegador não tem WebXR';
    nota.textContent = 'Abra pelo navegador do Quest para jogar em realidade mista.';
    return;
  }

  let suportado = false;
  try {
    suportado = await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    suportado = false;
  }

  if (!suportado) {
    botaoEntrar.textContent = 'sem realidade mista aqui';
    nota.textContent = 'Abra este endereço no navegador do Quest 3 para entrar em passthrough.';
    return;
  }

  botaoEntrar.disabled = false;
  botaoEntrar.textContent = 'entrar em realidade mista';
  botaoEntrar.addEventListener('click', () => void entrarXR(false));

  // Instalado como app no Quest, o jogo deve abrir já no passthrough: tocar no
  // ícone da PWA conta como o gesto do usuário que o requestSession exige.
  if (dentroDaPwa()) {
    nota.textContent = 'abrindo em realidade mista…';
    void entrarXR(true);
  }
}

/**
 * Descobre se estamos rodando dentro da PWA instalada no Quest, e não numa aba
 * comum do navegador. A Meta recomenda checar o Digital Goods service, que só
 * existe dentro do escopo de uma PWA empacotada; `display-mode` cobre o resto.
 */
function dentroDaPwa(): boolean {
  if ('getDigitalGoodsService' in window) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

async function entrarXR(automatico = false) {
  botaoEntrar.disabled = true;
  botaoEntrar.textContent = 'abrindo…';
  try {
    const sessao = await navigator.xr!.requestSession('immersive-ar', FEATURES);
    audio.iniciar();

    sessao.addEventListener('end', () => {
      // Antes da tela de saída: o espaço de referência morreu com a sessão, e
      // tudo o que o jogo mediu nele deixou de valer. Sem isto, entrar de novo
      // sem recarregar a página devolve o quarto inteiro fora do lugar. Ver
      // `Jogo.aoSairDaSessao`.
      // A tabela ANTES da limpeza: ela é a única coisa medida na sessão que
      // não sobrevive a um recarregamento, e ler um diário já apagado seria a
      // forma mais silenciosa possível de perder o item 0.1 de novo.
      mostrarQuadro();
      jogo.aoSairDaSessao();
      ui.style.display = 'grid';
      botaoEntrar.disabled = false;
      botaoEntrar.textContent = 'entrar em realidade mista';
      nota.textContent = `Sessão encerrada. ${jogo.dex.totalCapturas} capturas até agora.`;
      mostrarRolo();
    });

    await renderer.xr.setSession(sessao);

    // Sem limite de área, quando o runtime souber fazer isso.
    //
    // `unbounded` é o espaço de referência de quem anda pela CASA: o runtime
    // pode reajustar a origem enquanto você caminha para manter a precisão
    // longe do ponto de partida, e não há um quadrado além do qual as
    // coordenadas deixam de valer. `local-floor`, o padrão, garante y = 0 no
    // seu piso mas nasce ancorado onde você entrou.
    //
    // Pedir depois de `setSession` e não antes: se o espaço não existir, a
    // promessa rejeita e o jogo segue com o que o three já configurou — é uma
    // troca opcional, não um requisito. E a altura do chão não se perde por
    // isso: a sala mede o piso com hit-test a cada passo (ver src/room.ts),
    // então ela se acerta sozinha mesmo com a origem em outro lugar.
    try {
      const semLimite = await sessao.requestReferenceSpace('unbounded');
      renderer.xr.setReferenceSpace(semLimite);
      jogo.semLimiteDeArea = true;
    } catch {
      // Quest sem `unbounded`: segue no local-floor, que já anda pela casa
      // desde 15/09 — o que limita é o Guardião, não o jogo.
    }

    ui.style.display = 'none';
    jogo.aoEntrarNaSessao();
  } catch (erro) {
    botaoEntrar.disabled = false;
    botaoEntrar.textContent = 'entrar em realidade mista';
    // Numa aba comum a tentativa automática falha por falta de gesto do usuário.
    // Isso é esperado: o botão continua ali, e não há erro nenhum a relatar.
    nota.textContent = automatico ? '' : `Não deu para abrir a sessão: ${(erro as Error).message}`;
  }
}

/**
 * As fotos da sessão, entregues na saída.
 *
 * É aqui que a fotografia termina, e não no headset: dentro de uma sessão
 * imersiva não existe diálogo de download nem barra de endereço, e um link com
 * `download` é inerte. Quando a sessão acaba, a página volta a ser uma página —
 * e aí um link é um link. Ver o cabeçalho de src/foto.ts.
 */
/**
 * A tabela do orçamento de quadro, na saída da sessão.
 *
 * Aqui e não dentro do jogo porque **dentro da realidade mista não há como
 * copiar um texto**: não existe seleção, não existe área de transferência ao
 * alcance, e ditar quatro pares de números para alguém anotar é exatamente o
 * trabalho manual que o item 0.1 nunca venceu. A saída é a única tela do jogo
 * onde existe um cursor.
 */
function mostrarQuadro() {
  const texto = jogo.relatorioDeQuadro();
  tabelaQuadro.textContent = texto;
  quadro.style.display = 'block';
  copiarQuadro.textContent = 'copiar a tabela';
  copiarQuadro.onclick = () => {
    // A área de transferência pode não existir (contexto sem HTTPS) ou ser
    // recusada. O texto continua selecionável na tela: o botão é o atalho, e
    // não o único caminho.
    void navigator.clipboard
      ?.writeText(texto)
      .then(() => {
        copiarQuadro.textContent = 'copiado';
      })
      .catch(() => {
        copiarQuadro.textContent = 'selecione e copie à mão';
      });
  };
}

function mostrarRolo() {
  const tiradas = jogo.rolo;
  if (tiradas.length === 0) {
    rolo.style.display = 'none';
    return;
  }
  fotos.textContent = '';
  // Da mais nova para a mais velha: a última foto é a que a pessoa quer.
  for (const foto of [...tiradas].reverse()) {
    const link = document.createElement('a');
    link.href = foto.dados;
    link.download = nomeDaFoto(foto);
    const img = document.createElement('img');
    img.src = foto.dados;
    img.alt = foto.quem;
    link.appendChild(img);
    fotos.appendChild(link);
  }
  rolo.style.display = 'block';
}

void prepararBotaoXR();

// ------------------------------------------------------- modo sem headset

let planoAtualiza: ((dt: number) => void) | null = null;

/**
 * Fallback de mesa: mouse olha, WASD anda, segurar o botão carrega o arremesso.
 * Serve para ajustar o jogo sem pôr o headset a cada mudança.
 */
function iniciarModoPlano() {
  ui.style.display = 'none';
  audio.iniciar();
  jogo.ativarModoPlano();
  jogo.aoEntrarNaSessao();
  prepararTeclasDoPlano();
}

/**
 * Mouse, teclado e o passo do jogador — o que faz um navegador virar controle.
 *
 * Separado de `iniciarModoPlano` porque o modo widget usa exatamente isto e
 * mais nada dele: lá o jogo em volta não existe, mas andar em torno do
 * companheiro e fazer carinho nele continuam sendo mouse e tecla.
 */
function prepararTeclasDoPlano() {
  const tecla = new Set<string>();
  let guinada = 0;
  let inclinacao = 0;

  const canvas = renderer.domElement;
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    guinada -= e.movementX * 0.0022;
    inclinacao = THREE.MathUtils.clamp(inclinacao - e.movementY * 0.0022, -1.3, 1.3);
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) jogo.arremessoPlano('inicio');
    // Botão direito segurado faz o papel do gatilho segurado do headset: marca
    // no chão para onde o Pokémon deve ir.
    if (e.button === 2) jogo.marcarPlano('inicio');
  });
  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) jogo.arremessoPlano('fim');
    if (e.button === 2) jogo.marcarPlano('fim');
  });

  window.addEventListener('keydown', (e) => {
    tecla.add(e.code);
    // Sem controles, o teclado faz o papel do gatilho, dos botões e do painel.
    if (e.code === 'KeyF') jogo.comandoPlano('atacar');
    if (e.code === 'KeyE') jogo.comandoPlano('gatilho');
    if (e.code === 'KeyP') jogo.comandoPlano('pc');
    if (e.code === 'KeyR') jogo.comandoPlano('recolher');
    if (e.code === 'KeyC') jogo.comandoPlano('chamar');
    if (e.code === 'KeyV') jogo.comandoPlano('carinho');
    if (e.code === 'KeyK') jogo.comandoPlano('colo');
    if (e.code === 'KeyB') jogo.comandoPlano('acenar');
    if (e.code === 'KeyG') jogo.comandoPlano('isca');
    if (e.code === 'KeyH') jogo.comandoPlano('doce');
    if (e.code === 'KeyN') jogo.comandoPlano('dificuldade');
    // A pergunta da evolução: Y deixa, U recusa.
    if (e.code === 'KeyY') jogo.comandoPlano('evoluir');
    if (e.code === 'KeyU') jogo.comandoPlano('naoEvoluir');
    // Os quatro golpes, nos números — como num jogo de Pokémon.
    if (e.code === 'Digit1') jogo.comandoPlano('golpe1');
    if (e.code === 'Digit2') jogo.comandoPlano('golpe2');
    if (e.code === 'Digit3') jogo.comandoPlano('golpe3');
    if (e.code === 'Digit4') jogo.comandoPlano('golpe4');
    if (e.code === 'KeyQ' || e.code === 'Tab') {
      e.preventDefault();
      jogo.comandoPlano('proximo');
    }
  });
  window.addEventListener('keyup', (e) => tecla.delete(e.code));

  const passo = new THREE.Vector3();
  jogo.camera.rotation.order = 'YXZ';

  planoAtualiza = (dt: number) => {
    jogo.camera.rotation.y = guinada;
    jogo.camera.rotation.x = inclinacao;

    passo.set(
      (tecla.has('KeyD') ? 1 : 0) - (tecla.has('KeyA') ? 1 : 0),
      0,
      (tecla.has('KeyS') ? 1 : 0) - (tecla.has('KeyW') ? 1 : 0),
    );
    if (passo.lengthSq() > 0) {
      passo.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), guinada);
      jogo.camera.position.addScaledVector(passo, dt * 2.2);
    }
    jogo.camera.position.y = 1.6;
  };
}

botaoPlano.addEventListener('click', iniciarModoPlano);

// ---------------------------------------------------------- modo widget

/**
 * A janela com o companheiro, para ficar aberta ao lado do resto do Quest.
 *
 * Ver `Jogo.ativarModoWidget`, que explica por que ele é uma JANELA e não um
 * bicho solto no Horizon Home. Reaproveita o modo de tela inteiro — mouse para
 * olhar, WASD para andar em volta — e só desliga o jogo que existe em volta do
 * companheiro.
 *
 * O `?widget` na URL faz a mesma coisa sem passar pelo menu: é o endereço que
 * se fixa numa janela do Home para ela abrir já com ele.
 */
function iniciarModoWidget() {
  ui.style.display = 'none';
  audio.iniciar();
  void jogo.ativarModoWidget();
  jogo.aoEntrarNaSessao();
  prepararTeclasDoPlano();
}

botaoWidget.addEventListener('click', iniciarModoWidget);
if (new URLSearchParams(location.search).has('widget')) iniciarModoWidget();

// ---------------------------------------------------------------- loop

let ultimo = performance.now();
let quadros = 0;

renderer.setAnimationLoop(() => {
  const agora = performance.now();
  const dt = Math.min(0.05, (agora - ultimo) / 1000);
  ultimo = agora;
  quadros++;

  planoAtualiza?.(dt);
  jogo.atualizar(dt);
  renderer.render(jogo.cena, jogo.camera);

  // Depois do render, de propósito: `info.render.calls` só vale para o desenho
  // que acabou de acontecer, e o `dt` deste quadro é o tempo que o quadro
  // ANTERIOR levou — render incluído. Medir aqui é medir o custo de verdade.
  jogo.medir(dt, renderer.info.render.calls);
});

// ---------------------------------------------------------------- PWA

// Só em produção: em desenvolvimento um service worker servindo cache velho
// custa mais tempo do que economiza.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', import.meta.url), { scope: './' }).catch(() => {
      // Sem service worker o jogo roda igual; só não fica disponível offline.
    });
  });
}

// Gancho de inspeção: dá para abrir o console e ver o estado do jogo rodando.
Object.assign(window, {
  cq: {
    jogo,
    renderer,
    get quadros() {
      return quadros;
    },
    get info() {
      return {
        quadros,
        chamadas: renderer.info.render.calls,
        triangulos: renderer.info.render.triangles,
        geometrias: renderer.info.memory.geometries,
        texturas: renderer.info.memory.textures,
        capturas: jogo.dex.totalCapturas,
      };
    },
  },
});
