/**
 * A porta do gateway de pagamento (Etapa 8, ADR-19).
 *
 * ESTE ARQUIVO E SO O CONTRATO, na mesma forma do `EmailTransport` (ADR-07.1) e
 * do `Armazenamento` (ADR-17): o AbacatePay e configuracao, nao decisao
 * estrutural. Tres implementacoes cabem atras dele — o adaptador do AbacatePay,
 * o falso em memoria (desenvolvimento e testes) e o desligado (producao antes da
 * liberacao).
 *
 * O QUE NAO PODE VAZAR PARA DENTRO DE UMA IMPLEMENTACAO:
 *
 * - Nenhuma decisao de retentativa. Cobranca que falha e reportada; quem decide
 *   tentar de novo e a pessoa, no checkout, ou o outbox, no estorno integral.
 * - Nenhuma regra de negocio. O gateway nao sabe o que e pedido, snapshot ou
 *   elegibilidade de estorno — recebe valores e ids, devolve valores e ids.
 *
 * REGRA INVIOLAVEL 2: nenhum metodo daqui e chamado dentro de transacao do
 * Firestore. Transacao e reexecutada sob contencao, e uma cobranca criada duas
 * vezes e dinheiro cobrado duas vezes.
 */

export const GATEWAY_PAGAMENTO = Symbol('GATEWAY_PAGAMENTO');

/**
 * Por onde a cobranca foi criada. O estorno precisa saber, porque o AbacatePay
 * tem um endpoint de estorno para cada: o PIX transparente e o checkout
 * hospedado (usado pelo cartao) nao compartilham rota.
 */
export type OrigemDaCobranca = 'transparente' | 'hospedado';

export interface NovaCobrancaPix {
  readonly valorCentavos: number;
  /** O id do checkout. E por ele que o webhook encontra a intencao de compra. */
  readonly externalId: string;
  readonly descricao: string;
  readonly expiraEmSegundos: number;
}

export interface CobrancaPix {
  readonly cobrancaId: string;
  /**
   * O valor que o GATEWAY registrou. Quem cria a cobranca confere contra o total
   * congelado: uma divergencia aqui e o gateway cobrando outro valor, e isso nao
   * pode chegar ate a tela de pagamento.
   */
  readonly valorCentavos: number;
  /** Codigo copia-e-cola. */
  readonly brCode: string;
  /** Imagem do QR code, ja como data URI. */
  readonly brCodeBase64: string;
  /** ISO 8601. */
  readonly expiraEm: string;
}

/**
 * Um produto no gateway, para o checkout hospedado.
 *
 * O checkout hospedado do AbacatePay cobra por PRODUTOS cadastrados nele, e o
 * preco sai do cadastro — nao da chamada. Por isso o produto no gateway e funcao
 * do SNAPSHOT e nao do produto vivo: o `externalId` carrega o hash do preco e do
 * nome congelados, entao alterar o catalogo cria outro produto no gateway em vez
 * de mudar o preco de uma cobranca que ja existe (regra inviolavel 5).
 */
export interface ProdutoNoGateway {
  readonly externalId: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
}

export interface NovoCheckoutHospedado {
  readonly itens: readonly {
    readonly produtoGatewayId: string;
    readonly quantidade: number;
  }[];
  readonly externalId: string;
  /** Para onde o botao "voltar" da pagina do gateway leva. */
  readonly urlRetorno: string;
  /** Para onde o gateway manda a pessoa depois de pagar. */
  readonly urlConclusao: string;
}

export interface CheckoutHospedado {
  readonly cobrancaId: string;
  readonly valorCentavos: number;
  readonly url: string;
}

export interface PedidoDeEstorno {
  readonly cobrancaId: string;
  readonly origem: OrigemDaCobranca;
  readonly motivo: string;
}

/**
 * `jaEstornado` distingue "estornei agora" de "ja estava estornado", e OS DOIS
 * SAO SUCESSO. E o contrato que torna o estorno integral idempotente: o outbox
 * pode reentregar o evento se a baixa falhar depois de o gateway ja ter
 * devolvido o dinheiro, e a segunda chamada nao pode virar erro — nem, pior,
 * estorno duplo.
 */
export type ResultadoDoEstorno =
  | { readonly sucesso: true; readonly jaEstornado: boolean }
  | { readonly sucesso: false; readonly motivo: string };

export interface GatewayPagamento {
  criarCobrancaPix(cobranca: NovaCobrancaPix): Promise<CobrancaPix>;
  /** Devolve o id do produto no gateway, criando so se ainda nao existir. */
  garantirProduto(produto: ProdutoNoGateway): Promise<string>;
  criarCheckoutHospedado(
    checkout: NovoCheckoutHospedado,
  ): Promise<CheckoutHospedado>;
  /** NUNCA lanca: reporta. Quem decide reentregar e o outbox (ADR-03). */
  estornar(pedido: PedidoDeEstorno): Promise<ResultadoDoEstorno>;
}

/**
 * Falha do gateway ao criar cobranca ou produto. O checkout traduz em 503: a
 * pessoa tenta de novo, e a retentativa do mesmo carrinho e segura (ver
 * `CheckoutService`).
 *
 * `motivo` nunca carrega a chave nem dado do comprador.
 */
export class ErroDoGateway extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ErroDoGateway';
  }
}

/** `PAGAMENTOS_MODO=desligado`. O checkout traduz em 503. */
export class PagamentosDesligados extends Error {
  constructor() {
    super('Pagamentos desligados neste ambiente (PAGAMENTOS_MODO=desligado).');
    this.name = 'PagamentosDesligados';
  }
}
