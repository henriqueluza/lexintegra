/**
 * A retencao de 30 dias dos entregaveis E DOS ANEXOS do cliente (arquitetura 7.3
 * e secao 13; `docs/decisoes.md`, 2.2 e 2.3).
 *
 * O GATILHO E O ESTADO DO PEDIDO, NAO A IDADE DO OBJETO. Foi decidido na reuniao
 * que o "fim do contrato", para efeito de contagem, e o momento em que TODOS os
 * entregaveis do pedido chegam a `entregue` (ADR-11). Por isso a regra nativa de
 * ciclo de vida do Cloud Storage nao basta sozinha: ela so conhece a idade do
 * objeto, e um pedido com quatro entregaveis entregues em datas diferentes tem
 * uma data de corte so.
 *
 * O PONTO DE PARTIDA FOI CONFIRMADO (decisoes.md, 2.2): 30 dias a partir de
 * `entregue` — o momento em que o ULTIMO entregavel do pedido chega la.
 *
 * O AVISO VEM ANTES DA EXCLUSAO, e nao junto. A secao 13 e explicita: "disparar o
 * aviso antes de executar a exclusao de fato — nao simultaneamente". Sao duas
 * passagens do mesmo job, em dias diferentes.
 */

/** Dias de disponibilidade do entregavel, a partir de `entregue`. */
export const DIAS_DE_RETENCAO = 30;

/**
 * Quantos dias antes da exclusao o titular e avisado.
 *
 * Sete dias porque o aviso precisa caber numa semana de trabalho: avisar na
 * sexta com exclusao na segunda da ao cliente um fim de semana, o que na pratica
 * e nao avisar.
 */
export const DIAS_DE_AVISO_PREVIO = 7;

const MS_POR_DIA = 86_400_000;

/**
 * O instante em que os arquivos do pedido podem ser excluidos.
 *
 * `null` quando o pedido ainda nao fechou — e a resposta certa para "quando
 * excluir?" de um pedido em andamento, e evita que quem chama tenha que
 * inventar uma data no futuro distante para dizer "nunca".
 */
export function excluirEm(entregueEm: Date | null): Date | null {
  if (entregueEm === null) return null;
  return new Date(entregueEm.getTime() + DIAS_DE_RETENCAO * MS_POR_DIA);
}

export function avisarEm(entregueEm: Date | null): Date | null {
  const exclusao = excluirEm(entregueEm);
  if (exclusao === null) return null;
  return new Date(exclusao.getTime() - DIAS_DE_AVISO_PREVIO * MS_POR_DIA);
}

/**
 * O que o job de retencao deve fazer com este pedido, agora.
 *
 * Uma funcao pura decidindo, e nao `if`s espalhados pelo job: a aritmetica de
 * data e onde esse tipo de rotina erra, e erra em silencio — excluir cedo demais
 * apaga arquivo que o cliente ainda podia baixar, e tarde demais deixa dado
 * pessoal em repouso alem do combinado.
 *
 * `nada` cobre dois casos distintos de proposito: o pedido que ainda nao fechou e
 * o que ja foi avisado e ainda nao venceu. Quem chama nao precisa distinguir os
 * dois — em ambos, nao ha o que fazer nesta passagem.
 */
export type AcaoDeRetencao = 'nada' | 'avisar' | 'excluir';

export function acaoDeRetencao(
  retencaoEm: Date | null,
  avisadoEm: Date | null,
  agora: Date,
): AcaoDeRetencao {
  const exclusao = excluirEm(retencaoEm);
  const aviso = avisarEm(retencaoEm);
  if (exclusao === null || aviso === null) return 'nada';

  /*
   * NUNCA EXCLUI SEM AVISO. Um pedido que o job so viu depois do 30o dia — job
   * parado, pedido fechado antes deste campo existir — e avisado PRIMEIRO, e a
   * exclusao fica para sete dias depois do aviso. Excluir na mesma passagem
   * seria o "simultaneamente" que a secao 13 proibe.
   */
  if (avisadoEm === null) {
    return agora.getTime() >= aviso.getTime() ? 'avisar' : 'nada';
  }

  const depoisDoAviso = avisadoEm.getTime() + DIAS_DE_AVISO_PREVIO * MS_POR_DIA;
  const efetiva = Math.max(exclusao.getTime(), depoisDoAviso);
  return agora.getTime() >= efetiva ? 'excluir' : 'nada';
}

/**
 * Quantos dias faltam para a exclusao, para o texto do e-mail de aviso.
 *
 * Arredonda para CIMA: dizer "faltam 7 dias" quando faltam 6,4 e melhor do que
 * dizer 6 e o arquivo sumir no setimo — o titular precisa de um numero que nao
 * o surpreenda para menos.
 */
export function diasAteExcluir(entregueEm: Date | null, agora: Date): number {
  const exclusao = excluirEm(entregueEm);
  if (exclusao === null) return DIAS_DE_RETENCAO;

  const restante = exclusao.getTime() - agora.getTime();
  return Math.max(0, Math.ceil(restante / MS_POR_DIA));
}
