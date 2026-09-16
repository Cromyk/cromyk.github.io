// O que cada um dos 151 DIZ, e de onde sai a lista.
//
// Mora aqui, e não dentro de um gerador, porque agora há dois: o tools/vozes.mjs
// (TTS do Edge, uma voz só com o tom mudado por espécie) e o
// tools/vozes-anime.mjs (Gemini, uma voz de personagem por bicho). O texto da
// fala é o mesmo nos dois — o que muda é quem fala.

import { readFile } from 'node:fs/promises';

/**
 * Como cada um chama a si mesmo.
 *
 * A lista à mão existe para os que têm jeito consagrado — o "Pika pi" é o
 * "Pika pi", e uma regra de sílaba jamais chegaria nele. Quem não está aqui cai
 * na regra geral logo abaixo, que acerta a grande maioria: o bicho diz o começo
 * do próprio nome e depois o nome inteiro.
 */
export const JEITOS = {
  pikachu: 'Pika! Pika pi!',
  charmander: 'Char! Charmander!',
  bulbasaur: 'Bulba! Bulbasaur!',
  squirtle: 'Squirt! Squirtle!',
  jigglypuff: 'Jiggly! Jigglypuff!',
  meowth: 'Meowth! Meowth!',
  psyduck: 'Psai... Psyduck!',
  togepi: 'Toge! Togepi!',
  eevee: 'Vui! Eevee!',
  mew: 'Mew! Mew!',
  mewtwo: 'Mewtwo.',
  snorlax: 'Snor... Snorlax!',
  gengar: 'Gen! Gengar!',
  onix: 'Oooo! Onix!',
  geodude: 'Geo! Geodude!',
  magikarp: 'Karp! Karp! Magikarp!',
  ditto: 'Ditto! Ditto!',
  articuno: 'Articuno!',
  zapdos: 'Zapdos!',
  moltres: 'Moltres!',
  dragonite: 'Dragonite!',
  vulpix: 'Vul! Vulpix!',
  growlithe: 'Grow! Growlithe!',
  abra: 'Abra...',
  machop: 'Machop! Chop!',
  gastly: 'Gaaas... Gastly!',
  haunter: 'Haunter!',
  lapras: 'Laaa! Lapras!',
  scyther: 'Scy! Scyther!',
  pidgey: 'Pidge! Pidgey!',
  rattata: 'Ratta! Rattata!',
  caterpie: 'Cater! Caterpie!',
  weedle: 'Wee! Weedle!',
  zubat: 'Zu! Zubat!',
  clefairy: 'Clefa! Clefairy!',
};

/**
 * O pedaço do nome que o bicho diz antes do nome inteiro.
 *
 * Corta na primeira vogal seguida de consoante, o que dá "Char" em Charmander,
 * "Bulba" em Bulbasaur e "Rhy" em Rhyhorn. Nomes de uma sílaba só não ganham
 * pedaço: "Mew! Mew!" já é a regra da tabela acima, e repetir "On! Onix!" num
 * nome curto soa como gagueira, não como fala.
 */
export function pedacoDe(nome) {
  const m = /^[^aeiouáéíóúãõ]*[aeiouáéíóúãõ]+[^aeiouáéíóúãõ]?/i.exec(nome);
  if (!m) return null;
  const pedaco = m[0];
  if (pedaco.length < 3 || pedaco.length >= nome.length) return null;
  return pedaco;
}

export function falaDe(id, nome) {
  if (JEITOS[id]) return JEITOS[id];
  const pedaco = pedacoDe(nome);
  return pedaco ? `${pedaco}! ${nome}!` : `${nome}!`;
}

/**
 * Os 151, lidos do mesmo arquivo gerado que o jogo usa.
 *
 * Dois catálogos sairiam do ar um do outro no primeiro `npm run pokedex`, então
 * a fonte é uma só. O JSON está cravado dentro do .ts como um literal, e é ele
 * que se recorta aqui — parsear é mais seguro do que um regex por campo, que
 * cala quando alguém acrescenta uma vírgula.
 */
export async function lerPokedex(caminho = 'src/pokedex.gen.ts') {
  const fonte = await readFile(caminho, 'utf8');
  // O '[' do array de DADOS, e não o das interfaces que vêm antes (`tipos:
  // Tipo[]`): o de verdade é o único seguido de uma chave de objeto.
  const abre = /=\s*\[\s*\{/.exec(fonte)?.index;
  const fecha = fonte.lastIndexOf(']');
  const inicioReal = abre === undefined ? -1 : fonte.indexOf('[', abre);
  if (inicioReal < 0 || fecha < 0) throw new Error(`não achei a lista em ${caminho}`);
  const lista = JSON.parse(fonte.slice(inicioReal, fecha + 1));
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`${caminho} não tem espécie nenhuma — rode \`npm run pokedex\``);
  }
  return lista;
}
