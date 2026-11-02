import { descreverPreco } from './parcela';

/** `toLocaleString` separa "R$" do numero com espaco nao separavel. */
const normalizar = (texto: string): string => texto.replace(/\s/g, ' ');

describe('descreverPreco', () => {
  it('poe a parcela em destaque e o total embaixo', () => {
    const preco = descreverPreco(708_000, 12);
    expect(normalizar(preco.destaque)).toBe('12x de R$ 590,00');
    expect(normalizar(preco.total)).toBe('ou R$ 7.080,00 à vista');
  });

  it('mostra so o total, sem "1x de", quando nao ha parcelamento', () => {
    const preco = descreverPreco(69_000, 1);
    expect(normalizar(preco.destaque)).toBe('R$ 690,00');
    expect(preco.total).toBe('');
  });

  it('diz a primeira parcela quando a divisao nao fecha', () => {
    const preco = descreverPreco(180_000, 7);
    expect(normalizar(preco.destaque)).toBe('7x de R$ 257,14');
    expect(normalizar(preco.total)).toBe(
      'ou R$ 1.800,00 à vista · 1ª parcela R$ 257,16',
    );
  });

  it('nao parcela o que nao chega a um centavo por parcela', () => {
    const preco = descreverPreco(5, 12);
    expect(normalizar(preco.destaque)).toBe('R$ 0,05');
    expect(preco.total).toBe('');
  });
});
