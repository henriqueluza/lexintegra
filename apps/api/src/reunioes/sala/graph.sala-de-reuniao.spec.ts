import {
  ERRO_SEGREDO_EXPIRADO,
  ERRO_SEM_POLICY,
  ID_DA_SALA_FICTICIA,
  LINK_DA_SALA_FICTICIA,
  ORGANIZADORA_FICTICIA,
  reuniaoNoFormatoReal,
} from '../../arnes-reuniao.js';
import { GraphSalaDeReuniao, OPCOES_DA_SALA } from './graph.sala-de-reuniao.js';
import type { CredenciaisGraph } from './modo.js';
import type { NovaSala } from './sala-de-reuniao.js';

/**
 * NENHUMA CHAMADA REAL A MICROSOFT, em teste nenhum desta suite. O `fetch` e
 * dublado, e as respostas sao a da chamada de teste manual de 01/11/2026,
 * anonimizada (`arnes-reuniao.ts`) — nao um corpo montado a partir da
 * documentacao.
 */

const CREDENCIAIS: CredenciaisGraph = {
  tenantId: 'tenant-da-bec',
  clientId: 'cliente-lexintegra',
  clientSecret: 'segredo-de-mentira',
};

const PEDIDO: NovaSala = {
  externalId: 'pix_char_czxa1U3t5ZpHDY6p65fWCFnW_001-r001',
  advogadoId: 'uid-ana',
  organizadorId: ORGANIZADORA_FICTICIA,
  inicio: '2026-09-24T17:00:00.000Z',
  fim: '2026-09-24T18:00:00.000Z',
  assunto: 'Reunião LexIntegra — pedido fWCFnW-001',
};

const SALAS = `https://graph.microsoft.com/v1.0/users/${ORGANIZADORA_FICTICIA}/onlineMeetings`;

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly semJson?: boolean;
}

const TOKEN_OK: Resposta = {
  status: 200,
  corpo: { access_token: 'token-de-teste', expires_in: 3600 },
};

/** O `createOrGet` que criou a sala agora. */
const REUNIAO_OK: Resposta = { status: 201, corpo: reuniaoNoFormatoReal() };

/** O PATCH das opcoes, que devolve a sala como ficou. */
const AJUSTE_OK: Resposta = { status: 200, corpo: reuniaoNoFormatoReal() };

interface Requisicao {
  readonly url: string;
  readonly metodo: string;
  readonly cabecalhos: Record<string, string>;
  readonly corpo: string;
}

function fetchFalso(respostas: readonly Resposta[]): {
  executar: typeof fetch;
  requisicoes: Requisicao[];
} {
  const requisicoes: Requisicao[] = [];
  const fila = [...respostas];

  const executar = ((url: string, opcoes: RequestInit) => {
    requisicoes.push({
      url,
      metodo: String(opcoes.method),
      cabecalhos: opcoes.headers as Record<string, string>,
      corpo: String(opcoes.body),
    });

    const proxima = fila.shift();
    if (proxima === undefined) throw new Error('resposta nao programada');

    return Promise.resolve({
      ok: proxima.status < 400,
      status: proxima.status,
      json: () =>
        proxima.semJson === true
          ? Promise.reject(new Error('nao e JSON'))
          : Promise.resolve(proxima.corpo),
    } as Response);
  }) as unknown as typeof fetch;

  return { executar, requisicoes };
}

function montar(
  respostas: readonly Resposta[],
  agora = () => 1_000_000,
): {
  sala: GraphSalaDeReuniao;
  requisicoes: Requisicao[];
} {
  const { executar, requisicoes } = fetchFalso(respostas);
  return {
    sala: new GraphSalaDeReuniao(CREDENCIAIS, { fetch: executar, agora }),
    requisicoes,
  };
}

describe('GraphSalaDeReuniao', () => {
  it('pede o token e cria a reuniao', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK, AJUSTE_OK]);

    await expect(sala.criar(PEDIDO)).resolves.toEqual({
      sucesso: true,
      link: LINK_DA_SALA_FICTICIA,
      idExterno: ID_DA_SALA_FICTICIA,
      jaExistia: false,
    });
    expect(requisicoes.map((r) => r.metodo)).toEqual(['POST', 'POST', 'PATCH']);
  });

  it('pede o token por client credentials, no tenant configurado', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK, AJUSTE_OK]);

    await sala.criar(PEDIDO);

    expect(requisicoes[0].url).toBe(
      'https://login.microsoftonline.com/tenant-da-bec/oauth2/v2.0/token',
    );
    expect(requisicoes[0].corpo).toContain('grant_type=client_credentials');
    expect(requisicoes[0].corpo).toContain(
      'scope=https%3A%2F%2Fgraph.microsoft.com%2F.default',
    );
  });

  /**
   * O CAMINHO COM TOKEN DE APLICACAO E `/users/{userId}/...`, e o `{userId}` e o
   * object ID, no Entra, da CONTA ORGANIZADORA — nao o uid do Firebase nem o
   * advogado, que entra como convidado.
   */
  it('cria em /users/{organizador}/onlineMeetings/createOrGet', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK, AJUSTE_OK]);

    await sala.criar(PEDIDO);

    expect(requisicoes[1].url).toBe(`${SALAS}/createOrGet`);
    expect(requisicoes[1].cabecalhos['Authorization']).toBe(
      'Bearer token-de-teste',
    );
  });

  /**
   * O `createOrGet` SO ACEITA estes quatro campos (mais `participants`, que nao
   * usamos). Uma opcao de reuniao mandada aqui seria ignorada em silencio — por
   * isso elas vao no PATCH.
   */
  it('manda o externalId, os horarios e o assunto, e nada mais', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK, AJUSTE_OK]);

    await sala.criar(PEDIDO);

    expect(JSON.parse(requisicoes[1].corpo)).toEqual({
      externalId: 'pix_char_czxa1U3t5ZpHDY6p65fWCFnW_001-r001',
      startDateTime: '2026-09-24T17:00:00.000Z',
      endDateTime: '2026-09-24T18:00:00.000Z',
      subject: 'Reunião LexIntegra — pedido fWCFnW-001',
    });
  });

  /**
   * AS OPCOES DO ESCRITORIO, no PATCH da sala que acabou de nascer, com os
   * horarios junto: o `createOrGet` de uma sala que ja existia nao os atualiza.
   * O id da reuniao vai codificado no caminho — tem `=`.
   */
  it('aplica as opcoes por PATCH, no id que o createOrGet devolveu', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK, AJUSTE_OK]);

    await sala.criar(PEDIDO);

    expect(requisicoes[2].metodo).toBe('PATCH');
    expect(requisicoes[2].url).toBe(
      `${SALAS}/${encodeURIComponent(ID_DA_SALA_FICTICIA)}`,
    );
    expect(JSON.parse(requisicoes[2].corpo)).toEqual({
      allowedPresenters: 'everyone',
      allowMeetingChat: 'disabled',
      recordAutomatically: false,
      allowRecording: false,
      allowTranscription: false,
      lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true },
      startDateTime: '2026-09-24T17:00:00.000Z',
      endDateTime: '2026-09-24T18:00:00.000Z',
      subject: 'Reunião LexIntegra — pedido fWCFnW-001',
    });
    expect(OPCOES_DA_SALA).toEqual({
      allowedPresenters: 'everyone',
      allowMeetingChat: 'disabled',
      recordAutomatically: false,
      allowRecording: false,
      allowTranscription: false,
      lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true },
    });
  });

  /**
   * SEM PATCH, SEM LINK. A sala criada com as opcoes do tenant, e nao as do
   * escritorio, nao pode chegar a ninguem: a falha e reentregavel, e a nova
   * tentativa repete as duas chamadas (o `createOrGet` devolve a mesma sala).
   */
  it('PATCH recusado e falha, com o motivo do Graph', async () => {
    const { sala } = montar([
      TOKEN_OK,
      REUNIAO_OK,
      {
        status: 400,
        corpo: {
          error: { code: 'BadRequest', message: 'Invalid lobby scope.' },
        },
      },
    ]);

    await expect(sala.criar(PEDIDO)).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringMatching(
        /^sala criada, opcoes nao aplicadas: HTTP 400: BadRequest: Invalid lobby scope\.$/u,
      ),
    });
  });

  it('o link vem da resposta do PATCH, que e a sala como ficou', async () => {
    const outro =
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_depois';
    const { sala } = montar([
      TOKEN_OK,
      REUNIAO_OK,
      { status: 200, corpo: reuniaoNoFormatoReal({ joinWebUrl: outro }) },
    ]);

    const resultado = await sala.criar(PEDIDO);

    expect(resultado.sucesso && resultado.link).toBe(outro);
  });

  /** 201 criou, 200 reaproveitou. Os dois sao sucesso (contrato da porta). */
  it.each([
    [201, false],
    [200, true],
  ])('status %i vira jaExistia: %s', async (status, esperado) => {
    const { sala } = montar([TOKEN_OK, { ...REUNIAO_OK, status }, AJUSTE_OK]);

    const resultado = await sala.criar(PEDIDO);

    expect(resultado.sucesso && resultado.jaExistia).toBe(esperado);
  });

  it('reaproveita o token entre duas criacoes', async () => {
    const { sala, requisicoes } = montar([
      TOKEN_OK,
      REUNIAO_OK,
      AJUSTE_OK,
      REUNIAO_OK,
      AJUSTE_OK,
    ]);

    await sala.criar(PEDIDO);
    await sala.criar({
      ...PEDIDO,
      externalId: 'pix_char_czxa1U3t5ZpHDY6p65fWCFnW_001-r002',
    });

    /* Cinco chamadas, e nao seis: um token para as duas reunioes. */
    expect(requisicoes).toHaveLength(5);
  });

  it('pede token novo quando o guardado expirou', async () => {
    let relogio = 1_000_000;
    const { sala, requisicoes } = montar(
      [TOKEN_OK, REUNIAO_OK, AJUSTE_OK, TOKEN_OK, REUNIAO_OK, AJUSTE_OK],
      () => relogio,
    );

    await sala.criar(PEDIDO);
    relogio += 3_600_000;
    await sala.criar({
      ...PEDIDO,
      externalId: 'pix_char_czxa1U3t5ZpHDY6p65fWCFnW_001-r002',
    });

    expect(requisicoes).toHaveLength(6);
  });

  /* ---------------------------------------------------------------------- */
  /* Remarcacao e cancelamento (`feat/ligar-teams`)                          */
  /* ---------------------------------------------------------------------- */

  const EXISTENTE = {
    organizadorId: ORGANIZADORA_FICTICIA,
    idExterno: ID_DA_SALA_FICTICIA,
    inicio: '2026-10-01T17:00:00.000Z',
    fim: '2026-10-01T18:00:00.000Z',
    assunto: 'Reunião LexIntegra — pedido fWCFnW-001',
  };

  it('remarca com o mesmo PATCH da criacao, no horario novo', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, AJUSTE_OK]);

    await expect(sala.atualizar(EXISTENTE)).resolves.toEqual({ sucesso: true });

    expect(requisicoes[1].metodo).toBe('PATCH');
    expect(requisicoes[1].url).toBe(
      `${SALAS}/${encodeURIComponent(ID_DA_SALA_FICTICIA)}`,
    );
    expect(JSON.parse(requisicoes[1].corpo)).toEqual({
      ...OPCOES_DA_SALA,
      startDateTime: '2026-10-01T17:00:00.000Z',
      endDateTime: '2026-10-01T18:00:00.000Z',
      subject: 'Reunião LexIntegra — pedido fWCFnW-001',
    });
  });

  it('a remarcacao recusada e falha, com o motivo', async () => {
    const { sala } = montar([
      TOKEN_OK,
      { status: 403, corpo: ERRO_SEM_POLICY },
    ]);

    await expect(sala.atualizar(EXISTENTE)).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringContaining('No application access policy found'),
    });
  });

  it('remove com DELETE no organizador persistido; 204 e sucesso', async () => {
    const { sala, requisicoes } = montar([
      TOKEN_OK,
      { status: 204, corpo: null, semJson: true },
    ]);

    await expect(
      sala.remover(ORGANIZADORA_FICTICIA, ID_DA_SALA_FICTICIA),
    ).resolves.toEqual({ sucesso: true });

    expect(requisicoes[1].metodo).toBe('DELETE');
    expect(requisicoes[1].url).toBe(
      `${SALAS}/${encodeURIComponent(ID_DA_SALA_FICTICIA)}`,
    );
  });

  /** A nova tentativa de um DELETE que ja deu certo recebe 404. */
  it('sala que ja nao existe e sucesso na remocao', async () => {
    const { sala } = montar([
      TOKEN_OK,
      {
        status: 404,
        corpo: { error: { code: 'NotFound', message: 'Meeting not found.' } },
      },
    ]);

    await expect(
      sala.remover(ORGANIZADORA_FICTICIA, ID_DA_SALA_FICTICIA),
    ).resolves.toEqual({ sucesso: true });
  });

  it('a remocao recusada e falha, para o outbox reentregar', async () => {
    const { sala } = montar([
      TOKEN_OK,
      { status: 403, corpo: ERRO_SEM_POLICY },
    ]);

    await expect(
      sala.remover(ORGANIZADORA_FICTICIA, ID_DA_SALA_FICTICIA),
    ).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringContaining('No application access policy found'),
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Falhas — todas REPORTADAS, nenhuma lancada                              */
  /* ---------------------------------------------------------------------- */

  /**
   * A FALHA MAIS IMPORTANTE DESTE ARQUIVO. `No application access policy found`
   * some sozinha quando a propagacao terminar (ate 48h, ADR-05 risco 1), entao
   * precisa virar falha COM ORCAMENTO — o outbox reentrega. O adaptador reporta
   * em vez de lancar, e preserva o texto: e ele que distingue esta espera de uma
   * licenca ausente, que so um humano resolve.
   */
  it('reporta a falta de application access policy, sem lancar', async () => {
    const { sala } = montar([
      TOKEN_OK,
      { status: 403, corpo: ERRO_SEM_POLICY },
    ]);

    const resultado = await sala.criar(PEDIDO);

    expect(resultado).toEqual({
      sucesso: false,
      motivo: expect.stringContaining('No application access policy found'),
    });
  });

  /**
   * O SEGREDO EXPIRADO, no formato OAuth do Entra. Falha com nova tentativa,
   * como todas — so um humano resolve, mas o outbox nao sabe disso, e o que
   * importa e o painel DIZER o que aconteceu: o codigo AADSTS esta no motivo.
   */
  it('o client secret expirado vira falha com o codigo AADSTS', async () => {
    const { sala, requisicoes } = montar([
      { status: 401, corpo: ERRO_SEGREDO_EXPIRADO },
    ]);

    const resultado = await sala.criar(PEDIDO);

    expect(resultado).toEqual({
      sucesso: false,
      motivo:
        "HTTP 401: invalid_client: AADSTS7000222: The provided client secret keys for app '11111111-2222-4333-8444-555555555555' are expired",
    });
    /* Nem chegou ao Graph: sem token, nenhuma sala. */
    expect(requisicoes).toHaveLength(1);
  });

  /**
   * 401 DO GRAPH ESQUECE O TOKEN. Sem isso, um token revogado continuaria sendo
   * usado ate expirar, e cada nova tentativa da proxima hora repetiria o 401.
   */
  it('um 401 do Graph faz a proxima chamada pedir token novo', async () => {
    const { sala, requisicoes } = montar([
      TOKEN_OK,
      {
        status: 401,
        corpo: {
          error: {
            code: 'InvalidAuthenticationToken',
            message: 'Access token validation failure.',
          },
        },
      },
      TOKEN_OK,
      REUNIAO_OK,
      AJUSTE_OK,
    ]);

    await expect(sala.criar(PEDIDO)).resolves.toMatchObject({
      sucesso: false,
      motivo: expect.stringContaining('InvalidAuthenticationToken'),
    });
    await expect(sala.criar(PEDIDO)).resolves.toMatchObject({ sucesso: true });

    expect(requisicoes.map((r) => r.url.split('/').at(-1))).toEqual([
      'token',
      'createOrGet',
      'token',
      'createOrGet',
      encodeURIComponent(ID_DA_SALA_FICTICIA),
    ]);
  });

  it('reporta falha de rede', async () => {
    const executar = (() =>
      Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch;
    const sala = new GraphSalaDeReuniao(CREDENCIAIS, { fetch: executar });

    await expect(sala.criar(PEDIDO)).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringContaining('sem resposta do Graph'),
    });
  });

  it('reporta resposta sem JSON', async () => {
    const { sala } = montar([{ status: 502, corpo: null, semJson: true }]);

    await expect(sala.criar(PEDIDO)).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringContaining('sem JSON'),
    });
  });

  /**
   * TODA RESPOSTA E VALIDADA. Um campo que mude de nome tem que falhar AQUI, com
   * mensagem, e nao virar `undefined` num link que o cliente recebe por e-mail.
   */
  it('recusa resposta sem joinWebUrl, dizendo qual campo falta', async () => {
    const { sala } = montar([
      TOKEN_OK,
      { status: 201, corpo: reuniaoNoFormatoReal({ joinWebUrl: undefined }) },
    ]);

    await expect(sala.criar(PEDIDO)).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringContaining('joinWebUrl'),
    });
  });

  it('recusa token fora do formato', async () => {
    const { sala } = montar([{ status: 200, corpo: { token: 'errado' } }]);

    await expect(sala.criar(PEDIDO)).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringContaining('token fora do formato'),
    });
  });

  /**
   * REGRA INVIOLAVEL 9. O motivo e gravado em `outbox.ultimoErro`, aparece no
   * painel do administrador e vai para o Cloud Logging. Um servico que ecoe o
   * corpo recebido poria o `client_secret` nos tres lugares de uma vez.
   */
  it('nunca deixa o client_secret sair no motivo', async () => {
    const { sala } = montar([
      {
        status: 400,
        corpo: {
          error: {
            code: 'InvalidRequest',
            message: `client_secret invalido: ${CREDENCIAIS.clientSecret}`,
          },
        },
      },
    ]);

    const resultado = await sala.criar(PEDIDO);

    expect(resultado.sucesso).toBe(false);
    if (resultado.sucesso) return;
    expect(resultado.motivo).not.toContain(CREDENCIAIS.clientSecret);
    expect(resultado.motivo).toContain('[segredo]');
  });
});
