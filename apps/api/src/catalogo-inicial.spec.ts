import { esquemaNovoProduto } from 'shared';
import {
  expandirEntregaveis,
  paraCorpo,
} from '../../../scripts/catalogo-inicial/expandir.js';
import {
  CATALOGO_INICIAL,
  REVISOES_PADRAO,
} from '../../../scripts/catalogo-inicial/produtos.data.js';

/**
 * O catalogo inicial do escritorio (`scripts/catalogo-inicial/`), gravado pela
 * API com `scripts/cadastrar-catalogo-inicial.mjs`.
 *
 * Mora aqui porque `scripts/` nao tem suite propria, e porque o validador que
 * importa e o da API: um produto que passa aqui passa no `ZodPipe` de
 * `POST /api/admin/produtos`.
 */
describe('expandirEntregaveis', () => {
  it('quantidade 1 mantem o nome como esta', () => {
    expect(
      expandirEntregaveis([{ nome: 'Parecer técnico premium', quantidade: 1 }]),
    ).toEqual(['Parecer técnico premium']);
  });

  it('quantidade maior que 1 vira um por unidade, com "(N de Total)"', () => {
    expect(
      expandirEntregaveis([{ nome: 'Contrato personalizado', quantidade: 3 }]),
    ).toEqual([
      'Contrato personalizado (1 de 3)',
      'Contrato personalizado (2 de 3)',
      'Contrato personalizado (3 de 3)',
    ]);
  });

  it('mantem a ordem dos itens', () => {
    expect(
      expandirEntregaveis([
        { nome: 'Diagnóstico', quantidade: 1 },
        { nome: 'Termo', quantidade: 2 },
        { nome: 'Parecer', quantidade: 1 },
      ]),
    ).toEqual(['Diagnóstico', 'Termo (1 de 2)', 'Termo (2 de 2)', 'Parecer']);
  });

  it('lista vazia da lista vazia (quem recusa e o schema)', () => {
    expect(expandirEntregaveis([])).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN])('recusa quantidade %p', (quantidade) => {
    expect(() =>
      expandirEntregaveis([{ nome: 'Contrato', quantidade }]),
    ).toThrow('Quantidade invalida para "Contrato"');
  });
});

describe('catalogo inicial', () => {
  it('tem os seis produtos, com slugs e nomes unicos', () => {
    expect(CATALOGO_INICIAL.map((p) => p.slug)).toEqual([
      'plano-essencial-12m',
      'plano-prime-12m',
      'plano-prime-3m',
      'pacote-1-diagnostico-operacao',
      'pacote-2-diagnostico-completo',
      'pacote-3-diagnostico-estrategico',
    ]);
    expect(new Set(CATALOGO_INICIAL.map((p) => p.nome)).size).toBe(6);
  });

  it.each(CATALOGO_INICIAL.map((p) => [p.slug, p] as const))(
    '%s passa no esquemaNovoProduto',
    (_slug, produto) => {
      const resultado = esquemaNovoProduto.safeParse(paraCorpo(produto));
      expect(resultado.error?.issues ?? []).toEqual([]);
    },
  );

  /** A contagem que o escritorio conferiu, item a item, no PDF dos planos. */
  it('expande para a contagem esperada de entregaveis', () => {
    expect(
      Object.fromEntries(
        CATALOGO_INICIAL.map((p) => [p.slug, paraCorpo(p).entregaveis.length]),
      ),
    ).toEqual({
      'plano-essencial-12m': 13,
      'plano-prime-12m': 59,
      'plano-prime-3m': 16,
      'pacote-1-diagnostico-operacao': 3,
      'pacote-2-diagnostico-completo': 5,
      'pacote-3-diagnostico-estrategico': 7,
    });
  });

  /** Reais digitados no lugar de centavos passariam no schema: so o valor pega. */
  it('precos em centavos', () => {
    expect(CATALOGO_INICIAL.map((p) => p.precoCentavos)).toEqual([
      420_000, 708_000, 225_000, 69_000, 129_000, 199_000,
    ]);
  });

  it('todos com REVISOES_PADRAO, que ainda e zero', () => {
    expect(REVISOES_PADRAO).toBe(0);
    expect(
      CATALOGO_INICIAL.every(
        (p) => p.numeroRevisoesPermitidas === REVISOES_PADRAO,
      ),
    ).toBe(true);
  });

  it('o slug nao vai para a API: o modelo nao tem esse campo', () => {
    expect(Object.keys(paraCorpo(CATALOGO_INICIAL[0]))).not.toContain('slug');
  });
});
