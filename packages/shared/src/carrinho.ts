/**
 * O carrinho (Etapa 8, arquitetura 5.2): varios produtos, uma cobranca.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD, pela mesma razao de `telefone.ts`. O carrinho
 * vive na home, que e a pagina de captacao, e o chunk dela nao pode carregar os
 * locales do zod. O schema do servidor (`esquemas/checkout.ts`) reusa o teto e a
 * ordenacao daqui — a regra continua num lugar so.
 *
 * O MESMO PRODUTO PODE ENTRAR MAIS DE UMA VEZ. Pedidos do mesmo produto sao
 * independentes (arquitetura 5.4): cada um tem saldo de reunioes, janela de
 * validade e intervalo minimo proprios. Dois itens iguais sao dois pedidos, e
 * nao um pedido com "quantidade 2" — por isso nao existe campo de quantidade.
 */

/**
 * Teto de itens por carrinho.
 *
 * Nao e limite comercial, e limite de TRANSACAO: a confirmacao do pagamento cria
 * todos os pedidos, com seus entregaveis e trilhas, num commit so (arquitetura
 * 5.2), e o Firestore aceita 500 escritas por transacao. Dez itens com o maior
 * catalogo plausivel ficam longe disso; um carrinho sem teto nao fica.
 */
export const TETO_ITENS_CARRINHO = 10;

export type ItemCarrinho = {
  readonly produtoId: string;
};

/**
 * A forma canonica dos itens: ordenados por id.
 *
 * E o que torna o hash do carrinho deterministico. "Parecer + Contrato" e
 * "Contrato + Parecer" sao a mesma compra, e se produzissem hashes diferentes a
 * retentativa do mesmo carrinho abriria uma segunda cobranca em vez de devolver
 * a primeira.
 */
export function ordenarItens(
  itens: readonly ItemCarrinho[],
): readonly ItemCarrinho[] {
  return [...itens].sort((a, b) =>
    a.produtoId < b.produtoId ? -1 : a.produtoId > b.produtoId ? 1 : 0,
  );
}
