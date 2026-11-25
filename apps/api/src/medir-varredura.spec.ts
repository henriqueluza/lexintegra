import {
  amostraDe,
  amostrasDe,
  contagensDe,
  FASES,
  formatarDuracao,
  formatarTabela,
  percentil,
  tabelaDeFases,
} from '../../../scripts/medir-varredura/tabela.js';
import { Medicao } from './varredura/medicao.js';

/**
 * A conta que `scripts/medir-varredura.mjs` faz sobre as linhas `arquivo.varrido`
 * (lote de novembro, ajuste 13). O script nao tem suite propria; o teste mora
 * aqui pelo mesmo motivo de `catalogo-inicial.spec.ts`.
 */

function entrada(campos: Record<string, unknown>): unknown {
  return { jsonPayload: { sinal: 'arquivo.varrido', ...campos } };
}

describe('percentil', () => {
  it('sem amostras, nao ha percentil', () => {
    expect(percentil([], 50)).toBeNull();
  });

  it('com uma amostra, todo percentil e ela', () => {
    expect(percentil([420], 50)).toBe(420);
    expect(percentil([420], 95)).toBe(420);
  });

  it('usa o posto mais proximo, sem interpolar', () => {
    const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    expect(percentil(valores, 50)).toBe(50);
    expect(percentil(valores, 95)).toBe(100);
    expect(percentil(valores, 90)).toBe(90);
    expect(percentil(valores, 10)).toBe(10);
  });

  /** Com cinco medicoes, o p95 e a maior: nenhum valor que ninguem mediu. */
  it('o p95 de cinco amostras e a maior delas', () => {
    expect(percentil([300, 100, 500, 200, 400], 95)).toBe(500);
    expect(percentil([300, 100, 500, 200, 400], 50)).toBe(300);
  });

  it('ordena como numero, e nao como texto', () => {
    expect(percentil([1_000, 90, 200], 50)).toBe(200);
  });

  it('nao reordena a lista de quem chamou', () => {
    const valores = [3, 1, 2];
    percentil(valores, 50);
    expect(valores).toEqual([3, 1, 2]);
  });
});

describe('amostraDe', () => {
  it('le as fases, o grupo e as contagens de uma linha', () => {
    expect(
      amostraDe(
        entrada({
          fluxo: 'anexo-cliente',
          veredito: 'limpo',
          tentativa: 1,
          scannerFrio: true,
          envioMs: 3_000,
          filaMs: 800,
          scannerMs: 42_000,
          bootMs: 40_000,
          downloadMs: 180,
          clamMs: 95,
          conferenciaMs: 60,
          moverMs: 210,
          totalMs: 43_500,
        }),
      ),
    ).toEqual({
      frio: true,
      fluxo: 'anexo-cliente',
      veredito: 'limpo',
      tentativa: 1,
      fases: {
        envioMs: 3_000,
        filaMs: 800,
        scannerMs: 42_000,
        bootMs: 40_000,
        downloadMs: 180,
        clamMs: 95,
        conferenciaMs: 60,
        moverMs: 210,
        totalMs: 43_500,
      },
    });
  });

  it.each([
    ['null', null],
    ['texto', 'linha'],
    ['sem jsonPayload', { textPayload: 'arquivo liberado' }],
    ['outro sinal', { jsonPayload: { sinal: 'clamav.base-usada' } }],
    ['jsonPayload que nao e objeto', { jsonPayload: 'x' }],
  ])('descarta entrada que nao e medicao (%s)', (_nome, valor) => {
    expect(amostraDe(valor)).toBeNull();
  });

  /** `null` na linha e duracao que nao se soube medir: nao vira zero. */
  it('duracao ausente, nula ou estranha fica fora da conta', () => {
    const amostra = amostraDe(
      entrada({ envioMs: null, filaMs: '800', scannerMs: -1, clamMs: 0 }),
    );

    expect(amostra?.fases).toMatchObject({
      envioMs: null,
      filaMs: null,
      scannerMs: null,
      clamMs: 0,
      totalMs: null,
    });
  });

  it('scanner que nao disse se estava frio fica sem grupo', () => {
    expect(amostraDe(entrada({}))?.frio).toBeNull();
    expect(amostraDe(entrada({ scannerFrio: 'true' }))?.frio).toBeNull();
    expect(amostraDe(entrada({ scannerFrio: false }))?.frio).toBe(false);
  });
});

describe('tabelaDeFases', () => {
  const amostras = amostrasDe([
    entrada({ scannerFrio: true, scannerMs: 40_000, clamMs: 100 }),
    entrada({ scannerFrio: false, scannerMs: 300, clamMs: 80 }),
    entrada({ scannerFrio: false, scannerMs: 500, clamMs: 120 }),
    entrada({ scannerMs: 900 }),
    { jsonPayload: { sinal: 'outro' } },
  ]);

  it('separa frio de quente, e conta as amostras de cada coluna', () => {
    const tabela = tabelaDeFases(amostras);

    expect(tabela.scannerMs).toEqual({
      frio: { n: 1, p50: 40_000, p95: 40_000 },
      quente: { n: 2, p50: 300, p95: 500 },
      todos: { n: 4, p50: 500, p95: 40_000 },
    });
  });

  it('amostra sem a fase nao entra no `n` daquela fase', () => {
    expect(tabelaDeFases(amostras).clamMs.todos).toEqual({
      n: 3,
      p50: 100,
      p95: 120,
    });
  });

  it('fase sem nenhuma amostra sai com n zero e sem percentil', () => {
    expect(tabelaDeFases(amostras).moverMs.todos).toEqual({
      n: 0,
      p50: null,
      p95: null,
    });
  });

  it('sem amostras, a tabela existe e esta vazia', () => {
    const tabela = tabelaDeFases([]);

    for (const [fase] of FASES) {
      expect(tabela[fase].todos.n).toBe(0);
    }
  });
});

describe('contagensDe', () => {
  it('conta o total, os grupos, as reentregas, o fluxo e o veredito', () => {
    const amostras = amostrasDe([
      entrada({
        scannerFrio: true,
        tentativa: 2,
        fluxo: 'anexo-cliente',
        veredito: 'limpo',
      }),
      entrada({
        scannerFrio: false,
        tentativa: 0,
        fluxo: 'anexo-cliente',
        veredito: 'rejeitado',
      }),
      entrada({
        scannerFrio: false,
        tentativa: null,
        fluxo: 'entregavel-advogado',
        veredito: 'limpo',
      }),
    ]);

    expect(contagensDe(amostras)).toEqual({
      total: 3,
      frias: 1,
      quentes: 2,
      reentregues: 1,
      porFluxo: { 'anexo-cliente': 2, 'entregavel-advogado': 1 },
      porVeredito: { limpo: 2, rejeitado: 1 },
    });
  });

  it('linha sem fluxo nem veredito conta como desconhecido', () => {
    expect(contagensDe(amostrasDe([entrada({})]))).toMatchObject({
      porFluxo: { desconhecido: 1 },
      porVeredito: { desconhecido: 1 },
    });
  });
});

describe('formatarDuracao', () => {
  it.each([
    [null, '—'],
    [0, '0 ms'],
    [349.6, '350 ms'],
    [999, '999 ms'],
    [1_000, '1,0 s'],
    [1_240, '1,2 s'],
    [59_940, '59,9 s'],
    [60_000, '1 min 00 s'],
    [125_400, '2 min 05 s'],
  ])('%p vira %s', (ms, esperado) => {
    expect(formatarDuracao(ms)).toBe(esperado);
  });
});

describe('formatarTabela', () => {
  it('tem uma linha por fase, com as tres colunas e o n de cada uma', () => {
    const texto = formatarTabela(
      tabelaDeFases(
        amostrasDe([
          entrada({ scannerFrio: true, scannerMs: 40_000 }),
          entrada({ scannerFrio: false, scannerMs: 300 }),
        ]),
      ),
    );

    const linhas = texto.split('\n');
    expect(linhas).toHaveLength(FASES.length + 2);
    expect(linhas[0]).toContain('Frio p50');
    expect(texto).toContain(
      '| Chamada ao scanner, vista pela API | 40,0 s | 40,0 s | 1 | 300 ms | 300 ms | 1 | 300 ms | 40,0 s | 2 |',
    );
    expect(texto).toContain('| Mover para o bucket de arquivos | — | — | 0 |');
  });
});

/**
 * O CONTRATO ENTRE QUEM ESCREVE E QUEM LE. A API escreve a linha
 * (`varredura/medicao.ts`) e o script a le por nome de campo; renomear um campo
 * de um lado so faria a tabela sair vazia, sem erro nenhum.
 */
describe('o script le a linha que a API escreve', () => {
  it('toda fase da tabela e um campo da linha `arquivo.varrido`', () => {
    const linha = new Medicao(0).linha('anexo-cliente', 'limpo', {
      emitidoEm: null,
      confirmadoEm: null,
      tamanhoBytes: null,
    });

    for (const [fase] of FASES) {
      expect(linha).toHaveProperty(fase);
    }
    expect(linha).toHaveProperty('scannerFrio');
    expect(linha).toHaveProperty('tentativa');
    expect(amostraDe({ jsonPayload: linha })).not.toBeNull();
  });
});
