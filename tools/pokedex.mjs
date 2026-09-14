/**
 * Gera src/pokedex.gen.ts a partir da PokeAPI: os 151 da primeira geração com
 * tipo, altura, peso, stats-base, taxa de captura e linha evolutiva, mais a
 * tabela de efetividade dos 18 tipos vinda do próprio jogo.
 *
 * Roda uma vez e comita o resultado — o jogo nunca fala com a PokeAPI em tempo
 * de execução: no headset, dentro do WebXR, não dá para depender de rede.
 *
 *   node tools/pokedex.mjs
 *
 * As respostas ficam em cache em .cache/pokeapi/, então repetir é instantâneo.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(RAIZ, '.cache', 'pokeapi');
const SAIDA = join(RAIZ, 'src', 'pokedex.gen.ts');
const API = 'https://pokeapi.co/api/v2';
const ULTIMO = 151;

mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------- rede

async function buscar(caminho) {
  const arquivo = join(CACHE, caminho.replace(/[^\w]+/g, '_') + '.json');
  if (existsSync(arquivo)) return JSON.parse(readFileSync(arquivo, 'utf8'));

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const r = await fetch(`${API}/${caminho}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const dados = await r.json();
      writeFileSync(arquivo, JSON.stringify(dados));
      return dados;
    } catch (erro) {
      if (tentativa === 3) throw erro;
      await new Promise((f) => setTimeout(f, 400 * (tentativa + 1)));
    }
  }
}

/** Em lotes: a PokeAPI é generosa, mas 300 conexões de uma vez não são educadas. */
async function emLotes(itens, tamanho, fn) {
  const saida = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    const lote = itens.slice(i, i + tamanho);
    saida.push(...(await Promise.all(lote.map(fn))));
    process.stdout.write(`\r  ${Math.min(i + tamanho, itens.length)}/${itens.length}`);
  }
  process.stdout.write('\r');
  return saida;
}

// ---------------------------------------------------------------- tradução

const TIPO_PT = {
  normal: 'normal',
  fire: 'fogo',
  water: 'agua',
  electric: 'eletrico',
  grass: 'planta',
  ice: 'gelo',
  fighting: 'lutador',
  poison: 'veneno',
  ground: 'terra',
  flying: 'voador',
  psychic: 'psiquico',
  bug: 'inseto',
  rock: 'pedra',
  ghost: 'fantasma',
  dragon: 'dragao',
  dark: 'sombrio',
  steel: 'aco',
  fairy: 'fada',
};

/**
 * Os "gêneros" da Pokédex ("Seed Pokémon"). A PokeAPI não tem português, então
 * a tradução mora aqui. O que faltar cai no genérico e o jogo não quebra.
 */
const GENERO_PT = {
  Seed: 'Semente',
  Lizard: 'Lagarto',
  Flame: 'Chama',
  'Tiny Turtle': 'Tartaruguinha',
  Turtle: 'Tartaruga',
  Shellfish: 'Molusco',
  Worm: 'Minhoca',
  Cocoon: 'Casulo',
  Butterfly: 'Borboleta',
  Hairy: 'Peludo',
  Poison: 'Veneno',
  'Poison Bee': 'Abelha Venenosa',
  'Tiny Bird': 'Passarinho',
  Bird: 'Pássaro',
  Mouse: 'Rato',
  Beak: 'Bico',
  Snake: 'Cobra',
  Cobra: 'Naja',
  PoisonSting: 'Ferrão',
  Drill: 'Furadeira',
  Fairy: 'Fada',
  Fox: 'Raposa',
  Balloon: 'Balão',
  Bat: 'Morcego',
  Weed: 'Erva',
  Mushroom: 'Cogumelo',
  Insect: 'Inseto',
  Mole: 'Toupeira',
  Scratch: 'Arranhão',
  Classy: 'Refinado',
  Duck: 'Pato',
  'Pig Monkey': 'Macaco-Porco',
  Puppy: 'Filhote',
  Legendary: 'Lendário',
  Tadpole: 'Girino',
  Psi: 'Psi',
  Superpower: 'Superforça',
  Flower: 'Flor',
  Jellyfish: 'Água-Viva',
  Rock: 'Pedra',
  Megaton: 'Megaton',
  'Fire Horse': 'Cavalo de Fogo',
  Dopey: 'Sonolento',
  Hermit: 'Eremita',
  Magnet: 'Ímã',
  'Wild Duck': 'Pato Selvagem',
  'Twin Bird': 'Pássaro Gêmeo',
  Triple: 'Triplo',
  Sea: 'Marinho',
  Bivalve: 'Bivalve',
  Gas: 'Gás',
  Shadow: 'Sombra',
  'Rock Snake': 'Serpente de Pedra',
  Hypnosis: 'Hipnose',
  River: 'Rio',
  Pincer: 'Pinça',
  Ball: 'Bola',
  Egg: 'Ovo',
  Coconut: 'Coco',
  'Lonely': 'Solitário',
  'Bone Keeper': 'Guardião do Osso',
  Kicking: 'Chutador',
  Punching: 'Socador',
  Licking: 'Lambedor',
  'Poison Gas': 'Gás Venenoso',
  Spikes: 'Espinhos',
  'Vine': 'Trepadeira',
  Parent: 'Materno',
  Dragon: 'Dragão',
  Goldfish: 'Peixe Dourado',
  Star: 'Estrela',
  Mysterious: 'Misterioso',
  'Barrier': 'Barreira',
  Mantis: 'Louva-a-Deus',
  'Human Shape': 'Humanoide',
  Electric: 'Elétrico',
  Spitfire: 'Cospe-Fogo',
  'Stag Beetle': 'Besouro',
  'Wild Bull': 'Touro Selvagem',
  Fish: 'Peixe',
  Atrocious: 'Atroz',
  Transport: 'Transporte',
  Transform: 'Transformação',
  Evolution: 'Evolução',
  Bubble: 'Bolha',
  Lightning: 'Relâmpago',
  Virtual: 'Virtual',
  Spiral: 'Espiral',
  Fossil: 'Fóssil',
  Sleeping: 'Dorminhoco',
  Freeze: 'Congelante',
  Genetic: 'Genético',
  New: 'Novo',
  Flame: 'Chama',
};

function generoPt(en) {
  // "Seed Pokémon" -> "Semente"
  const base = en.replace(/\s*Pok[ée]mon$/i, '').trim();
  return GENERO_PT[base] ?? base;
}

/** Uma frase própria para os que todo mundo reconhece. O resto ganha a ficha. */
const SABOR = {
  bulbasaur: 'Carrega a semente nas costas desde que nasce; ela cresce bebendo sol.',
  ivysaur: 'O botão já pesa. Ele se planta ao sol mais tempo do que gostaria de admitir.',
  venusaur: 'A flor solta um cheiro doce que acalma quem está por perto.',
  charmander: 'A chama da cauda conta o humor dele — e apaga se a vida acabar.',
  charmeleon: 'Fica mais bravo quando ganha. A cauda queima azulada na briga.',
  charizard: 'Cospe fogo quente o bastante para derreter pedra. Só voa por prazer.',
  squirtle: 'Se esconde no casco e esguicha de dentro, sem avisar.',
  wartortle: 'A cauda cheia de pelo é sinal de idade. Vive muito.',
  blastoise: 'Os canhões das costas acertam uma lata a cinquenta metros.',
  caterpie: 'As antenas soltam um cheiro forte para espantar quem chega demais.',
  weedle: 'O ferrão da cabeça é venenoso. Não é blefe.',
  pidgey: 'Levanta areia batendo as asas para escapar sem ser visto.',
  rattata: 'Morde qualquer coisa. Os dentes não param de crescer.',
  spearow: 'Barulhento de propósito: chama os outros quando se assusta.',
  ekans: 'Se enrola num galho e dorme de cabeça para baixo.',
  pikachu: 'Guarda eletricidade nas bochechas. Quando descarrega, o pelo arrepia todo.',
  raichu: 'A cauda funciona de para-raios. Precisa descarregar ou fica irritado.',
  sandshrew: 'Se enrola numa bola quando leva susto, e rola ladeira abaixo.',
  nidoran_f: 'As farpas soltam veneno. Ela prefere avisar antes de usar.',
  nidoran_m: 'As orelhas mexem para todo lado; escuta antes de ver.',
  clefairy: 'Dizem que sai em noite de lua cheia para dançar. Ninguém filmou.',
  vulpix: 'Nasce com uma cauda só. As outras cinco vêm com o tempo.',
  ninetales: 'Olha nos olhos por tempo demais. Guarda rancor por décadas.',
  jigglypuff: 'Canta até você dormir. Fica furioso se você não dormir.',
  zubat: 'Não tem olhos. Enxerga o quarto inteiro pelo som.',
  oddish: 'De dia se enterra. De noite anda com as raízes.',
  paras: 'Os cogumelos das costas é que mandam, não ele.',
  venonat: 'Os olhos enormes enxergam no escuro e miram sozinhos.',
  diglett: 'Ninguém nunca viu o que tem embaixo. Ninguém.',
  meowth: 'Junta moedas. A da testa não é dele, é o dele.',
  psyduck: 'A dor de cabeça constante é o que destrava os poderes.',
  mankey: 'Fica com raiva do nada e leva um tempo enorme para passar.',
  growlithe: 'Fareja e não esquece mais. Late para avisar, não para brigar.',
  poliwag: 'A espiral da barriga é o intestino visto de fora.',
  abra: 'Dorme dezoito horas por dia e se teleporta dormindo.',
  kadabra: 'A colher dobra sozinha perto dele. Não é truque.',
  alakazam: 'A memória não apaga nada, nunca. Isso pesa.',
  machop: 'Treina o dia inteiro. Levanta o dobro do próprio peso sem suar.',
  bellsprout: 'O caule é fino mas se move rápido demais para o olho.',
  tentacool: 'Quase todo feito de água. O que queima são os tentáculos.',
  geodude: 'Fica parado no caminho e você acha que é pedra. É, e não é.',
  ponyta: 'Nasce sem conseguir andar. Em um dia já corre mais que você.',
  slowpoke: 'Leva cinco segundos para sentir dor. Não parece se importar.',
  magnemite: 'Flutua com eletromagnetismo. Chega perto da TV e estraga a imagem.',
  farfetchd: 'Não larga o talo de alho-poró. Briga por ele.',
  doduo: 'As duas cabeças nunca dormem ao mesmo tempo.',
  seel: 'Adora água gelada. O chifre quebra gelo por baixo.',
  grimer: 'Nasceu de lodo com raio. Onde passa não cresce mais nada.',
  shellder: 'A língua é mais forte que a concha, e a concha é dura.',
  gastly: 'É gás. Um vento forte espalha ele, e ele volta.',
  haunter: 'Lambe. A língua atravessa e gela por dentro.',
  gengar: 'Se esconde na sua sombra e ri quando você sente frio.',
  onix: 'Cava a cinquenta por hora. Vai ficando mais liso com os anos.',
  drowzee: 'Come sonhos. Os ruins ele cospe fora.',
  krabby: 'As pinças quebram e nascem de novo. Ele nem liga.',
  voltorb: 'Parece uma pokébola largada no chão. Não é. Não chute.',
  exeggcute: 'São seis cabeças que conversam entre si por telepatia.',
  cubone: 'Usa o crânio da mãe. Chora por baixo dele nas noites de lua.',
  hitmonlee: 'As pernas esticam. Você vê o chute depois de levar.',
  hitmonchan: 'Dá três socos por segundo e respira como boxeador.',
  lickitung: 'A língua tem o dobro do corpo e faz tudo por ele.',
  koffing: 'Está sempre meio cheio demais. Explode se apertar.',
  rhyhorn: 'Corre em linha reta e não consegue virar. Nem lembra por que correu.',
  chansey: 'O ovo que ela carrega é bom. Ela só dá para quem gosta.',
  tangela: 'Ninguém sabe o que tem debaixo dos cipós. Eles crescem de volta.',
  kangaskhan: 'Não encoste no filhote. Só isso.',
  horsea: 'Cospe tinta quando se assusta, igual polvo.',
  goldeen: 'Nada contra a corrente o dia inteiro, de bobeira.',
  staryu: 'O núcleo vermelho pisca junto com as estrelas.',
  mr_mime: 'Constrói paredes que não existem e você bate nelas.',
  scyther: 'As foices cortam mais fino do que você consegue ver.',
  jynx: 'Balança o quadril num ritmo que faz você dançar junto.',
  electabuzz: 'Aparece onde caiu raio. Come a eletricidade.',
  magmar: 'Vive em cratera. O bafo sai embaçando o ar.',
  pinsir: 'Prende com as presas e não solta, mesmo se você desistir.',
  tauros: 'Chicoteia o próprio corpo com as caudas para se irritar antes de atacar.',
  magikarp: 'Não faz nada. Vale a pena esperar.',
  gyarados: 'Foi um Magikarp. Lembre disso quando ele rugir.',
  lapras: 'Canta uma coisa triste no meio da água. Restam poucos.',
  ditto: 'Copia qualquer um. Os olhos sempre entregam.',
  eevee: 'O código genético dele é instável — por isso vira tanta coisa.',
  vaporeon: 'As células são iguais às da água. Some quando quer.',
  jolteon: 'O pelo é agulha carregada. Arrepia antes de disparar.',
  flareon: 'Guarda fogo num saco interno. Chega a novecentos graus.',
  porygon: 'É feito de código. Não precisa respirar.',
  omanyte: 'Voltou de um fóssil. Nada de costas, enrolando os tentáculos.',
  kabuto: 'Os olhos das costas ainda funcionam depois de milhões de anos.',
  aerodactyl: 'O rugido dele congela. É antigo e sabe disso.',
  snorlax: 'Come quatrocentos quilos por dia e dorme. Não dá para acordar.',
  articuno: 'Bate as asas e a neve vem junto. Aparece para quem se perdeu.',
  zapdos: 'Vive dentro da nuvem de tempestade. O barulho é ele.',
  moltres: 'As chamas das asas curam ele. Migra para o sul quando se machuca.',
  dratini: 'Troca de pele o tempo todo, porque cresce depressa demais.',
  dragonair: 'As contas do pescoço mudam o tempo. Dizem que traz chuva.',
  dragonite: 'Dá a volta no mundo em dezesseis horas. Salva gente no mar.',
  mewtwo: 'Foi feito em laboratório para brigar. Aprendeu só isso.',
  mew: 'Tem o DNA de todos. Some quando você olha direto.',
};

// ---------------------------------------------------------------- geração

console.log('Pokédex: baixando os 151 da PokeAPI…');

const ids = Array.from({ length: ULTIMO }, (_, i) => i + 1);
const brutos = await emLotes(ids, 8, async (n) => ({
  poke: await buscar(`pokemon/${n}`),
  esp: await buscar(`pokemon-species/${n}`),
}));

console.log('Tabela de tipos…');
const tipos = await emLotes(Object.keys(TIPO_PT), 6, (t) => buscar(`type/${t}`));

console.log('Linhas evolutivas…');
const urlsCadeia = [...new Set(brutos.map((b) => b.esp.evolution_chain.url))];
const cadeias = await emLotes(urlsCadeia, 6, (u) =>
  buscar(`evolution-chain/${u.match(/\/(\d+)\/?$/)[1]}`),
);

/** nome -> { para, nivel } percorrendo a árvore da cadeia. */
const evolucoes = new Map();
for (const cadeia of cadeias) {
  const andar = (no) => {
    for (const proximo of no.evolves_to) {
      const det = proximo.evolution_details[0] ?? {};
      // O jogo só sabe evoluir por nível. Pedra, troca e amizade viram um nível
      // plausível para não deixar a linha truncada no meio.
      const nivel =
        det.min_level ??
        (det.trigger?.name === 'use-item' ? 28 : det.trigger?.name === 'trade' ? 32 : 30);
      evolucoes.set(no.species.name, { para: proximo.species.name, nivel });
      andar(proximo);
    }
  };
  andar(cadeia.chain);
}

const idsValidos = new Set(brutos.map((b) => b.poke.name));

const entradas = brutos.map(({ poke, esp }) => {
  const stat = (n) => poke.stats.find((s) => s.stat.name === n).base_stat;
  const genero = esp.genera.find((g) => g.language.name === 'en')?.genus ?? 'Pokémon';
  const alturaReal = poke.height / 10;
  const peso = poke.weight / 10;
  const chave = poke.name.replace(/-/g, '_');
  const evo = evolucoes.get(poke.name);

  const ficha = `${generoPt(genero)}. ${alturaReal.toFixed(1).replace('.', ',')} m, ${peso
    .toFixed(1)
    .replace('.', ',')} kg.`;

  return {
    num: poke.id,
    id: poke.name,
    nome: poke.name
      .split('-')
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join('-'),
    tipos: poke.types
      .sort((a, b) => a.slot - b.slot)
      .map((t) => TIPO_PT[t.type.name])
      .filter(Boolean),
    alturaReal,
    peso,
    base: {
      hp: stat('hp'),
      atq: stat('attack'),
      def: stat('defense'),
      atqEsp: stat('special-attack'),
      defEsp: stat('special-defense'),
      vel: stat('speed'),
    },
    // 0..255 na PokeAPI; 255 = Caterpie, 3 = Mewtwo.
    taxaBase: esp.capture_rate,
    lendario: esp.is_legendary || esp.is_mythical,
    evolui: evo && idsValidos.has(evo.para) ? evo : null,
    genero: generoPt(genero),
    descricao: SABOR[chave] ?? ficha,
  };
});

// --- tabela de efetividade dos 18 tipos, direto da fonte ---
const efetividade = {};
for (const t of tipos) {
  const de = TIPO_PT[t.name];
  const linha = {};
  for (const alvo of t.damage_relations.double_damage_to) linha[TIPO_PT[alvo.name]] = 2;
  for (const alvo of t.damage_relations.half_damage_to) linha[TIPO_PT[alvo.name]] = 0.5;
  for (const alvo of t.damage_relations.no_damage_to) linha[TIPO_PT[alvo.name]] = 0;
  efetividade[de] = linha;
}

// ---------------------------------------------------------------- saída

const cab = `// GERADO por tools/pokedex.mjs a partir da PokeAPI — não edite à mão.
// Os ajustes de jogo (altura em RA, raridade, golpes) ficam em src/pokedex.ts.
`;

const corpo = `${cab}
export type Tipo =
${Object.values(TIPO_PT)
  .map((t) => `  | '${t}'`)
  .join('\n')};

export interface BaseStats {
  hp: number;
  atq: number;
  def: number;
  atqEsp: number;
  defEsp: number;
  vel: number;
}

export interface EntradaDex {
  num: number;
  id: string;
  nome: string;
  tipos: Tipo[];
  /** Altura real da Pokédex, em metros. */
  alturaReal: number;
  peso: number;
  base: BaseStats;
  /** 3 (Mewtwo) a 255 (Caterpie), como no jogo original. */
  taxaBase: number;
  lendario: boolean;
  evolui: { para: string; nivel: number } | null;
  genero: string;
  descricao: string;
}

export const EFETIVIDADE: Record<Tipo, Partial<Record<Tipo, number>>> = ${JSON.stringify(
  efetividade,
  null,
  2,
)} as const;

export const POKEDEX: readonly EntradaDex[] = ${JSON.stringify(entradas, null, 2)} as const;
`;

writeFileSync(SAIDA, corpo);
console.log(
  `\nsrc/pokedex.gen.ts: ${entradas.length} espécies, ${
    entradas.filter((e) => e.evolui).length
  } com evolução, ${Object.keys(efetividade).length} tipos.`,
);
