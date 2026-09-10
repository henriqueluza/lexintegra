import {
  dataLocal,
  dentroDaSemana,
  fimDaSemana,
  semanaDe,
  semanaSeguinte,
  semanasEditaveis,
  somarDias,
} from './semana.js';

describe('dataLocal', () => {
  it('devolve a data civil brasileira, nao a do processo', () => {
    // 01h UTC de segunda ainda e domingo 22h em Sao Paulo.
    expect(dataLocal(new Date('2026-09-07T01:00:00Z'))).toBe('2026-09-06');
  });

  it('vira o dia no horario brasileiro, nao a meia-noite UTC', () => {
    expect(dataLocal(new Date('2026-09-07T02:59:00Z'))).toBe('2026-09-06');
    expect(dataLocal(new Date('2026-09-07T03:01:00Z'))).toBe('2026-09-07');
  });
});

describe('somarDias', () => {
  it.each([
    ['2026-09-07', 1, '2026-09-08'],
    ['2026-09-07', -1, '2026-09-06'],
    ['2026-09-07', 0, '2026-09-07'],
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-01-01', -1, '2025-12-31'],
  ])('%s mais %s dia(s) e %s', (data, dias, esperado) => {
    expect(somarDias(data, dias)).toBe(esperado);
  });

  it('atravessa fevereiro de ano bissexto', () => {
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('semanaDe', () => {
  /**
   * O caso que motivou o fuso explicito. O Cloud Run roda em UTC: as 22h de um
   * domingo em Sao Paulo, o relogio do processo ja marca segunda. Um calculo sem
   * fuso devolveria a semana SEGUINTE, e o advogado registraria disponibilidade
   * nos dias errados sem ver erro nenhum.
   */
  it('domingo a noite ainda pertence a semana que termina', () => {
    expect(semanaDe(new Date('2026-09-07T01:00:00Z'))).toBe('2026-08-31');
  });

  it('a segunda de manha ja e a semana nova', () => {
    expect(semanaDe(new Date('2026-09-07T12:00:00Z'))).toBe('2026-09-07');
  });

  it.each([
    ['2026-09-07T12:00:00Z', '2026-09-07'],
    ['2026-09-09T12:00:00Z', '2026-09-07'],
    ['2026-09-13T12:00:00Z', '2026-09-07'],
    ['2026-09-14T12:00:00Z', '2026-09-14'],
  ])('%s cai na semana de %s', (instante, semana) => {
    expect(semanaDe(new Date(instante))).toBe(semana);
  });

  it('devolve sempre uma segunda-feira', () => {
    for (let dia = 1; dia <= 28; dia += 1) {
      const data = `2026-09-${String(dia).padStart(2, '0')}T15:00:00Z`;
      const semana = semanaDe(new Date(data));
      expect(new Date(`${semana}T12:00:00Z`).getUTCDay()).toBe(1);
    }
  });
});

describe('limites da semana', () => {
  it('a semana termina no domingo seguinte', () => {
    expect(fimDaSemana('2026-09-07')).toBe('2026-09-13');
  });

  it('a semana seguinte comeca sete dias depois', () => {
    expect(semanaSeguinte('2026-09-07')).toBe('2026-09-14');
  });

  it.each([
    ['2026-09-07T12:00:00Z', true],
    ['2026-09-13T12:00:00Z', true],
    ['2026-09-14T12:00:00Z', false],
    ['2026-09-06T12:00:00Z', false],
  ])('%s dentro da semana de 2026-09-07: %s', (instante, esperado) => {
    expect(dentroDaSemana(new Date(instante), '2026-09-07')).toBe(esperado);
  });

  /**
   * O limite pela borda brasileira, nao pela UTC: domingo 23h em Sao Paulo e
   * segunda 02h em UTC, e continua sendo a semana que termina.
   */
  it('o limite de domingo respeita o fuso', () => {
    expect(dentroDaSemana(new Date('2026-09-14T02:00:00Z'), '2026-09-07')).toBe(
      true,
    );
    expect(dentroDaSemana(new Date('2026-09-14T04:00:00Z'), '2026-09-07')).toBe(
      false,
    );
  });
});

describe('semanasEditaveis', () => {
  it('sao a corrente e a seguinte, nunca mais que duas', () => {
    expect(semanasEditaveis(new Date('2026-09-09T12:00:00Z'))).toEqual([
      '2026-09-07',
      '2026-09-14',
    ]);
  });
});
