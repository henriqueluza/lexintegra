/**
 * Segredos de desenvolvimento, para o gateway falso. NAO SAO CREDENCIAIS: so
 * existem onde nao ha chave de API nenhuma (`modo.ts` so os escolhe nesse caso),
 * e servem para o arnes de teste e o `scripts/simular-webhook.mjs` assinarem
 * eventos que o processo local aceita.
 *
 * ARQUIVO SEM IMPORT NENHUM, e de proposito: o script roda com `node` puro, fora
 * do pacote da API, e le este `.ts` direto. Com um import de `@nestjs/common`
 * aqui, a resolucao falharia de fora de `apps/api` — e a alternativa, copiar os
 * valores no script, faria a primeira troca de um deles virar 401 sem motivo
 * aparente.
 */
export const SEGREDO_WEBHOOK_DESENVOLVIMENTO =
  'segredo-webhook-desenvolvimento';
export const CHAVE_HMAC_DESENVOLVIMENTO = 'chave-hmac-desenvolvimento';
