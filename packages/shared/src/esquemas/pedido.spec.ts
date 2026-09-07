import { esquemaAtribuicao, esquemaSituacaoDistribuicao } from './pedido.js';

describe('esquemaAtribuicao', () => {
  it('aceita um advogado e apara espaco', () => {
    const resultado = esquemaAtribuicao.safeParse({
      advogadoId: '  uid-advogado  ',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data?.advogadoId).toBe('uid-advogado');
  });

  it.each([[''], ['   ']])('recusa identificador vazio: %p', (advogadoId) => {
    expect(esquemaAtribuicao.safeParse({ advogadoId }).success).toBe(false);
  });

  /**
   * O corpo tem UM campo. `atribuidoPor` e `atribuidoEm` saem do token e do
   * relogio do servidor — se viessem daqui, um administrador poderia registrar a
   * distribuicao em nome de outro e a trilha deixaria de valer numa contestacao.
   */
  it('ignora quem tenta mandar o autor no corpo', () => {
    const resultado = esquemaAtribuicao.safeParse({
      advogadoId: 'uid-advogado',
      atribuidoPor: 'uid-de-outro-admin',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data).toEqual({ advogadoId: 'uid-advogado' });
  });
});

describe('esquemaSituacaoDistribuicao', () => {
  /** A caixa de entrada existe para mostrar o que precisa de acao; abrir num
   * filtro que ja responde "nada a fazer" e o que se quer quando nao ha. */
  it('o padrao e o que ainda precisa de acao', () => {
    expect(esquemaSituacaoDistribuicao.parse(undefined)).toBe(
      'nao_distribuidos',
    );
  });

  it.each([
    ['nao_distribuidos', 'nao_distribuidos'],
    ['distribuidos', 'distribuidos'],
    ['todos', 'todos'],
    ['arquivados', 'nao_distribuidos'],
    ['', 'nao_distribuidos'],
  ])('%s vira %s', (recebido, esperado) => {
    expect(esquemaSituacaoDistribuicao.parse(recebido)).toBe(esperado);
  });
});
