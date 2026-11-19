/**
 * O tipo de cobranca do produto (lote de novembro de 2026, ajustes 9 e 11).
 *
 * `assinatura` sao os planos; `avulso`, os servicos comprados um a um. O NOME
 * NAO SIGNIFICA COBRANCA RECORRENTE: todo produto e compra unica, cobrada de uma
 * vez (os eventos `subscription.*` do gateway continuam sendo descartados). O
 * que o tipo decide e UMA coisa so, o PARCELAMENTO: so assinatura parcela no
 * cartao. Avulso e sempre a vista, na tela e no pedido que vai ao gateway.
 *
 * A REUNIAO NAO SEGUE O TIPO (decisao de 18/11/2026). A regra pedida era
 * "reuniao so em assinatura", e o catalogo tem a "Reuniao avulsa estrategica",
 * um avulso que existe para dar uma reuniao. Ficou como excecao: quem diz se o
 * pedido tem reuniao e a quantidade congelada no snapshot (`ofereceReunioes`),
 * e o formulario do administrador so mostra os campos de reuniao de um avulso
 * quando ele marca que o servico inclui reuniao.
 *
 * LEGADO. Produto e pedido gravados antes deste campo nao o tem, e NENHUM pedido
 * e reescrito (regra inviolavel 5). `tipoCobrancaDe` devolve `null` para eles, e
 * `null` se comporta como antes do campo existir: anuncia as parcelas gravadas e
 * honra o saldo de reunioes do snapshot.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: e lido pelo catalogo e pelo carrinho, que a home
 * alcanca (ver `carrinho.ts`).
 */
export const TIPOS_COBRANCA = ['assinatura', 'avulso'] as const;

export type TipoCobranca = (typeof TIPOS_COBRANCA)[number];

/** O nome que a tela escreve, num lugar so. */
export const ROTULO_DO_TIPO_COBRANCA: Readonly<Record<TipoCobranca, string>> = {
  assinatura: 'Assinatura',
  avulso: 'Serviço avulso',
};

/*
 * Os limites da descricao detalhada (ajuste 1). Ficam aqui, e nao no schema,
 * para o formulario mostrar o contador sem importar zod.
 *
 * Vinte de minimo: menos que isso nao detalha nada, e o campo e o que o cliente
 * abre para decidir a compra. Cinco mil de teto: cabe uma pagina de texto, e o
 * pior carrinho (dez produtos no teto) continua longe do limite de 1 MiB do
 * documento do checkout (`compra-maxima.integration-spec.ts`).
 */
export const MINIMO_DESCRICAO_DETALHADA = 20;
export const TETO_DESCRICAO_DETALHADA = 5000;

function ehTipoCobranca(valor: unknown): valor is TipoCobranca {
  return (TIPOS_COBRANCA as readonly unknown[]).includes(valor);
}

/**
 * O tipo como esta gravado, ou `null` quando o documento e anterior ao campo.
 *
 * Valor desconhecido tambem vira `null`, e nao erro: quem le um pedido antigo
 * nao pode cair por causa de um campo que ele nunca teve.
 */
export function tipoCobrancaDe(origem: {
  readonly tipoCobranca?: unknown;
}): TipoCobranca | null {
  return ehTipoCobranca(origem.tipoCobranca) ? origem.tipoCobranca : null;
}

/** A descricao detalhada como esta gravada; vazia nos documentos antigos. */
export function descricaoDetalhadaDe(origem: {
  readonly descricaoDetalhada?: unknown;
}): string {
  return typeof origem.descricaoDetalhada === 'string'
    ? origem.descricaoDetalhada
    : '';
}

/** O que basta de um produto, de um item do carrinho ou de um snapshot. */
export type ComParcelamento = {
  readonly tipoCobranca?: TipoCobranca | null;
  readonly parcelas?: number;
};

/**
 * Em quantas vezes o site anuncia ESTE produto, e o teto que vai ao gateway.
 *
 * Avulso e 1, sempre, mesmo que o documento traga outro numero: o schema do
 * cadastro recusa avulso parcelado, mas um documento antigo editado por fora
 * nao pode virar parcela anunciada. Numero invalido tambem cai em 1.
 */
export function parcelasAnunciadas(produto: ComParcelamento): number {
  if (produto.tipoCobranca === 'avulso') return 1;

  const parcelas = produto.parcelas ?? 1;
  return Number.isInteger(parcelas) && parcelas >= 1 ? parcelas : 1;
}

/**
 * As parcelas de UMA cobranca com varios itens: o menor numero entre eles.
 *
 * O gateway aceita um limite so por cobranca (`card.maxInstallments`), entao nao
 * existe "parcelar so a assinatura". Com um avulso no carrinho o minimo e 1, e a
 * compra inteira vai a vista (decisao de 18/11/2026). Carrinho vazio e 1.
 */
export function parcelasDoCarrinho(itens: readonly ComParcelamento[]): number {
  return itens.reduce(
    (menor, item) => Math.min(menor, parcelasAnunciadas(item)),
    itens.length === 0 ? 1 : Number.POSITIVE_INFINITY,
  );
}

/**
 * O carrinho perdeu o parcelamento por causa de um avulso?
 *
 * E o que decide o aviso do carrinho: so faz sentido dizer "compre a assinatura
 * separada para parcelar" quando ha um avulso E um item que, sozinho, parcelaria.
 */
export function avulsoImpedeParcelamento(
  itens: readonly ComParcelamento[],
): boolean {
  return (
    itens.some((item) => item.tipoCobranca === 'avulso') &&
    itens.some((item) => parcelasAnunciadas(item) > 1)
  );
}

/**
 * O pedido (ou o produto) tem reuniao?
 *
 * A quantidade manda, e nao o tipo: ver a nota do topo. E o que decide se o
 * bloco de reunioes aparece no pedido do cliente.
 */
export function ofereceReunioes(origem: {
  readonly quantidadeReunioes: number;
}): boolean {
  return origem.quantidadeReunioes > 0;
}
