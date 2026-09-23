import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ExecutionContext } from '@nestjs/common';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfiguracaoPagamentos } from '../gateway/modo.js';
import { caminhoDoWebhook } from '../../arnes-webhook.js';
import {
  assinar,
  assinaturaConfere,
  PARAMETRO_SEGREDO_WEBHOOK,
  segredoConfere,
} from './assinatura.js';
import {
  AssinaturaWebhookGuard,
  CABECALHO_ASSINATURA,
} from './assinatura.guard.js';

const CHAVE = 'chave-hmac';
const CORPO = Buffer.from('{"id":"log_1","event":"checkout.completed"}');

describe('assinatura do webhook', () => {
  /** O formato documentado: HMAC-SHA256 do corpo cru, em base64. */
  it('e HMAC-SHA256 do corpo cru, em base64', () => {
    expect(assinar(CORPO, CHAVE)).toBe(
      createHmac('sha256', CHAVE).update(CORPO).digest('base64'),
    );
  });

  it('confere a assinatura certa', () => {
    expect(assinaturaConfere(CORPO, assinar(CORPO, CHAVE), CHAVE)).toBe(true);
  });

  it.each([
    ['corpo alterado depois de assinado', Buffer.from(`${CORPO.toString()} `)],
    ['corpo ausente', undefined],
  ])('recusa %s', (_caso, corpo) => {
    expect(assinaturaConfere(corpo, assinar(CORPO, CHAVE), CHAVE)).toBe(false);
  });

  it.each([
    ['assinatura de outra chave', assinar(CORPO, 'outra-chave')],
    ['assinatura ausente', undefined],
    [
      'assinatura em hex, e nao base64',
      createHmac('sha256', CHAVE).update(CORPO).digest('hex'),
    ],
    ['assinatura curta', 'abc'],
  ])('recusa %s', (_caso, recebida) => {
    expect(assinaturaConfere(CORPO, recebida, CHAVE)).toBe(false);
  });

  /** Sem chave configurada, nada confere — nem uma assinatura "de chave vazia". */
  it('recusa tudo com a chave vazia', () => {
    expect(assinaturaConfere(CORPO, assinar(CORPO, ''), '')).toBe(false);
  });

  it('confere o segredo da URL', () => {
    expect(segredoConfere('segredo', 'segredo')).toBe(true);
    expect(segredoConfere('segredo-errado', 'segredo')).toBe(false);
    expect(segredoConfere(undefined, 'segredo')).toBe(false);
    expect(segredoConfere('', '')).toBe(false);
  });
});

describe('AssinaturaWebhookGuard', () => {
  const CONFIGURACAO: ConfiguracaoPagamentos = {
    modo: 'sandbox',
    chaveApi: null,
    segredoWebhook: 'segredo',
    chaveHmacWebhook: CHAVE,
    devModeEsperado: true,
  };

  function contexto(requisicao: {
    query?: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
    rawBody?: Buffer;
  }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ query: {}, headers: {}, ...requisicao }),
      }),
    } as unknown as ExecutionContext;
  }

  const valida = {
    query: { webhookSecret: 'segredo' },
    headers: { [CABECALHO_ASSINATURA]: assinar(CORPO, CHAVE) },
    rawBody: CORPO,
  };

  it('deixa passar o evento assinado', () => {
    expect(
      new AssinaturaWebhookGuard(CONFIGURACAO).canActivate(contexto(valida)),
    ).toBe(true);
  });

  it.each([
    ['sem segredo na URL', { ...valida, query: {} }],
    ['segredo errado', { ...valida, query: { webhookSecret: 'outro' } }],
    [
      'segredo repetido na URL',
      { ...valida, query: { webhookSecret: ['segredo', 'segredo'] } },
    ],
    ['sem assinatura', { ...valida, headers: {} }],
    [
      'assinatura repetida',
      { ...valida, headers: { [CABECALHO_ASSINATURA]: ['a', 'b'] } },
    ],
    ['corpo alterado', { ...valida, rawBody: Buffer.from('{}') }],
    ['sem corpo cru', { ...valida, rawBody: undefined }],
  ])('recusa com 401: %s', (_caso, requisicao) => {
    expect(() =>
      new AssinaturaWebhookGuard(CONFIGURACAO).canActivate(
        contexto(requisicao),
      ),
    ).toThrow(UnauthorizedException);
  });

  /** Desligado e 503: o gateway reentrega quando o modo mudar. */
  it('com pagamentos desligados, responde 503 antes de conferir', () => {
    expect(() =>
      new AssinaturaWebhookGuard({
        ...CONFIGURACAO,
        modo: 'desligado',
      }).canActivate(contexto(valida)),
    ).toThrow(ServiceUnavailableException);
  });
});

/**
 * O NOME DO PARAMETRO E UM SO (Bloco B). O guard le o segredo por ele, os testes e
 * o simulador montam a URL com ele, e a exclusao do Cloud Logging filtra por ele.
 * Renomear num lugar sem acompanhar os outros nao quebraria nada — o segredo so
 * voltaria ao log de requisicao, em silencio.
 */
describe('o parametro do segredo do webhook', () => {
  it('e o mesmo que o arnes usa para montar a URL', () => {
    const url = new URL(caminhoDoWebhook('x'), 'http://localhost');
    expect(url.searchParams.get(PARAMETRO_SEGREDO_WEBHOOK)).toBe('x');
  });

  it('e o que a exclusao do Cloud Logging filtra', () => {
    const terraform = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../infra/terraform/observabilidade.tf',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const bloco =
      /resource "google_logging_project_exclusion" "webhook_segredo_na_url" \{[\s\S]*?\n\}/.exec(
        terraform,
      );
    if (bloco === null) {
      throw new Error(
        'Exclusao `webhook_segredo_na_url` nao encontrada em ' +
          'infra/terraform/observabilidade.tf. Sem ela, o webhookSecret volta ao ' +
          'log de requisicao do Cloud Run (ADR-19, Bloco B).',
      );
    }

    const filtro = /filter\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(bloco[0])?.[1];
    expect(filtro).toBe(
      `httpRequest.requestUrl:\\"${PARAMETRO_SEGREDO_WEBHOOK}=\\"`,
    );
  });
});
