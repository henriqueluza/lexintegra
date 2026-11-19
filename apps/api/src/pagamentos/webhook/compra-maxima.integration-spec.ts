import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  TETO_DESCRICAO_DETALHADA,
  TETO_ENTREGAVEIS_POR_PRODUTO,
  TETO_ITENS_CARRINHO,
  VERSAO_TERMOS_CHECKOUT,
  type NovoProduto,
} from 'shared';
import { AppModule } from '../../app.module.js';
import { escutarNoLoopback } from '../../arnes-http.js';
import { caminhoDoWebhook, eventoNoFormatoReal } from '../../arnes-webhook.js';
import { COLECAO_CHECKOUTS } from '../../checkout/checkout.js';
import { configurar, OPCOES_DA_APLICACAO } from '../../configurar.js';
import { firestoreDeTeste, limparEmuladores } from '../../emulador.js';
import { ProdutosService } from '../../produtos/produtos.service.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../gateway/modo.js';
import { assinar } from './assinatura.js';

/**
 * O PIOR CARRINHO CONFIRMA NUM COMMIT SO.
 *
 * A confirmacao cria o pagamento, todos os pedidos, todos os entregaveis e a
 * primeira transicao de cada um numa transacao unica (arquitetura 5.2). Com o
 * teto de itens do carrinho e o teto de entregaveis por produto, sao mais de mil
 * e duzentas escritas. O Firestore deixou de limitar o numero de escritas por
 * commit em 29/03/2023; o limite que resta e o tamanho da requisicao, 10 MiB.
 *
 * Este teste prova as duas metades que dependem de nos: que o emulador aceita o
 * commit inteiro (nenhum teto de escritas escondido no caminho) e que o volume
 * gravado fica muito abaixo dos 10 MiB, mesmo com cada texto no tamanho maximo
 * do schema. Subir `TETO_ITENS_CARRINHO` ou `TETO_ENTREGAVEIS_POR_PRODUTO` sem
 * que isto continue verde e pagamento sem pedido esperando acontecer.
 */

const UM_MIB = 1024 * 1024;

const ANA = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '(61) 99000-0000',
};

const PRECO_CENTAVOS = 10_000;

/** Cada texto no tamanho maximo do schema, so com letras: o gateway falso recusa o que o real recusa. */
function texto(prefixo: string, tamanho: number): string {
  return `${prefixo} ${'a'.repeat(tamanho)}`.slice(0, tamanho);
}

const MAXIMO: NovoProduto = {
  nome: texto('Produto maximo', 120),
  descricao: texto('Descricao', 2000),
  precoCentavos: PRECO_CENTAVOS,
  entregaveis: Array.from({ length: TETO_ENTREGAVEIS_POR_PRODUTO }, (_, i) =>
    texto(`Entregavel ${String(i + 1)}`, 160),
  ),
  textosOrientativos: Array.from({ length: 10 }, (_, i) =>
    texto(`Orientacao ${String(i + 1)}`, 2000),
  ),
  quantidadeReunioes: 50,
  prazoValidadeReunioesDias: 3650,
  intervaloMinimoReunioesDias: 365,
  numeroRevisoesPermitidas: 20,
  parcelas: 1,
  tipoCobranca: 'assinatura',
  descricaoDetalhada: texto('Descricao detalhada', TETO_DESCRICAO_DETALHADA),
};

let app: INestApplication;

beforeEach(async () => {
  await limparEmuladores();
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await escutarNoLoopback(app);
});

afterEach(async () => {
  await app.close();
});

function http(): request.Agent {
  return request(app.getHttpServer());
}

it('o carrinho maximo vira todos os pedidos, entregaveis e trilhas', async () => {
  const banco = firestoreDeTeste();
  const { token } = (
    await http().post('/api/pre-cadastros').send(ANA).expect(201)
  ).body as { token: string };
  const produtoId = (
    await new ProdutosService(banco).criar(MAXIMO, 'uid-admin')
  ).id;

  const { body } = await http()
    .post('/api/checkout')
    .set('x-pre-cadastro', token)
    .send({
      itens: Array.from({ length: TETO_ITENS_CARRINHO }, () => ({ produtoId })),
      metodo: 'pix',
      comprador: { nome: ANA.nome, email: ANA.email },
      termosVersao: VERSAO_TERMOS_CHECKOUT,
      chaveDoCarrinho: '0b9f6c1e-3d2a-4f5b-8c7d-6e5f4a3b2c1d',
    })
    .expect(201);
  const checkoutId = (body as { checkoutId: string }).checkoutId;
  const checkout = await banco
    .collection(COLECAO_CHECKOUTS)
    .doc(checkoutId)
    .get();
  const cobrancaId = (checkout.data() as { cobranca: { id: string } }).cobranca
    .id;

  const corpo = JSON.stringify(
    eventoNoFormatoReal({
      cobrancaId,
      checkoutId,
      valorCentavos: PRECO_CENTAVOS * TETO_ITENS_CARRINHO,
    }),
  );
  const resposta = await http()
    .post(caminhoDoWebhook(SEGREDO_WEBHOOK_DESENVOLVIMENTO))
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Signature', assinar(corpo, CHAVE_HMAC_DESENVOLVIMENTO))
    .send(corpo)
    .expect(200);
  expect(resposta.body).toEqual({ recebido: true, resultado: 'confirmado' });

  const pedidos = await banco
    .collection('pedidos')
    .where('pagamentoId', '==', cobrancaId)
    .get();
  const entregaveis = await banco.collectionGroup('entregaveis').get();
  const transicoes = await banco.collectionGroup('transicoes').get();
  const totalDeEntregaveis = TETO_ITENS_CARRINHO * TETO_ENTREGAVEIS_POR_PRODUTO;
  expect(pedidos.size).toBe(TETO_ITENS_CARRINHO);
  expect(entregaveis.size).toBe(totalDeEntregaveis);
  expect(transicoes.size).toBe(totalDeEntregaveis);

  /*
   * Estimativa do tamanho do commit pelo que foi gravado. JSON superestima o
   * formato binario da requisicao, entao caber com folga aqui e caber la.
   */
  const gravado = [...pedidos.docs, ...entregaveis.docs, ...transicoes.docs]
    .map((documento) => JSON.stringify(documento.data()).length)
    .reduce((soma, tamanho) => soma + tamanho, 0);
  expect(gravado).toBeLessThan(UM_MIB);
}, 120_000);
