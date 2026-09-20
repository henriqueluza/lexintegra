import { configuracaoNaInicializacao } from './reunioes/sala/sala.module.js';
import { agora, esquecerRelogio, lerRelogioFixo } from './relogio.js';

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

/**
 * O BOOT, E NAO SO A LEITURA.
 *
 * `agora()` le a variavel na PRIMEIRA chamada, e a primeira chamada acontece
 * quando alguem lista horarios ou marca uma reuniao. Ate a revisao do PR #26 era
 * so isso: um `RELOGIO_FIXO` esquecido em producao passava pelo boot, pelo
 * startup probe e pelo smoke test, e aparecia como 500 na cara do primeiro
 * cliente que tentasse marcar — com a janela de validade, a regra das 24 horas e
 * a antecedencia minima congeladas ate la.
 *
 * O teste chama `configuracaoNaInicializacao`, que e EXATAMENTE o que o
 * `useFactory` do `SalaDeReuniaoModule` chama. Exercitar `lerRelogioFixo` direto
 * provaria que a leitura recusa, nao que o BOOT recusa — que e a afirmacao que
 * interessa.
 */
describe('configuracaoNaInicializacao', () => {
  const DESLIGADO = { REUNIOES_MODO: 'desligado' };

  it('derruba o boot com relogio fixo fora do emulador', () => {
    expect(() =>
      configuracaoNaInicializacao({
        ...DESLIGADO,
        RELOGIO_FIXO: '2026-09-21T12:00:00.000Z',
      }),
    ).toThrow(/so e aceita sob emulador/);
  });

  it('derruba o boot em producao, onde o estrago seria maior', () => {
    expect(() =>
      configuracaoNaInicializacao({
        ...DESLIGADO,
        NODE_ENV: 'production',
        RELOGIO_FIXO: '2026-09-21T12:00:00.000Z',
      }),
    ).toThrow(/so e aceita sob emulador/);
  });

  it('derruba o boot com instante ilegivel, mesmo sob emulador', () => {
    expect(() =>
      configuracaoNaInicializacao({
        ...SOB_EMULADOR,
        RELOGIO_FIXO: 'segunda que vem',
      }),
    ).toThrow(/invalida/);
  });

  /* O caminho que a suite de jornadas usa: sob emulador, com instante valido. */
  it('sob emulador, fixa o relogio e devolve a configuracao', () => {
    expect(
      configuracaoNaInicializacao({
        ...SOB_EMULADOR,
        RELOGIO_FIXO: '2026-09-21T12:00:00.000Z',
      }),
    ).toEqual({ modo: 'falso', graph: null });
    expect(agora()).toBe(Date.parse('2026-09-21T12:00:00.000Z'));
  });

  it('sem a variavel, sobe com o relogio de verdade', () => {
    expect(() => configuracaoNaInicializacao({})).not.toThrow();
    expect(Math.abs(agora() - Date.now())).toBeLessThan(1_000);
  });
});
