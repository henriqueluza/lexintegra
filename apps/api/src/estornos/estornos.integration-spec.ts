import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { NOME_CLAIM_PERFIL, type NovoProduto } from 'shared';
import { AppModule } from '../app.module.js';
import { comSnapshot } from '../arnes-pedidos.js';
import { configurar, OPCOES_DA_APLICACAO } from '../configurar.js';
import {
  authDeTeste,
  firestoreDeTeste,
  idTokenDe,
  limparEmuladores,
} from '../emulador.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { GatewayPagamentoFalso } from '../pagamentos/gateway/gateway-falso.js';
import { GATEWAY_PAGAMENTO } from '../pagamentos/gateway/gateway.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../pagamentos/gateway/modo.js';
import { assinar } from '../pagamentos/webhook/assinatura.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';

const PARECER: NovoProduto = {
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico das rotinas atuais.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 15,
  numeroRevisoesPermitidas: 2,
};

let app: INestApplication;
let tokenAdmin: string;
let tokenCliente: string;
let cobrancaId: string;

/**
 * O estorno sobre HTTP, com token de administrador de verdade no emulador
 * (ADR-12, criterio de aceite da Etapa 8): recusado no SERVIDOR com o pedido em
 * `em_elaboracao`, e o estorno integral saindo pelo outbox ate o gateway e
 * voltando pelo webhook — sem duplicar quando o webhook e reentregue.
 */
beforeEach(async () => {
  await limparEmuladores();
  const auth = authDeTeste();
  await auth.createUser({ uid: 'uid-admin', email: 'admin@escritorio.test' });
  await auth.setCustomUserClaims('uid-admin', { [NOME_CLAIM_PERFIL]: 'admin' });
  await auth.createUser({ uid: 'uid-ana', email: 'ana@empresa.com.br' });
  await auth.setCustomUserClaims('uid-ana', { [NOME_CLAIM_PERFIL]: 'cliente' });
  tokenAdmin = await idTokenDe('uid-admin');
  tokenCliente = await idTokenDe('uid-ana');

  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await app.init();

  const gateway = app.get<GatewayPagamentoFalso>(GATEWAY_PAGAMENTO);
  cobrancaId = (
    await gateway.criarCobrancaPix({
      valorCentavos: 500_000,
      externalId: 'checkout-1',
      descricao: 'x',
      expiraEmSegundos: 60,
    })
  ).cobrancaId;
  await criarPedidos(2);
});

afterEach(async () => {
  await app.close();
});

async function criarPedidos(quantidade: number): Promise<void> {
  const banco = firestoreDeTeste();
  const pedidos = new PedidosService(banco);
  const { id } = await new ProdutosService(banco).criar(PARECER, 'uid-admin');
  const itens = await comSnapshot(
    pedidos,
    Array.from({ length: quantidade }, (_v, i) => ({
      pedidoId: `pedido-${String(i + 1)}`,
      clienteId: 'uid-ana',
      pagamentoId: cobrancaId,
      produtoOrigemId: id,
    })),
  );
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(transacao, pedidos.preparar(itens));
  });
  await banco.collection('pagamentos').doc(cobrancaId).set({
    situacao: 'confirmado',
    cobrancaId,
    origem: 'transparente',
    valorCentavos: 500_000,
  });
}

function estornar(pedidoId: string, token = tokenAdmin): request.Test {
  return request(app.getHttpServer())
    .post(`/api/admin/pedidos/${pedidoId}/estorno`)
    .set('Authorization', `Bearer ${token}`)
    .send({ motivo: 'Cliente desistiu antes de comecar.' });
}

function webhookDeEstorno(): request.Test {
  const corpo = JSON.stringify({
    id: `log_refund_${cobrancaId}`,
    event: 'transparent.refunded',
    devMode: true,
    data: { id: cobrancaId, externalId: 'checkout-1', amount: 500_000 },
  });
  return request(app.getHttpServer())
    .post(
      `/api/pagamentos/webhook?webhookSecret=${SEGREDO_WEBHOOK_DESENVOLVIMENTO}`,
    )
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Signature', assinar(corpo, CHAVE_HMAC_DESENVOLVIMENTO))
    .send(corpo);
}

async function lido(caminho: string): Promise<Record<string, unknown>> {
  return (await firestoreDeTeste().doc(caminho).get()).data() ?? {};
}

describe('estorno sobre HTTP (ADR-12)', () => {
  it('estorna o pedido em solicitado', async () => {
    const resposta = await estornar('pedido-1').expect(201);

    expect(resposta.body).toMatchObject({
      pedidoId: 'pedido-1',
      execucao: 'manual_pendente',
      valorCentavos: 250_000,
    });
    expect((await lido('pedidos/pedido-1'))['situacao']).toBe('estornado');
  });

  /**
   * CRITERIO DE ACEITE DA ETAPA 8. O advogado inicia o trabalho pelo caminho de
   * verdade, e a tentativa de estorno e recusada pelo servidor — nao escondida
   * pela interface.
   */
  it('recusa com 409 o pedido em em_elaboracao, e nada muda', async () => {
    const banco = firestoreDeTeste();
    await banco
      .collection('pedidos')
      .doc('pedido-1')
      .update({ advogadoId: 'uid-advogado', distribuido: true });
    await new EntregaveisService(banco).iniciarTrabalho(
      { pedidoId: 'pedido-1', entregavelId: '001' },
      'uid-advogado',
    );

    const resposta = await estornar('pedido-1').expect(409);

    expect(resposta.body.message).toMatch(/ADR-12/);
    expect((await lido('pedidos/pedido-1'))['situacao']).toBe('ativo');
    expect(await lido('estornos/pedido-1')).toEqual({});
  });

  it('o cliente nao estorna, nem o proprio pedido', async () => {
    await estornar('pedido-1', tokenCliente).expect(403);
    expect((await lido('pedidos/pedido-1'))['situacao']).toBe('ativo');
  });

  /**
   * O ESTORNO INTEGRAL DE PONTA A PONTA: o ultimo pedido da cobranca estornado, o
   * evento no outbox, o despachante chamando o gateway, o webhook confirmando — e
   * o webhook reentregue sem duplicar nada.
   */
  it('estorno integral sai pelo outbox e o webhook confirma uma vez so', async () => {
    await estornar('pedido-1').expect(201);
    const segundo = await estornar('pedido-2').expect(201);
    expect(segundo.body.execucao).toBe('gateway_pendente');

    const gateway = app.get<GatewayPagamentoFalso>(GATEWAY_PAGAMENTO);
    const despachante = app.get(DespachanteOutbox);
    const idEvento = `estorno-integral_${cobrancaId}`;

    await expect(despachante.despachar(idEvento)).resolves.toBe('entregue');
    await expect(despachante.despachar(idEvento)).resolves.toBe('ja-entregue');
    expect(gateway.estornos).toHaveLength(1);

    expect((await webhookDeEstorno().expect(200)).body.resultado).toBe(
      'confirmado',
    );
    expect((await webhookDeEstorno().expect(200)).body.resultado).toBe(
      'duplicata',
    );

    for (const pedidoId of ['pedido-1', 'pedido-2']) {
      expect((await lido(`estornos/${pedidoId}`))['execucao']).toBe(
        'gateway_confirmado',
      );
    }
    expect((await lido(`pagamentos/${cobrancaId}`))['estornoGateway']).toBe(
      'confirmado',
    );
  });

  it('lista os estornos pendentes de devolucao manual', async () => {
    await estornar('pedido-1').expect(201);

    const resposta = await request(app.getHttpServer())
      .get('/api/admin/estornos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(resposta.body).toMatchObject([
      { pedidoId: 'pedido-1', execucao: 'manual_pendente' },
    ]);

    await request(app.getHttpServer())
      .post('/api/admin/estornos/pedido-1/execucao-manual')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ observacao: 'Pix devolvido pelo escritorio' })
      .expect(200);
    expect((await lido('estornos/pedido-1'))['execucao']).toBe(
      'manual_executado',
    );
  });
});
