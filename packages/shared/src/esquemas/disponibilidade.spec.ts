import {
  esquemaDisponibilidadeSemanal,
  esquemaSemana,
  esquemaSlot,
  haSobreposicao,
  idDoSlot,
} from './disponibilidade.js';

const SEMANA = '2026-09-07';
const slot = (
  inicio: string,
  fim: string,
): { inicio: string; fim: string } => ({
  inicio,
  fim,
});

const MANHA = slot('2026-09-08T13:00:00.000Z', '2026-09-08T15:00:00.000Z');
const TARDE = slot('2026-09-08T17:00:00.000Z', '2026-09-08T19:00:00.000Z');

describe('esquemaSemana', () => {
  it('aceita uma segunda-feira', () => {
    expect(esquemaSemana.safeParse('2026-09-07').success).toBe(true);
  });

  /**
   * Uma semana que nao comeca na segunda gravaria uma grade cuja identidade
   * nenhuma leitura calcularia de volta: os slots existiriam e a tela nunca os
   * encontraria.
   */
  it.each([['2026-09-08'], ['2026-09-09'], ['2026-09-13']])(
    'recusa %s, que nao e segunda',
    (data) => {
      expect(esquemaSemana.safeParse(data).success).toBe(false);
    },
  );

  it('recusa formato que nao e data, sem lancar', () => {
    expect(() => esquemaSemana.safeParse('semana que vem')).not.toThrow();
    expect(esquemaSemana.safeParse('semana que vem').success).toBe(false);
  });
});

describe('esquemaSlot', () => {
  it('aceita duas horas', () => {
    expect(esquemaSlot.safeParse(MANHA).success).toBe(true);
  });

  it('recusa fim antes do inicio', () => {
    expect(esquemaSlot.safeParse(slot(MANHA.fim, MANHA.inicio)).success).toBe(
      false,
    );
  });

  it('recusa menos de uma hora', () => {
    expect(
      esquemaSlot.safeParse(
        slot('2026-09-08T13:00:00.000Z', '2026-09-08T13:30:00.000Z'),
      ).success,
    ).toBe(false);
  });

  it('recusa mais de quatro horas', () => {
    expect(
      esquemaSlot.safeParse(
        slot('2026-09-08T13:00:00.000Z', '2026-09-08T18:00:00.000Z'),
      ).success,
    ).toBe(false);
  });

  /**
   * So UTC. O ID do documento sai deste texto (regra inviolavel 4): aceitar
   * offset faria dois textos diferentes designarem o mesmo instante, e um slot
   * viraria dois documentos.
   */
  it('recusa horario com offset em vez de UTC', () => {
    expect(
      esquemaSlot.safeParse(
        slot('2026-09-08T10:00:00-03:00', '2026-09-08T12:00:00-03:00'),
      ).success,
    ).toBe(false);
  });
});

describe('haSobreposicao', () => {
  it('nao ve sobreposicao em slots separados', () => {
    expect(haSobreposicao([MANHA, TARDE])).toBe(false);
  });

  /** Encostados nao e sobreposto: uma tarde inteira publicada em blocos e o caso
   * comum, nao um erro. */
  it('nao ve sobreposicao em slots encostados', () => {
    expect(
      haSobreposicao([MANHA, slot(MANHA.fim, '2026-09-08T17:00:00.000Z')]),
    ).toBe(false);
  });

  it('ve sobreposicao em slots cruzados, mesmo fora de ordem', () => {
    const cruzado = slot(
      '2026-09-08T14:00:00.000Z',
      '2026-09-08T16:00:00.000Z',
    );
    expect(haSobreposicao([MANHA, cruzado])).toBe(true);
    expect(haSobreposicao([cruzado, MANHA])).toBe(true);
  });

  it('aguenta lista vazia e de um item', () => {
    expect(haSobreposicao([])).toBe(false);
    expect(haSobreposicao([MANHA])).toBe(false);
  });
});

describe('esquemaDisponibilidadeSemanal', () => {
  it('aceita uma grade valida', () => {
    expect(
      esquemaDisponibilidadeSemanal.safeParse({
        semana: SEMANA,
        slots: [MANHA, TARDE],
      }).success,
    ).toBe(true);
  });

  /** Semana vazia e publicacao valida: e como o advogado diz "nao tenho horario
   * nesta semana". Recusar obrigaria a manter grade que ele nao quer. */
  it('aceita semana sem nenhum slot', () => {
    expect(
      esquemaDisponibilidadeSemanal.safeParse({ semana: SEMANA, slots: [] })
        .success,
    ).toBe(true);
  });

  /**
   * O slot de outra semana sobrescreveria a grade errada — e o advogado veria a
   * semana correta na tela, porque a tela mostra o que ele acabou de mandar.
   */
  it('recusa slot fora da semana informada', () => {
    expect(
      esquemaDisponibilidadeSemanal.safeParse({
        semana: SEMANA,
        slots: [slot('2026-09-15T13:00:00.000Z', '2026-09-15T15:00:00.000Z')],
      }).success,
    ).toBe(false);
  });

  it('recusa sobreposicao', () => {
    expect(
      esquemaDisponibilidadeSemanal.safeParse({
        semana: SEMANA,
        slots: [
          MANHA,
          slot('2026-09-08T14:00:00.000Z', '2026-09-08T16:00:00.000Z'),
        ],
      }).success,
    ).toBe(false);
  });

  it('recusa mais de 40 slots', () => {
    // Um slot de uma hora por hora cheia, espalhado pelos dias uteis da semana:
    // 41 slots validos e sem sobreposicao, para o teste medir o TETO e nao
    // esbarrar noutra regra antes de chegar nele.
    const muitos = Array.from({ length: 41 }, (_, i) => {
      const dia = 8 + Math.floor(i / 9);
      const hora = 10 + (i % 9);
      return slot(
        `2026-09-${dia}T${String(hora).padStart(2, '0')}:00:00.000Z`,
        `2026-09-${dia}T${String(hora + 1).padStart(2, '0')}:00:00.000Z`,
      );
    });

    expect(
      esquemaDisponibilidadeSemanal.safeParse({ semana: SEMANA, slots: muitos })
        .success,
    ).toBe(false);
  });

  /**
   * O corpo malformado tem que virar 400, nao 500.
   *
   * No zod 4, refinement de objeto roda MESMO depois de a validacao interna
   * falhar. Antes da guarda de `msDe`, um `Invalid Date` chegava ao
   * `Intl.format` e o `RangeError` subia pelo `ZodPipe` como erro nao tratado —
   * numa rota que qualquer advogado autenticado alcanca.
   */
  it.each([
    ['semana ilegivel', { semana: 'semana que vem', slots: [] }],
    [
      'instante ilegivel',
      { semana: SEMANA, slots: [slot('nao e data', 'nem isto')] },
    ],
    ['slots que nao sao lista', { semana: SEMANA, slots: 'terca de manha' }],
    ['corpo vazio', {}],
  ])('recusa %s sem lancar', (_nome, corpo) => {
    expect(() => esquemaDisponibilidadeSemanal.safeParse(corpo)).not.toThrow();
    expect(esquemaDisponibilidadeSemanal.safeParse(corpo).success).toBe(false);
  });
});

describe('idDoSlot', () => {
  /** O mesmo formato que `packages/regras-firestore` ja exercita. */
  it('e deterministico e junta advogado com instante', () => {
    expect(idDoSlot('advogado-1', '2026-09-04T14:00:00Z')).toBe(
      'advogado-1_2026-09-04T14:00:00Z',
    );
    expect(idDoSlot('a', 'i')).toBe(idDoSlot('a', 'i'));
  });
});
