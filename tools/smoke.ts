/** Simula o jogo sem navegador: pega NaN, batalha que nunca acaba, captura travada. */
import * as THREE from 'three';
import { Pokemon } from '../src/creature';
import { Pokebola } from '../src/orb';
import { Sala } from '../src/room';
import {
  ESPECIES,
  calcularDano,
  chanceCaptura,
  construirCriatura,
  multiplicador,
  porId,
} from '../src/species';

let falhas = 0;
const checar = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error('  FALHOU:', msg);
    falhas++;
  }
};
const finito = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const JOGADOR = new THREE.Vector3(0, 1.6, 0);

// 1. Os quatro montam corpo válido e do tamanho certo.
console.log('1. construção dos Pokémon');
for (const especie of ESPECIES) {
  const partes = construirCriatura(especie);
  const caixa = new THREE.Box3().setFromObject(partes.raiz);
  const tam = caixa.getSize(new THREE.Vector3());
  checar(finito(tam), `${especie.nome}: bounding box com NaN`);
  checar(tam.y > especie.altura * 0.55, `${especie.nome}: baixo demais (${tam.y.toFixed(2)}m)`);
  checar(tam.y < especie.altura * 2.2, `${especie.nome}: alto demais (${tam.y.toFixed(2)}m)`);
  checar(partes.palpebras.length === 2, `${especie.nome}: não tem duas pálpebras`);
  checar(partes.membros.length >= 4, `${especie.nome}: menos de quatro membros`);
  console.log(
    `   ${especie.nome.padEnd(11)} ${tam.x.toFixed(2)}×${tam.y.toFixed(2)}×${tam.z.toFixed(2)}m, ${partes.descartaveis.length} recursos`,
  );
}

// 2. Tabela de tipos coerente.
console.log('2. efetividade dos tipos');
{
  checar(multiplicador('fogo', 'planta') === 2, 'fogo deveria ser forte contra planta');
  checar(multiplicador('agua', 'fogo') === 2, 'água deveria ser forte contra fogo');
  checar(multiplicador('planta', 'agua') === 2, 'planta deveria ser forte contra água');
  checar(multiplicador('eletrico', 'agua') === 2, 'elétrico deveria ser forte contra água');
  checar(multiplicador('fogo', 'agua') === 0.5, 'fogo deveria ser fraco contra água');

  const charmander = porId('charmander')!;
  const bulbasaur = porId('bulbasaur')!;
  const squirtle = porId('squirtle')!;
  let forte = 0;
  let fraco = 0;
  for (let i = 0; i < 400; i++) {
    forte += calcularDano(charmander, bulbasaur, charmander.golpe).dano;
    fraco += calcularDano(charmander, squirtle, charmander.golpe).dano;
  }
  console.log(`   Brasa em Bulbasaur ${(forte / 400).toFixed(1)} vs em Squirtle ${(fraco / 400).toFixed(1)}`);
  checar(forte > fraco * 2.5, 'a vantagem de tipo mal aparece no dano');
}

// 3. Ritmo da batalha, separado por tipo de confronto. O jogador escolhe quem
//    manda para o campo, então o que importa é cada caso, não a média cega.
console.log('3. golpes até o nocaute');
{
  const grupos: Record<string, number[]> = { vantagem: [], neutro: [], desvantagem: [] };
  let travadas = 0;

  for (const a of ESPECIES) {
    for (const b of ESPECIES) {
      let hp = b.hpMax;
      let golpes = 0;
      while (hp > 0 && golpes < 300) {
        hp -= calcularDano(a, b, a.golpe).dano;
        golpes++;
      }
      if (golpes >= 300) travadas++;

      const m = multiplicador(a.golpe.tipo, b.tipo);
      const grupo = m >= 2 ? 'vantagem' : m <= 0.5 ? 'desvantagem' : 'neutro';
      grupos[grupo].push(golpes);
    }
  }

  const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  for (const [nome, xs] of Object.entries(grupos)) {
    console.log(`   ${nome.padEnd(12)} ${media(xs).toFixed(1)} golpes  (${xs.length} confrontos)`);
  }

  checar(travadas === 0, `${travadas} combates nunca terminaram`);
  checar(media(grupos.vantagem) <= 5, 'com vantagem de tipo a batalha deveria ser rápida');
  checar(media(grupos.vantagem) >= 1.5, 'com vantagem está fácil demais, some num golpe');
  checar(media(grupos.neutro) <= 8, 'confronto neutro está arrastado');
  checar(media(grupos.desvantagem) <= 14, 'confronto ruim está insuportável');
  // A vantagem precisa ser sentida, senão escolher o Pokémon não importa.
  checar(
    media(grupos.desvantagem) > media(grupos.vantagem) * 1.8,
    'escolher o tipo certo quase não muda nada',
  );
}

// 4. Enfraquecer precisa valer a pena na captura.
console.log('4. captura vs HP');
{
  for (const especie of ESPECIES) {
    const cheio = chanceCaptura(especie, 1, 0) ** 3;
    const quaseZero = chanceCaptura(especie, 0.05, 0) ** 3;
    console.log(
      `   ${especie.nome.padEnd(11)} HP cheio ${(cheio * 100).toFixed(0)}%  →  quase KO ${(quaseZero * 100).toFixed(0)}%`,
    );
    checar(quaseZero > cheio * 1.5, `${especie.nome}: enfraquecer quase não ajuda`);
    checar(quaseZero < 0.99, `${especie.nome}: captura virou garantida`);
  }
}

// 5. Ciclo completo da pokébola sempre resolve.
console.log('5. ciclo da pokébola');
{
  const contagem = { capturou: 0, escapou: 0, travou: 0 };
  for (let n = 0; n < 200; n++) {
    const especie = ESPECIES[n % ESPECIES.length];
    const alvo = new Pokemon(especie, new THREE.Vector3(0, 0, -1.5), 0, 'selvagem', n);
    alvo.atualizar(0.7, JOGADOR);
    alvo.receberDano(especie.hpMax * 0.7); // chega machucado, como numa batalha real
    const bola = new Pokebola(0);
    bola.raiz.position.set(0, 1.2, -1.4);
    bola.capturar(alvo);

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
  console.log(`   com 30% de HP: ${contagem.capturou} capturas, ${contagem.escapou} escapes (${taxa.toFixed(0)}%)`);
  checar(contagem.travou === 0, `${contagem.travou} capturas nunca resolveram`);
  checar(taxa > 20 && taxa < 90, `taxa fora do razoável: ${taxa.toFixed(0)}%`);
}

// 6. O companheiro acompanha o treinador sem enlouquecer.
console.log('6. companheiro seguindo o treinador');
{
  const especie = porId('pikachu')!;
  const companheiro = new Pokemon(especie, new THREE.Vector3(0, 0, -1), 0, 'companheiro', 3);
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

// 7. Selvagem foge se você invadir o espaço dele.
console.log('7. fuga por proximidade');
{
  const alvo = new Pokemon(ESPECIES[1], new THREE.Vector3(0, 0, -1), 0, 'selvagem', 11);
  const perto = new THREE.Vector3(0, 1.6, -1);
  let passos = 0;
  while (alvo.viva && passos < 72 * 30) {
    alvo.atualizar(1 / 72, perto);
    passos++;
  }
  console.log(`   sumiu depois de ${(passos / 72).toFixed(1)}s de invasão de espaço`);
  checar(!alvo.viva, 'o selvagem nunca fugiu mesmo com o treinador em cima');
}

// 8. Spawner sempre devolve ponto dentro da faixa pedida.
console.log('8. pontos de nascimento');
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
