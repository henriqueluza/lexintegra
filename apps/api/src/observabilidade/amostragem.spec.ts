import { context, trace } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-node';
import { amostrador, razaoDeAmostragem } from './amostragem.js';
import { traceIdDe } from './rastreio.js';

describe('razaoDeAmostragem', () => {
  it('le o numero declarado', () => {
    expect(razaoDeAmostragem({ RASTREIO_AMOSTRAGEM: '0.1' })).toBe(0.1);
    expect(razaoDeAmostragem({ RASTREIO_AMOSTRAGEM: '1' })).toBe(1);
  });

  /**
   * Ausente e DESLIGADO, nao erro de boot. Diferente de `APP_CHECK_ENFORCE`: la o
   * silencio decidiria entre proteger e nao proteger; aqui decide entre observar
   * e nao observar, e derrubar a plataforma por telemetria seria pior que o mal
   * que evita.
   */
  it('desliga o rastreio quando a variavel nao existe', () => {
    expect(razaoDeAmostragem({})).toBe(0);
    expect(razaoDeAmostragem({ RASTREIO_AMOSTRAGEM: '' })).toBe(0);
  });

  /**
   * Valor invalido DERRUBA. "0,5" com virgula vira NaN, e cair no padrao
   * desligaria o rastreio em silencio — alguem teria configurado a amostragem e
   * ficaria sem trace nenhum, sem nada indicando por que.
   */
  it('recusa valor invalido ou fora da faixa', () => {
    expect(() => razaoDeAmostragem({ RASTREIO_AMOSTRAGEM: '0,5' })).toThrow(
      /RASTREIO_AMOSTRAGEM invalido/,
    );
    expect(() => razaoDeAmostragem({ RASTREIO_AMOSTRAGEM: '2' })).toThrow(
      /RASTREIO_AMOSTRAGEM invalido/,
    );
    expect(() => razaoDeAmostragem({ RASTREIO_AMOSTRAGEM: '-1' })).toThrow(
      /RASTREIO_AMOSTRAGEM invalido/,
    );
  });
});

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';

function decidir(
  razao: number,
  pai?: { amostrado: boolean; remoto: boolean },
): SamplingDecision {
  const contexto =
    pai === undefined
      ? context.active()
      : trace.setSpanContext(context.active(), {
          traceId: TRACE_ID,
          spanId: 'b7ad6b7169203331',
          traceFlags: pai.amostrado ? 1 : 0,
          isRemote: pai.remoto,
        });

  return amostrador(razao).shouldSample(
    contexto,
    TRACE_ID,
    'POST /api/interno/outbox',
    0,
    {},
    [],
  ).decision;
}

describe('amostrador', () => {
  /**
   * O SALTO DO CLOUD TASKS. Se quem enfileirou esta amostrando, a execucao da
   * tarefa precisa entrar no mesmo trace — senao o unico pedaco que interessa do
   * fluxo assincrono e justamente o que falta.
   */
  it('sempre amostra quando o pai remoto ja amostrou', () => {
    expect(decidir(0, { amostrado: true, remoto: true })).toBe(
      SamplingDecision.RECORD_AND_SAMPLED,
    );
  });

  /**
   * O padrao do OpenTelemetry (`parentbased_traceidratio`) usaria `AlwaysOff`
   * aqui, e isso descartaria o caso COMUM: o Cloud Run popula o `traceparent` de
   * entrada com amostragem propria e quase sempre nao amostrada. Com o padrao,
   * nenhum trace nosso existiria.
   */
  it('aplica a razao quando o pai remoto nao amostrou', () => {
    expect(decidir(1, { amostrado: false, remoto: true })).toBe(
      SamplingDecision.RECORD_AND_SAMPLED,
    );
    expect(decidir(0, { amostrado: false, remoto: true })).toBe(
      SamplingDecision.NOT_RECORD,
    );
  });

  it('decide a raiz pela razao', () => {
    expect(decidir(1)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(decidir(0)).toBe(SamplingDecision.NOT_RECORD);
  });

  /**
   * A decisao sai do TRACE ID, nao de sorteio. E o que faz os dois lados de um
   * salto chegarem a mesma conclusao sobre o mesmo trace, e o que impede trace
   * pela metade.
   */
  it('decide igual para o mesmo trace id', () => {
    const amostra = amostrador(0.5);
    const decisoes = Array.from(
      { length: 5 },
      () =>
        amostra.shouldSample(context.active(), TRACE_ID, 'x', 0, {}, [])
          .decision,
    );

    expect(new Set(decisoes).size).toBe(1);
  });
});

describe('traceIdDe', () => {
  it('extrai o trace id do traceparent', () => {
    expect(traceIdDe(`00-${TRACE_ID}-b7ad6b7169203331-01`)).toBe(TRACE_ID);
  });

  it('devolve indefinido para ausente ou malformado', () => {
    expect(traceIdDe(undefined)).toBeUndefined();
    expect(traceIdDe('00-curto-b7ad6b7169203331-01')).toBeUndefined();
    expect(traceIdDe('qualquer coisa')).toBeUndefined();
  });
});
