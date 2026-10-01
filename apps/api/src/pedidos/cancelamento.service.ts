import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { impedimentoDoCancelamento, type SituacaoPedido } from 'shared';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { agora as agora_ } from '../relogio.js';
import {
  escreverProdutosContratados,
  escreverReunioesCanceladas,
  eventosDasReunioesCanceladas,
  futurasACancelar,
  lerProdutosDoCliente,
  lerReunioes,
  paraElegibilidade,
  versaoDasReunioes,
} from './encerramento.js';
import { conflitoDoPedido } from './pausa.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from './pedido.js';

/**
 * O cancelamento pelo cliente (ADR-12, "cancelamento sem estorno").
 *
 * NAO DEVOLVE DINHEIRO. Devolucao e estorno, e estorno e acao do administrador
 * (decidido na Etapa 8). O pedido cancelado continua estornavel, pelo painel.
 *
 * AS MESMAS TRES CONDICOES DO ESTORNO (regra inviolavel 15; `docs/decisoes.md`,
 * 3.3 e Anexo B): nenhum trabalho iniciado, nenhuma reuniao ja comecada, e o
 * pedido fora de contestacao. Validadas AQUI, dentro da transacao, pela mesma
 * funcao que a tela usa para mostrar o botao. A recusa diz qual falhou.
 *
 * O QUE VAI JUNTO, na mesma transacao: as reunioes futuras (canceladas com
 * devolucao, com o `METHOD:CANCEL` no outbox) e o produto em
 * `produtosContratados`, a nao ser que outro pedido ativo o tenha. A conta do
 * cliente continua ativa, e os outros pedidos — inclusive os da mesma cobranca —
 * nao mudam de situacao: pedidos sao unidades independentes (ADR-04).
 *
 * Pedido de OUTRO cliente responde 404, e nao 403: um 403 confirmaria que o id
 * existe (a mesma decisao da area do cliente, Etapa 9).
 */
@Injectable()
export class CancelamentoService {
  private readonly log = new Logger('Pedidos');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async cancelar(
    pedidoId: string,
    clienteUid: string,
    agora: number = agora_(),
  ): Promise<{ situacao: SituacaoPedido }> {
    const eventos = await this.db.runTransaction(async (transacao) => {
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
      const reunioes = await lerReunioes(transacao, referencia);
      const produtos = await lerProdutosDoCliente(
        transacao,
        this.db,
        pedido.clienteId,
      );

      const motivo = impedimentoDoCancelamento(
        paraElegibilidade(pedido, estados, reunioes, agora),
      );
      if (motivo !== null) throw conflitoDoPedido(motivo);

      const futuras = futurasACancelar(reunioes, agora);
      const novos = eventosDasReunioesCanceladas(pedidoId, futuras);
      const ids =
        novos.length === 0
          ? []
          : await this.outbox.registrarSeAusenteEmLote(transacao, novos);

      transacao.update(referencia, {
        situacao: 'cancelado',
        canceladoEm: FieldValue.serverTimestamp(),
        canceladoPor: clienteUid,
        ...versaoDasReunioes(futuras),
      });
      escreverReunioesCanceladas(
        transacao,
        this.db,
        referencia,
        futuras,
        clienteUid,
        agora,
      );
      escreverProdutosContratados(transacao, produtos, new Set([pedidoId]));
      return ids;
    });

    for (const id of eventos) {
      // Depois do commit, nunca dentro (regra inviolavel 2).
      await this.enfileirador.enfileirarPorId(id);
    }
    this.log.log(`pedido ${pedidoId} cancelado pelo cliente`);
    return { situacao: 'cancelado' };
  }
}
