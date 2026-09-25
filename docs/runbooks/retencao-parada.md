# Runbook — retenção parada

**Alerta que leva aqui:** *Retencao parada*
(`google_monitoring_alert_policy.retencao_parada`, em
`infra/terraform/observabilidade.tf`). Nenhuma passagem da retenção **chegou
ao fim** nas últimas 23 horas.

**Como funciona.** O job `retencao-diaria` do Cloud Scheduler chama
`POST /api/interno/retencao` às **5h e às 17h** (`infra/terraform/varredura.tf`).
Cada passagem:

- avisa o titular no 23º dia depois de `entregue`;
- exclui todas as versões dos arquivos do entregável no 30º dia.

Ao terminar, grava uma linha `jsonPayload.sinal="retencao.passagem"` com os
totais (`apps/api/src/retencao/retencao.service.ts`). O alerta é de
**ausência**: ele dispara quando essa linha para de aparecer.

**Por que duas vezes por dia.** A condição de ausência do Monitoring tem teto
de 23h30. Com uma passagem por dia, o intervalo normal de 24 h estouraria a
janela todos os dias. A passagem é idempotente: a segunda do dia só encontra
o que a primeira já fez.

**Quem executa:** quem atende a operação.

---

## Sintoma

- O alerta.
- Parada, a retenção não avisa nem exclui, **sem erro nenhum**. O sintoma de
  negócio é arquivo disponível além dos 30 dias.

## Como confirmar

| Pergunta | Como ver |
|---|---|
| O job está ativo e disparou? | `gcloud scheduler jobs describe retencao-diaria --location=southamerica-east1 --project=plataforma-juridica-36bda`: `state: ENABLED` e `lastAttemptTime` recente |
| A chamada chegou à API? | Logs da API em `POST /api/interno/retencao`. `401` ou `403` apontam o token OIDC: `SERVICE_ACCOUNT_TAREFAS` ou `URL_APLICACAO` (`tarefas/tarefa.guard.ts`) |
| A passagem quebrou no meio? | Logs da API com erro logo depois do horário (5h ou 17h). Falha de armazenamento ou do Firestore aparece aqui |
| A última passagem que terminou | `jsonPayload.sinal="retencao.passagem"`, a entrada mais recente |

## O que fazer

1. **Job pausado:** `gcloud scheduler jobs resume retencao-diaria …`. Confira
   no próximo `terraform plan` que nada propõe mudá-lo de novo.
2. **API fora ou recusando o token:** [api-fora-do-ar.md](api-fora-do-ar.md) ou
   a variável errada (`operacao.md`, seção 2.1).
3. **Passagem quebrando no meio:** leia o erro. A passagem é idempotente e
   pode ser repetida à mão:

   ```bash
   gcloud scheduler jobs run retencao-diaria --location=southamerica-east1 --project=plataforma-juridica-36bda
   ```

   Se o erro se repete no mesmo pedido, o problema é aquele pedido. Isole-o e
   leve a quem mantém o código.

## O que nunca fazer

- Apagar arquivos à mão no bucket para "pôr em dia". A retenção avisa o
  titular antes (seção 13 da arquitetura), e o documento do pedido precisa
  registrar a exclusão.
- Reduzir o prazo de ausência abaixo do intervalo entre execuções. O alerta
  passaria a disparar todo dia.
- Voltar o job para uma execução por dia sem mudar o alerta.

## Como saber que resolveu

- Aparece uma linha nova de `retencao.passagem`, e o incidente fecha na janela
  seguinte.
- Os pedidos que estavam no prazo foram avisados ou excluídos:
  `retencaoPendente` vira `false` depois da exclusão.
