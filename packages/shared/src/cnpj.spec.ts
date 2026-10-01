import { cnpjEhValido, formatarCnpj, normalizarCnpj } from './cnpj.js';

describe('normalizarCnpj', () => {
  it.each([
    ['11.222.333/0001-81', '11222333000181'],
    [' 11 222 333 0001 81 ', '11222333000181'],
    ['12.abc.345/01de-35', '12ABC34501DE35'],
  ])('reduz %s a %s', (bruto, esperado) => {
    expect(normalizarCnpj(bruto)).toBe(esperado);
  });
});

describe('cnpjEhValido', () => {
  it.each([
    ['11222333000181', 'numerico'],
    ['11444777000161', 'numerico'],
    /*
     * O exemplo publicado pela Receita para o CNPJ alfanumerico. Um validador
     * "so digitos" recusaria a empresa aberta a partir de julho de 2026.
     */
    ['12ABC34501DE35', 'alfanumerico'],
  ])('aceita %s (%s)', (cnpj) => {
    expect(cnpjEhValido(cnpj)).toBe(true);
  });

  it.each([
    ['11222333000182', 'segundo digito errado'],
    ['11222333000191', 'primeiro digito errado'],
    ['12ABC34501DE34', 'alfanumerico com digito errado'],
    ['12ABC34501DEAB', 'digito verificador com letra'],
    ['00000000000000', 'repetido'],
    ['AAAAAAAAAAAA00', 'letra repetida'],
    ['1122233300018', 'curto'],
    ['112223330001811', 'longo'],
    ['11.222.333/0001-81', 'nao normalizado'],
    ['', 'vazio'],
  ])('recusa %s (%s)', (cnpj) => {
    expect(cnpjEhValido(cnpj)).toBe(false);
  });
});

describe('formatarCnpj', () => {
  it('formata o valido', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });

  it('devolve o invalido intacto', () => {
    expect(formatarCnpj('123')).toBe('123');
    expect(formatarCnpj('11222333000182')).toBe('11222333000182');
  });
});
