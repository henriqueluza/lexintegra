import {
  formatarTelefone,
  normalizarTelefone,
  telefoneEhValido,
} from './telefone.js';

describe('normalizarTelefone', () => {
  it.each([
    ['(61) 99000-0000', '61990000000'],
    ['61 99000 0000', '61990000000'],
    ['+55 (61) 99000-0000', '61990000000'],
    ['5561990000000', '61990000000'],
    ['556133334444', '6133334444'],
    ['61990000000', '61990000000'],
  ])('reduz %s a %s', (bruto, esperado) => {
    expect(normalizarTelefone(bruto)).toBe(esperado);
  });

  /**
   * Porto Alegre tem DDD 55, e um fixo de la comeca com os mesmos dois digitos do
   * codigo do pais. Remover "55" so por ele estar na frente apagaria o DDD e
   * transformaria um numero valido em invalido — por isso a remocao depende do
   * COMPRIMENTO, que e o que distingue os dois casos.
   */
  it('nao confunde o DDD 55 com o codigo do pais', () => {
    expect(normalizarTelefone('(55) 3333-4444')).toBe('5533334444');
    expect(normalizarTelefone('(55) 99000-0000')).toBe('55990000000');
  });

  it('devolve so os digitos do que veio sujo', () => {
    expect(normalizarTelefone('tel.: 61/9.9000-0000 (whats)')).toBe(
      '61990000000',
    );
  });
});

describe('telefoneEhValido', () => {
  it.each([
    ['61990000000', 'movel de Brasilia'],
    ['11987654321', 'movel de Sao Paulo'],
    ['6133334444', 'fixo de Brasilia'],
    ['1125554444', 'fixo de Sao Paulo'],
  ])('aceita %s (%s)', (digitos) => {
    expect(telefoneEhValido(digitos)).toBe(true);
  });

  it.each([
    ['619900000', 'curto demais'],
    ['619900000000', 'longo demais'],
    ['', 'vazio'],
    ['6199000000a', 'com letra'],
    ['61 990000000', 'com espaco, ou seja, nao normalizado'],
  ])('recusa %s (%s)', (digitos) => {
    expect(telefoneEhValido(digitos)).toBe(false);
  });

  /**
   * O conjunto de DDDs e fechado. Uma faixa "11 a 99" deixaria passar 20, 30, 40
   * e mais dezesseis prefixos que nao existem — e o sintoma nao seria erro
   * nenhum, seria um lead sem telefone alcancavel.
   */
  it.each(['2099000000', '3099000000', '4099000000', '9099000000'])(
    'recusa o DDD inexistente em %s',
    (digitos) => {
      expect(telefoneEhValido(digitos)).toBe(false);
    },
  );

  it('exige que o movel comece em 9', () => {
    expect(telefoneEhValido('61890000000')).toBe(false);
    expect(telefoneEhValido('61990000000')).toBe(true);
  });

  it('exige que o fixo comece entre 2 e 5', () => {
    expect(telefoneEhValido('6113334444')).toBe(false);
    expect(telefoneEhValido('6163334444')).toBe(false);
    expect(telefoneEhValido('6123334444')).toBe(true);
    expect(telefoneEhValido('6153334444')).toBe(true);
  });
});

describe('formatarTelefone', () => {
  it('formata movel e fixo com mascaras diferentes', () => {
    expect(formatarTelefone('61990000000')).toBe('(61) 99000-0000');
    expect(formatarTelefone('6133334444')).toBe('(61) 3333-4444');
  });

  /**
   * Isto e chamado de dentro de uma tela. Lancar por causa de um registro torto
   * derrubaria a listagem inteira; devolver o valor cru mostra o problema sem
   * apagar o resto.
   */
  it('devolve a entrada intacta quando ela nao e telefone', () => {
    expect(formatarTelefone('123')).toBe('123');
    expect(formatarTelefone('')).toBe('');
  });
});
