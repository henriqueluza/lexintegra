/**
 * Os entregaveis de um produto como o catalogo os mostra (07/10/2026).
 *
 * No produto, cada unidade e um entregavel proprio — "Contrato personalizado
 * (1 de 24)" ate "(24 de 24)" —, porque no pedido cada uma tem maquina de
 * estados e e entregue a parte. Na vitrine, vinte e quatro linhas iguais so
 * empurram o preco para fora da tela. Aqui elas viram uma linha com a
 * quantidade.
 *
 * So para EXIBIR o produto. O cartao do pedido e a lista do advogado continuam
 * um item por entregavel, que e onde a unidade tem estado.
 */

export interface EntregavelAgrupado {
  readonly nome: string;
  readonly quantidade: number;
}

/* O sufixo que o cadastro do catalogo acrescenta a cada unidade. */
const SUFIXO_DE_UNIDADE = /^(.+?) \((\d+) de (\d+)\)$/;

/**
 * Agrupa pelo nome sem o sufixo "(N de Total)", e tambem nomes identicos
 * repetidos. A ordem e a da primeira aparicao de cada nome.
 */
export function agruparEntregaveis(
  entregaveis: readonly string[],
): EntregavelAgrupado[] {
  const contagem = new Map<string, number>();
  for (const entregavel of entregaveis) {
    const nome = SUFIXO_DE_UNIDADE.exec(entregavel)?.[1] ?? entregavel;
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  return [...contagem].map(([nome, quantidade]) => ({ nome, quantidade }));
}

/** "Contrato personalizado 24×"; com uma unidade, so o nome. */
export function rotuloDoEntregavel({
  nome,
  quantidade,
}: EntregavelAgrupado): string {
  return quantidade > 1 ? `${nome} ${String(quantidade)}×` : nome;
}
