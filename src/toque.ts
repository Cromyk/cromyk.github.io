/**
 * O toque: quanto a mão está encostando, de 0 a 1.
 *
 * ## O que este arquivo conserta
 *
 * O relato do playtest de 18/09 foi: *"a manipulação de grip e a mão encostar
 * nos objetos, itens, pokémons precisa ter uma sensação melhor de toque"* — o
 * gesto funciona e não convence.
 *
 * A causa é de arquitetura, e é uma só: **a mão do jogo só tinha canal de
 * EVENTO**. As cinquenta chamadas de `sentir()` são todas consequências —
 * *pegou*, *acertou*, *recusado* —, e disparam depois de o gesto já ter sido
 * cometido. Enquanto isso, o cinto, a mochila, o painel, a bola caída e a
 * Pokédex calculavam a distância exata da sua mão a cada quadro e **jogavam o
 * número fora**, guardando só `distância < alcance`. O destaque que você vê era
 * esse booleano amortecido no tempo: ele lê como "apareceu", nunca como "estou
 * chegando".
 *
 * Em realidade misturada, o que faz uma coisa parecer sólida é a APROXIMAÇÃO.
 * Sem ela, a mão atravessa uma parede invisível e a única confirmação de contato
 * é o clique do botão físico debaixo do seu dedo.
 *
 * ## Por que amplitude, e não um evento novo
 *
 * A saída óbvia seria um sexto padrão de `TATO`, disparado na BORDA de entrada
 * no alcance. Seis auditorias independentes propuseram exatamente isso, e todas
 * as seis precisaram emendar histerese, antirrepique e uma lista de alvos já
 * roçados — porque uma borda calculada sobre uma distância trêmula, dentro de um
 * campo de sete centímetros, **é** o chiado.
 *
 * Amplitude não tem borda. Não precisa de histerese, não precisa de lista, não
 * precisa de intervalo mínimo: o problema desaparece em vez de ser remendado. E
 * o mesmo número serve aos dois canais — a bola de luz cresce com ele e a mão
 * vibra com ele —, que é o que faz a mão aprender UM padrão em vez de seis
 * ajustes finos.
 *
 * ## Por que funções puras, aqui
 *
 * Porque `Mao` precisa de um `WebGLRenderer` para existir, e estas contas são
 * exatamente a parte que `tools/smoke.ts` consegue conferir em Node.
 */

/**
 * Quanto a mão está encostando neste alvo, de 0 a 1.
 *
 * - **fora de `aviso`** — zero. Nada acontece.
 * - **entre `aviso` e `agarre`** — sobe LINEARMENTE. É a banda em que o braço
 *   ainda pode corrigir, e é o que dá a sensação de chegar perto.
 * - **dentro de `agarre`** — satura em 1 e fica. Aqui o grip funciona, e a mão
 *   precisa sentir isso como um platô, não como uma escalada que continua.
 *
 * A saturação não é detalhe: é ela que mantém o aro de foco aceso em TODO o
 * raio em que o grip pega. Uma rampa pura criaria uma faixa morta logo antes do
 * alvo — o pior lugar possível para a resposta enfraquecer.
 *
 * Linear e não quadrática porque a banda é curta: com cinco centímetros e meio
 * de curso no cinto, elevar ao quadrado joga a resposta inteira para o último
 * centímetro e meio, quando a correção de mira já acabou.
 */
export function forcaDeToque(distancia: number, agarre: number, aviso: number): number {
  if (!(distancia < aviso)) return 0;
  if (distancia <= agarre) return 1;
  if (!(aviso > agarre)) return 1;
  return (aviso - distancia) / (aviso - agarre);
}

/**
 * A força do pulso de vibração para uma dada força de toque.
 *
 * Raiz, e não quadrado: a percepção de amplitude num motor linear é
 * compressiva, e o ponto deste sistema é justamente a APROXIMAÇÃO — elevar ao
 * quadrado mataria a metade de fora da banda, que é onde o braço ainda pode
 * corrigir o rumo.
 *
 * O piso de 0,10 existe porque abaixo disso o atuador do Touch nem sai do
 * lugar; o teto de 0,30 existe para a textura nunca se confundir com um padrão
 * de `TATO` — `acertou` é 0,85 e `marcou` é 0,25, e o que separa a textura dos
 * dois não é força, é FORMA: ela é contínua, eles são tiques.
 */
export function pulsoDeToque(forca: number): number {
  return 0.1 + 0.2 * Math.sqrt(Math.max(0, Math.min(1, forca)));
}

/**
 * Quanto tempo cada pulso da textura dura, e de quanto em quanto ele se repete.
 *
 * Reemitir a cada 45 ms um pulso de 55 ms deixa 10 ms de sobreposição — e como
 * um `pulse` novo PREEMPTA o anterior em vez de somar, essa sobreposição é o que
 * garante que não haja buraco. É exatamente o defeito do ronronar do carinho,
 * que sorteava um pulso de 18 ms por quadro e deixava meio segundo de silêncio
 * entre um e outro: 11% de tempo vibrando lê como chiado, não como contato.
 *
 * Vinte e duas chamadas por segundo por mão é menos do que o escorregão do colo
 * já paga hoje, uma por quadro.
 */
export const PULSO_DE_TOQUE_MS = 55;
export const INTERVALO_DE_TOQUE_MS = 45;

/**
 * Os raios de AVISO: onde a mão começa a sentir que está chegando.
 *
 * Nenhum raio de AGARRE muda por causa disto, e essa é a regra do sistema
 * inteiro — os de agarre foram medidos contra braço humano no ar e estão
 * documentados um a um onde vivem. Estes ficam POR FORA deles.
 *
 * A proporção de ~1,7× dá de cinco a oito centímetros de curso. A meio metro
 * por segundo de braço, isso são 100 a 160 ms de antecedência: tempo de ler a
 * resposta antes de fechar a mão.
 */
export const AVISO = {
  /** Cinto: agarre 7,5 cm → 5,5 cm de banda. */
  slot: 0.13,
  /** Mochila: agarre 12 cm → 8 cm de banda. */
  item: 0.2,
  /** Painel do pulso: agarre 9 cm → 6 cm. */
  carta: 0.15,
  /**
   * Bola caída: agarre 16 cm → 14 cm. A maior banda do jogo, porque é o único
   * alvo de grip que hoje não tem estado de aproximação NENHUM — e porque você
   * chega nela agachado, com a própria mão tapando o alvo.
   */
  bolaNoChao: 0.3,
  /**
   * Pokédex nas costas: agarre 22 cm → 8 cm. Não alarga mais do que isso: a
   * bolha dela já é a maior do jogo e fica atrás do seu corpo, onde uma banda
   * larga viraria vibração ao encostar a mão no quadril.
   */
  tablet: 0.3,
} as const;
