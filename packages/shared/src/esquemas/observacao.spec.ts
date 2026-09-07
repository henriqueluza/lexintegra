import { esquemaNovaObservacao } from './observacao.js';

describe('esquemaNovaObservacao', () => {
  it('apara o texto antes de medir', () => {
    const resultado = esquemaNovaObservacao.safeParse({
      texto: '  preciso incluir o socio novo  ',
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data?.texto).toBe('preciso incluir o socio novo');
  });

  it('recusa texto so de espaco', () => {
    expect(esquemaNovaObservacao.safeParse({ texto: '     ' }).success).toBe(
      false,
    );
  });

  it('recusa acima de 4000 caracteres', () => {
    expect(
      esquemaNovaObservacao.safeParse({ texto: 'a'.repeat(4001) }).success,
    ).toBe(false);
    expect(
      esquemaNovaObservacao.safeParse({ texto: 'a'.repeat(4000) }).success,
    ).toBe(true);
  });
});
