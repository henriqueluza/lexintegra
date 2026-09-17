import {
  podeCancelar,
  podeEstornar,
  semTrabalhoIniciado,
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

  describe('podeEstornar', () => {
    it.each(['ativo', 'cancelado'] as const)(
      'pedido %s sem trabalho e elegivel',
      (situacao) => {
        expect(podeEstornar(situacao, ['solicitado'])).toBe(true);
      },
    );

    /** CRITERIO DE ACEITE: em `em_elaboracao`, o estorno e recusado. */
    it.each(['ativo', 'cancelado'] as const)(
      'pedido %s em elaboracao nao e elegivel',
      (situacao) => {
        expect(podeEstornar(situacao, ['em_elaboracao'])).toBe(false);
      },
    );

    it('pedido ja estornado nao e estornado de novo', () => {
      expect(podeEstornar('estornado', ['solicitado'])).toBe(false);
    });
  });

  describe('podeCancelar', () => {
    it('pedido ativo sem trabalho pode ser cancelado', () => {
      expect(podeCancelar('ativo', ['solicitado'])).toBe(true);
    });

    it.each([
      ['ativo em elaboracao', 'ativo', ['em_elaboracao']],
      ['ja cancelado', 'cancelado', ['solicitado']],
      ['estornado', 'estornado', ['solicitado']],
    ] as const)('%s nao pode', (_caso, situacao, estados) => {
      expect(podeCancelar(situacao, estados)).toBe(false);
    });
  });
});
