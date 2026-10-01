import type { EstadoEntregavel } from './estado-entregavel.js';
import { reuniaoAtiva, type EstadoReuniao } from './estado-reuniao.js';

/**
 * A situacao do PEDIDO, e as regras de estorno e cancelamento do ADR-12.
 *
 * NAO E O ESTADO DO ENTREGAVEL. Os quatro estados do ADR-11 dizem em que ponto
 * esta o trabalho em cada entregavel; a situacao diz se o pedido ainda vale. Sao
 * perguntas diferentes, e um pedido cancelado tem entregaveis parados em
 * `solicitado` para sempre — que e exatamente o que o torna cancelavel.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: o cartao do cliente usa `podeCancelar` para
 * decidir se mostra o botao. A decisao que vale e a do servidor, que usa as MESMAS
 * funcoes dentro da transacao.
 */

export const SITUACOES_PEDIDO = ['ativo', 'cancelado', 'estornado'] as const;

export type SituacaoPedido = (typeof SITUACOES_PEDIDO)[number];

/**
 * "Trabalho iniciado" e o que o ADR-12 usa para separar o que pode ser desfeito
 * do que nao pode: "a partir do momento em que o status avanca para
 * `em_elaboracao`, o pedido deixa de ser elegivel a estorno".
 *
 * TODOS os entregaveis precisam estar em `solicitado`. Um pedido de dois
 * entregaveis com um deles em elaboracao ja e servico personalizado em execucao.
 * Lista vazia NAO conta como sem trabalho: um pedido sem entregavel e documento
 * corrompido, e o que se faz com ele e olhar, e nao devolver dinheiro.
 */
export function semTrabalhoIniciado(
  estados: readonly EstadoEntregavel[],
): boolean {
  return (
    estados.length > 0 && estados.every((estado) => estado === 'solicitado')
  );
}

/**
 * O que a elegibilidade de estorno e de cancelamento precisa saber do pedido.
 *
 * As reunioes entram com estado e inicio, e nada mais: a regra nova da B2
 * (`docs/decisoes.md`, 3.3) e "nenhuma reuniao com inicio ja passado", e reuniao
 * futura NAO bloqueia — ela e cancelada junto com o pedido.
 */
export interface PedidoParaElegibilidade {
  readonly situacao: SituacaoPedido;
  readonly estados: readonly EstadoEntregavel[];
  readonly reunioes: readonly {
    readonly estado: EstadoReuniao;
    readonly inicio: string;
  }[];
  /** Contestacao (chargeback) aberta: o pedido esta pausado (decisoes.md, 5.4). */
  readonly contestacaoAberta: boolean;
  /** Milissegundos, do relogio do servidor (ou da tela, so para mostrar botao). */
  readonly agora: number;
}

/**
 * Por que o pedido NAO pode ser estornado ou cancelado. A recusa diz qual
 * condicao falhou (decisoes.md, 3.3), e e por isso que isto e um motivo e nao
 * um booleano.
 *
 * - `situacao`: estornado (ou cancelado, para o cancelamento);
 * - `trabalho-iniciado`: algum entregavel saiu de `solicitado` — que e tambem o
 *   unico jeito de existir entregavel ENVIADO pelo advogado, porque o upload so
 *   acontece em `em_elaboracao` (`EntregaveisService.registrarArquivo`);
 * - `reuniao-realizada`: alguma reuniao ativa ja comecou (realizada ou nao
 *   comparecimento — a plataforma nao distingue, ADR-21 decisao 4);
 * - `contestacao-aberta`: o pedido esta pausado por chargeback.
 *
 * Anexos enviados PELO CLIENTE nao bloqueiam: sao documentacao de entrada, nao
 * trabalho feito.
 */
export type ImpedimentoDoPedido =
  'situacao' | 'trabalho-iniciado' | 'reuniao-realizada' | 'contestacao-aberta';

export const MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO: Readonly<
  Record<ImpedimentoDoPedido, string>
> = {
  situacao: 'Este pedido já foi cancelado ou estornado.',
  'trabalho-iniciado':
    'O trabalho deste pedido já começou: há documento em elaboração ou enviado.',
  'reuniao-realizada': 'Este pedido já teve reunião realizada.',
  'contestacao-aberta':
    'Este pedido está pausado por uma contestação do pagamento.',
};

function reuniaoJaComecou(
  reuniao: PedidoParaElegibilidade['reunioes'][number],
  agora: number,
): boolean {
  return reuniaoAtiva(reuniao.estado) && Date.parse(reuniao.inicio) <= agora;
}

/**
 * As tres condicoes da decisao 3.3, na ordem em que o motivo aparece. A
 * contestacao vem primeiro: com o pedido pausado, nenhuma outra resposta e
 * util, porque nada no pedido muda ate ela terminar.
 */
function impedimentoComum(
  pedido: PedidoParaElegibilidade,
): ImpedimentoDoPedido | null {
  if (pedido.contestacaoAberta) return 'contestacao-aberta';
  if (!semTrabalhoIniciado(pedido.estados)) return 'trabalho-iniciado';
  if (pedido.reunioes.some((r) => reuniaoJaComecou(r, pedido.agora))) {
    return 'reuniao-realizada';
  }
  return null;
}

/**
 * O administrador estorna: pedido ativo OU cancelado, e as tres condicoes de
 * `impedimentoComum`. O cancelado entra porque cancelar e estornar sao atos
 * distintos — quem cancelou e depois pediu o dinheiro de volta ao escritorio
 * precisa poder ser estornado.
 */
export function impedimentoDoEstorno(
  pedido: PedidoParaElegibilidade,
): ImpedimentoDoPedido | null {
  if (pedido.situacao === 'estornado') return 'situacao';
  return impedimentoComum(pedido);
}

/**
 * O cliente cancela (ADR-12, "cancelamento sem estorno"): so o pedido ativo, e
 * as MESMAS tres condicoes do estorno (regra inviolavel 15; decisoes.md, Anexo
 * B). Cancelar nao devolve dinheiro — a devolucao e o estorno, que e acao do
 * administrador.
 */
export function impedimentoDoCancelamento(
  pedido: PedidoParaElegibilidade,
): ImpedimentoDoPedido | null {
  if (pedido.situacao !== 'ativo') return 'situacao';
  return impedimentoComum(pedido);
}

export function podeCancelar(pedido: PedidoParaElegibilidade): boolean {
  return impedimentoDoCancelamento(pedido) === null;
}

export function podeEstornar(pedido: PedidoParaElegibilidade): boolean {
  return impedimentoDoEstorno(pedido) === null;
}

/**
 * As reunioes que o cancelamento ou o estorno do pedido cancelam junto: as
 * ATIVAS que ainda nao comecaram. Uma reuniao ativa que ja comecou nao chega
 * aqui — ela impede a operacao.
 */
export function reunioesACancelarJunto<
  R extends PedidoParaElegibilidade['reunioes'][number],
>(reunioes: readonly R[], agora: number): R[] {
  return reunioes.filter(
    (r) => reuniaoAtiva(r.estado) && Date.parse(r.inicio) > agora,
  );
}

/**
 * Como a devolucao do dinheiro acontece (ADR-12, errata da Etapa 8).
 *
 * O AbacatePay so estorna a COBRANCA INTEIRA, e um carrinho de dois produtos e
 * uma cobranca so. Por isso:
 *
 * - `manual_pendente`: o estorno de um pedido isolado e registrado aqui, e o
 *   escritorio devolve o valor por fora do gateway.
 * - `manual_executado`: o administrador registrou que devolveu.
 * - `gateway_pendente`: todos os pedidos da cobranca foram estornados, e o estorno
 *   integral foi pedido ao gateway pelo outbox.
 * - `gateway_confirmado`: o gateway confirmou pelo webhook.
 * - `contestacao`: a contestacao (chargeback) foi perdida e o dinheiro voltou
 *   ao cliente pelo meio de pagamento. Nao ha devolucao a fazer, nem manual nem
 *   pelo gateway (decisoes.md, 5.4).
 */
export const EXECUCOES_ESTORNO = [
  'manual_pendente',
  'manual_executado',
  'gateway_pendente',
  'gateway_confirmado',
  'contestacao',
] as const;

export type ExecucaoEstorno = (typeof EXECUCOES_ESTORNO)[number];
