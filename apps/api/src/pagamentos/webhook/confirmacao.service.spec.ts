import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { VERSAO_TERMOS_CHECKOUT, type NovoProduto } from 'shared';
import { AlertaFalso } from '../../alertas/alerta.js';
import { COLECAO_CHECKOUTS } from '../../checkout/checkout.js';
import { CheckoutService } from '../../checkout/checkout.service.js';
import { CobrancaDoCheckout } from '../../checkout/cobranca.service.js';
import { ProdutosNoGateway } from '../../checkout/produtos-no-gateway.js';
import type {
  ContaDoComprador,
  ContasClienteService,
} from '../../contas-cliente/contas-cliente.service.js';
import { FirestoreFalso } from '../../firestore-falso.js';
import type { EnfileiradorDeEventos } from '../../outbox/enfileirador.service.js';
import { OutboxService } from '../../outbox/outbox.service.js';
import { configuracaoDoOutbox } from '../../outbox/politica.js';
import { PedidosService } from '../../pedidos/pedidos.service.js';
import { ProdutosService } from '../../produtos/produtos.service.js';
import { GatewayPagamentoFalso } from '../gateway/gateway-falso.js';
import { COLECAO_PAGAMENTOS } from '../pagamento.js';
import { ConfirmacaoService, idDoPedido } from './confirmacao.service.js';

const ADMIN = 'uid-admin';
const UID = 'uid-ana';

const PARECER: NovoProduto = {
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico das rotinas atuais.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF', 'Plano de acao'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 15,
  numeroRevisoesPermitidas: 2,
};

const CONTRATO: NovoProduto = {
  ...PARECER,
  nome: 'Revisao de contrato comercial',
  precoCentavos: 120_000,
  entregaveis: ['Contrato revisado'],
};

interface Arranjo {
  banco: FirestoreFalso;
  servico: ConfirmacaoService;
  produtos: ProdutosService;
  alertas: AlertaFalso;
  enfileirados: string[];
  contas: string[];
  checkoutId: string;
  cobrancaId: string;
  parecer: string;
}

async function montar(
  conta: ContaDoComprador = { situacao: 'cliente', uid: UID },
): Promise<Arranjo> {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  const gateway = new GatewayPagamentoFalso();
  const pedidos = new PedidosService(db);
  const produtos = new ProdutosService(db);
  const alertas = new AlertaFalso();
  const enfileirados: string[] = [];
  const contas: string[] = [];

  const { id: parecer } = await produtos.criar(PARECER, ADMIN);
  const { id: contrato } = await produtos.criar(CONTRATO, ADMIN);

  const checkout = new CheckoutService(
    db,
    {
      getUserByEmail: () =>
        Promise.reject(
          Object.assign(new Error('x'), { code: 'auth/user-not-found' }),
        ),
    } as unknown as Auth,
    pedidos,
    new CobrancaDoCheckout(db, gateway, new ProdutosNoGateway(db, gateway)),
  );
  const { checkoutId } = await checkout.iniciar(
    {
      itens: [{ produtoId: parecer }, { produtoId: contrato }],
      metodo: 'pix',
      comprador: { nome: 'Ana Ribeiro', email: 'ana@empresa.com.br' },
      termosVersao: VERSAO_TERMOS_CHECKOUT,
      chaveDoCarrinho: '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
    },
    'lead-ana',
  );
  const [cobranca] = [...gateway.cobrancas.values()];

  const servico = new ConfirmacaoService(
    db,
    alertas,
    {
      obterOuCriar: (comprador: { email: string }) => {
        contas.push(comprador.email);
        return Promise.resolve(conta);
      },
    } as unknown as ContasClienteService,
    pedidos,
    new OutboxService(db, configuracaoDoOutbox({})),
    {
      enfileirarPorId: (id: string) => {
        enfileirados.push(id);
        return Promise.resolve();
      },
    } as unknown as EnfileiradorDeEventos,
  );

  return {
    banco,
    servico,
    produtos,
    alertas,
    enfileirados,
    contas,
    checkoutId,
    cobrancaId: cobranca.cobrancaId,
    parecer,
  };
}

function evento(
  arranjo: Arranjo,
  alteracao: { valor?: number; externalId?: string } = {},
): Parameters<ConfirmacaoService['confirmar']>[0] {
  return {
    eventoId: 'log_1',
    devMode: true,
    cobranca: {
      id: arranjo.cobrancaId,
      externalId: alteracao.externalId ?? arranjo.checkoutId,
      valorCentavos: alteracao.valor ?? 370_000,
      origem: 'transparente' as const,
    },
  };
}

function colecao(arranjo: Arranjo, nome: string): string[] {
  return [...arranjo.banco.documentos.keys()].filter(
    (caminho) =>
      caminho.startsWith(`${nome}/`) && caminho.split('/').length === 2,
  );
}

function documento(arranjo: Arranjo, caminho: string): Record<string, unknown> {
  return arranjo.banco.documentos.get(caminho) ?? {};
}

describe('ConfirmacaoService', () => {
  describe('pagamento confirmado', () => {
    it('cria um pagamento e um pedido por item, no mesmo commit', async () => {
      const arranjo = await montar();

      expect(await arranjo.servico.confirmar(evento(arranjo))).toBe(
        'confirmado',
      );

      expect(colecao(arranjo, COLECAO_PAGAMENTOS)).toEqual([
        `${COLECAO_PAGAMENTOS}/${arranjo.cobrancaId}`,
      ]);
      expect(colecao(arranjo, 'pedidos').sort()).toEqual([
        `pedidos/${idDoPedido(arranjo.cobrancaId, 0)}`,
        `pedidos/${idDoPedido(arranjo.cobrancaId, 1)}`,
      ]);
    });

    it('grava o pagamento com os pedidos, a conta e a evidencia do aceite', async () => {
      const arranjo = await montar();

      await arranjo.servico.confirmar(evento(arranjo));

      expect(
        documento(arranjo, `${COLECAO_PAGAMENTOS}/${arranjo.cobrancaId}`),
      ).toMatchObject({
        situacao: 'confirmado',
        valorCentavos: 370_000,
        checkoutId: arranjo.checkoutId,
        clienteId: UID,
        pedidoIds: [
          idDoPedido(arranjo.cobrancaId, 0),
          idDoPedido(arranjo.cobrancaId, 1),
        ],
        termosVersao: VERSAO_TERMOS_CHECKOUT,
        eventoId: 'log_1',
        checkoutSubstituido: false,
      });
    });

    /**
     * REGRA INVIOLAVEL 5, na ponta da confirmacao: o pedido nasce do snapshot do
     * CHECKOUT. O administrador muda preco e nome entre o QR e o pagamento, e o
     * pedido continua com os valores de quando a pessoa decidiu comprar.
     */
    it('usa o snapshot do checkout, e nao o produto alterado depois', async () => {
      const arranjo = await montar();
      await arranjo.produtos.editar(
        arranjo.parecer,
        { ...PARECER, nome: 'Parecer Premium', precoCentavos: 990_000 },
        ADMIN,
      );

      await arranjo.servico.confirmar(evento(arranjo));

      const snapshots = colecao(arranjo, 'pedidos').map(
        (caminho) => documento(arranjo, caminho)['snapshot'] as NovoProduto,
      );
      expect(snapshots.map((s) => s.nome).sort()).toEqual(
        [PARECER.nome, CONTRATO.nome].sort(),
      );
      expect(snapshots.map((s) => s.precoCentavos).sort()).toEqual([
        120_000, 250_000,
      ]);
    });

    it('cria o cliente com os campos de busca e os produtos congelados', async () => {
      const arranjo = await montar();

      await arranjo.servico.confirmar(evento(arranjo));

      expect(documento(arranjo, `clientes/${UID}`)).toMatchObject({
        nome: 'Ana Ribeiro',
        email: 'ana@empresa.com.br',
        nomeNormalizado: 'ana ribeiro',
        emailNormalizado: 'ana@empresa.com.br',
      });
      expect(
        (
          documento(arranjo, `clientes/${UID}`)[
            'produtosContratados'
          ] as string[]
        ).sort(),
      ).toEqual([CONTRATO.nome, PARECER.nome].sort());
    });

    /** Regra inviolavel 3: o e-mail de acesso nasce no outbox, no mesmo commit. */
    it('registra o acesso do cliente no outbox e enfileira depois do commit', async () => {
      const arranjo = await montar();

      await arranjo.servico.confirmar(evento(arranjo));

      expect(documento(arranjo, `outbox/acesso-cliente_${UID}`)).toMatchObject({
        tipo: 'acesso-cliente',
        destinatarioUid: UID,
        estado: 'pendente',
      });
      expect(arranjo.enfileirados).toEqual([`acesso-cliente_${UID}`]);
    });

    it('marca o checkout como pago', async () => {
      const arranjo = await montar();

      await arranjo.servico.confirmar(evento(arranjo));

      expect(
        documento(arranjo, `${COLECAO_CHECKOUTS}/${arranjo.checkoutId}`)[
          'estado'
        ],
      ).toBe('pago');
    });

    /** Cliente comprando de novo: cadastro preservado, produtos acrescentados. */
    it('cliente existente mantem o cadastro e ganha os produtos novos', async () => {
      const arranjo = await montar();
      await arranjo.banco
        .collection('clientes')
        .doc(UID)
        .set({
          nome: 'Ana R. Salgado',
          email: 'ana@empresa.com.br',
          nomeNormalizado: 'ana r. salgado',
          emailNormalizado: 'ana@empresa.com.br',
          produtosContratados: ['Produto antigo', PARECER.nome],
          criadoEm: 'antes',
        });

      await arranjo.servico.confirmar(evento(arranjo));

      const cliente = documento(arranjo, `clientes/${UID}`);
      expect(cliente['nome']).toBe('Ana R. Salgado');
      expect(cliente['criadoEm']).toBe('antes');
      expect((cliente['produtosContratados'] as string[]).sort()).toEqual(
        ['Produto antigo', PARECER.nome, CONTRATO.nome].sort(),
      );
    });

    /** O QR de um carrinho que mudou foi pago: honra os itens DELE, e avisa. */
    it('checkout substituido pago cria os pedidos e emite aviso', async () => {
      const arranjo = await montar();
      await arranjo.banco
        .collection(COLECAO_CHECKOUTS)
        .doc(arranjo.checkoutId)
        .update({ estado: 'substituido' });

      expect(await arranjo.servico.confirmar(evento(arranjo))).toBe(
        'confirmado',
      );

      expect(colecao(arranjo, 'pedidos')).toHaveLength(2);
      expect(
        documento(arranjo, `${COLECAO_PAGAMENTOS}/${arranjo.cobrancaId}`)[
          'checkoutSubstituido'
        ],
      ).toBe(true);
      expect(arranjo.alertas.emitidos).toMatchObject([
        { nivel: 'aviso', assunto: 'pagamento.checkout-substituido-pago' },
      ]);
    });
  });

  describe('idempotencia (criterio de aceite da Etapa 8)', () => {
    /** O mesmo webhook tres vezes: um pagamento, dois pedidos, um e-mail. */
    it('tres entregas em sequencia produzem um pagamento e dois pedidos', async () => {
      const arranjo = await montar();

      const resultados = [
        await arranjo.servico.confirmar(evento(arranjo)),
        await arranjo.servico.confirmar(evento(arranjo)),
        await arranjo.servico.confirmar(evento(arranjo)),
      ];

      expect(resultados).toEqual(['confirmado', 'duplicata', 'duplicata']);
      expect(colecao(arranjo, COLECAO_PAGAMENTOS)).toHaveLength(1);
      expect(colecao(arranjo, 'pedidos')).toHaveLength(2);
      expect(colecao(arranjo, 'outbox')).toHaveLength(1);
      expect(arranjo.enfileirados).toHaveLength(1);
      /* A reentrega de pagamento ja confirmado nem passa pelo Auth. */
      expect(arranjo.contas).toHaveLength(1);
    });

    /**
     * A TRAVA E O `create`, e nao o atalho. Com o atalho burlado — o pagamento
     * criado depois da primeira leitura, como numa entrega concorrente —, a
     * transacao encontra o documento e devolve duplicata sem escrever nada.
     */
    it('entrega concorrente que passou pelo atalho vira duplicata na transacao', async () => {
      const arranjo = await montar();
      await arranjo.servico.confirmar(evento(arranjo));
      const escritas = arranjo.banco.escritas.length;
      const original = arranjo.banco.collection.bind(arranjo.banco);
      let primeira = true;
      arranjo.banco.collection = ((caminho: string) => {
        const colecaoFalsa = original(caminho);
        if (caminho !== COLECAO_PAGAMENTOS || !primeira) return colecaoFalsa;
        primeira = false;
        const doc = colecaoFalsa.doc.bind(colecaoFalsa);
        return Object.assign(colecaoFalsa, {
          doc: (id: string) =>
            Object.assign(doc(id), {
              get: () =>
                Promise.resolve({ exists: false, data: () => undefined }),
            }),
        });
      }) as typeof arranjo.banco.collection;

      expect(await arranjo.servico.confirmar(evento(arranjo))).toBe(
        'duplicata',
      );
      expect(arranjo.banco.escritas.length).toBe(escritas);
    });
  });

  describe('anomalias: houve dinheiro e nao ha pedido', () => {
    it.each([
      ['valor divergente', { valor: 1 }, 'divergente'],
      [
        'checkout inexistente (TTL)',
        { externalId: 'checkout-apagado' },
        'orfao',
      ],
    ] as const)(
      '%s registra o pagamento, alerta critico e nenhum pedido',
      async (_caso, alteracao, situacao) => {
        const arranjo = await montar();

        expect(
          await arranjo.servico.confirmar(evento(arranjo, alteracao)),
        ).toBe(situacao);

        const pagamento = documento(
          arranjo,
          `${COLECAO_PAGAMENTOS}/${arranjo.cobrancaId}`,
        );
        expect(pagamento['situacao']).toBe(situacao);
        expect('clienteId' in pagamento).toBe(false);
        expect(colecao(arranjo, 'pedidos')).toEqual([]);
        expect(colecao(arranjo, 'clientes')).toEqual([]);
        expect(arranjo.contas).toEqual([]);
        expect(arranjo.alertas.emitidos).toMatchObject([
          { nivel: 'critico', assunto: `pagamento.${situacao}` },
        ]);
      },
    );

    it('conta de outro perfil registra conflito e nenhum pedido', async () => {
      const arranjo = await montar({
        situacao: 'conflito',
        uid: 'uid-advogado',
      });

      expect(await arranjo.servico.confirmar(evento(arranjo))).toBe(
        'conflito_de_conta',
      );
      expect(colecao(arranjo, 'pedidos')).toEqual([]);
      expect(arranjo.alertas.emitidos[0]).toMatchObject({
        nivel: 'critico',
        assunto: 'pagamento.conflito_de_conta',
      });
    });

    /** O alerta leva ids, e nunca nome ou e-mail do comprador. */
    it('o alerta nao carrega dado pessoal', async () => {
      const arranjo = await montar({
        situacao: 'conflito',
        uid: 'uid-advogado',
      });

      await arranjo.servico.confirmar(evento(arranjo));

      expect(JSON.stringify(arranjo.alertas.emitidos)).not.toMatch(/ana/i);
    });

    it('a anomalia reentregue e duplicata, sem segundo alerta', async () => {
      const arranjo = await montar();

      await arranjo.servico.confirmar(evento(arranjo, { valor: 1 }));
      expect(
        await arranjo.servico.confirmar(evento(arranjo, { valor: 1 })),
      ).toBe('duplicata');
      expect(arranjo.alertas.emitidos).toHaveLength(1);
    });
  });

  it('snapshot corrompido no checkout falha antes de escrever', async () => {
    const arranjo = await montar();
    await arranjo.banco
      .collection(COLECAO_CHECKOUTS)
      .doc(arranjo.checkoutId)
      .update({
        itens: [{ produtoOrigemId: 'x', snapshot: { nome: 'sem preco' } }],
      });
    const escritas = arranjo.banco.escritas.length;

    await expect(arranjo.servico.confirmar(evento(arranjo))).rejects.toThrow(
      'Snapshot do produto invalido.',
    );
    expect(arranjo.banco.escritas.length).toBe(escritas);
  });

  it('idDoPedido tem tres digitos', () => {
    expect(idDoPedido('pix_1', 0)).toBe('pix_1_001');
    expect(idDoPedido('pix_1', 11)).toBe('pix_1_012');
  });
});
