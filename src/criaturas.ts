import * as THREE from 'three';
import { comContorno, corpoTorneado, materialContorno, materialToon, perfilSuave } from './toon';

/**
 * Os quatro parceiros, montados em geometria — nenhum modelo importado.
 *
 * Três decisões que fazem a diferença entre "bolas coloridas" e personagem:
 *
 *  1. O tronco é um corpo de revolução a partir de um perfil desenhado à mão.
 *     Pilha de esferas deixa degraus visíveis na silhueta; o torno não.
 *  2. Sombreado em degraus (toon) e contorno preto por fora.
 *  3. Proporção própria para cada um. O erro da versão anterior era todo mundo
 *     ter o mesmo formato de ovo — o que muda a leitura é a silhueta, não a cor.
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
  /** Ponto de onde sai o golpe. */
  boca: THREE.Object3D;
  /** Brilha durante o ataque. */
  emissivos: THREE.Material[];
  descartaveis: Array<THREE.BufferGeometry | THREE.Material>;
}

const ESPESSURA_CONTORNO = 0.055;

class Oficina {
  descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];
  readonly contorno = materialContorno();

  constructor() {
    this.descartaveis.push(this.contorno);
  }

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.descartaveis.push(g);
    return g;
  }

  mat(cor: number, extras: { emissivo?: number; intensidade?: number } = {}) {
    const m = materialToon({
      cor,
      emissivo: extras.emissivo,
      intensidadeEmissiva: extras.intensidade,
    });
    this.descartaveis.push(m);
    return m;
  }

  /** Malha com contorno, para as peças grandes. */
  peca(geometria: THREE.BufferGeometry, material: THREE.Material, espessura = ESPESSURA_CONTORNO) {
    const malha = new THREE.Mesh(this.geo(geometria), material);
    malha.castShadow = true;
    return comContorno(malha, espessura, this.contorno);
  }

  /** Malha sem contorno — detalhes pequenos, onde ele só custaria draw call. */
  detalhe(geometria: THREE.BufferGeometry, material: THREE.Material) {
    const malha = new THREE.Mesh(this.geo(geometria), material);
    malha.castShadow = true;
    return malha;
  }

  bolha(raio: number, material: THREE.Material, escala: [number, number, number] = [1, 1, 1]) {
    const m = this.detalhe(new THREE.SphereGeometry(raio, 20, 15), material);
    m.scale.set(...escala);
    return m;
  }

  capsula(raio: number, comprimento: number, material: THREE.Material) {
    return this.detalhe(new THREE.CapsuleGeometry(raio, comprimento, 5, 12), material);
  }

  cone(raio: number, altura: number, material: THREE.Material, lados = 12) {
    return this.detalhe(new THREE.ConeGeometry(raio, altura, lados), material);
  }
}

/**
 * Olhos grandes e bem à frente. O tamanho é exagerado de propósito: a 1,5 m de
 * distância, olho pequeno some e o bicho perde a expressão.
 */
function montarOlhos(
  of: Oficina,
  raio: number,
  separacao: number,
  frente: number,
  corPalpebra: THREE.Material,
  inclinacao = 0,
): { grupo: THREE.Group; palpebras: THREE.Mesh[] } {
  const grupo = new THREE.Group();
  const palpebras: THREE.Mesh[] = [];

  const branco = of.mat(0xfdfdff);
  const pupilaCor = of.mat(0x1b1822);
  const brilhoCor = of.mat(0xffffff, { emissivo: 0xffffff, intensidade: 0.9 });

  const geoOlho = of.geo(new THREE.SphereGeometry(raio, 16, 13));
  const geoPupila = of.geo(new THREE.SphereGeometry(raio * 0.58, 12, 10));
  const geoBrilho = of.geo(new THREE.SphereGeometry(raio * 0.22, 8, 6));
  const geoPalpebra = of.geo(
    new THREE.SphereGeometry(raio * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
  );

  for (const lado of [-1, 1]) {
    const olho = new THREE.Group();
    olho.position.set(lado * separacao, 0, frente);

    olho.add(new THREE.Mesh(geoOlho, branco));

    const pupila = new THREE.Mesh(geoPupila, pupilaCor);
    pupila.position.z = raio * 0.58;
    olho.add(pupila);

    const brilho = new THREE.Mesh(geoBrilho, brilhoCor);
    brilho.position.set(lado * raio * 0.24, raio * 0.32, raio * 0.8);
    olho.add(brilho);

    const palpebra = new THREE.Mesh(geoPalpebra, corPalpebra);
    palpebra.scale.y = 0.01;
    // A pálpebra inclinada dá sobrancelha — muda a cara inteira.
    palpebra.rotation.z = lado * inclinacao;
    olho.add(palpebra);
    palpebras.push(palpebra);

    grupo.add(olho);
  }

  return { grupo, palpebras };
}

/** Boca simples: um arco escuro rente à superfície. */
function montarBoca(of: Oficina, largura: number, altura: number) {
  const forma = new THREE.Shape();
  forma.moveTo(-largura, 0);
  forma.quadraticCurveTo(0, -altura, largura, 0);
  forma.quadraticCurveTo(0, -altura * 0.45, -largura, 0);
  const escuro = of.mat(0x2a1f26);
  return of.detalhe(new THREE.ShapeGeometry(forma, 10), escuro);
}

function montarMembro(of: Oficina, raio: number, comprimento: number, material: THREE.Material) {
  const grupo = new THREE.Group();
  const osso = of.capsula(raio, comprimento, material);
  osso.position.y = -comprimento * 0.5;
  grupo.add(osso);
  const ponta = of.bolha(raio * 1.2, material);
  ponta.position.y = -comprimento - raio * 0.15;
  grupo.add(ponta);
  return grupo;
}

// ---------------------------------------------------------------- Fagulho

/** Bípede esguio: pescoço alto, focinho comprido, crista de brasa nas costas. */
export function construirFagulho(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const casca = of.mat(0xf2703a);
  const ventre = of.mat(0xffd9a8);
  const brasa = of.mat(0xffb02e, { emissivo: 0xff6a10, intensidade: 2.4 });

  // Tronco alto e estreito, ombro marcado.
  const corpo = new THREE.Group();
  corpo.add(
    of.peca(
      corpoTorneado(
        perfilSuave([
          [0.004, 0],
          [0.056, 0.012],
          [0.072, 0.05],
          [0.068, 0.1],
          [0.055, 0.145],
          [0.03, 0.17],
          [0.004, 0.178],
        ]),
      ),
      casca,
    ),
  );
  const barriga = of.bolha(0.056, ventre, [0.92, 1.25, 0.62]);
  barriga.position.set(0, 0.075, 0.048);
  corpo.add(barriga);
  corpo.position.y = 0.1;
  raiz.add(corpo);

  // Cabeça com focinho projetado para a frente.
  const cabeca = new THREE.Group();
  cabeca.add(of.peca(new THREE.SphereGeometry(0.062, 20, 15), casca));
  const focinho = of.peca(new THREE.SphereGeometry(0.04, 16, 12), casca, 0.05);
  focinho.scale.set(0.85, 0.7, 1.5);
  focinho.position.set(0, -0.016, 0.062);
  cabeca.add(focinho);

  const boca = montarBoca(of, 0.026, 0.016);
  boca.position.set(0, -0.03, 0.104);
  cabeca.add(boca);

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.019, 0.032, 0.052, casca, 0.35);
  olhos.position.y = 0.012;
  cabeca.add(olhos);

  cabeca.position.y = 0.315;
  raiz.add(cabeca);

  // Crista de brasa: do topo da cabeça descendo pelas costas.
  const orelhas: THREE.Group[] = [];
  const geoCrista = of.geo(new THREE.ConeGeometry(0.024, 0.055, 4));
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const lingua = new THREE.Mesh(geoCrista, brasa);
    lingua.castShadow = true;
    lingua.scale.setScalar(1 - t * 0.45);
    lingua.position.set(0, 0.3 - t * 0.075, -0.045 - t * 0.045);
    lingua.rotation.x = -0.35 - t * 0.5;
    raiz.add(lingua);
    if (i < 2) {
      const g = new THREE.Group();
      g.add(lingua);
      orelhas.push(g);
    }
  }
  const luzCrista = new THREE.PointLight(0xff7a20, 0.5, 0.8, 2);
  luzCrista.position.set(0, 0.3, -0.04);
  raiz.add(luzCrista);

  // Membros: braços curtos à frente, pernas fortes.
  const membros: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const braco = montarMembro(of, 0.016, 0.042, casca);
    braco.position.set(lado * 0.072, 0.19, 0.022);
    braco.rotation.z = lado * -0.38;
    raiz.add(braco);
    membros.push(braco);

    const perna = montarMembro(of, 0.026, 0.05, casca);
    perna.position.set(lado * 0.042, 0.098, 0.004);
    raiz.add(perna);
    membros.push(perna);
  }

  // Cauda comprida, saindo para trás e para o lado, com brasa na ponta.
  const cauda = new THREE.Group();
  let anterior: THREE.Object3D = cauda;
  for (let i = 0; i < 6; i++) {
    const seg = of.bolha(0.03 - i * 0.0038, casca);
    seg.position.set(0, i >= 4 ? 0.018 : 0.003, -0.03);
    anterior.add(seg);
    anterior = seg;
  }
  const pontaBrasa = of.cone(0.03, 0.07, brasa, 10);
  pontaBrasa.position.set(0, 0.042, -0.006);
  anterior.add(pontaBrasa);
  const luzCauda = new THREE.PointLight(0xff8820, 0.45, 0.7, 2);
  luzCauda.position.copy(pontaBrasa.position);
  anterior.add(luzCauda);

  cauda.position.set(0.03, 0.085, -0.07);
  cauda.rotation.set(0.1, -0.7, 0);
  raiz.add(cauda);

  const bocaAtaque = new THREE.Object3D();
  bocaAtaque.position.set(0, 0.27, 0.12);
  raiz.add(bocaAtaque);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    cauda,
    orelhas,
    membros,
    boca: bocaAtaque,
    emissivos: [brasa],
    descartaveis: of.descartaveis,
  };
}

// ---------------------------------------------------------------- Marolo

/** Baixo e largo: um seixo de rio com cabeça, nadadeiras e cauda de remo. */
export function construirMarolo(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const pele = of.mat(0x63bce8);
  const cascoCor = of.mat(0x8c7a63);
  const plastrao = of.mat(0xf6e2b8);

  // Casco: domo largo e achatado.
  const corpo = new THREE.Group();
  corpo.add(
    of.peca(
      corpoTorneado(
        perfilSuave([
          [0.004, 0],
          [0.075, 0.004],
          [0.105, 0.028],
          [0.1, 0.072],
          [0.062, 0.1],
          [0.004, 0.108],
        ]),
      ),
      cascoCor,
    ),
  );
  // Plastrão claro à frente — visto de frente, o Marolo é claro, não marrom.
  const frente = of.bolha(0.088, plastrao, [1.02, 0.78, 0.62]);
  frente.position.set(0, 0.042, 0.055);
  corpo.add(frente);
  corpo.position.y = 0.075;
  raiz.add(corpo);

  // Cabeça grande e baixa, projetada para a frente.
  const cabeca = new THREE.Group();
  cabeca.add(of.peca(new THREE.SphereGeometry(0.066, 20, 15), pele));
  const focinho = of.peca(new THREE.SphereGeometry(0.04, 16, 12), pele, 0.05);
  focinho.scale.set(1.05, 0.72, 1.15);
  focinho.position.set(0, -0.02, 0.05);
  cabeca.add(focinho);

  const boca = montarBoca(of, 0.03, 0.013);
  boca.position.set(0, -0.03, 0.088);
  cabeca.add(boca);

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.021, 0.033, 0.054, pele, -0.15);
  olhos.position.y = 0.014;
  cabeca.add(olhos);

  cabeca.position.set(0, 0.208, 0.062);
  raiz.add(cabeca);

  // Nadadeiras no lugar de braços.
  const orelhas: THREE.Group[] = [];
  const membros: THREE.Group[] = [];
  const geoNadadeira = of.geo(new THREE.SphereGeometry(0.035, 12, 9));
  for (const lado of [-1, 1]) {
    const nadadeira = new THREE.Group();
    const pa = new THREE.Mesh(geoNadadeira, pele);
    pa.castShadow = true;
    pa.scale.set(0.42, 1.25, 0.65);
    nadadeira.add(pa);
    nadadeira.position.set(lado * 0.1, 0.1, 0.035);
    nadadeira.rotation.z = lado * -0.55;
    raiz.add(nadadeira);
    membros.push(nadadeira);

    const pata = montarMembro(of, 0.024, 0.016, pele);
    pata.position.set(lado * 0.055, 0.042, 0.02);
    raiz.add(pata);
    membros.push(pata);
  }

  // Cauda chata de remo.
  const cauda = new THREE.Group();
  const remo = of.bolha(0.04, pele, [0.55, 0.3, 1.5]);
  remo.position.set(0, 0, -0.045);
  cauda.add(remo);
  cauda.position.set(0, 0.055, -0.09);
  cauda.rotation.x = 0.22;
  raiz.add(cauda);

  const bocaAtaque = new THREE.Object3D();
  bocaAtaque.position.set(0, 0.17, 0.16);
  raiz.add(bocaAtaque);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    cauda,
    orelhas,
    membros,
    boca: bocaAtaque,
    emissivos: [],
    descartaveis: of.descartaveis,
  };
}

// ---------------------------------------------------------------- Sementil

/** Quadrúpede de pernas altas, com uma flor na cabeça e cauda de folha. */
export function construirSementil(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const pelo = of.mat(0x8fd2a4);
  const escuro = of.mat(0x3f8f66);
  const petala = of.mat(0xff9ec4);
  const miolo = of.mat(0xffd964, { emissivo: 0xffc83c, intensidade: 0.5 });
  const folhaCor = of.mat(0x5fbf55);

  // Tronco horizontal e comprido, erguido nas pernas.
  const corpo = new THREE.Group();
  const tronco = of.peca(
    corpoTorneado(
      perfilSuave([
        [0.004, 0],
        [0.058, 0.008],
        [0.08, 0.04],
        [0.075, 0.09],
        [0.045, 0.12],
        [0.004, 0.128],
      ]),
    ),
    pelo,
  );
  // Deitado: o torno gera vertical, então tombamos para virar corpo de bicho.
  tronco.rotation.x = Math.PI * 0.5;
  tronco.position.z = -0.06;
  corpo.add(tronco);

  for (const lado of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const mancha = of.bolha(0.018 - i * 0.002, escuro, [0.5, 0.9, 1]);
      mancha.position.set(lado * 0.072, 0.012 + i * 0.006, -0.04 + i * 0.042);
      corpo.add(mancha);
    }
  }
  corpo.position.y = 0.135;
  raiz.add(corpo);

  // Pescoço curto erguendo a cabeça.
  const pescoco = of.capsula(0.03, 0.04, pelo);
  pescoco.position.set(0, 0.175, 0.075);
  pescoco.rotation.x = 0.5;
  raiz.add(pescoco);

  const cabeca = new THREE.Group();
  cabeca.add(of.peca(new THREE.SphereGeometry(0.058, 20, 15), pelo));
  const focinho = of.peca(new THREE.SphereGeometry(0.032, 14, 11), pelo, 0.05);
  focinho.scale.set(1, 0.75, 1.1);
  focinho.position.set(0, -0.02, 0.046);
  cabeca.add(focinho);

  const boca = montarBoca(of, 0.022, 0.012);
  boca.position.set(0, -0.03, 0.074);
  cabeca.add(boca);

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.019, 0.03, 0.048, pelo, 0.1);
  olhos.position.y = 0.01;
  cabeca.add(olhos);

  // Flor na cabeça — a assinatura dele fica na frente, onde se vê.
  const geoPetala = of.geo(new THREE.SphereGeometry(0.026, 10, 8));
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const p = new THREE.Mesh(geoPetala, petala);
    p.castShadow = true;
    p.scale.set(0.55, 0.28, 1);
    p.position.set(Math.cos(ang) * 0.03, 0.058, Math.sin(ang) * 0.03);
    p.rotation.y = -ang;
    p.rotation.x = -0.45;
    cabeca.add(p);
  }
  const centro = of.bolha(0.019, miolo);
  centro.position.set(0, 0.066, 0);
  cabeca.add(centro);

  // Orelhas pequenas e pontudas.
  const orelhas: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const orelha = new THREE.Group();
    const ponta = of.cone(0.017, 0.036, pelo, 8);
    ponta.rotation.z = lado * -0.42;
    orelha.add(ponta);
    orelha.position.set(lado * 0.043, 0.036, -0.012);
    cabeca.add(orelha);
    orelhas.push(orelha);
  }

  cabeca.position.set(0, 0.255, 0.108);
  raiz.add(cabeca);

  // Quatro pernas altas — é o que o separa de um bicho rastejante.
  const membros: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    for (const frente of [-1, 1]) {
      const perna = montarMembro(of, 0.021, 0.052, pelo);
      perna.position.set(lado * 0.055, 0.105, frente * 0.055);
      raiz.add(perna);
      membros.push(perna);
    }
  }

  // Cauda: uma folha só.
  const cauda = new THREE.Group();
  const folha = of.bolha(0.038, folhaCor, [0.45, 0.18, 1.2]);
  folha.position.set(0, 0.01, -0.04);
  folha.rotation.x = -0.3;
  cauda.add(folha);
  cauda.position.set(0, 0.15, -0.105);
  raiz.add(cauda);

  const bocaAtaque = new THREE.Object3D();
  bocaAtaque.position.set(0, 0.225, 0.19);
  raiz.add(bocaAtaque);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    cauda,
    orelhas,
    membros,
    boca: bocaAtaque,
    emissivos: [miolo],
    descartaveis: of.descartaveis,
  };
}

// ---------------------------------------------------------------- Trovisco

/** Roedor compacto com uma cauda em leque, que é a silhueta dele. */
export function construirTrovisco(): Partes {
  const of = new Oficina();
  const raiz = new THREE.Group();

  const pelo = of.mat(0xf7cf4a);
  const creme = of.mat(0xfff0bd);
  const risca = of.mat(0x8a6224);
  const faisca = of.mat(0xfff27a, { emissivo: 0xffe23c, intensidade: 1.6 });

  // Corpo curto e roliço.
  const corpo = new THREE.Group();
  corpo.add(
    of.peca(
      corpoTorneado(
        perfilSuave([
          [0.004, 0],
          [0.052, 0.01],
          [0.064, 0.042],
          [0.058, 0.085],
          [0.04, 0.112],
          [0.004, 0.118],
        ]),
      ),
      pelo,
    ),
  );
  const peito = of.bolha(0.048, creme, [0.9, 1.05, 0.6]);
  peito.position.set(0, 0.055, 0.042);
  corpo.add(peito);
  corpo.position.y = 0.088;
  raiz.add(corpo);

  // Cabeça larga — mais larga que alta, o oposto do Fagulho.
  const cabeca = new THREE.Group();
  const cranio = of.peca(new THREE.SphereGeometry(0.066, 20, 15), pelo);
  cranio.scale.set(1.15, 0.95, 0.98);
  cabeca.add(cranio);

  const focinho = of.peca(new THREE.SphereGeometry(0.03, 14, 11), pelo, 0.05);
  focinho.scale.set(1.2, 0.6, 0.95);
  focinho.position.set(0, -0.028, 0.056);
  cabeca.add(focinho);

  const boca = montarBoca(of, 0.024, 0.014);
  boca.position.set(0, -0.038, 0.078);
  cabeca.add(boca);

  // Bochechas que acendem no ataque.
  for (const lado of [-1, 1]) {
    const bochecha = of.bolha(0.021, faisca, [1, 1, 0.45]);
    bochecha.position.set(lado * 0.056, -0.018, 0.05);
    cabeca.add(bochecha);
  }

  const { grupo: olhos, palpebras } = montarOlhos(of, 0.021, 0.036, 0.056, pelo, 0.05);
  olhos.position.y = 0.012;
  cabeca.add(olhos);

  // Orelhas com tufo escuro na ponta.
  const orelhas: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const orelha = new THREE.Group();
    const concha = of.cone(0.026, 0.062, pelo, 10);
    concha.position.y = 0.031;
    orelha.add(concha);
    const tufo = of.cone(0.017, 0.028, risca, 8);
    tufo.position.y = 0.07;
    orelha.add(tufo);
    orelha.position.set(lado * 0.05, 0.055, -0.006);
    orelha.rotation.z = lado * -0.34;
    cabeca.add(orelha);
    orelhas.push(orelha);
  }

  cabeca.position.y = 0.238;
  raiz.add(cabeca);

  const membros: THREE.Group[] = [];
  for (const lado of [-1, 1]) {
    const braco = montarMembro(of, 0.015, 0.028, pelo);
    braco.position.set(lado * 0.066, 0.115, 0.014);
    braco.rotation.z = lado * -0.45;
    raiz.add(braco);
    membros.push(braco);

    const perna = montarMembro(of, 0.021, 0.03, pelo);
    perna.position.set(lado * 0.04, 0.05, 0.006);
    raiz.add(perna);
    membros.push(perna);
  }

  // Cauda em leque: lâminas abrindo para cima e para os lados.
  const cauda = new THREE.Group();
  const geoLamina = of.geo(new THREE.SphereGeometry(0.05, 10, 7));
  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * 1.15;
    const lamina = new THREE.Mesh(geoLamina, i % 2 === 0 ? pelo : creme);
    lamina.castShadow = true;
    lamina.scale.set(0.24, 1.05 - Math.abs(t) * 0.3, 0.16);
    lamina.position.set(Math.sin(t) * 0.045, 0.05 + Math.cos(t) * 0.03, 0);
    lamina.rotation.z = -t * 0.85;
    cauda.add(lamina);
  }
  cauda.position.set(0, 0.1, -0.075);
  cauda.rotation.x = -0.35;
  raiz.add(cauda);

  const bocaAtaque = new THREE.Object3D();
  bocaAtaque.position.set(0, 0.195, 0.1);
  raiz.add(bocaAtaque);

  return {
    raiz,
    corpo,
    cabeca,
    olhos,
    palpebras,
    cauda,
    orelhas,
    membros,
    boca: bocaAtaque,
    emissivos: [faisca],
    descartaveis: of.descartaveis,
  };
}

export const CONSTRUTORES: Record<string, () => Partes> = {
  fagulho: construirFagulho,
  marolo: construirMarolo,
  sementil: construirSementil,
  trovisco: construirTrovisco,
};
