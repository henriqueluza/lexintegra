import { criarSalaDeReuniao } from './criar-sala-de-reuniao.js';
import {
  FALHAS_PREVISTAS,
  SalaDeReuniaoDesligada,
  SalaDeReuniaoFalsa,
  SalaDeReuniaoPendente,
} from './sala-de-reuniao-falsa.js';
import { ReunioesDesligadas, type NovaSala } from './sala-de-reuniao.js';

const PEDIDO: NovaSala = {
  externalId: 'pedido-1-r001',
  advogadoId: 'uid-ana',
  organizadorId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  inicio: '2026-09-24T17:00:00.000Z',
  fim: '2026-09-24T18:00:00.000Z',
  assunto: 'Reuniao: Revisao de contrato',
};

describe('SalaDeReuniaoFalsa', () => {
  it('cria a sala e devolve link e id externo', async () => {
    const sala = new SalaDeReuniaoFalsa();

    const resultado = await sala.criar(PEDIDO);

    expect(resultado).toEqual({
      sucesso: true,
      link: expect.stringContaining('pedido-1-r001'),
      idExterno: 'sala_falsa_pedido-1-r001',
      jaExistia: false,
    });
  });

  /**
   * IDEMPOTENTE POR organizador e `externalId`, como o `createOrGet`. E o
   * que a reentrega do outbox espera: se o processo morrer depois de a sala ser
   * criada e antes de o link ser gravado, a segunda passagem nao pode criar uma
   * segunda sala — nem virar erro.
   */
  it('o mesmo externalId devolve a MESMA sala, com jaExistia', async () => {
    const sala = new SalaDeReuniaoFalsa();

    const primeira = await sala.criar(PEDIDO);
    const segunda = await sala.criar(PEDIDO);

    expect(primeira.sucesso && segunda.sucesso).toBe(true);
    if (!primeira.sucesso || !segunda.sucesso) return;

    expect(segunda.link).toBe(primeira.link);
    expect(segunda.idExterno).toBe(primeira.idExterno);
    expect(primeira.jaExistia).toBe(false);
    expect(segunda.jaExistia).toBe(true);
    expect(sala.salas.size).toBe(1);
  });

  it('reunioes diferentes ganham links diferentes', async () => {
    const sala = new SalaDeReuniaoFalsa();

    const uma = await sala.criar(PEDIDO);
    const outra = await sala.criar({ ...PEDIDO, externalId: 'pedido-1-r002' });

    expect(uma.sucesso && outra.sucesso && uma.link !== outra.link).toBe(true);
  });

  /** Como no Graph: a identidade e o trio, e o organizador faz parte dele. */
  it('o mesmo externalId noutro organizador e outra sala', async () => {
    const sala = new SalaDeReuniaoFalsa();

    await sala.criar(PEDIDO);
    const outra = await sala.criar({
      ...PEDIDO,
      organizadorId: '11111111-2222-4333-8444-555555555555',
    });

    expect(outra.sucesso && !outra.jaExistia).toBe(true);
    expect(sala.salas.size).toBe(2);
  });

  /**
   * REPORTA, NUNCA LANCA — e o contrato da porta. Quem decide tentar de novo e
   * o outbox, e uma excecao aqui viraria erro de montagem em vez de falha com
   * orcamento.
   */
  it.each(['policy', 'licenca', 'indisponivel'] as const)(
    'reporta a falha prevista %s, sem lancar',
    async (falha) => {
      const sala = new SalaDeReuniaoFalsa();
      sala.falharProximas(1, falha);

      await expect(sala.criar(PEDIDO)).resolves.toEqual({
        sucesso: false,
        motivo: FALHAS_PREVISTAS[falha],
      });
    },
  );

  /**
   * O TEXTO DA POLICY E O REAL, e nao "falha simulada". E o que permite provar
   * que ele vira falha COM ORCAMENTO (reentrega) e nao abandono imediato: a
   * propagacao da policy leva ate 48 horas (ADR-05, risco 1), e desistir na
   * primeira tentativa transformaria uma espera em reuniao sem link para sempre.
   */
  it('a falha de policy carrega a mensagem que a Microsoft devolve', () => {
    expect(FALHAS_PREVISTAS.policy).toContain(
      'No application access policy found',
    );
  });

  it('a falha vale so pelas proximas n chamadas', async () => {
    const sala = new SalaDeReuniaoFalsa();
    sala.falharProximas(1, 'policy');

    await expect(sala.criar(PEDIDO)).resolves.toMatchObject({
      sucesso: false,
    });
    await expect(sala.criar(PEDIDO)).resolves.toMatchObject({
      sucesso: true,
    });
  });

  it('guarda o que foi pedido, para o teste conferir', async () => {
    const sala = new SalaDeReuniaoFalsa();

    await sala.criar(PEDIDO);

    expect(sala.pedidos).toEqual([PEDIDO]);
  });
});

describe('SalaDeReuniaoDesligada', () => {
  /**
   * LANCA em vez de reportar, e a diferenca importa. Um `{ sucesso: false }`
   * seria tratado pelo outbox como falha a reentregar, e o registro gastaria as
   * dez tentativas para descobrir uma configuracao que nao muda sozinha.
   */
  it('recusa criar, com erro nomeado', async () => {
    await expect(new SalaDeReuniaoDesligada().criar()).rejects.toBeInstanceOf(
      ReunioesDesligadas,
    );
  });

  it('a mensagem diz qual variavel esta desligada', async () => {
    await expect(new SalaDeReuniaoDesligada().criar()).rejects.toThrow(
      /REUNIOES_MODO=desligado/,
    );
  });
});

describe('criarSalaDeReuniao', () => {
  it('desligado devolve a implementacao que recusa', () => {
    expect(
      criarSalaDeReuniao({
        modo: 'desligado',
        graph: null,
        organizadorPadrao: null,
      }),
    ).toBeInstanceOf(SalaDeReuniaoDesligada);
  });

  it('falso sem credencial devolve a em memoria', () => {
    expect(
      criarSalaDeReuniao({
        modo: 'falso',
        graph: null,
        organizadorPadrao: '00000000-0000-4000-8000-000000000000',
      }),
    ).toBeInstanceOf(SalaDeReuniaoFalsa);
  });

  /* `sem-sala` tambem tem `graph: null`: sem o ramo proprio, cairia no falso. */
  it('sem-sala vira a sala pendente, e nao a falsa', () => {
    expect(
      criarSalaDeReuniao({
        modo: 'sem-sala',
        graph: null,
        organizadorPadrao: null,
      }),
    ).toBeInstanceOf(SalaDeReuniaoPendente);
  });
});

/**
 * `REUNIOES_MODO=sem-sala` (07/10/2026). A diferenca para o falso e a regra
 * inviolavel 13: o falso devolve um link que nao existe; a pendente devolve
 * falha e nao inventa nada.
 */
describe('SalaDeReuniaoPendente', () => {
  it('nunca devolve link: reporta que o Teams nao esta ligado', async () => {
    await expect(new SalaDeReuniaoPendente().criar()).resolves.toEqual({
      sucesso: false,
      motivo: expect.stringContaining('sem-sala') as unknown as string,
    });
  });
});
