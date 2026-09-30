import {
  geradaEmDoCabecalho,
  idadeEmHoras,
  sinaisDaPublicacao,
  versaoDoClamd,
} from './idade-da-base.js';

const CABECALHO =
  'ClamAV-VDB:15 Sep 2026 08-12 +0000:27123:2000000:58:X:X:raynman:1757923200';

describe('geradaEmDoCabecalho', () => {
  /**
   * A HORA VEM COM HIFEN no lugar dos dois-pontos, porque dois-pontos e o
   * separador de campo do proprio cabecalho. Sem desfazer isso, a data nao e
   * reconhecida e a idade vira `null` — e o alerta de base velha deixa de ter
   * dado exatamente quando ele importaria.
   */
  it('le a data de geracao do cabecalho do .cvd', () => {
    expect(geradaEmDoCabecalho(CABECALHO)?.toISOString()).toBe(
      '2026-09-15T08:12:00.000Z',
    );
  });

  it('recusa cabecalho que nao e do ClamAV', () => {
    expect(geradaEmDoCabecalho('qualquer coisa')).toBeNull();
    expect(geradaEmDoCabecalho('')).toBeNull();
  });

  it('devolve nulo para data ilegivel em vez de inventar uma', () => {
    expect(geradaEmDoCabecalho('ClamAV-VDB:sem data aqui:27123')).toBeNull();
  });
});

describe('versaoDoClamd', () => {
  it('le versao e data da base carregada pelo daemon', () => {
    const { versao, geradaEm } = versaoDoClamd(
      'ClamAV 1.0.3/27123/Mon Sep 15 08:30:00 2026\n',
    );

    expect(versao).toBe('27123');
    expect(geradaEm?.getFullYear()).toBe(2026);
  });

  it('nao quebra com saida inesperada', () => {
    expect(versaoDoClamd('ClamAV nao respondeu')).toEqual({
      versao: null,
      geradaEm: null,
    });
  });
});

describe('idadeEmHoras', () => {
  it('conta as horas desde a geracao', () => {
    expect(
      idadeEmHoras(
        new Date('2026-09-15T08:00:00.000Z'),
        new Date('2026-09-17T08:00:00.000Z'),
      ),
    ).toBe(48);
  });

  /** Relogio adiantado do lado do mirror nao pode virar idade negativa, que a
   * metrica registraria como um numero absurdo. */
  it('nunca devolve idade negativa', () => {
    expect(
      idadeEmHoras(
        new Date('2026-09-17T08:00:00.000Z'),
        new Date('2026-09-15T08:00:00.000Z'),
      ),
    ).toBe(0);
  });
});

describe('sinaisDaPublicacao', () => {
  const agora = new Date('2026-09-29T12:42:00.000Z');
  const nomes = (sinais: ReturnType<typeof sinaisDaPublicacao>): string[] =>
    sinais.map(({ sinal }) => sinal);

  /**
   * O achado de 29/09/2026: `main.cvd` de 6877 h e `bytecode.cvd` de 9192 h
   * publicados ao lado de um `daily.cvd` de 6 h disparavam a politica de idade em
   * toda execucao saudavel. So o sinal do `daily` alimenta a metrica.
   */
  it('so o daily emite o sinal que alimenta a metrica de idade', () => {
    const antiga = new Date('2025-12-16T23:18:00.000Z');

    expect(nomes(sinaisDaPublicacao('main.cvd', antiga, agora))).toEqual([
      'clamav.base-publicada',
    ]);
    expect(nomes(sinaisDaPublicacao('bytecode.cvd', antiga, agora))).toEqual([
      'clamav.base-publicada',
    ]);
  });

  it('daily.cvd e daily.cld emitem os dois sinais, com a idade real', () => {
    const geradaEm = new Date('2026-09-29T06:26:00.000Z');

    for (const nome of ['daily.cvd', 'daily.cld']) {
      const sinais = sinaisDaPublicacao(nome, geradaEm, agora);
      expect(nomes(sinais)).toEqual([
        'clamav.base-publicada',
        'clamav.daily-publicada',
      ]);
      expect(sinais[1]?.campos['idadeHoras']).toBe(6);
    }
  });

  it('daily com data ilegivel nao inventa idade nem alimenta a metrica', () => {
    const sinais = sinaisDaPublicacao('daily.cvd', null, agora);

    expect(nomes(sinais)).toEqual(['clamav.base-publicada']);
    expect(sinais[0]?.campos).toEqual({ arquivo: 'daily.cvd' });
  });
});
