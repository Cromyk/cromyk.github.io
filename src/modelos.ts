import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MEDIDAS } from './modelos.gen';

/**
 * Os Pokémon de verdade: modelos GLB carregados de public/pokemon/.
 *
 * Os arquivos vêm de rips dos jogos, comprimidos com Draco e textura WebP, e
 * chegam cada um numa escala e numa posição diferentes — de 0,01 a 629 unidades
 * de altura, alguns nascendo com o pé abaixo da origem, outros com o corpo
 * inteiro deslocado. tools/modelos.mjs já mediu tudo isso e gravou no
 * manifesto; aqui a gente só aplica.
 *
 * A hierarquia de cada bicho é sempre esta, e a divisão importa:
 *
 *   raiz     — o jogo manda nela: posição no quarto e para onde está virado
 *    └ corpo — a animação manda nela: respiração, squash & stretch no pulo
 *       └ ajuste — o manifesto manda nela: giro, centralização e escala
 *          └ a cena do GLB
 *
 * Ninguém mexe em "ajuste" depois de montado, e é isso que deixa a animação
 * escrever em `corpo.scale` sem desfazer a normalização.
 */

export interface MedidaModelo {
  num: number;
  giroX: number;
  giroY: number;
  alturaModelo: number;
  largura: number;
  profundidade: number;
  baseY: number;
  centroX: number;
  centroZ: number;
  temShiny: boolean;
  animacoes: string[];
  temEsqueleto: boolean;
  vertices: number;
}

export const medidaDe = (id: string): MedidaModelo | undefined => MEDIDAS[id];
export const temModelo = (id: string) => id in MEDIDAS;
export const temShiny = (id: string) => MEDIDAS[id]?.temShiny === true;

/**
 * Um bicho pronto para entrar em cena. O que o resto do jogo enxerga.
 */
export interface Corpo {
  raiz: THREE.Group;
  corpo: THREE.Group;
  /** De onde sai o golpe: à frente e no alto do corpo. */
  boca: THREE.Object3D;
  /** Altura final, em metros, dentro do quarto. */
  altura: number;
  /** Metade da maior medida horizontal — serve de raio para colisão. */
  raio: number;
  mixer: THREE.AnimationMixer | null;
  /** Clipes assados que vieram no arquivo, pelo nome. Poucos modelos têm. */
  acoes: Map<string, THREE.AnimationAction>;
  descartar(): void;
}

/**
 * Pinta um exemplar de brilhante, quando o repositório não tem o modelo shiny.
 *
 * Sessenta e uma das 151 espécies têm um arquivo `<num>s.glb` com as cores
 * alternativas de verdade. As outras noventa não tinham como ser brilhantes —
 * e o jogador não tinha como descobrir quais: ele só nunca via um.
 *
 * Aqui a cor é girada no matiz e clareada. Não é a paleta oficial, e não tenta
 * ser; o que um brilhante precisa entregar é **ser visivelmente outro** à
 * primeira vista, e um giro de matiz fixo faz isso mantendo a leitura da forma.
 *
 * Os materiais são CLONADOS antes de qualquer coisa: os originais vêm do molde
 * em cache e são compartilhados por todos os exemplares da espécie. Pintar os
 * originais tingiria todo Rattata da sala, e para sempre — o cache não se
 * recarrega. Os clones voltam junto com o corpo, em `descartar`.
 */
function tingirDeBrilhante(raiz: THREE.Object3D): THREE.Material[] {
  const clones: THREE.Material[] = [];
  const hsl = { h: 0, s: 0, l: 0 };

  raiz.traverse((obj) => {
    const malha = obj as THREE.Mesh;
    if (!malha.isMesh) return;
    const lista = Array.isArray(malha.material) ? malha.material : [malha.material];
    const pintados = lista.map((m) => {
      const clone = (m as THREE.MeshStandardMaterial).clone();
      clone.color.getHSL(hsl);
      // 0,38 de giro: longe o bastante para não parecer a mesma cor num tom
      // diferente, perto o bastante para o bicho continuar reconhecível.
      clone.color.setHSL((hsl.h + 0.38) % 1, Math.min(1, hsl.s * 1.25 + 0.12), Math.min(0.82, hsl.l * 1.12 + 0.06));
      // Um brilho de ouro por cima: é o que o olho lê como "raro" antes mesmo
      // de reparar que a cor mudou.
      if (clone.emissive) {
        clone.emissive.setRGB(0.16, 0.13, 0.03);
        clone.emissiveIntensity = 1;
      }
      clones.push(clone);
      return clone;
    });
    malha.material = Array.isArray(malha.material) ? pintados : pintados[0];
  });

  return clones;
}

// ---------------------------------------------------------------- carregador

const draco = new DRACOLoader().setDecoderPath('./draco/');
const carregador = new GLTFLoader().setDRACOLoader(draco);

const carregados = new Map<string, GLTF>();
const carregando = new Map<string, Promise<GLTF | null>>();
/** Ordem de uso, do mais antigo para o mais recente. Alimenta o despejo. */
const recentes: string[] = [];

/** Quantos modelos ficam na memória do headset. Acima disso, o mais velho sai. */
const TETO_CACHE = 14;

const chave = (id: string, shiny: boolean) => (shiny ? `${id}#s` : id);

function arquivoDe(id: string, shiny: boolean): string | null {
  const medida = MEDIDAS[id];
  if (!medida) return null;
  return `./pokemon/${medida.num}${shiny && medida.temShiny ? 's' : ''}.glb`;
}

function marcarUso(k: string) {
  const i = recentes.indexOf(k);
  if (i !== -1) recentes.splice(i, 1);
  recentes.push(k);
}

/**
 * Joga fora o modelo menos usado quando o cache passa do teto.
 *
 * Isso existe por causa do headset: são 151 espécies e cada uma traz textura
 * própria. Numa sessão longa dá para encontrar dezenas delas, e segurar tudo
 * na VRAM do Quest 3S acaba mal. Quem estiver em campo não é despejado porque
 * a instância já clonou a cena — só o molde sai.
 */
function despejar() {
  while (recentes.length > TETO_CACHE) {
    const velho = recentes.shift();
    if (!velho) break;
    const gltf = carregados.get(velho);
    if (!gltf) continue;
    carregados.delete(velho);
    gltf.scene.traverse((obj) => {
      const malha = obj as THREE.Mesh;
      if (!malha.isMesh) return;
      malha.geometry.dispose();
      for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) {
        const mat = m as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.normalMap?.dispose();
        mat.emissiveMap?.dispose();
        mat.dispose();
      }
    });
  }
}

/** Garante o modelo em memória. Devolve null se o arquivo não existir. */
export function garantir(id: string, shiny = false): Promise<GLTF | null> {
  const k = chave(id, shiny);
  const pronto = carregados.get(k);
  if (pronto) {
    marcarUso(k);
    return Promise.resolve(pronto);
  }

  const emCurso = carregando.get(k);
  if (emCurso) return emCurso;

  const url = arquivoDe(id, shiny);
  if (!url) return Promise.resolve(null);

  const promessa = carregador
    .loadAsync(url)
    .then((gltf) => {
      carregados.set(k, gltf);
      marcarUso(k);
      despejar();
      return gltf;
    })
    .catch((erro) => {
      // Um modelo que não carrega não pode derrubar o jogo: o bicho
      // simplesmente não aparece, e o próximo sorteio escolhe outro.
      console.warn(`modelo ${id}${shiny ? ' shiny' : ''} não carregou`, erro);
      return null;
    })
    .finally(() => {
      carregando.delete(k);
    });

  carregando.set(k, promessa);
  return promessa;
}

export const jaCarregado = (id: string, shiny = false) => carregados.has(chave(id, shiny));

/** Carrega vários de uma vez — a tela de escolha do inicial usa isto. */
export async function precarregar(ids: string[], shiny = false): Promise<void> {
  await Promise.all(ids.map((id) => garantir(id, shiny)));
}

// ---------------------------------------------------------------- instância

/**
 * Monta um exemplar do bicho no tamanho pedido.
 *
 * Com `alturaExata`, a conta é a direta — `alturaAlvo / alturaDoModelo` — e o
 * bicho fica com a altura da Pokédex, na bucha. É o que "tamanho real" quer
 * dizer: Onix tem 8,8 m e atravessa a sala inteira, e atravessar é o ponto.
 *
 * Sem ela, o limite leva em conta também a maior medida horizontal: um Onix
 * vem deitado e mais de cinco vezes mais comprido do que alto, e escalar pela
 * altura o deixaria com dois metros e meio cruzando o quarto mesmo na curva
 * comprimida. Nenhum bicho passa do dobro da própria altura em comprimento.
 */
export function instanciar(
  id: string,
  alturaAlvo: number,
  shiny = false,
  alturaExata = false,
): Corpo | null {
  const k = chave(id, shiny);
  const gltf = carregados.get(k);
  const medida = MEDIDAS[id];
  if (!gltf || !medida) return null;
  marcarUso(k);

  const cena = clonarComEsqueleto(gltf.scene) as THREE.Object3D;

  const maiorHorizontal = Math.max(medida.largura, medida.profundidade);
  const referencia = alturaExata
    ? Math.max(medida.alturaModelo, 1e-6)
    : Math.max(medida.alturaModelo, maiorHorizontal / 2, 1e-6);
  const escala = alturaAlvo / referencia;

  // Três nós, nesta ordem, porque a ordem é o que faz a conta fechar. O
  // manifesto mediu a caixa DEPOIS do giro, então centralizar tem de acontecer
  // no espaço já girado — e escalar, por último, sobre tudo:
  //
  //   final = escala · ( giro · bruto − centro medido )
  const giro = new THREE.Group();
  giro.rotation.set(medida.giroX, medida.giroY, 0);
  giro.add(cena);

  const desloca = new THREE.Group();
  desloca.position.set(-medida.centroX, -medida.baseY, -medida.centroZ);
  desloca.add(giro);

  const ajuste = new THREE.Group();
  ajuste.scale.setScalar(escala);
  ajuste.add(desloca);

  let sombras = 0;
  cena.traverse((obj) => {
    const malha = obj as THREE.Mesh;
    if (!malha.isMesh) return;
    // Sombra só nas primeiras malhas: em MR o headset já desenha tudo duas
    // vezes, e um bicho com dez submalhas projetando sombra não compensa.
    malha.castShadow = sombras++ < 6;
    malha.receiveShadow = false;
    // Malha com esqueleto tem a caixa calculada na pose de bind; sem isto ela
    // some do quadro quando a animação afasta os ossos da caixa original.
    malha.frustumCulled = false;
  });

  // Brilhante sem arquivo próprio: a cor é girada aqui, no exemplar. As 61 que
  // têm o  já vieram com as cores certas e não são tocadas.
  const proprios = shiny && !medida.temShiny ? tingirDeBrilhante(cena) : [];

  const corpo = new THREE.Group();
  corpo.add(ajuste);

  const raiz = new THREE.Group();
  raiz.add(corpo);

  const boca = new THREE.Object3D();
  boca.position.set(0, alturaAlvo * 0.74, Math.min(medida.profundidade * escala * 0.5, alturaAlvo * 0.5));
  corpo.add(boca);

  let mixer: THREE.AnimationMixer | null = null;
  const acoes = new Map<string, THREE.AnimationAction>();
  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(cena);
    for (const clipe of gltf.animations) acoes.set(clipe.name, mixer.clipAction(clipe));
  }

  return {
    raiz,
    corpo,
    boca,
    altura: alturaAlvo,
    raio: Math.max(maiorHorizontal * escala * 0.5, alturaAlvo * 0.25),
    mixer,
    acoes,
    descartar() {
      mixer?.stopAllAction();
      raiz.removeFromParent();
      // Geometria e material são do molde em cache, compartilhados entre os
      // exemplares: quem descarta isso é o despejo, não o indivíduo. A exceção
      // são os materiais clonados para pintar um brilhante — esses são deste
      // exemplar e morrem com ele.
      for (const m of proprios) m.dispose();
    },
  };
}
