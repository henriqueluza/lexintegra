# Runbook — outbox parado, registro abandonado e reenvio manual

**Alertas que levam aqui:**

- *Outbox parado* (`google_monitoring_alert_policy.outbox_parado`): um evento
  `pendente` ou `falhou` espera há mais de `limite_outbox_minutos` (30).
- *Alerta critico da aplicacao* com assunto `outbox.abandonado`: um registro
  esgotou as 10 tentativas (`apps/api/src/outbox/politica.ts`) e não será mais
  tentado sozinho.

O outbox carrega **tudo** que sai do sistema:

- e-mails: `definir-senha`, `redefinir-senha`, `acesso-cliente`,
  `aviso-exclusao-arquivos`;
- sala e convite do Teams: `criar-sala-reuniao`, `convite-reuniao`,
  `cancelamento-reuniao`;
- estorno no gateway: `estorno-integral`.

Outbox parado quer dizer que um cliente pagou e não recebeu o acesso, ou que
um estorno não saiu (ADR-03).

**Quem executa:** quem atende a operação. O reenvio é feito por um
administrador no painel.

---

## Sintoma

- Um dos dois alertas.
- Um cliente que pagou e não recebeu o e-mail de acesso.
- Em `/admin/entregas`, registros `falhou` ou `abandonado` acumulando.

## Como confirmar

1. **Painel do administrador, `/admin/entregas`.** Lista cada registro com
   tipo, estado, tentativas, última tentativa e `ultimoErro`. O motivo do
   provedor é gravado com os endereços de e-mail redigidos.
2. **Log das entregas.** Filtro `jsonPayload.sinal="outbox.entrega"`. O campo
   `resultado` vale `entregue` ou `falhou`.
3. **Onde o fluxo parou.** A causa costuma ser uma das quatro:

| Pergunta | Como ver | Se a resposta for não |
|---|---|---|
| A fila está rodando? | `gcloud tasks queues describe eventos --location=southamerica-east1 --project=plataforma-juridica-36bda` → `state: RUNNING` | Fila pausada. Retome com `gcloud tasks queues resume eventos …` |
| A fila alcança a API? | Log da API com `401`/`403` em `POST /api/interno/outbox` | O token OIDC não bate com `SERVICE_ACCOUNT_TAREFAS` ou com a audiência `URL_APLICACAO` (`tarefas/tarefa.guard.ts`) |
| O varredor está rodando? | `gcloud scheduler jobs describe varredor-outbox --location=southamerica-east1 --project=plataforma-juridica-36bda` → `state: ENABLED` e `lastAttemptTime` recente | Job pausado ou recusado. Veja o `status` do job |
| O provedor aceita? | `ultimoErro` no painel | Resend recusando: [entrega-de-email-falhando.md](entrega-de-email-falhando.md). Graph recusando: [reuniao-sem-link.md](reuniao-sem-link.md) |

4. **A sonda está viva?** O alerta de outbox parado depende da sonda
   `sinais-operacionais`. Se o Scheduler dela parou, a métrica fica sem ponto e
   **o alerta não dispara**. Confira o job da mesma forma.

## O que fazer

1. **Corrija a causa** usando a tabela. Com a fila e o varredor funcionando, os
   `pendente` e `falhou` andam sozinhos: a fila reentrega com backoff de até 5
   minutos, e o varredor pega os que ficaram sem tarefa depois de
   `VARREDOR_ATRASO_MINUTOS` (15).
2. **Reenviar o que foi abandonado**, pelo painel `/admin/entregas`, botão de
   reenvio (`POST /api/admin/outbox/{id}/reenvio`). Só é aceito para `falhou`
   ou `abandonado`. O servidor responde 409 para os demais
   (`outbox/outbox.admin.service.ts`). O reenvio passa pela mesma trava
   (`OutboxService.reivindicar`) que os outros dois caminhos (regra 3).
3. **Antes de reenviar um e-mail, confira no painel do Resend se ele de fato
   não saiu.** O reenvio incrementa o `ciclo`, que entra na chave de
   idempotência (ADR-03): **ele manda de novo**, de propósito. Se o provedor
   aceitou e o processo morreu antes de gravar `enviado`, o reenvio duplica a
   mensagem.
4. **`estorno-integral` abandonado:** antes de reenviar, confira no painel do
   AbacatePay se a cobrança já está estornada. O despachante trata "já
   estornado" como sucesso, mas vale olhar.

## O que nunca fazer

- **Editar `estado`, `tentativas` ou `ciclo` no console do Firestore.** Mudar
  para `pendente` à mão mantém o ciclo, e o Resend deduplica pela mesma chave:
  o e-mail não sai e nada avisa. Use o reenvio.
- Mandar o e-mail "por fora", do painel do Resend ou de uma caixa pessoal. Seria
  um quarto caminho de entrega (regra 3), sem trilha e sem idempotência.
- Baixar `OUTBOX_ARRENDAMENTO_SEGUNDOS` para "acelerar". Abaixo de 660 a API
  recusa subir. Acima disso, mas perto do prazo de despacho, volta o e-mail
  duplicado.
- Pausar o `varredor-outbox`. Ele é o que transforma tarefa perdida em atraso
  em vez de perda.

## Como saber que resolveu

- Os registros do incidente aparecem como `enviado` em `/admin/entregas`.
- A métrica `outbox-atraso-segundos` no painel de operação volta a zero, e o
  incidente de *Outbox parado* fecha sozinho.
- O cliente confirma que recebeu.
