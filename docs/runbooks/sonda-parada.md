# Runbook — sonda de sinais parada

**Alerta que leva aqui:** *Sonda de sinais parada*
(`google_monitoring_alert_policy.sonda_parada`, em
`infra/terraform/observabilidade.tf`). A sonda não registra medição há 15
minutos. Ela roda a cada 5.

**Por que este alerta importa mais que parece.** O Monitoring não consulta o
Firestore. Quem olha o banco e escreve os números num log é a sonda
`sinais-operacionais` (`POST /api/interno/sinais`, em
`apps/api/src/sinais/`). **Com ela parada, quatro alertas ficam cegos:**

- *Outbox parado*;
- *Arquivo parado em quarentena*;
- *Reuniao marcada sem sala do Teams*;
- *Disponibilidade publicada sem link de reuniao*.

Nenhum deles dispara, porque não há dado para medir. Este alerta é de
**ausência** sobre a métrica `outbox-atraso-segundos`, que recebe um ponto a
cada execução, mesmo zerado, justamente para "sem dado" significar "sonda
parada".

**Quem executa:** quem atende a operação.

---

## Alarme logo depois de um deploy (falso positivo resolvido em 30/09/2026)

Até 30/09/2026, a condição de ausência era agrupada por **revisão** do Cloud
Run: cada deploy criava uma série nova, e a da revisão anterior disparava este
alerta uns 25 minutos depois, com a sonda funcionando. A correção (condição
agrupada só por `service_name`, com `REDUCE_SUM`) foi aplicada e conferida em
produção em 30/09. **Desde então, deploy não dispara mais este alerta.**

Se ainda assim um alarme chegar preso a uma **revisão antiga**
(`api-lexintegra-0003x-…`), confira a condição da política no console: ela
precisa agrupar só por `resource.label.service_name`. Se agrupar por
`revision_name`, a correção foi desfeita.

## Sintoma

- O alerta.
- O painel de operação sem pontos novos em *outbox* e *quarentena*.

## Como confirmar

| Pergunta | Como ver |
|---|---|
| O job está ativo e disparou? | `gcloud scheduler jobs describe sinais-operacionais --location=southamerica-east1 --project=plataforma-juridica-36bda`: `state: ENABLED`, `lastAttemptTime` recente e o `status` da última tentativa |
| A chamada chegou à API? | Logs da API em `POST /api/interno/sinais`. `401` ou `403` apontam o token OIDC (`tarefas/tarefa.guard.ts`) |
| A sonda falhou lendo o banco? | Logs da API com erro na mesma rota: consulta sem índice (`FAILED_PRECONDITION`) ou Firestore indisponível |
| A última medição | `jsonPayload.sinal="sinais"`, a entrada mais recente |

**API fora do ar também para a sonda.** Se o alerta *API fora do ar* está
aberto, comece por [api-fora-do-ar.md](api-fora-do-ar.md).

## O que fazer

1. **Job pausado:** `gcloud scheduler jobs resume sinais-operacionais …`.
2. **Token recusado:** confira `SERVICE_ACCOUNT_TAREFAS` e `URL_APLICACAO` no
   Cloud Run (`operacao.md`, seção 2.1).
3. **Consulta sem índice:** os índices da sonda estão em
   `infra/terraform/sinais.tf` e em `firestore.tf` (`reunioes_sem_sala`). O
   emulador não cobra índice, então um índice faltando só aparece em produção.
   A correção vai por PR.
4. **Enquanto a sonda não volta,** confira à mão o que ela mediria:
   - `/admin/entregas` para o outbox;
   - `/admin/reunioes` para reuniões sem sala;
   - a quarentena, em [scanner-indisponivel.md](scanner-indisponivel.md).

## O que nunca fazer

- Aumentar o prazo de ausência para "calar" o alerta sem saber por que a sonda
  parou. Os quatro alertas acima continuam cegos.
- Fazer a sonda corrigir o que mede. Ela só lê e loga (regra 3: quem decide
  entregar é o outbox).

## Como testar este alerta (prova em produção)

Feito em 29/09/2026, funcionou: pausar `sinais-operacionais`
(`gcloud scheduler jobs pause sinais-operacionais --location=southamerica-east1`),
esperar o e-mail e retomar (`resume`).

- **A detecção leva uns 24 minutos, não 15:** os 15 da condição, mais o
  alinhamento de 300 s, mais o atraso de avaliação do Monitoring (no teste, do
  último ponto às 13:10:04 UTC à abertura do incidente, 13:34:05, e o e-mail no
  mesmo minuto).
- **Pause até o e-mail chegar, no máximo 40 minutos.** Pausar por 20 não basta.
  Passados 40 minutos sem e-mail, retome o job e investigue o canal (ver
  `alerta-artificial.md`, "Se não chegar").
- Depois de retomar, o incidente fecha sozinho em ~3 minutos.
- Enquanto pausada, os quatro alertas listados no topo ficam cegos.

## Como saber que resolveu

- `jsonPayload.sinal="sinais"` volta a aparecer a cada 5 minutos, e o incidente
  fecha.
- O painel de operação volta a ter pontos em *outbox* e *quarentena*.
