import { createHmac } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfiguracaoPagamentos } from '../gateway/modo.js';
import { assinar, assinaturaConfere, segredoConfere } from './assinatura.js';
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
