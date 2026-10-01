import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Timestamp } from 'firebase-admin/firestore';
import request from 'supertest';
import { NOME_CLAIM_PERFIL, type NovoProduto } from 'shared';
import { AppModule } from '../app.module.js';
import { comSnapshot } from '../arnes-pedidos.js';
import { caminhoDoWebhook, eventoNoFormatoReal } from '../arnes-webhook.js';
import { configurar, OPCOES_DA_APLICACAO } from '../configurar.js';
import {
  authDeTeste,
  firestoreDeTeste,
  idTokenDe,
  limparEmuladores,
} from '../emulador.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../pagamentos/gateway/modo.js';
import { assinar } from '../pagamentos/webhook/assinatura.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { escutarNoLoopback } from '../arnes-http.js';

/**
 * Bloco B da B2 (`docs/decisoes.md`, 3.3 e 5.4), sobre HTTP e contra o emulador:
 *
 * - o estorno e o cancelamento recusam por cada uma das tres condicoes, e a
 *   recusa diz qual (`motivo`);
 * - reuniao futura e anexo do cliente nao bloqueiam; a futura e cancelada junto;
 * - `produtosContratados` perde o produto, a nao ser que outro pedido ativo o
 *   tenha;
 * - a contestacao pausa os pedidos da cobranca, cancela as reunioes futuras com
 *   devolucao, avisa o cliente pelo outbox e bloqueia TODA acao sobre o pedido;
 * - ganha tira a pausa; perdida estorna e tira o produto.
 */

const PARECER: NovoProduto = {
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico das rotinas atuais.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 0,
  numeroRevisoesPermitidas: 2,
};

const COBRANCA = 'bill_contestada';
const DIA = 24 * 60 * 60 * 1000;

let app: INestApplication;
const tokens: Record<'admin' | 'cliente' | 'advogado', string> = {
  admin: '',
  cliente: '',
  advogado: '',
};

beforeEach(async () => {
  await limparEmuladores();
  const auth = authDeTeste();
  for (const [uid, email, perfil] of [
    ['uid-admin', 'admin@escritorio.test', 'admin'],
    ['uid-ana', 'ana@empresa.com.br', 'cliente'],
    ['uid-adv', 'adv@escritorio.test', 'advogado'],
  ] as const) {
    await auth.createUser({ uid, email });
    await auth.setCustomUserClaims(uid, { [NOME_CLAIM_PERFIL]: perfil });
  }
  tokens.admin = await idTokenDe('uid-admin');
  tokens.cliente = await idTokenDe('uid-ana');
  tokens.advogado = await idTokenDe('uid-adv');

  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: false,
  });
  configurar(app as NestExpressApplication);
  await escutarNoLoopback(app);

  await criarPedidos();
});

afterEach(async () => {
  await app.close();
});

/** Dois pedidos do MESMO produto na mesma cobranca, distribuidos ao advogado. */
async function criarPedidos(): Promise<void> {
  const banco = firestoreDeTeste();
  const pedidos = new PedidosService(banco);
  const { id } = await new ProdutosService(banco).criar(PARECER, 'uid-admin');
  const itens = await comSnapshot(
    pedidos,
    ['pedido-1', 'pedido-2'].map((pedidoId) => ({
      pedidoId,
      clienteId: 'uid-ana',
      pagamentoId: COBRANCA,
      produtoOrigemId: id,
    })),
  );
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(transacao, pedidos.preparar(itens));
  });
  for (const pedidoId of ['pedido-1', 'pedido-2']) {
    await banco
      .collection('pedidos')
      .doc(pedidoId)
      .update({ advogadoId: 'uid-adv', distribuido: true });
  }
  await banco.collection('pagamentos').doc(COBRANCA).set({
    situacao: 'confirmado',
    cobrancaId: COBRANCA,
    origem: 'transparente',
    valorCentavos: 500_000,
  });
  await banco
    .collection('clientes')
    .doc('uid-ana')
    .set({
      nome: 'Ana',
      email: 'ana@empresa.com.br',
      produtosContratados: [PARECER.nome],
    });
  await banco.collection('advogados').doc('uid-adv').set({
    nome: 'Adv',
    email: 'adv@escritorio.test',
    status: 'ativo',
    usuarioTeams: null,
  });
}

/** Uma reuniao ativa direto no banco, com o slot reservado para ela. */
async function reuniao(
  pedidoId: string,
  reuniaoId: string,
  inicioMs: number,
  comunicada = true,
): Promise<string> {
  const banco = firestoreDeTeste();
  const inicio = new Date(inicioMs).toISOString();
  const slotId = `uid-adv_${inicio}`;
  await banco
    .collection('disponibilidades')
    .doc(slotId)
    .set({
      advogadoId: 'uid-adv',
      inicio,
      fim: new Date(inicioMs + 60 * 60 * 1000).toISOString(),
      semana: '2026-W40',
      criadoEm: Timestamp.now(),
      reserva: { pedidoId, reuniaoId },
    });
  await banco
    .collection('pedidos')
    .doc(pedidoId)
    .collection('reunioes')
    .doc(reuniaoId)
    .set({
      uid: `${reuniaoId}@lexintegra.test`,
      sequence: 0,
      sequenceComunicada: comunicada ? 0 : null,
      slotId,
      inicio,
      fim: new Date(inicioMs + 60 * 60 * 1000).toISOString(),
      estado: 'confirmada',
      link: comunicada ? 'https://teams.microsoft.test/r' : null,
      idExterno: null,
      advogadoId: 'uid-adv',
      pedidoId,
      clienteId: 'uid-ana',
      criadoEm: Timestamp.now(),
      historico: [],
    });
  return slotId;
}

async function lido(caminho: string): Promise<Record<string, unknown>> {
  return (await firestoreDeTeste().doc(caminho).get()).data() ?? {};
}

function http(
  metodo: 'get' | 'post' | 'delete',
  caminho: string,
  quem: keyof typeof tokens,
): request.Test {
  const servidor = request(app.getHttpServer());
  return servidor[metodo](caminho).set(
    'Authorization',
    `Bearer ${tokens[quem]}`,
  );
}

function estornar(pedidoId: string): request.Test {
  return http('post', `/api/admin/pedidos/${pedidoId}/estorno`, 'admin').send({
    motivo: 'Cliente desistiu antes de comecar.',
  });
}

function cancelar(pedidoId: string): request.Test {
  return http('post', `/api/pedidos/${pedidoId}/cancelamento`, 'cliente');
}

function webhookDeContestacao(): request.Test {
  const corpo = JSON.stringify(
    eventoNoFormatoReal({
      evento: 'transparent.disputed',
      cobrancaId: COBRANCA,
      checkoutId: 'checkout-1',
      valorCentavos: 500_000,
    }),
  );
  return request(app.getHttpServer())
    .post(caminhoDoWebhook(SEGREDO_WEBHOOK_DESENVOLVIMENTO))
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Signature', assinar(corpo, CHAVE_HMAC_DESENVOLVIMENTO))
    .send(corpo);
}

function resultado(resultadoDaContestacao: 'ganha' | 'perdida'): request.Test {
  return http(
    'post',
    `/api/admin/contestacoes/${COBRANCA}/resultado`,
    'admin',
  ).send({ resultado: resultadoDaContestacao, nota: 'Caso 123 no gateway.' });
}

describe('elegibilidade do estorno e do cancelamento (decisoes.md, 3.3)', () => {
  it.each([
    ['estorno', estornar],
    ['cancelamento', cancelar],
  ] as const)(
    '%s recusa com reuniao ja comecada e diz o motivo',
    async (_caso, operar) => {
      await reuniao('pedido-1', 'r001', Date.now() - DIA);

      const resposta = await operar('pedido-1').expect(409);

      expect(resposta.body).toMatchObject({ motivo: 'reuniao-realizada' });
      expect((await lido('pedidos/pedido-1'))['situacao']).toBe('ativo');
    },
  );

  it.each([
    ['estorno', estornar],
    ['cancelamento', cancelar],
  ] as const)('%s recusa com trabalho iniciado', async (_caso, operar) => {
    await firestoreDeTeste()
      .doc('pedidos/pedido-1/entregaveis/001')
      .update({ estado: 'em_elaboracao' });

    const resposta = await operar('pedido-1').expect(409);

    expect(resposta.body).toMatchObject({ motivo: 'trabalho-iniciado' });
  });

  it('estorno de pedido ja estornado diz a situacao', async () => {
    await estornar('pedido-1').expect(201);
    await firestoreDeTeste().doc('estornos/pedido-1').delete();

    const resposta = await estornar('pedido-1').expect(409);
    expect(resposta.body).toMatchObject({ motivo: 'situacao' });
  });

  it.each([
    ['estorno', estornar, 201],
    ['cancelamento', cancelar, 200],
  ] as const)(
    '%s cancela a reuniao futura junto, com devolucao, e libera o slot',
    async (_caso, operar, status) => {
      const slotId = await reuniao('pedido-1', 'r001', Date.now() + 10 * DIA);

      await operar('pedido-1').expect(status);

      expect((await lido('pedidos/pedido-1/reunioes/r001'))['estado']).toBe(
        'cancelada_com_devolucao',
      );
      expect((await lido(`disponibilidades/${slotId}`))['reserva']).toBeNull();
      const cancelamentos = await firestoreDeTeste()
        .collection('outbox')
        .where('tipo', '==', 'cancelamento-reuniao')
        .get();
      expect(cancelamentos.size).toBe(2);
    },
  );

  it('anexo do cliente nao bloqueia o estorno', async () => {
    await firestoreDeTeste()
      .doc('pedidos/pedido-1/anexos/a1')
      .set({ nome: 'rg.pdf', estado: 'limpo' });

    await estornar('pedido-1').expect(201);
  });

  /**
   * Dois pedidos do mesmo produto: o produto so sai de `produtosContratados`
   * quando o ultimo pedido ativo dele sai.
   */
  it('produtosContratados so perde o produto com o ultimo pedido ativo', async () => {
    await estornar('pedido-1').expect(201);
    expect((await lido('clientes/uid-ana'))['produtosContratados']).toEqual([
      PARECER.nome,
    ]);

    await cancelar('pedido-2').expect(200);
    expect((await lido('clientes/uid-ana'))['produtosContratados']).toEqual([]);
  });
});

describe('contestacao (decisoes.md, 5.4)', () => {
  it('pausa os pedidos, cancela as futuras com devolucao e avisa o cliente', async () => {
    const slotId = await reuniao('pedido-1', 'r001', Date.now() + 10 * DIA);
    await reuniao('pedido-2', 'r001', Date.now() + 11 * DIA, false);

    await webhookDeContestacao().expect(200);

    for (const pedidoId of ['pedido-1', 'pedido-2']) {
      const pedido = await lido(`pedidos/${pedidoId}`);
      expect(pedido['contestacao']).toMatchObject({ cobrancaId: COBRANCA });
      expect(pedido['situacao']).toBe('ativo');
      expect((await lido(`pedidos/${pedidoId}/reunioes/r001`))['estado']).toBe(
        'cancelada_com_devolucao',
      );
    }
    expect((await lido(`disponibilidades/${slotId}`))['reserva']).toBeNull();
    expect(await lido(`contestacoes/${COBRANCA}`)).toMatchObject({
      estado: 'aberta',
      pedidoIds: ['pedido-1', 'pedido-2'],
    });
    expect((await lido(`pagamentos/${COBRANCA}`))['contestacao']).toBe(
      'aberta',
    );

    const outbox = await firestoreDeTeste().collection('outbox').get();
    const tipos = outbox.docs.map((d) => d.data()['tipo'] as string).sort();
    /* So a reuniao comunicada ganha CANCEL; o aviso e um por cliente. */
    expect(tipos).toEqual([
      'cancelamento-reuniao',
      'cancelamento-reuniao',
      'pausa-contestacao',
    ]);
  });

  it('o webhook repetido nao abre de novo nem avisa duas vezes', async () => {
    await webhookDeContestacao().expect(200);
    await webhookDeContestacao().expect(200);

    const avisos = await firestoreDeTeste()
      .collection('outbox')
      .where('tipo', '==', 'pausa-contestacao')
      .get();
    expect(avisos.size).toBe(1);
  });

  /**
   * NENHUMA ALTERACAO POSSIVEL: cliente, advogado e administrador. Cada linha e
   * um ponto de entrada que muda o pedido ou o que pendura nele.
   */
  describe('com o pedido pausado, toda acao responde 409', () => {
    let futuro = '';

    beforeEach(async () => {
      await reuniao('pedido-1', 'r001', Date.now() + 10 * DIA);
      await webhookDeContestacao().expect(200);
      const banco = firestoreDeTeste();
      futuro = new Date(Date.now() + 20 * DIA).toISOString();
      await banco.doc(`disponibilidades/uid-adv_${futuro}`).set({
        advogadoId: 'uid-adv',
        inicio: futuro,
        fim: futuro,
        semana: '2026-W41',
        criadoEm: Timestamp.now(),
        reserva: null,
      });
      await banco.doc('estornos/pedido-1').set({
        pedidoId: 'pedido-1',
        pagamentoId: COBRANCA,
        clienteId: 'uid-ana',
        produto: PARECER.nome,
        valorCentavos: 250_000,
        motivo: 'x',
        execucao: 'manual_pendente',
        solicitadoPor: 'uid-admin',
        solicitadoEm: Timestamp.now(),
      });
    });

    function slotLivre(): string {
      return `uid-adv_${futuro}`;
    }

    const P = '/api/pedidos/pedido-1';
    const A = '/api/advogado/pedidos/pedido-1';
    const ARQUIVO = {
      nome: 'parecer.pdf',
      tipo: 'application/pdf',
      tamanhoBytes: 100,
    };

    it.each([
      [
        'cliente cancela o pedido',
        () => http('post', `${P}/cancelamento`, 'cliente'),
      ],
      /* pedido-2: o pedido-1 tem estorno pendente, e "ja estornado" viria antes. */
      ['admin estorna', () => estornar('pedido-2')],
      [
        'admin registra devolucao manual',
        () =>
          http(
            'post',
            '/api/admin/estornos/pedido-1/execucao-manual',
            'admin',
          ).send({
            observacao: 'Devolvido por PIX.',
          }),
      ],
      [
        'cliente marca reuniao',
        () =>
          http('post', `${P}/reunioes`, 'cliente').send({
            slotId: slotLivre(),
          }),
      ],
      [
        'cliente remarca reuniao',
        () =>
          http('post', `${P}/reunioes/r001/remarcacao`, 'cliente').send({
            slotId: slotLivre(),
          }),
      ],
      [
        'cliente cancela reuniao',
        () => http('post', `${P}/reunioes/r001/cancelamento`, 'cliente'),
      ],
      [
        'admin cancela reuniao',
        () =>
          http(
            'post',
            '/api/admin/reunioes/pedido-1/r001/cancelamento',
            'admin',
          ),
      ],
      [
        'cliente escreve observacao',
        () =>
          http('post', `${P}/observacoes`, 'cliente').send({ texto: 'Oi.' }),
      ],
      [
        'advogado escreve observacao',
        () =>
          http('post', `${A}/observacoes`, 'advogado').send({ texto: 'Oi.' }),
      ],
      [
        'cliente envia anexo',
        () =>
          http('post', `${P}/anexos`, 'cliente').send({ arquivos: [ARQUIVO] }),
      ],
      [
        'cliente aceita termos de download',
        () =>
          http('post', `${P}/entregaveis/001/aceite`, 'cliente').send({
            versaoArquivo: 1,
          }),
      ],
      [
        'advogado inicia trabalho',
        () => http('post', `${A}/entregaveis/001/inicio`, 'advogado'),
      ],
      [
        'advogado envia arquivo',
        () =>
          http('post', `${A}/entregaveis/001/arquivo`, 'advogado').send(
            ARQUIVO,
          ),
      ],
      [
        'cliente confirma entrega',
        () => http('post', `${P}/entregaveis/001/confirmacao`, 'cliente'),
      ],
      [
        'cliente pede revisao',
        () => http('post', `${P}/entregaveis/001/revisao`, 'cliente'),
      ],
      [
        'admin troca o advogado',
        () =>
          http('post', '/api/admin/pedidos/pedido-1/atribuicao', 'admin').send({
            advogadoId: 'uid-adv',
          }),
      ],
      [
        'admin devolve a fila',
        () => http('delete', '/api/admin/pedidos/pedido-1/atribuicao', 'admin'),
      ],
    ] as const)('%s', async (_caso, chamar) => {
      const resposta = await chamar().expect(409);
      expect(String(resposta.body.message)).toMatch(/contestação/);
    });

    it('ler continua livre', async () => {
      await http('get', '/api/pedidos', 'cliente').expect(200);
    });
  });

  it('ganha: a pausa sai e o pedido volta a aceitar acoes', async () => {
    await webhookDeContestacao().expect(200);

    const resposta = await resultado('ganha').expect(200);

    expect(resposta.body).toMatchObject({
      estado: 'ganha',
      cobrancaId: COBRANCA,
    });
    expect((await lido('pedidos/pedido-1'))['contestacao']).toBeNull();
    await cancelar('pedido-1').expect(200);
  });

  it('perdida: os pedidos viram estornados, sem devolucao a fazer, e o produto sai', async () => {
    await webhookDeContestacao().expect(200);

    await resultado('perdida').expect(200);

    for (const pedidoId of ['pedido-1', 'pedido-2']) {
      const pedido = await lido(`pedidos/${pedidoId}`);
      expect(pedido['situacao']).toBe('estornado');
      expect(pedido['contestacao']).toBeNull();
      expect((await lido(`estornos/${pedidoId}`))['execucao']).toBe(
        'contestacao',
      );
    }
    expect((await lido('clientes/uid-ana'))['produtosContratados']).toEqual([]);
    const pendentes = await http('get', '/api/admin/estornos', 'admin').expect(
      200,
    );
    expect(pendentes.body).toEqual([]);
  });

  it('o resultado so se registra uma vez, e so para contestacao que existe', async () => {
    await resultado('ganha').expect(404);
    await webhookDeContestacao().expect(200);
    await resultado('ganha').expect(200);
    await resultado('perdida').expect(409);
  });

  it('a lista do administrador mostra as abertas', async () => {
    await webhookDeContestacao().expect(200);

    const lista = await http('get', '/api/admin/contestacoes', 'admin').expect(
      200,
    );
    expect(lista.body).toEqual([
      expect.objectContaining({ cobrancaId: COBRANCA, estado: 'aberta' }),
    ]);
    await http('get', '/api/admin/contestacoes', 'cliente').expect(403);
  });
});
