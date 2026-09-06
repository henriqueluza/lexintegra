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
 * Sem zod, sem import nenhum: e contrato de resposta, e o servidor e quem monta.
 * Isso tambem o torna importavel de qualquer lugar do frontend sem custo de
 * pacote.
 */
export type ProdutoVitrine = {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly entregaveis: readonly string[];
  readonly quantidadeReunioes: number;
  readonly numeroRevisoesPermitidas: number;
};
