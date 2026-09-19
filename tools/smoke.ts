/**
 * Simula o jogo sem navegador: pega NaN, batalha que nunca acaba, captura
 * travada, dado de Pokédex inconsistente e modelo que ficaria do tamanho errado
 * dentro da sala.
 *
 * O corpo dos bichos aqui é falso — um Group vazio no lugar do GLB. Carregar
 * Draco e WebP no Node seria possível, mas não é o que estes testes querem
 * saber: o que se mede aqui é comportamento e número, e para isso o esqueleto
 * de mentira serve igual. Quem confere o modelo de verdade é `npm run render`,
 * que desenha os 151 num PNG.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Pokemon } from '../src/creature';
import { ALCANCE_ACHADO, Achados } from '../src/achados';
import { saidaDoTimeCaido, timeCaido } from '../src/centro';
import { BALDE_MS, Diario, ORCAMENTO_MS, relatorio } from '../src/diario';
import { MarcaDeContato } from '../src/attacks';
import { assinaturaDe } from '../src/signature';
import { aindaVale, calar, falar, selo } from '../src/voz';
import { LEVANTAR_SEGUNDOS, podeLevantar, segundosParaLevantar } from '../src/state';
import { Luva, PISO_DO_FLASH_MS, RESPIRO_DE_PULSO_MS, filaDePiscadas } from '../src/glove';
import { TATO } from '../src/hands';
import { NA_MAO, Pokebola, corrigirRumo } from '../src/orb';
import { Sala } from '../src/room';
import {
  ESPECIES,
  INICIAIS,
  NIVEL_MAXIMO,
  calcularDano,
  chanceCaptura,
  escolherGolpe,
  ESTAGIOS_ZERADOS,
  TETO_DANO_RECEBIDO,
  CHANCE_SHINY_BASE,
  CHANCE_SHINY_MAXIMA,
  aplicarStatus,
  chanceShiny,
  sortearShiny,
  textoChanceShiny,
  danoRecebido,
  arsenal,
  golpesDeDano,
  golpesNoNivel,
  mudancaDeArsenal,
  intervaloDeAtaque,
  multEstagio,
  golpesDeStatus,
  evolucaoEm,
  evolucaoDaPedra,
  multiplicador,
  nivelPorXp,
  pesoSpawn,
  porId,
  statsNoNivel,
  TOTAL_ESPECIES,
  xpParaNivel,
  type Especie,
} from '../src/species';
import { MEDIDAS } from '../src/modelos.gen';
import { caixaDaPose, type Corpo } from '../src/modelos';
import { BOLAS } from '../src/balls';
import { PEDRAS, EVOLUI_SO_COM_PEDRA } from '../src/pedras';
import {
  ALCANCE_SLOT,
  INICIO_SLOT,
  PASSO_SLOT,
  VANTAGEM_DO_ESCOLHIDO,
  escolherSlot,
} from '../src/cinto';
import { bonusDeCaptura } from '../src/condicao';
import { Rastro, aVista, rumoDoRastro } from '../src/rastro';
import { MARCOS, faltamPara, marcoDe } from '../src/marcos';
import { fatorDoHorario, habitoDe, noturnidade } from '../src/hora';
import { Aviso } from '../src/hud';
import { ITENS } from '../src/itens';
import {
  ABAIXO_DOS_OLHOS,
  DISTANCIA_DA_MOCHILA,
  DISTANCIA_SENTADO,
  Mochila,
  QUEDA_MAXIMA,
  alturaDaMochila,
  disporGrade,
} from '../src/mochila';
import { MEDIDAS_TIME, disporTime } from '../src/menu';
import { classificarPelaAltura } from '../src/room';
import {
  ALCANCE_DE_ABRACO,
  ALTURA_DE_ABRACO,
  Colo,
  alcanceDoColo,
  cabeNoColo,
  pontoDoColo,
} from '../src/colo';
import { Tablet, ALCANCE_TABLET } from '../src/tablet';
import { FOGO_POR_ESPECIE, temFogo } from '../src/fogo';
import {
  LATCH_ABRIR_MS,
  LATCH_FECHAR_MS,
  PUNHO_ABRE,
  PUNHO_FECHA,
  poseDoPulso,
  razaoDoPunho,
} from '../src/pulso';
import { Fotografo, LADO_DA_FOTO, MAX_FOTOS, nomeDaFoto } from '../src/foto';
import { olhandoORelogio } from '../src/gesto';
import { AVISO, forcaDeToque, pulsoDeToque } from '../src/toque';
import { Rig, type Chave } from '../src/rig';
import { ATAQUES, Animador, type GestoDeAtaque } from '../src/anima';
import { GOLPES_DEX } from '../src/golpes.gen';
import { Dex, TAMANHO_TIME } from '../src/state';
import { DIFICULDADES } from '../src/ajustes';

let falhas = 0;
const checar = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error('  FALHOU:', msg);
    falhas++;
  }
};
const finito = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * Um `localStorage` de mentira, instalado ANTES de qualquer `Dex`.
 *
 * Três motivos, e o terceiro só apareceu hoje:
 *
 * 1. os testes de estado passam a ter persistência de verdade, em vez de
 *    gravarem no vazio;
 * 2. a seção 53 precisa CONTAR as escritas;
 * 3. o Node 26 traz um `localStorage` experimental que, sem arquivo onde
 *    guardar, avisa em voz alta na primeira vez que é tocado. O aviso é
 *    assíncrono: ele só era impresso quando o teste finalmente cedia o laço de
 *    eventos, o que fazia uma linha de erro do runtime aparecer no meio da
 *    saída de uma seção que não tinha nada a ver com ele.
 *
 * `defineProperty` e não atribuição: a propriedade nativa é de acesso, e
 * atribuir nela acorda justamente o backend que se quer evitar.
 */
const armazenamento = { escritas: 0, dados: new Map<string, string>() };
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => armazenamento.dados.get(k) ?? null,
    setItem: (k: string, v: string) => {
      armazenamento.escritas++;
      armazenamento.dados.set(k, v);
    },
    removeItem: (k: string) => armazenamento.dados.delete(k),
    clear: () => armazenamento.dados.clear(),
  },
});

const JOGADOR = new THREE.Vector3(0, 1.6, 0);

/** Um corpo de mentira com a mesma forma que src/modelos.ts entrega. */
function corpoFalso(altura: number): Corpo {
  const corpo = new THREE.Group();
  const raiz = new THREE.Group();
  raiz.add(corpo);
  const boca = new THREE.Object3D();
  boca.position.set(0, altura * 0.74, altura * 0.3);
  corpo.add(boca);
  return {
    raiz,
    corpo,
    boca,
    altura,
    raio: altura * 0.5,
    mixer: null,
    acoes: new Map(),
    // Sem GLB não há pose para remedir: a caixa deste corpo já é a certa.
    renormalizar() {},
    descartar() {
      raiz.removeFromParent();
    },
  };
}

const nascer = (especie: Especie, papel: 'selvagem' | 'companheiro', nivel = 12, semente = 1) =>
  new Pokemon(
    especie,
    corpoFalso(especie.altura),
    new THREE.Vector3(0, 0, -1.5),
    0,
    papel,
    nivel,
    false,
    semente,
  );

// ---------------------------------------------------------------------------
/**
 * Um esqueleto de verdade, montado a partir de uma lista de nomes de osso.
 *
 * Os nomes usados nos testes são os que estão dentro dos GLB de public/pokemon/
 * — não são aproximações. src/rig.ts casa osso por NOME, então é exatamente
 * isso que precisa ser testado: um rip com outra convenção passaria por todo o
 * resto do jogo sem erro nenhum e chegaria ao headset como uma estátua.
 *
 * A hierarquia é remontada aqui pela regra óbvia (a mão pende do antebraço, o
 * antebraço do braço) porque `Rig` mede a orientação de repouso do PAI para
 * converter os giros, e um esqueleto chapado não exercitaria essa conta.
 */
function esqueletoDe(nomes: string[], altura = 0.6) {
  const porNome = new Map<string, THREE.Bone>();
  const normal = new Map<string, THREE.Bone>();
  const repousos = new Map<string, THREE.Quaternion>();

  const limpo = (n: string) =>
    n.slice(n.lastIndexOf('|') + 1).replace(/_\d+$/, '').toLowerCase();

  for (const nome of nomes) {
    const osso = new THREE.Bone();
    osso.name = nome;
    porNome.set(nome, osso);
    normal.set(limpo(nome), osso);
  }

  const achar = (...candidatos: string[]) => {
    for (const c of candidatos) {
      const osso = normal.get(c);
      if (osso) return osso;
    }
    return null;
  };

  const raiz = achar('hips', 'waist', 'origin');

  /** De quem cada osso pende, pelo nome já normalizado. */
  const paiDe = (n: string): THREE.Bone | null => {
    const m = /^([lr])(.+)$/.exec(n);
    const lado = m ? m[1] : '';
    const parte = m ? m[2] : n;

    if (parte === 'spine1') return achar('waist', 'hips');
    if (parte === 'spine2') return achar('spine1', 'waist', 'hips');
    if (parte === 'neck') return achar('spine2', 'spine1', 'waist', 'hips');
    if (parte === 'head') return achar('neck', 'spine2', 'spine1', 'waist', 'hips');
    if (parte === 'jaw') return achar('head');
    if (parte.startsWith('ear')) return achar('head');
    if (parte === 'shoulder') return achar('spine2', 'spine1', 'waist', 'hips');
    if (parte === 'arm') return achar(`${lado}shoulder`, 'spine2', 'spine1', 'waist', 'hips');
    if (parte === 'forearm') return achar(`${lado}arm`);
    if (parte === 'hand') return achar(`${lado}forearm`, `${lado}arm`);
    if (parte === 'thigh') return achar('hips', 'waist');
    if (parte === 'leg') return achar(`${lado}thigh`);
    if (parte === 'foot') return achar(`${lado}leg`, `${lado}thigh`);
    if (parte === 'toe') return achar(`${lado}foot`);
    if (/^tail(\d+)$/.test(parte)) {
      const n = Number(/^tail(\d+)$/.exec(parte)![1]);
      return n <= 1 ? achar('hips', 'waist') : achar(`tail${n - 1}`);
    }
    return null;
  };

  const corpoGrupo = new THREE.Group();
  for (const [nome, osso] of porNome) {
    const n = limpo(nome);
    // Pose de repouso torta de propósito: com tudo alinhado, a conversão de
    // eixo do mundo para eixo do osso vira multiplicação por identidade e o
    // teste não provaria nada. O quadril fica reto para as pernas continuarem
    // legíveis no eixo X.
    if (osso !== raiz) {
      let semente = 0;
      for (let i = 0; i < n.length; i++) semente = (semente * 31 + n.charCodeAt(i)) % 211;
      osso.quaternion.setFromEuler(
        new THREE.Euler((semente % 7) * 0.09, (semente % 5) * 0.11, (semente % 3) * 0.13),
      );
    }
    osso.position.y = n.includes('thigh') || n.includes('leg') ? -altura * 0.15 : altura * 0.1;
    repousos.set(nome, osso.quaternion.clone());

    // A raiz pende do grupo, não dela mesma — e nenhum osso pode virar pai de
    // si próprio quando `paiDe` não souber responder.
    const pai = osso === raiz ? corpoGrupo : (paiDe(n) ?? raiz ?? corpoGrupo);
    (pai === osso ? corpoGrupo : pai).add(osso);
  }
  for (const osso of porNome.values()) if (!osso.parent) corpoGrupo.add(osso);

  const raizGrupo = new THREE.Group();
  raizGrupo.add(corpoGrupo);
  const boca = new THREE.Object3D();
  boca.position.set(0, altura * 0.74, altura * 0.3);
  corpoGrupo.add(boca);

  const corpo: Corpo = {
    raiz: raizGrupo,
    corpo: corpoGrupo,
    boca,
    altura,
    raio: altura * 0.5,
    mixer: null,
    acoes: new Map(),
    // Este esqueleto é montado à mão aqui: não há pose de arquivo para remedir.
    renormalizar() {},
    descartar() {
      raizGrupo.removeFromParent();
    },
  };

  return { corpo, rig: new Rig(corpoGrupo), porNome, repousos };
}

/**
 * Quanto o osso girou em relação ao repouso, com sinal, em torno do eixo X
 * local. É o número que separa "a perna foi para a frente" de "a perna foi para
 * trás" — e sem sinal não dá para provar que as duas alternam.
 */
function desvioX(osso: THREE.Bone, repouso: THREE.Quaternion): number {
  const d = repouso.clone().invert().multiply(osso.quaternion);
  if (d.w < 0) {
    d.x = -d.x;
    d.y = -d.y;
    d.z = -d.z;
    d.w = -d.w;
  }
  const v = Math.hypot(d.x, d.y, d.z);
  if (v < 1e-9) return 0;
  return 2 * Math.atan2(v, d.w) * Math.sign(d.x);
}

// ---------------------------------------------------------------------------
console.log('1. a Pokédex fecha consigo mesma');
{
  // Kanto continua sendo Kanto. As convidadas (as cinco eeveelutions de fora
  // da gen 1) existem em ESPECIES mas não contam aqui nem em TOTAL_ESPECIES:
  // "completar a Pokédex" tem de continuar querendo dizer 151.
  const kanto = ESPECIES.filter((e) => !e.convidada);
  checar(kanto.length === 151, `deveria haver 151 espécies de Kanto, há ${kanto.length}`);
  checar(
    TOTAL_ESPECIES === 151,
    `a Pokédex devia pedir 151 para fechar, pede ${TOTAL_ESPECIES}`,
  );
  const convidadas = ESPECIES.filter((e) => e.convidada);
  checar(convidadas.length === 5, `deveria haver 5 convidadas, há ${convidadas.length}`);
  checar(INICIAIS.length === 5, `deveria haver 5 iniciais, há ${INICIAIS.length}`);
  // Um inicial sem modelo é uma vitrine com um pedestal vazio, e a tela de
  // escolha não tem como se recuperar disso na frente do jogador.
  for (const e of INICIAIS) checar(e.id in MEDIDAS, `o inicial ${e.nome} não tem modelo`);

  let semModelo = 0;
  let evolucaoQuebrada = 0;
  for (const e of ESPECIES) {
    if (!MEDIDAS[e.id]) semModelo++;
    if (e.evolui && !porId(e.evolui.para)) evolucaoQuebrada++;
    checar(e.tipos.length >= 1 && e.tipos.length <= 2, `${e.nome}: ${e.tipos.length} tipos`);
    // Quatro golpes, como no jogo: fisico e especial do tipo principal, uma
    // cobertura (ou um segundo status) e um golpe de status.
    // O arsenal vem da tabela de aprendizado de Red/Blue/Yellow e depende do
    // nível, então o que se garante é isto: ele nunca fica sem como atacar,
    // nem no nível 1, nem no teto.
    checar(e.aprende.length > 0, `${e.nome}: não aprende golpe nenhum`);
    checar(
      golpesDeDano(golpesNoNivel(e, 1)).length >= 1,
      `${e.nome}: entra em campo no nível 1 sem golpe de dano`,
    );
    checar(
      golpesDeDano(golpesNoNivel(e, NIVEL_MAXIMO)).length >= 1,
      `${e.nome}: chega ao teto de nível sem golpe de dano`,
    );
    checar(
      e.golpes.length >= 1 && e.golpes.length <= 4,
      `${e.nome}: carrega ${e.golpes.length} golpes`,
    );
    checar(
      e.aprende.every((a) => (a.golpe.categoria === 'status') === (a.golpe.potencia === 0)),
      `${e.nome}: categoria e potência discordam`,
    );
    checar(e.base.hp > 0 && e.base.atq > 0, `${e.nome}: stat-base zerado`);
    checar(e.taxaCaptura > 0 && e.taxaCaptura <= 1, `${e.nome}: taxa de captura fora de 0..1`);
  }
  checar(semModelo === 0, `${semModelo} espécies sem modelo medido`);
  checar(evolucaoQuebrada === 0, `${evolucaoQuebrada} evoluções apontam para espécie inexistente`);

  const comEvolucao = ESPECIES.filter((e) => e.evolui).length;
  const lendarios = ESPECIES.filter((e) => e.lendario).length;
  console.log(`   151 espécies, ${comEvolucao} evoluem, ${lendarios} lendárias`);
}

// ---------------------------------------------------------------------------
console.log('2. tamanho dentro da sala');
{
  // Repete a conta de instanciar(): é ela que decide se um Onix cabe no quarto.
  let maiorAltura = 0;
  let maiorPegada = 0;
  let nomeMaior = '';
  for (const e of ESPECIES) {
    const m = MEDIDAS[e.id];
    const maiorHorizontal = Math.max(m.largura, m.profundidade);
    const referencia = Math.max(m.alturaModelo, maiorHorizontal / 2, 1e-6);
    const escala = e.altura / referencia;

    const alturaFinal = m.alturaModelo * escala;
    const pegadaFinal = maiorHorizontal * escala;
    checar(Number.isFinite(escala) && escala > 0, `${e.nome}: escala inválida`);
    checar(alturaFinal <= e.altura + 1e-6, `${e.nome}: mais alto que o pedido`);
    checar(pegadaFinal < 2.3, `${e.nome}: ocupa ${pegadaFinal.toFixed(2)}m de chão`);

    if (alturaFinal > maiorAltura) maiorAltura = alturaFinal;
    if (pegadaFinal > maiorPegada) {
      maiorPegada = pegadaFinal;
      nomeMaior = e.nome;
    }
  }
  const alturas = ESPECIES.map((e) => e.altura);
  console.log(
    `   alturas de ${Math.min(...alturas).toFixed(2)}m a ${Math.max(...alturas).toFixed(2)}m; ` +
      `maior pegada: ${nomeMaior} com ${maiorPegada.toFixed(2)}m`,
  );
}

// ---------------------------------------------------------------------------
console.log('3. efetividade dos dezoito tipos');
{
  checar(multiplicador('fogo', ['planta']) === 2, 'fogo deveria ser forte contra planta');
  checar(multiplicador('agua', ['fogo']) === 2, 'água deveria ser forte contra fogo');
  checar(multiplicador('fogo', ['agua']) === 0.5, 'fogo deveria ser fraco contra água');
  checar(multiplicador('normal', ['fantasma']) === 0, 'normal não deveria afetar fantasma');
  checar(multiplicador('terra', ['voador']) === 0, 'terra não deveria afetar voador');

  // Os dois tipos se multiplicam — é o que dá o 4× e o zero.
  const gyarados = porId('gyarados')!;
  const charizard = porId('charizard')!;
  checar(multiplicador('eletrico', gyarados.tipos) === 4, 'elétrico em Gyarados deveria dar 4×');
  checar(multiplicador('terra', charizard.tipos) === 0, 'terra em Charizard deveria dar 0');
  checar(multiplicador('pedra', charizard.tipos) === 4, 'pedra em Charizard deveria dar 4×');

  // E o dano precisa sentir isso, senão a tabela é decoração.
  const bulbasaur = porId('bulbasaur')!;
  const squirtle = porId('squirtle')!;
  const atacante = { especie: porId('charmander')!, nivel: 15 };
  let forte = 0;
  let fraco = 0;
  for (let i = 0; i < 400; i++) {
    forte += calcularDano(atacante, { especie: bulbasaur, nivel: 15 }, atacante.especie.golpe).dano;
    fraco += calcularDano(atacante, { especie: squirtle, nivel: 15 }, atacante.especie.golpe).dano;
  }
  console.log(`   fogo em planta ${(forte / 400).toFixed(1)} vs em água ${(fraco / 400).toFixed(1)}`);
  checar(forte > fraco * 2, 'a vantagem de tipo mal aparece no dano');
}

// ---------------------------------------------------------------------------
console.log('4. o golpe escolhido é o melhor que ele tem');
{
  // Agora todo mundo tem quatro golpes, e um deles é de status — que não causa
  // dano e nunca pode ser o "melhor" numa conta de dano. A escolha automática
  // olha só para os de dano, e é isso que se confere aqui.
  let coberturaUsada = 0;
  let statusEscolhido = 0;
  for (const atacante of ESPECIES.filter((e) => e.tipos.length === 2)) {
    for (const defensor of ESPECIES) {
      const a = { especie: atacante, nivel: 20 };
      const d = { especie: defensor, nivel: 20 };
      const escolhido = escolherGolpe(a, d);
      const nota = (g: (typeof atacante.golpes)[number]) =>
        g.potencia *
        multiplicador(g.tipo, defensor.tipos) *
        (atacante.tipos.includes(g.tipo) ? 1.5 : 1);
      const melhor = Math.max(...golpesDeDano(arsenal(a)).map(nota));
      checar(nota(escolhido) >= melhor - 1e-9, `${atacante.nome} vs ${defensor.nome}: golpe pior`);
      if (escolhido.categoria === 'status') statusEscolhido++;
      // Cobertura é o golpe de um tipo que não é o principal dele.
      if (escolhido.tipo !== atacante.tipos[0]) coberturaUsada++;
    }
  }
  console.log(`   a cobertura foi escolhida em ${coberturaUsada} confrontos`);
  checar(coberturaUsada > 0, 'o golpe de cobertura nunca é usado');
  checar(statusEscolhido === 0, 'a escolha automática pegou um golpe de status');
}

// ---------------------------------------------------------------------------
console.log('5. ritmo da batalha, por tipo de confronto');
{
  const grupos: Record<string, number[]> = { vantagem: [], neutro: [], desvantagem: [] };
  let travadas = 0;
  // Uma amostra regular da Pokédex: 151×151 seriam 22 mil combates por rodada.
  const amostra = ESPECIES.filter((_, i) => i % 7 === 0);

  for (const a of amostra) {
    for (const b of amostra) {
      const atacante = { especie: a, nivel: 20 };
      const defensor = { especie: b, nivel: 20 };
      const golpe = escolherGolpe(atacante, defensor);
      const m = multiplicador(golpe.tipo, b.tipos);
      if (m === 0) continue; // imunidade total é assunto do teste 3

      let hp = statsNoNivel(b, 20).hpMax;
      let golpes = 0;
      while (hp > 0 && golpes < 300) {
        hp -= calcularDano(atacante, defensor, golpe).dano;
        golpes++;
      }
      if (golpes >= 300) travadas++;

      const grupo = m >= 2 ? 'vantagem' : m <= 0.5 ? 'desvantagem' : 'neutro';
      grupos[grupo].push(golpes);
    }
  }

  const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  for (const [nome, xs] of Object.entries(grupos)) {
    console.log(`   ${nome.padEnd(12)} ${media(xs).toFixed(1)} golpes  (${xs.length} confrontos)`);
  }

  checar(travadas === 0, `${travadas} combates nunca terminaram`);
  checar(media(grupos.vantagem) <= 6, 'com vantagem de tipo a batalha deveria ser rápida');
  checar(media(grupos.vantagem) >= 1.3, 'com vantagem está fácil demais, some num golpe');
  checar(media(grupos.neutro) <= 11, 'confronto neutro está arrastado');
  checar(media(grupos.desvantagem) <= 20, 'confronto ruim está insuportável');
  // A vantagem precisa ser sentida, senão escolher o Pokémon não importa.
  checar(
    media(grupos.desvantagem) > media(grupos.vantagem) * 1.6,
    'escolher o tipo certo quase não muda nada',
  );
}

// ---------------------------------------------------------------------------
console.log('6. captura: HP, nível e tipo de bola');
{
  let piorCheio = 1;
  let melhorKo = 0;
  for (const especie of ESPECIES) {
    const cheio = chanceCaptura(especie, 1, 0, 1, 10) ** 3;
    const quaseZero = chanceCaptura(especie, 0.05, 0, 1, 10) ** 3;
    checar(quaseZero >= cheio, `${especie.nome}: enfraquecer piorou a captura`);
    // A exigência de ganho grande só vale para quem não está perto do teto:
    // um Caterpie já é fácil com a vida cheia, não há para onde melhorar.
    if (cheio < 0.5) {
      checar(quaseZero > cheio * 1.5, `${especie.nome}: enfraquecer quase não ajuda`);
    }
    checar(quaseZero < 0.96, `${especie.nome}: captura virou garantida`);
    piorCheio = Math.min(piorCheio, cheio);
    melhorKo = Math.max(melhorKo, quaseZero);
  }
  console.log(
    `   alvo inteiro: de ${(piorCheio * 100).toFixed(0)}% (o mais difícil) ` +
      `a ${(melhorKo * 100).toFixed(0)}% quase desmaiado (o mais fácil)`,
  );
  // A afirmação que interessa não é que ninguém seja impossível com bola comum
  // e vida cheia — Mewtwo é, e deve ser. É que esforço sempre resolve: quem
  // batalhou até quase derrubar e usou a melhor bola tem de ter uma chance real.
  let piorComEsforco = 1;
  for (const especie of ESPECIES) {
    piorComEsforco = Math.min(piorComEsforco, chanceCaptura(especie, 0.05, 0, 8, 20) ** 3);
  }
  console.log(
    `   enfraquecido e com Bola Lacuna, o pior caso ainda dá ${(piorComEsforco * 100).toFixed(0)}%`,
  );
  checar(piorComEsforco > 0.35, 'nem batalhando e com a melhor bola dá para pegar os difíceis');

  const facil = porId('caterpie')!;
  const dificil = porId('mewtwo')!;
  checar(
    chanceCaptura(facil, 1, 0, 1, 10) > chanceCaptura(dificil, 1, 0, 1, 10),
    'Caterpie deveria ser mais fácil que Mewtwo',
  );
  // Nível alto resiste mais — é o que impede prender um lendário de primeira.
  const comum = porId('rattata')!;
  checar(
    chanceCaptura(comum, 1, 0, 1, 50) < chanceCaptura(comum, 1, 0, 1, 5),
    'o nível do alvo não muda nada na captura',
  );

  console.log('   --- com o alvo inteiro, por tipo de bola ---');
  let anterior = 0;
  for (const bola of BOLAS) {
    const chance = chanceCaptura(dificil, 1, 0, bola.multiplicador, 40) ** 3;
    console.log(`   ${bola.nome.padEnd(16)} ${(chance * 100).toFixed(1)}%`);
    checar(chance > anterior, `${bola.nome} não é melhor que a anterior`);
    anterior = chance;
  }
}

// ---------------------------------------------------------------------------
console.log('7. níveis e evolução');
{
  for (let n = 1; n < NIVEL_MAXIMO; n++) {
    checar(xpParaNivel(n + 1) > xpParaNivel(n), `a XP do nível ${n + 1} não cresce`);
    checar(nivelPorXp(xpParaNivel(n)) === n, `nivelPorXp não inverte xpParaNivel no nível ${n}`);
  }

  const charmander = porId('charmander')!;
  checar(evolucaoEm(charmander, 5) === null, 'Charmander evoluiu cedo demais');
  const evoluido = evolucaoEm(charmander, 40);
  checar(evoluido?.id === 'charmeleon', 'Charmander deveria virar Charmeleon');

  // Os stats precisam crescer com o nível, e o HP mais do que o resto.
  const baixo = statsNoNivel(charmander, 5);
  const alto = statsNoNivel(charmander, 50);
  checar(alto.hpMax > baixo.hpMax * 2, 'o HP quase não sobe com o nível');
  checar(alto.ataque > baixo.ataque, 'o ataque não sobe com o nível');
  console.log(
    `   Charmander N5 ${baixo.hpMax} HP / ${baixo.ataque} atq → N50 ${alto.hpMax} HP / ${alto.ataque} atq`,
  );

  // Uma linha inteira tem de chegar ao fim sem buraco.
  let atual: Especie | null = porId('bulbasaur')!;
  const linha: string[] = [];
  for (let i = 0; i < 5 && atual; i++) {
    linha.push(atual.nome);
    atual = evolucaoEm(atual, NIVEL_MAXIMO);
  }
  console.log(`   linha completa: ${linha.join(' → ')}`);
  checar(linha.length === 3, `a linha do Bulbasaur deu ${linha.length} formas`);
}

// ---------------------------------------------------------------------------
console.log('8. ciclo da pokébola');
{
  const contagem = { capturou: 0, escapou: 0, travou: 0 };
  for (let n = 0; n < 200; n++) {
    const especie = ESPECIES[(n * 13) % ESPECIES.length];
    const alvo = nascer(especie, 'selvagem', 10, n);
    alvo.atualizar(0.7, JOGADOR);
    alvo.receberDano(alvo.hpMax * 0.7); // chega machucado, como numa batalha real
    const bola = new Pokebola(0);
    bola.raiz.position.set(0, 1.2, -1.4);
    bola.capturar(alvo, 0.5, 2);

    let desfecho: string | null = null;
    for (let i = 0; i < 72 * 20; i++) {
      bola.atualizar(1 / 72);
      alvo.atualizar(1 / 72, JOGADOR);
      if (bola.resultado) {
        desfecho = bola.resultado;
        break;
      }
    }
    if (desfecho === 'capturou') contagem.capturou++;
    else if (desfecho === 'escapou') contagem.escapou++;
    else contagem.travou++;
  }
  const taxa = (contagem.capturou / 200) * 100;
  console.log(
    `   com 30% de HP e bola reforçada: ${contagem.capturou} capturas, ${contagem.escapou} escapes (${taxa.toFixed(0)}%)`,
  );
  checar(contagem.travou === 0, `${contagem.travou} capturas nunca resolveram`);
  checar(taxa > 25 && taxa < 95, `taxa fora do razoável: ${taxa.toFixed(0)}%`);
}

// ---------------------------------------------------------------------------
console.log('9. companheiro seguindo o treinador');
{
  const companheiro = nascer(porId('pikachu')!, 'companheiro', 12, 3);
  const jogador = new THREE.Vector3(0, 1.6, 0);
  let maxDist = 0;
  let afundou = 0;

  for (let i = 0; i < 60 * 72; i++) {
    // O treinador anda em círculo pela sala.
    const t = i / 72;
    jogador.set(Math.cos(t * 0.5) * 1.5, 1.6, Math.sin(t * 0.5) * 1.5);
    companheiro.atualizar(1 / 72, jogador);
    checar(finito(companheiro.raiz.position), `posição virou NaN no passo ${i}`);
    const d = Math.hypot(
      companheiro.raiz.position.x - jogador.x,
      companheiro.raiz.position.z - jogador.z,
    );
    maxDist = Math.max(maxDist, d);
    if (companheiro.raiz.position.y < -0.01) afundou++;
  }
  console.log(`   nunca ficou a mais de ${maxDist.toFixed(2)}m do treinador, atravessou o chão ${afundou}×`);
  checar(afundou === 0, 'o companheiro atravessou o chão');
  checar(maxDist < 3, `o companheiro se perdeu (${maxDist.toFixed(2)}m)`);
}

// ---------------------------------------------------------------------------
console.log('10. fuga por proximidade, e a fruta segurando ela');
{
  const alvo = nascer(porId('rattata')!, 'selvagem', 8, 11);
  const perto = new THREE.Vector3(0, 1.6, -1.5);
  let passos = 0;
  while (alvo.viva && passos < 72 * 30) {
    alvo.atualizar(1 / 72, perto);
    passos++;
  }
  console.log(`   sumiu depois de ${(passos / 72).toFixed(1)}s de invasão de espaço`);
  checar(!alvo.viva, 'o selvagem nunca fugiu mesmo com o treinador em cima');

  // Com a fruta, o mesmo assédio não basta: dá tempo de jogar a bola.
  const comFruta = nascer(porId('rattata')!, 'selvagem', 8, 11);
  let passosComFruta = 0;
  while (comFruta.viva && passosComFruta < 72 * 30) {
    comFruta.atualizar(1 / 72, perto);
    if (passosComFruta % 72 === 0) comFruta.acalmar(0.5);
    passosComFruta++;
  }
  console.log(`   com fruta a cada segundo, aguentou ${(passosComFruta / 72).toFixed(1)}s`);
  checar(passosComFruta > passos, 'a fruta não segurou o selvagem por mais tempo');
}

// ---------------------------------------------------------------------------
console.log('11. pontos de nascimento');
{
  const sala = new Sala(new THREE.Group());
  sala.usarFallback();
  let nulos = 0;
  let fora = 0;
  for (let i = 0; i < 500; i++) {
    const local = sala.pontoDeSpawn(JOGADOR);
    if (!local) {
      nulos++;
      continue;
    }
    const d = Math.hypot(local.ponto.x - JOGADOR.x, local.ponto.z - JOGADOR.z);
    if (d < 1.0 - 1e-6 || d > 3.2 + 1e-6) fora++;
  }
  console.log(`   500 sorteios: ${nulos} sem lugar, ${fora} fora da faixa`);
  checar(fora === 0, `${fora} spawns fora da faixa de distância`);
  checar(nulos < 60, `${nulos} sorteios falharam em achar lugar`);
}

// ---------------------------------------------------------------------------
console.log('12. o esqueleto dos quatro iniciais');
{
  // Estes nomes NÃO são inventados: são os que estão dentro de public/pokemon/
  // 1, 4, 7 e 25.glb. O teste existe porque src/rig.ts casa osso por nome, e um
  // rip com convenção diferente sairia daqui como um bicho de pé parado — que é
  // exatamente o tipo de falha que não dá erro nenhum e só aparece no headset.
  const OSSOS_REAIS: Record<string, string[]> = {
    bulbasaur: [
      'Waist_6', 'Spine1_23', 'Spine2_49', 'Head_50', 'Jaw_52', 'LEar_54', 'REar_56',
      'LShoulder_59', 'LArm_60', 'LForeArm_61', 'LHand_62',
      'RShoulder_65', 'RArm_66', 'RForeArm_67', 'RHand_68',
      'Hips_8', 'LThigh_10', 'LLeg_11', 'LFoot_12', 'RThigh_16', 'RLeg_17', 'RFoot_18',
    ],
    charmander: [
      'Hips', 'LThigh', 'LLeg', 'LFoot', 'LToe', 'RThigh', 'RLeg', 'RFoot', 'RToe',
      'Tail1', 'Tail2', 'Tail3', 'Spine1', 'Spine2',
      'LShoulder', 'LArm', 'LForeArm', 'LHand', 'Neck', 'Head', 'Jaw',
      'RShoulder', 'RArm', 'RForeArm', 'RHand',
    ],
    squirtle: [
      'Waist', 'Head', 'Jaw', 'Tail1', 'Tail2', 'Tail3',
      'LThigh', 'LLeg', 'LFoot', 'LToe', 'RThigh', 'RLeg', 'RFoot', 'RToe',
      'LArm', 'LForeArm', 'LHand', 'RArm', 'RForeArm', 'RHand',
    ],
    pikachu: [
      'Waist_33', 'Spine1_19', 'Spine2_18', 'Head_9', 'LEar1_5', 'REar1_8',
      'LShoulder_13', 'LArm_12', 'LForeArm_11', 'LHand_10',
      'Hips_32', 'LThigh_23', 'LLeg_22', 'LFoot_21',
      'RThigh_27', 'RLeg_26', 'RFoot_25', 'Tail1_30', 'Tail2_29', 'Tail3_28',
    ],
  };

  for (const [id, nomes] of Object.entries(OSSOS_REAIS)) {
    const { rig } = esqueletoDe(nomes);
    const faltando = ['cabeca', 'coxaE', 'coxaD', 'pernaE', 'pernaD'].filter(
      (c) => !rig.tem(c as Chave),
    );
    checar(faltando.length === 0, `${id}: sem ${faltando.join(', ')}`);
    checar(!rig.vazio, `${id}: nenhum osso reconhecido`);
    console.log(`   ${id.padEnd(11)} ${String(rig.encontrados).padStart(2)} papéis de ${nomes.length} ossos`);
  }

  // O Squirtle é o caso difícil e é por isso que ele está aqui: o rig dele não
  // tem Spine nenhum, só Waist. O quadril fica com o Waist e o tronco fica sem
  // osso — e nada pode tomar o Waist duas vezes, senão cada giro sairia dobrado.
  const { rig: squirtle } = esqueletoDe(OSSOS_REAIS.squirtle);
  checar(squirtle.tem('quadril'), 'Squirtle deveria ter quadril (no Waist)');
  checar(!squirtle.tem('tronco'), 'Squirtle não tem coluna: tronco não podia repetir o Waist');
}

// ---------------------------------------------------------------------------
console.log('13. a animação mexe os ossos, e só mexe os que deve');
{
  const especie = porId('charmander')!;
  const nomes = [
    'Hips', 'Spine1', 'Spine2', 'Neck', 'Head', 'Jaw',
    'LShoulder', 'LArm', 'LForeArm', 'LHand', 'RShoulder', 'RArm', 'RForeArm', 'RHand',
    'LThigh', 'LLeg', 'LFoot', 'RThigh', 'RLeg', 'RFoot', 'Tail1', 'Tail2', 'Tail3',
  ];
  const { corpo, porNome, repousos } = esqueletoDe(nomes, especie.altura);
  const bicho = new Pokemon(especie, corpo, new THREE.Vector3(0, 0, -1.5), 0, 'companheiro', 12);

  checar(bicho.animador.temRig, 'o animador não reconheceu o esqueleto do Charmander');

  const coxaE = porNome.get('LThigh')!;
  const coxaD = porNome.get('RThigh')!;
  const cabeca = porNome.get('Head')!;
  const repousoCoxaE = repousos.get('LThigh')!;
  const repousoCoxaD = repousos.get('RThigh')!;

  // --- andando: as coxas têm de sair de fase uma da outra ---
  let opostas = 0;
  let mexeu = 0;
  const jogador = new THREE.Vector3(3.5, 1.6, -1.5); // longe, para ele andar
  for (let i = 0; i < 260; i++) {
    bicho.atualizar(1 / 72, jogador);
    const e = desvioX(coxaE, repousoCoxaE);
    const d = desvioX(coxaD, repousoCoxaD);
    if (Math.abs(e) > 0.02) mexeu++;
    if (e * d < -0.0004) opostas++;
    checar(Number.isFinite(e) && Number.isFinite(d), 'ângulo de coxa virou NaN');
  }
  checar(mexeu > 60, `a coxa quase não se mexeu andando (${mexeu} de 260 quadros)`);
  checar(opostas > 60, `as pernas não alternaram (${opostas} de 260 quadros em oposição)`);
  console.log(`   andando: ${mexeu} quadros com perna em movimento, ${opostas} em oposição`);

  // --- gesto: sobe, enche e volta ao repouso ---
  // Medido no BRAÇO, que é o que acena; a cabeça só acompanha. E medido contra
  // a pose de repouso guardada, e não contra o quadro anterior, porque o que
  // interessa é que ele volte ao lugar depois — um gesto que não volta deixa o
  // bicho com o braço no alto para sempre.
  const braco = porNome.get('RArm')!;
  const repousoBraco = repousos.get('RArm')!;
  bicho.animador.disparar('acenar', 1.0);
  let pico = 0;
  let terminouEm = -1;
  for (let i = 0; i < 100; i++) {
    bicho.atualizar(1 / 72, jogador);
    pico = Math.max(pico, Math.abs(desvioX(braco, repousoBraco)));
    if (terminouEm < 0 && bicho.animador.gestoAtivo === null) terminouEm = i;
  }
  const sobrou = Math.abs(desvioX(braco, repousoBraco));
  checar(pico > 0.3, `o aceno mal levantou o braço (pico ${(pico * 57.3).toFixed(1)}°)`);
  checar(terminouEm >= 60 && terminouEm <= 85, `o gesto acabou no quadro ${terminouEm}, não perto de 72`);
  checar(sobrou < 0.08, `o braço não voltou ao lugar (sobraram ${(sobrou * 57.3).toFixed(1)}°)`);
  console.log(
    `   aceno: pico de ${(pico * 57.3).toFixed(0)}° no braço, acabou no quadro ${terminouEm}, voltou ao repouso`,
  );

  // --- desmaiado não pode gerar NaN nem sumir do quarto ---
  bicho.receberDano(bicho.hpMax);
  for (let i = 0; i < 200; i++) bicho.atualizar(1 / 72, jogador);
  checar(finito(bicho.raiz.position), 'desmaiado, a posição virou NaN');
  checar(
    Number.isFinite(cabeca.quaternion.x) && Number.isFinite(cabeca.quaternion.w),
    'desmaiado, a rotação da cabeça virou NaN',
  );
}

// ---------------------------------------------------------------------------
console.log('14. ir até o ponto marcado');
{
  const especie = porId('squirtle')!;
  const { corpo } = esqueletoDe(['Waist', 'Head', 'LThigh', 'LLeg', 'RThigh', 'RLeg'], especie.altura);
  const bicho = new Pokemon(especie, corpo, new THREE.Vector3(0, 0, -1), 0, 'companheiro', 10);
  const jogador = new THREE.Vector3(0, 1.6, 0);
  for (let i = 0; i < 40; i++) bicho.atualizar(1 / 72, jogador);

  const destino = new THREE.Vector3(2.2, 0, -2.6);
  bicho.irPara(destino);
  checar(bicho.indoParaAlgumLugar, 'o comando não pegou');

  let quadros = 0;
  while (bicho.indoParaAlgumLugar && quadros < 72 * 20) {
    bicho.atualizar(1 / 72, jogador);
    quadros++;
  }
  const falta = Math.hypot(bicho.raiz.position.x - destino.x, bicho.raiz.position.z - destino.z);
  checar(!bicho.indoParaAlgumLugar, 'ele nunca chegou nem desistiu');
  checar(falta < 0.3, `parou a ${falta.toFixed(2)} m da marca`);
  checar(finito(bicho.raiz.position), 'a posição virou NaN indo para a marca');
  console.log(`   chegou em ${(quadros / 72).toFixed(1)}s, a ${(falta * 100).toFixed(0)} cm da marca`);

  // Fazer carinho tem de CANCELAR a ordem: a mão na cabeça vale mais do que um
  // destino marcado há dez segundos.
  bicho.irPara(new THREE.Vector3(-3, 0, 0));
  bicho.receberCarinho();
  checar(!bicho.indoParaAlgumLugar, 'o carinho não cancelou a ordem de andar');
  checar(bicho.recebendoCarinho, 'o carinho não registrou');
}

// ---------------------------------------------------------------------------
console.log('15. o PC mexendo na equipe');
{
  const dex = new Dex();
  dex.limpar();
  dex.receberInicial('charmander');
  for (const id of ['pidgey', 'rattata', 'caterpie', 'zubat', 'geodude', 'magikarp', 'eevee']) {
    dex.registrarCaptura(id, 10, 8, false);
  }

  checar(dex.time.length === TAMANHO_TIME, `o time deveria ter ${TAMANHO_TIME}, tem ${dex.time.length}`);
  checar(dex.guardados.length === 2, `a caixa deveria ter 2, tem ${dex.guardados.length}`);

  // Trocar um do time por um da caixa: os dois mudam de metade de uma vez só.
  const doTime = dex.time[1];
  const daCaixa = dex.guardados[0];
  dex.trocar(1, TAMANHO_TIME);
  checar(dex.time[1] === daCaixa, 'quem estava na caixa não entrou no time');
  checar(dex.guardados[0] === doTime, 'quem estava no time não foi para a caixa');
  checar(dex.todos.length === 8, 'a troca perdeu ou criou exemplar');

  // O ativo é guardado por índice: mover a lista embaixo dele não pode trocar
  // qual bicho está escolhido.
  dex.definirAtivo(0);
  const ativo = dex.exemplarAtivo;
  dex.mover(0, 5);
  checar(dex.exemplarAtivo === ativo, 'mover a lista trocou qual Pokémon está ativo');
  dex.trocar(5, 2);
  checar(dex.exemplarAtivo === ativo, 'trocar de lugar trocou qual Pokémon está ativo');

  // Fora dos limites não pode corromper nada.
  const antes = dex.todos.map((e) => e.id).join(',');
  dex.trocar(-1, 99);
  dex.mover(50, 0);
  checar(dex.todos.map((e) => e.id).join(',') === antes, 'índice inválido mexeu na coleção');

  // --- o arrasto do PC, e a vaga que fica vazia ---
  //
  // É o pedido de 18/09, e é a operação que `trocar` nunca soube fazer: tirar
  // alguém do time SEM pôr ninguém no lugar. Trocar sempre preenche.
  {
    const arrasto = new Dex();
    arrasto.limpar();
    arrasto.receberInicial('bulbasaur');
    for (const id of ['pidgey', 'rattata', 'caterpie', 'zubat', 'geodude', 'magikarp']) {
      arrasto.registrarCaptura(id, 10, 8, false);
    }
    checar(arrasto.timeVivo.length === TAMANHO_TIME, 'o time devia estar cheio para começar');

    // Time → caixa: a vaga do time FICA VAZIA, e ninguém sobe.
    const terceiro = arrasto.time[2]!;
    const quarto = arrasto.time[3]!;
    arrasto.arrastar(2, TAMANHO_TIME + arrasto.guardados.length);
    checar(arrasto.time[2] === null, 'tirar do time devia deixar a vaga vazia');
    checar(arrasto.time[3] === quarto, 'o de baixo subiu, e a ordem do time se desfez');
    checar(arrasto.guardados.includes(terceiro), 'quem saiu do time não chegou na caixa');
    checar(arrasto.timeVivo.length === TAMANHO_TIME - 1, 'o time devia ter uma vaga a menos');

    // Caixa → a vaga vazia: ele entra ALI, e não no fim.
    const daCaixaAgora = arrasto.guardados[0];
    const ondeEstava = arrasto.todosComVagas.indexOf(daCaixaAgora);
    arrasto.arrastar(ondeEstava, 2);
    checar(arrasto.time[2] === daCaixaAgora, 'o da caixa não caiu na vaga em que foi solto');

    // A caixa nunca fica com buraco: ela é depósito, não formação.
    const buracoNaCaixa = arrasto.todosComVagas.slice(TAMANHO_TIME).some((e) => e === null);
    checar(!buracoNaCaixa, 'a caixa ficou com uma vaga vazia no meio');

    // E nada se perdeu no caminho.
    checar(arrasto.todos.length === 7, `a coleção tinha 7 e ficou com ${arrasto.todos.length}`);

    arrasto.limpar();
  }

  dex.limpar();
  console.log('   troca, movimentação e ativo mantidos em 8 exemplares');
  console.log('   arrasto: tirar do time deixa a vaga vazia, e a caixa continua sem buracos');
}

// ---------------------------------------------------------------------------
console.log('16. a sala acompanha quem anda');
{
  // Este é o teste do bug que o jogador viu no headset: tudo acontecia em volta
  // do ponto onde ele entrou. A causa era o piso de reserva ser um quadrado fixo
  // na ORIGEM da sessão — andar dez metros deixava o jogo sem chão onde nascer.
  const sala = new Sala(new THREE.Group());
  const jogador = new THREE.Vector3(0, 1.6, 0);
  sala.atualizar(null, null, jogador);

  let semLugar = 0;
  let longeDemais = 0;
  for (let passo = 0; passo < 14; passo++) {
    // Anda um metro e meio por leitura, em diagonal — sai bem longe da origem.
    jogador.x += 1.5;
    jogador.z -= 0.9;
    sala.atualizar(null, null, jogador);

    const local = sala.pontoDeSpawn(jogador);
    if (!local) {
      semLugar++;
      continue;
    }
    const d = Math.hypot(local.ponto.x - jogador.x, local.ponto.z - jogador.z);
    if (d < 1.0 - 1e-6 || d > 3.2 + 1e-6) longeDemais++;
  }

  const distanciaDaOrigem = Math.hypot(jogador.x, jogador.z);
  checar(semLugar === 0, `${semLugar} leituras ficaram sem lugar para nascer`);
  checar(longeDemais === 0, `${longeDemais} pontos nasceram fora do alcance do jogador`);
  console.log(
    `   andou ${distanciaDaOrigem.toFixed(1)} m da origem e continuou tendo onde nascer`,
  );
}

// ---------------------------------------------------------------------------
console.log('17. o mapa cresce a cada passo');
{
  // O `hit-test` não existe no Node, então a sondagem é encenada: um raio que
  // sempre acerta o chão a y = 0. O que se testa é a CONTABILIDADE do mapa —
  // uma célula por quadrado de 80 cm, crescendo conforme se anda, e sem crescer
  // parado no mesmo lugar.
  (globalThis as Record<string, unknown>).XRRay = class {};
  const sessao = {
    requestReferenceSpace: async () => ({}),
    requestHitTestSource: async () => ({ cancel() {} }),
  };

  let alturaDoChao = 0;
  const frame = {
    getHitTestResults: () => [
      { getPose: () => ({ transform: { position: { y: alturaDoChao } } }) },
    ],
  };

  const sala = new Sala(new THREE.Group());
  await sala.prepararSondagem(sessao as unknown as XRSession);

  const jogador = new THREE.Vector3(0, 1.6, 0);
  const espaco = {} as XRReferenceSpace;

  // Parado: uma célula, por mais que se leia.
  for (let i = 0; i < 20; i++) sala.atualizar(frame as unknown as XRFrame, espaco, jogador);
  checar(sala.mapeadas === 1, `parado no lugar, o mapa foi a ${sala.mapeadas} superfícies`);

  // Andando dez metros em linha reta: uma célula a cada 80 cm.
  for (let i = 0; i < 40; i++) {
    jogador.x += 0.25;
    sala.atualizar(frame as unknown as XRFrame, espaco, jogador);
  }
  checar(sala.mapeadas >= 11, `dez metros deram só ${sala.mapeadas} células`);
  checar(sala.mapeadas <= 16, `dez metros deram ${sala.mapeadas} células — granularidade solta`);
  console.log(`   dez metros de caminhada mapearam ${sala.mapeadas} superfícies`);

  // Subir um degrau: o chão por perto é o de cima, não o mais baixo já visto.
  alturaDoChao = 0.42;
  for (let i = 0; i < 12; i++) {
    jogador.x += 0.25;
    sala.atualizar(frame as unknown as XRFrame, espaco, jogador);
  }
  checar(
    Math.abs(sala.pisoY - 0.42) < 0.05,
    `no degrau, o piso por perto ficou em ${sala.pisoY.toFixed(2)} m em vez de 0,42`,
  );
  console.log(`   degrau de 42 cm: o piso por perto acompanhou (${sala.pisoY.toFixed(2)} m)`);
}

// ---------------------------------------------------------------------------
console.log('18. quem flutua não pula');
{
  const flutuador = porId('gastly')!;
  const andarilho = porId('charmander')!;
  checar(flutuador.voo > 0, 'Gastly deveria flutuar');
  checar(andarilho.voo === 0, 'Charmander deveria andar no chão');

  const medir = (especie: Especie) => {
    const bicho = nascer(especie, 'selvagem', 10, 7);
    let menorY = Infinity;
    let maiorY = -Infinity;
    let andou = 0;
    const antes = bicho.raiz.position.clone();
    for (let i = 0; i < 600; i++) {
      bicho.atualizar(1 / 72, JOGADOR);
      if (bicho.raiz.scale.x < 0.5) continue; // ainda surgindo
      menorY = Math.min(menorY, bicho.raiz.position.y);
      maiorY = Math.max(maiorY, bicho.raiz.position.y);
    }
    andou = Math.hypot(
      bicho.raiz.position.x - antes.x,
      bicho.raiz.position.z - antes.z,
    );
    return { bicho, menorY, maiorY, andou };
  };

  const gastly = medir(flutuador);
  const alturaDeVooEmMetros = flutuador.voo * flutuador.altura;
  checar(
    gastly.menorY > alturaDeVooEmMetros * 0.7,
    `Gastly encostou no chão (mínimo ${gastly.menorY.toFixed(2)} m)`,
  );
  checar(gastly.andou > 0.2, 'Gastly não saiu do lugar — quem paira também passeia');
  checar(
    gastly.maiorY - gastly.menorY < alturaDeVooEmMetros * 0.5,
    'Gastly quicou em vez de pairar',
  );

  const charmander = medir(andarilho);
  checar(charmander.menorY < 0.02, 'Charmander nunca encostou no chão');
  checar(charmander.maiorY > 0.1, 'Charmander não pulou — é assim que ele anda');

  console.log(
    `   Gastly pairou entre ${gastly.menorY.toFixed(2)} e ${gastly.maiorY.toFixed(2)} m; ` +
      `Charmander pulou de ${charmander.menorY.toFixed(2)} a ${charmander.maiorY.toFixed(2)} m`,
  );
}

// ---------------------------------------------------------------------------
console.log('19. a isca traz o selvagem');
{
  const especie = porId('rattata')!;
  const bicho = nascer(especie, 'selvagem', 8, 3);
  bicho.raiz.position.set(0, 0, -5);
  bicho.ancora.set(0, 0, -5);
  // Assustado como ele estaria depois de você ter chegado perto uma vez.
  bicho.alarme = 0.8;
  for (let i = 0; i < 60; i++) bicho.atualizar(1 / 72, JOGADOR);

  const antes = Math.hypot(bicho.raiz.position.x - JOGADOR.x, bicho.raiz.position.z - JOGADOR.z);
  bicho.atrairPara(JOGADOR);
  checar(bicho.atraido, 'a isca não pegou');

  let fugiu = false;
  for (let i = 0; i < 72 * 12; i++) {
    bicho.atualizar(1 / 72, JOGADOR);
    if (bicho.estado === 'fugindo' || !bicho.viva) fugiu = true;
  }

  const depois = Math.hypot(bicho.raiz.position.x - JOGADOR.x, bicho.raiz.position.z - JOGADOR.z);
  checar(!fugiu, 'o selvagem fugiu mesmo atraído pela isca');
  checar(depois < antes - 2, `ele mal se aproximou: de ${antes.toFixed(1)} m para ${depois.toFixed(1)} m`);
  checar(depois < 1.6, `parou a ${depois.toFixed(1)} m — a isca é para trazer até perto`);
  checar(bicho.alarme < 0.4, `continuou alarmado (${bicho.alarme.toFixed(2)}) depois de vir`);
  checar(finito(bicho.raiz.position), 'a posição virou NaN vindo pela isca');

  // Chegando, o passeio dele passa a ser aqui: ele não pode dar meia-volta.
  const aoChegar = bicho.raiz.position.clone();
  for (let i = 0; i < 72 * 6; i++) bicho.atualizar(1 / 72, JOGADOR);
  const vagou = Math.hypot(
    bicho.raiz.position.x - aoChegar.x,
    bicho.raiz.position.z - aoChegar.z,
  );
  checar(vagou < 1.5, `depois de chegar ele andou ${vagou.toFixed(1)} m de volta`);

  console.log(
    `   veio de ${antes.toFixed(1)} m para ${depois.toFixed(1)} m e ficou por perto`,
  );
}

// ---------------------------------------------------------------------------
console.log('20. apontar para a mesa é apontar para a mesa');
{
  const sala = new Sala(new THREE.Group());
  const jogador = new THREE.Vector3(0, 1.6, 0);
  sala.usarFallback(jogador);
  // Uma mesa de 80 cm de altura, um metro e meio à frente.
  sala.superficies.push({
    centro: new THREE.Vector3(0, 0.78, -1.5),
    meiaLargura: 0.6,
    meiaProfundidade: 0.4,
    rotacaoY: 0,
    rotulo: 'table',
    altura: 0.78,
    area: 1.92,
  });

  // Um raio saindo da altura do peito, inclinado, que passa por cima da mesa e
  // só cortaria o nível do chão bem atrás dela. A conta ingênua — cruzar com um
  // plano infinito na altura do piso — daria o chão; a certa dá a mesa.
  // Cai 62 cm ao longo de 1,5 m: pousa no meio do tampo.
  const origem = new THREE.Vector3(0, 1.4, 0);
  const direcao = new THREE.Vector3(0, -0.62 / 1.5, -1).normalize();

  const alvo = sala.apontar(origem, direcao);
  checar(alvo !== null, 'o raio não encontrou superfície nenhuma');
  checar(alvo?.rotulo === 'table', `o raio acertou '${alvo?.rotulo}' em vez da mesa`);
  checar(
    alvo !== null && Math.abs(alvo.ponto.y - 0.78) < 1e-6,
    `a marca ficou em y=${alvo?.ponto.y.toFixed(2)} em vez de 0,78`,
  );

  // Apontando bem para baixo, ele passa ao lado da mesa e pega o chão.
  const chao = sala.apontar(origem, new THREE.Vector3(0, -1, -0.15).normalize());
  checar(chao?.rotulo === 'floor', `sem mesa no caminho deveria dar o chão, deu '${chao?.rotulo}'`);

  // E o Pokémon comandado para a mesa SOBE nela, em rampa. Ele começa longe da
  // mesa de propósito: o caso interessante é a subida acontecer ao longo do
  // percurso, e não um pulo vertical na chegada.
  const bicho = nascer(porId('squirtle')!, 'companheiro', 10, 5);
  bicho.raiz.position.set(0, 0, 1.2);
  bicho.ancora.set(0, 0, 1.2);
  for (let i = 0; i < 40; i++) bicho.atualizar(1 / 72, jogador);
  bicho.irPara(alvo!.ponto);
  let quadros = 0;
  while (bicho.indoParaAlgumLugar && quadros < 72 * 20) {
    bicho.atualizar(1 / 72, jogador);
    quadros++;
  }
  checar(
    Math.abs(bicho.pisoY - 0.78) < 0.05,
    `ele parou com o apoio em ${bicho.pisoY.toFixed(2)} m em vez de subir na mesa`,
  );
  checar(finito(bicho.raiz.position), 'a posição virou NaN subindo na mesa');
  console.log(
    `   a mira pegou a mesa a 0,78 m e o Squirtle subiu nela em ${(quadros / 72).toFixed(1)}s`,
  );
}

// ---------------------------------------------------------------------------
console.log('21. estágios: buff, debuff e o limite');
{
  checar(Math.abs(multEstagio(0) - 1) < 1e-9, 'estágio zero deveria não mudar nada');
  checar(Math.abs(multEstagio(1) - 1.5) < 1e-9, '+1 deveria ser 1,5×');
  checar(Math.abs(multEstagio(2) - 2) < 1e-9, '+2 deveria ser o dobro');
  checar(Math.abs(multEstagio(-1) - 2 / 3) < 1e-9, '−1 deveria ser 0,67×');
  checar(Math.abs(multEstagio(6) - 4) < 1e-9, '+6 deveria ser 4×');
  checar(Math.abs(multEstagio(-6) - 0.25) < 1e-9, '−6 deveria ser 0,25×');
  // Fora da escala não existe: passar de 6 não pode virar 5× por acidente.
  checar(multEstagio(9) === multEstagio(6), 'acima de +6 deveria saturar');

  const estagios = ESTAGIOS_ZERADOS();
  const subir = { alvo: 'proprio' as const, stat: 'defesa' as const, estagios: 1 };
  let ultimo: number | null = 0;
  for (let i = 0; i < 6; i++) ultimo = aplicarStatus(estagios, subir);
  checar(ultimo === 6, `seis usos deveriam dar +6, deram ${ultimo}`);
  checar(aplicarStatus(estagios, subir) === null, 'no teto, o golpe deveria avisar que não muda');
  checar(estagios.defesa === 6, 'o estágio passou do limite');

  // O efeito na briga: subir a defesa reduz o dano que chega.
  const atacante = { especie: porId('charmander')!, nivel: 20 };
  const alvoCru = { especie: porId('squirtle')!, nivel: 20 };
  const alvoDuro = {
    especie: porId('squirtle')!,
    nivel: 20,
    estagios: { ataque: 0, defesa: 2, velocidade: 0 },
  };
  const golpe = escolherGolpe(atacante, alvoCru);

  const media = (d: typeof alvoCru) => {
    let soma = 0;
    for (let i = 0; i < 600; i++) soma += calcularDano(atacante, d, golpe).dano;
    return soma / 600;
  };
  const cru = media(alvoCru);
  const duro = media(alvoDuro);
  checar(duro < cru * 0.75, `+2 de defesa mal ajudou: ${cru.toFixed(1)} → ${duro.toFixed(1)}`);
  console.log(`   +2 de defesa: dano de ${cru.toFixed(1)} caiu para ${duro.toFixed(1)}`);

  // E a velocidade muda a CADÊNCIA, não o dano.
  const lento = { especie: porId('snorlax')!, nivel: 20 };
  const rapido = { especie: porId('electrode')!, nivel: 20 };
  checar(
    intervaloDeAtaque(rapido) < intervaloDeAtaque(lento) - 0.5,
    'o rápido deveria atacar bem mais vezes que o lento',
  );
  const comArranque = { ...lento, estagios: { ataque: 0, defesa: 0, velocidade: 2, precisao: 0 } };
  checar(
    intervaloDeAtaque(comArranque) < intervaloDeAtaque(lento),
    'Arranque não encurtou o intervalo',
  );
  console.log(
    `   Snorlax ataca a cada ${intervaloDeAtaque(lento).toFixed(1)}s, ` +
      `Electrode a cada ${intervaloDeAtaque(rapido).toFixed(1)}s`,
  );
}

// ---------------------------------------------------------------------------
console.log('22. quanto tempo você tem para reagir');
{
  // Este teste existe por causa de uma queixa literal: "o dano que o meu poke
  // recebe é muito alto em alguns casos, não dando nem tempo para reação".
  // Ele mede as duas metades dessa frase — quanto dói e de quanto em quanto.

  const meu = porId('charmander')!;
  const nivelMeu = 12;
  const hpMax = statsNoNivel(meu, nivelMeu).hpMax;
  const defensor = { especie: meu, nivel: nivelMeu };

  /** O pior confronto possível, medido numa dificuldade. */
  const pior = (escala: number) => {
    let piorGolpe = 0;
    let acertosMin = Infinity;
    let nome = '';
    for (const especie of ESPECIES) {
      // Um selvagem bem acima do seu nível é o caso que doía.
      const atacante = { especie, nivel: nivelMeu + 8 };
      const golpe = escolherGolpe(atacante, defensor);

      let hp = hpMax;
      let acertos = 0;
      while (hp > 0 && acertos < 200) {
        const levado = danoRecebido(calcularDano(atacante, defensor, golpe).dano, hpMax, escala);
        piorGolpe = Math.max(piorGolpe, levado / hpMax);
        hp -= levado;
        acertos++;
      }
      if (acertos < acertosMin) {
        acertosMin = acertos;
        nome = especie.nome;
      }
    }
    return { piorGolpe, acertos: acertosMin, nome };
  };

  const normal = pior(1);
  checar(
    normal.piorGolpe <= TETO_DANO_RECEBIDO + 1e-9,
    `um golpe tirou ${(normal.piorGolpe * 100).toFixed(0)}% da vida — o teto é ${TETO_DANO_RECEBIDO * 100}%`,
  );
  checar(normal.acertos >= 5, `no pior caso o seu Pokémon cai em ${normal.acertos} acertos`);

  // Agora o tempo: cada acerto custa um ciclo inteiro do inimigo, e o ciclo
  // mais curto possível é o do bicho mais rápido da Pokédex.
  const maisRapido = Math.min(...ESPECIES.map((e) => intervaloDeAtaque({ especie: e, nivel: 20 })));
  for (const perfil of DIFICULDADES) {
    const caso = pior(perfil.danoRecebido);
    const ciclo = maisRapido + perfil.avisoSegundos;
    const segundos = caso.acertos * ciclo;
    checar(
      perfil.avisoSegundos >= 0.8,
      `no ${perfil.nome} o aviso é de ${perfil.avisoSegundos}s — curto demais para reagir`,
    );
    checar(
      segundos > 10,
      `no ${perfil.nome} o pior caso mata em ${segundos.toFixed(0)}s, sem espaço para decidir`,
    );
    console.log(
      `   ${perfil.nome.padEnd(10)} aviso ${perfil.avisoSegundos.toFixed(2)}s · ` +
        `ciclo mín. ${ciclo.toFixed(1)}s · aguenta ${caso.acertos} golpes ≈ ${segundos.toFixed(0)}s`,
    );
  }
  console.log(`   pior confronto: ${normal.nome}`);

  // A dificuldade tem de mexer de verdade no que chega, INCLUSIVE no golpe que
  // encosta no teto — que é exatamente o golpe que incomodava.
  const noTeto = 999;
  const facil = danoRecebido(noTeto, hpMax, DIFICULDADES[0].danoRecebido);
  const duro = danoRecebido(noTeto, hpMax, DIFICULDADES[2].danoRecebido);
  checar(facil < duro, 'a dificuldade não muda o dano recebido no golpe forte');
}

// ---------------------------------------------------------------------------
console.log('23. o arsenal dá o que escolher');
{
  // O arsenal agora vem da tabela de Red/Blue/Yellow, e o que se mede aqui é
  // se ele cumpre o que essa escolha prometeu: ser DE CADA UM e MUDAR com o
  // nível. A regra sintética anterior falhava nas duas coisas — todo bicho de
  // fogo tinha o mesmo par de golpes, do nível 1 ao 60.
  const usados = new Map<string, number>();
  let repetidos = 0;
  let iguaisAoutro = 0;
  let mudaComNivel = 0;
  const assinaturas = new Map<string, string>();

  for (const e of ESPECIES) {
    const noTeto = golpesNoNivel(e, NIVEL_MAXIMO);
    const nomes = new Set(noTeto.map((g) => g.nome));
    if (nomes.size !== noTeto.length) repetidos++;

    const cedo = golpesNoNivel(e, 5).map((g) => g.nome).join(',');
    const tarde = noTeto.map((g) => g.nome).join(',');
    if (cedo !== tarde) mudaComNivel++;

    // Duas espécies com o mesmo arsenal exato são um sinal de que a tabela não
    // está sendo usada. Dezenas colidem de verdade — meio bestiário termina em
    // Batida, Fúria e Investida —, então o teste olha o total, não o caso.
    const anterior = assinaturas.get(tarde);
    if (anterior) iguaisAoutro++;
    else assinaturas.set(tarde, e.id);

    for (const g of golpesDeStatus(noTeto)) usados.set(g.nome, (usados.get(g.nome) ?? 0) + 1);
  }

  checar(repetidos === 0, `${repetidos} espécies com o mesmo golpe duas vezes no arsenal`);
  checar(
    mudaComNivel > ESPECIES.length * 0.7,
    `só ${mudaComNivel} de ${ESPECIES.length} mudam de golpe entre o nível 5 e o teto`,
  );
  checar(
    iguaisAoutro < 32,
    `${iguaisAoutro} espécies têm o arsenal idêntico ao de outra`,
  );
  checar(usados.size >= 10, `só ${usados.size} golpes de status diferentes em uso`);

  console.log(
    `   ${assinaturas.size} arsenais distintos em ${ESPECIES.length} espécies; ` +
      `${mudaComNivel} mudam entre o nível 5 e o 60`,
  );
  console.log(
    `   ${usados.size} golpes de status em uso, os mais comuns: ${[...usados.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([n, q]) => `${n} (${q})`)
      .join(', ')}`,
  );

  // E o dado real, conferido na ponta: o que todo mundo sabe de cor.
  const golpesDe = (id: string, nivel: number) =>
    golpesNoNivel(porId(id)!, nivel).map((g) => g.nome);
  checar(
    !golpesDe('pikachu', 20).includes('Choque do Trovão'),
    'Pikachu de nível 20 não deveria ter Choque do Trovão ainda',
  );
  checar(
    golpesDe('pikachu', 30).includes('Choque do Trovão'),
    'Pikachu de nível 30 deveria ter Choque do Trovão',
  );
  checar(
    golpesDe('charmander', 40).includes('Lança-Chamas'),
    'Charmander de nível 40 deveria ter Lança-Chamas',
  );
  console.log(`   Pikachu N20: ${golpesDe('pikachu', 20).join(', ')}`);
  console.log(`   Pikachu N30: ${golpesDe('pikachu', 30).join(', ')}`);
}

// ---------------------------------------------------------------------------
console.log('24. evoluir é uma escolha');
{
  const dex = new Dex();
  dex.limpar();
  dex.receberInicial('charmander', 5);
  const meu = dex.todos[0];

  checar(evolucaoEm(porId('charmander')!, 5) === null, 'Charmander de nível 5 não evolui');
  checar(
    evolucaoEm(porId('charmander')!, 16)?.id === 'charmeleon',
    'Charmander de nível 16 deveria poder virar Charmeleon',
  );

  // Chegar no nível não evolui sozinho: o jogo pergunta. Aqui se testa a parte
  // que o Dex guarda — a recusa, e até quando ela vale.
  dex.ganharXp(meu, xpParaNivel(16) - meu.xp);
  checar(dex.nivelDe(meu) === 16, `deveria estar no 16, está no ${dex.nivelDe(meu)}`);

  dex.adiarEvolucao(meu);
  checar(meu.recusouEvoluirEm === 16, 'a recusa deveria ficar marcada no nível 16');

  // Subir de nível volta a perguntar: a recusa era daquele nível.
  dex.ganharXp(meu, xpParaNivel(17) - meu.xp);
  checar(
    (meu.recusouEvoluirEm ?? -1) < dex.nivelDe(meu),
    'depois de subir de nível a pergunta deveria voltar',
  );

  // Evoluindo de verdade: a vida atravessa em proporção e a recusa some.
  const antes = dex.hpMaxDe(meu);
  dex.definirHp(meu, Math.round(antes * 0.5));
  dex.evoluir(meu, 'charmeleon');
  checar(meu.id === 'charmeleon', 'a espécie não trocou');
  checar(meu.recusouEvoluirEm === undefined, 'a recusa da espécie antiga sobrou');
  const fracao = meu.hp / dex.hpMaxDe(meu);
  checar(Math.abs(fracao - 0.5) < 0.06, `a vida virou ${(fracao * 100).toFixed(0)}% em vez de 50%`);
  checar(dex.nivelDe(meu) === 17, 'evoluir não pode mexer no nível');

  // A linha inteira, nos níveis certos.
  const linha: string[] = ['charmander'];
  let especie = porId('charmander')!;
  for (let nivel = 1; nivel <= NIVEL_MAXIMO; nivel++) {
    const proxima = evolucaoEm(especie, nivel);
    if (proxima) {
      especie = proxima;
      linha.push(`${proxima.id}@${nivel}`);
    }
  }
  checar(linha.length === 3, `a linha do Charmander tem ${linha.length} estágios`);
  console.log(`   ${linha.join(' → ')}; vida atravessa em proporção`);

  dex.limpar();
}

// ---------------------------------------------------------------------------
console.log('25. a chance de brilhante');
{
  const sozinho = { corrente: 0, amuleto: false };
  checar(
    Math.abs(chanceShiny(sozinho) - CHANCE_SHINY_BASE) < 1e-12,
    'sem corrente e sem amuleto, a chance deveria ser a base',
  );

  // A corrente só melhora, e nunca passa do teto.
  let anterior = chanceShiny(sozinho);
  for (let c = 1; c <= 60; c++) {
    const agora = chanceShiny({ corrente: c, amuleto: false });
    checar(agora >= anterior - 1e-12, `a corrente de ${c} piorou a chance`);
    checar(agora <= CHANCE_SHINY_MAXIMA + 1e-12, `a corrente de ${c} passou do teto`);
    anterior = agora;
  }

  const comAmuleto = chanceShiny({ corrente: 0, amuleto: true });
  checar(comAmuleto > CHANCE_SHINY_BASE * 3, 'o Amuleto Brilhante quase não ajudou');

  for (const c of [0, 5, 10, 20, 40]) {
    const sem = chanceShiny({ corrente: c, amuleto: false });
    const com = chanceShiny({ corrente: c, amuleto: true });
    console.log(
      `   corrente ${String(c).padStart(2)}: ${textoChanceShiny(sem).padEnd(9)}` +
        ` · com amuleto ${textoChanceShiny(com)}`,
    );
  }

  // A corrente conta encontros SEGUIDOS da mesma espécie, e espécie diferente
  // recomeça do um.
  const dex = new Dex();
  dex.limpar();
  for (let i = 0; i < 5; i++) dex.encadear('rattata');
  checar(dex.corrente === 5, `cinco encontros deveriam dar corrente 5, deram ${dex.corrente}`);
  checar(dex.especieDaCorrente === 'rattata', 'a espécie da corrente está errada');
  checar(dex.encadear('pidgey') === 1, 'espécie diferente deveria recomeçar do um');
  checar(dex.corrente === 1, 'a corrente não recomeçou');

  // O que isso vale na prática: quantos encontros até o primeiro brilhante.
  const esperados = (chance: number) => Math.round(1 / chance);
  const semCadeia = esperados(chanceShiny({ corrente: 0, amuleto: false }));
  const comCadeia = esperados(chanceShiny({ corrente: 40, amuleto: true }));
  checar(comCadeia * 4 < semCadeia, 'caçar em cadeia mal encurta a espera');
  console.log(`   esperar sozinho: ~${semCadeia} encontros; caçando em cadeia: ~${comCadeia}`);

  // E TODAS as 151 podem ser brilhantes — as 90 sem modelo alternativo ganham
  // a pintura de src/modelos.ts.
  let impossiveis = 0;
  for (const e of ESPECIES) {
    let saiu = false;
    for (let i = 0; i < 4000 && !saiu; i++) {
      if (sortearShiny(e, { corrente: 30, amuleto: true })) saiu = true;
    }
    if (!saiu) impossiveis++;
  }
  checar(impossiveis === 0, `${impossiveis} espécies nunca conseguem ser brilhantes`);
  const comModelo = ESPECIES.filter((e) => e.temShiny).length;
  console.log(
    `   as ${ESPECIES.length} podem ser brilhantes: ${comModelo} com modelo próprio, ` +
      `${ESPECIES.length - comModelo} pintadas em tempo de execução`,
  );

  dex.limpar();
}

// ---------------------------------------------------------------------------
console.log('26. cada golpe tem o seu gesto');
{
  // O que se confere aqui é o CASAMENTO entre o nome do golpe e o movimento do
  // corpo. Uma Lambida que dá cabeçada e um Lança-Chamas que dá arranhão passam
  // por tsc e pelo smoke sem um pio, e só aparecem com o headset na cabeça.
  const gestoDe = (chave: string) => GOLPES_DEX[chave]?.animacao;

  const esperado: Array<[string, string]> = [
    ['lick', 'mordida'],
    ['bite', 'mordida'],
    ['hyper-fang', 'mordida'],
    ['scratch', 'garra'],
    ['slash', 'garra'],
    ['fury-swipes', 'garra'],
    ['tail-whip', 'cauda'],
    ['wrap', 'cauda'],
    ['mega-punch', 'soco'],
    ['thunder-punch', 'soco'],
    ['jump-kick', 'salto'],
    ['stomp', 'salto'],
    ['tackle', 'investida'],
    ['headbutt', 'investida'],
    ['flamethrower', 'sopro'],
    ['water-gun', 'sopro'],
    ['thunderbolt', 'sopro'],
    ['ice-beam', 'sopro'],
    ['growl', 'aura'],
    ['harden', 'aura'],
  ];

  for (const [chave, gesto] of esperado) {
    checar(gestoDe(chave) === gesto, `${chave} deveria ser '${gesto}', é '${gestoDe(chave)}'`);
  }

  // Todo golpe tem gesto, e todo gesto é um dos que src/anima.ts sabe desenhar.
  let semGesto = 0;
  let desconhecido = 0;
  const usados = new Map<string, number>();
  for (const chave of Object.keys(GOLPES_DEX)) {
    const g = GOLPES_DEX[chave].animacao;
    if (!g) semGesto++;
    else if (!ATAQUES.has(g)) desconhecido++;
    else usados.set(g, (usados.get(g) ?? 0) + 1);
  }
  checar(semGesto === 0, `${semGesto} golpes sem gesto`);
  checar(desconhecido === 0, `${desconhecido} golpes com gesto que o animador não conhece`);
  // Se quase tudo caísse no padrão, a classificação não estaria valendo nada.
  checar(usados.size >= 6, `só ${usados.size} gestos diferentes em uso`);
  console.log(
    `   ${[...usados.entries()].sort((a, b) => b[1] - a[1]).map(([g, q]) => `${g} ${q}`).join(' · ')}`,
  );

  // E o gesto de fato move osso diferente: mordida mexe a mandíbula, cauda mexe
  // a cauda, soco mexe o antebraço. Poses que não se distinguem não servem.
  const nomes = [
    'Hips', 'Spine1', 'Spine2', 'Neck', 'Head', 'Jaw',
    'LShoulder', 'LArm', 'LForeArm', 'LHand', 'RShoulder', 'RArm', 'RForeArm', 'RHand',
    'LThigh', 'LLeg', 'LFoot', 'RThigh', 'RLeg', 'RFoot', 'Tail1', 'Tail2', 'Tail3',
  ];

  /**
   * Quanto cada osso girou, no pico do gesto.
   *
   * ## Terceira armadilha: o acaso do ócio
   *
   * A linha de base abaixo conserta a FASE do balanço ocioso, mas não o acaso
   * dele. `src/anima.ts` sorteia em `Math.random()` a fase inicial e o instante
   * da próxima variação de ócio — o bicho olha em volta ou acena sozinho de
   * tempos em tempos, que é o que o faz parecer vivo. Um aceno espontâneo
   * caindo dentro da janela da BASE infla a base, e a subtração leva junto o
   * gesto que se queria medir: a chicotada saía de 4° a 21° entre execuções da
   * mesma versão do código, e foi assim que um deploy caiu sem nada ter
   * quebrado.
   *
   * Então aqui o acaso é preso. Não no jogo — lá ele é o ponto — mas nesta
   * medição, que precisa dar o mesmo número duas vezes seguidas para poder
   * dizer alguma coisa. Restaurado logo depois, porque os testes de brilhante e
   * de spawn contam com aleatoriedade de verdade.
   */
  const poseDe = (gesto: GestoDeAtaque) => {
    const sorteioReal = Math.random;
    // PRNG minúsculo e determinístico (mulberry32), com a mesma semente a cada
    // chamada: os dois `poseDe` de uma comparação veem exatamente o mesmo ócio.
    let semente = 0x9e3779b9;
    Math.random = () => {
      semente = (semente + 0x6d2b79f5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      return medirPose(gesto);
    } finally {
      Math.random = sorteioReal;
    }
  };

  const medirPose = (gesto: GestoDeAtaque) => {
    const { corpo, porNome, repousos } = esqueletoDe(nomes, 0.6);
    const animador = new Animador(corpo);
    const ctx = { velocidade: 0, alarme: 0, vida: 1, encarar: 0, desmaiado: false };
    for (let i = 0; i < 60; i++) animador.atualizar(1 / 72, ctx);

    /** O maior desvio de cada osso ao longo de um segundo de animação. */
    const picoEm = (quadros: number) => {
      const maiores = new Map<string, number>();
      for (let i = 0; i < quadros; i++) {
        animador.atualizar(1 / 72, ctx);
        for (const nome of nomes) {
          const osso = porNome.get(nome)!;
          const repouso = repousos.get(nome)!;
          const desvio = Math.abs(osso.quaternion.angleTo(repouso));
          if (desvio > (maiores.get(nome) ?? 0)) maiores.set(nome, desvio);
        }
      }
      return maiores;
    };

    // O PICO do gesto, DESCONTADO o que o ocioso já fazia sozinho.
    //
    // Duas armadilhas, uma de cada vez. A medição era num quadro fixo (o 43), e
    // a verificação era INTERMITENTE: o ocioso balança a cauda sozinho, os
    // sessenta quadros de aquecimento acima param numa fase qualquer dele, e
    // conforme a fase a chicotada era medida enquanto a cauda já voltava — o
    // número caía de 30° para 8° e o teste falhava sem nada ter mudado no jogo.
    // Isso custou duas caçadas a uma regressão que não existia.
    //
    // Trocar para o pico ao longo do gesto conserta a fase e cria a segunda
    // armadilha: o balanço ocioso entra no pico de TODOS os gestos, inclusive
    // no da mordida, e "a cauda se move mais na chicotada do que na mordida"
    // deixa de ser verdade por diluição. Daí a linha de base — um segundo de
    // ocioso puro, medido no mesmo bicho e na mesma fase — subtraída do pico
    // com o gesto. O que sobra é o gesto, que é o que estas frases querem dizer.
    const ocioso = picoEm(72);
    animador.disparar(gesto, 1);
    const comGesto = picoEm(72);

    const desvios = new Map<string, number>();
    for (const nome of nomes) {
      desvios.set(nome, Math.max(0, (comGesto.get(nome) ?? 0) - (ocioso.get(nome) ?? 0)));
    }
    return desvios;
  };

  const mordida = poseDe('mordida');
  const cauda = poseDe('cauda');
  const soco = poseDe('soco');
  const sopro = poseDe('sopro');

  checar(mordida.get('Jaw')! > 0.3, `a mordida mal abriu a boca (${mordida.get('Jaw')!.toFixed(2)})`);
  checar(
    cauda.get('Tail3')! > mordida.get('Tail3')! * 1.5,
    'a chicotada de cauda não move a cauda mais do que uma mordida',
  );
  checar(
    soco.get('RForeArm')! > cauda.get('RForeArm')! * 1.5,
    'o soco não move o antebraço mais do que uma chicotada',
  );
  checar(sopro.get('Jaw')! > 0.3, 'o sopro deveria abrir a boca para despejar');

  // Duas poses distintas não podem ser a mesma pose.
  const distancia = (a: Map<string, number>, b: Map<string, number>) =>
    nomes.reduce((s, n) => s + Math.abs((a.get(n) ?? 0) - (b.get(n) ?? 0)), 0);
  for (const [nomeA, a, nomeB, b] of [
    ['mordida', mordida, 'cauda', cauda],
    ['mordida', mordida, 'soco', soco],
    ['cauda', cauda, 'sopro', sopro],
  ] as Array<[string, Map<string, number>, string, Map<string, number>]>) {
    checar(distancia(a, b) > 0.8, `${nomeA} e ${nomeB} são quase a mesma pose`);
  }

  console.log(
    `   mordida abre a mandíbula ${(mordida.get('Jaw')! * 57.3).toFixed(0)}°, ` +
      `a chicotada leva a ponta da cauda a ${(cauda.get('Tail3')! * 57.3).toFixed(0)}°, ` +
      `o soco estica o antebraço ${(soco.get('RForeArm')! * 57.3).toFixed(0)}°`,
  );
}

// ---------------------------------------------------------------------------
console.log('27. mandado ficar, ele fica');
{
  // A queixa que originou isto: "quando eu mando o Pokémon ir até um lugar ele
  // não fica, ele sempre volta". E voltava mesmo — chegando ao destino, o
  // companheiro caía na regra de andar ao lado do treinador e dava meia-volta.
  const especie = porId('charmander')!;
  const parceiro = nascer(especie, 'companheiro', 12, 7);
  parceiro.raiz.position.set(0, 0, -1);
  parceiro.estado = 'ocioso';

  const marca = new THREE.Vector3(2.4, 0, -2.4);
  parceiro.irPara(marca);
  checar(parceiro.indoParaAlgumLugar, 'a ordem de ir não pegou');

  for (let i = 0; i < 72 * 14; i++) parceiro.atualizar(1 / 72, JOGADOR);
  const naMarca = Math.hypot(parceiro.raiz.position.x - marca.x, parceiro.raiz.position.z - marca.z);
  checar(naMarca < 0.6, `parou a ${naMarca.toFixed(2)} m da marca`);
  checar(parceiro.ficandoNoPosto, 'chegou mas não assumiu o posto');

  // Trinta segundos depois, com você parado longe: ele continua lá.
  const aoChegar = parceiro.raiz.position.clone();
  for (let i = 0; i < 72 * 30; i++) parceiro.atualizar(1 / 72, JOGADOR);
  const vagou = Math.hypot(
    parceiro.raiz.position.x - aoChegar.x,
    parceiro.raiz.position.z - aoChegar.z,
  );
  const doJogador = Math.hypot(
    parceiro.raiz.position.x - JOGADOR.x,
    parceiro.raiz.position.z - JOGADOR.z,
  );
  checar(vagou < 0.6, `saiu ${vagou.toFixed(2)} m do posto sem ninguém mandar`);
  checar(doJogador > 2, `voltou para o treinador: está a ${doJogador.toFixed(2)} m dele`);

  // Chamar desfaz a ordem — é a única coisa que desfaz, fora um novo comando.
  parceiro.chamarPara(JOGADOR);
  checar(!parceiro.ficandoNoPosto, 'chamado de volta, ele continuou preso ao posto');
  for (let i = 0; i < 72 * 12; i++) parceiro.atualizar(1 / 72, JOGADOR);
  const depoisDeChamar = Math.hypot(
    parceiro.raiz.position.x - JOGADOR.x,
    parceiro.raiz.position.z - JOGADOR.z,
  );
  checar(depoisDeChamar < 2, `chamado, parou a ${depoisDeChamar.toFixed(2)} m`);

  console.log(
    `   foi até a marca, ficou ${vagou.toFixed(2)} m em volta dela por 30 s e voltou quando chamado`,
  );
}

// ---------------------------------------------------------------------------
console.log('28. tamanho real');
{
  // Com o tamanho real ligado o jogo instancia o modelo na altura da Pokédex,
  // e as distâncias pessoais do bicho acompanham o corpo — senão um Onix de
  // 8,8 m tentaria parar a 80 cm do treinador, ou seja, dentro dele.
  const onix = porId('onix')!;
  const diglett = porId('diglett')!;
  checar(onix.alturaReal > 8, `Onix não tem a altura da Pokédex (${onix.alturaReal} m)`);
  checar(onix.altura < 1.2, 'a altura comprimida deixou de ser comprimida');

  const gigante = new Pokemon(
    onix,
    corpoFalso(onix.alturaReal),
    new THREE.Vector3(0, 0, -6),
    0,
    'companheiro',
    30,
    false,
    11,
  );
  gigante.estado = 'ocioso';
  for (let i = 0; i < 72 * 20; i++) gigante.atualizar(1 / 72, JOGADOR);
  const perto = Math.hypot(gigante.raiz.position.x - JOGADOR.x, gigante.raiz.position.z - JOGADOR.z);
  checar(finito(gigante.raiz.position), 'a posição do gigante virou NaN');
  checar(perto > 1.5, `o Onix inteiro parou a ${perto.toFixed(2)} m — ele mede ${onix.alturaReal} m`);

  const pequeno = new Pokemon(
    diglett,
    corpoFalso(diglett.alturaReal),
    new THREE.Vector3(0, 0, -2),
    0,
    'companheiro',
    10,
    false,
    12,
  );
  pequeno.estado = 'ocioso';
  for (let i = 0; i < 72 * 20; i++) pequeno.atualizar(1 / 72, JOGADOR);
  const pertinho = Math.hypot(
    pequeno.raiz.position.x - JOGADOR.x,
    pequeno.raiz.position.z - JOGADOR.z,
  );
  checar(pertinho < 2, `o Diglett ficou longe demais (${pertinho.toFixed(2)} m) para o tamanho dele`);

  console.log(
    `   Onix ${onix.alturaReal} m para a ${perto.toFixed(1)} m; ` +
      `Diglett ${diglett.alturaReal} m para a ${pertinho.toFixed(1)} m`,
  );
}

console.log('29. as pedras de evolução');
{
  // Os dezesseis pares existem de verdade. Um id errado aqui não quebraria
  // nada: a pedra só não funcionaria naquele bicho, calada, e ninguém
  // descobriria sem ter o Pokémon e a pedra na mão ao mesmo tempo.
  let pares = 0;
  for (const pedra of PEDRAS) {
    for (const [de, para] of Object.entries(pedra.evolucoes)) {
      checar(porId(de) !== undefined, `${pedra.nome}: ${de} não está na Pokédex`);
      checar(porId(para) !== undefined, `${pedra.nome}: ${para} não está na Pokédex`);
      pares++;
    }
  }

  // Quem depende de pedra NÃO evolui por nível, nem no teto. É o ponto todo:
  // a tabela gerada dá a essas espécies um nível 28 inventado, e deixá-lo valer
  // faria o Pikachu virar Raichu sozinho — o que esvazia a Pedra do Trovão.
  for (const id of EVOLUI_SO_COM_PEDRA) {
    const especie = porId(id);
    if (!especie) continue;
    checar(
      evolucaoEm(especie, 100) === null,
      `${especie.nome} ainda evolui por nível, e devia esperar a pedra`,
    );
  }

  // E as pedras funcionam neles.
  checar(evolucaoDaPedra('pedra-trovao', porId('pikachu')!)?.id === 'raichu', 'a Pedra do Trovão devia virar o Pikachu em Raichu');
  checar(evolucaoDaPedra('pedra-fogo', porId('pikachu')!) === null, 'a Pedra do Fogo não devia fazer nada com o Pikachu');

  // O Eevee é o caso que justifica as pedras existirem: oito pedras, oito
  // bichos diferentes, e a escolha é irreversível. Cinco desses oito são
  // convidados de fora de Kanto — ver src/pedras.ts.
  const eevee = porId('eevee')!;
  const PEDRAS_DO_EEVEE = [
    'pedra-agua',
    'pedra-trovao',
    'pedra-fogo',
    'pedra-folha',
    'pedra-lua',
    'pedra-sol',
    'pedra-gelo',
    'pedra-fada',
  ];
  const caminhos = PEDRAS_DO_EEVEE.map((p) => evolucaoDaPedra(p, eevee)?.id);
  checar(
    new Set(caminhos).size === PEDRAS_DO_EEVEE.length && !caminhos.includes(undefined),
    `o Eevee devia ter ${PEDRAS_DO_EEVEE.length} destinos distintos, tem ${caminhos.join(', ')}`,
  );

  // Toda pedra tem de servir para alguém, senão é um item que só ocupa espaço
  // na mochila — e a mochila é do tamanho de um selo no pulso.
  for (const pedra of PEDRAS) {
    checar(
      Object.keys(pedra.evolucoes).length > 0,
      `${pedra.nome} não evolui ninguém`,
    );
  }

  // As convidadas entraram para ser ponta de linha, não para povoar a sala.
  for (const e of ESPECIES.filter((x) => x.convidada)) {
    checar(pesoSpawn(e, false, 40) === 0, `${e.nome} é convidada e não devia nascer selvagem`);
  }

  // O golpe acerta alguém — item 2.1 do roteiro.
  //
  // O hit-stop é a ausência de movimento, e ausência é o tipo de coisa que se
  // implementa achando que funcionou. Aqui a pausa é afirmada pelo que ela
  // impede: durante ela, nem a posição nem o relógio interno do bicho andam.
  {
    const especie = porId('charmander')!;
    const parado = new Pokemon(especie, corpoFalso(0.6), new THREE.Vector3(0, 0, -1), 0, 'selvagem', 10);
    const jogador = new THREE.Vector3(0, 1.6, 0);

    // Fora da pausa ele anda: é o que dá sentido ao teste seguinte.
    for (let i = 0; i < 90; i++) parado.atualizar(1 / 90, jogador);
    const antesDaPausa = parado.raiz.position.clone();

    parado.congelar(0.08);
    const naPausa = parado.raiz.position.clone();
    for (let i = 0; i < 7; i++) parado.atualizar(1 / 90, jogador);
    checar(
      parado.raiz.position.distanceTo(naPausa) < 1e-9,
      'o hit-stop devia parar o bicho, e ele andou durante a pausa',
    );

    // E ela ACABA. Uma pausa que não termina é um bicho travado para sempre.
    for (let i = 0; i < 90; i++) parado.atualizar(1 / 90, jogador);
    checar(
      parado.raiz.position.distanceTo(naPausa) > 1e-6 ||
        antesDaPausa.distanceTo(naPausa) < 1e-9,
      'o hit-stop não devolveu o controle ao bicho depois do tempo',
    );

    // O empurrão afasta de quem bateu, no plano do chão, e se gasta sozinho.
    const levou = new Pokemon(especie, corpoFalso(0.6), new THREE.Vector3(0, 0, -1), 0, 'selvagem', 10);
    const bateu = new THREE.Vector3(0, 0, 0);
    const antes = levou.raiz.position.clone();
    levou.empurrar(bateu, 0.2);
    for (let i = 0; i < 6; i++) levou.atualizar(1 / 90, jogador);
    const depois = levou.raiz.position;
    checar(
      depois.distanceTo(bateu) > antes.distanceTo(bateu),
      'o empurrão devia afastar o alvo de quem bateu, e ele ficou mais perto',
    );
    checar(Math.abs(depois.y - antes.y) < 1e-6, 'o empurrão não devia levantar o alvo do chão');

    console.log(
      `   hit-stop segura o bicho por ${(0.08 * 1000).toFixed(0)} ms; ` +
        `empurrão de 20 cm afasta ${(depois.distanceTo(antes) * 100).toFixed(1)} cm em 6 quadros`,
    );
  }

  // A medição da pose desenhada, que é o que planta o bicho no chão e no eixo.
  //
  // Este teste existe porque a falta dele custou caro: `applyBoneTransform` no
  // three r155+ transforma o vetor que RECEBE — é entrada e saída —, e chamá-lo
  // com um vetor vazio devolve zero. A caixa colapsava num ponto, a escala
  // virava `alturaAlvo ÷ 1e-6`, e Pikachu e Eevee viravam paredes gigantes com
  // o jogador dentro. No headset isso se lê como "o bicho sumiu", e nenhuma
  // verificação de lógica via nada errado.
  //
  // O que se afirma aqui é o contrato: a caixa sai em unidades do MODELO, não
  // importa a escala em que o bicho esteja no quarto (ele nasce em 0,001 e
  // cresce), e acompanha o osso quando a pose muda.
  {
    const geo = new THREE.BoxGeometry(1, 2, 1, 1, 4, 1);
    const n = geo.attributes.position.count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    geo.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(
        Float32Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      ),
    );

    const montar = (escalaDoAjuste: number, escalaDaRaiz: number) => {
      const osso = new THREE.Bone();
      const malha = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
      const cena = new THREE.Group();
      cena.add(osso, malha);
      cena.updateMatrixWorld(true);
      malha.bind(new THREE.Skeleton([osso]));

      const giro = new THREE.Group();
      giro.add(cena);
      const desloca = new THREE.Group();
      desloca.position.set(0, -1, 0);
      desloca.add(giro);
      const ajuste = new THREE.Group();
      ajuste.scale.setScalar(escalaDoAjuste);
      ajuste.add(desloca);
      const raiz = new THREE.Group();
      raiz.add(ajuste);
      raiz.scale.setScalar(escalaDaRaiz);
      raiz.position.set(3, 1, -2);
      raiz.updateMatrixWorld(true);
      return { raiz, desloca, cena, osso };
    };

    for (const [ajuste, daRaiz] of [[1, 1], [0.2, 1], [0.2, 0.001], [0.001, 0.001]]) {
      const h = montar(ajuste, daRaiz);
      const tam = caixaDaPose(h.cena, h.desloca).getSize(new THREE.Vector3());
      checar(
        Math.abs(tam.y - 2) < 1e-3 && Math.abs(tam.x - 1) < 1e-3,
        `a caixa da pose devia ser 1×2×1 em unidades do modelo; com ajuste=${ajuste} e raiz=${daRaiz} deu ` +
          `${tam.x.toFixed(3)}×${tam.y.toFixed(3)}×${tam.z.toFixed(3)}`,
      );
    }

    // E ela SEGUE o osso: é para isso que ela mede o skinning em vez da
    // geometria crua, que ficaria parada na pose de bind.
    const movido = montar(0.2, 1);
    movido.osso.position.set(0, 5, 0);
    movido.raiz.updateMatrixWorld(true);
    const caixa = caixaDaPose(movido.cena, movido.desloca);
    checar(
      Math.abs(caixa.min.y - 4) < 1e-3 && Math.abs(caixa.max.y - 6) < 1e-3,
      `com o osso 5 acima, a caixa devia ir de 4 a 6 em Y; foi de ${caixa.min.y.toFixed(2)} a ${caixa.max.y.toFixed(2)}`,
    );
    console.log('   caixa da pose: 1×2×1 em qualquer escala, e segue o osso');
  }

  // O afeto: a carícia que passou a valer alguma coisa.
  //
  // O que se afirma aqui é o efeito que vira CENA — aguentar o golpe que
  // derrubaria. Os outros dois (crítico e pressa na condição) são graus; este é
  // binário, e é o único que o jogador conta para alguém depois.
  {
    const especie = porId('charmander')!;
    const jogador = new THREE.Vector3(0, 1.6, 0);

    const comAfeto = (afeto: number) => {
      const p = new Pokemon(especie, corpoFalso(0.6), new THREE.Vector3(0, 0, -1), 0, 'companheiro', 20);
      p.afeto = afeto;
      return p;
    };

    // Sem afeto, o golpe fatal derruba.
    const frio = comAfeto(0);
    frio.receberDano(frio.hpMax * 10);
    checar(frio.hp === 0, 'sem afeto, o golpe fatal devia derrubar');

    // Com afeto, ele fica com um ponto de vida — uma vez.
    const querido = comAfeto(1);
    querido.receberDano(querido.hpMax * 10);
    checar(querido.hp === 1, 'com afeto alto, ele devia aguentar com 1 de vida');
    checar(querido.aguentou, 'o jogo precisa saber que ele aguentou, para mostrar o momento');
    querido.aguentou = false;
    querido.receberDano(querido.hpMax * 10);
    checar(querido.hp === 0, 'aguentar é UMA vez por ida a campo, senão vira regra e não momento');

    // Aguentar exige estar de pé: com 1 de vida já não é um momento.
    const quaseCaindo = comAfeto(1);
    quaseCaindo.hp = 1;
    quaseCaindo.receberDano(50);
    checar(quaseCaindo.hp === 0, 'com 1 de vida não há o que aguentar');

    // E vale só para o SEU: um selvagem que se recusa a cair viraria loteria.
    const selvagem = new Pokemon(especie, corpoFalso(0.6), new THREE.Vector3(0, 0, -1), 0, 'selvagem', 20);
    selvagem.afeto = 1;
    selvagem.receberDano(selvagem.hpMax * 10);
    checar(selvagem.hp === 0, 'o afeto não pode impedir a captura de um selvagem');

    // A condição some mais rápido em quem gosta de você.
    const medir = (afeto: number) => {
      const p = comAfeto(afeto);
      p.aplicarCondicao('paralisia');
      let t = 0;
      while (p.condicao && t < 60) {
        p.atualizar(1 / 60, jogador);
        t += 1 / 60;
      }
      return t;
    };
    const semAfeto = medir(0);
    const comCarinho = medir(1);
    checar(comCarinho < semAfeto * 0.8, 'o afeto devia encurtar a condição de forma sentida');

    console.log(
      `   afeto: aguenta o golpe fatal uma vez, e a paralisia cai de ${semAfeto.toFixed(1)}s para ${comCarinho.toFixed(1)}s`,
    );
  }

  // A ajuda de mira do arremesso: o que ela perdoa, e o que não.
  //
  // O arremesso era balístico puro — a velocidade da sua mão, gravidade e boa
  // sorte —, e em VR isso quer dizer um braço humano tentando acertar um bicho
  // de vinte centímetros a três metros com um controle que não tem o peso de
  // uma bola. Errar custa uma bola rolando para debaixo do sofá.
  //
  // A afirmação é uma faixa, e ela tem os DOIS lados: sem o lado de cima isto
  // aqui seria mira automática, e o jogador deixaria de ser quem acertou.
  {
    // Um arremesso de verdade: bicho a 3 m à frente, um pouco abaixo da mão.
    const alvo = new THREE.Vector3(0, 0.45, -3);
    const mao = new THREE.Vector3(0, 1.35, 0);

    /** Simula o voo e devolve a menor distância a que a bola passou do alvo. */
    const arremessar = (erroGraus: number, ajuda: boolean) => {
      const para = new THREE.Vector3().subVectors(alvo, mao);
      const tempo = 0.62;
      // Velocidade balística que acerta em cheio no tempo dado, depois girada
      // pelo erro: é assim que se isola a pontaria do resto.
      const v = para
        .clone()
        .divideScalar(tempo)
        .add(new THREE.Vector3(0, (9.81 * tempo) / 2, 0));
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(erroGraus));

      const p = mao.clone();
      let perto = Infinity;
      const dt = 1 / 90;
      for (let i = 0; i < 90 * 2; i++) {
        if (ajuda) corrigirRumo(v, p, alvo, dt);
        v.y += -9.81 * dt;
        p.addScaledVector(v, dt);
        perto = Math.min(perto, p.distanceTo(alvo));
        if (p.y < 0) break;
      }
      return perto;
    };

    // Um bicho pequeno: acertar é passar a menos de 22 cm do centro dele.
    const ACERTO = 0.22;

    checar(arremessar(0, true) < 0.05, 'o arremesso em cheio tem de continuar em cheio');
    checar(arremessar(0, false) < 0.05, 'e sem ajuda também — a simulação precisa estar certa');

    // O de raspão vira acerto.
    checar(arremessar(9, false) > ACERTO, 'a 9° de erro, sem ajuda, passava longe');
    checar(arremessar(9, true) < ACERTO, 'a 9° de erro a ajuda tinha de resolver');

    // E o arremesso que foi para outro lugar continua indo para outro lugar.
    for (const g of [22, 30, 45]) {
      checar(arremessar(g, true) > ACERTO, `a ${g}° a bola não pode fazer a curva — vira teleguiada`);
    }

    // A fronteira, medida e não estimada.
    let maiorPerdoado = 0;
    for (let g = 0; g <= 40; g += 0.5) if (arremessar(g, true) < ACERTO) maiorPerdoado = g;
    const semAjuda = (() => {
      let m = 0;
      for (let g = 0; g <= 40; g += 0.5) if (arremessar(g, false) < ACERTO) m = g;
      return m;
    })();
    checar(maiorPerdoado > semAjuda, 'a ajuda tem de ajudar');
    checar(maiorPerdoado < 20, 'perdoar mais de 20° já não é o seu arremesso');

    // Para os dois lados, e sem mexer na altura — que é o que preserva o arco.
    //
    // Esta é a asserção que derrubou a primeira versão, que mirava o vetor em
    // três dimensões: num tiro balístico a velocidade nunca aponta para o alvo
    // (aponta acima na saída e abaixo na chegada), então perseguir a linha reta
    // achata a parábola e faz o arremesso PERFEITO errar.
    for (const sinal of [1, -1]) {
      const v = new THREE.Vector3(0, 2.4, -6);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), sinal * THREE.MathUtils.degToRad(8));
      const alturaAntes = v.y;
      const rapidezHAntes = Math.hypot(v.x, v.z);
      const mexeu = corrigirRumo(v, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -3), 1 / 90);
      checar(mexeu, 'a 8° a ajuda devia agir dos dois lados');
      checar(v.y === alturaAntes, 'a correção não pode mexer na altura do arremesso');
      checar(
        Math.abs(Math.hypot(v.x, v.z) - rapidezHAntes) < 1e-6,
        'nem na força com que ele foi para a frente',
      );
      // E ela vai para o lado CERTO: o erro depois tem de ser menor.
      const depois = Math.abs(
        Math.atan2(v.x, -v.z) - 0,
      );
      checar(depois < THREE.MathUtils.degToRad(8), 'a correção foi para o lado errado');
    }

    console.log(
      `   mira do arremesso: perdoa até ${maiorPerdoado.toFixed(1)}° (eram ${semAjuda.toFixed(1)}°) e ignora acima de 14°`,
    );
  }

  // As fichas da Pokédex: todas dizem alguma coisa.
  //
  // A ficha é o prêmio de ter capturado — ela só aparece depois de o bicho ser
  // seu. Por isso 54 das 156 estarem assim era pior do que parecia:
  //
  //     Metapod · Casulo · 0,7 m · 9,9 kg
  //     Casulo. 0,7 m, 9,9 kg.
  //
  // A segunda linha repetia a primeira, palavra por palavra. E o padrão de
  // quem faltava conta a história: eram quase todas EVOLUÇÕES — quem escreveu a
  // tabela cobriu os básicos e parou. Ou seja, justo o bicho que você mais
  // lutou para ter era o que não tinha o que dizer.
  //
  // Isto aqui existe para que a próxima espécie que entrar não passe batida: o
  // gerador preenche com a ficha técnica quando não acha texto escrito, e um
  // preenchimento silencioso é exatamente o tipo de buraco que ninguém vê.
  {
    // "Casulo. 0,7 m, 9,9 kg." — gênero, altura e peso, que a linha de cima da
    // ficha já mostra.
    const soAFichaTecnica = /^[^.]{1,30}\.\s*\d+[,.]\d+\s*m,\s*\d+[,.]\d+\s*kg\.?$/;

    let menor = Infinity;
    let curta = '';
    for (const e of ESPECIES) {
      checar(
        !soAFichaTecnica.test(e.descricao),
        `a ficha de ${e.nome} só repete altura e peso: "${e.descricao}"`,
      );
      checar(e.descricao.length >= 24, `a ficha de ${e.nome} é curta demais para dizer algo`);
      // Duas linhas de ~78 caracteres na placa da ficha. Acima disso o canvas
      // corta, e ninguém vê o fim da frase.
      checar(e.descricao.length <= 150, `a ficha de ${e.nome} não cabe na placa`);
      // O nome da própria espécie na ficha dela é sinal de texto de catálogo
      // ("Ivysaur é a evolução de Bulbasaur"), não de ficha.
      checar(
        !e.descricao.includes(e.nome),
        `a ficha de ${e.nome} fala dele na terceira pessoa pelo nome`,
      );
      if (e.descricao.length < menor) {
        menor = e.descricao.length;
        curta = e.nome;
      }
    }

    const media = ESPECIES.reduce((s, e) => s + e.descricao.length, 0) / ESPECIES.length;
    console.log(
      `   fichas: ${ESPECIES.length} escritas, média de ${media.toFixed(0)} caracteres · a mais curta é a de ${curta} (${menor})`,
    );
  }

  // O ciclo de dia e noite.
  //
  // O sorteio de quem nasce só olhava para dentro do save — mesma população às
  // sete da manhã e às onze da noite. Agora o relógio do aparelho entra, e o
  // que se afirma aqui é que ele entra sem trancar nada.
  {
    const as = (h: number) => {
      const d = new Date(2026, 8, 18, h, 0, 0);
      return noturnidade(d);
    };

    checar(as(12) < 0.05, 'meio-dia tem de ser dia cheio');
    checar(as(0) > 0.95, 'meia-noite tem de ser noite cheia');
    checar(as(22) > 0.8 && as(3) > 0.8, 'dez da noite e três da manhã são noite');
    checar(as(9) < 0.2 && as(14) < 0.2, 'nove e quatorze são dia');

    // Contínua: nenhum salto de população no meio da sessão.
    let maiorSalto = 0;
    for (let m = 0; m < 24 * 60; m++) {
      const a = noturnidade(new Date(2026, 8, 18, Math.floor(m / 60), m % 60));
      const b = noturnidade(new Date(2026, 8, 18, Math.floor(((m + 1) % 1440) / 60), (m + 1) % 60));
      maiorSalto = Math.max(maiorSalto, Math.abs(b - a));
    }
    checar(maiorSalto < 0.01, `a curva salta ${maiorSalto.toFixed(3)} num minuto — isso é um degrau`);

    // Todo id das listas de hábito existe de verdade. Um erro de digitação aqui
    // seria um bicho que nunca fica mais comum em hora nenhuma, e nada avisaria.
    const conhecidos = new Set(ESPECIES.map((e) => e.id));
    let noturnos = 0;
    let diurnos = 0;
    for (const e of ESPECIES) {
      const h = habitoDe(e.id);
      if (h === 'noturno') noturnos++;
      if (h === 'diurno') diurnos++;
    }
    for (const id of ['zubat', 'gengar', 'oddish', 'pidgey', 'caterpie', 'bulbasaur']) {
      checar(conhecidos.has(id), `${id} tinha de existir na Pokédex`);
      checar(habitoDe(id) !== 'indiferente', `${id} devia ter hábito`);
    }
    checar(noturnos >= 10 && diurnos >= 10, 'as duas listas precisam ter gente');
    checar(
      noturnos + diurnos < ESPECIES.length * 0.4,
      'a maioria dos 151 aparece a qualquer hora; opinar sobre todos seria invenção',
    );

    // Nunca zero: quem só joga de dia ainda fecha a Pokédex.
    for (const id of ESPECIES.map((e) => e.id)) {
      for (const n of [0, 0.5, 1]) {
        const f = fatorDoHorario(id, n);
        checar(f > 0.3, `${id} zera no horário ${n} — isso tranca a Pokédex pelo relógio`);
        checar(f <= 2.5, `${id} passa de 2,5× no horário ${n}`);
      }
    }

    // E a diferença é sentida: um noturno é vários vezes mais provável de noite.
    const gengarDeDia = fatorDoHorario('gengar', 0);
    const gengarDeNoite = fatorDoHorario('gengar', 1);
    checar(gengarDeNoite / gengarDeDia > 5, 'a noite tem de mudar mesmo quem aparece');
    checar(fatorDoHorario('pikachu', 0) === 1, 'quem é indiferente não muda com a hora');

    console.log(
      `   dia e noite: ${noturnos} noturnos, ${diurnos} diurnos · Gengar ${gengarDeDia.toFixed(2)}× de dia e ${gengarDeNoite.toFixed(2)}× de noite`,
    );
  }

  // Os marcos da Pokédex: o arco longo.
  //
  // O contador da Pokédex era placar e virou caminho. O que se afirma aqui é
  // que o caminho não tem buraco: os números sobem, cada um dispara uma vez só,
  // o prêmio prometido EXISTE, e nenhum prêmio passa do que a mochila aguenta —
  // prometer duas Bolas Lacuna a quem já tem o máximo de duas é prometer nada.
  {
    for (let i = 1; i < MARCOS.length; i++) {
      checar(MARCOS[i].registros > MARCOS[i - 1].registros, 'os marcos têm de subir');
    }
    checar(MARCOS[MARCOS.length - 1].registros === TOTAL_ESPECIES, 'o último marco é a Pokédex inteira');

    for (const marco of MARCOS) {
      const bola = BOLAS.find((b) => b.id === marco.premio.bola);
      checar(bola !== undefined, `o marco de ${marco.registros} promete uma bola que não existe`);
      checar(
        marco.premio.quantidade <= bola!.maximo,
        `${marco.premio.quantidade} ${bola!.nome} passa do máximo de ${bola!.maximo}`,
      );
      checar(marco.fala.length <= 58, `a fala do marco de ${marco.registros} não cabe no cartão`);
    }

    // Capturando de uma em uma, cada marco aparece exatamente uma vez.
    let vistos = 0;
    for (let n = 1; n <= TOTAL_ESPECIES; n++) if (marcoDe(n)) vistos++;
    checar(vistos === MARCOS.length, 'contando de um em um, todo marco tem de aparecer uma vez');
    checar(marcoDe(0) === null && marcoDe(7) === null, 'número que não é marco não vira cartão');

    // E o "faltam N" do painel: sempre olhando para a frente, nunca negativo.
    for (let n = 0; n < TOTAL_ESPECIES; n++) {
      const adiante = faltamPara(n);
      checar(adiante !== null, `com ${n} registros ainda devia haver um marco à frente`);
      checar(adiante!.faltam > 0, 'faltar zero para um marco que ainda não veio é contradição');
      checar(adiante!.marco.registros === n + adiante!.faltam, 'a conta do "faltam" tem de fechar');
    }
    checar(faltamPara(TOTAL_ESPECIES) === null, 'depois do último marco não falta nada');

    const premios = MARCOS.map((m) => `${m.registros}→${m.premio.quantidade} ${m.premio.bola}`);
    console.log(`   marcos da Pokédex: ${premios.join(' · ')}`);
  }

  // A fila do aviso: dois assuntos, dois cartões, um de cada vez.
  //
  // `mostrar` TROCA o texto da placa. Antes disto, o cartão do marco apagaria o
  // da captura que o produziu — e o mesmo já tinha acontecido com o nível
  // contra a evolução.
  {
    // Um canvas de mentira, e só para este bloco.
    //
    // O que se afirma aqui é TEMPO — quando um cartão sai e o outro entra — e
    // nada de desenho. A `Placa` de src/hud.ts pede um canvas ao `document`,
    // que no Node não existe; arrastar o @napi-rs/canvas para dentro do bundle
    // do smoke não dá (é nativo), então o dublê engole as chamadas de desenho e
    // devolve o mínimo para a placa se construir. Ele é desfeito no fim do
    // bloco: um `document` global sobrando faria o smoke parar de pegar
    // exatamente o que ele existe para pegar, que é código de jogo dependendo
    // de DOM.
    const ctx2d = new Proxy(
      {},
      {
        get: (_a, prop) => (prop === 'measureText' ? () => ({ width: 10 }) : () => {}),
        set: () => true,
      },
    );
    const global = globalThis as unknown as { document?: unknown };
    global.document = {
      createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d }),
    };

    const cena = new THREE.Group();
    const aviso = new Aviso(cena);
    const camera = new THREE.PerspectiveCamera();
    const linha = (t: string) => [{ texto: t }];

    aviso.mostrar(linha('capturado'), 1);
    aviso.emSeguida(linha('marco'), 1);
    checar(aviso.ocupado, 'com dois cartões, o aviso está ocupado');

    // Meio segundo: o primeiro ainda está na tela.
    aviso.atualizar(0.5, camera);
    checar(aviso.ocupado, 'o primeiro cartão não pode ter sumido na metade');
    // Passou do primeiro: o segundo entra sozinho, sem ninguém pedir.
    aviso.atualizar(0.6, camera);
    checar(aviso.ocupado, 'o segundo cartão devia ter entrado quando o primeiro acabou');
    aviso.atualizar(1.1, camera);
    checar(!aviso.ocupado, 'depois dos dois, o aviso fica livre');

    // Um `mostrar` no meio é uma interrupção de propósito: quem chamou quis
    // dizer "esqueça o resto, é isto agora".
    aviso.mostrar(linha('a'), 1);
    aviso.emSeguida(linha('b'), 1);
    aviso.mostrar(linha('c'), 1);
    aviso.atualizar(1.1, camera);
    checar(!aviso.ocupado, 'mostrar cancela o que estava na fila');

    // E a fila não vira palestra.
    aviso.mostrar(linha('1'), 1);
    for (let i = 0; i < 9; i++) aviso.emSeguida(linha(`${i}`), 1);
    let cartoes = 1;
    for (let t = 0; t < 30; t++) {
      const antes = aviso.ocupado;
      aviso.atualizar(1.1, camera);
      if (antes && aviso.ocupado) cartoes++;
      if (!aviso.ocupado) break;
    }
    checar(cartoes <= 3, `${cartoes} cartões seguidos é palestra, não aviso`);
    aviso.descartar();
    delete global.document;
    console.log(`   aviso: o segundo cartão espera o primeiro, e a fila para em ${cartoes} seguidos`);
  }

  // O rastro no chão: para onde ele aponta, e quando ele se cala.
  //
  // `pontoDeSpawn` não olha para onde você está olhando — um selvagem nasce
  // tanto na mesa à frente quanto na estante às costas —, e a única pista para
  // o segundo caso era o som do nascimento, que toca uma vez. O que se afirma
  // aqui é o contrato das três regras: aponta para o mais perto que está fora
  // da vista, cala quando há alguém à vista, e cala quando não há ninguém.
  {
    const olhos = new THREE.Vector3(0, 1.6, 0);
    // Olhando para −Z, que é a frente da câmera do three.
    const frente = new THREE.Vector3(0, 0, -1);
    const atras = new THREE.Vector3(0, 0.4, 3);
    const aFrente = new THREE.Vector3(0, 0.4, -3);
    const aEsquerda = new THREE.Vector3(-3, 0.4, 0);

    checar(rumoDoRastro(olhos, frente, []) === null, 'sem ninguém na sala, nada de pegadas');
    checar(rumoDoRastro(olhos, frente, [aFrente]) === null, 'com o bicho à vista, o rastro se cala');

    const paraTras = rumoDoRastro(olhos, frente, [atras]);
    checar(paraTras !== null, 'um bicho atrás de você é exatamente o caso que isto existe para resolver');
    checar(paraTras!.direcao.z > 0.99, 'a pegada devia apontar para trás');
    checar(Math.abs(paraTras!.distancia - 3) < 0.01, 'a distância é a horizontal, sem contar a altura');

    // Um só à vista basta para calar tudo: a atenção não se divide.
    checar(
      rumoDoRastro(olhos, frente, [atras, aFrente]) === null,
      'havendo alguém à vista, o rastro não aponta para o de trás',
    );

    // Entre dois escondidos, o mais perto.
    const perto = new THREE.Vector3(-1.5, 0.4, 0);
    const escolhido = rumoDoRastro(olhos, frente, [aEsquerda, perto]);
    checar(escolhido!.direcao.x < -0.99, 'com dois escondidos, aponta para o mais perto');
    checar(escolhido!.distancia < 1.6, 'e a distância é a dele');

    // Longe demais não conta: o bicho a mais de nove metros vai embora sozinho.
    checar(rumoDoRastro(olhos, frente, [new THREE.Vector3(0, 0, 12)]) === null, 'longe demais não aponta');

    // O cone que cala é o MESMO que marca como visto — se fossem diferentes,
    // existiria uma faixa de ângulo em que a pegada aponta para sempre para um
    // bicho que está bem ali.
    for (let g = 0; g <= 90; g += 5) {
      const a = THREE.MathUtils.degToRad(g);
      const alvo = new THREE.Vector3(Math.sin(a) * 3, 0.4, -Math.cos(a) * 3);
      const visto = aVista(olhos, frente, alvo);
      const aponta = rumoDoRastro(olhos, frente, [alvo]) !== null;
      checar(visto !== aponta, `a ${g}°: "à vista" e "apontado" têm de ser o contrário um do outro`);
    }

    // Grudado em você conta como visto, venha de onde vier.
    checar(aVista(olhos, frente, new THREE.Vector3(0.1, 1.5, 0.2)), 'a 20 cm do rosto não há o que procurar');

    // E agora o que nenhuma conta de ângulo pega: para que lado a pegada
    // DESENHADA aponta. São dois pontos onde o sinal pode inverter — o flipY da
    // textura e a ordem do Euler —, e dois erros desses se cancelam em silêncio.
    const chao = new Rastro();
    let pior = 0;
    // De 60° a 300°: a volta inteira menos o cone da frente, onde o rastro
    // se cala de propósito e não há o que medir.
    for (let g = 60; g <= 300; g += 30) {
      const a = THREE.MathUtils.degToRad(g);
      const bicho = new THREE.Vector3(Math.sin(a) * 4, 0.4, -Math.cos(a) * 4);
      const rumo = rumoDoRastro(olhos, frente, [bicho])!;
      checar(rumo !== null, `a ${g}° o bicho devia estar escondido o bastante para apontar`);
      // Dois quadros: o primeiro acende o grupo, o segundo já está no lugar.
      chao.atualizar(0.5, rumo, olhos, frente, 0);
      chao.atualizar(0.5, rumo, olhos, frente, 0);
      const aponta = chao.direcaoNoMundo();
      const erro = Math.acos(THREE.MathUtils.clamp(aponta.dot(rumo.direcao), -1, 1));
      pior = Math.max(pior, THREE.MathUtils.radToDeg(erro));
    }
    checar(pior < 1, `a pegada aponta ${pior.toFixed(0)}° fora do bicho — o rastro está mentindo`);
    chao.descartar();

    const limite = (() => {
      for (let g = 0; g <= 90; g++) {
        const a = THREE.MathUtils.degToRad(g);
        if (!aVista(olhos, frente, new THREE.Vector3(Math.sin(a) * 3, 0.4, -Math.cos(a) * 3))) return g;
      }
      return 90;
    })();
    console.log(
      `   rastro: aponta para quem passa de ${limite}° do olhar, com erro de ${pior.toFixed(1)}°, e se cala com qualquer um à vista`,
    );
  }

  // "Aprendeu um golpe novo!" — a diferença entre dois arsenais.
  //
  // O que se afirma aqui não é que a conta some: é que ela é HONESTA. Anunciar
  // um golpe que já estava na mão, ou anunciar duas vezes o mesmo golpe quando
  // se sobe dois níveis de uma vez, gasta o cartão que só vale enquanto for
  // verdade.
  {
    const semAviso = (id: string, ate: number) => {
      const e = porId(id)!;
      let mudancas = 0;
      for (let n = 2; n <= ate; n++) if (mudancaDeArsenal(e, n - 1, n).aprendeu.length > 0) mudancas++;
      return mudancas;
    };

    // Todo inicial aprende alguma coisa no caminho do 1 ao 40: se este número
    // fosse zero, o cartão nunca apareceria e o recurso não existiria.
    for (const id of ['charmander', 'squirtle', 'bulbasaur', 'pikachu', 'eevee']) {
      checar(semAviso(id, 40) >= 2, `${id} devia aprender golpes subindo até o nível 40`);
    }

    // Nada de anunciar o que já se tinha.
    const charmander = porId('charmander')!;
    for (let n = 2; n <= NIVEL_MAXIMO; n++) {
      const { aprendeu, esqueceu } = mudancaDeArsenal(charmander, n - 1, n);
      const tinha = new Set(golpesNoNivel(charmander, n - 1).map((g) => g.nome));
      for (const g of aprendeu) checar(!tinha.has(g.nome), `${g.nome} já estava na mão no nível ${n - 1}`);
      for (const g of esqueceu) {
        checar(
          !aprendeu.some((a) => a.nome === g.nome),
          `${g.nome} não pode ser aprendido e esquecido no mesmo nível`,
        );
      }
    }

    // O salto: subir do 5 direto ao 25 conta cada golpe UMA vez, e diz o mesmo
    // que a soma dos passos diria — nem mais nem menos.
    const umPasso = new Set<string>();
    for (let n = 6; n <= 25; n++) for (const g of mudancaDeArsenal(charmander, n - 1, n).aprendeu) umPasso.add(g.nome);
    const salto = mudancaDeArsenal(charmander, 5, 25).aprendeu;
    checar(new Set(salto.map((g) => g.nome)).size === salto.length, 'o salto não pode repetir um golpe');
    for (const g of salto) checar(umPasso.has(g.nome), `o salto anunciou ${g.nome}, que passo a passo não aparece`);

    // Parado no mesmo nível, ninguém aprende nada.
    checar(mudancaDeArsenal(charmander, 12, 12).aprendeu.length === 0, 'sem subir, não se aprende');

    const exemplo = (() => {
      for (let n = 2; n <= 40; n++) {
        const m = mudancaDeArsenal(charmander, n - 1, n);
        if (m.aprendeu.length > 0 && m.esqueceu.length > 0) {
          return `nível ${n}: aprendeu ${m.aprendeu[0].nome}, esqueceu ${m.esqueceu[0].nome}`;
        }
      }
      return 'sem troca até o nível 40';
    })();
    console.log(`   golpe novo: Charmander avisa ${semAviso('charmander', 40)}x até o nível 40 · ${exemplo}`);
  }

  // O instinto do selvagem: ele lê quem está em campo contra ele.
  //
  // A conta compara os DOIS lados — o melhor golpe de cada um contra o outro —
  // e é isso que o teste afirma, porque a leitura de um lado só é a armadilha
  // clássica da tabela de tipos: um Gyarados é fraco contra elétrico e mesmo
  // assim é uma ameaça enorme para um Pikachu, que é de papel.
  {
    const ameaca = (atacanteId: string, defensorId: string) => {
      const a = porId(atacanteId)!;
      const d = porId(defensorId)!;
      const melhor = (de: typeof a, para: typeof d) => {
        let m = 0;
        for (const g of golpesNoNivel(de, 40)) {
          if (g.categoria === 'status') continue;
          m = Math.max(m, multiplicador(g.tipo, para.tipos));
        }
        return m || 1;
      };
      const sofro = Math.log2(melhor(a, d));
      const causo = Math.log2(melhor(d, a));
      return Math.max(-1, Math.min(1, (sofro - causo) / 2));
    };

    // Água contra pedra/terra: o Squirtle é um pesadelo para o Geodude.
    checar(ameaca('squirtle', 'geodude') > 0.3, 'o Geodude devia temer um Squirtle');
    // E o contrário: o Geodude não assusta o Squirtle.
    checar(ameaca('geodude', 'squirtle') < -0.3, 'o Squirtle não devia temer um Geodude');
    // Espelho: o mesmo bicho contra ele mesmo não ameaça nem é ameaçado.
    checar(Math.abs(ameaca('pidgey', 'pidgey')) < 0.2, 'um bicho não devia temer a si mesmo');

    console.log(
      `   instinto: Geodude vê Squirtle a ${ameaca('squirtle', 'geodude').toFixed(2)}, ` +
        `e Squirtle vê Geodude a ${ameaca('geodude', 'squirtle').toFixed(2)}`,
    );
  }

  // As condições de status, e o laço que elas existem para criar.
  //
  // O que se afirma aqui não é que a mecânica roda — é que ela MUDA A JOGADA.
  // Em Pokémon o laço não é "enfraqueça e jogue a bola", é "enfraqueça,
  // ADORMEÇA e jogue a bola"; se dormir não melhorar a captura de forma
  // sentida, o golpe de status volta a ser um botão que ninguém aperta.
  {
    const alvo = porId('pidgey')!;
    const inteiro = (ajuda: number) => chanceCaptura(alvo, 1, 0, 1, 10, ajuda);
    const machucado = (ajuda: number) => chanceCaptura(alvo, 0.25, 0, 1, 10, ajuda);

    const semNada = machucado(1);
    const dormindo = machucado(bonusDeCaptura('sono'));
    const paralisado = machucado(bonusDeCaptura('paralisia'));

    checar(dormindo > semNada + 0.02, 'dormir devia ajudar a capturar, e não ajudou');
    checar(
      dormindo > paralisado,
      'o sono devia valer mais que a paralisia — é a condição mais forte do jogo',
    );
    // A captura final é a chance por sacudida ao CUBO.
    //
    // O que se mede é a queda do ESCAPE, e não a subida do acerto, porque perto
    // do teto a subida é pequena por construção — 83% para 93% parece pouco e é
    // o escape caindo pela METADE, que é exatamente o que o jogador sente: "ele
    // estava fugindo toda hora e agora ficou". Medir o lado errado desta conta
    // faria um teste reprovar a mecânica certa.
    const final = (p: number) => p ** 3;
    const escapeSemNada = 1 - final(semNada);
    const escapeDormindo = 1 - final(dormindo);
    checar(
      escapeDormindo < escapeSemNada * 0.6,
      `dormindo, o escape devia cair bem: ${(escapeSemNada * 100).toFixed(0)}% → ${(escapeDormindo * 100).toFixed(0)}%`,
    );
    // E não pode virar captura automática num alvo inteiro, senão a briga some.
    checar(
      final(inteiro(bonusDeCaptura('sono'))) < 0.9,
      'dormir num alvo inteiro não pode ser captura garantida',
    );

    // Uma condição não derruba a outra: a vaga é uma só.
    const bicho = new Pokemon(alvo, corpoFalso(0.4), new THREE.Vector3(0, 0, -1), 0, 'selvagem', 10);
    checar(bicho.aplicarCondicao('sono'), 'a primeira condição devia pegar');
    checar(!bicho.aplicarCondicao('queimadura'), 'a segunda condição não devia derrubar a primeira');
    checar(bicho.aplicarCondicao('sono'), 'renovar a MESMA condição devia valer');
    checar(bicho.condicao === 'sono', 'a condição certa não ficou');

    // Dormindo, ele não ataca.
    checar(!bicho.podeAtacar, 'quem está dormindo não devia poder atacar');

    // E ela ACABA sozinha.
    const jogador = new THREE.Vector3(0, 1.6, 0);
    for (let i = 0; i < 60 * 10; i++) bicho.atualizar(1 / 60, jogador);
    checar(bicho.condicao === null, 'a condição devia acabar sozinha depois da duração');

    console.log(
      `   captura com 25% de vida: ${(final(semNada) * 100).toFixed(0)}% acordado · ` +
        `${(final(paralisado) * 100).toFixed(0)}% paralisado · ${(final(dormindo) * 100).toFixed(0)}% dormindo`,
    );
  }

  // O modo sentado encolhe o jogo de verdade — item 4.1 do roteiro.
  //
  // O teste vale porque o item inteiro é UM número atravessando dezenas de
  // distâncias: se `escalaPessoal` parar de ser consultada em `folga`, nada
  // quebra, nada avisa, e o modo sentado vira um interruptor que não faz nada.
  {
    const especie = porId('charmander')!;
    const jogador = new THREE.Vector3(0, 1.6, 0);

    const medirParada = () => {
      const bicho = new Pokemon(especie, corpoFalso(0.6), new THREE.Vector3(0, 0, -3), 0, 'companheiro', 10);
      // Tempo suficiente para ele vir andando e assentar perto do treinador.
      for (let i = 0; i < 60 * 8; i++) bicho.atualizar(1 / 60, jogador);
      return Math.hypot(bicho.raiz.position.x - jogador.x, bicho.raiz.position.z - jogador.z);
    };

    Pokemon.escalaPessoal = 1;
    const dePe = medirParada();
    Pokemon.escalaPessoal = 0.62;
    const sentado = medirParada();
    Pokemon.escalaPessoal = 1;

    checar(
      sentado < dePe - 0.05,
      `sentado devia trazer o companheiro para mais perto: de pé ${dePe.toFixed(2)} m, sentado ${sentado.toFixed(2)} m`,
    );
    console.log(
      `   modo sentado: o companheiro para a ${sentado.toFixed(2)} m em vez de ${dePe.toFixed(2)} m`,
    );
  }

  // O cinto: quanta precisão a mão precisa ter para pegar a bola CERTA.
  //
  // Dois slots vizinhos disputam a faixa em que os campos de alcance se
  // sobrepõem. `slotSob` resolve escolhendo o mais perto, então nunca há erro
  // grosseiro — mas dentro dessa faixa a mão precisa acertar metade da
  // distância entre os dois, e essa metade é a precisão real exigida do
  // jogador. Com o passo de 5,8 cm de antes ela era de 2,9 cm, com a outra mão
  // tapando o alvo. É disso que vinha o "complicado de pegar" do playtest.
  {
    const precisao = PASSO_SLOT / 2;
    checar(
      precisao >= 0.03,
      `o cinto exige ${(precisao * 100).toFixed(1)} cm de precisão, e menos de 3 cm é mais do que um braço no ar entrega`,
    );
    // E o cinto inteiro tem de caber num antebraço: 4 slots a partir do punho.
    const fim = INICIO_SLOT + 3 * PASSO_SLOT;
    checar(fim <= 0.28, `o último slot fica a ${(fim * 100).toFixed(0)} cm do punho, além do cotovelo`);
    console.log(
      `   cinto: 4 bolas a cada ${(PASSO_SLOT * 100).toFixed(1)} cm, alcance ${(ALCANCE_SLOT * 100).toFixed(1)} cm, ` +
        `precisão exigida ${(precisao * 100).toFixed(1)} cm, última a ${(fim * 100).toFixed(0)} cm do punho`,
    );
  }

  // A grade da mochila tem de caber no gesto: dois itens mais perto um do outro
  // do que o alcance da mão disputariam o mesmo GRIP, e o jogador pegaria a
  // fruta querendo a poção sem entender por quê. Como a mochila cresce com as
  // pedras que caem, o pior caso é ela cheia.
  {
    const lugares = disporGrade(ITENS.length);
    checar(lugares.length === ITENS.length, 'a grade da mochila perdeu um item pelo caminho');
    let maisPerto = Infinity;
    for (let i = 0; i < lugares.length; i++) {
      for (let j = i + 1; j < lugares.length; j++) {
        maisPerto = Math.min(maisPerto, lugares[i].distanceTo(lugares[j]));
      }
    }
    checar(
      maisPerto > Mochila.ALCANCE,
      `dois itens da mochila ficam a ${maisPerto.toFixed(3)} m, dentro do alcance de ${Mochila.ALCANCE} m`,
    );
    console.log(
      `   mochila: ${ITENS.length} itens, vizinhos a ${maisPerto.toFixed(2)} m, ` +
        `alcance da mão ${Mochila.ALCANCE} m`,
    );
  }


  // O painel do pulso, depois de o time virar bolas de luz (18/09).
  //
  // Três coisas têm de valer ao mesmo tempo, e elas puxam para lados opostos:
  // a bola precisa ser PEGÁVEL (vizinhas longe o bastante para a mão não
  // disputar), a etiqueta precisa ser LEGÍVEL (sem invadir a bola de baixo), e
  // o conjunto precisa ser MENOR do que as cartas que ele substituiu — que foi
  // o pedido que originou tudo isto.
  {
    const vagas = 6;
    const yBase = MEDIDAS_TIME.raio + MEDIDAS_TIME.alturaEtiqueta + 0.008;
    const lugares = disporTime(vagas, yBase);
    checar(lugares.length === vagas, 'o arranjo do time perdeu uma vaga pelo caminho');

    let maisPerto = Infinity;
    for (let i = 0; i < lugares.length; i++) {
      for (let j = i + 1; j < lugares.length; j++) {
        maisPerto = Math.min(maisPerto, lugares[i].distanceTo(lugares[j]));
      }
    }
    // O mesmo critério do cinto: a mão que vem pegar tapa o alvo, e a precisão
    // exigida é metade da distância entre vizinhas.
    checar(
      maisPerto / 2 >= 0.03,
      `duas bolas do time exigem ${((maisPerto / 2) * 100).toFixed(1)} cm de precisão, e menos de 3 cm é mais do que um braço no ar entrega`,
    );

    // A etiqueta pendura abaixo da bola: ela não pode nem descer abaixo do
    // pulso (onde ficaria atrás do antebraço) nem encostar na bola de cima.
    const fundo = lugares[0].y - MEDIDAS_TIME.quedaDaEtiqueta - MEDIDAS_TIME.alturaEtiqueta / 2;
    checar(fundo >= 0, `a etiqueta da primeira linha desce ${(fundo * 100).toFixed(1)} cm abaixo do pulso`);
    const folga =
      MEDIDAS_TIME.passoY -
      MEDIDAS_TIME.raio -
      MEDIDAS_TIME.quedaDaEtiqueta -
      MEDIDAS_TIME.alturaEtiqueta / 2;
    checar(folga > 0, `a etiqueta de cima invade a bola de baixo em ${(-folga * 100).toFixed(1)} cm`);

    // E o painel encolheu de verdade: as cartas que saíram tinham 11,4 cm de
    // altura por linha e 9,2 de largura.
    const alturaDoTime = (lugares[vagas - 1].y + MEDIDAS_TIME.raio) - fundo;
    checar(
      alturaDoTime < 2 * 0.114,
      `o time ocupa ${(alturaDoTime * 100).toFixed(1)} cm, mais do que as duas fileiras de cartas que ele substituiu`,
    );
    const larguraDoTime = MEDIDAS_TIME.porLinha * MEDIDAS_TIME.passoX;
    console.log(
      `   time em bolas de luz: ${MEDIDAS_TIME.porLinha} por linha, vizinhas a ${(maisPerto * 100).toFixed(1)} cm, ` +
        `${(larguraDoTime * 100).toFixed(0)} × ${(alturaDoTime * 100).toFixed(0)} cm (eram 30 × 24)`,
    );
  }


  // A classificação por altura, que é como uma cadeira vira uma cadeira num
  // aparelho cuja lista de rótulos não tem a palavra "cadeira". As faixas
  // precisam cobrir a casa inteira sem buraco: uma altura que não cai em faixa
  // nenhuma é um móvel que o jogo trata como chão.
  {
    const casos: Array<[number, string | undefined]> = [
      [0.0, undefined], // o próprio chão
      [0.12, undefined], // um degrau, um tapete grosso
      [0.45, 'assento'], // cadeira, sofá, puff
      [0.74, 'mesa'], // mesa de jantar, escrivaninha
      [0.95, 'bancada'], // bancada de cozinha, aparador
      [1.8, 'alto'], // alto do armário
    ];
    for (const [altura, esperado] of casos) {
      const deu = classificarPelaAltura(altura);
      checar(
        deu === esperado,
        `altura de ${(altura * 100).toFixed(0)} cm devia ser ${esperado ?? 'chão'} e deu ${deu ?? 'chão'}`,
      );
    }
    // Sem buraco entre as faixas: 57 e 59 cm têm de cair em faixas vizinhas, e
    // não os dois fora.
    checar(
      classificarPelaAltura(0.57) === 'assento' && classificarPelaAltura(0.59) === 'mesa',
      'há um buraco entre a faixa do assento e a da mesa',
    );
    console.log(
      '   móveis por altura: assento até 58 cm · mesa até 88 · bancada até 125 · acima é lugar alto',
    );
  }


// --- 30. o colo, com uma mão e com duas ---
//
// O gesto de duas mãos não é um estado novo: ele já era ALCANÇÁVEL, e estava
// quebrado. A guarda da cascata do GRIP olhava só a própria mão, `pegarNoColo`
// não recusava quem já estava no colo, e a posição era escrita uma vez por
// entrada do mapa — o bicho grudava numa mão e a outra o atravessava. Esta
// seção existe porque `npm test` imprimia TUDO PASSOU com isso no jogo: grep
// por 'colo' no arquivo inteiro não devolvia uma linha.
console.log('\n30. o colo, com uma mão e com duas');
{
  const colo = new Colo();
  const bicho = nascer(porId('pikachu')!, 'companheiro');
  // Meio segundo de vida primeiro: recém-saído da bola ele está em 'surgindo',
  // com a escala ainda crescendo, e o colo recusa de propósito (ver abaixo).
  for (let i = 0; i < 48; i++) bicho.atualizar(1 / 72, new THREE.Vector3(0, 1.6, 0));

  // O INVARIANTE DE DONO. É O bug, e é o único teste que precisa passar.
  checar(bicho.pegarNoColo(), 'o Pikachu recusou o colo depois de nascer');
  colo.pegar(0, bicho);
  colo.pegar(1, bicho);
  checar(colo.maosEm(bicho) === 2, 'o colo não soube contar duas mãos no mesmo bicho');
  checar(bicho.abracado, 'duas mãos nele e ele não se sabe abraçado');

  checar(colo.soltar(0) === 'reduziu', 'soltar uma das duas mãos devia REDUZIR, não soltar');
  checar(colo.maosEm(bicho) === 1, 'sobrou mão errada depois de reduzir');
  checar(
    bicho.estado === 'colo',
    `abrir UMA das duas mãos derrubou o bicho (estado ${bicho.estado}) — é o gesto de passar de uma mão para a outra`,
  );
  checar(!bicho.abracado, 'com uma mão só ele continua se achando abraçado');
  checar(colo.soltar(1) === 'soltou', 'a última mão devia SOLTAR');
  checar(bicho.estado !== 'colo', 'a última mão abriu e ele continuou no ar');
  checar(colo.soltar(1) === null, 'soltar uma mão vazia devia ser no-op');
}

{
  // QUEM CABE EM QUANTAS MÃOS, por NOME e não por contagem: se alguém mexer na
  // curva de escala de species.ts, o teste diz de quem é a culpa.
  const naSala = (e: Especie) => e.altura;
  const soNasDuas: string[] = [];
  const foraDasDuas: string[] = [];
  let numa = 0;
  for (const e of ESPECIES) {
    const h = naSala(e);
    const uma = cabeNoColo(h, 1);
    const duas = cabeNoColo(h, 2);
    checar(!uma || duas, `${e.nome} cabe numa mão e não cabe nas duas — isso é impossível`);
    if (uma) numa++;
    else if (duas) soNasDuas.push(e.id);
    else foraDasDuas.push(e.id);
  }
  checar(cabeNoColo(naSala(porId('pikachu')!), 1), 'Pikachu devia caber numa mão');
  checar(cabeNoColo(naSala(porId('charmander')!), 1), 'Charmander devia caber numa mão');
  for (const id of ['snorlax', 'lapras', 'dragonair']) {
    const h = naSala(porId(id)!);
    checar(!cabeNoColo(h, 1), `${id} não devia caber numa mão só`);
    checar(cabeNoColo(h, 2), `${id} devia caber nas duas mãos`);
  }
  checar(
    foraDasDuas.join(',') === 'onix,gyarados' || foraDasDuas.join(',') === 'gyarados,onix',
    `os grandes demais para as duas mãos deviam ser só Onix e Gyarados, e são: ${foraDasDuas.join(', ')}`,
  );
  console.log(
    `   colo: ${numa} dos ${ESPECIES.length} cabem numa mão · +${soNasDuas.length} nas duas · ` +
      `fora, só ${foraDasDuas.length}`,
  );
}

{
  // O GESTO DE UMA MÃO NÃO MUDOU UM MILÍMETRO. É o critério "não quebrar o que
  // já funciona" virando teste.
  const a = new THREE.Vector3(0.12, 1.1, -0.4);
  const so = pontoDoColo(a, null, 0.3, 0, new THREE.Vector3());
  checar(so.x === a.x && so.z === a.z, 'com uma mão o bicho saiu de cima da palma');
  checar(Math.abs(so.y - (a.y + 0.02)) < 1e-9, 'com uma mão a altura acima da palma mudou');

  // O CENTRO DELE É O MEIO DAS SUAS MÃOS — a promessa inteira do desenho, da
  // qual dependem o alvo do golpe e o da pokébola (ver Pokemon.centro).
  const e = new THREE.Vector3(-0.12, 1.2, -0.35);
  const d = new THREE.Vector3(0.12, 1.2, -0.35);
  const altura = 0.5;
  const meio = pontoDoColo(e, d, altura, 0, new THREE.Vector3());
  checar(Math.abs(meio.x) < 1e-9 && Math.abs(meio.z + 0.35) < 1e-9, 'o bicho não ficou no meio das duas mãos');
  checar(
    Math.abs(meio.y + altura * 0.5 - 1.2) < 1e-9,
    'o CENTRO do corpo não caiu na altura das palmas — o alvo do golpe sai de dentro dele',
  );
  checar(meio.distanceTo(e) > 1e-6 && meio.distanceTo(d) > 1e-6, 'com duas mãos ele grudou numa delas');
  checar(
    Math.abs(meio.distanceTo(e) - meio.distanceTo(d)) < 1e-9,
    'com duas mãos ele ficou mais perto de uma',
  );

  // Os pés não atravessam o carpete.
  const baixo = pontoDoColo(
    new THREE.Vector3(-0.12, 0.1, 0),
    new THREE.Vector3(0.12, 0.1, 0),
    0.6,
    0.02,
    new THREE.Vector3(),
  );
  checar(baixo.y >= 0.02, 'abaixar as duas mãos enfiou o bicho no chão');

  // A CABEÇA NÃO PASSA DOS OLHOS: é isto que justifica ALTURA_DE_ABRACO, e não
  // o número solto. Mexeu no teto, esta linha acusa.
  const palmas = 1.2;
  const topo = palmas + ALTURA_DE_ABRACO * 0.5;
  checar(topo <= 1.65, `um bicho no teto do abraço sobe até ${topo.toFixed(2)} m, acima dos olhos`);
}

{
  // O CINTO SOBREVIVE ao gesto: um ajuste de pegada no meio do abraço não pode
  // sacar uma pokébola de dentro do bicho. A conta é a distância do centro dele
  // até o primeiro slot do antebraço oposto.
  let pior = Infinity;
  let culpado = '';
  for (const e of ESPECIES) {
    if (!cabeNoColo(e.altura, 2)) continue;
    const doSlot = Math.hypot(0.06 + INICIO_SLOT, 0.02 + e.altura * 0.5);
    const folga = doSlot - alcanceDoColo(e.altura * 0.5, 2);
    if (folga < pior) {
      pior = folga;
      culpado = e.nome;
    }
  }
  checar(pior > 0, `o abraço alcança o slot do cinto em ${culpado} (folga ${pior.toFixed(3)} m)`);
  console.log(`   abraço × cinto: a folga mais apertada é ${(pior * 100).toFixed(1)} cm, em ${culpado}`);
}

{
  // NO COLO ELE NÃO CAI, NÃO VIRA NaN, E ENCARA VOCÊ. São as três coisas que
  // mudaram em creature.ts, e as três só se veem rodando o bicho.
  const bicho = nascer(porId('charmander')!, 'companheiro');
  const jogador = new THREE.Vector3(0, 1.6, 0);
  for (let i = 0; i < 48; i++) bicho.atualizar(1 / 72, jogador);
  checar(bicho.pegarNoColo(), 'o companheiro recusou o colo');
  bicho.raiz.position.set(0.1, 1.15, -0.5);
  bicho.raiz.rotation.set(0.5, 1.0, -0.4);
  const y = bicho.raiz.position.y;
  for (let i = 0; i < 240; i++) bicho.atualizar(1 / 72, jogador);
  checar(bicho.raiz.position.y === y, 'o bicho no colo caiu sozinho — a gravidade entrou no estado colo');
  checar(Number.isFinite(bicho.raiz.rotation.y), 'a rotação dele no colo virou NaN');

  // Encarar: o jogador está atrás dele, e ele tem de virar.
  const esperado = Math.atan2(jogador.x - bicho.raiz.position.x, jogador.z - bicho.raiz.position.z);
  let erro = esperado - bicho.raiz.rotation.y;
  erro = Math.atan2(Math.sin(erro), Math.cos(erro));
  checar(
    Math.abs(erro) < 0.1,
    `no colo ele não virou para você: faltam ${((erro * 180) / Math.PI).toFixed(0)}°`,
  );

  // E soltar devolve ao prumo, sem impulso.
  bicho.soltarDoColo();
  checar(
    bicho.raiz.rotation.x === 0 && bicho.raiz.rotation.z === 0,
    'ele voltou ao chão inclinado, e vai andar torto pela sala para sempre',
  );
  checar(bicho.estado === 'ocioso', 'soltar do colo não devolveu ele à vida');

  // Um bicho recém-saído da bola não é pego: com a escala ainda em 0,001, um
  // Onix mede oito milímetros e passaria por qualquer teto de altura.
  const novo = nascer(porId('onix')!, 'companheiro');
  novo.raiz.scale.setScalar(0.001);
  checar(!novo.pegarNoColo() || novo.estado !== 'colo', 'um Onix de 8 mm entrou no colo');
}


// --- 31. a Pokédex: o ponto das costas, a queda e a volta ---
//
// O relato de 18/09 foi "quando agarro a pokedex, ele buga na mão e não consigo
// tirar da mão". Eram três defeitos somados, e dois deles se afirmam aqui sem
// navegador. O terceiro — o grip que não larga — mora em `Jogo`, que precisa de
// um WebGLRenderer; esse se confere no headset.
console.log('\n31. a Pokédex: as costas, a queda e a volta');
{
  const camera = new THREE.PerspectiveCamera();
  const chao = { alturaEm: () => 0 };

  // (1) O PONTO DAS COSTAS SEGUE A CABEÇA MESMO COM ELA NA MÃO.
  //
  // Este é o defeito que fazia "não consigo guardar": o alvo de guardar
  // congelava no ponto do quarto onde as costas estavam no instante do agarre.
  // Ande três passos e o gesto de levar a mão às costas deixava de existir.
  const tablet = new Tablet();
  tablet.naMaoDe = 0;
  camera.position.set(0, 1.6, 0);
  camera.quaternion.identity();
  camera.updateMatrixWorld(true);
  tablet.atualizar(1 / 72, camera, null, chao);
  const antes = tablet.pontoGuardado(new THREE.Vector3());

  camera.position.set(2.5, 1.6, -1);
  camera.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0, 'YXZ'));
  camera.updateMatrixWorld(true);
  tablet.atualizar(1 / 72, camera, null, chao);
  const depois = tablet.pontoGuardado(new THREE.Vector3());

  checar(
    antes.distanceTo(depois) > ALCANCE_TABLET,
    `o ponto das costas não seguiu a cabeça: andou ${antes.distanceTo(depois).toFixed(2)} m com o jogador andando 2,7 m`,
  );
  checar(
    Math.hypot(depois.x - camera.position.x, depois.z - camera.position.z) < 0.3,
    'o ponto das costas ficou longe das costas de quem andou',
  );

  // (2) ELA CAI, PARA EM CIMA DO PISO, E NUNCA ATRAVESSA.
  const caindo = new Tablet();
  caindo.grupo.position.set(0, 1.4, -0.5);
  caindo.largar(new THREE.Vector3(0.2, -0.4, 0));
  checar(caindo.noChao, 'largar não pôs a Pokédex em queda');
  let afundou = 0;
  for (let i = 0; i < 180; i++) {
    caindo.atualizar(1 / 72, camera, null, chao);
    if (caindo.grupo.position.y < -0.001) afundou++;
  }
  checar(afundou === 0, `a Pokédex atravessou o chão em ${afundou} quadros`);
  checar(
    Number.isFinite(caindo.grupo.position.y) && caindo.grupo.position.y <= 0.02,
    `ela parou a ${caindo.grupo.position.y.toFixed(3)} m do chão em vez de pousar nele`,
  );

  // (3) ELA POUSA EM CIMA DO MÓVEL, e não dentro dele. Uma Pokédex que afunda
  // no sofá é uma Pokédex perdida.
  const mesa = { alturaEm: () => 0.74 };
  const naMesa = new Tablet();
  naMesa.grupo.position.set(0, 1.4, -0.5);
  naMesa.largar(new THREE.Vector3(0, -0.4, 0));
  for (let i = 0; i < 180; i++) naMesa.atualizar(1 / 72, camera, null, mesa);
  checar(
    naMesa.grupo.position.y >= 0.74 && naMesa.grupo.position.y <= 0.78,
    `ela parou em ${naMesa.grupo.position.y.toFixed(2)} m com a mesa a 0,74 — não pousou em cima`,
  );

  // (4) ELA VOLTA SOZINHA. O jogo não pode ficar sem Pokédex: uma que rolou
  // para debaixo do sofá levaria junto metade do jogo.
  let voltou = 0;
  for (let i = 0; i < 72 * 40; i++) {
    naMesa.atualizar(1 / 72, camera, null, mesa);
    if (!naMesa.noChao) {
      voltou = i;
      break;
    }
  }
  checar(voltou > 0, 'a Pokédex ficou caída para sempre');
  const segundos = voltou / 72;
  checar(
    segundos > 20 && segundos < 30,
    `ela voltou em ${segundos.toFixed(1)} s, fora da janela de 25 s`,
  );
  console.log(
    `   Pokédex: cai, pousa em cima do apoio e volta sozinha em ${segundos.toFixed(0)} s`,
  );

  // (5) RECOLHER cancela a volta e a põe na mão.
  const catada = new Tablet();
  catada.largar(new THREE.Vector3(0, -0.4, 0));
  catada.recolher(1);
  checar(!catada.noChao && catada.naMaoDe === 1, 'catar a Pokédex do chão não a pôs na mão');
}

{
  // A RAMPA DO TOQUE, que é a peça nova do retorno tátil (src/toque.ts).
  //
  // Três coisas têm de valer, e as três já quebraram em rascunho: saturar DENTRO
  // do raio de agarre (senão nasce uma faixa morta bem em cima do alvo), ser
  // zero fora da banda de aviso, e ser monótona no meio.
  checar(forcaDeToque(0.0, 0.075, 0.13) === 1, 'encostado no alvo, a força não é cheia');
  checar(forcaDeToque(0.075, 0.075, 0.13) === 1, 'no limite do agarre, a força não saturou');
  checar(forcaDeToque(0.13, 0.075, 0.13) === 0, 'na borda do aviso, a força não é zero');
  checar(forcaDeToque(0.5, 0.075, 0.13) === 0, 'longe do alvo, ainda há força');
  let anterior = -1;
  for (let d = 0.13; d >= 0; d -= 0.005) {
    const f = forcaDeToque(d, 0.075, 0.13);
    checar(f >= anterior - 1e-9, `a rampa do toque desceu ao se aproximar, em ${d.toFixed(3)} m`);
    anterior = f;
  }
  // E o pulso nunca sai do lugar em que ele não se confunde com um TATO.
  for (let f = 0; f <= 1.0001; f += 0.05) {
    const p = pulsoDeToque(f);
    checar(p >= 0.1 && p <= 0.3001, `o pulso de toque saiu da faixa: ${p.toFixed(2)} para f=${f.toFixed(2)}`);
  }
  // Meia banda tem de dar MAIS da metade da força: é a curva compressiva, e é o
  // que faz a metade de fora ser sentida.
  const meio = pulsoDeToque(forcaDeToque(0.1025, 0.075, 0.13));
  checar(meio > 0.1 + 0.2 * 0.5, 'a curva do pulso não é compressiva — a banda de fora some');
  console.log(
    `   toque: rampa de ${(0.13 * 100).toFixed(0)} a ${(0.075 * 100).toFixed(1)} cm, pulso de ` +
      `${pulsoDeToque(0).toFixed(2)} a ${pulsoDeToque(1).toFixed(2)}`,
  );
}


// --- 32. o fogo de quem não tem osso ---
//
// Ponyta e Magmar ficaram sem chama porque os rips deles não têm esqueleto
// nenhum, e a tabela dizia — com razão — que escolher um ponto fixo de memória
// é palpite. O que mudou foi passar a MEDIR: `tools/brasa.mjs` lê os vértices
// que o próprio arquivo declara como chama (`FireCoreA_mat`, `FireStenA`,
// `Hair`) e devolve o centroide em fração da altura.
//
// Esta seção guarda o resultado contra duas regressões que não aparecem em
// lugar nenhum: uma âncora que sai da caixa do bicho — chama acesa no vazio, ao
// lado dele — e um Pokémon de fogo que perde a chama em silêncio.
console.log('\n32. o fogo de quem não tem osso');
{
  const comAncora: string[] = [];
  for (const [id, pontos] of Object.entries(FOGO_POR_ESPECIE)) {
    const medida = MEDIDAS[id as keyof typeof MEDIDAS] as
      | { largura: number; profundidade: number; alturaModelo: number }
      | undefined;
    checar(medida !== undefined, `${id} tem fogo na tabela e não tem modelo`);
    if (!medida) continue;

    const meiaLargura = medida.largura / 2 / medida.alturaModelo;
    const meiaProfundidade = medida.profundidade / 2 / medida.alturaModelo;

    for (const ponto of pontos) {
      checar(
        (ponto.ossos?.length ?? 0) > 0 || ponto.ancora !== undefined,
        `${id} tem um ponto de fogo sem osso e sem âncora — a chama não nasce`,
      );
      checar(
        ponto.fracao > 0.05 && ponto.fracao < 0.6,
        `a chama de ${id} tem ${ponto.fracao} da altura dele, fora do que uma chama é`,
      );
      if (!ponto.ancora) continue;
      comAncora.push(id);

      // Dentro da caixa, com a folga de 5% que a chama transborda de propósito.
      const [ax, ay, az] = ponto.ancora;
      checar(
        Math.abs(ax) <= meiaLargura + 0.05,
        `a âncora de ${id} fica ${Math.abs(ax).toFixed(2)} para o lado, e o bicho tem ${meiaLargura.toFixed(2)}`,
      );
      checar(
        ay >= -0.05 && ay <= 1.05,
        `a âncora de ${id} fica na altura ${ay}, fora do corpo (0 = pé, 1 = topo)`,
      );
      checar(
        Math.abs(az) <= meiaProfundidade + 0.05,
        `a âncora de ${id} fica ${Math.abs(az).toFixed(2)} de profundidade, e o bicho tem ${meiaProfundidade.toFixed(2)}`,
      );
    }
  }

  // Os cinco que o desenho manda ter fogo continuam tendo. Por NOME, e não por
  // contagem: se alguém sair da tabela, o teste diz quem.
  for (const id of ['charmander', 'charmeleon', 'charizard', 'ponyta', 'rapidash', 'magmar', 'moltres']) {
    checar(temFogo(id), `${id} é de fogo e não tem chama nenhuma`);
  }
  // E quem não é, não ganha: a régua é o DESENHO, não o tipo. Flareon é de fogo
  // e a juba dele é pelo.
  for (const id of ['flareon', 'growlithe', 'vulpix', 'charmander']) {
    if (id === 'charmander') continue;
    checar(!temFogo(id), `${id} ganhou chama, e a juba dele é pelo`);
  }

  console.log(
    `   fogo: ${Object.keys(FOGO_POR_ESPECIE).length} espécies · ` +
      `${new Set(comAncora).size} delas por âncora medida, sem osso`,
  );
}


// --- 33. o punho de mão nua ---
//
// Com hand tracking o `XRGripSpace` do three fica invisível e com a matriz na
// identidade — o three posa as juntas e não toca no grip. O cinto de pokébolas,
// o item na mão e a Pokédex eram filhos dele: quem largasse os controles
// perdia os três, sem mensagem nenhuma.
//
// `poseDoPulso` deriva a pose do grip a partir das juntas. O risco inteiro está
// no SINAL: uma troca põe o cinto do lado de dentro do braço, e isso só
// apareceria no headset. Estas verificações montam as duas mãos em pose
// conhecida e conferem a convenção — dedos em −Z, palma em +X na esquerda e em
// −X na direita, que é o que src/glove.ts documenta e o cinto assume.
console.log('\n33. o punho de mão nua');
{
  /**
   * Uma mão de mentira em pose conhecida: palma para BAIXO, dedos apontando
   * para −Z do mundo. É a pose da mão que se olha de cima.
   *
   * Nessa pose, para a mão DIREITA, o polegar (e o indicador) ficam do lado −X
   * e o mínimo do lado +X; na ESQUERDA é o contrário. O resto sai disso.
   */
  const maoDeMentira = (lado: 'left' | 'right') => {
    const sinal = lado === 'right' ? -1 : 1;
    return {
      punho: new THREE.Vector3(0, 1.2, 0),
      meioBase: new THREE.Vector3(0, 1.2, -0.03),
      meioPonta: new THREE.Vector3(0, 1.2, -0.18),
      indicadorBase: new THREE.Vector3(sinal * 0.02, 1.2, -0.03),
      minimoBase: new THREE.Vector3(-sinal * 0.02, 1.2, -0.03),
    };
  };

  for (const lado of ['left', 'right'] as const) {
    const pos = new THREE.Vector3();
    const giro = new THREE.Quaternion();
    checar(poseDoPulso(maoDeMentira(lado), pos, giro), `a mão ${lado} de mentira não derivou pose`);

    checar(pos.distanceTo(new THREE.Vector3(0, 1.2, 0)) < 1e-9, `o punho ${lado} saiu do lugar`);

    // −Z do grip é para onde os dedos apontam. Na pose de mentira, isso é −Z do
    // mundo.
    const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(giro);
    checar(
      frente.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-6,
      `os dedos da mão ${lado} não apontam para onde deviam: ${frente.toArray().map((v) => v.toFixed(2))}`,
    );

    // +X do grip sai pelo DORSO na direita e pela PALMA na esquerda. Com a
    // palma para baixo, o dorso é +Y e a palma é −Y.
    const eixoX = new THREE.Vector3(1, 0, 0).applyQuaternion(giro);
    const esperado = lado === 'right' ? 1 : -1;
    checar(
      Math.abs(eixoX.y - esperado) < 1e-6,
      `o +X da mão ${lado} aponta para y=${eixoX.y.toFixed(2)} e devia ser ${esperado} — ` +
        'o cinto nasceria do lado errado do braço',
    );

    // E a base tem de ser destra e ortonormal: uma base espelhada inverteria a
    // geometria inteira do que for pendurado nela.
    const eixoY = new THREE.Vector3(0, 1, 0).applyQuaternion(giro);
    const eixoZ = new THREE.Vector3(0, 0, 1).applyQuaternion(giro);
    const destra = new THREE.Vector3().crossVectors(eixoX, eixoY);
    checar(destra.distanceTo(eixoZ) < 1e-6, `a base da mão ${lado} saiu espelhada`);
  }

  // Mão degenerada devolve false e NÃO escreve: um cinto um quadro atrasado é
  // melhor do que um cinto que pisca para a origem do quarto.
  const parado = new THREE.Vector3(9, 9, 9);
  const giroParado = new THREE.Quaternion();
  const degenerada = {
    punho: new THREE.Vector3(),
    meioBase: new THREE.Vector3(),
    meioPonta: new THREE.Vector3(),
    indicadorBase: new THREE.Vector3(),
    minimoBase: new THREE.Vector3(),
  };
  checar(!poseDoPulso(degenerada, parado, giroParado), 'uma mão degenerada devolveu pose');
  checar(parado.x === 9, 'a mão degenerada escreveu por cima da pose boa');

  // As duas mãos giradas de verdade: o punho segue o ponto da junta, seja onde
  // for. É o que faz o cinto acompanhar o braço.
  const longe = maoDeMentira('left');
  longe.punho.set(1.3, 0.8, -2);
  for (const k of ['meioBase', 'meioPonta', 'indicadorBase', 'minimoBase'] as const) {
    longe[k].add(new THREE.Vector3(1.3, -0.4, -2));
  }
  const pos2 = new THREE.Vector3();
  checar(poseDoPulso(longe, pos2, new THREE.Quaternion()), 'a mão longe da origem não derivou');
  checar(pos2.distanceTo(new THREE.Vector3(1.3, 0.8, -2)) < 1e-9, 'o punho não seguiu a junta');

  console.log('   punho de mão nua: dedos em −Z, +X no dorso da direita e na palma da esquerda');
}


// --- 34. o gesto do relógio dispara no abraço (e por isso a guarda existe) ---
//
// O painel do pulso abre quando o dorso do punho esquerdo encara o rosto. O
// problema é que segurar um Pokémon contra o peito com as duas mãos é,
// geometricamente, essa MESMA pose — então o painel abria sozinho por cima do
// bicho que você acabou de levantar, e o mesmo valia para virar o pulso e olhar
// qualquer coisa que estivesse na mão.
//
// Estas verificações provam a premissa do conserto: o gesto REALMENTE dispara
// nessa pose. É por isso que a guarda não pode ser no gesto (apertar o limiar
// quebraria o gesto de verdade) e sim em quem o consome — `atualizarPaineis` só
// entrega o punho quando a mão está VAZIA.
console.log('\n34. o gesto do relógio, e a pose do abraço');
{
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.updateMatrixWorld(true);

  /** Um punho numa pose dada, no espaço do mundo. */
  const punhoEm = (posicao: THREE.Vector3, giro: THREE.Euler) => {
    const no = new THREE.Object3D();
    no.position.copy(posicao);
    no.rotation.copy(giro);
    no.updateMatrixWorld(true);
    return no;
  };

  // A POSE DO ABRAÇO: as duas mãos na altura do peito, a uns 35 cm do rosto,
  // com as palmas viradas uma para a outra — o que põe o dorso da esquerda
  // apontando para longe do corpo e, com o braço recolhido, na direção do
  // rosto. É a pose de quem levantou o companheiro para olhar.
  //
  // Na convenção do grip space o dorso da esquerda é −X local. Girar o punho
  // −90° em torno de Z leva esse −X local a apontar para +Y do mundo... então o
  // que se quer aqui é o giro que o aponta para a cabeça, que está acima e
  // atrás da mão.
  const noPeito = new THREE.Vector3(-0.12, 1.25, -0.3);
  const paraORosto = new THREE.Vector3().subVectors(camera.position, noPeito).normalize();

  // Monta o punho de modo que o dorso (−X local, na esquerda) fique exatamente
  // na direção do rosto: é o pior caso, e é o que acontece de verdade quando
  // alguém segura um bicho contra o peito e olha para ele.
  const base = new THREE.Matrix4();
  const eixoX = paraORosto.clone().negate();
  const auxiliar = Math.abs(eixoX.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const eixoZ = new THREE.Vector3().crossVectors(eixoX, auxiliar).normalize();
  const eixoY = new THREE.Vector3().crossVectors(eixoZ, eixoX).normalize();
  base.makeBasis(eixoX, eixoY, eixoZ);

  const punhoDoAbraco = new THREE.Object3D();
  punhoDoAbraco.position.copy(noPeito);
  punhoDoAbraco.quaternion.setFromRotationMatrix(base);
  punhoDoAbraco.updateMatrixWorld(true);

  checar(
    olhandoORelogio(punhoDoAbraco, 'left', camera, false),
    'a pose do abraço NÃO dispara o gesto do relógio — se isto falhar, a guarda ' +
      'de mão cheia virou remendo para um problema que não existe mais',
  );

  // E o gesto continua funcionando para quem realmente quer abrir: mesma pose,
  // que é o ponto — não dá para distinguir uma da outra pela geometria.
  checar(
    olhandoORelogio(punhoDoAbraco, 'left', camera, true),
    'o gesto não se mantém aberto na pose em que ele abre',
  );

  // Braço relaxado ao lado do corpo não abre nada: é a razão de o limiar ser
  // estreito, e o que impede a guarda de ser resolvida afrouxando o gesto.
  const relaxado = punhoEm(new THREE.Vector3(-0.25, 0.85, 0), new THREE.Euler(0, 0, 0));
  checar(
    !olhandoORelogio(relaxado, 'left', camera, false),
    'o painel abre com o braço relaxado ao lado do corpo',
  );

  // Mão longe, esticada para a frente: também não.
  const esticado = punhoEm(new THREE.Vector3(-0.2, 1.3, -1.1), new THREE.Euler(0, 0, 0));
  checar(
    !olhandoORelogio(esticado, 'left', camera, false),
    'o painel abre com o braço esticado para a frente',
  );

  console.log(
    '   relógio: a pose do abraço dispara o gesto — por isso o painel só abre em mão vazia',
  );
}


// --- 35. a mochila e o bicho abraçado disputam o mesmo gesto ---
//
// A cascata do GRIP tinha a mochila e a Pokédex ACIMA da guarda do colo: com a
// mochila aberta, fechar a mão que abraça um Pokémon tirava uma poção de lá.
//
// A ordem foi corrigida (o colo e o abraço subiram para o topo), e o que se
// afirma aqui é a PREMISSA: que os dois campos de agarre se sobrepõem mesmo na
// pose típica. Se um dia a mochila mudar de lugar e deixar de disputar, esta
// verificação avisa — e a ordem passa a ser preferência, não necessidade.
console.log('\n35. a mochila e o bicho abraçado, no mesmo lugar');
{
  // A pose típica: olhos a 1,60 m, olhando para −Z.
  const olhos = new THREE.Vector3(0, 1.6, 0);
  const frente = new THREE.Vector3(0, 0, -1);

  // Onde a mochila nasce (ver Mochila.abrir).
  const centroDaMochila = olhos
    .clone()
    .addScaledVector(frente, DISTANCIA_DA_MOCHILA)
    .setY(olhos.y - ABAIXO_DOS_OLHOS);

  // Onde o bicho abraçado fica: entre as palmas, na altura do peito. `centro`
  // do Pokémon É o meio das palmas — é o invariante de `pontoDoColo`.
  const palmaE = new THREE.Vector3(-0.12, 1.25, -0.35);
  const palmaD = new THREE.Vector3(0.12, 1.25, -0.35);
  const centroDoBicho = palmaE.clone().add(palmaD).multiplyScalar(0.5);

  // O item mais próximo da grade, com a mochila cheia (o pior caso, que é o
  // comum: as pedras entram na grade conforme caem).
  const lugares = disporGrade(ITENS.length);
  let maisPerto = Infinity;
  for (const lugar of lugares) {
    // A grade encara o jogador na horizontal, então x local é x do mundo.
    const noMundo = new THREE.Vector3(
      centroDaMochila.x + lugar.x,
      centroDaMochila.y + lugar.y,
      centroDaMochila.z,
    );
    maisPerto = Math.min(maisPerto, noMundo.distanceTo(centroDoBicho));
  }

  const somaDosAlcances = Mochila.ALCANCE + ALCANCE_DE_ABRACO;
  checar(
    maisPerto < somaDosAlcances,
    `a mochila e o abraço NÃO disputam mais (${maisPerto.toFixed(2)} m entre eles, ` +
      `contra ${somaDosAlcances.toFixed(2)} de alcance somado) — a ordem da cascata virou preferência`,
  );

  // E a mão que vai abraçar ATRAVESSA a grade no caminho: ela sai do lado do
  // corpo e vai até o bicho, passando pela profundidade em que os itens estão.
  checar(
    Math.abs(centroDaMochila.z - centroDoBicho.z) < 0.35,
    'a mochila e o bicho abraçado ficam em profundidades distantes demais para a mão cruzar uma indo à outra',
  );

  console.log(
    `   cascata: item mais perto do bicho abraçado a ${(maisPerto * 100).toFixed(0)} cm, ` +
      `com ${(somaDosAlcances * 100).toFixed(0)} cm de alcance somado — o colo tem de vir antes`,
  );
}


// --- 36. canhoto: o gesto do relógio é simétrico ---
//
// O painel do pulso passou a morar na mão NÃO dominante, que num canhoto é a
// direita. Isso só funciona se o gesto que o abre for simétrico de verdade — e
// ele depende do lado, porque o dorso do punho é −X na esquerda e +X na direita
// (ver `dorsoLocal` em src/gesto.ts).
//
// O que se afirma aqui: a mesma pose ESPELHADA dispara o gesto do outro lado, e
// não dispara o do lado errado. Se o espelhamento quebrar, o canhoto gira o
// pulso e nada acontece — sem nenhuma mensagem, como todo gesto que falha.
console.log('\n36. canhoto: o gesto do relógio espelhado');
{
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.updateMatrixWorld(true);

  /**
   * Um punho na pose de ler as horas, para um dado lado.
   *
   * O dorso (−X local na esquerda, +X na direita) tem de encarar o rosto. Monta
   * a base a partir disso, e o resto é consequência.
   */
  const punhoLendoAsHoras = (lado: 'left' | 'right') => {
    const posicao = new THREE.Vector3(lado === 'left' ? -0.15 : 0.15, 1.3, -0.3);
    const paraORosto = new THREE.Vector3().subVectors(camera.position, posicao).normalize();
    // O dorso local vira o mundo: na esquerda ele é −X, então +X tem de apontar
    // para o LADO OPOSTO ao rosto.
    const eixoX = lado === 'left' ? paraORosto.clone().negate() : paraORosto.clone();
    const auxiliar =
      Math.abs(eixoX.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const eixoZ = new THREE.Vector3().crossVectors(eixoX, auxiliar).normalize();
    const eixoY = new THREE.Vector3().crossVectors(eixoZ, eixoX).normalize();
    const no = new THREE.Object3D();
    no.position.copy(posicao);
    no.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(eixoX, eixoY, eixoZ));
    no.updateMatrixWorld(true);
    return no;
  };

  const canhoto = punhoLendoAsHoras('right');
  const destro = punhoLendoAsHoras('left');

  checar(olhandoORelogio(destro, 'left', camera, false), 'o destro não abre o painel');
  checar(
    olhandoORelogio(canhoto, 'right', camera, false),
    'o CANHOTO não abre o painel girando o pulso direito — o gesto não é simétrico',
  );

  // E o lado importa: a pose de um não serve para o outro. Se servisse, o
  // parâmetro seria decorativo e o painel abriria nos dois pulsos.
  checar(
    !olhandoORelogio(destro, 'right', camera, false),
    'a pose da esquerda abre o painel da direita — o lado do dorso virou enfeite',
  );
  checar(
    !olhandoORelogio(canhoto, 'left', camera, false),
    'a pose da direita abre o painel da esquerda',
  );

  console.log('   canhoto: a mesma pose, espelhada, abre o painel do outro pulso');
}


// --- 37. braço no ar cansa: a grade desce, e a Pokédex sai das costas ---
//
// O Modo sentado encolhia as distâncias do MUNDO — onde o companheiro para,
// onde os selvagens nascem — e deixava os painéis exigindo o braço levantado na
// mesma altura de quem joga de pé. Duas correções, e as duas se afirmam aqui.
console.log('\n37. o alcance de quem está sentado');
{
  const OLHOS = 1.6;

  // (1) A GRADE DA MOCHILA DESCE ATÉ A MÃO QUE A ABRIU — e nunca sobe.
  const semMao = alturaDaMochila(OLHOS, null, false);
  checar(
    Math.abs(semMao - (OLHOS - ABAIXO_DOS_OLHOS)) < 1e-9,
    'sem saber da mão, a grade saiu da altura de sempre',
  );

  const maoNoColo = alturaDaMochila(OLHOS, 0.95, false);
  checar(
    maoNoColo < semMao,
    `a grade não desceu para quem abriu com a mão no colo (${maoNoColo.toFixed(2)} contra ${semMao.toFixed(2)})`,
  );
  checar(
    maoNoColo >= 0.95 && maoNoColo <= 0.95 + 0.12,
    `a grade parou em ${maoNoColo.toFixed(2)} com a mão em 0,95 — ela devia ficar logo acima da mão`,
  );

  // Mão levantada NÃO puxa a grade para cima: quem abre com o braço esticado
  // receberia o painel na cara.
  const maoAlta = alturaDaMochila(OLHOS, 1.55, false);
  checar(
    Math.abs(maoAlta - semMao) < 1e-9,
    `a mão levantada subiu a grade para ${maoAlta.toFixed(2)} — ela nunca deve subir`,
  );

  // Braço pendurado ao lado do corpo não põe a grade no chão: ali a mão não
  // está pedindo nada, está parada.
  const pendurado = alturaDaMochila(OLHOS, 0.75, false);
  checar(
    pendurado >= semMao - QUEDA_MAXIMA - 1e-9,
    `a grade caiu para ${pendurado.toFixed(2)}, além do limite de queda`,
  );

  // Sentado, ela nasce mais baixa e mais perto.
  checar(
    alturaDaMochila(OLHOS, null, true) < alturaDaMochila(OLHOS, null, false),
    'o modo sentado não abaixou a grade',
  );
  checar(DISTANCIA_SENTADO < DISTANCIA_DA_MOCHILA, 'o modo sentado não aproximou a grade');

  // E a ordem nunca inverte, para qualquer altura de mão: sentado é sempre
  // igual ou mais baixo do que de pé.
  for (let h = 0.6; h <= 1.7; h += 0.05) {
    checar(
      alturaDaMochila(OLHOS, h, true) <= alturaDaMochila(OLHOS, h, false) + 1e-9,
      `com a mão em ${h.toFixed(2)}, sentado ficou MAIS ALTO do que de pé`,
    );
  }

  // (2) A POKÉDEX SAI DAS COSTAS. Numa poltrona, levar a mão atrás do corpo não
  // é desconfortável: é impossível, porque o encosto está ali.
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, OLHOS, 0);
  camera.quaternion.identity();
  camera.updateMatrixWorld(true);
  const chao = { alturaEm: () => 0 };

  const emPe = new Tablet();
  emPe.atualizar(1 / 72, camera, null, chao, { ligado: false, lado: 'right' });
  const pontoEmPe = emPe.pontoGuardado(new THREE.Vector3());

  const sentado = new Tablet();
  sentado.atualizar(1 / 72, camera, null, chao, { ligado: true, lado: 'right' });
  const pontoSentado = sentado.pontoGuardado(new THREE.Vector3());

  checar(
    pontoSentado.y < pontoEmPe.y,
    'sentado, a Pokédex não desceu',
  );
  checar(
    pontoSentado.z < pontoEmPe.z,
    `sentado, a Pokédex continua tão atrás quanto de pé (z ${pontoSentado.z.toFixed(2)} contra ${pontoEmPe.z.toFixed(2)}) — o encosto da cadeira está exatamente ali`,
  );
  checar(
    Math.abs(pontoSentado.x) > 0.15,
    'sentado, a Pokédex ficou na linha do meio do corpo em vez de ao lado do quadril',
  );

  // E ela espelha para o canhoto, senão ele teria de cruzar o braço.
  const canhoto = new Tablet();
  canhoto.atualizar(1 / 72, camera, null, chao, { ligado: true, lado: 'left' });
  const pontoCanhoto = canhoto.pontoGuardado(new THREE.Vector3());
  checar(
    Math.sign(pontoCanhoto.x) === -Math.sign(pontoSentado.x),
    'o coldre da Pokédex não espelha para o canhoto',
  );

  console.log(
    `   sentado: grade a ${(semMao - alturaDaMochila(OLHOS, null, true)).toFixed(2)} m mais baixa, ` +
      `Pokédex do quadril em vez das costas`,
  );
}


// --- 38. a pose de estar sendo segurado ---
//
// Era a dívida registrada quando o colo de duas mãos entrou: não existia pose
// de "no colo" no animador. Com uma mão a palma tapa metade do corpo e ninguém
// repara; levantado à frente do rosto pelas duas, um bicho na pose de ócio — de
// pé no ar, pernas retas — é a coisa mais boneco que o jogo tem.
//
// A camada é somada por cima da base (ver `aplicarColo`), então o que se mede
// aqui é a DIFERENÇA entre rodar o mesmo ocioso com e sem ela. Com sinal, e não
// só em módulo: recolher as pernas e esticá-las dariam o mesmo ângulo.
console.log('\n38. a pose de estar sendo segurado');
{
  // Os mesmos nomes dos outros testes de pose: são os que o Rig reconhece.
  const nomes = [
    'Hips', 'Spine1', 'Spine2', 'Neck', 'Head', 'Jaw',
    'LShoulder', 'LArm', 'LForeArm', 'LHand', 'RShoulder', 'RArm', 'RForeArm', 'RHand',
    'LThigh', 'LLeg', 'LFoot', 'RThigh', 'RLeg', 'RFoot', 'Tail1', 'Tail2', 'Tail3',
  ];

  /** O giro em torno de X, COM sinal, de um osso contra o repouso dele. */
  const giroEmX = (osso: THREE.Bone, repouso: THREE.Quaternion) => {
    const relativo = repouso.clone().invert().multiply(osso.quaternion);
    // O sinal do componente x do quaternion é o sentido do giro em torno de X.
    const angulo = 2 * Math.atan2(Math.hypot(relativo.x, relativo.y, relativo.z), relativo.w);
    return relativo.x >= 0 ? angulo : -angulo;
  };

  const posar = (colo: number) => {
    // Mesma semente para os dois: `variacoesDeOcio` sorteia, e sem prender o
    // acaso a diferença medida seria metade pose e metade sorte. É a mesma
    // armadilha que já tornou o teste da chicotada intermitente.
    const sorteioReal = Math.random;
    let semente = 0x2f6e2b1;
    Math.random = () => {
      semente = (semente + 0x6d2b79f5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      const { corpo, porNome, repousos } = esqueletoDe(nomes, 0.6);
      const animador = new Animador(corpo);
      const ctx = { velocidade: 0, alarme: 0, vida: 1, encarar: 0, desmaiado: false, colo };
      // Tempo de sobra para a camada assentar: ela entra por interpolação na
      // criatura, mas aqui o valor é direto, e o que precisa assentar é a base.
      for (let i = 0; i < 120; i++) animador.atualizar(1 / 72, ctx);
      const saida = new Map<string, number>();
      for (const nome of nomes) {
        saida.set(nome, giroEmX(porNome.get(nome)!, repousos.get(nome)!));
      }
      return saida;
    } finally {
      Math.random = sorteioReal;
    }
  };

  const solto = posar(0);
  const noColo = posar(1);
  const delta = (nome: string) => noColo.get(nome)! - solto.get(nome)!;

  // AS PERNAS RECOLHEM. Pela convenção de eixos, coxa e joelho apontam para
  // baixo, e negativo traz para a FRENTE — que é o lado em que um bicho
  // levantado dobra as pernas.
  for (const perna of ['LThigh', 'RThigh']) {
    checar(
      delta(perna) < -0.3,
      `a coxa ${perna} não recolheu no colo: ${(delta(perna) * (180 / Math.PI)).toFixed(0)}°`,
    );
  }
  for (const joelho of ['LLeg', 'RLeg']) {
    checar(
      delta(joelho) < -0.4,
      `o joelho ${joelho} não dobrou no colo: ${(delta(joelho) * (180 / Math.PI)).toFixed(0)}°`,
    );
  }

  // O TRONCO RECLINA PARA TRÁS, e não para a frente — para a frente é a pose de
  // quem está caindo. Tronco aponta para cima, positivo inclina à frente.
  checar(delta('Spine1') < 0, `o tronco caiu para a frente no colo: ${delta('Spine1').toFixed(2)}`);

  // OS BRAÇOS VÊM À FRENTE e dobram.
  checar(delta('LArm') < -0.2 && delta('RArm') < -0.2, 'os braços não vieram à frente no colo');
  checar(delta('LForeArm') < -0.25, 'o antebraço não dobrou no colo');

  // E NADA DISSO É EXAGERO: a pose inteira cabe em 45° por osso. O que denuncia
  // uma pose inventada é o exagero, e esta camada SOMA em cima da base.
  let maior = 0;
  let culpado = '';
  for (const nome of nomes) {
    if (Math.abs(delta(nome)) > maior) {
      maior = Math.abs(delta(nome));
      culpado = nome;
    }
  }
  checar(
    maior < Math.PI / 4,
    `a pose de colo gira ${culpado} em ${(maior * (180 / Math.PI)).toFixed(0)}°, o que é pose de contorcionista`,
  );

  // Com colo = 0 ela não existe: um bicho no chão não pode herdar nada disto.
  const comparacao = posar(0);
  for (const nome of nomes) {
    checar(
      Math.abs(comparacao.get(nome)! - solto.get(nome)!) < 1e-9,
      `o mesmo ocioso deu poses diferentes em ${nome} — o teste virou sorteio`,
    );
  }

  console.log(
    `   colo: coxa ${(delta('LThigh') * (180 / Math.PI)).toFixed(0)}°, ` +
      `joelho ${(delta('LLeg') * (180 / Math.PI)).toFixed(0)}°, ` +
      `braço ${(delta('LArm') * (180 / Math.PI)).toFixed(0)}° — maior giro ${(maior * (180 / Math.PI)).toFixed(0)}° em ${culpado}`,
  );
}


// --- 39. o companheiro usa o quarto ---
//
// O mapa do cômodo servia para duas coisas: fazer os selvagens nascerem onde
// faz sentido e impedir que alguém atravesse o sofá. Nenhuma delas é o
// COMPANHEIRO usando o quarto — e é isso que separa um pet de um cursor que te
// segue.
console.log('\n39. o companheiro usa o quarto');
{
  // (1) A SALA ESCOLHE O MÓVEL CERTO: a maior do tipo pedido, dentro do
  // alcance, com superfície sobrando depois da margem.
  const sala = new Sala(new THREE.Group());
  const movel = (
    x: number,
    z: number,
    altura: number,
    meia: number,
    tipo: 'assento' | 'mesa' | 'bancada' | 'alto',
  ) => ({
    centro: new THREE.Vector3(x, altura, z),
    meiaLargura: meia,
    meiaProfundidade: meia,
    rotacaoY: 0,
    rotulo: 'other',
    altura,
    area: meia * meia * 4,
    movel: tipo,
  });

  sala.superficies = [
    movel(0.6, -1, 0.45, 0.3, 'assento'),
    movel(-0.5, -1.2, 0.74, 0.5, 'mesa'),
    // Uma mesa maior, porém LONGE: não pode ganhar da que está perto.
    movel(8, 8, 0.74, 1.2, 'mesa'),
    // E uma do tamanho da margem: não cabe bicho nenhum.
    movel(0.2, -0.8, 0.74, 0.15, 'mesa'),
  ];

  const jogador = new THREE.Vector3(0, 1.6, 0);
  const mesa = sala.pousoPerto(jogador, ['mesa'], 3);
  checar(mesa !== null, 'a sala não achou a mesa que está a um metro do jogador');
  checar(
    mesa !== null && Math.abs(mesa.ponto.x + 0.5) < 1e-6,
    'a sala escolheu a mesa errada — devia ser a maior DENTRO do alcance',
  );
  checar(
    mesa !== null && Math.abs(mesa.ponto.y - 0.74) < 1e-6,
    'o ponto de pouso não ficou na altura do tampo',
  );

  const assento = sala.pousoPerto(jogador, ['assento'], 3);
  checar(assento?.tipo === 'assento', 'a sala não distinguiu assento de mesa');

  checar(sala.pousoPerto(jogador, ['alto'], 3) === null, 'a sala inventou um móvel que não existe');
  checar(
    sala.pousoPerto(new THREE.Vector3(20, 1.6, 20), ['mesa'], 3) === null,
    'a sala ofereceu um móvel a vinte metros de distância',
  );

  // (2) O COMPANHEIRO VAI, e fica.
  const terreno = {
    alturaEm: (p: THREE.Vector3) =>
      // O tampo só existe em cima da mesa; fora dela, chão.
      Math.abs(p.x + 0.5) < 0.5 && Math.abs(p.z + 1.2) < 0.5 ? 0.74 : 0,
    pousoPerto: (perto: THREE.Vector3, tipos: readonly string[]) =>
      sala.pousoPerto(perto, tipos as readonly ('assento' | 'mesa' | 'bancada' | 'alto')[], 3),
  };

  const rodar = (bicho: Pokemon, segundos: number) => {
    const quadros = Math.round(segundos * 72);
    let subiu = false;
    for (let i = 0; i < quadros; i++) {
      bicho.atualizar(1 / 72, jogador, terreno);
      // Em CIMA, e não perto: o tampo está a 74 cm e o chão a zero.
      if (bicho.raiz.position.y > 0.5) subiu = true;
    }
    return subiu;
  };

  const sadio = nascer(porId('charmander')!, 'companheiro');
  checar(rodar(sadio, 70), 'o companheiro nunca subiu na mesa em setenta segundos de ócio');

  // (3) ACABADO, ele procura onde se enroscar — e é o único caso em que ele
  // desobedece a distância de "fica ao meu lado".
  const acabado = nascer(porId('charmander')!, 'companheiro');
  acabado.hp = Math.max(1, Math.floor(acabado.hpMax * 0.2));
  checar(rodar(acabado, 40), 'o companheiro acabado não foi descansar em lugar nenhum');

  // (4) A SUA ORDEM GANHA. Chamado, ele larga o móvel e vem — e não volta para
  // lá no quadro seguinte.
  const chamado = nascer(porId('charmander')!, 'companheiro');
  chamado.hp = Math.max(1, Math.floor(chamado.hpMax * 0.2));
  rodar(chamado, 20);
  chamado.chamarPara(new THREE.Vector3(2, 0, 2));
  let voltouParaOMovel = false;
  for (let i = 0; i < 72 * 8; i++) {
    chamado.atualizar(1 / 72, jogador, terreno);
    // Os três primeiros segundos não contam: ele ESTAVA em cima da mesa quando
    // foi chamado, e descer de lá leva tempo. O que se afirma é que ele não
    // volta, não que ele teleporta.
    if (i > 72 * 3 && chamado.raiz.position.y > 0.5) voltouParaOMovel = true;
  }
  checar(!voltouParaOMovel, 'chamado, ele voltou para a mesa — a ordem do jogador tem de ganhar');

  // (5) SEM MÓVEL NENHUM nada muda: um terreno liso é o jogo de antes.
  const soChao = { alturaEm: () => 0 };
  const semQuarto = nascer(porId('charmander')!, 'companheiro');
  for (let i = 0; i < 72 * 30; i++) semQuarto.atualizar(1 / 72, jogador, soChao);
  const doJogador = Math.hypot(
    semQuarto.raiz.position.x - jogador.x,
    semQuarto.raiz.position.z - jogador.z,
  );
  checar(
    doJogador < 2,
    `sem móveis, o companheiro foi parar a ${doJogador.toFixed(1)} m de você`,
  );

  console.log('   quarto: ele sobe na mesa sozinho, descansa quando acabado, e larga tudo se você chamar');
}


// --- 40. a foto: o nome do arquivo e o caminho sem DOM ---
//
// A fotografia é o único item do jogo que sai do headset: dentro de uma sessão
// imersiva não há diálogo de download nem barra de endereço, então a foto é
// guardada em memória e entregue quando a página volta a ser uma página.
//
// O que se afirma sem navegador é o que decide se o arquivo chega inteiro: o
// NOME. Dois disparos que gerem o mesmo nome fazem o segundo sobrescrever o
// primeiro no rolo de quem baixa os dois, e um nome que herde o que está na
// espécie é um caminho de arquivo esperando para dar errado.
console.log('\n40. a foto');
{
  const foto = (quem: string, quando: number) => ({
    dados: '',
    quando,
    quem,
    largura: LADO_DA_FOTO,
    altura: LADO_DA_FOTO,
  });

  // Acentos e espaços saem: o nome tem de sobreviver a qualquer sistema de
  // arquivos, e os nomes das espécies têm acento (Nidoran♀ tem coisa pior).
  checar(
    nomeDaFoto(foto('Nidoran Fêmea', 12.34)) === 'pokeplace-nidoran-femea-12s34.png',
    `o nome saiu ${nomeDaFoto(foto('Nidoran Fêmea', 12.34))}`,
  );
  checar(
    nomeDaFoto(foto('Farfetch’d', 5)) === 'pokeplace-farfetch-d-5s00.png',
    `apóstrofo virou ${nomeDaFoto(foto('Farfetch’d', 5))}`,
  );

  // NADA vira caminho: nem barra, nem ponto-ponto, nem dois-pontos.
  for (const veneno of ['../../etc/passwd', 'C:\\Windows', 'a/b/c', '..', '???']) {
    const nome = nomeDaFoto(foto(veneno, 1));
    checar(
      !nome.includes('/') && !nome.includes('\\') && !nome.includes('..'),
      `o nome ${nome} virou caminho de arquivo`,
    );
    checar(nome.endsWith('.png'), `o nome ${nome} perdeu a extensão`);
  }
  // E um nome que sobra vazio ainda produz arquivo.
  checar(nomeDaFoto(foto('???', 1)) === 'pokeplace-foto-1s00.png', 'o nome vazio não virou "foto"');

  // DOIS DISPAROS SEGUIDOS DÃO NOMES DIFERENTES. É o que o centésimo existe
  // para garantir: um décimo é menos do que a distância entre dois toques no
  // mesmo botão, e nomes iguais somem um por cima do outro na pasta.
  const nomes = new Set<string>();
  for (let i = 0; i < 40; i++) nomes.add(nomeDaFoto(foto('Charmander', 10 + i * 0.05)));
  checar(nomes.size === 40, `40 disparos a 50 ms deram só ${nomes.size} nomes diferentes`);

  // O rolo é limitado e a foto é quadrada: as duas coisas que a memória do
  // headset sente, e que ninguém repara até estourar.
  checar(MAX_FOTOS > 0 && MAX_FOTOS <= 40, `o rolo guarda ${MAX_FOTOS} fotos, o que é muita memória`);
  checar(LADO_DA_FOTO >= 512 && LADO_DA_FOTO <= 2048, 'o lado da foto saiu do razoável');

  // Sem DOM, bater uma foto devolve null e não estoura. É o caminho deste
  // próprio teste, e é o que garante que a ferramenta de linha de comando não
  // quebre no dia em que alguém instanciar o jogo fora do navegador.
  const fotografo = new Fotografo(64);
  const semDom = fotografo.bater(
    null as unknown as THREE.WebGLRenderer,
    new THREE.Group(),
    new THREE.PerspectiveCamera(),
    'charmander',
    1,
  );
  checar(semDom === null, 'bater uma foto sem navegador devolveu alguma coisa');
  checar(fotografo.fotos.length === 0, 'uma foto que não existiu entrou no rolo');

  console.log(
    `   foto: ${LADO_DA_FOTO}×${LADO_DA_FOTO}, rolo de ${MAX_FOTOS}, ` +
      `nome como ${nomeDaFoto(foto('Charmander', 94.2))}`,
  );
}


// --- 41. a margem de "saiu do lugar" ---
//
// Tirar a bola e devolvê-la são o mesmo gesto em lugares diferentes, e o que os
// separa é a memória de a mão ter SAÍDO. Essa memória só era alimentada dentro
// do laço da escolha inicial, que para de rodar assim que você escolhe o
// parceiro: passado o primeiro minuto, o gesto de devolver deixava de existir e
// quem tentasse devolver arremessava.
//
// O conserto está no Jogo, que não roda sem navegador. O que se afirma aqui é o
// NÚMERO que ele usa — a margem —, porque ela tem duas maneiras de estar errada
// e as duas são silenciosas.
console.log('\n41. a margem de sair do lugar');
{
  const FOLGA = 1.6;
  const margemDoSlot = ALCANCE_SLOT * FOLGA;

  // Pequena demais não é margem: um quadro de tremor marcaria "saiu" com a mão
  // parada em cima do slot, e devolver voltaria a ser impossível de propósito.
  checar(margemDoSlot > ALCANCE_SLOT, 'a margem não é maior que o alcance — não é margem');
  checar(
    margemDoSlot - ALCANCE_SLOT > 0.03,
    `a folga é de ${((margemDoSlot - ALCANCE_SLOT) * 100).toFixed(1)} cm, menos do que a mão treme`,
  );

  // Grande demais também quebra, e de um jeito pior: se para "sair" fosse
  // preciso afastar a mão mais do que o braço alcança confortavelmente, o
  // jogador nunca marcaria saída e o gesto continuaria morto — só que agora com
  // código que parece funcionar.
  checar(
    margemDoSlot < 0.2,
    `para sair do slot é preciso afastar a mão ${(margemDoSlot * 100).toFixed(0)} cm, o que é meio braço`,
  );

  // E a mão tem de conseguir sair de TODOS os slots ao mesmo tempo: eles estão
  // a 6,6 cm um do outro ao longo do antebraço, então a margem mede contra o
  // slot mais perto, e não contra o conjunto. Afastar-se do braço resolve —
  // mas deslizar ao longo dele, não.
  checar(
    PASSO_SLOT < margemDoSlot,
    'os slots estão mais longe entre si do que a margem: deslizar de um para o outro marcaria saída',
  );

  console.log(
    `   sair do lugar: ${(margemDoSlot * 100).toFixed(1)} cm do slot mais perto ` +
      `(alcance ${(ALCANCE_SLOT * 100).toFixed(1)}, passo ${(PASSO_SLOT * 100).toFixed(1)})`,
  );
}


// --- 42. a pokébola na mão ---
//
// Dois defeitos que andavam juntos. O giro da bola nunca seguia o punho: você
// virava o pulso e ela mantinha a orientação do MUNDO, com a faixa passando de
// pé para deitada sozinha — numa esfera, é a única coisa que denuncia que ela
// não está presa à sua mão. E o lugar dela punha a superfície a um centímetro
// da origem do grip, com os dedos inteiros por dentro.
//
// O giro se confere no headset. O LUGAR se confere aqui, porque ele é
// geometria: três números contra um raio.
console.log('\n42. a pokébola na mão');
{
  const RAIO_DA_BOLA = 0.045;
  const centro = Math.hypot(NA_MAO.frente, NA_MAO.cima, NA_MAO.palma);

  // A origem do grip — o centro da mão fechada — não pode ficar DENTRO da bola.
  checar(
    centro > RAIO_DA_BOLA,
    `o centro da mão fica dentro da bola: ${(centro * 100).toFixed(1)} cm contra um raio de ${(RAIO_DA_BOLA * 100).toFixed(1)}`,
  );
  // Nem tão longe que ela flutue à frente da mão: acima de um raio e meio já
  // não é mais uma bola segurada, é uma bola acompanhando a mão.
  checar(
    centro < RAIO_DA_BOLA * 1.6,
    `a bola flutua a ${(centro * 100).toFixed(1)} cm da mão`,
  );

  // O deslocamento para o lado da PALMA existe — sem ele a bola nasce alinhada
  // com o osso do antebraço, que é onde nada fica.
  checar(NA_MAO.palma > 0.01, 'a bola não está deslocada para o lado da palma');
  // E ele é menor que o avanço: uma bola mais para o lado do que para a frente
  // sairia pela borda da mão.
  checar(NA_MAO.palma < NA_MAO.frente, 'a bola saiu para o lado mais do que para a frente');

  // O FECHAMENTO dos dedos. Punho cerrado em volta de uma esfera de nove
  // centímetros é o que punha os dedos por dentro dela; e pouco demais é uma
  // mão aberta com uma bola grudada.
  const fechamentos = { colo: 0.5, tablet: 0.46, bola: 0.64, item: 0.74, nada: 1 };
  for (const [o_que, quanto] of Object.entries(fechamentos)) {
    checar(quanto > 0 && quanto <= 1, `o fechamento de ${o_que} saiu da faixa`);
  }
  checar(
    fechamentos.bola < 1 && fechamentos.bola > 0.4,
    'a mão com a bola fecha demais ou de menos',
  );
  // Quanto MAIOR a coisa, menos a mão fecha. É a única regra que ordena os
  // quatro, e é a que impede alguém de mexer num número sem pensar nos outros.
  checar(
    fechamentos.tablet < fechamentos.colo &&
      fechamentos.colo < fechamentos.bola &&
      fechamentos.bola < fechamentos.item &&
      fechamentos.item < fechamentos.nada,
    'os fechamentos não estão ordenados pelo tamanho do que está na mão',
  );

  console.log(
    `   bola na mão: centro a ${(centro * 100).toFixed(1)} cm do punho (raio ${(RAIO_DA_BOLA * 100).toFixed(1)}), ` +
      `dedos a ${(fechamentos.bola * 100).toFixed(0)}% do fecho`,
  );
}


// --- 43. o punho fechado da mão nua ---
//
// Sem controle, fechar o punho faz as vezes do GRIP — e cada borda dispara a
// cascata inteira: pegar a bola, abraçar, catar do chão. Três coisas estavam
// erradas ao mesmo tempo, e as três são silenciosas.
console.log('\n43. o punho fechado da mão nua');
{
  /** A cadeia do dedo médio numa pose dada, do punho à ponta. */
  const dedo = (curvatura: number) => {
    // Cinco ossos de comprimentos plausíveis, dobrando progressivamente: é
    // assim que um dedo fecha — a falange de fora dobra mais que a de dentro.
    const ossos = [0.03, 0.05, 0.03, 0.02];
    const pontos = [new THREE.Vector3(0, 0, 0)];
    let angulo = 0;
    for (let i = 0; i < ossos.length; i++) {
      angulo += curvatura * (0.4 + i * 0.35);
      const anterior = pontos[pontos.length - 1];
      pontos.push(
        new THREE.Vector3(
          anterior.x,
          anterior.y + Math.cos(angulo) * ossos[i],
          anterior.z - Math.sin(angulo) * ossos[i],
        ),
      );
    }
    return pontos;
  };

  const aberta = razaoDoPunho(dedo(0))!;
  const fechada = razaoDoPunho(dedo(1.15))!;

  checar(aberta > PUNHO_ABRE, `a mão ABERTA deu razão ${aberta.toFixed(2)}, abaixo do limiar de abrir`);
  checar(fechada < PUNHO_FECHA, `o punho FECHADO deu razão ${fechada.toFixed(2)}, acima do limiar de fechar`);

  // A razão cai monotonicamente conforme o dedo enrola: se ela subisse em
  // algum ponto, haveria uma curvatura em que fechar mais abriria a mão.
  let anterior = Infinity;
  for (let c = 0; c <= 1.2; c += 0.05) {
    const r = razaoDoPunho(dedo(c))!;
    checar(r <= anterior + 1e-9, `a razão SUBIU ao fechar mais o dedo, em curvatura ${c.toFixed(2)}`);
    anterior = r;
  }

  // A HISTERESE existe e é folgada o bastante para o ruído do rastreamento.
  checar(PUNHO_ABRE > PUNHO_FECHA, 'os dois limiares estão invertidos');
  checar(
    PUNHO_ABRE - PUNHO_FECHA >= 0.08,
    `a faixa morta tem ${(PUNHO_ABRE - PUNHO_FECHA).toFixed(2)}, estreita demais para o tremor da mão`,
  );

  // A régua NÃO depende de qual junta o runtime entrega. Era o pior dos três
  // defeitos: a medida antiga usava o metacarpo e caía na falange proximal
  // quando ele faltava — e as duas estão a distâncias três vezes diferentes do
  // punho, o que fazia o mesmo gesto significar coisas opostas em dois
  // headsets. Aqui, tirar uma junta do meio quase não move o número.
  for (const curvatura of [0, 0.6, 1.15]) {
    const todas = razaoDoPunho(dedo(curvatura))!;
    const semUma = razaoDoPunho(dedo(curvatura).filter((_, i) => i !== 2))!;
    checar(
      Math.abs(todas - semUma) < 0.12,
      `faltando uma junta a razão muda de ${todas.toFixed(2)} para ${semUma.toFixed(2)} — a régua trocou de escala`,
    );
  }

  // O LATCH é assimétrico, e a ordem importa: fechar pode esperar, ABRIR não.
  // Soltar a mão é o gesto do arremesso, e a velocidade da bola sai da janela
  // dos últimos 90 ms do braço — atrasar o "abriu" faz a bola sair depois do
  // movimento, com a força de quem já estava parando.
  checar(LATCH_ABRIR_MS < LATCH_FECHAR_MS, 'abrir a mão demora mais que fechar — o arremesso sai fraco');
  checar(LATCH_ABRIR_MS < 90, `abrir espera ${LATCH_ABRIR_MS} ms, o tamanho da janela do arremesso`);
  checar(LATCH_FECHAR_MS >= 60, `fechar confirma em ${LATCH_FECHAR_MS} ms, que é menos que dois quadros de tremor`);

  checar(razaoDoPunho([new THREE.Vector3()]) === null, 'uma cadeia de um ponto devolveu razão');
  checar(
    razaoDoPunho([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]) === null,
    'uma cadeia de comprimento zero devolveu razão em vez de null',
  );

  console.log(
    `   punho: aberta ${aberta.toFixed(2)} · fechada ${fechada.toFixed(2)} · ` +
      `faixa morta ${PUNHO_FECHA}–${PUNHO_ABRE} · latch ${LATCH_FECHAR_MS}/${LATCH_ABRIR_MS} ms`,
  );
}


// --- 44. a bola do cinto para de trocar sozinha ---
//
// Os quatro slots dividem o mesmo X e o mesmo Y e estão a 6,6 cm um do outro ao
// longo do antebraço: a fronteira entre dois vizinhos fica a 3,3 cm de cada um.
// Com a mão parada ali, um milímetro de ruído trocava o slot escolhido.
//
// Isso sempre existiu e era invisível — o destaque era um booleano num objeto
// pequeno. Depois da rampa do toque a bola CRESCE e a mão VIBRA conforme o
// braço chega, e a troca sozinha passou a ser vista e sentida.
console.log('\n44. a bola do cinto para de trocar sozinha');
{
  // Quatro slots em fila, como no antebraço.
  const emFila = (mao: number) => [0, 1, 2, 3].map((i) => Math.abs(INICIO_SLOT + i * PASSO_SLOT - mao));

  const fronteira = INICIO_SLOT + PASSO_SLOT / 2;
  const alcance = ALCANCE_SLOT * 2;

  // SEM histerese (vantagem 1), o ruído troca: é o estado anterior do jogo.
  const semA = escolherSlot(emFila(fronteira - 0.001), 0, alcance, 1);
  const semB = escolherSlot(emFila(fronteira + 0.001), 0, alcance, 1);
  checar(semA !== semB, 'a fronteira de mentira não separa dois slots — o teste não vale nada');

  // COM histerese, dois milímetros de tremor não tiram o slot de quem o tinha.
  for (const ruido of [-0.005, -0.003, -0.001, 0, 0.001, 0.003, 0.005]) {
    checar(
      escolherSlot(emFila(fronteira + ruido), 0, alcance) === 0,
      `um tremor de ${(ruido * 1000).toFixed(0)} mm trocou o slot escolhido`,
    );
  }

  // Mas a mão que se MOVE de verdade troca — senão o cinto teria um slot só.
  const mexeu = escolherSlot(emFila(INICIO_SLOT + PASSO_SLOT * 0.75), 0, alcance);
  checar(mexeu === 1, `movendo três quartos do caminho até o vizinho, o slot não trocou (deu ${mexeu})`);

  // A troca acontece um pouco DEPOIS da metade: é exatamente o que a vantagem
  // compra, e é bom saber quanto ela custa em milímetros.
  let ondeTroca = 0;
  for (let d = 0; d < PASSO_SLOT; d += 0.0005) {
    if (escolherSlot(emFila(INICIO_SLOT + d), 0, alcance) !== 0) {
      ondeTroca = d;
      break;
    }
  }
  const depoisDaMetade = ondeTroca - PASSO_SLOT / 2;
  // A conta que justifica a constante: imunidade = (passo/2)·(1−v)/(1+v).
  // Abaixo de 5 mm o remédio não cobre o tremor do braço e a bola continua
  // trocando sozinha — com o conserto escrito no código, que é pior do que não
  // ter conserto. Acima de 12 a mão que anda devagar atravessa uma zona grande
  // em que nada acende.
  const previsto = (PASSO_SLOT / 2) * ((1 - VANTAGEM_DO_ESCOLHIDO) / (1 + VANTAGEM_DO_ESCOLHIDO));
  checar(
    Math.abs(depoisDaMetade - previsto) < 0.001,
    `a troca sai a ${(depoisDaMetade * 1000).toFixed(1)} mm e a conta previa ${(previsto * 1000).toFixed(1)}`,
  );
  checar(
    depoisDaMetade > 0.005 && depoisDaMetade < 0.012,
    `a imunidade é de ${(depoisDaMetade * 1000).toFixed(1)} mm, fora do útil para um braço no ar`,
  );

  // O ALCANCE é testado antes da vantagem: ela desempata entre slots que a mão
  // alcança, e não estica o braço de ninguém.
  const longe = escolherSlot(emFila(INICIO_SLOT - 0.5), 0, ALCANCE_SLOT);
  checar(longe === -1, 'a vantagem manteve escolhido um slot fora do alcance');

  // E sem nenhum anterior, é só o mais perto.
  checar(escolherSlot(emFila(fronteira - 0.001), -1, alcance) === 0, 'sem anterior, não pegou o mais perto');

  console.log(
    `   cinto: a troca sai ${(depoisDaMetade * 1000).toFixed(0)} mm depois da metade ` +
      `(passo ${(PASSO_SLOT * 100).toFixed(1)} cm, vantagem ${VANTAGEM_DO_ESCOLHIDO})`,
  );
}

  console.log(
    `   ${PEDRAS.length} pedras, ${pares} evoluções · ` +
      `${EVOLUI_SO_COM_PEDRA.size} espécies saíram da evolução por nível`,
  );
  console.log(`   Eevee: ${caminhos.join(' · ')}`);
}


// --- 45. a luva pisca o que a mão nua não sente ---
//
// Vibrar depende do atuador do gamepad, e uma fonte de hand tracking não tem
// gamepad: de mão nua TODO `sentir()` cai no vazio. Metade do vocabulário do
// jogo — pegou, recusado, acertou, levou, marcou — simplesmente não existe
// para quem larga os controles.
//
// O flash da luva substitui a vibração herdando a FORMA dela, que é o que a
// própria tabela de TATO diz distinguir um padrão do outro. Forma é tabela: dá
// para conferir sem headset e sem WebGL.
console.log('\n45. a luva pisca o que a mão nua não sente');
{
  // 'recusado' é o único de duas batidas, e é de propósito.
  const naoFila = filaDePiscadas(TATO.recusado);
  checar(naoFila.length === 2, `o 'não' virou ${naoFila.length} flashes, e não dois`);
  checar(naoFila[0].em === 0, 'o primeiro flash não sai na hora');

  // O espaçamento é o MESMO da vibração: mesma constante, dos dois lados.
  const esperado = (TATO.recusado[0][1] + RESPIRO_DE_PULSO_MS) / 1000;
  checar(
    Math.abs(naoFila[1].em - esperado) < 1e-9,
    `o segundo flash sai em ${naoFila[1].em}s, e a segunda vibração em ${esperado}s`,
  );

  // Cada um dos cinco padrões vira exatamente os seus pulsos, na ordem — e
  // nenhum flash dura menos que o piso, senão ele não chega a virar imagem.
  for (const [nome, pulsos] of Object.entries(TATO)) {
    const fila = filaDePiscadas(pulsos);
    checar(fila.length === pulsos.length, `'${nome}' mudou de forma no flash`);
    for (let i = 0; i < fila.length; i++) {
      checar(fila[i].forca === pulsos[i][0], `'${nome}': o flash ${i} mudou de força`);
      checar(fila[i].segundos > 0, `'${nome}': o flash ${i} não dura nada`);
    }
  }

  // O piso vale onde ele não brigar com a batida seguinte.
  for (const nome of ['pegou', 'acertou', 'levou', 'marcou'] as const) {
    const [unico] = filaDePiscadas(TATO[nome]);
    checar(
      unico.segundos * 1000 >= PISO_DO_FLASH_MS - 1e-9,
      `'${nome}' pisca por ${(unico.segundos * 1000).toFixed(0)} ms — menos que um quadro e meio`,
    );
  }

  // E 'levou' continua o mais arrastado dos cinco: o piso levanta os curtos,
  // não achata os longos.
  const duracao = (nome: keyof typeof TATO) => filaDePiscadas(TATO[nome])[0].segundos;
  for (const nome of ['pegou', 'acertou', 'marcou', 'recusado'] as const) {
    checar(duracao('levou') > duracao(nome), `'levou' não ficou mais longo que '${nome}'`);
  }

  // As duas batidas do 'não' não se encostam: sobra escuro entre elas.
  const escuro = naoFila[1].em - (naoFila[0].em + naoFila[0].segundos);
  checar(escuro > 0.04, `sobram ${(escuro * 1000).toFixed(0)} ms de escuro entre as duas batidas`);

  // A escala é o volume, e não a forma: com controle na mão o flash é reforço.
  const fraco = filaDePiscadas(TATO.recusado, 0.35);
  checar(fraco.length === naoFila.length, 'a escala mudou a forma');
  checar(Math.abs(fraco[0].forca - naoFila[0].forca * 0.35) < 1e-9, 'a escala não escalou');
  checar(fraco[0].em === naoFila[0].em, 'a escala mexeu no tempo');

  // E agora a luva de verdade, quadro a quadro, sem navegador nenhum: o
  // arquivo da mão não baixa aqui, então quem desenha é a luva de reserva — que
  // é exatamente o caminho de quem está sem rede.
  // O arquivo da mão não baixa no Node, e ele avisa — de forma ASSÍNCRONA, o
  // que quer dizer que devolver o `console.warn` logo depois do construtor não
  // adianta: o aviso chega ticks depois, no meio da saída de outro teste. Então
  // o filtro é por mensagem e fica de pé. Não é um erro escondido: é o caminho
  // de reserva sendo exercido, que é justamente o que esta seção quer testar.
  const gritar = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('não carregou')) return;
    gritar(...args);
  };
  const luva = new Luva('left', 0x4aa3ff);

  // O material do pano, lido da cena: é a prova de que o flash chega ao pixel
  // e não morre num número privado.
  let pano: THREE.MeshStandardMaterial | null = null;
  luva.grupo.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && m.isMeshStandardMaterial && m.color.getHex() === 0xf5f6fa) pano = m;
  });
  checar(pano !== null, 'não achei o material da luva na cena');
  const repouso = pano ? (pano as THREE.MeshStandardMaterial).emissiveIntensity : NaN;

  const picos = (padrao: keyof typeof TATO) => {
    luva.piscar(TATO[padrao]);
    let contados = 0;
    let aceso = false;
    let maior = 0;
    // Meio segundo a 72 Hz: cabe o padrão mais longo com folga.
    for (let q = 0; q < 36; q++) {
      luva.atualizarBrilho(1 / 72);
      const b = luva.brilhoAtual;
      maior = Math.max(maior, b);
      if (!aceso && b > 0.05) {
        aceso = true;
        contados++;
      } else if (aceso && b <= 0.001) {
        aceso = false;
      }
    }
    return { contados, maior };
  };

  const nao = picos('recusado');
  checar(nao.contados === 2, `o 'não' acendeu ${nao.contados} vezes na luva, e não duas`);
  const sim = picos('pegou');
  checar(sim.contados === 1, `o 'pegou' acendeu ${sim.contados} vezes, e não uma`);
  checar(
    picos('acertou').maior > picos('marcou').maior,
    'o golpe não brilhou mais que a confirmação mais leve',
  );

  // Terminado o padrão, a luva volta EXATAMENTE ao repouso: um flash que não
  // apaga vira uma mão permanentemente mais clara a cada pokébola pega.
  for (let q = 0; q < 60; q++) luva.atualizarBrilho(1 / 72);
  checar(luva.brilhoAtual === 0, 'a luva ficou acesa depois do padrão');
  checar(
    pano !== null && (pano as THREE.MeshStandardMaterial).emissiveIntensity === repouso,
    'o emissivo não voltou ao repouso',
  );

  // O flash NÃO some quando a mão está nua: quem o atualiza é o quadro, e não
  // `definirDedos` — que só roda quando há controle. Este era o furo.
  luva.definirModo(true);
  luva.piscar(TATO.pegou);
  luva.atualizarBrilho(1 / 72);
  checar(luva.brilhoAtual > 0.05, 'de mão nua o flash não acendeu');

  luva.descartar();
  console.log(
    `   flash: 'não' em ${nao.contados} batidas a ${(esperado * 1000).toFixed(0)} ms ` +
      `· repouso ${repouso} · pico ${nao.maior.toFixed(2)}`,
  );
}

// --- 46. o achado em cima do móvel não se pega sozinho ---
//
// `colher` rodava no laço de quadro: bastava a mão PASSAR perto da poção e ela
// sumia — creditada, com som e cartaz, sem nenhum gesto seu. Um item que se
// pega sozinho não é um item que você achou; é um item que aconteceu com você.
//
// E o getter `posicao` não tinha consumidor nenhum: a dica de aproximação que o
// comentário prometia nunca foi escrita. As duas coisas são a mesma: sem
// destaque, pegar por GRIP vira 'não pega e você não sabe por quê'.
console.log('\n46. o achado em cima do móvel não se pega sozinho');
{
  const cena = new THREE.Group();
  const sala = new Sala(new THREE.Group());
  // Uma mesa a dois metros: longe o bastante para o achado nascer (ele nunca
  // nasce a menos de um metro e meio de você) e em cima de móvel, nunca no chão.
  sala.superficies = [
    {
      centro: new THREE.Vector3(2, 0.74, 0),
      meiaLargura: 0.6,
      meiaProfundidade: 0.6,
      rotacaoY: 0,
      rotulo: 'other',
      altura: 0.74,
      area: 1.44,
      movel: 'mesa',
    },
  ];

  const jogador = new THREE.Vector3(0, 1.6, 0);
  const achados = new Achados(cena);

  // Espera o item nascer. A espera inicial é de 25 s, e num quarto sem móvel
  // ele reagenda de 12 em 12 — aqui tem mesa, então sai na primeira tentativa.
  for (let q = 0; q < 60 * 30 && !achados.tipoNaSala; q++) achados.atualizar(1 / 60, sala, jogador);
  checar(achados.tipoNaSala !== null, 'o achado não nasceu em cima da mesa em trinta segundos');

  const onde = achados.posicao;
  checar(onde !== null, 'o achado nasceu sem posição');
  checar(onde !== null && onde.y > 0.5, `o achado nasceu a ${onde?.y.toFixed(2)} m — isso é chão`);

  // (1) A MÃO PASSANDO POR CIMA NÃO PEGA NADA. Este é o bug.
  const emCima = (onde as THREE.Vector3).clone();
  for (let q = 0; q < 120; q++) {
    // Varre a mão pela poção, indo e vindo, como um braço que passa perto.
    const x = Math.sin(q * 0.2) * 0.3;
    const mao = emCima.clone().add(new THREE.Vector3(x, 0, 0));
    const d = (achados.posicao as THREE.Vector3).distanceTo(mao);
    achados.aproximar(forcaDeToque(d, ALCANCE_ACHADO, AVISO.achado));
    achados.atualizar(1 / 60, sala, jogador);
  }
  checar(achados.tipoNaSala !== null, 'a mão passou perto e o achado sumiu sozinho');

  // (2) E A APROXIMAÇÃO TEM RESPOSTA. O objeto cresce com a mão chegando: é o
  // aviso de que o gesto vai funcionar, sem o qual o GRIP é adivinhação.
  const tamanho = () => {
    let maior = 0;
    cena.traverse((o) => {
      maior = Math.max(maior, o.scale.x);
    });
    return maior;
  };
  // Longe: só o repouso.
  for (let q = 0; q < 5; q++) achados.atualizar(1 / 60, sala, jogador);
  const parado = tamanho();
  checar(parado > 1.2, `o achado está a ${parado.toFixed(2)} de escala — o tamanho dele não sobreviveu ao quadro`);

  // Com a mão em cima: cresce.
  achados.aproximar(forcaDeToque(0, ALCANCE_ACHADO, AVISO.achado));
  achados.atualizar(1 / 60, sala, jogador);
  const perto = tamanho();
  checar(perto > parado * 1.1, `a mão em cima levou a escala de ${parado.toFixed(2)} a ${perto.toFixed(2)}`);

  // E solta: a amplitude é do quadro, não um estado que fica ligado.
  achados.atualizar(1 / 60, sala, jogador);
  checar(Math.abs(tamanho() - parado) < 1e-6, 'o destaque ficou ligado depois de a mão sair');

  // A rampa é rampa: na borda da banda de aviso não há nada, e dentro do
  // alcance de agarre ela satura.
  checar(forcaDeToque(AVISO.achado, ALCANCE_ACHADO, AVISO.achado) === 0, 'a rampa do achado não começa em zero');
  checar(forcaDeToque(ALCANCE_ACHADO, ALCANCE_ACHADO, AVISO.achado) === 1, 'a rampa do achado não satura no agarre');

  // (3) SÓ O GESTO PEGA — e de longe ele não pega, que é a outra metade.
  const longe = (achados.posicao as THREE.Vector3).clone().add(new THREE.Vector3(0.5, 0, 0));
  checar(achados.colher(longe) === null, 'o GRIP pegou o achado de meio metro de distância');
  checar(achados.tipoNaSala !== null, 'o achado sumiu num GRIP que foi recusado');

  const tipo = achados.colher((achados.posicao as THREE.Vector3).clone());
  checar(tipo !== null, 'o GRIP em cima do achado não pegou nada');
  checar(achados.tipoNaSala === null, 'o achado foi colhido e continua na sala');
  checar(achados.posicao === null, 'a sala vazia ainda devolve uma posição');

  achados.descartar();
  console.log(
    `   achado: agarre ${(ALCANCE_ACHADO * 100).toFixed(0)} cm · aviso ${(AVISO.achado * 100).toFixed(0)} cm ` +
      `· escala ${parado.toFixed(2)} → ${perto.toFixed(2)} com a mão em cima`,
  );
}

// --- 47. nenhum comando existe só em botão ---
//
// Uma fonte de hand tracking NÃO TEM GAMEPAD: `Mao.apertou()` lê um array
// vazio, e todo comando que só existisse num botão A ou B simplesmente não
// existia para quem larga os controles. Eram quatro:
//
//   mochila · chamar para perto · bater foto · responder a evolução
//
// O último era o pior: a pergunta da evolução é MODAL, então o jogo parava com
// um cartaz na frente do rosto que não havia gesto no mundo capaz de responder.
//
// Isto se confere no FONTE porque o invariante é estrutural — é sobre haver ou
// não um segundo caminho —, e é assim que ele pega a regressão que importa:
// alguém acrescentar o comando vinte e dois só no botão.
console.log('\n47. nenhum comando existe só em botão');
{
  const fonte = readFileSync('src/game.ts', 'utf8');

  /** O corpo de um método, do `{` dele até a chave que fecha. */
  const corpoDe = (nome: string): string => {
    const cabeca = fonte.indexOf(`private ${nome}(`);
    if (cabeca < 0) return '';
    let i = fonte.indexOf('{', cabeca);
    let nivel = 0;
    for (let j = i; j < fonte.length; j++) {
      if (fonte[j] === '{') nivel++;
      else if (fonte[j] === '}') {
        nivel--;
        if (nivel === 0) return fonte.slice(i, j + 1);
      }
    }
    return '';
  };

  // Os dois lugares onde um botão é lido. Fora deles é caminho sem botão.
  const botoes = corpoDe('botoesDaMao');
  const calibra = corpoDe('calibrarComOAnalogico');
  checar(botoes.length > 200, 'não achei o corpo de botoesDaMao — o teste não vale nada');
  checar(botoes.includes('BOTAO_A'), 'botoesDaMao não lê botão nenhum — o teste está olhando para o lugar errado');

  // Nenhum outro lugar do jogo pode ler botão: o dia em que ler, este teste
  // para de cobrir o comando que estiver lá.
  const lendoBotao = (fonte.match(/apertou\(BOTAO_/g) ?? []).length;
  const aqui = (botoes.match(/apertou\(BOTAO_/g) ?? []).length + (calibra.match(/apertou\(BOTAO_/g) ?? []).length;
  checar(
    lendoBotao === aqui,
    `${lendoBotao - aqui} leituras de botão moram fora de botoesDaMao — o teste não as cobre`,
  );

  /**
   * Cada comando de botão e o método que faz a MESMA coisa sem botão.
   *
   * Recolher é o único que muda de método: no painel do pulso, escolher quem já
   * está em campo recolhe ele de volta — mesma consequência, outro caminho.
   */
  const CAMINHOS: ReadonlyArray<readonly [string, string]> = [
    ['alternarMochila', 'alternarMochila'],
    ['chamarParaPerto', 'chamarParaPerto'],
    ['baterFoto', 'baterFoto'],
    ['alternarPc', 'alternarPc'],
    ['permitirEvolucao', 'permitirEvolucao'],
    ['recusarEvolucao', 'recusarEvolucao'],
    ['recolherApontando', 'escolherDoTime'],
  ];

  for (const [comando, semBotao] of CAMINHOS) {
    checar(fonte.includes(`private ${comando}(`), `o comando ${comando} sumiu do jogo`);
    const todas = (fonte.match(new RegExp(`this\\.${semBotao}\\(`, 'g')) ?? []).length;
    const noBotao = (botoes.match(new RegExp(`this\\.${semBotao}\\(`, 'g')) ?? []).length;
    checar(
      todas - noBotao > 0,
      `${comando} só existe no botão: ${semBotao} nunca é chamado fora de botoesDaMao`,
    );
  }

  // E os dois caminhos novos passam pelo painel do pulso, que abre por GESTO —
  // o de olhar as horas — e por isso existe de mão nua.
  for (const carta of ['mochila', 'chamar']) {
    checar(
      fonte.includes(`selecao.tipo === '${carta}'`),
      `a carta '${carta}' não responde ao gatilho no painel`,
    );
    checar(
      fonte.includes(`alcancado.tipo === '${carta}'`),
      `a carta '${carta}' não responde à mão que a toca`,
    );
  }

  // A pergunta da evolução: o cartaz tem lado sob a mira, e o gatilho o resolve.
  checar(
    fonte.includes('this.promptEvolucao.apontado'),
    'a pergunta da evolução voltou a não ter alvo de mira',
  );
  const gatilho = corpoDe('puxarGatilho');
  checar(
    gatilho.includes('permitirEvolucao') && gatilho.includes('recusarEvolucao'),
    'o gatilho não responde mais à pergunta da evolução',
  );
  // Antes de TUDO no gatilho: a pergunta é modal, e o que vier antes dela a
  // engoliria — foi assim que ela nasceu presa ao botão.
  checar(
    gatilho.indexOf('permitirEvolucao') < gatilho.indexOf('this.escolha'),
    'a pergunta da evolução deixou de ser a primeira coisa que o gatilho resolve',
  );

  // E a foto sai pelo gatilho da mão LIVRE, nunca pela que segura a Pokédex:
  // de mão nua, segurar é punho fechado, e punho fechado é polegar encostado no
  // indicador — que é o que o runtime chama de pinça.
  const dex = corpoDe('narrarDaDex');
  checar(dex.includes('this.baterFoto('), 'o obturador saiu do gatilho da Pokédex');
  checar(
    dex.includes('mao.indice !== this.tablet.naMaoDe'),
    'a mão que SEGURA a Pokédex voltou a poder disparar o obturador',
  );

  console.log(
    `   ${CAMINHOS.length} comandos de botão, ${CAMINHOS.length} caminhos sem botão ` +
      `· ${lendoBotao} leituras de A/B, todas em botoesDaMao`,
  );
}

// --- 48. ficar sem ninguém de pé tem saída, e ela está escrita ---
//
// O cartaz de desmaio dizia "escolha outro no painel" sem olhar se havia
// outro. Com o time inteiro caído, seguir a instrução levava ao segundo
// cartaz — "está desmaiado, ele se recupera com o tempo" —, que é verdade e
// não é uma saída: não diz quanto tempo, não diz onde, e não menciona nenhuma
// das DUAS curas que o jogo tem.
//
// O jogo não travava: a regeneração devolve 1 de HP a cada 2,5 s. Mas parecia
// travado, e num jogo em que tudo o mais responde ao gesto, parecer travado
// basta para a pessoa tirar o headset.
console.log('\n48. ficar sem ninguém de pé tem saída, e ela está escrita');
{
  // Um time vazio NÃO está caído: antes de escolher o inicial isso é outra
  // tela, com outro texto, e confundir as duas daria a saída errada.
  checar(timeCaido([]) === false, 'time vazio contou como caído');
  checar(timeCaido([0]) === true, 'um único bicho desmaiado não contou como time caído');
  checar(timeCaido([0, 0, 0]) === true, 'três desmaiados não contaram como time caído');
  checar(timeCaido([0, 1, 0]) === false, 'um de pé no meio de dois caídos contou como time caído');
  checar(timeCaido([12, 30]) === false, 'time inteiro contou como caído');
  // HP negativo existe: o golpe que derruba passa do zero.
  checar(timeCaido([-7]) === true, 'HP negativo não contou como caído');

  // A saída depende de haver um Centro plantado — e há quarto que o headset
  // não mapeia, e há quem jogue sentado e nunca chegue ao móvel.
  checar(saidaDoTimeCaido(true) === 'centro', 'com Centro plantado, a saída não foi o Centro');
  checar(saidaDoTimeCaido(false) === 'pc', 'sem Centro, a saída não foi o PC');

  // E os dois cartazes de desmaio passaram a perguntar antes de mandar.
  const fonte = readFileSync('src/game.ts', 'utf8');
  const corpoDe = (nome: string): string => {
    const cabeca = fonte.indexOf(`private ${nome}(`);
    if (cabeca < 0) return '';
    const i = fonte.indexOf('{', cabeca);
    let nivel = 0;
    for (let j = i; j < fonte.length; j++) {
      if (fonte[j] === '{') nivel++;
      else if (fonte[j] === '}') {
        nivel--;
        if (nivel === 0) return fonte.slice(i, j + 1);
      }
    }
    return '';
  };

  const escolher = corpoDe('escolherDoTime');
  checar(escolher.length > 200, 'não achei escolherDoTime — o teste não vale nada');
  checar(
    escolher.includes('this.timeTodoCaido'),
    'escolher um desmaiado voltou a não olhar se há outro para escolher',
  );
  checar(
    (fonte.match(/this\.contarSaidaDoTimeCaido\(/g) ?? []).length >= 2,
    'a saída só é contada em um lugar — o outro cartaz de desmaio ficou mudo',
  );
  checar(
    corpoDe('atualizarTimeCaido').includes('this.centro.chamar('),
    'o Centro deixou de chamar enquanto o time está caído',
  );

  // --- e nenhum cartaz manda apertar um botão que a mão pode não ter ---
  //
  // Segue o item 5.1: uma fonte de hand tracking não tem gamepad, e um cartaz
  // que manda apertar A é, para quem largou os controles, uma instrução
  // impossível — pior do que instrução nenhuma.
  //
  // Duas maneiras de um texto desses ser legítimo, e só duas:
  //
  // - ele mora num caminho que SÓ existe por botão (`recolherApontando` é
  //   alcançável apertando A e mais nada: quem o lê tem controle, por
  //   construção);
  // - ou ele está atrás de uma guarda `comBotao`, que é o jogo perguntando se
  //   há controle antes de falar de botão.
  //
  // A segunda é verificada pela GUARDA, e não pelo método: pôr o método numa
  // lista de exceções deixaria a linha voltar a ser incondicional sem ninguém
  // notar, que é exatamente como ela chegou até aqui.
  const COM_BOTAO_NA_MAO = ['recolherApontando'];
  const permitidos = COM_BOTAO_NA_MAO.map(corpoDe);
  const impossivel = /texto: '[^']*(aperte [AB]\b|\b[AB] abre|bot[ãa]o [AB]\b)/g;
  const achadas: string[] = [];
  let comGuarda = 0;
  for (const m of fonte.matchAll(impossivel)) {
    const trecho = m[0];
    if (permitidos.some((corpo) => corpo.includes(trecho))) continue;
    // A guarda tem de estar perto: no ternário logo acima, não a trezentas
    // linhas de distância em outro método.
    if (fonte.slice(Math.max(0, (m.index ?? 0) - 300), m.index).includes('comBotao')) {
      comGuarda++;
      continue;
    }
    achadas.push(trecho.replace("texto: '", ''));
  }
  checar(
    achadas.length === 0,
    `cartaz mandando apertar botão que a mão nua não tem: ${achadas.join(' · ')}`,
  );
  checar(comGuarda > 0, 'nenhum cartaz de botão está atrás de uma guarda — o teste ficou vazio');

  console.log(
    `   time caído: saída pelo ${saidaDoTimeCaido(true)} quando há Centro, pelo ` +
      `${saidaDoTimeCaido(false)} quando não há · ${comGuarda} cartaz de botão atrás de guarda, ` +
      `${COM_BOTAO_NA_MAO.length} num caminho que só o botão abre`,
  );
}

// --- 49. sair e voltar não deixa o quarto no lugar errado ---
//
// Sair da realidade mista e entrar de novo abre uma sessão NOVA, com um espaço
// de referência novo: no `local-floor` a origem nasce onde você está no
// instante em que entra, virada para onde você estiver olhando. E a página não
// recarrega nessa volta — o `Jogo` é o mesmo objeto, com o mesmo mapa.
//
// Resultado, na segunda entrada: o quarto inteiro deslocado. Selvagens dentro
// do sofá de verdade, pokébolas no meio do ar, o Centro plantado fora do chão.
// Nada dá erro, nada avisa, e a única saída era recarregar a página.
console.log('\n49. sair e voltar não deixa o quarto no lugar errado');
{
  // A sondagem encenada da seção 17: um raio que sempre acerta o chão em y = 0.
  // É o que carimba as CÉLULAS — a parte do mapa que só existe aqui dentro e
  // que nada reescreve, e portanto a que não tem salvação depois da sessão.
  (globalThis as Record<string, unknown>).XRRay = class {};
  const sessao = {
    requestReferenceSpace: async () => ({}),
    requestHitTestSource: async () => ({ cancel() {} }),
  };
  const frame = {
    getHitTestResults: () => [{ getPose: () => ({ transform: { position: { y: 0 } } }) }],
  };
  const espaco = {} as XRReferenceSpace;

  const sala = new Sala(new THREE.Group());
  await sala.prepararSondagem(sessao as unknown as XRSession);
  const jogador = new THREE.Vector3(0, 1.6, 0);

  // Mede o chão a passos, como a sondagem faz enquanto você anda.
  for (let passo = 0; passo < 8; passo++) {
    jogador.x += 1.1;
    sala.atualizar(frame as unknown as XRFrame, espaco, jogador);
  }
  // E um móvel, como o Space Setup entrega.
  sala.superficies = [
    ...sala.superficies,
    {
      centro: new THREE.Vector3(2, 0.74, 0),
      meiaLargura: 0.5,
      meiaProfundidade: 0.5,
      rotacaoY: 0,
      rotulo: 'other',
      altura: 0.74,
      area: 1,
      movel: 'mesa',
    },
  ];

  const antes = sala.mapeadas;
  checar(antes > 1, `andar oito passos mapeou ${antes} superfícies — o teste não vale nada`);
  checar(sala.pousoPerto(jogador, ['mesa'], 12) !== null, 'a mesa não entrou no mapa');

  // A sessão acabou. As coordenadas morreram com ela.
  sala.esquecerMedidas();

  checar(sala.mapeadas === 0, `sobraram ${sala.mapeadas} superfícies do mundo anterior`);
  checar(sala.superficies.length === 0, 'a lista achatada ficou com as superfícies velhas');
  checar(sala.temDadosReais === false, 'a sala continua achando que tem dados reais do aparelho');
  checar(sala.pisoY === 0, `o piso ficou em ${sala.pisoY} — no espaço novo, y = 0 é o seu chão`);
  checar(sala.pousoPerto(jogador, ['mesa'], 12) === null, 'a mesa do mundo anterior ainda é achada');

  // E a sala volta a funcionar do zero: o fallback assume, e o jogo tem chão
  // onde nascer enquanto o quarto é remedido.
  sala.usarFallback(jogador);
  checar(sala.pontoDeSpawn(jogador) !== null, 'depois de esquecer, não há mais onde nascer');

  // Medir de novo repovoa: esquecer não é quebrar.
  for (let passo = 0; passo < 4; passo++) {
    jogador.z += 1.1;
    sala.atualizar(frame as unknown as XRFrame, espaco, jogador);
  }
  checar(sala.mapeadas > 0, 'a sala não volta a mapear depois de esquecer');

  // --- e o jogo pede isso na saída ---
  const fonte = readFileSync('src/game.ts', 'utf8');
  const corpoDe = (nome: string, arquivo = fonte): string => {
    const cabeca = arquivo.indexOf(`${nome}(`);
    if (cabeca < 0) return '';
    const i = arquivo.indexOf('{', cabeca);
    let nivel = 0;
    for (let j = i; j < arquivo.length; j++) {
      if (arquivo[j] === '{') nivel++;
      else if (arquivo[j] === '}') {
        nivel--;
        if (nivel === 0) return arquivo.slice(i, j + 1);
      }
    }
    return '';
  };

  const saida = corpoDe('aoSairDaSessao');
  checar(saida.length > 200, 'não achei aoSairDaSessao — o jogo não limpa nada ao sair');
  // Tudo o que tem lugar no quarto tem de ir embora junto com o espaço.
  for (const [o_que, chamada] of [
    ['o mapa do quarto', 'this.sala.esquecerMedidas()'],
    ['o Centro plantado', 'this.centro.desplantar()'],
    ['os itens em cima dos móveis', 'this.achados.descartar()'],
    ['o companheiro em campo', 'this.removerCompanheiro()'],
    ['os selvagens', 'this.removerSelvagem('],
    ['a Pokédex caída', 'this.tablet.guardar()'],
  ] as const) {
    checar(saida.includes(chamada), `${o_que} sobrevive à saída da sessão`);
  }
  // E o que é SEU fica: a vida do bicho em campo é a única que não está salva.
  checar(saida.includes('this.dex.definirHp('), 'sair com o bicho machucado o devolveria inteiro');

  const principal = readFileSync('src/main.ts', 'utf8');
  checar(
    principal.includes('jogo.aoSairDaSessao()'),
    'o evento de fim de sessão não avisa o jogo — a limpeza existe e ninguém a chama',
  );

  console.log(
    `   ${antes} superfícies medidas · 0 depois de sair · e o mapa volta a crescer na entrada seguinte`,
  );
}

// --- 50. desmaiar custa alguma coisa ---
//
// A regeneração fora de campo é de 1 de HP a cada 2,5 s, e ela não olhava se o
// bicho estava MACHUCADO ou CAÍDO. Um Pokémon que acabava de desmaiar voltava
// a ter 1 de vida dois segundos e meio depois — e 1 de vida já basta para ele
// voltar a campo.
//
// Três coisas morriam nisso de uma vez: desmaiar não custava nada; o Centro
// Pokémon, que existe para dar geografia ao cômodo, virava enfeite; e o aviso
// de time caído (seção 48) piscava e sumia antes de alguém entender o que
// fazer com ele.
console.log('\n50. desmaiar custa alguma coisa');
{
  const AGORA = 1_700_000_000_000;
  const MS = LEVANTAR_SEGUNDOS * 1000;

  // Acabou de cair: fica caído.
  checar(podeLevantar(AGORA, AGORA) === false, 'o bicho se levantou no instante em que caiu');
  checar(podeLevantar(AGORA, AGORA + 2500) === false, 'dois segundos e meio bastaram — é o bug');
  checar(podeLevantar(AGORA, AGORA + MS - 1) === false, 'levantou um milissegundo antes da hora');
  checar(podeLevantar(AGORA, AGORA + MS) === true, 'não levantou na hora exata');
  checar(podeLevantar(AGORA, AGORA + MS * 10) === true, 'dez minutos depois, ainda caído');

  // Gravação antiga, sem o campo: o jogo SOLTA. Prender o time de quem já
  // jogava, sem explicação, seria o pior resultado possível desta mudança.
  checar(podeLevantar(undefined, AGORA) === true, 'um save sem o campo prendeu o time');
  checar(segundosParaLevantar(undefined, AGORA) === 0, 'um save sem o campo pediu espera');

  // A conta regressiva é para LER: arredonda para cima, e nunca mostra zero
  // enquanto ainda falta. "0s" com o bicho ainda caído é a pior mentira que um
  // contador pode contar.
  checar(segundosParaLevantar(AGORA, AGORA) === LEVANTAR_SEGUNDOS, 'a conta não começa cheia');
  checar(segundosParaLevantar(AGORA, AGORA + 1000) === LEVANTAR_SEGUNDOS - 1, 'a conta não anda');
  checar(segundosParaLevantar(AGORA, AGORA + MS - 100) === 1, 'a conta chegou a zero antes da hora');
  checar(segundosParaLevantar(AGORA, AGORA + MS) === 0, 'a conta não zerou na hora');
  checar(segundosParaLevantar(AGORA, AGORA + MS * 3) === 0, 'a conta ficou negativa');

  // --- o invariante: vida acima de zero ⟺ sem relógio de queda ---
  //
  // Três caminhos escrevem vida, e dois são fáceis de esquecer: subir de nível
  // cura a diferença de HP máximo, e evoluir nunca deixa o bicho abaixo de 1.
  // Ninguém pensa em "evoluir" como uma forma de curar.
  const dex = new Dex();
  dex.limpar();
  dex.receberInicial('charmander');
  const meu = dex.time[0]!;

  checar(meu.caiuEm === undefined, 'o inicial nasceu com relógio de queda');

  dex.definirHp(meu, 0);
  checar(meu.caiuEm !== undefined, 'cair não marcou a hora');
  const quandoCaiu = meu.caiuEm;

  // Cair de novo não reinicia a contagem: quem já está no chão não cai mais.
  dex.definirHp(meu, 0);
  checar(meu.caiuEm === quandoCaiu, 'levar dano no chão reiniciou a contagem');

  // Qualquer vida acima de zero solta o relógio.
  dex.definirHp(meu, 5);
  checar(meu.caiuEm === undefined, 'curar não soltou o relógio da queda');

  // Subir de nível cura a diferença — e isso conta como se levantar.
  dex.definirHp(meu, 0);
  dex.ganharXp(meu, 100000);
  checar(
    meu.hp <= 0 || meu.caiuEm === undefined,
    'subiu de nível, ganhou vida, e continuou marcado como caído',
  );

  // Evoluir nunca deixa abaixo de 1: um bicho caído que evolui está de pé.
  dex.definirHp(meu, 0);
  dex.evoluir(meu, 'charmeleon');
  checar(meu.hp >= 1, 'evoluir deixou o bicho com zero de vida');
  checar(meu.caiuEm === undefined, 'evoluiu, levantou, e continuou marcado como caído');

  // E o Centro (e o PC) curam na hora, relógio incluído.
  dex.definirHp(meu, 0);
  checar(meu.caiuEm !== undefined, 'o teste não conseguiu derrubar o bicho');
  dex.curarTime();
  checar(meu.hp === dex.hpMaxDe(meu), 'o Centro não curou tudo');
  checar(meu.caiuEm === undefined, 'o Centro curou e deixou o relógio preso — o próximo tombo levantaria na hora');

  // --- e a regeneração pergunta antes ---
  const fonte = readFileSync('src/game.ts', 'utf8');
  const regen = fonte.slice(fonte.indexOf('private regenerarTime('));
  checar(
    regen.slice(0, 900).includes('podeLevantar('),
    'a regeneração voltou a levantar desmaiado em dois segundos e meio',
  );

  console.log(
    `   caído: ${LEVANTAR_SEGUNDOS}s para levantar sozinho · Centro e PC curam na hora ` +
      `· machucado continua a 1 HP por 2,5s`,
  );
}

// --- 51. o jogo mede a si mesmo, e entrega o número na saída ---
//
// O item 0.1 — "o orçamento de quadro, medido uma vez" — é o mais antigo do
// roteiro e o único que nunca andou. A razão não é preguiça: ele pedia que uma
// pessoa com o headset na cabeça ligasse o contador, ficasse parada lendo uma
// plaquinha, invocasse três selvagens e lesse de novo, abrisse o painel e
// lesse de novo, abrisse a mochila e lesse de novo, e DECORASSE quatro pares
// de números para anotar depois.
//
// Um número que depende de alguém decorar quatro medidas é um número que não
// vai existir. Agora o jogo anota sozinho e entrega a tabela na saída.
console.log('\n51. o jogo mede a si mesmo, e entrega o número na saída');
{
  const d = new Diario();

  // Cem quadros folgados e cinco trancos, no mesmo cenário.
  for (let i = 0; i < 95; i++) d.registrar('parado', 8, 40);
  for (let i = 0; i < 5; i++) d.registrar('parado', 30, 40);
  const parado = d.resumo().find((r) => r.cenario === 'parado')!;

  checar(parado !== undefined, 'o diário não anotou nada');
  checar(parado.quadros === 100, `anotou ${parado.quadros} quadros em vez de 100`);
  // A média sai da soma EXATA, e não do histograma: (95×8 + 5×30) / 100 = 9,1.
  checar(Math.abs(parado.mediaMs - 9.1) < 1e-9, `a média deu ${parado.mediaMs} em vez de 9,1`);

  // O p95 é o tranco que o corpo sente, não o máximo da sessão: com 5% de
  // quadros ruins, ele fica na borda de cima dos BONS.
  checar(
    parado.p95Ms >= 8 && parado.p95Ms <= 8 + BALDE_MS + 1e-9,
    `o p95 deu ${parado.p95Ms} ms — devia ficar na borda dos quadros de 8 ms`,
  );
  checar(parado.piorMs === 30, `o pior caso deu ${parado.piorMs} em vez de 30`);
  checar(parado.chamadas === 40, `as draw calls deram ${parado.chamadas} em vez de 40`);

  // Piorando a proporção, o p95 acompanha: com 10% de trancos, um em cada vinte
  // quadros JÁ é tranco.
  const d2 = new Diario();
  for (let i = 0; i < 90; i++) d2.registrar('parado', 8, 40);
  for (let i = 0; i < 10; i++) d2.registrar('parado', 30, 40);
  const pior = d2.resumo()[0];
  checar(pior.p95Ms > 20, `com 10% de trancos o p95 continuou em ${pior.p95Ms} ms`);

  // Um quadro absurdo não some da tabela, mas também não vira o p95: é o
  // modelo que terminou de baixar, e não se otimiza contra um evento único.
  const d3 = new Diario();
  for (let i = 0; i < 999; i++) d3.registrar('parado', 9, 30);
  d3.registrar('parado', 850, 30);
  const raro = d3.resumo()[0];
  checar(raro.piorMs === 850, 'o quadro absurdo sumiu do pior caso');
  checar(raro.p95Ms < 12, `um único quadro de 850 ms levou o p95 a ${raro.p95Ms} ms`);
  // Acima do teto do histograma ele ainda conta no total e na média.
  checar(raro.quadros === 1000, 'o quadro acima do teto do histograma não foi contado');

  // Lixo não entra: um dt de zero ou NaN é um quadro que não aconteceu.
  const d4 = new Diario();
  d4.registrar('parado', 0, 10);
  d4.registrar('parado', -5, 10);
  d4.registrar('parado', NaN, 10);
  d4.registrar('parado', Infinity, 10);
  checar(d4.quadros === 0, `${d4.quadros} quadros inválidos entraram na conta`);

  // --- a tabela ---
  const d5 = new Diario();
  // Quatro segundos parado, folgado; e seis segundos com a mochila, estourando.
  for (let i = 0; i < 400; i++) d5.registrar('parado', 10, 60);
  for (let i = 0; i < 400; i++) d5.registrar('mochila', 15, 140, 2);
  // E meio segundo no PC: transição, não medida.
  for (let i = 0; i < 30; i++) d5.registrar('pc', 12, 200);

  const texto = relatorio(d5);
  checar(texto.includes('parado'), 'a tabela não tem a linha de parado');
  checar(texto.includes('mochila'), 'a tabela não tem a linha da mochila');
  checar(!texto.includes('PC aberto'), 'meio segundo de PC virou uma linha da tabela');
  checar(texto.includes('| --- |'), 'a tabela não é markdown — não dá para colar no PLAYTEST.md');
  checar(
    texto.includes('Estouram o orçamento no p95: mochila aberta'),
    'a tabela não aponta quem estoura o orçamento',
  );
  checar(texto.includes(`${Math.round(ORCAMENTO_MS * 10) / 10}`), 'a tabela não diz qual é o orçamento');

  // Tudo dentro do orçamento também tem de ser dito, e dito como notícia boa.
  const d6 = new Diario();
  // Seiscentos quadros de 7 ms: quatro segundos e pouco, acima do mínimo de
  // três — abaixo dele o relatório não inventa medida, e é o teste de cima.
  for (let i = 0; i < 600; i++) d6.registrar('parado', 7, 50);
  checar(relatorio(d6).includes('cabem no orçamento'), 'a tabela não diz quando tudo cabe');

  // Sessão de dez quadros: não inventa tabela nenhuma.
  const d7 = new Diario();
  for (let i = 0; i < 10; i++) d7.registrar('parado', 9, 50);
  checar(relatorio(d7).includes('curta demais'), 'uma sessão de dez quadros virou medida');

  // --- e o jogo anota SEMPRE, não só com o contador ligado ---
  //
  // Ligar o contador para colher o número mudaria o número: a plaquinha é um
  // canvas, e desenhar canvas custa quadro.
  const fonte = readFileSync('src/game.ts', 'utf8');
  const medir = fonte.slice(fonte.indexOf('  medir(dt: number'));
  const corpo = medir.slice(0, medir.indexOf('\n  }'));
  checar(corpo.includes('this.diario.registrar('), 'o diário deixou de ser alimentado');
  checar(
    corpo.indexOf('this.diario.registrar(') < corpo.indexOf('contadorDeQuadros'),
    'o diário ficou atrás do contador — medir passou a depender de mostrar',
  );

  const principal = readFileSync('src/main.ts', 'utf8');
  checar(
    principal.indexOf('mostrarQuadro()') < principal.indexOf('jogo.aoSairDaSessao()'),
    'a tabela é lida depois da limpeza da sessão — ou seja, vazia',
  );

  console.log(
    `   diário: ${parado.quadros} quadros · média ${parado.mediaMs.toFixed(1)} ms · ` +
      `p95 ${parado.p95Ms.toFixed(2)} ms · pior ${parado.piorMs} ms · orçamento ${ORCAMENTO_MS.toFixed(1)} ms`,
  );
}

// --- 52. o som sabe quando alguém mandou parar ---
//
// `falar` espera o MP3 baixar e só então manda tocar — e entre uma coisa e
// outra o mundo anda:
//
//   1. você aponta para o Charmander na Pokédex e puxa o gatilho
//   2. os 190 kB da narração começam a baixar
//   3. você fecha a Pokédex, e o jogo chama `calar()`
//   4. o download termina, e `falar` continua de onde parou e TOCA
//
// O jogo já sabia que isso é ruim: a linha que chama `calar()` ao fechar o
// painel diz, por escrito, que ouvir a descrição de um Pikachu com a Pokédex
// guardada faz parecer que o jogo travou. A proteção existia e não cobria o
// caso — e o caso é justamente a PRIMEIRA vez que se aponta para uma espécie,
// que é quando o arquivo ainda não está em memória.
console.log('\n52. o som sabe quando alguém mandou parar');
{
  // O selo de um pedido vale até alguém mandar calar.
  const meu = selo();
  checar(aindaVale(meu), 'o selo do pedido nasceu inválido');
  calar();
  checar(!aindaVale(meu), 'calar não invalidou o pedido que estava a caminho');

  // E ele sobe MESMO sem nada tocando, que é exatamente o caso do bug: um
  // pedido em voo não tem nó de áudio para parar, só um `await` para
  // invalidar. A versão antiga saía antes de contar.
  const segundo = selo();
  calar();
  calar();
  checar(!aindaVale(segundo), 'calar com o silêncio na sala não contou');
  checar(selo() === segundo + 2, 'os pedidos de calar não são contados um a um');

  // Contador e não booleano: com três pedidos em voo, só o mais recente vale.
  const a = selo();
  calar();
  const b = selo();
  checar(!aindaVale(a), 'o pedido mais antigo sobreviveu');
  checar(aindaVale(b), 'o pedido mais novo foi invalidado junto');

  // Sem AudioContext — que é o caso do Node —, falar desiste em silêncio em
  // vez de explodir. É o mesmo caminho de quem abre o jogo sem tocar na tela.
  checar((await falar('charmander')) === false, 'falar sem contexto de áudio não desistiu');

  // --- e a saída da sessão manda parar tudo ---
  const fonte = readFileSync('src/game.ts', 'utf8');
  const i = fonte.indexOf('aoSairDaSessao()');
  const saida = fonte.slice(i, fonte.indexOf('\n  }', i));
  checar(saida.includes('calar()'), 'sair da sessão não cala a narração');
  checar(saida.includes('audio.pausar()'), 'sair da sessão deixa o contexto de áudio aberto');

  const som = readFileSync('src/audio.ts', 'utf8');
  const j = som.indexOf('  pausar() {');
  const pausar = som.slice(j, som.indexOf('\n  }', j));
  checar(j > 0, 'não existe audio.pausar()');
  checar(
    pausar.includes('this.batalhaAcabou()'),
    'sair no meio de uma briga deixa a trilha em loop por cima da tela de saída',
  );
  // O volume ZERA antes de suspender: suspender congela o relógio do contexto,
  // e o que estava agendado continua agendado. Sem isso, o resto do som
  // estouraria no primeiro quadro da sessão seguinte.
  checar(
    pausar.indexOf('setValueAtTime(0') < pausar.indexOf('suspend()'),
    'o contexto é suspenso antes de o volume zerar — o som volta estourando',
  );

  console.log('   voz: o pedido morre com o gesto que o fez · trilha, voz e contexto param na saída');
}

// --- 53. gravar o estado não trava o quadro ---
//
// `salvar()` é chamado de vinte e quatro lugares, e gravar é caro: um
// `JSON.stringify` do estado inteiro — 151 registros da Pokédex, os
// exemplares, o estoque — e um `localStorage.setItem`, que é SÍNCRONO e
// bloqueia o quadro.
//
// O problema não é uma chamada, são as RAJADAS. A regeneração do time roda a
// cada 2,5 s e escreve a vida de até seis Pokémon de uma vez: seis stringify e
// seis escritas no MESMO quadro, a cada dois segundos e meio. É exatamente a
// forma de um tranco periódico — o que o p95 do diário enxerga.
console.log('\n53. gravar o estado não trava o quadro');
{
  // O armazenamento falso é o do topo do arquivo — ver o comentário lá.
  const guardado = armazenamento.dados;

  const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  // Drena o que as seções anteriores possam ter agendado antes de contar.
  await esperar(400);

  const dex = new Dex();
  dex.limpar();
  dex.receberInicial('charmander');
  for (const id of ['pidgey', 'rattata', 'caterpie', 'zubat', 'geodude']) {
    dex.registrarCaptura(id, 10, 8, false);
  }
  await esperar(400);

  // A RAJADA: a regeneração escrevendo a vida de seis bichos no mesmo quadro.
  armazenamento.escritas = 0;
  for (const e of dex.timeVivo) dex.definirHp(e, dex.hpMaxDe(e) - 1);
  checar(
    armazenamento.escritas === 0,
    `seis definirHp gravaram ${armazenamento.escritas} vezes NO QUADRO — é o tranco`,
  );
  await esperar(400);
  checar(
    armazenamento.escritas === 1,
    `a rajada de seis virou ${armazenamento.escritas} gravações em vez de uma`,
  );

  // E o que foi gravado é o estado FINAL, não o do meio da rajada: agrupar só
  // é seguro porque a última chamada já contém tudo o que as outras diriam.
  const salvo = JSON.parse(guardado.get('critter-quest/dex/v4')!) as {
    exemplares: Array<{ hp: number }>;
  };
  checar(
    salvo.exemplares.length === dex.timeVivo.length,
    'o que ficou gravado não tem o time inteiro',
  );
  checar(
    salvo.exemplares.every((e, i) => e.hp === dex.timeVivo[i].hp),
    'o estado gravado é o do meio da rajada, e não o final',
  );

  // A PORTA DE EMERGÊNCIA: sair da sessão, esconder a página, fechar a aba.
  // Um debounce sem ela é perda de dados esperando o dia certo — a captura de
  // um brilhante a 200 ms de ser gravada some se o headset fechar.
  armazenamento.escritas = 0;
  dex.definirHp(dex.timeVivo[0], 3);
  checar(armazenamento.escritas === 0, 'a gravação não esperou nem um pouco');
  dex.gravarAgora();
  checar(
    armazenamento.escritas === 1,
    `gravarAgora escreveu ${armazenamento.escritas} vezes em vez de uma`,
  );
  // E o pedido que estava pendente não grava DE NOVO depois.
  await esperar(400);
  checar(armazenamento.escritas === 1, 'o pedido pendente gravou de novo depois do flush');

  // Sem nada sujo, forçar não escreve à toa? Escreve — e deve: `gravarAgora` é
  // a porta de emergência, e uma porta que decide sozinha se abre não serve.
  // O que não pode é a espera se renovar para sempre, que é o teto abaixo.
  const fonte = readFileSync('src/state.ts', 'utf8');
  checar(fonte.includes('TETO_MS'), 'não existe teto: a espera pode se renovar para sempre');
  checar(
    /agora - this\.sujoDesde >= Dex\.TETO_MS/.test(fonte),
    'o teto existe mas não é comparado com o tempo desde a primeira sujeira',
  );

  const principal = readFileSync('src/main.ts', 'utf8');
  for (const porta of ['pagehide', 'visibilitychange']) {
    checar(principal.includes(porta), `a porta '${porta}' não grava o estado ao sumir`);
  }

  console.log('   estado: seis gravações em rajada viraram uma · e três portas forçam antes de sumir');
}

// --- 54. mexer no PC não troca quem volta a campo ---
//
// Duas coisas são guardadas por ÍNDICE no estado: o ATIVO (o próximo a sair da
// bola) e o EM CAMPO (quem estava fora da bola quando o jogo parou, para a
// sessão seguinte devolvê-lo ao seu lado).
//
// Qualquer arrasto no PC muda os índices embaixo dos dois. O ativo tinha
// conserto — três das quatro operações já o reencontravam pela referência, e
// uma delas diz isso por escrito. O EM CAMPO não tinha conserto nenhum:
//
//   1. você está com o Charmander em campo
//   2. abre o PC e arrasta ele da primeira vaga para a quarta
//   3. sai e volta — e o jogo invoca quem estiver na primeira vaga
//
// Não dá erro, não some com nada, e é impossível de adivinhar: o sintoma
// aparece uma sessão inteira depois da causa.
console.log('\n54. mexer no PC não troca quem volta a campo');
{
  const novaDex = () => {
    const d = new Dex();
    d.limpar();
    d.receberInicial('charmander');
    for (const id of ['pidgey', 'rattata', 'caterpie', 'zubat', 'geodude', 'magikarp']) {
      d.registrarCaptura(id, 10, 8, false);
    }
    return d;
  };

  // (1) ARRASTAR PARA UMA VAGA VAZIA DO TIME.
  {
    const dex = novaDex();
    const meu = dex.time[0]!;
    dex.marcarEmCampo(meu);
    checar(dex.exemplarEmCampoSalvo === meu, 'marcar em campo não pegou');

    // Abre uma vaga e arrasta o bicho em campo para ela.
    dex.arrastar(1, TAMANHO_TIME + 2);
    dex.arrastar(0, 1);
    checar(dex.exemplarEmCampoSalvo === meu, 'arrastar para uma vaga vazia trocou quem volta a campo');
  }

  // (2) TROCAR DE LUGAR COM OUTRO.
  {
    const dex = novaDex();
    const meu = dex.time[0]!;
    const outro = dex.time[3]!;
    dex.marcarEmCampo(meu);
    dex.arrastar(0, 3);
    checar(dex.exemplarEmCampoSalvo === meu, 'trocar de vaga trocou quem volta a campo');
    checar(dex.time[0] === outro, 'a troca não aconteceu — o teste não vale nada');
  }

  // (3) DO TIME PARA A CAIXA: ele continua sendo o que estava em campo. Sair e
  //     voltar com um bicho guardado é estranho, mas é o que VOCÊ fez — inventar
  //     outro no lugar seria pior.
  {
    const dex = novaDex();
    const meu = dex.time[0]!;
    dex.marcarEmCampo(meu);
    dex.arrastar(0, TAMANHO_TIME + 3);
    checar(dex.exemplarEmCampoSalvo === meu, 'mandar para a caixa perdeu quem estava em campo');
  }

  // (4) MOVER E TROCAR, as duas operações antigas.
  {
    const dex = novaDex();
    const meu = dex.time[2]!;
    dex.marcarEmCampo(meu);
    dex.mover(0, 5);
    checar(dex.exemplarEmCampoSalvo === meu, 'mover a lista trocou quem volta a campo');
    dex.trocar(1, 4);
    checar(dex.exemplarEmCampoSalvo === meu, 'trocar dois outros trocou quem volta a campo');
  }

  // (5) SOLTAR QUEM ESTAVA EM CAMPO: vira ninguém, e não o vizinho de índice.
  {
    const dex = novaDex();
    const meu = dex.time[0]!;
    const vizinho = dex.time[1]!;
    dex.marcarEmCampo(meu);
    dex.soltar(0);
    checar(dex.exemplarEmCampoSalvo === null, 'soltar quem estava em campo promoveu o vizinho');
    checar(dex.time[0] === vizinho, 'soltar não tirou o bicho da lista');
    // E o ativo continua existindo: quem some não pode ser o próximo a sair da
    // bola, mas a lista não pode ficar sem ninguém escolhido.
    checar(dex.exemplarAtivo !== null, 'soltar o ativo deixou o jogo sem ninguém escolhido');
  }

  // (6) SOLTAR OUTRO não mexe em quem está em campo.
  {
    const dex = novaDex();
    const meu = dex.time[2]!;
    dex.marcarEmCampo(meu);
    dex.soltar(0);
    checar(dex.exemplarEmCampoSalvo === meu, 'soltar um terceiro trocou quem volta a campo');
  }

  // (7) O CICLO INTEIRO, que é onde o bug aparecia de verdade: mexer no PC,
  //     gravar, e abrir o jogo de novo.
  {
    const dex = novaDex();
    const meu = dex.time[0]!;
    dex.marcarEmCampo(meu);
    dex.arrastar(0, 4);
    dex.gravarAgora();

    const depois = new Dex();
    const voltou = depois.exemplarEmCampoSalvo;
    checar(voltou !== null, 'depois de recarregar, ninguém voltou a campo');
    checar(
      voltou?.id === meu.id,
      `depois de recarregar voltou ${voltou?.id} a campo, e não ${meu.id}`,
    );
  }

  // (8) E limpar a Dex não deixa um índice apontando para uma lista vazia.
  {
    const dex = novaDex();
    dex.marcarEmCampo(dex.time[0]!);
    dex.limpar();
    checar(dex.exemplarEmCampoSalvo === null, 'a Dex limpa continua com alguém em campo');
  }

  console.log('   PC: arrastar, mover, trocar e soltar mantêm o ativo E quem volta a campo');
}

// --- 55. a mão que sumiu não leva nada junto ---
//
// No Quest, largar o controle é um gesto NORMAL: ele hiberna, a fonte de
// entrada é retirada e o hand tracking assume. O evento `disconnected` chega, a
// `Mao` se limpa por dentro — e o que o JOGO tinha posto naquela mão continua
// lá.
//
// O colo já tinha faxina (um Pokémon preso numa mão morta era visível demais
// para passar). A pokébola, a fruta e a Pokédex não tinham: ficavam penduradas
// num punho que parou de se mexer, e não havia gesto capaz de recuperá-las,
// porque soltar exige um GRIP e a mão que o daria não existe mais.
console.log('\n55. a mão que sumiu não leva nada junto');
{
  // O que a devolução promete, medido na Dex de verdade: tirar debita, devolver
  // repõe, e o total não muda. É isso que faz devolver ser seguro — se a bola
  // não saísse do estoque ao ser sacada, devolvê-la a duplicaria.
  const dex = new Dex();
  dex.limpar();
  dex.receberInicial('charmander');

  const antes = dex.bolas('comum');
  checar(antes > 0, 'o teste começou sem bola nenhuma');
  dex.gastarBola('comum');
  checar(dex.bolas('comum') === antes - 1, 'sacar a bola não debitou o estoque');
  dex.ganharBola('comum', 1);
  checar(dex.bolas('comum') === antes, 'devolver a bola não repôs o estoque');

  // E o teto é respeitado: devolver com a mochila cheia não estoura o limite.
  const teto = BOLAS[0].maximo;
  dex.ganharBola('comum', teto * 2);
  checar(dex.bolas('comum') === teto, `o estoque foi a ${dex.bolas('comum')}, acima do teto ${teto}`);

  // --- e o jogo faz a faxina por quadro ---
  const fonte = readFileSync('src/game.ts', 'utf8');
  const i = fonte.indexOf('  private atualizarMaosPerdidas() {');
  checar(i > 0, 'não existe faxina para o que ficou numa mão desconectada');
  const faxina = fonte.slice(i, fonte.indexOf('\n  }', i));

  checar(faxina.includes('if (mao.conectada) continue;'), 'a faxina mexe em mão conectada');
  for (const [oQue, chamada] of [
    ['a Pokédex', 'this.tablet.guardar()'],
    ['a fruta ou a poção', 'this.guardarIsca(mao)'],
    ['a pokébola', 'this.largarBolaDaMao(mao)'],
  ] as const) {
    checar(faxina.includes(chamada), `${oQue} continua presa na mão que sumiu`);
  }

  // A bola de INVOCAÇÃO não volta ao estoque: ela nunca saiu de lá — é o corpo
  // de um Pokémon seu virando bola, e creditá-la fabricaria uma pokébola.
  checar(
    /invocacao[\s\S]{0,200}ganharBola/.test(faxina),
    'a devolução credita bola de invocação — isso fabrica pokébola do nada',
  );

  // E ela roda no quadro, junto da faxina do colo, que é a que já existia.
  checar(
    fonte.includes('this.atualizarMaosPerdidas();'),
    'a faxina existe e ninguém a chama',
  );
  checar(
    fonte.indexOf('this.atualizarMaosPerdidas();') < fonte.indexOf('this.atualizarColo(dt);', fonte.indexOf('this.atualizarMaosPerdidas();')),
    'a faxina das mãos perdidas roda depois da do colo',
  );

  console.log(
    `   mão perdida: bola, item e Pokédex voltam · estoque ${antes} → ${antes} depois de sacar e devolver`,
  );
}

// --- 56. a voz dele é o grito dele ---
//
// Os 151 gritos oficiais dos jogos estão baixados em public/gritos desde
// sempre — e nunca tocavam. A cadeia punha a fala do nome na frente, e o
// ajuste que a liga vem ligado: o som que a pessoa reconhece como AQUELE
// Pokémon ficava atrás de uma locutora lendo o nome em português com a
// velocidade esticada.
//
// E a voz era o único som do jogo que não sabia onde estava: dezoito pontos
// pedem o grito, UM passava pelo desvio posicional. Nos outros dezessete o
// bicho gritava do meio da sua cabeça — atacando, apanhando, saindo da bola.
console.log('\n56. a voz dele é o grito dele');
{
  const som = readFileSync('src/audio.ts', 'utf8');
  const corpoDe = (nome: string, arquivo: string): string => {
    const cabeca = arquivo.indexOf(nome);
    if (cabeca < 0) return '';
    const i = arquivo.indexOf('{', cabeca);
    let nivel = 0;
    for (let j = i; j < arquivo.length; j++) {
      if (arquivo[j] === '{') nivel++;
      else if (arquivo[j] === '}') {
        nivel--;
        if (nivel === 0) return arquivo.slice(i, j + 1);
      }
    }
    return '';
  };

  // (1) O GRITO É O GRITO. Nada de fala na frente dele.
  const grito = corpoDe('  grito(id: string', som);
  checar(grito.length > 100, 'não achei grito() — o teste não vale nada');
  checar(grito.includes('tocarGritoGravado'), 'o grito deixou de tocar o arquivo oficial');
  checar(!grito.includes('tocarVozDoNome'), 'a fala do nome voltou para a frente do grito');
  checar(!grito.includes('tocarDublagem'), 'a dublagem voltou para a frente do grito');

  // (2) A FALA EXISTE, num lugar só, e cai no grito quando não há arquivo.
  const apresentar = corpoDe('  apresentar(id: string', som);
  checar(apresentar.length > 50, 'não existe apresentar() — a fala do nome sumiu do jogo');
  checar(apresentar.includes('tocarVozDoNome'), 'apresentar não fala o nome');
  checar(
    apresentar.includes('this.grito('),
    'sem TTS daquela espécie, a apresentação fica muda em vez de cair no grito',
  );

  // (3) TODA VOZ SAI PELA `saida`, que é o desvio posicional. Ligar no `master`
  //     é o que fazia o bicho gritar do meio da cabeça.
  for (const quem of ['tocarGritoGravado', 'tocarVozDoNome', 'tocarDublagem']) {
    const corpo = corpoDe(`  private ${quem}(`, som);
    checar(corpo.length > 100, `não achei ${quem}`);
    checar(!/connect\(master\)/.test(corpo), `${quem} liga no master — o som sai do meio da cabeça`);
    checar(/connect\(saida\)/.test(corpo), `${quem} não passa pelo desvio posicional`);
  }

  // (4) O grito não é idêntico toda vez: um arquivo sempre no mesmo tom soa
  //     como botão apertado.
  checar(
    /playbackRate[\s\S]{0,80}respiro/.test(corpoDe('  private tocarGritoGravado(', som)),
    'o grito voltou a tocar sempre no mesmo tom',
  );

  // (5) NO JOGO: os quatro momentos de apresentação, e nenhuma voz de bicho
  //     fora do caminho posicional.
  const jogo = readFileSync('src/game.ts', 'utf8');
  checar(
    (jogo.match(/audio\.apresentar\(/g) ?? []).length === 4,
    `são ${(jogo.match(/audio\.apresentar\(/g) ?? []).length} apresentações, e os momentos são quatro`,
  );
  checar(jogo.includes('private vozDoBicho('), 'não existe o caminho posicional da voz');
  // Nenhuma chamada crua de `audio.grito` com um corpo à mão: o padrão
  // `X.especie.id, X.shiny, X.especie.num` é o que denuncia uma que escapou.
  //
  // Fora do próprio `vozDoBicho`, claro — é ele quem faz a chamada certa, e
  // contá-la como erro seria o teste acusando a correção.
  const semHelper = jogo.replace(corpoDe('  private vozDoBicho(', jogo), '');
  const cruas = semHelper.match(/audio\.grito\((\w+)\.especie\.id, \1\.shiny/g) ?? [];
  checar(
    cruas.length === 0,
    `${cruas.length} vozes de bicho ainda saem do meio da cabeça`,
  );

  console.log('   voz: o grito oficial na frente, a fala em quatro momentos, e tudo vindo de onde o bicho está');
}

// --- 57. o golpe diz o que foi ---
//
// Duas coisas que o combate sabia e não desenhava.
//
// A primeira: os quatro efeitos elementais — rajada de fogo, jato d'água,
// raio, chicote — existiam só para os iniciais. Um Vulpix cuspia o borrifo
// laranja genérico ao lado de um Charmander com chama de verdade.
//
// A segunda: todo golpe terminava no mesmo punhado de partículas esféricas. O
// corpo do ATACANTE já fazia gestos diferentes para arranhar, socar e se
// jogar; o corpo de quem LEVAVA recebia o mesmo para os três.
console.log('\n57. o golpe diz o que foi');
{
  // (1) O EFEITO É DO TIPO DO GOLPE, e vale para qualquer bicho.
  checar(assinaturaDe('vulpix', 'fogo') === 'lanca-chamas', 'um bicho de fogo qualquer não faz a rajada');
  checar(assinaturaDe('psyduck', 'agua') === 'jato-dagua', 'um bicho de água qualquer não faz o jato');
  checar(assinaturaDe('magnemite', 'eletrico') === 'choque-trovao', 'um elétrico qualquer não solta o raio');
  checar(assinaturaDe('oddish', 'planta') === 'chicote-cipo', 'um de planta qualquer não chicoteia');

  // A assinatura da ESPÉCIE continua vindo antes — é a porta para um efeito
  // que seja só do Charizard um dia.
  checar(assinaturaDe('charmander', 'fogo') === 'lanca-chamas', 'o Charmander perdeu a chama dele');

  // E um tipo sem efeito próprio continua no desenho comum: são quatro, e
  // inventar dezoito era justamente o que o jogo decidiu não fazer.
  checar(assinaturaDe('rattata', 'normal') === null, 'um golpe normal ganhou efeito elemental');
  checar(assinaturaDe('geodude', 'pedra') === null, 'um golpe de pedra ganhou efeito elemental');
  // Nem o inicial: o Bulbasaur usando um golpe normal não chicoteia.
  checar(assinaturaDe('bulbasaur', 'normal') === null, 'a assinatura ignorou o tipo do golpe');

  // (2) A MARCA DO CONTATO.
  const onde = new THREE.Vector3(0, 1, 0);
  const deOnde = new THREE.Vector3(0, 1, 1.2);

  const garra = new MarcaDeContato('garra', onde, deOnde, 0xffffff, 1);
  const cena = new THREE.Group();
  garra.adicionarA(cena);
  checar(garra.grupo.parent === cena, 'a marca não entrou na cena');
  checar(garra.grupo.position.distanceTo(onde) < 1e-6, 'a marca não nasceu no corpo de quem levou');

  // Três riscos, e não um borrão: o que se lê de longe é o paralelismo.
  const riscos = garra.grupo.children.filter((o) => (o as THREE.Mesh).isMesh);
  checar(riscos.length === 3, `a garra tem ${riscos.length} riscos, e não três`);

  // Ela encara quem bateu. Sem isso vira uma linha quando você anda de lado —
  // e em MR você anda o tempo todo.
  const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(garra.grupo.quaternion);
  const paraOAtacante = deOnde.clone().sub(onde).normalize();
  checar(frente.dot(paraOAtacante) > 0.95, 'a marca não está virada para quem bateu');

  // Os riscos não chegam juntos: o segundo ainda não existe no primeiro quadro.
  garra.atualizar(1 / 90);
  checar(riscos[0].visible, 'o primeiro risco não apareceu de imediato');
  checar(!riscos[2].visible, 'os três riscos saíram no mesmo quadro — vira um carimbo');

  // E ela some sozinha, rápido: uma marca que dura atrapalha a leitura do
  // golpe seguinte.
  checar(!garra.terminou, 'a garra terminou antes de ser vista');
  for (let q = 0; q < 40; q++) garra.atualizar(1 / 90);
  checar(garra.terminou, 'a garra ficou na tela quase meio segundo depois');
  garra.descartar(cena);
  checar(garra.grupo.parent === null, 'a marca não saiu da cena');

  // (3) O BAQUE é outra coisa: anel e faíscas, não riscos.
  const baque = new MarcaDeContato('baque', onde, deOnde, 0xffd23b, 0.5);
  const anel = baque.grupo.children.find((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh;
  const faiscas = baque.grupo.children.find((o) => (o as THREE.Points).isPoints);
  checar(anel !== undefined, 'o baque não tem anel');
  checar(faiscas !== undefined, 'o baque não tem faíscas');

  // Ele nasce FECHADO, e no tamanho certo: a escala 1 do three, neste objeto,
  // é um metro de raio, e um anel desse tamanho por um quadro é um flash na
  // cara de quem está com o headset.
  const antes = anel.scale.x;
  checar(antes < 0.6, `o anel nasce com raio ${antes.toFixed(2)} — pisca gigante no primeiro quadro`);

  // E ABRE: é isso que lê como impacto.
  for (let q = 0; q < 8; q++) baque.atualizar(1 / 90);
  checar(anel.scale.x > antes, 'o anel do baque não abre');
  checar(
    (anel.material as THREE.MeshBasicMaterial).opacity < 0.9,
    'o anel não começa a apagar enquanto abre',
  );
  baque.descartar(cena);

  // A força vira TAMANHO e não duração — uma marca mais longa atrapalharia o
  // golpe seguinte, uma maior não.
  const fraco = new MarcaDeContato('baque', onde, deOnde, 0xffffff, 0);
  const forte = new MarcaDeContato('baque', onde, deOnde, 0xffffff, 1);
  fraco.atualizar(1 / 90);
  forte.atualizar(1 / 90);
  const escalaDe = (m: MarcaDeContato) =>
    (m.grupo.children.find((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh).scale.x;
  checar(escalaDe(forte) > escalaDe(fraco) * 1.5, 'o golpe forte não deixa marca maior');
  fraco.descartar(cena);
  forte.descartar(cena);

  // (4) E o jogo liga as duas coisas: cada gesto de contato tem o seu feitio.
  const jogo = readFileSync('src/game.ts', 'utf8');
  checar(jogo.includes('MARCA_DO_GESTO'), 'o jogo não escolhe a marca pelo gesto');
  checar(/garra: 'garra'/.test(jogo), 'o gesto de garra não deixa risco');
  checar(/soco: 'baque'/.test(jogo), 'o soco não deixa baque');
  // Mordida e sopro NÃO deixam marca, e isso é a decisão — não um esquecimento.
  checar(!/mordida: '/.test(jogo), 'a mordida ganhou marca: ela acontece onde ninguém vê');
  checar(!/sopro: '/.test(jogo), 'o sopro ganhou marca por cima do efeito que já é a imagem inteira');

  console.log('   golpe: quatro efeitos elementais para todos · garra risca, baque estoura');
}
console.log(falhas === 0 ? '\nTUDO PASSOU' : `\n${falhas} VERIFICAÇÕES FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
