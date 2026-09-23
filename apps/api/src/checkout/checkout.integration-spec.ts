import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Timestamp } from 'firebase-admin/firestore';
import request from 'supertest';
import { VERSAO_TERMOS_CHECKOUT, type NovoProduto } from 'shared';
import { AppModule } from '../app.module.js';
import { configurar, OPCOES_DA_APLICACAO } from '../configurar.js';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { caminhoDoWebhook, eventoNoFormatoReal } from '../arnes-webhook.js';
import { GatewayPagamentoFalso } from '../pagamentos/gateway/gateway-falso.js';
import { GATEWAY_PAGAMENTO } from '../pagamentos/gateway/gateway.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../pagamentos/gateway/modo.js';
import { assinar } from '../pagamentos/webhook/assinatura.js';
import { COLECAO_CHECKOUTS, FOLGA_ANTES_DE_APAGAR_MS } from './checkout.js';

const ANA = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '(61) 99000-0000',
};

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

const CHAVE = '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a';

let app: INestApplication;
let produtos: ProdutosService;

/**
 * O checkout sobre HTTP, com a aplicacao inteira e o Firestore do emulador.
 *
 * O gateway e o FALSO — sem `ABACATEPAY_API_KEY`, e o que `modo.ts` escolhe fora
 * de producao. O que este arquivo prova e o que o dublê do Firestore nao prova: a
 * consulta DENTRO da transacao (o checkout vigente do carrinho), o guard do
 * pre-cadastro na cadeia, e o snapshot gravado de verdade.
 */
beforeEach(async () => {
  await limparEmuladores();
  produtos = new ProdutosService(firestoreDeTeste());
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

async function token(): Promise<string> {
  const { body } = await http()
    .post('/api/pre-cadastros')
    .send(ANA)
    .expect(201);
  return (body as { token: string }).token;
}

function corpo(itens: string[], chave = CHAVE): Record<string, unknown> {
  return {
    itens: itens.map((produtoId) => ({ produtoId })),
    metodo: 'pix',
    comprador: { nome: ANA.nome, email: ANA.email },
    termosVersao: VERSAO_TERMOS_CHECKOUT,
    chaveDoCarrinho: chave,
  };
}

async function documento(id: string): Promise<Record<string, unknown>> {
  const lido = await firestoreDeTeste()
    .collection(COLECAO_CHECKOUTS)
    .doc(id)
    .get();
  return lido.data() ?? {};
}

describe('checkout sobre HTTP', () => {
  it('recusa sem pre-cadastro', async () => {
    const { id } = await produtos.criar(PARECER, 'uid-admin');

    await http()
      .post('/api/checkout')
      .send(corpo([id]))
      .expect(401);
  });

  it('com dois produtos, devolve o PIX pelo total congelado', async () => {
    const liberacao = await token();
    const { id: a } = await produtos.criar(PARECER, 'uid-admin');
    const { id: b } = await produtos.criar(
      { ...PARECER, nome: 'Revisao de contrato', precoCentavos: 120_000 },
      'uid-admin',
    );

    const { body } = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([a, b]))
      .expect(201);

    expect(body).toMatchObject({ metodo: 'pix', totalCentavos: 370_000 });
    expect(body.pix.brCodeBase64).toMatch(/^data:image\/png/);

    const situacao = await http()
      .get(`/api/checkout/${body.checkoutId as string}`)
      .set('x-pre-cadastro', liberacao)
      .expect(200);
    expect(situacao.body).toEqual({ estado: 'aguardando_pagamento' });
  });

  /**
   * O RISCO NOMEADO DA ETAPA 8, contra o banco de verdade: o administrador muda o
   * preco depois do QR. O documento guardou o preco do momento do checkout — e e
   * dele que os pedidos vao nascer.
   */
  it('alterar o produto depois do checkout nao muda o snapshot gravado', async () => {
    const liberacao = await token();
    const { id } = await produtos.criar(PARECER, 'uid-admin');
    const { body } = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([id]))
      .expect(201);

    await produtos.editar(
      id,
      { ...PARECER, nome: 'Parecer Premium', precoCentavos: 990_000 },
      'uid-admin',
    );

    const gravado = await documento(body.checkoutId as string);
    expect(gravado['totalCentavos']).toBe(250_000);
    expect(gravado['itens']).toEqual([
      { produtoOrigemId: id, snapshot: PARECER },
    ]);
  });

  /**
   * A consulta do checkout vigente roda DENTRO da transacao. O dublê aceita isso
   * sem reclamar; o emulador impoe a regra de leitura antes de escrita.
   */
  it('carrinho alterado substitui o checkout anterior', async () => {
    const liberacao = await token();
    const { id: a } = await produtos.criar(PARECER, 'uid-admin');
    const { id: b } = await produtos.criar(
      { ...PARECER, nome: 'Revisao de contrato', precoCentavos: 120_000 },
      'uid-admin',
    );

    const antigo = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([a, b]))
      .expect(201);
    const novo = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([a]))
      .expect(201);

    expect(novo.body.checkoutId).not.toBe(antigo.body.checkoutId);
    expect((await documento(antigo.body.checkoutId as string))['estado']).toBe(
      'substituido',
    );
    expect((await documento(novo.body.checkoutId as string))['estado']).toBe(
      'aguardando_pagamento',
    );
  });

  /**
   * O cartao sai pelo checkout hospedado (ADR-19): a resposta e a pagina do
   * gateway, e o produto cadastrado la e o snapshot, com o preco congelado.
   */
  it('com cartao, devolve a pagina do gateway e mapeia o produto', async () => {
    const liberacao = await token();
    const { id } = await produtos.criar(PARECER, 'uid-admin');

    const { body } = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send({ ...corpo([id, id]), metodo: 'cartao' })
      .expect(201);

    expect(body).toMatchObject({ metodo: 'cartao', totalCentavos: 500_000 });
    expect(body.url).toContain(`/checkout?id=${body.checkoutId as string}`);

    const mapeados = await firestoreDeTeste()
      .collection('produtos-gateway')
      .get();
    expect(mapeados.size).toBe(1);
  });

  it('a retentativa do mesmo carrinho devolve a mesma cobranca', async () => {
    const liberacao = await token();
    const { id } = await produtos.criar(PARECER, 'uid-admin');

    const primeiro = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([id]))
      .expect(201);
    const segundo = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([id]))
      .expect(201);

    expect(segundo.body).toEqual(primeiro.body);
  });

  /**
   * A TTL SO APAGA DOCUMENTO QUE TEM `apagarApos` (Bloco B, item B.3). Um checkout
   * sem o campo guardaria nome e e-mail para sempre, sem nada falhar — o emulador
   * nem executa TTL. Por isso o teste passa por TODO caminho que escreve em
   * `checkouts` e confere o campo no fim, em todos os documentos:
   *
   * - `abrir` grava o documento inteiro (`set`), ja com prazo;
   * - `registrar` regrava o prazo pelo vencimento real da cobranca;
   * - `substituir`, `falhar` e a confirmacao do pagamento fazem `update` — e sao
   *   eles que um campo esquecido num `set` futuro apagaria.
   *
   * Quando ha cobranca, o prazo e o vencimento dela mais a folga do webhook
   * tardio. Sem cobranca (`falhou_cobranca`), e o prazo com que o documento nasceu.
   */
  it('todo documento de checkouts tem apagarApos, em todo caminho de escrita', async () => {
    const liberacao = await token();
    const { id: a } = await produtos.criar(PARECER, 'uid-admin');
    const { id: b } = await produtos.criar(
      { ...PARECER, nome: 'Revisao de contrato', precoCentavos: 120_000 },
      'uid-admin',
    );

    /* abrir + registrar, e depois substituir: o carrinho muda. */
    await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([a, b]))
      .expect(201);
    const { body: vigente } = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([a]))
      .expect(201);

    /* falhar: o gateway recusa a cobranca de outro carrinho. */
    app.get<GatewayPagamentoFalso>(GATEWAY_PAGAMENTO).falharProximas(1);
    await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([b], '5a1e9b3c-2d4f-4e6a-8b7c-9d0e1f2a3b4c'))
      .expect(503);

    /* a confirmacao do pagamento marca o vigente como pago. */
    const checkoutId = vigente.checkoutId as string;
    const cobrancaId = (
      (await documento(checkoutId)) as { cobranca: { id: string } }
    ).cobranca.id;
    const evento = JSON.stringify(
      eventoNoFormatoReal({
        cobrancaId,
        checkoutId,
        valorCentavos: PARECER.precoCentavos,
      }),
    );
    await http()
      .post(caminhoDoWebhook(SEGREDO_WEBHOOK_DESENVOLVIMENTO))
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', assinar(evento, CHAVE_HMAC_DESENVOLVIMENTO))
      .send(evento)
      .expect(200);

    const todos = await firestoreDeTeste().collection(COLECAO_CHECKOUTS).get();
    const estados = todos.docs.map((d) => d.get('estado') as string).sort();
    expect(estados).toEqual(['falhou_cobranca', 'pago', 'substituido']);

    for (const checkout of todos.docs) {
      const apagarApos = checkout.get('apagarApos') as unknown;
      expect(apagarApos).toBeInstanceOf(Timestamp);
      const expiraEm = checkout.get('expiraEm') as Timestamp | null;
      if (expiraEm !== null) {
        expect((apagarApos as Timestamp).toMillis()).toBe(
          expiraEm.toMillis() + FOLGA_ANTES_DE_APAGAR_MS,
        );
      } else {
        expect((apagarApos as Timestamp).toMillis()).toBeGreaterThan(
          Date.now() + FOLGA_ANTES_DE_APAGAR_MS - 60_000,
        );
      }
    }
  });

  it('recusa corpo invalido sem ecoar o comprador', async () => {
    const liberacao = await token();

    const resposta = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send({ ...corpo([]), comprador: { nome: 'Ana Ribeiro', email: 'nao' } })
      .expect(400);

    expect(JSON.stringify(resposta.body)).not.toContain('Ana Ribeiro');
  });

  it('a situacao de outro pre-cadastro e 404', async () => {
    const liberacao = await token();
    const { id } = await produtos.criar(PARECER, 'uid-admin');
    const { body } = await http()
      .post('/api/checkout')
      .set('x-pre-cadastro', liberacao)
      .send(corpo([id]))
      .expect(201);

    const outro = await http()
      .post('/api/pre-cadastros')
      .send({ ...ANA, email: 'bruno@empresa.com.br' })
      .expect(201);

    await http()
      .get(`/api/checkout/${body.checkoutId as string}`)
      .set('x-pre-cadastro', outro.body.token as string)
      .expect(404);
  });
});
