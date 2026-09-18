import { criarLogger, formatoDeLog, opcoesDoLogger } from './criar-logger.js';
import { LoggerEstruturado } from './logger-estruturado.js';

describe('formatoDeLog', () => {
  it('respeita o valor declarado', () => {
    expect(formatoDeLog({ LOG_FORMATO: 'json' })).toBe('json');
    expect(formatoDeLog({ LOG_FORMATO: 'texto' })).toBe('texto');
  });

  it('usa json em producao e texto fora dela', () => {
    expect(formatoDeLog({ NODE_ENV: 'production' })).toBe('json');
    expect(formatoDeLog({})).toBe('texto');
  });

  /**
   * Valor errado DERRUBA O BOOT em vez de cair no padrao. Cair no padrao daria o
   * pior desfecho possivel: producao escrevendo texto, nenhum erro visivel, e uma
   * politica de alerta que simplesmente nunca dispara.
   */
  it('recusa subir com valor desconhecido', () => {
    expect(() => formatoDeLog({ LOG_FORMATO: 'JSON ' })).toThrow(
      /LOG_FORMATO invalido/,
    );
    expect(() =>
      formatoDeLog({ NODE_ENV: 'production', LOG_FORMATO: '' }),
    ).toThrow(/LOG_FORMATO invalido/);
  });
});

describe('criarLogger', () => {
  it('monta o logger estruturado', () => {
    expect(criarLogger({ LOG_FORMATO: 'json' })).toBeInstanceOf(
      LoggerEstruturado,
    );
  });

  /** Sob emulador, o projeto vem de `GCLOUD_PROJECT` (ver `firebase.module.ts`). */
  it('aceita o projeto do emulador quando GCP_PROJECT_ID nao existe', () => {
    expect(opcoesDoLogger({ GCLOUD_PROJECT: 'demo-lexintegra' }).projeto).toBe(
      'demo-lexintegra',
    );
  });

  it('prefere GCP_PROJECT_ID quando os dois existem', () => {
    expect(
      opcoesDoLogger({
        GCP_PROJECT_ID: 'plataforma-juridica-36bda',
        GCLOUD_PROJECT: 'demo-lexintegra',
      }).projeto,
    ).toBe('plataforma-juridica-36bda');
  });
});
