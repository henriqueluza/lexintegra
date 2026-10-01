import { esquemaResultadoContestacao } from './contestacao.js';

describe('esquemaResultadoContestacao', () => {
  it.each(['ganha', 'perdida'] as const)('aceita %s com nota', (resultado) => {
    expect(
      esquemaResultadoContestacao.parse({ resultado, nota: '  Caso 123.  ' }),
    ).toEqual({ resultado, nota: 'Caso 123.' });
  });

  it.each([
    ['sem nota', { resultado: 'ganha' }],
    ['nota curta', { resultado: 'ganha', nota: ' a ' }],
    ['nota longa', { resultado: 'ganha', nota: 'x'.repeat(1001) }],
    ['resultado inventado', { resultado: 'empate', nota: 'Caso 123.' }],
    ['aberta nao e resultado', { resultado: 'aberta', nota: 'Caso 123.' }],
  ])('recusa %s', (_caso, corpo) => {
    expect(esquemaResultadoContestacao.safeParse(corpo).success).toBe(false);
  });
});
