# Runbook — entrega de e-mail falhando (inclui o teto diário do Resend)

**Alerta que leva aqui:** *Entrega de e-mail falhando*
(`google_monitoring_alert_policy.entrega_de_email_falhando`): mais de
`limite_falhas_de_entrega` (5) falhas de entrega em 10 minutos.

Uma falha isolada é o caso que a fila resolve sozinha. Várias seguidas
significam que o provedor está recusando.

**Quem executa:** quem atende a operação, com acesso ao painel do Resend da
conta dona da chave `resend-api-key`.

> **Estado de hoje:** o remetente é `onboarding@resend.dev` (`EMAIL_FROM`, em
> `infra/terraform/variables.tf`). O Resend só entrega esse remetente ao
> endereço da própria conta. **Todo e-mail para outro endereço falha até o
> domínio verificado ser ligado.** Ver
> [`docs/entrega/operacao.md`](../entrega/operacao.md), seção 4.1.

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
| Limite diário ou de envio atingido | **Teto diário do plano.** A arquitetura registra 100 por dia no plano gratuito (seção 12). Ao atingir, o provedor **pausa** o envio em vez de cobrar |
| Só pode enviar para o próprio endereço, ou domínio não verificado | Remetente de teste, ou domínio que perdeu a verificação (registro DNS removido) |
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
  `[CONFIRMAR: plano contratado e teto real]`.
- **Domínio.** Confira em *Domains* no Resend e os registros no Registro.br.
  Corrija o DNS. Nada muda no código.
- **Chave.** Gere uma chave nova na conta certa e grave a versão nova no secret
  `resend-api-key`. Depois faça um deploy pelo pipeline: o container só lê o
  secret ao iniciar. Ver [`credenciais.md`](../entrega/credenciais.md).
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
