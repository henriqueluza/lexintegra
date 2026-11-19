import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { AlertaFalso } from '../alertas/alerta.js';
import { comSnapshot } from '../arnes-pedidos.js';
import { FirestoreFalso } from '../firestore-falso.js';
import type { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { configuracaoDoOutbox } from '../outbox/politica.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { ContestacoesService } from './contestacoes.service.js';

const COBRANCA = 'bill_1';
const AGORA = Date.parse('2026-10-01T12:00:00Z');
const FUTURO = '2026-10-10T12:00:00.000Z';

const PARECER: NovoProduto = {
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 0,
  numeroRevisoesPermitidas: 1,
  parcelas: 1,
  tipoCobranca: 'assinatura',
  descricaoDetalhada:
    'Texto detalhado do produto, com o que ele cobre e como funciona.',
};

interface Arranjo {
  banco: FirestoreFalso;
  servico: ContestacoesService;
  alertas: AlertaFalso;
  enfileirados: string[];
}

async function montar(): Promise<Arranjo> {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  const pedidos = new PedidosService(db);
  const { id } = await new ProdutosService(db).criar(PARECER, 'uid-admin');
  const congelados = await comSnapshot(
    pedidos,
    ['pedido-1', 'pedido-2'].map((pedidoId) => ({
      pedidoId,
      clienteId: 'uid-ana',
      pagamentoId: COBRANCA,
      produtoOrigemId: id,
    })),
  );
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(
      transacao as unknown as Transaction,
      pedidos.preparar(congelados),
    );
  });
  banco.documentos.set(`pagamentos/${COBRANCA}`, { situacao: 'confirmado' });
  banco.documentos.set('clientes/uid-ana', {
    produtosContratados: [PARECER.nome],
  });
  banco.documentos.set('pedidos/pedido-1/reunioes/r001', {
    estado: 'confirmada',
    inicio: FUTURO,
    sequence: 0,
    sequenceComunicada: 0,
    link: 'https://teams.test/sala',
    idExterno: 'sala_1',
    slotId: `uid-adv_${FUTURO}`,
    clienteId: 'uid-ana',
    advogadoId: 'uid-adv',
  });
  banco.documentos.set(`disponibilidades/uid-adv_${FUTURO}`, {
    reserva: { pedidoId: 'pedido-1', reuniaoId: 'r001' },
  });

  const enfileirados: string[] = [];
  const alertas = new AlertaFalso();
  return {
    banco,
    alertas,
    enfileirados,
    servico: new ContestacoesService(
      db,
      new OutboxService(db, configuracaoDoOutbox({})),
      {
        enfileirarPorId: (idEvento: string) => {
          enfileirados.push(idEvento);
          return Promise.resolve();
        },
      } as unknown as EnfileiradorDeEventos,
      alertas,
    ),
  };
}

function doc(arranjo: Arranjo, caminho: string): Record<string, unknown> {
  return arranjo.banco.documentos.get(caminho) ?? {};
}

describe('ContestacoesService', () => {
  it('abre: pausa os pedidos, cancela a futura e avisa o cliente', async () => {
    const arranjo = await montar();

    expect(await arranjo.servico.abrir(COBRANCA, 'log_1', AGORA)).toBe(true);

    for (const pedidoId of ['pedido-1', 'pedido-2']) {
      expect(doc(arranjo, `pedidos/${pedidoId}`)['contestacao']).toMatchObject({
        cobrancaId: COBRANCA,
      });
    }
    expect(doc(arranjo, 'pedidos/pedido-1/reunioes/r001')).toMatchObject({
      estado: 'cancelada_com_devolucao',
      sequence: 1,
    });
    expect(doc(arranjo, `disponibilidades/uid-adv_${FUTURO}`)['reserva']).toBe(
      null,
    );
    expect(doc(arranjo, `contestacoes/${COBRANCA}`)).toMatchObject({
      estado: 'aberta',
      clienteId: 'uid-ana',
      pedidoIds: ['pedido-1', 'pedido-2'],
    });
    expect(doc(arranjo, `pagamentos/${COBRANCA}`)['contestacao']).toBe(
      'aberta',
    );
    /* O aviso, os dois CANCEL e o DELETE da sala da reuniao futura. */
    expect(arranjo.enfileirados).toHaveLength(4);
    expect(arranjo.enfileirados).toContain(
      `pausa-contestacao_${COBRANCA}_uid-ana`,
    );
    expect(arranjo.enfileirados).toContain(
      'remover-sala-reuniao_pedido-1_r001',
    );
  });

  it('abrir de novo nao faz nada', async () => {
    const arranjo = await montar();
    await arranjo.servico.abrir(COBRANCA, 'log_1', AGORA);
    arranjo.enfileirados.length = 0;

    expect(await arranjo.servico.abrir(COBRANCA, 'log_2', AGORA)).toBe(false);
    expect(arranjo.enfileirados).toEqual([]);
  });

  it('cobranca sem pedido abre o registro, sem e-mail', async () => {
    const arranjo = await montar();

    await arranjo.servico.abrir('bill_orfa', 'log_1', AGORA);

    expect(doc(arranjo, 'contestacoes/bill_orfa')).toMatchObject({
      pedidoIds: [],
      clienteId: null,
    });
    expect(arranjo.enfileirados).toEqual([]);
  });

  it('ganha: tira a pausa e nao estorna nada', async () => {
    const arranjo = await montar();
    await arranjo.servico.abrir(COBRANCA, 'log_1', AGORA);

    const resumo = await arranjo.servico.resolver(
      COBRANCA,
      { resultado: 'ganha', nota: 'Caso 1.' },
      'uid-admin',
    );

    expect(resumo).toMatchObject({ estado: 'ganha', nota: 'Caso 1.' });
    expect(doc(arranjo, 'pedidos/pedido-1')['contestacao']).toBeNull();
    expect(doc(arranjo, 'pedidos/pedido-1')['situacao']).toBe('ativo');
    expect(arranjo.banco.documentos.has('estornos/pedido-1')).toBe(false);
    expect(doc(arranjo, `pagamentos/${COBRANCA}`)['contestacao']).toBe('ganha');
  });

  it('perdida: estorna com execucao contestacao e tira o produto', async () => {
    const arranjo = await montar();
    await arranjo.servico.abrir(COBRANCA, 'log_1', AGORA);

    await arranjo.servico.resolver(
      COBRANCA,
      { resultado: 'perdida', nota: 'Caso 2.' },
      'uid-admin',
    );

    for (const pedidoId of ['pedido-1', 'pedido-2']) {
      expect(doc(arranjo, `pedidos/${pedidoId}`)['situacao']).toBe('estornado');
      expect(doc(arranjo, `estornos/${pedidoId}`)).toMatchObject({
        execucao: 'contestacao',
        motivo: 'Contestacao perdida: Caso 2.',
      });
    }
    expect(doc(arranjo, 'clientes/uid-ana')['produtosContratados']).toEqual([]);
    expect(arranjo.alertas.emitidos).toEqual([]);
  });

  /**
   * O escritorio ja tinha devolvido um pedido, e o cliente ganhou o chargeback:
   * dinheiro devolvido duas vezes. O pendente vira `contestacao`; o executado
   * vira alerta.
   */
  it('perdida sobre estorno ja devolvido emite alerta; o pendente nao devolve mais', async () => {
    const arranjo = await montar();
    arranjo.banco.documentos.set('estornos/pedido-1', {
      execucao: 'manual_executado',
    });
    arranjo.banco.documentos.set('estornos/pedido-2', {
      execucao: 'manual_pendente',
    });
    await arranjo.servico.abrir(COBRANCA, 'log_1', AGORA);

    await arranjo.servico.resolver(
      COBRANCA,
      { resultado: 'perdida', nota: 'Caso 3.' },
      'uid-admin',
    );

    expect(doc(arranjo, 'estornos/pedido-1')['execucao']).toBe(
      'manual_executado',
    );
    expect(doc(arranjo, 'estornos/pedido-2')['execucao']).toBe('contestacao');
    expect(arranjo.alertas.emitidos).toEqual([
      expect.objectContaining({
        assunto: 'pagamento.contestacao-sobre-estorno',
        detalhe: expect.stringContaining('pedido-1'),
      }),
    ]);
  });

  it('resolver: 404 sem contestacao, 409 se ja encerrada', async () => {
    const arranjo = await montar();
    const decisao = { resultado: 'ganha' as const, nota: 'Caso 4.' };

    await expect(
      arranjo.servico.resolver(COBRANCA, decisao, 'uid-admin'),
    ).rejects.toThrow(NotFoundException);

    await arranjo.servico.abrir(COBRANCA, 'log_1', AGORA);
    await arranjo.servico.resolver(COBRANCA, decisao, 'uid-admin');
    await expect(
      arranjo.servico.resolver(COBRANCA, decisao, 'uid-admin'),
    ).rejects.toThrow(ConflictException);
  });

  it('lista as abertas', async () => {
    const arranjo = await montar();
    await arranjo.servico.abrir(COBRANCA, 'log_1', AGORA);

    expect(await arranjo.servico.listar()).toEqual([
      expect.objectContaining({ cobrancaId: COBRANCA, estado: 'aberta' }),
    ]);
  });
});
