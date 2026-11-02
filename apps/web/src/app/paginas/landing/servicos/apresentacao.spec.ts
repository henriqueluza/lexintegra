import { agruparItens, apresentar, plural } from './apresentacao';
import type { ProdutoVitrine } from 'shared/esquemas/vitrine';

const produto: ProdutoVitrine = {
  id: 'p',
  nome: 'Serviço',
  descricao: '',
  precoCentavos: 0,
  entregaveis: [],
  quantidadeReunioes: 0,
  numeroRevisoesPermitidas: 0,
  parcelas: 1,
};

describe('Apresentação do catálogo, sem alterar os dados de compra', () => {
  it.each([1, 2, 24])(
    'agrupa %s ocorrências usando o total declarado',
    (quantidade) => {
      const itens = Array.from(
        { length: quantidade },
        (_, i) => `Contrato personalizado (${i + 1} de 24)`,
      ).reverse();
      expect(agruparItens(itens)).toEqual([
        { quantidade: 24, nome: 'Contratos personalizados' },
      ]);
    },
  );
  it.each([
    'Contrato ×24',
    'Contrato x 24',
    'Contrato (24)',
    '24 x Contrato',
    'Contrato (2/24)',
    'Contrato (2 of 24)',
  ])('aceita o marcador %s', (nome) => {
    expect(agruparItens([nome])).toEqual([
      { quantidade: 24, nome: 'Contratos' },
    ]);
  });
  it('conta repetições sem marcador e preserva a ordem dos itens', () => {
    expect(agruparItens(['Parecer', 'Contrato', 'Parecer'])).toEqual([
      { quantidade: 2, nome: 'Pareceres' },
      { quantidade: 1, nome: 'Contrato' },
    ]);
  });
  it('prioriza quantidade e plural estruturados, inclusive zero', () => {
    expect(
      agruparItens([
        {
          nome: 'Contrato (1 de 24)',
          quantidade: 2,
          nomePlural: 'Instrumentos',
        },
        { nome: 'Parecer ×8', quantidade: 0 },
        'Reunião (0)',
      ]),
    ).toEqual([{ quantidade: 2, nome: 'Instrumentos' }]);
  });
  it.each([
    ['Análise contratual', 'Análises contratuais'],
    ['Parecer técnico premium', 'Pareceres técnicos premium'],
    ['Termo/contrato personalizado', 'Termos/contratos personalizados'],
    [
      'Relatório mensal de distribuição de ações judiciais',
      'Relatórios mensais de distribuição de ações judiciais',
    ],
    ['Reunião', 'Reuniões'],
  ])('pluraliza %s', (singular, esperado) =>
    expect(plural(singular)).toBe(esperado),
  );
  it('omite zeros e mantém íntegro um produto sem descrição nem itens', () => {
    expect(apresentar(produto)).toMatchObject({
      linhas: [],
      meta: '',
      descricao: '',
      total: '',
      preco: 'Sob consulta',
    });
  });

  /**
   * Decisao de 01/11/2026: a parcela vem do campo `parcelas` e da conta de
   * `shared`, nao mais de "3x de R$ 245,00" escrito na descricao. O teste que
   * existia aqui ("nao calcula mensalidade a partir do nome ou preco") defendia
   * a regra antiga, e foi invertido de proposito.
   */
  it('poe a parcela em destaque e o total embaixo, calculados do preço', () => {
    const ficha = apresentar({
      ...produto,
      precoCentavos: 708_000,
      parcelas: 12,
    });
    expect(ficha.preco.replace(/\s/g, ' ')).toBe('12x de R$ 590,00');
    expect(ficha.total.replace(/\s/g, ' ')).toBe('Total R$ 7.080,00');
  });

  it('mostra só o total, sem "1x de", quando o produto não é parcelável', () => {
    const ficha = apresentar({ ...produto, precoCentavos: 69_000, parcelas: 1 });
    expect(ficha.preco.replace(/\s/g, ' ')).toBe('R$ 690,00');
    expect(ficha.total).toBe('');
  });

  it('não lê parcela do texto da descrição, e não o corta', () => {
    const descricao = 'Assessoria. Pode ser parcelado em 3x de R$ 245,00.';
    const ficha = apresentar({
      ...produto,
      descricao,
      precoCentavos: 69_000,
      parcelas: 3,
    });
    expect(ficha.preco.replace(/\s/g, ' ')).toBe('3x de R$ 230,00');
    expect(ficha.descricao).toBe(descricao);
  });

  it('indexa os itens para a busca', () => {
    const ficha = apresentar({
      ...produto,
      nome: 'Plano 12 meses',
      precoCentavos: 120000,
      entregaveis: ['Análise contratual ×2'],
    });
    expect(ficha.busca).toContain('analises contratuais');
    expect(ficha.preco.replace(/\s/g, ' ')).toBe('R$ 1.200,00');
  });
});
