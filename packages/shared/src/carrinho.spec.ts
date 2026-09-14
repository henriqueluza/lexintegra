import { ordenarItens, TETO_ITENS_CARRINHO } from './carrinho.js';

describe('carrinho', () => {
  /**
   * O teto e limite de transacao, nao comercial (ver o comentario no arquivo).
   * Subir o numero sem refazer a conta de escritas por item quebra a
   * confirmacao do pagamento so com o carrinho grande.
   */
  it('tem teto de dez itens', () => {
    expect(TETO_ITENS_CARRINHO).toBe(10);
  });

  it('ordena por id, para o hash nao depender da ordem de clique', () => {
    expect(
      ordenarItens([
        { produtoId: 'p-3' },
        { produtoId: 'p-1' },
        { produtoId: 'p-2' },
      ]),
    ).toEqual([
      { produtoId: 'p-1' },
      { produtoId: 'p-2' },
      { produtoId: 'p-3' },
    ]);
  });

  /** Dois itens iguais sao dois pedidos (arquitetura 5.4), e nao um. */
  it('mantem os repetidos', () => {
    expect(
      ordenarItens([
        { produtoId: 'p-2' },
        { produtoId: 'p-1' },
        { produtoId: 'p-2' },
      ]),
    ).toEqual([
      { produtoId: 'p-1' },
      { produtoId: 'p-2' },
      { produtoId: 'p-2' },
    ]);
  });

  it('nao altera a lista recebida', () => {
    const original = [{ produtoId: 'b' }, { produtoId: 'a' }];

    ordenarItens(original);

    expect(original).toEqual([{ produtoId: 'b' }, { produtoId: 'a' }]);
  });
});
