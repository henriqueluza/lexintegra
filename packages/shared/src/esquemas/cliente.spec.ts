import { esquemaBuscaClientes } from './cliente.js';

describe('esquemaBuscaClientes', () => {
  it('aceita os dois filtros e apara espaco', () => {
    expect(
      esquemaBuscaClientes.parse({ busca: '  ana  ', produto: ' Parecer ' }),
    ).toEqual({ busca: 'ana', produto: 'Parecer' });
  });

  it('aceita ausencia dos dois', () => {
    expect(esquemaBuscaClientes.parse({})).toEqual({});
  });

  /**
   * Query string e texto livre do navegador. Sem o `catch`, `?busca=` com 10 kB
   * derrubaria a tela do administrador com 400 — e com o `catch`, o termo absurdo
   * simplesmente deixa de filtrar, que e o comportamento util.
   */
  it('descarta termo absurdamente longo em vez de estourar', () => {
    const resultado = esquemaBuscaClientes.parse({ busca: 'a'.repeat(500) });
    expect(resultado.busca).toBeUndefined();
  });

  it('nao lanca com tipo errado', () => {
    expect(() => esquemaBuscaClientes.parse({ busca: 42 })).not.toThrow();
  });
});
