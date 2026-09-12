import * as THREE from 'three';
import { criarRng, entre, type Rng } from './rng';

export type Elemento = 'brasa' | 'limo' | 'gota' | 'faisca' | 'pedra' | 'sopro' | 'nevoa';

export type Forma = 'gota' | 'ovo' | 'bloco' | 'floco';
export type Enfeite = 'orelhas' | 'chifres' | 'cauda' | 'asas' | 'crista' | 'antenas' | 'anel';

/** 1 = comum, 2 = incomum, 3 = raro. Afeta spawn, fuga e dificuldade de captura. */
export type Raridade = 1 | 2 | 3;

export interface Especie {
  id: string;
  nome: string;
  elemento: Elemento;
  raridade: Raridade;
  /** Altura aproximada do corpo, em metros. */
  altura: number;
  forma: Forma;
  cor: number;
  corDetalhe: number;
  enfeites: Enfeite[];
  descricao: string;
}

export const ELEMENTOS: Record<Elemento, { nome: string; cor: number }> = {
  brasa: { nome: 'Brasa', cor: 0xff6b3d },
  limo: { nome: 'Limo', cor: 0x6fd67a },
  gota: { nome: 'Gota', cor: 0x4fb8f0 },
  faisca: { nome: 'Faísca', cor: 0xffd54a },
  pedra: { nome: 'Pedra', cor: 0xa98e74 },
  sopro: { nome: 'Sopro', cor: 0xa8e6e0 },
  nevoa: { nome: 'Névoa', cor: 0xb28cf0 },
};

export const ESPECIES: readonly Especie[] = [
  {
    id: 'flamito',
    nome: 'Flamito',
    elemento: 'brasa',
    raridade: 1,
    altura: 0.34,
    forma: 'gota',
    cor: 0xff7a45,
    corDetalhe: 0xffd9a0,
    enfeites: ['crista', 'cauda'],
    descricao: 'Esquenta o chão onde senta. Some se você acender a luz de repente.',
  },
  {
    id: 'brotinho',
    nome: 'Brotinho',
    elemento: 'limo',
    raridade: 1,
    altura: 0.28,
    forma: 'ovo',
    cor: 0x7ede86,
    corDetalhe: 0x3f8f52,
    enfeites: ['orelhas', 'cauda'],
    descricao: 'Nasce em vaso de planta esquecido. Dorme de pé.',
  },
  {
    id: 'pingolim',
    nome: 'Pingolim',
    elemento: 'gota',
    raridade: 1,
    altura: 0.3,
    forma: 'gota',
    cor: 0x5cc4f5,
    corDetalhe: 0xc9edff,
    enfeites: ['orelhas', 'anel'],
    descricao: 'Deixa uma poça que evapora em dois minutos. Adora torneira pingando.',
  },
  {
    id: 'pedrusco',
    nome: 'Pedrusco',
    elemento: 'pedra',
    raridade: 1,
    altura: 0.33,
    forma: 'bloco',
    cor: 0xb09a8d,
    corDetalhe: 0x6d5a49,
    enfeites: ['chifres'],
    descricao: 'Finge ser um móvel quando percebe que está sendo observado.',
  },
  {
    id: 'zapik',
    nome: 'Zapik',
    elemento: 'faisca',
    raridade: 2,
    altura: 0.26,
    forma: 'floco',
    cor: 0xffd95e,
    corDetalhe: 0xfff3c0,
    enfeites: ['antenas', 'asas'],
    descricao: 'Mora dentro de tomada. Sai correndo em zigue-zague, nunca em linha reta.',
  },
  {
    id: 'ventusco',
    nome: 'Ventusco',
    elemento: 'sopro',
    raridade: 2,
    altura: 0.36,
    forma: 'floco',
    cor: 0xb5eee8,
    corDetalhe: 0xffffff,
    enfeites: ['asas', 'anel'],
    descricao: 'Só existe enquanto está em movimento. Parar dói nele.',
  },
  {
    id: 'sombrino',
    nome: 'Sombrino',
    elemento: 'nevoa',
    raridade: 2,
    altura: 0.31,
    forma: 'gota',
    cor: 0xa383e8,
    corDetalhe: 0x2a1f47,
    enfeites: ['orelhas', 'cauda', 'chifres'],
    descricao: 'Aparece no canto do olho. Some quando você olha direto.',
  },
  {
    id: 'lunaris',
    nome: 'Lunaris',
    elemento: 'nevoa',
    raridade: 3,
    altura: 0.42,
    forma: 'ovo',
    cor: 0xe4d9ff,
    corDetalhe: 0x8f6fe0,
    enfeites: ['asas', 'anel', 'chifres'],
    descricao: 'Uma por noite, e só se ninguém estiver procurando. Você teve sorte.',
  },
];

export const porId = (id: string) => ESPECIES.find((e) => e.id === id);

/** Peso de spawn: raros aparecem bem menos. */
export const pesoSpawn = (e: Especie) => (e.raridade === 1 ? 10 : e.raridade === 2 ? 3.2 : 0.55);

/**
 * Chance de sobreviver a cada uma das três sacudidas. A chance final de captura
 * é esse valor ao cubo: ~59% para comum, ~29% para incomum, ~10% para raro.
 */
export const facilidadeCaptura = (e: Especie) => (e.raridade === 1 ? 0.84 : e.raridade === 2 ? 0.66 : 0.46);

export interface PartesCriatura {
  raiz: THREE.Group;
  corpo: THREE.Mesh;
  olhos: THREE.Group;
  palpebras: THREE.Mesh[];
  cauda?: THREE.Group;
  asas: THREE.Group[];
  anel?: THREE.Mesh;
  /** Tudo que precisa de dispose quando a criatura sai de cena. */
  descartaveis: Array<THREE.BufferGeometry | THREE.Material>;
}

function geometriaCorpo(forma: Forma, altura: number): THREE.BufferGeometry {
  switch (forma) {
    case 'gota': {
      // Esfera alongada para cima, com a base mais gorda — silhueta de gotinha.
      const g = new THREE.SphereGeometry(altura * 0.5, 32, 24);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        // Clamp obrigatório: o polo sul da esfera cai em t ≈ -1e-8 por
        // arredondamento, e Math.pow de base negativa com expoente fracionário
        // devolve NaN — o que abre um buraco no corpo.
        const t = THREE.MathUtils.clamp((y / (altura * 0.5) + 1) * 0.5, 0, 1); // 0 embaixo, 1 em cima
        const afunila = 1 - Math.pow(t, 2.2) * 0.42;
        pos.setX(i, pos.getX(i) * afunila);
        pos.setZ(i, pos.getZ(i) * afunila);
        pos.setY(i, y * 1.16);
      }
      g.computeVertexNormals();
      return g;
    }
    case 'ovo': {
      const g = new THREE.SphereGeometry(altura * 0.46, 32, 24);
      g.scale(1, 1.22, 0.95);
      return g;
    }
    case 'bloco': {
      const g = new THREE.BoxGeometry(altura * 0.82, altura * 0.8, altura * 0.78, 4, 4, 4);
      // Arredonda empurrando cada vértice na direção da esfera circunscrita.
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      const raio = altura * 0.5;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const alvo = v.clone().normalize().multiplyScalar(raio);
        v.lerp(alvo, 0.34);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    }
    case 'floco': {
      // Icosaedro deformado: corpo facetado, meio cristalino.
      const g = new THREE.IcosahedronGeometry(altura * 0.48, 1);
      const rng = criarRng(9317);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).multiplyScalar(entre(rng, 0.88, 1.12));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    }
  }
}

/**
 * Monta o corpo da criatura a partir da espécie. Tudo procedural: nenhum
 * arquivo de modelo, nenhuma textura — o jogo inteiro é código.
 */
export function construirCriatura(especie: Especie, semente = 1): PartesCriatura {
  const rng: Rng = criarRng(semente);
  const raiz = new THREE.Group();
  const descartaveis: PartesCriatura['descartaveis'] = [];
  const raro = especie.raridade === 3;

  const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    descartaveis.push(x);
    return x;
  };

  const matCorpo = guardar(
    new THREE.MeshStandardMaterial({
      color: especie.cor,
      roughness: 0.52,
      metalness: 0.06,
      emissive: new THREE.Color(especie.cor).multiplyScalar(raro ? 0.32 : 0.1),
      flatShading: especie.forma === 'floco',
    }),
  );
  const matDetalhe = guardar(
    new THREE.MeshStandardMaterial({ color: especie.corDetalhe, roughness: 0.6, metalness: 0.05 }),
  );

  const corpo = new THREE.Mesh(guardar(geometriaCorpo(especie.forma, especie.altura)), matCorpo);
  corpo.castShadow = true;
  corpo.position.y = especie.altura * 0.5;
  raiz.add(corpo);

  // --- Olhos: esclera + pupila + pálpebra que desce ao piscar ---
  const olhos = new THREE.Group();
  const rOlho = especie.altura * 0.13;
  const matEsclera = guardar(new THREE.MeshStandardMaterial({ color: 0xfdfdff, roughness: 0.28 }));
  const matPupila = guardar(new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.2 }));
  const geoEsclera = guardar(new THREE.SphereGeometry(rOlho, 18, 14));
  const geoPupila = guardar(new THREE.SphereGeometry(rOlho * 0.52, 14, 10));
  const geoPalpebra = guardar(
    new THREE.SphereGeometry(rOlho * 1.04, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
  );

  const palpebras: THREE.Mesh[] = [];
  for (const lado of [-1, 1]) {
    const olho = new THREE.Group();
    olho.position.set(lado * especie.altura * 0.19, 0, especie.altura * 0.33);

    olho.add(new THREE.Mesh(geoEsclera, matEsclera));

    const pupila = new THREE.Mesh(geoPupila, matPupila);
    pupila.position.z = rOlho * 0.62;
    olho.add(pupila);

    const palpebra = new THREE.Mesh(geoPalpebra, matCorpo);
    palpebra.scale.y = 0.01; // 1 = olho fechado
    olho.add(palpebra);
    palpebras.push(palpebra);

    olhos.add(olho);
  }
  olhos.position.y = especie.altura * 0.62;
  raiz.add(olhos);

  // --- Enfeites ---
  const asas: THREE.Group[] = [];
  let cauda: THREE.Group | undefined;
  let anel: THREE.Mesh | undefined;

  if (especie.enfeites.includes('orelhas')) {
    const geo = guardar(new THREE.ConeGeometry(especie.altura * 0.12, especie.altura * 0.3, 12));
    for (const lado of [-1, 1]) {
      const orelha = new THREE.Mesh(geo, matCorpo);
      orelha.castShadow = true;
      orelha.position.set(lado * especie.altura * 0.24, especie.altura * 0.9, -especie.altura * 0.02);
      orelha.rotation.z = lado * -0.34;
      orelha.rotation.x = -0.18;
      raiz.add(orelha);
    }
  }

  if (especie.enfeites.includes('chifres')) {
    const geo = guardar(new THREE.ConeGeometry(especie.altura * 0.07, especie.altura * 0.22, 8));
    for (const lado of [-1, 1]) {
      const chifre = new THREE.Mesh(geo, matDetalhe);
      chifre.castShadow = true;
      chifre.position.set(lado * especie.altura * 0.17, especie.altura * 0.92, especie.altura * 0.05);
      chifre.rotation.z = lado * -0.5;
      raiz.add(chifre);
    }
  }

  if (especie.enfeites.includes('crista')) {
    const geo = guardar(new THREE.ConeGeometry(especie.altura * 0.1, especie.altura * 0.26, 4));
    for (let i = 0; i < 3; i++) {
      const espinho = new THREE.Mesh(geo, matDetalhe);
      espinho.castShadow = true;
      const t = (i - 1) * 0.3;
      espinho.position.set(
        0,
        especie.altura * (0.88 - Math.abs(t) * 0.22),
        -especie.altura * (0.1 + i * 0.12),
      );
      espinho.rotation.x = -0.5 - i * 0.2;
      espinho.scale.setScalar(1 - i * 0.18);
      raiz.add(espinho);
    }
  }

  if (especie.enfeites.includes('antenas')) {
    const haste = guardar(
      new THREE.CylinderGeometry(especie.altura * 0.012, especie.altura * 0.012, especie.altura * 0.3, 6),
    );
    const bola = guardar(new THREE.SphereGeometry(especie.altura * 0.055, 12, 10));
    const matBola = guardar(
      new THREE.MeshStandardMaterial({
        color: especie.corDetalhe,
        emissive: new THREE.Color(especie.corDetalhe).multiplyScalar(0.75),
        roughness: 0.3,
      }),
    );
    for (const lado of [-1, 1]) {
      const antena = new THREE.Group();
      const h = new THREE.Mesh(haste, matDetalhe);
      h.position.y = especie.altura * 0.15;
      const b = new THREE.Mesh(bola, matBola);
      b.position.y = especie.altura * 0.3;
      antena.add(h, b);
      antena.position.set(lado * especie.altura * 0.14, especie.altura * 0.86, 0);
      antena.rotation.z = lado * -0.42;
      raiz.add(antena);
    }
  }

  if (especie.enfeites.includes('cauda')) {
    cauda = new THREE.Group();
    const geo = guardar(new THREE.SphereGeometry(especie.altura * 0.08, 12, 10));
    let anterior: THREE.Object3D = cauda;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(geo, i === 3 ? matDetalhe : matCorpo);
      seg.castShadow = true;
      seg.position.set(0, especie.altura * 0.04, -especie.altura * 0.13);
      seg.scale.setScalar(1 - i * 0.16);
      anterior.add(seg);
      anterior = seg;
    }
    cauda.position.set(0, especie.altura * 0.36, -especie.altura * 0.36);
    raiz.add(cauda);
  }

  if (especie.enfeites.includes('asas')) {
    const forma = new THREE.Shape();
    const a = especie.altura;
    forma.moveTo(0, 0);
    forma.quadraticCurveTo(a * 0.34, a * 0.3, a * 0.52, a * 0.06);
    forma.quadraticCurveTo(a * 0.4, -a * 0.08, 0, -a * 0.1);
    const geoAsa = guardar(new THREE.ShapeGeometry(forma, 14));
    const matAsa = guardar(
      new THREE.MeshStandardMaterial({
        color: especie.corDetalhe,
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
        roughness: 0.35,
        emissive: new THREE.Color(especie.corDetalhe).multiplyScalar(0.28),
      }),
    );
    for (const lado of [-1, 1]) {
      const asa = new THREE.Group();
      const malha = new THREE.Mesh(geoAsa, matAsa);
      malha.scale.x = lado;
      asa.add(malha);
      asa.position.set(lado * especie.altura * 0.26, especie.altura * 0.6, -especie.altura * 0.12);
      asa.rotation.y = lado * 0.5;
      raiz.add(asa);
      asas.push(asa);
    }
  }

  if (especie.enfeites.includes('anel')) {
    const geo = guardar(new THREE.TorusGeometry(especie.altura * 0.5, especie.altura * 0.022, 8, 40));
    const mat = guardar(
      new THREE.MeshStandardMaterial({
        color: especie.corDetalhe,
        emissive: new THREE.Color(especie.corDetalhe).multiplyScalar(0.6),
        roughness: 0.3,
        transparent: true,
        opacity: 0.85,
      }),
    );
    anel = new THREE.Mesh(geo, mat);
    anel.position.y = especie.altura * 0.52;
    anel.rotation.x = Math.PI * 0.5 + entre(rng, -0.22, 0.22);
    raiz.add(anel);
  }

  return { raiz, corpo, olhos, palpebras, cauda, asas, anel, descartaveis };
}
