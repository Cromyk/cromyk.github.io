import * as THREE from 'three';
import type { Pokemon } from './creature';
import { chanceCaptura } from './species';
import { bonusDeCaptura } from './condicao';
import { audio } from './audio';

export type EstadoBola =
  | 'mao'
  | 'voando'
  | 'sugando'
  | 'sacudindo'
  | 'sucesso'
  | 'falha'
  | 'soltando'
  | 'inerte';

const GRAVIDADE = -9.81;
/**
 * Quanto tempo uma bola largada fica no chão antes de sumir.
 *
 * Ela precisa DURAR: uma bola que falhou é uma bola que você ainda tem, e o
 * jogo pedia que você a visse cair no carpete e sumir em quatro segundos, o que
 * é tempo de ver e não de buscar. Um minuto e meio é o bastante para terminar a
 * briga, respirar e ir catar — e curto o bastante para a sala não virar um
 * depósito de pokébolas esquecidas.
 */
const SEGUNDOS_NO_CHAO = 90;
const RESTITUICAO = 0.42;
const RAIO = 0.045;

/**
 * Onde a bola fica na mão, em coordenadas do grip space.
 *
 * O grip space nasce dentro da mão fechada, onde estaria o cabo de um controle.
 * Uma esfera de nove centímetros de diâmetro segurada ali não fica no eixo do
 * antebraço: ela fica na CONCAVIDADE DA PALMA — à frente dos nós dos dedos e
 * deslocada para o lado da palma, que é o único lugar onde uma mão sustenta uma
 * bola sem que ela caia.
 *
 * O deslocamento lateral é espelhado entre as mãos, porque a palma é: ela olha
 * para +X na esquerda e para −X na direita (ver a convenção no topo de
 * src/glove.ts). Sem ele, a bola sai alinhada com o osso do braço, que é onde
 * nada fica.
 *
 * Os 5,5 cm à frente que havia aqui punham a superfície da bola a um
 * centímetro da origem do grip — ou seja, com os dedos inteiros por dentro
 * dela. A correção não foi empurrar a bola para longe (aí ela flutua à frente
 * da mão): foi parar de FECHAR a mão inteira em volta de uma esfera. Ver
 * `fechamento`, em src/hands.ts.
 */
export const NA_MAO = { frente: 0.05, cima: 0.012, palma: 0.022 } as const;
const SACUDIDAS = 3;

/**
 * Quando cada sacudida acontece, em segundos desde que a bola caiu.
 *
 * Eram três intervalos IGUAIS de 0,85 s, e três batidas no mesmo compasso não
 * são suspense — são um metrônomo. O ouvido acerta a terceira antes de ela
 * acontecer, e uma coisa que se pode prever não dá aflição nenhuma.
 *
 * Aqui os vãos crescem: 0,62 · 0,88 · 1,30. A primeira vem rápido, quase junto
 * com a queda; a segunda faz esperar; e a terceira demora o bastante para você
 * achar que deu certo antes de ela vir. É o ritmo do jogo original, e o motivo
 * de ele ser assim é exatamente esse — item 2.3 do roteiro.
 */
const RITMO_DA_SACUDIDA = [0.62, 1.5, 2.8] as const;

/**
 * O quanto o arremesso pode estar errado e ainda assim ser "aquele arremesso".
 *
 * Catorze graus é o que sobra de um gesto que você fez certo: braço na direção
 * do bicho, força mais ou menos certa, e a bola passando de raspão. Acima disso
 * o arremesso foi para outro lugar — e uma bola que faz a curva de trinta graus
 * para acertar não é assistência, é teleguiada, e tira do jogador a única coisa
 * que o arremesso tem para dar, que é ter sido ele quem acertou.
 */
const CONE_DE_AJUDA = THREE.MathUtils.degToRad(14);

/**
 * Quanto a bola consegue virar por segundo, em radianos.
 *
 * Um voo típico dura meio segundo. Com 0,9 rad/s ela fecha uns 26° nesse tempo
 * — mais do que o cone inteiro, então dentro do cone a correção sempre dá
 * conta, e fora dele ela nem começa. O limite existe para a curva ser suave o
 * bastante para parecer física, e não um ímã.
 */
const GIRO_MAXIMO = 0.9;

/**
 * A ajuda de mira do arremesso — a única parte disto que dá para afirmar sem um
 * headset, e por isso está fora da classe.
 *
 * ## Por que existe
 *
 * O arremesso era balístico puro: a velocidade da sua mão, gravidade, e boa
 * sorte. Num jogo de tela isso seria uma mira; em VR é um braço humano tentando
 * acertar um Rattata de vinte centímetros a três metros, com um controle que
 * não tem o peso de uma bola. Errar é o caso comum — e errar aqui custa uma
 * bola que rola para debaixo do sofá, que você vai ter de agachar para catar.
 *
 * ## O que ela não é
 *
 * Não é mira automática. A correção só age quando o arremesso já estava indo
 * para lá (ver `CONE_DE_AJUDA`), e some suavemente na borda do cone em vez de
 * ligar e desligar. O jogador que mirou mal continua errando; o que mirou bem e
 * passou de raspão acerta — que era o que ele tinha feito, de qualquer forma.
 *
 * ## Como: só o rumo, nunca a altura
 *
 * A correção gira a velocidade **em torno do eixo vertical** e deixa a
 * componente de cima intacta. Isso não é economia — é a única versão que
 * funciona, e a primeira que escrevi não era essa.
 *
 * A tentação era mirar o vetor velocidade direto no alvo, em três dimensões. A
 * simulação derrubou na primeira asserção: num arremesso balístico a velocidade
 * NUNCA aponta para o alvo. Ela aponta acima dele na saída e abaixo dele na
 * chegada — é isso que desenha a parábola. Uma correção que persiga a linha
 * reta passa o voo inteiro puxando a bola para baixo no começo e para cima no
 * fim, ou seja, achatando o arco; o arremesso perfeito, corrigido assim,
 * ERRAVA. O teste pegou porque ele afirma primeiro o caso em cheio.
 *
 * E o erro que se quer perdoar é mesmo o lateral: o braço acerta bem a força e
 * a elevação, e o que sai torto é a direção. A gravidade continua sendo a
 * gravidade, o tempo de voo não muda, e o arco que você viu sair da sua mão é o
 * arco que chega lá.
 */
export function corrigirRumo(
  velocidade: THREE.Vector3,
  posicao: THREE.Vector3,
  alvo: THREE.Vector3,
  dt: number,
  cone = CONE_DE_AJUDA,
  giroMaximo = GIRO_MAXIMO,
): boolean {
  const rapidezH = Math.hypot(velocidade.x, velocidade.z);
  if (rapidezH < 0.2) return false;

  const paraX = alvo.x - posicao.x;
  const paraZ = alvo.z - posicao.z;
  const distanciaH = Math.hypot(paraX, paraZ);
  // Colada no bicho não há mais o que corrigir, e a conta do ângulo fica
  // instável — é onde uma correção pequena viraria uma guinada.
  if (distanciaH < 0.25) return false;

  // O ângulo, COM SINAL, que leva o rumo atual ao rumo do alvo girando em torno
  // do eixo vertical.
  //
  // Os dois termos saem da própria rotação do three (R_y): aplicá-la a um vetor
  // dá `x' = x·cos + z·sen` e `z' = −x·sen + z·cos`, e disso sai que o seno do
  // giro que se procura é `v.z·p.x − v.x·p.z` e o cosseno é `v·p`. Escrevo
  // assim, derivado, porque a primeira versão tinha os dois sinais trocados ao
  // mesmo tempo — e dois sinais trocados na mesma conta parecem certos até
  // alguém simular. A bola corrigia para o lado oposto do bicho.
  const seno = (velocidade.z * paraX - velocidade.x * paraZ) / (rapidezH * distanciaH);
  const cosseno = (velocidade.x * paraX + velocidade.z * paraZ) / (rapidezH * distanciaH);
  const erro = Math.atan2(seno, cosseno);
  const tamanho = Math.abs(erro);
  if (tamanho > cone || tamanho < 1e-4) return false;

  // Na borda do cone a ajuda vale quase nada e cresce para dentro. Sem isso,
  // dois arremessos separados por meio grau teriam destinos diferentes.
  const peso = THREE.MathUtils.smoothstep(1 - tamanho / cone, 0, 0.6);
  const passo = Math.min(tamanho, giroMaximo * dt * peso) * Math.sign(erro);
  if (passo === 0) return false;

  // Gira no plano do chão, preservando a rapidez horizontal e o `y` inteiro.
  const cos = Math.cos(passo);
  const sen = Math.sin(passo);
  const x = velocidade.x * cos + velocidade.z * sen;
  const z = -velocidade.x * sen + velocidade.z * cos;
  velocidade.x = x;
  velocidade.z = z;
  return true;
}

/**
 * O corpo da pokébola — duas meias-esferas, faixa equatorial e o botão dos dois
 * lados —, montado em geometria como todo o resto do jogo.
 *
 * Fica fora da classe porque o cinto do antebraço (src/cinto.ts) desenha as
 * MESMAS bolas em miniatura: duas montagens diferentes para o mesmo objeto
 * seriam duas coisas para manter parecidas, e elas ficam lado a lado o jogo
 * inteiro — a do cinto e a da mão, a um palmo uma da outra.
 *
 * O `guardar` é de quem chama: quem monta é quem descarta.
 */
export function montarCorpoDeBola(
  raio: number,
  corAcento: number,
  corBase: number,
  guardar: <T extends THREE.BufferGeometry | THREE.Material>(x: T) => T,
): { grupo: THREE.Group; botao: THREE.Mesh; matBotao: THREE.MeshStandardMaterial } {
  const grupo = new THREE.Group();

  const matTopo = guardar(
    new THREE.MeshStandardMaterial({ color: corAcento, roughness: 0.25, metalness: 0.15 }),
  );
  const matBase = guardar(
    new THREE.MeshStandardMaterial({ color: corBase, roughness: 0.28, metalness: 0.1 }),
  );
  const matFaixa = guardar(
    new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.2 }),
  );
  const matBotao = guardar(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    }),
  );

  const topo = new THREE.Mesh(
    guardar(new THREE.SphereGeometry(raio, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    matTopo,
  );
  const base = new THREE.Mesh(
    guardar(new THREE.SphereGeometry(raio, 28, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)),
    matBase,
  );
  topo.castShadow = true;
  base.castShadow = true;
  grupo.add(topo, base);

  const faixa = new THREE.Mesh(
    guardar(new THREE.CylinderGeometry(raio * 1.008, raio * 1.008, raio * 0.17, 28)),
    matFaixa,
  );
  grupo.add(faixa);

  // Botão: um anel escuro com o miolo claro, nos dois lados.
  for (const frente of [1, -1]) {
    const anel = new THREE.Mesh(
      guardar(new THREE.CylinderGeometry(raio * 0.3, raio * 0.3, raio * 0.1, 20)),
      matFaixa,
    );
    anel.rotation.x = Math.PI * 0.5;
    anel.position.z = frente * raio * 0.94;
    grupo.add(anel);
  }
  const botao = new THREE.Mesh(
    guardar(new THREE.CylinderGeometry(raio * 0.19, raio * 0.19, raio * 0.14, 18)),
    matBotao,
  );
  botao.rotation.x = Math.PI * 0.5;
  botao.position.z = raio * 0.97;
  grupo.add(botao);

  return { grupo, botao, matBotao };
}

/**
 * A pokébola: duas meias-esferas, faixa preta e botão. Montada em geometria,
 * como todo o resto do jogo.
 *
 * Serve para duas coisas: capturar um selvagem (arremessada) e soltar um
 * Pokémon da sua coleção (modo `soltando`).
 */
export class Pokebola {
  readonly raiz = new THREE.Group();
  estado: EstadoBola = 'mao';
  readonly velocidade = new THREE.Vector3();

  presa: Pokemon | null = null;
  resultado: 'capturou' | 'escapou' | 'soltou' | null = null;

  private corpo: THREE.Group;
  private matBotao: THREE.MeshStandardMaterial;
  /** Quanto a mão está perto, neste quadro. Ver `aproximar`. */
  private chamando = 0;
  private luz: THREE.PointLight;
  private descartaveis: Array<THREE.BufferGeometry | THREE.Material> = [];

  /**
   * Para quem este arremesso estava indo. Ver corrigirRumo.
   *
   * É um ponto e não o Pokémon porque a correção não deve perseguir: o alvo é
   * onde ele estava quando você soltou a bola, e um bicho que se esquiva
   * depois disso se esquivou de verdade.
   */
  private guia: THREE.Vector3 | null = null;
  private cronometro = 0;
  private sacudidaAtual = 0;
  private sacudidasRestantes = SACUDIDAS;
  private chancePorSacudida = 0.6;
  private resolvido = false;
  private tempoInerte = 0;
  private forcaSacudida = 0;
  /** Quanto ela está achatada agora, 0 a 1. Ver aplicarElastico. */
  private achatamento = 0;
  private pisoY: number;

  constructor(pisoY: number, corAcento = 0xff3b30, corBase = 0xf2f2f5) {
    this.pisoY = pisoY;

    const guardar = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
      this.descartaveis.push(x);
      return x;
    };

    const montado = montarCorpoDeBola(RAIO, corAcento, corBase, guardar);
    this.corpo = montado.grupo;
    this.matBotao = montado.matBotao;

    this.raiz.add(this.corpo);

    this.luz = new THREE.PointLight(0xffffff, 0.25, 0.7, 2);
    this.raiz.add(this.luz);
  }

  get posicao() {
    return this.raiz.position;
  }

  get raio() {
    return RAIO;
  }

  lancar(velocidade: THREE.Vector3, guia: THREE.Vector3 | null = null) {
    this.estado = 'voando';
    this.velocidade.copy(velocidade);
    this.cronometro = 0;
    this.guia = guia;
    audio.arremesso(velocidade.length() * 0.2);
  }

  /** Acertou um selvagem: ele é sugado para dentro. */
  capturar(pokemon: Pokemon, precisao = 0.5, multiplicadorBola = 1) {
    this.presa = pokemon;
    this.estado = 'sugando';
    this.cronometro = 0;
    this.velocidade.multiplyScalar(0.1);
    pokemon.serCapturado();
    audio.acerto();
    audio.succao();

    const base = chanceCaptura(
      pokemon.especie,
      pokemon.hpFracao,
      pokemon.alarme,
      multiplicadorBola,
      pokemon.nivel,
      bonusDeCaptura(pokemon.condicao),
    );
    this.chancePorSacudida = THREE.MathUtils.clamp(base * (1 + precisao * 0.1), 0.1, 0.985);
    this.sacudidasRestantes = SACUDIDAS;
  }

  /** Arremessada para soltar um Pokémon da coleção, não para capturar. */
  soltar(pokemon: Pokemon) {
    this.presa = pokemon;
    this.estado = 'soltando';
    this.cronometro = 0;
    // O estalo do fecho vem antes do clarão: é a causa, não o efeito.
    audio.estalo();
    audio.succao();
  }

  atualizar(dt: number) {
    this.cronometro += dt;
    this.aplicarElastico(dt);

    switch (this.estado) {
      case 'mao':
        this.matBotao.emissiveIntensity = 0.35 + Math.sin(this.cronometro * 6) * 0.15;
        break;

      case 'voando':
        if (this.guia) corrigirRumo(this.velocidade, this.raiz.position, this.guia, dt);
        this.integrar(dt);
        // Gira no eixo do movimento — o arremesso fica muito mais legível.
        this.raiz.rotation.x += this.velocidade.z * dt * 3;
        this.raiz.rotation.z -= this.velocidade.x * dt * 3;
        if (this.cronometro > 6) this.estado = 'inerte';
        break;

      case 'soltando': {
        this.integrar(dt);
        // Abre, solta um clarão e o Pokémon cresce de dentro dela.
        const t = Math.min(1, this.cronometro / 0.5);
        this.luz.intensity = Math.sin(t * Math.PI) * 3.2;
        this.matBotao.emissiveIntensity = 0.35 + Math.sin(t * Math.PI) * 3;
        if (this.presa) {
          this.presa.raiz.visible = true;
          const escala = THREE.MathUtils.smoothstep(t, 0.15, 1);
          this.presa.raiz.scale.setScalar(Math.max(0.001, escala));
        }
        if (t >= 1 && !this.resolvido) {
          this.resolvido = true;
          this.resultado = 'soltou';
        }
        break;
      }

      case 'sugando': {
        this.integrar(dt);
        const t = Math.min(1, this.cronometro / 0.55);
        if (this.presa) {
          this.presa.raiz.position.lerp(this.raiz.position, Math.min(1, dt * 9));
          this.presa.raiz.scale.setScalar(Math.max(0.001, (1 - t) * 0.9));
          this.presa.raiz.rotation.y += dt * 10 * t;
        }
        this.luz.intensity = 0.25 + t * 2.4;
        this.matBotao.emissiveIntensity = 0.35 + t * 3;
        if (t >= 1) {
          if (this.presa) this.presa.raiz.visible = false;
          this.estado = 'sacudindo';
          this.cronometro = 0;
          this.sacudidaAtual = 0;
        }
        break;
      }

      case 'sacudindo': {
        this.integrar(dt);
        // O botão pisca em vermelho enquanto decide.
        this.matBotao.emissiveIntensity = 1 + Math.sin(this.cronometro * 9) * 0.7;
        this.matBotao.emissive.setHex(0xff4433);

        const indice = this.sacudidaNoTempo(this.cronometro);
        if (indice > this.sacudidaAtual && indice <= SACUDIDAS) {
          this.sacudidaAtual = indice;
          this.sacudidasRestantes--;
          audio.sacudida(indice - 1);
          this.forcaSacudida = 1;

          if (Math.random() > this.chancePorSacudida) {
            this.estado = 'falha';
            this.cronometro = 0;
            audio.escapou();
            break;
          }
          if (this.sacudidasRestantes <= 0) {
            this.estado = 'sucesso';
            this.cronometro = 0;
            this.resultado = 'capturou';
            this.resolvido = true;
            audio.sucesso();
            break;
          }
        }

        if (this.forcaSacudida > 0) {
          this.forcaSacudida = Math.max(0, this.forcaSacudida - dt * 3.2);
          const t = this.forcaSacudida;
          this.raiz.rotation.z = Math.sin(this.cronometro * 34) * 0.5 * t;
          this.raiz.rotation.x = Math.cos(this.cronometro * 27) * 0.3 * t;
        }
        break;
      }

      case 'falha': {
        const t = Math.min(1, this.cronometro / 0.4);
        this.luz.intensity = (1 - t) * 2.5;
        this.corpo.scale.setScalar(1 + t * 0.5);
        if (t >= 1 && !this.resolvido) {
          this.resolvido = true;
          this.resultado = 'escapou';
        }
        // Escapou, mas a bola não evaporou: ela encolhe de volta e cai no chão,
        // de onde dá para pegar e tentar de novo. Era aqui que a bola sumia.
        if (this.cronometro > 0.75) {
          this.corpo.scale.setScalar(1);
          this.estado = 'inerte';
          this.tempoInerte = 0;
        }
        break;
      }

      case 'sucesso': {
        const t = Math.min(1, this.cronometro / 0.9);
        this.raiz.position.y += dt * 0.2 * (1 - t);
        this.matBotao.emissive.setHex(0x7fffa0);
        this.matBotao.emissiveIntensity = 1.6 + Math.sin(this.cronometro * 14) * 0.9 * (1 - t);
        this.raiz.rotation.y += dt * 3 * (1 - t);
        break;
      }

      case 'inerte': {
        this.integrar(dt);
        this.tempoInerte += dt;
        // Um respiro de luz enquanto ela pode ser recolhida, e o apagar nos
        // últimos dez segundos — o aviso de que ela está indo embora.
        //
        // E, desde 18/09, ela ACENDE quando a sua mão chega: era o único alvo
        // de grip do jogo sem nenhuma resposta à aproximação, e é o mais difícil
        // de todos — você está agachado, com a própria mão tapando a bola.
        //
        // Multiplicado pelo mesmo `1 - indoEmbora` do respiro, de propósito:
        // sem isso, aproximar a mão de uma bola a dois segundos de sumir a faria
        // brilhar forte de novo, e o aviso de que ela vai embora morreria.
        const indoEmbora = Math.max(0, 1 - (SEGUNDOS_NO_CHAO - this.tempoInerte) / 10);
        const vivo = 1 - indoEmbora;
        this.luz.intensity = (0.2 + Math.sin(this.tempoInerte * 2.4) * 0.12 + this.chamando * 0.5) * vivo;
        this.matBotao.emissiveIntensity =
          (0.5 + Math.sin(this.tempoInerte * 2.4) * 0.35 + this.chamando * 0.9) * vivo;
        this.chamando = 0;
        break;
      }
    }
  }

  private integrar(dt: number) {
    this.velocidade.y += GRAVIDADE * dt;
    this.raiz.position.addScaledVector(this.velocidade, dt);

    if (this.raiz.position.y - RAIO <= this.pisoY) {
      this.raiz.position.y = this.pisoY + RAIO;
      if (Math.abs(this.velocidade.y) > 0.35) {
        // O achatamento sai da velocidade com que ela chegou: uma bola que cai
        // de trinta centímetros amassa de leve, e uma arremessada com força
        // amassa muito. Achatar sempre igual é o que faz um quique parecer um
        // gif em laço — item 2.3 do roteiro.
        this.achatamento = Math.min(0.55, Math.abs(this.velocidade.y) * 0.09);
        this.velocidade.y *= -RESTITUICAO;
        this.velocidade.x *= 0.78;
        this.velocidade.z *= 0.78;
        audio.quique();
      } else {
        this.velocidade.set(0, 0, 0);
        this.raiz.rotation.x *= 0.9;
        this.raiz.rotation.z *= 0.9;
      }
    }
  }

  /**
   * Squash & stretch: achata ao bater, estica ao subir, volta sozinha.
   *
   * O volume é conservado — o que encolhe em Y cresce em X e Z pela raiz, que
   * é a conta que faz a coisa parecer elástica em vez de desenhada. Sem ela a
   * bola vira uma esfera rígida que muda de tamanho, que o olho lê como
   * defeito.
   *
   * Vive no `corpo` e não na `raiz`: a raiz gira, e escala em nó girado deforma
   * no eixo errado.
   */
  /** Quantas sacudidas já deviam ter acontecido neste instante. */
  private sacudidaNoTempo(segundos: number): number {
    let quantas = 0;
    for (const marca of RITMO_DA_SACUDIDA) {
      if (segundos >= marca) quantas++;
    }
    return quantas;
  }

  private aplicarElastico(dt: number) {
    if (this.achatamento > 0) this.achatamento = Math.max(0, this.achatamento - dt * 5.5);

    // Subindo depressa, ela se alonga um pouco: é o outro lado do mesmo efeito,
    // e é o que dá a sensação de que o quique DEVOLVEU energia.
    const subindo =
      this.estado === 'voando' && this.velocidade.y > 0.6
        ? Math.min(0.18, this.velocidade.y * 0.03)
        : 0;

    const emY = 1 - this.achatamento + subindo;
    const emXZ = 1 / Math.sqrt(Math.max(emY, 0.2));
    this.corpo.scale.set(emXZ, emY, emXZ);
  }

  get acabou(): boolean {
    if (this.estado === 'sucesso') return this.cronometro > 1.6;
    if (this.estado === 'soltando') return this.cronometro > 0.9;
    // 'falha' não acaba: ela vira 'inerte' e a bola fica no carpete.
    if (this.estado === 'inerte') return this.tempoInerte > SEGUNDOS_NO_CHAO;
    return false;
  }

  /** Está parada no chão, esperando alguém pegar. */
  /**
   * A mão está chegando nela, com esta força (0 a 1).
   *
   * Escrito pelo jogo a cada quadro e consumido no próprio quadro — como o
   * `rocar` da mão, e pelo mesmo motivo: é amplitude, não evento. NÃO mexe na
   * escala do corpo, que é escrita inteira pelo elástico do quique.
   */
  aproximar(forca: number) {
    if (forca > this.chamando) this.chamando = forca;
  }

  get noChao(): boolean {
    return this.estado === 'inerte';
  }

  /**
   * Volta para a mão depois de um tempo no carpete.
   *
   * O estado vira 'mao' e o cronômetro de chão zera: se você pegar, arremessar
   * e errar de novo, ela ganha outros noventa segundos, como qualquer bola que
   * acabou de cair.
   */
  recolher() {
    this.estado = 'mao';
    this.velocidade.set(0, 0, 0);
    this.tempoInerte = 0;
    this.cronometro = 0;
    this.resolvido = false;
    this.luz.intensity = 0.25;
    this.matBotao.emissiveIntensity = 0.35;
  }

  descartar(cena: THREE.Object3D) {
    cena.remove(this.raiz);
    for (const d of this.descartaveis) d.dispose();
  }
}
