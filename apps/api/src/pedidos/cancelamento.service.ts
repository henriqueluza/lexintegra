import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { podeCancelar, type SituacaoPedido } from 'shared';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { COLECAO_PEDIDOS, situacaoDe, type DocumentoPedido } from './pedido.js';

/**
 * O cancelamento pelo cliente (ADR-12, "cancelamento sem estorno").
 *
 * AFETA SO AQUELE PEDIDO. A conta do cliente continua ativa, a claim fica como
 * esta, e os outros pedidos — inclusive os da mesma cobranca — nao sao tocados:
 * pedidos sao unidades independentes (ADR-04, arquitetura 5.4). A transacao le e
 * escreve UM pedido e mais nada, e o teste de integracao confere o resto intacto.
 *
 * NAO DEVOLVE DINHEIRO. Devolucao e estorno, e estorno e acao do administrador
 * (decidido na Etapa 8). O pedido cancelado continua estornavel, pelo painel.
 *
 * SO SEM TRABALHO INICIADO, validado AQUI, dentro da transacao — a mesma funcao
 * `podeCancelar` que a tela usa para mostrar o botao. Com um entregavel em
 * elaboracao, a resposta e 409.
 *
 * Pedido de OUTRO cliente responde 404, e nao 403: um 403 confirmaria que o id
 * existe (a mesma decisao da area do cliente, Etapa 9).
 */
@Injectable()
export class CancelamentoService {
  private readonly log = new Logger('Pedidos');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async cancelar(
    pedidoId: string,
    clienteUid: string,
  ): Promise<{ situacao: SituacaoPedido }> {
    await this.db.runTransaction(async (transacao) => {
      const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
      const documento = await transacao.get(referencia);
      const pedido = documento.data() as DocumentoPedido | undefined;
      if (pedido === undefined || pedido.clienteId !== clienteUid) {
        throw new NotFoundException('Pedido nao encontrado.');
      }

      const entregaveis = await transacao.get(
        referencia.collection(SUBCOLECAO_ENTREGAVEIS),
      );
      const estados = entregaveis.docs.map(
        (e) => (e.data() as DocumentoEntregavel).estado,
      );
      if (!podeCancelar(situacaoDe(pedido), estados)) {
        throw new ConflictException(
          'O cancelamento so e possivel antes de o trabalho comecar (ADR-12).',
        );
      }

      transacao.update(referencia, {
        situacao: 'cancelado',
        canceladoEm: FieldValue.serverTimestamp(),
        canceladoPor: clienteUid,
      });
    });

    this.log.log(`pedido ${pedidoId} cancelado pelo cliente`);
    return { situacao: 'cancelado' };
  }
}
