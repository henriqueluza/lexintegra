import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { type AuthClient, GoogleAuth } from 'google-auth-library';
import { amostrador, razaoDeAmostragem } from './amostragem.js';
import { opcoesDaInstrumentacaoHttp } from './instrumentacao-http.js';

/** O endpoint OTLP do Google (Telemetry API). Ver `cabecalhosAutenticados`. */
const DESTINO = 'https://telemetry.googleapis.com/v1/traces';

let cliente: AuthClient | undefined;

/**
 * Credencial do ambiente (ADC), renovada a cada exportacao.
 *
 * O token do Google expira em uma hora, e o exportador OTLP aceita callback
 * assincrono de cabecalho exatamente por isso. Fixar o token na criacao do
 * exportador faria o rastreio funcionar por sessenta minutos e parar depois,
 * silenciosamente — a instancia continuaria de pe, so sem trace nenhum.
 */
async function cabecalhosAutenticados(): Promise<Record<string, string>> {
  cliente ??= await new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  }).getClient();

  return Object.fromEntries((await cliente.getRequestHeaders()).entries());
}

/**
 * Rastreio para o Cloud Trace (arquitetura, secao 9).
 *
 * CARREGADO POR `--import`, ANTES DA APLICACAO. E por isso que este arquivo nao
 * e importado por nenhum modulo do Nest: a instrumentacao precisa embrulhar
 * `node:http` antes de o Express o carregar. O `Dockerfile` e o script `start`
 * passam o caminho; `main.ts` so o importa para conseguir encerrar o SDK (o
 * mesmo modulo, ja carregado, nao sobe duas vezes).
 *
 * `pnpm dev` NAO passa o `--import`, de proposito: sem projeto e sem razao de
 * amostragem o SDK nao sobe de todo jeito, e o caminho aponta para `dist/`, que
 * nao existe antes da primeira compilacao — o preco seria um
 * ERR_MODULE_NOT_FOUND que nao parece problema de telemetria.
 *
 * POR QUE NAO HA GANCHO DE ESM AQUI. `instrumentation-http` embrulha
 * `Server.prototype.emit` e `http.request`, e quem carrega `node:http` e o
 * Express 5, que e CommonJS — o gancho de `require` do proprio OpenTelemetry da
 * conta. O gancho de ESM (`import-in-the-middle`) roda com `internals: true`,
 * o que reescreve TODO modulo ESM do grafo a cada partida a frio, e este
 * servico sobe com `min-instances = 0`. Se algum dia faltar span de entrada,
 * este e o primeiro lugar a mexer — nao antes.
 *
 * `instrumentation-nestjs-core` NAO ENTRA: ela declara compatibilidade
 * `>=4 <12` e o projeto esta no Nest 12, entao o patch nunca se aplica.
 * Instala-la renderia zero span e uma dependencia a mais.
 */
function iniciar(): NodeSDK | undefined {
  const razao = razaoDeAmostragem();
  const projeto =
    process.env['GCP_PROJECT_ID'] ?? process.env['GCLOUD_PROJECT'];

  /*
   * Sem razao de amostragem ou sem projeto, NAO SOBE. E o que mantem
   * desenvolvimento e teste sem nenhuma tentativa de alcancar o Cloud Trace — e
   * tambem o que impede o processo de gastar memoria com exportador que nao tem
   * para onde exportar.
   */
  if (razao === 0 || projeto === undefined) return undefined;

  const sdk = new NodeSDK({
    sampler: amostrador(razao),
    /*
     * OTLP PARA A TELEMETRY API, e nao o exportador `@google-cloud/...`.
     *
     * O exportador especifico do Cloud Trace esta DEPRECIADO e sera arquivado
     * depois de 30/10/2026 — semanas depois desta etapa, e antes da entrega a um
     * terceiro (clausula 4.3). Entregar um componente morto seria transferir um
     * problema junto com o sistema. A Telemetry API e o caminho suportado, e o
     * destino final continua sendo o Cloud Trace.
     *
     * `gcp.project_id` e obrigatorio: e por ele que a Telemetry API sabe em que
     * projeto gravar. Sem ele a exportacao e recusada.
     */
    resource: resourceFromAttributes({
      'service.name': 'api-lexintegra',
      'gcp.project_id': projeto,
    }),
    resourceDetectors: [gcpDetector],
    traceExporter: new OTLPTraceExporter({
      url: DESTINO,
      headers: cabecalhosAutenticados,
    }),
    instrumentations: [
      // O health fica de fora e o `webhookSecret` sai redigido do `url.query`.
      new HttpInstrumentation(opcoesDaInstrumentacaoHttp()),
      new ExpressInstrumentation(),
      // O Resend fala por `fetch` global; o `gaxios` cai em `node-fetch`, que ja
      // e coberto pela instrumentacao de `http`.
      new UndiciInstrumentation(),
    ],
  });

  sdk.start();
  return sdk;
}

const sdk = iniciar();

/**
 * Descarrega os spans pendentes no desligamento.
 *
 * O `NodeSDK` NAO registra nada em `SIGTERM` — verificado no pacote, nao
 * suposto. E o Cloud Run da dez segundos nao configuraveis entre o sinal e o
 * fim do processo, entao quem nao descarregar aqui perde o ultimo trace de toda
 * instancia que escala para zero, que e a maioria delas.
 */
export async function encerrarRastreio(): Promise<void> {
  if (sdk === undefined) return;
  await sdk.shutdown();
}
