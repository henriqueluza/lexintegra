# Runbook — disparar um alerta artificial e confirmar que ele chega

**Por que este roteiro existe.** O critério de aceite da Etapa 12 é uma frase só:
*"um alerta disparado artificialmente chega ao destinatário configurado"*. Não dá
para verificar isso com teste automatizado — o caminho passa por Cloud Logging,
métrica por log, política do Monitoring e canal de notificação, e os quatro só
existem depois do `terraform apply`. É trabalho humano, e é de propósito: o hook
de `PreToolUse` barra o agente de escrever no Cloud Logging justamente para que
ninguém dispare alerta de produção por engano no meio de outra tarefa.

**Quando executar.** Uma vez, depois do primeiro deploy que aplicar
`infra/terraform/observabilidade.tf`. E de novo sempre que o destinatário mudar —
inclusive na Etapa 13, quando a operação passar para a CONTRATANTE.

---

## Antes de começar

1. **A variável do destinatário existe?** O canal só é criado quando
   `ALERTAS_EMAIL_DESENVOLVIMENTO` está definida nas *Variables* do repositório
   no GitHub (Settings → Secrets and variables → Actions → Variables). Sem ela, o
   Terraform não cria canal nenhum e o incidente aparece só no console — que é o
   comportamento certo, mas não fecha o critério de aceite.

2. **O deploy já aplicou as políticas?** Confirme no console:
   Monitoring → Alerting → Policies. Devem existir todas as de `observabilidade.tf`, entre elas
   *Alerta critico da aplicacao*.

---

## O disparo

O caminho mais curto é escrever, à mão, uma entrada de log com a mesma forma que
`AlertaEmLog` produz. A política casa `jsonPayload.nivel="critico"` e
`jsonPayload.alerta` não vazio; o assunto abaixo é reconhecível de propósito.

```bash
gcloud logging write api-lexintegra-teste \
  '{"severity":"ERROR","nivel":"critico","alerta":"teste.alerta-artificial","message":"Teste do runbook: isto nao e incidente."}' \
  --payload-type=json \
  --project=plataforma-juridica-36bda
```

> **O agente não executa este comando, e não deve ser pedido para executar.** O
> hook em `.claude/hooks/block-dangerous.sh` barra escrita em serviço de nuvem a
> partir de sessão de agente. Se aparecer bloqueio, é o sistema funcionando.

**Atenção ao `resource.type`.** As métricas filtram
`resource.type="cloud_run_revision"`, e uma entrada escrita pelo `gcloud` chega
como `global`. Duas saídas, e a segunda é melhor:

- **Preferida — provocar o alerta pelo caminho real.** Em sandbox, mande um
  webhook com corpo ilegível para `/api/pagamentos/webhook` com o segredo certo:
  isso emite `pagamento.webhook-ilegivel`, que é `critico`, direto da API. É o
  teste mais honesto — exercita o caminho inteiro, incluindo o formato do log.
- **Alternativa — acrescentar o recurso ao comando**, com
  `--payload-type=json` e os rótulos de `cloud_run_revision`. Mais rápido, menos
  fiel: não prova que a aplicação emite no formato certo, só que a política casa.

---

## O que conferir, nesta ordem

1. **A entrada chegou como JSON.** Logging → Logs Explorer, filtro
   `jsonPayload.alerta!=""`. Se o texto aparecer em `textPayload`, o
   `LOG_FORMATO` do serviço não está `json` — confira a variável no Cloud Run.
2. **A métrica contou.** Logging → Log-based metrics → `alertas-criticos`, aba
   de visualização. O ponto leva alguns minutos para aparecer.
3. **O incidente abriu.** Monitoring → Alerting → Incidents.
4. **O e-mail chegou.** Caixa do endereço configurado. **É este passo que fecha o
   critério de aceite** — os três anteriores podem estar verdes com o canal
   errado.

## Se não chegar

| Sintoma | Causa provável |
|---|---|
| Nenhuma entrada com `jsonPayload` | `LOG_FORMATO` diferente de `json` no serviço |
| Entrada existe, métrica zerada | filtro da métrica não casa o `resource.type` da entrada |
| Métrica conta, sem incidente | a política está com `notification_channels` vazio — veja `alertas-roteamento.json` |
| Incidente aberto, sem e-mail | canal não criado (variável ausente no GitHub) ou e-mail em spam |

## Depois

- Feche o incidente no console.
- Registre no PR da Etapa 12, ou no diário da Etapa 13, **a data e quem recebeu**.
  É essa linha que comprova o critério de aceite para a CONTRATANTE.
