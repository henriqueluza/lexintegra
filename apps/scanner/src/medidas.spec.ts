import {
  criarMarcadorDeFrio,
  cronometrar,
  duracoesDoBoot,
  instantesDoBoot,
  medidasDaVarredura,
} from './medidas.js';

describe('instantesDoBoot', () => {
  it('le os tres instantes exportados pelo script de entrada', () => {
    expect(
      instantesDoBoot({
        BOOT_INICIO_MS: '1795400000000',
        BOOT_BASE_MS: '1795400021000',
        BOOT_CLAMD_MS: '1795400039500',
      }),
    ).toEqual({
      inicio: 1_795_400_000_000,
      base: 1_795_400_021_000,
      clamd: 1_795_400_039_500,
    });
  });

  /** Fora do contentor (testes, desenvolvimento) as variaveis nao existem. */
  it('sem as variaveis, tudo null', () => {
    expect(instantesDoBoot({})).toEqual({
      inicio: null,
      base: null,
      clamd: null,
    });
  });

  /** `date +%s%3N` num `date` sem `%N` devolve o literal: nao pode virar numero. */
  it.each([['1795400000%3N'], [''], ['-5'], ['12.5'], ['abc'], ['123']])(
    'valor que nao e epoca em milissegundos (%p) vira null',
    (valor) => {
      expect(instantesDoBoot({ BOOT_INICIO_MS: valor }).inicio).toBeNull();
    },
  );
});

describe('duracoesDoBoot', () => {
  const BOOT = { inicio: 1_000_000, base: 1_021_000, clamd: 1_039_500 };

  it('separa baixar a base, subir o clamd e o boot inteiro', () => {
    expect(duracoesDoBoot(BOOT, 1_040_200)).toEqual({
      baixarBaseMs: 21_000,
      clamdMs: 18_500,
      bootMs: 40_200,
    });
  });

  it('sem um instante, so some a duracao que dependia dele', () => {
    expect(duracoesDoBoot({ ...BOOT, base: null }, 1_040_200)).toEqual({
      baixarBaseMs: null,
      clamdMs: null,
      bootMs: 40_200,
    });
    expect(duracoesDoBoot({ ...BOOT, inicio: null }, 1_040_200)).toEqual({
      baixarBaseMs: null,
      clamdMs: 18_500,
      bootMs: null,
    });
  });

  it('fim antes do comeco e null, e nao numero negativo', () => {
    expect(duracoesDoBoot(BOOT, 999_000).bootMs).toBeNull();
    expect(
      duracoesDoBoot({ ...BOOT, clamd: 1_020_000 }, 1_040_200).clamdMs,
    ).toBeNull();
  });

  it('instantes iguais dao zero', () => {
    expect(
      duracoesDoBoot({ ...BOOT, base: 1_000_000 }, 1_000_000),
    ).toMatchObject({ baixarBaseMs: 0, bootMs: 0 });
  });
});

describe('cronometrar', () => {
  function relogio(...instantes: number[]): () => number {
    const fila = [...instantes];
    return () => fila.shift() ?? Number.NaN;
  }

  it('devolve o resultado e quanto o trabalho levou', async () => {
    await expect(
      cronometrar(relogio(5_000, 5_180), () => Promise.resolve('ok')),
    ).resolves.toEqual({ resultado: 'ok', ms: 180 });
  });

  it('relogio que anda para tras da zero, e nao negativo', async () => {
    await expect(
      cronometrar(relogio(5_000, 4_900), () => Promise.resolve(1)),
    ).resolves.toEqual({ resultado: 1, ms: 0 });
  });

  /** Quem chama decide o que fazer com a falha; aqui ela so passa. */
  it('nao engole a falha do trabalho', async () => {
    await expect(
      cronometrar(relogio(1, 2), () => Promise.reject(new Error('caiu'))),
    ).rejects.toThrow('caiu');
  });
});

describe('criarMarcadorDeFrio', () => {
  it('so a primeira varredura da instancia e fria', () => {
    const frio = criarMarcadorDeFrio();

    expect(frio()).toBe(true);
    expect(frio()).toBe(false);
    expect(frio()).toBe(false);
  });

  it('cada instancia tem o seu marcador', () => {
    const a = criarMarcadorDeFrio();
    const b = criarMarcadorDeFrio();

    expect(a()).toBe(true);
    expect(b()).toBe(true);
  });
});

describe('medidasDaVarredura', () => {
  it('a varredura fria leva o tempo de boot', () => {
    expect(
      medidasDaVarredura({
        frio: true,
        bootMs: 40_200,
        downloadMs: 180,
        clamMs: 95,
      }),
    ).toEqual({ frio: true, bootMs: 40_200, downloadMs: 180, clamMs: 95 });
  });

  /** O boot ja foi cobrado da primeira; repeti-lo inflaria a coluna "quente". */
  it('a quente nao leva `bootMs`', () => {
    expect(
      medidasDaVarredura({
        frio: false,
        bootMs: 40_200,
        downloadMs: 180,
        clamMs: 95,
      }),
    ).toEqual({ frio: false, downloadMs: 180, clamMs: 95 });
  });

  it('fria sem boot conhecido sai sem o campo, e nao com null', () => {
    expect(
      medidasDaVarredura({
        frio: true,
        bootMs: null,
        downloadMs: 180,
        clamMs: 95,
      }),
    ).toEqual({ frio: true, downloadMs: 180, clamMs: 95 });
  });
});
