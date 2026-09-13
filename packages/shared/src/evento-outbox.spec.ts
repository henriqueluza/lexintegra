import {
  ESTADOS_ENTREGA,
  TIPOS_EVENTO,
  ehEstadoEntrega,
  permiteReenvioManual,
  type EstadoEntrega,
} from './evento-outbox.js';

describe('vocabulario do outbox', () => {
  /**
   * A lista e NOMINAL de proposito. Acrescentar um tipo de evento sem montador
   * correspondente no despachante produz registro que nunca sai — este teste
   * obriga quem acrescenta a passar por aqui.
   */
  it('tem exatamente os tres tipos de evento que o despachante monta', () => {
    expect(TIPOS_EVENTO).toEqual([
      'definir-senha',
      'redefinir-senha',
      'aviso-exclusao-arquivos',
    ]);
  });

  it('tem os quatro estados de entrega', () => {
    expect(ESTADOS_ENTREGA).toEqual([
      'pendente',
      'enviado',
      'falhou',
      'abandonado',
    ]);
  });
});

describe('ehEstadoEntrega', () => {
  it.each(ESTADOS_ENTREGA)('aceita %s', (estado) => {
    expect(ehEstadoEntrega(estado)).toBe(true);
  });

  it.each([['entregue'], [''], [null], [undefined], [3], [{}]])(
    'recusa %p',
    (valor) => {
      expect(ehEstadoEntrega(valor)).toBe(false);
    },
  );
});

describe('permiteReenvioManual', () => {
  /**
   * So o que ja parou de andar sozinho. Reenviar um `pendente` criaria uma
   * segunda tarefa para algo que a fila ainda vai entregar, e o arrendamento no
   * servidor recusaria — um botao que nao faz nada e nao diz por que.
   */
  it.each([
    ['pendente', false],
    ['enviado', false],
    ['falhou', true],
    ['abandonado', true],
  ] as [EstadoEntrega, boolean][])('%s -> %s', (estado, esperado) => {
    expect(permiteReenvioManual(estado)).toBe(esperado);
  });
});
