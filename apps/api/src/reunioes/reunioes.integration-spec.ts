import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { JANELA_CANCELAMENTO_MS } from 'shared';
import { comSnapshot } from '../arnes-pedidos.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { ConfiguracaoDoOutbox } from '../outbox/politica.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { AlteracoesDeReuniaoService } from './alteracoes.service.js';
import { CancelamentoDeReuniaoService } from './cancelamento.service.js';
import { ConsultaReunioesService } from './consulta.service.js';
import { ConvitesService } from './convites.service.js';
import { HorariosService } from './horarios.service.js';
import type { DocumentoReuniao } from './reuniao.js';
import { ReunioesService } from './reunioes.service.js';
import { SalaDeReuniaoFalsa } from './sala/sala-de-reuniao-falsa.js';
import type { ConfiguracaoReunioes } from './sala/modo.js';

/**
 * O ACEITE DA ETAPA 10, contra o emulador.
 *
 * O que so aqui se prova: as travas de concorrencia. O dublê do Firestore nao
 * reexecuta transacao sob contencao — e a reexecucao E o mecanismo. Os dois
 * testes do fim exercitam os DOIS mecanismos de exclusividade, e cada um pega
 * um caso que o outro nao pega.
 */

const CONFIG_OUTBOX: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 0,
  arrendamentoMs: 900_000,
  loteDoVarredor: 100,
};

const LIGADO: ConfiguracaoReunioes = { modo: 'falso', graph: null };

const ADMIN = 'uid-admin';
const CLIENTE = 'uid-clara';
const OUTRO_CLIENTE = 'uid-bruno';
const ADVOGADO = 'uid-ana';
const OUTRO_ADVOGADO = 'uid-carlos';

const DIA = 86_400_000;
/* Quinta, 14h em Sao Paulo. Longe o bastante da antecedencia minima. */
const INICIO = '2026-09-24T17:00:00.000Z';
const FIM = '2026-09-24T18:00:00.000Z';
const INICIO_MS = Date.parse(INICIO);
const AGORA = INICIO_MS - 30 * DIA;
/**
 * Um instante DENTRO da semana dos slots, para quem LE a grade.
 *
 * `AGORA` esta a trinta dias, o que e otimo para exercitar as regras de
 * agendamento e inutil para a LISTA: ela so consulta a semana corrente e a
 * seguinte (ADR-06), entao com `AGORA` ela volta vazia sempre — e uma assercao
 * de `not.toContain` contra lista vazia passa sem provar nada.
 */
const NA_SEMANA = Date.parse('2026-09-21T12:00:00.000Z');
const COMPRA = INICIO_MS - 60 * DIA;

let banco: Firestore;
let reunioes: ReunioesService;
let alteracoes: AlteracoesDeReuniaoService;
let cancelamento: CancelamentoDeReuniaoService;
let convites: ConvitesService;
let consulta: ConsultaReunioesService;
let horarios: HorariosService;
let fila: FilaFalsa<TarefaDeEvento>;
let sala: SalaDeReuniaoFalsa;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();

  fila = new FilaFalsa<TarefaDeEvento>();
  sala = new SalaDeReuniaoFalsa();
  const outbox = new OutboxService(banco, CONFIG_OUTBOX);
  const enfileirador = new EnfileiradorDeEventos(outbox, fila);

  reunioes = new ReunioesService(banco, outbox, enfileirador, LIGADO);
  alteracoes = new AlteracoesDeReuniaoService(banco, outbox, enfileirador);
  cancelamento = new CancelamentoDeReuniaoService(banco, outbox, enfileirador);
  convites = new ConvitesService(banco, sala, outbox);
  consulta = new ConsultaReunioesService(banco, new ClientesService(banco));
  horarios = new HorariosService(banco);
});

/* -------------------------------------------------------------------------- */
/* Arranjo                                                                     */
/* -------------------------------------------------------------------------- */

interface Compra {
  readonly pedidoId?: string;
  readonly clienteId?: string;
  readonly quantidadeReunioes?: number;
  readonly intervaloMinimoReunioesDias?: number;
  readonly prazoValidadeReunioesDias?: number;
}

async function comprar(opcoes: Compra = {}): Promise<string> {
  const pedidoId = opcoes.pedidoId ?? 'pedido-1';
  const produtos = new ProdutosService(banco);
  const pedidos = new PedidosService(banco);

  const { id } = await produtos.criar(
    {
      nome: 'Revisao de contrato',
      descricao: 'Minuta revisada e relatorio de clausulas.',
      precoCentavos: 250_000,
      entregaveis: ['Minuta revisada'],
      textosOrientativos: [],
      quantidadeReunioes: opcoes.quantidadeReunioes ?? 2,
      prazoValidadeReunioesDias: opcoes.prazoValidadeReunioesDias ?? 365,
      intervaloMinimoReunioesDias: opcoes.intervaloMinimoReunioesDias ?? 7,
      numeroRevisoesPermitidas: 2,
    },
    ADMIN,
  );

  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(
      transacao,
      pedidos.preparar(
        await comSnapshot(pedidos, [
          {
            pedidoId,
            clienteId: opcoes.clienteId ?? CLIENTE,
            pagamentoId: 'pagamento-1',
            produtoOrigemId: id,
          },
        ]),
      ),
    );
  });

  /* A distribuicao e do administrador; aqui ela e parte do arranjo. */
  await banco
    .collection('pedidos')
    .doc(pedidoId)
    .update({
      advogadoId: ADVOGADO,
      distribuido: true,
      criadoEm: new Date(COMPRA),
    });
  await banco
    .collection('advogados')
    .doc(ADVOGADO)
    .set({ nome: 'Ana Souza', status: 'ativo', usuarioTeams: null });

  return pedidoId;
}

async function publicarSlot(
  inicio: string,
  fim: string,
  advogadoId = ADVOGADO,
): Promise<string> {
  const id = `${advogadoId}_${inicio}`;
  await banco.collection('disponibilidades').doc(id).set({
    advogadoId,
    inicio,
    fim,
    semana: '2026-09-21',
    reserva: null,
  });
  return id;
}

async function lerReuniao(
  pedidoId: string,
  reuniaoId: string,
): Promise<DocumentoReuniao> {
  const documento = await banco
    .collection('pedidos')
    .doc(pedidoId)
    .collection('reunioes')
    .doc(reuniaoId)
    .get();

  return documento.data() as DocumentoReuniao;
}

async function slot(slotId: string): Promise<{ reserva: unknown }> {
  const documento = await banco
    .collection('disponibilidades')
    .doc(slotId)
    .get();
  return documento.data() as { reserva: unknown };
}

/* -------------------------------------------------------------------------- */
/* Agendamento                                                                 */
/* -------------------------------------------------------------------------- */

describe('agendamento', () => {
  it('reserva o slot, debita o saldo e registra o evento da sala', async () => {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM);

    const resumo = await reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA);

    expect(resumo).toMatchObject({ id: 'r001', estado: 'reservada_sem_link' });
    expect(await slot(slotId)).toMatchObject({
      reserva: { pedidoId: 'pedido-1', reuniaoId: 'r001' },
    });
    expect(fila.tarefas).toEqual([{ id: 'criar-sala-reuniao_pedido-1_r001' }]);
  });

  it('pedido de outro cliente responde 404', async () => {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM);

    await expect(
      reunioes.agendar('pedido-1', OUTRO_CLIENTE, slotId, AGORA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('slot de outro advogado e recusado', async () => {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM, OUTRO_ADVOGADO);

    await expect(
      reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA),
    ).rejects.toThrow(/nao e do advogado/);
  });

  it('advogado suspenso e recusado', async () => {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM);
    await banco
      .collection('advogados')
      .doc(ADVOGADO)
      .update({ status: 'suspenso' });

    await expect(
      reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA),
    ).rejects.toThrow(/indisponivel/);
  });

  it('antecedencia minima recusada', async () => {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM);

    await expect(
      reunioes.agendar('pedido-1', CLIENTE, slotId, INICIO_MS - 3_600_000),
    ).rejects.toThrow(/24 horas/);
  });

  it('janela vencida e recusada', async () => {
    await comprar({ prazoValidadeReunioesDias: 1 });
    const slotId = await publicarSlot(INICIO, FIM);

    await expect(
      reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA),
    ).rejects.toThrow(/prazo/);
  });

  it('saldo esgotado e recusado', async () => {
    await comprar({ quantidadeReunioes: 1, intervaloMinimoReunioesDias: 0 });
    const primeiro = await publicarSlot(INICIO, FIM);
    const segundo = await publicarSlot(
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T18:00:00.000Z',
    );

    await reunioes.agendar('pedido-1', CLIENTE, primeiro, AGORA);

    await expect(
      reunioes.agendar('pedido-1', CLIENTE, segundo, AGORA),
    ).rejects.toThrow(/ja foram usadas/);
  });

  it('intervalo minimo recusa o horario perto, e aceita o distante', async () => {
    await comprar({ intervaloMinimoReunioesDias: 7 });
    const primeiro = await publicarSlot(INICIO, FIM);
    const perto = await publicarSlot(
      '2026-09-26T17:00:00.000Z',
      '2026-09-26T18:00:00.000Z',
    );
    const longe = await publicarSlot(
      '2026-10-02T17:00:00.000Z',
      '2026-10-02T18:00:00.000Z',
    );

    await reunioes.agendar('pedido-1', CLIENTE, primeiro, AGORA);

    await expect(
      reunioes.agendar('pedido-1', CLIENTE, perto, AGORA),
    ).rejects.toThrow(/perto demais/);
    await expect(
      reunioes.agendar('pedido-1', CLIENTE, longe, AGORA),
    ).resolves.toMatchObject({ id: 'r002' });
  });

  /** Duplicata esperada, nao conflito: o cliente clicou duas vezes. */
  it('o mesmo pedido no mesmo slot devolve a reuniao existente', async () => {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM);

    const primeira = await reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA);
    const segunda = await reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA);

    expect(segunda).toEqual(primeira);
    const pedido = await banco.collection('pedidos').doc('pedido-1').get();
    expect(pedido.data()?.['reunioesEmitidas']).toBe(1);
  });

  it('os horarios oferecidos excluem o ja reservado', async () => {
    await comprar({ intervaloMinimoReunioesDias: 0 });
    const primeiro = await publicarSlot(INICIO, FIM);
    const outro = await publicarSlot(
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T18:00:00.000Z',
    );

    await reunioes.agendar('pedido-1', CLIENTE, primeiro, AGORA);
    const oferecidos = await horarios.listar(
      'pedido-1',
      CLIENTE,
      null,
      NA_SEMANA,
    );

    /* Os DOIS lados: sem o segundo, uma lista vazia passaria por "excluiu". */
    expect(oferecidos.map((h) => h.slotId)).toEqual([outro]);
  });

  /*
   * A LISTA DA REMARCACAO, e o defeito que ela existe para impedir.
   *
   * Sem dizer qual reuniao esta sendo movida, a lista conta essa reuniao contra
   * ela mesma — pelo intervalo minimo, porque o horario velho fica perto demais
   * do novo, e pelo saldo, porque ela ja o consumiu. O resultado era uma lista
   * VAZIA em todo pedido, com a tela dizendo "nenhum horario disponivel para
   * remarcar": um estado legitimo, com a aparencia exata de um advogado sem
   * grade publicada. Nada falhava, nem aqui nem na unidade — quem pegou foi a
   * jornada autenticada, que clica no botao.
   */
  it('a lista da remarcacao ignora a reuniao que esta sendo movida', async () => {
    await comprar({ intervaloMinimoReunioesDias: 7 });
    const primeiro = await publicarSlot(INICIO, FIM);
    const vizinho = await publicarSlot(
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T18:00:00.000Z',
    );

    const reuniao = await reunioes.agendar(
      'pedido-1',
      CLIENTE,
      primeiro,
      AGORA,
    );

    const paraMarcar = await horarios.listar(
      'pedido-1',
      CLIENTE,
      null,
      NA_SEMANA,
    );
    const paraRemarcar = await horarios.listar(
      'pedido-1',
      CLIENTE,
      reuniao.id,
      NA_SEMANA,
    );

    expect(paraMarcar.map((h) => h.slotId)).not.toContain(vizinho);
    expect(paraRemarcar.map((h) => h.slotId)).toContain(vizinho);
  });

  /* O mesmo, pelo outro lado: com o saldo esgotado ainda se remarca. */
  it('a lista da remarcacao ignora o saldo que a propria reuniao consumiu', async () => {
    await comprar({ quantidadeReunioes: 1, intervaloMinimoReunioesDias: 0 });
    const primeiro = await publicarSlot(INICIO, FIM);
    const outro = await publicarSlot(
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T18:00:00.000Z',
    );

    const reuniao = await reunioes.agendar(
      'pedido-1',
      CLIENTE,
      primeiro,
      AGORA,
    );

    expect(await horarios.listar('pedido-1', CLIENTE, null, NA_SEMANA)).toEqual(
      [],
    );
    expect(
      (await horarios.listar('pedido-1', CLIENTE, reuniao.id, NA_SEMANA)).map(
        (h) => h.slotId,
      ),
    ).toEqual([outro]);
  });
});

/* -------------------------------------------------------------------------- */
/* SEQUENCE e UID — o primeiro criterio de aceite da etapa                     */
/* -------------------------------------------------------------------------- */

describe('SEQUENCE e UID', () => {
  async function marcada(): Promise<{ slotId: string; novo: string }> {
    await comprar({ intervaloMinimoReunioesDias: 0 });
    const slotId = await publicarSlot(INICIO, FIM);
    const novo = await publicarSlot(
      '2026-10-02T17:00:00.000Z',
      '2026-10-02T18:00:00.000Z',
    );
    await reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA);
    await convites.criarSala({
      pedidoId: 'pedido-1',
      reuniaoId: 'r001',
      sequence: 0,
    });
    return { slotId, novo };
  }

  /**
   * O CRITERIO DE ACEITE: "remarcacao com o mesmo `UID` atualiza". O documento
   * nao muda de id, o `UID` nao muda, e o `SEQUENCE` sobe.
   */
  it('a remarcacao mantem o UID e sobe o SEQUENCE', async () => {
    const { slotId, novo } = await marcada();
    const antes = await lerReuniao('pedido-1', 'r001');

    await alteracoes.remarcar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      CLIENTE,
      novo,
      AGORA,
    );
    const depois = await lerReuniao('pedido-1', 'r001');

    expect(depois.uid).toBe(antes.uid);
    expect(depois.sequence).toBe(antes.sequence + 1);
    expect(depois.slotId).toBe(novo);
    expect(await slot(slotId)).toMatchObject({ reserva: null });
  });

  /** "Cancelamento remove": mesmo `UID`, `SEQUENCE` maior, `METHOD:CANCEL`. */
  it('o cancelamento mantem o UID e sobe o SEQUENCE', async () => {
    await marcada();
    const antes = await lerReuniao('pedido-1', 'r001');

    await cancelamento.cancelar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      { uid: CLIENTE, perfil: 'cliente' },
      AGORA,
    );
    const depois = await lerReuniao('pedido-1', 'r001');

    expect(depois.uid).toBe(antes.uid);
    expect(depois.sequence).toBe(antes.sequence + 1);
    expect(
      fila.tarefas.some((t) => t.id.startsWith('cancelamento-reuniao_')),
    ).toBe(true);
  });

  it('remarcar para o slot de outra reuniao do mesmo pedido e 409', async () => {
    const { novo } = await marcada();
    await reunioes.agendar('pedido-1', CLIENTE, novo, AGORA);

    await expect(
      alteracoes.remarcar(
        { pedidoId: 'pedido-1', reuniaoId: 'r001' },
        CLIENTE,
        novo,
        AGORA,
      ),
    ).rejects.toThrow(/ja foi reservado/);
  });
});

/* -------------------------------------------------------------------------- */
/* As 24 horas — o segundo criterio de aceite da etapa                         */
/* -------------------------------------------------------------------------- */

describe('a janela de 24 horas, validada no servidor', () => {
  async function marcada(): Promise<void> {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM);
    await reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA);
    await convites.criarSala({
      pedidoId: 'pedido-1',
      reuniaoId: 'r001',
      sequence: 0,
    });
  }

  it('com exatamente 24h, devolve o credito', async () => {
    await marcada();

    const resumo = await cancelamento.cancelar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      { uid: CLIENTE, perfil: 'cliente' },
      INICIO_MS - JANELA_CANCELAMENTO_MS,
    );

    expect(resumo.estado).toBe('cancelada_com_devolucao');
  });

  it('com 24h menos um minuto, consome', async () => {
    await marcada();

    const resumo = await cancelamento.cancelar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      { uid: CLIENTE, perfil: 'cliente' },
      INICIO_MS - JANELA_CANCELAMENTO_MS + 60_000,
    );

    expect(resumo.estado).toBe('cancelada_sem_devolucao');
  });

  /** O credito devolvido volta ao saldo de verdade: da para marcar de novo. */
  it('o credito devolvido volta ao saldo do pedido', async () => {
    await comprar({ quantidadeReunioes: 1, intervaloMinimoReunioesDias: 0 });
    const primeiro = await publicarSlot(INICIO, FIM);
    const segundo = await publicarSlot(
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T18:00:00.000Z',
    );

    await reunioes.agendar('pedido-1', CLIENTE, primeiro, AGORA);
    await cancelamento.cancelar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      { uid: CLIENTE, perfil: 'cliente' },
      AGORA,
    );

    await expect(
      reunioes.agendar('pedido-1', CLIENTE, segundo, AGORA),
    ).resolves.toMatchObject({ id: 'r002' });
  });

  it('cancelar depois do inicio e 409', async () => {
    await marcada();

    await expect(
      cancelamento.cancelar(
        { pedidoId: 'pedido-1', reuniaoId: 'r001' },
        { uid: CLIENTE, perfil: 'cliente' },
        INICIO_MS + 1,
      ),
    ).rejects.toThrow(/ja aconteceu/);
  });

  /** ADR-21, decisao H: o escritorio devolve mesmo dentro das 24 horas. */
  it('o administrador devolve o credito dentro das 24h', async () => {
    await marcada();

    const resumo = await cancelamento.cancelar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      { uid: ADMIN, perfil: 'admin' },
      INICIO_MS - 3_600_000,
    );

    expect(resumo.estado).toBe('cancelada_com_devolucao');
  });

  it('o advogado nao cancela: 404', async () => {
    await marcada();

    await expect(
      cancelamento.cancelar(
        { pedidoId: 'pedido-1', reuniaoId: 'r001' },
        { uid: ADVOGADO, perfil: 'advogado' },
        AGORA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/* -------------------------------------------------------------------------- */
/* Sala: falha, reentrega e as corridas                                        */
/* -------------------------------------------------------------------------- */

describe('a sala e o convite', () => {
  const EVENTO = { pedidoId: 'pedido-1', reuniaoId: 'r001', sequence: 0 };

  async function marcar(): Promise<void> {
    await comprar();
    const slotId = await publicarSlot(INICIO, FIM);
    await reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA);
  }

  /**
   * O CAMINHO DE FALHA DA ARQUITETURA 7.2, de ponta a ponta e SEM INTERVENCAO NO
   * BANCO: a sala falha, a reuniao fica em `reservada_sem_link`, o painel do
   * administrador a mostra, a reentrega acontece e ela vira `confirmada` com os
   * dois convites escritos.
   */
  it('falha, aparece no painel, e a reentrega confirma', async () => {
    await marcar();
    sala.falharProximas(1, 'policy');

    const primeira = await convites.criarSala(EVENTO);
    expect(primeira).toMatchObject({ sucesso: false });
    expect(await lerReuniao('pedido-1', 'r001')).toMatchObject({
      estado: 'reservada_sem_link',
      link: null,
    });
    expect(await consulta.semSala()).toMatchObject([
      { id: 'r001', eventoOutboxId: 'criar-sala-reuniao_pedido-1_r001' },
    ]);

    const segunda = await convites.criarSala(EVENTO);

    expect(segunda).toMatchObject({ sucesso: true });
    expect(await lerReuniao('pedido-1', 'r001')).toMatchObject({
      estado: 'confirmada',
      sequenceComunicada: 0,
    });
    expect(await consulta.semSala()).toEqual([]);
    const outbox = await banco.collection('outbox').get();
    expect(
      outbox.docs.filter((d) => d.id.startsWith('convite-reuniao_')),
    ).toHaveLength(2);
  });

  /** Corrida 1: cancelada antes de a sala ser criada. */
  it('reuniao cancelada antes da sala nao chama o provedor', async () => {
    await marcar();
    await cancelamento.cancelar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      { uid: CLIENTE, perfil: 'cliente' },
      AGORA,
    );

    await convites.criarSala(EVENTO);

    expect(sala.pedidos).toHaveLength(0);
    const outbox = await banco.collection('outbox').get();
    expect(
      outbox.docs.filter((d) => d.id.startsWith('convite-reuniao_')),
    ).toHaveLength(0);
  });

  /** Corrida 2: remarcada antes de a sala ser criada — convite com o novo SEQUENCE. */
  it('reuniao remarcada antes da sala usa o sequence atual', async () => {
    await comprar({ intervaloMinimoReunioesDias: 0 });
    const slotId = await publicarSlot(INICIO, FIM);
    const novo = await publicarSlot(
      '2026-10-02T17:00:00.000Z',
      '2026-10-02T18:00:00.000Z',
    );
    await reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA);
    await alteracoes.remarcar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      CLIENTE,
      novo,
      AGORA,
    );

    await convites.criarSala(EVENTO);

    const ids = (await banco.collection('outbox').get()).docs.map((d) => d.id);
    expect(ids).toContain(`convite-reuniao_pedido-1_r001_s1_${CLIENTE}`);
    expect(ids).not.toContain(`convite-reuniao_pedido-1_r001_s0_${CLIENTE}`);
  });

  /** Corrida 4: cancelar sem convite emitido nao manda METHOD:CANCEL. */
  it('cancelar reuniao que nunca teve convite nao gera CANCEL', async () => {
    await marcar();

    await cancelamento.cancelar(
      { pedidoId: 'pedido-1', reuniaoId: 'r001' },
      { uid: CLIENTE, perfil: 'cliente' },
      AGORA,
    );

    const ids = (await banco.collection('outbox').get()).docs.map((d) => d.id);
    expect(ids.some((id) => id.startsWith('cancelamento-reuniao_'))).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Concorrencia — o que so o emulador prova                                     */
/* -------------------------------------------------------------------------- */

/**
 * O DUBLE NAO REEXECUTA TRANSACAO SOB CONTENCAO, e a reexecucao E o mecanismo.
 * Estes dois testes sao os unicos que exercitam os DOIS mecanismos de
 * exclusividade, e cada um pega um caso que o outro nao pega.
 *
 * A assercao e DETERMINISTICA mesmo com a ordem nao sendo: nao importa qual das
 * duas requisicoes vence, o que importa e que EXATAMENTE UMA vence. E por isso
 * que aqui o `Promise.all` basta, ao contrario do teste de arrendamento do
 * outbox — la o que precisava ser exercitado era um RAMO especifico do codigo
 * (o `em-andamento`), e a corrida nao escolhia o caminho da perdedora.
 */
describe('concorrencia', () => {
  it('dois clientes no MESMO slot: um marca, o outro recebe 409', async () => {
    await comprar({ pedidoId: 'pedido-1', clienteId: CLIENTE });
    await comprar({ pedidoId: 'pedido-2', clienteId: OUTRO_CLIENTE });
    const slotId = await publicarSlot(INICIO, FIM);

    const resultados = await Promise.allSettled([
      reunioes.agendar('pedido-1', CLIENTE, slotId, AGORA),
      reunioes.agendar('pedido-2', OUTRO_CLIENTE, slotId, AGORA),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const recusada = resultados.find((r) => r.status === 'rejected');
    expect((recusada as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
  });

  /**
   * O CASO QUE O CAMPO `reserva` DO SLOT NAO PEGA, e a razao de
   * `reunioesEmitidas` existir. Duas requisicoes do MESMO pedido para slots
   * DIFERENTES tocam documentos diferentes: sem escrever o pedido, as duas
   * transacoes nao conflitariam e as duas passariam — furando o saldo.
   */
  it('mesmo pedido, dois slots, saldo 1: um marca e o outro recebe 409', async () => {
    await comprar({ quantidadeReunioes: 1, intervaloMinimoReunioesDias: 0 });
    const primeiro = await publicarSlot(INICIO, FIM);
    const segundo = await publicarSlot(
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T18:00:00.000Z',
    );

    const resultados = await Promise.allSettled([
      reunioes.agendar('pedido-1', CLIENTE, primeiro, AGORA),
      reunioes.agendar('pedido-1', CLIENTE, segundo, AGORA),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const pedido = await banco.collection('pedidos').doc('pedido-1').get();
    expect(pedido.data()?.['reunioesEmitidas']).toBe(1);
  });
});
