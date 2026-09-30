# Runbook — webhook do AbacatePay recusando ou sem chegar

**Alerta que leva aqui:** *Alerta critico da aplicacao*, com assunto
`pagamento.webhook-ilegivel` ou `pagamento.webhook-evento-desconhecido`.
A recusa por segredo ou assinatura tem alerta próprio, *Webhook do gateway
recusado*, com triagem em [webhook-recusado.md](webhook-recusado.md). O
webhook parado também pode aparecer como *API fora do ar* ou como reclamação
de cliente.

**Quem executa:** quem atende a operação. Trocar segredo exige acesso ao
Secret Manager e ao painel do AbacatePay do escritório.

> **O `webhookSecret` da URL é a única autenticação real do webhook** (ADR-19,
> errata do Bloco B). A chave do HMAC é pública. Trate o painel do AbacatePay e
> o Secret Manager como credencial.

---

## Sintoma

- O cliente pagou, e a tela de checkout fica em "aguardando" até expirar. O
  e-mail de acesso não chega.
- Nos *Webhook Logs* do painel do AbacatePay, as entregas aparecem com status
  diferente de 2xx.
- Um dos dois alertas críticos acima.

## Como confirmar

No Logs Explorer, serviço `api-lexintegra`:

| O que procurar | Filtro | O que quer dizer |
|---|---|---|
| Evento aceito | `jsonPayload.sinal="webhook.recebido"` | Chegou e foi processado. O campo `resultado` diz o que foi feito |
| Recusa pelo segredo | `"webhook recusado: segredo da URL ausente ou diferente"` | O segredo cadastrado no painel é diferente do que a API tem |
| Recusa pela assinatura | `"webhook recusado: assinatura ausente ou diferente do corpo"` | A chave do HMAC mudou, ou o corpo foi alterado no caminho |
| Recusa por ambiente | `"webhook recusado: evento"` e `devMode=` | Evento de sandbox num processo de produção, ou o contrário |
| Ilegível | alerta `pagamento.webhook-ilegivel` (HTTP 422) | O formato do evento mudou |
| Nome desconhecido | alerta `pagamento.webhook-evento-desconhecido` (HTTP 200 `alertado`) | O código não conhece o nome do evento |

O **log de requisição** do Cloud Run para esta rota **não existe de propósito**:
a exclusão `webhook-segredo-na-url` o descarta. A linha `webhook.recebido` e os
`WARNING` do guard são o que sobra.

HTTP **503** em todas as entregas é o comportamento normal com
`PAGAMENTOS_MODO=desligado` (`apps/api/src/pagamentos/webhook/assinatura.guard.ts`).

## O que fazer

**Segredo divergente.** Houve rotação de um lado só.

1. Gere um segredo novo (`openssl rand -hex 24`).
2. Grave a versão nova em `gcloud secrets versions add <secret-do-webhook>`,
   colando o valor na entrada padrão.
3. Force uma revisão nova do Cloud Run, com um deploy pelo pipeline. O
   container só lê o secret ao iniciar.
4. **Só então** troque o segredo no painel do AbacatePay.

Ver [`docs/entrega/credenciais.md`](../entrega/credenciais.md).

**Assinatura divergente.** Confira a chave publicada pelo AbacatePay em
`docs.abacatepay.com/pages/webhooks/security` contra
`ABACATEPAY_WEBHOOK_CHAVE_HMAC`. Se mudou, atualize a variável por PR.

**Evento desconhecido.** O nome está no alerta.

- Se for a conclusão do cartão com nome diferente de `checkout.completed`, a
  correção é uma linha em `EVENTOS`
  (`apps/api/src/pagamentos/webhook/evento.ts`), com teste. Depois do deploy,
  reenvie o evento pelo painel.
- Qualquer outro nome: registre e decida com quem mantém o código.

**Ilegível.** O formato mudou. Pegue um evento real nos *Webhook Logs* do
painel e compare com `eventoNoFormatoReal`
(`apps/api/src/arnes-webhook.ts`). Corrija o parser com teste em cima do
formato novo.

**Depois de qualquer correção:** reenvie pelo painel do AbacatePay as entregas
que falharam. `[CONFIRMAR: o painel permite reenvio manual]`. Reenviar é seguro:
o pagamento tem o id da cobrança, e a repetição cai em `duplicata` (ADR-04).
O que continuar sem pedido segue [pagamento-orfao.md](pagamento-orfao.md).

**Webhook 5xx com o modo ligado:** a API está fora. Siga
[api-fora-do-ar.md](api-fora-do-ar.md).

## O que nunca fazer

- **Logar a URL, a query ou o corpo** para investigar. O segredo está na URL.
  `webhook-sem-segredo-no-log.integration-spec.ts` falha, e com razão.
- Desligar o `AssinaturaWebhookGuard` "só para passar". Sem ele, qualquer
  pessoa que conheça o próprio `checkoutId` forja o pagamento.
- Colar o segredo em chat, chamado ou commit. Se isso acontecer, faça a
  rotação.
- Usar o `abacatepay listen` para validar formato de evento: ele altera o corpo
  (plano de execução, Etapa 8).
- Trocar `PAGAMENTOS_MODO` para `sandbox` em produção para "testar". Uma chave
  de desenvolvimento em produção aceita eventos simulados.

## Como saber que resolveu

- Uma entrega nova nos *Webhook Logs* do painel volta 200.
- Aparece `jsonPayload.sinal="webhook.recebido"` com `resultado` `confirmado`
  ou `duplicata`.
- O pedido do cliente que reclamou aparece em `/admin/distribuicao`, e o
  e-mail `acesso-cliente` aparece como `enviado` em `/admin/entregas`.
