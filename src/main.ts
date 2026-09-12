import * as THREE from 'three';
import { Jogo } from './game';
import { audio } from './audio';

const botaoEntrar = document.getElementById('enter') as HTMLButtonElement;
const botaoPlano = document.getElementById('flat') as HTMLButtonElement;
const nota = document.getElementById('note') as HTMLParagraphElement;
const ui = document.getElementById('ui') as HTMLDivElement;

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

const FEATURES: XRSessionInit = {
  requiredFeatures: ['local-floor'],
  optionalFeatures: ['plane-detection', 'mesh-detection', 'anchors', 'hit-test', 'hand-tracking'],
};

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
      ui.style.display = 'grid';
      botaoEntrar.disabled = false;
      botaoEntrar.textContent = 'entrar em realidade mista';
      nota.textContent = `Sessão encerrada. ${jogo.dex.totalCapturas} capturas até agora.`;
    });

    await renderer.xr.setSession(sessao);
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

  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas || e.button !== 0) return;
    jogo.arremessoPlano('inicio');
  });
  canvas.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    jogo.arremessoPlano('fim');
  });

  window.addEventListener('keydown', (e) => tecla.add(e.code));
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
