import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  NOME_CLAIM_PERFIL,
  VERSAO_TERMOS_CHECKOUT,
  type EstadoEntregavel,
  type NovoProduto,
} from 'shared';
import { AppModule } from '../app.module.js';
import { caminhoDoWebhook, eventoNoFormatoReal } from '../arnes-webhook.js';
import { COLECAO_CHECKOUTS } from '../checkout/checkout.js';
import { configurar, OPCOES_DA_APLICACAO } from '../configurar.js';
import {
  authDeTeste,
  firestoreDeTeste,
  idTokenDe,
  limparEmuladores,
} from '../emulador.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { GatewayPagamentoFalso } from '../pagamentos/gateway/gateway-falso.js';
import { GATEWAY_PAGAMENTO } from '../pagamentos/gateway/gateway.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../pagamentos/gateway/modo.js';
import { assinar } from '../pagamentos/webhook/assinatura.js';
import { ProdutosService } from '../produtos/produtos.service.js';

const ANA = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '(61) 99000-0000',
};

/** Um entregavel, uma revisao: o menor produto que alcanca os tres estados. */
const PARECER: NovoProduto = {
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico das rotinas atuais.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 15,
  numeroRevisoesPermitidas: 1,
};

const ADVOGADO = 'uid-advogado';
const ENTREGAVEL = '001';

let app: INestApplication;
let tokenAdmin: string;
let tokenAdvogado: string;
let tokenCliente: string;
let pedidoId: string;

function http(): request.Agent {
  return request(app.getHttpServer());
}

/**
 * ESTORNO E CANCELAMENTO COM TRABALHO INICIADO, DE PONTA A PONTA (ADR-12; Bloco B,
 * item B.2).
 *
 * O caminho inteiro pela API: pre-cadastro, checkout, webhook assinado,
 * pagamento confirmado, atribuicao pelo administrador, inicio do trabalho pelo
 * advogado — e so entao as duas tentativas, que precisam responder 409 SEM
 * NENHUM EFEITO: nada muda no banco, nenhum evento nasce no outbox, nenhuma
 * chamada vai ao gateway.
 *
 * O CARRINHO TEM UM PRODUTO SO, de proposito. Com um pedido na cobranca, um
 * estorno que escapasse da recusa seria o ULTIMO da cobranca e sairia pelo
 * gateway (estorno integral via outbox). Com dois, o estorno indevido ficaria
 * manual e a assercao sobre o gateway passaria vazia.
 *
 * O ARQUIVO DO ADVOGADO entra pelo servico, e nao pelo upload HTTP: o upload
 * exige URL assinada, varredura e magic bytes, que tem prova propria na Etapa 11
 * e aqui so seriam ruido. `em_revisao` e `entregue` dependem de haver arquivo, nao
 * de ele estar `limpo`. As transicoes, essas sim, vao por HTTP.
 */
beforeEach(async () => {
  await limparEmuladores();
  const auth = authDeTeste();
  await auth.createUser({ uid: 'uid-admin', email: 'admin@escritorio.test' });
  await auth.setCustomUserClaims('uid-admin', { [NOME_CLAIM_PERFIL]: 'admin' });
  await auth.createUser({ uid: ADVOGADO, email: 'advogado@escritorio.test' });
  await auth.setCustomUserClaims(ADVOGADO, {
    [NOME_CLAIM_PERFIL]: 'advogado',
  });
  await firestoreDeTeste().collection('advogados').doc(ADVOGADO).set({
    nome: 'Carlos Prado',
    email: 'advogado@escritorio.test',
    status: 'ativo',
  });
  tokenAdmin = await idTokenDe('uid-admin');
  tokenAdvogado = await idTokenDe(ADVOGADO);

  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await app.init();

  await comprar();
  await http()
    .post(`/api/admin/pedidos/${pedidoId}/atribuicao`)
    .set('Authorization', `Bearer ${tokenAdmin}`)
    .send({ advogadoId: ADVOGADO })
    .expect(200);
});

afterEach(async () => {
  await app.close();
});

/** A compra pelo mesmo caminho de `compra.integration-spec.ts`. */
async function comprar(): Promise<void> {
  const { body: liberacao } = await http()
    .post('/api/pre-cadastros')
    .send(ANA)
    .expect(201);
  const parecer = await new ProdutosService(firestoreDeTeste()).criar(
    PARECER,
    'uid-admin',
  );

  const { body: checkout } = await http()
    .post('/api/checkout')
    .set('x-pre-cadastro', (liberacao as { token: string }).token)
    .send({
      itens: [{ produtoId: parecer.id }],
      metodo: 'pix',
      comprador: { nome: ANA.nome, email: ANA.email },
      termosVersao: VERSAO_TERMOS_CHECKOUT,
      chaveDoCarrinho: '0b8c6f0e-5d1f-4b8e-a2d3-7c9e1f2a3b4c',
    })
    .expect(201);
  const checkoutId = (checkout as { checkoutId: string }).checkoutId;
  const cobrancaId = (
    (
      await firestoreDeTeste()
        .collection(COLECAO_CHECKOUTS)
        .doc(checkoutId)
        .get()
    ).data() as { cobranca: { id: string } }
  ).cobranca.id;

  const evento = JSON.stringify(
    eventoNoFormatoReal({
      cobrancaId,
      checkoutId,
      valorCentavos: PARECER.precoCentavos,
    }),
  );
  const { body: webhook } = await http()
    .post(caminhoDoWebhook(SEGREDO_WEBHOOK_DESENVOLVIMENTO))
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Signature', assinar(evento, CHAVE_HMAC_DESENVOLVIMENTO))
    .send(evento)
    .expect(200);
  expect(webhook).toEqual({ recebido: true, resultado: 'confirmado' });

  const conta = await authDeTeste().getUserByEmail(ANA.email);
  tokenCliente = await idTokenDe(conta.uid);
  pedidoId = `${cobrancaId}_001`;
}

function doEntregavel(area: 'advogado/pedidos' | 'pedidos'): string {
  return `/api/${area}/${pedidoId}/entregaveis/${ENTREGAVEL}`;
}

/** Leva o entregavel ate o estado pedido, pelos eventos de dominio de verdade. */
async function levarAte(estado: EstadoEntregavel): Promise<void> {
  await http()
    .post(`${doEntregavel('advogado/pedidos')}/inicio`)
    .set('Authorization', `Bearer ${tokenAdvogado}`)
    .expect(200);
  if (estado === 'em_elaboracao') return;

  await new EntregaveisService(firestoreDeTeste()).registrarArquivo(
    { pedidoId, entregavelId: ENTREGAVEL },
    {
      nome: 'parecer.pdf',
      tipo: 'application/pdf',
      tamanhoBytes: 1000,
      caminho: `entregaveis/${pedidoId}/${ENTREGAVEL}/parecer`,
    },
    ADVOGADO,
  );
  await http()
    .post(
      `${doEntregavel('pedidos')}/${estado === 'em_revisao' ? 'revisao' : 'confirmacao'}`,
    )
    .set('Authorization', `Bearer ${tokenCliente}`)
    .expect(200);
}

/**
 * Tudo que um estorno ou um cancelamento poderia tocar, documento a documento —
 * inclusive as subcolecoes do pedido. O `outbox` entra inteiro: um evento de
 * estorno nascendo ali e exatamente o efeito que nao pode acontecer.
 */
async function retrato(): Promise<Record<string, unknown>> {
  const banco = firestoreDeTeste();
  const colecoes = [
    'pagamentos',
    'pedidos',
    `pedidos/${pedidoId}/entregaveis`,
    `pedidos/${pedidoId}/entregaveis/${ENTREGAVEL}/transicoes`,
    'estornos',
    'outbox',
    'clientes',
    COLECAO_CHECKOUTS,
  ];
  const lidas = await Promise.all(
    colecoes.map(async (caminho) => {
      const documentos = await banco.collection(caminho).get();
      return [
        caminho,
        Object.fromEntries(documentos.docs.map((d) => [d.id, d.data()])),
      ] as const;
    }),
  );
  return Object.fromEntries(lidas);
}

describe('estorno e cancelamento com trabalho iniciado (ADR-12)', () => {
  it.each<EstadoEntregavel>(['em_elaboracao', 'em_revisao', 'entregue'])(
    'com o entregavel em %s: 409 nos dois, e nada muda',
    async (estado) => {
      await levarAte(estado);
      const pedido = (
        await firestoreDeTeste().doc(`pedidos/${pedidoId}`).get()
      ).data();
      expect(pedido?.['situacao']).toBe('ativo');
      expect(pedido?.['advogadoId']).toBe(ADVOGADO);
      expect(
        (
          await firestoreDeTeste()
            .doc(`pedidos/${pedidoId}/entregaveis/${ENTREGAVEL}`)
            .get()
        ).data()?.['estado'],
      ).toBe(estado);
      const antes = await retrato();

      const estorno = await http()
        .post(`/api/admin/pedidos/${pedidoId}/estorno`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ motivo: 'Cliente pediu o dinheiro de volta.' })
        .expect(409);
      const cancelamento = await http()
        .post(`/api/pedidos/${pedidoId}/cancelamento`)
        .set('Authorization', `Bearer ${tokenCliente}`)
        .expect(409);

      expect(estorno.body.message).toMatch(/ADR-12/);
      expect(cancelamento.body.message).toMatch(/ADR-12/);
      const depois = await retrato();
      expect(depois).toEqual(antes);
      expect(app.get<GatewayPagamentoFalso>(GATEWAY_PAGAMENTO).estornos).toEqual(
        [],
      );
      expect(
        Object.keys(depois['outbox'] as Record<string, unknown>).filter((id) =>
          id.startsWith('estorno-integral_'),
        ),
      ).toEqual([]);
    },
  );
});
