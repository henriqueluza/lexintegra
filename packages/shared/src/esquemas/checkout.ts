import { z } from 'zod';
import { TETO_ITENS_CARRINHO } from '../carrinho.js';
import { esquemaNovoPreCadastro } from './pre-cadastro.js';

/**
 * O contrato do checkout (Etapa 8, arquitetura 7.1).
 *
 * O NAVEGADOR MANDA IDS, NUNCA PRECOS. O que o carrinho guardou de nome e preco e
 * so para a tela; quem congela o valor e o servidor, lendo o catalogo no momento
 * do checkout (regra inviolavel 5). Um corpo com `precoCentavos` seria um convite
 * a editar o preco no DevTools.
 *
 * O COMPRADOR SAO DOIS CAMPOS. Nome e e-mail sao o que a conta precisa. CPF e
 * telefone ficam de fora: a documentacao do AbacatePay confirma que nem o PIX
 * transparente nem o checkout hospedado os exigem, e dado que ninguem vai usar
 * nao e coletado (arquitetura, secao 13).
 */

export const METODOS_PAGAMENTO = ['pix', 'cartao'] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];

export const esquemaNovoCheckout = z.object({
  itens: z
    .array(
      z.object({
        produtoId: z
          .string()
          .trim()
          .min(1, 'Item sem produto.')
          .max(128, 'Identificador de produto invalido.'),
      }),
    )
    .min(1, 'O carrinho esta vazio.')
    .max(TETO_ITENS_CARRINHO, 'O carrinho aceita ate 10 servicos por compra.'),

  metodo: z.enum(METODOS_PAGAMENTO, 'Escolha PIX ou cartao.'),

  /* As mesmas regras do pre-cadastro: um validador de nome e e-mail, e nao dois. */
  comprador: esquemaNovoPreCadastro.pick({ nome: true, email: true }),

  /**
   * A versao do texto que a pessoa viu. O servidor confere contra a versao
   * corrente: um aceite de texto antigo nao e aceite do texto que vale.
   */
  termosVersao: z.string().trim().min(1, 'Aceite os termos para continuar.'),

  /** Ver `CarrinhoService` no frontend. */
  chaveDoCarrinho: z.uuid('Carrinho invalido.'),
});

export type NovoCheckout = z.infer<typeof esquemaNovoCheckout>;

/**
 * O ciclo de vida da intencao de compra.
 *
 * - `aguardando_cobranca`: o documento existe e a cobranca ainda nao. A
 *   intencao nasce ANTES da cobranca (arquitetura 7.1), para o webhook nunca
 *   chegar antes do que ele confirma.
 * - `aguardando_pagamento`: o gateway emitiu a cobranca.
 * - `falhou_cobranca`: o gateway recusou ou nao respondeu; a pessoa tenta de novo.
 * - `substituido`: o mesmo carrinho mudou antes do pagamento, e um checkout novo
 *   tomou o lugar deste. Se a cobranca antiga for paga mesmo assim, o pagamento e
 *   honrado com os itens DELA.
 * - `pago`: confirmado pelo webhook.
 * - `expirado`: calculado na leitura, nunca gravado — nao ha rotina para isso.
 */
export const ESTADOS_CHECKOUT = [
  'aguardando_cobranca',
  'aguardando_pagamento',
  'falhou_cobranca',
  'substituido',
  'pago',
  'expirado',
] as const;

export type EstadoCheckout = (typeof ESTADOS_CHECKOUT)[number];

export type CobrancaPixExibida = {
  readonly brCode: string;
  readonly brCodeBase64: string;
  /** ISO 8601. */
  readonly expiraEm: string;
};

/**
 * A resposta do checkout. Uniao discriminada pelo metodo: o PIX traz o QR code
 * para a propria pagina mostrar (checkout transparente); o cartao traz a URL da
 * pagina do gateway, para onde a pessoa e levada (ADR-19).
 */
export type CheckoutIniciado =
  | {
      readonly checkoutId: string;
      readonly metodo: 'pix';
      readonly totalCentavos: number;
      readonly pix: CobrancaPixExibida;
    }
  | {
      readonly checkoutId: string;
      readonly metodo: 'cartao';
      readonly totalCentavos: number;
      readonly url: string;
    };

/** O que o polling da tela recebe. So o estado: nada de comprador, nada de itens. */
export type SituacaoCheckout = {
  readonly estado: EstadoCheckout;
};
