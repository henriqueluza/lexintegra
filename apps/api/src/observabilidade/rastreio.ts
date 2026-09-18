import { TraceFlags, isSpanContextValid, trace } from '@opentelemetry/api';

/**
 * Identificacao do trace ativo, do jeito que o Cloud Logging precisa dela.
 *
 * SEPARADO DO LOGGER DE PROPOSITO. O logger nao pode depender de haver SDK de
 * rastreio carregado: em teste nao ha, em desenvolvimento pode nao haver, e em
 * producao o SDK e carregado por `--import`, fora do grafo de modulos da
 * aplicacao. Aqui, sem SDK, `trace.getActiveSpan()` devolve `undefined` e o log
 * sai sem os campos de correlacao — que e o comportamento certo, nao um erro.
 */
export interface Rastreio {
  readonly traceId: string;
  readonly spanId: string;
  /** O Cloud Trace so guarda o trace amostrado; o log carrega o id de todo jeito. */
  readonly amostrado: boolean;
}

export type LeitorDeRastreio = () => Rastreio | undefined;

export const rastreioAtivo: LeitorDeRastreio = () => {
  const span = trace.getActiveSpan();
  if (span === undefined) {
    return undefined;
  }

  const contexto = span.spanContext();
  if (!isSpanContextValid(contexto)) {
    return undefined;
  }

  return {
    traceId: contexto.traceId,
    spanId: contexto.spanId,
    amostrado:
      (contexto.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED,
  };
};
