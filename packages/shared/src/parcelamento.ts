import { PARCELAS_MAXIMAS_NO_CARTAO } from './formas-de-pagamento.js';

/**
 * O parcelamento no cartao: a UNICA conta de parcela do sistema. O catalogo, o
 * carrinho e o checkout chamam esta funcao, e nenhum deles divide preco sozinho.
 *
 * CENTAVOS INTEIROS, NUNCA PONTO FLUTUANTE. `690,00 / 7` em reais daria uma
 * dizima, e o arredondamento de cada tela poderia sair diferente.
 *
 * O ARREDONDAMENTO E ESTE, e e regra, nao detalhe: todas as parcelas valem
 * `floor(total / n)`, e o resto da divisao (no maximo `n - 1` centavos) vai na
 * PRIMEIRA. A soma bate com o total cobrado centavo por centavo, e o teste
 * confere isso num laco de valores. O AbacatePay calcula as parcelas na pagina
 * hospedada; se o arredondamento de la for outro, a diferenca e de centavo e
 * fica registrada como pendencia de conferencia no sandbox.
 *
 * SEM JUROS NA CONTA. A funcao divide o total; nao sabe de taxa. Se o painel do
 * AbacatePay cobrar juros do cliente, a parcela exibida precisa ser a real e o
 * texto segue o CDC, art. 52 — e isso muda esta funcao, nao a tela.
 *
 * NAO PARCELAVEL vira uma parcela so: `parcelas <= 1`, preco zero ("sob
 * consulta") ou total menor que um centavo por parcela. Quem exibe usa
 * `parcelas === 1` para mostrar so o total, sem "1x de".
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: e lido pela home (ver `carrinho.ts`).
 */
export type Parcelamento = {
  /** Quantas parcelas; 1 quando nao ha parcelamento. */
  readonly parcelas: number;
  /** O valor de cada parcela a partir da segunda. */
  readonly parcelaCentavos: number;
  /** A primeira parcela, que leva o resto da divisao. */
  readonly primeiraParcelaCentavos: number;
  /** O total cobrado, igual a soma das parcelas. */
  readonly totalCentavos: number;
};

export function parcelar(
  totalCentavos: number,
  parcelas: number,
): Parcelamento {
  if (!Number.isInteger(totalCentavos) || totalCentavos < 0) {
    throw new RangeError(
      `Total invalido para parcelar: ${totalCentavos}. Use centavos inteiros.`,
    );
  }
  if (
    !Number.isInteger(parcelas) ||
    parcelas < 1 ||
    parcelas > PARCELAS_MAXIMAS_NO_CARTAO
  ) {
    throw new RangeError(
      `Parcelas invalidas: ${parcelas}. Aceitas de 1 a ${PARCELAS_MAXIMAS_NO_CARTAO}.`,
    );
  }

  /* Com `parcelas === 1`, o caminho geral ja devolve a vista: base = total. */
  const base = Math.floor(totalCentavos / parcelas);
  if (base < 1) {
    return {
      parcelas: 1,
      parcelaCentavos: totalCentavos,
      primeiraParcelaCentavos: totalCentavos,
      totalCentavos,
    };
  }

  return {
    parcelas,
    parcelaCentavos: base,
    primeiraParcelaCentavos: totalCentavos - base * (parcelas - 1),
    totalCentavos,
  };
}
