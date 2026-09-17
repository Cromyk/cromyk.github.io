// GERADO por tools/pokedex.mjs a partir da PokeAPI — não edite à mão.
// Os ajustes de jogo (altura em RA, raridade, golpes) ficam em src/pokedex.ts.

export type Tipo =
  | 'normal'
  | 'fogo'
  | 'agua'
  | 'eletrico'
  | 'planta'
  | 'gelo'
  | 'lutador'
  | 'veneno'
  | 'terra'
  | 'voador'
  | 'psiquico'
  | 'inseto'
  | 'pedra'
  | 'fantasma'
  | 'dragao'
  | 'sombrio'
  | 'aco'
  | 'fada';

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
   * selvagem e não entra na contagem de 151 — ver `CONVIDADAS` em
   * tools/pokedex.mjs e `ESPECIES_KANTO` em src/species.ts.
   */
  convidada: boolean;
}

export const EFETIVIDADE: Record<Tipo, Partial<Record<Tipo, number>>> = {
  "normal": {
    "pedra": 0.5,
    "aco": 0.5,
    "fantasma": 0
  },
  "fogo": {
    "inseto": 2,
    "aco": 2,
    "planta": 2,
    "gelo": 2,
    "pedra": 0.5,
    "fogo": 0.5,
    "agua": 0.5,
    "dragao": 0.5
  },
  "agua": {
    "terra": 2,
    "pedra": 2,
    "fogo": 2,
    "agua": 0.5,
    "planta": 0.5,
    "dragao": 0.5
  },
  "eletrico": {
    "voador": 2,
    "agua": 2,
    "planta": 0.5,
    "eletrico": 0.5,
    "dragao": 0.5,
    "terra": 0
  },
  "planta": {
    "terra": 2,
    "pedra": 2,
    "agua": 2,
    "voador": 0.5,
    "veneno": 0.5,
    "inseto": 0.5,
    "aco": 0.5,
    "fogo": 0.5,
    "planta": 0.5,
    "dragao": 0.5
  },
  "gelo": {
    "voador": 2,
    "terra": 2,
    "planta": 2,
    "dragao": 2,
    "aco": 0.5,
    "fogo": 0.5,
    "agua": 0.5,
    "gelo": 0.5
  },
  "lutador": {
    "normal": 2,
    "pedra": 2,
    "aco": 2,
    "gelo": 2,
    "sombrio": 2,
    "voador": 0.5,
    "veneno": 0.5,
    "inseto": 0.5,
    "psiquico": 0.5,
    "fada": 0.5,
    "fantasma": 0
  },
  "veneno": {
    "planta": 2,
    "fada": 2,
    "veneno": 0.5,
    "terra": 0.5,
    "pedra": 0.5,
    "fantasma": 0.5,
    "aco": 0
  },
  "terra": {
    "veneno": 2,
    "pedra": 2,
    "aco": 2,
    "fogo": 2,
    "eletrico": 2,
    "inseto": 0.5,
    "planta": 0.5,
    "voador": 0
  },
  "voador": {
    "lutador": 2,
    "inseto": 2,
    "planta": 2,
    "pedra": 0.5,
    "aco": 0.5,
    "eletrico": 0.5
  },
  "psiquico": {
    "lutador": 2,
    "veneno": 2,
    "aco": 0.5,
    "psiquico": 0.5,
    "sombrio": 0
  },
  "inseto": {
    "planta": 2,
    "psiquico": 2,
    "sombrio": 2,
    "lutador": 0.5,
    "voador": 0.5,
    "veneno": 0.5,
    "fantasma": 0.5,
    "aco": 0.5,
    "fogo": 0.5,
    "fada": 0.5
  },
  "pedra": {
    "voador": 2,
    "inseto": 2,
    "fogo": 2,
    "gelo": 2,
    "lutador": 0.5,
    "terra": 0.5,
    "aco": 0.5
  },
  "fantasma": {
    "fantasma": 2,
    "psiquico": 2,
    "sombrio": 0.5,
    "normal": 0
  },
  "dragao": {
    "dragao": 2,
    "aco": 0.5,
    "fada": 0
  },
  "sombrio": {
    "fantasma": 2,
    "psiquico": 2,
    "lutador": 0.5,
    "sombrio": 0.5,
    "fada": 0.5
  },
  "aco": {
    "pedra": 2,
    "gelo": 2,
    "fada": 2,
    "aco": 0.5,
    "fogo": 0.5,
    "agua": 0.5,
    "eletrico": 0.5
  },
  "fada": {
    "lutador": 2,
    "dragao": 2,
    "sombrio": 2,
    "veneno": 0.5,
    "aco": 0.5,
    "fogo": 0.5
  }
} as const;

export const POKEDEX: readonly EntradaDex[] = [
  {
    "num": 1,
    "id": "bulbasaur",
    "nome": "Bulbasaur",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 0.7,
    "peso": 6.9,
    "base": {
      "hp": 45,
      "atq": 49,
      "def": 49,
      "atqEsp": 65,
      "defEsp": 65,
      "vel": 45
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "ivysaur",
      "nivel": 16
    },
    "genero": "Semente",
    "descricao": "Carrega a semente nas costas desde que nasce; ela cresce bebendo sol.",
    "convidada": false
  },
  {
    "num": 2,
    "id": "ivysaur",
    "nome": "Ivysaur",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 1,
    "peso": 13,
    "base": {
      "hp": 60,
      "atq": 62,
      "def": 63,
      "atqEsp": 80,
      "defEsp": 80,
      "vel": 60
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "venusaur",
      "nivel": 32
    },
    "genero": "Semente",
    "descricao": "O botão já pesa. Ele se planta ao sol mais tempo do que gostaria de admitir.",
    "convidada": false
  },
  {
    "num": 3,
    "id": "venusaur",
    "nome": "Venusaur",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 2,
    "peso": 100,
    "base": {
      "hp": 80,
      "atq": 82,
      "def": 83,
      "atqEsp": 100,
      "defEsp": 100,
      "vel": 80
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Semente",
    "descricao": "A flor solta um cheiro doce que acalma quem está por perto.",
    "convidada": false
  },
  {
    "num": 4,
    "id": "charmander",
    "nome": "Charmander",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 0.6,
    "peso": 8.5,
    "base": {
      "hp": 39,
      "atq": 52,
      "def": 43,
      "atqEsp": 60,
      "defEsp": 50,
      "vel": 65
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "charmeleon",
      "nivel": 16
    },
    "genero": "Lagarto",
    "descricao": "A chama da cauda conta o humor dele — e apaga se a vida acabar.",
    "convidada": false
  },
  {
    "num": 5,
    "id": "charmeleon",
    "nome": "Charmeleon",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 1.1,
    "peso": 19,
    "base": {
      "hp": 58,
      "atq": 64,
      "def": 58,
      "atqEsp": 80,
      "defEsp": 65,
      "vel": 80
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "charizard",
      "nivel": 36
    },
    "genero": "Chama",
    "descricao": "Fica mais bravo quando ganha. A cauda queima azulada na briga.",
    "convidada": false
  },
  {
    "num": 6,
    "id": "charizard",
    "nome": "Charizard",
    "tipos": [
      "fogo",
      "voador"
    ],
    "alturaReal": 1.7,
    "peso": 90.5,
    "base": {
      "hp": 78,
      "atq": 84,
      "def": 78,
      "atqEsp": 109,
      "defEsp": 85,
      "vel": 100
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Chama",
    "descricao": "Cospe fogo quente o bastante para derreter pedra. Só voa por prazer.",
    "convidada": false
  },
  {
    "num": 7,
    "id": "squirtle",
    "nome": "Squirtle",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.5,
    "peso": 9,
    "base": {
      "hp": 44,
      "atq": 48,
      "def": 65,
      "atqEsp": 50,
      "defEsp": 64,
      "vel": 43
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "wartortle",
      "nivel": 16
    },
    "genero": "Tartaruguinha",
    "descricao": "Se esconde no casco e esguicha de dentro, sem avisar.",
    "convidada": false
  },
  {
    "num": 8,
    "id": "wartortle",
    "nome": "Wartortle",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1,
    "peso": 22.5,
    "base": {
      "hp": 59,
      "atq": 63,
      "def": 80,
      "atqEsp": 65,
      "defEsp": 80,
      "vel": 58
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "blastoise",
      "nivel": 36
    },
    "genero": "Tartaruga",
    "descricao": "A cauda cheia de pelo é sinal de idade. Vive muito.",
    "convidada": false
  },
  {
    "num": 9,
    "id": "blastoise",
    "nome": "Blastoise",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1.6,
    "peso": 85.5,
    "base": {
      "hp": 79,
      "atq": 83,
      "def": 100,
      "atqEsp": 85,
      "defEsp": 105,
      "vel": 78
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Molusco",
    "descricao": "Os canhões das costas acertam uma lata a cinquenta metros.",
    "convidada": false
  },
  {
    "num": 10,
    "id": "caterpie",
    "nome": "Caterpie",
    "tipos": [
      "inseto"
    ],
    "alturaReal": 0.3,
    "peso": 2.9,
    "base": {
      "hp": 45,
      "atq": 30,
      "def": 35,
      "atqEsp": 20,
      "defEsp": 20,
      "vel": 45
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "metapod",
      "nivel": 7
    },
    "genero": "Minhoca",
    "descricao": "As antenas soltam um cheiro forte para espantar quem chega demais.",
    "convidada": false
  },
  {
    "num": 11,
    "id": "metapod",
    "nome": "Metapod",
    "tipos": [
      "inseto"
    ],
    "alturaReal": 0.7,
    "peso": 9.9,
    "base": {
      "hp": 50,
      "atq": 20,
      "def": 55,
      "atqEsp": 25,
      "defEsp": 25,
      "vel": 30
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "butterfree",
      "nivel": 10
    },
    "genero": "Casulo",
    "descricao": "Casulo. 0,7 m, 9,9 kg.",
    "convidada": false
  },
  {
    "num": 12,
    "id": "butterfree",
    "nome": "Butterfree",
    "tipos": [
      "inseto",
      "voador"
    ],
    "alturaReal": 1.1,
    "peso": 32,
    "base": {
      "hp": 60,
      "atq": 45,
      "def": 50,
      "atqEsp": 90,
      "defEsp": 80,
      "vel": 70
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Borboleta",
    "descricao": "Borboleta. 1,1 m, 32,0 kg.",
    "convidada": false
  },
  {
    "num": 13,
    "id": "weedle",
    "nome": "Weedle",
    "tipos": [
      "inseto",
      "veneno"
    ],
    "alturaReal": 0.3,
    "peso": 3.2,
    "base": {
      "hp": 40,
      "atq": 35,
      "def": 30,
      "atqEsp": 20,
      "defEsp": 20,
      "vel": 50
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "kakuna",
      "nivel": 7
    },
    "genero": "Hairy Bug",
    "descricao": "O ferrão da cabeça é venenoso. Não é blefe.",
    "convidada": false
  },
  {
    "num": 14,
    "id": "kakuna",
    "nome": "Kakuna",
    "tipos": [
      "inseto",
      "veneno"
    ],
    "alturaReal": 0.6,
    "peso": 10,
    "base": {
      "hp": 45,
      "atq": 25,
      "def": 50,
      "atqEsp": 25,
      "defEsp": 25,
      "vel": 35
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "beedrill",
      "nivel": 10
    },
    "genero": "Casulo",
    "descricao": "Casulo. 0,6 m, 10,0 kg.",
    "convidada": false
  },
  {
    "num": 15,
    "id": "beedrill",
    "nome": "Beedrill",
    "tipos": [
      "inseto",
      "veneno"
    ],
    "alturaReal": 1,
    "peso": 29.5,
    "base": {
      "hp": 65,
      "atq": 90,
      "def": 40,
      "atqEsp": 45,
      "defEsp": 80,
      "vel": 75
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Abelha Venenosa",
    "descricao": "Abelha Venenosa. 1,0 m, 29,5 kg.",
    "convidada": false
  },
  {
    "num": 16,
    "id": "pidgey",
    "nome": "Pidgey",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 0.3,
    "peso": 1.8,
    "base": {
      "hp": 40,
      "atq": 45,
      "def": 40,
      "atqEsp": 35,
      "defEsp": 35,
      "vel": 56
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "pidgeotto",
      "nivel": 18
    },
    "genero": "Passarinho",
    "descricao": "Levanta areia batendo as asas para escapar sem ser visto.",
    "convidada": false
  },
  {
    "num": 17,
    "id": "pidgeotto",
    "nome": "Pidgeotto",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 1.1,
    "peso": 30,
    "base": {
      "hp": 63,
      "atq": 60,
      "def": 55,
      "atqEsp": 50,
      "defEsp": 50,
      "vel": 71
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "pidgeot",
      "nivel": 36
    },
    "genero": "Pássaro",
    "descricao": "Pássaro. 1,1 m, 30,0 kg.",
    "convidada": false
  },
  {
    "num": 18,
    "id": "pidgeot",
    "nome": "Pidgeot",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 1.5,
    "peso": 39.5,
    "base": {
      "hp": 83,
      "atq": 80,
      "def": 75,
      "atqEsp": 70,
      "defEsp": 70,
      "vel": 101
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Pássaro",
    "descricao": "Pássaro. 1,5 m, 39,5 kg.",
    "convidada": false
  },
  {
    "num": 19,
    "id": "rattata",
    "nome": "Rattata",
    "tipos": [
      "normal"
    ],
    "alturaReal": 0.3,
    "peso": 3.5,
    "base": {
      "hp": 30,
      "atq": 56,
      "def": 35,
      "atqEsp": 25,
      "defEsp": 35,
      "vel": 72
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "raticate",
      "nivel": 20
    },
    "genero": "Rato",
    "descricao": "Morde qualquer coisa. Os dentes não param de crescer.",
    "convidada": false
  },
  {
    "num": 20,
    "id": "raticate",
    "nome": "Raticate",
    "tipos": [
      "normal"
    ],
    "alturaReal": 0.7,
    "peso": 18.5,
    "base": {
      "hp": 55,
      "atq": 81,
      "def": 60,
      "atqEsp": 50,
      "defEsp": 70,
      "vel": 97
    },
    "taxaBase": 127,
    "lendario": false,
    "evolui": null,
    "genero": "Rato",
    "descricao": "Rato. 0,7 m, 18,5 kg.",
    "convidada": false
  },
  {
    "num": 21,
    "id": "spearow",
    "nome": "Spearow",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 0.3,
    "peso": 2,
    "base": {
      "hp": 40,
      "atq": 60,
      "def": 30,
      "atqEsp": 31,
      "defEsp": 31,
      "vel": 70
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "fearow",
      "nivel": 20
    },
    "genero": "Passarinho",
    "descricao": "Barulhento de propósito: chama os outros quando se assusta.",
    "convidada": false
  },
  {
    "num": 22,
    "id": "fearow",
    "nome": "Fearow",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 1.2,
    "peso": 38,
    "base": {
      "hp": 65,
      "atq": 90,
      "def": 65,
      "atqEsp": 61,
      "defEsp": 61,
      "vel": 100
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": null,
    "genero": "Bico",
    "descricao": "Bico. 1,2 m, 38,0 kg.",
    "convidada": false
  },
  {
    "num": 23,
    "id": "ekans",
    "nome": "Ekans",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 2,
    "peso": 6.9,
    "base": {
      "hp": 35,
      "atq": 60,
      "def": 44,
      "atqEsp": 40,
      "defEsp": 54,
      "vel": 55
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "arbok",
      "nivel": 22
    },
    "genero": "Cobra",
    "descricao": "Se enrola num galho e dorme de cabeça para baixo.",
    "convidada": false
  },
  {
    "num": 24,
    "id": "arbok",
    "nome": "Arbok",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 3.5,
    "peso": 65,
    "base": {
      "hp": 60,
      "atq": 95,
      "def": 69,
      "atqEsp": 65,
      "defEsp": 79,
      "vel": 80
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": null,
    "genero": "Naja",
    "descricao": "Naja. 3,5 m, 65,0 kg.",
    "convidada": false
  },
  {
    "num": 25,
    "id": "pikachu",
    "nome": "Pikachu",
    "tipos": [
      "eletrico"
    ],
    "alturaReal": 0.4,
    "peso": 6,
    "base": {
      "hp": 35,
      "atq": 55,
      "def": 40,
      "atqEsp": 50,
      "defEsp": 50,
      "vel": 90
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "raichu",
      "nivel": 28
    },
    "genero": "Rato",
    "descricao": "Guarda eletricidade nas bochechas. Quando descarrega, o pelo arrepia todo.",
    "convidada": false
  },
  {
    "num": 26,
    "id": "raichu",
    "nome": "Raichu",
    "tipos": [
      "eletrico"
    ],
    "alturaReal": 0.8,
    "peso": 30,
    "base": {
      "hp": 60,
      "atq": 90,
      "def": 55,
      "atqEsp": 90,
      "defEsp": 80,
      "vel": 110
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Rato",
    "descricao": "A cauda funciona de para-raios. Precisa descarregar ou fica irritado.",
    "convidada": false
  },
  {
    "num": 27,
    "id": "sandshrew",
    "nome": "Sandshrew",
    "tipos": [
      "terra"
    ],
    "alturaReal": 0.6,
    "peso": 12,
    "base": {
      "hp": 50,
      "atq": 75,
      "def": 85,
      "atqEsp": 20,
      "defEsp": 30,
      "vel": 40
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "sandslash",
      "nivel": 22
    },
    "genero": "Rato",
    "descricao": "Se enrola numa bola quando leva susto, e rola ladeira abaixo.",
    "convidada": false
  },
  {
    "num": 28,
    "id": "sandslash",
    "nome": "Sandslash",
    "tipos": [
      "terra"
    ],
    "alturaReal": 1,
    "peso": 29.5,
    "base": {
      "hp": 75,
      "atq": 100,
      "def": 110,
      "atqEsp": 45,
      "defEsp": 55,
      "vel": 65
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": null,
    "genero": "Rato",
    "descricao": "Rato. 1,0 m, 29,5 kg.",
    "convidada": false
  },
  {
    "num": 29,
    "id": "nidoran-f",
    "nome": "Nidoran-F",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 0.4,
    "peso": 7,
    "base": {
      "hp": 55,
      "atq": 47,
      "def": 52,
      "atqEsp": 40,
      "defEsp": 40,
      "vel": 41
    },
    "taxaBase": 235,
    "lendario": false,
    "evolui": {
      "para": "nidorina",
      "nivel": 16
    },
    "genero": "Poison Pin",
    "descricao": "As farpas soltam veneno. Ela prefere avisar antes de usar.",
    "convidada": false
  },
  {
    "num": 30,
    "id": "nidorina",
    "nome": "Nidorina",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 0.8,
    "peso": 20,
    "base": {
      "hp": 70,
      "atq": 62,
      "def": 67,
      "atqEsp": 55,
      "defEsp": 55,
      "vel": 56
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "nidoqueen",
      "nivel": 28
    },
    "genero": "Poison Pin",
    "descricao": "Poison Pin. 0,8 m, 20,0 kg.",
    "convidada": false
  },
  {
    "num": 31,
    "id": "nidoqueen",
    "nome": "Nidoqueen",
    "tipos": [
      "veneno",
      "terra"
    ],
    "alturaReal": 1.3,
    "peso": 60,
    "base": {
      "hp": 90,
      "atq": 92,
      "def": 87,
      "atqEsp": 75,
      "defEsp": 85,
      "vel": 76
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Furadeira",
    "descricao": "Furadeira. 1,3 m, 60,0 kg.",
    "convidada": false
  },
  {
    "num": 32,
    "id": "nidoran-m",
    "nome": "Nidoran-M",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 0.5,
    "peso": 9,
    "base": {
      "hp": 46,
      "atq": 57,
      "def": 40,
      "atqEsp": 40,
      "defEsp": 40,
      "vel": 50
    },
    "taxaBase": 235,
    "lendario": false,
    "evolui": {
      "para": "nidorino",
      "nivel": 16
    },
    "genero": "Poison Pin",
    "descricao": "As orelhas mexem para todo lado; escuta antes de ver.",
    "convidada": false
  },
  {
    "num": 33,
    "id": "nidorino",
    "nome": "Nidorino",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 0.9,
    "peso": 19.5,
    "base": {
      "hp": 61,
      "atq": 72,
      "def": 57,
      "atqEsp": 55,
      "defEsp": 55,
      "vel": 65
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "nidoking",
      "nivel": 28
    },
    "genero": "Poison Pin",
    "descricao": "Poison Pin. 0,9 m, 19,5 kg.",
    "convidada": false
  },
  {
    "num": 34,
    "id": "nidoking",
    "nome": "Nidoking",
    "tipos": [
      "veneno",
      "terra"
    ],
    "alturaReal": 1.4,
    "peso": 62,
    "base": {
      "hp": 81,
      "atq": 102,
      "def": 77,
      "atqEsp": 85,
      "defEsp": 75,
      "vel": 85
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Furadeira",
    "descricao": "Furadeira. 1,4 m, 62,0 kg.",
    "convidada": false
  },
  {
    "num": 35,
    "id": "clefairy",
    "nome": "Clefairy",
    "tipos": [
      "fada"
    ],
    "alturaReal": 0.6,
    "peso": 7.5,
    "base": {
      "hp": 70,
      "atq": 45,
      "def": 48,
      "atqEsp": 60,
      "defEsp": 65,
      "vel": 35
    },
    "taxaBase": 150,
    "lendario": false,
    "evolui": {
      "para": "clefable",
      "nivel": 28
    },
    "genero": "Fada",
    "descricao": "Dizem que sai em noite de lua cheia para dançar. Ninguém filmou.",
    "convidada": false
  },
  {
    "num": 36,
    "id": "clefable",
    "nome": "Clefable",
    "tipos": [
      "fada"
    ],
    "alturaReal": 1.3,
    "peso": 40,
    "base": {
      "hp": 95,
      "atq": 70,
      "def": 73,
      "atqEsp": 95,
      "defEsp": 90,
      "vel": 60
    },
    "taxaBase": 25,
    "lendario": false,
    "evolui": null,
    "genero": "Fada",
    "descricao": "Fada. 1,3 m, 40,0 kg.",
    "convidada": false
  },
  {
    "num": 37,
    "id": "vulpix",
    "nome": "Vulpix",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 0.6,
    "peso": 9.9,
    "base": {
      "hp": 38,
      "atq": 41,
      "def": 40,
      "atqEsp": 50,
      "defEsp": 65,
      "vel": 65
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "ninetales",
      "nivel": 28
    },
    "genero": "Raposa",
    "descricao": "Nasce com uma cauda só. As outras cinco vêm com o tempo.",
    "convidada": false
  },
  {
    "num": 38,
    "id": "ninetales",
    "nome": "Ninetales",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 1.1,
    "peso": 19.9,
    "base": {
      "hp": 73,
      "atq": 76,
      "def": 75,
      "atqEsp": 81,
      "defEsp": 100,
      "vel": 100
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Raposa",
    "descricao": "Olha nos olhos por tempo demais. Guarda rancor por décadas.",
    "convidada": false
  },
  {
    "num": 39,
    "id": "jigglypuff",
    "nome": "Jigglypuff",
    "tipos": [
      "normal",
      "fada"
    ],
    "alturaReal": 0.5,
    "peso": 5.5,
    "base": {
      "hp": 115,
      "atq": 45,
      "def": 20,
      "atqEsp": 45,
      "defEsp": 25,
      "vel": 20
    },
    "taxaBase": 170,
    "lendario": false,
    "evolui": {
      "para": "wigglytuff",
      "nivel": 28
    },
    "genero": "Balão",
    "descricao": "Canta até você dormir. Fica furioso se você não dormir.",
    "convidada": false
  },
  {
    "num": 40,
    "id": "wigglytuff",
    "nome": "Wigglytuff",
    "tipos": [
      "normal",
      "fada"
    ],
    "alturaReal": 1,
    "peso": 12,
    "base": {
      "hp": 140,
      "atq": 70,
      "def": 45,
      "atqEsp": 85,
      "defEsp": 50,
      "vel": 45
    },
    "taxaBase": 50,
    "lendario": false,
    "evolui": null,
    "genero": "Balão",
    "descricao": "Balão. 1,0 m, 12,0 kg.",
    "convidada": false
  },
  {
    "num": 41,
    "id": "zubat",
    "nome": "Zubat",
    "tipos": [
      "veneno",
      "voador"
    ],
    "alturaReal": 0.8,
    "peso": 7.5,
    "base": {
      "hp": 40,
      "atq": 45,
      "def": 35,
      "atqEsp": 30,
      "defEsp": 40,
      "vel": 55
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "golbat",
      "nivel": 22
    },
    "genero": "Morcego",
    "descricao": "Não tem olhos. Enxerga o quarto inteiro pelo som.",
    "convidada": false
  },
  {
    "num": 42,
    "id": "golbat",
    "nome": "Golbat",
    "tipos": [
      "veneno",
      "voador"
    ],
    "alturaReal": 1.6,
    "peso": 55,
    "base": {
      "hp": 75,
      "atq": 80,
      "def": 70,
      "atqEsp": 65,
      "defEsp": 75,
      "vel": 90
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": null,
    "genero": "Morcego",
    "descricao": "Morcego. 1,6 m, 55,0 kg.",
    "convidada": false
  },
  {
    "num": 43,
    "id": "oddish",
    "nome": "Oddish",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 0.5,
    "peso": 5.4,
    "base": {
      "hp": 45,
      "atq": 50,
      "def": 55,
      "atqEsp": 75,
      "defEsp": 65,
      "vel": 30
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "gloom",
      "nivel": 21
    },
    "genero": "Erva",
    "descricao": "De dia se enterra. De noite anda com as raízes.",
    "convidada": false
  },
  {
    "num": 44,
    "id": "gloom",
    "nome": "Gloom",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 0.8,
    "peso": 8.6,
    "base": {
      "hp": 60,
      "atq": 65,
      "def": 70,
      "atqEsp": 85,
      "defEsp": 75,
      "vel": 40
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": null,
    "genero": "Erva",
    "descricao": "Erva. 0,8 m, 8,6 kg.",
    "convidada": false
  },
  {
    "num": 45,
    "id": "vileplume",
    "nome": "Vileplume",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 1.2,
    "peso": 18.6,
    "base": {
      "hp": 75,
      "atq": 80,
      "def": 85,
      "atqEsp": 110,
      "defEsp": 90,
      "vel": 50
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Flor",
    "descricao": "Flor. 1,2 m, 18,6 kg.",
    "convidada": false
  },
  {
    "num": 46,
    "id": "paras",
    "nome": "Paras",
    "tipos": [
      "inseto",
      "planta"
    ],
    "alturaReal": 0.3,
    "peso": 5.4,
    "base": {
      "hp": 35,
      "atq": 70,
      "def": 55,
      "atqEsp": 45,
      "defEsp": 55,
      "vel": 25
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "parasect",
      "nivel": 24
    },
    "genero": "Cogumelo",
    "descricao": "Os cogumelos das costas é que mandam, não ele.",
    "convidada": false
  },
  {
    "num": 47,
    "id": "parasect",
    "nome": "Parasect",
    "tipos": [
      "inseto",
      "planta"
    ],
    "alturaReal": 1,
    "peso": 29.5,
    "base": {
      "hp": 60,
      "atq": 95,
      "def": 80,
      "atqEsp": 60,
      "defEsp": 80,
      "vel": 30
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Cogumelo",
    "descricao": "Cogumelo. 1,0 m, 29,5 kg.",
    "convidada": false
  },
  {
    "num": 48,
    "id": "venonat",
    "nome": "Venonat",
    "tipos": [
      "inseto",
      "veneno"
    ],
    "alturaReal": 1,
    "peso": 30,
    "base": {
      "hp": 60,
      "atq": 55,
      "def": 50,
      "atqEsp": 40,
      "defEsp": 55,
      "vel": 45
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "venomoth",
      "nivel": 31
    },
    "genero": "Inseto",
    "descricao": "Os olhos enormes enxergam no escuro e miram sozinhos.",
    "convidada": false
  },
  {
    "num": 49,
    "id": "venomoth",
    "nome": "Venomoth",
    "tipos": [
      "inseto",
      "veneno"
    ],
    "alturaReal": 1.5,
    "peso": 12.5,
    "base": {
      "hp": 70,
      "atq": 65,
      "def": 60,
      "atqEsp": 90,
      "defEsp": 75,
      "vel": 90
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Poison Moth",
    "descricao": "Poison Moth. 1,5 m, 12,5 kg.",
    "convidada": false
  },
  {
    "num": 50,
    "id": "diglett",
    "nome": "Diglett",
    "tipos": [
      "terra"
    ],
    "alturaReal": 0.2,
    "peso": 0.8,
    "base": {
      "hp": 10,
      "atq": 55,
      "def": 25,
      "atqEsp": 35,
      "defEsp": 45,
      "vel": 95
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "dugtrio",
      "nivel": 26
    },
    "genero": "Toupeira",
    "descricao": "Ninguém nunca viu o que tem embaixo. Ninguém.",
    "convidada": false
  },
  {
    "num": 51,
    "id": "dugtrio",
    "nome": "Dugtrio",
    "tipos": [
      "terra"
    ],
    "alturaReal": 0.7,
    "peso": 33.3,
    "base": {
      "hp": 35,
      "atq": 100,
      "def": 50,
      "atqEsp": 50,
      "defEsp": 70,
      "vel": 120
    },
    "taxaBase": 50,
    "lendario": false,
    "evolui": null,
    "genero": "Toupeira",
    "descricao": "Toupeira. 0,7 m, 33,3 kg.",
    "convidada": false
  },
  {
    "num": 52,
    "id": "meowth",
    "nome": "Meowth",
    "tipos": [
      "normal"
    ],
    "alturaReal": 0.4,
    "peso": 4.2,
    "base": {
      "hp": 40,
      "atq": 45,
      "def": 35,
      "atqEsp": 40,
      "defEsp": 40,
      "vel": 90
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": null,
    "genero": "Scratch Cat",
    "descricao": "Junta moedas. A da testa não é dele, é o dele.",
    "convidada": false
  },
  {
    "num": 53,
    "id": "persian",
    "nome": "Persian",
    "tipos": [
      "normal"
    ],
    "alturaReal": 1,
    "peso": 32,
    "base": {
      "hp": 65,
      "atq": 70,
      "def": 60,
      "atqEsp": 65,
      "defEsp": 65,
      "vel": 115
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": null,
    "genero": "Classy Cat",
    "descricao": "Classy Cat. 1,0 m, 32,0 kg.",
    "convidada": false
  },
  {
    "num": 54,
    "id": "psyduck",
    "nome": "Psyduck",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.8,
    "peso": 19.6,
    "base": {
      "hp": 50,
      "atq": 52,
      "def": 48,
      "atqEsp": 65,
      "defEsp": 50,
      "vel": 55
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "golduck",
      "nivel": 33
    },
    "genero": "Pato",
    "descricao": "A dor de cabeça constante é o que destrava os poderes.",
    "convidada": false
  },
  {
    "num": 55,
    "id": "golduck",
    "nome": "Golduck",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1.7,
    "peso": 76.6,
    "base": {
      "hp": 80,
      "atq": 82,
      "def": 78,
      "atqEsp": 95,
      "defEsp": 80,
      "vel": 85
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Pato",
    "descricao": "Pato. 1,7 m, 76,6 kg.",
    "convidada": false
  },
  {
    "num": 56,
    "id": "mankey",
    "nome": "Mankey",
    "tipos": [
      "lutador"
    ],
    "alturaReal": 0.5,
    "peso": 28,
    "base": {
      "hp": 40,
      "atq": 80,
      "def": 35,
      "atqEsp": 35,
      "defEsp": 45,
      "vel": 70
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "primeape",
      "nivel": 28
    },
    "genero": "Macaco-Porco",
    "descricao": "Fica com raiva do nada e leva um tempo enorme para passar.",
    "convidada": false
  },
  {
    "num": 57,
    "id": "primeape",
    "nome": "Primeape",
    "tipos": [
      "lutador"
    ],
    "alturaReal": 1,
    "peso": 32,
    "base": {
      "hp": 65,
      "atq": 105,
      "def": 60,
      "atqEsp": 60,
      "defEsp": 70,
      "vel": 95
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Macaco-Porco",
    "descricao": "Macaco-Porco. 1,0 m, 32,0 kg.",
    "convidada": false
  },
  {
    "num": 58,
    "id": "growlithe",
    "nome": "Growlithe",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 0.7,
    "peso": 19,
    "base": {
      "hp": 55,
      "atq": 70,
      "def": 45,
      "atqEsp": 70,
      "defEsp": 50,
      "vel": 60
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "arcanine",
      "nivel": 28
    },
    "genero": "Filhote",
    "descricao": "Fareja e não esquece mais. Late para avisar, não para brigar.",
    "convidada": false
  },
  {
    "num": 59,
    "id": "arcanine",
    "nome": "Arcanine",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 1.9,
    "peso": 155,
    "base": {
      "hp": 90,
      "atq": 110,
      "def": 80,
      "atqEsp": 100,
      "defEsp": 80,
      "vel": 95
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Lendário",
    "descricao": "Lendário. 1,9 m, 155,0 kg.",
    "convidada": false
  },
  {
    "num": 60,
    "id": "poliwag",
    "nome": "Poliwag",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.6,
    "peso": 12.4,
    "base": {
      "hp": 40,
      "atq": 50,
      "def": 40,
      "atqEsp": 40,
      "defEsp": 40,
      "vel": 90
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "poliwhirl",
      "nivel": 25
    },
    "genero": "Girino",
    "descricao": "A espiral da barriga é o intestino visto de fora.",
    "convidada": false
  },
  {
    "num": 61,
    "id": "poliwhirl",
    "nome": "Poliwhirl",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1,
    "peso": 20,
    "base": {
      "hp": 65,
      "atq": 65,
      "def": 65,
      "atqEsp": 50,
      "defEsp": 50,
      "vel": 90
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": null,
    "genero": "Girino",
    "descricao": "Girino. 1,0 m, 20,0 kg.",
    "convidada": false
  },
  {
    "num": 62,
    "id": "poliwrath",
    "nome": "Poliwrath",
    "tipos": [
      "agua",
      "lutador"
    ],
    "alturaReal": 1.3,
    "peso": 54,
    "base": {
      "hp": 90,
      "atq": 95,
      "def": 95,
      "atqEsp": 70,
      "defEsp": 90,
      "vel": 70
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Girino",
    "descricao": "Girino. 1,3 m, 54,0 kg.",
    "convidada": false
  },
  {
    "num": 63,
    "id": "abra",
    "nome": "Abra",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 0.9,
    "peso": 19.5,
    "base": {
      "hp": 25,
      "atq": 20,
      "def": 15,
      "atqEsp": 105,
      "defEsp": 55,
      "vel": 90
    },
    "taxaBase": 200,
    "lendario": false,
    "evolui": {
      "para": "kadabra",
      "nivel": 16
    },
    "genero": "Psi",
    "descricao": "Dorme dezoito horas por dia e se teleporta dormindo.",
    "convidada": false
  },
  {
    "num": 64,
    "id": "kadabra",
    "nome": "Kadabra",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 1.3,
    "peso": 56.5,
    "base": {
      "hp": 40,
      "atq": 35,
      "def": 30,
      "atqEsp": 120,
      "defEsp": 70,
      "vel": 105
    },
    "taxaBase": 100,
    "lendario": false,
    "evolui": {
      "para": "alakazam",
      "nivel": 32
    },
    "genero": "Psi",
    "descricao": "A colher dobra sozinha perto dele. Não é truque.",
    "convidada": false
  },
  {
    "num": 65,
    "id": "alakazam",
    "nome": "Alakazam",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 1.5,
    "peso": 48,
    "base": {
      "hp": 55,
      "atq": 50,
      "def": 45,
      "atqEsp": 135,
      "defEsp": 95,
      "vel": 120
    },
    "taxaBase": 50,
    "lendario": false,
    "evolui": null,
    "genero": "Psi",
    "descricao": "A memória não apaga nada, nunca. Isso pesa.",
    "convidada": false
  },
  {
    "num": 66,
    "id": "machop",
    "nome": "Machop",
    "tipos": [
      "lutador"
    ],
    "alturaReal": 0.8,
    "peso": 19.5,
    "base": {
      "hp": 70,
      "atq": 80,
      "def": 50,
      "atqEsp": 35,
      "defEsp": 35,
      "vel": 35
    },
    "taxaBase": 180,
    "lendario": false,
    "evolui": {
      "para": "machoke",
      "nivel": 28
    },
    "genero": "Superforça",
    "descricao": "Treina o dia inteiro. Levanta o dobro do próprio peso sem suar.",
    "convidada": false
  },
  {
    "num": 67,
    "id": "machoke",
    "nome": "Machoke",
    "tipos": [
      "lutador"
    ],
    "alturaReal": 1.5,
    "peso": 70.5,
    "base": {
      "hp": 80,
      "atq": 100,
      "def": 70,
      "atqEsp": 50,
      "defEsp": 60,
      "vel": 45
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": {
      "para": "machamp",
      "nivel": 32
    },
    "genero": "Superforça",
    "descricao": "Superforça. 1,5 m, 70,5 kg.",
    "convidada": false
  },
  {
    "num": 68,
    "id": "machamp",
    "nome": "Machamp",
    "tipos": [
      "lutador"
    ],
    "alturaReal": 1.6,
    "peso": 130,
    "base": {
      "hp": 90,
      "atq": 130,
      "def": 80,
      "atqEsp": 65,
      "defEsp": 85,
      "vel": 55
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Superforça",
    "descricao": "Superforça. 1,6 m, 130,0 kg.",
    "convidada": false
  },
  {
    "num": 69,
    "id": "bellsprout",
    "nome": "Bellsprout",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 0.7,
    "peso": 4,
    "base": {
      "hp": 50,
      "atq": 75,
      "def": 35,
      "atqEsp": 70,
      "defEsp": 30,
      "vel": 40
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "weepinbell",
      "nivel": 21
    },
    "genero": "Flor",
    "descricao": "O caule é fino mas se move rápido demais para o olho.",
    "convidada": false
  },
  {
    "num": 70,
    "id": "weepinbell",
    "nome": "Weepinbell",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 1,
    "peso": 6.4,
    "base": {
      "hp": 65,
      "atq": 90,
      "def": 50,
      "atqEsp": 85,
      "defEsp": 45,
      "vel": 55
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "victreebel",
      "nivel": 28
    },
    "genero": "Flycatcher",
    "descricao": "Flycatcher. 1,0 m, 6,4 kg.",
    "convidada": false
  },
  {
    "num": 71,
    "id": "victreebel",
    "nome": "Victreebel",
    "tipos": [
      "planta",
      "veneno"
    ],
    "alturaReal": 1.7,
    "peso": 15.5,
    "base": {
      "hp": 80,
      "atq": 105,
      "def": 65,
      "atqEsp": 100,
      "defEsp": 70,
      "vel": 70
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Flycatcher",
    "descricao": "Flycatcher. 1,7 m, 15,5 kg.",
    "convidada": false
  },
  {
    "num": 72,
    "id": "tentacool",
    "nome": "Tentacool",
    "tipos": [
      "agua",
      "veneno"
    ],
    "alturaReal": 0.9,
    "peso": 45.5,
    "base": {
      "hp": 40,
      "atq": 40,
      "def": 35,
      "atqEsp": 50,
      "defEsp": 100,
      "vel": 70
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "tentacruel",
      "nivel": 30
    },
    "genero": "Água-Viva",
    "descricao": "Quase todo feito de água. O que queima são os tentáculos.",
    "convidada": false
  },
  {
    "num": 73,
    "id": "tentacruel",
    "nome": "Tentacruel",
    "tipos": [
      "agua",
      "veneno"
    ],
    "alturaReal": 1.6,
    "peso": 55,
    "base": {
      "hp": 80,
      "atq": 70,
      "def": 65,
      "atqEsp": 80,
      "defEsp": 120,
      "vel": 100
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Água-Viva",
    "descricao": "Água-Viva. 1,6 m, 55,0 kg.",
    "convidada": false
  },
  {
    "num": 74,
    "id": "geodude",
    "nome": "Geodude",
    "tipos": [
      "pedra",
      "terra"
    ],
    "alturaReal": 0.4,
    "peso": 20,
    "base": {
      "hp": 40,
      "atq": 80,
      "def": 100,
      "atqEsp": 30,
      "defEsp": 30,
      "vel": 20
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "graveler",
      "nivel": 25
    },
    "genero": "Pedra",
    "descricao": "Fica parado no caminho e você acha que é pedra. É, e não é.",
    "convidada": false
  },
  {
    "num": 75,
    "id": "graveler",
    "nome": "Graveler",
    "tipos": [
      "pedra",
      "terra"
    ],
    "alturaReal": 1,
    "peso": 105,
    "base": {
      "hp": 55,
      "atq": 95,
      "def": 115,
      "atqEsp": 45,
      "defEsp": 45,
      "vel": 35
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "golem",
      "nivel": 32
    },
    "genero": "Pedra",
    "descricao": "Pedra. 1,0 m, 105,0 kg.",
    "convidada": false
  },
  {
    "num": 76,
    "id": "golem",
    "nome": "Golem",
    "tipos": [
      "pedra",
      "terra"
    ],
    "alturaReal": 1.4,
    "peso": 300,
    "base": {
      "hp": 80,
      "atq": 120,
      "def": 130,
      "atqEsp": 55,
      "defEsp": 65,
      "vel": 45
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Megaton",
    "descricao": "Megaton. 1,4 m, 300,0 kg.",
    "convidada": false
  },
  {
    "num": 77,
    "id": "ponyta",
    "nome": "Ponyta",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 1,
    "peso": 30,
    "base": {
      "hp": 50,
      "atq": 85,
      "def": 55,
      "atqEsp": 65,
      "defEsp": 65,
      "vel": 90
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "rapidash",
      "nivel": 40
    },
    "genero": "Cavalo de Fogo",
    "descricao": "Nasce sem conseguir andar. Em um dia já corre mais que você.",
    "convidada": false
  },
  {
    "num": 78,
    "id": "rapidash",
    "nome": "Rapidash",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 1.7,
    "peso": 95,
    "base": {
      "hp": 65,
      "atq": 100,
      "def": 70,
      "atqEsp": 80,
      "defEsp": 80,
      "vel": 105
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Cavalo de Fogo",
    "descricao": "Cavalo de Fogo. 1,7 m, 95,0 kg.",
    "convidada": false
  },
  {
    "num": 79,
    "id": "slowpoke",
    "nome": "Slowpoke",
    "tipos": [
      "agua",
      "psiquico"
    ],
    "alturaReal": 1.2,
    "peso": 36,
    "base": {
      "hp": 90,
      "atq": 65,
      "def": 65,
      "atqEsp": 40,
      "defEsp": 40,
      "vel": 15
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": null,
    "genero": "Sonolento",
    "descricao": "Leva cinco segundos para sentir dor. Não parece se importar.",
    "convidada": false
  },
  {
    "num": 80,
    "id": "slowbro",
    "nome": "Slowbro",
    "tipos": [
      "agua",
      "psiquico"
    ],
    "alturaReal": 1.6,
    "peso": 78.5,
    "base": {
      "hp": 95,
      "atq": 75,
      "def": 110,
      "atqEsp": 100,
      "defEsp": 80,
      "vel": 30
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Hermit Crab",
    "descricao": "Hermit Crab. 1,6 m, 78,5 kg.",
    "convidada": false
  },
  {
    "num": 81,
    "id": "magnemite",
    "nome": "Magnemite",
    "tipos": [
      "eletrico",
      "aco"
    ],
    "alturaReal": 0.3,
    "peso": 6,
    "base": {
      "hp": 25,
      "atq": 35,
      "def": 70,
      "atqEsp": 95,
      "defEsp": 55,
      "vel": 45
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "magneton",
      "nivel": 30
    },
    "genero": "Ímã",
    "descricao": "Flutua com eletromagnetismo. Chega perto da TV e estraga a imagem.",
    "convidada": false
  },
  {
    "num": 82,
    "id": "magneton",
    "nome": "Magneton",
    "tipos": [
      "eletrico",
      "aco"
    ],
    "alturaReal": 1,
    "peso": 60,
    "base": {
      "hp": 50,
      "atq": 60,
      "def": 95,
      "atqEsp": 120,
      "defEsp": 70,
      "vel": 70
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Ímã",
    "descricao": "Ímã. 1,0 m, 60,0 kg.",
    "convidada": false
  },
  {
    "num": 83,
    "id": "farfetchd",
    "nome": "Farfetchd",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 0.8,
    "peso": 15,
    "base": {
      "hp": 52,
      "atq": 90,
      "def": 55,
      "atqEsp": 58,
      "defEsp": 62,
      "vel": 60
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Pato Selvagem",
    "descricao": "Não larga o talo de alho-poró. Briga por ele.",
    "convidada": false
  },
  {
    "num": 84,
    "id": "doduo",
    "nome": "Doduo",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 1.4,
    "peso": 39.2,
    "base": {
      "hp": 35,
      "atq": 85,
      "def": 45,
      "atqEsp": 35,
      "defEsp": 35,
      "vel": 75
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "dodrio",
      "nivel": 31
    },
    "genero": "Pássaro Gêmeo",
    "descricao": "As duas cabeças nunca dormem ao mesmo tempo.",
    "convidada": false
  },
  {
    "num": 85,
    "id": "dodrio",
    "nome": "Dodrio",
    "tipos": [
      "normal",
      "voador"
    ],
    "alturaReal": 1.8,
    "peso": 85.2,
    "base": {
      "hp": 60,
      "atq": 110,
      "def": 70,
      "atqEsp": 60,
      "defEsp": 60,
      "vel": 110
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Triple Bird",
    "descricao": "Triple Bird. 1,8 m, 85,2 kg.",
    "convidada": false
  },
  {
    "num": 86,
    "id": "seel",
    "nome": "Seel",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1.1,
    "peso": 90,
    "base": {
      "hp": 65,
      "atq": 45,
      "def": 55,
      "atqEsp": 45,
      "defEsp": 70,
      "vel": 45
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "dewgong",
      "nivel": 34
    },
    "genero": "Sea Lion",
    "descricao": "Adora água gelada. O chifre quebra gelo por baixo.",
    "convidada": false
  },
  {
    "num": 87,
    "id": "dewgong",
    "nome": "Dewgong",
    "tipos": [
      "agua",
      "gelo"
    ],
    "alturaReal": 1.7,
    "peso": 120,
    "base": {
      "hp": 90,
      "atq": 70,
      "def": 80,
      "atqEsp": 70,
      "defEsp": 95,
      "vel": 70
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Sea Lion",
    "descricao": "Sea Lion. 1,7 m, 120,0 kg.",
    "convidada": false
  },
  {
    "num": 88,
    "id": "grimer",
    "nome": "Grimer",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 0.9,
    "peso": 30,
    "base": {
      "hp": 80,
      "atq": 80,
      "def": 50,
      "atqEsp": 40,
      "defEsp": 50,
      "vel": 25
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "muk",
      "nivel": 38
    },
    "genero": "Sludge",
    "descricao": "Nasceu de lodo com raio. Onde passa não cresce mais nada.",
    "convidada": false
  },
  {
    "num": 89,
    "id": "muk",
    "nome": "Muk",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 1.2,
    "peso": 30,
    "base": {
      "hp": 105,
      "atq": 105,
      "def": 75,
      "atqEsp": 65,
      "defEsp": 100,
      "vel": 50
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Sludge",
    "descricao": "Sludge. 1,2 m, 30,0 kg.",
    "convidada": false
  },
  {
    "num": 90,
    "id": "shellder",
    "nome": "Shellder",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.3,
    "peso": 4,
    "base": {
      "hp": 30,
      "atq": 65,
      "def": 100,
      "atqEsp": 45,
      "defEsp": 25,
      "vel": 40
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "cloyster",
      "nivel": 28
    },
    "genero": "Bivalve",
    "descricao": "A língua é mais forte que a concha, e a concha é dura.",
    "convidada": false
  },
  {
    "num": 91,
    "id": "cloyster",
    "nome": "Cloyster",
    "tipos": [
      "agua",
      "gelo"
    ],
    "alturaReal": 1.5,
    "peso": 132.5,
    "base": {
      "hp": 50,
      "atq": 95,
      "def": 180,
      "atqEsp": 85,
      "defEsp": 45,
      "vel": 70
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Bivalve",
    "descricao": "Bivalve. 1,5 m, 132,5 kg.",
    "convidada": false
  },
  {
    "num": 92,
    "id": "gastly",
    "nome": "Gastly",
    "tipos": [
      "fantasma",
      "veneno"
    ],
    "alturaReal": 1.3,
    "peso": 0.1,
    "base": {
      "hp": 30,
      "atq": 35,
      "def": 30,
      "atqEsp": 100,
      "defEsp": 35,
      "vel": 80
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "haunter",
      "nivel": 25
    },
    "genero": "Gás",
    "descricao": "É gás. Um vento forte espalha ele, e ele volta.",
    "convidada": false
  },
  {
    "num": 93,
    "id": "haunter",
    "nome": "Haunter",
    "tipos": [
      "fantasma",
      "veneno"
    ],
    "alturaReal": 1.6,
    "peso": 0.1,
    "base": {
      "hp": 45,
      "atq": 50,
      "def": 45,
      "atqEsp": 115,
      "defEsp": 55,
      "vel": 95
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": {
      "para": "gengar",
      "nivel": 32
    },
    "genero": "Gás",
    "descricao": "Lambe. A língua atravessa e gela por dentro.",
    "convidada": false
  },
  {
    "num": 94,
    "id": "gengar",
    "nome": "Gengar",
    "tipos": [
      "fantasma",
      "veneno"
    ],
    "alturaReal": 1.5,
    "peso": 40.5,
    "base": {
      "hp": 60,
      "atq": 65,
      "def": 60,
      "atqEsp": 130,
      "defEsp": 75,
      "vel": 110
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Sombra",
    "descricao": "Se esconde na sua sombra e ri quando você sente frio.",
    "convidada": false
  },
  {
    "num": 95,
    "id": "onix",
    "nome": "Onix",
    "tipos": [
      "pedra",
      "terra"
    ],
    "alturaReal": 8.8,
    "peso": 210,
    "base": {
      "hp": 35,
      "atq": 45,
      "def": 160,
      "atqEsp": 30,
      "defEsp": 45,
      "vel": 70
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Serpente de Pedra",
    "descricao": "Cava a cinquenta por hora. Vai ficando mais liso com os anos.",
    "convidada": false
  },
  {
    "num": 96,
    "id": "drowzee",
    "nome": "Drowzee",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 1,
    "peso": 32.4,
    "base": {
      "hp": 60,
      "atq": 48,
      "def": 45,
      "atqEsp": 43,
      "defEsp": 90,
      "vel": 42
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "hypno",
      "nivel": 26
    },
    "genero": "Hipnose",
    "descricao": "Come sonhos. Os ruins ele cospe fora.",
    "convidada": false
  },
  {
    "num": 97,
    "id": "hypno",
    "nome": "Hypno",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 1.6,
    "peso": 75.6,
    "base": {
      "hp": 85,
      "atq": 73,
      "def": 70,
      "atqEsp": 73,
      "defEsp": 115,
      "vel": 67
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Hipnose",
    "descricao": "Hipnose. 1,6 m, 75,6 kg.",
    "convidada": false
  },
  {
    "num": 98,
    "id": "krabby",
    "nome": "Krabby",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.4,
    "peso": 6.5,
    "base": {
      "hp": 30,
      "atq": 105,
      "def": 90,
      "atqEsp": 25,
      "defEsp": 25,
      "vel": 50
    },
    "taxaBase": 225,
    "lendario": false,
    "evolui": {
      "para": "kingler",
      "nivel": 28
    },
    "genero": "River Crab",
    "descricao": "As pinças quebram e nascem de novo. Ele nem liga.",
    "convidada": false
  },
  {
    "num": 99,
    "id": "kingler",
    "nome": "Kingler",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1.3,
    "peso": 60,
    "base": {
      "hp": 55,
      "atq": 130,
      "def": 115,
      "atqEsp": 50,
      "defEsp": 50,
      "vel": 75
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Pinça",
    "descricao": "Pinça. 1,3 m, 60,0 kg.",
    "convidada": false
  },
  {
    "num": 100,
    "id": "voltorb",
    "nome": "Voltorb",
    "tipos": [
      "eletrico"
    ],
    "alturaReal": 0.5,
    "peso": 10.4,
    "base": {
      "hp": 40,
      "atq": 30,
      "def": 50,
      "atqEsp": 55,
      "defEsp": 55,
      "vel": 100
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "electrode",
      "nivel": 30
    },
    "genero": "Bola",
    "descricao": "Parece uma pokébola largada no chão. Não é. Não chute.",
    "convidada": false
  },
  {
    "num": 101,
    "id": "electrode",
    "nome": "Electrode",
    "tipos": [
      "eletrico"
    ],
    "alturaReal": 1.2,
    "peso": 66.6,
    "base": {
      "hp": 60,
      "atq": 50,
      "def": 70,
      "atqEsp": 80,
      "defEsp": 80,
      "vel": 150
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Bola",
    "descricao": "Bola. 1,2 m, 66,6 kg.",
    "convidada": false
  },
  {
    "num": 102,
    "id": "exeggcute",
    "nome": "Exeggcute",
    "tipos": [
      "planta",
      "psiquico"
    ],
    "alturaReal": 0.4,
    "peso": 2.5,
    "base": {
      "hp": 60,
      "atq": 40,
      "def": 80,
      "atqEsp": 60,
      "defEsp": 45,
      "vel": 40
    },
    "taxaBase": 90,
    "lendario": false,
    "evolui": {
      "para": "exeggutor",
      "nivel": 28
    },
    "genero": "Ovo",
    "descricao": "São seis cabeças que conversam entre si por telepatia.",
    "convidada": false
  },
  {
    "num": 103,
    "id": "exeggutor",
    "nome": "Exeggutor",
    "tipos": [
      "planta",
      "psiquico"
    ],
    "alturaReal": 2,
    "peso": 120,
    "base": {
      "hp": 95,
      "atq": 95,
      "def": 85,
      "atqEsp": 125,
      "defEsp": 75,
      "vel": 55
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Coco",
    "descricao": "Coco. 2,0 m, 120,0 kg.",
    "convidada": false
  },
  {
    "num": 104,
    "id": "cubone",
    "nome": "Cubone",
    "tipos": [
      "terra"
    ],
    "alturaReal": 0.4,
    "peso": 6.5,
    "base": {
      "hp": 50,
      "atq": 50,
      "def": 95,
      "atqEsp": 40,
      "defEsp": 50,
      "vel": 35
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "marowak",
      "nivel": 28
    },
    "genero": "Solitário",
    "descricao": "Usa o crânio da mãe. Chora por baixo dele nas noites de lua.",
    "convidada": false
  },
  {
    "num": 105,
    "id": "marowak",
    "nome": "Marowak",
    "tipos": [
      "terra"
    ],
    "alturaReal": 1,
    "peso": 45,
    "base": {
      "hp": 60,
      "atq": 80,
      "def": 110,
      "atqEsp": 50,
      "defEsp": 80,
      "vel": 45
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Guardião do Osso",
    "descricao": "Guardião do Osso. 1,0 m, 45,0 kg.",
    "convidada": false
  },
  {
    "num": 106,
    "id": "hitmonlee",
    "nome": "Hitmonlee",
    "tipos": [
      "lutador"
    ],
    "alturaReal": 1.5,
    "peso": 49.8,
    "base": {
      "hp": 50,
      "atq": 120,
      "def": 53,
      "atqEsp": 35,
      "defEsp": 110,
      "vel": 87
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Chutador",
    "descricao": "As pernas esticam. Você vê o chute depois de levar.",
    "convidada": false
  },
  {
    "num": 107,
    "id": "hitmonchan",
    "nome": "Hitmonchan",
    "tipos": [
      "lutador"
    ],
    "alturaReal": 1.4,
    "peso": 50.2,
    "base": {
      "hp": 50,
      "atq": 105,
      "def": 79,
      "atqEsp": 35,
      "defEsp": 110,
      "vel": 76
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Socador",
    "descricao": "Dá três socos por segundo e respira como boxeador.",
    "convidada": false
  },
  {
    "num": 108,
    "id": "lickitung",
    "nome": "Lickitung",
    "tipos": [
      "normal"
    ],
    "alturaReal": 1.2,
    "peso": 65.5,
    "base": {
      "hp": 90,
      "atq": 55,
      "def": 75,
      "atqEsp": 60,
      "defEsp": 75,
      "vel": 30
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Lambedor",
    "descricao": "A língua tem o dobro do corpo e faz tudo por ele.",
    "convidada": false
  },
  {
    "num": 109,
    "id": "koffing",
    "nome": "Koffing",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 0.6,
    "peso": 1,
    "base": {
      "hp": 40,
      "atq": 65,
      "def": 95,
      "atqEsp": 60,
      "defEsp": 45,
      "vel": 35
    },
    "taxaBase": 190,
    "lendario": false,
    "evolui": {
      "para": "weezing",
      "nivel": 35
    },
    "genero": "Gás Venenoso",
    "descricao": "Está sempre meio cheio demais. Explode se apertar.",
    "convidada": false
  },
  {
    "num": 110,
    "id": "weezing",
    "nome": "Weezing",
    "tipos": [
      "veneno"
    ],
    "alturaReal": 1.2,
    "peso": 9.5,
    "base": {
      "hp": 65,
      "atq": 90,
      "def": 120,
      "atqEsp": 85,
      "defEsp": 70,
      "vel": 60
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Gás Venenoso",
    "descricao": "Gás Venenoso. 1,2 m, 9,5 kg.",
    "convidada": false
  },
  {
    "num": 111,
    "id": "rhyhorn",
    "nome": "Rhyhorn",
    "tipos": [
      "terra",
      "pedra"
    ],
    "alturaReal": 1,
    "peso": 115,
    "base": {
      "hp": 80,
      "atq": 85,
      "def": 95,
      "atqEsp": 30,
      "defEsp": 30,
      "vel": 25
    },
    "taxaBase": 120,
    "lendario": false,
    "evolui": {
      "para": "rhydon",
      "nivel": 42
    },
    "genero": "Espinhos",
    "descricao": "Corre em linha reta e não consegue virar. Nem lembra por que correu.",
    "convidada": false
  },
  {
    "num": 112,
    "id": "rhydon",
    "nome": "Rhydon",
    "tipos": [
      "terra",
      "pedra"
    ],
    "alturaReal": 1.9,
    "peso": 120,
    "base": {
      "hp": 105,
      "atq": 130,
      "def": 120,
      "atqEsp": 45,
      "defEsp": 45,
      "vel": 40
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Furadeira",
    "descricao": "Furadeira. 1,9 m, 120,0 kg.",
    "convidada": false
  },
  {
    "num": 113,
    "id": "chansey",
    "nome": "Chansey",
    "tipos": [
      "normal"
    ],
    "alturaReal": 1.1,
    "peso": 34.6,
    "base": {
      "hp": 250,
      "atq": 5,
      "def": 5,
      "atqEsp": 35,
      "defEsp": 105,
      "vel": 50
    },
    "taxaBase": 30,
    "lendario": false,
    "evolui": null,
    "genero": "Ovo",
    "descricao": "O ovo que ela carrega é bom. Ela só dá para quem gosta.",
    "convidada": false
  },
  {
    "num": 114,
    "id": "tangela",
    "nome": "Tangela",
    "tipos": [
      "planta"
    ],
    "alturaReal": 1,
    "peso": 35,
    "base": {
      "hp": 65,
      "atq": 55,
      "def": 115,
      "atqEsp": 100,
      "defEsp": 40,
      "vel": 60
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Trepadeira",
    "descricao": "Ninguém sabe o que tem debaixo dos cipós. Eles crescem de volta.",
    "convidada": false
  },
  {
    "num": 115,
    "id": "kangaskhan",
    "nome": "Kangaskhan",
    "tipos": [
      "normal"
    ],
    "alturaReal": 2.2,
    "peso": 80,
    "base": {
      "hp": 105,
      "atq": 95,
      "def": 80,
      "atqEsp": 40,
      "defEsp": 80,
      "vel": 90
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Materno",
    "descricao": "Não encoste no filhote. Só isso.",
    "convidada": false
  },
  {
    "num": 116,
    "id": "horsea",
    "nome": "Horsea",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.4,
    "peso": 8,
    "base": {
      "hp": 30,
      "atq": 40,
      "def": 70,
      "atqEsp": 70,
      "defEsp": 25,
      "vel": 60
    },
    "taxaBase": 225,
    "lendario": false,
    "evolui": {
      "para": "seadra",
      "nivel": 32
    },
    "genero": "Dragão",
    "descricao": "Cospe tinta quando se assusta, igual polvo.",
    "convidada": false
  },
  {
    "num": 117,
    "id": "seadra",
    "nome": "Seadra",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1.2,
    "peso": 25,
    "base": {
      "hp": 55,
      "atq": 65,
      "def": 95,
      "atqEsp": 95,
      "defEsp": 45,
      "vel": 85
    },
    "taxaBase": 75,
    "lendario": false,
    "evolui": null,
    "genero": "Dragão",
    "descricao": "Dragão. 1,2 m, 25,0 kg.",
    "convidada": false
  },
  {
    "num": 118,
    "id": "goldeen",
    "nome": "Goldeen",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.6,
    "peso": 15,
    "base": {
      "hp": 45,
      "atq": 67,
      "def": 60,
      "atqEsp": 35,
      "defEsp": 50,
      "vel": 63
    },
    "taxaBase": 225,
    "lendario": false,
    "evolui": {
      "para": "seaking",
      "nivel": 33
    },
    "genero": "Peixe Dourado",
    "descricao": "Nada contra a corrente o dia inteiro, de bobeira.",
    "convidada": false
  },
  {
    "num": 119,
    "id": "seaking",
    "nome": "Seaking",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1.3,
    "peso": 39,
    "base": {
      "hp": 80,
      "atq": 92,
      "def": 65,
      "atqEsp": 65,
      "defEsp": 80,
      "vel": 68
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Peixe Dourado",
    "descricao": "Peixe Dourado. 1,3 m, 39,0 kg.",
    "convidada": false
  },
  {
    "num": 120,
    "id": "staryu",
    "nome": "Staryu",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.8,
    "peso": 34.5,
    "base": {
      "hp": 30,
      "atq": 45,
      "def": 55,
      "atqEsp": 70,
      "defEsp": 55,
      "vel": 85
    },
    "taxaBase": 225,
    "lendario": false,
    "evolui": {
      "para": "starmie",
      "nivel": 28
    },
    "genero": "Star Shape",
    "descricao": "O núcleo vermelho pisca junto com as estrelas.",
    "convidada": false
  },
  {
    "num": 121,
    "id": "starmie",
    "nome": "Starmie",
    "tipos": [
      "agua",
      "psiquico"
    ],
    "alturaReal": 1.1,
    "peso": 80,
    "base": {
      "hp": 60,
      "atq": 75,
      "def": 85,
      "atqEsp": 100,
      "defEsp": 85,
      "vel": 115
    },
    "taxaBase": 60,
    "lendario": false,
    "evolui": null,
    "genero": "Misterioso",
    "descricao": "Misterioso. 1,1 m, 80,0 kg.",
    "convidada": false
  },
  {
    "num": 122,
    "id": "mr-mime",
    "nome": "Mr-Mime",
    "tipos": [
      "psiquico",
      "fada"
    ],
    "alturaReal": 1.3,
    "peso": 54.5,
    "base": {
      "hp": 40,
      "atq": 45,
      "def": 65,
      "atqEsp": 100,
      "defEsp": 120,
      "vel": 90
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Barreira",
    "descricao": "Constrói paredes que não existem e você bate nelas.",
    "convidada": false
  },
  {
    "num": 123,
    "id": "scyther",
    "nome": "Scyther",
    "tipos": [
      "inseto",
      "voador"
    ],
    "alturaReal": 1.5,
    "peso": 56,
    "base": {
      "hp": 70,
      "atq": 110,
      "def": 80,
      "atqEsp": 55,
      "defEsp": 80,
      "vel": 105
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Louva-a-Deus",
    "descricao": "As foices cortam mais fino do que você consegue ver.",
    "convidada": false
  },
  {
    "num": 124,
    "id": "jynx",
    "nome": "Jynx",
    "tipos": [
      "gelo",
      "psiquico"
    ],
    "alturaReal": 1.4,
    "peso": 40.6,
    "base": {
      "hp": 65,
      "atq": 50,
      "def": 35,
      "atqEsp": 115,
      "defEsp": 95,
      "vel": 95
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Humanoide",
    "descricao": "Balança o quadril num ritmo que faz você dançar junto.",
    "convidada": false
  },
  {
    "num": 125,
    "id": "electabuzz",
    "nome": "Electabuzz",
    "tipos": [
      "eletrico"
    ],
    "alturaReal": 1.1,
    "peso": 30,
    "base": {
      "hp": 65,
      "atq": 83,
      "def": 57,
      "atqEsp": 95,
      "defEsp": 85,
      "vel": 105
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Elétrico",
    "descricao": "Aparece onde caiu raio. Come a eletricidade.",
    "convidada": false
  },
  {
    "num": 126,
    "id": "magmar",
    "nome": "Magmar",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 1.3,
    "peso": 44.5,
    "base": {
      "hp": 65,
      "atq": 95,
      "def": 57,
      "atqEsp": 100,
      "defEsp": 85,
      "vel": 93
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Cospe-Fogo",
    "descricao": "Vive em cratera. O bafo sai embaçando o ar.",
    "convidada": false
  },
  {
    "num": 127,
    "id": "pinsir",
    "nome": "Pinsir",
    "tipos": [
      "inseto"
    ],
    "alturaReal": 1.5,
    "peso": 55,
    "base": {
      "hp": 65,
      "atq": 125,
      "def": 100,
      "atqEsp": 55,
      "defEsp": 70,
      "vel": 85
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Besouro",
    "descricao": "Prende com as presas e não solta, mesmo se você desistir.",
    "convidada": false
  },
  {
    "num": 128,
    "id": "tauros",
    "nome": "Tauros",
    "tipos": [
      "normal"
    ],
    "alturaReal": 1.4,
    "peso": 88.4,
    "base": {
      "hp": 75,
      "atq": 100,
      "def": 95,
      "atqEsp": 40,
      "defEsp": 70,
      "vel": 110
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Touro Selvagem",
    "descricao": "Chicoteia o próprio corpo com as caudas para se irritar antes de atacar.",
    "convidada": false
  },
  {
    "num": 129,
    "id": "magikarp",
    "nome": "Magikarp",
    "tipos": [
      "agua"
    ],
    "alturaReal": 0.9,
    "peso": 10,
    "base": {
      "hp": 20,
      "atq": 10,
      "def": 55,
      "atqEsp": 15,
      "defEsp": 20,
      "vel": 80
    },
    "taxaBase": 255,
    "lendario": false,
    "evolui": {
      "para": "gyarados",
      "nivel": 20
    },
    "genero": "Peixe",
    "descricao": "Não faz nada. Vale a pena esperar.",
    "convidada": false
  },
  {
    "num": 130,
    "id": "gyarados",
    "nome": "Gyarados",
    "tipos": [
      "agua",
      "voador"
    ],
    "alturaReal": 6.5,
    "peso": 235,
    "base": {
      "hp": 95,
      "atq": 125,
      "def": 79,
      "atqEsp": 60,
      "defEsp": 100,
      "vel": 81
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Atroz",
    "descricao": "Foi um Magikarp. Lembre disso quando ele rugir.",
    "convidada": false
  },
  {
    "num": 131,
    "id": "lapras",
    "nome": "Lapras",
    "tipos": [
      "agua",
      "gelo"
    ],
    "alturaReal": 2.5,
    "peso": 220,
    "base": {
      "hp": 130,
      "atq": 85,
      "def": 80,
      "atqEsp": 85,
      "defEsp": 95,
      "vel": 60
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Transporte",
    "descricao": "Canta uma coisa triste no meio da água. Restam poucos.",
    "convidada": false
  },
  {
    "num": 132,
    "id": "ditto",
    "nome": "Ditto",
    "tipos": [
      "normal"
    ],
    "alturaReal": 0.3,
    "peso": 4,
    "base": {
      "hp": 48,
      "atq": 48,
      "def": 48,
      "atqEsp": 48,
      "defEsp": 48,
      "vel": 48
    },
    "taxaBase": 35,
    "lendario": false,
    "evolui": null,
    "genero": "Transformação",
    "descricao": "Copia qualquer um. Os olhos sempre entregam.",
    "convidada": false
  },
  {
    "num": 133,
    "id": "eevee",
    "nome": "Eevee",
    "tipos": [
      "normal"
    ],
    "alturaReal": 0.3,
    "peso": 6.5,
    "base": {
      "hp": 55,
      "atq": 55,
      "def": 50,
      "atqEsp": 45,
      "defEsp": 65,
      "vel": 55
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "sylveon",
      "nivel": 30
    },
    "genero": "Evolução",
    "descricao": "O código genético dele é instável — por isso vira tanta coisa.",
    "convidada": false
  },
  {
    "num": 134,
    "id": "vaporeon",
    "nome": "Vaporeon",
    "tipos": [
      "agua"
    ],
    "alturaReal": 1,
    "peso": 29,
    "base": {
      "hp": 130,
      "atq": 65,
      "def": 60,
      "atqEsp": 110,
      "defEsp": 95,
      "vel": 65
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Bubble Jet",
    "descricao": "As células são iguais às da água. Some quando quer.",
    "convidada": false
  },
  {
    "num": 135,
    "id": "jolteon",
    "nome": "Jolteon",
    "tipos": [
      "eletrico"
    ],
    "alturaReal": 0.8,
    "peso": 24.5,
    "base": {
      "hp": 65,
      "atq": 65,
      "def": 60,
      "atqEsp": 110,
      "defEsp": 95,
      "vel": 130
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Relâmpago",
    "descricao": "O pelo é agulha carregada. Arrepia antes de disparar.",
    "convidada": false
  },
  {
    "num": 136,
    "id": "flareon",
    "nome": "Flareon",
    "tipos": [
      "fogo"
    ],
    "alturaReal": 0.9,
    "peso": 25,
    "base": {
      "hp": 65,
      "atq": 130,
      "def": 60,
      "atqEsp": 95,
      "defEsp": 110,
      "vel": 65
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Chama",
    "descricao": "Guarda fogo num saco interno. Chega a novecentos graus.",
    "convidada": false
  },
  {
    "num": 137,
    "id": "porygon",
    "nome": "Porygon",
    "tipos": [
      "normal"
    ],
    "alturaReal": 0.8,
    "peso": 36.5,
    "base": {
      "hp": 65,
      "atq": 60,
      "def": 70,
      "atqEsp": 85,
      "defEsp": 75,
      "vel": 40
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Virtual",
    "descricao": "É feito de código. Não precisa respirar.",
    "convidada": false
  },
  {
    "num": 138,
    "id": "omanyte",
    "nome": "Omanyte",
    "tipos": [
      "pedra",
      "agua"
    ],
    "alturaReal": 0.4,
    "peso": 7.5,
    "base": {
      "hp": 35,
      "atq": 40,
      "def": 100,
      "atqEsp": 90,
      "defEsp": 55,
      "vel": 35
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "omastar",
      "nivel": 40
    },
    "genero": "Espiral",
    "descricao": "Voltou de um fóssil. Nada de costas, enrolando os tentáculos.",
    "convidada": false
  },
  {
    "num": 139,
    "id": "omastar",
    "nome": "Omastar",
    "tipos": [
      "pedra",
      "agua"
    ],
    "alturaReal": 1,
    "peso": 35,
    "base": {
      "hp": 70,
      "atq": 60,
      "def": 125,
      "atqEsp": 115,
      "defEsp": 70,
      "vel": 55
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Espiral",
    "descricao": "Espiral. 1,0 m, 35,0 kg.",
    "convidada": false
  },
  {
    "num": 140,
    "id": "kabuto",
    "nome": "Kabuto",
    "tipos": [
      "pedra",
      "agua"
    ],
    "alturaReal": 0.5,
    "peso": 11.5,
    "base": {
      "hp": 30,
      "atq": 80,
      "def": 90,
      "atqEsp": 55,
      "defEsp": 45,
      "vel": 55
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "kabutops",
      "nivel": 40
    },
    "genero": "Molusco",
    "descricao": "Os olhos das costas ainda funcionam depois de milhões de anos.",
    "convidada": false
  },
  {
    "num": 141,
    "id": "kabutops",
    "nome": "Kabutops",
    "tipos": [
      "pedra",
      "agua"
    ],
    "alturaReal": 1.3,
    "peso": 40.5,
    "base": {
      "hp": 60,
      "atq": 115,
      "def": 105,
      "atqEsp": 65,
      "defEsp": 70,
      "vel": 80
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Molusco",
    "descricao": "Molusco. 1,3 m, 40,5 kg.",
    "convidada": false
  },
  {
    "num": 142,
    "id": "aerodactyl",
    "nome": "Aerodactyl",
    "tipos": [
      "pedra",
      "voador"
    ],
    "alturaReal": 1.8,
    "peso": 59,
    "base": {
      "hp": 80,
      "atq": 105,
      "def": 65,
      "atqEsp": 60,
      "defEsp": 75,
      "vel": 130
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Fóssil",
    "descricao": "O rugido dele congela. É antigo e sabe disso.",
    "convidada": false
  },
  {
    "num": 143,
    "id": "snorlax",
    "nome": "Snorlax",
    "tipos": [
      "normal"
    ],
    "alturaReal": 2.1,
    "peso": 460,
    "base": {
      "hp": 160,
      "atq": 110,
      "def": 65,
      "atqEsp": 65,
      "defEsp": 110,
      "vel": 30
    },
    "taxaBase": 25,
    "lendario": false,
    "evolui": null,
    "genero": "Dorminhoco",
    "descricao": "Come quatrocentos quilos por dia e dorme. Não dá para acordar.",
    "convidada": false
  },
  {
    "num": 144,
    "id": "articuno",
    "nome": "Articuno",
    "tipos": [
      "gelo",
      "voador"
    ],
    "alturaReal": 1.7,
    "peso": 55.4,
    "base": {
      "hp": 90,
      "atq": 85,
      "def": 100,
      "atqEsp": 95,
      "defEsp": 125,
      "vel": 85
    },
    "taxaBase": 3,
    "lendario": true,
    "evolui": null,
    "genero": "Congelante",
    "descricao": "Bate as asas e a neve vem junto. Aparece para quem se perdeu.",
    "convidada": false
  },
  {
    "num": 145,
    "id": "zapdos",
    "nome": "Zapdos",
    "tipos": [
      "eletrico",
      "voador"
    ],
    "alturaReal": 1.6,
    "peso": 52.6,
    "base": {
      "hp": 90,
      "atq": 90,
      "def": 85,
      "atqEsp": 125,
      "defEsp": 90,
      "vel": 100
    },
    "taxaBase": 3,
    "lendario": true,
    "evolui": null,
    "genero": "Elétrico",
    "descricao": "Vive dentro da nuvem de tempestade. O barulho é ele.",
    "convidada": false
  },
  {
    "num": 146,
    "id": "moltres",
    "nome": "Moltres",
    "tipos": [
      "fogo",
      "voador"
    ],
    "alturaReal": 2,
    "peso": 60,
    "base": {
      "hp": 90,
      "atq": 100,
      "def": 90,
      "atqEsp": 125,
      "defEsp": 85,
      "vel": 90
    },
    "taxaBase": 3,
    "lendario": true,
    "evolui": null,
    "genero": "Chama",
    "descricao": "As chamas das asas curam ele. Migra para o sul quando se machuca.",
    "convidada": false
  },
  {
    "num": 147,
    "id": "dratini",
    "nome": "Dratini",
    "tipos": [
      "dragao"
    ],
    "alturaReal": 1.8,
    "peso": 3.3,
    "base": {
      "hp": 41,
      "atq": 64,
      "def": 45,
      "atqEsp": 50,
      "defEsp": 50,
      "vel": 50
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "dragonair",
      "nivel": 30
    },
    "genero": "Dragão",
    "descricao": "Troca de pele o tempo todo, porque cresce depressa demais.",
    "convidada": false
  },
  {
    "num": 148,
    "id": "dragonair",
    "nome": "Dragonair",
    "tipos": [
      "dragao"
    ],
    "alturaReal": 4,
    "peso": 16.5,
    "base": {
      "hp": 61,
      "atq": 84,
      "def": 65,
      "atqEsp": 70,
      "defEsp": 70,
      "vel": 70
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": {
      "para": "dragonite",
      "nivel": 55
    },
    "genero": "Dragão",
    "descricao": "As contas do pescoço mudam o tempo. Dizem que traz chuva.",
    "convidada": false
  },
  {
    "num": 149,
    "id": "dragonite",
    "nome": "Dragonite",
    "tipos": [
      "dragao",
      "voador"
    ],
    "alturaReal": 2.2,
    "peso": 210,
    "base": {
      "hp": 91,
      "atq": 134,
      "def": 95,
      "atqEsp": 100,
      "defEsp": 100,
      "vel": 80
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Dragão",
    "descricao": "Dá a volta no mundo em dezesseis horas. Salva gente no mar.",
    "convidada": false
  },
  {
    "num": 150,
    "id": "mewtwo",
    "nome": "Mewtwo",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 2,
    "peso": 122,
    "base": {
      "hp": 106,
      "atq": 110,
      "def": 90,
      "atqEsp": 154,
      "defEsp": 90,
      "vel": 130
    },
    "taxaBase": 3,
    "lendario": true,
    "evolui": null,
    "genero": "Genético",
    "descricao": "Foi feito em laboratório para brigar. Aprendeu só isso.",
    "convidada": false
  },
  {
    "num": 151,
    "id": "mew",
    "nome": "Mew",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 0.4,
    "peso": 4,
    "base": {
      "hp": 100,
      "atq": 100,
      "def": 100,
      "atqEsp": 100,
      "defEsp": 100,
      "vel": 100
    },
    "taxaBase": 45,
    "lendario": true,
    "evolui": null,
    "genero": "New Species",
    "descricao": "Tem o DNA de todos. Some quando você olha direto.",
    "convidada": false
  },
  {
    "num": 196,
    "id": "espeon",
    "nome": "Espeon",
    "tipos": [
      "psiquico"
    ],
    "alturaReal": 0.9,
    "peso": 26.5,
    "base": {
      "hp": 65,
      "atq": 65,
      "def": 60,
      "atqEsp": 130,
      "defEsp": 95,
      "vel": 110
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Sun",
    "descricao": "Sente o ar se mexer e sabe o que você vai fazer antes de você.",
    "convidada": true
  },
  {
    "num": 197,
    "id": "umbreon",
    "nome": "Umbreon",
    "tipos": [
      "sombrio"
    ],
    "alturaReal": 1,
    "peso": 27,
    "base": {
      "hp": 95,
      "atq": 65,
      "def": 110,
      "atqEsp": 60,
      "defEsp": 130,
      "vel": 65
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Moonlight",
    "descricao": "Os anéis brilham no escuro quando a lua bate. Some no resto do tempo.",
    "convidada": true
  },
  {
    "num": 470,
    "id": "leafeon",
    "nome": "Leafeon",
    "tipos": [
      "planta"
    ],
    "alturaReal": 1,
    "peso": 25.5,
    "base": {
      "hp": 65,
      "atq": 110,
      "def": 130,
      "atqEsp": 60,
      "defEsp": 65,
      "vel": 95
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Verdant",
    "descricao": "Faz fotossíntese, então quase não come. Cheira a mato cortado.",
    "convidada": true
  },
  {
    "num": 471,
    "id": "glaceon",
    "nome": "Glaceon",
    "tipos": [
      "gelo"
    ],
    "alturaReal": 0.8,
    "peso": 25.9,
    "base": {
      "hp": 65,
      "atq": 60,
      "def": 110,
      "atqEsp": 130,
      "defEsp": 95,
      "vel": 65
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Fresh Snow",
    "descricao": "Abaixa a própria temperatura e congela o ar em volta em pó de gelo.",
    "convidada": true
  },
  {
    "num": 700,
    "id": "sylveon",
    "nome": "Sylveon",
    "tipos": [
      "fada"
    ],
    "alturaReal": 1,
    "peso": 23.5,
    "base": {
      "hp": 95,
      "atq": 65,
      "def": 65,
      "atqEsp": 110,
      "defEsp": 130,
      "vel": 60
    },
    "taxaBase": 45,
    "lendario": false,
    "evolui": null,
    "genero": "Intertwining",
    "descricao": "Enrola as fitas no seu braço e você para de conseguir brigar.",
    "convidada": true
  }
] as const;
