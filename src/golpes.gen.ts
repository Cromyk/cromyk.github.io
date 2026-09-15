// GERADO por tools/golpes.mjs a partir da PokeAPI — não edite à mão.
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
export const GOLPES_DEX: Record<string, GolpeDex> = {
  "absorb": {
    "nome": "Absorver",
    "tipo": "planta",
    "potencia": 20,
    "categoria": "especial",
    "formato": "projetil",
    "animacao": "sopro",
    "recarga": 1.06
  },
  "acid": {
    "nome": "Ácido",
    "tipo": "veneno",
    "potencia": 40,
    "categoria": "especial",
    "formato": "projetil",
    "animacao": "sopro",
    "recarga": 1.27,
    "efeito": {
      "alvo": "oponente",
      "stat": "defesa",
      "estagios": -1
    },
    "resumo": "dele a defesa cai"
  },
  "acid-armor": {
    "nome": "Armadura Ácida",
    "tipo": "veneno",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 2
    },
    "resumo": "sua defesa sobe"
  },
  "agility": {
    "nome": "Agilidade",
    "tipo": "psiquico",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "velocidade",
      "estagios": 2
    },
    "resumo": "sua velocidade sobe"
  },
  "amnesia": {
    "nome": "Amnésia",
    "tipo": "psiquico",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 2
    },
    "resumo": "sua defesa sobe"
  },
  "aurora-beam": {
    "nome": "Raio Aurora",
    "tipo": "gelo",
    "potencia": 65,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.53,
    "efeito": {
      "alvo": "oponente",
      "stat": "ataque",
      "estagios": -1
    },
    "resumo": "dele a ataque cai"
  },
  "barrage": {
    "nome": "Barragem",
    "tipo": "normal",
    "potencia": 15,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "garra",
    "recarga": 1.01
  },
  "barrier": {
    "nome": "Barreira",
    "tipo": "psiquico",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 2
    },
    "resumo": "sua defesa sobe"
  },
  "bind": {
    "nome": "Amarrar",
    "tipo": "normal",
    "potencia": 15,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "cauda",
    "recarga": 1.01
  },
  "bite": {
    "nome": "Mordida",
    "tipo": "sombrio",
    "potencia": 60,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "mordida",
    "recarga": 1.48
  },
  "blizzard": {
    "nome": "Nevasca",
    "tipo": "gelo",
    "potencia": 110,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 2.01
  },
  "body-slam": {
    "nome": "Bote",
    "tipo": "normal",
    "potencia": 85,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "cauda",
    "recarga": 1.74
  },
  "bone-club": {
    "nome": "Clava de Osso",
    "tipo": "terra",
    "potencia": 65,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.53
  },
  "bonemerang": {
    "nome": "Ossomerangue",
    "tipo": "terra",
    "potencia": 50,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.38
  },
  "bubble": {
    "nome": "Bolha",
    "tipo": "agua",
    "potencia": 40,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.27,
    "efeito": {
      "alvo": "oponente",
      "stat": "velocidade",
      "estagios": -1
    },
    "resumo": "dele a velocidade cai"
  },
  "clamp": {
    "nome": "Pinçar",
    "tipo": "agua",
    "potencia": 35,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "garra",
    "recarga": 1.22
  },
  "comet-punch": {
    "nome": "Soco Cometa",
    "tipo": "normal",
    "potencia": 18,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.04
  },
  "confusion": {
    "nome": "Confusão",
    "tipo": "psiquico",
    "potencia": 50,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.38
  },
  "constrict": {
    "nome": "Constrição",
    "tipo": "normal",
    "potencia": 10,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "cauda",
    "recarga": 0.96,
    "efeito": {
      "alvo": "oponente",
      "stat": "velocidade",
      "estagios": -1
    },
    "resumo": "dele a velocidade cai"
  },
  "counter": {
    "nome": "Contra-Ataque",
    "tipo": "lutador",
    "potencia": 60,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.48
  },
  "crabhammer": {
    "nome": "Martelo de Caranguejo",
    "tipo": "agua",
    "potencia": 100,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.9
  },
  "defense-curl": {
    "nome": "Encolher",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 1
    },
    "resumo": "sua defesa sobe"
  },
  "dig": {
    "nome": "Escavar",
    "tipo": "terra",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.69
  },
  "dizzy-punch": {
    "nome": "Soco Tonto",
    "tipo": "normal",
    "potencia": 70,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.59
  },
  "double-edge": {
    "nome": "Fio Duplo",
    "tipo": "normal",
    "potencia": 120,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 2.1
  },
  "double-kick": {
    "nome": "Chute Duplo",
    "tipo": "lutador",
    "potencia": 30,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "salto",
    "recarga": 1.17
  },
  "double-slap": {
    "nome": "Tapa Duplo",
    "tipo": "normal",
    "potencia": 15,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.01
  },
  "double-team": {
    "nome": "Sósia",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 1
    },
    "resumo": "sua defesa sobe"
  },
  "dragon-rage": {
    "nome": "Fúria do Dragão",
    "tipo": "dragao",
    "potencia": 55,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "investida",
    "recarga": 1.43
  },
  "dream-eater": {
    "nome": "Come-Sonhos",
    "tipo": "psiquico",
    "potencia": 100,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.9
  },
  "drill-peck": {
    "nome": "Bicada Broca",
    "tipo": "voador",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.69
  },
  "earthquake": {
    "nome": "Terremoto",
    "tipo": "terra",
    "potencia": 100,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.9
  },
  "ember": {
    "nome": "Brasa",
    "tipo": "fogo",
    "potencia": 40,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.27
  },
  "fire-punch": {
    "nome": "Soco de Fogo",
    "tipo": "fogo",
    "potencia": 75,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.64
  },
  "fire-spin": {
    "nome": "Redemoinho de Fogo",
    "tipo": "fogo",
    "potencia": 35,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.22
  },
  "flamethrower": {
    "nome": "Lança-Chamas",
    "tipo": "fogo",
    "potencia": 90,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.8
  },
  "fury-attack": {
    "nome": "Ataque Furioso",
    "tipo": "normal",
    "potencia": 15,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.01
  },
  "fury-swipes": {
    "nome": "Golpes Furiosos",
    "tipo": "normal",
    "potencia": 18,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "garra",
    "recarga": 1.04
  },
  "growl": {
    "nome": "Rosnar",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "ataque",
      "estagios": -1
    },
    "resumo": "dele a ataque cai"
  },
  "growth": {
    "nome": "Crescimento",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "ataque",
      "estagios": 1
    },
    "resumo": "sua ataque sobe"
  },
  "guillotine": {
    "nome": "Guilhotina",
    "tipo": "normal",
    "potencia": 90,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "garra",
    "recarga": 1.8
  },
  "gust": {
    "nome": "Rajada",
    "tipo": "voador",
    "potencia": 40,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.27
  },
  "harden": {
    "nome": "Endurecer",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 1
    },
    "resumo": "sua defesa sobe"
  },
  "headbutt": {
    "nome": "Cabeçada",
    "tipo": "normal",
    "potencia": 70,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.59
  },
  "high-jump-kick": {
    "nome": "Joelhada Voadora",
    "tipo": "lutador",
    "potencia": 130,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "salto",
    "recarga": 2.1
  },
  "horn-attack": {
    "nome": "Chifrada",
    "tipo": "normal",
    "potencia": 65,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.53
  },
  "horn-drill": {
    "nome": "Chifre Broca",
    "tipo": "normal",
    "potencia": 90,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.8
  },
  "hydro-pump": {
    "nome": "Hidrobomba",
    "tipo": "agua",
    "potencia": 110,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 2.01
  },
  "hyper-beam": {
    "nome": "Hiper-Raio",
    "tipo": "normal",
    "potencia": 150,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 2.1
  },
  "hyper-fang": {
    "nome": "Presa Hiper",
    "tipo": "normal",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "mordida",
    "recarga": 1.69
  },
  "ice-beam": {
    "nome": "Raio de Gelo",
    "tipo": "gelo",
    "potencia": 90,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.8
  },
  "ice-punch": {
    "nome": "Soco de Gelo",
    "tipo": "gelo",
    "potencia": 75,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.64
  },
  "jump-kick": {
    "nome": "Chute Voador",
    "tipo": "lutador",
    "potencia": 100,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "salto",
    "recarga": 1.9
  },
  "karate-chop": {
    "nome": "Golpe de Caratê",
    "tipo": "lutador",
    "potencia": 50,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.38
  },
  "kinesis": {
    "nome": "Cinese",
    "tipo": "psiquico",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "precisao",
      "estagios": -1
    },
    "resumo": "dele a precisao cai"
  },
  "leech-life": {
    "nome": "Sanguessuga",
    "tipo": "inseto",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "mordida",
    "recarga": 1.69
  },
  "leer": {
    "nome": "Encarar",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "defesa",
      "estagios": -1
    },
    "resumo": "dele a defesa cai"
  },
  "lick": {
    "nome": "Lambida",
    "tipo": "fantasma",
    "potencia": 30,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "mordida",
    "recarga": 1.17
  },
  "low-kick": {
    "nome": "Rasteira",
    "tipo": "lutador",
    "potencia": 55,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "salto",
    "recarga": 1.43
  },
  "meditate": {
    "nome": "Meditar",
    "tipo": "psiquico",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "ataque",
      "estagios": 1
    },
    "resumo": "sua ataque sobe"
  },
  "mega-kick": {
    "nome": "Megachute",
    "tipo": "normal",
    "potencia": 120,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "salto",
    "recarga": 2.1
  },
  "mega-punch": {
    "nome": "Megassoco",
    "tipo": "normal",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.69
  },
  "minimize": {
    "nome": "Encolher-se",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 2
    },
    "resumo": "sua defesa sobe"
  },
  "night-shade": {
    "nome": "Sombra Noturna",
    "tipo": "fantasma",
    "potencia": 55,
    "categoria": "especial",
    "formato": "projetil",
    "animacao": "sopro",
    "recarga": 1.43
  },
  "pay-day": {
    "nome": "Dia de Pagamento",
    "tipo": "normal",
    "potencia": 40,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.27
  },
  "peck": {
    "nome": "Bicada",
    "tipo": "voador",
    "potencia": 35,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.22
  },
  "petal-dance": {
    "nome": "Dança das Pétalas",
    "tipo": "planta",
    "potencia": 120,
    "categoria": "especial",
    "formato": "projetil",
    "animacao": "sopro",
    "recarga": 2.1
  },
  "pin-missile": {
    "nome": "Míssil de Agulhas",
    "tipo": "inseto",
    "potencia": 25,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.11
  },
  "poison-sting": {
    "nome": "Ferroada Tóxica",
    "tipo": "veneno",
    "potencia": 15,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.01
  },
  "pound": {
    "nome": "Pancada",
    "tipo": "normal",
    "potencia": 40,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.27
  },
  "psybeam": {
    "nome": "Psicorraio",
    "tipo": "psiquico",
    "potencia": 65,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.53
  },
  "psychic": {
    "nome": "Psíquico",
    "tipo": "psiquico",
    "potencia": 90,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.8,
    "efeito": {
      "alvo": "oponente",
      "stat": "defesa",
      "estagios": -1
    },
    "resumo": "dele a defesa cai"
  },
  "quick-attack": {
    "nome": "Ataque Rápido",
    "tipo": "normal",
    "potencia": 40,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.27
  },
  "rage": {
    "nome": "Fúria",
    "tipo": "normal",
    "potencia": 20,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.06
  },
  "razor-leaf": {
    "nome": "Folha Navalha",
    "tipo": "planta",
    "potencia": 55,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.43
  },
  "rock-throw": {
    "nome": "Lançar Pedra",
    "tipo": "pedra",
    "potencia": 50,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.38
  },
  "rolling-kick": {
    "nome": "Chute Giratório",
    "tipo": "lutador",
    "potencia": 60,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "salto",
    "recarga": 1.48
  },
  "sand-attack": {
    "nome": "Jato de Areia",
    "tipo": "terra",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "precisao",
      "estagios": -1
    },
    "resumo": "dele a precisao cai"
  },
  "scratch": {
    "nome": "Arranhão",
    "tipo": "normal",
    "potencia": 40,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "garra",
    "recarga": 1.27
  },
  "screech": {
    "nome": "Guincho",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "defesa",
      "estagios": -2
    },
    "resumo": "dele a defesa cai"
  },
  "seismic-toss": {
    "nome": "Arremesso Sísmico",
    "tipo": "lutador",
    "potencia": 60,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.48
  },
  "sharpen": {
    "nome": "Afiar",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "ataque",
      "estagios": 1
    },
    "resumo": "sua ataque sobe"
  },
  "skull-bash": {
    "nome": "Cabeçada de Crânio",
    "tipo": "normal",
    "potencia": 130,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 2.1
  },
  "sky-attack": {
    "nome": "Ataque Celeste",
    "tipo": "voador",
    "potencia": 140,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 2.1
  },
  "slam": {
    "nome": "Batida",
    "tipo": "normal",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.69
  },
  "slash": {
    "nome": "Talho",
    "tipo": "normal",
    "potencia": 70,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "garra",
    "recarga": 1.59
  },
  "sludge": {
    "nome": "Lodo",
    "tipo": "veneno",
    "potencia": 65,
    "categoria": "especial",
    "formato": "projetil",
    "animacao": "sopro",
    "recarga": 1.53
  },
  "smog": {
    "nome": "Fumaça Tóxica",
    "tipo": "veneno",
    "potencia": 30,
    "categoria": "especial",
    "formato": "projetil",
    "animacao": "sopro",
    "recarga": 1.17
  },
  "smokescreen": {
    "nome": "Cortina de Fumaça",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "precisao",
      "estagios": -1
    },
    "resumo": "dele a precisao cai"
  },
  "solar-beam": {
    "nome": "Raio Solar",
    "tipo": "planta",
    "potencia": 120,
    "categoria": "especial",
    "formato": "projetil",
    "animacao": "sopro",
    "recarga": 2.1
  },
  "sonic-boom": {
    "nome": "Estrondo Sônico",
    "tipo": "normal",
    "potencia": 45,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.32
  },
  "spike-cannon": {
    "nome": "Canhão de Espinhos",
    "tipo": "normal",
    "potencia": 20,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.06
  },
  "stomp": {
    "nome": "Pisão",
    "tipo": "normal",
    "potencia": 65,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "salto",
    "recarga": 1.53
  },
  "string-shot": {
    "nome": "Jato de Teia",
    "tipo": "inseto",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "velocidade",
      "estagios": -2
    },
    "resumo": "dele a velocidade cai"
  },
  "submission": {
    "nome": "Submissão",
    "tipo": "lutador",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.69
  },
  "super-fang": {
    "nome": "Superpresa",
    "tipo": "normal",
    "potencia": 70,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "mordida",
    "recarga": 1.59
  },
  "swift": {
    "nome": "Veloz",
    "tipo": "normal",
    "potencia": 60,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.48
  },
  "swords-dance": {
    "nome": "Dança das Espadas",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "ataque",
      "estagios": 2
    },
    "resumo": "sua ataque sobe"
  },
  "tackle": {
    "nome": "Investida",
    "tipo": "normal",
    "potencia": 40,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.27
  },
  "tail-whip": {
    "nome": "Chicote de Cauda",
    "tipo": "normal",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "cauda",
    "recarga": 0.9,
    "efeito": {
      "alvo": "oponente",
      "stat": "defesa",
      "estagios": -1
    },
    "resumo": "dele a defesa cai"
  },
  "take-down": {
    "nome": "Derrubada",
    "tipo": "normal",
    "potencia": 90,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.8
  },
  "thrash": {
    "nome": "Surra",
    "tipo": "normal",
    "potencia": 120,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "cauda",
    "recarga": 2.1
  },
  "thunder": {
    "nome": "Trovão",
    "tipo": "eletrico",
    "potencia": 110,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 2.01
  },
  "thunder-punch": {
    "nome": "Soco do Trovão",
    "tipo": "eletrico",
    "potencia": 75,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "soco",
    "recarga": 1.64
  },
  "thunder-shock": {
    "nome": "Choque Elétrico",
    "tipo": "eletrico",
    "potencia": 40,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.27
  },
  "thunderbolt": {
    "nome": "Choque do Trovão",
    "tipo": "eletrico",
    "potencia": 90,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.8
  },
  "tri-attack": {
    "nome": "Ataque Triplo",
    "tipo": "normal",
    "potencia": 80,
    "categoria": "especial",
    "formato": "raio",
    "animacao": "sopro",
    "recarga": 1.69
  },
  "twineedle": {
    "nome": "Agulha Dupla",
    "tipo": "inseto",
    "potencia": 25,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.11
  },
  "vice-grip": {
    "nome": "Torniquete",
    "tipo": "normal",
    "potencia": 55,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "garra",
    "recarga": 1.43
  },
  "vine-whip": {
    "nome": "Chicote de Cipó",
    "tipo": "planta",
    "potencia": 45,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.32
  },
  "water-gun": {
    "nome": "Jato d’Água",
    "tipo": "agua",
    "potencia": 40,
    "categoria": "especial",
    "formato": "jato",
    "animacao": "sopro",
    "recarga": 1.27
  },
  "waterfall": {
    "nome": "Cachoeira",
    "tipo": "agua",
    "potencia": 80,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.69
  },
  "wing-attack": {
    "nome": "Asa de Ataque",
    "tipo": "voador",
    "potencia": 60,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "investida",
    "recarga": 1.48
  },
  "withdraw": {
    "nome": "Recolher-se",
    "tipo": "agua",
    "potencia": 0,
    "categoria": "status",
    "formato": "aura",
    "animacao": "aura",
    "recarga": 0.9,
    "efeito": {
      "alvo": "proprio",
      "stat": "defesa",
      "estagios": 1
    },
    "resumo": "sua defesa sobe"
  },
  "wrap": {
    "nome": "Enrolar",
    "tipo": "normal",
    "potencia": 15,
    "categoria": "fisico",
    "formato": "projetil",
    "animacao": "cauda",
    "recarga": 1.01
  }
};

/**
 * Quem aprende o quê, e em que nível: `[chave do golpe, nível]`, do mais cedo
 * para o mais tarde. É a tabela de Red/Blue/Yellow.
 */
export const APRENDE: Record<string, ReadonlyArray<readonly [string, number]>> = {
  "bulbasaur": [
    [
      "growl",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "vine-whip",
      13
    ],
    [
      "razor-leaf",
      27
    ],
    [
      "growth",
      34
    ],
    [
      "solar-beam",
      48
    ]
  ],
  "ivysaur": [
    [
      "growl",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "vine-whip",
      13
    ],
    [
      "razor-leaf",
      30
    ],
    [
      "growth",
      38
    ],
    [
      "solar-beam",
      54
    ]
  ],
  "venusaur": [
    [
      "growl",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "vine-whip",
      1
    ],
    [
      "razor-leaf",
      30
    ],
    [
      "growth",
      43
    ],
    [
      "solar-beam",
      65
    ]
  ],
  "charmander": [
    [
      "growl",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "ember",
      9
    ],
    [
      "leer",
      15
    ],
    [
      "rage",
      22
    ],
    [
      "slash",
      30
    ],
    [
      "flamethrower",
      38
    ],
    [
      "fire-spin",
      46
    ]
  ],
  "charmeleon": [
    [
      "ember",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "leer",
      15
    ],
    [
      "rage",
      24
    ],
    [
      "slash",
      33
    ],
    [
      "flamethrower",
      42
    ],
    [
      "fire-spin",
      56
    ]
  ],
  "charizard": [
    [
      "ember",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "rage",
      24
    ],
    [
      "slash",
      36
    ],
    [
      "flamethrower",
      46
    ],
    [
      "fire-spin",
      55
    ]
  ],
  "squirtle": [
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "bubble",
      8
    ],
    [
      "water-gun",
      15
    ],
    [
      "bite",
      22
    ],
    [
      "withdraw",
      28
    ],
    [
      "skull-bash",
      35
    ],
    [
      "hydro-pump",
      42
    ]
  ],
  "wartortle": [
    [
      "bubble",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "water-gun",
      15
    ],
    [
      "bite",
      24
    ],
    [
      "withdraw",
      31
    ],
    [
      "skull-bash",
      39
    ],
    [
      "hydro-pump",
      47
    ]
  ],
  "blastoise": [
    [
      "bubble",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "water-gun",
      1
    ],
    [
      "bite",
      24
    ],
    [
      "withdraw",
      31
    ],
    [
      "skull-bash",
      42
    ],
    [
      "hydro-pump",
      52
    ]
  ],
  "caterpie": [
    [
      "string-shot",
      1
    ],
    [
      "tackle",
      1
    ]
  ],
  "metapod": [
    [
      "harden",
      1
    ]
  ],
  "butterfree": [
    [
      "confusion",
      1
    ],
    [
      "gust",
      28
    ],
    [
      "psybeam",
      32
    ]
  ],
  "weedle": [
    [
      "poison-sting",
      1
    ],
    [
      "string-shot",
      1
    ]
  ],
  "kakuna": [
    [
      "harden",
      1
    ]
  ],
  "beedrill": [
    [
      "fury-attack",
      1
    ],
    [
      "twineedle",
      20
    ],
    [
      "rage",
      25
    ],
    [
      "pin-missile",
      30
    ],
    [
      "agility",
      35
    ]
  ],
  "pidgey": [
    [
      "gust",
      1
    ],
    [
      "sand-attack",
      5
    ],
    [
      "quick-attack",
      12
    ],
    [
      "wing-attack",
      28
    ],
    [
      "agility",
      36
    ]
  ],
  "pidgeotto": [
    [
      "gust",
      1
    ],
    [
      "sand-attack",
      1
    ],
    [
      "quick-attack",
      12
    ],
    [
      "wing-attack",
      31
    ],
    [
      "agility",
      40
    ]
  ],
  "pidgeot": [
    [
      "gust",
      1
    ],
    [
      "quick-attack",
      1
    ],
    [
      "sand-attack",
      1
    ],
    [
      "wing-attack",
      31
    ],
    [
      "agility",
      44
    ]
  ],
  "rattata": [
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "quick-attack",
      7
    ],
    [
      "hyper-fang",
      14
    ],
    [
      "super-fang",
      34
    ]
  ],
  "raticate": [
    [
      "quick-attack",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "hyper-fang",
      14
    ],
    [
      "super-fang",
      41
    ]
  ],
  "spearow": [
    [
      "growl",
      1
    ],
    [
      "peck",
      1
    ],
    [
      "leer",
      9
    ],
    [
      "fury-attack",
      15
    ],
    [
      "drill-peck",
      29
    ],
    [
      "agility",
      36
    ]
  ],
  "fearow": [
    [
      "growl",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "peck",
      1
    ],
    [
      "fury-attack",
      15
    ],
    [
      "drill-peck",
      34
    ],
    [
      "agility",
      43
    ]
  ],
  "ekans": [
    [
      "leer",
      1
    ],
    [
      "wrap",
      1
    ],
    [
      "poison-sting",
      10
    ],
    [
      "bite",
      17
    ],
    [
      "screech",
      31
    ],
    [
      "acid",
      38
    ]
  ],
  "arbok": [
    [
      "leer",
      1
    ],
    [
      "poison-sting",
      1
    ],
    [
      "wrap",
      1
    ],
    [
      "bite",
      17
    ],
    [
      "screech",
      36
    ],
    [
      "acid",
      47
    ]
  ],
  "pikachu": [
    [
      "growl",
      1
    ],
    [
      "thunder-shock",
      1
    ],
    [
      "tail-whip",
      6
    ],
    [
      "quick-attack",
      11
    ],
    [
      "double-team",
      15
    ],
    [
      "slam",
      20
    ],
    [
      "swift",
      26
    ],
    [
      "thunderbolt",
      26
    ],
    [
      "agility",
      33
    ],
    [
      "thunder",
      41
    ]
  ],
  "raichu": [
    [
      "growl",
      1
    ],
    [
      "thunder-shock",
      1
    ]
  ],
  "sandshrew": [
    [
      "scratch",
      1
    ],
    [
      "sand-attack",
      10
    ],
    [
      "slash",
      17
    ],
    [
      "poison-sting",
      24
    ],
    [
      "swift",
      31
    ],
    [
      "fury-swipes",
      38
    ]
  ],
  "sandslash": [
    [
      "sand-attack",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "slash",
      17
    ],
    [
      "poison-sting",
      27
    ],
    [
      "swift",
      36
    ],
    [
      "fury-swipes",
      47
    ]
  ],
  "nidoran-f": [
    [
      "growl",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "scratch",
      8
    ],
    [
      "double-kick",
      12
    ],
    [
      "poison-sting",
      14
    ],
    [
      "tail-whip",
      21
    ],
    [
      "bite",
      29
    ],
    [
      "fury-swipes",
      36
    ]
  ],
  "nidorina": [
    [
      "growl",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "double-kick",
      12
    ],
    [
      "poison-sting",
      14
    ],
    [
      "tail-whip",
      23
    ],
    [
      "bite",
      32
    ],
    [
      "fury-swipes",
      41
    ]
  ],
  "nidoqueen": [
    [
      "body-slam",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "double-kick",
      12
    ],
    [
      "poison-sting",
      14
    ]
  ],
  "nidoran-m": [
    [
      "leer",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "horn-attack",
      8
    ],
    [
      "double-kick",
      12
    ],
    [
      "poison-sting",
      14
    ],
    [
      "fury-attack",
      29
    ],
    [
      "horn-drill",
      36
    ]
  ],
  "nidorino": [
    [
      "horn-attack",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "double-kick",
      12
    ],
    [
      "poison-sting",
      14
    ],
    [
      "fury-attack",
      32
    ],
    [
      "horn-drill",
      41
    ]
  ],
  "nidoking": [
    [
      "horn-attack",
      1
    ],
    [
      "poison-sting",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "thrash",
      1
    ],
    [
      "double-kick",
      12
    ]
  ],
  "clefairy": [
    [
      "growl",
      1
    ],
    [
      "pound",
      1
    ],
    [
      "double-slap",
      18
    ],
    [
      "minimize",
      24
    ],
    [
      "defense-curl",
      39
    ]
  ],
  "clefable": [
    [
      "double-slap",
      1
    ],
    [
      "minimize",
      1
    ]
  ],
  "vulpix": [
    [
      "ember",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "quick-attack",
      16
    ],
    [
      "flamethrower",
      35
    ],
    [
      "fire-spin",
      42
    ]
  ],
  "ninetales": [
    [
      "ember",
      1
    ],
    [
      "quick-attack",
      1
    ],
    [
      "tail-whip",
      1
    ]
  ],
  "jigglypuff": [
    [
      "pound",
      9
    ],
    [
      "defense-curl",
      19
    ],
    [
      "double-slap",
      24
    ],
    [
      "body-slam",
      34
    ],
    [
      "double-edge",
      39
    ]
  ],
  "wigglytuff": [
    [
      "defense-curl",
      1
    ],
    [
      "double-slap",
      1
    ]
  ],
  "zubat": [
    [
      "leech-life",
      1
    ],
    [
      "bite",
      15
    ],
    [
      "wing-attack",
      28
    ]
  ],
  "golbat": [
    [
      "bite",
      1
    ],
    [
      "leech-life",
      1
    ],
    [
      "screech",
      1
    ],
    [
      "wing-attack",
      32
    ]
  ],
  "oddish": [
    [
      "absorb",
      1
    ],
    [
      "acid",
      24
    ],
    [
      "petal-dance",
      33
    ],
    [
      "solar-beam",
      46
    ]
  ],
  "gloom": [
    [
      "absorb",
      1
    ],
    [
      "acid",
      28
    ],
    [
      "petal-dance",
      38
    ],
    [
      "solar-beam",
      52
    ]
  ],
  "vileplume": [
    [
      "acid",
      1
    ],
    [
      "petal-dance",
      1
    ]
  ],
  "paras": [
    [
      "scratch",
      1
    ],
    [
      "leech-life",
      20
    ],
    [
      "slash",
      34
    ],
    [
      "growth",
      41
    ]
  ],
  "parasect": [
    [
      "leech-life",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "slash",
      39
    ],
    [
      "growth",
      48
    ]
  ],
  "venonat": [
    [
      "tackle",
      1
    ],
    [
      "confusion",
      19
    ],
    [
      "leech-life",
      27
    ],
    [
      "psybeam",
      35
    ],
    [
      "psychic",
      43
    ]
  ],
  "venomoth": [
    [
      "confusion",
      1
    ],
    [
      "leech-life",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "psybeam",
      38
    ],
    [
      "psychic",
      50
    ]
  ],
  "diglett": [
    [
      "scratch",
      1
    ],
    [
      "growl",
      15
    ],
    [
      "dig",
      19
    ],
    [
      "sand-attack",
      24
    ],
    [
      "slash",
      31
    ],
    [
      "earthquake",
      40
    ]
  ],
  "dugtrio": [
    [
      "dig",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "sand-attack",
      24
    ],
    [
      "slash",
      35
    ],
    [
      "earthquake",
      47
    ]
  ],
  "meowth": [
    [
      "growl",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "bite",
      12
    ],
    [
      "pay-day",
      17
    ],
    [
      "screech",
      24
    ],
    [
      "fury-swipes",
      33
    ],
    [
      "slash",
      44
    ]
  ],
  "persian": [
    [
      "bite",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "screech",
      1
    ],
    [
      "pay-day",
      17
    ],
    [
      "fury-swipes",
      37
    ],
    [
      "slash",
      51
    ]
  ],
  "psyduck": [
    [
      "scratch",
      1
    ],
    [
      "tail-whip",
      28
    ],
    [
      "confusion",
      36
    ],
    [
      "fury-swipes",
      43
    ],
    [
      "hydro-pump",
      52
    ]
  ],
  "golduck": [
    [
      "scratch",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "confusion",
      39
    ],
    [
      "fury-swipes",
      48
    ],
    [
      "hydro-pump",
      59
    ]
  ],
  "mankey": [
    [
      "leer",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "low-kick",
      9
    ],
    [
      "karate-chop",
      15
    ],
    [
      "fury-swipes",
      21
    ],
    [
      "seismic-toss",
      33
    ],
    [
      "thrash",
      39
    ],
    [
      "screech",
      45
    ]
  ],
  "primeape": [
    [
      "fury-swipes",
      1
    ],
    [
      "karate-chop",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "low-kick",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "rage",
      28
    ],
    [
      "seismic-toss",
      37
    ],
    [
      "screech",
      45
    ],
    [
      "thrash",
      46
    ]
  ],
  "growlithe": [
    [
      "bite",
      1
    ],
    [
      "ember",
      18
    ],
    [
      "leer",
      23
    ],
    [
      "take-down",
      30
    ],
    [
      "agility",
      39
    ],
    [
      "flamethrower",
      50
    ]
  ],
  "arcanine": [
    [
      "ember",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "take-down",
      1
    ]
  ],
  "poliwag": [
    [
      "bubble",
      1
    ],
    [
      "water-gun",
      19
    ],
    [
      "double-slap",
      25
    ],
    [
      "body-slam",
      31
    ],
    [
      "amnesia",
      38
    ],
    [
      "hydro-pump",
      45
    ]
  ],
  "poliwhirl": [
    [
      "bubble",
      1
    ],
    [
      "water-gun",
      1
    ],
    [
      "double-slap",
      26
    ],
    [
      "body-slam",
      33
    ],
    [
      "amnesia",
      41
    ],
    [
      "hydro-pump",
      49
    ]
  ],
  "poliwrath": [
    [
      "body-slam",
      1
    ],
    [
      "double-slap",
      1
    ],
    [
      "water-gun",
      1
    ]
  ],
  "abra": [],
  "kadabra": [
    [
      "confusion",
      1
    ],
    [
      "kinesis",
      1
    ],
    [
      "psybeam",
      27
    ],
    [
      "psychic",
      38
    ]
  ],
  "alakazam": [
    [
      "confusion",
      1
    ],
    [
      "kinesis",
      1
    ],
    [
      "psybeam",
      27
    ],
    [
      "psychic",
      38
    ]
  ],
  "machop": [
    [
      "karate-chop",
      1
    ],
    [
      "low-kick",
      20
    ],
    [
      "leer",
      25
    ],
    [
      "seismic-toss",
      39
    ],
    [
      "submission",
      46
    ]
  ],
  "machoke": [
    [
      "karate-chop",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "low-kick",
      1
    ],
    [
      "seismic-toss",
      44
    ],
    [
      "submission",
      52
    ]
  ],
  "machamp": [
    [
      "karate-chop",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "low-kick",
      1
    ],
    [
      "seismic-toss",
      44
    ],
    [
      "submission",
      52
    ]
  ],
  "bellsprout": [
    [
      "growth",
      1
    ],
    [
      "vine-whip",
      1
    ],
    [
      "wrap",
      13
    ],
    [
      "acid",
      26
    ],
    [
      "razor-leaf",
      33
    ],
    [
      "slam",
      42
    ]
  ],
  "weepinbell": [
    [
      "growth",
      1
    ],
    [
      "vine-whip",
      1
    ],
    [
      "wrap",
      1
    ],
    [
      "acid",
      29
    ],
    [
      "razor-leaf",
      38
    ],
    [
      "slam",
      49
    ]
  ],
  "victreebel": [
    [
      "acid",
      1
    ],
    [
      "razor-leaf",
      1
    ],
    [
      "wrap",
      13
    ]
  ],
  "tentacool": [
    [
      "acid",
      1
    ],
    [
      "wrap",
      13
    ],
    [
      "poison-sting",
      18
    ],
    [
      "water-gun",
      22
    ],
    [
      "constrict",
      27
    ],
    [
      "barrier",
      33
    ],
    [
      "screech",
      40
    ],
    [
      "hydro-pump",
      48
    ]
  ],
  "tentacruel": [
    [
      "acid",
      1
    ],
    [
      "wrap",
      1
    ],
    [
      "poison-sting",
      18
    ],
    [
      "water-gun",
      22
    ],
    [
      "constrict",
      27
    ],
    [
      "barrier",
      35
    ],
    [
      "screech",
      43
    ],
    [
      "hydro-pump",
      50
    ]
  ],
  "geodude": [
    [
      "tackle",
      1
    ],
    [
      "defense-curl",
      11
    ],
    [
      "rock-throw",
      16
    ],
    [
      "harden",
      26
    ],
    [
      "earthquake",
      31
    ]
  ],
  "graveler": [
    [
      "defense-curl",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "rock-throw",
      16
    ],
    [
      "harden",
      29
    ],
    [
      "earthquake",
      36
    ]
  ],
  "golem": [
    [
      "defense-curl",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "rock-throw",
      16
    ],
    [
      "harden",
      29
    ],
    [
      "earthquake",
      36
    ]
  ],
  "ponyta": [
    [
      "ember",
      1
    ],
    [
      "tail-whip",
      30
    ],
    [
      "stomp",
      32
    ],
    [
      "growl",
      35
    ],
    [
      "fire-spin",
      39
    ],
    [
      "take-down",
      43
    ],
    [
      "agility",
      48
    ]
  ],
  "rapidash": [
    [
      "ember",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "stomp",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "fire-spin",
      39
    ],
    [
      "take-down",
      47
    ],
    [
      "agility",
      55
    ]
  ],
  "slowpoke": [
    [
      "confusion",
      1
    ],
    [
      "headbutt",
      22
    ],
    [
      "growl",
      27
    ],
    [
      "water-gun",
      33
    ],
    [
      "amnesia",
      40
    ],
    [
      "psychic",
      48
    ]
  ],
  "slowbro": [
    [
      "confusion",
      1
    ],
    [
      "headbutt",
      1
    ],
    [
      "growl",
      27
    ],
    [
      "water-gun",
      33
    ],
    [
      "withdraw",
      37
    ],
    [
      "amnesia",
      44
    ],
    [
      "psychic",
      55
    ]
  ],
  "magnemite": [
    [
      "tackle",
      1
    ],
    [
      "sonic-boom",
      21
    ],
    [
      "thunder-shock",
      25
    ],
    [
      "swift",
      41
    ],
    [
      "screech",
      47
    ]
  ],
  "magneton": [
    [
      "sonic-boom",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "thunder-shock",
      1
    ],
    [
      "swift",
      46
    ],
    [
      "screech",
      54
    ]
  ],
  "farfetchd": [
    [
      "peck",
      1
    ],
    [
      "sand-attack",
      1
    ],
    [
      "leer",
      7
    ],
    [
      "fury-attack",
      15
    ],
    [
      "swords-dance",
      23
    ],
    [
      "agility",
      31
    ],
    [
      "slash",
      39
    ]
  ],
  "doduo": [
    [
      "peck",
      1
    ],
    [
      "growl",
      20
    ],
    [
      "fury-attack",
      24
    ],
    [
      "drill-peck",
      30
    ],
    [
      "rage",
      36
    ],
    [
      "tri-attack",
      40
    ],
    [
      "agility",
      44
    ]
  ],
  "dodrio": [
    [
      "fury-attack",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "peck",
      1
    ],
    [
      "drill-peck",
      30
    ],
    [
      "rage",
      39
    ],
    [
      "tri-attack",
      45
    ],
    [
      "agility",
      51
    ]
  ],
  "seel": [
    [
      "headbutt",
      1
    ],
    [
      "growl",
      30
    ],
    [
      "aurora-beam",
      35
    ],
    [
      "take-down",
      45
    ],
    [
      "ice-beam",
      50
    ]
  ],
  "dewgong": [
    [
      "aurora-beam",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "headbutt",
      1
    ],
    [
      "take-down",
      50
    ],
    [
      "ice-beam",
      56
    ]
  ],
  "grimer": [
    [
      "pound",
      1
    ],
    [
      "minimize",
      33
    ],
    [
      "sludge",
      37
    ],
    [
      "harden",
      42
    ],
    [
      "screech",
      48
    ],
    [
      "acid-armor",
      55
    ]
  ],
  "muk": [
    [
      "pound",
      1
    ],
    [
      "minimize",
      33
    ],
    [
      "sludge",
      37
    ],
    [
      "harden",
      45
    ],
    [
      "screech",
      53
    ],
    [
      "acid-armor",
      60
    ]
  ],
  "shellder": [
    [
      "tackle",
      1
    ],
    [
      "withdraw",
      1
    ],
    [
      "clamp",
      23
    ],
    [
      "aurora-beam",
      30
    ],
    [
      "leer",
      39
    ],
    [
      "ice-beam",
      50
    ]
  ],
  "cloyster": [
    [
      "aurora-beam",
      1
    ],
    [
      "clamp",
      1
    ],
    [
      "withdraw",
      1
    ],
    [
      "spike-cannon",
      50
    ]
  ],
  "gastly": [
    [
      "lick",
      1
    ],
    [
      "night-shade",
      1
    ],
    [
      "dream-eater",
      35
    ]
  ],
  "haunter": [
    [
      "lick",
      1
    ],
    [
      "night-shade",
      1
    ],
    [
      "dream-eater",
      38
    ]
  ],
  "gengar": [
    [
      "lick",
      1
    ],
    [
      "night-shade",
      1
    ],
    [
      "dream-eater",
      38
    ]
  ],
  "onix": [
    [
      "screech",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "bind",
      15
    ],
    [
      "rock-throw",
      19
    ],
    [
      "rage",
      25
    ],
    [
      "slam",
      33
    ],
    [
      "harden",
      43
    ]
  ],
  "drowzee": [
    [
      "pound",
      1
    ],
    [
      "confusion",
      17
    ],
    [
      "headbutt",
      24
    ],
    [
      "psychic",
      32
    ],
    [
      "meditate",
      37
    ]
  ],
  "hypno": [
    [
      "confusion",
      1
    ],
    [
      "pound",
      1
    ],
    [
      "headbutt",
      24
    ],
    [
      "psychic",
      37
    ],
    [
      "meditate",
      43
    ]
  ],
  "krabby": [
    [
      "bubble",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "vice-grip",
      20
    ],
    [
      "guillotine",
      25
    ],
    [
      "stomp",
      30
    ],
    [
      "crabhammer",
      35
    ],
    [
      "harden",
      40
    ]
  ],
  "kingler": [
    [
      "bubble",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "vice-grip",
      1
    ],
    [
      "guillotine",
      25
    ],
    [
      "stomp",
      34
    ],
    [
      "crabhammer",
      42
    ],
    [
      "harden",
      49
    ]
  ],
  "voltorb": [
    [
      "screech",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "sonic-boom",
      17
    ],
    [
      "swift",
      36
    ]
  ],
  "electrode": [
    [
      "screech",
      1
    ],
    [
      "sonic-boom",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "swift",
      40
    ]
  ],
  "exeggcute": [
    [
      "barrage",
      1
    ],
    [
      "solar-beam",
      42
    ]
  ],
  "exeggutor": [
    [
      "barrage",
      1
    ],
    [
      "stomp",
      28
    ]
  ],
  "cubone": [
    [
      "bone-club",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "tail-whip",
      13
    ],
    [
      "headbutt",
      18
    ],
    [
      "leer",
      25
    ],
    [
      "thrash",
      38
    ],
    [
      "bonemerang",
      43
    ],
    [
      "rage",
      46
    ]
  ],
  "marowak": [
    [
      "bone-club",
      1
    ],
    [
      "growl",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "headbutt",
      18
    ],
    [
      "thrash",
      41
    ],
    [
      "bonemerang",
      48
    ],
    [
      "rage",
      55
    ]
  ],
  "hitmonlee": [
    [
      "double-kick",
      1
    ],
    [
      "meditate",
      1
    ],
    [
      "rolling-kick",
      33
    ],
    [
      "jump-kick",
      38
    ],
    [
      "high-jump-kick",
      48
    ],
    [
      "mega-kick",
      53
    ]
  ],
  "hitmonchan": [
    [
      "agility",
      1
    ],
    [
      "comet-punch",
      1
    ],
    [
      "fire-punch",
      33
    ],
    [
      "ice-punch",
      38
    ],
    [
      "thunder-punch",
      43
    ],
    [
      "mega-punch",
      48
    ],
    [
      "counter",
      53
    ]
  ],
  "lickitung": [
    [
      "wrap",
      1
    ],
    [
      "stomp",
      7
    ],
    [
      "defense-curl",
      23
    ],
    [
      "slam",
      31
    ],
    [
      "screech",
      39
    ]
  ],
  "koffing": [
    [
      "smog",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "sludge",
      32
    ],
    [
      "smokescreen",
      37
    ]
  ],
  "weezing": [
    [
      "sludge",
      1
    ],
    [
      "smog",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "smokescreen",
      39
    ]
  ],
  "rhyhorn": [
    [
      "horn-attack",
      1
    ],
    [
      "stomp",
      30
    ],
    [
      "tail-whip",
      35
    ],
    [
      "fury-attack",
      40
    ],
    [
      "horn-drill",
      45
    ],
    [
      "leer",
      50
    ],
    [
      "take-down",
      55
    ]
  ],
  "rhydon": [
    [
      "fury-attack",
      1
    ],
    [
      "horn-attack",
      1
    ],
    [
      "stomp",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "horn-drill",
      48
    ],
    [
      "leer",
      55
    ],
    [
      "take-down",
      64
    ]
  ],
  "chansey": [
    [
      "double-slap",
      1
    ],
    [
      "pound",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "growl",
      30
    ],
    [
      "minimize",
      38
    ],
    [
      "defense-curl",
      44
    ],
    [
      "double-edge",
      54
    ]
  ],
  "tangela": [
    [
      "bind",
      1
    ],
    [
      "constrict",
      1
    ],
    [
      "absorb",
      27
    ],
    [
      "vine-whip",
      29
    ],
    [
      "slam",
      45
    ],
    [
      "growth",
      48
    ]
  ],
  "kangaskhan": [
    [
      "comet-punch",
      1
    ],
    [
      "rage",
      1
    ],
    [
      "bite",
      26
    ],
    [
      "tail-whip",
      31
    ],
    [
      "mega-punch",
      36
    ],
    [
      "leer",
      41
    ],
    [
      "dizzy-punch",
      46
    ]
  ],
  "horsea": [
    [
      "bubble",
      1
    ],
    [
      "smokescreen",
      19
    ],
    [
      "leer",
      24
    ],
    [
      "water-gun",
      30
    ],
    [
      "agility",
      37
    ],
    [
      "hydro-pump",
      45
    ]
  ],
  "seadra": [
    [
      "bubble",
      1
    ],
    [
      "smokescreen",
      1
    ],
    [
      "leer",
      24
    ],
    [
      "water-gun",
      30
    ],
    [
      "agility",
      41
    ],
    [
      "hydro-pump",
      52
    ]
  ],
  "goldeen": [
    [
      "peck",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "horn-attack",
      24
    ],
    [
      "fury-attack",
      30
    ],
    [
      "waterfall",
      37
    ],
    [
      "horn-drill",
      45
    ],
    [
      "agility",
      54
    ]
  ],
  "seaking": [
    [
      "peck",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "horn-attack",
      24
    ],
    [
      "fury-attack",
      30
    ],
    [
      "waterfall",
      39
    ],
    [
      "horn-drill",
      48
    ],
    [
      "agility",
      54
    ]
  ],
  "staryu": [
    [
      "tackle",
      1
    ],
    [
      "water-gun",
      17
    ],
    [
      "harden",
      22
    ],
    [
      "swift",
      32
    ],
    [
      "minimize",
      37
    ],
    [
      "hydro-pump",
      47
    ]
  ],
  "starmie": [
    [
      "harden",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "water-gun",
      1
    ]
  ],
  "mr-mime": [
    [
      "barrier",
      1
    ],
    [
      "confusion",
      1
    ],
    [
      "double-slap",
      31
    ],
    [
      "meditate",
      39
    ]
  ],
  "scyther": [
    [
      "quick-attack",
      1
    ],
    [
      "leer",
      17
    ],
    [
      "double-team",
      24
    ],
    [
      "slash",
      29
    ],
    [
      "swords-dance",
      35
    ],
    [
      "agility",
      42
    ],
    [
      "wing-attack",
      50
    ]
  ],
  "jynx": [
    [
      "pound",
      1
    ],
    [
      "lick",
      18
    ],
    [
      "double-slap",
      23
    ],
    [
      "ice-punch",
      31
    ],
    [
      "body-slam",
      39
    ],
    [
      "thrash",
      47
    ],
    [
      "blizzard",
      58
    ]
  ],
  "electabuzz": [
    [
      "leer",
      1
    ],
    [
      "quick-attack",
      1
    ],
    [
      "thunder-shock",
      34
    ],
    [
      "screech",
      37
    ],
    [
      "thunder-punch",
      42
    ],
    [
      "thunder",
      54
    ]
  ],
  "magmar": [
    [
      "ember",
      1
    ],
    [
      "leer",
      36
    ],
    [
      "fire-punch",
      43
    ],
    [
      "smokescreen",
      48
    ],
    [
      "smog",
      52
    ],
    [
      "flamethrower",
      55
    ]
  ],
  "pinsir": [
    [
      "vice-grip",
      1
    ],
    [
      "bind",
      21
    ],
    [
      "seismic-toss",
      25
    ],
    [
      "guillotine",
      30
    ],
    [
      "harden",
      43
    ],
    [
      "slash",
      49
    ],
    [
      "swords-dance",
      54
    ]
  ],
  "tauros": [
    [
      "tackle",
      1
    ],
    [
      "stomp",
      21
    ],
    [
      "tail-whip",
      28
    ],
    [
      "leer",
      35
    ],
    [
      "rage",
      44
    ],
    [
      "take-down",
      51
    ]
  ],
  "magikarp": [
    [
      "tackle",
      15
    ]
  ],
  "gyarados": [
    [
      "bite",
      1
    ],
    [
      "dragon-rage",
      1
    ],
    [
      "hydro-pump",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "hyper-beam",
      52
    ]
  ],
  "lapras": [
    [
      "growl",
      1
    ],
    [
      "water-gun",
      1
    ],
    [
      "body-slam",
      25
    ],
    [
      "ice-beam",
      38
    ],
    [
      "hydro-pump",
      46
    ]
  ],
  "ditto": [],
  "eevee": [
    [
      "sand-attack",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "growl",
      16
    ],
    [
      "quick-attack",
      23
    ],
    [
      "bite",
      30
    ],
    [
      "take-down",
      42
    ]
  ],
  "vaporeon": [
    [
      "quick-attack",
      1
    ],
    [
      "sand-attack",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "water-gun",
      1
    ],
    [
      "bite",
      30
    ],
    [
      "aurora-beam",
      36
    ],
    [
      "acid-armor",
      42
    ],
    [
      "hydro-pump",
      52
    ]
  ],
  "jolteon": [
    [
      "quick-attack",
      1
    ],
    [
      "sand-attack",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "thunder-shock",
      1
    ],
    [
      "double-kick",
      30
    ],
    [
      "pin-missile",
      36
    ],
    [
      "agility",
      44
    ],
    [
      "thunder",
      52
    ]
  ],
  "flareon": [
    [
      "ember",
      1
    ],
    [
      "quick-attack",
      1
    ],
    [
      "sand-attack",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "tail-whip",
      1
    ],
    [
      "bite",
      30
    ],
    [
      "fire-spin",
      36
    ],
    [
      "leer",
      42
    ],
    [
      "smog",
      42
    ],
    [
      "rage",
      48
    ],
    [
      "flamethrower",
      52
    ]
  ],
  "porygon": [
    [
      "sharpen",
      1
    ],
    [
      "tackle",
      1
    ],
    [
      "psybeam",
      23
    ],
    [
      "agility",
      35
    ],
    [
      "tri-attack",
      42
    ]
  ],
  "omanyte": [
    [
      "water-gun",
      1
    ],
    [
      "withdraw",
      1
    ],
    [
      "horn-attack",
      34
    ],
    [
      "leer",
      39
    ],
    [
      "spike-cannon",
      46
    ],
    [
      "hydro-pump",
      53
    ]
  ],
  "omastar": [
    [
      "horn-attack",
      1
    ],
    [
      "water-gun",
      1
    ],
    [
      "withdraw",
      1
    ],
    [
      "leer",
      39
    ],
    [
      "spike-cannon",
      44
    ],
    [
      "hydro-pump",
      49
    ]
  ],
  "kabuto": [
    [
      "harden",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "absorb",
      34
    ],
    [
      "slash",
      39
    ],
    [
      "leer",
      44
    ],
    [
      "hydro-pump",
      49
    ]
  ],
  "kabutops": [
    [
      "absorb",
      1
    ],
    [
      "harden",
      1
    ],
    [
      "scratch",
      1
    ],
    [
      "slash",
      39
    ],
    [
      "leer",
      46
    ],
    [
      "hydro-pump",
      53
    ]
  ],
  "aerodactyl": [
    [
      "agility",
      1
    ],
    [
      "wing-attack",
      1
    ],
    [
      "bite",
      38
    ],
    [
      "take-down",
      45
    ],
    [
      "hyper-beam",
      54
    ]
  ],
  "snorlax": [
    [
      "amnesia",
      1
    ],
    [
      "headbutt",
      1
    ],
    [
      "body-slam",
      35
    ],
    [
      "harden",
      41
    ],
    [
      "double-edge",
      48
    ],
    [
      "hyper-beam",
      56
    ]
  ],
  "articuno": [
    [
      "ice-beam",
      1
    ],
    [
      "peck",
      1
    ],
    [
      "blizzard",
      51
    ],
    [
      "agility",
      55
    ]
  ],
  "zapdos": [
    [
      "drill-peck",
      1
    ],
    [
      "thunder-shock",
      1
    ],
    [
      "thunder",
      51
    ],
    [
      "agility",
      55
    ]
  ],
  "moltres": [
    [
      "fire-spin",
      1
    ],
    [
      "peck",
      1
    ],
    [
      "leer",
      51
    ],
    [
      "agility",
      55
    ],
    [
      "sky-attack",
      60
    ]
  ],
  "dratini": [
    [
      "leer",
      1
    ],
    [
      "wrap",
      1
    ],
    [
      "agility",
      20
    ],
    [
      "slam",
      30
    ],
    [
      "dragon-rage",
      40
    ],
    [
      "hyper-beam",
      50
    ]
  ],
  "dragonair": [
    [
      "leer",
      1
    ],
    [
      "wrap",
      1
    ],
    [
      "agility",
      20
    ],
    [
      "slam",
      35
    ],
    [
      "dragon-rage",
      45
    ],
    [
      "hyper-beam",
      55
    ]
  ],
  "dragonite": [
    [
      "agility",
      1
    ],
    [
      "leer",
      1
    ],
    [
      "wrap",
      1
    ],
    [
      "slam",
      35
    ],
    [
      "dragon-rage",
      45
    ],
    [
      "hyper-beam",
      60
    ]
  ],
  "mewtwo": [
    [
      "confusion",
      1
    ],
    [
      "psychic",
      1
    ],
    [
      "swift",
      1
    ],
    [
      "barrier",
      63
    ],
    [
      "amnesia",
      81
    ]
  ],
  "mew": [
    [
      "pound",
      1
    ],
    [
      "mega-punch",
      20
    ],
    [
      "psychic",
      40
    ]
  ]
};
