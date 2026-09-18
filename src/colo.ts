import * as THREE from 'three';

/**
 * O colo: quem está na sua mão, e onde ele fica.
 *
 * ## Por que isto saiu de game.ts
 *
 * O colo era três coisas espalhadas: um `Map<indiceDaMao, Pokemon>`, duas
 * constantes de módulo e a conta de posição escrita à mão dentro de
 * `atualizarColo`. Enquanto era uma mão só, isso bastava — o mapa respondia
 * tudo o que havia para perguntar.
 *
 * Com duas mãos aparece uma pergunta que um `Map<mão, bicho>` não sabe
 * responder: **quantas mãos estão NESTE bicho?** Sem ela, abrir uma das duas
 * mãos derruba o Pokémon que a outra ainda segura — e passar um bicho de uma
 * mão para a outra, que é a primeira coisa que qualquer pessoa tenta depois de
 * pegá-lo com as duas, vira um bicho no chão.
 *
 * Aqui o mapa ganha dono, o invariante fica num lugar só, e as contas viram
 * funções puras de vetor — que é o que permite `tools/smoke.ts` conferir o
 * arranjo em Node, sem navegador. Foi o mesmo caminho que o cinto fez.
 *
 * ## O estado de duas mãos já existia, e estava quebrado
 *
 * Não é um estado novo: era alcançável por acidente. A guarda de `pegarBola`
 * olhava só a PRÓPRIA mão (`pokemonNoColo.has(mao.indice)`), `Pokemon.
 * pegarNoColo` não recusava quem já estava em `colo`, e `atualizarColo`
 * escrevia a posição uma vez por entrada do mapa — então a última mão da ordem
 * de inserção vencia, o bicho grudava nela e a outra o atravessava. Com o
 * feedback inteiro (grito, vibração, aviso) disparando de novo.
 */

/**
 * Até que altura um Pokémon cabe no colo de UMA mão.
 *
 * Meio metro: dá Pikachu, Charmander, Eevee, Squirtle — os que uma pessoa
 * pegaria no colo sem pensar. Onix não entra, e não entrar é a resposta certa;
 * um Onix de oito metros na palma da mão não é uma coisa fofa, é um erro de
 * escala andando pela sala.
 *
 * Este número NÃO subiu quando as duas mãos entraram, e isso é decisão: relaxar
 * aqui faria o gesto de uma mão passar a aceitar um Snorlax junto, que é o
 * oposto do que foi pedido. Ele deixou de significar "o que cabe no colo" e
 * passou a significar "o que UMA mão sustenta".
 */
export const ALTURA_DE_COLO = 0.5;

/**
 * Até que altura ele cabe nas DUAS.
 *
 * Oitenta e cinco centímetros, e o porquê não é força — é envergadura e é o seu
 * rosto. Com as palmas na altura do peito (~1,20 m) e o centro dele NAS palmas,
 * o topo da cabeça fica a 1,20 + 0,425 = 1,62 m: a altura dos seus olhos.
 * Oitenta e cinco centímetros é o bicho que, levantado com as duas mãos,
 * termina de cara para a sua cara.
 *
 * Passando a curva de `alturaNaSala` (src/species.ts) pelas 156 entradas da
 * Pokédex: 132 cabem numa mão, 154 passam a caber nas duas, e ficam de fora
 * exatamente **Gyarados** (0,93 m na sala) e **Onix** (1,06 m) — que são
 * precisamente os dois de que o comentário de `ALTURA_DE_COLO` estava falando.
 *
 * Dez centímetros de folga para Dragonair (0,75 m) também são de propósito: um
 * teto que separasse por milímetros seria um teto que a próxima mexida na curva
 * de escala quebraria sem ninguém ver.
 */
export const ALTURA_DE_ABRACO = 0.85;

/** Quão perto a PRIMEIRA mão precisa chegar do corpo dele para pegar. */
export const ALCANCE_DE_COLO = 0.3;

/**
 * E quão perto a SEGUNDA. Metade, de propósito.
 *
 * A primeira mão precisa de generosidade para ACHAR o bicho — ele está no chão,
 * você está agachado, e a sua própria mão tapa o alvo na reta final. A segunda
 * já sabe onde ele está, porque ele está pendurado na outra.
 *
 * E é esta metade que protege o gesto que a segunda mão mais ameaça roubar: o
 * cinto de pokébolas mora no antebraço OPOSTO, com o primeiro slot 7,5 cm atrás
 * do punho. Um bicho pendurado numa mão tem o centro a uns 20 cm dali — cinco
 * centímetros acima deste limiar, e a margem cresce junto com o bicho.
 */
export const ALCANCE_DE_ABRACO = 0.15;

/**
 * A mola que leva o corpo até as suas mãos, por segundo.
 *
 * `lerp(alvo, min(1, dt * 26))` fecha a distância em ~70 ms, cinco quadros a
 * 72 Hz. Acima de uns 40 vira teleporte e o corpo perde a inércia — ele para de
 * ter peso; abaixo de uns 15 os seus dedos atravessam o bicho quando você anda
 * com ele no colo. Vale para uma mão também: é o que alisa o pulo do instante
 * em que a segunda mão fecha, e o do instante em que ela abre.
 */
export const MOLA_DO_COLO = 26;

/**
 * Quando sobra uma mão só num bicho que não cabe numa mão, ele ESCORREGA.
 *
 * Meio metro por segundo, por até um segundo — e fechar a mão de volta dentro
 * desse tempo o traz de volta. Um segundo é quanto uma mão perdida pelo
 * rastreamento leva para voltar, e é curto o bastante para soltar de propósito
 * não parecer um gesto travado. Meio metro por segundo é a velocidade que se lê
 * como PESO puxando, e não como o bicho caindo.
 */
export const TEMPO_ATE_ESCORREGAR = 1;
export const ESCORREGAO = 0.5;

/**
 * O quanto o corpo achata sob o próprio peso, no abraço.
 *
 * Entra no `impacto` da criatura, que já é multiplicado por 0,22 no
 * achatamento: no teto do abraço isso dá ~2% de corpo comprimido. Visível como
 * peso, longe de parecer uma queda.
 *
 * Existe porque é o ÚNICO sinal de peso que funciona de mão nua: a vibração
 * depende do gamepad do controle, e uma fonte de hand tracking não tem um. O
 * "sim" do gesto tem de estar na imagem e no som; o tato é bônus.
 */
export const PESO_NO_ABRACO = 0.1;

/** Um palmo acima da palma: onde um bicho pequeno fica quando você o segura. */
const ACIMA_DA_PALMA = 0.02;

/** Cabe no colo de quantas mãos? `alturaEfetiva` já inclui a escala do corpo. */
export function cabeNoColo(alturaEfetiva: number, maos: 1 | 2): boolean {
  return alturaEfetiva <= (maos === 2 ? ALTURA_DE_ABRACO : ALTURA_DE_COLO);
}

/**
 * Quão perto a mão precisa chegar do CENTRO dele.
 *
 * Cresce com o raio do bicho porque a distância é medida contra o centro: um
 * corpo largo exigiria enfiar o braço dentro dele para "encostar". A fórmula de
 * uma mão é a que sempre valeu, letra por letra.
 */
export function alcanceDoColo(raio: number, maos: 1 | 2): number {
  return maos === 2
    ? Math.max(ALCANCE_DE_ABRACO, raio * 0.9)
    : Math.max(ALCANCE_DE_COLO, raio * 1.1);
}

/**
 * Onde o corpo fica, dadas uma ou duas mãos.
 *
 * Com uma mão: um pouco acima da palma, que é o que sempre foi.
 *
 * Com duas: o corpo fica ENTRE elas — x e z no ponto médio, e a raiz meia
 * altura ABAIXO desse meio. Isso não é estética, é o invariante de que o resto
 * do jogo depende: `Pokemon.centro` soma meia altura na vertical do mundo, e
 * pôr a raiz meia altura abaixo do meio das palmas é o que faz o centro dele
 * cair exatamente entre as suas mãos. O alvo do golpe, o alvo da pokébola e o
 * teste de alcance do próprio abraço continuam apontando para dentro do corpo
 * sem ninguém consertar nada.
 *
 * **Nunca inclinar o corpo por causa disto.** `centro` ignora a rotação da
 * raiz: herdar roll ou pitch do vetor entre as mãos — que é a tentação óbvia —
 * põe o alvo do golpe e o da bola flutuando fora do bicho. O giro do corpo no
 * colo vem de quem ele está olhando, e é só yaw.
 *
 * O piso é o último corte: os pés não atravessam o carpete.
 */
export function pontoDoColo(
  a: THREE.Vector3,
  b: THREE.Vector3 | null,
  alturaEfetiva: number,
  pisoY: number,
  alvo = new THREE.Vector3(),
): THREE.Vector3 {
  if (!b) {
    alvo.set(a.x, a.y + ACIMA_DA_PALMA, a.z);
  } else {
    alvo.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 - alturaEfetiva * 0.5, (a.z + b.z) * 0.5);
  }
  alvo.y = Math.max(pisoY, alvo.y);
  return alvo;
}

/**
 * O que o colo precisa saber de um Pokémon.
 *
 * Interface estrutural, e não `import type { Pokemon }`, para este arquivo não
 * arrastar creature.ts — que arrasta o carregador de modelos, que arrasta o
 * three inteiro com GLTFLoader. `tools/smoke.ts` consegue construir o corpo
 * falso dele em três linhas por causa disso.
 */
export interface Aninhavel {
  readonly altura: number;
  readonly raio: number;
  readonly raiz: THREE.Object3D;
  abracado: boolean;
  pegarNoColo(): boolean;
  soltarDoColo(): void;
}

/** O que `soltar` fez: tirou uma das duas mãos, ou pôs o bicho no chão. */
export type Soltura = 'reduziu' | 'soltou' | null;

/**
 * Quem está em que mão — e, principalmente, quantas mãos estão em cada bicho.
 *
 * O invariante mora todo aqui: `Pokemon.soltarDoColo()` só é chamado quando a
 * ÚLTIMA mão largou. É o que faz passar o bicho de uma mão para a outra ser um
 * gesto, e não uma queda.
 */
export class Colo {
  private porMao = new Map<number, Aninhavel>();

  /** Esta mão passa a segurar este bicho. Devolve quantas mãos ele tem agora. */
  pegar(indiceDaMao: number, bicho: Aninhavel): 1 | 2 {
    this.porMao.set(indiceDaMao, bicho);
    const quantas = this.maosEm(bicho);
    bicho.abracado = quantas >= 2;
    return quantas >= 2 ? 2 : 1;
  }

  /**
   * Esta mão largou.
   *
   * `'reduziu'` quer dizer que o bicho continua no ar, na outra mão — e é por
   * isso que esta função existe em vez de um `delete` na chamadora.
   */
  soltar(indiceDaMao: number): Soltura {
    const bicho = this.porMao.get(indiceDaMao);
    if (!bicho) return null;
    this.porMao.delete(indiceDaMao);
    const restantes = this.maosEm(bicho);
    bicho.abracado = false;
    if (restantes > 0) return 'reduziu';
    bicho.soltarDoColo();
    return 'soltou';
  }

  /** Tira este bicho de TODAS as mãos. Devolve os índices que o seguravam. */
  tirar(bicho: Aninhavel): number[] {
    const donos = this.donosDe(bicho);
    for (const i of donos) this.porMao.delete(i);
    bicho.abracado = false;
    if (donos.length > 0) bicho.soltarDoColo();
    return donos;
  }

  /** Esquece esta mão sem mexer no bicho. Para a faxina de mão desconectada. */
  esquecer(indiceDaMao: number): Aninhavel | null {
    const bicho = this.porMao.get(indiceDaMao) ?? null;
    this.porMao.delete(indiceDaMao);
    if (bicho) bicho.abracado = this.maosEm(bicho) >= 2;
    return bicho;
  }

  tem(indiceDaMao: number): boolean {
    return this.porMao.has(indiceDaMao);
  }

  bichoDe(indiceDaMao: number): Aninhavel | null {
    return this.porMao.get(indiceDaMao) ?? null;
  }

  /** Quantas mãos estão NESTE bicho. A pergunta que o mapa por mão não sabia. */
  maosEm(bicho: Aninhavel): number {
    let quantas = 0;
    for (const b of this.porMao.values()) if (b === bicho) quantas++;
    return quantas;
  }

  donosDe(bicho: Aninhavel): number[] {
    const saida: number[] = [];
    for (const [i, b] of this.porMao) if (b === bicho) saida.push(i);
    return saida;
  }

  /** Os índices de mão ocupados, para a faxina por quadro. */
  indices(): number[] {
    return [...this.porMao.keys()];
  }

  /** Cada bicho UMA vez, mesmo com duas mãos nele. */
  bichos(): Aninhavel[] {
    return [...new Set(this.porMao.values())];
  }

  get tamanho(): number {
    return this.porMao.size;
  }
}
