import { GraphSalaDeReuniao } from './graph.sala-de-reuniao.js';
import type { CredenciaisGraph } from './modo.js';
import type { NovaSala } from './sala-de-reuniao.js';

/**
 * NENHUMA CHAMADA REAL A MICROSOFT, em teste nenhum desta suite. O `fetch` e
 * dublado, e o adaptador so e alcancavel por ele: `REUNIOES_MODO` nao aceita
 * `graph`, entao a fabrica nunca o instancia em execucao de verdade.
 */

const CREDENCIAIS: CredenciaisGraph = {
  tenantId: 'tenant-da-bec',
  clientId: 'cliente-lexintegra',
  clientSecret: 'segredo-de-mentira',
};

const PEDIDO: NovaSala = {
  reuniaoId: 'pedido-1_r001',
  advogadoId: 'uid-ana',
  usuarioTeams: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  inicio: '2026-09-24T17:00:00.000Z',
  fim: '2026-09-24T18:00:00.000Z',
  assunto: 'Reuniao: Revisao de contrato',
};

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
  readonly semJson?: boolean;
}

const TOKEN_OK: Resposta = {
  status: 200,
  corpo: { access_token: 'token-de-teste', expires_in: 3600 },
};

const REUNIAO_OK: Resposta = {
  status: 201,
  corpo: {
    id: 'MSpkYzE3Njc0Yy04MWQ5',
    joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc',
  },
};

interface Requisicao {
  readonly url: string;
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

function montar(respostas: readonly Resposta[], agora = () => 1_000_000): {
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
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK]);

    await expect(sala.criar(PEDIDO)).resolves.toEqual({
      sucesso: true,
      link: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc',
      idExterno: 'MSpkYzE3Njc0Yy04MWQ5',
      jaExistia: false,
    });
    expect(requisicoes).toHaveLength(2);
  });

  it('pede o token por client credentials, no tenant configurado', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK]);

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
   * object ID do Entra — nao o uid do Firebase (ADR-21, decisao B). Confirmado
   * na documentacao oficial, nao suposto.
   */
  it('cria em /users/{objectId}/onlineMeetings/createOrGet', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK]);

    await sala.criar(PEDIDO);

    expect(requisicoes[1].url).toBe(
      'https://graph.microsoft.com/v1.0/users/3f2504e0-4f89-41d3-9a0c-0305e82c3301/onlineMeetings/createOrGet',
    );
    expect(requisicoes[1].cabecalhos['Authorization']).toBe(
      'Bearer token-de-teste',
    );
  });

  /**
   * `externalId` E O `reuniaoId`, e e ele que torna a chamada idempotente: a
   * identidade da reuniao no Graph e o trio (tenantId, userId, externalId). E
   * por isso que o id da reuniao e ESTAVEL e nao e o id do slot — um id que
   * mudasse na remarcacao criaria uma segunda sala a cada vez.
   */
  it('manda o reuniaoId como externalId', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK]);

    await sala.criar(PEDIDO);

    expect(JSON.parse(requisicoes[1].corpo)).toEqual({
      externalId: 'pedido-1_r001',
      startDateTime: '2026-09-24T17:00:00.000Z',
      endDateTime: '2026-09-24T18:00:00.000Z',
      subject: 'Reuniao: Revisao de contrato',
    });
  });

  /** 201 criou, 200 reaproveitou. Os dois sao sucesso (contrato da porta). */
  it.each([
    [201, false],
    [200, true],
  ])('status %i vira jaExistia: %s', async (status, esperado) => {
    const { sala } = montar([TOKEN_OK, { ...REUNIAO_OK, status }]);

    const resultado = await sala.criar(PEDIDO);

    expect(resultado.sucesso && resultado.jaExistia).toBe(esperado);
  });

  it('reaproveita o token entre duas criacoes', async () => {
    const { sala, requisicoes } = montar([TOKEN_OK, REUNIAO_OK, REUNIAO_OK]);

    await sala.criar(PEDIDO);
    await sala.criar({ ...PEDIDO, reuniaoId: 'pedido-1_r002' });

    /* Tres chamadas, e nao quatro: um token para as duas reunioes. */
    expect(requisicoes).toHaveLength(3);
  });

  it('pede token novo quando o guardado expirou', async () => {
    let relogio = 1_000_000;
    const { sala, requisicoes } = montar(
      [TOKEN_OK, REUNIAO_OK, TOKEN_OK, REUNIAO_OK],
      () => relogio,
    );

    await sala.criar(PEDIDO);
    relogio += 3_600_000;
    await sala.criar({ ...PEDIDO, reuniaoId: 'pedido-1_r002' });

    expect(requisicoes).toHaveLength(4);
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
      {
        status: 403,
        corpo: {
          error: {
            code: 'Forbidden',
            message: 'No application access policy found for this app.',
          },
        },
      },
    ]);

    const resultado = await sala.criar(PEDIDO);

    expect(resultado).toEqual({
      sucesso: false,
      motivo: expect.stringContaining('No application access policy found'),
    });
  });

  /**
   * `usuarioTeams` ausente e falha NOMEADA, e nao uma tentativa de adivinhar. O
   * Graph aceitaria o UPN, e cair para o e-mail do advogado faria a integracao
   * depender de ele ser o mesmo do Microsoft 365 do escritorio (ADR-21, decisao
   * B). Nem chega a pedir token.
   */
  it.each([
    ['nulo', null],
    ['vazio', ''],
  ])('recusa usuarioTeams %s, nomeando o campo', async (_caso, valor) => {
    const { sala, requisicoes } = montar([]);

    const resultado = await sala.criar({ ...PEDIDO, usuarioTeams: valor });

    expect(resultado).toEqual({
      sucesso: false,
      motivo: expect.stringContaining('usuarioTeams'),
    });
    expect(requisicoes).toHaveLength(0);
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
   * TODA RESPOSTA E VALIDADA. O formato veio da documentacao e nao foi conferido
   * contra tenant real: um campo que mude de nome tem que falhar AQUI, com
   * mensagem, e nao virar `undefined` num link que o cliente recebe por e-mail.
   */
  it('recusa resposta sem joinWebUrl, dizendo qual campo falta', async () => {
    const { sala } = montar([TOKEN_OK, { status: 201, corpo: { id: 'x' } }]);

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
