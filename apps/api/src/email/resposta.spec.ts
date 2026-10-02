import { enderecoDeResposta } from './resposta.js';

describe('enderecoDeResposta (EMAIL_REPLY_TO)', () => {
  it('devolve o endereco configurado, sem espacos nas pontas', () => {
    expect(enderecoDeResposta({ EMAIL_REPLY_TO: ' suporte@x.test ' })).toBe(
      'suporte@x.test',
    );
  });

  /** Opcional em todo ambiente: sem ela o envio continua, so sem o campo. */
  it.each([
    ['ausente', {}],
    ['vazia', { EMAIL_REPLY_TO: '' }],
    ['so espacos', { EMAIL_REPLY_TO: '  ' }],
  ])('devolve undefined quando %s', (_caso, ambiente) => {
    expect(enderecoDeResposta(ambiente)).toBeUndefined();
  });

  /**
   * Valor que nao parece endereco faria o provedor recusar TODO e-mail, e a
   * recusa so apareceria como falha de entrega. Melhor nao subir.
   */
  it.each([
    ['com nome', 'Suporte <suporte@x.test>'],
    ['sem arroba', 'suporte.x.test'],
    ['sem dominio', 'suporte@'],
    ['dois enderecos', 'a@x.test, b@x.test'],
  ])('recusa valor %s', (_caso, valor) => {
    expect(() => enderecoDeResposta({ EMAIL_REPLY_TO: valor })).toThrow(
      /EMAIL_REPLY_TO/,
    );
  });
});
