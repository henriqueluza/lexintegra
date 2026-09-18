import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  type Sampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';

/**
 * Quanto do trafego vira trace, por variavel de ambiente.
 *
 * A arquitetura (secao 9) pede isto explicitamente: as cotas gratuitas do Cloud
 * Trace sao generosas, nao infinitas, e amostragem agressiva em producao pode
 * ultrapassa-las. Como e um numero de AMBIENTE, e nao de codigo, ele nao pode
 * estar fixo aqui.
 *
 * Ausente, o rastreio fica DESLIGADO. E diferente de `APP_CHECK_ENFORCE`, que
 * derruba o boot: ali o silencio decidiria entre proteger e nao proteger; aqui,
 * decide entre observar e nao observar, e recusar subir por causa disso deixaria
 * a plataforma fora do ar por um problema de telemetria. Valor INVALIDO, esse
 * sim, derruba: "0,5" com virgula viraria NaN e desligaria o rastreio calado.
 */
export function razaoDeAmostragem(
  ambiente: NodeJS.ProcessEnv = process.env,
): number {
  const bruto = ambiente['RASTREIO_AMOSTRAGEM'];
  if (bruto === undefined || bruto === '') return 0;

  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero < 0 || numero > 1) {
    throw new Error(
      `RASTREIO_AMOSTRAGEM invalido: "${bruto}". Use um numero entre 0 e 1.`,
    );
  }

  return numero;
}

/**
 * O amostrador, e a razao de ele nao ser o padrao do OpenTelemetry.
 *
 * `OTEL_TRACES_SAMPLER=parentbased_traceidratio` monta um `ParentBasedSampler`
 * com os delegados PADRAO, e o padrao de `remoteParentNotSampled` e
 * `AlwaysOff`. Isso descartaria justamente o caso comum aqui: o Cloud Run
 * popula o `traceparent` de entrada com amostragem propria de 0,1 req/s, entao
 * quase toda requisicao chega com pai remoto NAO amostrado — e nenhum trace
 * nosso existiria.
 *
 * Por isso o pai remoto nao amostrado cai na MESMA razao da raiz. Como
 * `TraceIdRatioBasedSampler` decide pelo trace id, e nao por sorteio, os dois
 * lados de um salto chegam a mesma conclusao sobre o mesmo trace — que e o que
 * mantem o trace inteiro ou fora, nunca pela metade.
 *
 * `remoteParentSampled` e `AlwaysOn`: se quem chamou ja esta amostrando, o salto
 * para o Cloud Tasks continua o mesmo trace. E o salto que a arquitetura
 * (secao 9) aponta como o ponto cego do fluxo assincrono.
 */
export function amostrador(razao: number): Sampler {
  const proporcao = new TraceIdRatioBasedSampler(razao);

  return new ParentBasedSampler({
    root: proporcao,
    remoteParentSampled: new AlwaysOnSampler(),
    remoteParentNotSampled: proporcao,
    localParentSampled: new AlwaysOnSampler(),
    localParentNotSampled: new AlwaysOffSampler(),
  });
}
