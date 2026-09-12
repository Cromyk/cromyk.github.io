import * as THREE from 'three';

/**
 * Ferramentas de estilo: sombreado em degraus e contorno preto.
 *
 * É o que separa "umas esferas com cor" de "um personagem de jogo". Sem
 * contorno, geometria simples lê como bolha; com contorno, lê como desenho.
 */

let mapaGradiente: THREE.DataTexture | null = null;

/** Rampa de 4 degraus — o corte duro entre luz e sombra é o efeito todo. */
function gradiente(): THREE.DataTexture {
  if (mapaGradiente) return mapaGradiente;
  const niveis = new Uint8Array([90, 160, 215, 255]);
  const textura = new THREE.DataTexture(niveis, niveis.length, 1, THREE.RedFormat);
  textura.needsUpdate = true;
  mapaGradiente = textura;
  return textura;
}

export interface OpcoesToon {
  cor: number;
  emissivo?: number;
  intensidadeEmissiva?: number;
  transparente?: boolean;
  opacidade?: number;
}

export function materialToon(opcoes: OpcoesToon): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: opcoes.cor,
    gradientMap: gradiente(),
    emissive: opcoes.emissivo ?? 0x000000,
    emissiveIntensity: opcoes.intensidadeEmissiva ?? 1,
    transparent: opcoes.transparente ?? false,
    opacity: opcoes.opacidade ?? 1,
  });
}

/** Material do contorno: casca preta desenhada pelo avesso. */
export function materialContorno(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0x17151c, side: THREE.BackSide });
}

/**
 * Envolve uma malha num contorno: a mesma geometria inflada ao longo das
 * normais e desenhada só pelas faces de trás, então ela só aparece na borda.
 *
 * Só vale a pena nas peças grandes — pôr contorno num olho de 2 cm custa um
 * draw call e não se enxerga.
 */
export function comContorno(
  malha: THREE.Mesh,
  espessura: number,
  material: THREE.Material,
): THREE.Group {
  const grupo = new THREE.Group();
  grupo.add(malha);

  const casca = new THREE.Mesh(malha.geometry, material);
  // Copia a transformação local para a casca acompanhar a peça.
  casca.position.copy(malha.position);
  casca.rotation.copy(malha.rotation);
  casca.quaternion.copy(malha.quaternion);
  casca.scale.copy(malha.scale).multiplyScalar(1 + espessura);
  casca.renderOrder = -1;
  grupo.add(casca);

  return grupo;
}

/**
 * Corpo gerado por revolução de um perfil. Substitui a pilha de esferas: o
 * contorno fica contínuo, sem os degraus de onde uma bola entra na outra.
 *
 * @param perfil pares [raio, altura], de baixo para cima
 */
export function corpoTorneado(
  perfil: Array<[number, number]>,
  segmentos = 24,
): THREE.LatheGeometry {
  const pontos = perfil.map(([raio, altura]) => new THREE.Vector2(Math.max(0.0001, raio), altura));
  const geometria = new THREE.LatheGeometry(pontos, segmentos);
  geometria.computeVertexNormals();
  return geometria;
}

/**
 * Suaviza um perfil com Catmull-Rom antes de tornear, para a silhueta sair
 * curva de verdade em vez de facetada.
 */
export function perfilSuave(
  pontos: Array<[number, number]>,
  divisoes = 5,
): Array<[number, number]> {
  const curva = new THREE.SplineCurve(pontos.map(([x, y]) => new THREE.Vector2(x, y)));
  const total = pontos.length * divisoes;
  return curva.getPoints(total).map((p) => [p.x, p.y] as [number, number]);
}
