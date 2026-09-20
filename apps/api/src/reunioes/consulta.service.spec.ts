import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ClientesService } from '../clientes/clientes.service.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { ConsultaReunioesService } from './consulta.service.js';

const ANA = 'uid-ana';
const CARLOS = 'uid-carlos';
const AGORA = Date.parse('2026-09-01T12:00:00.000Z');
const FUTURO = '2026-09-24T17:00:00.000Z';
const PASSADO = '2026-08-10T17:00:00.000Z';

function montar(): { servico: ConsultaReunioesService; banco: FirestoreFalso } {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  return {
    servico: new ConsultaReunioesService(db, new ClientesService(db)),
    banco,
  };
}

function marcar(
  banco: FirestoreFalso,
  opcoes: {
    pedidoId?: string;
    reuniaoId?: string;
    advogadoId?: string;
    inicio?: string;
    estado?: string;
    sequence?: number;
  } = {},
): void {
  const pedidoId = opcoes.pedidoId ?? 'pedido-1';
  const reuniaoId = opcoes.reuniaoId ?? 'r001';

  banco.documentos.set(`pedidos/${pedidoId}`, {
    clienteId: 'uid-clara',
    snapshot: { nome: 'Revisao de contrato' },
  });
  banco.documentos.set('clientes/uid-clara', { nome: 'Clara Dias' });
  banco.documentos.set(`pedidos/${pedidoId}/reunioes/${reuniaoId}`, {
    inicio: opcoes.inicio ?? FUTURO,
    fim: FUTURO,
    estado: opcoes.estado ?? 'confirmada',
    advogadoId: opcoes.advogadoId ?? ANA,
    pedidoId,
    clienteId: 'uid-clara',
    sequence: opcoes.sequence ?? 0,
    link: null,
  });
}

/** O servico recebe a transacao de fora; aqui ela vem do dublê. */
function naTransacao<T>(
  banco: FirestoreFalso,
  corpo: (transacao: Transaction) => Promise<T>,
): Promise<T> {
  return banco.runTransaction((transacao) =>
    corpo(transacao as unknown as Transaction),
  );
}

describe('ConsultaReunioesService.futuraAtivaNoPedido', () => {
  it('sem reuniao nenhuma, e falso', async () => {
    const { servico, banco } = montar();

    await expect(
      naTransacao(banco, (t) => servico.futuraAtivaNoPedido(t, 'pedido-1', AGORA)),
    ).resolves.toBe(false);
  });

  it.each([
    ['confirmada', true],
    ['reservada_sem_link', true],
    ['cancelada_com_devolucao', false],
    ['cancelada_sem_devolucao', false],
  ])('reuniao futura %s: %s', async (estado, esperado) => {
    const { servico, banco } = montar();
    marcar(banco, { estado });

    await expect(
      naTransacao(banco, (t) => servico.futuraAtivaNoPedido(t, 'pedido-1', AGORA)),
    ).resolves.toBe(esperado);
  });

  /** Reuniao passada nao trava decisao administrativa de hoje. */
  it('reuniao ja realizada nao conta', async () => {
    const { servico, banco } = montar();
    marcar(banco, { inicio: PASSADO });

    await expect(
      naTransacao(banco, (t) => servico.futuraAtivaNoPedido(t, 'pedido-1', AGORA)),
    ).resolves.toBe(false);
  });

  it('nao olha reuniao de outro pedido', async () => {
    const { servico, banco } = montar();
    marcar(banco, { pedidoId: 'pedido-2' });

    await expect(
      naTransacao(banco, (t) => servico.futuraAtivaNoPedido(t, 'pedido-1', AGORA)),
    ).resolves.toBe(false);
  });
});

describe('ConsultaReunioesService.futuraAtivaDoAdvogado', () => {
  /**
   * CONSULTA DE GRUPO DE COLECOES: `reunioes` e subcolecao de `pedidos`, e a
   * pergunta atravessa todos eles. E por isso que `advogadoId` e guardado na
   * reuniao, redundante com o prefixo do `slotId` — extrair um id de dentro de
   * outro nao e consulta que o Firestore saiba fazer.
   */
  it('encontra reuniao futura em qualquer pedido', async () => {
    const { servico, banco } = montar();
    marcar(banco, { pedidoId: 'pedido-7', reuniaoId: 'r003' });

    await expect(servico.futuraAtivaDoAdvogado(ANA, AGORA)).resolves.toBe(true);
  });

  it('nao confunde advogados', async () => {
    const { servico, banco } = montar();
    marcar(banco, { advogadoId: CARLOS });

    await expect(servico.futuraAtivaDoAdvogado(ANA, AGORA)).resolves.toBe(
      false,
    );
  });

  /**
   * A CONSULTA FILTRA POR ESTADO, e nao por horario. E a decisao registrada no
   * servico: o `FirestoreFalso` nao implementa faixa, e filtrar por estado corta
   * justamente o que cresce sem limite — reuniao cancelada acumula para sempre.
   * O horario separa futuro de passado dentro do que sobrou, em memoria.
   */
  it.each(['cancelada_com_devolucao', 'cancelada_sem_devolucao'])(
    'ignora reuniao %s',
    async (estado) => {
      const { servico, banco } = montar();
      marcar(banco, { estado });

      await expect(servico.futuraAtivaDoAdvogado(ANA, AGORA)).resolves.toBe(
        false,
      );
    },
  );

  it('reuniao passada nao conta', async () => {
    const { servico, banco } = montar();
    marcar(banco, { inicio: PASSADO });

    await expect(servico.futuraAtivaDoAdvogado(ANA, AGORA)).resolves.toBe(
      false,
    );
  });

  /** Os DOIS estados ativos sao consultados — uma igualdade para cada. */
  it('a reuniao ainda sem sala tambem conta', async () => {
    const { servico, banco } = montar();
    marcar(banco, { estado: 'reservada_sem_link' });

    await expect(servico.futuraAtivaDoAdvogado(ANA, AGORA)).resolves.toBe(true);
  });
});

describe('ConsultaReunioesService.agendaDoAdvogado', () => {
  it('devolve a reuniao com produto e cliente', async () => {
    const { servico, banco } = montar();
    marcar(banco);

    await expect(servico.agendaDoAdvogado(ANA, AGORA)).resolves.toEqual([
      {
        id: 'r001',
        pedidoId: 'pedido-1',
        produto: 'Revisao de contrato',
        cliente: 'Clara Dias',
        inicio: FUTURO,
        fim: FUTURO,
        estado: 'confirmada',
        link: null,
      },
    ]);
  });

  /**
   * REUNIAO CANCELADA NAO E AGENDA: nao tem o que ser preparado nem a que
   * comparecer, e mostra-la faria a lista crescer para sempre com linhas que nao
   * pedem nada.
   */
  it('nao lista cancelada nem passada', async () => {
    const { servico, banco } = montar();
    marcar(banco, { reuniaoId: 'r001', estado: 'cancelada_com_devolucao' });
    marcar(banco, { reuniaoId: 'r002', inicio: PASSADO });

    await expect(servico.agendaDoAdvogado(ANA, AGORA)).resolves.toEqual([]);
  });

  it('nao lista a agenda de outro advogado', async () => {
    const { servico, banco } = montar();
    marcar(banco, { advogadoId: CARLOS });

    await expect(servico.agendaDoAdvogado(ANA, AGORA)).resolves.toEqual([]);
  });

  it('ordena por horario', async () => {
    const { servico, banco } = montar();
    marcar(banco, {
      pedidoId: 'pedido-2',
      reuniaoId: 'r001',
      inicio: '2026-10-01T17:00:00.000Z',
    });
    marcar(banco, { pedidoId: 'pedido-1', reuniaoId: 'r001', inicio: FUTURO });

    const agenda = await servico.agendaDoAdvogado(ANA, AGORA);

    expect(agenda.map((linha) => linha.inicio)).toEqual([
      FUTURO,
      '2026-10-01T17:00:00.000Z',
    ]);
  });
});

describe('ConsultaReunioesService.semSala', () => {
  it('lista so as reunioes sem sala', async () => {
    const { servico, banco } = montar();
    marcar(banco, { reuniaoId: 'r001', estado: 'reservada_sem_link' });
    marcar(banco, { reuniaoId: 'r002', estado: 'confirmada' });

    const linhas = await servico.semSala();

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ id: 'r001', pedidoId: 'pedido-1' });
  });

  /**
   * `eventoOutboxId` E O QUE TORNA A LINHA ACIONAVEL (arquitetura 7.2). Ele sai
   * de `idDoEvento`, e nao e montado na consulta: um id com um campo a menos
   * produziria um botao que reenvia coisa nenhuma sem dizer por que.
   */
  it('leva o id do evento do outbox, no formato que o reenvio espera', async () => {
    const { servico, banco } = montar();
    marcar(banco, { estado: 'reservada_sem_link' });

    const [linha] = await servico.semSala();

    expect(linha.eventoOutboxId).toBe('criar-sala-reuniao_pedido-1_r001');
  });

  /** O id da sala nao leva `sequence`: uma sala por reuniao, para sempre. */
  it('o id do evento nao muda depois de remarcar', async () => {
    const { servico, banco } = montar();
    marcar(banco, { estado: 'reservada_sem_link', sequence: 3 });

    const [linha] = await servico.semSala();

    expect(linha.eventoOutboxId).toBe('criar-sala-reuniao_pedido-1_r001');
  });
});
