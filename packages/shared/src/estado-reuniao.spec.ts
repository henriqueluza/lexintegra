import {
  ESTADOS_REUNIAO,
  reuniaoAtiva,
  reuniaoConsomeSaldo,
  type EstadoReuniao,
} from './estado-reuniao.js';

describe('vocabulario da reuniao', () => {
  /**
   * A lista e NOMINAL de proposito, como a de `TIPOS_EVENTO`. Um estado novo
   * muda o calculo do saldo, o filtro do painel do administrador e o selo da
   * tela — este teste obriga quem acrescenta a passar pelos tres.
   */
  it('tem exatamente os quatro estados de reuniao', () => {
    expect(ESTADOS_REUNIAO).toEqual([
      'reservada_sem_link',
      'confirmada',
      'cancelada_com_devolucao',
      'cancelada_sem_devolucao',
    ]);
  });

  describe('reuniaoAtiva', () => {
    it.each([
      ['reservada_sem_link', true],
      ['confirmada', true],
      ['cancelada_com_devolucao', false],
      ['cancelada_sem_devolucao', false],
    ] as const)('%s ocupa o slot: %s', (estado, esperado) => {
      expect(reuniaoAtiva(estado)).toBe(esperado);
    });

    /**
     * `reservada_sem_link` E ativa, e essa e a linha que mais importa aqui. A
     * sala ainda nao existe, mas o slot esta reservado e o compromisso vale —
     * trata-la como inativa liberaria o horario para outro cliente enquanto o
     * outbox ainda esta tentando criar a sala.
     */
    it('a reuniao sem sala ainda ocupa o slot', () => {
      expect(reuniaoAtiva('reservada_sem_link')).toBe(true);
    });
  });

  describe('reuniaoConsomeSaldo', () => {
    /**
     * ADR-12: "cancelamento com menos de 24 horas de antecedencia, ou nao
     * comparecimento, consome a reuniao do saldo sem devolucao". So UM estado
     * devolve.
     */
    it.each([
      ['reservada_sem_link', true],
      ['confirmada', true],
      ['cancelada_sem_devolucao', true],
      ['cancelada_com_devolucao', false],
    ] as const)('%s consome saldo: %s', (estado, esperado) => {
      expect(reuniaoConsomeSaldo(estado)).toBe(esperado);
    });

    /**
     * O reverso da lista: exatamente um estado devolve. Escrito assim porque a
     * funcao e uma NEGACAO — um estado novo passa a consumir por padrao, que e o
     * lado seguro, e este teste mostra se alguem inverteu isso sem perceber.
     */
    it('exatamente um estado devolve o credito', () => {
      const devolvem = ESTADOS_REUNIAO.filter(
        (estado: EstadoReuniao) => !reuniaoConsomeSaldo(estado),
      );

      expect(devolvem).toEqual(['cancelada_com_devolucao']);
    });
  });
});
