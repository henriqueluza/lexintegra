import { ConflictException, NotFoundException } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import type { ConfiguracaoDoOutbox } from '../outbox/politica.js';
import { ReunioesService } from './reunioes.service.js';
import type { ConfiguracaoReunioes } from './sala/modo.js';

const CONFIG_OUTBOX: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 0,
  arrendamentoMs: 900_000,
  loteDoVarredor: 100,
};

const LIGADO: ConfiguracaoReunioes = { modo: 'falso', graph: null };

/* 24/09/2026 (quinta), 14h em Sao Paulo. `agora` fica 30 dias antes. */
const INICIO = '2026-09-24T17:00:00.000Z';
const FIM = '2026-09-24T18:00:00.000Z';
const AGORA = Date.parse('2026-08-25T12:00:00.000Z');
const COMPRA = Date.parse('2026-08-01T12:00:00.000Z');

const PEDIDO = 'pedido-1';
const CLIENTE = 'uid-clara';
const ADVOGADO = 'uid-ana';
const SLOT = `${ADVOGADO}_${INICIO}`;

interface Ajustes {
  readonly pedido?: Record<string, unknown>;
  readonly slot?: Record<string, unknown>;
  readonly advogado?: Record<string, unknown>;
  readonly configuracao?: ConfiguracaoReunioes;
}

function montar(ajustes: Ajustes = {}): {
  servico: ReunioesService;
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
    reunioesEmitidas: 0,
    snapshot: {
      nome: 'Revisao de contrato',
      quantidadeReunioes: 2,
      prazoValidadeReunioesDias: 365,
      intervaloMinimoReunioesDias: 7,
      numeroRevisoesPermitidas: 2,
    },
    ...ajustes.pedido,
  });

  banco.documentos.set(`disponibilidades/${SLOT}`, {
    advogadoId: ADVOGADO,
    inicio: INICIO,
    fim: FIM,
    semana: '2026-09-21',
    reserva: null,
    ...ajustes.slot,
  });

  banco.documentos.set(`advogados/${ADVOGADO}`, {
    nome: 'Ana Souza',
    status: 'ativo',
    ...ajustes.advogado,
  });

  const fila = new FilaFalsa<TarefaDeEvento>();
  const outbox = new OutboxService(db, CONFIG_OUTBOX);

  return {
    servico: new ReunioesService(
      db,
      outbox,
      new EnfileiradorDeEventos(outbox, fila),
      ajustes.configuracao ?? LIGADO,
    ),
    banco,
    fila,
  };
}

describe('ReunioesService.agendar', () => {
  it('grava a reuniao em reservada_sem_link, sem link', async () => {
    const { servico, banco } = montar();

    const resumo = await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);

    expect(resumo).toEqual({
      id: 'r001',
      inicio: INICIO,
      fim: FIM,
      estado: 'reservada_sem_link',
      link: null,
    });
    expect(banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`)).toMatchObject(
      { estado: 'reservada_sem_link', link: null, sequence: 0, slotId: SLOT },
    );
  });

  /**
   * A reuniao NASCE sem link (arquitetura 7.2). Nao e estado de erro: o slot
   * esta reservado, o saldo consumido e o compromisso vale — falta a sala, que
   * chega pela reentrega do outbox.
   */
  it('nasce com sequenceComunicada nula e sem id externo', async () => {
    const { servico, banco } = montar();

    await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);

    expect(banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`)).toMatchObject(
      { sequenceComunicada: null, idExterno: null, historico: [] },
    );
  });

  it('reserva o slot e incrementa o contador do pedido', async () => {
    const { servico, banco } = montar();

    await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);

    expect(banco.documentos.get(`disponibilidades/${SLOT}`)).toMatchObject({
      reserva: { pedidoId: PEDIDO, reuniaoId: 'r001' },
    });
    expect(banco.documentos.get(`pedidos/${PEDIDO}`)).toMatchObject({
      reunioesEmitidas: 1,
    });
  });

  it('escreve o evento de sala no outbox e enfileira depois do commit', async () => {
    const { servico, banco, fila } = montar();

    await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);

    const id = `criar-sala-reuniao_${PEDIDO}_r001`;
    expect(banco.documentos.get(`outbox/${id}`)).toMatchObject({
      tipo: 'criar-sala-reuniao',
      estado: 'pendente',
      reuniao: { pedidoId: PEDIDO, reuniaoId: 'r001', sequence: 0 },
    });
    expect(fila.tarefas).toEqual([{ id }]);
  });

  /**
   * O `UID` do iCalendar e derivado dos ids e ESTAVEL. Regenera-lo numa
   * remarcacao faz o calendario do cliente criar um segundo evento em vez de
   * atualizar o primeiro (regra inviolavel 12).
   */
  it('deriva o UID do calendario dos ids', async () => {
    const { servico, banco } = montar();

    await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);

    expect(banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`)).toMatchObject(
      { uid: 'pedido-1-r001@lexintegra.com.br' },
    );
  });

  /** O id e sequencial e sai do contador, nao da contagem de documentos. */
  it('a segunda reuniao ganha r002', async () => {
    const { servico, banco } = montar();
    const outroSlot = `${ADVOGADO}_2026-10-15T17:00:00.000Z`;
    banco.documentos.set(`disponibilidades/${outroSlot}`, {
      advogadoId: ADVOGADO,
      inicio: '2026-10-15T17:00:00.000Z',
      fim: '2026-10-15T18:00:00.000Z',
      semana: '2026-10-12',
      reserva: null,
    });

    await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);
    const segunda = await servico.agendar(PEDIDO, CLIENTE, outroSlot, AGORA);

    expect(segunda.id).toBe('r002');
  });

  /* ---------------------------------------------------------------------- */
  /* Recusas                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * 404 E NAO 403: um 403 confirmaria a existencia do id, que e o que alguem
   * varrendo ids quer descobrir. Mesma decisao da area do cliente na Etapa 9.
   */
  it('pedido de outro cliente responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.agendar(PEDIDO, 'uid-bruno', SLOT, AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pedido inexistente responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.agendar('pedido-9', CLIENTE, SLOT, AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('horario inexistente responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.agendar(PEDIDO, CLIENTE, 'slot-9', AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('slot de outro advogado e recusado', async () => {
    const { servico } = montar({ slot: { advogadoId: 'uid-carlos' } });

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toThrow(/nao e do advogado/);
  });

  it('slot ja reservado por OUTRO pedido e recusado', async () => {
    const { servico } = montar({
      slot: { reserva: { pedidoId: 'pedido-2', reuniaoId: 'r001' } },
    });

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toThrow(/ja foi reservado/);
  });

  /** ADR-21, decisao G. Lido na transacao, junto com o resto. */
  it('advogado suspenso e recusado', async () => {
    const { servico } = montar({ advogado: { status: 'suspenso' } });

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toThrow(/indisponivel/);
  });

  it.each([
    ['pedido cancelado', { pedido: { situacao: 'cancelado' } }, /cancelado/],
    ['pedido nao distribuido', { pedido: { distribuido: false } }, /analise/],
  ])('%s e recusado', async (_caso, ajuste, esperado) => {
    const { servico } = montar(ajuste);

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toThrow(esperado);
  });

  /** A mensagem do 409 e a MESMA que a tela mostra (`MOTIVO_DO_IMPEDIMENTO`). */
  it('saldo esgotado recusa com o motivo legivel', async () => {
    const { servico, banco } = montar();
    banco.documentos.set(`pedidos/${PEDIDO}/reunioes/r001`, {
      estado: 'confirmada',
      inicio: '2026-09-01T17:00:00.000Z',
    });
    banco.documentos.set(`pedidos/${PEDIDO}/reunioes/r002`, {
      estado: 'confirmada',
      inicio: '2026-09-08T17:00:00.000Z',
    });

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toThrow(/ja foram usadas/);
  });

  it('horario com menos de 24h de antecedencia e recusado', async () => {
    const { servico } = montar();
    const tarde = Date.parse(INICIO) - 3_600_000;

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, tarde),
    ).rejects.toThrow(/24 horas/);
  });

  it('nada e gravado quando a regra recusa', async () => {
    const { servico, banco } = montar({ advogado: { status: 'suspenso' } });

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toThrow();

    expect(banco.documentos.has(`pedidos/${PEDIDO}/reunioes/r001`)).toBe(false);
    expect(banco.documentos.get(`disponibilidades/${SLOT}`)).toMatchObject({
      reserva: null,
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Duplicata esperada e trava de modo                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * O DUPLO CLIQUE NO MESMO SLOT PELO MESMO PEDIDO devolve a reuniao existente.
   * E duplicata esperada, nao conflito: responder 409 faria a tela dizer
   * "horario ocupado" sobre um horario que e do proprio cliente.
   */
  it('o mesmo pedido no mesmo slot devolve a reuniao que ja existe', async () => {
    const { servico, banco } = montar();

    const primeira = await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);
    const segunda = await servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA);

    expect(segunda).toEqual(primeira);
    /* E nao consumiu uma segunda unidade do saldo. */
    expect(banco.documentos.get(`pedidos/${PEDIDO}`)).toMatchObject({
      reunioesEmitidas: 1,
    });
  });

  /**
   * `desligado` recusa com 503 e ANTES de tocar no banco: nada no pedido do
   * cliente esta errado, e tentar de novo depois pode funcionar.
   */
  it('com REUNIOES_MODO=desligado recusa com 503, sem escrever', async () => {
    const { servico, banco } = montar({
      configuracao: { modo: 'desligado', graph: null },
    });

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toThrow(/desligado/);
    expect(banco.escritas).toEqual([]);
  });

  it('a recusa por regra de negocio e 409', async () => {
    const { servico } = montar({ pedido: { distribuido: false } });

    await expect(
      servico.agendar(PEDIDO, CLIENTE, SLOT, AGORA),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
