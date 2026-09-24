# Terraform — LexIntegra

Infraestrutura do projeto `plataforma-juridica-36bda`, região `southamerica-east1`.

`apply` e `destroy` **saem do pipeline**, nunca de máquina local — os hooks de
`PreToolUse` em `.claude/hooks/block-dangerous.sh` barram os dois. `terraform plan`
é livre e é assim que se revisa uma mudança.

## O que é bootstrap manual e por que não está aqui

Alguns recursos foram criados à mão antes de o Terraform existir, porque **o
Terraform não pode se autoprovisionar**. Eles foram _importados_ por blocos
`import` no primeiro apply da Etapa 2, e não recriados — um `apply` que tentasse
criá-los falharia por conflito. Cumprido o import, os blocos saíram no Bloco D
(`imports.tf` não existe mais); os recursos seguem no state.

O que fica **fora** do Terraform, deliberadamente:

| Item                                                | Por quê                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Papéis de projeto da service account `terraform-ci` | Autorreferencial: seriam os papéis que dão ao pipeline o direito de rodar, geridos pelo próprio pipeline. Um plan mal revisado poderia revogar o acesso do CI a si mesmo, sem caminho de volta pelo Terraform.                                                |
| Domínio customizado do Firebase Hosting             | `lexintegra.com.br` já está conectado e verificado manualmente (registro A + TXT). Os recursos Firebase do provider são beta, e importar um domínio verificado à mão é fonte de drift sem ganho. O Hosting é governado por `firebase.json` + CLI no pipeline. |
| Versões dos secrets (o valor das chaves de API)     | Regra inviolável 9. O Terraform gere o _container_ do secret; o valor é gravado por humano, direto no Secret Manager. Nenhuma credencial pode aparecer em commit, log ou state.                                                                               |
| Conta de faturamento e o vínculo com o projeto      | ADR-13. Pertence ao Marcos, com o vínculo travado (_lock the link_).                                                                                                                                                                                          |

### Papéis concedidos a `terraform-ci` no bootstrap

Registro do que existe, para quem precisar reproduzir o projeto do zero:

```
roles/storage.admin                    roles/iam.serviceAccountUser
roles/datastore.owner                  roles/iam.serviceAccountAdmin
roles/run.admin                        roles/resourcemanager.projectIamAdmin
roles/secretmanager.admin              roles/serviceusage.serviceUsageAdmin
roles/cloudkms.admin                   roles/firebasehosting.admin
roles/artifactregistry.admin           roles/iam.workloadIdentityPoolAdmin
roles/firebaserules.admin
```

`roles/firebaserules.admin` foi acrescentado na **Etapa 4**, e sem ele o deploy
falha num ponto tardio: o pipeline passou a publicar `firestore.rules`, e a
publicação vai pela API de Rules — `roles/datastore.owner` cobre os dados, não
as regras. Como os papéis de projeto do CI são bootstrap manual (ver acima), a
concessão é manual:

```bash
gcloud projects add-iam-policy-binding plataforma-juridica-36bda \
  --member=serviceAccount:terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com \
  --role=roles/firebaserules.admin
```

Os cinco da coluna da direita, das últimas linhas, foram acrescentados na Etapa 2:
sem eles o Terraform não consegue criar a service account de runtime da API,
conceder IAM de projeto a ela, gerir APIs habilitadas, publicar o Hosting pelo
pipeline, nem sequer **ler** o pool de Workload Identity para importá-lo — o
primeiro plan real no CI falhou exatamente com `iam.workloadIdentityPools.get`
negado, e `serviceAccountAdmin` não cobre esse recurso.

**Nota sobre a autorreferência.** O pool, o provider, a service account do CI e o
binding de `workloadIdentityUser` *são* o caminho de autenticação do pipeline, e são
geridos pelo Terraform que roda autenticado por eles. Os quatro levam
`prevent_destroy`: sem isso, um plan mal revisado poderia destruir a única forma de
o CI voltar a rodar. A alternativa — tirá-los do Terraform, como se fez com os
papéis de projeto — foi descartada porque importá-los era requisito explícito da
etapa; a trava é o que torna o import seguro.

**Autenticação: Workload Identity Federation, sem chave JSON.** Pool `github-pool`,
provider `github-provider`, com condição de atributo restringindo a
`assertion.repository=='henriqueluza/lexintegra'`. Nenhuma credencial de longa
duração existe em lugar nenhum — não há segredo de GCP cadastrado no GitHub.

## Estrutura

| Arquivo                | Conteúdo                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `versions.tf`          | Versões fixadas do Terraform e do provider google           |
| `backend.tf`           | State em `gs://lexintegra-tfstate-36bda`, prefixo `etapa-2` |
| `variables.tf`         | Projeto, região, repositório autorizado, imagem e commit    |
| `services.tf`          | APIs habilitadas                                            |
| `firestore.tf`         | Base `(default)` e os índices compostos                     |
| `kms.tf`               | Keyring e chave CMEK dos buckets                            |
| `storage.tf`           | Bucket de state (importado) e os quatro de aplicação        |
| `artifact_registry.tf` | Repositório de imagens e a política de limpeza              |
| `iam.tf`               | Identidade do CI (importada) e a de runtime da API          |
| `secrets.tf`           | Containers dos secrets e as concessões de leitura           |
| `cloud_run.tf`         | Serviço `api-lexintegra`                                    |

## Armadilhas conhecidas

### Bloco `import` num recurso com `for_each`

Quando o recurso usa `for_each`, o Terraform 1.16 honra **apenas o primeiro** bloco
`import` daquele endereço. O segundo é descartado **em silêncio** — sem erro, sem
warning — e o recurso aparece no plan como `will be created`.

Aconteceu no import da Etapa 2, com o acesso da SA padrão do Compute aos dois
secrets (`google_secret_manager_secret_iam_member.compute_default`, removido no
Bloco D): o binding de `resend` importava e o de `abacatepay` planejava criar um
binding que já existia. Comprovado invertendo a ordem dos blocos — o ignorado
passou a ser o outro — e um `id` propositalmente inválido no segundo bloco também
não gerava erro nenhum, o que mostra que ele nem chega a ser avaliado.

**Forma correta:** um único bloco com `for_each`, cobrindo todas as instâncias.

```hcl
import {
  for_each = local.mapa_de_literais
  to       = tipo_do_recurso.nome[each.key]
  id       = "projects/${var.project_id}/.../${each.value} roles/... serviceAccount:..."
}
```

O `for_each` de um bloco de import precisa ser resolvível em tempo de plan, então o
mapa é de **literais**, não de referências a atributo de recurso; a ordenação que a
referência daria de graça vira `depends_on` explícito.

**Critério de revisão de qualquer import futuro:** nenhum recurso importado pode
aparecer no plan como `will be created`. Um create ali significa `id` errado ou
bloco descartado, e o apply falha por conflito. Cumprido o import, os blocos saem
num commit seguinte — o state é que guarda o recurso, não o bloco.

### Apply parcial com variável sem `default`

O deploy tem um apply **parcial** logo no começo — o passo "Garantir o Artifact
Registry" roda:

```
terraform apply -target=google_artifact_registry_repository.lexintegra
```

Ovo antes da galinha: a imagem precisa de um repositório para onde ser empurrada,
e quem cria o repositório é o Terraform. Esse passo acontece **antes de qualquer
imagem existir** e, portanto, antes de qualquer `TF_VAR_*` ser definido no
workflow.

O Terraform valida **todas** as variáveis do root module antes de aplicar, mesmo
com `-target` restringindo o que será tocado. Variável sem `default` derruba esse
passo, e o deploy inteiro para antes de construir qualquer coisa.

Aconteceu com `scanner_image`, declarada na Etapa 11 sem default. O `plan` dos
PRs continuou verde o tempo todo — **o job de plan define os `TF_VAR_*`** — e a
quebra só apareceu no primeiro deploy depois do merge, no passo mais cedo do
pipeline, com uma mensagem que não menciona o Artifact Registry nem o `-target`.

**Regra:** toda variável daqui tem `default`. Verificado por
`scripts/conferir-defaults-terraform.mjs`, que roda em `pnpm lint`.

**Para imagem ou tag, o default é `""`.** `api_image` usa
`gcr.io/cloudrun/hello` por razões de Etapa 2 — era a imagem que o serviço de
fato rodava —, mas a convenção para variáveis novas é string vazia: um diff
obviamente inválido é recusado na hora pelo Cloud Run, enquanto um placeholder
plausível pode ser aplicado e publicar o contêiner errado. No caso do scanner,
isso seria trocar o antivírus por algo que não varre nada.

## Rodar um plan localmente

```bash
gcloud auth application-default login
```

```bash
cd infra/terraform && terraform init && terraform plan
```

## Riscos registrados

- **Import do Cloud Run — avaliado, risco baixo.** O serviço foi criado pela API v1
  (`gcloud run deploy`) e é gerido aqui como `google_cloud_run_v2_service`. O plan
  real mostrou que o único resíduo da v1 é metadado inócuo (`client = "gcloud"` e
  `client_version`, ambos indo a `null`). O fallback para `google_cloud_run_service`
  (v1) não foi necessário.
- **`cpu` é `"1000m"`, não `"1"`.** É a forma que a API devolve; escrever `"1"`
  produz diferença perpétua no plan.
- **`startup_cpu_boost` fica explícito.** O serviço já rodava com ele ligado, por
  padrão do `gcloud`. Com `min-instances = 0`, o cold start é risco aceito
  (arquitetura, seção 3.1 e risco 7) — deixá-lo cair no import pioraria justamente
  o que a arquitetura mitiga.
- **`prevent_destroy`** está ligado no bucket de state, no Firestore, no keyring e na
  chave do KMS e nos secrets. Isso é intencional: são recursos cuja destruição é
  irreversível ou destrói o próprio Terraform.
- **PITR do Firestore** é uma SKU cobrada que não consta na tabela de custos da
  arquitetura (seção 12). No volume previsto é fração de centavo, mas está
  registrado aqui para não virar surpresa na fatura.
- **`gs://lexintegra-tfstate` (sem sufixo) não existe mais.** Era sobra do
  bootstrap, vazia e fora deste Terraform, com nome quase igual ao do bucket de
  state verdadeiro (`lexintegra-tfstate-36bda`, em `backend.tf`). Foi removido à
  mão em 03/09/2026. A conferência de que sumiu — e o que fazer se reaparecer —
  está em `docs/runbooks/limpeza-infra.md`, seção 1.

## Observabilidade (Etapa 12)

`observabilidade.tf` tem as métricas por log, as oito políticas de alerta, o
uptime check e o painel; `sinais.tf` tem a sonda que os alimenta com o que só
existe dentro do Firestore.

**Quem recebe alerta não está aqui, e é de propósito.** O destinatário vem de
`ALERTAS_EMAIL_DESENVOLVIMENTO` no GitHub Actions — o repositório é público. O
`deploy.yml` lê **secret ou variable**, nessa ordem: os dois são lugares
plausíveis, e ler só um reproduz uma falha silenciosa (o canal tem
`count = var == "" ? 0 : 1`, então sem valor ele não nasce e as políticas ficam
sem destinatário, sem nada falhar). Prefira o **secret**: em repositório público
o log do Actions é público, e variable não é mascarada.

**Os papéis que o CI precisa para isto não estão no Terraform.** `logging.configWriter`
e `monitoring.editor` são concessão manual, como todos os papéis de projeto da
`terraform-ci` (ver o cabeçalho de `iam.tf`). A Etapa 12 descobriu isso do jeito
caro: seis métricas por log e um uptime check recusados com 403 num deploy já
mesclado, porque `plan` não cria nada e passa verde. Desde então
`scripts/conferir-papeis-de-bootstrap.mjs` obriga a decisão a acontecer antes do
merge — ele não consulta o IAM, ele cobra que o papel esteja declarado em
`papeis-de-bootstrap.json`.

**O roteamento é arquivo**, `alertas-roteamento.json`: cada alerta vale
`acordar`, `pendente` ou `registrar`, e hoje os oito estão em `pendente` porque a
decisão é operacional e pertence à CONTRATANTE. `pnpm lint` confere que política
e arquivo não se separam.

**Custo que aparece depois:** o Cloud Monitoring passa a cobrar alertas a partir
de 1º/09/2027 (US$ 0,35/mês por referência de métrica em política). Está na
tabela da arquitetura, seção 12.

## O que ainda não está aqui

Entra junto com o código que o usa, não antes:

- Filas do Cloud Tasks e jobs do Cloud Scheduler — Etapas 7 e 9.
- Serviço do scanner ClamAV — Etapa 11.
- Mais índices compostos do Firestore — conforme as consultas existirem. O
  primeiro (`produtos` por `ativo` + `nome`) entrou na Etapa 5, junto da consulta
  que o exige; os próximos devem entrar do mesmo jeito, nunca antes.
