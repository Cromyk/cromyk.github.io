/** Simula o jogo sem navegador: pega NaN, criatura fugindo do mapa, captura que nunca resolve. */
import * as THREE from 'three';
import { Criatura } from '../src/creature';
import { Orbe } from '../src/orb';
import { Sala } from '../src/room';
import { ESPECIES, construirCriatura } from '../src/species';

let falhas = 0;
const checar = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error('  FALHOU:', msg);
    falhas++;
  }
};
const finito = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

// 1. Toda espécie monta um corpo válido.
console.log('1. construção das espécies');
for (const especie of ESPECIES) {
  const partes = construirCriatura(especie, 42);
  const caixa = new THREE.Box3().setFromObject(partes.raiz);
  const tam = caixa.getSize(new THREE.Vector3());
  checar(finito(tam), `${especie.nome}: bounding box com NaN`);
  checar(tam.y > especie.altura * 0.5, `${especie.nome}: corpo baixo demais (${tam.y.toFixed(2)}m)`);
  checar(tam.y < especie.altura * 2.5, `${especie.nome}: corpo alto demais (${tam.y.toFixed(2)}m)`);
  checar(partes.palpebras.length === 2, `${especie.nome}: não tem duas pálpebras`);
  console.log(
    `   ${especie.nome.padEnd(10)} ${tam.x.toFixed(2)}×${tam.y.toFixed(2)}×${tam.z.toFixed(2)}m, ${partes.descartaveis.length} recursos`,
  );
}

// 2. Uma criatura passeando por 60s não escapa da âncora nem vira NaN.
console.log('2. comportamento ao longo de 60s');
{
  const criatura = new Criatura(ESPECIES[0], new THREE.Vector3(0, 0, -2), 0, 7);
  const jogador = new THREE.Vector3(0, 1.6, 0);
  let maxDist = 0;
  let afundou = 0;
  for (let i = 0; i < 60 * 72; i++) {
    criatura.atualizar(1 / 72, jogador);
    if (!criatura.viva) break;
    checar(finito(criatura.raiz.position), `posição virou NaN no passo ${i}`);
    maxDist = Math.max(maxDist, criatura.raiz.position.distanceTo(new THREE.Vector3(0, 0, -2)));
    if (criatura.raiz.position.y < -0.01) afundou++;
  }
  console.log(`   afastou no máximo ${maxDist.toFixed(2)}m da âncora, atravessou o piso em ${afundou} frames`);
  checar(afundou === 0, 'a criatura atravessou o chão');
  checar(maxDist < 5.5, `passeou longe demais (${maxDist.toFixed(2)}m)`);
}

// 3. Chegar perto demais faz ela fugir — e a fuga termina.
console.log('3. fuga por proximidade');
{
  const criatura = new Criatura(ESPECIES[1], new THREE.Vector3(0, 0, -1), 0, 11);
  const perto = new THREE.Vector3(0, 1.6, -1); // em cima dela
  let passos = 0;
  while (criatura.viva && passos < 72 * 30) {
    criatura.atualizar(1 / 72, perto);
    passos++;
  }
  console.log(`   sumiu depois de ${(passos / 72).toFixed(1)}s de invasão de espaço`);
  checar(!criatura.viva, 'a criatura nunca fugiu mesmo com o jogador em cima');
  checar(passos < 72 * 25, 'demorou demais para fugir');
}

// 4. Captura: 200 tentativas precisam sempre terminar em capturou ou escapou.
console.log('4. ciclo de captura');
{
  const contagem = { capturou: 0, escapou: 0, travou: 0 };
  for (let n = 0; n < 200; n++) {
    const criatura = new Criatura(ESPECIES[n % ESPECIES.length], new THREE.Vector3(0, 0, -1.5), 0, n);
    criatura.atualizar(0.7, new THREE.Vector3(0, 1.6, 0)); // sai do estado "surgindo"
    const orbe = new Orbe(0x7fd4ff, 0);
    orbe.raiz.position.set(0, 1.2, -1.4);
    orbe.capturar(criatura);

    let desfecho: string | null = null;
    for (let i = 0; i < 72 * 20; i++) {
      orbe.atualizar(1 / 72);
      criatura.atualizar(1 / 72, new THREE.Vector3(0, 1.6, 0));
      if (orbe.resultado) {
        desfecho = orbe.resultado;
        break;
      }
    }
    if (desfecho === 'capturou') contagem.capturou++;
    else if (desfecho === 'escapou') contagem.escapou++;
    else contagem.travou++;
  }
  const taxa = (contagem.capturou / 200) * 100;
  console.log(`   ${contagem.capturou} capturas, ${contagem.escapou} escapes, ${contagem.travou} travadas (${taxa.toFixed(0)}% de sucesso)`);
  checar(contagem.travou === 0, `${contagem.travou} capturas nunca resolveram`);
  checar(taxa > 10 && taxa < 85, `taxa de captura fora do razoável: ${taxa.toFixed(0)}%`);
}

// 5. Física do arremesso: a esfera cai, quica e para.
console.log('5. física da esfera');
{
  const orbe = new Orbe(0x7fd4ff, 0);
  orbe.raiz.position.set(0, 1.5, 0);
  orbe.lancar(new THREE.Vector3(0, 0, -6));
  let alcance = 0;
  for (let i = 0; i < 72 * 6; i++) {
    orbe.atualizar(1 / 72);
    checar(finito(orbe.posicao), `esfera virou NaN no passo ${i}`);
    alcance = Math.max(alcance, -orbe.posicao.z);
  }
  console.log(`   arremesso a 6 m/s viajou ${alcance.toFixed(2)}m e parou em y=${orbe.posicao.y.toFixed(3)}`);
  checar(orbe.posicao.y >= 0, 'a esfera afundou no chão');
  checar(alcance > 1.5, `arremesso curto demais (${alcance.toFixed(2)}m)`);
  checar(Math.abs(orbe.velocidade.y) < 0.5, 'a esfera nunca assentou');
}

// 6. Spawner: sempre devolve ponto dentro da distância pedida.
console.log('6. pontos de nascimento');
{
  const sala = new Sala(new THREE.Group());
  sala.usarFallback();
  const jogador = new THREE.Vector3(0, 1.6, 0);
  let nulos = 0;
  let fora = 0;
  for (let i = 0; i < 500; i++) {
    const local = sala.pontoDeSpawn(jogador);
    if (!local) {
      nulos++;
      continue;
    }
    const d = Math.hypot(local.ponto.x - jogador.x, local.ponto.z - jogador.z);
    if (d < 1.0 - 1e-6 || d > 3.2 + 1e-6) fora++;
  }
  console.log(`   500 sorteios: ${nulos} sem lugar, ${fora} fora da faixa de distância`);
  checar(fora === 0, `${fora} spawns fora da faixa de distância`);
  checar(nulos < 60, `${nulos} sorteios falharam em achar lugar`);
}

console.log(falhas === 0 ? '\nTUDO PASSOU' : `\n${falhas} VERIFICAÇÕES FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
