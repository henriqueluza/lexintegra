import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { VERSAO_TERMOS_CHECKOUT, type NovoProduto } from 'shared';
import { AppModule } from './app.module.js';
import { eventoNoFormatoReal } from './arnes-webhook.js';
import { COLECAO_CHECKOUTS } from './checkout/checkout.js';
import { configurar, OPCOES_DA_APLICACAO } from './configurar.js';
import { EmailFalsoTransport } from './email/email-falso.transport.js';
import { EMAIL_TRANSPORT } from './email/email-transport.js';
import { authDeTeste, firestoreDeTeste, limparEmuladores } from './emulador.js';
import { DespachanteOutbox } from './outbox/despachante.service.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from './pagamentos/gateway/modo.js';
import { assinar } from './pagamentos/webhook/assinatura.js';
import { ProdutosService } from './produtos/produtos.service.js';

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

/** O Identity Toolkit do emulador, pelo mesmo caminho que o SDK do navegador usa. */
async function identityToolkit(
  metodo: string,
  corpo: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resposta = await fetch(
    `http://${String(process.env['FIREBASE_AUTH_EMULATOR_HOST'])}` +
      `/identitytoolkit.googleapis.com/v1/accounts:${metodo}?key=chave-de-emulador`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    },
  );
  return (await resposta.json()) as Record<string, unknown>;
}

/**
 * CRITERIO DE ACEITE DA ETAPA 8, de ponta a ponta:
 *
 * > Compra completa: carrinho com dois produtos, pagamento confirmado, dois
 * > pedidos criados, conta ativa, senha definida por link, anamnese preenchida.
 *
 * Tudo pela API de verdade, contra os emuladores. O que NAO e de verdade, e o
 * teste nao finge que e: o gateway e o falso (sem chave de API, e o que `modo.ts`
 * escolhe), o webhook e assinado com os segredos de desenvolvimento, e o e-mail e
 * o transporte falso — o link de definicao de senha e lido dele. A rodada contra o
 * sandbox do AbacatePay e passo humano, no roteiro `docs/runbooks/checkout-sandbox.md`.
 */
describe('compra completa (criterio de aceite da Etapa 8)', () => {
  it('do carrinho com dois produtos a ficha inicial preenchida', async () => {
    /* 1. Pre-cadastro: a vitrine abre. */
    const { body: liberacao } = await http()
      .post('/api/pre-cadastros')
      .send(ANA)
      .expect(201);
    const produtos = new ProdutosService(firestoreDeTeste());
    const parecer = await produtos.criar(PARECER, 'uid-admin');
    const contrato = await produtos.criar(CONTRATO, 'uid-admin');

    /* 2. Checkout com dois produtos: o QR do PIX pelo total congelado. */
    const { body: checkout } = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', (liberacao as { token: string }).token)
      .send({
        itens: [{ produtoId: parecer.id }, { produtoId: contrato.id }],
        metodo: 'pix',
        comprador: { nome: ANA.nome, email: ANA.email },
        termosVersao: VERSAO_TERMOS_CHECKOUT,
        chaveDoCarrinho: '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
      })
      .expect(201);
    expect(checkout).toMatchObject({ metodo: 'pix', totalCentavos: 370_000 });

    /* 3. O gateway confirma o pagamento pelo webhook assinado. */
    const cobrancaId = (
      (
        await firestoreDeTeste()
          .collection(COLECAO_CHECKOUTS)
          .doc((checkout as { checkoutId: string }).checkoutId)
          .get()
      ).data() as { cobranca: { id: string } }
    ).cobranca.id;
    /* No formato do evento REAL do sandbox: sem `id` na raiz, cobranca em `data.transparent`. */
    const evento = JSON.stringify(
      eventoNoFormatoReal({
        cobrancaId,
        checkoutId: (checkout as { checkoutId: string }).checkoutId,
        valorCentavos: 370_000,
      }),
    );
    const { body: webhook } = await http()
      .post(
        `/api/pagamentos/webhook?webhookSecret=${SEGREDO_WEBHOOK_DESENVOLVIMENTO}`,
      )
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', assinar(evento, CHAVE_HMAC_DESENVOLVIMENTO))
      .send(evento)
      .expect(200);
    expect(webhook).toEqual({ recebido: true, resultado: 'confirmado' });

    /* 4. Dois pedidos e uma conta de cliente, habilitada e sem senha. */
    const conta = await authDeTeste().getUserByEmail(ANA.email);
    expect(conta.customClaims).toEqual({ role: 'cliente' });
    expect(conta.disabled).toBe(false);
    const pedidos = await firestoreDeTeste()
      .collection('pedidos')
      .where('clienteId', '==', conta.uid)
      .get();
    expect(pedidos.size).toBe(2);

    /* 5. O e-mail de acesso sai pelo outbox, com o link de definicao de senha. */
    const despacho = await app
      .get(DespachanteOutbox)
      .despachar(`acesso-cliente_${conta.uid}`);
    expect(despacho).toBe('entregue');
    const transporte = app.get<EmailFalsoTransport>(EMAIL_TRANSPORT);
    const mensagem = transporte.enviadas.find((m) =>
      m.para.includes(ANA.email),
    );
    const link = new URL(String(mensagem?.modelo?.variaveis['LINK']));
    expect(link.pathname).toBe('/definir-senha');
    const oobCode = link.searchParams.get('oobCode');
    expect(oobCode).not.toBeNull();

    /* 6. A senha e definida pelo link, e a conta entra com ela. */
    const redefinida = await identityToolkit('resetPassword', {
      oobCode,
      newPassword: 'senha-definida-pelo-link-123',
    });
    expect(redefinida['email']).toBe(ANA.email);
    const entrada = await identityToolkit('signInWithPassword', {
      email: ANA.email,
      password: 'senha-definida-pelo-link-123',
      returnSecureToken: true,
    });
    const idToken = String(entrada['idToken']);
    expect(idToken.length).toBeGreaterThan(20);

    /* 7. A ficha inicial (stub) e exigida, e depois de enviada, esta preenchida. */
    const autenticado = (
      metodo: 'get' | 'post',
      caminho: string,
    ): request.Test =>
      http()[metodo](caminho).set('Authorization', `Bearer ${idToken}`);

    expect(
      (await autenticado('get', '/api/anamnese/situacao').expect(200)).body,
    ).toEqual({ preenchida: false });
    await autenticado('post', '/api/anamnese')
      .send({ respostas: { contexto: 'Venda de participacao societaria.' } })
      .expect(201);
    expect(
      (await autenticado('get', '/api/anamnese/situacao').expect(200)).body,
    ).toEqual({ preenchida: true });

    /* 8. A area do cliente mostra os dois cartoes, ativos. */
    const { body: cartoes } = await autenticado('get', '/api/pedidos').expect(
      200,
    );
    expect(
      (cartoes as { snapshot: { nome: string }; situacao: string }[])
        .map((c) => `${c.snapshot.nome}:${c.situacao}`)
        .sort(),
    ).toEqual([`${PARECER.nome}:ativo`, `${CONTRATO.nome}:ativo`]);
  });
});
