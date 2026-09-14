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
import {
  ErroDoGateway,
  GATEWAY_PAGAMENTO,
  PagamentosDesligados,
  type GatewayPagamento,
} from '../pagamentos/gateway/gateway.js';
import {
  COLECAO_CHECKOUTS,
  FOLGA_ANTES_DE_APAGAR_MS,
  VALIDADE_PIX_SEGUNDOS,
  type CobrancaGravada,
  type DocumentoCheckout,
  type NovaIntencao,
} from './checkout.js';

/**
 * A emissao da cobranca de um checkout ja gravado.
 *
 * SEPARADA DE `CheckoutService` porque o outro lado dela e o gateway, e nao o
 * banco: tudo aqui acontece DEPOIS do commit da intencao, fora de qualquer
 * transacao (regra inviolavel 2). Juntar as duas coisas num servico so e o que
 * convida alguem, um dia, a mover a chamada ao gateway para dentro da transacao
 * "para ficar atomico".
 */
@Injectable()
export class CobrancaDoCheckout {
  private readonly log = new Logger('Checkout');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(GATEWAY_PAGAMENTO) private readonly gateway: GatewayPagamento,
  ) {}

  async cobrarPix(
    intencao: NovaIntencao,
    agora: number,
  ): Promise<CheckoutIniciado> {
    const total = intencao.documento.totalCentavos;
    const quantidade = intencao.documento.itens.length;

    let cobranca;
    try {
      cobranca = await this.gateway.criarCobrancaPix({
        valorCentavos: total,
        externalId: intencao.id,
        descricao: `LexIntegra — ${String(quantidade)} servico(s)`,
        expiraEmSegundos: VALIDADE_PIX_SEGUNDOS,
      });
    } catch (erro) {
      return this.falhar(intencao.id, erro);
    }

    /*
     * O gateway registrou outro valor. A cobranca existe do lado de la, mas NAO
     * chega a tela: mostrar um QR de valor diferente do congelado seria cobrar
     * outro preco. Ela vence sozinha em trinta minutos.
     */
    if (cobranca.valorCentavos !== total) {
      return this.falhar(
        intencao.id,
        new ErroDoGateway(
          `valor da cobranca (${String(cobranca.valorCentavos)}) diferente do ` +
            `total congelado (${String(total)})`,
        ),
      );
    }

    const gravada: CobrancaGravada = {
      id: cobranca.cobrancaId,
      origem: 'transparente',
      valorCentavos: cobranca.valorCentavos,
      pix: {
        brCode: cobranca.brCode,
        brCodeBase64: cobranca.brCodeBase64,
        expiraEm: cobranca.expiraEm,
      },
      url: null,
    };
    await this.registrarCobranca(
      intencao.id,
      gravada,
      cobranca.expiraEm,
      agora,
    );

    return {
      checkoutId: intencao.id,
      metodo: 'pix',
      totalCentavos: total,
      pix: gravada.pix as NonNullable<CobrancaGravada['pix']>,
    };
  }

  private async registrarCobranca(
    checkoutId: string,
    cobranca: CobrancaGravada,
    expiraEmIso: string,
    agora: number,
  ): Promise<void> {
    const expiraEm = Date.parse(expiraEmIso);
    const vence = Number.isFinite(expiraEm)
      ? expiraEm
      : agora + VALIDADE_PIX_SEGUNDOS * 1000;

    await this.referencia(checkoutId).update({
      estado: 'aguardando_pagamento',
      cobranca,
      expiraEm: Timestamp.fromMillis(vence),
      apagarApos: Timestamp.fromMillis(vence + FOLGA_ANTES_DE_APAGAR_MS),
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
  const pix = atual.cobranca?.pix ?? null;
  if (pix === null || atual.expiraEm === null) return null;
  if (atual.expiraEm.toMillis() <= agora) return null;

  return {
    checkoutId,
    metodo: 'pix',
    totalCentavos: atual.totalCentavos,
    pix,
  };
}
