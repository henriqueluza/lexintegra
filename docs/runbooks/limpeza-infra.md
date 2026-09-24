# Runbook — limpeza de infraestrutura (Bloco D)

**Por que este roteiro existe.** O bootstrap da Etapa 2 e a troca de identidade
do Cloud Run deixaram sobras mantidas de propósito, para cada etapa ter caminho
de volta: concessões à service account padrão do Compute, um bucket de state com
nome quase igual ao verdadeiro, papéis largos demais. O Bloco D tirou do
Terraform o que o Terraform gere. **O que está aqui é o resto — operação humana**,
porque o recurso nunca foi do Terraform ou porque a conferência só existe em
produção.

**Quem executa.** O desenvolvedor, na própria máquina, autenticado como dono do
projeto. **O agente não executa os comandos de escrita deste roteiro, e não deve
ser pedido para executar.** Atenção: o hook em `.claude/hooks/block-dangerous.sh`
barra `gcloud … delete`, mas **não** barra `remove-iam-policy-binding` nem
`add-iam-policy-binding` — ali a trava é esta regra, não o sistema. Os comandos
de leitura (`get-iam-policy`, `describe`, `ls`) são livres.

**Quando executar.** Depois do merge do PR do Bloco D e do deploy verde que ele
dispara, na ordem das seções. Cada seção é independente das seguintes: se uma
parar, as outras continuam valendo.

Projeto: `plataforma-juridica-36bda` (número `616781378293`). Os comandos levam
`--project` explícito de propósito: um `gcloud config` apontando para outro
projeto não pode mudar o alvo.

---

## 1. Bucket de state sem sufixo — `gs://lexintegra-tfstate`

**Situação encontrada no Bloco D: o bucket já não existe.** A auditoria do Cloud
Storage registra `storage.buckets.delete` sobre `projects/_/buckets/lexintegra-tfstate`
em 03/09/2026, pela conta humana dona do projeto. Não há remoção a fazer — e por
isso **este roteiro não traz comando de remoção**: um `buckets delete` escrito
para um bucket que não existe só serve para alguém colar com o nome errado.

O risco que justificava a limpeza era o nome quase igual ao do bucket verdadeiro,
`lexintegra-tfstate-36bda`, que guarda o state e tem `prevent_destroy`. As
conferências abaixo provam as duas metades: o verdadeiro é o que o Terraform usa,
e o outro não existe.

### 1.1 O backend aponta para o bucket com sufixo

```bash
grep -n 'bucket' infra/terraform/backend.tf
```

Esperado: `bucket = "lexintegra-tfstate-36bda"`. Qualquer outro valor: **pare**.

### 1.2 O bucket sem sufixo não existe, nem com versão antiga

```bash
gcloud storage ls --all-versions --recursive gs://lexintegra-tfstate --project=plataforma-juridica-36bda
```

Esperado: `gs://lexintegra-tfstate not found: 404`.

**Por que o 404 basta.** Um 404 do Cloud Storage diz que o nome não existe em
projeto nenhum — um bucket de terceiro responderia **403**. E sem bucket não há
versão antiga, objeto retido ou soft delete a esperar.

**Se aparecer 403 ou uma listagem, não apague nada.** O nome ficou livre no
namespace global quando o bucket foi removido; se ele voltou a existir, alguém o
criou, e isso se investiga (auditoria do projeto, dono do bucket) antes de
qualquer ação. Nenhuma configuração deste repositório o referencia, então a
existência dele não afeta o state.

### 1.3 O state continua acessível

```bash
cd infra/terraform && terraform init -input=false && terraform plan -input=false
```

Esperado: o `plan` roda até o fim, sem `Error: Failed to get existing workspaces`
nem `storage: bucket doesn't exist`. O conteúdo do plano não importa aqui — sem os
`TF_VAR_*` do pipeline ele propõe trocar imagens, e isso é esperado —, o que se
confere é que o backend responde.

---

## 2. `roles/editor` da service account padrão do Compute

`616781378293-compute@developer.gserviceaccount.com` ganhou `roles/editor` no
projeto inteiro **do próprio Google**, na ativação da API. Nunca esteve no
Terraform. O ADR-19 registra o custo: ela lê o Cloud Logging, e o log já carregou
dado sensível. Desde a troca de identidade da Etapa 2 ela não roda nada.

### 2.1 Conferir que o binding ainda existe

```bash
gcloud projects get-iam-policy plataforma-juridica-36bda \
  --flatten='bindings[].members' \
  --filter='bindings.members:616781378293-compute@developer.gserviceaccount.com' \
  --format='value(bindings.role)'
```

Esperado **antes** da remoção: `roles/editor`, e mais nada. (No Bloco D a
concessão de `secretAccessor` nos dois secrets saiu pelo Terraform, e não aparece
aqui porque é política do secret, não do projeto.) Se voltar vazio, a remoção já
foi feita: pule para a 2.4.

### 2.2 Conferir que nada depende dela

Cada item abaixo é leitura. Todos precisam dar o resultado esperado; **se um não
der, pare** — há dependência real e a remoção quebraria algo.

| O que usaria a SA padrão | Comando | Esperado (conferido no Bloco D, 24/09/2026) |
|---|---|---|
| Serviço do Cloud Run sem identidade própria | `gcloud run services list --region=southamerica-east1 --project=plataforma-juridica-36bda --format='table(metadata.name,spec.template.spec.serviceAccountName)'` | `api-lexintegra` → `api-lexintegra-run@…`, `scanner-lexintegra` → `scanner-clamav@…` |
| Job do Cloud Run sem identidade própria | `gcloud run jobs list --region=southamerica-east1 --project=plataforma-juridica-36bda --format='value(metadata.name)'` e, para cada um, `gcloud run jobs describe <job> --region=southamerica-east1 --project=plataforma-juridica-36bda --format='value(spec.template.spec.template.spec.serviceAccountName)'` | `clamav-atualizar-base` → `clamav-atualizador@…` |
| Cloud Build, Cloud Functions, Compute Engine | `gcloud services list --enabled --project=plataforma-juridica-36bda --format='value(config.name)' \| grep -E 'cloudbuild\|cloudfunctions\|compute\.googleapis'` | nada — as três APIs estão desabilitadas |
| App Engine | `gcloud app describe --project=plataforma-juridica-36bda` | "does not contain an App Engine application" (a API está habilitada, sem aplicação) |
| Scheduler e Tasks | `gcloud scheduler jobs list --location=southamerica-east1 --project=plataforma-juridica-36bda --format='table(name.basename(),httpTarget.oidcToken.serviceAccountEmail,httpTarget.oauthToken.serviceAccountEmail)'` | os quatro com `tarefas-lexintegra@…` |
| Alguém se passando por ela | `gcloud iam service-accounts get-iam-policy 616781378293-compute@developer.gserviceaccount.com --project=plataforma-juridica-36bda` | só `etag`, sem `bindings` |
| Pipeline | `.github/workflows/deploy.yml` | builda com `docker` no runner e autentica como `terraform-ci` por Workload Identity; não há Cloud Build |

### 2.3 Remover

```bash
gcloud projects remove-iam-policy-binding plataforma-juridica-36bda \
  --member=serviceAccount:616781378293-compute@developer.gserviceaccount.com \
  --role=roles/editor \
  --condition=None
```

`--condition=None` remove só o binding sem condição, que é o que existe; sem a
flag o `gcloud` pergunta interativamente.

### 2.4 Conferir depois

1. A 2.1 volta **vazia**.
2. **O deploy seguinte fica verde**, com o smoke test confirmando o commit em
   `https://lexintegra.com.br/api/health`. O próximo push na `main` serve; se não
   houver, reexecute o workflow *Deploy* pelo GitHub (é reexecutável no mesmo
   commit).
3. **A API responde** (`/api/health` com `status` ok) e **a varredura funciona**:
   um upload de arquivo de apoio num pedido de teste chega a `limpo`. Se ainda
   não houver pedido em produção, confira o scanner pelo log: nenhuma entrada de
   `PERMISSION_DENIED` do `scanner-lexintegra` ou da `api-lexintegra` nas horas
   seguintes.

### 2.5 Voltar atrás, se algo quebrar

```bash
gcloud projects add-iam-policy-binding plataforma-juridica-36bda \
  --member=serviceAccount:616781378293-compute@developer.gserviceaccount.com \
  --role=roles/editor \
  --condition=None
```

Depois disso, descubra **o que** usava a SA padrão — o log de auditoria de
`PERMISSION_DENIED` com `principalEmail` igual a ela aponta o serviço — e dê a
esse serviço uma identidade própria antes de tentar de novo.

### Por que isto não está no Terraform

Decidido no Bloco D, e a decisão é **não gerir**.

- **É uma remoção única de algo que o Terraform nunca criou.** Não há estado
  desejado a manter: depois de removido, o binding não volta sozinho — a
  concessão automática do Google acontece na criação da SA padrão, e ela já
  existe.
- **O recurso que faria isso é novo** (`google_project_iam_member_remove`), e o
  Bloco D é só remoção.
- **O Terraform lutaria contra o caminho de volta.** Se a remoção quebrar algo em
  produção, a correção de emergência é o comando da 2.5. Com a remoção declarada
  no Terraform, o próximo deploy desfaria essa correção em silêncio — o pipeline
  aplicaria a remoção de novo, e o serviço cairia de novo.

**Se um dia for preciso habilitar Cloud Build, Cloud Functions ou Compute Engine**,
essa SA estará sem papel nenhum: crie uma identidade dedicada para o serviço novo,
como a API, o scanner e o job já têm. Não devolva o `roles/editor`.
