import {
  AVISO_AVULSO_SEM_PARCELAMENTO,
  descreverCondicaoNoCartao,
  descreverPreco,
} from './parcela';

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

describe('descreverCondicaoNoCartao', () => {
  it('anuncia a parcela do carrinho', () => {
    expect(normalizar(descreverCondicaoNoCartao(708_000, 12))).toBe(
      'ou em até 12x de R$ 590,00 no cartão',
    );
  });

  it('diz a primeira parcela quando a divisao nao fecha', () => {
    expect(normalizar(descreverCondicaoNoCartao(180_000, 7))).toBe(
      'ou em até 7x de R$ 257,14 no cartão (1ª parcela R$ 257,16)',
    );
  });

  /** Compra a vista (avulso no carrinho, item de 1x): nada a anunciar. */
  it('e vazia quando a compra nao parcela', () => {
    expect(descreverCondicaoNoCartao(69_000, 1)).toBe('');
    expect(descreverCondicaoNoCartao(0, 12)).toBe('');
  });

  it('o aviso do carrinho misto diz o que acontece e o que fazer', () => {
    expect(AVISO_AVULSO_SEM_PARCELAMENTO).toMatch(/à vista/u);
    expect(AVISO_AVULSO_SEM_PARCELAMENTO).toMatch(/compra separada/u);
  });
});
