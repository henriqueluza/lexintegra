import {
  ErroDoGateway,
  PagamentosDesligados,
  type CheckoutHospedado,
  type CobrancaPix,
  type GatewayPagamento,
  type NovaCobrancaPix,
  type NovoCheckoutHospedado,
  type PedidoDeEstorno,
  type ProdutoNoGateway,
  type ResultadoDoEstorno,
} from './gateway.js';

/** Um PNG de 1x1 transparente: a tela de PIX precisa de uma imagem valida. */
const QR_FALSO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

export interface CobrancaRegistrada {
  readonly cobrancaId: string;
  readonly origem: 'transparente' | 'hospedado';
  readonly externalId: string;
  readonly valorCentavos: number;
  estornada: boolean;
}

/**
 * O gateway em memoria: desenvolvimento, emulador e testes (ADR-19, na forma do
 * `EmailFalsoTransport`).
 *
 * NAO TOCA REDE. E comporta-se como o gateway real nos pontos de que o dominio
 * depende, porque um falso mais generoso que o real esconderia defeitos:
 *
 * - `externalId` repetido devolve a MESMA cobranca, como a idempotencia do
 *   AbacatePay — e o que a retentativa do mesmo carrinho espera.
 * - `garantirProduto` e idempotente por `externalId`.
 * - `estornar` a segunda vez e sucesso com `jaEstornado`, que e o contrato da porta.
 *
 * Os campos publicos existem para o teste inspecionar o que foi pedido.
 */
export class GatewayPagamentoFalso implements GatewayPagamento {
  readonly cobrancas = new Map<string, CobrancaRegistrada>();
  readonly produtos = new Map<string, ProdutoNoGateway & { id: string }>();
  readonly estornos: PedidoDeEstorno[] = [];
  private proximo = 1;
  private falhasPendentes = 0;
  private valorForcado: number | null = null;

  /** As proximas `n` operacoes falham — cobranca, produto ou estorno. */
  falharProximas(n: number): void {
    this.falhasPendentes = n;
  }

  /** O gateway passa a registrar outro valor que o pedido. Ver `CobrancaPix.valorCentavos`. */
  forcarValor(valorCentavos: number | null): void {
    this.valorForcado = valorCentavos;
  }

  async criarCobrancaPix(cobranca: NovaCobrancaPix): Promise<CobrancaPix> {
    this.consumirFalha('cobranca PIX');
    const registrada = this.registrar(
      'transparente',
      cobranca.externalId,
      cobranca.valorCentavos,
    );
    return {
      cobrancaId: registrada.cobrancaId,
      valorCentavos: registrada.valorCentavos,
      brCode: `00020101PIXFALSO${registrada.cobrancaId}`,
      brCodeBase64: QR_FALSO,
      expiraEm: new Date(
        Date.now() + cobranca.expiraEmSegundos * 1000,
      ).toISOString(),
    };
  }

  async garantirProduto(produto: ProdutoNoGateway): Promise<string> {
    this.consumirFalha('produto');
    const existente = this.produtos.get(produto.externalId);
    if (existente !== undefined) return existente.id;

    const id = `prod_falso_${String(this.proximo++)}`;
    this.produtos.set(produto.externalId, { ...produto, id });
    return id;
  }

  async criarCheckoutHospedado(
    checkout: NovoCheckoutHospedado,
  ): Promise<CheckoutHospedado> {
    this.consumirFalha('checkout hospedado');
    const valor = checkout.itens.reduce((soma, item) => {
      const produto = [...this.produtos.values()].find(
        (candidato) => candidato.id === item.produtoGatewayId,
      );
      if (produto === undefined) {
        throw new ErroDoGateway(`produto ${item.produtoGatewayId} inexistente`);
      }
      return soma + produto.precoCentavos * item.quantidade;
    }, 0);

    const registrada = this.registrar('hospedado', checkout.externalId, valor);
    /*
     * Sem pagina de pagamento em desenvolvimento: a "pagina do gateway" e a
     * propria conclusao. O pagamento e simulado assinando um webhook
     * (`scripts/simular-webhook.mjs`).
     */
    return {
      cobrancaId: registrada.cobrancaId,
      valorCentavos: registrada.valorCentavos,
      url: checkout.urlConclusao,
    };
  }

  estornar(pedido: PedidoDeEstorno): Promise<ResultadoDoEstorno> {
    this.estornos.push(pedido);
    if (this.falhasPendentes > 0) {
      this.falhasPendentes -= 1;
      return Promise.resolve({ sucesso: false, motivo: 'falha simulada' });
    }

    const cobranca = this.cobrancas.get(pedido.cobrancaId);
    if (cobranca === undefined) {
      return Promise.resolve({
        sucesso: false,
        motivo: 'cobranca inexistente',
      });
    }
    if (cobranca.estornada) {
      return Promise.resolve({ sucesso: true, jaEstornado: true });
    }
    cobranca.estornada = true;
    return Promise.resolve({ sucesso: true, jaEstornado: false });
  }

  private registrar(
    origem: CobrancaRegistrada['origem'],
    externalId: string,
    valorCentavos: number,
  ): CobrancaRegistrada {
    const existente = [...this.cobrancas.values()].find(
      (cobranca) => cobranca.externalId === externalId,
    );
    if (existente !== undefined) return existente;

    const prefixo = origem === 'transparente' ? 'pix_char_falso' : 'bill_falso';
    const registrada: CobrancaRegistrada = {
      cobrancaId: `${prefixo}_${String(this.proximo++)}`,
      origem,
      externalId,
      valorCentavos: this.valorForcado ?? valorCentavos,
      estornada: false,
    };
    this.cobrancas.set(registrada.cobrancaId, registrada);
    return registrada;
  }

  private consumirFalha(oQue: string): void {
    if (this.falhasPendentes === 0) return;
    this.falhasPendentes -= 1;
    throw new ErroDoGateway(`${oQue}: falha simulada`);
  }
}

/**
 * `PAGAMENTOS_MODO=desligado`. Todo metodo de COBRANCA lanca; o estorno reporta
 * falha em vez de lancar, porque e o contrato da porta — e o outbox registra a
 * falha e tenta de novo quando o modo mudar.
 */
export class GatewayPagamentoDesligado implements GatewayPagamento {
  criarCobrancaPix(): Promise<CobrancaPix> {
    return Promise.reject(new PagamentosDesligados());
  }

  garantirProduto(): Promise<string> {
    return Promise.reject(new PagamentosDesligados());
  }

  criarCheckoutHospedado(): Promise<CheckoutHospedado> {
    return Promise.reject(new PagamentosDesligados());
  }

  estornar(): Promise<ResultadoDoEstorno> {
    return Promise.resolve({
      sucesso: false,
      motivo: new PagamentosDesligados().message,
    });
  }
}
