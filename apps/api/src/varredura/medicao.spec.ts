import { Timestamp } from 'firebase-admin/firestore';
import {
  duracao,
  instante,
  instantesDe,
  Medicao,
  relogioDaMedicao,
  sanearMedidas,
  SEM_INSTANTES,
  tentativaDoCabecalho,
} from './medicao.js';

/**
 * Um relogio que anda a passos conhecidos: cada leitura devolve o proximo
 * instante da lista. O original volta depois de cada caso.
 */
const original = relogioDaMedicao.agora;

function relogioEm(...instantes: number[]): void {
  const fila = [...instantes];
  relogioDaMedicao.agora = (): number => {
    const proximo = fila.shift();
    if (proximo === undefined)
      throw new Error('relogio de teste sem instantes');
    return proximo;
  };
}

afterEach(() => {
  relogioDaMedicao.agora = original;
});

describe('duracao', () => {
  it('conta de um instante ao outro', () => {
    expect(duracao(1_000, 4_500)).toBe(3_500);
    expect(duracao(1_000, 1_000)).toBe(0);
  });

  it('sem uma das pontas, nao inventa', () => {
    expect(duracao(null, 4_500)).toBeNull();
    expect(duracao(1_000, null)).toBeNull();
  });

  /** Relogios de maquinas diferentes: o fim pode vir antes do comeco. */
  it('fim antes do comeco e null, e nao numero negativo', () => {
    expect(duracao(4_500, 1_000)).toBeNull();
  });

  it('mais de um dia nao e medida', () => {
    expect(duracao(0, 86_400_000)).toBe(86_400_000);
    expect(duracao(0, 86_400_001)).toBeNull();
  });
});

describe('instante', () => {
  it('le o Timestamp do Firestore em milissegundos', () => {
    expect(instante(Timestamp.fromMillis(1_700_000_000_123))).toBe(
      1_700_000_000_123,
    );
  });

  it.each([[undefined], [null], [1_700_000_000_123], ['2026-11-22'], [{}]])(
    '%p nao e instante',
    (valor) => {
      expect(instante(valor)).toBeNull();
    },
  );
});

describe('instantesDe', () => {
  it('le a emissao, a confirmacao e o tamanho', () => {
    expect(
      instantesDe(
        { confirmadoEm: Timestamp.fromMillis(2_000), tamanhoBytes: 1024 },
        Timestamp.fromMillis(1_000),
      ),
    ).toEqual({ emitidoEm: 1_000, confirmadoEm: 2_000, tamanhoBytes: 1024 });
  });

  /** Arquivo anterior aos campos: nada foi migrado, e nada e inventado. */
  it('arquivo sem os campos novos sai com null', () => {
    expect(instantesDe({}, undefined)).toEqual(SEM_INSTANTES);
  });

  it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], ['100']])(
    'tamanho %p nao e tamanho',
    (tamanhoBytes) => {
      expect(instantesDe({ tamanhoBytes }, undefined).tamanhoBytes).toBeNull();
    },
  );

  it('tamanho zero e tamanho', () => {
    expect(instantesDe({ tamanhoBytes: 0 }, undefined).tamanhoBytes).toBe(0);
  });
});

describe('sanearMedidas', () => {
  it('aceita o que o scanner manda', () => {
    expect(
      sanearMedidas({
        frio: true,
        bootMs: 41_250.4,
        downloadMs: 180,
        clamMs: 95,
      }),
    ).toEqual({
      scannerFrio: true,
      bootMs: 41_250,
      downloadMs: 180,
      clamMs: 95,
    });
  });

  /** Versao anterior do contentor e o scanner falso nao mandam o campo. */
  it.each([[undefined], [null], ['medidas'], [42]])(
    'resposta sem medidas (%p) vira tudo null',
    (bruto) => {
      expect(sanearMedidas(bruto)).toEqual({
        scannerFrio: null,
        bootMs: null,
        downloadMs: null,
        clamMs: null,
      });
    },
  );

  it.each([
    ['texto', '95'],
    ['negativo', -1],
    ['nao finito', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
    ['maior que um dia', 86_400_001],
  ])('duracao %s nao entra na tabela', (_nome, valor) => {
    expect(sanearMedidas({ clamMs: valor }).clamMs).toBeNull();
  });

  it('zero e um dia inteiro sao duracoes validas', () => {
    expect(sanearMedidas({ clamMs: 0 }).clamMs).toBe(0);
    expect(sanearMedidas({ clamMs: 86_400_000 }).clamMs).toBe(86_400_000);
  });

  it('`frio` so vale como booleano', () => {
    expect(sanearMedidas({ frio: false }).scannerFrio).toBe(false);
    expect(sanearMedidas({ frio: 'true' }).scannerFrio).toBeNull();
    expect(sanearMedidas({ frio: 1 }).scannerFrio).toBeNull();
  });
});

describe('tentativaDoCabecalho', () => {
  it('le o numero da tentativa', () => {
    expect(tentativaDoCabecalho('0')).toBe(0);
    expect(tentativaDoCabecalho('3')).toBe(3);
    expect(tentativaDoCabecalho('9999')).toBe(9_999);
  });

  it.each([[undefined], [''], ['-1'], ['1.5'], ['12345'], ['3; x'], [3]])(
    '%p nao e tentativa',
    (valor) => {
      expect(tentativaDoCabecalho(valor)).toBeNull();
    },
  );
});

describe('Medicao', () => {
  const ARQUIVO = { emitidoEm: 1_000, confirmadoEm: 4_000, tamanhoBytes: 2048 };

  it('monta a linha com a duracao de cada fase', async () => {
    /*
     * 10_000 a tarefa chega; scanner de 10_100 a 12_600; conferencia em duas
     * leituras (12_700 a 12_750 e 12_800 a 12_830); mover de 12_900 a 13_100;
     * a linha sai em 13_200.
     */
    relogioEm(
      10_000,
      10_100,
      12_600,
      12_700,
      12_750,
      12_800,
      12_830,
      12_900,
      13_100,
      13_200,
    );

    const medicao = new Medicao(2);
    await medicao.cronometrar('scannerMs', () => Promise.resolve());
    medicao.registrarScanner({
      frio: true,
      bootMs: 900,
      downloadMs: 300,
      clamMs: 1_100,
    });
    await medicao.cronometrar('conferenciaMs', () => Promise.resolve());
    await medicao.cronometrar('conferenciaMs', () => Promise.resolve());
    await medicao.cronometrar('moverMs', () => Promise.resolve());

    expect(medicao.linha('anexo-cliente', 'limpo', ARQUIVO)).toEqual({
      sinal: 'arquivo.varrido',
      fluxo: 'anexo-cliente',
      veredito: 'limpo',
      tamanhoBytes: 2048,
      tentativa: 2,
      envioMs: 3_000,
      filaMs: 6_000,
      scannerMs: 2_500,
      scannerFrio: true,
      bootMs: 900,
      downloadMs: 300,
      clamMs: 1_100,
      conferenciaMs: 80,
      moverMs: 200,
      processamentoMs: 3_200,
      totalMs: 9_200,
    });
  });

  it('fase que nao aconteceu sai null, e nao zero', () => {
    relogioEm(10_000, 10_050);

    expect(
      new Medicao(null).linha('anexo-cliente', 'infectado', ARQUIVO),
    ).toMatchObject({
      tentativa: null,
      scannerMs: null,
      conferenciaMs: null,
      moverMs: null,
      scannerFrio: null,
      processamentoMs: 50,
    });
  });

  it('arquivo sem instantes: o que depende deles sai null', () => {
    relogioEm(10_000, 10_050);

    expect(
      new Medicao(0).linha('entregavel-advogado', 'limpo', SEM_INSTANTES),
    ).toMatchObject({
      tamanhoBytes: null,
      envioMs: null,
      filaMs: null,
      totalMs: null,
      processamentoMs: 50,
    });
  });

  /** O scanner que estoura o prazo tambem gastou tempo. */
  it('o tempo conta mesmo quando o trabalho lanca', async () => {
    relogioEm(10_000, 10_100, 15_100, 15_200);
    const medicao = new Medicao(0);

    await expect(
      medicao.cronometrar('scannerMs', () => Promise.reject(new Error('caiu'))),
    ).rejects.toThrow('caiu');

    expect(medicao.linha('anexo-cliente', 'limpo', ARQUIVO)).toMatchObject({
      scannerMs: 5_000,
    });
  });

  it('devolve o que o trabalho devolveu', async () => {
    relogioEm(10_000, 10_100, 10_200);

    expect(
      await new Medicao(0).cronometrar('moverMs', () => Promise.resolve('ok')),
    ).toBe('ok');
  });

  /** So numeros, o fluxo e o veredito: nada que identifique o arquivo. */
  it('a linha nao tem campo de nome nem de caminho', () => {
    relogioEm(10_000, 10_050);

    expect(
      Object.keys(
        new Medicao(0).linha('anexo-cliente', 'limpo', ARQUIVO),
      ).sort(),
    ).toEqual(
      [
        'bootMs',
        'clamMs',
        'conferenciaMs',
        'downloadMs',
        'envioMs',
        'filaMs',
        'fluxo',
        'moverMs',
        'processamentoMs',
        'scannerFrio',
        'scannerMs',
        'sinal',
        'tamanhoBytes',
        'tentativa',
        'totalMs',
        'veredito',
      ].sort(),
    );
  });
});
