import { esquemaNovoProduto } from 'shared';
import {
  expandirEntregaveis,
  paraCorpo,
} from '../../../scripts/catalogo-inicial/expandir.js';
import {
  AGUARDANDO_ESCRITORIO,
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
  it('tem os tres planos e os 23 avulsos, com slugs e nomes unicos', () => {
    expect(CATALOGO_INICIAL.slice(0, 3).map((p) => p.slug)).toEqual([
      'plano-essencial-12m',
      'plano-prime-12m',
      'plano-prime-3m',
    ]);
    expect(CATALOGO_INICIAL).toHaveLength(26);
    expect(new Set(CATALOGO_INICIAL.map((p) => p.slug)).size).toBe(26);
    expect(new Set(CATALOGO_INICIAL.map((p) => p.nome)).size).toBe(26);
  });

  /** Decisao de 02/11/2026: so assinaturas e avulsos neste primeiro momento. */
  it('nao tem pacote fechado', () => {
    expect(JSON.stringify(CATALOGO_INICIAL)).not.toMatch(/pacote \d/i);
  });

  /**
   * A DESCRICAO DETALHADA VEM DO ESCRITORIO (decisao de 18/11/2026), e ate
   * chegar o produto NAO passa no schema: e o que impede o script de cadastro de
   * gravar um catalogo sem o texto. O que este teste garante e que essa e a
   * UNICA coisa que falta: qualquer outro problema reprova aqui.
   */
  it.each(CATALOGO_INICIAL.map((p) => [p.slug, p] as const))(
    '%s passa no esquemaNovoProduto, a menos da descricao detalhada pendente',
    (_slug, produto) => {
      const resultado = esquemaNovoProduto.safeParse(paraCorpo(produto));
      const campos = (resultado.error?.issues ?? []).map((problema) =>
        problema.path.join('.'),
      );

      expect(campos).toEqual(
        produto.descricaoDetalhada === AGUARDANDO_ESCRITORIO
          ? ['descricaoDetalhada']
          : [],
      );
    },
  );

  /**
   * QUANTOS FALTAM. O numero esta escrito para o teste falhar quando um texto
   * chegar: quem o colocar atualiza a contagem, e o zero e o sinal de que este
   * teste e a tolerancia acima podem sair (CHECKLIST, "Lote de novembro").
   */
  it('os 26 produtos aguardam a descricao detalhada do escritorio', () => {
    expect(
      CATALOGO_INICIAL.filter(
        (p) => p.descricaoDetalhada === AGUARDANDO_ESCRITORIO,
      ),
    ).toHaveLength(26);
  });

  /** O proprio documento chama os tres de "assinatura" e os demais de avulso. */
  it('os tres planos sao assinatura e os 23 restantes, avulsos', () => {
    expect(CATALOGO_INICIAL.slice(0, 3).map((p) => p.tipoCobranca)).toEqual([
      'assinatura',
      'assinatura',
      'assinatura',
    ]);
    expect(
      CATALOGO_INICIAL.slice(3).every((p) => p.tipoCobranca === 'avulso'),
    ).toBe(true);
  });

  /** A contagem da secao 1 do documento de 02/11/2026, item a item. */
  it('os planos expandem para a contagem esperada de entregaveis', () => {
    expect(
      Object.fromEntries(
        CATALOGO_INICIAL.slice(0, 3).map((p) => [
          p.slug,
          paraCorpo(p).entregaveis.length,
        ]),
      ),
    ).toEqual({
      'plano-essencial-12m': 16,
      'plano-prime-12m': 59,
      'plano-prime-3m': 14,
    });
  });

  it('cada avulso tem um entregavel so, e so a reuniao avulsa tem reuniao', () => {
    const avulsos = CATALOGO_INICIAL.slice(3);
    expect(avulsos.every((p) => paraCorpo(p).entregaveis.length === 1)).toBe(
      true,
    );
    expect(avulsos.every((p) => p.parcelas === 1)).toBe(true);
    expect(
      avulsos.filter((p) => p.quantidadeReunioes > 0).map((p) => p.slug),
    ).toEqual(['reuniao-avulsa-estrategica']);
  });

  /**
   * Reais digitados no lugar de centavos passariam no schema: so o valor pega.
   * Avulsos na coluna do primeiro trimestre, na ordem do documento.
   */
  it('precos em centavos', () => {
    expect(CATALOGO_INICIAL.map((p) => p.precoCentavos)).toEqual([
      420_000, 708_000, 225_000, 4_000, 9_000, 17_000, 22_000, 35_000, 52_000,
      69_000, 104_000, 13_000, 30_000, 22_000, 22_000, 32_000, 26_000, 35_000,
      32_000, 35_000, 35_000, 43_000, 67_000, 69_000, 69_000, 86_800,
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
