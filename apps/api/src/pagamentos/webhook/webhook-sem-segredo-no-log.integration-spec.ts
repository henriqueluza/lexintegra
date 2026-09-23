import { jest } from '@jest/globals';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import {
  caminhoDoWebhook,
  TRANSPARENTE_COMPLETED_REAL,
} from '../../arnes-webhook.js';
import { configurar, OPCOES_DA_APLICACAO } from '../../configurar.js';
import { limparEmuladores } from '../../emulador.js';
import { LoggerEstruturado } from '../../observabilidade/logger-estruturado.js';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../gateway/modo.js';
import { assinar, PARAMETRO_SEGREDO_WEBHOOK } from './assinatura.js';
import { ProcessadorDeEventos } from './processador.service.js';

let app: INestApplication;
let linhas: string[];

/**
 * O SEGREDO DO WEBHOOK NAO CHEGA AO LOG DA APLICACAO (Bloco B, regra inviolavel 9).
 *
 * A aplicacao inteira, com o logger de PRODUCAO (JSON) escrevendo numa lista em
 * vez do stdout. Cada caminho do webhook que escreve log e exercitado — aceito,
 * as duas recusas do guard, o evento ilegivel com alerta critico e o erro interno
 * que o Nest registra com pilha —, e nenhuma linha pode conter o segredo nem a
 * query. Hoje nenhum codigo loga a URL; o teste e o que impede alguem de
 * acrescentar um `requisicao.originalUrl` "para depurar".
 *
 * O que este teste NAO cobre, e por que: o log de requisicao do Cloud Run e da
 * plataforma, fora do processo — quem cuida dele e a exclusao em
 * `infra/terraform/observabilidade.tf`. Os spans estao em
 * `observabilidade/instrumentacao-http.spec.ts`.
 *
 * CONTROLE POSITIVO: as linhas esperadas existem. Sem ele, um logger que nao
 * capturasse nada passaria no teste.
 */
beforeEach(async () => {
  await limparEmuladores();
  linhas = [];
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...OPCOES_DA_APLICACAO,
    logger: new LoggerEstruturado({
      formato: 'json',
      escrever: (linha) => linhas.push(linha),
    }),
  });
  configurar(app as NestExpressApplication);
  await app.init();
});

afterEach(async () => {
  await app.close();
});

function enviar(
  corpo: string,
  opcoes: { segredo?: string; assinatura?: string } = {},
): request.Test {
  return request(app.getHttpServer())
    .post(caminhoDoWebhook(opcoes.segredo ?? SEGREDO_WEBHOOK_DESENVOLVIMENTO))
    .set('Content-Type', 'application/json')
    .set(
      'X-Webhook-Signature',
      opcoes.assinatura ?? assinar(corpo, CHAVE_HMAC_DESENVOLVIMENTO),
    )
    .send(corpo);
}

function semSegredo(): void {
  const tudo = linhas.join('\n');
  expect(tudo).not.toContain(SEGREDO_WEBHOOK_DESENVOLVIMENTO);
  expect(tudo).not.toContain(`${PARAMETRO_SEGREDO_WEBHOOK}=`);
  expect(tudo).not.toContain('/api/pagamentos/webhook?');
}

function linhasCom(trecho: string): string[] {
  return linhas.filter((linha) => linha.includes(trecho));
}

describe('o webhook nao escreve o segredo no log', () => {
  it('evento aceito: loga o que chegou, sem a URL', async () => {
    await enviar(JSON.stringify(TRANSPARENTE_COMPLETED_REAL)).expect(200);

    const recebido = linhasCom('"sinal":"webhook.recebido"');
    expect(recebido).toHaveLength(1);
    expect(JSON.parse(recebido[0] ?? '{}')).toMatchObject({
      severity: 'INFO',
      evento: 'transparent.completed',
      resultado: 'orfao',
    });
    semSegredo();
  });

  it('segredo errado: o guard loga so o motivo', async () => {
    const errado = 'segredo-errado-que-tambem-nao-pode-vazar';
    await enviar(JSON.stringify(TRANSPARENTE_COMPLETED_REAL), {
      segredo: errado,
    }).expect(401);

    expect(linhasCom('webhook recusado: segredo')).toHaveLength(1);
    expect(linhas.join('\n')).not.toContain(errado);
    semSegredo();
  });

  it('assinatura errada: o guard loga so o motivo', async () => {
    await enviar(JSON.stringify(TRANSPARENTE_COMPLETED_REAL), {
      assinatura: 'invalida',
    }).expect(401);

    expect(linhasCom('webhook recusado: assinatura')).toHaveLength(1);
    semSegredo();
  });

  it('evento ilegivel: o alerta critico nao leva a URL', async () => {
    await enviar(
      JSON.stringify({ event: 'transparent.completed', devMode: true, data: {} }),
    ).expect(422);

    expect(linhasCom('pagamento.webhook-ilegivel')).not.toHaveLength(0);
    semSegredo();
  });

  it('erro interno: a pilha registrada pelo Nest nao leva a URL', async () => {
    jest
      .spyOn(app.get(ProcessadorDeEventos), 'processar')
      .mockRejectedValue(new Error('falha simulada no processamento'));

    await enviar(JSON.stringify(TRANSPARENTE_COMPLETED_REAL)).expect(500);

    expect(linhasCom('falha simulada no processamento')).not.toHaveLength(0);
    semSegredo();
  });
});
