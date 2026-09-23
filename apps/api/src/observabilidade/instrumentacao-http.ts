import type { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import { PARAMETRO_SEGREDO_WEBHOOK } from '../pagamentos/webhook/assinatura.js';

/**
 * A lista padrao de `instrumentation-http` (0.222), COPIADA.
 *
 * Definir `redactedQueryParamsServer` SUBSTITUI a lista padrao, e ela nao e
 * exportada pelo pacote (`build/src/internal-types.js`). Nenhum destes nomes chega
 * de verdade a esta API — sao assinaturas de URL do S3 e do GCS —, mas perde-los
 * por acidente, ao acrescentar o nosso, seria afrouxar o que a biblioteca ja fazia.
 */
const REDIGIDOS_PELA_BIBLIOTECA = [
  'sig',
  'Signature',
  'AWSAccessKeyId',
  'X-Goog-Signature',
  'X-Amz-Signature',
  'X-Amz-Credential',
  'X-Amz-Security-Token',
] as const;

/**
 * Parametros de query cujo VALOR nao pode ir para o Cloud Trace.
 *
 * O span de servidor grava `url.query` (convencao estavel), e o `webhookSecret`
 * que o AbacatePay poe na URL e a credencial que autentica o webhook (ver
 * `pagamentos/webhook/assinatura.ts`). Sem esta lista, todo webhook amostrado
 * mandava o segredo em texto puro para o trace (Bloco B, regra inviolavel 9).
 *
 * A redacao e POR NOME, e sensivel a caixa. Um `?WebhookSecret=` nao seria
 * redigido — mas tambem nao autenticaria nada, porque o guard so le este nome.
 */
export const PARAMETROS_REDIGIDOS = [
  ...REDIGIDOS_PELA_BIBLIOTECA,
  PARAMETRO_SEGREDO_WEBHOOK,
] as const;

/**
 * As opcoes do `HttpInstrumentation`, fora de `instrumentacao.ts` para poderem
 * ser testadas: aquele arquivo sobe o SDK no import, e este nao tem efeito
 * nenhum (`instrumentacao-http.spec.ts`).
 */
export function opcoesDaInstrumentacaoHttp(): HttpInstrumentationConfig {
  return {
    /*
     * `ignoreIncomingRequestHook` tira do trace o que e ruido puro: o health do
     * Cloud Run e o uptime check batem nele a cada poucos segundos, e cada um
     * viraria um trace identico ao anterior.
     */
    ignoreIncomingRequestHook: (requisicao) =>
      (requisicao.url ?? '').startsWith('/api/health'),
    redactedQueryParamsServer: [...PARAMETROS_REDIGIDOS],
  };
}
