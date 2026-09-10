import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { ClientesService } from '../clientes/clientes.service.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { DistribuicaoService } from './distribuicao.service.js';
import { PedidosService } from './pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';

const ADMIN = 'uid-admin';
const CLIENTE = 'uid-clara';
const ANA = 'uid-ana';
const SUSPENSA = 'uid-suspensa';

const PRODUTO: NovoProduto = {
  nome: 'Due Diligence Simplificada',
  descricao: 'Levantamento de passivos societarios, trabalhistas e fiscais.',
  precoCentavos: 980_000,
  entregaveis: ['Relatorio de riscos por area'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 7,
  numeroRevisoesPermitidas: 2,
};

interface Arranjo {
  banco: FirestoreFalso;
  distribuicao: DistribuicaoService;
}

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
          pedidoId: 'pedido-1',
          clienteId: CLIENTE,
          pagamentoId: 'pag-1',
          produtoOrigemId,
        },
      ]),
    );
  });

  await banco
    .collection('clientes')
    .doc(CLIENTE)
    .set({
      nome: 'Clara Nunes',
      email: 'clara@exemplo.test',
      nomeNormalizado: 'clara nunes',
      emailNormalizado: 'clara@exemplo.test',
      produtosContratados: [PRODUTO.nome],
    });

  await banco
    .collection('advogados')
    .doc(ANA)
    .set({ nome: 'Ana Souza', email: 'ana@escritorio.test', status: 'ativo' });
  await banco.collection('advogados').doc(SUSPENSA).set({
    nome: 'Bia Lima',
    email: 'bia@escritorio.test',
    status: 'suspenso',
  });

  return {
    banco,
    distribuicao: new DistribuicaoService(
      banco as unknown as Firestore,
      clientes,
    ),
  };
}

describe('DistribuicaoService', () => {
  describe('caixa de entrada', () => {
    it('o pedido nasce nao distribuido', async () => {
      const { distribuicao } = await montar();

      const fila = await distribuicao.listar('nao_distribuidos');

      expect(fila).toHaveLength(1);
      expect(fila[0]).toMatchObject({
        id: 'pedido-1',
        produto: PRODUTO.nome,
        advogadoId: null,
        distribuido: false,
        cliente: { uid: CLIENTE, nome: 'Clara Nunes' },
      });
    });

    it('sai da fila depois de atribuido, e aparece no outro filtro', async () => {
      const { distribuicao } = await montar();

      await distribuicao.atribuir('pedido-1', ANA, ADMIN);

      expect(await distribuicao.listar('nao_distribuidos')).toEqual([]);
      expect(
        (await distribuicao.listar('distribuidos')).map((p) => p.id),
      ).toEqual(['pedido-1']);
      expect((await distribuicao.listar('todos')).map((p) => p.id)).toEqual([
        'pedido-1',
      ]);
    });

    /** A linha da caixa de entrada leva o NOME do produto, nao o snapshot
     * inteiro: escolher um advogado nao precisa do catalogo congelado. */
    it('nao carrega o snapshot inteiro para a tabela', async () => {
      const { distribuicao } = await montar();

      const [linha] = await distribuicao.listar('nao_distribuidos');

      expect(linha).not.toHaveProperty('snapshot');
      expect(linha.produto).toBe(PRODUTO.nome);
    });
  });

  describe('atribuir', () => {
    it('grava advogado, autor e a marca de distribuido', async () => {
      const { banco, distribuicao } = await montar();

      await distribuicao.atribuir('pedido-1', ANA, ADMIN);

      expect(banco.documentos.get('pedidos/pedido-1')).toMatchObject({
        advogadoId: ANA,
        distribuido: true,
        atribuidoPor: ADMIN,
      });
    });

    /**
     * Sem exigir o DOCUMENTO de advogado, a atribuicao seria um campo de texto
     * livre com nome de chave estrangeira — daria para atribuir um pedido ao uid
     * de um cliente, ou a um uid que nao existe.
     */
    it('recusa uid que nao e de advogado', async () => {
      const { distribuicao } = await montar();

      await expect(
        distribuicao.atribuir('pedido-1', CLIENTE, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * Suspenso nao recebe trabalho novo: a suspensao ja derruba a sessao e barra
     * o login, entao a demanda apareceria distribuida e parada.
     */
    it('recusa advogado suspenso', async () => {
      const { distribuicao } = await montar();

      await expect(
        distribuicao.atribuir('pedido-1', SUSPENSA, ADMIN),
      ).rejects.toThrow(ConflictException);
    });

    it('recusa pedido inexistente', async () => {
      const { distribuicao } = await montar();

      await expect(
        distribuicao.atribuir('nao-existe', ANA, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    /** Le as duas pontas ANTES de escrever: e a restricao da transacao do
     * Firestore, e o dublê registra a ordem justamente para isto. */
    it('le pedido e advogado antes de qualquer escrita', async () => {
      const { banco, distribuicao } = await montar();
      banco.ordemDeEscrita.length = 0;

      await distribuicao.atribuir('pedido-1', ANA, ADMIN);

      const primeiraEscrita = banco.ordemDeEscrita.findIndex(
        (linha) => !linha.startsWith('get '),
      );
      const leituras = banco.ordemDeEscrita.slice(0, primeiraEscrita);

      expect(leituras).toEqual([
        'get pedidos/pedido-1',
        `get advogados/${ANA}`,
      ]);
    });

    it('nao escreve nada quando recusa', async () => {
      const { banco, distribuicao } = await montar();
      const antes = banco.escritas.length;

      await expect(
        distribuicao.atribuir('pedido-1', SUSPENSA, ADMIN),
      ).rejects.toThrow();

      expect(banco.escritas).toHaveLength(antes);
    });
  });

  describe('remover a atribuicao', () => {
    it('devolve o pedido para a fila', async () => {
      const { banco, distribuicao } = await montar();
      await distribuicao.atribuir('pedido-1', ANA, ADMIN);

      const resultado = await distribuicao.remover('pedido-1', ADMIN);

      expect(resultado).toMatchObject({
        advogadoId: null,
        distribuido: false,
      });
      expect(banco.documentos.get('pedidos/pedido-1')).toMatchObject({
        advogadoId: null,
        distribuido: false,
      });
    });

    it('recusa pedido inexistente', async () => {
      const { distribuicao } = await montar();

      await expect(distribuicao.remover('nao-existe', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
