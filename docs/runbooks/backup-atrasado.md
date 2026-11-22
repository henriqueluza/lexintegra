# Runbook — backup do Firestore atrasado

**Alerta que leva aqui:** *Backup do Firestore atrasado*
(`google_monitoring_alert_policy.backup_atrasado`, em
`infra/terraform/observabilidade.tf`). A idade do backup mais recente passou de
30 horas, e ficou assim por uma hora.

**Por que é um alerta de idade, e não de falha.** O Firestore tira os backups
agendados sozinho e não emite métrica nem log quando um deles falha. O que dá
para medir é há quanto tempo existe um backup **pronto**. Quem mede é a sonda
`sinais-operacionais` (`apps/api/src/sinais/backups.ts`), a cada 5 minutos, e
escreve o número em `jsonPayload.backupSegundos`.

**O que está em risco enquanto ele está aberto.** O PITR continua cobrindo os
últimos 7 dias. O que envelhece é a recuperação **além** disso: cada dia sem
backup novo é um dia a menos de cobertura quando o erro for percebido tarde.

**Quem executa:** quem atende a operação.

---

## Como ler o número

| `backupSegundos` | O que significa |
|---|---|
| até ~108000 (30 h) | normal: o backup diário não tem horário fixo |
| acima de 30 h e crescendo | o backup diário não saiu |
| **2592000** (30 dias, exato) | a sonda **não conseguiu saber**: a API recusou a leitura, a resposta veio parcial, ou não há backup nem agendamento. É de propósito: na dúvida, o alerta dispara |

A entrada de log `jsonPayload.sinal="sinais.backup-ilegivel"` aparece junto do
valor de 30 dias e traz o motivo da recusa.

## Como confirmar

```sh
gcloud firestore backups schedules list \
  --database='(default)' --project=plataforma-juridica-36bda

gcloud firestore backups list --project=plataforma-juridica-36bda \
  --format='table(name, state, snapshotTime, expireTime)'
```

| O que aparece | Causa provável |
|---|---|
| Os dois agendamentos, e nenhum backup recente | O Firestore não tirou o backup. Confira o [status do Google Cloud](https://status.cloud.google.com/) |
| Um backup recente em `CREATING` há horas | Backup preso. Só `READY` conta |
| **Nenhum agendamento** | Alguém apagou, ou o `terraform apply` não os criou |
| Backups recentes e em ordem | A sonda é que não consegue ler: veja abaixo |

**A sonda não consegue ler** quando a conta de runtime
(`api-lexintegra-run@…`) perde `roles/datastore.backupsViewer` ou
`roles/datastore.backupSchedulesViewer` (`infra/terraform/iam.tf`). O log
`sinais.backup-ilegivel` diz `403`.

## O que fazer

1. **Agendamento ausente:** eles são declarados em
   `infra/terraform/firestore.tf`. Rode o pipeline (`ci.yml` na `main` mostra o
   `plan`; o deploy aplica). Não crie à mão pelo console: o Terraform não o
   reconheceria.
2. **Papel ausente:** o mesmo, em `iam.tf`.
3. **O Firestore não tirou o backup e os agendamentos existem:** espere o
   próximo ciclo (até 24 horas) e abra chamado no suporte do Google Cloud se
   passar de dois dias. Enquanto isso o PITR cobre os últimos 7 dias.
4. **Depois de resolvido,** o alerta fecha sozinho quando um backup novo fica
   `READY` e a sonda o lê.

## Depois de um deploy novo

No primeiro dia depois de os agendamentos serem criados ainda não há backup. A
sonda mede então a idade do **agendamento**, que está abaixo do limite: o
alerta não dispara. Se o primeiro backup não sair em 30 horas, dispara, e é
verdadeiro.

## O que nunca fazer

- Aumentar `limite_backup_horas` para calar o alerta sem saber por que o
  backup não saiu.
- Fazer a sonda escrever zero quando não consegue ler. A idade desconhecida é
  alta de propósito.
- Dar à conta de runtime um papel que restaure ou apague backup. Ela só lista.

Para restaurar um backup: [`restaurar-backup.md`](restaurar-backup.md).
