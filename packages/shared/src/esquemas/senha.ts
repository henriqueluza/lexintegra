import { z } from 'zod';

/**
 * Pedido de redefinicao de senha (ADR-07).
 *
 * So o e-mail. Nenhum campo que permita ao cliente influenciar o destino do link
 * — nem `redirecionarPara`, nem `continueUrl`. Um parametro de redirecionamento
 * controlado pelo cliente num e-mail de recuperacao de senha e a receita classica
 * de redirecionamento aberto: o link chega legitimo, com o dominio certo, e leva
 * a pagina do atacante. A URL de destino e montada no servidor, a partir de
 * configuracao.
 */
export const esquemaPedidoRedefinicao = z.object({
  email: z.email('Informe um e-mail valido.').max(254).toLowerCase(),
});

export type PedidoRedefinicao = z.infer<typeof esquemaPedidoRedefinicao>;
