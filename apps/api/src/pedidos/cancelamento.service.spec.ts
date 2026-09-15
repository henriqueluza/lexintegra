import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { comSnapshot } from '../arnes-pedidos.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { CancelamentoService } from './cancelamento.service.js';
import { PedidosService } from './pedidos.service.js';

const PARECER: NovoProduto = {
  nome: 'Parecer',
  descricao: 'Diagnostico das rotinas atuais.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 15,
  numeroRevisoesPermitidas: 2,
};

async function montar(): Promise<{
  banco: FirestoreFalso;
  servico: CancelamentoService;
}> {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  const pedidos = new PedidosService(db);
  const { id } = await new ProdutosService(db).criar(PARECER, 'uid-admin');
  const itens = await comSnapshot(
    pedidos,
    ['pedido-1', 'pedido-2'].map((pedidoId) => ({
      pedidoId,
      clienteId: 'uid-ana',
      pagamentoId: 'pix_1',
      produtoOrigemId: id,
    })),
  );
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(
      transacao as unknown as Transaction,
      pedidos.preparar(itens),
    );
  });
  return { banco, servico: new CancelamentoService(db) };
}

describe('CancelamentoService (ADR-12)', () => {
  it('cancela so aquele pedido', async () => {
    const { banco, servico } = await montar();
    banco.ordemDeEscrita.length = 0;

    expect(await servico.cancelar('pedido-1', 'uid-ana')).toEqual({
      situacao: 'cancelado',
    });

    expect(banco.documentos.get('pedidos/pedido-1')).toMatchObject({
      situacao: 'cancelado',
      canceladoPor: 'uid-ana',
    });
    expect(banco.documentos.get('pedidos/pedido-2')?.['situacao']).toBe(
      'ativo',
    );
    /* Uma escrita, e so no pedido cancelado. */
    expect(banco.escritas).toEqual(['update pedidos/pedido-1']);
  });

  /** Criterio da revisao: com trabalho iniciado, recusa no servidor. */
  it('recusa com 409 o pedido com trabalho iniciado', async () => {
    const { banco, servico } = await montar();
    await banco
      .collection('pedidos')
      .doc('pedido-1')
      .collection('entregaveis')
      .doc('001')
      .update({ estado: 'em_elaboracao' });

    await expect(servico.cancelar('pedido-1', 'uid-ana')).rejects.toThrow(
      ConflictException,
    );
    expect(banco.documentos.get('pedidos/pedido-1')?.['situacao']).toBe(
      'ativo',
    );
  });

  it.each(['cancelado', 'estornado'])(
    'recusa cancelar pedido ja %s',
    async (situacao) => {
      const { banco, servico } = await montar();
      await banco.collection('pedidos').doc('pedido-1').update({ situacao });

      await expect(servico.cancelar('pedido-1', 'uid-ana')).rejects.toThrow(
        ConflictException,
      );
    },
  );

  /** 404, e nao 403: um 403 confirmaria que o pedido existe. */
  it.each([
    ['de outro cliente', 'pedido-1', 'uid-bruno'],
    ['inexistente', 'nao-existe', 'uid-ana'],
  ])('pedido %s e 404', async (_caso, pedidoId, uid) => {
    const { servico } = await montar();

    await expect(servico.cancelar(pedidoId, uid)).rejects.toThrow(
      NotFoundException,
    );
  });
});
