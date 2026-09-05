import type { Firestore } from 'firebase-admin/firestore';
import { CATALOGO_FICTICIO } from '../../../../scripts/dados-ficticios/catalogo-produtos.js';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import {
  COLECAO_PEDIDOS,
  PedidosService,
  type NovoPedido,
} from './pedidos.service.js';

const ADMIN = 'uid-admin';
const CLIENTE = 'uid-cliente';
/** O de tres entregaveis, para o pedido abrir mais de um. */
const DUE_DILIGENCE = CATALOGO_FICTICIO[2];

let banco: Firestore;
let produtos: ProdutosService;
let pedidos: PedidosService;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  produtos = new ProdutosService(banco);
  pedidos = new PedidosService(banco);
});

/**
 * As duas fases numa transacao so, na ordem que o Firestore exige: todas as
 * leituras, depois todas as escritas.
 */
async function comprarTudo(...itens: NovoPedido[]): Promise<void> {
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(transacao, await pedidos.preparar(transacao, itens));
  });
}

function item(produtoOrigemId: string, pedidoId = 'pedido-1'): NovoPedido {
  return {
    pedidoId,
    clienteId: CLIENTE,
    pagamentoId: 'pagamento-1',
    produtoOrigemId,
  };
}

async function comprar(
  produtoOrigemId: string,
  pedidoId = 'pedido-1',
): Promise<void> {
  await comprarTudo(item(produtoOrigemId, pedidoId));
}

describe('snapshot imutavel contra o Firestore', () => {
  /**
   * O CRITERIO DE ACEITE DA ETAPA 5, contra o banco de verdade: alterar um
   * produto ja cadastrado nao altera nenhum pedido existente. O teste de unidade
   * prova a mesma coisa contra o dublê; este prova que a transacao real, com
   * carimbo de servidor e leitura antes de escrita, produz o mesmo resultado.
   */
  it('nao propaga edicao de produto para pedido ja criado', async () => {
    const { id } = await produtos.criar(DUE_DILIGENCE, ADMIN);
    await comprar(id);

    await produtos.editar(
      id,
      {
        ...DUE_DILIGENCE,
        nome: 'Outro nome',
        precoCentavos: 1,
        numeroRevisoesPermitidas: 99,
        entregaveis: ['Um so'],
        textosOrientativos: [],
      },
      ADMIN,
    );

    const pedido = await pedidos.obter('pedido-1');
    expect(pedido.snapshot).toEqual({
      nome: DUE_DILIGENCE.nome,
      descricao: DUE_DILIGENCE.descricao,
      precoCentavos: DUE_DILIGENCE.precoCentavos,
      entregaveis: DUE_DILIGENCE.entregaveis,
      textosOrientativos: DUE_DILIGENCE.textosOrientativos,
      quantidadeReunioes: DUE_DILIGENCE.quantidadeReunioes,
      prazoValidadeReunioesDias: DUE_DILIGENCE.prazoValidadeReunioesDias,
      intervaloMinimoReunioesDias: DUE_DILIGENCE.intervaloMinimoReunioesDias,
      numeroRevisoesPermitidas: DUE_DILIGENCE.numeroRevisoesPermitidas,
    });
  });

  it('mantem os entregaveis do snapshot depois de o catalogo trocar de lista', async () => {
    const { id } = await produtos.criar(DUE_DILIGENCE, ADMIN);
    await comprar(id);

    await produtos.editar(
      id,
      { ...DUE_DILIGENCE, entregaveis: ['Um so'] },
      ADMIN,
    );

    const pedido = await pedidos.obter('pedido-1');
    expect(pedido.entregaveis.map((e) => e.nome)).toEqual([
      ...DUE_DILIGENCE.entregaveis,
    ]);
  });

  it('sobrevive a desativacao do produto', async () => {
    const { id } = await produtos.criar(DUE_DILIGENCE, ADMIN);
    await comprar(id);
    await produtos.desativar(id, ADMIN);

    const pedido = await pedidos.obter('pedido-1');
    expect(pedido.snapshot.nome).toBe(DUE_DILIGENCE.nome);
    expect(pedido.entregaveis).toHaveLength(DUE_DILIGENCE.entregaveis.length);
  });

  it('nao guarda ativo nem carimbo do catalogo dentro do snapshot', async () => {
    const { id } = await produtos.criar(DUE_DILIGENCE, ADMIN);
    await comprar(id);

    const bruto = await banco.collection(COLECAO_PEDIDOS).doc('pedido-1').get();
    const snapshot = bruto.data()?.['snapshot'] as Record<string, unknown>;

    expect(Object.keys(snapshot).sort()).toEqual(
      Object.keys(DUE_DILIGENCE).sort(),
    );
  });
});

describe('criacao transacional', () => {
  it('cria pedido, entregaveis e trilha no mesmo commit', async () => {
    const { id } = await produtos.criar(DUE_DILIGENCE, ADMIN);
    await comprar(id);

    const raiz = banco.collection(COLECAO_PEDIDOS).doc('pedido-1');
    const entregaveis = await raiz
      .collection('entregaveis')
      .orderBy('ordem')
      .get();
    const trilha = await raiz
      .collection('entregaveis')
      .doc('001')
      .collection('transicoes')
      .get();

    expect(entregaveis.size).toBe(DUE_DILIGENCE.entregaveis.length);
    expect(entregaveis.docs.map((d) => d.id)).toEqual(['001', '002', '003']);
    expect(trilha.docs.map((d) => d.data()['para'])).toEqual(['solicitado']);
  });

  /**
   * Regra inviolavel 4 contra o banco de verdade: o `create` de um documento que
   * ja existe estoura, e a transacao inteira e revertida. Reentrega de webhook
   * nao gera um segundo jogo de entregaveis.
   */
  it('recusa a reentrega do mesmo pedido, sem deixar estado parcial', async () => {
    const { id } = await produtos.criar(DUE_DILIGENCE, ADMIN);
    await comprar(id);

    await expect(comprar(id)).rejects.toThrow();

    const entregaveis = await banco
      .collection(COLECAO_PEDIDOS)
      .doc('pedido-1')
      .collection('entregaveis')
      .get();
    expect(entregaveis.size).toBe(DUE_DILIGENCE.entregaveis.length);
  });

  /**
   * O carrinho da arquitetura 5.2: um pagamento, N pedidos, um commit.
   *
   * ESTE TESTE E O QUE PEGOU O BUG DE DESENHO. Com uma funcao unica que lia o
   * produto e escrevia o pedido, o primeiro item passava e o segundo estourava
   * com "all reads before all writes" — a restricao vale para a transacao
   * inteira, nao por chamada. Passava com um item, quebrava no primeiro carrinho
   * de verdade, e o dublê em memoria nao impunha a regra.
   */
  it('cria varios pedidos de um pagamento numa transacao so', async () => {
    const primeiro = await produtos.criar(CATALOGO_FICTICIO[0], ADMIN);
    const segundo = await produtos.criar(CATALOGO_FICTICIO[1], ADMIN);

    await comprarTudo(
      item(primeiro.id, 'pedido-a'),
      item(segundo.id, 'pedido-b'),
    );

    expect((await pedidos.obter('pedido-a')).snapshot.nome).toBe(
      CATALOGO_FICTICIO[0].nome,
    );
    expect((await pedidos.obter('pedido-b')).snapshot.nome).toBe(
      CATALOGO_FICTICIO[1].nome,
    );
  });

  it('reverte tudo quando um dos pedidos do carrinho falha', async () => {
    const { id } = await produtos.criar(CATALOGO_FICTICIO[0], ADMIN);

    await expect(
      comprarTudo(
        item(id, 'pedido-a'),
        item('produto-que-nao-existe', 'pedido-b'),
      ),
    ).rejects.toThrow();

    // Cliente que pagou dois produtos e recebeu um e a falha que a transacao
    // existe para impedir: nem o primeiro pedido pode sobrar.
    const sobrou = await banco
      .collection(COLECAO_PEDIDOS)
      .doc('pedido-a')
      .get();
    expect(sobrou.exists).toBe(false);
  });
});
