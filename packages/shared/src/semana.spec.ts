import {
  dataLocal,
  dentroDaSemana,
  ehMes,
  fimDaSemana,
  mesDe,
  SEMANAS_EDITAVEIS,
  semanaDe,
  semanaSeguinte,
  semanasDoMes,
  semanasEditaveis,
  semanasProximas,
  somarDias,
  deslocarMes,
  ultimoDiaDoMes,
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
  /* Errata do ADR-06 (07/10/2026): de duas semanas para doze meses. */
  it('vao da corrente ate doze meses a frente, de sete em sete dias', () => {
    const semanas = semanasEditaveis(new Date('2026-09-09T12:00:00Z'));

    expect(SEMANAS_EDITAVEIS).toBe(53);
    expect(semanas).toHaveLength(53);
    expect(semanas.slice(0, 2)).toEqual(['2026-09-07', '2026-09-14']);
    expect(semanas.at(-1)).toBe('2027-09-06');
  });
});

describe('semanasProximas', () => {
  it('sao a corrente e a seguinte', () => {
    expect(semanasProximas(new Date('2026-09-09T12:00:00Z'))).toEqual([
      '2026-09-07',
      '2026-09-14',
    ]);
  });
});

describe('meses', () => {
  it('reconhece so AAAA-MM com mes valido', () => {
    expect(ehMes('2026-10')).toBe(true);
    expect(ehMes('2026-13')).toBe(false);
    expect(ehMes('2026-1')).toBe(false);
    expect(ehMes('2026-10-01')).toBe(false);
    expect(ehMes(202610)).toBe(false);
  });

  /* 31/10 as 22h em Sao Paulo ja e 1/11 em UTC. */
  it('mesDe usa o fuso do escritorio', () => {
    expect(mesDe(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10');
  });

  it('soma meses atravessando o ano, nos dois sentidos', () => {
    expect(deslocarMes('2026-11', 2)).toBe('2027-01');
    expect(deslocarMes('2027-01', -1)).toBe('2026-12');
    expect(deslocarMes('2026-10', 12)).toBe('2027-10');
  });

  it('acha o ultimo dia, inclusive em fevereiro bissexto', () => {
    expect(ultimoDiaDoMes('2026-10')).toBe('2026-10-31');
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29');
    expect(ultimoDiaDoMes('2027-02')).toBe('2027-02-28');
  });
});

describe('semanasDoMes', () => {
  /* Outubro de 2026 comeca numa quinta: a primeira semana vem de setembro. */
  it('inclui as semanas que comecam no mes anterior e terminam no seguinte', () => {
    expect(semanasDoMes('2026-10')).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  /* Fevereiro de 2027 comeca numa segunda e tem quatro semanas exatas. */
  it('mes que comeca numa segunda nao puxa semana do anterior', () => {
    expect(semanasDoMes('2027-02')).toEqual([
      '2027-02-01',
      '2027-02-08',
      '2027-02-15',
      '2027-02-22',
    ]);
  });

  /* Agosto de 2027 comeca num domingo e precisa de seis linhas. */
  it('chega a seis semanas', () => {
    expect(semanasDoMes('2027-08')).toHaveLength(6);
  });
});
