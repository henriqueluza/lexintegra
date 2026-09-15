import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ALERTAS, type CanalDeAlerta } from '../alertas/alerta.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  COLECAO_PAGAMENTOS,
  type DocumentoPagamento,
} from '../pagamentos/pagamento.js';
import { COLECAO_ESTORNOS, type DocumentoEstorno } from './estorno.js';

export type ResultadoDoEstornoConfirmado =
  'confirmado' | 'duplicata' | 'externo' | 'ignorado';

/**
 * O webhook `*.refunded`: o gateway confirmou que devolveu a cobranca inteira.
 *
 * IDEMPOTENTE. O evento repetido para um pagamento ja marcado `confirmado` e
 * duplicata: nenhuma escrita, 200. A marca e lida e escrita na mesma transacao,
 * entao duas entregas concorrentes nao confirmam duas vezes.
 *
 * ESTORNO FEITO FORA DA PLATAFORMA — pelo painel do AbacatePay, por exemplo —
 * chega aqui sem estorno integral solicitado. O pagamento e marcado, e sai alerta
 * de aviso: os pedidos continuam ativos, e alguem precisa decidir o que fazer com
 * eles. Nada aqui muda a situacao de pedido sozinho.
 */
@Injectable()
export class ConfirmacaoDeEstornoService {
  private readonly log = new Logger('Estornos');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
  ) {}

  async confirmar(cobrancaId: string): Promise<ResultadoDoEstornoConfirmado> {
    const resultado = await this.db.runTransaction(async (transacao) => {
      const referencia = this.db.collection(COLECAO_PAGAMENTOS).doc(cobrancaId);
      const pagamento = (await transacao.get(referencia)).data() as
        DocumentoPagamento | undefined;
      if (pagamento === undefined) return 'ignorado' as const;
      if (pagamento.estornoGateway === 'confirmado')
        return 'duplicata' as const;

      const estornos = await transacao.get(
        this.db
          .collection(COLECAO_ESTORNOS)
          .where('pagamentoId', '==', cobrancaId),
      );
      for (const estorno of estornos.docs) {
        const dados = estorno.data() as DocumentoEstorno;
        if (dados.execucao !== 'gateway_pendente') continue;
        transacao.update(estorno.ref, {
          execucao: 'gateway_confirmado',
          executadoEm: FieldValue.serverTimestamp(),
        });
      }
      transacao.update(referencia, { estornoGateway: 'confirmado' });

      return pagamento.estornoGateway === 'solicitado'
        ? ('confirmado' as const)
        : ('externo' as const);
    });

    this.relatar(cobrancaId, resultado);
    return resultado;
  }

  private relatar(
    cobrancaId: string,
    resultado: ResultadoDoEstornoConfirmado,
  ): void {
    if (resultado === 'confirmado') {
      this.log.log(`estorno integral da cobranca ${cobrancaId} confirmado`);
      return;
    }
    if (resultado === 'externo' || resultado === 'ignorado') {
      this.alertas.emitir({
        nivel: 'aviso',
        assunto: `pagamento.estorno-${resultado}`,
        detalhe: `estorno da cobranca ${cobrancaId} confirmado pelo gateway sem pedido de estorno integral na plataforma`,
      });
    }
  }
}
