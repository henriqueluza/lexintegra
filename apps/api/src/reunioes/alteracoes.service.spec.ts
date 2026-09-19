import { ConflictException, NotFoundException } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { ConfiguracaoDoOutbox } from '../outbox/politica.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { AlteracoesDeReuniaoService } from './alteracoes.service.js';
import type { DocumentoReuniao } from './reuniao.js';

const CONFIG_OUTBOX: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 0,
  arrendamentoMs: 900_000,
  loteDoVarredor: 100,
};

const PEDIDO = 'pedido-1';
const CLIENTE = 'uid-clara';
const ADVOGADO = 'uid-ana';

const VELHO = '2026-09-24T17:00:00.000Z';
const NOVO = '2026-10-08T17:00:00.000Z';
const SLOT_VELHO = `${ADVOGADO}_${VELHO}`;
const SLOT_NOVO = `${ADVOGADO}_${NOVO}`;

const AGORA = Date.parse('2026-09-01T12:00:00.000Z');
const COMPRA = Date.parse('2026-08-01T12:00:00.000Z');
const ALVO = { pedidoId: PEDIDO, reuniaoId: 'r001' };

const REUNIAO: DocumentoReuniao = {
  uid: 'pedido-1-r001@lexintegra.com.br',
  sequence: 0,
  sequenceComunicada: 0,
  slotId: SLOT_VELHO,
  inicio: VELHO,
  fim: '2026-09-24T18:00:00.000Z',
  estado: 'confirmada',
  link: 'https://teams.test/sala',
  idExterno: 'sala_1',
  advogadoId: ADVOGADO,
  clienteId: CLIENTE,
  criadoEm: Timestamp.fromMillis(COMPRA),
  historico: [],
};

interface Ajustes {
  readonly reuniao?: Partial<DocumentoReuniao>;
  readonly slotNovo?: Record<string, unknown>;
  readonly pedido?: Record<string, unknown>;
  readonly advogado?: Record<string, unknown>;
}

function montar(ajustes: Ajustes = {}): {
  servico: AlteracoesDeReuniaoService;
  banco: FirestoreFalso;
  fila: FilaFalsa<TarefaDeEvento>;
} {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;

  banco.documentos.set(`pedidos/${PEDIDO}`, {
    clienteId: CLIENTE,
    advogadoId: ADVOGADO,
    distribuido: true,
    situacao: 'ativo',
    criadoEm: Timestamp.fromMillis(COMPRA),
    reunioesEmitidas: 1,
    snapshot: {
      nome: 'Revisao de contrato',
      quantidadeReunioes: 1,
      prazoValidadeReunioesDias: 365,
      intervaloMinimoReunioesDias: 7,
      numeroRevisoesPermitidas: 2,
    },
    ...ajustes.pedido,
  });

  banco.documentos.set(`pedidos/${PEDIDO}/reunioes/r001`, {
    ...REUNIAO,
    ...ajustes.reuniao,
  });

  banco.documentos.set(`disponibilidades/${SLOT_VELHO}`, {
    advogadoId: ADVOGADO,
    inicio: VELHO,
    fim: '2026-09-24T18:00:00.000Z',
    semana: '2026-09-21',
    reserva: { pedidoId: PEDIDO, reuniaoId: 'r001' },
  });

  banco.documentos.set(`disponibilidades/${SLOT_NOVO}`, {
    advogadoId: ADVOGADO,
    inicio: NOVO,
    fim: '2026-10-08T18:00:00.000Z',
    semana: '2026-10-05',
    reserva: null,
    ...ajustes.slotNovo,
  });

  banco.documentos.set(`advogados/${ADVOGADO}`, {
    nome: 'Ana Souza',
    status: 'ativo',
    ...ajustes.advogado,
  });

  const fila = new FilaFalsa<TarefaDeEvento>();
  const outbox = new OutboxService(db, CONFIG_OUTBOX);

  return {
    servico: new AlteracoesDeReuniaoService(
      db,
      outbox,
      new EnfileiradorDeEventos(outbox, fila),
    ),
    banco,
    fila,
  };
}

describe('AlteracoesDeReuniaoService.remarcar', () => {
  /**
   * O DOCUMENTO NAO MUDA DE ID (ADR-21, decisao A). O `externalId` da sala no
   * Graph E o id da reuniao: um id que mudasse criaria uma segunda sala a cada
   * remarcacao.
   */
  it('atualiza o MESMO documento, sem criar outro', async () => {
    const { servico, banco } = montar();

    const resumo = await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    expect(resumo.id).toBe('r001');
    expect(resumo.inicio).toBe(NOVO);
    expect(banco.documentos.has(`pedidos/${PEDIDO}/reunioes/r002`)).toBe(false);
    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ slotId: SLOT_NOVO, inicio: NOVO, sequence: 1 });
  });

  /** Regra inviolavel 12: o `UID` nunca muda, so o `SEQUENCE` sobe. */
  it('mantem o UID e incrementa o SEQUENCE', async () => {
    const { servico, banco } = montar();

    await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({
      uid: 'pedido-1-r001@lexintegra.com.br',
      sequence: 1,
      sequenceComunicada: 1,
    });
  });

  it('libera o slot antigo e reserva o novo', async () => {
    const { servico, banco } = montar();

    await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    expect(banco.documentos.get(`disponibilidades/${SLOT_VELHO}`)).toMatchObject(
      { reserva: null },
    );
    expect(banco.documentos.get(`disponibilidades/${SLOT_NOVO}`)).toMatchObject({
      reserva: { pedidoId: PEDIDO, reuniaoId: 'r001' },
    });
  });

  it('empilha a passagem pelo slot antigo no historico', async () => {
    const { servico, banco } = montar();

    await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    const reuniao = banco.documentos.get(
      `pedidos/${PEDIDO}/reunioes/r001`,
    ) as unknown as DocumentoReuniao;
    expect(reuniao.historico).toEqual([
      { slotId: SLOT_VELHO, inicio: VELHO, saidaEm: expect.any(String) },
    ]);
  });

  it('escreve os dois convites com o sequence novo', async () => {
    const { servico, banco, fila } = montar();

    await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    expect(
      banco.documentos.has(`outbox/convite-reuniao_${PEDIDO}_r001_s1_${CLIENTE}`),
    ).toBe(true);
    expect(
      banco.documentos.has(`outbox/convite-reuniao_${PEDIDO}_r001_s1_${ADVOGADO}`),
    ).toBe(true);
    expect(fila.tarefas).toHaveLength(2);
  });

  /** A serializacao por pedido, a mesma do agendamento. */
  it('toca o documento do pedido', async () => {
    const { servico, banco } = montar();

    await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    expect(banco.documentos.get(`pedidos/${PEDIDO}`)).toMatchObject({
      reunioesVersao: 1,
    });
  });

  /**
   * `reunioesEmitidas` NAO muda: ele e a fonte do id sequencial, e incrementa-lo
   * faria o proximo agendamento pular um numero.
   */
  it('nao mexe no contador de ids', async () => {
    const { servico, banco } = montar();

    await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    expect(banco.documentos.get(`pedidos/${PEDIDO}`)).toMatchObject({
      reunioesEmitidas: 1,
    });
  });

  /**
   * A PROPRIA REUNIAO NAO CONTA CONTRA SI MESMA. O pedido tem saldo 1 e ja tem
   * uma reuniao: sem `ignorarReuniaoId`, a remarcacao seria recusada por saldo
   * esgotado — e pelo intervalo minimo contra o proprio horario velho.
   */
  it('remarca mesmo com o saldo cheio e o intervalo apertado', async () => {
    const { servico } = montar();

    await expect(
      servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA),
    ).resolves.toMatchObject({ inicio: NOVO });
  });

  /* ---------------------------------------------------------------------- */
  /* Recusas                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * AS 24 HORAS MEDEM CONTRA O `inicio` ATUAL (ADR-21, decisao 6). Sem esta
   * trava, remarcar seria a forma obvia de contornar a regra do ADR-12.
   */
  it('recusa remarcacao com menos de 24h do inicio atual', async () => {
    const { servico } = montar();
    const vespera = Date.parse(VELHO) - 3_600_000;

    await expect(
      servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, vespera),
    ).rejects.toThrow(/24 horas/);
  });

  it('aceita exatamente 24h antes do inicio atual', async () => {
    const { servico } = montar();
    const limite = Date.parse(VELHO) - 86_400_000;

    await expect(
      servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, limite),
    ).resolves.toMatchObject({ inicio: NOVO });
  });

  /**
   * SLOT DE OUTRA REUNIAO DO MESMO PEDIDO E 409. O 200 de "mesmo pedido" do
   * agendamento nao vale aqui: la e duplo clique no mesmo slot; aqui seria mover
   * uma reuniao para cima de outra.
   */
  it('recusa remarcar para o slot de outra reuniao do mesmo pedido', async () => {
    const { servico } = montar({
      slotNovo: { reserva: { pedidoId: PEDIDO, reuniaoId: 'r002' } },
    });

    await expect(
      servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA),
    ).rejects.toThrow(/ja foi reservado/);
  });

  it('remarcar para o MESMO slot e no-op', async () => {
    const { servico, banco, fila } = montar();

    const resumo = await servico.remarcar(ALVO, CLIENTE, SLOT_VELHO, AGORA);

    expect(resumo.inicio).toBe(VELHO);
    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ sequence: 0 });
    expect(banco.documentos.get(`disponibilidades/${SLOT_VELHO}`)).toMatchObject(
      { reserva: { pedidoId: PEDIDO, reuniaoId: 'r001' } },
    );
    expect(fila.tarefas).toEqual([]);
  });

  it('recusa reuniao ja cancelada', async () => {
    const { servico } = montar({
      reuniao: { estado: 'cancelada_com_devolucao' },
    });

    await expect(
      servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA),
    ).rejects.toThrow(/ja foi cancelada/);
  });

  it('recusa advogado suspenso', async () => {
    const { servico } = montar({ advogado: { status: 'suspenso' } });

    await expect(
      servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('pedido de outro cliente responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.remarcar(ALVO, 'uid-bruno', SLOT_NOVO, AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reuniao inexistente responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.remarcar(
        { pedidoId: PEDIDO, reuniaoId: 'r099' },
        CLIENTE,
        SLOT_NOVO,
        AGORA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * SEM SALA NAO SAI CONVITE (regra inviolavel 13). O evento
   * `criar-sala-reuniao` ainda na fila escrevera os convites com o `sequence` ja
   * incrementado quando a sala chegar.
   */
  it('reuniao sem sala so atualiza o documento, sem convite', async () => {
    const { servico, banco, fila } = montar({
      reuniao: {
        estado: 'reservada_sem_link',
        link: null,
        sequenceComunicada: null,
      },
    });

    await servico.remarcar(ALVO, CLIENTE, SLOT_NOVO, AGORA);

    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ sequence: 1, sequenceComunicada: null, inicio: NOVO });
    expect(fila.tarefas).toEqual([]);
  });
});
