import {
  ESTADOS_ENTREGAVEL,
  EstadoEntregavel,
  EVENTOS_DE_TRANSICAO,
  EVENTOS_ENTREGAVEL,
  EVENTOS_SEM_TRANSICAO,
  TRANSICAO_DO_EVENTO,
  TRANSICOES_VALIDAS,
  transicaoPermitida,
} from './estado-entregavel.js';

describe('maquina de estados do entregavel (ADR-11)', () => {
  it('tem exatamente os quatro estados fixados no ADR', () => {
    expect([...ESTADOS_ENTREGAVEL]).toEqual([
      'solicitado',
      'em_elaboracao',
      'em_revisao',
      'entregue',
    ]);
  });

  it('permite as transicoes disparadas por evento de dominio', () => {
    expect(transicaoPermitida('solicitado', 'em_elaboracao')).toBe(true);
    expect(transicaoPermitida('em_elaboracao', 'em_revisao')).toBe(true);
    expect(transicaoPermitida('em_elaboracao', 'entregue')).toBe(true);
    expect(transicaoPermitida('em_revisao', 'em_elaboracao')).toBe(true);
  });

  it('trata entregue como estado terminal', () => {
    for (const estado of ESTADOS_ENTREGAVEL) {
      expect(transicaoPermitida('entregue', estado)).toBe(false);
    }
  });

  /**
   * O caso negativo que mais importa: `entregue` so e alcancado a partir de
   * `em_elaboracao`, depois de upload e confirmacao do cliente. Um salto de
   * `solicitado` direto para `entregue` seria exatamente a escrita direta de campo
   * que o ADR-11 proibe.
   */
  it('nao permite pular para entregue sem passar por em_elaboracao', () => {
    expect(transicaoPermitida('solicitado', 'entregue')).toBe(false);
    expect(transicaoPermitida('em_revisao', 'entregue')).toBe(false);
  });

  it('nao permite voltar de em_elaboracao para solicitado', () => {
    expect(transicaoPermitida('em_elaboracao', 'solicitado')).toBe(false);
  });

  it('declara transicoes para todos os estados, sem estado orfao', () => {
    const declarados = Object.keys(TRANSICOES_VALIDAS) as EstadoEntregavel[];
    expect(declarados.sort()).toEqual([...ESTADOS_ENTREGAVEL].sort());
  });
});

describe('eventos de dominio (ADR-11)', () => {
  it('so aceita arestas que a maquina de estados ja permite', () => {
    for (const evento of EVENTOS_DE_TRANSICAO) {
      const { de, para } = TRANSICAO_DO_EVENTO[evento];
      expect(transicaoPermitida(de, para)).toBe(true);
    }
  });

  /**
   * O mapa de eventos e o grafo de transicoes sao duas listas, e listas separadas
   * divergem. Este teste e o que impede uma aresta de existir em
   * `TRANSICOES_VALIDAS` sem evento que a dispare — ou seja, um caminho ate um
   * estado novo que so seria alcancavel escrevendo o campo a mao, que e o que o
   * ADR-11 proibe.
   */
  it('cobre toda aresta do grafo com exatamente um evento', () => {
    const arestasDoGrafo = ESTADOS_ENTREGAVEL.flatMap((de) =>
      TRANSICOES_VALIDAS[de].map((para) => `${de}->${para}`),
    );
    const arestasDeEventos = EVENTOS_DE_TRANSICAO.map((evento) => {
      const { de, para } = TRANSICAO_DO_EVENTO[evento];
      return `${de}->${para}`;
    });

    expect(arestasDeEventos.sort()).toEqual(arestasDoGrafo.sort());
  });

  it('nao da evento de transicao ao upload nem a criacao do pedido', () => {
    for (const evento of EVENTOS_SEM_TRANSICAO) {
      expect(EVENTOS_DE_TRANSICAO).not.toContain(evento);
    }
  });

  it('reune os dois grupos sem repetir nome de evento', () => {
    expect(new Set(EVENTOS_ENTREGAVEL).size).toBe(EVENTOS_ENTREGAVEL.length);
    expect(EVENTOS_ENTREGAVEL.length).toBe(
      EVENTOS_SEM_TRANSICAO.length + EVENTOS_DE_TRANSICAO.length,
    );
  });
});
