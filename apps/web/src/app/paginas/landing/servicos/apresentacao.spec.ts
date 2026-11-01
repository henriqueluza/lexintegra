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
      condicao: '',
      preco: 'Sob consulta',
    });
  });
  it.each([
    [
      'Assessoria. Pode ser parcelado em 3x de R$ 245,00.',
      'ou 3x de R$ 245,00',
    ],
    ['Assessoria. 3x de R$ 245,00', 'ou 3x de R$ 245,00'],
    ['Assessoria. (R$ 350,00/mês)', 'R$ 350,00/mês'],
    ['Assessoria. R$ 350,00/mês', 'R$ 350,00/mês'],
  ])('extrai condição sem repeti-la: %s', (descricao, condicao) => {
    const original = { ...produto, descricao };
    expect(apresentar(original)).toMatchObject({
      descricao: 'Assessoria.',
      condicao,
      produto: original,
    });
    expect(original.descricao).toBe(descricao);
  });
  it('não calcula mensalidade a partir do nome ou preço e indexa os itens', () => {
    const ficha = apresentar({
      ...produto,
      nome: 'Plano 12 meses',
      precoCentavos: 120000,
      entregaveis: ['Análise contratual ×2'],
    });
    expect(ficha.condicao).toBe('');
    expect(ficha.busca).toContain('analises contratuais');
    expect(ficha.preco.replace(/\s/g, ' ')).toBe('R$ 1.200,00');
  });
});
