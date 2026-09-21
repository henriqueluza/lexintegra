import { esquemaAgendamento, esquemaRemarcacao } from './reuniao.js';

describe('esquemaAgendamento', () => {
  it('aceita um slotId', () => {
    const lido = esquemaAgendamento.parse({
      slotId: 'uid-ana_2026-09-24T14:00:00.000Z',
    });

    expect(lido.slotId).toBe('uid-ana_2026-09-24T14:00:00.000Z');
  });

  it('apara espacos', () => {
    expect(esquemaAgendamento.parse({ slotId: '  slot-1  ' }).slotId).toBe(
      'slot-1',
    );
  });

  /**
   * `trim` antes do `min`, como em todo schema deste pacote: tres espacos tem
   * tres caracteres e passariam por um minimo aplicado ao valor cru — e o id
   * vazio viraria um caminho de documento invalido no Firestore, com uma
   * mensagem que nao menciona horario nenhum.
   */
  it.each([
    ['vazio', ''],
    ['so espacos', '   '],
  ])('recusa slotId %s', (_caso, slotId) => {
    expect(esquemaAgendamento.safeParse({ slotId }).success).toBe(false);
  });

  it('recusa slotId longo demais', () => {
    expect(
      esquemaAgendamento.safeParse({ slotId: 'x'.repeat(201) }).success,
    ).toBe(false);
  });

  it('recusa corpo sem slotId', () => {
    expect(esquemaAgendamento.safeParse({}).success).toBe(false);
  });
});

describe('esquemaRemarcacao', () => {
  /**
   * Tem o mesmo formato do agendamento HOJE, e e um schema proprio para poder
   * deixar de ter amanha. O teste registra a equivalencia atual sem amarrar os
   * dois: se a remarcacao ganhar um campo, este teste cai aqui e nao la.
   */
  it('aceita um slotId', () => {
    expect(esquemaRemarcacao.parse({ slotId: 'slot-2' }).slotId).toBe('slot-2');
  });

  it('recusa corpo vazio', () => {
    expect(esquemaRemarcacao.safeParse({}).success).toBe(false);
  });
});
