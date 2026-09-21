import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { ClientesService } from '../clientes/clientes.service.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { ConsultaReunioesService } from '../reunioes/consulta.service.js';
import { DistribuicaoService } from './distribuicao.service.js';
import { PedidosService } from './pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { comSnapshot } from '../arnes-pedidos.js';

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
      pedidos.preparar(
        await comSnapshot(pedidos, [
          {
            pedidoId: 'pedido-1',
            clienteId: CLIENTE,
            pagamentoId: 'pag-1',
            produtoOrigemId,
          },
        ]),
      ),
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
      new ConsultaReunioesService(banco as unknown as Firestore),
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

    /**
     * Le as TRES pontas ANTES de escrever: e a restricao da transacao do
     * Firestore, e o dublê registra a ordem justamente para isto.
     *
     * A terceira leitura entrou na Etapa 10 (ADR-21, decisao D): as reunioes do
     * pedido, para recusar a troca de advogado com compromisso marcado. Ela e a
     * ULTIMA, e tem de continuar sendo — uma leitura depois da primeira escrita
     * e recusada pelo proprio SDK.
     */
    it('le pedido, advogado e reunioes antes de qualquer escrita', async () => {
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
        'get pedidos/pedido-1/reunioes',
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

  /* ---------------------------------------------------------------------- */
  /* Reuniao futura (Etapa 10, ADR-21 decisao D)                             */
  /* ---------------------------------------------------------------------- */

  describe('com reuniao marcada', () => {
    const DAQUI_A_UM_MES = new Date(
      Date.now() + 30 * 86_400_000,
    ).toISOString();
    const HA_UM_MES = new Date(Date.now() - 30 * 86_400_000).toISOString();

    function marcar(
      banco: FirestoreFalso,
      inicio: string,
      estado = 'confirmada',
    ): void {
      banco.documentos.set('pedidos/pedido-1/reunioes/r001', {
        inicio,
        estado,
        advogadoId: ANA,
        clienteId: CLIENTE,
      });
    }

    /**
     * Trocar o advogado com reuniao marcada deixaria o compromisso na agenda de
     * quem nao atende mais o caso — e a sala do Teams ja criada em nome dele.
     */
    it('recusa trocar o advogado', async () => {
      const { banco, distribuicao } = await montar();
      marcar(banco, DAQUI_A_UM_MES);

      await expect(
        distribuicao.atribuir('pedido-1', ANA, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa devolver o pedido a caixa de entrada', async () => {
      const { banco, distribuicao } = await montar();
      await distribuicao.atribuir('pedido-1', ANA, ADMIN);
      marcar(banco, DAQUI_A_UM_MES);

      await expect(distribuicao.remover('pedido-1', ADMIN)).rejects.toThrow(
        /reuniao marcada/,
      );
    });

    it('nao escreve nada quando recusa', async () => {
      const { banco, distribuicao } = await montar();
      marcar(banco, DAQUI_A_UM_MES);
      const antes = banco.escritas.length;

      await expect(
        distribuicao.atribuir('pedido-1', ANA, ADMIN),
      ).rejects.toThrow();

      expect(banco.escritas).toHaveLength(antes);
    });

    /**
     * Reuniao PASSADA nao impede nada: ela aconteceu, e o historico dela nao e
     * motivo para travar uma decisao administrativa de hoje.
     */
    it('reuniao ja realizada nao impede', async () => {
      const { banco, distribuicao } = await montar();
      marcar(banco, HA_UM_MES);

      await expect(
        distribuicao.atribuir('pedido-1', ANA, ADMIN),
      ).resolves.toMatchObject({ advogadoId: ANA });
    });

    it.each(['cancelada_com_devolucao', 'cancelada_sem_devolucao'])(
      'reuniao %s nao impede',
      async (estado) => {
        const { banco, distribuicao } = await montar();
        marcar(banco, DAQUI_A_UM_MES, estado);

        await expect(
          distribuicao.atribuir('pedido-1', ANA, ADMIN),
        ).resolves.toMatchObject({ advogadoId: ANA });
      },
    );

    /** `reservada_sem_link` E ativa: o slot esta reservado e o compromisso vale. */
    it('reuniao ainda sem sala impede', async () => {
      const { banco, distribuicao } = await montar();
      marcar(banco, DAQUI_A_UM_MES, 'reservada_sem_link');

      await expect(
        distribuicao.atribuir('pedido-1', ANA, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
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
