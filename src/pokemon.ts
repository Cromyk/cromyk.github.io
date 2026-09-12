import * as THREE from 'three';

/**
 * Os quatro iniciais, montados em geometria — não há nenhum modelo importado.
 * A proporção é chibi de propósito: cabeça grande e corpo curto leem melhor a
 * 1,5 m de distância, que é onde eles ficam no seu quarto.
 */

export interface Partes {
  raiz: THREE.Group;
  /** Tronco — é ele que respira e faz squash & stretch. */
  corpo: THREE.Group;
  cabeca: THREE.Group;
  olhos: THREE.Group;
  palpebras: THREE.Mesh[];
  cauda?: THREE.Group;
  orelhas: THREE.Group[];
  membros: THREE.Group[];
  /** Ponto de onde sai o ataque, em coordenadas locais. */
  boca: THREE.Object3D;
  /** Brilha durante o ataque (chama do Charmander, bochechas do Pikachu…). */
  emissivos: THREE.Material[];
  descartaveis: Array<THREE.BufferGeometry | THREE.Material>;
}

/** Coletor que garante o dispose de tudo que criamos. */
class Oficina {
  descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.descartaveis.push(g);
    return g;
  }

  mat(opcoes: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.03, ...opcoes });
    this.descartaveis.push(m);
    return m;
  }

  /** Esfera achatável, o tijolo básico de tudo aqui. */
  bolha(raio: number, material: THREE.Material, escala: [number, number, number] = [1, 1, 1]) {
    const malha = new THREE.Mesh(this.geo(new THREE.SphereGeometry(raio, 24, 18)), material);
    malha.scale.set(...escala);
    malha.castShadow = true;
    return malha;
  }

  capsula(raio: number, comprimento: number, material: THREE.Material) {
    const malha = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(raio, comprimento, 6, 14)), material);
    malha.castShadow = true;
    return malha;
  }

  cone(raio: number, altura: number, material: THREE.Material, lados = 14) {
    const malha = new THREE.Mesh(this.geo(new THREE.ConeGeometry(raio, altura, lados)), material);
    malha.castShadow = true;
    return malha;
  }
}

/** Par de olhos com pupila, brilho e pálpebra que desce. */
function montarOlhos(
  of: Oficina,
  raio: number,
  separacao: number,
  frente: number,
  corPalpebra: THREE.Material,
): { grupo: THREE.Group; palpebras: THREE.Mesh[] } {
  const grupo = new THREE.Group();
  const palpebras: THREE.Mesh[] = [];

  const matBranco = of.mat({ color: 0xfdfdff, roughness: 0.25 });
  const matPupila = of.mat({ color: 0x14161c, roughness: 0.18 });
  const matBrilho = of.mat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });

  const geoOlho = of.geo(new THREE.SphereGeometry(raio, 18, 14));
  const geoPupila = of.geo(new THREE.SphereGeometry(raio * 0.55, 14, 12));
  const geoBrilho = of.geo(new THREE.SphereGeometry(raio * 0.2, 8, 8));
  const geoPalpebra = of.geo(
    new THREE.SphereGeometry(raio * 1.05, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
  );

  for (const lado of [-1, 1]) {
    const olho = new THREE.Group();
    olho.position.set(lado * separacao, 0, frente);

    olho.add(new THREE.Mesh(geoOlho, matBranco));

    const pupila = new THREE.Mesh(geoPupila, matPupila);
    pupila.position.z = raio * 0.6;
    olho.add(pupila);

    const brilho = new THREE.Mesh(geoBrilho, matBrilho);
    brilho.position.set(lado * raio * 0.22, raio * 0.3, raio * 0.82);
    olho.add(brilho);

    const palpebra = new THREE.Mesh(geoPalpebra, corPalpebra);
    palpebra.scale.y = 0.01;
    olho.add(palpebra);
    palpebras.push(palpebra);

    grupo.add(olho);
  }

  return { grupo, palpebras };
}

/** Braço ou perna: uma cápsula com uma bolinha na ponta. */
function montarMembro(of: Oficina, raio: number, comprimento: number, material: THREE.Material) {
  const grupo = new THREE.Group();
  const braco = of.capsula(raio, comprimento, material);
  braco.position.y = -comprimento * 0.5;
  grupo.add(braco);
  const ponta = of.bolha(raio * 1.15, material);
  ponta.position.y = -comprimento - raio * 0.2;
  grupo.add(ponta);
  return grupo;
}

// ---------------------------------------------------------------- Charmander

export function construirCharmander(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const laranja = of.mat({ color: 0xff8c42 });
  const creme = of.mat({ color: 0xffe0b0 });
  const matChama = of.mat({
    color: 0xffb43c,
    emissive: 0xff7a10,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  });

  // --- tronco ---
  const corpo = new THREE.Group();
  corpo.add(of.bolha(0.1, laranja, [1, 1.12, 0.95]));
  const barriga = of.bolha(0.072, creme, [1, 1.1, 0.72]);
  barriga.position.set(0, -0.012, 0.055);
  corpo.add(barriga);
  corpo.position.y = 0.13;
  raiz.add(corpo);

  // --- cabeça, com focinho ---
  const cabeca = new THREE.Group();
  cabeca.add(of.bolha(0.093, laranja, [1, 0.94, 1.02]));
  const focinho = of.bolha(0.05, laranja, [1, 0.78, 1.1]);
  focinho.position.set(0, -0.03, 0.07);
  cabeca.add(focinho);
  // Duas abas no lugar das orelhas, coladas ao crânio.
  const orelhas: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const orelha = new THREE.Group();
    const aba = of.cone(0.028, 0.055, laranja, 10);
    aba.rotation.z = lado * -0.5;
    aba.rotation.x = -0.45;
    orelha.add(aba);
    orelha.position.set(lado * 0.062, 0.06, -0.018);
    cabeca.add(orelha);
    orelhas.push(orelha);
  }

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.02, 0.036, 0.078, laranja);
  olhos.position.y = 0.012;
  cabeca.add(olhos);

  cabeca.position.y = 0.255;
  raiz.add(cabeca);

  // --- membros ---
  const membros: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const braco = montarMembro(of, 0.021, 0.04, laranja);
    braco.position.set(lado * 0.093, 0.16, 0.012);
    braco.rotation.z = lado * -0.42;
    raiz.add(braco);
    membros.push(braco);

    const perna = montarMembro(of, 0.028, 0.038, laranja);
    perna.position.set(lado * 0.052, 0.072, 0);
    raiz.add(perna);
    membros.push(perna);
  }

  // --- cauda em arco, com a chama na ponta ---
  const cauda = new THREE.Group();
  let anterior: THREE.Object3D = cauda;
  for (let i = 0; i < 5; i++) {
    const seg = of.bolha(0.032 - i * 0.004, laranja);
    // Quase horizontal, subindo só no fim: uma cauda que sobe demais leva a
    // chama para a altura da cabeça e ela vira uma asa.
    seg.position.set(0, i >= 3 ? 0.022 : 0.005, -0.032);
    anterior.add(seg);
    anterior = seg;
  }
  // A chama: dois cones sobrepostos e uma luz que pisca.
  const chamaExterna = of.cone(0.036, 0.085, matChama, 12);
  chamaExterna.position.set(0, 0.05, -0.004);
  anterior.add(chamaExterna);
  const chamaInterna = new THREE.Mesh(
    of.geo(new THREE.ConeGeometry(0.019, 0.05, 10)),
    of.mat({ color: 0xffee9a, emissive: 0xffdd66, emissiveIntensity: 2.6 }),
  );
  chamaInterna.position.set(0, 0.044, -0.004);
  anterior.add(chamaInterna);

  const luzChama = new THREE.PointLight(0xff8820, 0.55, 0.9, 2);
  luzChama.position.copy(chamaExterna.position);
  anterior.add(luzChama);

  // Jogada para o lado e para fora: de frente, a chama precisa aparecer — é a
  // assinatura do Charmander, e escondida atrás do corpo ela não existe.
  cauda.position.set(0.05, 0.075, -0.075);
  cauda.rotation.set(0.12, -0.95, 0);
  raiz.add(cauda);

  const boca = new THREE.Object3D();
  boca.position.set(0, 0.235, 0.13);
  raiz.add(boca);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    cauda,
    orelhas,
    membros,
    boca,
    emissivos: [matChama],
    descartaveis: of.descartaveis,
  };
}

// ---------------------------------------------------------------- Squirtle

export function construirSquirtle(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const azul = of.mat({ color: 0x7ec8e8 });
  const casco = of.mat({ color: 0xc47a3d, roughness: 0.7 });
  const barrigaCor = of.mat({ color: 0xf5deb0, roughness: 0.65 });

  // --- casco marrom nas costas, barriga clara na frente ---
  const corpo = new THREE.Group();
  corpo.add(of.bolha(0.105, casco, [1.05, 1, 0.98]));

  // A barriga é grande e bem à frente: visto de frente, o Squirtle é claro,
  // não marrom. O casco tem que ficar para trás.
  const barriga = of.bolha(0.097, barrigaCor, [1, 1.02, 0.92]);
  barriga.position.z = 0.032;
  corpo.add(barriga);

  // Aro do casco, contornando a barriga.
  const aro = new THREE.Mesh(
    of.geo(new THREE.TorusGeometry(0.097, 0.013, 8, 32)),
    of.mat({ color: 0xe8b877, roughness: 0.6 }),
  );
  aro.position.z = 0.016;
  corpo.add(aro);
  corpo.position.y = 0.13;
  raiz.add(corpo);

  // --- cabeça ---
  const cabeca = new THREE.Group();
  cabeca.add(of.bolha(0.085, azul, [1, 0.95, 1]));
  const focinho = of.bolha(0.042, azul, [1.1, 0.7, 1]);
  focinho.position.set(0, -0.028, 0.065);
  cabeca.add(focinho);

  const orelhas: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const orelha = new THREE.Group();
    const ponta = of.cone(0.018, 0.04, azul, 10);
    ponta.rotation.z = lado * -1.15;
    orelha.add(ponta);
    orelha.position.set(lado * 0.072, 0.012, -0.012);
    cabeca.add(orelha);
    orelhas.push(orelha);
  }

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.021, 0.034, 0.072, azul);
  olhos.position.y = 0.014;
  cabeca.add(olhos);

  cabeca.position.y = 0.253;
  raiz.add(cabeca);

  // --- membros ---
  const membros: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const braco = montarMembro(of, 0.024, 0.032, azul);
    braco.position.set(lado * 0.098, 0.158, 0.022);
    braco.rotation.z = lado * -0.55;
    raiz.add(braco);
    membros.push(braco);

    const perna = montarMembro(of, 0.03, 0.032, azul);
    perna.position.set(lado * 0.055, 0.068, 0.008);
    raiz.add(perna);
    membros.push(perna);
  }

  // --- cauda enrolada ---
  const cauda = new THREE.Group();
  let anterior: THREE.Object3D = cauda;
  for (let i = 0; i < 6; i++) {
    const seg = of.bolha(0.026 - i * 0.0028, azul);
    seg.position.set(0, 0.016, -0.02);
    seg.rotation.x = 0.55; // a curvatura acumula e vira espiral
    anterior.add(seg);
    anterior = seg;
  }
  cauda.position.set(0, 0.115, -0.09);
  raiz.add(cauda);

  const boca = new THREE.Object3D();
  boca.position.set(0, 0.228, 0.12);
  raiz.add(boca);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    cauda,
    orelhas,
    membros,
    boca,
    emissivos: [],
    descartaveis: of.descartaveis,
  };
}

// ---------------------------------------------------------------- Bulbasaur

export function construirBulbasaur(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const turquesa = of.mat({ color: 0x86c5a8 });
  const escuro = of.mat({ color: 0x4f8f74, roughness: 0.65 });
  const verdeBulbo = of.mat({ color: 0x6fbf5f, roughness: 0.5 });

  // --- corpo baixo e comprido, de quadrúpede ---
  const corpo = new THREE.Group();
  corpo.add(of.bolha(0.105, turquesa, [1.02, 0.82, 1.22]));

  // Manchas nas laterais.
  for (const lado of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const mancha = of.bolha(0.022 - i * 0.003, escuro, [1, 0.7, 1]);
      mancha.position.set(lado * 0.095, 0.012 + i * 0.004, -0.05 + i * 0.05);
      corpo.add(mancha);
    }
  }
  corpo.position.y = 0.105;
  raiz.add(corpo);

  // --- bulbo nas costas: é a silhueta do Bulbasaur, tem que ser grande ---
  const bulbo = of.bolha(0.082, verdeBulbo, [1, 0.95, 1]);
  bulbo.position.set(0, 0.185, -0.035);
  raiz.add(bulbo);
  // Folhas abrindo do topo do bulbo.
  const geoFolha = of.geo(new THREE.SphereGeometry(0.036, 12, 8));
  for (let i = 0; i < 5; i++) {
    const folha = new THREE.Mesh(geoFolha, verdeBulbo);
    const ang = (i / 5) * Math.PI * 2;
    folha.scale.set(0.45, 0.26, 1.5);
    folha.position.set(Math.cos(ang) * 0.045, 0.245, -0.035 + Math.sin(ang) * 0.045);
    folha.rotation.y = -ang;
    folha.rotation.x = -0.62;
    folha.castShadow = true;
    raiz.add(folha);
  }

  // --- cabeça ---
  const cabeca = new THREE.Group();
  cabeca.add(of.bolha(0.082, turquesa, [1.08, 0.9, 1]));
  const focinho = of.bolha(0.04, turquesa, [1.1, 0.72, 1]);
  focinho.position.set(0, -0.026, 0.062);
  cabeca.add(focinho);

  const orelhas: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const orelha = new THREE.Group();
    const ponta = of.cone(0.022, 0.042, turquesa, 8);
    ponta.rotation.z = lado * -0.3;
    orelha.add(ponta);
    orelha.position.set(lado * 0.055, 0.055, -0.005);
    cabeca.add(orelha);
    orelhas.push(orelha);
  }

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.022, 0.038, 0.068, turquesa);
  olhos.position.y = 0.008;
  cabeca.add(olhos);

  cabeca.position.set(0, 0.135, 0.105);
  raiz.add(cabeca);

  // --- quatro patas curtas ---
  const membros: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    for (const frente of [-1, 1]) {
      const pata = montarMembro(of, 0.027, 0.018, turquesa);
      pata.position.set(lado * 0.068, 0.052, frente * 0.062);
      raiz.add(pata);
      membros.push(pata);
    }
  }

  const boca = new THREE.Object3D();
  boca.position.set(0, 0.115, 0.2);
  raiz.add(boca);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    orelhas,
    membros,
    boca,
    emissivos: [],
    descartaveis: of.descartaveis,
  };
}

// ---------------------------------------------------------------- Pikachu

export function construirPikachu(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const amarelo = of.mat({ color: 0xffd93b });
  const preto = of.mat({ color: 0x2b2721, roughness: 0.6 });
  const marrom = of.mat({ color: 0x9c6b2f, roughness: 0.6 });
  const matBochecha = of.mat({
    color: 0xff5a4a,
    emissive: 0xff3a20,
    emissiveIntensity: 0.5,
    roughness: 0.45,
  });

  // --- tronco ---
  const corpo = new THREE.Group();
  corpo.add(of.bolha(0.088, amarelo, [1, 1.1, 0.95]));
  // Listras das costas.
  for (let i = 0; i < 2; i++) {
    const listra = of.bolha(0.03, marrom, [1.6, 0.35, 0.3]);
    listra.position.set(0, 0.02 - i * 0.045, -0.078);
    corpo.add(listra);
  }
  corpo.position.y = 0.115;
  raiz.add(corpo);

  // --- cabeça grande ---
  const cabeca = new THREE.Group();
  cabeca.add(of.bolha(0.098, amarelo, [1.05, 0.94, 1]));
  const focinho = of.bolha(0.035, amarelo, [1.2, 0.6, 1]);
  focinho.position.set(0, -0.038, 0.078);
  cabeca.add(focinho);

  // Bochechas — é delas que sai a eletricidade.
  for (const lado of [-1, 1]) {
    const bochecha = of.bolha(0.026, matBochecha, [1, 1, 0.5]);
    bochecha.position.set(lado * 0.066, -0.022, 0.066);
    cabeca.add(bochecha);
  }

  // --- orelhas longas com a ponta preta ---
  const orelhas: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const orelha = new THREE.Group();
    const haste = of.capsula(0.018, 0.09, amarelo);
    haste.position.y = 0.045;
    orelha.add(haste);
    const ponta = of.capsula(0.018, 0.028, preto);
    ponta.position.y = 0.105;
    orelha.add(ponta);

    orelha.position.set(lado * 0.05, 0.08, -0.012);
    orelha.rotation.z = lado * -0.28;
    orelha.rotation.x = -0.12;
    cabeca.add(orelha);
    orelhas.push(orelha);
  }

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.021, 0.04, 0.085, amarelo);
  olhos.position.y = 0.018;
  cabeca.add(olhos);

  cabeca.position.y = 0.245;
  raiz.add(cabeca);

  // --- membros ---
  const membros: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const braco = montarMembro(of, 0.018, 0.03, amarelo);
    braco.position.set(lado * 0.082, 0.145, 0.012);
    braco.rotation.z = lado * -0.5;
    raiz.add(braco);
    membros.push(braco);

    const perna = montarMembro(of, 0.024, 0.026, amarelo);
    perna.position.set(lado * 0.048, 0.058, 0.005);
    raiz.add(perna);
    membros.push(perna);
  }

  // --- cauda em raio: segmentos retangulares em zigue-zague ---
  const cauda = new THREE.Group();
  const geoSeg = of.geo(new THREE.BoxGeometry(0.055, 0.042, 0.016));
  const angulos = [0.6, -0.75, 0.8, -0.5];
  let anterior: THREE.Object3D = cauda;
  for (let i = 0; i < angulos.length; i++) {
    const seg = new THREE.Mesh(geoSeg, i === 0 ? marrom : amarelo);
    seg.castShadow = true;
    seg.position.set(0.027, 0.021, 0);
    seg.rotation.z = angulos[i];
    seg.scale.setScalar(1 + i * 0.16); // afina na base, alarga na ponta
    anterior.add(seg);
    anterior = seg;
  }
  cauda.position.set(0, 0.125, -0.082);
  cauda.rotation.y = 0.25;
  raiz.add(cauda);

  const boca = new THREE.Object3D();
  boca.position.set(0, 0.215, 0.115);
  raiz.add(boca);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    cauda,
    orelhas,
    membros,
    boca,
    emissivos: [matBochecha],
    descartaveis: of.descartaveis,
  };
}

export const CONSTRUTORES: Record<string, () => Partes> = {
  charmander: construirCharmander,
  squirtle: construirSquirtle,
  bulbasaur: construirBulbasaur,
  pikachu: construirPikachu,
};
