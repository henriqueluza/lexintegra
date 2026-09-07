import {
  celulaDoInstante,
  chaveDaCelula,
  DIAS,
  HORAS,
  instanteDaCelula,
  rotuloDoDia,
  slotsDasCelulas,
} from './grade';

const SEMANA = '2026-09-07';

describe('instanteDaCelula', () => {
  /**
   * A celula e um horario BRASILEIRO e o instante e UTC. Sao Paulo e UTC-3:
   * segunda as 14h daqui e 17h em UTC. Um `new Date(ano, mes, dia, hora)` usaria
   * o fuso do NAVEGADOR — na maquina de um advogado em viagem, a grade dele
   * marcaria horarios deslocados sem nenhum aviso.
   */
  it('converte hora local em instante UTC', () => {
    expect(instanteDaCelula(SEMANA, 0, 14).inicio).toBe(
      '2026-09-07T17:00:00.000Z',
    );
  });

  it('a celula dura uma hora', () => {
    const { inicio, fim } = instanteDaCelula(SEMANA, 0, 14);
    expect(Date.parse(fim) - Date.parse(inicio)).toBe(60 * 60 * 1000);
  });

  it('o dia 0 e a segunda da semana', () => {
    expect(instanteDaCelula(SEMANA, 0, 12).inicio).toContain('2026-09-07');
    expect(instanteDaCelula(SEMANA, 4, 12).inicio).toContain('2026-09-11');
  });
});

describe('celulaDoInstante', () => {
  it('e o caminho inverso de instanteDaCelula', () => {
    for (const [dia] of DIAS.entries()) {
      for (const hora of HORAS) {
        const { inicio } = instanteDaCelula(SEMANA, dia, hora);
        expect(celulaDoInstante(SEMANA, inicio)).toEqual({ dia, hora });
      }
    }
  });

  /** Slot fora da grade util (fim de semana, madrugada) nao tem celula — e a
   * tela simplesmente nao o marca, em vez de estourar. */
  it('devolve null para instante fora da grade', () => {
    expect(celulaDoInstante(SEMANA, '2026-09-12T17:00:00.000Z')).toBeNull();
    expect(celulaDoInstante(SEMANA, '2026-09-07T05:00:00.000Z')).toBeNull();
  });
});

describe('slotsDasCelulas', () => {
  it('converte o conjunto marcado em slots ordenados', () => {
    const marcadas = new Set([chaveDaCelula(1, 9), chaveDaCelula(0, 14)]);

    const slots = slotsDasCelulas(SEMANA, marcadas);

    expect(slots).toHaveLength(2);
    // Dia 0 antes do dia 1, independentemente da ordem de insercao no conjunto.
    expect(slots[0].inicio).toContain('2026-09-07');
    expect(slots[1].inicio).toContain('2026-09-08');
  });

  it('conjunto vazio produz lista vazia', () => {
    expect(slotsDasCelulas(SEMANA, new Set())).toEqual([]);
  });
});

describe('rotuloDoDia', () => {
  it('junta o nome do dia com o dia do mes', () => {
    expect(rotuloDoDia(SEMANA, 0)).toBe('Segunda 07');
    expect(rotuloDoDia(SEMANA, 4)).toBe('Sexta 11');
  });
});
