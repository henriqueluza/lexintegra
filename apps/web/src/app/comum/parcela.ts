import { parcelar } from 'shared/parcelamento';
import { paraReais } from './moeda';

/**
 * O texto do preco no cartao: a parcela em destaque e o total a vista, menor,
 * embaixo.
 *
 * A CONTA NAO E FEITA AQUI. Quem divide e `parcelar`, em `shared`, a mesma
 * funcao para o catalogo e o checkout; isto so escreve o resultado.
 *
 * Produto nao parcelavel mostra so o total, sem "1x de". Quando a divisao nao
 * fecha, o resto vai na primeira parcela, e o texto diz isso — mostrar "3x de"
 * com o valor da segunda parcela esconderia um centavo da primeira.
 *
 * Sem "sem juros": nada no codigo prova que o painel do AbacatePay nao cobra
 * juros do cliente. Ver o comentario de `parcelar`.
 */
export type PrecoExibido = {
  /** "12x de R$ 590,00", ou o total quando nao ha parcelamento. */
  readonly destaque: string;
  /** "ou R$ 7.080,00 à vista"; vazio quando o destaque ja e o total. */
  readonly total: string;
};

export function descreverPreco(
  totalCentavos: number,
  parcelas: number,
): PrecoExibido {
  const conta = parcelar(totalCentavos, parcelas);
  if (conta.parcelas === 1) {
    return { destaque: paraReais(conta.totalCentavos), total: '' };
  }

  const destaque = `${conta.parcelas}x de ${paraReais(conta.parcelaCentavos)}`;
  const total = `ou ${paraReais(conta.totalCentavos)} à vista`;
  if (conta.primeiraParcelaCentavos === conta.parcelaCentavos) {
    return { destaque, total };
  }
  return {
    destaque,
    total: `${total} · 1ª parcela ${paraReais(conta.primeiraParcelaCentavos)}`,
  };
}
