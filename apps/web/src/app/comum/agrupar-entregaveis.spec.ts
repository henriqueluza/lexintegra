import { agruparEntregaveis, rotuloDoEntregavel } from './agrupar-entregaveis';

describe('agruparEntregaveis', () => {
  it('junta as unidades "(N de Total)" numa linha com a quantidade', () => {
    expect(
      agruparEntregaveis([
        'Diagnóstico jurídico da operação (completo)',
        'Contrato personalizado (1 de 3)',
        'Contrato personalizado (2 de 3)',
        'Contrato personalizado (3 de 3)',
        'Parecer técnico premium',
      ]),
    ).toEqual([
      { nome: 'Diagnóstico jurídico da operação (completo)', quantidade: 1 },
      { nome: 'Contrato personalizado', quantidade: 3 },
      { nome: 'Parecer técnico premium', quantidade: 1 },
    ]);
  });

  it('junta nomes identicos repetidos', () => {
    expect(agruparEntregaveis(['Parecer', 'Plano', 'Parecer'])).toEqual([
      { nome: 'Parecer', quantidade: 2 },
      { nome: 'Plano', quantidade: 1 },
    ]);
  });

  /* Parentese que nao e o sufixo de unidade faz parte do nome. */
  it('mantem parenteses que nao sao "(N de Total)"', () => {
    expect(
      agruparEntregaveis([
        'Diagnóstico (trabalhista OU regulatório)',
        'Modelo (padrão de 2)',
      ]),
    ).toEqual([
      { nome: 'Diagnóstico (trabalhista OU regulatório)', quantidade: 1 },
      { nome: 'Modelo (padrão de 2)', quantidade: 1 },
    ]);
  });

  it('lista vazia da lista vazia', () => {
    expect(agruparEntregaveis([])).toEqual([]);
  });
});

describe('rotuloDoEntregavel', () => {
  it('com mais de uma unidade, mostra a quantidade', () => {
    expect(
      rotuloDoEntregavel({ nome: 'Contrato personalizado', quantidade: 24 }),
    ).toBe('Contrato personalizado 24×');
  });

  it('com uma unidade, so o nome', () => {
    expect(rotuloDoEntregavel({ nome: 'Parecer', quantidade: 1 })).toBe(
      'Parecer',
    );
  });
});
