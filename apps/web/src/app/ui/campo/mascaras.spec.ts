import { cursorAposMascara, mascararCnpj, mascararTelefone } from './mascaras';

describe('mascararTelefone', () => {
  it.each([
    ['', ''],
    ['1', '(1'],
    ['11', '(11'],
    ['119', '(11) 9'],
    ['1133334', '(11) 3333-4'],
    ['1133334444', '(11) 3333-4444'],
    ['11988887777', '(11) 98888-7777'],
  ])('formata %p enquanto digita', (entrada, saida) => {
    expect(mascararTelefone(entrada)).toBe(saida);
  });

  it('aceita o numero colado com codigo do pais e pontuacao', () => {
    expect(mascararTelefone('+55 (11) 98888-7777')).toBe('(11) 98888-7777');
  });

  it('descarta o que passa de onze digitos', () => {
    expect(mascararTelefone('119888877779999')).toBe('(11) 98888-7777');
  });

  it('apagar ate o DDD nao deixa pontuacao presa', () => {
    expect(mascararTelefone('(11) ')).toBe('(11');
    expect(mascararTelefone('(')).toBe('');
  });
});

describe('mascararCnpj', () => {
  it.each([
    ['', ''],
    ['12', '12'],
    ['123', '12.3'],
    ['12345678', '12.345.678'],
    ['123456780001', '12.345.678/0001'],
    ['12345678000195', '12.345.678/0001-95'],
  ])('formata %p enquanto digita', (entrada, saida) => {
    expect(mascararCnpj(entrada)).toBe(saida);
  });

  it('aceita o CNPJ alfanumerico, em maiusculas', () => {
    expect(mascararCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
  });

  it('descarta o que passa de catorze caracteres', () => {
    expect(mascararCnpj('12.345.678/0001-95999')).toBe('12.345.678/0001-95');
  });
});

describe('cursorAposMascara', () => {
  it('fica no fim quando a pessoa digita no fim', () => {
    expect(cursorAposMascara('119', 3, '(11) 9')).toBe(6);
  });

  it('fica no lugar quando a pessoa corrige o meio', () => {
    // "(11) 9888-7777" com um digito inserido depois do DDD.
    expect(cursorAposMascara('(11) 98888-7777', 6, '(11) 98888-7777')).toBe(6);
  });

  it('volta ao inicio quando nao ha nada antes do cursor', () => {
    expect(cursorAposMascara('(11', 0, '(11')).toBe(0);
  });
});
