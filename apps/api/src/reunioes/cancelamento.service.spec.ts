import { ConflictException, NotFoundException } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { JANELA_CANCELAMENTO_MS } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { ConfiguracaoDoOutbox } from '../outbox/politica.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { CancelamentoDeReuniaoService } from './cancelamento.service.js';
import type { DocumentoReuniao } from './reuniao.js';

const CONFIG_OUTBOX: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 0,
  arrendamentoMs: 900_000,
  loteDoVarredor: 100,
};

const PEDIDO = 'pedido-1';
const CLIENTE = 'uid-clara';
const ADVOGADO = 'uid-ana';
const INICIO = '2026-09-24T17:00:00.000Z';
const INICIO_MS = Date.parse(INICIO);
const SLOT = `${ADVOGADO}_${INICIO}`;
const ALVO = { pedidoId: PEDIDO, reuniaoId: 'r001' };

const COMO_CLIENTE = { uid: CLIENTE, perfil: 'cliente' } as const;
const COMO_ADMIN = { uid: 'uid-admin', perfil: 'admin' } as const;

/** Bem antes do limite: devolve o credito. */
const COM_FOLGA = INICIO_MS - 10 * 86_400_000;
/** Um minuto dentro da janela: consome. */
const EM_CIMA = INICIO_MS - JANELA_CANCELAMENTO_MS + 60_000;

const REUNIAO: DocumentoReuniao = {
  uid: 'pedido-1-r001@lexintegra.com.br',
  sequence: 0,
  sequenceComunicada: 0,
  slotId: SLOT,
  inicio: INICIO,
  fim: '2026-09-24T18:00:00.000Z',
  estado: 'confirmada',
  link: 'https://teams.test/sala',
  idExterno: 'sala_1',
  advogadoId: ADVOGADO,
  clienteId: CLIENTE,
  criadoEm: Timestamp.fromMillis(0),
  historico: [],
};

function montar(reuniao: Partial<DocumentoReuniao> = {}): {
  servico: CancelamentoDeReuniaoService;
  banco: FirestoreFalso;
  fila: FilaFalsa<TarefaDeEvento>;
} {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;

  banco.documentos.set(`pedidos/${PEDIDO}`, {
    clienteId: CLIENTE,
    advogadoId: ADVOGADO,
    snapshot: { nome: 'Revisao de contrato' },
  });
  banco.documentos.set(`pedidos/${PEDIDO}/reunioes/r001`, {
    ...REUNIAO,
    ...reuniao,
  });
  banco.documentos.set(`disponibilidades/${SLOT}`, {
    advogadoId: ADVOGADO,
    inicio: INICIO,
    fim: '2026-09-24T18:00:00.000Z',
    semana: '2026-09-21',
    reserva: { pedidoId: PEDIDO, reuniaoId: 'r001' },
  });

  const fila = new FilaFalsa<TarefaDeEvento>();
  const outbox = new OutboxService(db, CONFIG_OUTBOX);

  return {
    servico: new CancelamentoDeReuniaoService(
      db,
      outbox,
      new EnfileiradorDeEventos(outbox, fila),
    ),
    banco,
    fila,
  };
}

describe('CancelamentoDeReuniaoService.cancelar', () => {
  /* ---------------------------------------------------------------------- */
  /* A regra das 24 horas — metade do criterio de aceite da etapa            */
  /* ---------------------------------------------------------------------- */

  /**
   * VALIDADA NO SERVIDOR, contra o `inicio` gravado — nunca so na interface
   * (arquitetura 7.2). A borda exata: 24 horas devolve, 24 horas menos um
   * instante nao.
   */
  it('exatamente 24h antes devolve o credito', async () => {
    const { servico } = montar();

    const resumo = await servico.cancelar(
      ALVO,
      COMO_CLIENTE,
      INICIO_MS - JANELA_CANCELAMENTO_MS,
    );

    expect(resumo.estado).toBe('cancelada_com_devolucao');
  });

  it('24h menos um minuto NAO devolve', async () => {
    const { servico } = montar();

    const resumo = await servico.cancelar(ALVO, COMO_CLIENTE, EM_CIMA);

    expect(resumo.estado).toBe('cancelada_sem_devolucao');
  });

  it('com folga devolve', async () => {
    const { servico } = montar();

    const resumo = await servico.cancelar(ALVO, COMO_CLIENTE, COM_FOLGA);

    expect(resumo.estado).toBe('cancelada_com_devolucao');
  });

  /**
   * ADR-21, decisao H (PROVISORIO). Quando quem desmarca e o escritorio, a culpa
   * nao e do cliente: a reuniao volta ao saldo mesmo dentro das 24 horas.
   */
  it('o administrador devolve o credito mesmo dentro das 24h', async () => {
    const { servico } = montar();

    const resumo = await servico.cancelar(ALVO, COMO_ADMIN, EM_CIMA);

    expect(resumo.estado).toBe('cancelada_com_devolucao');
  });

  /* ---------------------------------------------------------------------- */
  /* Efeitos                                                                 */
  /* ---------------------------------------------------------------------- */

  it('libera o slot', async () => {
    const { servico, banco } = montar();

    await servico.cancelar(ALVO, COMO_CLIENTE, COM_FOLGA);

    expect(banco.documentos.get(`disponibilidades/${SLOT}`)).toMatchObject({
      reserva: null,
    });
  });

  it('incrementa o SEQUENCE e registra quem cancelou', async () => {
    const { servico, banco } = montar();

    await servico.cancelar(ALVO, COMO_CLIENTE, COM_FOLGA);

    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ sequence: 1, canceladoPor: CLIENTE });
  });

  it('escreve os dois METHOD:CANCEL', async () => {
    const { servico, banco, fila } = montar();

    await servico.cancelar(ALVO, COMO_CLIENTE, COM_FOLGA);

    expect(
      banco.documentos.has(
        `outbox/cancelamento-reuniao_${PEDIDO}_r001_s1_${CLIENTE}`,
      ),
    ).toBe(true);
    expect(
      banco.documentos.has(
        `outbox/cancelamento-reuniao_${PEDIDO}_r001_s1_${ADVOGADO}`,
      ),
    ).toBe(true);
    expect(fila.tarefas).toHaveLength(2);
  });

  it('toca o documento do pedido, para serializar', async () => {
    const { servico, banco } = montar();

    await servico.cancelar(ALVO, COMO_CLIENTE, COM_FOLGA);

    expect(banco.documentos.get(`pedidos/${PEDIDO}`)).toMatchObject({
      reunioesVersao: 1,
    });
  });

  /**
   * SEM CONVITE EMITIDO, NAO SAI `CANCEL`. `sequenceComunicada` nula significa
   * que a reuniao nunca chegou ao calendario de ninguem — quase sempre porque
   * ficou em `reservada_sem_link`. Um `CANCEL` para um `UID` que o destinatario
   * nunca viu e um evento cancelado que aparece na agenda so para ser cancelado.
   */
  it('reuniao que nunca teve convite cancela sem mandar CANCEL', async () => {
    const { servico, banco, fila } = montar({
      estado: 'reservada_sem_link',
      link: null,
      sequenceComunicada: null,
    });

    const resumo = await servico.cancelar(ALVO, COMO_CLIENTE, COM_FOLGA);

    expect(resumo.estado).toBe('cancelada_com_devolucao');
    expect(fila.tarefas).toEqual([]);
    expect(banco.documentos.get(`disponibilidades/${SLOT}`)).toMatchObject({
      reserva: null,
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Recusas                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * DEPOIS DO INICIO NAO SE CANCELA (ADR-21). Reuniao que ja aconteceu nao se
   * desmarca, e "cancelar" ali liberaria um slot que nao existe mais.
   */
  it.each([
    ['no instante do inicio', 0],
    ['depois do inicio', 3_600_000],
  ])('recusa cancelamento %s', async (_caso, deslocamento) => {
    const { servico } = montar();

    await expect(
      servico.cancelar(ALVO, COMO_CLIENTE, INICIO_MS + deslocamento),
    ).rejects.toThrow(/ja aconteceu/);
  });

  it('recusa reuniao ja cancelada', async () => {
    const { servico } = montar({ estado: 'cancelada_sem_devolucao' });

    await expect(
      servico.cancelar(ALVO, COMO_CLIENTE, COM_FOLGA),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  /** 404 e nao 403: um 403 confirmaria a existencia do id (padrao da Etapa 9). */
  it('cliente de outro pedido responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.cancelar(ALVO, { uid: 'uid-bruno', perfil: 'cliente' }, COM_FOLGA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * O ADVOGADO NAO CANCELA, e a assimetria e deliberada: quem desmarca o
   * compromisso do cliente e o escritorio, por decisao, nao o advogado por conta
   * propria.
   */
  it('advogado do pedido responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.cancelar(ALVO, { uid: ADVOGADO, perfil: 'advogado' }, COM_FOLGA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reuniao inexistente responde 404', async () => {
    const { servico } = montar();

    await expect(
      servico.cancelar(
        { pedidoId: PEDIDO, reuniaoId: 'r099' },
        COMO_CLIENTE,
        COM_FOLGA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
