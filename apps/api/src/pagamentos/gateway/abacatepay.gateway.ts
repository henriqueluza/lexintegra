import { z } from 'zod';
import {
  ErroDoGateway,
  type CheckoutHospedado,
  type CobrancaPix,
  type GatewayPagamento,
  type NovaCobrancaPix,
  type NovoCheckoutHospedado,
  type PedidoDeEstorno,
  type ProdutoNoGateway,
  type ResultadoDoEstorno,
} from './gateway.js';

/**
 * Adaptador do AbacatePay, API v2 (ADR-19).
 *
 * `fetch` e nao SDK. O SDK oficial e mais uma dependencia de producao para quatro
 * chamadas HTTP, e esconderia justamente o que este arquivo precisa ver: o
 * `devMode` de cada resposta.
 *
 * TODA RESPOSTA E VALIDADA. O formato veio da documentacao e ainda nao foi
 * conferido contra o sandbox de verdade (roteiro em
 * `docs/runbooks/checkout-sandbox.md`). Um campo que mude de nome tem que falhar
 * aqui, com mensagem, e nao virar `undefined` numa tela de pagamento.
 *
 * SO A FABRICA IMPORTA ESTE ARQUIVO — regra de dependency-cruiser
 * `so-a-fabrica-conhece-o-abacatepay`.
 */

const BASE_PADRAO = 'https://api.abacatepay.com/v2';
const TIMEOUT_PADRAO_MS = 15_000;
const MOTIVO_MAXIMO = 300;

export interface OpcoesAbacatePay {
  readonly base?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** Ver `ConfiguracaoPagamentos.devModeEsperado`. */
  readonly devModeEsperado: boolean;
}

/** O envelope de toda resposta do AbacatePay. */
const envelope = z.object({
  data: z.unknown(),
  success: z.boolean().optional(),
  error: z.unknown().optional(),
});

const respostaPix = z.object({
  id: z.string().min(1),
  amount: z.int(),
  brCode: z.string().min(1),
  brCodeBase64: z.string().min(1),
  expiresAt: z.string().min(1),
  devMode: z.boolean(),
});

const respostaCheckout = z.object({
  id: z.string().min(1),
  amount: z.int(),
  url: z.url(),
  devMode: z.boolean(),
});

const respostaProduto = z.object({ id: z.string().min(1) });

const respostaListaProdutos = z.array(
  z.object({ id: z.string().min(1), externalId: z.string().nullish() }),
);

const respostaSituacao = z.object({
  status: z.string(),
  devMode: z.boolean().optional(),
});

type Chamada =
  | { readonly ok: true; readonly dados: unknown }
  | { readonly ok: false; readonly motivo: string };

export class AbacatePayGateway implements GatewayPagamento {
  private readonly base: string;
  private readonly executar: typeof fetch;
  private readonly timeoutMs: number;
  private readonly devModeEsperado: boolean;

  constructor(
    private readonly chave: string,
    opcoes: OpcoesAbacatePay,
  ) {
    this.base = opcoes.base ?? BASE_PADRAO;
    this.executar = opcoes.fetch ?? fetch;
    this.timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
    this.devModeEsperado = opcoes.devModeEsperado;
  }

  /**
   * PIX transparente. Sem objeto `customer`, de proposito: ele e opcional para
   * PIX, e enviado exigiria nome, CPF, e-mail e celular juntos. O checkout nao
   * coleta CPF nem telefone (minimizacao, arquitetura secao 13), e a conferencia
   * da documentacao confirmou que o gateway emite a cobranca sem eles.
   */
  async criarCobrancaPix(cobranca: NovaCobrancaPix): Promise<CobrancaPix> {
    const dados = this.exigir(
      await this.chamar('POST', '/transparents/create', {
        method: 'PIX',
        data: {
          amount: cobranca.valorCentavos,
          description: cobranca.descricao,
          expiresIn: cobranca.expiraEmSegundos,
          externalId: cobranca.externalId,
          metadata: { checkoutId: cobranca.externalId },
        },
      }),
      respostaPix,
      'cobranca PIX',
    );
    this.conferirDevMode(dados.devMode);

    return {
      cobrancaId: dados.id,
      valorCentavos: dados.amount,
      brCode: dados.brCode,
      brCodeBase64: dados.brCodeBase64,
      expiraEm: dados.expiresAt,
    };
  }

  /**
   * Procura antes de criar, e procura DE NOVO se a criacao falhar. O AbacatePay
   * recusa `externalId` repetido, e dois checkouts simultaneos com o mesmo
   * snapshot novo disputam a criacao: o perdedor recebe erro, e o produto que ele
   * queria ja existe.
   */
  async garantirProduto(produto: ProdutoNoGateway): Promise<string> {
    const existente = await this.procurarProduto(produto.externalId);
    if (existente !== null) return existente;

    const criado = await this.chamar('POST', '/products/create', {
      externalId: produto.externalId,
      name: produto.nome,
      description: produto.descricao,
      price: produto.precoCentavos,
      currency: 'BRL',
    });
    if (criado.ok) {
      return this.exigir(criado, respostaProduto, 'produto').id;
    }

    const aposDisputa = await this.procurarProduto(produto.externalId);
    if (aposDisputa !== null) return aposDisputa;
    throw new ErroDoGateway(`criacao de produto recusada: ${criado.motivo}`);
  }

  /** So cartao: o PIX vai pelo transparente, sem redirecionamento (ADR-19). */
  async criarCheckoutHospedado(
    checkout: NovoCheckoutHospedado,
  ): Promise<CheckoutHospedado> {
    const dados = this.exigir(
      await this.chamar('POST', '/checkouts/create', {
        items: checkout.itens.map((item) => ({
          id: item.produtoGatewayId,
          quantity: item.quantidade,
        })),
        methods: ['CARD'],
        externalId: checkout.externalId,
        returnUrl: checkout.urlRetorno,
        completionUrl: checkout.urlConclusao,
        metadata: { checkoutId: checkout.externalId },
      }),
      respostaCheckout,
      'checkout hospedado',
    );
    this.conferirDevMode(dados.devMode);

    return {
      cobrancaId: dados.id,
      valorCentavos: dados.amount,
      url: dados.url,
    };
  }

  /**
   * Estorno INTEGRAL — o AbacatePay nao faz parcial.
   *
   * IDEMPOTENTE POR CONTRATO. Se o pedido de estorno for recusado, a situacao da
   * cobranca e consultada: `REFUNDED` e sucesso com `jaEstornado`. E o que torna
   * seguro o outbox reentregar o evento depois de o gateway ja ter devolvido o
   * dinheiro. Consultar a situacao, em vez de reconhecer a mensagem de erro, e
   * deliberado: o texto do erro nao esta documentado, a situacao esta.
   */
  async estornar(pedido: PedidoDeEstorno): Promise<ResultadoDoEstorno> {
    try {
      const rota =
        pedido.origem === 'transparente'
          ? '/transparents/refund'
          : '/checkouts/refund';
      const resposta = await this.chamar('POST', rota, {
        id: pedido.cobrancaId,
        reason: pedido.motivo.slice(0, 500),
      });
      if (resposta.ok) return { sucesso: true, jaEstornado: false };

      const situacao = await this.situacao(pedido);
      if (situacao === 'REFUNDED') return { sucesso: true, jaEstornado: true };
      return { sucesso: false, motivo: resposta.motivo };
    } catch (erro) {
      return { sucesso: false, motivo: descrever(erro) };
    }
  }

  private async situacao(pedido: PedidoDeEstorno): Promise<string | null> {
    const rota =
      pedido.origem === 'transparente'
        ? '/transparents/check'
        : '/checkouts/get';
    const resposta = await this.chamar(
      'GET',
      `${rota}?id=${encodeURIComponent(pedido.cobrancaId)}`,
    );
    if (!resposta.ok) return null;
    const lido = respostaSituacao.safeParse(resposta.dados);
    if (!lido.success) return null;
    if (lido.data.devMode !== undefined)
      this.conferirDevMode(lido.data.devMode);
    return lido.data.status;
  }

  private async procurarProduto(externalId: string): Promise<string | null> {
    const resposta = await this.chamar(
      'GET',
      `/products/list?externalId=${encodeURIComponent(externalId)}`,
    );
    if (!resposta.ok) return null;
    const lista = respostaListaProdutos.safeParse(resposta.dados);
    if (!lista.success) return null;
    return (
      lista.data.find((produto) => produto.externalId === externalId)?.id ??
      null
    );
  }

  /**
   * UMA chamada. Falha de rede, timeout, HTTP de erro e `success: false` viram o
   * mesmo `{ ok: false }` com motivo — quem decide o que fazer e o metodo.
   *
   * A CHAVE NUNCA ENTRA NO MOTIVO. O motivo vai para log e, no estorno, para o
   * painel do administrador.
   */
  private async chamar(
    metodo: 'GET' | 'POST',
    caminho: string,
    corpo?: unknown,
  ): Promise<Chamada> {
    let resposta: Response;
    try {
      resposta = await this.executar(`${this.base}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${this.chave}`,
          ...(corpo === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      return {
        ok: false,
        motivo: `sem resposta do gateway: ${descrever(erro)}`,
      };
    }

    let bruto: unknown;
    try {
      bruto = await resposta.json();
    } catch {
      return { ok: false, motivo: `HTTP ${String(resposta.status)} sem JSON` };
    }

    const lido = envelope.safeParse(bruto);
    if (!lido.success) {
      return {
        ok: false,
        motivo: `HTTP ${String(resposta.status)} fora do envelope`,
      };
    }
    if (!resposta.ok || lido.data.success === false) {
      /*
       * O texto do erro vem do gateway, e um gateway que ecoe o cabecalho recebido
       * poria a chave no motivo. Ela e trocada antes de sair daqui.
       */
      const erro =
        typeof lido.data.error === 'string'
          ? lido.data.error.replaceAll(this.chave, '[chave]')
          : 'sem detalhe';
      return {
        ok: false,
        motivo: `HTTP ${String(resposta.status)}: ${erro}`.slice(
          0,
          MOTIVO_MAXIMO,
        ),
      };
    }
    return { ok: true, dados: lido.data.data };
  }

  private exigir<T>(chamada: Chamada, esquema: z.ZodType<T>, oQue: string): T {
    if (!chamada.ok) {
      throw new ErroDoGateway(`${oQue} recusado(a): ${chamada.motivo}`);
    }
    const lido = esquema.safeParse(chamada.dados);
    if (!lido.success) {
      throw new ErroDoGateway(
        `${oQue}: resposta fora do formato esperado (${lido.error.issues
          .map((issue) => issue.path.join('.'))
          .join(', ')})`,
      );
    }
    return lido.data;
  }

  /**
   * A segunda metade da trava contra producao (a primeira e a chave, em
   * `modo.ts`). Se o gateway disser que a cobranca e real num processo que so
   * aceita sandbox, a resposta e descartada antes de chegar a qualquer tela.
   */
  private conferirDevMode(devMode: boolean): void {
    if (devMode !== this.devModeEsperado) {
      throw new ErroDoGateway(
        `resposta com devMode=${String(devMode)}, esperado ` +
          `${String(this.devModeEsperado)}. Descartada.`,
      );
    }
  }
}

function descrever(erro: unknown): string {
  return (erro instanceof Error ? erro.message : String(erro)).slice(
    0,
    MOTIVO_MAXIMO,
  );
}
