import { PARCELAS_MAXIMAS_NO_CARTAO } from './formas-de-pagamento.js';
import { parcelar } from './parcelamento.js';

/** Soma o que o cliente paga, parcela a parcela. */
function soma(resultado: ReturnType<typeof parcelar>): number {
  return (
    resultado.primeiraParcelaCentavos +
    resultado.parcelaCentavos * (resultado.parcelas - 1)
  );
}

describe('parcelar', () => {
  it('divide exato quando a conta fecha', () => {
    expect(parcelar(708_000, 12)).toEqual({
      parcelas: 12,
      parcelaCentavos: 59_000,
      primeiraParcelaCentavos: 59_000,
      totalCentavos: 708_000,
    });
  });

  it('poe o resto na primeira parcela quando a divisao nao fecha', () => {
    expect(parcelar(69_000, 7)).toEqual({
      parcelas: 7,
      parcelaCentavos: 9_857,
      primeiraParcelaCentavos: 9_858,
      totalCentavos: 69_000,
    });
    expect(parcelar(100, 3)).toEqual({
      parcelas: 3,
      parcelaCentavos: 33,
      primeiraParcelaCentavos: 34,
      totalCentavos: 100,
    });
  });

  it('o resto nunca passa de parcelas - 1 centavos', () => {
    const resultado = parcelar(1_199, 12);
    expect(resultado.primeiraParcelaCentavos - resultado.parcelaCentavos).toBe(
      11,
    );
  });

  it('a soma das parcelas bate com o total, centavo por centavo', () => {
    for (let total = 1; total <= 5_000; total += 7) {
      for (let n = 1; n <= PARCELAS_MAXIMAS_NO_CARTAO; n++) {
        const resultado = parcelar(total, n);
        expect(soma(resultado)).toBe(total);
        expect(resultado.totalCentavos).toBe(total);
      }
    }
    for (const total of [69_000, 129_000, 199_000, 225_000, 420_000, 708_000]) {
      for (let n = 1; n <= PARCELAS_MAXIMAS_NO_CARTAO; n++) {
        expect(soma(parcelar(total, n))).toBe(total);
      }
    }
  });

  it('uma parcela e a vista, sem "1x de"', () => {
    expect(parcelar(69_000, 1)).toEqual({
      parcelas: 1,
      parcelaCentavos: 69_000,
      primeiraParcelaCentavos: 69_000,
      totalCentavos: 69_000,
    });
  });

  it('nao parcela o que nao alcanca um centavo por parcela', () => {
    expect(parcelar(1, 2).parcelas).toBe(1);
    expect(parcelar(11, 12).parcelas).toBe(1);
    expect(parcelar(12, 12).parcelas).toBe(12);
  });

  it('nao parcela preco zero (produto "sob consulta")', () => {
    expect(parcelar(0, 12)).toEqual({
      parcelas: 1,
      parcelaCentavos: 0,
      primeiraParcelaCentavos: 0,
      totalCentavos: 0,
    });
  });

  it('recusa parcelas fora de 1 a 12 e valores que nao sao centavos inteiros', () => {
    expect(() => parcelar(1_000, 0)).toThrow(
      new RangeError('Parcelas invalidas: 0. Aceitas de 1 a 12.'),
    );
    expect(() => parcelar(1_000, PARCELAS_MAXIMAS_NO_CARTAO + 1)).toThrow(
      RangeError,
    );
    expect(() => parcelar(1_000, 2.5)).toThrow(RangeError);
    expect(() => parcelar(10.5, 2)).toThrow(
      new RangeError(
        'Total invalido para parcelar: 10.5. Use centavos inteiros.',
      ),
    );
    expect(() => parcelar(-1, 2)).toThrow(RangeError);
  });
});
