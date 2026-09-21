import { criarSalaDeReuniao } from './criar-sala-de-reuniao.js';
import {
  FALHAS_PREVISTAS,
  SalaDeReuniaoDesligada,
  SalaDeReuniaoFalsa,
} from './sala-de-reuniao-falsa.js';
import { ReunioesDesligadas, type NovaSala } from './sala-de-reuniao.js';

const PEDIDO: NovaSala = {
  reuniaoId: 'pedido-1_r001',
  advogadoId: 'uid-ana',
  usuarioTeams: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
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
      link: expect.stringContaining('pedido-1_r001'),
      idExterno: 'sala_falsa_pedido-1_r001',
      jaExistia: false,
    });
  });

  /**
   * IDEMPOTENTE POR `reuniaoId`, como o `createOrGet` e por `externalId`. E o
   * que a reentrega do outbox espera: se o processo morrer depois de a sala ser
   * criada e antes de o link ser gravado, a segunda passagem nao pode criar uma
   * segunda sala — nem virar erro.
   */
  it('o mesmo reuniaoId devolve a MESMA sala, com jaExistia', async () => {
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
    const outra = await sala.criar({ ...PEDIDO, reuniaoId: 'pedido-1_r002' });

    expect(uma.sucesso && outra.sucesso && uma.link !== outra.link).toBe(true);
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
      criarSalaDeReuniao({ modo: 'desligado', graph: null }),
    ).toBeInstanceOf(SalaDeReuniaoDesligada);
  });

  it('falso sem credencial devolve a em memoria', () => {
    expect(criarSalaDeReuniao({ modo: 'falso', graph: null })).toBeInstanceOf(
      SalaDeReuniaoFalsa,
    );
  });
});
