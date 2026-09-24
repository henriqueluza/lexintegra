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
