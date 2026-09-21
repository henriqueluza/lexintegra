import { SECOES_TERMOS } from './documentos-legais.js';
/** Minuta operacional redigida no redesign. Revisão jurídica antes de produção. */
export const VERSAO_TERMOS_CHECKOUT = 'checkout-v2-minuta-2026-09';
export const TEXTO_TERMOS_CHECKOUT = SECOES_TERMOS.map(
  (secao) => secao.titulo + '. ' + secao.texto,
).join('\n\n');
export const RESUMO_TERMOS_CHECKOUT =
  'Confira o escopo e as condições de cada serviço. No fluxo da plataforma, o estorno é solicitado antes de o pedido começar a ser elaborado. Os direitos legais aplicáveis são preservados.';
