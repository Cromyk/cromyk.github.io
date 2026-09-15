/**
 * Gera src/golpes.gen.ts: os golpes de verdade da primeira geração e QUEM
 * APRENDE CADA UM, em que nível.
 *
 * Antes, o arsenal de cada espécie era inventado por uma regra: um golpe
 * físico e um especial do tipo dela, mais um de status escolhido pelos stats.
 * Funcionava, e era falso — todo Pokémon de fogo tinha exatamente os mesmos
 * golpes, e Charmander e Vulpix eram indistinguíveis na mão.
 *
 * Aqui os golpes vêm da PokeAPI, da tabela de aprendizado por nível de
 * Red/Blue/Yellow. Cada espécie tem a lista dela, e o que ela SABE depende do
 * nível em que está — como no jogo. Pikachu só tem Choque do Trovão a partir
 * do nível 26; antes disso ele briga com Choque Elétrico e Investida Rápida.
 *
 *   node tools/golpes.mjs
 *
 * As respostas ficam em .cache/pokeapi/ (as mesmas de tools/pokedex.mjs), então
 * repetir é instantâneo.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(RAIZ, '.cache', 'pokeapi');
const SAIDA = join(RAIZ, 'src', 'golpes.gen.ts');
const API = 'https://pokeapi.co/api/v2';
const ULTIMO = 151;
/** As versões cujo aprendizado por nível interessa: a primeira geração. */
const GRUPOS = new Set(['red-blue', 'yellow']);

mkdirSync(CACHE, { recursive: true });

const arquivoDe = (caminho) => join(CACHE, caminho.replace(/[^\w]+/g, '_') + '.json');

async function buscar(caminho) {
  const arquivo = arquivoDe(caminho);
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

const TIPO_PT = {
  normal: 'normal', fire: 'fogo', water: 'agua', electric: 'eletrico', grass: 'planta',
  ice: 'gelo', fighting: 'lutador', poison: 'veneno', ground: 'terra', flying: 'voador',
  psychic: 'psiquico', bug: 'inseto', rock: 'pedra', ghost: 'fantasma', dragon: 'dragao',
  dark: 'sombrio', steel: 'aco', fairy: 'fada',
};

/**
 * Os 147 golpes que alguém aprende por nível na primeira geração, em português.
 *
 * Onde existe uma tradução consagrada no anime ou nos jogos em pt-BR, é ela.
 * Onde não existe, é uma tradução direta — o critério é que o nome diga o que
 * o golpe faz, porque num painel de sete centímetros o nome é quase tudo o que
 * o jogador tem para decidir.
 */
const GOLPE_PT = {
  absorb: 'Absorver', acid: 'Ácido', 'acid-armor': 'Armadura Ácida', agility: 'Agilidade',
  amnesia: 'Amnésia', 'aurora-beam': 'Raio Aurora', barrage: 'Barragem', barrier: 'Barreira',
  bind: 'Amarrar', bite: 'Mordida', blizzard: 'Nevasca', 'body-slam': 'Bote', 'bone-club': 'Clava de Osso',
  bonemerang: 'Ossomerangue', bubble: 'Bolha', clamp: 'Pinçar', 'comet-punch': 'Soco Cometa',
  'confuse-ray': 'Raio Confuso', confusion: 'Confusão', constrict: 'Constrição', conversion: 'Conversão',
  counter: 'Contra-Ataque', crabhammer: 'Martelo de Caranguejo', 'defense-curl': 'Encolher',
  'defense-curl_': 'Encolher', dig: 'Escavar', disable: 'Bloquear', 'dizzy-punch': 'Soco Tonto',
  'double-edge': 'Fio Duplo', 'double-kick': 'Chute Duplo', 'double-slap': 'Tapa Duplo',
  'double-team': 'Sósia', 'dragon-rage': 'Fúria do Dragão', 'dream-eater': 'Come-Sonhos',
  'drill-peck': 'Bicada Broca', earthquake: 'Terremoto', ember: 'Brasa', explosion: 'Explosão',
  'fire-punch': 'Soco de Fogo', 'fire-spin': 'Redemoinho de Fogo', flamethrower: 'Lança-Chamas',
  'focus-energy': 'Concentrar', 'fury-attack': 'Ataque Furioso', 'fury-swipes': 'Golpes Furiosos',
  glare: 'Encarar Fixo', growl: 'Rosnar', growth: 'Crescimento', guillotine: 'Guilhotina',
  gust: 'Rajada', harden: 'Endurecer', haze: 'Névoa Densa', headbutt: 'Cabeçada',
  'high-jump-kick': 'Joelhada Voadora', 'horn-attack': 'Chifrada', 'horn-drill': 'Chifre Broca',
  'hydro-pump': 'Hidrobomba', 'hyper-beam': 'Hiper-Raio', 'hyper-fang': 'Presa Hiper',
  hypnosis: 'Hipnose', 'ice-beam': 'Raio de Gelo', 'ice-punch': 'Soco de Gelo',
  'jump-kick': 'Chute Voador', 'karate-chop': 'Golpe de Caratê', kinesis: 'Cinese',
  'leech-life': 'Sanguessuga', 'leech-seed': 'Semente Sanguessuga', leer: 'Encarar', lick: 'Lambida',
  'light-screen': 'Tela de Luz', 'lovely-kiss': 'Beijo Adorável', 'low-kick': 'Rasteira',
  meditate: 'Meditar', 'mega-kick': 'Megachute', 'mega-punch': 'Megassoco', metronome: 'Metrônomo',
  minimize: 'Encolher-se', 'mirror-move': 'Golpe Espelho', mist: 'Neblina', 'night-shade': 'Sombra Noturna',
  'pay-day': 'Dia de Pagamento', peck: 'Bicada', 'petal-dance': 'Dança das Pétalas',
  'pin-missile': 'Míssil de Agulhas', 'poison-gas': 'Gás Venenoso', 'poison-powder': 'Pó Venenoso',
  'poison-sting': 'Ferroada Tóxica', pound: 'Pancada', psybeam: 'Psicorraio', psychic: 'Psíquico',
  'quick-attack': 'Ataque Rápido', rage: 'Fúria', 'razor-leaf': 'Folha Navalha', recover: 'Recuperar',
  reflect: 'Refletir', rest: 'Descansar', roar: 'Rugido', 'rock-throw': 'Lançar Pedra',
  'rolling-kick': 'Chute Giratório', 'sand-attack': 'Jato de Areia', scratch: 'Arranhão',
  screech: 'Guincho', 'seismic-toss': 'Arremesso Sísmico', 'self-destruct': 'Autodestruição',
  sharpen: 'Afiar', sing: 'Cantar', 'skull-bash': 'Cabeçada de Crânio', 'sky-attack': 'Ataque Celeste',
  slam: 'Batida', slash: 'Talho', 'sleep-powder': 'Pó do Sono', sludge: 'Lodo', smog: 'Fumaça Tóxica',
  smokescreen: 'Cortina de Fumaça', 'solar-beam': 'Raio Solar', 'sonic-boom': 'Estrondo Sônico',
  'spike-cannon': 'Canhão de Espinhos', splash: 'Splash', spore: 'Esporo', stomp: 'Pisão',
  'string-shot': 'Jato de Teia', 'stun-spore': 'Pó Paralisante', submission: 'Submissão',
  substitute: 'Substituto', 'super-fang': 'Superpresa', supersonic: 'Supersônico', swift: 'Veloz',
  'swords-dance': 'Dança das Espadas', tackle: 'Investida', 'tail-whip': 'Chicote de Cauda',
  'take-down': 'Derrubada', teleport: 'Teletransporte', thrash: 'Surra', thunder: 'Trovão',
  'thunder-punch': 'Soco do Trovão', 'thunder-shock': 'Choque Elétrico', 'thunder-wave': 'Onda de Choque',
  thunderbolt: 'Choque do Trovão', transform: 'Transformar', 'tri-attack': 'Ataque Triplo',
  twineedle: 'Agulha Dupla', 'vice-grip': 'Torniquete', 'vine-whip': 'Chicote de Cipó',
  'water-gun': 'Jato d’Água', waterfall: 'Cachoeira', whirlwind: 'Ventania', 'wing-attack': 'Asa de Ataque',
  withdraw: 'Recolher-se', wrap: 'Enrolar',
};

/**
 * Como cada stat da PokeAPI cai nos quatro estágios que o jogo modela.
 *
 * O jogo tem UM estágio de ataque (e não ataque físico e especial separados),
 * porque ele multiplica o stat que o golpe usar — então `special-attack` cai
 * em `ataque` e a conta continua certa dos dois lados.
 *
 * `evasion` vira defesa: esquivar mais e apanhar menos são a mesma coisa vista
 * de dois ângulos, e o jogo não tem sistema de acerto para modelar a primeira.
 * `accuracy` vira `precisao`, que é o estágio que multiplica o dano de quem o
 * tem — é o que faz Jato de Areia e Cortina de Fumaça valerem alguma coisa.
 */
const STAT_PT = {
  attack: 'ataque',
  'special-attack': 'ataque',
  defense: 'defesa',
  'special-defense': 'defesa',
  speed: 'velocidade',
  evasion: 'defesa',
  accuracy: 'precisao',
};

/**
 * Golpes que o jogo não sabe representar e por isso não entram no arsenal.
 *
 * Não é preguiça: cada um destes depende de um sistema que este jogo não tem —
 * dormir, confundir, copiar o golpe do outro, morrer junto. Deixá-los na lista
 * daria ao jogador um card que, ao ser escolhido, não faz nada.
 */
const FORA = new Set(['explosion', 'self-destruct', 'transform', 'metronome', 'mirror-move']);

/**
 * Que GESTO o corpo faz ao usar o golpe.
 *
 * Todos os golpes usavam a mesma animação: recolhe e joga o corpo para a
 * frente. Funcionava como "ele atacou" e não dizia mais nada — uma Lambida, um
 * Arranhão e um Lança-Chamas eram o mesmo movimento com uma partícula diferente
 * na frente. Aqui o nome do golpe escolhe o gesto, e as poses ficam em
 * src/anima.ts.
 *
 * A ordem importa: o primeiro padrão que casar ganha. `thunder-punch` tem de
 * cair em soco antes de cair em sopro por ser elétrico.
 */
const ANIMACOES = [
  [/lick|bite|crunch|fang|leech-life|nibble/, 'mordida'],
  [/punch|karate-chop|submission|counter|seismic-toss|mega-punch/, 'soco'],
  [/scratch|slash|cut|claw|fury-swipes|guillotine|vice-grip|clamp|barrage/, 'garra'],
  [/tail|wrap|bind|constrict|thrash|slam(?!$)|body-slam/, 'cauda'],
  [/kick|stomp|jump|bounce/, 'salto'],
  [/peck|drill|horn|headbutt|skull-bash|wing-attack|take-down|double-edge|tackle|quick-attack|rage|pound|dig/, 'investida'],
];

/** O formato do efeito, por tipo — é o que src/attacks.ts sabe desenhar. */
const FORMATO_ESPECIAL = {
  fogo: 'jato', agua: 'jato', gelo: 'jato', terra: 'jato', voador: 'jato', inseto: 'jato',
  dragao: 'jato', sombrio: 'jato', lutador: 'jato', fada: 'jato',
  eletrico: 'raio', psiquico: 'raio', normal: 'raio', aco: 'raio',
  planta: 'projetil', veneno: 'projetil', pedra: 'projetil', fantasma: 'projetil',
};

/**
 * Golpes de dano com potência zero na PokeAPI: são os de dano fixo, os de dano
 * proporcional e os de nocaute instantâneo. O jogo não tem nenhuma dessas
 * regras, então eles entram com uma potência que os deixa fortes sem serem
 * absurdos — e continuam sendo o golpe que o bicho tem de verdade.
 */
const POTENCIA_FIXA = {
  guillotine: 90, 'horn-drill': 90, counter: 60, 'dragon-rage': 55,
  'night-shade': 55, 'seismic-toss': 60, 'sonic-boom': 45, 'low-kick': 55, 'super-fang': 70,
};

// ---------------------------------------------------------------- coleta

console.log('lendo os 151 e o que cada um aprende…');

const especies = [];
const nomesDeGolpe = new Set();

for (let n = 1; n <= ULTIMO; n++) {
  const p = await buscar(`pokemon/${n}`);
  const aprende = new Map();
  for (const m of p.moves) {
    for (const d of m.version_group_details) {
      if (!GRUPOS.has(d.version_group.name)) continue;
      if (d.move_learn_method.name !== 'level-up') continue;
      const nivel = Math.max(1, d.level_learned_at);
      const atual = aprende.get(m.move.name);
      // O mesmo golpe aparece em Red/Blue e em Yellow, às vezes em níveis
      // diferentes: fica o mais cedo, que é o que o jogador espera.
      if (atual === undefined || nivel < atual) aprende.set(m.move.name, nivel);
      nomesDeGolpe.add(m.move.name);
    }
  }
  especies.push({ id: p.name, aprende });
  process.stdout.write(`\r  ${n}/${ULTIMO}`);
}
process.stdout.write('\r');

const lista = [...nomesDeGolpe].sort();
console.log(`${lista.length} golpes distintos; baixando as fichas…`);
const fichas = new Map();
for (let i = 0; i < lista.length; i += 12) {
  const lote = lista.slice(i, i + 12);
  const dados = await Promise.all(lote.map((nome) => buscar(`move/${nome}`)));
  lote.forEach((nome, k) => fichas.set(nome, dados[k]));
  process.stdout.write(`\r  ${Math.min(i + 12, lista.length)}/${lista.length}`);
}
process.stdout.write('\r');

// ---------------------------------------------------------------- tradução

const golpes = {};
const semNome = [];

for (const nome of lista) {
  if (FORA.has(nome)) continue;
  const f = fichas.get(nome);
  const tipo = TIPO_PT[f.type.name];
  const classe = f.damage_class.name;

  // Status só entra se mexer num stat que o jogo modela. Os outros dependem de
  // dormir, confundir ou paralisar, e nada disso existe aqui.
  const mudancas = (f.stat_changes ?? [])
    .map((s) => ({ stat: STAT_PT[s.stat.name], estagios: s.change }))
    .filter((s) => s.stat);
  if (classe === 'status' && mudancas.length === 0) continue;

  const potencia = classe === 'status' ? 0 : (f.power || POTENCIA_FIXA[nome] || 60);
  const pt = GOLPE_PT[nome];
  if (!pt) semNome.push(nome);

  const categoria = classe === 'physical' ? 'fisico' : classe === 'special' ? 'especial' : 'status';
  const formato =
    categoria === 'status' ? 'aura' : categoria === 'fisico' ? 'projetil' : FORMATO_ESPECIAL[tipo];

  // O padrão do nome vem PRIMEIRO, inclusive nos de status: "Chicote de Cauda"
  // não causa dano nenhum e mesmo assim é uma cauda batendo, e ver a cauda bater
  // é o que explica por que a defesa do outro caiu. Só quando o nome não diz
  // nada de corpo — Rosnar, Encarar, Endurecer — é que o gesto vira a aura.
  const animacao =
    ANIMACOES.find(([padrao]) => padrao.test(nome))?.[1] ??
    (categoria === 'status' ? 'aura' : categoria === 'especial' ? 'sopro' : 'investida');

  const registro = {
    nome: pt ?? nome,
    tipo,
    potencia,
    categoria,
    formato,
    animacao,
    // Golpe forte recarrega devagar: é o que impede o Hidrobomba de sair na
    // mesma cadência do Jato d'Água.
    recarga:
      categoria === 'status'
        ? 0.9
        : Math.round(Math.min(2.1, Math.max(0.95, 0.85 + potencia / 95)) * 100) / 100,
  };

  if (mudancas.length) {
    // Um efeito por golpe: o painel mostra uma linha, e um golpe que mexe em
    // dois stats não caberia nela sem virar sopa de letrinha. Fica o maior.
    const principal = mudancas.sort((a, b) => Math.abs(b.estagios) - Math.abs(a.estagios))[0];
    registro.efeito = {
      // Positivo é sempre em si mesmo, negativo é sempre no outro — que é como
      // funciona em todos os golpes da primeira geração.
      alvo: principal.estagios > 0 ? 'proprio' : 'oponente',
      stat: principal.stat,
      estagios: principal.estagios,
    };
    const dir = principal.estagios > 0 ? 'sobe' : 'cai';
    const dono = principal.estagios > 0 ? 'sua' : 'dele a';
    registro.resumo = `${dono} ${principal.stat} ${dir}`;
  }

  golpes[nome] = registro;
}

// ---------------------------------------------------------------- saída

const aprende = {};
let semNenhum = 0;
for (const e of especies) {
  const pares = [...e.aprende.entries()]
    .filter(([nome]) => golpes[nome])
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([nome, nivel]) => [nome, nivel]);
  if (pares.length === 0) semNenhum++;
  aprende[e.id] = pares;
}

const corpo = `// GERADO por tools/golpes.mjs a partir da PokeAPI — não edite à mão.
// Os golpes de verdade da primeira geração e quem aprende cada um, em que nível.
import type { Tipo } from './pokedex.gen';

export interface GolpeDex {
  nome: string;
  tipo: Tipo;
  /** Zero nos de status. */
  potencia: number;
  categoria: 'fisico' | 'especial' | 'status';
  formato: 'jato' | 'projetil' | 'raio' | 'aura';
  /** O gesto que o corpo faz. Ver src/anima.ts. */
  animacao: 'mordida' | 'garra' | 'cauda' | 'soco' | 'salto' | 'investida' | 'sopro' | 'aura';
  recarga: number;
  efeito?: {
    alvo: 'proprio' | 'oponente';
    stat: 'ataque' | 'defesa' | 'velocidade' | 'precisao';
    estagios: number;
  };
  resumo?: string;
}

/** Todos os golpes utilizáveis, pela chave da PokeAPI. */
export const GOLPES_DEX: Record<string, GolpeDex> = ${JSON.stringify(golpes, null, 2)};

/**
 * Quem aprende o quê, e em que nível: \`[chave do golpe, nível]\`, do mais cedo
 * para o mais tarde. É a tabela de Red/Blue/Yellow.
 */
export const APRENDE: Record<string, ReadonlyArray<readonly [string, number]>> = ${JSON.stringify(
  aprende,
  null,
  2,
)};
`;

writeFileSync(SAIDA, corpo);

console.log(`\nsrc/golpes.gen.ts: ${Object.keys(golpes).length} golpes utilizáveis.`);
console.log(`  de status com efeito: ${Object.values(golpes).filter((g) => g.efeito).length}`);
console.log(`  espécies sem nenhum golpe utilizável: ${semNenhum}`);
if (semNome.length) console.log(`  SEM TRADUÇÃO (${semNome.length}): ${semNome.join(', ')}`);
