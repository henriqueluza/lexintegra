import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { OutboxService } from '../outbox/outbox.service.js';
import type { ConfiguracaoDoOutbox } from '../outbox/politica.js';
import { ConvitesService, type Destinatario } from './convites.service.js';
import { textoDaReuniaoDesmarcada } from './textos-de-reuniao.js';
import type { ConfiguracaoReunioes } from './sala/modo.js';
import { assuntoDaSala } from './sala-da-reuniao.js';
import { SalaDeReuniaoFalsa } from './sala/sala-de-reuniao-falsa.js';
import type { DocumentoReuniao } from './reuniao.js';
import { comRodape } from '../email/rodape.js';

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
  organizadorId: null,
  advogadoId: ADVOGADO,
  clienteId: CLIENTE,
  criadoEm: null as never,
  historico: [],
};

/** A conta organizadora do escritorio, ficticia. */
const ORGANIZADORA = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const DA_ANA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function montar(
  reuniao: Partial<DocumentoReuniao> = {},
  {
    organizadorDoAdvogado = null as string | null,
    configuracao = {
      modo: 'falso',
      graph: null,
      organizadorPadrao: ORGANIZADORA,
    } as ConfiguracaoReunioes,
  } = {},
): {
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
    organizadorTeams: organizadorDoAdvogado,
  });

  const sala = new SalaDeReuniaoFalsa();

  return {
    servico: new ConvitesService(
      db,
      sala,
      new OutboxService(db, CONFIG_OUTBOX),
      configuracao,
    ),
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

    expect(
      banco.documentos.has(
        `outbox/convite-reuniao_${PEDIDO}_r001_s0_${CLIENTE}`,
      ),
    ).toBe(true);
    expect(
      banco.documentos.has(
        `outbox/convite-reuniao_${PEDIDO}_r001_s0_${ADVOGADO}`,
      ),
    ).toBe(true);
  });

  it('cria pela conta organizadora, com externalId do pedido e da reuniao', async () => {
    const { servico, sala } = montar();

    await servico.criarSala(EVENTO);

    expect(sala.pedidos[0]).toEqual({
      externalId: `${PEDIDO}-r001`,
      advogadoId: ADVOGADO,
      organizadorId: ORGANIZADORA,
      inicio: REUNIAO.inicio,
      fim: REUNIAO.fim,
      assunto: 'Reunião LexIntegra — pedido pedido-1',
    });
  });

  /** LGPD: o assunto da sala nao leva nome, produto nem dado do cliente. */
  it('o assunto da sala so tem o codigo curto do pedido', () => {
    expect(assuntoDaSala('pix_char_czxa1U3t5ZpHDY6p65fWCFnW_001')).toBe(
      'Reunião LexIntegra — pedido fWCFnW-001',
    );
  });

  it('o organizadorTeams do advogado vence a conta organizadora', async () => {
    const { servico, sala } = montar({}, { organizadorDoAdvogado: DA_ANA });

    await servico.criarSala(EVENTO);

    expect(sala.pedidos[0]?.organizadorId).toBe(DA_ANA);
  });

  it('le o nome antigo do campo do advogado', async () => {
    const { servico, banco, sala } = montar();
    banco.documentos.set(`advogados/${ADVOGADO}`, {
      nome: 'Ana Souza',
      usuarioTeams: DA_ANA,
    });

    await servico.criarSala(EVENTO);

    expect(sala.pedidos[0]?.organizadorId).toBe(DA_ANA);
  });

  /**
   * O ORGANIZADOR E FIXADO ANTES DO GRAPH. A falha de policy deixa a reuniao
   * sem link, mas com o organizador gravado; o administrador muda o cadastro
   * do advogado; a nova tentativa usa o MESMO organizador. Sem isso, ela criaria
   * a sala noutra conta, e a primeira ficaria sem ninguem para apaga-la.
   */
  it('a nova tentativa usa o organizador gravado, nao o cadastro atual', async () => {
    const { servico, banco, sala } = montar();
    sala.falharProximas(1, 'policy');

    await servico.criarSala(EVENTO);
    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ organizadorId: ORGANIZADORA, link: null });

    banco.documentos.set(`advogados/${ADVOGADO}`, {
      nome: 'Ana Souza',
      organizadorTeams: DA_ANA,
    });
    await servico.criarSala(EVENTO);

    expect(sala.pedidos.map((pedido) => pedido.organizadorId)).toEqual([
      ORGANIZADORA,
      ORGANIZADORA,
    ]);
  });

  it('sem organizador nenhum, falha nomeada e sem chamar a porta', async () => {
    const { servico, banco, sala } = montar(
      {},
      {
        configuracao: {
          modo: 'sem-sala',
          graph: null,
          organizadorPadrao: null,
        },
      },
    );

    const resultado = await servico.criarSala(EVENTO);

    expect(resultado).toEqual({
      sucesso: false,
      motivo: expect.stringContaining('TEAMS_ORGANIZADOR_PADRAO ausente'),
    });
    expect(sala.pedidos).toHaveLength(0);
    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({ estado: 'reservada_sem_link', organizadorId: null });
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

    expect(
      banco.documentos.has(
        `outbox/convite-reuniao_${PEDIDO}_r001_s2_${CLIENTE}`,
      ),
    ).toBe(true);
    expect(
      banco.documentos.has(
        `outbox/convite-reuniao_${PEDIDO}_r001_s0_${CLIENTE}`,
      ),
    ).toBe(false);
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

  /**
   * A CORRIDA COM O CANCELAMENTO. O cliente cancelou enquanto o Graph criava a
   * sala: o cancelamento nao pediu DELETE (ainda nao havia `idExterno`), entao
   * quem pede e a gravacao do link, que encontra a reuniao cancelada.
   */
  it('cancelada durante a criacao, grava o link e pede o DELETE', async () => {
    const { servico, banco, sala } = montar();
    const criar = sala.criar.bind(sala);
    sala.criar = async (nova) => {
      const criada = await criar(nova);
      banco.documentos.set(`pedidos/${PEDIDO}/reunioes/r001`, {
        ...banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
        estado: 'cancelada_com_devolucao',
      });
      return criada;
    };

    await servico.criarSala(EVENTO);

    expect(
      banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
    ).toMatchObject({
      estado: 'cancelada_com_devolucao',
      idExterno: `sala_falsa_${PEDIDO}-r001`,
    });
    expect(
      banco.documentos.has(`outbox/remover-sala-reuniao_${PEDIDO}_r001`),
    ).toBe(true);
    expect(
      [...banco.documentos.keys()].some((k) =>
        k.startsWith('outbox/convite-reuniao'),
      ),
    ).toBe(false);
  });
});

describe('ConvitesService.atualizarSala e removerSala', () => {
  const COM_SALA: Partial<DocumentoReuniao> = {
    estado: 'confirmada',
    sequence: 1,
    link: 'https://teams.test/sala',
    idExterno: 'sala_1',
    organizadorId: ORGANIZADORA,
    inicio: '2026-10-01T17:00:00.000Z',
    fim: '2026-10-01T18:00:00.000Z',
  };
  const REMARCADA = { ...EVENTO, sequence: 1 };

  it('remarca no organizador e na sala persistidos, no horario atual', async () => {
    const { servico, banco, sala } = montar(COM_SALA, {
      organizadorDoAdvogado: DA_ANA,
    });
    banco.documentos.set(`pedidos/${PEDIDO}/reunioes/r001`, {
      ...banco.documentos.get(`pedidos/${PEDIDO}/reunioes/r001`),
      inicio: '2026-10-02T17:00:00.000Z',
      fim: '2026-10-02T18:00:00.000Z',
    });

    await expect(servico.atualizarSala(REMARCADA)).resolves.toEqual({
      sucesso: false,
      motivo: 'NotFound: sala inexistente neste organizador.',
    });
    /* O falso recusa porque a sala nao foi criada por ele; o pedido e o que importa. */
    expect(sala.atualizacoes).toEqual([
      {
        organizadorId: ORGANIZADORA,
        idExterno: 'sala_1',
        inicio: '2026-10-02T17:00:00.000Z',
        fim: '2026-10-02T18:00:00.000Z',
        assunto: 'Reunião LexIntegra — pedido pedido-1',
      },
    ]);
  });

  it('a sala criada pelo fluxo normal aceita a remarcacao', async () => {
    const { servico, sala } = montar();
    await servico.criarSala(EVENTO);

    await expect(servico.atualizarSala(EVENTO)).resolves.toEqual({
      sucesso: true,
    });
    expect(sala.atualizacoes).toHaveLength(1);
  });

  it.each([
    [
      'sem sala',
      { ...COM_SALA, idExterno: null, link: null },
      'reuniao ainda sem sala',
    ],
    [
      'cancelada',
      { ...COM_SALA, estado: 'cancelada_com_devolucao' as const },
      'reuniao cancelada',
    ],
    ['superada', { ...COM_SALA, sequence: 2 }, 'superado por remarcacao'],
  ])('pula a remarcacao %s, com sucesso', async (_caso, reuniao, pulado) => {
    const { servico, sala } = montar(reuniao);

    await expect(servico.atualizarSala(REMARCADA)).resolves.toEqual({
      sucesso: true,
      pulado,
    });
    expect(sala.atualizacoes).toHaveLength(0);
  });

  it('remove a sala no organizador persistido', async () => {
    const { servico, sala } = montar(
      { ...COM_SALA, estado: 'cancelada_com_devolucao' },
      { organizadorDoAdvogado: DA_ANA },
    );

    await expect(servico.removerSala(REMARCADA)).resolves.toEqual({
      sucesso: true,
    });
    expect(sala.remocoes).toEqual([
      { organizadorId: ORGANIZADORA, idExterno: 'sala_1' },
    ]);
  });

  it('pula a remocao da reuniao sem sala', async () => {
    const { servico, sala } = montar({ estado: 'cancelada_com_devolucao' });

    await expect(servico.removerSala(EVENTO)).resolves.toEqual({
      sucesso: true,
      pulado: 'reuniao sem sala',
    });
    expect(sala.remocoes).toHaveLength(0);
  });

  it('sala sem organizador gravado e falha nomeada, sem adivinhar', async () => {
    const { servico, sala } = montar({ ...COM_SALA, organizadorId: null });

    await expect(servico.removerSala(REMARCADA)).resolves.toEqual({
      sucesso: false,
      motivo: 'reuniao com sala e sem organizadorId gravado',
    });
    expect(sala.remocoes).toHaveLength(0);
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
    expect(convite.mensagem.anexos?.[0].tipoConteudo).toContain(
      'text/calendar',
    );
  });

  /**
   * O ADVOGADO ENTRA COMO CONVIDADO (`feat/ligar-teams`): quem organiza a sala
   * e a conta do escritorio. O texto dele diz como entrar; o do cliente fala do
   * saldo e da remarcacao, que so o cliente faz.
   */
  it('o advogado recebe o texto de quem entra como convidado', async () => {
    const { servico } = montar(COM_SALA);
    const ana: Destinatario = {
      uid: ADVOGADO,
      nome: 'Ana Souza',
      email: 'ana@escritorio.test',
    };

    const doAdvogado = await servico.montarConvite(EVENTO, ana);
    const doCliente = await servico.montarConvite(EVENTO, CLARA);

    if (!doAdvogado.enviar || !doCliente.enviar) {
      throw new Error('os dois convites deveriam sair');
    }
    expect(doAdvogado.mensagem.corpoTexto).toContain(
      'abra o link no navegador e digite o seu nome',
    );
    expect(doAdvogado.mensagem.corpoTexto).toContain('sem precisar de conta');
    expect(doAdvogado.mensagem.corpoTexto).not.toContain('saldo');
    expect(doCliente.mensagem.corpoTexto).toContain('volta ao saldo');
    expect(doCliente.mensagem.corpoTexto).not.toContain('convidado');
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

  it.each([
    [CLARA, '/painel'],
    [
      { uid: ADVOGADO, nome: 'Ana', email: 'ana@exemplo.test' },
      '/advogado/demandas',
    ],
  ] as const)(
    'o HTML aponta a área correta sem alterar o calendário: %j',
    async (destinatario, caminho) => {
      const { servico } = montar(COM_SALA);
      const convite = await servico.montarConvite(EVENTO, destinatario);
      if (!convite.enviar) throw new Error('deveria enviar');
      const pronto = comRodape(convite.mensagem);
      expect(pronto.corpoHtml).toContain('Ver pedido');
      expect(pronto.acao?.url).toMatch(new RegExp(`${caminho}$`, 'u'));
      expect(pronto.anexos).toBe(convite.mensagem.anexos);
      expect(pronto.corpoTexto).toContain(convite.mensagem.corpoTexto);
    },
  );

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

    await expect(servico.montarCancelamento(EVENTO, CLARA)).resolves.toEqual({
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

describe('ConvitesService.montarAvisoDoEscritorio', () => {
  /** ADR-21, decisao H: o cliente sabe que o escritorio desmarcou, e remarca. */
  it('avisa com o caminho para remarcar, sem anexo', async () => {
    const { servico } = montar({
      estado: 'cancelada_com_devolucao',
      sequenceComunicada: null,
    });

    const aviso = await servico.montarAvisoDoEscritorio(EVENTO, CLARA);

    if (!aviso.enviar) throw new Error('deveria enviar');
    expect(aviso.mensagem.assunto).toMatch(/desmarcada pelo escritório/);
    expect(aviso.mensagem.corpoTexto).toContain('/painel');
    expect(aviso.mensagem.anexos).toBeUndefined();
  });

  it('nao avisa reuniao que nao foi desmarcada com devolucao', async () => {
    const { servico } = montar({ estado: 'cancelada_sem_devolucao' });

    await expect(
      servico.montarAvisoDoEscritorio(EVENTO, CLARA),
    ).resolves.toEqual({ enviar: false, motivo: expect.any(String) });
  });
});

describe('textoDaReuniaoDesmarcada', () => {
  it('escreve a data por extenso no fuso de Sao Paulo', () => {
    const texto = textoDaReuniaoDesmarcada(
      '2026-10-02T17:00:00.000Z',
      'https://lexintegra.com.br',
    );
    expect(texto).toContain('2 de outubro de 2026');
    expect(texto).toContain('14:00');
    expect(texto).toContain('https://lexintegra.com.br/painel');
  });
});
