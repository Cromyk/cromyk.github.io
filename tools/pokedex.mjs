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

/**
 * As cinco de fora de Kanto que o jogo deixa entrar, e por quê.
 *
 * O jogo é a primeira geração, e isso é uma decisão, não uma limitação: 151 é
 * um número que cabe numa cabeça, e uma Pokédex que vai a 1025 deixa de ser uma
 * coleção para virar um catálogo.
 *
 * A exceção é o Eevee. Ele é o único bicho da gen 1 cuja graça INTEIRA é a
 * escolha de para onde ele vai — e com só três saídas, metade da piada não
 * existe. Espeon e Umbreon são de Johto; Leafeon e Glaceon, de Sinnoh; Sylveon,
 * de Kalos. Entram como CONVIDADAS: não nascem selvagens, não contam na
 * contagem de 151, e só existem na ponta da linha do Eevee. Quem nunca usar uma
 * pedra nele joga exatamente o jogo de antes.
 */
const CONVIDADAS = [
  196, // Espeon
  197, // Umbreon
  470, // Leafeon
  471, // Glaceon
  700, // Sylveon
];

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
  metapod: 'Por dentro é quase líquido. A casca é dura porque o que ela guarda não é.',
  butterfree: 'Acha mel a dez quilômetros. As asas repelem água e ele voa na chuva.',
  weedle: 'O ferrão da cabeça é venenoso. Não é blefe.',
  kakuna: 'Quase não se mexe, mas está fervendo por dentro. Esquenta na sua mão.',
  beedrill: 'Vem em bando e não desiste. Os três ferrões injetam de verdade.',
  pidgey: 'Levanta areia batendo as asas para escapar sem ser visto.',
  pidgeotto: 'Marca um território enorme e passa o dia patrulhando as bordas dele.',
  pidgeot: 'Abre as asas e o vento deita o mato. A crista muda de cor no voo.',
  rattata: 'Morde qualquer coisa. Os dentes não param de crescer.',
  raticate: 'Os dentes crescem depressa demais; ele rói pedra para desgastá-los.',
  spearow: 'Barulhento de propósito: chama os outros quando se assusta.',
  fearow: 'O bico comprido entra na terra e na água. Voa o dia inteiro sem pousar.',
  ekans: 'Se enrola num galho e dorme de cabeça para baixo.',
  arbok: 'O desenho da barriga assusta de propósito, e não há dois iguais.',
  pikachu: 'Guarda eletricidade nas bochechas. Quando descarrega, o pelo arrepia todo.',
  raichu: 'A cauda funciona de para-raios. Precisa descarregar ou fica irritado.',
  sandshrew: 'Se enrola numa bola quando leva susto, e rola ladeira abaixo.',
  sandslash: 'Enrola-se numa bola de espinhos e desce a ladeira rolando.',
  nidoran_f: 'As farpas soltam veneno. Ela prefere avisar antes de usar.',
  nidorina: 'Recolhe os espinhos perto da cria, para não machucar sem querer.',
  nidoqueen: 'A couraça endurece quando ela está protegendo alguém.',
  nidoran_m: 'As orelhas mexem para todo lado; escuta antes de ver.',
  nidorino: 'O chifre fura diamante. As orelhas abrem como antena ao menor barulho.',
  nidoking: 'Um golpe de cauda derruba uma torre de metal. Ele mede a força — às vezes.',
  clefairy: 'Dizem que sai em noite de lua cheia para dançar. Ninguém filmou.',
  clefable: 'Escuta um alfinete cair a um quilômetro e some antes de você chegar.',
  vulpix: 'Nasce com uma cauda só. As outras cinco vêm com o tempo.',
  ninetales: 'Olha nos olhos por tempo demais. Guarda rancor por décadas.',
  jigglypuff: 'Canta até você dormir. Fica furioso se você não dormir.',
  wigglytuff: 'Enche-se de ar até ficar maior que o adversário. O pelo é macio demais.',
  zubat: 'Não tem olhos. Enxerga o quarto inteiro pelo som.',
  golbat: 'Bebe tanto que fica pesado e volta voando torto.',
  oddish: 'De dia se enterra. De noite anda com as raízes.',
  gloom: 'O cheiro gruda em você por dois dias. Ele não sente e não entende a bronca.',
  vileplume: 'As maiores pétalas do mundo, e o pólen que elas sacodem é tóxico.',
  paras: 'Os cogumelos das costas é que mandam, não ele.',
  parasect: 'Quem manda é o cogumelo. O inseto só carrega, e há tempos.',
  venonat: 'Os olhos enormes enxergam no escuro e miram sozinhos.',
  venomoth: 'As escamas soltam no ar ao bater as asas. Respirar perto delas é o veneno.',
  diglett: 'Ninguém nunca viu o que tem embaixo. Ninguém.',
  dugtrio: 'Três cabeças, um bicho só. Cavam a cem quilômetros por hora.',
  meowth: 'Junta moedas. A da testa não é dele, é o dele.',
  persian: 'A joia da testa vale uma fortuna, e ele não gosta de mão perto dela.',
  psyduck: 'A dor de cabeça constante é o que destrava os poderes.',
  golduck: 'Nada mais rápido que um campeão olímpico sem parecer estar tentando.',
  mankey: 'Fica com raiva do nada e leva um tempo enorme para passar.',
  primeape: 'Acorda bravo e dorme bravo. Persegue até um dos dois cair.',
  growlithe: 'Fareja e não esquece mais. Late para avisar, não para brigar.',
  arcanine: 'Corre dez mil quilômetros num dia. Já estava nas pinturas antigas.',
  poliwag: 'A espiral da barriga é o intestino visto de fora.',
  poliwhirl: 'A pele vive molhada. A espiral da barriga hipnotiza quem olha demais.',
  poliwrath: 'Braço de músculo puro: atravessa o oceano sem parar para descansar.',
  abra: 'Dorme dezoito horas por dia e se teleporta dormindo.',
  kadabra: 'A colher dobra sozinha perto dele. Não é truque.',
  alakazam: 'A memória não apaga nada, nunca. Isso pesa.',
  machop: 'Treina o dia inteiro. Levanta o dobro do próprio peso sem suar.',
  machoke: 'O cinturão segura a força dele. Sem ele, não controla o próprio braço.',
  machamp: 'Quatro braços e quatro socos por segundo. Perde tempo amarrando o sapato.',
  bellsprout: 'O caule é fino mas se move rápido demais para o olho.',
  weepinbell: 'Pendura-se num galho e espera parado. O que encostar, entra.',
  victreebel: 'O cheiro de mel é a armadilha. Lá dentro, o ácido resolve em dois dias.',
  tentacool: 'Quase todo feito de água. O que queima são os tentáculos.',
  tentacruel: 'Oitenta tentáculos que se esticam e agarram. As joias piscam antes.',
  geodude: 'Fica parado no caminho e você acha que é pedra. É, e não é.',
  graveler: 'Desce a montanha rolando e não desvia de nada. Come pedra no caminho.',
  golem: 'Troca a casca uma vez por ano. Aguenta dinamite sem trincar.',
  ponyta: 'Nasce sem conseguir andar. Em um dia já corre mais que você.',
  rapidash: 'Dez segundos para chegar aos duzentos. Adora quando alguém tenta acompanhar.',
  slowpoke: 'Leva cinco segundos para sentir dor. Não parece se importar.',
  slowbro: 'O Shellder na cauda mudou tudo — e ele ainda não reparou direito.',
  magnemite: 'Flutua com eletromagnetismo. Chega perto da TV e estraga a imagem.',
  magneton: 'Três colados. Perto deles a bússola gira sozinha e o rádio morre.',
  farfetchd: 'Não larga o talo de alho-poró. Briga por ele.',
  doduo: 'As duas cabeças nunca dormem ao mesmo tempo.',
  dodrio: 'Três cabeças e três humores. Duas dormem enquanto a terceira vigia.',
  seel: 'Adora água gelada. O chifre quebra gelo por baixo.',
  dewgong: 'Dorme na água gelada e acorda quando o sol bate. A pele guarda o calor.',
  grimer: 'Nasceu de lodo com raio. Onde passa não cresce mais nada.',
  muk: 'Onde ele passa, nada cresce por um tempo. O cheiro derruba de longe.',
  shellder: 'A língua é mais forte que a concha, e a concha é dura.',
  cloyster: 'A concha é mais dura que diamante, e ninguém viu o que tem dentro.',
  gastly: 'É gás. Um vento forte espalha ele, e ele volta.',
  haunter: 'Lambe. A língua atravessa e gela por dentro.',
  gengar: 'Se esconde na sua sombra e ri quando você sente frio.',
  onix: 'Cava a cinquenta por hora. Vai ficando mais liso com os anos.',
  drowzee: 'Come sonhos. Os ruins ele cospe fora.',
  hypno: 'O pêndulo faz o serviço. Come sonho, e às vezes leva junto quem sonhava.',
  krabby: 'As pinças quebram e nascem de novo. Ele nem liga.',
  kingler: 'A pinça grande tem dez mil cavalos, e é pesada demais para ele erguer.',
  voltorb: 'Parece uma pokébola largada no chão. Não é. Não chute.',
  electrode: 'Guarda eletricidade até não caber mais. Explode por qualquer motivo.',
  exeggcute: 'São seis cabeças que conversam entre si por telepatia.',
  exeggutor: 'Cada cabeça pensa por si. Quando uma cai, ela sai andando sozinha.',
  cubone: 'Usa o crânio da mãe. Chora por baixo dele nas noites de lua.',
  marowak: 'O osso é arma e é lembrança. Ele acerta de longe, sem olhar duas vezes.',
  hitmonlee: 'As pernas esticam. Você vê o chute depois de levar.',
  hitmonchan: 'Dá três socos por segundo e respira como boxeador.',
  lickitung: 'A língua tem o dobro do corpo e faz tudo por ele.',
  koffing: 'Está sempre meio cheio demais. Explode se apertar.',
  weezing: 'Dois corpos num só, cheios de gás. Quanto mais lixo por perto, melhor.',
  rhyhorn: 'Corre em linha reta e não consegue virar. Nem lembra por que correu.',
  rhydon: 'O chifre fura diamante. Anda em duas pernas e esquece o que ia fazer.',
  chansey: 'O ovo que ela carrega é bom. Ela só dá para quem gosta.',
  tangela: 'Ninguém sabe o que tem debaixo dos cipós. Eles crescem de volta.',
  kangaskhan: 'Não encoste no filhote. Só isso.',
  horsea: 'Cospe tinta quando se assusta, igual polvo.',
  seadra: 'Os espinhos das costas são venenosos. Dorme enroscado no coral.',
  goldeen: 'Nada contra a corrente o dia inteiro, de bobeira.',
  seaking: 'Cava o ninho na pedra do rio com o chifre e defende até o fim.',
  staryu: 'O núcleo vermelho pisca junto com as estrelas.',
  starmie: 'O núcleo do meio brilha em sete cores. Dizem que ele fala com o céu.',
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
  omastar: 'Os tentáculos prendiam a presa. A concha cresceu até ele não se mexer mais.',
  kabuto: 'Os olhos das costas ainda funcionam depois de milhões de anos.',
  kabutops: 'As lâminas cortam e sugam. Era rápido na água; em terra não dura muito.',
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
  // As convidadas. Ver CONVIDADAS no topo.
  espeon: 'Sente o ar se mexer e sabe o que você vai fazer antes de você.',
  umbreon: 'Os anéis brilham no escuro quando a lua bate. Some no resto do tempo.',
  leafeon: 'Faz fotossíntese, então quase não come. Cheira a mato cortado.',
  glaceon: 'Abaixa a própria temperatura e congela o ar em volta em pó de gelo.',
  sylveon: 'Enrola as fitas no seu braço e você para de conseguir brigar.',
};

// ---------------------------------------------------------------- geração

console.log(`Pokédex: baixando os ${ULTIMO} da PokeAPI, mais ${CONVIDADAS.length} convidadas…`);

const ids = [...Array.from({ length: ULTIMO }, (_, i) => i + 1), ...CONVIDADAS];
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
    // Fora dos 151. Ver CONVIDADAS no topo: não nasce selvagem e não conta na
    // Pokédex principal — só chega pela pedra na mão do Eevee.
    convidada: poke.id > ULTIMO,
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
  /**
   * De fora da primeira geração, entrando só como ponta de uma linha evolutiva.
   *
   * Hoje são as cinco eeveelutions modernas. Quem é convidada não nasce
   * selvagem e não entra na contagem de 151 — ver \`CONVIDADAS\` em
   * tools/pokedex.mjs e \`ESPECIES_KANTO\` em src/species.ts.
   */
  convidada: boolean;
}

export const EFETIVIDADE: Record<Tipo, Partial<Record<Tipo, number>>> = ${JSON.stringify(
  efetividade,
  null,
  2,
)} as const;

export const POKEDEX: readonly EntradaDex[] = ${JSON.stringify(entradas, null, 2)} as const;
`;

writeFileSync(SAIDA, corpo);

// Quem caiu no preenchimento automático, em voz alta.
//
// O `SABOR[chave] ?? ficha` lá em cima é conveniente e silencioso, e durante
// muito tempo 54 espécies — quase todas EVOLUÇÕES — saíram daqui com a ficha
// dizendo "Casulo. 0,7 m, 9,9 kg.", que é exatamente o que a linha de cima do
// painel já mostra. Ninguém percebeu porque nada reclamou.
const semSabor = entradas.filter((e) => !SABOR[e.id.replace(/-/g, '_')]);
if (semSabor.length > 0) {
  console.log(
    `\n⚠ ${semSabor.length} sem ficha escrita, caíram no gênero+medidas — escreva em SABOR:\n  ` +
      semSabor.map((e) => `${e.num} ${e.id}`).join(', '),
  );
}

console.log(
  `\nsrc/pokedex.gen.ts: ${entradas.length} espécies, ${
    entradas.filter((e) => e.evolui).length
  } com evolução, ${Object.keys(efetividade).length} tipos.`,
);
