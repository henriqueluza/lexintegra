import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { VERSAO_TERMOS_CHECKOUT, type NovoProduto } from 'shared';
import { AppModule } from '../../app.module.js';
import { eventoNoFormatoReal } from '../../arnes-webhook.js';
import { COLECAO_CHECKOUTS } from '../../checkout/checkout.js';
import { configurar, OPCOES_DA_APLICACAO } from '../../configurar.js';
import {
  authDeTeste,
  firestoreDeTeste,
  limparEmuladores,
} from '../../emulador.js';
import { ProdutosService } from '../../produtos/produtos.service.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../gateway/modo.js';
import { COLECAO_PAGAMENTOS } from '../pagamento.js';
import { assinar } from './assinatura.js';

const ANA = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '(61) 99000-0000',
};

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

let app: INestApplication;

/**
 * CRITERIO DE ACEITE DA ETAPA 8, sobre HTTP e contra o emulador: reenviar o mesmo
 * webhook tres vezes produz exatamente um pagamento e dois pedidos.
 *
 * O caminho e o de verdade: pre-cadastro, checkout com dois produtos pela API,
 * webhook assinado com os segredos de desenvolvimento, transacao real do
 * Firestore, conta real no emulador de Auth. O que o dublê em memoria nao prova —
 * a reexecucao da transacao sob contencao e o `ALREADY_EXISTS` do commit — e
 * provado aqui, com as tres entregas concorrentes.
 */
beforeEach(async () => {
  await limparEmuladores();
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await app.init();
});

afterEach(async () => {
  await app.close();
});

function http(): request.Agent {
  return request(app.getHttpServer());
}

interface Compra {
  readonly checkoutId: string;
  readonly cobrancaId: string;
  readonly produtos: readonly string[];
}

async function comprar(
  itens: readonly NovoProduto[] = [PARECER, CONTRATO],
  chaveDoCarrinho = '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
  token?: string,
): Promise<Compra & { token: string }> {
  const liberacao =
    token ??
    (
      (await http().post('/api/pre-cadastros').send(ANA).expect(201)).body as {
        token: string;
      }
    ).token;
  const servico = new ProdutosService(firestoreDeTeste());
  const produtos: string[] = [];
  for (const item of itens) {
    produtos.push((await servico.criar(item, 'uid-admin')).id);
  }

  const { body } = await http()
    .post('/api/checkout')
    .set('x-pre-cadastro', liberacao)
    .send({
      itens: produtos.map((produtoId) => ({ produtoId })),
      metodo: 'pix',
      comprador: { nome: ANA.nome, email: ANA.email },
      termosVersao: VERSAO_TERMOS_CHECKOUT,
      chaveDoCarrinho,
    })
    .expect(201);

  const checkoutId = (body as { checkoutId: string }).checkoutId;
  const checkout = await firestoreDeTeste()
    .collection(COLECAO_CHECKOUTS)
    .doc(checkoutId)
    .get();
  return {
    checkoutId,
    cobrancaId: (checkout.data() as { cobranca: { id: string } }).cobranca.id,
    produtos,
    token: liberacao,
  };
}

function webhook(
  compra: Pick<Compra, 'checkoutId' | 'cobrancaId'>,
  valorCentavos = 370_000,
): request.Test {
  /* No formato do evento REAL do sandbox: sem `id` na raiz, cobranca em `data.transparent`. */
  const corpo = JSON.stringify(
    eventoNoFormatoReal({
      cobrancaId: compra.cobrancaId,
      checkoutId: compra.checkoutId,
      valorCentavos,
    }),
  );
  return http()
    .post(
      `/api/pagamentos/webhook?webhookSecret=${SEGREDO_WEBHOOK_DESENVOLVIMENTO}`,
    )
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Signature', assinar(corpo, CHAVE_HMAC_DESENVOLVIMENTO))
    .send(corpo);
}

async function contagem(): Promise<Record<string, number>> {
  const banco = firestoreDeTeste();
  const tamanho = async (nome: string): Promise<number> =>
    (await banco.collection(nome).get()).size;
  const acesso = await banco
    .collection('outbox')
    .where('tipo', '==', 'acesso-cliente')
    .get();
  return {
    pagamentos: await tamanho(COLECAO_PAGAMENTOS),
    pedidos: await tamanho('pedidos'),
    clientes: await tamanho('clientes'),
    acessos: acesso.size,
    contas: (await authDeTeste().listUsers()).users.length,
  };
}

describe('confirmacao do pagamento: idempotencia', () => {
  it('o mesmo webhook tres vezes, em sequencia: um pagamento e dois pedidos', async () => {
    const compra = await comprar();

    const respostas = [
      (await webhook(compra).expect(200)).body,
      (await webhook(compra).expect(200)).body,
      (await webhook(compra).expect(200)).body,
    ];

    expect(respostas.map((r: { resultado: string }) => r.resultado)).toEqual([
      'confirmado',
      'duplicata',
      'duplicata',
    ]);
    expect(await contagem()).toEqual({
      pagamentos: 1,
      pedidos: 2,
      clientes: 1,
      acessos: 1,
      contas: 1,
    });
  });

  /**
   * As tres entregas AO MESMO TEMPO. Aqui e a transacao que decide: duas delas
   * passam pelo atalho de leitura, e so uma sobrevive ao commit — a outra
   * reexecuta e ve o pagamento, ou estoura no `create`.
   */
  it('o mesmo webhook tres vezes, ao mesmo tempo: um pagamento e dois pedidos', async () => {
    const compra = await comprar();

    const respostas = await Promise.all([
      webhook(compra),
      webhook(compra),
      webhook(compra),
    ]);

    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(
      respostas.filter(
        (r) => (r.body as { resultado: string }).resultado === 'confirmado',
      ),
    ).toHaveLength(1);
    expect(await contagem()).toEqual({
      pagamentos: 1,
      pedidos: 2,
      clientes: 1,
      acessos: 1,
      contas: 1,
    });
  });
});

describe('confirmacao do pagamento: o que ela cria', () => {
  it('pedidos com o snapshot do checkout, conta de cliente e aceite no pagamento', async () => {
    const compra = await comprar();
    const banco = firestoreDeTeste();

    await new ProdutosService(banco).editar(
      compra.produtos[0],
      { ...PARECER, nome: 'Parecer Premium', precoCentavos: 990_000 },
      'uid-admin',
    );
    await webhook(compra).expect(200);

    const pedidos = await banco
      .collection('pedidos')
      .where('pagamentoId', '==', compra.cobrancaId)
      .get();
    expect(
      pedidos.docs
        .map((d) => (d.data().snapshot as NovoProduto).precoCentavos)
        .sort(),
    ).toEqual([120_000, 250_000]);

    const pagamento = (
      await banco.collection(COLECAO_PAGAMENTOS).doc(compra.cobrancaId).get()
    ).data();
    expect(pagamento).toMatchObject({
      situacao: 'confirmado',
      termosVersao: VERSAO_TERMOS_CHECKOUT,
    });
    expect(pagamento?.['termosAceitosEm']).toBeDefined();

    const conta = await authDeTeste().getUserByEmail(ANA.email);
    expect(conta.customClaims).toEqual({ role: 'cliente' });
    expect(pagamento?.['clienteId']).toBe(conta.uid);
  });

  /**
   * A TTL apaga o checkout 48 horas depois. A evidencia do aceite da regra de
   * estorno ja esta no pagamento e nao some junto.
   */
  it('a evidencia do aceite sobrevive a exclusao do checkout', async () => {
    const compra = await comprar();
    await webhook(compra).expect(200);

    const banco = firestoreDeTeste();
    await banco.collection(COLECAO_CHECKOUTS).doc(compra.checkoutId).delete();

    const pagamento = (
      await banco.collection(COLECAO_PAGAMENTOS).doc(compra.cobrancaId).get()
    ).data();
    expect(pagamento?.['termosVersao']).toBe(VERSAO_TERMOS_CHECKOUT);
  });

  /** Webhook tardio, depois de a TTL apagar o checkout: registrado, nada criado. */
  it('checkout inexistente vira pagamento orfao, sem pedido nem conta', async () => {
    const resposta = await webhook({
      checkoutId: 'checkout-que-a-ttl-apagou',
      cobrancaId: 'pix_char_orfao',
    }).expect(200);

    expect(resposta.body).toEqual({ recebido: true, resultado: 'orfao' });
    expect(await contagem()).toEqual({
      pagamentos: 1,
      pedidos: 0,
      clientes: 0,
      acessos: 0,
      contas: 0,
    });
  });

  it('valor diferente do congelado vira pagamento divergente', async () => {
    const compra = await comprar();

    const resposta = await webhook(compra, 1).expect(200);

    expect(resposta.body.resultado).toBe('divergente');
    expect((await contagem()).pedidos).toBe(0);
  });

  /** O QR antigo de um carrinho que mudou foi pago: os itens DELE viram pedidos. */
  it('checkout substituido pago cria os pedidos dele', async () => {
    const antigo = await comprar();
    /* Mesmo carrinho (mesma chave e mesmo lead), com outra composicao. */
    await comprar(
      [PARECER],
      '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
      antigo.token,
    );

    const banco = firestoreDeTeste();
    expect(
      (
        await banco.collection(COLECAO_CHECKOUTS).doc(antigo.checkoutId).get()
      ).data()?.['estado'],
    ).toBe('substituido');

    const resposta = await webhook(antigo).expect(200);

    expect(resposta.body.resultado).toBe('confirmado');
    const pedidos = await banco
      .collection('pedidos')
      .where('pagamentoId', '==', antigo.cobrancaId)
      .get();
    expect(pedidos.size).toBe(2);
  });
});
