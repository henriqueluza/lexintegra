/**
 * ⚠️ TEXTO PENDENTE DE APROVACAO PELA CONTRATANTE ⚠️
 *
 * O plano de execucao, Etapa 11, secao "So voce", lista "aprovar o texto do termo
 * de aceite exigido antes do download" entre os itens que nao podem ser
 * delegados: e peca juridica, e o cliente e um escritorio de advocacia que
 * provavelmente quer redigi-la.
 *
 * O marcador sai LITERAL na tela, como o `{{TODO-TEXTO-PRIVACIDADE-JURIDICO}}` da
 * Etapa 6, e `termo.spec.ts` cai quando ele for substituido — para que a troca
 * seja um ato deliberado e leve junto a subida de `VERSAO_DO_TERMO` na API.
 *
 * O valor precisa ser o MESMO que a API usa (`apps/api/src/termos/termos.textos.ts`).
 * Nao vem de `packages/shared` porque texto de interface nao e contrato entre as
 * duas pontas — o que precisa casar e a VERSAO, que a API registra no aceite.
 */
export const TEXTO_TERMO_DOWNLOAD = '{{TODO-TEXTO-TERMO-DOWNLOAD}}';
