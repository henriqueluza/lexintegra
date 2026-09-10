import { normalizarParaBusca } from './texto.js';

describe('normalizarParaBusca', () => {
  it.each([
    ['Jose Antonio', 'jose antonio'],
    ['JOSE', 'jose'],
    ['  Ana  Maria  ', 'ana maria'],
  ])('%s vira %s', (entrada, esperado) => {
    expect(normalizarParaBusca(entrada)).toBe(esperado);
  });

  /**
   * O caso que a funcao existe para resolver: quem digita "jose" num campo de
   * busca precisa encontrar "Jose" com acento. Sem a decomposicao, nao encontra.
   */
  it.each([
    ['José', 'jose'],
    ['Conceição', 'conceicao'],
    ['Ângela', 'angela'],
    ['Müller', 'muller'],
  ])('%s perde o acento e vira %s', (entrada, esperado) => {
    expect(normalizarParaBusca(entrada)).toBe(esperado);
  });

  /**
   * A pontuacao FICA. "Sant'Ana" e "Sant Ana" sao nomes diferentes, e apagar a
   * diferenca produziria falso positivo que ninguem pediu.
   */
  it('preserva pontuacao e hifen', () => {
    expect(normalizarParaBusca("Sant'Ana-Vieira")).toBe("sant'ana-vieira");
  });

  it('normaliza e-mail do mesmo jeito', () => {
    expect(normalizarParaBusca('Ana.Silva@Empresa.COM.BR')).toBe(
      'ana.silva@empresa.com.br',
    );
  });

  it('aguenta texto vazio', () => {
    expect(normalizarParaBusca('   ')).toBe('');
  });
});
