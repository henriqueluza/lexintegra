import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configurar, OPCOES_DA_APLICACAO } from '../../configurar.js';
import { firestoreDeTeste, limparEmuladores } from '../../emulador.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../gateway/modo.js';
import { assinar } from './assinatura.js';

let app: INestApplication;

/**
 * O webhook sobre HTTP, com a aplicacao inteira: o corpo cru chegando ao guard,
 * o guard na classe, a assinatura conferida contra os bytes enviados.
 *
 * Sem chave de API, `modo.ts` escolhe o gateway falso e os segredos de
 * desenvolvimento — sao eles que assinam aqui.
 */
async function subir(): Promise<void> {
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await app.init();
}

beforeEach(async () => {
  await limparEmuladores();
  await subir();
});

afterEach(async () => {
  await app.close();
});

const EVENTO = {
  id: 'log_abc123xyz',
  event: 'transparent.completed',
  apiVersion: 2,
  devMode: true,
  data: {
    id: 'pix_char_1',
    amount: 370_000,
    status: 'PAID',
    externalId: 'checkout-inexistente',
  },
};

function enviar(
  corpo: string,
  opcoes: { segredo?: string | null; assinatura?: string | null } = {},
): request.Test {
  const segredo =
    opcoes.segredo === undefined
      ? SEGREDO_WEBHOOK_DESENVOLVIMENTO
      : opcoes.segredo;
  const assinatura =
    opcoes.assinatura === undefined
      ? assinar(corpo, CHAVE_HMAC_DESENVOLVIMENTO)
      : opcoes.assinatura;

  const caminho =
    segredo === null
      ? '/api/pagamentos/webhook'
      : `/api/pagamentos/webhook?webhookSecret=${encodeURIComponent(segredo)}`;
  const requisicao = request(app.getHttpServer())
    .post(caminho)
    .set('Content-Type', 'application/json');
  if (assinatura !== null) requisicao.set('X-Webhook-Signature', assinatura);
  return requisicao.send(corpo);
}

/** Toda colecao que um webhook poderia tocar. Recusa e zero documento. */
async function documentosGravados(): Promise<number> {
  const banco = firestoreDeTeste();
  const colecoes = ['pagamentos', 'pedidos', 'clientes', 'outbox', 'checkouts'];
  const tamanhos = await Promise.all(
    colecoes.map(async (nome) => (await banco.collection(nome).get()).size),
  );
  return tamanhos.reduce((soma, n) => soma + n, 0);
}

describe('webhook do gateway sobre HTTP', () => {
  /**
   * A assinatura e conferida sobre os BYTES. Um corpo com espacos e ordem de chave
   * que `JSON.stringify` nao reproduziria continua valido — e prova que o guard
   * le o corpo cru, e nao o JSON reinterpretado.
   */
  it('aceita o evento assinado, conferindo os bytes enviados', async () => {
    const corpo = `{ "devMode": true,  "id": "log_1", "event": "subscription.completed", "data": {} }`;

    const resposta = await enviar(corpo).expect(200);

    expect(resposta.body).toEqual({ recebido: true, resultado: 'ignorado' });
  });

  /** CRITERIO DE ACEITE DA ETAPA 8: webhook com assinatura invalida e rejeitado. */
  it.each([
    ['sem segredo na URL', { segredo: null }],
    ['com segredo errado', { segredo: 'outro-segredo' }],
    ['sem assinatura', { assinatura: null }],
    [
      'com assinatura de outra chave',
      { assinatura: assinar(JSON.stringify(EVENTO), 'outra') },
    ],
    ['com assinatura em branco', { assinatura: '' }],
  ])('recusa com 401 e sem gravar nada: %s', async (_caso, opcoes) => {
    const resposta = await enviar(JSON.stringify(EVENTO), opcoes).expect(401);

    expect(JSON.stringify(resposta.body)).not.toContain('pix_char_1');
    expect(await documentosGravados()).toBe(0);
  });

  it('recusa corpo alterado depois de assinado', async () => {
    const original = JSON.stringify(EVENTO);
    const alterado = original.replace('370000', '1');

    await enviar(alterado, {
      assinatura: assinar(original, CHAVE_HMAC_DESENVOLVIMENTO),
    }).expect(401);
    expect(await documentosGravados()).toBe(0);
  });

  /** Pagamento de teste nunca cria conta paga, nem assinado de verdade. */
  it('recusa evento com devMode divergente', async () => {
    await enviar(JSON.stringify({ ...EVENTO, devMode: false })).expect(401);
    expect(await documentosGravados()).toBe(0);
  });

  it('evento assinado e ilegivel responde 422', async () => {
    await enviar(
      JSON.stringify({ ...EVENTO, data: { id: 'pix_char_1' } }),
    ).expect(422);
    expect(await documentosGravados()).toBe(0);
  });

  /**
   * Nome de evento fora das listas — o cartao pago chegando com um nome que a
   * documentacao nao mostrou, por exemplo. 200 para o gateway nao insistir, mas
   * `alertado`, e nao `ignorado`: o alerta critico e o que impede o silencio.
   */
  it('evento assinado com nome desconhecido responde alertado, sem gravar', async () => {
    const resposta = await enviar(
      JSON.stringify({ ...EVENTO, event: 'checkout.paid' }),
    ).expect(200);

    expect(resposta.body).toEqual({ recebido: true, resultado: 'alertado' });
    expect(await documentosGravados()).toBe(0);
  });

  it('e publico: nao exige sessao nem App Check', async () => {
    await enviar(
      JSON.stringify({ ...EVENTO, event: 'transfer.completed', data: {} }),
    ).expect(200);
  });
});

describe('webhook com pagamentos desligados', () => {
  const anterior = process.env['PAGAMENTOS_MODO'];

  beforeEach(async () => {
    await app.close();
    process.env['PAGAMENTOS_MODO'] = 'desligado';
    await subir();
  });

  afterEach(() => {
    if (anterior === undefined) delete process.env['PAGAMENTOS_MODO'];
    else process.env['PAGAMENTOS_MODO'] = anterior;
  });

  /** 503, e nao 401: o gateway reentrega quando o modo mudar. */
  it('responde 503', async () => {
    await enviar(JSON.stringify(EVENTO)).expect(503);
  });
});
