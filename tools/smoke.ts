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
import * as THREE from 'three';
import { Pokemon } from '../src/creature';
import { Pokebola } from '../src/orb';
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
import type { Corpo } from '../src/modelos';
import { BOLAS } from '../src/balls';
import { PEDRAS, EVOLUI_SO_COM_PEDRA } from '../src/pedras';
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

  dex.limpar();
  console.log('   troca, movimentação e ativo mantidos em 8 exemplares');
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
  const comArranque = { ...lento, estagios: { ataque: 0, defesa: 0, velocidade: 2 } };
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

  /** Quanto cada osso girou, no pico do gesto. */
  const poseDe = (gesto: GestoDeAtaque) => {
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

  console.log(
    `   ${PEDRAS.length} pedras, ${pares} evoluções · ` +
      `${EVOLUI_SO_COM_PEDRA.size} espécies saíram da evolução por nível`,
  );
  console.log(`   Eevee: ${caminhos.join(' · ')}`);
}

console.log(falhas === 0 ? '\nTUDO PASSOU' : `\n${falhas} VERIFICAÇÕES FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
