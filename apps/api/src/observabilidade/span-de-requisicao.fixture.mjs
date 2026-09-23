/**
 * Processo filho de `instrumentacao-http.spec.ts`: sobe a instrumentacao HTTP com
 * as opcoes de PRODUCAO, faz uma requisicao a um servidor local e imprime os
 * atributos do span de servidor em JSON.
 *
 * POR QUE UM PROCESSO A PARTE. A instrumentacao embrulha `node:http` pelo gancho
 * de `require` do OpenTelemetry, instalado no `Module` do Node. Dentro do Jest, o
 * modulo passa pelo registro do proprio Jest e o gancho nunca ve o `http`: nenhum
 * span nasce. Aqui a ordem e a de producao — instrumentacao primeiro, `http`
 * depois, por `require`, como o Express (CommonJS) faz atras do `--import`.
 *
 * `instrumentacao-http.ts` e lido pela remocao de tipos do proprio Node. O gancho
 * de resolucao abaixo existe so porque o fonte importa `./x.js` (nodenext) e o
 * arquivo em disco e `.ts` — o mesmo par que o `moduleNameMapper` do Jest resolve.
 *
 * Uso: node span-de-requisicao.fixture.mjs <caminho-com-query>
 */
import { createRequire, registerHooks } from 'node:module';
import process from 'node:process';

registerHooks({
  resolve(especificador, contexto, proximo) {
    try {
      return proximo(especificador, contexto);
    } catch (erro) {
      if (especificador.startsWith('.') && especificador.endsWith('.js')) {
        return proximo(`${especificador.slice(0, -3)}.ts`, contexto);
      }
      throw erro;
    }
  },
});

const { HttpInstrumentation } = await import(
  '@opentelemetry/instrumentation-http'
);
const { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } =
  await import('@opentelemetry/sdk-trace-node');
const { opcoesDaInstrumentacaoHttp } = await import('./instrumentacao-http.ts');

const caminho = process.argv[2];
const exportador = new InMemorySpanExporter();
const provedor = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exportador)],
});
provedor.register();
const instrumentacao = new HttpInstrumentation(opcoesDaInstrumentacaoHttp());
instrumentacao.setTracerProvider(provedor);
instrumentacao.enable();

const http = createRequire(import.meta.url)('node:http');
const servidor = http.createServer((_requisicao, resposta) => {
  resposta.statusCode = 401;
  resposta.end();
});
await new Promise((pronto) => servidor.listen(0, '127.0.0.1', pronto));
const { port } = servidor.address();

await new Promise((pronto, falhou) => {
  http
    .request(
      { host: '127.0.0.1', port, path: caminho, method: 'POST' },
      (resposta) => {
        resposta.resume();
        resposta.on('end', pronto);
      },
    )
    .on('error', falhou)
    .end('{}');
});
await new Promise((pronto) => servidor.close(pronto));
await provedor.forceFlush();

const servidores = exportador
  .getFinishedSpans()
  .filter((span) => span.kind === 1 /* SpanKind.SERVER */)
  .map((span) => span.attributes);
process.stdout.write(JSON.stringify(servidores));
