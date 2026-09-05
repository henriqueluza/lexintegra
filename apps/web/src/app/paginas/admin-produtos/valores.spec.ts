import {
  paraCampoDePreco,
  paraCentavos,
  paraInteiro,
  paraReais,
} from './valores';

describe('paraCentavos', () => {
  it.each([
    ['3200', 320_000],
    ['3200,00', 320_000],
    ['3200.00', 320_000],
    ['3.200,00', 320_000],
    ['1.234,56', 123_456],
    ['1234.56', 123_456],
    ['0,01', 1],
    ['R$ 3.200,00', 320_000],
    ['  3200,50  ', 320_050],
    ['3200,5', 320_050],
  ])('converte %s em %i centavos', (texto, esperado) => {
    expect(paraCentavos(texto)).toBe(esperado);
  });

  /**
   * O caso que a aritmetica de texto existe para resolver.
   * `Math.round(1.005 * 100)` devolve 100, porque 1.005 nao e representavel em
   * binario. Um centavo a menos aqui vira um centavo a menos em todo pedido
   * daquele produto, congelado no snapshot.
   */
  it('nao perde centavo em valor que o ponto flutuante erra', () => {
    expect(paraCentavos('1,005')).toBeNull();
    expect(paraCentavos('1,01')).toBe(101);
    expect(paraCentavos('8,07')).toBe(807);
    expect(paraCentavos('1234567,89')).toBe(123_456_789);
  });

  it.each([
    ['vazio', ''],
    ['so espaco', '   '],
    ['texto', 'abc'],
    ['negativo', '-10'],
    ['tres decimais', '10,005'],
    ['virgula solta', ','],
    ['dois separadores decimais', '10,00,00'],
    ['notacao cientifica', '1e3'],
  ])('recusa %s', (_caso, texto) => {
    expect(paraCentavos(texto)).toBeNull();
  });
});

describe('paraReais', () => {
  it.each([
    [320_000, '3.200,00'],
    [1, '0,01'],
    [0, '0,00'],
  ])('formata %i centavos', (centavos, esperado) => {
    // O separador de milhar do Intl em pt-BR pode ser espaco estreito conforme a
    // versao do ICU; comparar so os digitos e a pontuacao evita teste fragil.
    expect(paraReais(centavos).replace(/\s/g, ' ')).toContain(esperado);
  });

  it('marca o valor como real', () => {
    expect(paraReais(320_000)).toContain('R$');
  });
});

describe('paraCampoDePreco', () => {
  it.each([
    [320_000, '3200,00'],
    [320_050, '3200,50'],
    [1, '0,01'],
  ])('devolve %i centavos como campo editavel', (centavos, esperado) => {
    expect(paraCampoDePreco(centavos)).toBe(esperado);
  });

  /** Ida e volta sem perda: e o que garante que abrir um produto para editar e
   * salvar sem mexer no preco nao muda o preco. */
  it.each([320_000, 1, 123_456, 999_999_99])(
    'volta ao mesmo valor depois de ida e volta (%i)',
    (centavos) => {
      expect(paraCentavos(paraCampoDePreco(centavos))).toBe(centavos);
    },
  );
});

describe('paraInteiro', () => {
  it.each([
    ['0', 0],
    ['3', 3],
    ['365', 365],
    [' 12 ', 12],
  ])('converte %s', (texto, esperado) => {
    expect(paraInteiro(texto)).toBe(esperado);
  });

  it.each([
    ['fracionado', '2.5'],
    ['fracionado com virgula', '2,5'],
    ['negativo', '-1'],
    ['vazio', ''],
    ['texto', 'tres'],
  ])('recusa %s em vez de arredondar', (_caso, texto) => {
    expect(paraInteiro(texto)).toBeNull();
  });
});
