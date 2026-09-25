# Runbook — webhook do gateway recusado

**Alerta que leva aqui:** *Webhook do gateway recusado*
(`google_monitoring_alert_policy.webhook_recusado`, em
`infra/terraform/observabilidade.tf`). Dispara com mais de
`limite_webhook_recusado` (5) recusas em 10 minutos, por segredo da URL ou por
assinatura.

A métrica lê a linha que o `AssinaturaWebhookGuard` escreve a cada recusa
(`jsonPayload.sinal="webhook.recusado"`, com `motivo` igual a `segredo` ou
`assinatura`). A linha nunca traz o segredo, a assinatura, o corpo ou a URL
(ADR-19).

> Com `PAGAMENTOS_MODO=desligado`, o webhook responde 503 **antes** de
> conferir qualquer coisa, e este alerta não dispara.

**Quem executa:** quem atende a operação. Trocar segredo exige acesso ao Secret
Manager e ao painel do AbacatePay do escritório.

---

## Sintoma

- O alerta.
- Se o caso for o segredo trocado de um lado só: pagamentos reais sem pedido,
  clientes sem e-mail de acesso, e entregas com erro nos *Webhook Logs* do
  painel do AbacatePay.

## Como confirmar e separar os dois casos

No Logs Explorer, serviço `api-lexintegra`:

```
jsonPayload.sinal="webhook.recusado"
```

Olhe o campo `motivo` e compare com os *Webhook Logs* do painel do AbacatePay
no mesmo intervalo.

| O que aparece | O que é | Urgência |
|---|---|---|
| Todas as recusas por `segredo`, e **as entregas do painel também falhando**, na mesma hora | **Segredo trocado de um lado só.** O Secret Manager tem um valor e o painel tem outro. Todo pagamento real deixa de virar pedido | Alta: há dinheiro entrando sem pedido |
| Recusas por `segredo`, e o painel mostrando as entregas dele com 200 | Alguém chamando a URL sem o segredo certo (robô ou sondagem). Os eventos legítimos passam | Baixa. Veja se o volume cresce |
| Recusas por `assinatura` | Alguém que **tem o segredo** está mandando corpo sem a assinatura certa. Ou o segredo vazou, ou o corpo foi alterado no caminho, ou a chave do HMAC mudou do lado do AbacatePay | Alta, se o segredo vazou |

## O que fazer

- **Segredo trocado de um lado só:** alinhe os dois lados na ordem da seção
  *Segredo divergente* de [webhook-fora-do-ar.md](webhook-fora-do-ar.md):
  versão nova no Secret Manager, revisão nova no Cloud Run, e só então o
  painel. Depois, reenvie as entregas que falharam e siga
  [pagamento-orfao.md](pagamento-orfao.md) para o que tiver virado órfão.
- **Sondagem sem o segredo:** nada a fazer além de acompanhar. O guard recusa
  antes de ler qualquer coisa, e a resposta é igual para todo motivo. Se o
  volume incomodar, suba o limite por PR.
- **Recusa por assinatura:**
  1. confira se a chave publicada pelo AbacatePay mudou
     (`docs.abacatepay.com/pages/webhooks/security`) e, se mudou, atualize
     `ABACATEPAY_WEBHOOK_CHAVE_HMAC`;
  2. se não mudou, trate o segredo como **vazado**: gere um novo e troque nos
     dois lados, pelo mesmo procedimento;
  3. revise quem tem acesso ao painel do AbacatePay, porque acesso ao painel é
     acesso ao segredo (ADR-19).

## O que nunca fazer

- Logar a URL, a query ou o corpo para investigar. O segredo está na URL.
- Afrouxar o guard, ou responder algo diferente de 401 para "ajudar a
  depurar". A resposta igual para todo motivo é de propósito.
- Colar o segredo em chat, chamado ou commit.
- Silenciar o alerta subindo o limite sem ter separado os dois casos.

## Como saber que resolveu

- `jsonPayload.sinal="webhook.recusado"` para de crescer, e o incidente fecha.
- Uma entrega nova nos *Webhook Logs* do painel volta 200, e aparece
  `jsonPayload.sinal="webhook.recebido"`.
