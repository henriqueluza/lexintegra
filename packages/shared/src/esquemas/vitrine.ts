import { parcelasAnunciadas, type TipoCobranca } from '../tipo-cobranca.js';
import type { ProdutoResumo } from './produto.js';

/**
 * O que a vitrine publica mostra de um produto.
 *
 * DELIBERADAMENTE MENOR QUE `ProdutoResumo`. A listagem administrativa carrega
 * `ativo`, `criadoEm`, `atualizadoEm`, `prazoValidadeReunioesDias` e
 * `intervaloMinimoReunioesDias` porque o administrador decide com eles; a vitrine
 * nao. Devolver o documento inteiro numa rota publica seria entregar o calendario
 * comercial do escritorio a quem so preencheu um formulario — e a rota nem tem
 * usuario autenticado para responsabilizar.
 *
 * Sem zod: e contrato de resposta, e o servidor e quem monta. O unico import e
 * `tipo-cobranca.ts`, que tambem nao tem zod. Isso o torna importavel de
 * qualquer lugar do frontend sem custo de pacote.
 */
export type ProdutoVitrine = {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly entregaveis: readonly string[];
  readonly quantidadeReunioes: number;
  readonly numeroRevisoesPermitidas: number;
  /**
   * Publico por decisao de 01/11/2026: o catalogo anuncia a parcela. Desde
   * novembro sai ja como `parcelasAnunciadas`: avulso e sempre 1.
   */
  readonly parcelas: number;
  /** `null` no produto ainda nao classificado: a tela o trata como antes. */
  readonly tipoCobranca: TipoCobranca | null;
  /**
   * O que o botao "+" do card abre (ajuste 1). Vem NESTE payload, e nao numa
   * segunda chamada: o texto ja esta no card quando o cliente expande.
   */
  readonly descricaoDetalhada: string;
};

/**
 * O UNICO lugar que sabe o que a vitrine publica mostra de um produto.
 *
 * Campo a campo e explicito, nao um spread, pela mesma razao de
 * `congelarProduto`: um spread copiaria `ativo`, os carimbos, `criadoPor` e
 * qualquer campo interno que o documento venha a ganhar — e aqui o destino nao e
 * um pedido, e uma rota que responde a quem so preencheu um formulario. Um campo
 * novo no produto fica de fora ate alguem decidir o contrario, que e o padrao
 * certo para uma superficie publica.
 */
export function paraVitrine(produto: ProdutoResumo): ProdutoVitrine {
  return {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    entregaveis: [...produto.entregaveis],
    quantidadeReunioes: produto.quantidadeReunioes,
    numeroRevisoesPermitidas: produto.numeroRevisoesPermitidas,
    parcelas: parcelasAnunciadas(produto),
    tipoCobranca: produto.tipoCobranca,
    descricaoDetalhada: produto.descricaoDetalhada,
  };
}
