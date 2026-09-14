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
  evolucaoEm,
  multiplicador,
  nivelPorXp,
  porId,
  statsNoNivel,
  xpParaNivel,
  type Especie,
} from '../src/species';
import { MEDIDAS } from '../src/modelos.gen';
import type { Corpo } from '../src/modelos';
import { BOLAS } from '../src/balls';

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
console.log('1. a Pokédex fecha consigo mesma');
{
  checar(ESPECIES.length === 151, `deveria haver 151 espécies, há ${ESPECIES.length}`);
  checar(INICIAIS.length === 4, `deveria haver 4 iniciais, há ${INICIAIS.length}`);

  let semModelo = 0;
  let evolucaoQuebrada = 0;
  for (const e of ESPECIES) {
    if (!MEDIDAS[e.id]) semModelo++;
    if (e.evolui && !porId(e.evolui.para)) evolucaoQuebrada++;
    checar(e.tipos.length >= 1 && e.tipos.length <= 2, `${e.nome}: ${e.tipos.length} tipos`);
    checar(e.golpes.length === e.tipos.length, `${e.nome}: golpes e tipos não batem`);
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
  let melhorou = 0;
  for (const atacante of ESPECIES.filter((e) => e.golpes.length === 2)) {
    for (const defensor of ESPECIES) {
      const a = { especie: atacante, nivel: 20 };
      const d = { especie: defensor, nivel: 20 };
      const escolhido = escolherGolpe(a, d);
      const nota = (g: (typeof atacante.golpes)[number]) =>
        g.potencia *
        multiplicador(g.tipo, defensor.tipos) *
        (atacante.tipos.includes(g.tipo) ? 1.5 : 1);
      const melhor = Math.max(...atacante.golpes.map(nota));
      checar(nota(escolhido) >= melhor - 1e-9, `${atacante.nome} vs ${defensor.nome}: golpe pior`);
      if (escolhido !== atacante.golpes[0]) melhorou++;
    }
  }
  console.log(`   o segundo golpe foi o escolhido em ${melhorou} confrontos`);
  checar(melhorou > 0, 'o golpe de cobertura nunca é usado');
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

console.log(falhas === 0 ? '\nTUDO PASSOU' : `\n${falhas} VERIFICAÇÕES FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
