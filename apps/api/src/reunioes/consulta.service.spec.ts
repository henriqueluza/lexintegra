import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { ConsultaReunioesService } from './consulta.service.js';

const ANA = 'uid-ana';
const CARLOS = 'uid-carlos';
const AGORA = Date.parse('2026-09-01T12:00:00.000Z');
const FUTURO = '2026-09-24T17:00:00.000Z';
const PASSADO = '2026-08-10T17:00:00.000Z';

function montar(): { servico: ConsultaReunioesService; banco: FirestoreFalso } {
  const banco = new FirestoreFalso();
  return {
    servico: new ConsultaReunioesService(banco as unknown as Firestore),
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
  } = {},
): void {
  const pedidoId = opcoes.pedidoId ?? 'pedido-1';
  const reuniaoId = opcoes.reuniaoId ?? 'r001';

  banco.documentos.set(`pedidos/${pedidoId}/reunioes/${reuniaoId}`, {
    inicio: opcoes.inicio ?? FUTURO,
    estado: opcoes.estado ?? 'confirmada',
    advogadoId: opcoes.advogadoId ?? ANA,
    clienteId: 'uid-clara',
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
