# Runbook — entrega de e-mail falhando (inclui o teto diário do Resend)

**Alerta que leva aqui:** *Entrega de e-mail falhando*
(`google_monitoring_alert_policy.entrega_de_email_falhando`): mais de
`limite_falhas_de_entrega` (5) falhas de entrega em 10 minutos.

Uma falha isolada é o caso que a fila resolve sozinha. Várias seguidas
significam que o provedor está recusando.

**Quem executa:** quem atende a operação, com acesso ao painel do Resend da
conta dona da chave `resend-api-key`.

> **Estado em 01/10/2026:** remetente
> `LexIntegra <suporte@notificacoes.lexintegra.com.br>` (`EMAIL_FROM`) e
> reply-to `suportelexintegra@gmail.com` (`EMAIL_REPLY_TO`), os dois em
> `infra/terraform/variables.tf`. Domínio verificado em 29/09/2026 na conta do
> escritório. Chave: `resend-api-key` versão 2 (`lexintegra-producao`, conta do
> escritório, *Sending access*). **Plano gratuito: 100 e-mails por dia** (3.000
> por mês). Detalhes, troca de chave e de remetente em
> [`docs/entrega/operacao.md`](../entrega/operacao.md), seção 4.1. Os e-mails
> de senha não usam o modelo do painel: o texto está no código
> (`apps/api/src/email/textos-de-acesso.ts`).

---

## Sintoma

- O alerta.
- Clientes e advogados sem link de senha, sem e-mail de acesso, sem convite.
- Registros `falhou` em `/admin/entregas`, com `ultimoErro` preenchido.

## Como confirmar

1. `/admin/entregas`: leia o `ultimoErro` dos registros recentes. É a mensagem
   do provedor, com os endereços redigidos (`email/resend.transport.ts`).
2. Logs: `jsonPayload.sinal="outbox.entrega"` e
   `jsonPayload.resultado="falhou"`.
3. No painel do Resend, veja *Emails* e *Logs* da conta.

| O que o erro diz | Causa |
|---|---|
| Limite diário ou de envio atingido (`daily_quota_exceeded`, 429) | **Teto diário do plano gratuito: 100 por dia.** Ao atingir, o provedor **recusa** o envio em vez de cobrar. Confira o consumo em *Usage*, no painel |
| Só pode enviar para o próprio endereço, ou domínio não verificado | Remetente de teste, ou domínio que perdeu a verificação (registro DNS removido) |
| `reply_to` inválido | Não deveria chegar aqui: a API recusa subir com `EMAIL_REPLY_TO` que não seja endereço simples. Se aparecer, confira o `default` de `email_resposta` |
| Chave inválida ou não autorizada | A chave foi revogada ou girada sem nova versão no Secret Manager |
| 5xx ou tempo esgotado | Indisponibilidade do provedor. A fila reentrega sozinha |

## O que fazer

- **Teto diário.** Não há o que forçar: espere o dia virar no provedor, ou
  mude o plano no Resend (custo recorrente, decisão do escritório). Os
  registros continuam `falhou` e a fila tenta por até 1 hora (`outbox.tf`,
  `max_retry_duration`). O que passar disso vira `abandonado` e precisa de
  reenvio manual depois que o teto liberar
  ([outbox-parado.md](outbox-parado.md)). Priorize `acesso-cliente` e
  `definir-senha`: sem eles, a pessoa não entra.
- **Domínio.** Confira em *Domains* no Resend e os registros no Registro.br.
  Corrija o DNS. Nada muda no código.
- **Chave.** Gere uma chave nova na conta do domínio (*Sending access*,
  restrita a `notificacoes.lexintegra.com.br`), grave como **nova versão** do
  secret `resend-api-key` e publique uma revisão por merge na `main`: o
  container só lê o secret ao iniciar, e reexecutar o deploy do mesmo commit não
  cria revisão. Confirmada a entrega, revogue a chave antiga no painel e
  desative a versão antiga. Passo a passo em
  [`operacao.md`](../entrega/operacao.md), seção 4.1, passo 3.
- **Provedor fora.** Acompanhe a página de status do Resend. A fila e o
  varredor cuidam do resto.

## O que nunca fazer

- Trocar de provedor ou mandar pela caixa pessoal de alguém. Qualquer envio
  fora do `EmailTransport` quebra as regras 3 e 11.
- Reenviar em massa todos os `abandonado` enquanto o teto não liberou. Cada
  reenvio consome o teto e falha de novo.
- Criar secret novo com outro nome. O `cloud_run.tf` referencia
  `resend-api-key`, versão `latest`. Uma versão nova no mesmo secret basta.
- Desabilitar a versão antiga da chave **antes** de a revisão nova subir. Se
  ela for a `latest` e estiver desabilitada, a revisão não sobe.

## Como saber que resolveu

- `jsonPayload.resultado="entregue"` volta a aparecer, e a série `falhou` da
  métrica `outbox-entregas` zera.
- Os registros reenviados ficam `enviado` em `/admin/entregas`.
- O painel do Resend mostra as mensagens como entregues.
