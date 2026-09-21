import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { ConfiguracaoDoOutbox } from '../outbox/politica.js';
import { ConvitesService, type Destinatario } from './convites.service.js';
import { SalaDeReuniaoFalsa } from './sala/sala-de-reuniao-falsa.js';
import type { DocumentoReuniao } from './reuniao.js';

const CONFIG_OUTBOX: ConfiguracaoDoOutbox = {
  atrasoDoVarredorMs: 0,
  arrendamentoMs: 900_000,
  loteDoVarredor: 100,
};

const PEDIDO = 'pedido-1';
const CLIENTE = 'uid-clara';
const ADVOGADO = 'uid-ana';
const EVENTO = { pedidoId: PEDIDO, reuniaoId: 'r001', sequence: 0 };

const CLARA: Destinatario = {
  uid: CLIENTE,
  nome: 'Clara Dias',
  email: 'clara@exemplo.test',
};

const REUNIAO: DocumentoReuniao = {
  uid: 'pedido-1-r001@lexintegra.com.br',
  sequence: 0,
  sequenceComunicada: null,
  slotId: `${ADVOGADO}_2026-09-24T17:00:00.000Z`,
  inicio: '2026-09-24T17:00:00.000Z',
  fim: '2026-09-24T18:00:00.000Z',
  estado: 'reservada_sem_link',
  link: null,
  idExterno: null,
  advogadoId: ADVOGADO,
  clienteId: CLIENTE,
  criadoEm: null as never,
  historico: [],
};

function montar(reuniao: Partial<DocumentoReuniao> = {}): {
  servico: ConvitesService;
  banco: FirestoreFalso;
  sala: SalaDeReuniaoFalsa;
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
  banco.documentos.set(`advogados/${ADVOGADO}`, {
    nome: 'Ana Souza',
    usuarioTeams: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  });

  const sala = new SalaDeReuniaoFalsa();

  return {
    servico: new ConvitesService(db, sala, new OutboxService(db, CONFIG_OUTBOX)),
    banco,
    sala,
  };
}

describe('ConvitesService.criarSala', () => {
  it('cria a sala, grava o link e confirma a reuniao', async () => {
    const { servico, banco } = montar();

    const resultado = await servico.criarSala(EVENTO);

    expect(resultado.sucesso).toBe(true);
    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({
      estado: 'confirmada',
      link: expect.stringContaining('r001'),
      sequenceComunicada: 0,
    });
  });

  /** O outbox tem destinatario unico: dois convites, um para cada lado. */
  it('escreve DOIS convites, um por destinatario', async () => {
    const { servico, banco } = montar();

    await servico.criarSala(EVENTO);

    expect(banco.documentos.has(`outbox/convite-reuniao_${PEDIDO}_r001_s0_${CLIENTE}`)).toBe(true);
    expect(banco.documentos.has(`outbox/convite-reuniao_${PEDIDO}_r001_s0_${ADVOGADO}`)).toBe(true);
  });

  it('passa o usuarioTeams do advogado a porta', async () => {
    const { servico, sala } = montar();

    await servico.criarSala(EVENTO);

    expect(sala.pedidos[0]).toMatchObject({
      reuniaoId: 'r001',
      usuarioTeams: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      assunto: 'Reuniao: Revisao de contrato',
    });
  });

  it('reporta a falha da porta, sem gravar link', async () => {
    const { servico, banco, sala } = montar();
    sala.falharProximas(1, 'policy');

    const resultado = await servico.criarSala(EVENTO);

    expect(resultado).toMatchObject({ sucesso: false });
    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ estado: 'reservada_sem_link', link: null });
  });

  /* ---------------------------------------------------------------------- */
  /* As corridas                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * CANCELADA ANTES DA SALA. Nao cria nada: uma sala para uma reuniao que nao
   * vai acontecer e um link orfao no tenant do escritorio, e o convite que viria
   * atras iria para a agenda de duas pessoas ja avisadas do cancelamento.
   */
  it('reuniao cancelada antes da sala nao chama a porta', async () => {
    const { servico, sala } = montar({ estado: 'cancelada_com_devolucao' });

    const resultado = await servico.criarSala(EVENTO);

    expect(resultado.sucesso).toBe(true);
    expect(sala.pedidos).toHaveLength(0);
  });

  /**
   * REMARCADA ENTRE A CHAMADA E A GRAVACAO. O convite sai com o `sequence`
   * ATUAL, e nao com o do registro: senao o cliente receberia o horario velho
   * depois de ja ter remarcado.
   */
  it('usa o sequence ATUAL da reuniao no convite, nao o do evento', async () => {
    const { servico, banco } = montar({ sequence: 2 });

    await servico.criarSala(EVENTO);

    expect(banco.documentos.has(`outbox/convite-reuniao_${PEDIDO}_r001_s2_${CLIENTE}`)).toBe(true);
    expect(banco.documentos.has(`outbox/convite-reuniao_${PEDIDO}_r001_s0_${CLIENTE}`)).toBe(false);
    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ sequenceComunicada: 2 });
  });

  it('reuniao inexistente e reportada, nao explode', async () => {
    const { servico } = montar();

    await expect(
      servico.criarSala({ ...EVENTO, reuniaoId: 'r099' }),
    ).resolves.toMatchObject({ sucesso: false });
  });
});

describe('ConvitesService.montarConvite', () => {
  const COM_SALA = {
    estado: 'confirmada' as const,
    link: 'https://teams.test/sala',
  };

  it('monta o convite com o .ics em anexo', async () => {
    const { servico } = montar(COM_SALA);

    const convite = await servico.montarConvite(EVENTO, CLARA);

    expect(convite.enviar).toBe(true);
    if (!convite.enviar) return;
    expect(convite.mensagem.para).toEqual(['clara@exemplo.test']);
    expect(convite.mensagem.anexos?.[0].nomeArquivo).toBe('reuniao.ics');
    expect(convite.mensagem.anexos?.[0].tipoConteudo).toContain('text/calendar');
  });

  it('o .ics leva o UID da reuniao e o link da sala', async () => {
    const { servico } = montar(COM_SALA);

    const convite = await servico.montarConvite(EVENTO, CLARA);

    if (!convite.enviar) throw new Error('deveria enviar');
    const ics = String(convite.mensagem.anexos?.[0].conteudo);
    expect(ics).toContain('UID:pedido-1-r001@lexintegra.com.br');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('https://teams.test/sala');
  });

  /**
   * CONVITE SUPERADO POR REMARCACAO. Entrega-lo poria o horario VELHO na agenda
   * de quem o recebesse depois do convite novo. Nao enviar conclui o registro
   * como SUCESSO: nao ha o que reentregar.
   */
  it('nao envia convite com sequence menor que o da reuniao', async () => {
    const { servico } = montar({ ...COM_SALA, sequence: 1 });

    await expect(servico.montarConvite(EVENTO, CLARA)).resolves.toEqual({
      enviar: false,
      motivo: expect.stringContaining('remarcacao'),
    });
  });

  it('envia quando o sequence do evento e o da reuniao', async () => {
    const { servico } = montar({ ...COM_SALA, sequence: 1 });

    const convite = await servico.montarConvite(
      { ...EVENTO, sequence: 1 },
      CLARA,
    );

    expect(convite.enviar).toBe(true);
  });

  it('nao envia convite de reuniao cancelada', async () => {
    const { servico } = montar({
      ...COM_SALA,
      estado: 'cancelada_sem_devolucao',
    });

    await expect(servico.montarConvite(EVENTO, CLARA)).resolves.toEqual({
      enviar: false,
      motivo: expect.stringContaining('cancelada'),
    });
  });

  /**
   * REGRA INVIOLAVEL 13: sem link nao sai convite. Nunca um link vazio, nem o de
   * outra reuniao.
   */
  it('nao envia convite sem sala', async () => {
    const { servico } = montar();

    await expect(servico.montarConvite(EVENTO, CLARA)).resolves.toEqual({
      enviar: false,
      motivo: expect.stringContaining('sem sala'),
    });
  });
});

describe('ConvitesService.montarCancelamento', () => {
  /**
   * SO SAI SE ALGUM CONVITE FOI EMITIDO. `sequenceComunicada` nula significa que
   * a reuniao nunca chegou ao calendario de ninguem — um `CANCEL` para um `UID`
   * que o destinatario nunca viu e, na pior hipotese, um evento cancelado que
   * aparece na agenda so para ser cancelado.
   */
  it('nao envia CANCEL se nenhum convite foi emitido', async () => {
    const { servico } = montar({
      estado: 'cancelada_com_devolucao',
      sequenceComunicada: null,
    });

    await expect(
      servico.montarCancelamento(EVENTO, CLARA),
    ).resolves.toEqual({
      enviar: false,
      motivo: expect.stringContaining('nenhum convite'),
    });
  });

  it('envia METHOD:CANCEL com o mesmo UID quando houve convite', async () => {
    const { servico } = montar({
      estado: 'cancelada_com_devolucao',
      sequence: 1,
      sequenceComunicada: 0,
      link: 'https://teams.test/sala',
    });

    const convite = await servico.montarCancelamento(EVENTO, CLARA);

    if (!convite.enviar) throw new Error('deveria enviar');
    const ics = String(convite.mensagem.anexos?.[0].conteudo);
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('UID:pedido-1-r001@lexintegra.com.br');
    expect(ics).toContain('SEQUENCE:1');
  });

  /** A sala continua existindo (ADR-21, decisao 7); o link nao vai no CANCEL. */
  it('o CANCEL nao leva o link', async () => {
    const { servico } = montar({
      estado: 'cancelada_com_devolucao',
      sequenceComunicada: 0,
      link: 'https://teams.test/sala',
    });

    const convite = await servico.montarCancelamento(EVENTO, CLARA);

    if (!convite.enviar) throw new Error('deveria enviar');
    expect(String(convite.mensagem.anexos?.[0].conteudo)).not.toContain(
      'teams.test',
    );
  });
});
