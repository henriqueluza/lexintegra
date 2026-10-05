import { SECOES_TERMOS } from './documentos-legais.js';
import { RESUMO_REGRA_ESTORNO } from './regra-estorno.js';

/**
 * Os termos aceitos no checkout (B2, decisoes.md 1.2). A versão sobe a cada
 * mudança de texto: o servidor só aceita a corrente, e o aceite de uma versão
 * anterior continua registrado com o texto que valia (`checkout-v3-2026-10`
 * e antes). A v4 (05/10/2026) só corrige a frase das respostas aos e-mails
 * automáticos, que desde 01/10 chegam ao atendimento pelo reply-to. A regra de estorno vem de `regra-estorno.ts`, a mesma dos termos de
 * uso e da confirmação de cancelamento.
 */
export const VERSAO_TERMOS_CHECKOUT = 'checkout-v4-2026-10';
export const TEXTO_TERMOS_CHECKOUT = SECOES_TERMOS.map(
  (secao) => secao.titulo + '. ' + secao.texto,
).join('\n\n');
export const RESUMO_TERMOS_CHECKOUT = `Confira o escopo e as condições de cada serviço antes de pagar. ${RESUMO_REGRA_ESTORNO}`;
