import {
  ESTADOS_ENTREGAVEL,
  EstadoEntregavel,
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
