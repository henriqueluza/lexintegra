import {
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import {
  COLECAO_PEDIDOS,
  PedidosService,
  type NovoPedido,
} from './pedidos.service.js';
import { comSnapshot } from '../arnes-pedidos.js';

const ADMIN = 'uid-admin';
const CLIENTE = 'uid-cliente';

const DUE_DILIGENCE: NovoProduto = {
  nome: 'Due Diligence Simplificada',
  descricao: 'Levantamento de passivos e riscos societarios.',
  precoCentavos: 480_000,
  entregaveis: ['Relatorio de riscos', 'Sumario executivo'],
  textosOrientativos: ['Separe os contratos dos ultimos cinco anos.'],
  quantidadeReunioes: 3,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 15,
  numeroRevisoesPermitidas: 2,
};

interface Arranjo {
  banco: FirestoreFalso;
  pedidos: PedidosService;
  produtos: ProdutosService;
}

function montar(): Arranjo {
  const banco = new FirestoreFalso();
  return {
    banco,
    pedidos: new PedidosService(banco as unknown as Firestore),
    produtos: new ProdutosService(banco as unknown as Firestore),
  };
}

async function comPedido(
  arranjo: Arranjo,
  produto: NovoProduto = DUE_DILIGENCE,
): Promise<{ produtoId: string; pedido: NovoPedido }> {
  const { id: produtoId } = await arranjo.produtos.criar(produto, ADMIN);
  const pedido: NovoPedido = {
    pedidoId: 'pedido-1',
    clienteId: CLIENTE,
    pagamentoId: 'pagamento-1',
    produtoOrigemId: produtoId,
  };

  await comprarCom(arranjo, pedido);

  return { produtoId, pedido };
}

/**
 * As duas fases, sempre nesta ordem. `gravar` so aceita o resultado de
 * `preparar`, entao o tipo ja impede a inversao — isto aqui e so conveniencia.
 */
async function comprarCom(
  arranjo: Arranjo,
  ...itens: NovoPedido[]
): Promise<void> {
  await arranjo.banco.runTransaction(async (transacao) => {
    const t = transacao as unknown as Transaction;
    arranjo.pedidos.gravar(
      t,
      arranjo.pedidos.preparar(await comSnapshot(arranjo.pedidos, itens)),
    );
  });
}

describe('PedidosService', () => {
  describe('criacao', () => {
    it('congela os nove campos do produto dentro do pedido', async () => {
      const arranjo = montar();
      await comPedido(arranjo);

      const gravado = arranjo.banco.documentos.get(
        `${COLECAO_PEDIDOS}/pedido-1`,
      );
      expect(gravado?.['snapshot']).toEqual(DUE_DILIGENCE);
      expect(gravado).toMatchObject({
        clienteId: CLIENTE,
        pagamentoId: 'pagamento-1',
      });
    });

    /**
     * O snapshot leva os nove campos do produto e nada mais. `ativo`, `id` e os
     * carimbos sao estado administrativo do catalogo: congela-los faria o pedido
     * carregar para sempre a informacao de que o produto estava na vitrine no dia
     * da compra, que nao e o que o 2.5.9 pede e vira ruido na tela do cliente.
     */
    it('nao congela ativo, id nem carimbos do catalogo', async () => {
      const arranjo = montar();
      await comPedido(arranjo);

      const snapshot = arranjo.banco.documentos.get(
        `${COLECAO_PEDIDOS}/pedido-1`,
      )?.['snapshot'] as Record<string, unknown>;

      for (const campo of [
        'id',
        'ativo',
        'criadoEm',
        'atualizadoEm',
        'criadoPor',
      ]) {
        expect(campo in snapshot).toBe(false);
      }
    });

    it('abre um entregavel por item do snapshot, em solicitado', async () => {
      const arranjo = montar();
      await comPedido(arranjo);

      const primeiro = arranjo.banco.documentos.get(
        `${COLECAO_PEDIDOS}/pedido-1/entregaveis/001`,
      );

      expect(primeiro).toMatchObject({
        nome: 'Relatorio de riscos',
        ordem: 1,
        estado: 'solicitado',
        revisoesUsadas: 0,
        arquivoAtual: null,
        transicoes: 1,
      });
      expect(
        arranjo.banco.documentos.get(
          `${COLECAO_PEDIDOS}/pedido-1/entregaveis/002`,
        ),
      ).toMatchObject({ nome: 'Sumario executivo', ordem: 2 });
    });

    /**
     * A trilha comeca com `de: null` porque nao ha estado anterior. Nao e uma
     * transicao da maquina — e a origem dela, e por isso nao passa por
     * `transicaoPermitida`.
     */
    it('abre a trilha de transicoes junto com o entregavel', async () => {
      const arranjo = montar();
      await comPedido(arranjo);

      expect(
        arranjo.banco.documentos.get(
          `${COLECAO_PEDIDOS}/pedido-1/entregaveis/001/transicoes/0001`,
        ),
      ).toMatchObject({
        de: null,
        para: 'solicitado',
        evento: 'criar-pedido',
        por: 'sistema',
        atorUid: CLIENTE,
      });
    });

    /**
     * A GRAVACAO NAO LE NADA (Etapa 8). O snapshot foi congelado no checkout e
     * chega pronto; a transacao da confirmacao so escreve. Um `get produtos/...`
     * dentro dela seria o snapshot sendo tirado de novo, na hora da confirmacao
     * — exatamente o risco que a etapa existe para fechar.
     */
    it('grava sem ler o produto dentro da transacao', async () => {
      const arranjo = montar();
      const { id: produtoId } = await arranjo.produtos.criar(
        DUE_DILIGENCE,
        ADMIN,
      );
      const itens = await comSnapshot(arranjo.pedidos, [
        {
          pedidoId: 'pedido-1',
          clienteId: CLIENTE,
          pagamentoId: 'pagamento-1',
          produtoOrigemId: produtoId,
        },
      ]);
      arranjo.banco.ordemDeEscrita.length = 0;

      await arranjo.banco.runTransaction(async (transacao) => {
        arranjo.pedidos.gravar(
          transacao as unknown as Transaction,
          arranjo.pedidos.preparar(itens),
        );
      });

      expect(arranjo.banco.ordemDeEscrita).toEqual([
        'create pedidos/pedido-1',
        'create pedidos/pedido-1/entregaveis/001',
        'create pedidos/pedido-1/entregaveis/001/transicoes/0001',
        'create pedidos/pedido-1/entregaveis/002',
        'create pedidos/pedido-1/entregaveis/002/transicoes/0001',
      ]);
    });

    /**
     * Regra inviolavel 4: o `pedidoId` vem do evento de pagamento, entao a
     * reentrega do webhook cai no mesmo id. `create` estoura, a transacao inteira
     * e revertida, e nao ha segundo jogo de entregaveis para o mesmo pedido.
     */
    it('recusa criar o mesmo pedido duas vezes', async () => {
      const arranjo = montar();
      const { pedido } = await comPedido(arranjo);

      await expect(comprarCom(arranjo, pedido)).rejects.toThrow(
        'ALREADY_EXISTS',
      );
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Congelamento no checkout — Etapa 8                                         */
  /* ------------------------------------------------------------------------ */

  describe('congelamento', () => {
    it('recusa produto inexistente', async () => {
      const arranjo = montar();

      await expect(arranjo.pedidos.congelar(['nao-existe'])).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    /** Saiu da vitrine, nao entra num carrinho. */
    it('recusa produto inativo', async () => {
      const arranjo = montar();
      const { id } = await arranjo.produtos.criar(DUE_DILIGENCE, ADMIN);
      await arranjo.produtos.desativar(id, ADMIN);

      await expect(arranjo.pedidos.congelar([id])).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    /**
     * Dois itens iguais sao dois pedidos, com o MESMO snapshot — e o produto e
     * lido uma vez so. Duas leituras poderiam pegar o produto antes e depois de
     * uma edicao, e o mesmo carrinho sairia com dois precos.
     */
    it('le uma vez o produto repetido e mantem a ordem dos itens', async () => {
      const arranjo = montar();
      const { id: a } = await arranjo.produtos.criar(DUE_DILIGENCE, ADMIN);
      const { id: b } = await arranjo.produtos.criar(
        { ...DUE_DILIGENCE, nome: 'Outro produto', precoCentavos: 100 },
        ADMIN,
      );
      arranjo.banco.ordemDeEscrita.length = 0;

      const congelados = await arranjo.pedidos.congelar([a, b, a]);

      expect(congelados.map((item) => item.produtoOrigemId)).toEqual([a, b, a]);
      expect(congelados.map((item) => item.snapshot.precoCentavos)).toEqual([
        480_000, 100, 480_000,
      ]);
      expect(
        arranjo.banco.ordemDeEscrita.filter((op) => op === `get produtos/${a}`),
      ).toHaveLength(1);
    });

    it('nao congela ativo nem carimbos', async () => {
      const arranjo = montar();
      const { id } = await arranjo.produtos.criar(DUE_DILIGENCE, ADMIN);

      const [item] = await arranjo.pedidos.congelar([id]);

      expect(item.snapshot).toEqual(DUE_DILIGENCE);
    });
  });

  describe('preparacao', () => {
    const DADOS = {
      pedidoId: 'pedido-1',
      clienteId: CLIENTE,
      pagamentoId: 'pagamento-1',
      produtoOrigemId: 'produto-1',
    };

    /**
     * O snapshot atravessou um documento entre o checkout e o webhook. Um campo
     * faltando estoura aqui, antes da transacao escrever qualquer coisa.
     */
    it.each([
      ['sem preco', { ...DUE_DILIGENCE, precoCentavos: undefined }],
      ['preco em reais', { ...DUE_DILIGENCE, precoCentavos: 4800.5 }],
      ['sem entregaveis', { ...DUE_DILIGENCE, entregaveis: [] }],
      ['nulo', null],
    ])('recusa snapshot %s', (_caso, snapshot) => {
      const arranjo = montar();

      expect(() => arranjo.pedidos.preparar([{ ...DADOS, snapshot }])).toThrow(
        InternalServerErrorException,
      );
    });

    /** Campo a mais no documento nao entra no pedido: `congelarProduto` lista os nove. */
    it('descarta campo que nao faz parte do snapshot', () => {
      const arranjo = montar();

      const [preparado] = arranjo.pedidos.preparar([
        { ...DADOS, snapshot: { ...DUE_DILIGENCE, ativo: true, interno: 'x' } },
      ]);

      expect(preparado.snapshot).toEqual(DUE_DILIGENCE);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Snapshot imutavel — criterio de aceite da Etapa 5                          */
  /* ------------------------------------------------------------------------ */

  describe('imutabilidade do snapshot', () => {
    /**
     * O criterio de aceite da etapa, em teste automatizado e nao por inspecao
     * visual: alterar um produto ja cadastrado nao altera nenhum pedido existente.
     */
    it('nao propaga edicao de produto para pedido ja criado', async () => {
      const arranjo = montar();
      const { produtoId } = await comPedido(arranjo);

      await arranjo.produtos.editar(
        produtoId,
        {
          ...DUE_DILIGENCE,
          nome: 'Due Diligence Completa',
          precoCentavos: 990_000,
          numeroRevisoesPermitidas: 9,
          entregaveis: ['Outro entregavel'],
        },
        ADMIN,
      );

      const pedido = await arranjo.pedidos.obter('pedido-1');
      expect(pedido.snapshot).toEqual(DUE_DILIGENCE);
      expect(pedido.snapshot.precoCentavos).toBe(480_000);
      expect(pedido.snapshot.numeroRevisoesPermitidas).toBe(2);
    });

    it('nao propaga desativacao do produto para pedido ja criado', async () => {
      const arranjo = montar();
      const { produtoId } = await comPedido(arranjo);

      await arranjo.produtos.desativar(produtoId, ADMIN);

      const pedido = await arranjo.pedidos.obter('pedido-1');
      expect(pedido.snapshot.nome).toBe(DUE_DILIGENCE.nome);
      expect(pedido.entregaveis).toHaveLength(2);
    });

    /**
     * Os entregaveis nascem dos nomes do snapshot, nao da lista viva do produto.
     * Se viessem do produto, trocar a lista no catalogo mudaria o que um cliente
     * ja pago tem direito a receber.
     */
    it('mantem os entregaveis do snapshot depois de o produto trocar de lista', async () => {
      const arranjo = montar();
      const { produtoId } = await comPedido(arranjo);

      await arranjo.produtos.editar(
        produtoId,
        { ...DUE_DILIGENCE, entregaveis: ['So um agora'] },
        ADMIN,
      );

      expect(
        (await arranjo.pedidos.obter('pedido-1')).entregaveis.map(
          (e) => e.nome,
        ),
      ).toEqual(['Relatorio de riscos', 'Sumario executivo']);
    });
  });

  describe('leitura', () => {
    it('devolve os entregaveis em ordem', async () => {
      const arranjo = montar();
      await comPedido(arranjo);

      const pedido = await arranjo.pedidos.obter('pedido-1');
      expect(pedido.entregaveis.map((e) => e.ordem)).toEqual([1, 2]);
      expect(pedido.entregaveis[0].temArquivo).toBe(false);
    });

    it('recusa pedido inexistente', async () => {
      const arranjo = montar();
      await expect(arranjo.pedidos.obter('nao-existe')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
