/**
 * A fronteira entre o que o administrador digita e o que a API recebe.
 *
 * O formulario aceita reais porque ninguem digita "320000" pensando em
 * R$ 3.200,00. A API recebe centavos porque `precoCentavos` e inteiro e o
 * snapshot do pedido o congela para sempre. A conversao entre os dois e o lugar
 * classico do erro de fator cem, entao ela mora aqui, sozinha e com teste.
 *
 * SEM ARITMETICA DE PONTO FLUTUANTE. `Math.round(32.2 * 100)` da 3220, mas
 * `Math.round(1.005 * 100)` da 100 e nao 101 — o binario nao representa 1.005.
 * Um centavo perdido num preco e um centavo perdido em todo pedido daquele
 * produto, para sempre. Aqui os inteiros e os decimais sao separados como TEXTO e
 * so depois viram numero.
 */

/** `null` quando o texto nao e um preco valido — o chamador decide a mensagem. */
export function paraCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$|\s/g, '').trim();
  if (limpo === '') return null;

  // Aceita as duas convencoes: "1.234,56" (pt-BR) e "1234.56". A virgula, quando
  // existe, e o separador decimal, e os pontos sao de milhar.
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;

  const [inteiros, decimais = ''] = normalizado.split('.');
  return Number(inteiros) * 100 + Number(decimais.padEnd(2, '0'));
}

export function paraReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** Para preencher o formulario ao editar: centavos viram "3200,00", sem simbolo. */
export function paraCampoDePreco(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/**
 * `null` para qualquer coisa que nao seja inteiro nao negativo. Recusa "2.5" e
 * "-1" em vez de arredondar em silencio: quantidade de reuniao e saldo de revisao
 * sao contagens, e um valor fracionado aqui significa que a pessoa entendeu o
 * campo errado — arredondar esconderia isso.
 */
export function paraInteiro(texto: string): number | null {
  const limpo = texto.trim();
  return /^\d+$/.test(limpo) ? Number(limpo) : null;
}
