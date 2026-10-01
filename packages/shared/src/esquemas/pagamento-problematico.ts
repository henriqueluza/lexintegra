import { z } from 'zod';

/**
 * Os pagamentos que chegaram sem virar pedido (B2, decisoes.md 4.2): houve
 * dinheiro, e a plataforma nao criou nada. O webhook ja registra cada um com a
 * situacao e dispara alerta critico; esta e a lista que o dono acompanha.
 *
 * - `orfao`: nao havia checkout com aquele id (a TTL apagou, ou e desconhecido);
 * - `divergente`: o valor pago nao e o total congelado no checkout;
 * - `conflito_de_conta`: o e-mail do comprador ja e advogado ou administrador.
 *
 * A CORRECAO NAO E AQUI. Devolver dinheiro ou associar o pagamento a um pedido
 * se faz no painel do AbacatePay, pelos runbooks; a tela so marca o caso como
 * resolvido, com nota obrigatoria e linha na auditoria.
 */
export const TIPOS_PAGAMENTO_PROBLEMATICO = [
  'orfao',
  'divergente',
  'conflito_de_conta',
] as const;

export type TipoPagamentoProblematico =
  (typeof TIPOS_PAGAMENTO_PROBLEMATICO)[number];

export const SITUACOES_DO_PROBLEMA = ['aberto', 'resolvido'] as const;

export type SituacaoDoProblema = (typeof SITUACOES_DO_PROBLEMA)[number];

export const esquemaFiltroPagamentos = z.object({
  tipo: z.enum(TIPOS_PAGAMENTO_PROBLEMATICO).optional(),
  situacao: z.enum(SITUACOES_DO_PROBLEMA).default('aberto'),
});

export type FiltroPagamentos = z.infer<typeof esquemaFiltroPagamentos>;

export const esquemaResolucaoPagamento = z.object({
  nota: z
    .string()
    .trim()
    .min(3, 'Escreva o que foi feito (devolução, associação, contato).')
    .max(1000, 'A nota pode ter no maximo 1000 caracteres.'),
});

export type NovaResolucaoPagamento = z.infer<typeof esquemaResolucaoPagamento>;

/**
 * `type` e nao `interface`: vai para `app-tabela` (ver `EntregaResumo`).
 *
 * O COMPRADOR SO VEM ENQUANTO O CHECKOUT EXISTE. O pagamento guarda so ids e
 * valor (minimizacao, arquitetura 5.1); nome, e-mail e produtos sao lidos do
 * checkout, que a TTL apaga 48 horas depois do vencimento. No `orfao` ele nunca
 * existiu, e o caminho e o id da cobranca no painel do AbacatePay.
 */
export type PagamentoProblematico = {
  readonly cobrancaId: string;
  readonly tipo: TipoPagamentoProblematico;
  readonly valorCentavos: number;
  readonly origem: string;
  readonly registradoEm: string | null;
  readonly checkoutId: string;
  readonly comprador: { readonly nome: string; readonly email: string } | null;
  readonly produtos: readonly string[];
  readonly totalDoCheckoutCentavos: number | null;
  readonly resolucao: {
    readonly em: string | null;
    readonly por: string;
    readonly nota: string;
  } | null;
};
