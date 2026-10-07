import { feriadoEm, feriadosDoAno, pascoa } from './feriados.js';

describe('pascoa', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2038, '2038-04-25'],
  ])('%i: %s', (ano, data) => {
    expect(pascoa(ano)).toBe(data);
  });
});

describe('feriadosDoAno', () => {
  it('2026: os nacionais e os pontos facultativos, em ordem', () => {
    expect(feriadosDoAno(2026).map((f) => [f.data, f.tipo])).toEqual([
      ['2026-01-01', 'nacional'],
      ['2026-02-16', 'facultativo'],
      ['2026-02-17', 'facultativo'],
      ['2026-04-03', 'nacional'],
      ['2026-04-21', 'nacional'],
      ['2026-05-01', 'nacional'],
      ['2026-06-04', 'facultativo'],
      ['2026-09-07', 'nacional'],
      ['2026-10-12', 'nacional'],
      ['2026-11-02', 'nacional'],
      ['2026-11-15', 'nacional'],
      ['2026-11-20', 'nacional'],
      ['2026-12-25', 'nacional'],
    ]);
  });

  /* Os moveis de 2027 saem de uma Pascoa em marco. */
  it('2027: Carnaval, Paixao e Corpus Christi seguem a Pascoa', () => {
    const datas = new Map(feriadosDoAno(2027).map((f) => [f.data, f.nome]));
    expect(datas.get('2027-02-08')).toBe('Carnaval');
    expect(datas.get('2027-02-09')).toBe('Carnaval');
    expect(datas.get('2027-03-26')).toBe('Paixão de Cristo');
    expect(datas.get('2027-05-27')).toBe('Corpus Christi');
  });

  /* Lei 14.759/2023: feriado nacional a partir de 2024. */
  it('Consciencia Negra so a partir de 2024', () => {
    expect(feriadosDoAno(2023).some((f) => f.data === '2023-11-20')).toBe(
      false,
    );
    expect(feriadosDoAno(2024).some((f) => f.data === '2024-11-20')).toBe(true);
  });
});

describe('feriadoEm', () => {
  it('acha o feriado do dia, ou nada', () => {
    expect(feriadoEm('2026-10-12')?.nome).toBe('Nossa Senhora Aparecida');
    expect(feriadoEm('2026-10-13')).toBeNull();
  });
});
