#!/usr/bin/env node
/**
 * Simula o webhook do AbacatePay contra a API LOCAL, para fechar uma compra em
 * desenvolvimento sem gateway nenhum no meio (Etapa 8).
 *
 * Com `pnpm dev` e sem chave de API, a API usa o gateway FALSO: o checkout mostra
 * um QR que nao paga nada. Este script faz o papel do AbacatePay depois do
 * pagamento — le o checkout no emulador, monta o evento e o assina com os
 * segredos de desenvolvimento, do mesmo jeito que `compra.integration-spec.ts`.
 *
 * NAO E O ROTEIRO DO SANDBOX. Contra o sandbox de verdade, quem manda o evento e o
 * proprio AbacatePay (`abacatepay listen`), assinado com o segredo configurado
 * no painel — ver `docs/runbooks/checkout-sandbox.md`.
 *
 * AS GUARDAS, e por que este script nao tem caminho ate producao:
 *
 * 1. A API e a do loopback, e so ela. Qualquer outro host e recusado antes de
 *    montar o evento.
 * 2. O Firestore e o EMULADOR, confirmado por `Bearer owner` (que o servico real
 *    recusa) num projeto `demo-`, como em `semear-emulador.mjs`.
 * 3. Os segredos sao os de DESENVOLVIMENTO, que a API so aceita quando nao ha
 *    chave de API configurada — um processo com segredos de verdade responde 401.
 *
 * Uso, com `pnpm dev` no ar em outro terminal:
 *   node scripts/simular-webhook.mjs <checkoutId>             pagamento confirmado
 *   node scripts/simular-webhook.mjs <checkoutId> estornado   estorno integral
 *
 * O `checkoutId` e o `?id=` da tela de checkout. O evento sai igual a cada
 * execucao: rodar duas vezes e a REENTREGA dele, e a API responde `duplicata`.
 */

import { createHmac } from 'node:crypto';
import {
  caminhoDoWebhook,
  eventoNoFormatoReal,
} from '../apps/api/src/arnes-webhook.ts';
import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from '../apps/api/src/pagamentos/gateway/segredos-desenvolvimento.ts';
import {
  confirmarEmuladorFirestore,
  lerDocumento,
} from './firestore-emulador.mjs';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const API = process.env.API_LOCAL ?? 'http://localhost:8080';
const HOST_FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8081';
const PROJETO = process.env.GCLOUD_PROJECT ?? 'demo-lexintegra';

const ACOES = {
  pago: { sufixo: 'completed' },
  estornado: { sufixo: 'refunded' },
};

function conferirGuardas() {
  const api = new URL(API);
  if (api.protocol !== 'http:' || !LOOPBACK.has(api.hostname)) {
    throw new Error(
      `API_LOCAL=${API} nao e a API local. Este script so fala com o loopback.`,
    );
  }
  const firestore = new URL(`http://${HOST_FIRESTORE}`);
  if (!LOOPBACK.has(firestore.hostname)) {
    throw new Error(
      `FIRESTORE_EMULATOR_HOST=${HOST_FIRESTORE} nao e o emulador local.`,
    );
  }
  if (!PROJETO.startsWith('demo-')) {
    throw new Error(
      `Projeto "${PROJETO}" sem prefixo demo-. Recusando: so o emulador serve.`,
    );
  }
}

async function lerCheckout(checkoutId) {
  const campos = await lerDocumento(
    HOST_FIRESTORE,
    PROJETO,
    `checkouts/${encodeURIComponent(checkoutId)}`,
  );
  if (campos === null) {
    throw new Error(`Checkout ${checkoutId} nao existe no emulador.`);
  }
  const cobranca = campos.cobranca?.mapValue?.fields?.id?.stringValue;
  if (cobranca === undefined) {
    const estado = campos.estado?.stringValue ?? 'desconhecido';
    throw new Error(
      `Checkout ${checkoutId} sem cobranca criada (estado: ${estado}).`,
    );
  }
  return {
    cobrancaId: cobranca,
    metodo: campos.metodo?.stringValue,
    totalCentavos: Number(campos.totalCentavos?.integerValue),
  };
}

async function principal() {
  const [checkoutId, acao = 'pago'] = process.argv.slice(2);
  if (checkoutId === undefined || !(acao in ACOES)) {
    console.error(
      'Uso: node scripts/simular-webhook.mjs <checkoutId> [pago|estornado]',
    );
    process.exitCode = 2;
    return;
  }

  conferirGuardas();
  await confirmarEmuladorFirestore(HOST_FIRESTORE, PROJETO);
  const checkout = await lerCheckout(checkoutId);

  const { sufixo } = ACOES[acao];
  const origem = checkout.metodo === 'cartao' ? 'checkout' : 'transparent';
  /*
   * No formato do evento REAL do sandbox (`arnes-webhook.ts`): sem `id` na raiz, e
   * a cobranca sob a chave do prefixo do evento. Simular com o formato da
   * documentacao esconderia justamente o que o sandbox desmentiu.
   */
  const corpo = JSON.stringify(
    eventoNoFormatoReal({
      evento: `${origem}.${sufixo}`,
      cobrancaId: checkout.cobrancaId,
      checkoutId,
      valorCentavos: checkout.totalCentavos,
    }),
  );

  /* A URL sai do mesmo lugar que a dos testes; o log abaixo nao a repete. */
  const destino = new URL(caminhoDoWebhook(SEGREDO_WEBHOOK_DESENVOLVIMENTO), API);
  const resposta = await fetch(destino, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-signature': createHmac('sha256', CHAVE_HMAC_DESENVOLVIMENTO)
        .update(corpo)
        .digest('base64'),
    },
    body: corpo,
  });

  console.log(
    `${origem}.${sufixo} para ${checkoutId}: HTTP ${resposta.status} ${await resposta.text()}`,
  );
  if (!resposta.ok) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
