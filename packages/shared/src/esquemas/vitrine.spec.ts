import type { ProdutoResumo } from './produto.js';
import { paraVitrine } from './vitrine.js';

const PRODUTO: ProdutoResumo = {
  id: 'produto-1',
  nome: 'Parecer Juridico Trabalhista',
  descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: ['Reuna os contratos vigentes.'],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 7,
  numeroRevisoesPermitidas: 2,
  ativo: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-02-01T00:00:00.000Z',
};

describe('paraVitrine', () => {
  it('leva os campos que a vitrine mostra', () => {
    expect(paraVitrine(PRODUTO)).toEqual({
      id: 'produto-1',
      nome: 'Parecer Juridico Trabalhista',
      descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
      precoCentavos: 250_000,
      entregaveis: ['Parecer em PDF'],
      quantidadeReunioes: 2,
      numeroRevisoesPermitidas: 2,
    });
  });

  /**
   * O destino disto e uma rota publica, alcancavel por quem so preencheu um
   * formulario. `prazoValidadeReunioesDias` e `intervaloMinimoReunioesDias` sao
   * parametros comerciais que o administrador ajusta; os carimbos dizem quando o
   * escritorio mexeu no catalogo. Nada disso e assunto de visitante — e um spread
   * levaria os cinco de graca.
   */
  it.each([
    'textosOrientativos',
    'prazoValidadeReunioesDias',
    'intervaloMinimoReunioesDias',
    'ativo',
    'criadoEm',
    'atualizadoEm',
  ])('nao vaza %s', (campo) => {
    expect(Object.keys(paraVitrine(PRODUTO))).not.toContain(campo);
  });

  /**
   * Copia a lista em vez de compartilhar a referencia: quem receber isto nao deve
   * conseguir alterar o produto de origem por acidente.
   */
  it('copia a lista de entregaveis', () => {
    const vitrine = paraVitrine(PRODUTO);
    expect(vitrine.entregaveis).not.toBe(PRODUTO.entregaveis);
  });
});
