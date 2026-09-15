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
import { ProdutosService } from '../produtos/produtos.service.js';
import { PedidosService } from './pedidos.service.js';

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

let app: INestApplication;
let tokenAna: string;
let tokenBruno: string;

/**
 * CRITERIO DE ACEITE DA ETAPA 8, sobre HTTP e contra o emulador: cancelar um
 * pedido nao afeta a conta do cliente nem os demais pedidos.
 *
 * "Nao afeta" e conferido campo a campo: o outro pedido e seus entregaveis, o
 * documento do cliente, a conta no Auth (habilitada, com a mesma claim) — antes e
 * depois do cancelamento, comparados inteiros.
 */
beforeEach(async () => {
  await limparEmuladores();
  const auth = authDeTeste();
  for (const uid of ['uid-ana', 'uid-bruno']) {
    await auth.createUser({ uid, email: `${uid}@exemplo.test` });
    await auth.setCustomUserClaims(uid, { [NOME_CLAIM_PERFIL]: 'cliente' });
  }
  tokenAna = await idTokenDe('uid-ana');
  tokenBruno = await idTokenDe('uid-bruno');

  const banco = firestoreDeTeste();
  const pedidos = new PedidosService(banco);
  const { id } = await new ProdutosService(banco).criar(PARECER, 'uid-admin');
  const itens = await comSnapshot(
    pedidos,
    ['pedido-1', 'pedido-2'].map((pedidoId) => ({
      pedidoId,
      clienteId: 'uid-ana',
      pagamentoId: 'pix_char_1',
      produtoOrigemId: id,
    })),
  );
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(transacao, pedidos.preparar(itens));
  });
  await banco
    .collection('clientes')
    .doc('uid-ana')
    .set({
      nome: 'Ana Ribeiro',
      email: 'uid-ana@exemplo.test',
      nomeNormalizado: 'ana ribeiro',
      emailNormalizado: 'uid-ana@exemplo.test',
      produtosContratados: [PARECER.nome],
      criadoEm: new Date('2026-09-01T00:00:00Z'),
    });

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

function cancelar(pedidoId: string, token = tokenAna): request.Test {
  return request(app.getHttpServer())
    .post(`/api/pedidos/${pedidoId}/cancelamento`)
    .set('Authorization', `Bearer ${token}`);
}

/** Tudo que o cancelamento NAO pode tocar. */
async function retrato(): Promise<unknown> {
  const banco = firestoreDeTeste();
  const outro = await banco.doc('pedidos/pedido-2').get();
  const entregaveisDoOutro = await banco
    .collection('pedidos/pedido-2/entregaveis')
    .get();
  const entregaveisDoCancelado = await banco
    .collection('pedidos/pedido-1/entregaveis')
    .get();
  const conta = await authDeTeste().getUser('uid-ana');
  return {
    outroPedido: outro.data(),
    entregaveisDoOutro: entregaveisDoOutro.docs.map((d) => d.data()),
    entregaveisDoCancelado: entregaveisDoCancelado.docs.map((d) => d.data()),
    cliente: (await banco.doc('clientes/uid-ana').get()).data(),
    conta: { disabled: conta.disabled, claims: conta.customClaims },
  };
}

describe('cancelamento sobre HTTP (ADR-12)', () => {
  it('cancela o pedido sem afetar a conta nem os demais pedidos', async () => {
    const antes = await retrato();

    const resposta = await cancelar('pedido-1').expect(200);

    expect(resposta.body).toEqual({ situacao: 'cancelado' });
    expect(
      (await firestoreDeTeste().doc('pedidos/pedido-1').get()).data()?.[
        'situacao'
      ],
    ).toBe('cancelado');
    expect(await retrato()).toEqual(antes);

    /* A conta continua entrando: o token da cliente segue valendo na area dela. */
    const cartoes = await request(app.getHttpServer())
      .get('/api/pedidos')
      .set('Authorization', `Bearer ${tokenAna}`)
      .expect(200);
    expect(
      (cartoes.body as { id: string; situacao: string }[])
        .map((c) => `${c.id}:${c.situacao}`)
        .sort(),
    ).toEqual(['pedido-1:cancelado', 'pedido-2:ativo']);
  });

  it('recusa com 409 o pedido com trabalho iniciado', async () => {
    const banco = firestoreDeTeste();
    await banco
      .doc('pedidos/pedido-1')
      .update({ advogadoId: 'uid-advogado', distribuido: true });
    await new EntregaveisService(banco).iniciarTrabalho(
      { pedidoId: 'pedido-1', entregavelId: '001' },
      'uid-advogado',
    );

    const resposta = await cancelar('pedido-1').expect(409);

    expect(resposta.body.message).toMatch(/ADR-12/);
    expect(
      (await banco.doc('pedidos/pedido-1').get()).data()?.['situacao'],
    ).toBe('ativo');
  });

  /** 404, e nao 403: nao se confirma a outro cliente que o pedido existe. */
  it('pedido de outro cliente e 404', async () => {
    await cancelar('pedido-1', tokenBruno).expect(404);
  });

  it('pedido cancelado nao pode mais ser iniciado pelo advogado', async () => {
    const banco = firestoreDeTeste();
    await banco
      .doc('pedidos/pedido-1')
      .update({ advogadoId: 'uid-advogado', distribuido: true });
    await cancelar('pedido-1').expect(200);

    await expect(
      new EntregaveisService(banco).iniciarTrabalho(
        { pedidoId: 'pedido-1', entregavelId: '001' },
        'uid-advogado',
      ),
    ).rejects.toThrow('cancelado ou estornado');
  });
});
