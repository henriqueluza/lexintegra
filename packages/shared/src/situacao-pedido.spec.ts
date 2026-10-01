import {
  MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO,
  impedimentoDoCancelamento,
  impedimentoDoEstorno,
  podeCancelar,
  podeEstornar,
  reunioesACancelarJunto,
  semTrabalhoIniciado,
  type PedidoParaElegibilidade,
} from './situacao-pedido.js';

/**
 * ALVO DE ANALISE DE MUTACAO (plano de execucao, Etapa 8). Cada caso aqui existe
 * para um mutante morrer: trocar `every` por `some`, `&&` por `||`, ou tirar
 * `cancelado` da lista do estorno faz algum destes falhar.
 */
describe('situacao do pedido (ADR-12)', () => {
  describe('semTrabalhoIniciado', () => {
    it('todos em solicitado e sem trabalho', () => {
      expect(semTrabalhoIniciado(['solicitado', 'solicitado'])).toBe(true);
    });

    /** Um entregavel em elaboracao ja e servico personalizado em execucao. */
    it.each([
      [['solicitado', 'em_elaboracao']],
      [['em_elaboracao']],
      [['em_revisao']],
      [['entregue']],
      [['solicitado', 'entregue']],
    ] as const)('%j ja tem trabalho', (estados) => {
      expect(semTrabalhoIniciado(estados)).toBe(false);
    });

    it('lista vazia nao conta como sem trabalho', () => {
      expect(semTrabalhoIniciado([])).toBe(false);
    });
  });

  const AGORA = Date.parse('2026-10-01T12:00:00Z');
  const ANTES = '2026-09-30T12:00:00.000Z';
  const DEPOIS = '2026-10-02T12:00:00.000Z';

  function pedido(
    mudancas: Partial<PedidoParaElegibilidade> = {},
  ): PedidoParaElegibilidade {
    return {
      situacao: 'ativo',
      estados: ['solicitado'],
      reunioes: [],
      contestacaoAberta: false,
      agora: AGORA,
      ...mudancas,
    };
  }

  describe('impedimentoDoEstorno', () => {
    it.each(['ativo', 'cancelado'] as const)(
      'pedido %s sem trabalho e sem reuniao passada e elegivel',
      (situacao) => {
        expect(impedimentoDoEstorno(pedido({ situacao }))).toBeNull();
        expect(podeEstornar(pedido({ situacao }))).toBe(true);
      },
    );

    /** CRITERIO DE ACEITE: em `em_elaboracao`, o estorno e recusado. */
    it.each(['ativo', 'cancelado'] as const)(
      'pedido %s em elaboracao nao e elegivel',
      (situacao) => {
        expect(
          impedimentoDoEstorno(
            pedido({ situacao, estados: ['em_elaboracao'] }),
          ),
        ).toBe('trabalho-iniciado');
      },
    );

    it('pedido ja estornado nao e estornado de novo', () => {
      expect(impedimentoDoEstorno(pedido({ situacao: 'estornado' }))).toBe(
        'situacao',
      );
      expect(podeEstornar(pedido({ situacao: 'estornado' }))).toBe(false);
    });

    /** decisoes.md, 3.3: reuniao com inicio ja passado impede o estorno. */
    it.each(['confirmada', 'reservada_sem_link'] as const)(
      'reuniao %s ja comecada impede',
      (estado) => {
        expect(
          impedimentoDoEstorno(
            pedido({ reunioes: [{ estado, inicio: ANTES }] }),
          ),
        ).toBe('reuniao-realizada');
      },
    );

    it('o inicio exatamente agora ja conta como comecada', () => {
      expect(
        impedimentoDoEstorno(
          pedido({
            reunioes: [
              { estado: 'confirmada', inicio: new Date(AGORA).toISOString() },
            ],
          }),
        ),
      ).toBe('reuniao-realizada');
    });

    /** Futura nao bloqueia (e cancelada junto); cancelada no passado tambem nao. */
    it.each([
      ['futura', { estado: 'confirmada', inicio: DEPOIS }],
      [
        'cancelada com devolucao',
        { estado: 'cancelada_com_devolucao', inicio: ANTES },
      ],
      [
        'cancelada sem devolucao',
        { estado: 'cancelada_sem_devolucao', inicio: ANTES },
      ],
    ] as const)('reuniao %s nao impede', (_caso, reuniao) => {
      expect(impedimentoDoEstorno(pedido({ reunioes: [reuniao] }))).toBeNull();
    });

    it('contestacao aberta impede antes de tudo', () => {
      expect(
        impedimentoDoEstorno(
          pedido({ contestacaoAberta: true, estados: ['em_elaboracao'] }),
        ),
      ).toBe('contestacao-aberta');
    });
  });

  describe('impedimentoDoCancelamento', () => {
    it('pedido ativo sem trabalho pode ser cancelado', () => {
      expect(impedimentoDoCancelamento(pedido())).toBeNull();
      expect(podeCancelar(pedido())).toBe(true);
    });

    it.each([
      [
        'ativo em elaboracao',
        pedido({ estados: ['em_elaboracao'] }),
        'trabalho-iniciado',
      ],
      ['ja cancelado', pedido({ situacao: 'cancelado' }), 'situacao'],
      ['estornado', pedido({ situacao: 'estornado' }), 'situacao'],
      [
        'com reuniao realizada',
        pedido({ reunioes: [{ estado: 'confirmada', inicio: ANTES }] }),
        'reuniao-realizada',
      ],
      ['pausado', pedido({ contestacaoAberta: true }), 'contestacao-aberta'],
    ] as const)('%s nao pode', (_caso, entrada, motivo) => {
      expect(impedimentoDoCancelamento(entrada)).toBe(motivo);
      expect(podeCancelar(entrada)).toBe(false);
    });
  });

  it('cada impedimento tem um texto para o usuario', () => {
    for (const motivo of [
      'situacao',
      'trabalho-iniciado',
      'reuniao-realizada',
      'contestacao-aberta',
    ] as const) {
      expect(MOTIVO_DO_IMPEDIMENTO_DO_PEDIDO[motivo].length).toBeGreaterThan(
        10,
      );
    }
  });

  describe('reunioesACancelarJunto', () => {
    it('so as ativas que ainda nao comecaram', () => {
      const reunioes = [
        { id: 'r001', estado: 'confirmada', inicio: DEPOIS },
        { id: 'r002', estado: 'reservada_sem_link', inicio: DEPOIS },
        { id: 'r003', estado: 'cancelada_com_devolucao', inicio: DEPOIS },
        { id: 'r004', estado: 'confirmada', inicio: ANTES },
      ] as const;
      expect(reunioesACancelarJunto(reunioes, AGORA).map((r) => r.id)).toEqual([
        'r001',
        'r002',
      ]);
    });
  });
});
