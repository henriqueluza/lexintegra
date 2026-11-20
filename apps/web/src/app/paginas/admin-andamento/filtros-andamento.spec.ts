import type { LinhaDeAndamento } from 'shared/andamento';
import {
  filtrarLinhas,
  notaDoPedido,
  ordenarLinhas,
  produtosDoAndamento,
  quandoFoi,
  rotuloDeDias,
  SEM_FILTROS,
} from './filtros-andamento';

function linha(parcial: Partial<LinhaDeAndamento>): LinhaDeAndamento {
  return {
    pedidoId: 'cob_001',
    produto: 'Parecer',
    cliente: 'Clara Nunes',
    advogadoId: 'adv-1',
    situacao: 'ativo',
    contestacaoAberta: false,
    entregavelId: 'e1',
    entregavel: 'Parecer',
    estado: 'em_elaboracao',
    estadoDesde: '2026-11-01T00:00:00.000Z',
    vez: 'advogado',
    desde: '2026-11-01T00:00:00.000Z',
    dias: 2,
    parado: false,
    ...parcial,
  };
}

const PARADA = linha({ entregavelId: 'p', dias: 9, parado: true });
const NOVA = linha({ entregavelId: 'n', dias: 1 });
const CLIENTE = linha({
  entregavelId: 'c',
  vez: 'cliente',
  dias: 20,
  cliente: 'Álvaro Dias',
  produto: 'Contrato',
});
const ENTREGUE = linha({
  entregavelId: 'x',
  vez: 'ninguem',
  estado: 'entregue',
  dias: 40,
});
const TODAS = [NOVA, ENTREGUE, CLIENTE, PARADA];

describe('filtrarLinhas', () => {
  it('abre em andamento: some quem nao pede acao de ninguem', () => {
    expect(filtrarLinhas(TODAS, SEM_FILTROS)).toEqual([NOVA, CLIENTE, PARADA]);
  });

  it('"todos" devolve tudo', () => {
    expect(filtrarLinhas(TODAS, { ...SEM_FILTROS, situacao: 'todos' })).toEqual(
      TODAS,
    );
  });

  it('"parados" e "aguardando o cliente"', () => {
    expect(
      filtrarLinhas(TODAS, { ...SEM_FILTROS, situacao: 'parados' }),
    ).toEqual([PARADA]);
    expect(
      filtrarLinhas(TODAS, { ...SEM_FILTROS, situacao: 'cliente' }),
    ).toEqual([CLIENTE]);
  });

  it('filtra por estado e por produto', () => {
    const todos = { ...SEM_FILTROS, situacao: 'todos' as const };
    expect(filtrarLinhas(TODAS, { ...todos, estado: 'entregue' })).toEqual([
      ENTREGUE,
    ]);
    expect(filtrarLinhas(TODAS, { ...todos, produto: 'Contrato' })).toEqual([
      CLIENTE,
    ]);
  });

  it('busca o cliente sem acento, sem caixa e sem espaco sobrando', () => {
    expect(
      filtrarLinhas(TODAS, { ...SEM_FILTROS, cliente: ' ALVARO ' }),
    ).toEqual([CLIENTE]);
  });
});

describe('ordenarLinhas', () => {
  it('parados primeiro, depois mais dias, e dias desconhecidos no fim', () => {
    const semData = linha({ entregavelId: 's', dias: null });
    const ordem = ordenarLinhas([NOVA, semData, CLIENTE, PARADA]);
    expect(ordem.map((l) => l.entregavelId)).toEqual(['p', 'c', 'n', 's']);
  });

  it('nao altera o vetor recebido', () => {
    const entrada = [NOVA, PARADA];
    ordenarLinhas(entrada);
    expect(entrada).toEqual([NOVA, PARADA]);
  });
});

describe('produtosDoAndamento', () => {
  it('sem repeticao e em ordem alfabetica', () => {
    expect(
      produtosDoAndamento([
        { produto: 'Parecer' },
        { produto: 'Contrato' },
        { produto: 'Parecer' },
      ]),
    ).toEqual(['Contrato', 'Parecer']);
  });
});

describe('rotuloDeDias', () => {
  it('traduz zero, um, varios e desconhecido', () => {
    expect(rotuloDeDias(0)).toBe('hoje');
    expect(rotuloDeDias(1)).toBe('1 dia');
    expect(rotuloDeDias(12)).toBe('12 dias');
    expect(rotuloDeDias(null)).toBe('—');
  });
});

describe('notaDoPedido', () => {
  it('diz em texto o cancelamento, o estorno e a contestacao', () => {
    expect(notaDoPedido(linha({}))).toBeNull();
    expect(notaDoPedido(linha({ situacao: 'cancelado' }))).toBe(
      'Pedido cancelado',
    );
    expect(
      notaDoPedido(linha({ situacao: 'estornado', contestacaoAberta: true })),
    ).toBe('Pedido estornado · Contestação aberta');
  });
});

describe('quandoFoi', () => {
  it('so a data, quando pedido, e o traco para ausente ou ilegivel', () => {
    expect(quandoFoi('2026-11-01T12:00:00.000Z', false)).toBe('01/11/2026');
    expect(quandoFoi('2026-11-01T12:00:00.000Z')).toContain('09:00:00');
    expect(quandoFoi(null)).toBe('—');
    expect(quandoFoi('lixo')).toBe('—');
  });
});
