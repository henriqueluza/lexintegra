import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PARAMETRO_SEGREDO_WEBHOOK } from '../pagamentos/webhook/assinatura.js';
import { opcoesDaInstrumentacaoHttp } from './instrumentacao-http.js';

/**
 * O SEGREDO DO WEBHOOK NAO VAI PARA O TRACE (Bloco B, regra inviolavel 9).
 *
 * A instrumentacao de verdade, com as opcoes de producao, sobre um servidor HTTP
 * de verdade: o span de servidor grava `url.query`, e e ali que o
 * `webhookSecret` apareceria. Conferir so a lista de opcoes provaria que o nome
 * esta na lista, nao que a biblioteca o redige — e a opcao e `@experimental`.
 *
 * NUM PROCESSO FILHO, porque dentro do Jest a instrumentacao nao pega o `http`
 * (ver `span-de-requisicao.fixture.mjs`). Tentado antes, com `import()` e com
 * `createRequire`: zero span nos dois.
 *
 * DOIS CONTROLES POSITIVOS, sem os quais o teste passaria vazio: o span existe
 * (a instrumentacao pegou a requisicao), e um parametro qualquer aparece em
 * `url.query` (a query e capturada, entao a ausencia do segredo e redacao, e
 * nao falta de captura).
 */
const SEGREDO = 'valor-do-segredo-que-nao-pode-vazar';
const ROTA = '/api/pagamentos/webhook';
const FIXTURE = fileURLToPath(
  new URL('./span-de-requisicao.fixture.mjs', import.meta.url),
);

function spansDeServidor(caminho: string): Record<string, unknown>[] {
  const { NODE_OPTIONS: _jest, ...ambiente } = process.env;
  const saida = execFileSync(process.execPath, [FIXTURE, caminho], {
    env: ambiente,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return JSON.parse(saida) as Record<string, unknown>[];
}

describe('instrumentacao HTTP', () => {
  it('redige o webhookSecret do url.query do span de servidor', () => {
    const spans = spansDeServidor(
      `${ROTA}?${PARAMETRO_SEGREDO_WEBHOOK}=${SEGREDO}&outro=visivel`,
    );

    expect(spans).toHaveLength(1);
    const [atributos] = spans;
    expect(atributos?.['url.path']).toBe(ROTA);
    expect(atributos?.['url.query']).toContain('outro=visivel');
    expect(atributos?.['url.query']).toContain(
      `${PARAMETRO_SEGREDO_WEBHOOK}=REDACTED`,
    );
    expect(JSON.stringify(spans)).not.toContain(SEGREDO);
  });

  it('redige tambem o parametro repetido', () => {
    const spans = spansDeServidor(
      `${ROTA}?${PARAMETRO_SEGREDO_WEBHOOK}=${SEGREDO}&${PARAMETRO_SEGREDO_WEBHOOK}=${SEGREDO}-2`,
    );

    expect(spans).toHaveLength(1);
    expect(JSON.stringify(spans)).not.toContain(SEGREDO);
  });

  it('nao gera span para o health', () => {
    expect(spansDeServidor('/api/health')).toEqual([]);
  });

  /** Definir a opcao substitui a lista padrao; perde-la seria afrouxar a biblioteca. */
  it('mantem a lista padrao da biblioteca', () => {
    expect(opcoesDaInstrumentacaoHttp().redactedQueryParamsServer).toEqual(
      expect.arrayContaining([
        'sig',
        'X-Goog-Signature',
        PARAMETRO_SEGREDO_WEBHOOK,
      ]),
    );
  });
});
