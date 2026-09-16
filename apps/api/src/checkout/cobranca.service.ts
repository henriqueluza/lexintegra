import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import type { CheckoutIniciado } from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { urlDaAplicacao } from '../outbox/link-de-senha.js';
import {
  ErroDoGateway,
  GATEWAY_PAGAMENTO,
  PagamentosDesligados,
  type GatewayPagamento,
} from '../pagamentos/gateway/gateway.js';
import {
  COLECAO_CHECKOUTS,
  FOLGA_ANTES_DE_APAGAR_MS,
  VALIDADE_CHECKOUT_HOSPEDADO_MS,
  VALIDADE_PIX_SEGUNDOS,
  type CobrancaGravada,
  type DocumentoCheckout,
  type NovaIntencao,
} from './checkout.js';
import { ProdutosNoGateway } from './produtos-no-gateway.js';

/** O que as duas formas de cobranca tem em comum, depois de emitidas. */
interface Emitida {
  readonly gravada: CobrancaGravada;
  /** Epoch em ms. */
  readonly venceEm: number;
}

/**
 * A emissao da cobranca de um checkout ja gravado.
 *
 * SEPARADA DE `CheckoutService` porque o outro lado dela e o gateway, e nao o
 * banco: tudo aqui acontece DEPOIS do commit da intencao, fora de qualquer
 * transacao (regra inviolavel 2). Juntar as duas coisas num servico so e o que
 * convida alguem, um dia, a mover a chamada ao gateway para dentro da transacao
 * "para ficar atomico".
 *
 * DUAS FORMAS, UMA CONFERENCIA (ADR-19). PIX sai pelo checkout transparente, com
 * o QR na propria pagina; cartao sai pelo checkout hospedado, com
 * redirecionamento — o AbacatePay nao processa cartao no transparente. Nas duas,
 * o valor que o gateway registrou e conferido contra o total congelado antes de
 * qualquer coisa chegar a tela.
 */
@Injectable()
export class CobrancaDoCheckout {
  private readonly log = new Logger('Checkout');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
    private readonly produtos: ProdutosNoGateway,
  ) {}

  async cobrar(
    intencao: NovaIntencao,
    agora: number,
  ): Promise<CheckoutIniciado> {
    let emitida: Emitida;
    try {
      emitida =
        intencao.documento.metodo === 'pix'
          ? await this.emitirPix(intencao)
          : await this.emitirCartao(intencao, agora);
    } catch (erro) {
      return this.falhar(intencao.id, erro);
    }

    await this.registrar(intencao.id, emitida);
    return paraResposta(
      intencao.id,
      intencao.documento.totalCentavos,
      emitida.gravada,
    );
  }

  private async emitirPix(intencao: NovaIntencao): Promise<Emitida> {
    const cobranca = await this.gateway.criarCobrancaPix({
      valorCentavos: intencao.documento.totalCentavos,
      externalId: intencao.id,
      /* Hifen, e nao travessao: o gateway recusa o travessao com 400 (ver
       * `texto-do-gateway.ts`). O falso recusa igual, entao isto nao volta. */
      descricao: `LexIntegra - ${String(intencao.documento.itens.length)} servico(s)`,
      expiraEmSegundos: VALIDADE_PIX_SEGUNDOS,
    });
    conferirValor(cobranca.valorCentavos, intencao.documento.totalCentavos);

    const vence = Date.parse(cobranca.expiraEm);
    return {
      gravada: {
        id: cobranca.cobrancaId,
        origem: 'transparente',
        valorCentavos: cobranca.valorCentavos,
        pix: {
          brCode: cobranca.brCode,
          brCodeBase64: cobranca.brCodeBase64,
          expiraEm: cobranca.expiraEm,
        },
        url: null,
      },
      venceEm: Number.isFinite(vence)
        ? vence
        : Date.now() + VALIDADE_PIX_SEGUNDOS * 1000,
    };
  }

  /**
   * O cartao pelo checkout hospedado. O preco sai do produto cadastrado no
   * gateway, que e funcao do snapshot (ver `idDoProdutoNoGateway`) — e o valor
   * total devolvido e conferido do mesmo jeito que o do PIX.
   *
   * A conclusao volta para `/checkout?id=`, onde a tela acompanha o estado. Quem
   * confirma o pagamento continua sendo so o webhook: voltar da pagina do gateway
   * nao prova nada.
   */
  private async emitirCartao(
    intencao: NovaIntencao,
    agora: number,
  ): Promise<Emitida> {
    const itens = await this.produtos.garantir(intencao.documento.itens);
    const base = urlDaAplicacao();

    const checkout = await this.gateway.criarCheckoutHospedado({
      itens,
      externalId: intencao.id,
      urlRetorno: `${base}/checkout`,
      urlConclusao: `${base}/checkout?id=${encodeURIComponent(intencao.id)}`,
    });
    conferirValor(checkout.valorCentavos, intencao.documento.totalCentavos);

    return {
      gravada: {
        id: checkout.cobrancaId,
        origem: 'hospedado',
        valorCentavos: checkout.valorCentavos,
        pix: null,
        url: checkout.url,
      },
      venceEm: agora + VALIDADE_CHECKOUT_HOSPEDADO_MS,
    };
  }

  private async registrar(checkoutId: string, emitida: Emitida): Promise<void> {
    await this.referencia(checkoutId).update({
      estado: 'aguardando_pagamento',
      cobranca: emitida.gravada,
      expiraEm: Timestamp.fromMillis(emitida.venceEm),
      apagarApos: Timestamp.fromMillis(
        emitida.venceEm + FOLGA_ANTES_DE_APAGAR_MS,
      ),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    this.log.log(`checkout ${checkoutId} aguardando pagamento`);
  }

  /**
   * 503 para a pessoa, e o checkout marcado. A retentativa do mesmo carrinho cai
   * no mesmo documento e tenta de novo — e o `externalId` repetido faz o gateway
   * devolver a cobranca, se ela tiver chegado a existir.
   */
  private async falhar(checkoutId: string, erro: unknown): Promise<never> {
    await this.referencia(checkoutId).update({
      estado: 'falhou_cobranca',
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    if (erro instanceof PagamentosDesligados) {
      throw new ServiceUnavailableException(
        'O pagamento esta indisponivel no momento.',
      );
    }
    if (erro instanceof ErroDoGateway) {
      this.log.error(`checkout ${checkoutId}: ${erro.message}`);
      throw new ServiceUnavailableException(
        'Nao foi possivel gerar a cobranca agora. Tente novamente em instantes.',
      );
    }
    throw erro;
  }

  private referencia(checkoutId: string): DocumentReference {
    return this.db.collection(COLECAO_CHECKOUTS).doc(checkoutId);
  }
}

/**
 * O gateway registrou outro valor. A cobranca existe do lado de la, mas NAO chega
 * a tela: mostrar um QR ou uma pagina de valor diferente do congelado seria cobrar
 * outro preco. Ela vence sozinha.
 */
function conferirValor(registrado: number, congelado: number): void {
  if (registrado !== congelado) {
    throw new ErroDoGateway(
      `valor da cobranca (${String(registrado)}) diferente do total congelado ` +
        `(${String(congelado)})`,
    );
  }
}

function paraResposta(
  checkoutId: string,
  totalCentavos: number,
  cobranca: CobrancaGravada,
): CheckoutIniciado {
  if (cobranca.pix !== null) {
    return { checkoutId, metodo: 'pix', totalCentavos, pix: cobranca.pix };
  }
  return {
    checkoutId,
    metodo: 'cartao',
    totalCentavos,
    url: cobranca.url ?? '',
  };
}

/**
 * A retentativa do mesmo carrinho devolve a cobranca que ja existe, se ela ainda
 * puder ser paga. Cobranca vencida, falha anterior ou checkout substituido abrem
 * uma tentativa nova no mesmo documento.
 */
export function cobrancaReaproveitavel(
  checkoutId: string,
  atual: DocumentoCheckout | undefined,
  agora: number,
): CheckoutIniciado | null {
  if (atual?.estado !== 'aguardando_pagamento') return null;
  if (atual.cobranca === null || atual.expiraEm === null) return null;
  if (atual.expiraEm.toMillis() <= agora) return null;

  return paraResposta(checkoutId, atual.totalCentavos, atual.cobranca);
}
