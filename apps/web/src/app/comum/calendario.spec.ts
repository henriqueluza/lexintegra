import {
  diaDoInstante,
  gradeDoMes,
  horaDoInstante,
  mesesEntre,
  rotuloDoDia,
  rotuloDoMes,
} from './calendario';

describe('gradeDoMes', () => {
  /* Outubro de 2026 comeca numa quinta: a grade abre em 28/09. */
  const grade = gradeDoMes('2026-10', '2026-10-07');

  it('vai de segunda a domingo, com os dias vizinhos marcados', () => {
    expect(grade).toHaveLength(5);
    expect(grade[0].map((d) => d.data)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(grade[0][0].doMes).toBe(false);
    expect(grade[0][3].doMes).toBe(true);
  });

  it('marca hoje, o passado e o fim de semana', () => {
    const dias = grade.flat();
    const dia = (data: string): (typeof dias)[number] | undefined =>
      dias.find((d) => d.data === data);
    expect(dia('2026-10-07')).toMatchObject({ hoje: true, passado: false });
    expect(dia('2026-10-06')).toMatchObject({ hoje: false, passado: true });
    expect(dia('2026-10-10')?.fimDeSemana).toBe(true);
    expect(dia('2026-10-09')?.fimDeSemana).toBe(false);
  });

  it('marca os feriados', () => {
    const doze = grade.flat().find((d) => d.data === '2026-10-12');
    expect(doze?.feriado?.nome).toBe('Nossa Senhora Aparecida');
  });
});

describe('rotulos', () => {
  it('mes e dia em portugues', () => {
    expect(rotuloDoMes('2026-10')).toBe('Outubro de 2026');
    expect(rotuloDoDia('2026-10-08')).toBe('Quinta-feira, 8 de outubro');
    expect(rotuloDoDia('2026-10-11')).toBe('Domingo, 11 de outubro');
  });

  /* 23h em Sao Paulo ja e o dia seguinte em UTC. */
  it('dia e hora no fuso do escritorio', () => {
    expect(diaDoInstante('2026-10-09T02:00:00.000Z')).toBe('2026-10-08');
    expect(horaDoInstante('2026-10-08T17:00:00.000Z')).toBe('14:00');
  });
});

describe('mesesEntre', () => {
  it('atravessa o ano', () => {
    expect(mesesEntre('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});
