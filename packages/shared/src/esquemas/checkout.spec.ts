import { esquemaNovoCheckout } from './checkout.js';

const VALIDO = {
  itens: [{ produtoId: 'produto-1' }, { produtoId: 'produto-2' }],
  metodo: 'pix',
  comprador: { nome: 'Ana Ribeiro', email: ' Ana@Empresa.com.br ' },
  termosVersao: 'v1',
  chaveDoCarrinho: '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
};

describe('esquemaNovoCheckout', () => {
  it('aceita o carrinho valido e normaliza o e-mail', () => {
    const lido = esquemaNovoCheckout.parse(VALIDO);

    expect(lido.comprador.email).toBe('ana@empresa.com.br');
    expect(lido.itens).toHaveLength(2);
  });

  /**
   * O navegador manda ids, nunca precos. Um preco no corpo e descartado — e o
   * servidor nem teria por onde usa-lo.
   */
  it('descarta preco enviado pelo navegador', () => {
    const lido = esquemaNovoCheckout.parse({
      ...VALIDO,
      itens: [{ produtoId: 'produto-1', precoCentavos: 1 }],
    });

    expect(lido.itens[0]).toEqual({ produtoId: 'produto-1' });
  });

  /** Nome e e-mail. CPF e telefone nao sao coletados (arquitetura, secao 13). */
  it('descarta CPF e telefone do comprador', () => {
    const lido = esquemaNovoCheckout.parse({
      ...VALIDO,
      comprador: {
        ...VALIDO.comprador,
        cpf: '00000000000',
        telefone: '61990000000',
      },
    });

    expect(Object.keys(lido.comprador).sort()).toEqual(['email', 'nome']);
  });

  it.each([
    ['carrinho vazio', { itens: [] }],
    [
      'onze itens',
      { itens: Array.from({ length: 11 }, () => ({ produtoId: 'p' })) },
    ],
    ['item sem produto', { itens: [{ produtoId: '  ' }] }],
    ['metodo desconhecido', { metodo: 'boleto' }],
    ['e-mail invalido', { comprador: { nome: 'Ana Ribeiro', email: 'ana' } }],
    ['nome curto', { comprador: { nome: 'A', email: 'a@b.com' } }],
    ['sem aceite dos termos', { termosVersao: ' ' }],
    ['chave que nao e uuid', { chaveDoCarrinho: 'chave' }],
  ])('recusa %s', (_caso, alteracao) => {
    expect(
      esquemaNovoCheckout.safeParse({ ...VALIDO, ...alteracao }).success,
    ).toBe(false);
  });

  it('aceita cartao', () => {
    expect(
      esquemaNovoCheckout.parse({ ...VALIDO, metodo: 'cartao' }).metodo,
    ).toBe('cartao');
  });
});
