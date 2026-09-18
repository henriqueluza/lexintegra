import {
  TraceFlags,
  context,
  isSpanContextValid,
  propagation,
  trace,
} from '@opentelemetry/api';

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

/**
 * O `traceparent` do momento, em texto, para guardar junto de um fato que sera
 * processado depois (o registro do outbox e o caso).
 *
 * Sem SDK carregado o propagador global e o vazio, e isto devolve `undefined` —
 * que e o que acontece em teste e em desenvolvimento.
 */
export function traceparentAtual(): string | undefined {
  const portador: Record<string, string> = {};
  propagation.inject(context.active(), portador);
  return portador['traceparent'];
}

/**
 * O id do trace dentro de um `traceparent` (`versao-traceId-spanId-flags`).
 *
 * E ele que vai para o log da entrega: e assim que se acha, a partir do request
 * que originou o evento, a linha da entrega que aconteceu horas depois —
 * "traceId propagado do frontend ate a task", da secao 9 da arquitetura.
 */
export function traceIdDe(traceparent: string | undefined): string | undefined {
  const partes = (traceparent ?? '').split('-');
  return partes.length >= 3 && partes[1].length === 32 ? partes[1] : undefined;
}
