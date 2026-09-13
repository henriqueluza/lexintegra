import { Timestamp, type FieldValue } from 'firebase-admin/firestore';
import type {
  CartaoPedido,
  DemandaResumo,
  EntregavelResumo,
  PedidoParaDistribuir,
  Perfil,
  SnapshotProduto,
} from 'shared';

/**
 * Forma do documento de pedido e as projecoes que cada perfil recebe.
 *
 * Separado do servico pela mesma razao de `entregaveis/entregavel.ts`: tres
 * servicos precisam da forma do documento — criacao, consulta e distribuicao — e
 * se um deles importasse o outro so para saber o formato, haveria ciclo, que o
 * `dependency-cruiser` recusa com severidade `error`.
 */
export const COLECAO_PEDIDOS = 'pedidos';

export const SUBCOLECAO_OBSERVACOES = 'observacoes';
export const SUBCOLECAO_ANEXOS = 'anexos';

export interface DocumentoPedido {
  clienteId: string;
  pagamentoId: string;
  /**
   * SO PARA AUDITORIA. Nenhum caminho de leitura resolve este id para mostrar
   * dado ao cliente — o que a tela mostra vem de `snapshot`. O nome carrega o
   * aviso justamente porque `produtoId` convidaria ao contrario, e a regra
   * inviolavel 5 e sobre isso.
   */
  produtoOrigemId: string;
  snapshot: SnapshotProduto;
  criadoEm: Timestamp | FieldValue;

  /**
   * A distribuicao (itens 2.5.5 a 2.5.7, 2.6.1). `null` ate o administrador
   * atribuir.
   *
   * MORA NO PEDIDO E NAO NO ADVOGADO, e a tabela 5.1 da arquitetura, que lista
   * "atribuicoes" na colecao `advogados`, e um resumo escrito antes de existir a
   * consulta. A consulta que existe de verdade e "quais pedidos sao meus",
   * respondida pelo advogado autenticado a cada abertura de tela. Guardada do
   * lado do advogado, ela seria um array que cresce sem limite dentro de um
   * documento e que precisa ser lido inteiro para filtrar; aqui, e uma igualdade
   * indexada.
   */
  advogadoId: string | null;

  /**
   * Redundante com `advogadoId !== null`, e existe assim mesmo.
   *
   * A caixa de entrada do administrador consulta "o que ainda nao foi
   * distribuido". Igualdade contra `null` no Firestore mistura o campo ausente
   * com o campo nulo, e os pedidos criados antes deste campo existir cairiam do
   * lado errado do filtro sem erro nenhum. Um booleano escrito sempre indexa
   * limpo e nao tem esse estado do meio.
   */
  distribuido: boolean;

  atribuidoEm?: Timestamp | FieldValue;
  atribuidoPor?: string;

  /**
   * Quando TODOS os entregaveis do pedido chegaram a `entregue` — o gatilho da
   * retencao de 30 dias (arquitetura 7.3 e secao 13, decidido na reuniao).
   *
   * `null` enquanto o pedido nao fechou. E escrito pelo fluxo de confirmacao, nao
   * calculado pelo job: varrer todos os pedidos abertos a cada passagem para
   * descobrir quais fecharam seria trabalho proporcional ao total, e nao ao que
   * mudou.
   */
  retencaoEm?: Timestamp | FieldValue | null;
  /**
   * Redundante com `retencaoEm != null`, e existe pela mesma razao de
   * `distribuido`: no Firestore, desigualdade contra `null` exclui o documento em
   * que o campo esta AUSENTE, e todo pedido anterior a este campo cairia fora da
   * varredura do job sem erro nenhum. O sintoma seria arquivo retido para sempre.
   */
  retencaoPendente?: boolean;
  avisoDeExclusaoEnviado?: boolean;
  avisadoEm?: Timestamp | FieldValue;
  arquivosExcluidosEm?: Timestamp | FieldValue;
}

/** ISO 8601, ou `null` enquanto o carimbo do servidor nao materializou. */
export function paraIso(valor: unknown): string | null {
  return valor instanceof Timestamp ? valor.toDate().toISOString() : null;
}

/**
 * O cartao do cliente. NAO carrega `advogadoId` — nao porque a tela nao mostra,
 * mas porque o tipo nao tem onde guardar. Ver a nota em `shared/esquemas/pedido`.
 */
export function paraCartao(
  id: string,
  pedido: DocumentoPedido,
  entregaveis: readonly EntregavelResumo[],
): CartaoPedido {
  return {
    id,
    snapshot: pedido.snapshot,
    entregaveis,
    distribuido: pedido.distribuido,
    criadoEm: paraIso(pedido.criadoEm),
  };
}

/** A demanda do advogado. Carrega o cliente porque o item 2.6.2 pede. */
export function paraDemanda(
  id: string,
  pedido: DocumentoPedido,
  entregaveis: readonly EntregavelResumo[],
  cliente: { uid: string; nome: string },
): DemandaResumo {
  return {
    id,
    snapshot: pedido.snapshot,
    entregaveis,
    cliente,
    criadoEm: paraIso(pedido.criadoEm),
  };
}

/**
 * A linha da caixa de entrada. Leva o NOME do produto e nao o snapshot inteiro:
 * a tela de distribuicao e uma tabela, e mandar nove campos congelados por linha
 * seria transferir o catalogo para escolher um advogado.
 */
export function paraDistribuir(
  id: string,
  pedido: DocumentoPedido,
  cliente: { uid: string; nome: string },
): PedidoParaDistribuir {
  return {
    id,
    produto: pedido.snapshot.nome,
    cliente,
    advogadoId: pedido.advogadoId,
    distribuido: pedido.distribuido,
    criadoEm: paraIso(pedido.criadoEm),
  };
}

/**
 * Quem pode ver e escrever no pedido, num lugar so.
 *
 * As observacoes e os anexos do cartao sao alcancaveis por DOIS perfis — o
 * cliente dono e o advogado atribuido — e o administrador precisa ler os dois
 * para atender ao item 2.5.7. Escrever essa regra dentro de cada servico daria
 * tres copias que divergem na primeira mudanca, e a que divergisse abriria
 * acesso em vez de fechar.
 *
 * `advogadoId === null` recusa TODO advogado, e nao "o primeiro que chegar": um
 * pedido ainda na caixa de entrada nao e de ninguem. O `??` nao aparece aqui
 * porque quem le o documento ja normaliza o campo ausente; ver a nota em
 * `EntregaveisService.ler`.
 */
export function podeAcessarPedido(
  pedido: Pick<DocumentoPedido, 'clienteId' | 'advogadoId'>,
  quem: { readonly uid: string; readonly perfil: Perfil },
): boolean {
  if (quem.perfil === 'admin') return true;
  if (quem.perfil === 'cliente') return pedido.clienteId === quem.uid;
  return pedido.advogadoId !== null && pedido.advogadoId === quem.uid;
}
