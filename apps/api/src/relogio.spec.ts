import { esquecerRelogio, lerRelogioFixo } from './relogio.js';

const SOB_EMULADOR = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' };

afterEach(() => {
  esquecerRelogio();
});

describe('lerRelogioFixo', () => {
  it('sem a variavel, nao ha relogio fixo', () => {
    expect(lerRelogioFixo({})).toBeNull();
    expect(lerRelogioFixo({ ...SOB_EMULADOR, RELOGIO_FIXO: '  ' })).toBeNull();
  });

  it('sob emulador, le o instante ISO', () => {
    expect(
      lerRelogioFixo({
        ...SOB_EMULADOR,
        RELOGIO_FIXO: '2026-09-21T12:00:00.000Z',
      }),
    ).toBe(Date.parse('2026-09-21T12:00:00.000Z'));
  });

  /**
   * FORA DO EMULADOR, DERRUBA O BOOT. Um relogio fixo em producao congelaria a
   * janela de validade das reunioes, a regra das 24 horas e a antecedencia
   * minima — as tres decidem coisas que valem dinheiro ou compromisso. A
   * variavel nao tem uso legitimo fora de teste, e um servico que subisse
   * "saudavel" com o tempo parado so apareceria quando um cliente reclamasse.
   */
  it('fora do emulador, recusa subir', () => {
    expect(() =>
      lerRelogioFixo({ RELOGIO_FIXO: '2026-09-21T12:00:00.000Z' }),
    ).toThrow(/so e aceita sob emulador/);
  });

  it('fora do emulador, recusa mesmo em producao', () => {
    expect(() =>
      lerRelogioFixo({
        NODE_ENV: 'production',
        RELOGIO_FIXO: '2026-09-21T12:00:00.000Z',
      }),
    ).toThrow(/so e aceita sob emulador/);
  });

  it('recusa instante ilegivel', () => {
    expect(() =>
      lerRelogioFixo({ ...SOB_EMULADOR, RELOGIO_FIXO: 'segunda que vem' }),
    ).toThrow(/invalida/);
  });
});
