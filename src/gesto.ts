import * as THREE from 'three';

/**
 * O gesto de olhar as horas, que é o que abre os painéis de pulso.
 *
 * A primeira versão abria quando a palma apontava para cima, e isso pegava
 * demais: com o braço relaxado ao lado do corpo a mão já fica quase nessa pose,
 * e os painéis viviam abertos na frente do jogo.
 *
 * O gesto de verdade tem uma assinatura mais estreita. O relógio fica no DORSO
 * do punho, então o que aponta para o rosto na hora de ler é o dorso — não a
 * palma. Pela convenção do grip space do WebXR o eixo X é perpendicular à
 * palma, e o lado do dorso troca de sinal entre as mãos: −X na esquerda, +X na
 * direita.
 *
 * Somamos a isso a mão estar erguida e perto do rosto, e o resultado só dispara
 * quando você realmente vira o pulso para ler.
 */

/** Quanto o dorso precisa encarar a cabeça para abrir, e para continuar aberto. */
const ABRIR = 0.62;
const MANTER = 0.38;

/**
 * Para que lado sai o dorso, em coordenadas locais da mão.
 *
 * Se algum runtime discordar da convenção, o painel simplesmente não abriria — e
 * descobrir isso com o headset na cabeça e o código no PC é lento. Daí a
 * válvula: abrir o jogo com `?dorso=invertido` troca o sinal sem recompilar.
 */
const INVERTIDO =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('dorso') === 'invertido';

const dorsoLocal = (lado: 'left' | 'right') => {
  const x = lado === 'left' ? -1 : 1;
  return new THREE.Vector3(INVERTIDO ? -x : x, 0, 0);
};

const dorso = new THREE.Vector3();
const posicaoMao = new THREE.Vector3();
const cabeca = new THREE.Vector3();
const paraCabeca = new THREE.Vector3();
const giro = new THREE.Quaternion();

/**
 * Se o painel daquela mão deve estar aberto agora.
 *
 * `abertoAgora` entra na conta porque o limiar é mais frouxo para manter aberto
 * do que para abrir: sem essa histerese o painel pisca enquanto você o lê.
 */
export function olhandoORelogio(
  punho: THREE.Object3D | null,
  lado: 'left' | 'right',
  camera: THREE.Camera,
  abertoAgora: boolean,
): boolean {
  if (!punho) return false;

  punho.updateMatrixWorld();
  punho.getWorldQuaternion(giro);
  dorso.copy(dorsoLocal(lado)).applyQuaternion(giro);

  punho.getWorldPosition(posicaoMao);
  camera.getWorldPosition(cabeca);
  paraCabeca.copy(cabeca).sub(posicaoMao);
  const distancia = paraCabeca.length();
  paraCabeca.normalize();

  const encarando = dorso.dot(paraCabeca);
  // Braço relaxado põe a mão perto de 70 cm abaixo dos olhos; olhar as horas a
  // traz para a altura do peito.
  const erguida = posicaoMao.y > cabeca.y - 0.55 && distancia < 0.9;

  return encarando > (abertoAgora ? MANTER : ABRIR) && (erguida || abertoAgora);
}
