/**
 * Do arquivo de dados ao corpo que a API aceita.
 *
 * Funcoes puras, sem zod e sem rede: quem valida e `esquemaNovoProduto`, no
 * script e na API, e quem grava e `ProdutosService`, atras de
 * `POST /api/admin/produtos`. Aqui so se monta o corpo.
 */

/** Um item do pacote como o escritorio o descreve: "Contrato personalizado x6". */
export interface ItemDeEntregavel {
  readonly nome: string;
  readonly quantidade: number;
}

/**
 * O produto como fica no arquivo de dados. `slug` e chave legivel do arquivo e
 * NAO vai para a API: o modelo nao tem esse campo. O script reconhece um produto
 * ja cadastrado pelo nome.
 */
export interface ProdutoInicial {
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly entregaveis: readonly ItemDeEntregavel[];
  readonly textosOrientativos: readonly string[];
  readonly quantidadeReunioes: number;
  readonly prazoValidadeReunioesDias: number;
  readonly intervaloMinimoReunioesDias: number;
  readonly numeroRevisoesPermitidas: number;
}

/** O corpo de `POST /api/admin/produtos` (`NovoProduto`, de `shared`). */
export interface CorpoDoProduto {
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly entregaveis: readonly string[];
  readonly textosOrientativos: readonly string[];
  readonly quantidadeReunioes: number;
  readonly prazoValidadeReunioesDias: number;
  readonly intervaloMinimoReunioesDias: number;
  readonly numeroRevisoesPermitidas: number;
}

/**
 * Um entregavel por unidade. Cada um vira um documento com maquina de estados
 * propria no pedido, entao "Contrato personalizado x6" sao seis entregas que o
 * advogado envia e o cliente confirma uma a uma.
 *
 * Com quantidade 1 o nome fica como esta; acima disso, cada copia ganha
 * "(N de Total)", para o cliente e o advogado saberem qual e qual.
 */
export function expandirEntregaveis(
  itens: readonly ItemDeEntregavel[],
): string[] {
  return itens.flatMap(({ nome, quantidade }) => {
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      throw new Error(
        `Quantidade invalida para "${nome}": ${String(quantidade)}. Use um inteiro maior que zero.`,
      );
    }
    if (quantidade === 1) return [nome];
    return Array.from(
      { length: quantidade },
      (_, indice) => `${nome} (${String(indice + 1)} de ${String(quantidade)})`,
    );
  });
}

export function paraCorpo(produto: ProdutoInicial): CorpoDoProduto {
  return {
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    entregaveis: expandirEntregaveis(produto.entregaveis),
    textosOrientativos: [...produto.textosOrientativos],
    quantidadeReunioes: produto.quantidadeReunioes,
    prazoValidadeReunioesDias: produto.prazoValidadeReunioesDias,
    intervaloMinimoReunioesDias: produto.intervaloMinimoReunioesDias,
    numeroRevisoesPermitidas: produto.numeroRevisoesPermitidas,
  };
}
