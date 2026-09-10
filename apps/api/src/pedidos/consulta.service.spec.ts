import { NotFoundException } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { ClientesService } from '../clientes/clientes.service.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { ConsultaPedidosService } from './consulta.service.js';
import { PedidosService } from './pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';

const ADMIN = 'uid-admin';
const CLARA = 'uid-clara';
const BRUNO = 'uid-bruno';
const ANA = 'uid-ana-advogada';
const CARLOS = 'uid-carlos-advogado';

const PRODUTO: NovoProduto = {
  nome: 'Parecer Juridico Trabalhista',
  descricao: 'Analise de risco trabalhista sobre situacao concreta.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer fundamentado em PDF'],
  textosOrientativos: [],
  quantidadeReunioes: 1,
  prazoValidadeReunioesDias: 180,
  intervaloMinimoReunioesDias: 0,
  numeroRevisoesPermitidas: 1,
};

interface Arranjo {
  banco: FirestoreFalso;
  consulta: ConsultaPedidosService;
}

/**
 * Dois clientes, dois advogados e quatro pedidos: Clara tem dois (um com Ana, um
 * sem advogado), Bruno tem um (com Carlos), e ha um quarto pedido de Bruno na
 * fila. E o cenario minimo em que "so o que e meu" pode falhar de verdade — com
 * um cliente e um pedido, um servico que devolve tudo passa nos testes.
 */
async function montar(): Promise<Arranjo> {
  const banco = new FirestoreFalso();
  const produtos = new ProdutosService(banco as unknown as Firestore);
  const pedidos = new PedidosService(banco as unknown as Firestore);
  const clientes = new ClientesService(banco as unknown as Firestore);

  const { id: produtoOrigemId } = await produtos.criar(PRODUTO, ADMIN);

  await banco.runTransaction(async (transacao) => {
    const tr = transacao as unknown as Transaction;
    pedidos.gravar(
      tr,
      await pedidos.preparar(tr, [
        {
          pedidoId: 'p-clara-1',
          clienteId: CLARA,
          pagamentoId: 'pag-1',
          produtoOrigemId,
        },
        {
          pedidoId: 'p-clara-2',
          clienteId: CLARA,
          pagamentoId: 'pag-1',
          produtoOrigemId,
        },
        {
          pedidoId: 'p-bruno-1',
          clienteId: BRUNO,
          pagamentoId: 'pag-2',
          produtoOrigemId,
        },
      ]),
    );
  });

  for (const [uid, nome] of [
    [CLARA, 'Clara Nunes'],
    [BRUNO, 'Bruno Alves'],
  ]) {
    await banco
      .collection('clientes')
      .doc(uid)
      .set({
        nome,
        email: `${uid}@exemplo.test`,
        nomeNormalizado: nome.toLowerCase(),
        emailNormalizado: `${uid}@exemplo.test`,
        produtosContratados: [PRODUTO.nome],
      });
  }

  await banco
    .collection('pedidos')
    .doc('p-clara-1')
    .update({ advogadoId: ANA, distribuido: true });
  await banco
    .collection('pedidos')
    .doc('p-bruno-1')
    .update({ advogadoId: CARLOS, distribuido: true });

  return {
    banco,
    consulta: new ConsultaPedidosService(
      banco as unknown as Firestore,
      clientes,
    ),
  };
}

describe('ConsultaPedidosService', () => {
  describe('o cliente ve os proprios pedidos, e um cartao por pedido', () => {
    it('devolve um cartao por pedido do cliente', async () => {
      const { consulta } = await montar();

      const cartoes = await consulta.listarDoCliente(CLARA);

      expect(cartoes.map((cartao) => cartao.id).sort()).toEqual([
        'p-clara-1',
        'p-clara-2',
      ]);
    });

    /**
     * O criterio de aceite da Etapa 9: dois pedidos, dois cartoes DISTINTOS, cada
     * um com seus proprios entregaveis. Um servico que devolvesse a mesma lista de
     * entregaveis nos dois passaria numa assercao so de contagem.
     */
    it('cada cartao carrega os entregaveis do proprio pedido', async () => {
      const { consulta } = await montar();

      const cartoes = await consulta.listarDoCliente(CLARA);
      const ids = cartoes.map((cartao) =>
        cartao.entregaveis.map((entregavel) => entregavel.id),
      );

      expect(ids).toEqual([['001'], ['001']]);
      expect(cartoes[0].id).not.toBe(cartoes[1].id);
    });

    it('nao devolve pedido de outro cliente', async () => {
      const { consulta } = await montar();

      const cartoes = await consulta.listarDoCliente(BRUNO);

      expect(cartoes.map((cartao) => cartao.id)).toEqual(['p-bruno-1']);
    });

    /**
     * 404 e nao 403: um 403 confirmaria que aquele id existe, e a diferenca entre
     * "nao existe" e "existe e nao e seu" e o que alguem varrendo ids procura.
     */
    it('recusa o pedido de outro cliente sem confirmar que ele existe', async () => {
      const { consulta } = await montar();

      await expect(consulta.obterCartao('p-bruno-1', CLARA)).rejects.toThrow(
        NotFoundException,
      );
      await expect(consulta.obterCartao('nao-existe', CLARA)).rejects.toThrow(
        NotFoundException,
      );
    });

    /** O cartao do cliente nao tem onde carregar a identidade do advogado. */
    it('nao expoe o advogado ao cliente', async () => {
      const { consulta } = await montar();

      const cartao = await consulta.obterCartao('p-clara-1', CLARA);

      expect(cartao.distribuido).toBe(true);
      expect(JSON.stringify(cartao)).not.toContain(ANA);
    });
  });

  describe('o advogado ve apenas o que lhe foi distribuido', () => {
    it('lista so as demandas atribuidas', async () => {
      const { consulta } = await montar();

      const demandas = await consulta.listarDoAdvogado(ANA);

      expect(demandas.map((demanda) => demanda.id)).toEqual(['p-clara-1']);
    });

    it('nao lista pedido sem distribuicao', async () => {
      const { consulta } = await montar();

      const todas = [
        ...(await consulta.listarDoAdvogado(ANA)),
        ...(await consulta.listarDoAdvogado(CARLOS)),
      ];

      expect(todas.map((demanda) => demanda.id)).not.toContain('p-clara-2');
    });

    it('recusa a demanda de outro advogado', async () => {
      const { consulta } = await montar();

      await expect(consulta.obterDemanda('p-bruno-1', ANA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('recusa pedido que ainda esta na caixa de entrada', async () => {
      const { consulta } = await montar();

      await expect(consulta.obterDemanda('p-clara-2', ANA)).rejects.toThrow(
        NotFoundException,
      );
    });

    /** O item 2.6.2 pede que o advogado veja de quem e a demanda. */
    it('a demanda carrega o cliente', async () => {
      const { consulta } = await montar();

      const demanda = await consulta.obterDemanda('p-clara-1', ANA);

      expect(demanda.cliente).toEqual({ uid: CLARA, nome: 'Clara Nunes' });
    });

    /**
     * Cadastro de cliente ausente nao pode derrubar a lista inteira: o advogado
     * ficaria sem ver NENHUMA demanda por causa de uma.
     */
    it('aguenta cliente sem cadastro na listagem', async () => {
      const { banco, consulta } = await montar();
      banco.documentos.delete(`clientes/${CLARA}`);

      const demandas = await consulta.listarDoAdvogado(ANA);

      expect(demandas).toHaveLength(1);
      expect(demandas[0].cliente.nome).toBe('(cliente nao encontrado)');
    });
  });
});
