# Runbook — deploy recusado (pipeline vermelho, plano inesperado, imagem que não sobe)

**Nenhum alerta leva aqui.** O sinal é o workflow *Deploy* vermelho no GitHub
Actions (`.github/workflows/deploy.yml`), ou o comentário de `terraform plan`
de um PR mostrando algo que ninguém pediu.

**A produção não cai por deploy recusado.** Enquanto o Terraform não aplica, e
enquanto a revisão nova não passa no startup probe, o tráfego fica onde estava.
A urgência é não deixar a `main` quebrada por muito tempo.

**Quem executa:** quem mantém o código. `terraform apply` e `firebase deploy`
**só** pelo pipeline.

---

## Sintoma

- Workflow *Deploy* vermelho num push na `main`.
- Workflow *CI* vermelho num PR.
- Plano do PR com `destroy` ou `replace` inesperado.

## Como confirmar e o que fazer, pelo passo que falhou

Os números são os da tabela da seção 1 de
[`operacao.md`](../entrega/operacao.md).

| Passo que falhou | Causa comum | O que fazer |
|---|---|---|
| 2, *Acessibilidade e regressão visual* | Mudança de tela sem imagem de referência atualizada | Baixe o artefato `playwright-diferencas`. Se a mudança é desejada, regrave **só** as imagens afetadas e revise uma a uma. **Não regrave em bloco** |
| 3, *Lint e testes* | Código que não passa ou cobertura abaixo do limiar | Corrija. O merge pode ter juntado dois branches verdes num resultado vermelho |
| 4, *Integração* | Emulador sem Java, ou teste de integração quebrado | Leia o log do `scripts/emuladores.sh`. Ele diz o que falta |
| 7, *Garantir o Artifact Registry* | Variável do Terraform sem `default` | O `pnpm lint:terraform` deveria ter pegado. Dê `default` à variável (README do Terraform, "Apply parcial") |
| 10, *Aplicar*, com `403` | Recurso de um tipo novo sem papel para `terraform-ci` | Os papéis do CI são concessão **manual**. Conceda com `gcloud projects add-iam-policy-binding` e reexecute. `papeis-de-bootstrap.json` deveria ter o papel declarado |
| 10, com `Error acquiring the state lock` | Outro apply em andamento, ou um lock preso por execução cancelada | Espere. Se nada estiver rodando, `terraform force-unlock <id>` **à mão**, com o id da mensagem |
| 10, com `tainted` e destroy recusado por `deletion_protection` | A criação de uma revisão falhou antes e o Terraform marcou o recurso | `terraform untaint google_cloud_run_v2_service.api` (ou o endereço da mensagem), local, e reexecute o workflow. **Não troque a proteção para `false`**: não desatasca, porque o provider lê o valor do state |
| 10, revisão não fica pronta | A imagem nova não sobe: variável inválida (`Recusando subir`), `ERR_MODULE_NOT_FOUND`, OOM | Logs da revisão nova no Cloud Run. Ver [api-fora-do-ar.md](api-fora-do-ar.md) |
| 8 ou 9, `cannot update tag` | Tag imutável | Não deveria acontecer: o passo pula tag existente. Se acontecer, confira se o `describe` do passo está autenticado |
| 14, *Frontend e regras* | `roles/firebasehosting.admin` ou `roles/firebaserules.admin` ausentes, ou regra do Firestore inválida | Conceda o papel à mão. Regra inválida quebra antes, no passo 4 |
| 15, *Smoke test* | `/api/health` não devolve o `commitSha` novo em 10 tentativas | O Terraform aplicou, mas a revisão não assumiu o tráfego. Veja as revisões no console |
| 16, *Landing pré-renderizada* | Build sem SSG | Veja o passo do CI *Conferir que o build do Angular foi mesmo pré-renderizado* |

**Reexecutar é seguro.** O deploy pode ser repetido no mesmo commit: as
imagens já publicadas são reaproveitadas (*Re-run failed jobs* no GitHub, ou
*Run workflow*).

## Plano do Terraform inesperado

- **Ruído conhecido no PR.** O job de plan do CI não recebe
  `TF_VAR_alertas_email_desenvolvimento`. Por isso todo plano de PR propõe
  destruir o canal *Desenvolvimento (PROVISORIO)* e tirar os canais das
  políticas. O deploy recebe a variável e **não** faz isso. Para conferir o
  plano real, rode `terraform plan` local com a variável definida.
- **`will be created` em recurso que já existe:** import errado ou recurso
  criado fora do Terraform. Não aplique. Ver README do Terraform, "Armadilhas
  conhecidas".
- **`must be replaced`** em Firestore, KMS, bucket de state ou secret: esses
  têm `prevent_destroy`, e o plan falha de propósito. Descubra qual atributo
  forçou a troca.
- **`update in-place` de imagem para `gcr.io/cloudrun/hello` ou `""`** num plan
  local: faltam os `TF_VAR_*` de imagem. Esperado no local, e não é o que o
  pipeline aplica.

## O que nunca fazer

- `terraform apply`, `firebase deploy` ou `gcloud run deploy` na máquina
  local. O pipeline é o único caminho, e os hooks do agente bloqueiam esses
  comandos.
- Desligar `immutable_tags` do Artifact Registry para "destravar" publicação.
- Afrouxar limiar de cobertura, mutação ou lint para o merge passar.
- Regravar todas as imagens de referência da regressão visual de uma vez.
- Dar `roles/owner` ao `terraform-ci` para acabar com os 403.

## Como saber que resolveu

- O workflow *Deploy* fica verde até o fim, incluindo o smoke test.
- `https://lexintegra.com.br/api/health` devolve o `commitSha` do commit.
- Um `terraform plan` seguinte, com as variáveis do pipeline, mostra
  `No changes` (fora as imagens, se o commit mudou).
